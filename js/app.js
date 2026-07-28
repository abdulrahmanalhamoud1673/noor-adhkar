/* ══════════════════════════════════════
   نور — المنطق الأساسي
   ══════════════════════════════════════ */

/* ---------- التخزين المحلي ---------- */
const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("noor_" + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem("noor_" + key, JSON.stringify(val)); } catch {}
  }
};

const CITIES = {
  amman:   { name: "عمّان",        lat: 31.9539, lng: 35.9106 },
  irbid:   { name: "إربد",         lat: 32.5556, lng: 35.8500 },
  zarqa:   { name: "الزرقاء",      lat: 32.0728, lng: 36.0880 },
  aqaba:   { name: "العقبة",       lat: 29.5321, lng: 35.0063 },
  karak:   { name: "الكرك",        lat: 31.1850, lng: 35.7047 },
  maan:    { name: "معان",         lat: 30.1962, lng: 35.7340 },
  mafraq:  { name: "المفرق",       lat: 32.3430, lng: 36.2080 },
  salt:    { name: "السلط",        lat: 32.0392, lng: 35.7272 },
  madaba:  { name: "مادبا",        lat: 31.7160, lng: 35.7950 },
  jerash:  { name: "جرش",          lat: 32.2808, lng: 35.8990 },
  makkah:  { name: "مكة المكرمة",  lat: 21.4225, lng: 39.8262 },
  madinah: { name: "المدينة المنورة", lat: 24.4686, lng: 39.6142 },
  riyadh:  { name: "الرياض",       lat: 24.7136, lng: 46.6753 },
  dubai:   { name: "دبي",          lat: 25.2048, lng: 55.2708 },
  cairo:   { name: "القاهرة",      lat: 30.0444, lng: 31.2357 },
  quds:    { name: "القدس",        lat: 31.7683, lng: 35.2137 }
};

/* الإعدادات الافتراضية */
const S = {
  city: Store.get("city", "amman"),
  method: Store.get("method", "jordan"),
  asr: Store.get("asr", "standard"),
  coords: Store.get("coords", null),
  voiceEnabled: Store.get("voiceEnabled", true),
  voiceRate: Store.get("voiceRate", 0.8),
  voiceName: Store.get("voiceName", "")
};
function saveS(k, v) { S[k] = v; Store.set(k, v); }

// يقرأها مدرّب الصلاة الذي يعمل كوحدة module منفصلة
window.S = S;


/* ---------- أدوات عامة ---------- */
const $ = id => document.getElementById(id);
const todayKey = () => new Date().toISOString().slice(0, 10);

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

/* ══════════════════════════════════════
   إبقاء الشاشة مضاءة
   ──────────────────────────────────────
   وأنت تقرأ في المصحف يديك مشغولتان ولا تلمس الشاشة، فيطفئها
   الهاتف في منتصف الآية. نطلب قفل الإضاءة ما دام هناك تلاوة
   تعمل أو مصحف مفتوح أو كاميرا شغّالة، ونتركه فوراً بعدها حتى
   لا نستهلك البطارية بلا داعٍ.
   ══════════════════════════════════════ */
const Wake = {
  lock: null,
  busy: false,

  /** هل نحتاج الشاشة مضاءة الآن؟ */
  needed() {
    const open = id => { const e = $(id); return e && !e.classList.contains("hidden"); };
    const playing = a => a && !a.paused && !a.ended;

    if (open("mushaf")) return true;
    if (typeof Mushaf !== "undefined" && playing(Mushaf.audio)) return true;
    if (typeof Quran !== "undefined" && playing(Quran.audio)) return true;
    if (window.Coach && window.Coach.running) return true;
    if (window.Challenge && window.Challenge.running) return true;
    return false;
  },

  async sync() {
    if (this.busy) return;
    const want = this.needed();

    // إن كان تطبيق أندرويد يوفّر الإبقاء الأصلي فهو أضمن من قفل المتصفّح
    if (window.NoorApp && typeof NoorApp.keepAwake === "function") {
      try { NoorApp.keepAwake(want); } catch {}
    }

    if (want && !this.lock && document.visibilityState === "visible") {
      if (!navigator.wakeLock) return;          // متصفّح قديم — نتجاهل بهدوء
      this.busy = true;
      try {
        this.lock = await navigator.wakeLock.request("screen");
        // النظام قد يسحب القفل وحده (مكالمة، تبديل تطبيق) فنعيد طلبه لاحقاً
        this.lock.addEventListener("release", () => { this.lock = null; });
      } catch { this.lock = null; }
      this.busy = false;
    } else if (!want && this.lock) {
      const l = this.lock;
      this.lock = null;
      try { l.release(); } catch {}
    }
  },

  init() {
    // كل أربع ثوانٍ يكفي: مهلة إطفاء الشاشة لا تقلّ عن ١٥ ثانية
    setInterval(() => this.sync(), 4000);
    document.addEventListener("visibilitychange", () => this.sync());
    this.sync();
  }
};
// الملفات الأخرى تصل إليه عبر window، فـ const لا يُعلَّق على window تلقائياً
window.Wake = Wake;

/* ---------- التنقّل ---------- */
function goto(pageId) {
  // أغلق أي شاشة عائمة أولاً، وإلا بقيت فوق الصفحة الجديدة
  const isOpen = id => { const e = $(id); return e && !e.classList.contains("hidden"); };
  if (isOpen("mushaf") && typeof Mushaf !== "undefined") Mushaf.close();
  if (isOpen("player") && typeof Quran !== "undefined") Quran.close();

  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === pageId));
  document.querySelectorAll(".nav-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.goto === pageId)
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageId !== "page-coach" && window.Coach) window.Coach.stop();

  // عرض الشريط لا يُقاس إلا بعد ظهور الصفحة، وإلا حُسبت الأسهم على عرض صفر
  if (pageId === "page-quran" && typeof Quran !== "undefined") {
    setTimeout(() => Quran.updateArrows(), 0);
  }
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-goto]");
  if (btn) goto(btn.dataset.goto);
});

/* ══════════════════════════════════════
   أوقات الصلاة
   ══════════════════════════════════════ */
let currentTimes = null;

function getLocation() {
  if (S.coords) return { ...S.coords, name: S.coords.name || "موقعي الحالي" };
  return CITIES[S.city] || CITIES.amman;
}

function computeTimes(date = new Date()) {
  const loc = getLocation();
  const tz = -date.getTimezoneOffset() / 60;
  return PT.calculate(date, loc.lat, loc.lng, tz, S.method, S.asr);
}

const PRAYER_ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** الصلاة القادمة والحالية */
function prayerState() {
  const t = currentTimes;
  const now = nowMinutes();
  let next = null, current = null;

  for (const k of PRAYER_ORDER) {
    if (t[k] > now) { next = { key: k, at: t[k] }; break; }
  }
  if (!next) {
    // بعد العشاء → فجر الغد
    const tomorrow = computeTimes(new Date(Date.now() + 86400000));
    next = { key: "fajr", at: tomorrow.fajr + 1440 };
  }
  // الصلاة الحالية = آخر وقت مضى (باستثناء الشروق)
  const passed = PRAYER_ORDER.filter(k => k !== "sunrise" && t[k] <= now);
  current = passed.length ? passed[passed.length - 1] : "isha";
  return { next, current };
}

function renderTimes() {
  currentTimes = computeTimes();
  const { next, current } = prayerState();
  const now = nowMinutes();

  $("nextPrayerName").textContent = PRAYER_NAMES[next.key];
  $("nextPrayerTime").textContent = PT.fmt(next.at % 1440);
  $("locationLabel").textContent = "📍 " + getLocation().name;

  const grid = $("timesGrid");
  grid.innerHTML = "";
  for (const k of PRAYER_ORDER) {
    const cell = document.createElement("div");
    cell.className = "time-cell";
    if (k === current && k !== "sunrise") cell.classList.add("now");
    else if (currentTimes[k] <= now) cell.classList.add("past");
    cell.innerHTML = `<div class="tc-name">${PRAYER_NAMES[k]}</div>
                      <div class="tc-time">${PT.fmt(currentTimes[k])}</div>`;
    grid.appendChild(cell);
  }
}

function tickCountdown() {
  if (!currentTimes) return;
  const { next } = prayerState();
  const diff = (next.at - nowMinutes()) * 60; // ثوانٍ
  if (diff <= 0) return;

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  $("countdown").textContent =
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

}

/* التاريخ الهجري */
function renderHijri() {
  try {
    const f = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric", month: "long", year: "numeric"
    });
    $("hijriDate").textContent = f.format(new Date()).replace(" هـ", " هـ");
  } catch {
    $("hijriDate").textContent = new Date().toLocaleDateString("ar");
  }
}

/* ══════════════════════════════════════
   الأذكار
   ══════════════════════════════════════ */
function counterKey(type) { return `counts_${type}_${todayKey()}`; }

/** النوع المعروض حالياً: sabah أو masaa */
let adhkarType = "sabah";

const ADHKAR_META = {
  sabah: {
    title: "🌅 أذكار الصباح",
    when: "وقتها: من بعد الفجر إلى شروق الشمس (ويمتد إلى الظهر)"
  },
  masaa: {
    title: "🌙 أذكار المساء",
    when: "وقتها: من بعد العصر إلى غروب الشمس (ويمتد إلى نصف الليل)"
  }
};

function showAdhkar(type) {
  adhkarType = type;
  $("adhkarTitle").textContent = ADHKAR_META[type].title;
  $("adhkarWhen").textContent = ADHKAR_META[type].when;

  document.querySelectorAll("#adhkarSwitch .seg").forEach(b =>
    b.classList.toggle("active", b.dataset.type === type)
  );
  $("segPill").classList.toggle("left", type === "masaa");

  renderAdhkar(type);
  updateProgress();
}

function renderAdhkar(type) {
  const list = type === "sabah" ? ADHKAR_SABAH : ADHKAR_MASAA;
  const container = $("listAdhkar");
  const counts = Store.get(counterKey(type), {});
  container.innerHTML = "";

  list.forEach((d, i) => {
    const done = (counts[i] || 0) >= d.count;
    const card = document.createElement("div");
    card.className = "dhikr" + (done ? " done" : "");
    card.innerHTML = `
      <div class="dhikr-title">${d.title}</div>
      <div class="dhikr-text">${d.text}</div>
      ${d.note ? `<div class="dhikr-note">${d.note}</div>` : ""}
      <div class="dhikr-actions">
        <button class="tap-btn${done ? " done" : ""}">${done ? "تم بحمد الله ✓" : "اضغط للعدّ"}</button>
        <div class="counter">${counts[i] || 0} / ${d.count}</div>
      </div>`;

    card.querySelector(".tap-btn").addEventListener("click", () => {
      const c = Store.get(counterKey(type), {});
      c[i] = Math.min((c[i] || 0) + 1, d.count);
      Store.set(counterKey(type), c);
      vibrate(18);

      const isDone = c[i] >= d.count;
      card.classList.toggle("done", isDone);
      const btn = card.querySelector(".tap-btn");
      btn.classList.toggle("done", isDone);
      btn.textContent = isDone ? "تم بحمد الله ✓" : "اضغط للعدّ";
      card.querySelector(".counter").textContent = `${c[i]} / ${d.count}`;

      if (isDone) {
        // انتقال تلقائي للذكر التالي
        const nextCard = card.nextElementSibling;
        if (nextCard) setTimeout(() => nextCard.scrollIntoView({ behavior: "smooth", block: "center" }), 320);
      }
      updateProgress();
    });

    container.appendChild(card);
  });
}

function progressOf(type) {
  const list = type === "sabah" ? ADHKAR_SABAH : ADHKAR_MASAA;
  const counts = Store.get(counterKey(type), {});
  const done = list.filter((d, i) => (counts[i] || 0) >= d.count).length;
  return { done, total: list.length, pct: Math.round((done / list.length) * 100) };
}

function updateProgress() {
  // شريط الصفحة الحالية
  const cur = progressOf(adhkarType);
  $("barAdhkar").style.width = cur.pct + "%";
  $("cntAdhkar").textContent = `${cur.done} / ${cur.total}`;

  // النسب في الشاشة الرئيسية
  $("progSabah").textContent = progressOf("sabah").pct + "%";
  $("progMasaa").textContent = progressOf("masaa").pct + "%";

  updateStreak();
}

// التبديل بين الصباح والمساء
document.querySelectorAll("#adhkarSwitch .seg").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.type === adhkarType) return;
    showAdhkar(btn.dataset.type);
    vibrate(15);
  });
});

// من الشاشة الرئيسية مباشرة إلى النوع المطلوب
document.querySelectorAll("[data-adhkar]").forEach(btn => {
  btn.addEventListener("click", () => {
    showAdhkar(btn.dataset.adhkar);
    goto("page-adhkar");
  });
});

$("resetAdhkar").addEventListener("click", () => {
  Store.set(counterKey(adhkarType), {});
  renderAdhkar(adhkarType);
  updateProgress();
  toast("تم تصفير العدّادات");
});

/* ---------- سلسلة الأيام ---------- */
function updateStreak() {
  const s = progressOf("sabah"), m = progressOf("masaa");
  const bothDone = s.pct === 100 && m.pct === 100;
  let streak = Store.get("streak", { days: 0, last: "" });

  if (bothDone && streak.last !== todayKey()) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = { days: streak.last === yesterday ? streak.days + 1 : 1, last: todayKey() };
    Store.set("streak", streak);
    toast("🔥 ما شاء الله! أكملت أذكار اليوم");
  }

  $("streakDays").textContent = streak.days + " يوم";
  const avg = Math.round((s.pct + m.pct) / 2);
  $("streakFill").style.width = avg + "%";
  $("streakNote").textContent = bothDone
    ? "بارك الله فيك — أكملت أذكار اليوم كاملة 🌿"
    : `أنجزت ${avg}% من أذكار اليوم. أكمل الباقي لتحافظ على سلسلتك.`;
}

/* ══════════════════════════════════════
   القرآن الكريم
   ══════════════════════════════════════ */
/** يزيل التشكيل ويوحّد الهمزات — للبحث والمقارنة */
function stripTashkeel(s) {
  return s
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي");
}

/**
 * يحذف البسملة من بداية أول آية إن وُجدت.
 * يقارن الكلمات بعد إزالة التشكيل، لأن رسم المصحف يختلف
 * (ٱ بدل ا، وألف خنجرية في الرحمٰن) فالمقارنة الحرفية تفشل.
 */
function stripLeadingBasmala(text) {
  const expected = ["بسم", "الله", "الرحمن", "الرحيم"];
  const words = text.split(/\s+/);
  if (words.length <= expected.length) return text;
  for (let i = 0; i < expected.length; i++) {
    if (stripTashkeel(words[i]) !== expected[i]) return text;
  }
  return words.slice(expected.length).join(" ");
}

const Quran = {
  audio: new Audio(),
  reciter: null,
  surah: null,
  seeking: false,

  init() {
    this.reciter = RECITERS.find(r => r.id === Store.get("reciter", "afs")) || RECITERS[0];
    this.renderReciters();
    this.renderSurahs();

    this.audio.preload = "none";

    this.audio.addEventListener("loadedmetadata", () => this.renderTime());
    this.audio.addEventListener("timeupdate", () => this.renderTime());
    this.audio.addEventListener("play", () => this.renderPlayBtn());
    this.audio.addEventListener("pause", () => this.renderPlayBtn());
    this.audio.addEventListener("waiting", () => $("playerPlay").classList.add("loading"));
    this.audio.addEventListener("playing", () => $("playerPlay").classList.remove("loading"));
    this.audio.addEventListener("ended", () => this.step(1));
    this.audio.addEventListener("error", () => {
      $("playerPlay").classList.remove("loading");
      toast("تعذّر تحميل التلاوة — تأكد من الإنترنت");
    });

    $("playerPlay").addEventListener("click", () => this.toggle());
    $("playerBack").addEventListener("click", () => { this.audio.currentTime -= 10; });
    $("playerFwd").addEventListener("click", () => { this.audio.currentTime += 10; });
    $("playerPrev").addEventListener("click", () => this.step(-1));
    $("playerNext").addEventListener("click", () => this.step(1));
    $("playerClose").addEventListener("click", () => this.close());
    $("playerBackdrop").addEventListener("click", () => this.close());
    $("readSurah").addEventListener("click", () => this.loadText());

    const bar = $("playerBar");
    bar.addEventListener("input", () => { this.seeking = true; });
    bar.addEventListener("change", () => {
      if (this.audio.duration) {
        this.audio.currentTime = (bar.value / 1000) * this.audio.duration;
      }
      this.seeking = false;
    });

    $("surahSearch").addEventListener("input", e => this.renderSurahs(e.target.value.trim()));

    // أسهم التنقّل بين القرّاء (والسحب بالإصبع يعمل أصلاً على الجوال)
    const row = $("recitersRow");
    // بدون behavior هنا — النعومة تأتي من scroll-behavior في ملف التنسيق
    const slide = dir => {
      row.scrollBy({ left: dir * 150 });
      // لا نعتمد على حدث scroll وحده لتحديث الأسهم
      setTimeout(() => this.updateArrows(), 400);
    };
    $("recRight").addEventListener("click", () => slide(1));
    $("recLeft").addEventListener("click", () => slide(-1));
    row.addEventListener("scroll", () => this.updateArrows());
    window.addEventListener("resize", () => this.updateArrows());
  },

  /** يُخفي السهم عند بلوغ الطرف */
  updateArrows() {
    const row = $("recitersRow");
    const max = row.scrollWidth - row.clientWidth;
    // في الاتجاه من اليمين لليسار تكون قيمة scrollLeft سالبة
    const pos = Math.abs(row.scrollLeft);
    $("recRight").classList.toggle("off", pos <= 4);
    $("recLeft").classList.toggle("off", pos >= max - 4);
  },

  /**
   * صورة القارئ: تُستخدم reciters/<id>.jpg إن وضعتها،
   * وإلا تُرسم صورة مميّزة بلون وحرف خاص بكل قارئ.
   */
  faceHtml(r) {
    return `
      <div class="reciter-face" style="--tint:${r.tint}">
        <svg viewBox="0 0 64 64" class="face-art">
          <defs>
            <linearGradient id="g-${r.id}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${r.tint}" stop-opacity=".55"/>
              <stop offset="1" stop-color="${r.tint}" stop-opacity=".12"/>
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="32" fill="url(#g-${r.id})"/>
          <path d="M32 12c5 0 9 4 9 9v3H23v-3c0-5 4-9 9-9z" fill="#f7fbf9" opacity=".92"/>
          <ellipse cx="32" cy="23" rx="13" ry="4.5" fill="#f7fbf9"/>
          <circle cx="32" cy="36" r="9" fill="#d9b38c"/>
          <path d="M25 40c0 5 3 9 7 9s7-4 7-9z" fill="#f2f6f4"/>
          <text x="32" y="60" text-anchor="middle" font-size="11"
                font-family="Tajawal,sans-serif" font-weight="800"
                fill="${r.tint}">${r.mark}</text>
        </svg>
        <img class="face-photo" src="reciters/${r.id}.jpg" alt=""
             onerror="this.remove()" onload="this.classList.add('ok')">
      </div>`;
  },

  /** يبدّل القارئ المحدّد دون إعادة بناء الشريط (حتى لا تومض الصور) */
  highlightReciter() {
    document.querySelectorAll("#recitersRow .reciter").forEach(el =>
      el.classList.toggle("on", el.dataset.reciter === this.reciter.id)
    );
  },

  renderReciters() {
    const row = $("recitersRow");
    row.innerHTML = "";
    RECITERS.forEach(r => {
      const el = document.createElement("button");
      el.className = "reciter" + (r.id === this.reciter.id ? " on" : "");
      el.dataset.reciter = r.id;
      el.style.setProperty("--tint", r.tint);
      el.innerHTML = `
        ${this.faceHtml(r)}
        <div class="reciter-name">${r.name}</div>
        <div class="reciter-style">${r.style}</div>`;
      el.addEventListener("click", () => {
        this.reciter = r;
        Store.set("reciter", r.id);
        // نبدّل التحديد فقط — إعادة بناء الشريط تُعيد تحميل الصور فتومض
        this.highlightReciter();
        vibrate(15);

        // إن كان المصحف مفتوحاً، تابع من الآية نفسها بصوت القارئ الجديد
        if (Mushaf.surah && !$("mushaf").classList.contains("hidden")) {
          $("mushafReciter").textContent = r.name;
          if (Mushaf.current) Mushaf.playAyah(Mushaf.current);
          toast("القارئ: " + r.name);
          return;
        }

        // أو أعِد تشغيل السورة الجارية بالخلفية
        if (this.surah) this.play(this.surah);
        else toast("القارئ: " + r.name);
      });
      row.appendChild(el);
    });
    this.updateArrows();
  },

  renderSurahs(filter = "") {
    const list = $("surahList");
    list.innerHTML = "";
    const norm = stripTashkeel;
    const q = norm(filter);


    SURAHS.forEach(([num, name, ayahs, place]) => {
      if (q && !norm(name).includes(q) && String(num) !== q) return;
      const el = document.createElement("button");
      el.className = "surah" + (this.surah === num ? " playing" : "");
      el.innerHTML = `
        <div class="surah-num">${num}</div>
        <div class="surah-info">
          <div class="surah-name">سورة ${name}</div>
          <div class="surah-sub">${ayahs} آية · ${place} · اضغط للقراءة 📖</div>
        </div>
        <button class="surah-listen" data-listen="${num}">${this.surah === num && !this.audio.paused ? "❚❚ إيقاف" : "استماع"}</button>`;

      // الضغط على السورة يفتح المصحف مع تلوين الآيات
      el.addEventListener("click", () => Mushaf.openSurah(num));

      // الزر الجانبي: استماع للسورة كاملة بالخلفية
      el.querySelector("[data-listen]").addEventListener("click", ev => {
        ev.stopPropagation();
        this.play(num);
      });

      list.appendChild(el);
    });

    if (!list.children.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.style.textAlign = "center";
      empty.textContent = "لا توجد سورة بهذا الاسم";
      list.appendChild(empty);
    }
  },

  surahName(num) {
    const s = SURAHS.find(x => x[0] === num);
    return s ? "سورة " + s[1] : "";
  },

  play(num) {
    this.surah = num;
    $("surahText").classList.add("hidden");
    $("surahText").innerHTML = "";
    $("readSurah").textContent = "📖 اقرأ نص السورة";

    $("playerSurah").textContent = this.surahName(num);
    $("playerReciter").textContent = this.reciter.name;
    $("player").classList.remove("hidden");
    $("playerBackdrop").classList.remove("hidden");
    $("playerPlay").classList.add("loading");

    this.audio.src = reciterUrl(this.reciter, num);
    this.audio.play().catch(() => {
      $("playerPlay").classList.remove("loading");
      toast("اضغط زر التشغيل للبدء");
    });

    this.renderSurahs($("surahSearch").value.trim());
  },

  toggle() {
    if (!this.surah) return;
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  },

  step(delta) {
    const next = (this.surah || 1) + delta;
    if (next < 1 || next > 114) return;
    this.play(next);
  },

  close() {
    this.audio.pause();
    $("player").classList.add("hidden");
    $("playerBackdrop").classList.add("hidden");
  },

  renderPlayBtn() {
    $("playerPlay").textContent = this.audio.paused ? "▶" : "❚❚";
    this.renderSurahs($("surahSearch").value.trim());
  },

  renderTime() {
    const fmt = t => {
      if (!isFinite(t)) return "0:00";
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${String(s).padStart(2, "0")}`;
    };
    $("playerCur").textContent = fmt(this.audio.currentTime);
    $("playerDur").textContent = fmt(this.audio.duration);
    if (!this.seeking && this.audio.duration) {
      $("playerBar").value = Math.round((this.audio.currentTime / this.audio.duration) * 1000);
    }
  },

  async loadText() {
    const box = $("surahText");
    if (!box.classList.contains("hidden")) {
      box.classList.add("hidden");
      $("readSurah").textContent = "📖 اقرأ نص السورة";
      return;
    }

    $("readSurah").textContent = "جارٍ التحميل…";
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/surah/${this.surah}/quran-uthmani`);
      const json = await res.json();
      const ayahs = json.data.ayahs;

      let html = "";
      // البسملة تُعرض منفصلة (عدا الفاتحة والتوبة)
      if (this.surah !== 1 && this.surah !== 9) {
        html += `<span class="basmala">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</span>`;
      }
      ayahs.forEach((a, i) => {
        let t = a.text;
        // نص أول آية يبدأ بالبسملة، وقد عرضناها فوق — فنحذفها من هنا
        if (this.surah !== 1 && this.surah !== 9 && i === 0) {
          t = stripLeadingBasmala(t);
        }
        html += t + `<span class="ayah-num">${a.numberInSurah}</span> `;
      });

      box.innerHTML = html;
      box.classList.remove("hidden");
      $("readSurah").textContent = "✕ أخفِ النص";
    } catch {
      $("readSurah").textContent = "📖 اقرأ نص السورة";
      toast("تعذّر تحميل النص — يحتاج إنترنت");
    }
  }
};

/* ══════════════════════════════════════
   خطوات الصلاة
   ══════════════════════════════════════ */
function renderSteps() {
  const c = $("stepsList");
  c.innerHTML = "";
  PRAYER_STEPS.forEach((st, i) => {
    const el = document.createElement("div");
    el.className = "step";
    el.innerHTML = `
      <div class="step-head">
        <div class="step-num">${i + 1}</div>
        <div class="step-name">${st.name}</div>
        <div class="step-arrow">▼</div>
      </div>
      <div class="step-body">
        <div class="step-how">${st.how}</div>
        <div class="step-say">${st.sayFull}</div>
        ${st.repeat > 1 ? `<div class="step-rep">تُقال ${st.repeat} مرات</div>` : ""}
        <button class="step-speak">🔊 استمع</button>
      </div>`;
    el.querySelector(".step-head").addEventListener("click", () => el.classList.toggle("open"));
    const speakBtn = el.querySelector(".step-speak");
    if (st.quran) speakBtn.textContent = "🔊 استمع بصوت " + "الشيخ";
    speakBtn.addEventListener("click", e => {
      e.stopPropagation();
      // ما كان قرآناً يُتلى بصوت الشيخ الحقيقي
      if (st.quran) Voice.recite(st.quran.surah, st.quran.from, st.quran.to);
      else Voice.speak(st.sayFull, st.audio);
    });
    c.appendChild(el);
  });
}

/* ══════════════════════════════════════
   الصوت — ملف صوتي إن وُجد، وإلا نطق آلي
   ══════════════════════════════════════ */
const Voice = {
  voices: [],
  audioCache: {},

  init() {
    const load = () => {
      this.voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith("ar"));
    };
    load();
    if ("speechSynthesis" in window) {
      speechSynthesis.addEventListener("voiceschanged", load);
    }
  },

  /** هل يوجد صوت عربي على الجهاز؟ */
  hasArabicVoice() {
    return this.voices.length > 0;
  },

  /** يتلو آيات سورة كاملة بصوت شيخ حقيقي، آية بعد آية */
  recite(surah, from, to) {
    this.stop();
    let n = from;
    const next = () => {
      if (n > to) return;
      const a = new Audio(ayahUrl(Quran.reciter.id, surah, n));
      this._current = a;
      a.addEventListener("ended", () => { n++; next(); });
      a.addEventListener("error", () => toast("تعذّر تحميل التلاوة — تحتاج إنترنت"));
      a.play().catch(() => {});
    };
    next();
  },

  /** يحاول تشغيل audio/<key>.mp3 أولاً (صوت شيخ حقيقي) ثم يعود للنطق الآلي */
  speak(text, audioKey) {
    if (!S.voiceEnabled) return;
    this.stop();

    if (audioKey) {
      if (this.audioCache[audioKey] === false) return this._tts(text);
      const a = new Audio(`audio/${audioKey}.mp3`);
      a.volume = 1;
      a.play()
        .then(() => { this.audioCache[audioKey] = true; this._current = a; })
        .catch(() => { this.audioCache[audioKey] = false; this._tts(text); });
      a.addEventListener("error", () => {
        this.audioCache[audioKey] = false;
        this._tts(text);
      }, { once: true });
      return;
    }
    this._tts(text);
  },

  _tts(text) {
    if (!("speechSynthesis" in window)) return;

    // بدون صوت عربي لن يُسمع شيء — نخبره بدل أن يظن أن الزر معطّل
    if (!this.hasArabicVoice()) {
      toast("لا يوجد صوت عربي على جهازك — التفاصيل في الإعدادات");
      return;
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ar-SA";
    u.rate = S.voiceRate;
    u.pitch = 0.9;
    const v = this.voices.find(x => x.name === S.voiceName) || this.voices[0];
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  },

  stop() {
    if (this._current) { try { this._current.pause(); } catch {} this._current = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }
};

/* ══════════════════════════════════════
   مدرّب الصلاة بالكاميرا (يُحمَّل عند الحاجة فقط)
   ══════════════════════════════════════ */
let coachRakaat = 2;

document.querySelectorAll("#prayerPick button").forEach(btn => {
  btn.addEventListener("click", () => {
    coachRakaat = +btn.dataset.rakaat;
    document.querySelectorAll("#prayerPick button").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    vibrate(15);
  });
});

/** وضع فكّ القفل: يأتي من شاشة القفل بعدد ركعات مفروض لا يمكن تغييره */
let coachVerify = false;

function applyLockRequest() {
  const m = /pray=(\d)/.exec(location.hash);
  if (!m) return;

  coachRakaat = +m[1];
  coachVerify = true;

  // نثبّت الصلاة المطلوبة ونمنع اختيار صلاة أقصر للتحايل
  document.querySelectorAll("#prayerPick button").forEach(b => {
    const same = +b.dataset.rakaat === coachRakaat;
    b.classList.toggle("on", same);
    b.disabled = !same;
    b.style.opacity = same ? "1" : ".3";
  });

  goto("page-coach");
  $("startCoach").textContent = "ابدأ الصلاة لفكّ القفل";
}

$("startCoach").addEventListener("click", async () => {
  const btn = $("startCoach");
  btn.disabled = true;
  btn.textContent = "جارٍ تجهيز الكاميرا…";
  try {
    if (!window.Coach) await import("./salah-coach.js");
    await window.Coach.start(coachRakaat, coachVerify);
    $("coachIntro").classList.add("hidden");
    $("coachStage").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    alert(
      "تعذّر تشغيل الكاميرا.\n\nالأسباب المحتملة:\n" +
      "١) لم تسمح للمتصفح باستخدام الكاميرا.\n" +
      "٢) فتحت الملف بالنقر المزدوج — يجب فتحه عبر خادم أو رابط https.\n" +
      "٣) لا يوجد إنترنت لتحميل نموذج التعرّف أول مرة.\n\n" + err.message
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "ابدأ الصلاة";
  }
});

$("stopCoach").addEventListener("click", () => {
  if (window.Coach) window.Coach.stop();
  $("coachStage").classList.add("hidden");
  $("coachIntro").classList.remove("hidden");
});
$("prevStep").addEventListener("click", () => window.Coach && window.Coach.go(-1));
$("nextStep").addEventListener("click", () => window.Coach && window.Coach.go(1));

/* ══════════════════════════════════════
   تحدّي الاستغفار
   ══════════════════════════════════════ */
let chPhrase = Store.get("chPhrase", "أَسْتَغْفِرُ اللهَ");
let chReps = Store.get("chReps", 10);

function initChallengePickers() {
  const mark = (sel, isOn) =>
    document.querySelectorAll(sel).forEach(b => b.classList.toggle("on", isOn(b)));

  mark("#dhikrPick button", b => b.dataset.phrase === chPhrase);
  mark("#repsPick button", b => +b.dataset.reps === chReps);

  document.querySelectorAll("#dhikrPick button").forEach(b => {
    b.addEventListener("click", () => {
      chPhrase = b.dataset.phrase;
      Store.set("chPhrase", chPhrase);
      mark("#dhikrPick button", x => x.dataset.phrase === chPhrase);
      vibrate(15);
    });
  });

  document.querySelectorAll("#repsPick button").forEach(b => {
    b.addEventListener("click", () => {
      chReps = +b.dataset.reps;
      Store.set("chReps", chReps);
      mark("#repsPick button", x => +x.dataset.reps === chReps);
      vibrate(15);
    });
  });
}

$("startChallenge").addEventListener("click", async () => {
  const btn = $("startChallenge");
  btn.disabled = true;
  btn.textContent = "جارٍ تجهيز الكاميرا…";
  try {
    if (!window.Challenge) await import("./pushup-challenge.js");
    await window.Challenge.start(chReps, chPhrase);
    $("chIntro").classList.add("hidden");
    $("chStage").classList.remove("hidden");
  } catch (err) {
    console.error(err);
    alert("تعذّر تشغيل الكاميرا أو الميكروفون.\n\n" + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "ابدأ التحدّي";
  }
});

$("stopChallenge").addEventListener("click", () => {
  if (window.Challenge) window.Challenge.stop();
  $("chStage").classList.add("hidden");
  $("chIntro").classList.remove("hidden");
});

/** يفتحه تطبيق أندرويد عبر #challenge=العدد */
function applyChallengeRequest() {
  const m = /challenge=(\d+)/.exec(location.hash);
  if (!m) return;
  chReps = +m[1];
  const p = /phrase=([^&]+)/.exec(location.hash);
  if (p) chPhrase = decodeURIComponent(p[1]);
  initChallengePickers();
  goto("page-challenge");
  $("startChallenge").textContent = "ابدأ لفكّ الحظر";
}

/* ══════════════════════════════════════
   الإقلاع
   ══════════════════════════════════════ */
/**
 * كل خطوة إقلاع داخل حمايتها الخاصة.
 * سابقاً كان فشل خطوة واحدة يوقف كل ما بعدها، فيظهر التطبيق
 * فارغاً: لا عدّاد ولا أذكار ولا سور. الآن يسقط الجزء المعطوب وحده.
 */
function step(name, fn) {
  try { fn(); }
  catch (e) { console.error("تعذّرت خطوة الإقلاع:", name, e); }
}

function boot() {
  step("التاريخ الهجري", renderHijri);
  step("أوقات الصلاة", renderTimes);
  step("خطوات الصلاة", renderSteps);
  step("الصوت", () => Voice.init());
  step("القرآن", () => Quran.init());
  step("المصحف", () => Mushaf.init());
  step("آخر ما قرأت", renderLastRead);

  const hour = new Date().getHours();
  step("الأذكار", () => showAdhkar(hour >= 12 ? "masaa" : "sabah"));

  step("العدّاد التنازلي", () => {
    setInterval(tickCountdown, 500);
    setInterval(renderTimes, 60000);
    tickCountdown();
  });

  step("تنبيه الوقت", () => {
    if (hour >= 4 && hour < 11) toast("🌅 وقت أذكار الصباح");
    else if (hour >= 15 && hour < 20) toast("🌙 وقت أذكار المساء");
  });

  // تنظيف عامل الخدمة القديم الذي كان يخزّن نسخاً قديمة من الملفات
  step("تحدّي الاستغفار", initChallengePickers);
  step("فضفض", () => Chat.init());
  step("إبقاء الشاشة مضاءة", () => Wake.init());
  step("تنظيف الذاكرة المخزّنة", cleanupOldCaches);
  step("طلب فكّ القفل", applyLockRequest);
  step("طلب التحدّي", applyChallengeRequest);
}

/**
 * تطبيق أندرويد يفتح الصفحة نفسها مع #pray=…‏ أو #challenge=…‏ .
 * حين تكون الصفحة محمّلة أصلاً لا يُعيد المتصفّح تحميلها، فلا تعمل boot()
 * ولا تُقرأ العلامة. لذلك نُنصت لتغيّر العلامة ونعيد قراءتها.
 */
window.addEventListener("hashchange", () => {
  step("طلب فكّ القفل", applyLockRequest);
  step("طلب التحدّي", applyChallengeRequest);
});

/**
 * التخزين المؤقت كان يخلط ملفات قديمة بجديدة فيتعطّل التطبيق.
 * نلغي أي عامل خدمة مسجَّل ونمسح كل ما خزّنه، مرة واحدة وللأبد.
 */
function cleanupOldCaches() {
  if (!location.protocol.startsWith("http")) return;

  if (window.caches && caches.keys) {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", boot);
