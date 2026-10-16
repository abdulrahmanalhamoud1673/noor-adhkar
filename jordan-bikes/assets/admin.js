/* ══════════════════════════════════════════════════════════
   Jordan Bikes — لوحة الحجوزات
   مربوطة بجدول Google: تعرض حجوزات كل الزبائن وتعدّل حالتها.
   غير مربوطة: وضع تجربة يعرض حجوزات هذا الجهاز فقط.
   ══════════════════════════════════════════════════════════ */
(function () {
'use strict';

const J = window.JB, C = J.C;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const icon = id => `<svg><use href="#i-${id}"/></svg>`;
const COLORS = {
  morning: ["#ffc36b", "rgba(255,195,107,.13)"], asr: ["#ffb347", "rgba(255,179,71,.13)"],
  maghrib: ["#ff86b4", "rgba(255,134,180,.12)"], night: ["#9db4ff", "rgba(157,180,255,.12)"]
};
const PORDER = C.periods.map(p => p.id);
const LIVE = J.api.enabled;

let key = "";
let data = [];
let range = "upcoming", statusF = "active", q = "";
let busyIds = new Set();

function sessionKey(v) {
  try { if (v === undefined) return sessionStorage.getItem("jb_admin_key") || ""; sessionStorage.setItem("jb_admin_key", v); } catch (e) { return ""; }
}

/* ── التحميل ── */
async function fetchList(k) {
  const r = await J.api.get({ action: "list", key: k });
  if (!r || !r.ok) { const e = new Error((r && r.error) || "error"); e.code = r && r.error; throw e; }
  return r.bookings || [];
}
async function load(silent) {
  if (!silent) $("#groups").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  if (!LIVE) { data = J.store.get("bookings", []); render(); stamp(); return; }
  try {
    data = await fetchList(key);
    render(); stamp();
  } catch (e) {
    if (e.code === "unauthorized" || e.code === "set_admin_key") { logout(loginMsg(e.code)); return; }
    toast("تعذّر تحميل الحجوزات — تأكّد من الاتصال", true);
    if (!data.length) $("#groups").innerHTML = emptyHTML("ما قدرنا نحمّل الحجوزات", "تأكّد من الإنترنت ومن رابط Apps Script في config.js، ثم اضغط تحديث.");
  }
}
const loginMsg = code => code === "set_admin_key"
  ? "غيّر كلمة السر الافتراضية (ADMIN_KEY) في Code.gs وانشر نسخة جديدة أولاً."
  : "كلمة السر غير صحيحة.";

function stamp() {
  const n = J.now();
  $("#lastSync").textContent = (LIVE ? "آخر تحديث: " : "حجوزات هذا الجهاز · ") + J.fmtTime(Math.floor(n.minutes / 60) + ":" + String(n.minutes % 60).padStart(2, "0"));
}

/* ── الفلترة ── */
function inRange(b, today) {
  const d = J.daysBetween(today, b.date);
  switch (range) {
    case "today": return d === 0;
    case "tomorrow": return d === 1;
    case "week": return d >= 0 && d <= 6;
    case "upcoming": return d >= 0;
    case "past": return d < 0;
    default: return true;
  }
}
function matches(b) {
  if (statusF === "active" && b.status === "cancelled") return false;
  if (statusF && statusF !== "active" && b.status !== statusF) return false;
  if (!q) return true;
  const qq = q.toLowerCase(), qd = J.digits(q).replace(/\D/g, "");
  return (b.name || "").toLowerCase().includes(qq) || (b.id || "").toLowerCase().includes(qq) ||
    (qd.length >= 3 && (b.phone || "").replace(/\D/g, "").includes(qd));
}
function filtered() {
  const today = J.now().date;
  return data.filter(b => inRange(b, today) && matches(b));
}

/* ── العرض ── */
function render() {
  renderKpis();
  const list = filtered();
  const box = $("#groups");
  if (!list.length) {
    const labels = { today: "اليوم", tomorrow: "بكرا", week: "خلال 7 أيام", upcoming: "قادمة", past: "سابقة", all: "" };
    box.innerHTML = emptyHTML(q || statusF !== "active" ? "لا توجد نتائج" : "لا توجد حجوزات " + (labels[range] || ""),
      q ? "جرّب كلمة بحث ثانية." : LIVE ? "أي حجز جديد من الموقع بيظهر هون مباشرة." : "جرّب تعمل حجز من الموقع على هذا الجهاز وارجع لهون.");
    return;
  }
  const desc = range === "past";
  const days = {};
  list.forEach(b => (days[b.date] = days[b.date] || []).push(b));
  const today = J.now().date;
  box.innerHTML = Object.keys(days).sort((a, b) => desc ? (a < b ? 1 : -1) : (a < b ? -1 : 1)).map(date => {
    const items = days[date];
    const active = items.filter(b => b.status !== "cancelled");
    const riders = active.reduce((s, b) => s + (+b.riders || 0), 0);
    const slots = {};
    items.forEach(b => { const k = (b.type || "tour") + "|" + b.period; (slots[k] = slots[k] || []).push(b); });
    const slotKeys = Object.keys(slots).sort((a, b) => {
      const [ta, pa] = a.split("|"), [tb, pb] = b.split("|");
      return PORDER.indexOf(pa) - PORDER.indexOf(pb) || (ta < tb ? 1 : -1);
    });
    const rel = J.daysBetween(today, date);
    const head = (rel === 0 ? "اليوم · " : rel === 1 ? "بكرا · " : "") + J.dateLong(date);
    return `<div class="g-day"><div class="g-day-h"><h2>${head}</h2><span>${riders} شخص · ${active.length} حجز</span></div>
      ${slotKeys.map(k => slotHTML(date, k, slots[k])).join("")}</div>`;
  }).join("");
}

function slotHTML(date, k, items) {
  const [type, period] = k.split("|");
  const p = J.periodById(period) || { name: period, start: "00:00", end: "00:00" };
  const locId = type === "training" ? null : (items[0].location || J.locationFor(date, period));
  const L = J.locById(locId);
  const used = items.filter(b => b.status !== "cancelled").reduce((s, b) => s + (+b.riders || 0), 0);
  const cap = C.booking.capacity;
  const [c1, c2] = COLORS[period] || COLORS.morning;
  items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return `<div class="g-slot">
    <div class="g-slot-h">
      <span class="si-ic" style="--ic:${c1};--ic-bg:${c2}">${icon("clock")}</span>
      <div><b>${type === "training" ? "حصة تدريب" : J.esc(p.name)} · ${J.fmtRange(p)}</b><small>${icon("pin")} ${L ? J.esc(L.name) : "بالاتفاق"}</small></div>
      <div class="cap">
        ${type === "training" ? `<span>${used} شخص</span>` : `<div class="cap-bar"><i class="${used >= cap ? "full" : ""}" style="width:${Math.min(100, used / cap * 100)}%"></i></div><span>${used}/${cap}</span>`}
        <button class="icon-btn" data-copy="${date}|${k}" title="نسخ الأسماء والأرقام" aria-label="نسخ الأسماء والأرقام">${icon("copy")}</button>
      </div>
    </div>
    ${items.map(bookingHTML).join("")}
  </div>`;
}

function bookingHTML(b) {
  const opts = Object.entries(J.STATUS).map(([v, t]) => `<option value="${v}"${b.status === v ? " selected" : ""}>${t}</option>`).join("");
  const wa = J.waLink(customerText(b), b.phone);
  return `<div class="bk is-${J.esc(b.status)}">
    <div>
      <div class="bk-name">${J.esc(b.name)}<span class="code">${J.esc(b.id)}</span></div>
      <div class="bk-meta">
        <span class="ltr">${J.esc(J.fmtPhone(b.phone))}</span>
        <span>${b.riders} ${+b.riders === 1 ? "شخص" : "أشخاص"}</span>
        <span>${b.bike === "own" ? "معه دراجته" : "بدّه دراجة"}</span>
        <span>${J.LEVELS[b.level] || ""}</span>
        <span>${b.total != null && b.total !== "" ? J.money(+b.total) : "السعر بالاتفاق"}</span>
        <span>${ago(b.createdAt)}</span>
      </div>
      ${b.notes ? `<div class="bk-notes">${J.esc(b.notes)}</div>` : ""}
    </div>
    <div class="bk-side">
      <select class="st-select st-${J.esc(b.status)}" data-status="${J.esc(b.id)}" ${busyIds.has(b.id) ? "disabled" : ""} aria-label="حالة الحجز">${opts}</select>
      <a class="icon-btn" href="tel:${J.esc(J.normPhone(b.phone))}" title="اتصال" aria-label="اتصال">${icon("phone")}</a>
      <a class="icon-btn wa" href="${wa}" target="_blank" rel="noopener" title="واتساب" aria-label="واتساب">${icon("wa")}</a>
    </div>
  </div>`;
}

function customerText(b) {
  const p = J.periodById(b.period), L = J.locById(b.location);
  const first = String(b.name || "").split(/\s+/)[0];
  const body = [
    "🎫 رقم الحجز: " + b.id,
    "🚴 " + (p ? p.name : "") + " — " + J.dateLong(b.date),
    "⏰ " + (p ? J.fmtRange(p) : ""),
    "📍 " + (L ? L.name : "بالاتفاق"),
    "👥 عدد الأشخاص: " + b.riders
  ].join("\n");
  if (b.status === "cancelled") return "مرحباً " + first + " 👋 معك Jordan Bikes.\nتم إلغاء حجزك:\n" + body + "\n\nإذا بتحب نرتّب لك موعد ثاني احكينا 🙏";
  return "مرحباً " + first + " 👋 معك Jordan Bikes.\nتم تأكيد حجزك ✅\n" + body + "\n\n" + C.booking.meetingNote + " نشوفك على الطريق! 🚴";
}

function ago(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "الآن";
  if (m < 60) return "قبل " + m + " د";
  if (m < 1440) return "قبل " + Math.round(m / 60) + " س";
  return "قبل " + Math.round(m / 1440) + " يوم";
}

function renderKpis() {
  const today = J.now().date;
  const act = data.filter(b => b.status !== "cancelled");
  const d = b => J.daysBetween(today, b.date);
  const todayB = act.filter(b => d(b) === 0);
  const week = act.filter(b => d(b) >= 0 && d(b) <= 6);
  const pending = act.filter(b => d(b) >= 0 && b.status === "pending");
  const sum = (arr, f) => arr.reduce((s, b) => s + (+f(b) || 0), 0);
  const rev = sum(week.filter(b => b.total != null && b.total !== ""), b => b.total);
  const k = (ic, label, val, sub, hot) => `<div class="kpi${hot ? " hot" : ""}"><div class="k-top"><span>${label}</span><span class="k-ic">${icon(ic)}</span></div><div class="k-val">${val}</div><div class="k-sub">${sub}</div></div>`;
  $("#kpis").innerHTML =
    k("cal", "حجوزات اليوم", todayB.length, sum(todayB, b => b.riders) + " شخص اليوم") +
    k("clock", "بانتظار التأكيد", pending.length, pending.length ? "تواصل معهم على واتساب" : "كل شي مأكّد 👌", pending.length > 0) +
    k("users", "راكبين خلال 7 أيام", sum(week, b => b.riders), week.length + " حجز") +
    k("cash", "الإيراد المتوقّع", J.money(rev), "خلال 7 أيام");
}

function emptyHTML(title, sub) {
  return `<div class="adm-empty">${J.bikeSVG({ weight: 1.2 })}<b>${title}</b>${sub}</div>`;
}

/* ── تعديل الحالة ── */
async function setStatus(id, st) {
  const b = data.find(x => x.id === id);
  if (!b || b.status === st) return;
  const prev = b.status;
  b.status = st;
  if (!LIVE) {
    const list = J.store.get("bookings", []);
    list.forEach(x => { if (x.id === id) x.status = st; });
    J.store.set("bookings", list);
    render(); toast("تم تحديث الحالة ✓");
    return;
  }
  busyIds.add(id); render();
  try {
    const r = await J.api.post({ action: "update", key, id, status: st });
    if (!r || !r.ok) throw new Error(r && r.error);
    toast(st === "confirmed" ? "تم التأكيد ✓ — ابعتله رسالة واتساب من الزر الأخضر" : "تم تحديث الحالة ✓");
  } catch (e) {
    b.status = prev;
    toast("ما زبط التحديث — جرّب مرة ثانية", true);
  } finally {
    busyIds.delete(id); render();
  }
}

/* ── نسخ وتصدير ── */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (x) {}
    t.remove(); return ok;
  }
}
function copySlot(spec) {
  const [date, type, period] = spec.split("|");
  const items = data.filter(b => b.date === date && (b.type || "tour") === type && b.period === period && b.status !== "cancelled");
  const p = J.periodById(period), L = J.locById(items[0] && items[0].location);
  const lines = [(type === "training" ? "حصة تدريب" : p.name) + " — " + J.dateLong(date) + " — " + J.fmtRange(p) + (L ? " — " + L.name : ""), ""];
  items.forEach((b, i) => lines.push((i + 1) + ". " + b.name + " — " + J.fmtPhone(b.phone) + " (" + b.riders + ")"));
  lines.push("", "المجموع: " + items.reduce((s, b) => s + (+b.riders || 0), 0) + " شخص");
  copyText(lines.join("\n")).then(ok => toast(ok ? "تم نسخ القائمة ✓" : "ما زبط النسخ", !ok));
}
function exportCsv() {
  const list = filtered();
  if (!list.length) { toast("لا توجد حجوزات للتصدير", true); return; }
  const head = ["رقم الحجز", "التاريخ", "اليوم", "الجولة", "الوقت", "المكان", "النوع", "الاسم", "الموبايل", "عدد الأشخاص", "الدراجة", "المستوى", "المجموع", "الحالة", "ملاحظات", "وقت الحجز"];
  const cell = v => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = list.map(b => {
    const p = J.periodById(b.period), L = J.locById(b.location);
    return [b.id, b.date, J.DAYS[J.dow(b.date)], p ? p.name : b.period, p ? J.fmtRange(p) : "", L ? L.name : "", J.TYPES[b.type] || "",
      b.name, J.fmtPhone(b.phone), b.riders, J.BIKES[b.bike] || "", J.LEVELS[b.level] || "", b.total, J.STATUS[b.status] || b.status, b.notes, b.createdAt].map(cell).join(",");
  });
  J.download("jordan-bikes-" + J.now().date + ".csv", "﻿" + [head.join(","), ...rows].join("\r\n"), "text/csv;charset=utf-8");
}

/* ── الدخول ── */
function showLogin(msg) {
  $("#login").hidden = false; $("#dash").hidden = true; $("#topActions").hidden = true;
  setLoginErr(msg);
  setTimeout(() => $("#key").focus(), 50);
}
function showDash() {
  $("#login").hidden = true; $("#dash").hidden = false; $("#topActions").hidden = false;
  $("#btnLogout").hidden = !LIVE;
  $("#demoBanner").hidden = LIVE;
}
function setLoginErr(msg) { const e = $("#loginErr"); e.textContent = msg || ""; e.classList.toggle("show", !!msg); }
function logout(msg) {
  key = ""; J.store.del("admin_key"); sessionKey("");
  data = [];
  showLogin(msg);
}
async function tryLogin(e) {
  e.preventDefault();
  const k = $("#key").value.trim();
  if (!k) return;
  const btn = $("#loginBtn");
  btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>`;
  try {
    data = await fetchList(k);
    key = k;
    if ($("#remember").checked) J.store.set("admin_key", k); else sessionKey(k);
    showDash(); render(); stamp();
  } catch (err) {
    setLoginErr(err.code ? loginMsg(err.code) : "تعذّر الاتصال بالنظام — تأكّد من رابط Apps Script.");
  } finally {
    btn.disabled = false; btn.textContent = "دخول";
  }
}

/* ── إشعار ── */
let toastT;
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200);
}

function bind() {
  $("#loginForm").addEventListener("submit", tryLogin);
  $("#btnRefresh").addEventListener("click", () => load());
  $("#btnCsv").addEventListener("click", exportCsv);
  $("#btnLogout").addEventListener("click", () => logout());
  $$("#range button").forEach(b => b.addEventListener("click", () => {
    range = b.dataset.range;
    $$("#range button").forEach(x => x.classList.toggle("on", x === b));
    render();
  }));
  $("#statusFilter").value = statusF;
  $("#statusFilter").addEventListener("change", e => { statusF = e.target.value; render(); });
  let qt;
  $("#q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { q = e.target.value.trim(); render(); }, 150); });
  document.addEventListener("change", e => { const s = e.target.closest("[data-status]"); if (s) setStatus(s.dataset.status, s.value); });
  document.addEventListener("click", e => { const c = e.target.closest("[data-copy]"); if (c) copySlot(c.dataset.copy); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !$("#dash").hidden) load(true); });
  window.addEventListener("storage", e => { if (!LIVE && e.key === "jb_bookings") load(true); });
  setInterval(() => { if (!document.hidden && !$("#dash").hidden && LIVE && key) load(true); }, 60000);
}

function init() {
  $$('[data-bike="mark"]').forEach(e => e.innerHTML = J.bikeSVG({ weight: 1.5 }));
  const mode = $("#mode");
  mode.className = "adm-mode " + (LIVE ? "live" : "demo");
  mode.textContent = LIVE ? "متصل بجدول Google" : "وضع التجربة";
  bind();
  if (LIVE) {
    key = J.store.get("admin_key", "") || sessionKey();
    if (!key) { showLogin(); return; }
  }
  showDash();
  load();
}
init();
})();
