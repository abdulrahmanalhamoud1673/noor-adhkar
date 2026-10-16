/**
 * ══════════════════════════════════════════════════════════
 *  Jordan Bikes — نظام الحجوزات على Google Sheets
 * ══════════════════════════════════════════════════════════
 *  طريقة التركيب (مرة واحدة فقط — التفاصيل في README.md):
 *   1) أنشئ Google Sheet جديد ← Extensions ← Apps Script
 *   2) امسح الموجود والصق هذا الملف كاملاً
 *   3) غيّر ADMIN_KEY تحت لكلمة سر خاصة فيك
 *   4) شغّل الدالة setup مرة واحدة ووافق على الصلاحيات
 *   5) Deploy ← New deployment ← Web app
 *        Execute as: Me      Who has access: Anyone
 *   6) انسخ رابط Web app وحطّه في assets/config.js داخل backend.url
 *
 *  أي تعديل على هذا الملف بعد النشر يحتاج:
 *   Deploy ← Manage deployments ← ✏️ ← Version: New version ← Deploy
 * ══════════════════════════════════════════════════════════
 */

const SETTINGS = {
  ADMIN_KEY: 'CHANGE-ME',      // ← كلمة سر لوحة الإدارة (لازم تتغيّر)
  CAPACITY: 20,                // أقصى عدد أشخاص بالجولة الواحدة
  MAX_RIDERS: 10,              // أقصى عدد أشخاص بحجز واحد
  NOTIFY_EMAIL: '',            // بريدك ليوصلك إيميل مع كل حجز جديد (اختياري)
  AUTO_CONFIRM: false,         // true = الحجز يتأكّد تلقائياً إذا في مكان
  SHEET_NAME: 'Bookings',
  TIMEZONE: 'Asia/Amman'
};

const HEADERS = ['id', 'createdAt', 'updatedAt', 'status', 'type', 'date', 'period', 'location', 'time',
                 'riders', 'bike', 'level', 'name', 'phone', 'notes', 'total'];
const PERIODS = ['morning', 'asr', 'maghrib', 'night'];
const STATUSES = ['pending', 'confirmed', 'attended', 'noshow', 'cancelled'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const PERIOD_AR = { morning: 'جولة صباحية', asr: 'جولة العصر', maghrib: 'جولة المغرب', night: 'جولة ليلية' };

/* ── نقاط الدخول ── */
function doGet(e) {
  return respond_(function () {
    const p = (e && e.parameter) || {};
    switch (p.action) {
      case 'availability': return availability_(p.from, p.to);
      case 'status':       return statusOf_(p.ids, p.phone);
      case 'list':         auth_(p.key); return list_(p.from, p.to);
      default:             return { ok: true, service: 'Jordan Bikes bookings' };
    }
  });
}

function doPost(e) {
  return respond_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (body.action) {
      case 'create': return create_(body.booking || {});
      case 'update': auth_(body.key); return update_(body.id, body.status);
      default:       throw new Error('unknown_action');
    }
  });
}

/* شغّلها مرة واحدة من المحرّر لتجهيز الجدول ومنح الصلاحيات */
function setup() {
  sheet_();
  Logger.log('جاهز ✓ — الآن انشر المشروع كـ Web app.');
}

/* ── الحجز ── */
function create_(b) {
  if (b.website) throw new Error('spam');
  const type = b.type === 'training' ? 'training' : 'tour';
  const date = String(b.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad_date');
  if (PERIODS.indexOf(b.period) < 0) throw new Error('bad_period');
  const today = Utilities.formatDate(new Date(), SETTINGS.TIMEZONE, 'yyyy-MM-dd');
  if (date < today) throw new Error('past_date');
  const riders = Math.floor(Number(b.riders));
  if (!(riders >= 1 && riders <= SETTINGS.MAX_RIDERS)) throw new Error('bad_riders');
  const name = clean_(b.name, 60);
  if (name.length < 2) throw new Error('bad_name');
  const phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 16);
  if (phone.replace(/\D/g, '').length < 8) throw new Error('bad_phone');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const rows = readAll_();
    const same = rows.filter(function (r) { return r.date === date && r.period === b.period && r.status !== 'cancelled'; });

    const dup = same.filter(function (r) { return r.phone === phone; })[0];
    if (dup) return { ok: true, duplicate: true, booking: { id: dup.id, status: dup.status } };

    if (type === 'tour') {
      const used = same.filter(function (r) { return r.type === 'tour'; })
                       .reduce(function (s, r) { return s + r.riders; }, 0);
      const left = SETTINGS.CAPACITY - used;
      if (riders > left) return { ok: false, error: 'full', left: Math.max(0, left) };
    }

    const ids = {};
    rows.forEach(function (r) { ids[r.id] = 1; });
    let id = /^JB-[A-Z0-9]{5}$/.test(b.id) && !ids[b.id] ? b.id : '';
    while (!id || ids[id]) id = newId_();

    const now = new Date().toISOString();
    const rec = {
      id: id, createdAt: now, updatedAt: now,
      status: SETTINGS.AUTO_CONFIRM ? 'confirmed' : 'pending',
      type: type, date: date, period: b.period,
      location: type === 'tour' ? clean_(b.location, 30) : '',
      time: clean_(b.time, 40), riders: riders,
      bike: b.bike === 'own' ? 'own' : 'rent',
      level: LEVELS.indexOf(b.level) >= 0 ? b.level : 'intermediate',
      name: name, phone: phone, notes: clean_(b.notes, 400),
      total: (b.total === null || b.total === undefined || b.total === '') ? '' : String(Number(b.total) || 0)
    };
    write_(rec);
    notify_(rec);
    return { ok: true, booking: { id: rec.id, status: rec.status } };
  } finally {
    lock.releaseLock();
  }
}

/* عدد الأشخاص المحجوزين لكل جولة — بدون أي معلومات شخصية */
function availability_(from, to) {
  const counts = {};
  readAll_().forEach(function (r) {
    if (r.type !== 'tour' || r.status === 'cancelled') return;
    if (from && r.date < from) return;
    if (to && r.date > to) return;
    const k = r.date + '|' + r.period;
    counts[k] = (counts[k] || 0) + r.riders;
  });
  return { ok: true, capacity: SETTINGS.CAPACITY, counts: counts };
}

/* حالة حجوزات زبون — لازم رقم الحجز ورقم الهاتف معاً */
function statusOf_(ids, phone) {
  const want = String(ids || '').split(',').map(function (s) { return s.trim(); }).filter(String).slice(0, 30);
  const ph = String(phone || '').replace(/[^\d+]/g, '');
  const out = {};
  if (want.length && ph) {
    readAll_().forEach(function (r) {
      if (want.indexOf(r.id) >= 0 && r.phone === ph) out[r.id] = r.status;
    });
  }
  return { ok: true, statuses: out };
}

/* ── الإدارة ── */
function list_(from, to) {
  const rows = readAll_().filter(function (r) {
    return (!from || r.date >= from) && (!to || r.date <= to);
  });
  rows.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const pa = PERIODS.indexOf(a.period), pb = PERIODS.indexOf(b.period);
    if (pa !== pb) return pa - pb;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  return { ok: true, bookings: rows.map(function (r) { delete r._row; return r; }) };
}

function update_(id, status) {
  if (STATUSES.indexOf(status) < 0) throw new Error('bad_status');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = readAll_().filter(function (x) { return x.id === id; })[0];
    if (!r) throw new Error('not_found');
    const sh = sheet_();
    sh.getRange(r._row, HEADERS.indexOf('status') + 1).setValue(status);
    sh.getRange(r._row, HEADERS.indexOf('updatedAt') + 1).setValue(new Date().toISOString());
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function auth_(key) {
  if (!SETTINGS.ADMIN_KEY || SETTINGS.ADMIN_KEY === 'CHANGE-ME') throw new Error('set_admin_key');
  if (String(key || '') !== SETTINGS.ADMIN_KEY) {
    Utilities.sleep(800);   // يبطّئ محاولات التخمين
    throw new Error('unauthorized');
  }
}

/* ── الجدول ── */
function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SETTINGS.SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
      .setFontWeight('bold').setBackground('#111111').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_() {
  const sh = sheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, HEADERS.length).getDisplayValues()
    .map(function (r, i) {
      const o = { _row: i + 2 };
      HEADERS.forEach(function (h, j) { o[h] = r[j]; });
      o.riders = Number(o.riders) || 0;
      o.total = o.total === '' ? null : Number(o.total);
      return o;
    })
    .filter(function (o) { return o.id; });
}

function write_(rec) {
  const sh = sheet_();
  const row = sh.getLastRow() + 1;
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  const rg = sh.getRange(row, 1, 1, HEADERS.length);
  rg.setNumberFormat('@');
  rg.setValues([HEADERS.map(function (h) { return rec[h] === undefined || rec[h] === null ? '' : String(rec[h]); })]);
}

function notify_(r) {
  if (!SETTINGS.NOTIFY_EMAIL) return;
  try {
    MailApp.sendEmail({
      to: SETTINGS.NOTIFY_EMAIL,
      subject: '🚴 حجز جديد ' + r.id + ' — ' + (PERIOD_AR[r.period] || r.period) + ' ' + r.date,
      body: [
        'رقم الحجز: ' + r.id,
        'النوع: ' + (r.type === 'training' ? 'حصة تدريب' : 'جولة جماعية'),
        'الموعد: ' + r.date + ' — ' + (PERIOD_AR[r.period] || r.period) + ' (' + r.time + ')',
        'المكان: ' + (r.location || 'بالاتفاق'),
        'الاسم: ' + r.name,
        'الموبايل: ' + r.phone,
        'عدد الأشخاص: ' + r.riders,
        'الدراجة: ' + (r.bike === 'own' ? 'معه دراجته' : 'بدّه دراجة'),
        'ملاحظات: ' + (r.notes || '—')
      ].join('\n')
    });
  } catch (err) { /* الحجز أهم من الإيميل */ }
}

/* ── أدوات ── */
function clean_(v, max) {
  let s = String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = '​' + s;   // يمنع تحويل النص لصيغة داخل الجدول
  return s;
}

function newId_() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = 'JB-';
  for (let i = 0; i < 5; i++) s += A.charAt(Math.floor(Math.random() * A.length));
  return s;
}

function respond_(fn) {
  let out;
  try { out = fn(); }
  catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
