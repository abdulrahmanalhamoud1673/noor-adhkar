/* ══════════════════════════════════════════════════════════
   Jordan Bikes — أدوات مشتركة بين صفحة الحجز ولوحة الإدارة
   ══════════════════════════════════════════════════════════ */
(function () {
'use strict';

const C = window.JB_CONFIG;
const TZ = "Asia/Amman";

const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران",
                "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];

const TYPES = { tour: "جولة جماعية", training: "حصة تدريب" };
const BIKES = { rent: "دراجة من Jordan Bikes", own: "دراجته الخاصة" };
const LEVELS = { beginner: "مبتدئ", intermediate: "متوسط", advanced: "متقدّم" };
const STATUS = {
  pending:   "بانتظار التأكيد",
  confirmed: "مؤكّد",
  attended:  "حضر",
  noshow:    "لم يحضر",
  cancelled: "ملغي"
};

/* ── الوقت: كل الحسابات بتوقيت عمّان مهما كان توقيت الجهاز ── */
const fmtParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
function partsAt(d) {
  const o = {};
  for (const p of fmtParts.formatToParts(d)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute };
}
const pad = n => String(n).padStart(2, "0");
const ymd = (y, m, d) => y + "-" + pad(m) + "-" + pad(d);

function now() {
  const p = partsAt(new Date());
  const date = ymd(p.y, p.m, p.d);
  return { date, minutes: p.h * 60 + p.mi, dow: dow(date) };
}
function parse(s) { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; }
function addDays(s, n) {
  const { y, m, d } = parse(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
function dow(s) { const { y, m, d } = parse(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function daysBetween(a, b) {
  const A = parse(a), B = parse(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 864e5);
}
const toMin = hhmm => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/* وقت عمّان ← لحظة حقيقية (لملف التقويم) */
function ammanToDate(dateStr, hhmm) {
  const { y, m, d } = parse(dateStr);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = partsAt(new Date(guess));
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess;
  return new Date(guess - offset);
}

function fmtTime(hhmm, withSuffix = true) {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ":" + pad(m) + (withSuffix ? (h < 12 ? " ص" : " م") : "");
}
function fmtRange(p) {
  const sameHalf = (toMin(p.start) < 720) === (toMin(p.end) < 720);
  return sameHalf
    ? fmtTime(p.start, false) + " – " + fmtTime(p.end)
    : fmtTime(p.start) + " – " + fmtTime(p.end);
}
function dateLong(s) { const { m, d } = parse(s); return DAYS[dow(s)] + " " + d + " " + MONTHS[m - 1]; }
function dateShort(s) { const { m, d } = parse(s); return d + "/" + m; }
function relDay(s, today) {
  const t = today || now().date;
  const diff = daysBetween(t, s);
  if (diff === 0) return "اليوم";
  if (diff === 1) return "بكرا";
  return DAYS[dow(s)];
}

/* ── الجدول ── */
const periodById = id => C.periods.find(p => p.id === id);
const locById = id => (id && C.locations[id]) || null;
function locationFor(date, periodId) {
  const day = C.schedule[dow(date)] || {};
  return day[periodId] || null;
}
function minutesUntil(date, periodId, n) {
  const t = n || now();
  return daysBetween(t.date, date) * 1440 + toMin(periodById(periodId).start) - t.minutes;
}
/* هل يمكن حجز هذا الموعد؟ — يرجع سبب المنع إن وُجد */
function slotState(date, periodId, type, n) {
  if ((C.closedDates || []).includes(date)) return "closed";
  if (type !== "training" && !locationFor(date, periodId)) return "none";
  if (minutesUntil(date, periodId, n) < C.booking.cutoffMinutes) return "past";
  return "open";
}
function nextSlots(limit, type) {
  const n = now(), out = [];
  for (let i = 0; i <= C.booking.daysAhead && out.length < limit; i++) {
    const date = addDays(n.date, i);
    for (const p of C.periods) {
      if (slotState(date, p.id, type || "tour", n) === "open") {
        out.push({ date, period: p.id, location: locationFor(date, p.id) });
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

/* ── السعر ── */
function price(type, riders, bike) {
  const P = C.pricing;
  const unit = type === "training" ? P.training : P.tour;
  if (unit == null) return { known: false, unit: null, total: null };
  const extra = bike === "rent" ? (P.bikeExtra || 0) : 0;
  return { known: true, unit: unit + extra, total: (unit + extra) * riders };
}
const money = n => (Math.round(n * 100) / 100) + " " + C.pricing.currency;

/* ── الهاتف ── */
function digits(s) {
  return String(s || "")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}
/* يرجع الرقم بصيغة موحّدة: محلي 07XXXXXXXX أو دولي +XXXXXXXX */
function normPhone(s) {
  let v = digits(s).replace(/[^\d+]/g, "");
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (v.startsWith("+962")) v = "0" + v.slice(4);
  else if (v.startsWith("962") && v.length === 12) v = "0" + v.slice(3);
  if (/^7[789]\d{7}$/.test(v)) v = "0" + v;
  return v;
}
function validPhone(s) {
  const v = normPhone(s);
  return /^07[789]\d{7}$/.test(v) || /^\+\d{8,15}$/.test(v);
}
function fmtPhone(s) {
  const v = normPhone(s);
  return /^07\d{8}$/.test(v) ? v.slice(0, 3) + " " + v.slice(3, 6) + " " + v.slice(6) : v;
}
/* رقم بصيغة واتساب الدولية */
function waNumber(s) {
  const v = normPhone(s);
  if (/^07\d{8}$/.test(v)) return "962" + v.slice(1);
  return v.replace(/^\+/, "");
}
const waLink = (text, to) => "https://wa.me/" + (to ? waNumber(to) : C.contact.whatsapp) + "?text=" + encodeURIComponent(text);

/* ── التخزين على الجهاز ── */
const store = {
  get(k, def) { try { const v = localStorage.getItem("jb_" + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem("jb_" + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("jb_" + k); } catch (e) {} }
};

function genId() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const b = new Uint8Array(5);
  (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = Math.random() * 256);
  let s = "";
  for (const x of b) s += A[x % A.length];
  return "JB-" + s;
}

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ── الاتصال بجدول Google (اختياري) ── */
const api = {
  get enabled() { return !!(C.backend && C.backend.url); },
  async call(params, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      let res;
      if (body) {
        /* text/plain يتجنّب طلب preflight الذي لا يدعمه Apps Script */
        res = await fetch(C.backend.url, {
          method: "POST", body: JSON.stringify(body), signal: ctrl.signal,
          headers: { "Content-Type": "text/plain;charset=utf-8" }
        });
      } else {
        const u = new URL(C.backend.url);
        for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
        res = await fetch(u.toString(), { signal: ctrl.signal, cache: "no-store" });
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  },
  get(params) { return this.call(params); },
  post(body) { return this.call(null, body); }
};

/* ── رسالة واتساب للحجز ── */
function bookingText(b, intro) {
  const p = periodById(b.period), L = locById(b.location);
  const lines = [
    intro || "مرحباً Jordan Bikes 👋 بدي أثبّت هذا الحجز:",
    "",
    "🎫 رقم الحجز: " + b.id,
    "🚴 " + TYPES[b.type] + " — " + p.name,
    "📅 " + dateLong(b.date),
    "⏰ " + fmtRange(p),
    "📍 " + (L ? L.name : "يُحدَّد بالاتفاق"),
    "👥 عدد الأشخاص: " + b.riders,
    "🚲 الدراجة: " + (b.bike === "rent" ? "بدي دراجة من عندكم" : "معي دراجتي"),
    "📊 المستوى: " + LEVELS[b.level],
    "👤 الاسم: " + b.name,
    "📱 الرقم: " + fmtPhone(b.phone)
  ];
  if (b.notes) lines.push("📝 ملاحظات: " + b.notes);
  lines.push("💵 المجموع: " + (b.total != null ? money(b.total) : "حسب الاتفاق"));
  return lines.join("\n");
}

/* ── ملف تقويم (.ics) ── */
function icsFor(b) {
  const p = periodById(b.period), L = locById(b.location);
  const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escI = s => String(s).replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const where = (L ? L.name + "، " : "") + "عمّان";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Jordan Bikes//Booking//AR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + b.id + "@jordan-bikes",
    "DTSTAMP:" + stamp(new Date()),
    "DTSTART:" + stamp(ammanToDate(b.date, p.start)),
    "DTEND:" + stamp(ammanToDate(b.date, p.end)),
    "SUMMARY:" + escI("Jordan Bikes — " + p.name + (L ? " · " + L.name : "")),
    "LOCATION:" + escI(where),
    "DESCRIPTION:" + escI("رقم الحجز: " + b.id + "\nعدد الأشخاص: " + b.riders + "\nللتواصل: " + C.contact.phone),
    "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:" + escI("جولتك بعد ساعة 🚴"), "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"
  ];
  return lines.join("\r\n");
}
function download(name, text, type) {
  const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ── رسم الدراجة (مستوحى من شعار Jordan Bikes) ── */
function bikeSVG(o) {
  o = o || {};
  const w = o.weight || 1;
  const X = o.mirror ? (x => 120 - x) : (x => x);
  const L = (pts) => pts.map(([x, y], i) => (i ? "L" : "M") + X(x) + " " + y).join(" ");
  const wheel = (cx, cy) => {
    let spokes = "";
    if (o.spokes) {
      for (let a = 0; a < 180; a += 30) {
        const r = a * Math.PI / 180, R = 15;
        spokes += `<line x1="${(cx - R * Math.cos(r)).toFixed(2)}" y1="${(cy - R * Math.sin(r)).toFixed(2)}" x2="${(cx + R * Math.cos(r)).toFixed(2)}" y2="${(cy + R * Math.sin(r)).toFixed(2)}"/>`;
      }
      spokes = `<g stroke-width=".55" opacity=".5">${spokes}</g>`;
    }
    return `<g class="${o.spokes ? "wheel-spin" : ""}"><circle cx="${cx}" cy="${cy}" r="19" stroke-width="${2.6 * w}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="15.4" stroke-width="${1.1 * w}" opacity=".7"/>${spokes}` +
      `<circle cx="${cx}" cy="${cy}" r="${1.8 * w}" fill="currentColor" stroke="none"/></g>`;
  };
  const id = "bg" + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="-2 6 124 64" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:#fff">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9a5c"/><stop offset=".55" stop-color="#ff5a2c"/><stop offset="1" stop-color="#e2401c"/></linearGradient></defs>
    <g stroke="currentColor">${wheel(X(30), 48)}${wheel(X(90), 48)}</g>
    <g stroke="url(#${id})" stroke-width="${3.8 * w}">
      <path d="${L([[56, 50], [47, 20]])}"/>
      <path d="${L([[49, 26], [80, 21], [84, 31], [56, 50]])}"/>
      <path d="${L([[56, 50], [30, 48], [50, 31]])}"/>
    </g>
    <g stroke="currentColor">
      <path d="${L([[84, 31], [90, 48]])}" stroke-width="${3 * w}"/>
      <path d="${L([[52, 33], [63, 28]])}" stroke-width="${3.2 * w}" stroke="#ffd0b5"/>
      <path d="${L([[47, 20], [46, 16]])}" stroke-width="${2.6 * w}"/>
      <path d="M${X(39)} 15.6 Q${X(46)} 13.4 ${X(54)} 15.4" stroke-width="${3.4 * w}"/>
      <path d="${L([[80, 21], [78.5, 13]])}" stroke-width="${2.8 * w}"/>
      <path d="${L([[73, 12.6], [85, 11.6]])}" stroke-width="${3 * w}"/>
      <circle cx="${X(56)}" cy="50" r="${3.6}" stroke-width="${1.8 * w}"/>
      <path d="${L([[56, 50], [60.5, 56.5]])}" stroke-width="${2.2 * w}"/>
    </g>
  </svg>`;
}

window.JB = {
  C, TZ, DAYS, MONTHS, TYPES, BIKES, LEVELS, STATUS,
  now, parse, addDays, dow, daysBetween, toMin, ammanToDate,
  fmtTime, fmtRange, dateLong, dateShort, relDay,
  periodById, locById, locationFor, minutesUntil, slotState, nextSlots,
  price, money, digits, normPhone, validPhone, fmtPhone, waNumber, waLink,
  store, genId, esc, api, bookingText, icsFor, download, bikeSVG
};
})();
