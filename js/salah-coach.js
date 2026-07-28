/* ══════════════════════════════════════════════════════════
   نور — مدرّب الصلاة بالكاميرا
   يقرأ وضعية جسمك وموضع يديك، ويمشي معك من تكبيرة الإحرام
   إلى التسليم، والشيخ يتلو في كل خطوة.
   كل المعالجة داخل جهازك — لا تُرفع صورة ولا فيديو.
   ══════════════════════════════════════════════════════════ */

import { createSheikh, POSE_AR } from "./sheikh-figure.js";
import { fitFrame } from "./pushup-challenge.js";
import { loadLandmarker, cameraConstraints } from "./pose-model.js";

/* نقاط الهيكل */
const L = {
  nose: 0, lEar: 7, rEar: 8,
  lSh: 11, rSh: 12, lEl: 13, rEl: 14, lWr: 15, rWr: 16,
  lHip: 23, rHip: 24, lKn: 25, rKn: 26, lAn: 27, rAn: 28
};

const BONES = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [0,11],[0,12]
];

/* ---------- أدوات ---------- */
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
const bell = (v, c, w) => Math.max(0, 1 - Math.abs(v - c) / w);

/* ══════════════════════════════════════
   تسلسل الصلاة الكامل حسب عدد الركعات
   ══════════════════════════════════════ */
function buildFlow(rakaat) {
  const S = {
    takbirIhram: {
      name: "تكبيرة الإحرام", pose: "takbir",
      hands: "ارفع يديك حتى تحاذي أذنيك أو منكبيك",
      say: "اللَّهُ أَكْبَرُ", audio: "takbir", repeat: 1
    },
    istiftah: {
      name: "دعاء الاستفتاح", pose: "qiyam",
      hands: "ضع يدك اليمنى على اليسرى فوق صدرك",
      say: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، وَتَبَارَكَ اسْمُكَ، وَتَعَالَى جَدُّكَ، وَلَا إِلَهَ غَيْرُكَ",
      audio: "istiftah", repeat: 1
    },
    fatiha: {
      name: "قراءة الفاتحة", pose: "qiyam",
      hands: "اليدان على الصدر، والنظر إلى موضع السجود",
      say: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ …",
      quran: { surah: 1, from: 1, to: 7 }, repeat: 1
    },
    surah: {
      name: "قراءة سورة", pose: "qiyam",
      hands: "اليدان على الصدر",
      say: "قُلْ هُوَ اللَّهُ أَحَدٌ …",
      quran: { surah: 112, from: 1, to: 4 }, repeat: 1
    },
    ruku: {
      name: "الركوع", pose: "ruku",
      hands: "ضع كفّيك على ركبتيك وفرّج أصابعك، واستوِ بظهرك",
      say: "سُبْحَانَ رَبِّيَ الْعَظِيمِ", audio: "ruku", repeat: 3
    },
    itidal: {
      name: "الرفع من الركوع", pose: "itidal",
      hands: "ارفع يديك ثم أرسلهما، وقُم معتدلاً",
      say: "سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ، رَبَّنَا وَلَكَ الْحَمْدُ",
      audio: "itidal", repeat: 1
    },
    sujud: {
      name: "السجود", pose: "sujud",
      hands: "كفّاك على الأرض بجانب رأسك، والجبهة والأنف على الأرض",
      say: "سُبْحَانَ رَبِّيَ الْأَعْلَى", audio: "sujud", repeat: 3
    },
    julus: {
      name: "الجلوس بين السجدتين", pose: "julus",
      hands: "اجلس على رجلك اليسرى وضع يديك على فخذيك",
      say: "رَبِّ اغْفِرْ لِي، رَبِّ اغْفِرْ لِي", audio: "julus", repeat: 1
    },
    qiyamNext: {
      name: "القيام للركعة التالية", pose: "qiyam",
      hands: "انهض مكبّراً وضع يديك على صدرك",
      say: "اللَّهُ أَكْبَرُ", audio: "takbir", repeat: 1
    },
    tashahhud: {
      name: "التشهّد", pose: "julus",
      hands: "يداك على فخذيك، وأشِر بالسبّابة عند «إلا الله»",
      say: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ …",
      audio: "tashahhud", repeat: 1
    },
    ibrahimiyya: {
      name: "الصلاة الإبراهيمية", pose: "julus",
      hands: "ابقَ جالساً واطمئن",
      say: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ …",
      audio: "ibrahimiyya", repeat: 1
    },
    salam: {
      name: "التسليم", pose: "salam",
      hands: "التفت بوجهك يميناً ثم يساراً",
      say: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ", audio: "salam", repeat: 2
    }
  };

  const flow = [];
  const push = (s, rakah) => flow.push({ ...s, rakah });

  for (let r = 1; r <= rakaat; r++) {
    if (r === 1) { push(S.takbirIhram, r); push(S.istiftah, r); }
    else push(S.qiyamNext, r);

    push(S.fatiha, r);
    if (r <= 2) push(S.surah, r);   // السورة في الركعتين الأوليين

    push(S.ruku, r);
    push(S.itidal, r);
    push({ ...S.sujud, name: "السجود الأول" }, r);
    push(S.julus, r);
    push({ ...S.sujud, name: "السجود الثاني" }, r);

    const isLast = r === rakaat;
    if (isLast) {
      push({ ...S.tashahhud, name: "التشهّد الأخير" }, r);
      push(S.ibrahimiyya, r);
      push(S.salam, r);
    } else if (r === 2) {
      push({ ...S.tashahhud, name: "التشهّد الأول" }, r);
    }
  }
  return flow;
}

/* ══════════════════════════════════════
   قياس الجسم واليدين
   ══════════════════════════════════════ */
/**
 * @param lm    النقاط المُطبَّعة 0..1 — للرسم وقياس الظهور فقط
 * @param world النقاط الحقيقية بالمتر — كل الزوايا والنِّسب تُحسب منها
 *
 * لماذا؟ الإحداثيات المُطبَّعة مشدودة بنسبة أبعاد الصورة، فجذعٌ منتصبٌ
 * تماماً يظهر مائلاً عشرات الدرجات على كاميرا الهاتف، فتختلّ الحساسية
 * من أول خطوة. هذه بعينها كانت علّة عدّاد الضغطات وقد صُلحت هناك.
 */
function measure(lm, world) {
  const P = (world && world.length) ? world : lm;

  const shoulder = mid(P[L.lSh], P[L.rSh]);
  const hip      = mid(P[L.lHip], P[L.rHip]);
  const knee     = mid(P[L.lKn], P[L.rKn]);
  const ankle    = mid(P[L.lAn], P[L.rAn]);
  const ear      = mid(P[L.lEar], P[L.rEar]);
  const wrist    = mid(P[L.lWr], P[L.rWr]);
  const nose     = P[L.nose];

  const torso = Math.max(dist(shoulder, hip), 0.02);

  // ميل الجذع عن العمودي: 0 واقف · 90 راكع · أكثر ساجد
  const horiz = Math.hypot(shoulder.x - hip.x, (shoulder.z || 0) - (hip.z || 0));
  const torsoTilt = (Math.atan2(horiz, hip.y - shoulder.y) * 180) / Math.PI;

  const headBelowHip     = (nose.y - hip.y) / torso;
  const shoulderBelowHip = (shoulder.y - hip.y) / torso;
  const hipToAnkle       = (ankle.y - hip.y) / torso;

  /* ---------- تفاصيل اليدين ---------- */
  // السرّة تقريباً: نقطة بين الكتف والورك أقرب للورك
  const navel = { x: shoulder.x + (hip.x - shoulder.x) * 0.6,
                  y: shoulder.y + (hip.y - shoulder.y) * 0.6 };

  const handsAtNavel = dist(wrist, navel) / torso;              // صغير = اليدان على البطن/الصدر
  const handsTogether = dist(P[L.lWr], P[L.rWr]) / torso;        // صغير = الكفّان متلاصقان
  const handsAtKnees = Math.min(dist(P[L.lWr], P[L.lKn]),
                                dist(P[L.rWr], P[L.rKn])) / torso;
  const handsRaised  = Math.max((ear.y - P[L.lWr].y),
                                (ear.y - P[L.rWr].y)) / torso;   // موجب = فوق الأذن
  const wristAboveShoulder = (shoulder.y - wrist.y) / torso;
  const handsNearHead = dist(wrist, nose) / torso;               // صغير في السجود

  const headTurn = Math.abs(nose.x - shoulder.x) / torso;

  // الظهور يُقاس من النقاط المُطبَّعة، وبأفضل الجانبين: الجانب البعيد
  // عن الكاميرا محجوب دائماً فلا يصحّ أن يجرّ المتوسّط إلى الأسفل
  const pairs = [[L.lSh, L.rSh], [L.lHip, L.rHip], [L.lKn, L.rKn], [L.lWr, L.rWr]];
  const v = i => (lm[i] && lm[i].visibility != null) ? lm[i].visibility : 1;
  const visibility = (pairs.reduce((s, [a, b]) => s + Math.max(v(a), v(b)), 0) + v(L.nose))
                     / (pairs.length + 1);

  return {
    torsoTilt, headBelowHip, shoulderBelowHip, hipToAnkle,
    handsAtNavel, handsTogether, handsAtKnees, handsRaised,
    wristAboveShoulder, handsNearHead, headTurn, visibility
  };
}

/* ══════════════════════════════════════
   تصنيف الوضعية
   ══════════════════════════════════════ */
function classify(m) {
  const standing = ramp(m.hipToAnkle, 0.85, 1.30);
  const sitting  = 1 - ramp(m.hipToAnkle, 0.70, 1.15);
  const upright  = bell(m.torsoTilt, 6, 48);
  const notLow   = 1 - ramp(m.headBelowHip, 0.0, 0.22);

  // الكتفان ينزلان تحت الورك في السجود فقط — لا في أعمق ركوع
  const shouldersDown = ramp(m.shoulderBelowHip, 0.05, 0.35);

  // إشارات اليدين (تُعزّز ولا تمنع، حتى لا تفشل عند احتجاب يد)
  const handsFolded  = 1 - ramp(m.handsAtNavel, 0.55, 1.25);
  const handsUp      = ramp(m.handsRaised, -0.35, 0.05);
  const handsOnKnees = 1 - ramp(m.handsAtKnees, 0.55, 1.30);
  const handsDown    = 1 - ramp(m.handsNearHead, 0.9, 1.9);
  const boost = (base, hint, weight = 0.25) =>
    Math.min(1, base * (1 - weight) + base * hint * weight * 2);

  const scores = {
    sujud: boost(
      Math.min(
        ramp(m.headBelowHip, -0.08, 0.18),
        ramp(m.torsoTilt, 40, 80),
        shouldersDown
      ), handsDown),

    ruku: boost(
      Math.min(
        bell(m.torsoTilt, 82, 45),
        standing,
        1 - shouldersDown
      ), handsOnKnees),

    takbir: Math.min(
      upright, standing, notLow,
      ramp(m.wristAboveShoulder, -0.45, -0.05)
    ),

    qiyam: boost(
      Math.min(
        upright, standing, notLow,
        1 - ramp(m.wristAboveShoulder, -0.45, -0.05)
      ), handsFolded),

    julus: Math.min(
      bell(m.torsoTilt, 10, 52),
      sitting,
      notLow
    )
  };

  scores.salam = Math.min(scores.julus, ramp(m.headTurn, 0.18, 0.45));

  let best = "none", bestScore = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = k; }
  }
  return { pose: best, score: bestScore, scores };
}

/* الوضعيات المتكافئة عند المطابقة */
const FAMILY = { itidal: "qiyam", tashahhud: "julus", salam: "julus" };
const fam = p => FAMILY[p] || p;

/* ══════════════════════════════════════
   النطق
   ══════════════════════════════════════ */
const missingAudio = new Set();

function say(step) {
  return new Promise(resolve => {
    if (window.S && window.S.voiceEnabled === false) return resolve();

    // ما كان قرآناً يُتلى بصوت الشيخ الحقيقي
    if (step.quran) {
      const q = step.quran;
      let n = q.from;
      const next = () => {
        if (n > q.to) return resolve();
        const a = new Audio(ayahUrl(Quran.reciter.id, q.surah, n));
        Coach._audio = a;
        a.addEventListener("ended", () => { n++; next(); });
        a.addEventListener("error", () => resolve());
        a.play().catch(() => resolve());
      };
      return next();
    }

    const key = step.audio;
    const tts = () => {
      const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith("ar"));
      if (!voices.length) {
        // لا صوت عربي على الجهاز — ننتظر قليلاً بدل الصمت التام
        return setTimeout(resolve, 1400);
      }
      const u = new SpeechSynthesisUtterance(step.say);
      u.lang = "ar-SA";
      u.rate = (window.S && window.S.voiceRate) || 0.8;
      u.voice = voices[0];
      u.onend = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
      setTimeout(resolve, Math.min(20000, 1800 + step.say.length * 90));
    };

    if (key && !missingAudio.has(key)) {
      const a = new Audio(`audio/${key}.mp3`);
      Coach._audio = a;
      a.addEventListener("ended", resolve);
      a.addEventListener("error", () => { missingAudio.add(key); tts(); });
      a.play().catch(() => { missingAudio.add(key); tts(); });
      return;
    }
    tts();
  });
}

function hush() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (Coach._audio) { try { Coach._audio.pause(); } catch {} Coach._audio = null; }
}

/* ══════════════════════════════════════
   المدرّب
   ══════════════════════════════════════ */
const Coach = {
  landmarker: null,
  stream: null,
  running: false,
  flow: [],
  step: 0,
  repDone: 0,
  busy: false,
  history: [],
  lastTime: -1,
  sheikh: null,
  _audio: null,

  /* ─── وضع التحقق (يُستدعى من قفل الصلاة) ─── */
  verify: false,
  requiredRakaat: 0,
  startedAt: 0,
  offMs: 0,        // كم مضى وأنت خارج الوضعية أثناء الذكر
  lastCheck: 0,

  /** أقل زمن معقول لأداء الصلاة — ٤٥ ثانية للركعة */
  get minTotalMs() { return this.requiredRakaat * 45000; },

  /**
   * @param rakaat عدد الركعات
   * @param verify وضع التحقق: يُستدعى من شاشة القفل، ولا يُفتح القفل
   *               إلا بأداء الصلاة كاملة فعلاً — بلا تخطٍّ ولا اختصار
   */
  async start(rakaat, verify = false) {
    if (this.running) return;

    this.verify = verify;
    this.flow = buildFlow(rakaat);
    this.step = 0;
    this.repDone = 0;
    this.history = [];
    this.busy = false;
    this.startedAt = Date.now();
    this.offMs = 0;
    this.lastCheck = 0;
    this.requiredRakaat = rakaat;

    // في وضع التحقق نُخفي أزرار التنقّل اليدوي — وإلا لأمكن تخطّي الصلاة بضغطات
    const manual = document.getElementById("coachManual");
    if (manual) manual.style.display = verify ? "none" : "";
    const vb = document.getElementById("verifyBanner");
    if (vb) vb.classList.toggle("hidden", !verify);

    // الكاميرا أولاً كي ترى نفسك فوراً بينما يُحمَّل النموذج
    this.stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
    const video = document.getElementById("camVideo");
    video.srcObject = this.stream;
    await video.play();

    // إطار بنفس نسبة الكاميرا — بلا قصّ ولا زوم
    fitFrame(video, video.closest(".video-wrap"));

    if (!this.landmarker) {
      this.landmarker = await loadLandmarker(t => this.diag(t));
    }
    this.diag("");

    if (!this.sheikh) this.sheikh = createSheikh(document.getElementById("sheikhStage"));

    this.running = true;
    this.renderStep();
    requestAnimationFrame(() => this.loop());
  },

  stop() {
    this.running = false;
    hush();
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    const v = document.getElementById("camVideo");
    if (v) v.srcObject = null;
  },

  loop() {
    if (!this.running) return;
    const video = document.getElementById("camVideo");
    const canvas = document.getElementById("camCanvas");
    const ctx = canvas.getContext("2d");

    // نُبقي اللوحة بمقاس الصورة، وإلا انزاح الهيكل عن الجسم
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
        const m = measure(lm, res.worldLandmarks && res.worldLandmarks[0]);
        this.draw(ctx, canvas, lm);

        if (m.visibility < 0.35) {
          this.badge("none", 0);
          this.diag("ابتعد قليلاً حتى يظهر جسمك كاملاً");
          this.history = [];
          this.watchHold(null);
        } else {
          const { pose, score } = classify(m);
          this.badge(pose, score);
          this.showExpected(pose, score);
          this.track(pose, score);
          this.watchHold(score >= 0.35 ? pose : null);
        }
      } else {
        this.badge("none", 0);
        this.diag("لا أراك — تأكّد أن الكاميرا تراك كاملاً");
        this.history = [];
        this.watchHold(null);
      }
    }
    requestAnimationFrame(() => this.loop());
  },

  draw(ctx, canvas, lm) {
    const W = canvas.width, H = canvas.height;
    const seen = p => p && (p.visibility ?? 1) >= 0.4;
    const px = p => ({ x: p.x * W, y: p.y * H });

    ctx.lineWidth = Math.max(3, W / 190);
    ctx.strokeStyle = "rgba(16,185,129,.85)";
    ctx.shadowColor = "rgba(16,185,129,.6)";
    ctx.shadowBlur = 10;
    for (const [a, b] of BONES) {
      if (!seen(lm[a]) || !seen(lm[b])) continue;
      const p = px(lm[a]), q = px(lm[b]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    const r = Math.max(4, W / 150);
    for (const i of Object.values(L)) {
      if (!seen(lm[i])) continue;
      const p = px(lm[i]);
      ctx.fillStyle = "#d4af37";
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    }

    // إبراز الكفّين لأنهما مفتاح التمييز بين الوضعيات
    for (const i of [L.lWr, L.rWr]) {
      if (!seen(lm[i])) continue;
      const p = px(lm[i]);
      ctx.strokeStyle = "#f0d98a";
      ctx.lineWidth = Math.max(3, W / 200);
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2); ctx.stroke();
    }
  },

  badge(pose, score) {
    const el = document.getElementById("poseBadge");
    const expected = fam(this.flow[this.step]?.pose);
    const ok = fam(pose) === expected && score > 0.3;
    el.textContent = POSE_AR[pose] || pose;
    el.classList.toggle("match", ok);
    document.getElementById("confFill").style.width = Math.round(score * 100) + "%";
  },

  /**
   * في وضع التحقق: يجب أن تبقى في الوضعية طوال الذكر.
   * لو خرجت منها أكثر من ثانية ونصف، تُلغى الخطوة وتُعاد —
   * فلا يكفي أن تمرّ بالحركة مروراً سريعاً.
   */
  watchHold(pose) {
    if (!this.verify || !this.busy) { this.offMs = 0; this.lastCheck = 0; return; }

    const now = performance.now();
    const dt = this.lastCheck ? now - this.lastCheck : 0;
    this.lastCheck = now;

    const expected = fam(this.flow[this.step]?.pose);
    const ok = pose && fam(pose) === expected;

    this.offMs = ok ? 0 : this.offMs + dt;
    if (this.offMs > 1500) this.abortStep();
  },

  /** يُلغي الخطوة الجارية ويعيدها من أولها */
  abortStep() {
    this.offMs = 0;
    hush();
    this.busy = false;
    this.repDone = 0;
    this.history = [];
    const el = document.getElementById("coachHands");
    if (el) el.textContent = "⚠️ خرجت من الوضعية — أعِد هذه الخطوة";
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
  },

  /** رسالة حيّة تحت الكاميرا: مرحلة التحميل، أو سبب عدم التقدّم */
  diag(text) {
    const el = document.getElementById("coachDiag");
    if (el) el.textContent = text;
  },

  /** يقول لك ما هو مطلوب وما الذي يراه — بلا تخمين */
  showExpected(pose, score) {
    const want = this.flow[this.step];
    if (!want) return;
    const same = fam(pose) === fam(want.pose);
    this.diag(
      `${same ? "✓" : "✗"} المطلوب: ${POSE_AR[want.pose] || want.pose} · ` +
      `أراك: ${POSE_AR[pose] || "—"} (${Math.round(score * 100)}%)`
    );
  },

  track(pose, score) {
    // ٥ إطارات متتالية بدل ٨، وعتبة ٠٫٤٢ بدل ٠٫٥ — كانت الخطوة أحياناً
    // لا تُحتسب أبداً لأن التقدير يستقرّ تحت العتبة بقليل
    const need = 5, threshold = 0.42;
    this.history.push(score >= threshold ? pose : "none");
    if (this.history.length > need) this.history.shift();
    if (this.history.length < need) return;
    const first = this.history[0];
    if (first === "none" || !this.history.every(p => p === first)) return;
    this.onPose(first);
  },

  async onPose(pose) {
    if (this.busy) return;

    // في وضع التحقق لا تخطّي إطلاقاً: يجب مطابقة الخطوة الحالية بالضبط.
    // خارجه نسمح بخطوتين للأمام تسهيلاً إن سبقتَ الصوت.
    let target = -1;
    const ahead = this.verify ? this.step : Math.min(this.step + 2, this.flow.length - 1);
    for (let j = this.step; j <= ahead; j++) {
      if (fam(this.flow[j].pose) === fam(pose)) { target = j; break; }
    }
    if (target === -1) return;

    this.step = target;
    this.busy = true;
    this.history = [];
    this.renderStep();
    if (navigator.vibrate) navigator.vibrate(30);

    const s = this.flow[this.step];
    for (let i = 0; i < s.repeat; i++) {
      if (!this.running) break;
      this.repDone = i + 1;
      this.renderReps();
      await say(s);
      if (s.repeat > 1) await new Promise(r => setTimeout(r, 300));
    }

    if (this.running) {
      if (this.step < this.flow.length - 1) {
        this.step++;
        this.repDone = 0;
        this.renderStep();
      } else {
        this.finish();
      }
    }
    this.busy = false;
  },

  finish() {
    document.getElementById("coachStepName").textContent = "تمّت الصلاة — تقبّل الله منك 🤲";
    document.getElementById("coachHands").textContent = "";
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    if (!this.verify) return;

    // شرط أخير: زمن معقول. الصلاة الرباعية لا تُؤدّى في دقيقة.
    const spent = Date.now() - this.startedAt;
    if (spent < this.minTotalMs) {
      const need = Math.ceil((this.minTotalMs - spent) / 1000);
      document.getElementById("coachHands").textContent =
        `⚠️ أُدّيت الحركات بسرعة غير معقولة — أعِد الصلاة متأنّياً (${need} ثانية ناقصة)`;
      this.step = 0;
      this.startedAt = Date.now();
      this.renderStep();
      return;
    }

    // أدّى الصلاة كاملة بترتيبها وبعدد ركعاتها وبزمن معقول — يُفتح القفل
    try {
      if (window.NoorApp && typeof NoorApp.prayerCompleted === "function") {
        NoorApp.prayerCompleted();
        document.getElementById("coachHands").textContent = "🔓 فُتح قفل الصلاة — تقبّل الله";
      }
    } catch (e) { /* خارج التطبيق — لا شيء نفعله */ }
  },

  renderStep() {
    const s = this.flow[this.step];
    if (!s) return;
    document.getElementById("coachRakah").textContent =
      `الركعة ${s.rakah} · الخطوة ${this.step + 1} من ${this.flow.length}`;
    document.getElementById("coachStepName").textContent = s.name;
    document.getElementById("coachHands").textContent = "✋ " + s.hands;
    document.getElementById("coachSay").textContent = s.say;
    document.getElementById("sheikhPoseName").textContent = POSE_AR[s.pose] || s.pose;
    this.sheikh?.setPose(s.pose);
    this.renderReps();
  },

  renderReps() {
    const s = this.flow[this.step];
    const box = document.getElementById("coachReps");
    box.innerHTML = "";
    if (!s || s.repeat <= 1) return;
    for (let i = 0; i < s.repeat; i++) {
      const d = document.createElement("div");
      d.className = "rep-dot" + (i < this.repDone ? " on" : "");
      box.appendChild(d);
    }
  },

  go(delta) {
    hush();
    this.busy = false;
    this.step = Math.max(0, Math.min(this.flow.length - 1, this.step + delta));
    this.repDone = 0;
    this.history = [];
    this.renderStep();
  }
};

window.Coach = Coach;
export default Coach;
export { measure, classify, buildFlow };
