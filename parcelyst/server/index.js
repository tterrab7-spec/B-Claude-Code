'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');

// Minimal .env loader (no dependency).
(function loadEnv() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const express = require('express');
const store = require('./store');
const providers = require('./providers');
const billing = require('./billing');
const { createService } = require('../public/js/shared/service.js');
const PSeed = require('../public/js/shared/seed.js');

const scrypt = promisify(crypto.scrypt);
async function hashPassword(pw) { const salt = crypto.randomBytes(16); const key = await scrypt(pw, salt, 64); return 'scrypt$' + salt.toString('hex') + '$' + key.toString('hex'); }
async function verifyPassword(pw, stored) {
  const [alg, s, k] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(s, 'hex'), 64), want = Buffer.from(k, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

// Seed the demo dataset once so every screen works before a provider is connected.
if (process.env.SEED_DEMO !== 'false' && store.countDemo() === 0) {
  const n = store.insertProperties(PSeed.generateAll(), null);
  console.log(`[seed] inserted ${n} demo property records`);
}

const service = createService(store, {
  mode: 'server',
  hashPassword, verifyPassword,
  providers: providers.enabled,
  billingMode: billing.mode,
  liveRates: providers.liveRates,
  lookupExternal: async (address, opts) => {
    if (!opts.paid) { try { const g = await providers.geocode(address); return { record: g ? Object.assign({ source: 'geocode' }, g) : null, tried: ['census'], errors: [] }; } catch (e) { return { record: null, tried: ['census'], errors: [e.message] }; } }
    return providers.lookup(address);
  },
  saveProperty: (rec) => store.saveSharedProperty(rec),
  checkout: async (user, product, baseUrl) => {
    const row = require('./db').one('SELECT * FROM users WHERE id = ?', user.id);
    return billing.checkout(row, product, baseUrl);
  },
  portal: async (user, baseUrl) => billing.portal(require('./db').one('SELECT * FROM users WHERE id = ?', user.id), baseUrl),
  partner: process.env.TAX_PARTNER_NAME ? { name: process.env.TAX_PARTNER_NAME, url: process.env.TAX_PARTNER_URL || null } : null,
  log: (e) => console.error('[api]', e)
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}

// Basic security headers.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Stripe webhook needs the raw body, so it is mounted before the JSON parser.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try { res.json(billing.handleWebhook(req.body.toString('utf8'), req.headers['stripe-signature'])); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});

app.use(express.json({ limit: '26mb' }));

// Light rate limit on auth + lookup endpoints.
const hits = new Map();
function limiter(max, windowMs) {
  return (req, res, next) => {
    const k = req.ip + ':' + req.path, now = Date.now();
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) return res.status(429).json({ error: 'Too many requests. Slow down and try again shortly.' });
    h.push(now); hits.set(k, h); next();
  };
}
app.use('/api/auth', limiter(20, 60_000));
app.use('/api/lookup', limiter(30, 60_000));

app.all(/^\/api\/.*/, async (req, res) => {
  const token = parseCookies(req.headers.cookie).psid || null;
  const baseUrl = process.env.PUBLIC_URL || (req.protocol + '://' + req.get('host'));
  const out = await service.handle(req.method, req.path, req.query, req.body, { token, baseUrl });
  if (out.session !== undefined) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    if (out.session) res.setHeader('Set-Cookie', `psid=${out.session.token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(out.session.exp).toUTCString()}${secure}`);
    else res.setHeader('Set-Cookie', 'psid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  }
  if (out.csv !== undefined) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename || 'export.csv'}"`);
    return res.status(out.status).send(out.csv);
  }
  res.status(out.status).json(out.json);
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html')));

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(PORT, () => {
    const p = providers.enabled();
    console.log(`Parcelyst running on http://localhost:${PORT}`);
    console.log(`  billing: ${billing.mode()} | providers: ${Object.keys(p).filter((k) => p[k]).join(', ') || 'none (demo data + census geocoder)'}`);
  });
}

module.exports = { app, service };
