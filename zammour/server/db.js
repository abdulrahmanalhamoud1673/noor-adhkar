'use strict';
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

const db = new DatabaseSync(process.env.DB_FILE || cfg.dbFile);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY,
  phone_hash TEXT NOT NULL UNIQUE,   -- HMAC للرقم (للبحث)
  phone_enc  TEXT NOT NULL,          -- الرقم مشفّر
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,         -- الرمز اللي بالـQR
  label TEXT NOT NULL,               -- مثلاً: "كيا سبورتج بيضاء" (بدون رقم لوحة)
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  sender_hash TEXT NOT NULL,         -- HMAC(IP) — ما نخزّن الـIP نفسه
  device_hash TEXT NOT NULL,
  quick_keys TEXT NOT NULL DEFAULT '',
  text_enc TEXT,                     -- نص حرّ مشفّر (اختياري)
  status TEXT NOT NULL,              -- delivered | blocked | failed
  reason TEXT,
  owner_token TEXT UNIQUE,           -- رابط الرد لصاحب السيارة
  thread_token TEXT UNIQUE,          -- رابط المتابعة لمن بعث
  notified_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_car ON messages(car_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_sender ON messages(sender_hash, created_at);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reply_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  sender_hash TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (car_id, sender_hash, device_hash)
);

CREATE TABLE IF NOT EXISTS otps (
  phone_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hits (        -- عدّاد بسيط للحدود (rate limit)
  k TEXT NOT NULL, at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hits ON hits(k, at);
`);

const now = () => Date.now();
module.exports = { db, now };
