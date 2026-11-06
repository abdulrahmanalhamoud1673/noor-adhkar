const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zammour-'));
process.env.DATA_DIR = dir;
process.env.DB_FILE = path.join(dir, 't.db');
process.env.BASE_URL = 'http://test.local';
const app = require('../server/index.js');
const notify = require('../server/notify');

let base, server;
test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => server.close());

// عميل صغير مع كوكيز
function client() {
  const jar = {};
  return async (method, url, body, headers = {}) => {
    const r = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); if (/Max-Age=0/.test(c)) delete jar[kv.slice(0, i)]; }
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
  };
}

let code, carId;
const owner = client();

test('تسجيل برقم أردني + OTP', async () => {
  let r = await owner('POST', '/api/auth/request', { phone: '12345' });
  assert.equal(r.status, 400);
  r = await owner('POST', '/api/auth/request', { phone: '0791234567' });
  assert.equal(r.status, 200);
  assert.match(r.body.devCode, /^\d{6}$/);
  r = await owner('POST', '/api/auth/verify', { phone: '0791234567', code: '000000' });
  assert.equal(r.status, 400);
  r = await owner('POST', '/api/auth/verify', { phone: '+962791234567', code: notify.sent.at(-1).body.match(/\d{6}/)[0] });
  assert.equal(r.status, 200);
  r = await owner('GET', '/api/me');
  assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(r.body).includes('1234567'), 'الرقم لازم يكون مقنّع');
});

test('إضافة سيارة (وصف نظيف فقط)', async () => {
  let r = await owner('POST', '/api/cars', { label: 'كيا 0791234567' });
  assert.equal(r.status, 400);
  r = await owner('POST', '/api/cars', { label: 'كيا سبورتج بيضاء' });
  assert.equal(r.status, 200);
  code = r.body.code; carId = r.body.id;
  assert.match(code, /^[A-Z2-9]{8}$/);
  const qr = await owner('GET', `/api/cars/${carId}/qr.svg`);
  assert.match(qr.body, /<svg/);
});

test('رسالة جاهزة توصل لصاحب السيارة بدون رقم المرسل، وبرابط رد', async () => {
  const s = client();
  const before = notify.sent.length;
  const r = await s('POST', `/api/car/${code}/message`, { quick: ['flasher', 'lights'] });
  assert.equal(r.status, 200);
  assert.ok(r.body.thread);
  const n = notify.sent.at(-1);
  assert.equal(notify.sent.length, before + 1);
  assert.equal(n.phone, '+962791234567');
  assert.match(n.body, /الفلاشر/); assert.match(n.body, /أضواء/);
  assert.match(n.body, /http:\/\/test\.local\/m\//);
});

test('رسالة مسيئة: ما بتوصل، وبعد 3 مخالفات إيقاف مؤقت', async () => {
  const s = client();
  const before = notify.sent.length;
  for (let i = 0; i < 3; i++) {
    const r = await s('POST', `/api/car/${code}/message`, { text: 'يا حمار حرك سيارتك', elapsed: 5000 });
    assert.equal(r.status, 422); assert.equal(r.body.reason, 'profanity');
  }
  const r = await s('POST', `/api/car/${code}/message`, { quick: ['window'] });
  assert.equal(r.status, 429);
  assert.equal(notify.sent.length, before, 'ولا رسالة مسيئة بتوصل');
});

test('نص حرّ نظيف يوصل، والأرقام/الروابط ممنوعة، والبوت (honeypot) يتجاهل', async () => {
  let s = client();
  let r = await s('POST', `/api/car/${code}/message`, { text: 'كلمني 0791112233', elapsed: 5000 });
  assert.equal(r.status, 422); assert.equal(r.body.reason, 'contact');

  s = client();
  const before = notify.sent.length;
  r = await s('POST', `/api/car/${code}/message`, { quick: ['window'], website: 'spam' });
  assert.equal(r.status, 200); assert.equal(notify.sent.length, before);

  s = client();
  r = await s('POST', `/api/car/${code}/message`, { text: 'لو سمحت السيارة قدام مدخل العمارة', elapsed: 5000 });
  assert.equal(r.status, 200);
  assert.match(notify.sent.at(-1).body, /قدام مدخل العمارة/);
});

test('رد صاحب السيارة بيوصل للمرسل، والحظر يوقف المرسل بصمت', async () => {
  const s = client();
  let r = await s('POST', `/api/car/${code}/message`, { quick: ['trunk'] });
  const thread = r.body.thread;
  const ownerTok = notify.sent.at(-1).body.match(/\/m\/([\w-]+)/)[1];

  r = await s('GET', `/api/m/${ownerTok}`);
  assert.equal(r.status, 200); assert.ok(r.body.replyOptions.length > 0);
  assert.ok(!JSON.stringify(r.body).includes('962'), 'الرابط السحري ما بيكشف أي رقم');
  r = await s('POST', `/api/m/${ownerTok}/reply`, { key: 'now' });
  assert.equal(r.status, 200);
  r = await s('GET', `/api/thread/${thread}`);
  assert.equal(r.body.replies[0].key, 'now');
  assert.ok(!JSON.stringify(r.body).includes('962'));

  r = await s('POST', `/api/m/${ownerTok}/block`, {});
  assert.equal(r.status, 200);
  const before = notify.sent.length;
  r = await s('POST', `/api/car/${code}/message`, { quick: ['door'] });
  assert.equal(r.status, 200, 'نجاح وهمي');
  assert.equal(notify.sent.length, before, 'بس ما بيوصل شي');
});

test('إيقاف الاستقبال + تدوير الرمز', async () => {
  await owner('PATCH', `/api/cars/${carId}`, { active: false });
  const s = client();
  let r = await s('POST', `/api/car/${code}/message`, { quick: ['door'] });
  assert.equal(r.status, 409);
  await owner('PATCH', `/api/cars/${carId}`, { active: true });
  r = await owner('POST', `/api/cars/${carId}/rotate`);
  assert.notEqual(r.body.code, code);
  r = await s('GET', `/api/car/${code}`);
  assert.equal(r.status, 404, 'الرمز القديم مات');
});

test('حماية: بدون جلسة ممنوع، ومحتوى غير JSON مرفوض، ورسالة مشفّرة بالقاعدة', async () => {
  let r = await client()('GET', '/api/me');
  assert.equal(r.status, 401);
  r = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(r.status, 415);
  const { db } = require('../server/db');
  const raw = db.prepare(`SELECT text_enc FROM messages WHERE text_enc IS NOT NULL`).all();
  assert.ok(raw.length > 0);
  for (const m of raw) assert.ok(m.text_enc.startsWith('v1.') && !m.text_enc.includes('مدخل'));
  const ph = db.prepare('SELECT phone_enc FROM owners').get().phone_enc;
  assert.ok(!ph.includes('791234567'));
});
