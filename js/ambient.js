/* ══════════════════════════════════════════════════════════
   نور — أصوات الطبيعة
   ----------------------------------------------------------
   طبقة صوت خلفية تعمل تحت التلاوة لا بدلاً منها: تشغّل القرآن
   ثم تختار مطراً أو ناراً، فيمتزجان. مشغّل مستقلّ تماماً عن
   مشغّل القرآن والمصحف، بمستوى صوت خاصّ به، يظلّ يعمل وأنت
   تتنقّل بين صفحات التطبيق.

   التسجيلات حقيقية بُنيت حلقاتٍ متّصلة: يُمزَج آخرُ كل مقطع
   ببدايته، فلا تسمع قطعاً ولا فجوة عند إعادة التشغيل.
   ══════════════════════════════════════════════════════════ */
(function () {

const SOUNDS = [
  { id: "rain",  name: "مطر",    icon: "🌧️", file: "audio/ambient/rain.ogg"  },
  { id: "fire",  name: "نار",    icon: "🔥",  file: "audio/ambient/fire.ogg"  },
  { id: "wind",  name: "رياح",   icon: "🍃",  file: "audio/ambient/wind.ogg"  },
  { id: "birds", name: "عصافير", icon: "🐦",  file: "audio/ambient/birds.ogg" },
];

const VOL_KEY = "ambVolume";
const SND_KEY = "ambSound";

const Ambient = {
  audio: null,
  current: "",                              // معرّف الصوت العامل، أو "" لا شيء
  volume: Store.get(VOL_KEY, 0.45),

  el() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = true;               // حلقة متّصلة بلا فجوة
      this.audio.preload = "none";
      this.audio.volume = this.volume;
      // لو تعذّر الملف لا نترك المستخدم يظنّ أنه يعمل
      this.audio.addEventListener("error", () => {
        if (!this.current) return;
        toast("تعذّر تشغيل الصوت");
        this.stop();
      });
    }
    return this.audio;
  },

  /** يشغّل صوتاً، أو يوقفه إن كان هو العامل أصلاً */
  toggle(id) {
    if (this.current === id) { this.stop(); return; }
    this.play(id);
  },

  play(id) {
    const s = SOUNDS.find(x => x.id === id);
    if (!s) return;
    const a = this.el();
    a.src = s.file;
    a.volume = this.volume;
    a.play().then(() => {
      this.current = id;
      Store.set(SND_KEY, id);
      this.render();
    }).catch(() => {
      this.current = "";
      this.render();
      toast("اضغط مرة أخرى لتشغيل الصوت");
    });
  },

  stop() {
    if (this.audio) { this.audio.pause(); this.audio.removeAttribute("src"); }
    this.current = "";
    Store.set(SND_KEY, "");
    this.render();
  },

  setVolume(v) {
    this.volume = v;
    Store.set(VOL_KEY, v);
    if (this.audio) this.audio.volume = v;
    const lbl = $("ambVolLabel");
    if (lbl) lbl.textContent = Math.round(v * 100) + "%";
  },

  /** يخفض الصوت مؤقتاً — نستخدمه عند رفع الأذان فلا يزاحمه */
  duck(on) {
    if (!this.audio) return;
    this.audio.volume = on ? this.volume * 0.15 : this.volume;
  },

  open()  { $("ambSheet").classList.remove("hidden"); this.render(); },
  close() { $("ambSheet").classList.add("hidden"); },

  render() {
    // زرّ الشريط العلوي: يضيء ويحمل أيقونة الصوت العامل
    const btn = $("ambBtn");
    if (btn) {
      const s = SOUNDS.find(x => x.id === this.current);
      btn.textContent = s ? s.icon : "🌿";
      btn.classList.toggle("on", !!s);
    }
    document.querySelectorAll("#ambList .amb-card").forEach(c => {
      c.classList.toggle("on", c.dataset.sound === this.current);
    });
    const stop = $("ambStop");
    if (stop) stop.classList.toggle("hidden", !this.current);
  },

  init() {
    const list = $("ambList");
    if (list) {
      list.innerHTML = "";
      SOUNDS.forEach(s => {
        const b = document.createElement("button");
        b.className = "amb-card";
        b.dataset.sound = s.id;
        b.innerHTML = `<span class="amb-icon">${s.icon}</span><span>${s.name}</span>`;
        b.addEventListener("click", () => this.toggle(s.id));
        list.appendChild(b);
      });
    }

    const slider = $("ambVol");
    if (slider) {
      slider.value = Math.round(this.volume * 100);
      slider.addEventListener("input", () => this.setVolume(slider.value / 100));
    }
    this.setVolume(this.volume);

    $("ambBtn").addEventListener("click", () => this.open());
    $("ambClose").addEventListener("click", () => this.close());
    $("ambStop").addEventListener("click", () => this.stop());
    $("ambSheet").addEventListener("click", e => {
      if (e.target.id === "ambSheet") this.close();      // نقرة خارج اللوحة
    });

    this.render();
  }
};

window.Ambient = Ambient;
})();
