/* ══════════════════════════════════════════════════════════
   نور — وضع المصحف
   يفتح السورة كصفحة مصحف، ويُلوّن كل آية أثناء تلاوة الشيخ لها.
   كل آية ملف صوتي مستقل، فالتلوين مطابق للصوت تماماً بلا انزياح.
   ══════════════════════════════════════════════════════════ */

const Mushaf = {
  audio: new Audio(),
  preloader: new Audio(),

  surah: null,
  ayahs: [],          // نصوص الآيات
  current: 0,         // رقم الآية الحالية (1 فما فوق)، 0 = لم يبدأ
  playing: false,
  cache: {},          // نصوص السور المحمّلة

  repeatMode: 0,      // 0 بلا تكرار · 1 · 3 · 5 · Infinity
  repeatLeft: 0,
  speed: 1,
  fontSize: 23,
  autoNext: true,

  REPEATS: [0, 1, 3, 5, Infinity],
  SPEEDS: [0.75, 1, 1.25, 1.5],

  /* ─────────── التهيئة ─────────── */
  init() {
    this.fontSize = Store.get("mushafFont", 23);
    this.speed = Store.get("mushafSpeed", 1);
    this.autoNext = Store.get("mushafAutoNext", true);

    this.audio.addEventListener("ended", () => this.onAyahEnd());
    this.audio.addEventListener("play", () => { this.playing = true; this.renderControls(); });
    this.audio.addEventListener("pause", () => { this.playing = false; this.renderControls(); });
    this.audio.addEventListener("error", () => {
      if (!this.surah) return;
      toast("تعذّر تحميل التلاوة — تأكد من الإنترنت");
      this.playing = false;
      this.renderControls();
    });

    $("mushafClose").addEventListener("click", () => this.close());
    $("mushafMenu").addEventListener("click", () => {
      $("mushafPanel").classList.toggle("hidden");
    });

    $("mPlay").addEventListener("click", () => this.toggle());
    $("mPrev").addEventListener("click", () => this.jump(-1));
    $("mNext").addEventListener("click", () => this.jump(1));

    $("mRepeat").addEventListener("click", () => {
      const i = this.REPEATS.indexOf(this.repeatMode);
      this.repeatMode = this.REPEATS[(i + 1) % this.REPEATS.length];
      this.repeatLeft = this.repeatMode;
      this.renderControls();
      toast(this.repeatMode === 0 ? "بلا تكرار"
          : this.repeatMode === Infinity ? "تكرار الآية بلا حد"
          : `تكرار الآية ${this.repeatMode} مرات`);
    });

    $("mSpeed").addEventListener("click", () => {
      const i = this.SPEEDS.indexOf(this.speed);
      this.speed = this.SPEEDS[(i + 1) % this.SPEEDS.length];
      this.audio.playbackRate = this.speed;
      Store.set("mushafSpeed", this.speed);
      this.renderControls();
    });

    $("fontMinus").addEventListener("click", () => this.setFont(this.fontSize - 2));
    $("fontPlus").addEventListener("click", () => this.setFont(this.fontSize + 2));

    $("mAutoNext").checked = this.autoNext;
    $("mAutoNext").addEventListener("change", e => {
      this.autoNext = e.target.checked;
      Store.set("mushafAutoNext", this.autoNext);
    });

    $("mSurahPrev").addEventListener("click", () => this.openSurah(this.surah - 1));
    $("mSurahNext").addEventListener("click", () => this.openSurah(this.surah + 1));
  },

  /* ─────────── فتح سورة ─────────── */
  async openSurah(num, startAyah = 1) {
    if (num < 1 || num > 114) return;

    this.stop();
    this.surah = num;
    this.current = 0;

    $("mushaf").classList.remove("hidden");
    document.body.classList.add("no-scroll");
    $("mushafSurah").textContent = Quran.surahName(num);
    $("mushafReciter").textContent = Quran.reciter.name;
    $("mushafPanel").classList.add("hidden");

    const body = $("mushafBody");
    body.innerHTML = '<div class="mushaf-loading">جارٍ فتح السورة…</div>';

    try {
      this.ayahs = await this.loadText(num);
    } catch {
      body.innerHTML = '<div class="mushaf-loading">تعذّر تحميل السورة.<br>تحتاج اتصالاً بالإنترنت أول مرة.</div>';
      return;
    }

    this.render();
    this.renderControls();
    if (startAyah > 1) this.scrollTo(startAyah);
  },

  /** نصوص آيات السورة — مع تخزين مؤقت */
  async loadText(num) {
    if (this.cache[num]) return this.cache[num];

    const res = await fetch(`https://api.alquran.cloud/v1/surah/${num}/quran-uthmani`);
    const json = await res.json();
    const list = json.data.ayahs.map((a, i) => {
      let t = a.text;
      // البسملة تُعرض في الترويسة، فتُحذف من أول آية
      if (num !== 1 && num !== 9 && i === 0) t = stripLeadingBasmala(t);
      return { n: a.numberInSurah, text: t };
    });

    this.cache[num] = list;
    return list;
  },

  /* ─────────── الرسم ─────────── */
  render() {
    const meta = SURAHS.find(s => s[0] === this.surah);
    const body = $("mushafBody");

    let html = `
      <div class="mushaf-frame">
        <div class="mushaf-surah-name">سورة ${meta[1]}</div>
        <div class="mushaf-surah-meta">${meta[3]} · ${meta[2]} آية</div>
      </div>`;

    if (this.surah !== 1 && this.surah !== 9) {
      html += `<div class="mushaf-basmala">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
    }

    html += '<div class="mushaf-text" id="mushafText">';
    for (const a of this.ayahs) {
      html += `<span class="ayah" data-n="${a.n}">${a.text}<span class="ayah-medal">${a.n}</span></span> `;
    }
    html += "</div>";

    body.innerHTML = html;
    $("mushafText").style.fontSize = this.fontSize + "px";

    // اضغط أي آية لتبدأ التلاوة منها
    body.querySelectorAll(".ayah").forEach(el => {
      el.addEventListener("click", () => this.playAyah(+el.dataset.n));
    });

    $("mSurahPrev").disabled = this.surah <= 1;
    $("mSurahNext").disabled = this.surah >= 114;
  },

  setFont(size) {
    this.fontSize = Math.max(17, Math.min(38, size));
    Store.set("mushafFont", this.fontSize);
    const t = $("mushafText");
    if (t) t.style.fontSize = this.fontSize + "px";
    $("fontVal").textContent = this.fontSize;
  },

  /* ─────────── التشغيل ─────────── */
  playAyah(n) {
    if (n < 1 || n > this.ayahs.length) return;
    this.current = n;
    this.repeatLeft = this.repeatMode;

    this.audio.src = ayahUrl(Quran.reciter.id, this.surah, n);
    this.audio.playbackRate = this.speed;
    this.audio.play().catch(() => {});

    this.highlight(n);
    this.preloadNext(n);
    this.saveProgress();
  },

  /** تحميل الآية التالية مسبقاً حتى لا ينقطع الصوت بينهما */
  preloadNext(n) {
    if (n >= this.ayahs.length) return;
    this.preloader.src = ayahUrl(Quran.reciter.id, this.surah, n + 1);
    this.preloader.load();
  },

  onAyahEnd() {
    // تكرار الآية نفسها
    if (this.repeatLeft > 0) {
      this.repeatLeft = this.repeatLeft === Infinity ? Infinity : this.repeatLeft - 1;
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      this.renderControls();
      return;
    }

    // الآية التالية
    if (this.current < this.ayahs.length) {
      this.playAyah(this.current + 1);
      return;
    }

    // انتهت السورة
    if (this.autoNext && this.surah < 114) {
      toast("السورة التالية…");
      this.openSurah(this.surah + 1).then(() => this.playAyah(1));
    } else {
      this.playing = false;
      this.renderControls();
      toast("تمّت السورة — تقبّل الله");
    }
  },

  toggle() {
    if (!this.surah) return;
    if (this.current === 0) return this.playAyah(1);
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  },

  jump(delta) {
    const target = (this.current || 1) + delta;
    if (target < 1) {
      if (this.surah > 1) this.openSurah(this.surah - 1);
      return;
    }
    if (target > this.ayahs.length) {
      if (this.surah < 114) this.openSurah(this.surah + 1).then(() => this.playAyah(1));
      return;
    }
    this.playAyah(target);
  },

  stop() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.playing = false;
  },

  close() {
    this.stop();
    $("mushaf").classList.add("hidden");
    document.body.classList.remove("no-scroll");
  },

  /* ─────────── التلوين والتمرير ─────────── */
  highlight(n) {
    const body = $("mushafBody");
    body.querySelectorAll(".ayah.active").forEach(e => e.classList.remove("active"));
    const el = body.querySelector(`.ayah[data-n="${n}"]`);
    if (!el) return;
    el.classList.add("active");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    $("mAyahLabel").textContent = `الآية ${n} من ${this.ayahs.length}`;
  },

  scrollTo(n) {
    const el = $("mushafBody").querySelector(`.ayah[data-n="${n}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  },

  renderControls() {
    $("mPlay").textContent = this.playing ? "❚❚" : "▶";
    $("mSpeed").textContent = this.speed + "×";
    $("fontVal").textContent = this.fontSize;

    const r = $("mRepeat");
    if (this.repeatMode === 0) {
      r.textContent = "🔁";
      r.classList.remove("on");
    } else {
      r.textContent = this.repeatMode === Infinity ? "🔁∞" : "🔁" + this.repeatMode;
      r.classList.add("on");
    }

    if (this.current === 0) $("mAyahLabel").textContent = `${this.ayahs.length} آية`;
  },

  /* ─────────── آخر ما قرأت ─────────── */
  saveProgress() {
    Store.set("lastRead", {
      surah: this.surah,
      ayah: this.current,
      name: Quran.surahName(this.surah),
      at: Date.now()
    });
    renderLastRead();
  }
};

/** بطاقة "أكمل ما قرأت" في الشاشة الرئيسية */
function renderLastRead() {
  const card = $("lastReadCard");
  const last = Store.get("lastRead", null);
  if (!last || !last.surah) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  $("lastReadName").textContent = last.name;
  $("lastReadAyah").textContent = "توقّفت عند الآية " + last.ayah;
  card.onclick = () => {
    goto("page-quran");
    Mushaf.openSurah(last.surah, last.ayah);
  };
}
