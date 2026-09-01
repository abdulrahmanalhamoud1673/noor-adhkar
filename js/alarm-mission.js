/* ══════════════════════════════════════════════════════════
   نور — منبّه الفجر بالمهمّات
   ----------------------------------------------------------
   لا يسكت المنبّه بضغطة. يطلب منك تصوير أشياء في بيتك يختارها
   عشوائياً — حنفية الحمّام، الميكروويف، الثلاجة — فلا سبيل إلى
   إسكاته إلا أن تقوم فعلاً وتمشي إليها. وحين تقف على قدميك في
   المطبخ يكون النوم قد ذهب.

   لا كتابة رموز ولا أحجيات: الطلب هو التصوير، والتصوير وحده.

   ولماذا لا نسأله «هل هذه ثلاجة؟» فحسب؟ لأن سؤال نعم/لا يفشل
   كثيراً: لقطة قريبة من باب ثلاجة بيضاء قد لا يجزم فيها النموذج،
   فيقول «لا» وأنت واقف أمامها. فنسأله بدل ذلك: «ماذا ترى؟» ثم
   نبحث عن هدفنا في جوابه — ومعه مرادفاته. وهذا أكثر تسامحاً،
   وفوق ذلك نعرض لك ما رآه فتفهم سبب الرفض بدل أن تحزر.

   وإن انقطع الإنترنت فلا حكم لنموذج، لكن يبقى ما لا يحتاج شبكة:
   أن تصوّر ثلاثة أماكن مختلفة فعلاً. الهاتف يرى بنفسه أن المشهد
   تغيّر، ولا يتغيّر المشهد وأنت في فراشك.
   ══════════════════════════════════════════════════════════ */
(function () {

const TARGETS_KEY = "alarmTargets";
const COUNT_KEY = "alarmCount";
const API = "https://generativelanguage.googleapis.com/v1beta";

/* أهداف مقترحة — يعدّلها كما يشاء */
const SUGGESTED = [
  "حنفية الحمّام", "الميكروويف", "الثلاجة", "الغسّالة",
  "مفتاح النور في المطبخ", "الشبّاك", "باب البيت", "المغسلة", "الفرن"
];

/* مرادفات شائعة — النموذج قد يسمّي الشيء باسم آخر صحيح */
const SYNONYMS = {
  "ثلاجة": ["براد", "برّاد", "فريزر", "refrigerator", "fridge", "freezer"],
  "ميكروويف": ["مايكروويف", "ميكرويف", "فرن كهربائي", "microwave"],
  "غسالة": ["غسّالة", "غسيل", "washing machine", "washer"],
  "حنفية": ["صنبور", "صنبورة", "حنفيه", "خلاط ماء", "tap", "faucet", "sink"],
  "مغسلة": ["حوض", "مغسله", "sink", "basin", "washbasin"],
  "فرن": ["طباخ", "بوتاجاز", "غاز", "oven", "stove", "cooker"],
  "شباك": ["شبّاك", "نافذة", "window"],
  "باب": ["door"],
  "مفتاح النور": ["مفتاح كهرباء", "مفتاح إضاءة", "قابس", "switch", "light switch"],
  "سرير": ["bed"],
  "مرآة": ["مراية", "mirror"],
  "تلفزيون": ["تلفاز", "شاشة", "tv", "television"]
};

/* أسماء الغرف والحشو: لا يُبنى عليها حكم، وإلا قُبِلت
   أي لقطة في المطبخ على أنها «مفتاح النور في المطبخ» */
const STOPWORDS = [
  "مطبخ", "حمام", "غرفه", "بيت", "منزل", "صاله", "نوم", "معيشه",
  "داخل", "عند", "فوق", "تحت", "كبير", "صغير", "ابيض", "اسود",
  "kitchen", "bathroom", "bedroom", "room", "house", "living"
];

/* ─── ضبط المراقبة المحلية ───
   نأخذ صورة مصغّرة كل 400 ملّي ثانية ونقارنها بسابقتها. الفرق
   الصغير يعني أن يدك ثبتت، والفرق الكبير عن آخر لقطة أرسلناها
   يعني أن المشهد تغيّر فيستحقّ سؤالاً جديداً. */
const TICK_MS = 400;
const STILL = 7;           // أقل من هذا الفرق = الكاميرا ثابتة
const CHANGED = 9;         // أكبر من هذا عن آخر سؤال = مشهد جديد
const STILL_TICKS = 2;     // كم مرة متتالية تثبت قبل أن نسأل
const MIN_GAP_MS = 3000;   // أقل فاصل بين سؤالين مهما حدث
const MAX_PER_MIN = 9;     // سقف الطلبات في الدقيقة (الحصّة المجانية ١٠)
const MOVED = 26;          // فرق يكفي للقول: هذا مكان آخر (وضع بلا إنترنت)

const Alarm = {
  targets: Store.get(TARGETS_KEY, SUGGESTED.slice(0, 5)),
  count: Store.get(COUNT_KEY, 3),

  queue: [],
  done: 0,
  stream: null,
  busy: false,
  netFails: 0,
  lastError: "",

  /* المراقبة المحلية */
  scanTimer: null,
  thumbCtx: null,
  prevThumb: null,
  sentThumb: null,
  stillFor: 0,
  lastAsk: 0,
  asks: [],
  paused: false,

  /* وضع «أماكن مختلفة» حين يتعذّر التحقّق بالذكاء */
  local: false,
  homeThumb: null,     // مشهد البداية — غرفة نومك
  okThumbs: [],        // مشاهد قُبلت

  /** رنين حقيقي من تطبيق أندرويد — لا مهرب إلا بالإتمام */
  get forced() { return /[#&]alarm=1/.test(location.hash); },

  /* ─────────── الإعدادات ─────────── */
  saveTargets() { Store.set(TARGETS_KEY, this.targets); this.renderTargets(); },

  addTarget(name) {
    const t = (name || "").trim();
    if (!t) return;
    if (this.targets.includes(t)) { toast("موجود أصلاً"); return; }
    this.targets.push(t);
    this.saveTargets();
    toast("أُضيف ✓");
  },

  removeTarget(name) {
    this.targets = this.targets.filter(x => x !== name);
    this.saveTargets();
  },

  renderTargets() {
    const box = $("almTargets");
    if (!box) return;
    box.innerHTML = "";
    this.targets.forEach(t => {
      const chip = document.createElement("div");
      chip.className = "alm-chip";
      const span = document.createElement("span");
      span.textContent = t;
      const del = document.createElement("button");
      del.textContent = "✕";
      del.setAttribute("aria-label", "حذف");
      del.addEventListener("click", () => this.removeTarget(t));
      chip.appendChild(span);
      chip.appendChild(del);
      box.appendChild(chip);
    });

    const sug = $("almSuggest");
    if (sug) {
      sug.innerHTML = "";
      SUGGESTED.filter(s => !this.targets.includes(s)).forEach(s => {
        const b = document.createElement("button");
        b.className = "alm-sug";
        b.textContent = "+ " + s;
        b.addEventListener("click", () => this.addTarget(s));
        sug.appendChild(b);
      });
    }

    const warn = $("almWarn");
    if (warn) {
      const few = this.targets.length < this.count;
      warn.classList.toggle("hidden", !few);
      if (few) {
        warn.textContent =
          "تحتاج " + this.count + " أهداف على الأقل — عندك " + this.targets.length + ".";
      }
    }
  },

  /* ─────────── تشغيل الجولة ─────────── */

  /** أثناء الجولة نُخفي زينة التطبيق كلّها فتظهر الكاميرا كاملة بلا قصّ */
  live(on) { document.body.classList.toggle("alm-live", !!on); },

  pane(id) {
    ["almSetup", "almRun", "almDone"].forEach(p => {
      const e = $(p);
      if (e) e.classList.toggle("hidden", p !== id);
    });
  },

  begin() {
    goto("page-alarm");

    if (this.targets.length < this.count) {
      toast("أضف أهدافاً أولاً");
      this.pane("almSetup");
      return;
    }

    const pool = this.targets.slice();
    this.queue = [];
    for (let i = 0; i < this.count; i++) {
      this.queue.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    this.done = 0;
    this.netFails = 0;
    this.asks = [];
    this.local = false;
    this.homeThumb = null;
    this.okThumbs = [];
    this.lastError = "";

    this.pane("almRun");
    this.live(true);
    $("almCancel").classList.toggle("hidden", this.forced);
    $("almNeedKey").classList.add("hidden");
    $("almGiveUp").classList.add("hidden");
    this.renderRun();
    this.openCam();
  },

  async openCam() {
    const v = $("almVideo");
    try {
      const mod = await import("./pose-model.js?v=41");
      // الخلفية: أنت تصوّر الثلاجة لا وجهك
      this.stream = await mod.openCamera(v, t => this.say(t), "environment");
      this.fit(v);
      setTimeout(() => { this.homeThumb = this.thumb(); }, 700);
      this.startScan();
    } catch (e) {
      // الكاميرا نفسها معطّلة: لا مهمّة ممكنة، ولا نحبس الهاتف
      this.say((e && e.message) || "تعذّر فتح الكاميرا");
      $("almGiveUp").classList.remove("hidden");
    }
  },

  /** يضبط الإطار على نسبة الكاميرا فلا تظهر الصورة مقصوصة ومُكبّرة */
  fit(video) {
    const wrap = video.closest(".video-wrap");
    if (!wrap) return;
    const apply = () => {
      if (video.videoWidth && video.videoHeight) {
        wrap.style.aspectRatio = video.videoWidth + " / " + video.videoHeight;
      }
    };
    apply();
    video.addEventListener("loadedmetadata", apply, { once: true });
    video.addEventListener("resize", apply);
  },

  stopCam() {
    this.stopScan();
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    const v = $("almVideo");
    if (v) v.srcObject = null;
  },

  say(t) { const e = $("almHint"); if (e) e.textContent = t; },

  /** ما رآه النموذج فعلاً — كي لا تحزر سبب الرفض */
  saw(t) {
    const e = $("almSaw");
    if (!e) return;
    e.textContent = t || "";
    e.classList.toggle("hidden", !t);
  },

  dots(filled) {
    const dots = $("almDots");
    if (!dots) return;
    dots.innerHTML = "";
    for (let i = 0; i < this.count; i++) {
      const d = document.createElement("div");
      d.className = "alm-dot" + (i < filled ? " on" : "");
      dots.appendChild(d);
    }
  },

  renderRun() {
    $("almTask").textContent = this.local
      ? "مكان مختلف (" + (this.done + 1) + ")"
      : (this.queue[this.done] || "");
    $("almLabel").textContent = this.local ? "صوّر مكاناً آخر في البيت" : "وجّه الكاميرا نحو";
    $("almProgress").textContent = this.done + " / " + this.count;
    this.dots(this.done);
    this.saw("");
    this.say(this.local
      ? "امشِ إلى غرفة أخرى وصوّرها"
      : "وجّه الكاميرا نحو: " + (this.queue[this.done] || ""));
  },

  /* ─────────── المراقبة المحلية ─────────── */

  /**
   * صورة مصغّرة ٣٢×٢٤ بألوانها تكفي لمعرفة: هل ثبتت اليد؟ هل
   * تغيّر المشهد؟
   *
   * ولماذا بالألوان لا بالرمادي؟ لأن غرفتين مختلفتين قد تتساويان
   * في الإضاءة فتبدوان واحدة للرمادي، فيقال لك «هذا نفس المكان»
   * وأنت في غرفة أخرى.
   */
  thumb() {
    const v = $("almVideo");
    if (!v || !v.videoWidth) return null;
    if (!this.thumbCtx) {
      const c = document.createElement("canvas");
      c.width = 32; c.height = 24;
      this.thumbCtx = c.getContext("2d", { willReadFrequently: true });
    }
    this.thumbCtx.drawImage(v, 0, 0, 32, 24);
    const d = this.thumbCtx.getImageData(0, 0, 32, 24).data;
    const g = new Uint8Array(32 * 24 * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      g[j] = d[i]; g[j + 1] = d[i + 1]; g[j + 2] = d[i + 2];
    }
    return g;
  },

  diff(a, b) {
    if (!a || !b) return 255;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  },

  quotaFree() {
    const now = Date.now();
    this.asks = this.asks.filter(t => now - t < 60000);
    return this.asks.length < MAX_PER_MIN;
  },

  startScan() {
    this.stopScan();
    this.prevThumb = null;
    this.sentThumb = null;
    this.stillFor = 0;
    this.paused = false;
    this.lastAsk = Date.now() - MIN_GAP_MS + 1500;
    this.scanTimer = setInterval(() => this.tick(), TICK_MS);
  },

  stopScan() {
    if (this.scanTimer) { clearInterval(this.scanTimer); this.scanTimer = null; }
  },

  tick() {
    if (this.busy || this.paused) return;
    const cur = this.thumb();
    if (!cur) return;
    if (!this.homeThumb) this.homeThumb = cur;

    const moved = this.diff(this.prevThumb, cur);
    this.prevThumb = cur;

    if (moved > STILL) { this.stillFor = 0; return; }   // اليد تتحرّك
    this.stillFor++;
    if (this.stillFor < STILL_TICKS) return;

    if (this.local) { this.judgeLocal(cur); return; }

    if (this.sentThumb && this.diff(this.sentThumb, cur) < CHANGED) return;
    if (Date.now() - this.lastAsk < MIN_GAP_MS) return;
    if (!this.quotaFree()) return;

    this.sentThumb = cur;
    this.check(true);
  },

  /* ─────────── الحكم بلا إنترنت: أماكن مختلفة ─────────── */

  /**
   * لا نموذج يحكم، لكن الهاتف يرى بنفسه أن المشهد تغيّر.
   * نشترط أن تختلف اللقطة عن غرفة البداية وعن كل ما قُبِل قبلها،
   * فلا سبيل إلى إتمامها وأنت في فراشك.
   */
  judgeLocal(cur) {
    const far = t => this.diff(t, cur) >= MOVED;
    if (!far(this.homeThumb)) {
      this.say("هذا نفس المكان — امشِ إلى غرفة أخرى");
      return;
    }
    if (!this.okThumbs.every(far)) {
      this.say("صوّرتَ هذا المكان — اذهب إلى مكان ثالث");
      return;
    }
    this.okThumbs.push(cur);
    this.hit("مكان جديد");
  },

  /** يلتقط إطاراً من الكاميرا ويعيده base64 بلا ترويسة */
  grab() {
    const v = $("almVideo");
    const c = document.createElement("canvas");
    const w = 768;
    const scale = w / (v.videoWidth || w);
    c.width = w;
    c.height = Math.round((v.videoHeight || 576) * scale);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8).split(",")[1];
  },

  async check(auto) {
    if (this.busy) return;
    const target = this.queue[this.done];
    if (!target) return;

    const key = Store.get("aiKey", "");
    if (!key) { this.needKey(); return; }

    this.busy = true;
    this.lastAsk = Date.now();
    this.asks.push(this.lastAsk);
    const btn = $("almShoot");
    if (btn) btn.disabled = true;
    this.say("جارٍ النظر…");

    try {
      const r = await this.look(key, this.grab());
      this.netFails = 0;
      this.saw(r.seen ? "أرى: " + r.seen : "");

      if (this.matches(target, r)) { this.hit(target); return; }

      vibrate(60);
      this.say("لم أجد " + target + " — ابتعد قليلاً ليظهر كاملاً، أو غيّر الزاوية");
    } catch (e) {
      this.lastError = (e && e.message) || "خطأ";
      if (/429/.test(this.lastError)) {
        this.paused = true;
        this.say("الخدمة مزدحمة — لحظة…");
        setTimeout(() => { this.paused = false; this.sentThumb = null; }, 20000);
      } else {
        // عطل شبكة لا حكم على المشهد: أعِد المحاولة على نفس اللقطة
        this.netFails++;
        this.sentThumb = null;
        this.saw("سبب العطل: " + this.lastError);
        this.say("تعذّر التحقّق (" + this.netFails + "/٣)");
        if (this.netFails >= 3) this.toLocal();
      }
    } finally {
      this.busy = false;
      const b = $("almShoot");
      if (b) b.disabled = false;
    }
  },

  /** يتحوّل إلى «أماكن مختلفة» — بلا رموز ولا أحجيات */
  toLocal() {
    this.local = true;
    this.netFails = 0;
    this.sentThumb = null;
    this.okThumbs = [];
    this.homeThumb = this.thumb() || this.homeThumb;
    toast("تعذّر التحقّق — صوّر أماكن مختلفة");
    this.renderRun();
    this.saw("");
  },

  /* ─────────── سؤال النموذج ─────────── */

  /** يجرّد الكلمة من «ال» والتشكيل ويوحّد الهاء والتاء المربوطة */
  norm(s) {
    return (s || "")
      .replace(/[ً-ْٰ]/g, "")
      .replace(/[إأآا]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/^ال/, "")
      .toLowerCase()
      .trim();
  },

  /** كل الأسماء التي تعني هذا الهدف */
  words(target) {
    const out = [];
    this.norm(target).split(/\s+/).forEach(w => {
      const x = w.replace(/^ال/, "");
      if (x.length > 2 && STOPWORDS.indexOf(x) === -1) out.push(x);
    });
    Object.keys(SYNONYMS).forEach(k => {
      const nk = this.norm(k);
      if (out.some(w => w.includes(nk) || nk.includes(w))) {
        SYNONYMS[k].forEach(s => out.push(this.norm(s)));
      }
    });
    return out;
  },

  /** هل جواب النموذج يشمل هدفنا؟ */
  matches(target, r) {
    const words = this.words(target);
    if (!words.length) return false;              // هدف كلّه أسماء غرف: لا حكم
    const objects = this.norm(r.objects || "");
    return words.some(w => w && objects.includes(w));
  },

  /**
   * سؤال واحد بجوابين: ماذا ترى؟ وهل فيه هدفنا؟
   *
   * ونطلب جواباً قصيراً بحدّ مرتفع للمخرجات: نماذج ٢٫٥ تُنفق من
   * حدّ المخرجات على تفكيرها، فإن ضاق الحدّ عاد الجواب فارغاً —
   * وهو ما يبدو للمستخدم «لم أرَ شيئاً» بلا سبب.
   */
  async look(key, b64) {
    const model = Store.get("aiModel", "") || "gemini-flash-latest";
    const body = {
      contents: [{
        role: "user",
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: b64 } },
          { text:
            "انظر إلى الصورة وأجب بسطرين فقط، بلا مقدّمات:\n" +
            "الأشياء: (اذكر أبرز ٤ إلى ٨ أشياء تراها، مفصولة بفواصل)\n" +
            "المكان: (اسم الغرفة أو المكان بكلمة أو كلمتين)" }
        ]
      }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    let j = await this.post(key, model, body);
    let txt = this.textOf(j);

    // جواب فارغ = التفكير التهم حدّ المخرجات: أعِد بلا ضبط تفكير
    if (!txt) {
      delete body.generationConfig.thinkingConfig;
      body.generationConfig.maxOutputTokens = 4096;
      j = await this.post(key, model, body);
      txt = this.textOf(j);
    }
    if (!txt) throw new Error("جواب فارغ من النموذج");

    const m = /الأشياء\s*:?\s*(.+)/.exec(txt);
    const place = (/المكان\s*:?\s*(.+)/.exec(txt) || [])[1] || "";
    // لم يتبع القالب? نأخذ النص كلّه أفضل من أن نُضيّع جواباً صحيحاً
    const objects = m ? m[1] : txt.replace(/المكان\s*:?.*/g, "");
    return {
      objects: objects,
      seen: (objects + (place ? " — " + place : "")).trim().slice(0, 160),
      raw: txt
    };
  },

  async post(key, model, body) {
    const res = await fetch(API + "/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let why = "";
      try {
        const e = await res.json();
        why = (e.error && e.error.message) || "";
      } catch (x) {}
      if (res.status === 404 || res.status === 400) Store.set("aiModel", "");
      throw new Error(res.status + (why ? ": " + why.slice(0, 90) : ""));
    }
    return res.json();
  },

  textOf(j) {
    const cand = (j.candidates || [])[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    return parts.map(p => p.text || "").join(" ").trim();
  },

  /* ─────────── المفتاح ─────────── */

  needKey() {
    this.paused = true;
    const box = $("almNeedKey");
    if (box) box.classList.remove("hidden");
    this.say("");
    const inp = $("almRunKey");
    if (inp) { inp.value = ""; setTimeout(() => inp.focus(), 200); }
  },

  saveKey(value, onDone) {
    const v = (value || "").trim();
    if (v.length < 20 || /\s/.test(v)) { toast("المفتاح غير مكتمل"); return false; }
    Store.set("aiKey", v);
    Store.set("aiModel", "");        // نعيد اختيار النموذج لهذا المفتاح
    toast("حُفظ المفتاح ✓");
    if (onDone) onDone();
    return true;
  },

  resumeAfterKey() {
    const box = $("almNeedKey");
    if (box) box.classList.add("hidden");
    this.sentThumb = null;
    this.stillFor = 0;
    this.lastAsk = Date.now() - MIN_GAP_MS + 800;
    this.paused = false;
    this.renderRun();
  },

  /** لوحة الجهوزية: تقول قبل الفجر ما الذي ينقص */
  renderReady() {
    const box = $("almReady");
    if (!box) return;
    const key = Store.get("aiKey", "");
    const rows = [
      ["🎯", "الأهداف", this.targets.length + " هدفاً", this.targets.length >= this.count],
      ["🔑", "مفتاح التحقّق", key ? "محفوظ" : "ناقص — بدونه لا تعرّف", !!key],
      ["📷", "الكاميرا", navigator.mediaDevices ? "مدعومة" : "غير مدعومة", !!navigator.mediaDevices]
    ];
    box.innerHTML = "";
    rows.forEach(([icon, name, val, ok]) => {
      const r = document.createElement("div");
      r.className = "alm-ready-row" + (ok ? " ok" : " bad");
      r.innerHTML = "<span>" + icon + "</span><b></b><i></i><em></em>";
      r.querySelector("b").textContent = name;
      r.querySelector("i").textContent = val;
      r.querySelector("em").textContent = ok ? "✓" : "✕";
      box.appendChild(r);
    });
    const row = $("almKeyRow");
    if (row) row.classList.toggle("hidden", !!key);
  },

  /** فحص المفتاح والنموذج قبل الفجر لا عنده */
  async testKey() {
    const out = $("almTestOut");
    const key = Store.get("aiKey", "");
    if (!key) { out.textContent = "لا يوجد مفتاح محفوظ."; out.className = "alm-test bad"; return; }
    out.textContent = "جارٍ الفحص…";
    out.className = "alm-test";
    try {
      const r = await fetch(API + "/models", { headers: { "x-goog-api-key": key } });
      if (!r.ok) {
        let why = "";
        try { const e = await r.json(); why = (e.error && e.error.message) || ""; } catch (x) {}
        out.textContent = "✕ المفتاح مرفوض (" + r.status + ") " + why.slice(0, 80);
        out.className = "alm-test bad";
        return;
      }
      const j = await r.json();
      const names = (j.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => m.name.replace(/^models\//, ""))
        .filter(n => /flash/.test(n) && !/lite|embedding|tts|image/.test(n));
      const pick = names.find(n => n === "gemini-flash-latest") || names[0] || "";
      if (pick) Store.set("aiModel", pick);
      out.textContent = pick ? "✓ المفتاح يعمل — النموذج: " + pick : "✓ المفتاح يعمل";
      out.className = "alm-test ok";
      this.renderReady();
    } catch (e) {
      out.textContent = "✕ لا يوجد اتصال بالإنترنت";
      out.className = "alm-test bad";
    }
  },

  /* ─────────── الختام ─────────── */

  hit(label) {
    vibrate([40, 60, 40]);
    this.done++;
    this.paused = true;
    this.say("✓ " + label);
    this.saw("");
    const box = $("almTaskBox");
    if (box) box.classList.add("hit");
    this.dots(this.done);
    $("almProgress").textContent = this.done + " / " + this.count;

    setTimeout(() => {
      if (box) box.classList.remove("hit");
      if (this.done >= this.count) { this.finish(); return; }
      this.renderRun();
      // نُبقي آخر مشهد ناجح مرجعاً: الهدف التالي شيء آخر في مكان آخر
      this.sentThumb = this.thumb() || this.sentThumb;
      this.stillFor = 0;
      this.lastAsk = Date.now() - MIN_GAP_MS + 1200;
      this.paused = false;
    }, 900);
  },

  finish() {
    this.stopCam();
    this.live(false);
    this.pane("almDone");
    vibrate([200, 100, 200]);
    try {
      if (window.NoorApp && typeof NoorApp.alarmSolved === "function") NoorApp.alarmSolved();
    } catch (e) {}
  },

  cancel() {
    if (this.forced) return;          // في الرنين الحقيقي لا إلغاء
    this.stopCam();
    this.live(false);
    this.pane("almSetup");
    this.renderReady();
  },

  /** الكاميرا معطّلة تماماً: لا مهمّة ممكنة، ولا نحبس الهاتف */
  giveUp() {
    this.stopCam();
    this.live(false);
    this.pane("almDone");
    try {
      if (window.NoorApp && typeof NoorApp.alarmSolved === "function") NoorApp.alarmSolved();
    } catch (e) {}
  },

  /** يفتحه تطبيق أندرويد عند رنين المنبّه: #alarm=1 */
  applyRequest() {
    if (!this.forced) return;
    this.begin();
  },

  init() {
    this.renderTargets();
    this.renderReady();

    $("almAdd").addEventListener("click", () => {
      const inp = $("almInput");
      this.addTarget(inp.value);
      inp.value = "";
    });
    $("almInput").addEventListener("keydown", e => {
      if (e.key === "Enter") { this.addTarget(e.target.value); e.target.value = ""; }
    });

    document.querySelectorAll("#almCountPick button").forEach(b => {
      b.classList.toggle("on", +b.dataset.count === this.count);
      b.addEventListener("click", () => {
        this.count = +b.dataset.count;
        Store.set(COUNT_KEY, this.count);
        document.querySelectorAll("#almCountPick button")
          .forEach(x => x.classList.toggle("on", +x.dataset.count === this.count));
        this.renderTargets();
        this.renderReady();
      });
    });

    $("almTry").addEventListener("click", () => this.begin());
    $("almShoot").addEventListener("click", () => {
      this.sentThumb = null;
      if (this.local) { const t = this.thumb(); if (t) this.judgeLocal(t); }
      else this.check(false);
    });
    $("almCancel").addEventListener("click", () => this.cancel());
    $("almBack").addEventListener("click", () => this.cancel());
    $("almGiveUp").addEventListener("click", () => this.giveUp());

    $("almKeySave").addEventListener("click", () => {
      if (this.saveKey($("almKeyInput").value)) {
        $("almKeyInput").value = "";
        this.renderReady();
      }
    });
    $("almRunKeySave").addEventListener("click", () => {
      if (this.saveKey($("almRunKey").value)) {
        $("almRunKey").value = "";
        this.resumeAfterKey();
      }
    });
    $("almRunKey").addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      if (this.saveKey(e.target.value)) { e.target.value = ""; this.resumeAfterKey(); }
    });
    $("almUseLocal").addEventListener("click", () => {
      $("almNeedKey").classList.add("hidden");
      this.paused = false;
      this.toLocal();
    });
    $("almTest").addEventListener("click", () => this.testKey());

    // الجهوزية تتغيّر خارج هذه الصفحة (يحفظ المفتاح في فضفض مثلاً)
    document.querySelectorAll('[data-goto="page-alarm"]').forEach(b => {
      b.addEventListener("click", () => this.renderReady());
    });
  }
};

window.Alarm = Alarm;
})();
