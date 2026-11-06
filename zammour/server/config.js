'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const isProd = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// مفاتيح التشفير: في الإنتاج لازم تيجي من البيئة. في التطوير نولّدها ونحفظها محلياً.
function secret(name) {
  if (process.env[name]) return Buffer.from(process.env[name], 'hex');
  if (isProd) throw new Error(`${name} مطلوب في الإنتاج (32 بايت hex). ولّده: openssl rand -hex 32`);
  const f = path.join(dataDir, `.dev-${name}`);
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT || 3000),
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  dbFile: path.join(dataDir, 'zammour.db'),
  encKey: secret('ENC_KEY'),       // تشفير الرسائل والأرقام
  macKey: secret('MAC_KEY'),       // توقيع الجلسات + تجزئة الـIP والأرقام
  notifier: process.env.NOTIFIER || 'console', // console | twilio-sms | whatsapp
  turnstileSecret: process.env.TURNSTILE_SECRET || '',
  turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0,
  brand: 'زمّور',
};
