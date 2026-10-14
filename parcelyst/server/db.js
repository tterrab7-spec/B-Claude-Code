'use strict';
// SQLite via Node's built-in driver (node:sqlite). One file, zero native deps.
// Swap for Postgres (RDS) later by reimplementing this module's small surface.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'parcelyst.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  pass_hash TEXT NOT NULL,
  role TEXT DEFAULT 'investor',
  is_admin INTEGER DEFAULT 0,
  plan TEXT DEFAULT 'free',
  plan_interval TEXT,
  plan_status TEXT DEFAULT 'active',
  plan_renews_at TEXT,
  credits INTEGER DEFAULT 0,
  markets TEXT DEFAULT '[]',
  extra_markets INTEGER DEFAULT 0,
  branding TEXT DEFAULT '{}',
  stripe_customer TEXT,
  stripe_subscription TEXT,
  team_owner_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  owner_user_id INTEGER,
  market TEXT,
  asset_type TEXT,
  zip TEXT,
  address TEXT,
  source TEXT,
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prop_market ON properties(market);
CREATE INDEX IF NOT EXISTS idx_prop_owner ON properties(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_prop_addr ON properties(address);
CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT,
  title TEXT,
  inputs TEXT,
  summary TEXT,
  unlocked INTEGER DEFAULT 0,
  share_token TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id);
CREATE TABLE IF NOT EXISTS usage (
  user_id INTEGER, month TEXT, metric TEXT, n INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, month, metric)
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT, mode TEXT, filters TEXT, last_count INTEGER DEFAULT 0, last_run TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pipeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  property_id TEXT, mode TEXT, stage TEXT DEFAULT 'New', note TEXT, score INTEGER,
  snapshot TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, property_id)
);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, filename TEXT, market TEXT, rows INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, provider_ref TEXT UNIQUE, product TEXT, amount_cents INTEGER, status TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT, name TEXT, email TEXT, phone TEXT, message TEXT, meta TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

function one(sql, ...p) { return db.prepare(sql).get(...p) || null; }
function all(sql, ...p) { return db.prepare(sql).all(...p); }
function run(sql, ...p) { return db.prepare(sql).run(...p); }
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, one, all, run, tx, DB_PATH };
