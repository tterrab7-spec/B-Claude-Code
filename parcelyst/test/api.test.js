'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), 'parcelyst-test-' + process.pid + '.db');
process.env.BILLING_MODE = 'dev';
delete process.env.STRIPE_SECRET_KEY;
const { service } = require('../server/index.js');
const billing = require('../server/billing.js');
const h = (m, p, q, b, t) => service.handle(m, p, q || {}, b || {}, { token: t, baseUrl: 'http://test' });

test.after(() => { for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(process.env.DB_PATH + s); } catch (e) { /* ignore */ } });

test('free user sees masked preview; paid user sees records and can export', async () => {
  const s = await h('POST', '/api/auth/signup', {}, { email: 'free@test.co', password: 'password123' });
  assert.strictEqual(s.status, 200);
  const tok = s.session.token;
  let r = await h('GET', '/api/search', { mode: 'investor', market: 'richmond' }, null, tok);
  assert.strictEqual(r.json.preview, true);
  assert.ok(r.json.results[0].record.address.startsWith('•••'));
  r = await h('GET', '/api/search/export', { mode: 'investor', market: 'richmond' }, null, tok);
  assert.strictEqual(r.status, 402);
  await h('POST', '/api/billing/checkout', {}, { product: 'plan:investor:monthly' }, tok);
  r = await h('GET', '/api/search', { mode: 'investor', market: 'richmond' }, null, tok);
  assert.strictEqual(r.json.preview, false);
  r = await h('GET', '/api/search', { mode: 'investor', market: 'austin' }, null, tok);
  assert.strictEqual(r.json.lockedMarket, true, 'investor plan covers one market');
  r = await h('GET', '/api/search', { mode: 'agent', market: 'richmond' }, null, tok);
  assert.strictEqual(r.json.preview, true, 'prospector needs the agent plan');
  r = await h('GET', '/api/search/export', { mode: 'investor', market: 'richmond', minScore: '60' }, null, tok);
  assert.ok(r.csv.split('\n').length > 1);
});

test('report unlock consumes allowance, then credits, then paywalls', async () => {
  const s = await h('POST', '/api/auth/signup', {}, { email: 'r@test.co', password: 'password123' });
  const tok = s.session.token;
  const a = await h('POST', '/api/analyze', {}, { inputs: { kind: 'residential', price: 200000, rentMonthly: 1800 } }, tok);
  let u = await h('POST', `/api/analyses/${a.json.id}/unlock`, {}, {}, tok);
  assert.strictEqual(u.status, 402);
  await h('POST', '/api/billing/checkout', {}, { product: 'pack:report1' }, tok);
  u = await h('POST', `/api/analyses/${a.json.id}/unlock`, {}, {}, tok);
  assert.strictEqual(u.json.via, 'credit');
  const sh = await h('POST', `/api/analyses/${a.json.id}/share`, {}, {}, tok);
  const pub = await h('GET', '/api/shared/' + sh.json.token);
  assert.strictEqual(pub.status, 200);
  const other = await h('POST', '/api/auth/signup', {}, { email: 'o@test.co', password: 'password123' });
  const peek = await h('GET', `/api/analyses/${a.json.id}`, {}, null, other.session.token);
  assert.strictEqual(peek.status, 404, 'analyses are private');
});

test('csv import maps headers, stamps list signal and stays private', async () => {
  const s = await h('POST', '/api/auth/signup', {}, { email: 'i@test.co', password: 'password123' });
  const tok = s.session.token;
  await h('POST', '/api/billing/checkout', {}, { product: 'plan:investor:monthly' }, tok);
  const csv = 'Situs Address,Zip,Taxpayer,Mailing Address,Mail State,Amount Due\n"77 Quail Run",23831,Heirs of A Smith,"9 Elm Rd",GA,"$2,100"\n';
  const r = await h('POST', '/api/import', {}, { csv, listType: 'taxDelinquent', filename: 'treasurer.csv' }, tok);
  assert.strictEqual(r.json.imported, 1);
  const f = await h('GET', '/api/search', { mode: 'investor', market: 'richmond', q: 'quail' }, null, tok);
  assert.strictEqual(f.json.total, 1);
  const keys = f.json.results[0].signals.map((x) => x.key);
  assert.ok(keys.includes('taxDelinquent') && keys.includes('probate') && keys.includes('absentee'));
  const s2 = await h('POST', '/api/auth/signup', {}, { email: 'j@test.co', password: 'password123' });
  await h('POST', '/api/billing/checkout', {}, { product: 'plan:investor:monthly' }, s2.session.token);
  const f2 = await h('GET', '/api/search', { mode: 'investor', market: 'richmond', q: 'quail' }, null, s2.session.token);
  assert.strictEqual(f2.json.total, 0);
});

test('stripe webhook signature verification', () => {
  const crypto = require('crypto');
  const body = '{"type":"ping"}', t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_x').update(t + '.' + body).digest('hex');
  assert.ok(billing.verifySignature(body, `t=${t},v1=${sig}`, 'whsec_x'));
  assert.ok(!billing.verifySignature(body, `t=${t},v1=${sig}`, 'whsec_y'));
});
