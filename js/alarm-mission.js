/* ══════════════════════════════════════════════════════════
   نور — منبّه الفجر بالمهمّات
   ----------------------------------------------------------
   لا يسكت المنبّه بضغطة. يطلب منك تصوير أشياء في بيتك يختارها
   عشوائياً — حنفية الحمّام، الميكروويف، الثلاجة — فلا سبيل إلى
   إسكاته إلا أن تقوم فعلاً وتمشي إليها. وحين تقف على قدميك في
   المطبخ يكون النوم قد ذهب.

   التحقّق من الصورة عبر Gemini المجاني (نفس مفتاح «فضفض»): نسأله
   «هل في هذه الصورة كذا؟» فيجيب بنعم أو لا. لا نقارن بصورة مرجعية
   محفوظة، لأن الزاوية والإضاءة تختلفان كل ليلة فتفشل المقارنة،
   والسؤال المباشر أدقّ وأبسط.

   ولأن الإنترنت قد ينقطع في الرابعة فجراً، ولأن منبّهاً لا يمكن
   إسكاته أبداً خطرٌ لا ميزة، هناك بديل يعمل بلا إنترنت: كتابة
   رموز عشوائية. يبقى القيام مطلوباً، ولا يبقى الهاتف أسيراً.
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

/* حروف بلا لبس: بلا O و0 و I و1 */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const Alarm = {
  targets: Store.get(TARGETS_KEY, SUGGESTED.slice(0, 5)),
  count: Store.get(COUNT_KEY, 3),

  queue: [],
  done: 0,
  stream: null,
  busy: false,
  netFails: 0,
  escapeTimer: null,

  /* وضع البديل */
  typing: false,
  code: "",
  typed: 0,

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
  pane(id) {
    ["almSetup", "almRun", "almType", "almDone"].forEach(p => {
      const e = $(p);
      if (e) e.classList.toggle("hidden", p !== id);
    });
  },

  begin() {
    goto("page-alarm");

    // رنّ المنبّه ولا أهداف كافية؟ لا نتركه يصرخ بلا مخرج
    if (this.targets.length < this.count) {
      if (this.forced) { this.toType("لا توجد أهداف كافية للتصوير"); return; }
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
    this.typing = false;

    this.pane("almRun");
    $("almCancel").classList.toggle("hidden", this.forced);
    $("almEscape").classList.add("hidden");
    this.renderRun();
    this.openCam();

    // بعد دقيقة من العجز: مخرجٌ لا يُسقط الشرط، بل يبدّله
    clearTimeout(this.escapeTimer);
    this.escapeTimer = setTimeout(() => {
      const e = $("almEscape");
      if (e && !this.typing) e.classList.remove("hidden");
    }, 60000);
  },

  async openCam() {
    try {
      const mod = await import("./pose-model.js");
      this.stream = await mod.openCamera($("almVideo"), t => this.say(t));
      this.say("");
    } catch (e) {
      this.say((e && e.message) || "تعذّر فتح الكاميرا");
      const b = $("almEscape");
      if (b) b.classList.remove("hidden");
    }
  },

  stopCam() {
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    const v = $("almVideo");
    if (v) v.srcObject = null;
  },

  say(t) { const e = $("almHint"); if (e) e.textContent = t; },

  dots(boxId, filled) {
    const dots = $(boxId);
    if (!dots) return;
    dots.innerHTML = "";
    for (let i = 0; i < this.count; i++) {
      const d = document.createElement("div");
      d.className = "alm-dot" + (i < filled ? " on" : "");
      dots.appendChild(d);
    }
  },

  renderRun() {
    $("almTask").textContent = this.queue[this.done] || "";
    $("almProgress").textContent = this.done + " / " + this.count;
    this.dots("almDots", this.done);
  },

  /** يلتقط إطاراً من الكاميرا ويعيده base64 بلا ترويسة */
  grab() {
    const v = $("almVideo");
    const c = document.createElement("canvas");
    const w = 640;
    const scale = w / (v.videoWidth || w);
    c.width = w;
    c.height = Math.round((v.videoHeight || 480) * scale);
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.75).split(",")[1];
  },

  async shoot() {
    if (this.busy) return;
    const target = this.queue[this.done];
    if (!target) return;

    const key = Store.get("aiKey", "");
    if (!key) { this.toType("لا يوجد مفتاح Gemini للتحقّق من الصور"); return; }

    this.busy = true;
    $("almShoot").disabled = true;
    this.say("جارٍ التحقّق…");

    try {
      const ok = await this.verify(key, target, this.grab());
      this.netFails = 0;
      if (ok) {
        this.done++;
        vibrate([40, 60, 40]);
        if (this.done >= this.count) { this.finish(); return; }
        this.renderRun();
        this.say("أحسنت — التالي");
      } else {
        vibrate(200);
        this.say("لم أرَ " + target + " في الصورة. قرّب وصوّر مرة أخرى.");
      }
    } catch (e) {
      this.netFails++;
      if (this.netFails >= 3) { this.toType("تعذّر الاتصال بخدمة التحقّق"); return; }
      this.say("تعذّر التحقّق — تحقّق من الإنترنت. محاولة " + this.netFails + " من ٣.");
    } finally {
      this.busy = false;
      const b = $("almShoot");
      if (b) b.disabled = false;
    }
  },

  /** سؤال واحد مغلق فيسهل الحكم على جوابه */
  async verify(key, target, b64) {
    const model = Store.get("aiModel", "") || "gemini-2.5-flash";
    const res = await fetch(API + "/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: b64 } },
            { text: "هل تُظهر هذه الصورة: " + target + "؟ " +
                    "كن متساهلاً ما دام الشيء المقصود ظاهراً ولو جزئياً. " +
                    "أجب بكلمة واحدة فقط: نعم أو لا." }
          ]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 800,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });
    if (!res.ok) throw new Error("http " + res.status);
    const j = await res.json();
    const cand = (j.candidates || [])[0];
    const parts = (cand && cand.content && cand.content.parts) || [];
    const txt = parts.map(p => p.text || "").join(" ");
    return /نعم|yes/i.test(txt);
  },

  /* ─────────── البديل: كتابة الرموز ─────────── */
  newCode() {
    let s = "";
    for (let i = 0; i < 6; i++) {
      s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return s;
  },

  /** ينتقل إلى تحدّي الكتابة — لا يُسقط الشرط بل يبدّله */
  toType(why) {
    clearTimeout(this.escapeTimer);
    this.stopCam();
    this.typing = true;
    this.typed = 0;
    this.busy = false;
    this.pane("almType");
    $("almWhy").textContent =
      why + " — لن يسكت المنبّه حتّى تكتب " + this.count + " رموز.";
    this.nextCode();
  },

  nextCode() {
    this.code = this.newCode();
    $("almCode").textContent = this.code;
    $("almTypeProgress").textContent = this.typed + " / " + this.count;
    this.dots("almTypeDots", this.typed);
    const inp = $("almTypeInput");
    inp.value = "";
    inp.focus();
  },

  checkCode() {
    const inp = $("almTypeInput");
    const v = (inp.value || "").trim().toUpperCase().replace(/\s+/g, "");
    if (v !== this.code) {
      vibrate(200);
      $("almWhy").textContent = "الرمز غير مطابق — انظر جيّداً واكتبه كما هو.";
      inp.value = "";
      inp.focus();
      return;
    }
    this.typed++;
    vibrate([40, 60, 40]);
    if (this.typed >= this.count) { this.finish(); return; }
    this.nextCode();
  },

  /* ─────────── الختام ─────────── */
  finish() {
    clearTimeout(this.escapeTimer);
    this.stopCam();
    this.pane("almDone");
    vibrate([200, 100, 200]);
    // نُخبر تطبيق أندرويد فيُسكت المنبّه
    try {
      if (window.NoorApp && typeof NoorApp.alarmSolved === "function") NoorApp.alarmSolved();
    } catch (e) {}
  },

  cancel() {
    if (this.forced) return;          // في الرنين الحقيقي لا إلغاء
    clearTimeout(this.escapeTimer);
    this.stopCam();
    this.typing = false;
    this.pane("almSetup");
  },

  /** يفتحه تطبيق أندرويد عند رنين المنبّه: #alarm=1 */
  applyRequest() {
    if (!this.forced) return;
    this.begin();
  },

  init() {
    this.renderTargets();

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
      });
    });

    $("almTry").addEventListener("click", () => this.begin());
    $("almShoot").addEventListener("click", () => this.shoot());
    $("almEscape").addEventListener("click", () => this.toType("الكاميرا لا تعمل"));
    $("almCancel").addEventListener("click", () => this.cancel());
    $("almBack").addEventListener("click", () => this.cancel());
    $("almTypeOk").addEventListener("click", () => this.checkCode());
    $("almTypeInput").addEventListener("keydown", e => {
      if (e.key === "Enter") this.checkCode();
    });
  }
};

window.Alarm = Alarm;
})();
