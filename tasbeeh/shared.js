/* ══════════════════════════════════════════════════════════
   نور — المسبحة الجماعية: ما تشترك فيه الصفحات الثلاث
   ----------------------------------------------------------
   index.html  صفحة المشارك: اسمه ثم زرّ كبير يعدّ كل ذكر
   live.html   شاشة البث: المجموع والهدف والمتصدّرون ورمز QR
   host.html   صفحة المضيف: إنشاء الغرفة وإدارتها وروابط OBS

   القاعدة مجانية: قاعدة بيانات لعبة القرآن، تحت rooms/<الكود>_t.
   هذا المسار مفتوح بقواعدها الحالية، واللاحقة _t تمنع التصادم مع
   غرف اللعبة — فلا شيء يحتاج ضبطاً في Firebase.

   ولماذا يكتب المشاركون بطلبات REST لا باتصال دائم؟ الخطة المجانية
   تسمح بمئة اتصال دائم فقط، والبث قد يجمع أكثر. طلبات REST لا تُحسب
   من المئة، فلا يتّصل اتصالاً دائماً إلا شاشة البث وصفحة المضيف.
   ══════════════════════════════════════════════════════════ */
(function () {

const DB = "https://quran-game-a622d-default-rtdb.firebaseio.com";

/* الأذكار المتاحة — يختار المضيف واحداً للجلسة */
const DHIKR = [
  { id: "istighfar", text: "أستغفر الله",              noun: "استغفار" },
  { id: "subhan",    text: "سبحان الله",               noun: "تسبيحة" },
  { id: "hamd",      text: "الحمد لله",                noun: "تحميدة" },
  { id: "takbir",    text: "الله أكبر",                noun: "تكبيرة" },
  { id: "tahlil",    text: "لا إله إلا الله",           noun: "تهليلة" },
  { id: "salat",     text: "اللهم صلِّ على محمد ﷺ",     noun: "صلاة على النبي" },
  { id: "hawqala",   text: "لا حول ولا قوة إلا بالله",   noun: "حوقلة" }
];
const dhikr = id => DHIKR.find(d => d.id === id) || DHIKR[0];

/* لا يُقال ذكرٌ في أقل من ربع ثانية: هذا سقف المعقول في الثانية */
const MAX_RATE = 4;

const path = (code, sub) => "rooms/" + code + "_t" + (sub ? "/" + sub : "");
const url = (code, sub) => DB + "/" + path(code, sub) + ".json";

async function req(method, code, sub, body, keepalive) {
  const opt = { method, cache: "no-store" };
  if (body !== undefined) {
    opt.headers = { "Content-Type": "application/json" };
    opt.body = JSON.stringify(body);
  }
  if (keepalive) opt.keepalive = true;
  const r = await fetch(url(code, sub), opt);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return method === "DELETE" ? null : r.json();
}

/* قيمة يضعها الخادم: وقته هو لا وقت الهاتف */
const NOW = { ".sv": "timestamp" };

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(n) {
  let s = "";
  for (let i = 0; i < (n || 5); i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
function rid(n) {
  const A = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(n || 12);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += A[b[i] % A.length];
  return s;
}
const cleanCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
const validCode = s => /^[A-Z0-9]{3,12}$/.test(s || "");

function load(key, def) {
  try { const v = localStorage.getItem("tsb_" + key); return v == null ? def : JSON.parse(v); }
  catch (e) { return def; }
}
function save(key, val) {
  try { localStorage.setItem("tsb_" + key, JSON.stringify(val)); } catch (e) {}
}

/* هويّة هذا الجهاز — تبقى بعد إعادة التحميل فلا يضيع عدّك */
function uid() {
  let u = load("uid", "");
  if (!u) { u = rid(12); save("uid", u); }
  return u;
}

/* الاسم: بلا رموز تحكّم ولا وسوم، بمسافات موحّدة، وعشرون حرفاً على الأكثر */
function cleanName(s) {
  return Array.from(String(s || ""))
    .filter(ch => {
      const c = ch.codePointAt(0);
      return c >= 32 && c !== 127 && ch !== "<" && ch !== ">";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

/* ─── أسماء لا تليق ببثّ ذكر ───
   الكلمات القصيرة لا تُرفض إلا إذا جاءت كلمةً مستقلّة، وإلا رُفض
   «عكسي» لأن فيها «كس»، ورُفض Hassan لأن فيه ass. */
const BAD_SHORT = ["كس", "طيز", "زب", "نيك", "خول", "كلب", "حمار", "زاني", "sex", "ass", "dick"];
const BAD_LONG = ["شرموط", "منيوك", "متناك", "قحبه", "عاهر", "لوطي", "عرص", "خنزير",
                  "fuck", "shit", "bitch", "pussy", "whore", "bastard", "porn"];

/* يجرّد التشكيل والتطويل ويوحّد الألف والتاء المربوطة والياء */
function normAr(s) {
  return Array.from(String(s || "").toLowerCase())
    .filter(ch => {
      const c = ch.codePointAt(0);
      return !((c >= 0x064B && c <= 0x065F) || c === 0x0670 || c === 0x0640);
    })
    .join("")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}
function isBad(name) {
  const words = normAr(name).split(/[^a-zء-ي]+/).filter(Boolean)
    .map(w => w.replace(/^ال/, ""));
  if (words.some(w => BAD_SHORT.indexOf(w) !== -1)) return true;
  const glued = words.join("");
  return BAD_LONG.some(b => glued.indexOf(b) !== -1);
}

const fmt = n => Math.max(0, Math.floor(+n || 0)).toLocaleString("ar-EG");

const folder = () => location.origin + location.pathname.replace(/[^/]*$/, "");
const joinUrl = code => folder() + "?r=" + code;
const liveUrl = (code, obs) => folder() + "live.html?r=" + code + (obs ? "&obs=1" : "");

/**
 * يحوّل بيانات الغرفة إلى قائمة مرتّبة صالحة للعرض.
 *
 * ويقصّ ما لا يُعقل: من كتب ٩٩٩٩٩ برابط مباشر لا يظهر بها، بل بما
 * يمكن أن يُقال فعلاً منذ دخوله — أربعة أذكار في الثانية. والمسبّح
 * الحقيقي لا يبلغ هذا السقف أبداً، فلا يُقصّ من عدّه شيء.
 */
function makeBoard() {
  const seen = {};
  return function compute(room, now) {
    room = room || {};
    const m = room.m || {}, P = room.p || {}, K = room.k || {};
    const created = +m.c || now;
    const list = [];
    for (const id in P) {
      const p = P[id];
      if (!p || typeof p !== "object") continue;
      if (m.sid && p.sid !== m.sid) continue;         // من جلسة سابقة
      if (K[id]) continue;                             // أخفاه المضيف
      const name = cleanName(p.name);
      if (!name || isBad(name)) continue;
      const raw = Math.max(0, Math.floor(+p.n || 0));
      let s = seen[id];
      if (!s || raw < s.raw) {                         // أوّل مرّة نراه، أو بدأ من جديد
        const since = Math.max(0, now - Math.max(+p.j || now, created)) / 1000;
        s = seen[id] = { base: Math.min(raw, Math.floor(since * MAX_RATE) + 40), at: now, raw };
      }
      s.raw = raw;
      const n = Math.min(raw, s.base + Math.floor((now - s.at) / 1000 * MAX_RATE) + 40);
      list.push({ id, name, n, active: now - (+p.t || 0) < 90000 });
    }
    list.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ar"));
    return list;
  };
}

window.T = {
  DB, DHIKR, dhikr, MAX_RATE, NOW, path,
  get: (c, s) => req("GET", c, s),
  put: (c, s, b) => req("PUT", c, s, b),
  patch: (c, s, b) => req("PATCH", c, s, b),
  patchKeep: (c, s, b) => req("PATCH", c, s, b, true),
  del: (c, s) => req("DELETE", c, s),
  randomCode, rid, cleanCode, validCode, load, save, uid,
  cleanName, isBad, fmt, joinUrl, liveUrl, makeBoard
};
})();
