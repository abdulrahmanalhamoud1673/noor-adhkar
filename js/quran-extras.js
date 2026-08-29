/* ══════════════════════════════════════════════════════════
   نور — إضافات القرآن: المفضّلة وورد اليوم
   ══════════════════════════════════════════════════════════ */
(function () {

/* ────────── السور المفضّلة ────────── */
const Favs = {
  key: "favSurahs",
  list() { return Store.get(this.key, []); },
  has(n) { return this.list().includes(n); },

  toggle(n) {
    const l = this.list();
    const i = l.indexOf(n);
    if (i >= 0) l.splice(i, 1); else l.push(n);
    Store.set(this.key, l);
    this.render();
    // نحدّث النجوم في القائمة بلا إعادة بنائها كاملة
    document.querySelectorAll(`[data-fav="${n}"]`).forEach(b => {
      b.classList.toggle("on", this.has(n));
      b.textContent = this.has(n) ? "★" : "☆";
    });
    vibrate(12);
    toast(this.has(n) ? "أُضيفت إلى المفضّلة ★" : "أُزيلت من المفضّلة");
  },

  render() {
    const box = $("favList");
    const wrap = $("favBox");
    if (!box || !wrap) return;
    const l = this.list();
    wrap.classList.toggle("hidden", l.length === 0);
    box.innerHTML = "";

    l.forEach(n => {
      const s = SURAHS.find(x => x[0] === n);
      if (!s) return;
      const b = document.createElement("button");
      b.className = "fav-chip";
      b.innerHTML = `<span>★</span> ${s[1]}`;
      b.addEventListener("click", () => Mushaf.openSurah(n));
      box.appendChild(b);
    });
  }
};

/* ────────── ورد اليوم ────────── */
const Plan = {
  /** أي وقت نحن فيه الآن؟ نُبرزه ونضعه أولاً */
  currentSlot() {
    const now = new Date();
    if (now.getDay() === 5) return "friday";          // الجمعة
    const h = now.getHours();
    const hit = READING_PLAN.find(s => s.from >= 0 && h >= s.from && h < s.to);
    return hit ? hit.id : "after-prayer";
  },

  open(id) {
    const s = READING_PLAN.find(x => x.id === id);
    if (!s) return;
    $("planTitle").textContent = `${s.icon} ${s.slot}`;
    const box = $("planItems");
    box.innerHTML = "";

    s.items.forEach((it, i) => {
      const card = document.createElement("div");
      card.className = "plan-item";
      card.innerHTML = `
        <div class="plan-order">${i + 1}</div>
        <div class="plan-body">
          <div class="plan-name">${it.title}</div>
          <div class="plan-label">${it.label}</div>
          <div class="plan-why">${it.why}</div>
          <div class="plan-src">${it.src}</div>
        </div>`;
      const go = document.createElement("button");
      go.className = "plan-go";
      go.textContent = "اقرأ 📖";
      go.addEventListener("click", () => {
        Plan.close();
        Mushaf.openSurah(it.ref.surah, it.ref.ayah);
      });
      card.querySelector(".plan-body").appendChild(go);
      box.appendChild(card);
    });

    $("planSheet").classList.remove("hidden");
  },

  close() { $("planSheet").classList.add("hidden"); },

  render() {
    const row = $("planSlots");
    if (!row) return;
    const cur = this.currentSlot();
    row.innerHTML = "";

    // الوقت الحالي أولاً ثم البقية بترتيبها
    const ordered = [...READING_PLAN].sort((a, b) =>
      (a.id === cur ? -1 : 0) - (b.id === cur ? -1 : 0));

    ordered.forEach(s => {
      const b = document.createElement("button");
      b.className = "plan-slot" + (s.id === cur ? " now" : "");
      b.innerHTML = `
        <span class="plan-slot-icon">${s.icon}</span>
        <span class="plan-slot-name">${s.slot}</span>
        <span class="plan-slot-count">${s.items.length}</span>`;
      b.addEventListener("click", () => Plan.open(s.id));
      row.appendChild(b);
    });

    const hint = $("planNow");
    if (hint) {
      const s = READING_PLAN.find(x => x.id === cur);
      hint.textContent = s ? `الآن: ${s.icon} ${s.slot}` : "";
    }
  }
};

/* ────────── شريط «تابع من حيث وقفت» في صفحة القرآن ────────── */
function renderResumeBar() {
  const bar = $("resumeBar");
  if (!bar) return;
  const last = Store.get("lastRead", null);
  if (!last || !last.surah) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  $("resumeText").innerHTML =
    `تابِع <b>${last.name}</b> — توقّفتَ عند الآية ${last.ayah || 1}`;
  bar.onclick = () => Mushaf.openSurah(last.surah, last.ayah || 1);
}

function init() {
  Favs.render();
  Plan.render();
  renderResumeBar();
  $("planClose").addEventListener("click", () => Plan.close());
  $("planSheet").addEventListener("click", e => {
    if (e.target.id === "planSheet") Plan.close();
  });
  // كل دقيقة قد يتغيّر الوقت الحالي فيتغيّر الورد المُبرَز
  setInterval(() => Plan.render(), 60000);
}

window.Favs = Favs;
window.Plan = Plan;
window.QuranExtras = { init, renderResumeBar };
})();
