/* ══════════════════════════════════════════════════════════
   Jordan Bikes — صفحة الحجز
   ══════════════════════════════════════════════════════════ */
(function () {
'use strict';

const J = window.JB, C = J.C;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const icon = (id, cls) => `<svg${cls ? ` class="${cls}"` : ""}><use href="#i-${id}"/></svg>`;

/* ── ألوان كل وقت ── */
const LOOK = {
  morning: { icon: "sunrise", ic: "#ffc36b", bg: "rgba(255,195,107,.13)",
    sky: "linear-gradient(180deg,#86b3e6 0%,#c9c6d9 45%,#f7c6a3 75%,#ffb084 100%)",
    orb: "radial-gradient(circle at 40% 40%,#fff8e6,#ffd37d)", glow: "rgba(255,206,120,.65)", y: "66%",
    h1: "#55617d", h2: "#2c3448", glowCard: "rgba(255,190,120,.4)" },
  asr: { icon: "sun", ic: "#ffb347", bg: "rgba(255,179,71,.13)",
    sky: "linear-gradient(180deg,#f9c24a 0%,#fb8f3c 55%,#ec5a24 100%)",
    orb: "radial-gradient(circle at 40% 40%,#fffbea,#ffe48f)", glow: "rgba(255,228,143,.75)", y: "40%",
    h1: "#a5431f", h2: "#5a2210", glowCard: "rgba(251,143,60,.45)" },
  maghrib: { icon: "sunset", ic: "#ff86b4", bg: "rgba(255,134,180,.12)",
    sky: "linear-gradient(180deg,#2f2563 0%,#8d3f86 45%,#e9606a 75%,#ff9561 100%)",
    orb: "radial-gradient(circle at 40% 40%,#ffe6c8,#ff9a62)", glow: "rgba(255,150,98,.6)", y: "80%",
    h1: "#3b1d47", h2: "#1d0f26", glowCard: "rgba(233,96,106,.45)" },
  night: { icon: "moon", ic: "#9db4ff", bg: "rgba(157,180,255,.12)",
    sky: "linear-gradient(180deg,#04060f 0%,#0b1330 60%,#18275a 100%)",
    orb: "radial-gradient(circle at 35% 35%,#ffffff,#e3e9ff 60%,#b8c4ef)", glow: "rgba(190,205,255,.35)", y: "34%",
    h1: "#141c38", h2: "#080b18", glowCard: "rgba(120,150,255,.35)" }
};
const periodIcon = id => `<span class="si-ic" style="--ic:${LOOK[id].ic};--ic-bg:${LOOK[id].bg}">${icon(LOOK[id].icon)}</span>`;

/* ── مولّد عشوائي ثابت حتى يبقى الرسم نفسه في كل مرة ── */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* نجمة سباعية — نجمة العلم الأردني */
function star(cx, cy, R, r) {
  let d = "";
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 7, k = i % 2 ? r : R;
    d += (i ? "L" : "M") + (cx + k * Math.cos(a)).toFixed(2) + " " + (cy + k * Math.sin(a)).toFixed(2);
  }
  return d + "Z";
}

/* أفق عمّان: تلال متكرّرة بلا فاصل، بيوت مكعّبة بشبابيك مضاءة، مئذنة، وسارية العلم */
function skyline(o) {
  const R = rng(o.seed), W = o.w, H = o.h, TAU = Math.PI * 2;
  const ph = [R() * TAU, R() * TAU, R() * TAU];
  const hill = x => o.base - o.amp * (0.55 * Math.sin(TAU * x / W + ph[0]) + 0.3 * Math.sin(TAU * 2 * x / W + ph[1]) + 0.15 * Math.sin(TAU * 4 * x / W + ph[2]));
  let d = "M0 " + H;
  for (let x = 0; x <= W; x += 10) d += " L" + x + " " + hill(x).toFixed(1);
  d += " L" + W + " " + H + " Z";
  let houses = "", wins = "";
  let x = 4;
  while (x < W - 4) {
    const bw = o.minW + R() * (o.maxW - o.minW);
    if (x + bw > W - 4) break;
    const top = Math.min(hill(x), hill(x + bw)) - (o.minH + R() * (o.maxH - o.minH));
    houses += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - top).toFixed(1)}"/>`;
    const cols = Math.max(1, Math.floor(bw / o.win)), rows = Math.max(1, Math.floor((Math.max(hill(x), hill(x + bw)) - top - 4) / (o.win * 1.3)));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (R() < o.lit) {
        const wx = x + (bw - cols * o.win) / 2 + c * o.win + o.win * .3, wy = top + 3 + r * o.win * 1.3;
        wins += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${(o.win * .42).toFixed(1)}" height="${(o.win * .55).toFixed(1)}" opacity="${(.35 + R() * .6).toFixed(2)}"/>`;
      }
    }
    x += bw + (R() < .3 ? R() * o.gap : 0.5);
  }
  let extra = "";
  if (o.mosque != null) {
    const mx = o.mosque, my = hill(mx) - 6;
    extra += `<path d="M${mx - 16} ${my} a16 16 0 0 1 32 0 Z"/><rect x="${mx - 18}" y="${my}" width="36" height="${H - my}"/>` +
      `<rect x="${mx + 24}" y="${my - 52}" width="6" height="${H - my + 52}"/><path d="M${mx + 23} ${my - 52} l4 -9 l4 9 Z"/><rect x="${mx + 22}" y="${my - 30}" width="10" height="3"/>`;
  }
  if (o.flag != null) {
    const fx = o.flag, fy = hill(fx) - 120;
    extra += `<rect x="${fx}" y="${fy}" width="2" height="${H - fy}"/>`;
    extra += `<g class="flag" opacity=".9"><rect x="${fx + 2}" y="${fy}" width="42" height="9" fill="#111"/><rect x="${fx + 2}" y="${fy + 9}" width="42" height="9" fill="#e9e9e9"/><rect x="${fx + 2}" y="${fy + 18}" width="42" height="9" fill="#0e7a3c"/><path d="M${fx + 2} ${fy} l20 13.5 l-20 13.5 Z" fill="#c8102e"/><path d="${star(fx + 8.5, fy + 13.5, 3.4, 1.45)}" fill="#fff"/></g>`;
  }
  const one = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><g fill="${o.color}"><path d="${d}"/>${houses}${extra}</g><g fill="${o.light}">${wins}</g></svg>`;
  return one + one;
}

/* تلال صغيرة لبطاقات الأوقات */
function hills(c1, c2, lit) {
  const R = rng(lit ? 7 : 3);
  let wins = "", houses = "";
  for (let x = 10; x < 290; x += 16 + R() * 14) {
    const h = 10 + R() * 18, y = 62 - h + Math.sin(x / 40) * 6;
    houses += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(10 + R() * 8).toFixed(0)}" height="${(100 - y).toFixed(0)}"/>`;
    if (lit && R() < .7) wins += `<rect x="${(x + 3).toFixed(0)}" y="${(y + 4).toFixed(0)}" width="2.4" height="3" />`;
  }
  return `<svg class="hills" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 55 C60 30 110 50 160 38 S250 20 300 40 V100 H0Z" fill="${c1}" opacity=".85"/>
    <g fill="${c2}">${houses}<path d="M0 78 C70 60 130 76 190 66 S270 58 300 70 V100 H0Z"/></g>
    ${lit ? `<g fill="#ffd27a" opacity=".85">${wins}</g>` : ""}</svg>`;
}

/* مسار رمزي لكل منطقة */
const ROUTE_PATHS = {
  khamis:  { d: "M18 142 C36 126 54 108 72 92 A28 28 0 1 1 112 58 C130 46 146 34 164 22", s: [18, 142], e: [164, 22] },
  abdoun:  { d: "M16 132 C48 134 40 92 74 92 S108 122 130 96 S136 42 166 34", s: [16, 132], e: [166, 34] },
  dabouq:  { d: "M14 140 L42 112 L58 122 L86 84 L102 96 L130 54 L146 62 L166 30", s: [14, 140], e: [166, 30] },
  weibdeh: { d: "M18 138 H58 V112 H92 V86 H116 V60 H140 V36 H166", s: [18, 138], e: [166, 36] }
};
function routeMap(id) {
  let grid = "";
  for (let i = -300; i < 480; i += 20) grid += `<line class="rgrid" x1="${i}" y1="-100" x2="${i}" y2="260"/>`;
  for (let i = -100; i < 260; i += 20) grid += `<line class="rgrid" x1="-300" y1="${i}" x2="480" y2="${i}"/>`;
  const R = ROUTE_PATHS[id] || ROUTE_PATHS.abdoun, d = R.d;
  const [sx, sy] = R.s, [endX, endY] = R.e;
  return `<svg viewBox="0 0 180 160" preserveAspectRatio="xMidYMid meet" overflow="visible" aria-hidden="true">${grid}
    ${id === "khamis" ? `<circle cx="92" cy="72" r="28" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10"/>` : ""}
    <path class="rbase" d="${d}"/><path class="rpath" d="${d}" pathLength="1"/>
    <circle class="rstart" cx="${sx}" cy="${sy}" r="5"/><circle class="rend" cx="${endX}" cy="${endY}" r="6"/>
    <circle cx="${endX}" cy="${endY}" r="12" fill="none" stroke="var(--br)" stroke-opacity=".35"/></svg>`;
}

/* ══ التوافر (فقط إن كان جدول Google مربوطاً) ══ */
let avail = null;
async function loadAvailability() {
  if (!J.api.enabled) return;
  const n = J.now();
  try {
    const r = await J.api.get({ action: "availability", from: n.date, to: J.addDays(n.date, C.booking.daysAhead) });
    if (r && r.ok) { avail = r; renderSchedule(); if (sheetOpen) { renderSlots(); } }
  } catch (e) { /* يكمل الموقع بدون عدّ المقاعد */ }
}
function seatsLeft(date, periodId) {
  if (!avail) return null;
  const used = (avail.counts || {})[date + "|" + periodId] || 0;
  return Math.max(0, (avail.capacity || C.booking.capacity) - used);
}
/* حالة الموعد مع حساب المقاعد */
function slotInfo(date, periodId, type) {
  const st = J.slotState(date, periodId, type);
  if (st !== "open") return { st, label: st === "past" ? "انتهى الحجز" : st === "closed" ? "إجازة" : "لا توجد جولة", cls: "off" };
  if (type === "training") return { st, label: "متاح", cls: "" };
  const left = seatsLeft(date, periodId);
  if (left === null) return { st, label: "متاح", cls: "" };
  if (left <= 0) return { st: "full", label: "مكتمل", cls: "full", left };
  if (left <= 6) return { st, label: "باقي " + left + (left <= 10 && left > 2 ? " مقاعد" : " مقعد"), cls: "few", left };
  return { st, label: "متاح", cls: "", left };
}

/* ══ الصفحة ══ */
const WA_TEXT = {
  question: "مرحباً Jordan Bikes 👋 عندي سؤال عن الجولات:",
  rental: "مرحباً Jordan Bikes 👋 بدي أستفسر عن تأجير دراجة:",
  repair: "مرحباً Jordan Bikes 👋 بدي أحجز موعد صيانة لدراجتي:"
};

function bindStatic() {
  $$("[data-tel]").forEach(a => a.href = "tel:" + C.contact.phone);
  $$("[data-phone-text]").forEach(e => e.textContent = J.fmtPhone(C.contact.phone));
  $$("[data-wa]").forEach(a => a.href = J.waLink(WA_TEXT[a.dataset.wa] || WA_TEXT.question));
  $$("[data-link]").forEach(a => { const u = C.contact[a.dataset.link]; if (u) a.href = u; else (a.closest("li") || a).remove(); });
  $$("[data-followers]").forEach(e => e.textContent = C.contact.followers);
  $$("[data-price-tour]").forEach(e => e.textContent = C.pricing.tour);
  $$("[data-year]").forEach(e => e.textContent = new Date().getFullYear());
  $$("[data-payment]").forEach(e => e.textContent = C.booking.payment);
  $$("[data-meeting]").forEach(e => e.textContent = C.booking.meetingNote);
  $$('[data-bike="mark"]').forEach(e => e.innerHTML = J.bikeSVG({ weight: 1.5 }));
  $$('[data-bike="hero"]').forEach(e => e.innerHTML = J.bikeSVG({ spokes: true, mirror: true, weight: 1.05 }));
  const extra = C.pricing.bikeExtra;
  $$("[data-bike-extra]").forEach(e => e.textContent = extra ? "+" + J.money(extra) + " للشخص" : "جاهزة لك");
}

function renderHeroScene() {
  const stars = $("#stars");
  if (stars) {
    const R = rng(11);
    let s = "";
    for (let i = 0; i < 60; i++) s += `<i style="top:${(R() * 70).toFixed(1)}%;left:${(R() * 100).toFixed(1)}%;--d:${(2 + R() * 4).toFixed(1)}s;--dl:${(R() * 4).toFixed(1)}s;${R() < .2 ? "width:3px;height:3px;" : ""}"></i>`;
    stars.innerHTML = s;
  }
  const far = $("#layerFar"), near = $("#layerNear");
  if (far) far.innerHTML = skyline({ seed: 4, w: 600, h: 330, base: 210, amp: 34, minW: 12, maxW: 26, minH: 10, maxH: 40, win: 6, lit: .32, gap: 10, color: "#2a1f45", light: "#ffcf86", flag: 410 });
  if (near) near.innerHTML = skyline({ seed: 9, w: 600, h: 250, base: 150, amp: 26, minW: 18, maxW: 36, minH: 14, maxH: 46, win: 8, lit: .4, gap: 14, color: "#0d0a16", light: "#ffbe6b", mosque: 150 });
}

function renderMarquee() {
  const items = [...Object.values(C.locations).map(l => l.name), "جولات صباحية", "جولات المغرب", "جولات ليلية", "تدريب على الركوب", "تأجير دراجات", "صيانة"];
  const one = items.map(t => `<span>${J.esc(t)}</span>`).join("");
  const m = $("#marquee");
  if (m) m.innerHTML = one + one;
}

function renderPeriods() {
  const box = $("#periods");
  if (!box) return;
  box.innerHTML = C.periods.map((p, i) => {
    const L = LOOK[p.id];
    let starDots = "";
    if (p.id === "night") { const R = rng(5); for (let k = 0; k < 18; k++) starDots += `<i style="position:absolute;top:${(R() * 55).toFixed(0)}%;left:${(R() * 100).toFixed(0)}%;width:2px;height:2px;border-radius:50%;background:#fff;opacity:${(.3 + R() * .6).toFixed(2)}"></i>`; }
    return `<button class="period reveal" style="--rd:${i * .07}s;--sky:${L.sky};--orb:${L.orb};--orb-glow:${L.glow};--orb-y:${L.y};--glow:${L.glowCard}" data-book-period="${p.id}">
      <div class="period-sky">${starDots}<span class="orb"></span>${hills(L.h1, L.h2, p.id === "maghrib" || p.id === "night")}<span class="ptime">${J.fmtTime(p.start)}</span></div>
      <div class="period-body">
        <h3>${J.esc(p.name)}</h3>
        <div class="ptimes">${J.fmtRange(p)}</div>
        <p>${J.esc(p.mood)}</p>
        <div class="period-foot">
          <span class="price">${C.pricing.tour}<small>${C.pricing.currency} / للشخص</small></span>
          <span class="go-circle">${icon("arrow")}</span>
        </div>
      </div>
    </button>`;
  }).join("");
}

function renderRoutes() {
  const box = $("#routesList");
  if (!box) return;
  const order = [0, 1, 2, 3, 4, 5, 6];
  box.innerHTML = Object.entries(C.locations).map(([id, L], i) => {
    const chips = order.map(d => {
      const ps = C.periods.filter(p => (C.schedule[d] || {})[p.id] === id);
      if (!ps.length) return "";
      const when = ps.length === C.periods.length ? "كل الجولات" : ps.map(p => p.short).join("، ");
      return `<span><b>${J.DAYS[d]}</b> · ${when}</span>`;
    }).join("");
    return `<button class="route reveal" style="--rd:${(i % 2) * .08}s" data-book-loc="${id}">
      <div class="route-info">
        <span class="route-en">${J.esc(L.en || "")}</span>
        <h3>${J.esc(L.name)}</h3>
        <p>${J.esc(L.desc || "")}</p>
        <div class="route-days">${chips || "<span>حسب الجدول</span>"}</div>
        <span class="route-cta">احجز جولة في ${J.esc(L.name)} ${icon("arrow")}</span>
      </div>
      <div class="route-map">${routeMap(id)}</div>
    </button>`;
  }).join("");
}

/* الجدول: الأيام السبعة القادمة بتواريخها الحقيقية */
let schedDate = null;
function renderSchedule() {
  const days = $("#days"), list = $("#schedList");
  if (!days || !list) return;
  const n = J.now();
  if (!schedDate) {
    schedDate = n.date;
    if (C.periods.every(p => J.slotState(n.date, p.id, "tour", n) !== "open")) schedDate = J.addDays(n.date, 1);
  }
  let html = "";
  for (let i = 0; i < 7; i++) {
    const d = J.addDays(n.date, i);
    const name = i === 0 ? "اليوم" : i === 1 ? "بكرا" : J.DAYS[J.dow(d)];
    const sub = i < 2 ? J.DAYS[J.dow(d)] + " · " + J.dateShort(d) : J.dateShort(d);
    html += `<button class="day${d === schedDate ? " on" : ""}" role="tab" aria-selected="${d === schedDate}" data-sday="${d}"><b>${name}</b><small>${sub}</small></button>`;
  }
  days.innerHTML = html;
  list.innerHTML = C.periods.map(p => {
    const locId = J.locationFor(schedDate, p.id), L = J.locById(locId);
    if (!L) return "";
    const info = slotInfo(schedDate, p.id, "tour");
    const off = info.st !== "open";
    return `<button class="sched-item" ${off ? "disabled" : ""} data-book-slot="${schedDate}|${p.id}">
      <div class="si-top">${periodIcon(p.id)}<span class="si-state ${info.cls}">${info.label}</span></div>
      <h4>${J.esc(p.name)}</h4>
      <div class="si-time">${J.fmtRange(p)}</div>
      <div class="si-loc">${icon("pin")} ${J.esc(L.name)}</div>
      <div class="si-book"><span>${off ? "غير متاح" : "احجز هذه الجولة"}</span>${icon("arrow")}</div>
    </button>`;
  }).join("") || `<div class="empty-note">لا توجد جولات بهذا اليوم.</div>`;
}

function renderFaq() {
  const box = $("#faqList");
  if (!box) return;
  box.innerHTML = C.faq.map((f, i) => `<details class="faq-item reveal" style="--rd:${i * .05}s"${i === 0 ? " open" : ""}><summary>${J.esc(f.q)}<i aria-hidden="true"></i></summary><div class="faq-a">${J.esc(f.a)}</div></details>`).join("");
}

function renderSocial() {
  const box = $("#socialLinks");
  if (!box) return;
  const c = C.contact;
  const items = [
    c.instagram && { href: c.instagram, ic: "ig", t: "إنستغرام", s: c.instagramHandle },
    { href: J.waLink(WA_TEXT.question), ic: "wa", t: "واتساب", s: J.fmtPhone(c.phone) },
    { href: "tel:" + c.phone, ic: "phone", t: "اتصل بنا", s: J.fmtPhone(c.phone), self: true },
    c.threads && { href: c.threads, ic: "threads", t: "ثريدز", s: c.instagramHandle },
    c.facebook && { href: c.facebook, ic: "fb", t: "فيسبوك", s: "Jordan bikes" },
    c.maps && { href: c.maps, ic: "map", t: "موقعنا", s: "Google Maps" }
  ].filter(Boolean);
  box.innerHTML = items.map(x => `<a class="social-link" href="${J.esc(x.href)}"${x.self ? "" : ' target="_blank" rel="noopener"'}><span class="sl-ic">${icon(x.ic)}</span><span><b>${x.t}</b><small>${J.esc(x.s)}</small></span>${icon("arrow", "sl-arrow")}</a>`).join("");
}

/* الجولة القادمة — تتحدّث كل نصف دقيقة */
function renderNextRide() {
  const card = $("#nextRide");
  const [nx] = J.nextSlots(1, "tour");
  const ctaText = $("[data-cta-next]");
  if (!nx) { if (card) card.hidden = true; return; }
  const p = J.periodById(nx.period), L = J.locById(nx.location), n = J.now();
  const mins = J.minutesUntil(nx.date, nx.period, n);
  let count;
  if (mins < 60) count = "تبدأ بعد " + mins + " دقيقة";
  else if (mins < 24 * 60) { const h = Math.floor(mins / 60), m = mins % 60; count = "تبدأ بعد " + h + " س" + (m ? " و " + m + " د" : ""); }
  else count = J.relDay(nx.date, n.date) + " " + J.fmtTime(p.start);
  if (card) {
    card.hidden = false;
    card.dataset.slot = nx.date + "|" + nx.period;
    $("[data-nr-day]", card).textContent = J.relDay(nx.date, n.date) + " · " + J.dateShort(nx.date);
    $("[data-nr-title]", card).textContent = p.name;
    $("[data-nr-time]", card).innerHTML = icon("clock") + " " + J.fmtRange(p);
    $("[data-nr-loc]", card).innerHTML = L ? icon("pin") + " " + J.esc(L.name) : "";
    $("[data-nr-count]", card).textContent = count;
  }
  if (ctaText) ctaText.textContent = "أقرب جولة: " + p.name + " " + J.relDay(nx.date, n.date) + " الساعة " + J.fmtTime(p.start) + (L ? " في " + L.name : "") + ".";
}

/* ══ نافذة الحجز ══ */
const sheet = $("#sheet");
let sheetOpen = false;
const S = {
  step: 1, type: "tour", date: null, period: null,
  riders: 1, bike: "rent", level: "intermediate",
  name: "", phone: "", notes: "", agree: false, busy: false, result: null
};

function pickDefaults(pre) {
  pre = pre || {};
  S.type = pre.type || "tour";
  S.date = null; S.period = null;
  const n = J.now();
  const open = (d, p) => slotInfo(d, p, S.type).st === "open";
  if (pre.date && pre.period && open(pre.date, pre.period)) { S.date = pre.date; S.period = pre.period; return; }
  for (let i = 0; i <= C.booking.daysAhead; i++) {
    const d = J.addDays(n.date, i);
    for (const p of C.periods) {
      if (pre.period && p.id !== pre.period) continue;
      if (pre.location && J.locationFor(d, p.id) !== pre.location) continue;
      if (open(d, p.id)) { S.date = d; S.period = p.id; return; }
    }
  }
  /* لم نجد ما يطابق — أول يوم فيه أي جولة متاحة */
  for (let i = 0; i <= C.booking.daysAhead; i++) {
    const d = J.addDays(n.date, i);
    if (C.periods.some(p => open(d, p.id))) { S.date = d; return; }
  }
}

function openSheet(pre) {
  pre = pre || {};
  const prof = J.store.get("profile", {});
  S.name = S.name || prof.name || "";
  S.phone = S.phone || prof.phone || "";
  S.step = 1; S.agree = false; S.result = null; S.busy = false;
  if (pre.type === "training") S.level = "beginner";
  pickDefaults(pre);
  $("#fName").value = S.name; $("#fPhone").value = S.phone; $("#fNotes").value = S.notes;
  $("#fAgree").checked = false;
  renderSheet();
  sheet.classList.add("open");
  sheet.setAttribute("aria-hidden", "false");
  document.body.classList.add("lock");
  sheetOpen = true;
  if (location.hash !== "#book") history.pushState({ jbSheet: 1 }, "", "#book");
  loadAvailability();
  setTimeout(() => { const on = $(".date.on", sheet); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); }, 60);
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheet.classList.remove("open");
  sheet.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lock");
  sheetOpen = false;
  if (!fromPop && location.hash === "#book") {
    if (history.state && history.state.jbSheet) history.back();
    else history.replaceState(null, "", location.pathname + location.search);
  }
  if (S.step === 4) S.notes = "";
  renderNextRide(); renderSchedule(); updateMyCount();
}

function renderSheet() {
  $$(".step", sheet).forEach(s => s.classList.toggle("on", +s.dataset.step === S.step));
  $$(".pstep", sheet).forEach(p => {
    const k = +p.dataset.p;
    p.classList.toggle("on", k === S.step);
    p.classList.toggle("done", k < S.step);
  });
  $("#progress").style.visibility = S.step === 4 ? "hidden" : "";
  $$("#typeSeg button").forEach(b => b.classList.toggle("on", b.dataset.type === S.type));
  $("#sheetTitle").textContent = S.step === 4 ? "تمّ الحجز" : S.type === "training" ? "اطلب حصة تدريب" : "احجز جولتك";
  if (S.step === 1) { renderDates(); renderSlots(); }
  if (S.step === 2) renderDetails();
  if (S.step === 3) renderReview();
  renderSummary();
  renderFoot();
  $("#sheetMain").scrollTop = 0;
}

function renderDates() {
  const n = J.now();
  let html = "", months = new Set();
  for (let i = 0; i < C.booking.daysAhead; i++) {
    const d = J.addDays(n.date, i), P = J.parse(d);
    const any = C.periods.some(p => slotInfo(d, p.id, S.type).st === "open");
    months.add(J.MONTHS[P.m - 1]);
    html += `<button class="date${d === S.date ? " on" : ""}" data-date="${d}" ${any ? "" : "disabled"}><small>${J.relDay(d, n.date)}</small><b>${P.d}</b><em>${J.MONTHS[P.m - 1]}</em></button>`;
  }
  $("#dates").innerHTML = html;
  $("[data-month-label]").textContent = [...months].join(" – ");
}

function renderSlots() {
  const box = $("#slots");
  const hint = $("[data-slots-hint]");
  if (!S.date) { box.innerHTML = `<div class="empty-note">اختار يوم أولاً</div>`; return; }
  hint.textContent = S.type === "training" ? "الوقت المفضّل — بنثبّته معك" : J.dateLong(S.date);
  box.innerHTML = C.periods.map(p => {
    const locId = J.locationFor(S.date, p.id), L = J.locById(locId);
    if (S.type === "tour" && !L) return "";
    const info = slotInfo(S.date, p.id, S.type);
    const off = info.st !== "open";
    const where = S.type === "training" ? "المكان بالاتفاق" : L.name;
    const pr = J.price(S.type, 1, S.bike);
    return `<button class="slot${S.period === p.id ? " on" : ""}" data-period="${p.id}" ${off ? "disabled" : ""}>
      ${periodIcon(p.id)}
      <b>${J.esc(p.name)}</b>
      <span class="sl-time">${J.fmtRange(p)}</span>
      <span class="sl-meta"><span class="loc">${icon("pin")} ${J.esc(where)}</span><span>${pr.known ? J.money(pr.unit) : "السعر بالاتفاق"}</span><span class="seats ${info.cls}">${info.label}</span></span>
    </button>`;
  }).join("") || `<div class="empty-note">لا توجد جولات بهذا اليوم.</div>`;
}

function renderDetails() {
  const max = maxRiders();
  if (S.riders > max) S.riders = Math.max(1, max);
  $("#ridersOut").innerHTML = S.riders + `<small>${S.riders === 1 ? "شخص" : S.riders <= 10 ? "أشخاص" : "شخص"}</small>`;
  $('[data-riders="-1"]').disabled = S.riders <= 1;
  $('[data-riders="+1"]').disabled = S.riders >= max;
  $$("#bikeChoices .choice").forEach(b => b.classList.toggle("on", b.dataset.bikeOpt === S.bike));
  $$("#levelChoices .choice").forEach(b => b.classList.toggle("on", b.dataset.level === S.level));
}
function maxRiders() {
  let max = C.booking.maxRiders;
  if (S.type === "tour" && S.date && S.period) {
    const left = seatsLeft(S.date, S.period);
    if (left !== null) max = Math.min(max, left);
  }
  return Math.max(1, max);
}

function draft() {
  const p = J.periodById(S.period), pr = J.price(S.type, S.riders, S.bike);
  return {
    type: S.type, date: S.date, period: S.period,
    location: S.type === "training" ? null : J.locationFor(S.date, S.period),
    time: p ? J.fmtRange(p) : "", riders: S.riders, bike: S.bike, level: S.level,
    name: S.name.trim(), phone: J.normPhone(S.phone), notes: S.notes.trim(),
    total: pr.known ? pr.total : null
  };
}

function ticketHTML(b, opts) {
  opts = opts || {};
  const p = J.periodById(b.period), L = J.locById(b.location);
  const status = b.status ? `<span class="status-chip st-${b.status}">${J.STATUS[b.status] || b.status}</span>` : "";
  return `<div class="tk-head">
      <span class="logo-mark">${J.bikeSVG({ weight: 1.5 })}</span>
      <div><b>${J.esc(p.name)}</b><small>${J.TYPES[b.type]}</small></div>
      ${b.id ? `<div class="tk-code"><span>رقم الحجز</span><b>${J.esc(b.id)}</b>${status}</div>` : ""}
    </div>
    <div class="tk-cut"><i></i></div>
    <div class="tk-rows">
      <div><span>اليوم</span><b>${J.dateLong(b.date)}</b></div>
      <div><span>الوقت</span><b>${J.fmtRange(p)}</b></div>
      <div><span>المكان</span><b>${L ? J.esc(L.name) : "بالاتفاق"}</b></div>
      <div><span>عدد الأشخاص</span><b>${b.riders}</b></div>
      <div><span>الدراجة</span><b>${b.bike === "rent" ? "من Jordan Bikes" : "دراجتي الخاصة"}</b></div>
      <div><span>المستوى</span><b>${J.LEVELS[b.level]}</b></div>
      ${opts.person ? `<div><span>الاسم</span><b>${J.esc(b.name)}</b></div><div><span>الموبايل</span><b class="ltr">${J.esc(J.fmtPhone(b.phone))}</b></div>` : ""}
      ${opts.person && b.notes ? `<div class="full"><span>ملاحظات</span><b style="font-family:var(--f-b);font-size:14.5px">${J.esc(b.notes)}</b></div>` : ""}
    </div>
    <div class="tk-total"><span>المجموع${b.total != null ? ` · ${b.riders} × ${J.money(b.total / b.riders)}` : ""}</span><b>${b.total != null ? J.money(b.total) : "بالاتفاق"}</b></div>`;
}

function renderReview() { $("#reviewTicket").innerHTML = ticketHTML(draft(), { person: true }); }

function renderSummary() {
  const box = $("#summary");
  if (S.step === 4) { box.innerHTML = summaryTrust(); return; }
  const d = S.date ? draft() : null;
  const p = S.period && J.periodById(S.period), L = d && J.locById(d.location);
  const row = (ic, label, val) => `<div class="sum-row"><span class="sr-ic">${icon(ic)}</span><div><span>${label}</span>${val ? `<b>${val}</b>` : `<b class="muted">—</b>`}</div></div>`;
  const pr = J.price(S.type, S.riders, S.bike);
  box.innerHTML = `<div class="sum-title">ملخّص الحجز</div><div class="sum-list">
      ${row(S.type === "training" ? "learn" : "users", "نوع الحجز", J.TYPES[S.type])}
      ${row("cal", "اليوم", S.date ? J.dateLong(S.date) : "")}
      ${row("clock", "الوقت", p ? p.name + " · " + J.fmtRange(p) : "")}
      ${row("pin", "المكان", S.type === "training" ? (p ? "بالاتفاق" : "") : (L ? J.esc(L.name) : ""))}
      ${row("bike", "الأشخاص والدراجة", S.step > 1 ? S.riders + " · " + (S.bike === "rent" ? "دراجة من عنّا" : "دراجتي") : "")}
    </div>
    <div class="sum-total"><span>المجموع</span><b>${pr.known ? J.money(pr.total) : "بالاتفاق"}</b></div>
    ${summaryTrust()}`;
}
function summaryTrust() {
  return `<div class="sum-trust">
    <div>${icon("bolt")} رقم حجز فوري وتأكيد على واتساب</div>
    <div>${icon("cash")} ${J.esc(C.booking.payment)}</div>
    <div>${icon("shield")} تعديل أو إلغاء برسالة واتساب</div>
  </div>`;
}

function renderFoot() {
  const foot = $("#sheetFoot"), next = $("#btnNext"), back = $("#btnBack");
  foot.style.display = S.step === 4 ? "none" : "";
  back.style.visibility = S.step === 1 ? "hidden" : "";
  const pr = J.price(S.type, S.riders, S.bike);
  $("#footTotal").textContent = pr.known ? J.money(pr.total) : "بالاتفاق";
  if (S.busy) { next.innerHTML = `<span class="spinner"></span> جاري الحجز…`; next.disabled = true; return; }
  next.disabled = false;
  next.innerHTML = (S.step === 1 ? "التالي" : S.step === 2 ? "مراجعة الحجز" : "تأكيد الحجز") + ` ${icon("arrow", "arrow")}`;
}

function setErr(id, msg) {
  const e = $("#" + id);
  if (!e) return;
  e.textContent = msg || "";
  e.classList.toggle("show", !!msg);
}

function validateStep() {
  if (S.step === 1) {
    if (!S.date || !S.period) { setErr("err1", "اختار اليوم والوقت المناسبين."); return false; }
    if (slotInfo(S.date, S.period, S.type).st !== "open") { setErr("err1", "هذا الموعد لم يعد متاحاً، اختار موعداً آخر."); return false; }
    setErr("err1"); return true;
  }
  if (S.step === 2) {
    let ok = true;
    const name = S.name.trim();
    if (name.length < 2 || !/[\p{L}]{2,}/u.test(name)) { setErr("errName", "اكتب اسمك من فضلك."); $("#fName").classList.add("err"); ok = false; }
    else { setErr("errName"); $("#fName").classList.remove("err"); }
    if (!J.validPhone(S.phone)) { setErr("errPhone", "رقم الموبايل غير صحيح — مثال: 0791234567"); $("#fPhone").classList.add("err"); ok = false; }
    else { setErr("errPhone"); $("#fPhone").classList.remove("err"); }
    if (!ok) { const f = $(".input.err", sheet); if (f) f.focus(); }
    return ok;
  }
  if (S.step === 3) {
    if (!$("#fAgree").checked) { setErr("err3", "أكّد الموافقة لإتمام الحجز."); $("#agreeWrap").classList.add("err"); return false; }
    setErr("err3"); $("#agreeWrap").classList.remove("err"); return true;
  }
  return true;
}

async function next() {
  if (S.busy || !validateStep()) return;
  if (S.step === 2) J.store.set("profile", { name: S.name.trim(), phone: J.normPhone(S.phone) });
  if (S.step < 3) { S.step++; renderSheet(); return; }
  await submit();
}
function back() { if (S.step > 1 && S.step < 4) { S.step--; renderSheet(); } }

async function submit() {
  const b = Object.assign(draft(), { id: J.genId(), createdAt: new Date().toISOString(), status: "pending", synced: false });
  if ($("#fWebsite").value) return; /* حقل فخّ للبرامج الآلية */
  S.busy = true; renderFoot();
  let failed = false;
  if (J.api.enabled) {
    try {
      const r = await J.api.post({ action: "create", booking: b });
      if (r && r.ok && r.booking) {
        b.id = r.booking.id || b.id;
        b.status = r.booking.status || "pending";
        b.synced = true;
        b.duplicate = !!r.duplicate;
      } else if (r && r.error === "full") {
        S.busy = false;
        if (avail) avail.counts[b.date + "|" + b.period] = (avail.capacity || C.booking.capacity) - (r.left || 0);
        S.step = 1; renderSheet();
        setErr("err1", r.left ? "باقي " + r.left + " مقاعد فقط بهذه الجولة — قلّل العدد أو اختار موعداً آخر." : "للأسف اكتملت هذه الجولة، اختار موعداً آخر.");
        loadAvailability();
        return;
      } else { failed = true; }
    } catch (e) { failed = true; }
  }
  S.busy = false;
  saveLocal(b);
  S.result = b; S.failed = failed;
  S.step = 4; renderSheet(); renderSuccess();
  loadAvailability();
}

function renderSuccess() {
  const b = S.result;
  const wa = J.waLink(J.bookingText(b));
  const synced = b.synced;
  $("#successBox").innerHTML = `
    <div class="success-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <h3>${synced ? (b.duplicate ? "حجزك موجود عندنا 👌" : "تم استلام حجزك! 🎉") : "خطوة أخيرة لتثبيت الحجز"}</h3>
    <p>${synced
      ? "رقم حجزك <b class=\"ltr\">" + J.esc(b.id) + "</b>. فريق Jordan Bikes بيتواصل معك على واتساب لتأكيد الموعد وإرسال نقطة التجمّع."
      : (S.failed ? "ما قدرنا نوصل للنظام هلأ، بس ولا يهمّك: " : "") + "اضغط الزر الأخضر وابعث تفاصيل الحجز لنا على واتساب — الرسالة جاهزة، بس اضغط إرسال."}</p>
    <div class="ticket">${ticketHTML(b, { person: true })}</div>
    <div class="success-actions">
      <a class="btn ${synced ? "btn-ghost" : "btn-wa"} btn-lg btn-block" href="${wa}" target="_blank" rel="noopener">${icon("wa")} ${synced ? "أرسل التفاصيل على واتساب" : "أرسل الحجز على واتساب"}</a>
      <div class="row">
        <button class="btn btn-ghost" data-ics="${J.esc(b.id)}">${icon("cal-plus")} أضف للتقويم</button>
        <button class="btn btn-ghost" data-new-booking>${icon("ticket")} حجز جديد</button>
      </div>
      <button class="btn btn-primary btn-block" data-close-sheet>تمام، شكراً</button>
    </div>`;
}

/* ══ حجوزاتي ══ */
const myList = () => J.store.get("bookings", []);
function saveLocal(b) {
  const list = myList().filter(x => x.id !== b.id);
  list.unshift(b);
  J.store.set("bookings", list.slice(0, 50));
  updateMyCount();
}
const isUpcoming = b => J.minutesUntil(b.date, b.period) > -90 && b.status !== "cancelled";
function updateMyCount() {
  const n = myList().filter(isUpcoming).length;
  $$("[data-mb-count]").forEach(e => { e.textContent = n; e.hidden = !n; });
}
const drawer = $("#drawer");
function openDrawer() {
  renderDrawer();
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("lock");
  refreshStatuses();
}
function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  if (!sheetOpen) document.body.classList.remove("lock");
}
function renderDrawer() {
  const list = myList().slice().sort((a, b) => {
    const ua = isUpcoming(a), ub = isUpcoming(b);
    if (ua !== ub) return ua ? -1 : 1;
    const ka = a.date + J.periodById(a.period).start, kb = b.date + J.periodById(b.period).start;
    return ua ? (ka < kb ? -1 : 1) : (ka > kb ? -1 : 1);
  });
  const body = $("#drawerBody");
  if (!list.length) {
    body.innerHTML = `<div class="mb-empty">${J.bikeSVG({ weight: 1.2 })}<p>ما عندك حجوزات لسّا.<br>أول جولة دايماً الأحلى!</p><button class="btn btn-primary" data-book>احجز أول جولة ${icon("arrow", "arrow")}</button></div>`;
    return;
  }
  body.innerHTML = list.map(b => {
    const p = J.periodById(b.period), L = J.locById(b.location);
    const up = isUpcoming(b);
    const wa = J.waLink(J.bookingText(b, "مرحباً Jordan Bikes 👋 بخصوص حجزي رقم " + b.id + ":"));
    return `<div class="mb-card${up ? "" : " past"}">
      <div class="mb-top"><b>${J.esc(b.id)}</b><span class="status-chip st-${b.status}">${J.STATUS[b.status] || ""}</span></div>
      <h4>${J.esc(p.name)}${L ? " · " + J.esc(L.name) : ""}</h4>
      <div class="mb-meta"><span>${J.relDay(b.date)} ${J.dateShort(b.date)}</span><span>${J.fmtRange(p)}</span><span>${b.riders} ${b.riders === 1 ? "شخص" : "أشخاص"}</span></div>
      ${up ? `<div class="mb-actions"><button class="btn btn-ghost" data-ics="${J.esc(b.id)}">${icon("cal-plus")} للتقويم</button><a class="btn btn-ghost" href="${wa}" target="_blank" rel="noopener">${icon("wa")} تعديل / إلغاء</a></div>` : ""}
    </div>`;
  }).join("") + `<p style="color:var(--tx-3);font-size:13px;text-align:center;margin-top:8px">الحجوزات محفوظة على هذا الجهاز.</p>`;
}
async function refreshStatuses() {
  if (!J.api.enabled) return;
  const list = myList(), groups = {};
  list.filter(b => b.synced && isUpcoming(b)).forEach(b => (groups[b.phone] = groups[b.phone] || []).push(b.id));
  let changed = false;
  for (const [phone, ids] of Object.entries(groups)) {
    try {
      const r = await J.api.get({ action: "status", phone, ids: ids.join(",") });
      if (r && r.ok && r.statuses) list.forEach(b => { if (r.statuses[b.id] && r.statuses[b.id] !== b.status) { b.status = r.statuses[b.id]; changed = true; } });
    } catch (e) {}
  }
  if (changed) { J.store.set("bookings", list); updateMyCount(); if (drawer.classList.contains("open")) renderDrawer(); }
}

/* ══ إشعار ══ */
let toastT;
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200);
}

/* ══ الأحداث ══ */
function bindEvents() {
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-book],[data-book-period],[data-book-loc],[data-book-slot],#nextRide,[data-open-mybookings],[data-close-sheet],[data-close-drawer],[data-ics],[data-new-booking],[data-sday],[data-date],[data-period],[data-type],[data-riders],[data-bike-opt],[data-level]");
    if (!t) return;
    if (t.matches("[data-book]")) { e.preventDefault(); closeDrawer(); closeMenu(); openSheet({ type: t.dataset.book === "training" ? "training" : "tour" }); return; }
    if (t.matches("[data-book-period]")) { openSheet({ period: t.dataset.bookPeriod }); return; }
    if (t.matches("[data-book-loc]")) { openSheet({ location: t.dataset.bookLoc }); return; }
    if (t.matches("[data-book-slot]") || t.id === "nextRide") { const [date, period] = (t.dataset.bookSlot || t.dataset.slot).split("|"); openSheet({ date, period }); return; }
    if (t.matches("[data-open-mybookings]")) { e.preventDefault(); closeMenu(); openDrawer(); return; }
    if (t.matches("[data-close-sheet]")) { closeSheet(); return; }
    if (t.matches("[data-close-drawer]")) { closeDrawer(); return; }
    if (t.matches("[data-ics]")) { const b = myList().find(x => x.id === t.dataset.ics) || S.result; if (b) { J.download(b.id + ".ics", J.icsFor(b), "text/calendar;charset=utf-8"); toast("تم تنزيل موعد الجولة — افتحه لإضافته للتقويم"); } return; }
    if (t.matches("[data-new-booking]")) { S.notes = ""; $("#fNotes").value = ""; openSheet({}); return; }
    if (t.matches("[data-sday]")) { schedDate = t.dataset.sday; renderSchedule(); return; }
    if (!sheetOpen) return;
    if (t.matches("[data-date]")) { S.date = t.dataset.date; if (!S.period || slotInfo(S.date, S.period, S.type).st !== "open") { const f = C.periods.find(p => slotInfo(S.date, p.id, S.type).st === "open"); S.period = f ? f.id : null; } setErr("err1"); renderDates(); renderSlots(); renderSummary(); renderFoot(); return; }
    if (t.matches("[data-period]")) { S.period = t.dataset.period; setErr("err1"); renderSlots(); renderSummary(); renderFoot(); return; }
    if (t.matches("[data-type]")) { S.type = t.dataset.type; if (S.type === "training") S.level = "beginner"; pickDefaults({ type: S.type, date: S.date, period: S.period }); renderSheet(); return; }
    if (t.matches("[data-riders]")) { S.riders = Math.min(maxRiders(), Math.max(1, S.riders + +t.dataset.riders)); renderDetails(); renderSummary(); renderFoot(); return; }
    if (t.matches("[data-bike-opt]")) { S.bike = t.dataset.bikeOpt; renderDetails(); renderSummary(); renderFoot(); return; }
    if (t.matches("[data-level]")) { S.level = t.dataset.level; renderDetails(); return; }
  });

  $("#btnNext").addEventListener("click", next);
  $("#btnBack").addEventListener("click", back);
  $("#fName").addEventListener("input", e => { S.name = e.target.value; if (e.target.classList.contains("err")) { e.target.classList.remove("err"); setErr("errName"); } });
  $("#fPhone").addEventListener("input", e => { S.phone = e.target.value; if (e.target.classList.contains("err")) { e.target.classList.remove("err"); setErr("errPhone"); } });
  $("#fPhone").addEventListener("blur", e => { if (J.validPhone(e.target.value)) e.target.value = S.phone = J.fmtPhone(e.target.value); });
  $("#fNotes").addEventListener("input", e => { S.notes = e.target.value; });
  $("#fAgree").addEventListener("change", () => { $("#agreeWrap").classList.remove("err"); setErr("err3"); });
  $$("#fName, #fPhone").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); next(); } }));

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (drawer.classList.contains("open")) closeDrawer();
    else if (sheetOpen) closeSheet();
    else closeMenu();
  });
  window.addEventListener("popstate", () => {
    if (location.hash === "#book" && !sheetOpen) openSheet({});
    else if (location.hash !== "#book" && sheetOpen) closeSheet(true);
  });

  /* القائمة على الموبايل */
  $("#menuBtn").addEventListener("click", () => { $("#mobileMenu").classList.add("open"); $("#mobileMenu").setAttribute("aria-hidden", "false"); $("#menuBtn").setAttribute("aria-expanded", "true"); document.body.classList.add("lock"); });
  $("#menuClose").addEventListener("click", closeMenu);
  $$("#mobileMenu a").forEach(a => a.addEventListener("click", closeMenu));
}
function closeMenu() {
  const m = $("#mobileMenu");
  if (!m.classList.contains("open")) return;
  m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); $("#menuBtn").setAttribute("aria-expanded", "false");
  if (!sheetOpen) document.body.classList.remove("lock");
}

/* الظهور مع التمرير، وحالة شريط التنقّل، وزر الحجز السفلي */
function bindScroll() {
  const nav = $("#nav"), mb = $("#mobileBook"), hero = $(".hero"), final = $(".final");
  let heroGone = false, finalIn = false;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 12);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (!("IntersectionObserver" in window)) { $$(".reveal").forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: .08 });
  $$(".reveal").forEach(e => io.observe(e));
  const upd = () => mb.classList.toggle("show", heroGone && !finalIn);
  new IntersectionObserver(([en]) => { heroGone = !en.isIntersecting; upd(); }, { threshold: .05 }).observe($(".hero-cta") || hero);
  new IntersectionObserver(([en]) => { finalIn = en.isIntersecting; upd(); }).observe(final);
}

/* ══ البداية ══ */
function init() {
  bindStatic();
  renderHeroScene();
  renderMarquee();
  renderPeriods();
  renderRoutes();
  renderSchedule();
  renderFaq();
  renderSocial();
  renderNextRide();
  updateMyCount();
  bindEvents();
  bindScroll();
  setInterval(() => { renderNextRide(); if (!sheetOpen) renderSchedule(); }, 30000);
  loadAvailability();
  if (location.hash === "#book") { history.replaceState(null, "", location.pathname + location.search); openSheet({}); }
}
init();
})();
