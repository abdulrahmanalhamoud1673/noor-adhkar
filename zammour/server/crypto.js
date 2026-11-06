'use strict';
const crypto = require('node:crypto');
const cfg = require('./config');

// AES-256-GCM: الصيغة v1.iv.tag.ciphertext (base64url)
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cfg.encKey, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct].map((x, i) => (i ? x.toString('base64url') : x)).join('.');
}
function decrypt(blob) {
  const [v, iv, tag, ct] = String(blob).split('.');
  if (v !== 'v1') throw new Error('bad blob');
  const d = crypto.createDecipheriv('aes-256-gcm', cfg.encKey, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
const mac = (s) => crypto.createHmac('sha256', cfg.macKey).update(String(s)).digest('base64url');
const token = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
// رمز السيارة: 8 خانات بدون حروف متشابهة (0/O, 1/I/L)
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function carCode() {
  const b = crypto.randomBytes(8);
  return Array.from(b, (x) => ALPHA[x % ALPHA.length]).join('');
}
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
module.exports = { encrypt, decrypt, mac, token, carCode, safeEq };
