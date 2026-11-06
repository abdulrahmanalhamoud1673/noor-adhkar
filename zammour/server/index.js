'use strict';
const path = require('node:path');
const express = require('express');
const QRCode = require('qrcode');
const cfg = require('./config');
const { db, now } = require('./db');
const C = require('./crypto');
const { moderate, REASON_AR } = require('./moderation');
const { QUICK, REPLIES, quickByKey, replyByKey } = require('./catalog');
const { normalizeJO, mask } = require('./phone');
const notify = require('./notify');

const app = express();
app.disable('x-powered-by');
if (cfg.trustProxy) app.set('trust proxy', cfg.trustProxy);
app.use(express.json({ limit: '8kb' }));

// ————— رؤوس أمان —————
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'", "img-src 'self' data:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "script-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com", "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (cfg.isProd) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
// حماية CSRF: أي POST/PATCH/DELETE لازم يجي JSON من نفس الأصل
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== cfg.baseUrl && !(origin === `${req.protocol}://${req.get('host')}`)) return res.status(403).json({ error: 'forbidden' });
  if (!req.is('application/json')) return res.status(415).json({ error: 'json_only' });
  next();
});

// ————— أدوات —————
const sec = { hour: 3600e3, day: 86400e3, min: 60e3 };
const ipOf = (req) => req.ip || req.socket.remoteAddress || '0';
const senderHash = (req) => C.mac('ip:' + ipOf(req));

/** يسجّل ضربة ويرجّع true إذا تجاوز الحد */
function limited(key, max, windowMs) {
  const t = now();
  const n = db.prepare('SELECT COUNT(*) c FROM hits WHERE k=? AND at>?').get(key, t - windowMs).c;
  if (n >= max) return true;
  db.prepare('INSERT INTO hits(k,at) VALUES(?,?)').run(key, t);
  return false;
}
// تنظيف دوري: الرسائل بتنحذف بعد 30 يوم (متطابق مع صفحة الخصوصية)
function cleanup() {
  db.prepare('DELETE FROM hits WHERE at<?').run(now() - sec.day);
  db.prepare('DELETE FROM otps WHERE expires_at<?').run(now());
  db.prepare('DELETE FROM messages WHERE created_at<?').run(now() - 30 * sec.day);
}
cleanup();
setInterval(cleanup, sec.hour).unref();

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
}
function setCookie(res, name, val, maxAgeSec) {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${cfg.isProd ? '; Secure' : ''}`);
}
function sign(obj) { const p = Buffer.from(JSON.stringify(obj)).toString('base64url'); return `${p}.${C.mac('sess:' + p)}`; }
function unsign(tok) {
  const [p, m] = String(tok || '').split('.');
  if (!p || !m || !C.safeEq(m, C.mac('sess:' + p))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > now() ? o : null; } catch { return null; }
}
function deviceId(req, res) {
  let d = parseCookies(req).zd;
  if (!d || d.length < 16) { d = C.token(16); setCookie(res, 'zd', d, 60 * 60 * 24 * 365); }
  return C.mac('dev:' + d);
}
function auth(req, res, next) {
  const s = unsign(parseCookies(req).zs);
  if (!s) return res.status(401).json({ error: 'auth' });
  req.ownerId = s.o;
  next();
}
const ownerPhone = (ownerId) => C.decrypt(db.prepare('SELECT phone_enc FROM owners WHERE id=?').get(ownerId).phone_enc);
const carUrl = (code) => `${cfg.baseUrl}/c/${code}`;
const publicCar = (c) => ({ id: c.id, label: c.label, code: c.code, active: !!c.active, url: carUrl(c.code) });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error(e); res.status(500).json({ error: 'server' }); });

// ————— حسابات صاحب السيارة (رقم + رمز تحقق) —————
app.post('/api/auth/request', wrap(async (req, res) => {
  const phone = normalizeJO(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'bad_phone', message: 'اكتب رقم أردني صحيح، مثل 0791234567' });
  const ph = C.mac('ph:' + phone);
  if (limited('otp-ip:' + senderHash(req), 10, sec.hour) || limited('otp-ph:' + ph, 3, 10 * sec.min))
    return res.status(429).json({ error: 'slow_down', message: 'محاولات كتير. جرّب بعد شوي.' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.prepare(`INSERT INTO otps(phone_hash,code_hash,expires_at,attempts,sent_at) VALUES(?,?,?,0,?)
              ON CONFLICT(phone_hash) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0, sent_at=excluded.sent_at`)
    .run(ph, C.mac('otp:' + ph + code), now() + 5 * sec.min, now());
  await notify.send(phone, `رمز التحقق لزمّور: ${code}\nما تشاركه مع حدا.`, 'otp', { label: 'رمز التحقق', text: code, url: cfg.baseUrl });
  res.json({ ok: true, ...(!cfg.isProd && cfg.notifier === 'console' ? { devCode: code } : {}) });
}));

app.post('/api/auth/verify', wrap(async (req, res) => {
  const phone = normalizeJO(req.body.phone);
  const code = String(req.body.code || '').replace(/\D/g, '');
  if (!phone || code.length !== 6) return res.status(400).json({ error: 'bad_input', message: 'الرمز 6 أرقام.' });
  const ph = C.mac('ph:' + phone);
  const row = db.prepare('SELECT * FROM otps WHERE phone_hash=?').get(ph);
  if (!row || row.expires_at < now() || row.attempts >= 5)
    return res.status(400).json({ error: 'expired', message: 'الرمز منتهي. اطلب رمز جديد.' });
  db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone_hash=?').run(ph);
  if (!C.safeEq(row.code_hash, C.mac('otp:' + ph + code))) return res.status(400).json({ error: 'wrong', message: 'الرمز غلط.' });
  db.prepare('DELETE FROM otps WHERE phone_hash=?').run(ph);
  let o = db.prepare('SELECT id FROM owners WHERE phone_hash=?').get(ph);
  if (!o) {
    const r = db.prepare('INSERT INTO owners(phone_hash,phone_enc,created_at) VALUES(?,?,?)').run(ph, C.encrypt(phone), now());
    o = { id: Number(r.lastInsertRowid) };
  }
  setCookie(res, 'zs', sign({ o: o.id, e: now() + 30 * sec.day }), 30 * 86400);
  res.json({ ok: true });
}));

app.post('/api/auth/logout', (req, res) => { setCookie(res, 'zs', '', 0); res.json({ ok: true }); });

// ————— لوحة التحكم —————
app.get('/api/me', auth, (req, res) => {
  const cars = db.prepare('SELECT * FROM cars WHERE owner_id=? ORDER BY id').all(req.ownerId).map((c) => ({
    ...publicCar(c),
    unreplied: db.prepare(`SELECT COUNT(*) c FROM messages m WHERE m.car_id=? AND m.status='delivered'
      AND NOT EXISTS (SELECT 1 FROM replies r WHERE r.message_id=m.id)`).get(c.id).c,
  }));
  res.json({ phone: mask(ownerPhone(req.ownerId)), cars });
});

const cleanLabel = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40);
const labelOk = (l) => l.length >= 2 && moderate(l).ok;
const ownCar = (req) => db.prepare('SELECT * FROM cars WHERE id=? AND owner_id=?').get(Number(req.params.id), req.ownerId);

app.post('/api/cars', auth, (req, res) => {
  const label = cleanLabel(req.body.label);
  if (!labelOk(label)) return res.status(400).json({ error: 'bad_label', message: 'اكتب وصف السيارة (مثلاً: كيا سبورتج بيضاء) بدون أرقام أو روابط.' });
  if (db.prepare('SELECT COUNT(*) c FROM cars WHERE owner_id=?').get(req.ownerId).c >= 5)
    return res.status(400).json({ error: 'limit', message: 'الحد الأقصى 5 سيارات.' });
  const r = db.prepare('INSERT INTO cars(owner_id,code,label,created_at) VALUES(?,?,?,?)').run(req.ownerId, C.carCode(), label, now());
  res.json(publicCar(db.prepare('SELECT * FROM cars WHERE id=?').get(Number(r.lastInsertRowid))));
});

app.patch('/api/cars/:id', auth, (req, res) => {
  const car = ownCar(req); if (!car) return res.status(404).json({ error: 'nf' });
  if (req.body.label !== undefined) {
    const label = cleanLabel(req.body.label);
    if (!labelOk(label)) return res.status(400).json({ error: 'bad_label', message: 'وصف غير صالح.' });
    db.prepare('UPDATE cars SET label=? WHERE id=?').run(label, car.id);
  }
  if (req.body.active !== undefined) db.prepare('UPDATE cars SET active=? WHERE id=?').run(req.body.active ? 1 : 0, car.id);
  res.json(publicCar(db.prepare('SELECT * FROM cars WHERE id=?').get(car.id)));
});

// تغيير رمز الـQR (إذا انسرق الستيكر أو انتشر): الرمز القديم بيوقف فوراً
app.post('/api/cars/:id/rotate', auth, (req, res) => {
  const car = ownCar(req); if (!car) return res.status(404).json({ error: 'nf' });
  db.prepare('UPDATE cars SET code=? WHERE id=?').run(C.carCode(), car.id);
  res.json(publicCar(db.prepare('SELECT * FROM cars WHERE id=?').get(car.id)));
});

app.delete('/api/cars/:id', auth, (req, res) => {
  const car = ownCar(req); if (!car) return res.status(404).json({ error: 'nf' });
  db.prepare('DELETE FROM cars WHERE id=?').run(car.id);
  res.json({ ok: true });
});

app.get('/api/cars/:id/qr.svg', auth, wrap(async (req, res) => {
  const car = ownCar(req); if (!car) return res.status(404).end();
  const svg = await QRCode.toString(carUrl(car.code), { type: 'svg', errorCorrectionLevel: 'Q', margin: 1, color: { dark: '#0f1b3d', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
}));

function threadView(m) {
  const replies = db.prepare('SELECT reply_key k, created_at at FROM replies WHERE message_id=? ORDER BY id').all(m.id)
    .map((r) => ({ key: r.k, emoji: replyByKey[r.k]?.emoji, text: replyByKey[r.k]?.text, at: r.at }));
  return {
    id: m.id, at: m.created_at, status: m.status,
    quick: m.quick_keys ? m.quick_keys.split(',').map((k) => quickByKey[k]).filter(Boolean).map(({ key, emoji, text }) => ({ key, emoji, text })) : [],
    text: m.text_enc ? C.decrypt(m.text_enc) : '',
    replies,
  };
}
app.get('/api/cars/:id/messages', auth, (req, res) => {
  const car = ownCar(req); if (!car) return res.status(404).json({ error: 'nf' });
  const rows = db.prepare(`SELECT * FROM messages WHERE car_id=? AND status='delivered' ORDER BY id DESC LIMIT 30`).all(car.id);
  res.json({ car: publicCar(car), messages: rows.map(threadView) });
});
app.post('/api/messages/:id/block', auth, (req, res) => {
  const m = db.prepare(`SELECT m.* FROM messages m JOIN cars c ON c.id=m.car_id WHERE m.id=? AND c.owner_id=?`).get(Number(req.params.id), req.ownerId);
  if (!m) return res.status(404).json({ error: 'nf' });
  blockSender(m);
  res.json({ ok: true });
});
function blockSender(m) {
  db.prepare('INSERT OR IGNORE INTO blocks(car_id,sender_hash,device_hash,created_at) VALUES(?,?,?,?)').run(m.car_id, m.sender_hash, m.device_hash, now());
}

// ————— الجهة العامة: اللي بيمسح الـQR —————
const carByCode = (code) => db.prepare('SELECT * FROM cars WHERE code=?').get(String(code).toUpperCase().slice(0, 12));

app.get('/api/car/:code', (req, res) => {
  const car = carByCode(req.params.code);
  if (!car) return res.status(404).json({ error: 'nf' });
  res.json({ label: car.label, active: !!car.active, quick: QUICK, turnstile: cfg.turnstileSiteKey || null });
});

async function turnstileOk(token, ip) {
  if (!cfg.turnstileSecret) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: cfg.turnstileSecret, response: token, remoteip: ip }), signal: AbortSignal.timeout(5000),
    });
    return (await r.json()).success === true;
  } catch { return false; }
}

app.post('/api/car/:code/message', wrap(async (req, res) => {
  const car = carByCode(req.params.code);
  if (!car) return res.status(404).json({ error: 'nf' });
  if (!car.active) return res.status(409).json({ error: 'paused', message: 'صاحب السيارة أوقف استقبال الرسائل مؤقتاً.' });

  const sh = senderHash(req), dh = deviceId(req, res);
  const body = req.body || {};

  // فخ البوتات: حقل مخفي لازم يظل فاضي. نرد بنجاح وهمي ونتجاهل.
  if (body.website) return res.json({ ok: true, thread: C.token(12) });

  if (limited('attempt:' + sh, 30, sec.hour)) return res.status(429).json({ error: 'slow_down', message: 'محاولات كتير. جرّب بعد شوي.' });
  // الحظر على بصمة الجهاز فقط: شبكات الموبايل بالأردن بتشارك IP واحد بين ناس كتير (CGNAT)
  if (db.prepare('SELECT 1 FROM blocks WHERE car_id=? AND device_hash=?').get(car.id, dh))
    return res.json({ ok: true, thread: C.token(12) }); // محظور: نجاح وهمي (ما نكشف الحظر)
  // 3 رسائل ممنوعة من نفس الجهاز (أو 15 من نفس الـIP) خلال 24 ساعة = إيقاف مؤقت
  const strikes = (col, v) => db.prepare(`SELECT COUNT(*) c FROM messages WHERE ${col}=? AND status='blocked' AND created_at>?`).get(v, now() - sec.day).c;
  if (strikes('device_hash', dh) >= 3 || strikes('sender_hash', sh) >= 15) return res.status(429).json({ error: 'locked', message: 'تم إيقاف الإرسال مؤقتاً بسبب رسائل مخالفة.' });

  if (!(await turnstileOk(body.captcha, ipOf(req)))) return res.status(400).json({ error: 'captcha', message: 'تعذر التحقق أنك مش روبوت. حدّث الصفحة وجرّب.' });

  const keys = [...new Set(Array.isArray(body.quick) ? body.quick : [])].filter((k) => quickByKey[k]).slice(0, 3);
  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!keys.length && !rawText) return res.status(400).json({ error: 'empty', message: REASON_AR.empty });

  let text = '';
  if (rawText) {
    if (Number(body.elapsed) < 1200) return res.json({ ok: true, thread: C.token(12) }); // أسرع من إنسان
    const mod = moderate(rawText);
    if (!mod.ok) {
      db.prepare(`INSERT INTO messages(car_id,sender_hash,device_hash,quick_keys,status,reason,created_at) VALUES(?,?,?,?, 'blocked', ?, ?)`)
        .run(car.id, sh, dh, keys.join(','), mod.reason, now()); // ما نخزّن النص الممنوع نفسه
      return res.status(422).json({ error: 'moderation', reason: mod.reason, message: REASON_AR[mod.reason] });
    }
    text = mod.text;
  }

  // حدود الاستخدام: الجهاز بحدود ضيقة، والـIP بحدود أوسع (لأنه ممكن يكون مشترك)
  const cnt = (col, v, since, carId) => db.prepare(`SELECT COUNT(*) c FROM messages WHERE ${col}=? AND status='delivered' AND created_at>?${carId ? ' AND car_id=?' : ''}`).get(...[v, since, ...(carId ? [carId] : [])]).c;
  if (cnt('device_hash', dh, now() - 30 * sec.min, car.id) >= 2 || cnt('sender_hash', sh, now() - 30 * sec.min, car.id) >= 6)
    return res.status(429).json({ error: 'slow_down', message: 'أرسلت رسائل لهاي السيارة قبل شوي. انتظر ردّ صاحبها.' });
  if (cnt('device_hash', dh, now() - sec.hour) >= 8 || cnt('sender_hash', sh, now() - sec.hour) >= 40)
    return res.status(429).json({ error: 'slow_down', message: 'وصلت الحد الأقصى للرسائل بالساعة.' });
  if (db.prepare(`SELECT COUNT(*) c FROM messages WHERE car_id=? AND status='delivered' AND created_at>?`).get(car.id, now() - sec.day).c >= 20)
    return res.status(429).json({ error: 'car_limit', message: 'هاي السيارة استلمت رسائل كتير اليوم. جرّب لاحقاً.' });

  const ownerTok = C.token(12), threadTok = C.token(12);
  const r = db.prepare(`INSERT INTO messages(car_id,sender_hash,device_hash,quick_keys,text_enc,status,owner_token,thread_token,created_at)
      VALUES(?,?,?,?,?, 'delivered', ?, ?, ?)`).run(car.id, sh, dh, keys.join(','), text ? C.encrypt(text) : null, ownerTok, threadTok, now());
  const id = Number(r.lastInsertRowid);

  const lines = [...keys.map((k) => quickByKey[k].text), ...(text ? [`«${text}»`] : [])];
  const url = `${cfg.baseUrl}/m/${ownerTok}`;
  try {
    await notify.send(ownerPhone(car.owner_id), `زمّور 🚗 رسالة لسيارتك (${car.label}):\n${lines.join('\n')}\n\nللرد: ${url}`, 'msg', { label: car.label, text: lines.join(' | ').slice(0, 300), url });
    db.prepare('UPDATE messages SET notified_at=? WHERE id=?').run(now(), id);
  } catch (e) {
    console.error('notify failed', e.message);
    db.prepare(`UPDATE messages SET status='failed' WHERE id=?`).run(id);
    return res.status(502).json({ error: 'notify', message: 'تعذر توصيل الرسالة الآن. جرّب بعد شوي.' });
  }
  res.json({ ok: true, thread: threadTok });
}));

// متابعة المرسل (بدون هوية) — يشوف ردود صاحب السيارة
app.get('/api/thread/:token', (req, res) => {
  const m = db.prepare(`SELECT m.*, c.label FROM messages m JOIN cars c ON c.id=m.car_id WHERE m.thread_token=?`).get(String(req.params.token).slice(0, 40));
  if (!m) return res.status(404).json({ error: 'nf' });
  res.json({ label: m.label, ...threadView(m) });
});

// صفحة الرد لصاحب السيارة (رابط سحري من الرسالة)
const msgByOwnerToken = (t) => db.prepare(`SELECT m.*, c.label FROM messages m JOIN cars c ON c.id=m.car_id WHERE m.owner_token=?`).get(String(t).slice(0, 40));
app.get('/api/m/:token', (req, res) => {
  const m = msgByOwnerToken(req.params.token);
  if (!m) return res.status(404).json({ error: 'nf' });
  const blocked = !!db.prepare('SELECT 1 FROM blocks WHERE car_id=? AND device_hash=?').get(m.car_id, m.device_hash);
  res.json({ label: m.label, ...threadView(m), replyOptions: REPLIES, blocked });
});
app.post('/api/m/:token/reply', (req, res) => {
  const m = msgByOwnerToken(req.params.token);
  const r = replyByKey[req.body?.key];
  if (!m || !r) return res.status(400).json({ error: 'bad' });
  if (db.prepare('SELECT COUNT(*) c FROM replies WHERE message_id=?').get(m.id).c >= 5) return res.status(429).json({ error: 'limit' });
  db.prepare('INSERT INTO replies(message_id,reply_key,created_at) VALUES(?,?,?)').run(m.id, r.key, now());
  res.json({ ok: true });
});
app.post('/api/m/:token/block', (req, res) => {
  const m = msgByOwnerToken(req.params.token);
  if (!m) return res.status(404).json({ error: 'nf' });
  blockSender(m);
  res.json({ ok: true });
});

// ————— الصفحات —————
const pub = path.join(__dirname, '..', 'public');
const page = (f) => (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(pub, f));
app.get('/c/:code', page('scan.html'));
app.get('/t/:token', page('thread.html'));
app.get('/m/:token', page('owner-msg.html'));
app.get('/app', page('app.html'));
app.get('/sticker', page('sticker.html'));
app.get('/privacy', page('privacy.html'));
app.use(express.static(pub, { maxAge: cfg.isProd ? '1h' : 0, extensions: ['html'] }));
app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`زمّور شغّال على ${cfg.baseUrl}  [notifier=${cfg.notifier}]`));
}
module.exports = app;
