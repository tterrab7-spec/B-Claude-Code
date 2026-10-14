'use strict';
// SQLite implementation of the store interface consumed by public/js/shared/service.js.
const crypto = require('crypto');
const { one, all, run, tx } = require('./db');
const { normAddr } = require('../public/js/shared/service.js');

const J = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };

function userOut(r) {
  if (!r) return null;
  return {
    id: r.id, email: r.email, name: r.name, passHash: r.pass_hash, role: r.role, isAdmin: !!r.is_admin,
    plan: r.plan, planInterval: r.plan_interval, planStatus: r.plan_status, planRenewsAt: r.plan_renews_at,
    credits: r.credits, markets: J(r.markets, []), extraMarkets: r.extra_markets || 0, branding: J(r.branding, {}),
    stripeCustomer: r.stripe_customer, teamOwnerId: r.team_owner_id, createdAt: r.created_at
  };
}
const USER_COLS = { name: 'name', role: 'role', plan: 'plan', credits: 'credits', markets: 'markets', branding: 'branding', teamOwnerId: 'team_owner_id', extraMarkets: 'extra_markets', planInterval: 'plan_interval', planStatus: 'plan_status', isAdmin: 'is_admin' };

function analysisOut(r) {
  if (!r) return null;
  return { id: r.id, userId: r.user_id, kind: r.kind, title: r.title, inputs: J(r.inputs, {}), summary: J(r.summary, {}), unlocked: !!r.unlocked, shareToken: r.share_token, createdAt: r.created_at, updatedAt: r.updated_at };
}

const sharedCache = new Map();
function sharedFor(market) {
  if (!sharedCache.has(market)) sharedCache.set(market, all('SELECT data FROM properties WHERE owner_user_id IS NULL AND market = ?', market).map((r) => JSON.parse(r.data)));
  return sharedCache.get(market);
}

const store = {
  getUserByEmail: (e) => userOut(one('SELECT * FROM users WHERE email = ?', e)),
  getUserById: (id) => userOut(one('SELECT * FROM users WHERE id = ?', id)),
  getUserBySession(token) {
    const s = one('SELECT * FROM sessions WHERE token = ?', token);
    if (!s) return null;
    if (s.expires_at < new Date().toISOString()) { run('DELETE FROM sessions WHERE token = ?', token); return null; }
    return userOut(one('SELECT * FROM users WHERE id = ?', s.user_id));
  },
  createUser(u) {
    const r = run('INSERT INTO users (email, name, pass_hash, role, plan, credits, markets, branding, team_owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      u.email, u.name || '', u.passHash, u.role || 'investor', u.plan || 'free', u.credits || 0, JSON.stringify(u.markets || []), JSON.stringify(u.branding || {}), u.teamOwnerId || null);
    if (process.env.ADMIN_EMAILS && process.env.ADMIN_EMAILS.split(',').map((s) => s.trim().toLowerCase()).includes(u.email)) run('UPDATE users SET is_admin = 1 WHERE id = ?', r.lastInsertRowid);
    return store.getUserById(Number(r.lastInsertRowid));
  },
  updateUser(id, patch) {
    for (const k in patch) {
      const col = USER_COLS[k]; if (!col) continue;
      let v = patch[k]; if (k === 'markets' || k === 'branding') v = JSON.stringify(v); if (typeof v === 'boolean') v = v ? 1 : 0;
      run(`UPDATE users SET ${col} = ? WHERE id = ?`, v === undefined ? null : v, id);
    }
  },
  createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 30 * 864e5).toISOString();
    run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, exp);
    return { token, exp };
  },
  deleteSession: (t) => run('DELETE FROM sessions WHERE token = ?', t),

  usageGet: (uid, month, metric) => { const r = one('SELECT n FROM usage WHERE user_id = ? AND month = ? AND metric = ?', uid, month, metric); return r ? r.n : 0; },
  usageInc: (uid, month, metric, n) => run('INSERT INTO usage (user_id, month, metric, n) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, month, metric) DO UPDATE SET n = n + excluded.n', uid, month, metric, n),

  listProperties(market, ownerId) {
    const shared = sharedFor(market);
    if (!ownerId) return shared;
    const own = all('SELECT data FROM properties WHERE owner_user_id = ? AND market = ?', ownerId, market).map((r) => JSON.parse(r.data));
    if (!own.length) return shared;
    // User imports override demo/provider rows at the same address.
    const ownAddr = new Set(own.map((r) => normAddr(r.address) + '|' + (r.zip || '')));
    return own.concat(shared.filter((r) => !ownAddr.has(normAddr(r.address) + '|' + (r.zip || ''))));
  },
  findPropertyByAddress(n, zip, ownerId) {
    const rows = all('SELECT data, owner_user_id FROM properties WHERE address = ? AND (owner_user_id IS NULL OR owner_user_id = ?)', n, ownerId || -1).map((r) => ({ d: JSON.parse(r.data), own: r.owner_user_id }));
    const hits = rows.filter((r) => !zip || !r.d.zip || r.d.zip === zip).sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0) || (a.d.source === 'demo' ? 1 : 0) - (b.d.source === 'demo' ? 1 : 0));
    return hits.length ? hits[0].d : null;
  },
  getProperty(id, ownerId) {
    const r = one('SELECT data FROM properties WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)', id, ownerId || -1);
    return r ? JSON.parse(r.data) : null;
  },
  insertProperties(records, ownerId) {
    let n = 0;
    tx(() => {
      for (const rec of records) {
        run('INSERT OR REPLACE INTO properties (id, owner_user_id, market, asset_type, zip, address, source, data, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))',
          rec.id, ownerId || null, rec.market || null, rec.assetType || null, rec.zip || null, normAddr(rec.address), rec.source || null, JSON.stringify(rec));
        n++;
      }
    });
    if (!ownerId) sharedCache.clear();
    return n;
  },
  saveSharedProperty(rec) {
    if (!rec || !rec.id) return;
    run('INSERT OR REPLACE INTO properties (id, owner_user_id, market, asset_type, zip, address, source, data, updated_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, datetime(\'now\'))',
      rec.id, rec.market || null, rec.assetType || null, rec.zip || null, normAddr(rec.address), rec.source || null, JSON.stringify(rec));
    if (rec.market) sharedCache.delete(rec.market);
  },
  countDemo: () => one("SELECT COUNT(*) AS n FROM properties WHERE source = 'demo'").n,

  insertAnalysis: (a) => run('INSERT INTO analyses (id, user_id, kind, title, inputs, summary, unlocked) VALUES (?, ?, ?, ?, ?, ?, ?)', a.id, a.userId, a.kind, a.title, JSON.stringify(a.inputs), JSON.stringify(a.summary), a.unlocked ? 1 : 0),
  getAnalysis: (id) => analysisOut(one('SELECT * FROM analyses WHERE id = ?', id)),
  getAnalysisByShare: (t) => analysisOut(one('SELECT * FROM analyses WHERE share_token = ?', t)),
  listAnalyses: (uid) => all('SELECT * FROM analyses WHERE user_id = ? ORDER BY updated_at DESC LIMIT 500', uid).map(analysisOut),
  updateAnalysis(id, p) {
    if (p.inputs) run('UPDATE analyses SET inputs = ? WHERE id = ?', JSON.stringify(p.inputs), id);
    if (p.summary) run('UPDATE analyses SET summary = ? WHERE id = ?', JSON.stringify(p.summary), id);
    if (p.title) run('UPDATE analyses SET title = ? WHERE id = ?', p.title, id);
    if (p.kind) run('UPDATE analyses SET kind = ? WHERE id = ?', p.kind, id);
    if (p.unlocked !== undefined) run('UPDATE analyses SET unlocked = ? WHERE id = ?', p.unlocked ? 1 : 0, id);
    if (p.shareToken) run('UPDATE analyses SET share_token = ? WHERE id = ?', p.shareToken, id);
    run("UPDATE analyses SET updated_at = datetime('now') WHERE id = ?", id);
  },
  deleteAnalysis: (id) => run('DELETE FROM analyses WHERE id = ?', id),

  listSearches: (uid) => all('SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC', uid).map((r) => ({ id: r.id, userId: r.user_id, name: r.name, mode: r.mode, filters: J(r.filters, {}), lastCount: r.last_count, lastRun: r.last_run, createdAt: r.created_at })),
  insertSearch: (s) => Number(run('INSERT INTO saved_searches (user_id, name, mode, filters, last_count, last_run) VALUES (?, ?, ?, ?, ?, ?)', s.userId, s.name, s.mode, JSON.stringify(s.filters), s.lastCount, s.lastRun).lastInsertRowid),
  getSearch: (id) => { const r = one('SELECT * FROM saved_searches WHERE id = ?', id); return r ? { id: r.id, userId: r.user_id, name: r.name, mode: r.mode, filters: J(r.filters, {}), lastCount: r.last_count, lastRun: r.last_run } : null; },
  updateSearch: (id, p) => run('UPDATE saved_searches SET last_count = ?, last_run = ? WHERE id = ?', p.lastCount, p.lastRun, id),
  deleteSearch: (id) => run('DELETE FROM saved_searches WHERE id = ?', id),

  listPipeline: (uid) => all('SELECT * FROM pipeline WHERE user_id = ? ORDER BY updated_at DESC', uid).map((r) => ({ id: r.id, propertyId: r.property_id, mode: r.mode, stage: r.stage, note: r.note, score: r.score, snapshot: J(r.snapshot, {}), createdAt: r.created_at, updatedAt: r.updated_at })),
  upsertPipeline(p) {
    run(`INSERT INTO pipeline (user_id, property_id, mode, stage, note, score, snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, property_id) DO UPDATE SET mode = excluded.mode, score = excluded.score, snapshot = excluded.snapshot, updated_at = datetime('now')`,
    p.userId, p.propertyId, p.mode, p.stage, p.note, p.score, JSON.stringify(p.snapshot));
    return one('SELECT id FROM pipeline WHERE user_id = ? AND property_id = ?', p.userId, p.propertyId).id;
  },
  getPipeline: (id) => { const r = one('SELECT * FROM pipeline WHERE id = ?', id); return r ? { id: r.id, userId: r.user_id } : null; },
  updatePipeline(id, p) {
    if (p.stage) run('UPDATE pipeline SET stage = ? WHERE id = ?', p.stage, id);
    if (p.note !== undefined) run('UPDATE pipeline SET note = ? WHERE id = ?', p.note, id);
    run("UPDATE pipeline SET updated_at = datetime('now') WHERE id = ?", id);
  },
  deletePipeline: (id) => run('DELETE FROM pipeline WHERE id = ?', id),

  insertImport: (i) => run('INSERT INTO imports (user_id, filename, market, rows) VALUES (?, ?, ?, ?)', i.userId, i.filename, i.market, i.rows),
  listImports: (uid) => all('SELECT * FROM imports WHERE user_id = ? ORDER BY created_at DESC', uid),
  listPayments: (uid) => all('SELECT product, amount_cents, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC', uid),
  listTeam: (ownerId) => all('SELECT * FROM users WHERE team_owner_id = ?', ownerId).map(userOut),
  insertLead: (l) => run('INSERT INTO leads (kind, name, email, phone, message, meta) VALUES (?, ?, ?, ?, ?, ?)', l.kind, l.name, l.email, l.phone, l.message, JSON.stringify(l.meta || {})),

  adminStats() {
    return {
      users: one('SELECT COUNT(*) n FROM users').n,
      byPlan: all('SELECT plan, COUNT(*) n FROM users GROUP BY plan'),
      analyses: one('SELECT COUNT(*) n FROM analyses').n,
      revenueCents: one("SELECT COALESCE(SUM(amount_cents),0) n FROM payments WHERE status = 'paid'").n,
      leads: all('SELECT kind, name, email, phone, message, created_at FROM leads ORDER BY created_at DESC LIMIT 100'),
      properties: all('SELECT source, COUNT(*) n FROM properties GROUP BY source')
    };
  }
};

module.exports = store;
