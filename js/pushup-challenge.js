/* ══════════════════════════════════════════════════════════
   نور — تحدّي الاستغفار
   يعدّ ضغطاتك بالكاميرا، ومع كل ضغطة تقول ذكراً.
   إذا أتممت العدد المطلوب، فُكّ الحظر حتى الجولة التالية.
   كل المعالجة داخل جهازك.
   ══════════════════════════════════════════════════════════ */

import { PoseLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const L = {
  lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28
};

const BONES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]
];

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** زاوية عند النقطة b بين a و c بالدرجات */
function angleAt(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const den = (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / den))) * 180) / Math.PI;
}

/**
 * يقيس وضعية الضغط.
 * الضغطة الصحيحة: الجسم مستقيم وأفقي، والذراعان تنثنيان ثم تمتدّان.
 */
function measurePushup(lm) {
  const shoulder = mid(lm[L.lSh], lm[L.rSh]);
  const hip      = mid(lm[L.lHip], lm[L.rHip]);
  const ankle    = mid(lm[L.lAn], lm[L.rAn]);
  const knee     = mid(lm[L.lKn], lm[L.rKn]);

  // ميل الجسم عن الأفقي — الضغط يكون الجسم فيه أفقياً
  const dx = Math.abs(shoulder.x - ankle.x);
  const dy = Math.abs(shoulder.y - ankle.y);
  const bodyTilt = (Math.atan2(dy, dx || 0.0001) * 180) / Math.PI;

  // استقامة الجسم: الورك لا يهبط ولا يرتفع كثيراً عن خط الكتف–الكاحل
  const hipLine = angleAt(shoulder, hip, ankle);

  // زاوية المرفق — الأهم في العدّ
  const lElbow = angleAt(lm[L.lSh], lm[L.lEl], lm[L.lWr]);
  const rElbow = angleAt(lm[L.rSh], lm[L.rEl], lm[L.rWr]);
  const elbow = Math.max(lElbow, rElbow);   // الأوضح للكاميرا

  const keys = [L.lSh, L.rSh, L.lEl, L.rEl, L.lWr, L.rWr, L.lHip, L.rHip];
  const visibility = keys.reduce((s, i) => s + (lm[i].visibility ?? 1), 0) / keys.length;

  return { bodyTilt, hipLine, elbow, visibility, knee, shoulder, hip };
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
  spokeAt: 0,

  async start(target, phrase) {
    if (this.running) return;
    this.target = target || 10;
    this.phrase = phrase || "أَسْتَغْفِرُ اللهَ";
    this.reps = 0;
    this.state = "up";
    this.goodFrames = 0;
    this.awaitingDhikr = false;

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } },
      audio: false
    });
    const video = document.getElementById("chVideo");
    video.srcObject = this.stream;
    await video.play();

    if (!this.landmarker) {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    }

    const canvas = document.getElementById("chCanvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;

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

    if (video.readyState >= 2 && video.currentTime !== this.lastTime) {
      this.lastTime = video.currentTime;
      const res = this.landmarker.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (res.landmarks && res.landmarks.length) {
        const lm = res.landmarks[0];
        this.draw(ctx, canvas, lm);
        this.track(measurePushup(lm));
      } else {
        this.hint("لا أراك — تأكد أن جسمك كاملاً داخل الصورة");
      }

      // نلتقط الصوت باستمرار كي لا تفوتنا كلمتك
      if (this.awaitingDhikr && this.micLevel() > 0.045) {
        this.spokeAt = performance.now();
        this.confirmDhikr();
      }
    }
    requestAnimationFrame(() => this.loop());
  },

  draw(ctx, canvas, lm) {
    const W = canvas.width, H = canvas.height;
    const seen = p => p && (p.visibility ?? 1) >= 0.4;
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

  /** عدّ الضغطات: نزول (المرفق ينثني) ثم صعود (يمتدّ) */
  track(m) {
    if (m.visibility < 0.5) { this.hint("قرّب جسمك للكاميرا"); return; }

    // يجب أن يكون الجسم أفقياً ومستقيماً — وإلا فليست ضغطة
    const horizontal = m.bodyTilt < 40;
    const straight = m.hipLine > 140;
    if (!horizontal) { this.hint("خذ وضع الضغط — جسمك أفقي على الأرض"); return; }
    if (!straight)   { this.hint("افرد ظهرك — لا ترفع وركك ولا تُنزله"); return; }

    if (this.awaitingDhikr) {
      this.hint(`قل: ${this.phrase}`);
      return;
    }

    if (this.state === "up" && m.elbow < 100) {
      this.goodFrames++;
      if (this.goodFrames >= 3) { this.state = "down"; this.goodFrames = 0; }
      this.hint("انزل… ممتاز");
    } else if (this.state === "down" && m.elbow > 150) {
      this.goodFrames++;
      if (this.goodFrames >= 3) {
        this.state = "up";
        this.goodFrames = 0;
        this.onRep();
      }
      this.hint("اصعد…");
    } else {
      this.goodFrames = 0;
      this.hint(this.state === "up" ? "انزل حتى ينثني مرفقك" : "اصعد حتى تمتدّ ذراعك");
    }
  },

  /** اكتملت ضغطة — ننتظر الذكر */
  onRep() {
    this.awaitingDhikr = true;
    this.spokeAt = 0;
    if (navigator.vibrate) navigator.vibrate(40);
    this.render();

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
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    try {
      if (window.NoorApp && typeof NoorApp.challengeCompleted === "function") {
        NoorApp.challengeCompleted();
      }
    } catch {}
  },

  hint(t) {
    const el = document.getElementById("chHint");
    if (el && !this.awaitingDhikr) el.textContent = t;
    else if (el) el.textContent = `قل: ${this.phrase}`;
  },

  render() {
    document.getElementById("chCount").textContent = `${this.reps} / ${this.target}`;
    document.getElementById("chPhrase").textContent = this.phrase;
    const bar = document.getElementById("chBar");
    if (bar) bar.style.width = Math.round((this.reps / this.target) * 100) + "%";

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
