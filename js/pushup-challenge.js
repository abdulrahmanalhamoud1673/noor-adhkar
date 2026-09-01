/* ══════════════════════════════════════════════════════════
   نور — تحدّي الاستغفار
   يعدّ ضغطاتك بالكاميرا، ومع كل ضغطة تقول ذكراً.
   إذا أتممت العدد المطلوب، فُكّ الحظر حتى الجولة التالية.
   كل المعالجة داخل جهازك.
   ══════════════════════════════════════════════════════════ */

import { loadLandmarker, openCamera } from "./pose-model.js?v=41";

const L = {
  lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28
};

const BONES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]
];

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });
const vis = p => (p && p.visibility != null) ? p.visibility : 1;

/**
 * يضبط إطار العرض على نسبة أبعاد الكاميرا الحقيقية.
 * بدون هذا يقصّ المتصفح الصورة لتملأ الإطار فتبدو مُكبّرة،
 * وتنزاح نقاط الهيكل عن الجسم.
 */
export function fitFrame(video, wrap) {
  if (!wrap) return;
  const apply = () => {
    if (!video.videoWidth || !video.videoHeight) return;
    wrap.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  };
  apply();
  video.addEventListener("loadedmetadata", apply, { once: true });
  video.addEventListener("resize", apply);
}

/** زاوية عند b بين a و c، بثلاثة أبعاد إن توفّر z */
function angleAt(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const den = (Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z)) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, dot / den))) * 180) / Math.PI;
}

/**
 * يقيس وضعية الضغط.
 *
 * مهم: نحسب الزوايا من `worldLandmarks` (إحداثيات حقيقية بالمتر) لا من
 * الإحداثيات المُطبَّعة 0..1. الإحداثيات المطبّعة مشدودة بنسبة أبعاد
 * الصورة، فجسم أفقي تماماً كان يظهر مائلاً بأكثر من ٤٠ درجة على كاميرا
 * الهاتف — وهذا هو سبب امتناع العدّاد عن العدّ أصلاً.
 */
function measurePushup(lm, world) {
  const P = world && world.length ? world : lm;   // نفضّل الحقيقي، ونرجع للمطبّع عند الحاجة

  const shoulder = mid(P[L.lSh], P[L.rSh]);
  const hip      = mid(P[L.lHip], P[L.rHip]);
  const ankle    = mid(P[L.lAn], P[L.rAn]);

  // ميل الجسم عن الأفقي: نقارن الارتفاع بالامتداد الأفقي (بعدين أفقيين)
  const dv = Math.abs(shoulder.y - ankle.y);
  const dh = Math.hypot(shoulder.x - ankle.x, (shoulder.z || 0) - (ankle.z || 0));
  const bodyTilt = (Math.atan2(dv, dh || 1e-6) * 180) / Math.PI;

  // استقامة الجسم: الورك لا يهبط ولا يرتفع كثيراً عن خط الكتف–الكاحل
  const hipLine = angleAt(shoulder, hip, ankle);

  // زاوية المرفق — الأهم في العدّ.
  // نأخذ الذراع الأوضح للكاميرا لا الأكبر زاوية: حين يكون الهاتف بجانبك
  // تكون الذراع البعيدة محجوبة وتُخمَّن زاويتها خطأً، فتُفسد العدّ.
  const lSeen = (vis(lm[L.lSh]) + vis(lm[L.lEl]) + vis(lm[L.lWr])) / 3;
  const rSeen = (vis(lm[L.rSh]) + vis(lm[L.rEl]) + vis(lm[L.rWr])) / 3;
  const useLeft = lSeen >= rSeen;
  const elbow = useLeft
    ? angleAt(P[L.lSh], P[L.lEl], P[L.lWr])
    : angleAt(P[L.rSh], P[L.rEl], P[L.rWr]);

  // الظهور: نأخذ الأفضل من كل زوج، فالجانب البعيد محجوب دائماً
  const pairs = [[L.lSh, L.rSh], [L.lEl, L.rEl], [L.lWr, L.rWr], [L.lHip, L.rHip]];
  const visibility = pairs.reduce((s, [a, b]) => s + Math.max(vis(lm[a]), vis(lm[b])), 0) / pairs.length;

  return { bodyTilt, hipLine, elbow, visibility, armSeen: Math.max(lSeen, rSeen) };
}

const Challenge = {
  landmarker: null,
  stream: null,
  running: false,
  lastTime: -1,

  reps: 0,
  target: 10,
  phrase: "أَسْتَغْفِرُ اللهَ",
  state: "up",        // up ⇄ down
  goodFrames: 0,
  awaitingDhikr: false,
  micStream: null,
  analyser: null,
  micPeak: 0,
  waitStart: 0,

  // مدى حركة مرفقك يُقاس أثناء اللعب، فيتأقلم العدّاد مع عمق ضغطك
  elbowLo: 999,
  elbowHi: -999,

  async start(target, phrase) {
    if (this.running) return;
    this.target = target || 10;
    this.phrase = phrase || "أَسْتَغْفِرُ اللهَ";
    this.reps = 0;
    this.state = "up";
    this.goodFrames = 0;
    this.awaitingDhikr = false;
    this.elbowLo = 999;
    this.elbowHi = -999;

    // الكاميرا بنفس اتجاه الهاتف، وأولاً كي ترى نفسك بينما يُحمَّل النموذج
    const video = document.getElementById("chVideo");
    this.stream = await openCamera(video, t => this.diag(t));

    // نجعل الإطار بنفس نسبة الكاميرا، فتظهر الصورة كاملة بلا زوم ولا قصّ
    fitFrame(video, video.closest(".video-wrap"));

    if (!this.landmarker) {
      this.landmarker = await loadLandmarker(t => this.diag(t));
    }

    await this.openMic();

    this.running = true;
    this.render();
    requestAnimationFrame(() => this.loop());
  },

  /** الميكروفون لقياس أنك نطقت فعلاً مع كل ضغطة */
  async openMic() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      const src = ctx.createMediaStreamSource(this.micStream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
    } catch {
      this.analyser = null;   // بدون ميكروفون نكتفي بعدّ الضغطات
    }
  },

  /** هل يوجد صوت الآن؟ */
  micLevel() {
    if (!this.analyser) return 0;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) * (v - 128);
    return Math.sqrt(sum / buf.length) / 128;   // 0..1
  },

  stop() {
    this.running = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null; }
    this.analyser = null;
    const v = document.getElementById("chVideo");
    if (v) v.srcObject = null;
  },

  loop() {
    if (!this.running) return;
    const video = document.getElementById("chVideo");
    const canvas = document.getElementById("chCanvas");
    const ctx = canvas.getContext("2d");

    // نبقي مقاس اللوحة مطابقاً للصورة، وإلا انزاح الهيكل عن الجسم
    if (video.videoWidth && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    if (video.readyState >= 2 && video.currentTime !== this.lastTime) {
      this.lastTime = video.currentTime;
      const res = this.landmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (res.landmarks && res.landmarks.length) {
        const lm = res.landmarks[0];
        const world = res.worldLandmarks && res.worldLandmarks[0];
        this.draw(ctx, canvas, lm);
        this.track(measurePushup(lm, world));
      } else {
        this.diag("");
        this.hint("لا أراك — تأكد أن جسمك كاملاً داخل الصورة");
      }
    }

    // نلتقط الصوت باستمرار كي لا تفوتنا كلمتك
    if (this.awaitingDhikr) {
      const lvl = this.micLevel();
      this.micPeak = Math.max(this.micPeak * 0.92, lvl);
      this.showMic(this.micPeak);
      if (lvl > 0.025) this.confirmDhikr();

      // لا نترك التحدّي عالقاً إن لم يسمعك: نعيد الاستماع وننبّهك
      else if (performance.now() - this.waitStart > 6000) {
        this.waitStart = performance.now();
        const el = document.getElementById("chHint");
        if (el) el.textContent = `ما سمعتك — قل «${this.phrase}» بصوت أعلى`;
        this.relisten();
      }
    }

    requestAnimationFrame(() => this.loop());
  },

  draw(ctx, canvas, lm) {
    const W = canvas.width, H = canvas.height;
    const seen = p => p && vis(p) >= 0.35;
    ctx.lineWidth = Math.max(3, W / 190);
    ctx.strokeStyle = "rgba(16,185,129,.85)";
    for (const [a, b] of BONES) {
      if (!seen(lm[a]) || !seen(lm[b])) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    }
    ctx.fillStyle = "#d4af37";
    for (const i of [L.lSh, L.rSh, L.lEl, L.rEl, L.lWr, L.rWr, L.lHip, L.rHip]) {
      if (!seen(lm[i])) continue;
      ctx.beginPath();
      ctx.arc(lm[i].x * W, lm[i].y * H, Math.max(4, W / 150), 0, Math.PI * 2);
      ctx.fill();
    }
  },

  /** عتبتا النزول والصعود، متأقلمتان مع مدى حركتك الفعلي */
  thresholds() {
    const range = this.elbowHi - this.elbowLo;
    if (range >= 35) {
      return { down: this.elbowLo + range * 0.35, up: this.elbowLo + range * 0.72 };
    }
    return { down: 112, up: 145 };   // قيم مبدئية حتى نعرف مداك
  },

  /** عدّ الضغطات: نزول (المرفق ينثني) ثم صعود (يمتدّ) */
  track(m) {
    if (m.visibility < 0.35) {
      this.diag("");
      this.hint("قرّب جسمك للكاميرا حتى يظهر كاملاً");
      return;
    }

    // الجسم أفقي ومستقيم — وإلا فليست ضغطة (عتبات واسعة عمداً)
    const horizontal = m.bodyTilt < 55;
    const straight = m.hipLine > 120;

    this.diag(
      `${horizontal ? "✓" : "✗"} أفقي ${Math.round(m.bodyTilt)}° · ` +
      `${straight ? "✓" : "✗"} مفرود ${Math.round(m.hipLine)}° · ` +
      `مرفق ${Math.round(m.elbow)}°`
    );

    if (!horizontal) { this.hint("خذ وضع الضغط — جسمك أفقي على الأرض"); return; }
    if (!straight)   { this.hint("افرد ظهرك — لا ترفع وركك ولا تُنزله"); return; }

    if (this.awaitingDhikr) { this.hint(`قل: ${this.phrase}`); return; }

    // نتعلّم مدى حركتك ما دامت الوضعية صحيحة والذراع مرئية
    if (m.armSeen > 0.4 && m.elbow > 20 && m.elbow < 180) {
      this.elbowLo = Math.min(this.elbowLo, m.elbow);
      this.elbowHi = Math.max(this.elbowHi, m.elbow);
    }
    const th = this.thresholds();

    if (this.state === "up" && m.elbow < th.down) {
      if (++this.goodFrames >= 2) { this.state = "down"; this.goodFrames = 0; }
      this.hint("ممتاز… الآن اصعد");
    } else if (this.state === "down" && m.elbow > th.up) {
      if (++this.goodFrames >= 2) { this.state = "up"; this.goodFrames = 0; this.onRep(); }
      this.hint("اصعد…");
    } else {
      this.goodFrames = 0;
      this.hint(this.state === "up" ? "انزل حتى ينثني مرفقك" : "اصعد حتى تمتدّ ذراعك");
    }
  },

  /** اكتملت ضغطة — ننتظر الذكر */
  onRep() {
    this.awaitingDhikr = true;
    this.micPeak = 0;
    this.waitStart = performance.now();
    if (navigator.vibrate) navigator.vibrate(40);
    this.render();
    this.relisten();
  },

  /** يشغّل التعرّف على الذكر (أو يحتسبه إن لم يكن هناك ميكروفون أصلاً) */
  relisten() {
    if (!this.awaitingDhikr) return;

    // إن وُجد تعرّف صوتي أصلي في التطبيق، نستخدمه للتحقق من الكلمة نفسها
    if (window.NoorApp && typeof NoorApp.listenForDhikr === "function") {
      window.__noorSpeech = ok => { if (ok) this.confirmDhikr(); };
      try { NoorApp.listenForDhikr(this.phrase); } catch {}
    } else if (!this.analyser) {
      // لا ميكروفون ولا تعرّف — نحتسبها بعد لحظة كي لا يتوقف التحدّي
      setTimeout(() => this.confirmDhikr(), 900);
    }
  },

  confirmDhikr() {
    if (!this.awaitingDhikr) return;
    this.awaitingDhikr = false;
    this.showMic(0);
    this.reps++;
    if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    this.render();

    if (this.reps >= this.target) this.finish();
  },

  finish() {
    this.running = false;
    this.stop();
    document.getElementById("chHint").textContent = "🔓 أحسنت — فُكّ الحظر";
    document.getElementById("chCount").textContent = `${this.target} / ${this.target}`;
    this.diag("");
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    try {
      if (window.NoorApp && typeof NoorApp.challengeCompleted === "function") {
        NoorApp.challengeCompleted();
      }
    } catch {}
  },

  hint(t) {
    const el = document.getElementById("chHint");
    if (!el) return;
    el.textContent = this.awaitingDhikr ? `قل: ${this.phrase}` : t;
  },

  /** قراءة حيّة تشرح لماذا يَعُدّ أو لا يَعُدّ — بلا تخمين */
  diag(t) {
    const el = document.getElementById("chDiag");
    if (el) el.textContent = t;
  },

  showMic(level) {
    const bar = document.getElementById("chMicBar");
    const box = document.getElementById("chMic");
    if (box) box.classList.toggle("hidden", !this.awaitingDhikr);
    if (bar) bar.style.width = Math.min(100, Math.round(level * 900)) + "%";
  },

  render() {
    document.getElementById("chCount").textContent = `${this.reps} / ${this.target}`;
    document.getElementById("chPhrase").textContent = this.phrase;
    const bar = document.getElementById("chBar");
    if (bar) bar.style.width = Math.round((this.reps / this.target) * 100) + "%";
    this.showMic(0);

    const dots = document.getElementById("chDots");
    if (dots) {
      dots.innerHTML = "";
      for (let i = 0; i < this.target; i++) {
        const d = document.createElement("div");
        d.className = "ch-dot" + (i < this.reps ? " on" : "");
        dots.appendChild(d);
      }
    }
  }
};

window.Challenge = Challenge;
export default Challenge;
export { measurePushup };
