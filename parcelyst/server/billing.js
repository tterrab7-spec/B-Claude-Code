'use strict';
/*
 * Stripe billing over the REST API (no SDK). Products:
 *   plan:<investor|agent|pro>:<monthly|annual>   subscription, 7-day trial
 *   pack:<report1|report5|report15>              one-time credit pack
 *   addon:market                                  subscription add-on
 * Price IDs: STRIPE_PRICE_<PLAN>_<INTERVAL>, STRIPE_PRICE_<PACK>, STRIPE_PRICE_ADDON_MARKET (see .env.example).
 * BILLING_MODE=dev applies purchases instantly without Stripe (local testing only).
 */
const crypto = require('crypto');
const PPlans = require('../public/js/shared/plans.js');
const { one, run } = require('./db');

const STRIPE = 'https://api.stripe.com/v1';
const mode = () => (process.env.STRIPE_SECRET_KEY ? 'stripe' : process.env.BILLING_MODE === 'dev' ? 'dev' : 'off');

function priceIdFor(product) {
  const key = 'STRIPE_PRICE_' + product.replace(/^plan:|^pack:|^addon:/, '').replace(/:/g, '_').toUpperCase();
  return process.env[key] || null;
}
function validProduct(p) {
  const [kind, id, interval] = String(p || '').split(':');
  if (kind === 'plan') return ['investor', 'agent', 'pro'].includes(id) && ['monthly', 'annual'].includes(interval);
  if (kind === 'pack') return !!PPlans.PACKS[id];
  if (kind === 'addon') return id === 'market';
  return false;
}

function form(obj, prefix, out) {
  out = out || [];
  for (const k in obj) {
    const v = obj[k], key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') form(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(v));
  }
  return out.join('&');
}
async function stripe(path, body, method) {
  const res = await fetch(STRIPE + path, {
    method: method || 'POST',
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? form(body) : undefined
  });
  const j = await res.json();
  if (!res.ok) throw new Error((j.error && j.error.message) || 'Stripe error ' + res.status);
  return j;
}

function applyProduct(userId, product, ref, amountCents) {
  if (ref && one('SELECT id FROM payments WHERE provider_ref = ?', ref)) return; // idempotent
  const [kind, id, interval] = product.split(':');
  if (kind === 'plan') {
    const renews = new Date(Date.now() + (interval === 'annual' ? 365 : 30) * 864e5).toISOString();
    run('UPDATE users SET plan = ?, plan_interval = ?, plan_status = ?, plan_renews_at = ? WHERE id = ?', id, interval, 'active', renews, userId);
  } else if (kind === 'pack') {
    run('UPDATE users SET credits = credits + ? WHERE id = ?', PPlans.PACKS[id].credits, userId);
  } else if (kind === 'addon' && id === 'market') {
    run('UPDATE users SET extra_markets = extra_markets + 1 WHERE id = ?', userId);
  }
  run('INSERT INTO payments (user_id, provider_ref, product, amount_cents, status) VALUES (?, ?, ?, ?, ?)', userId, ref || ('dev-' + crypto.randomUUID()), product, amountCents || 0, 'paid');
}

function devPrice(product) {
  const [kind, id, interval] = product.split(':');
  if (kind === 'plan') { const p = PPlans.PLANS[id]; return Math.round((interval === 'annual' ? p.annualMonthly * 12 : p.monthly) * 100); }
  if (kind === 'pack') return PPlans.PACKS[id].price * 100;
  return PPlans.ADDONS.market.price * 100;
}

async function checkout(user, product, baseUrl) {
  if (!validProduct(product)) { const e = new Error('Unknown product'); e.status = 400; throw e; }
  const m = mode();
  if (m === 'off') { const e = new Error('Billing is not configured on this server. Set STRIPE_SECRET_KEY (or BILLING_MODE=dev for testing).'); e.status = 503; throw e; }
  if (m === 'dev') { applyProduct(user.id, product, null, devPrice(product)); return { url: baseUrl + '/app/account.html?purchased=' + encodeURIComponent(product), dev: true }; }
  const price = priceIdFor(product);
  if (!price) { const e = new Error('Missing Stripe price ID for ' + product); e.status = 500; throw e; }
  const isSub = product.startsWith('plan:') || product.startsWith('addon:');
  const body = {
    mode: isSub ? 'subscription' : 'payment',
    'line_items': { 0: { price, quantity: 1 } },
    success_url: baseUrl + '/app/account.html?purchased=' + encodeURIComponent(product) + '&session={CHECKOUT_SESSION_ID}',
    cancel_url: baseUrl + '/pricing.html?canceled=1',
    client_reference_id: String(user.id),
    allow_promotion_codes: 'true',
    metadata: { product, user_id: String(user.id) }
  };
  if (user.stripe_customer) body.customer = user.stripe_customer; else body.customer_email = user.email;
  if (isSub) { body.subscription_data = { metadata: { product, user_id: String(user.id) } }; if (product.startsWith('plan:') && user.plan === 'free') body.subscription_data.trial_period_days = Number(process.env.TRIAL_DAYS || 7); }
  const s = await stripe('/checkout/sessions', body);
  return { url: s.url };
}

async function portal(user, baseUrl) {
  if (mode() !== 'stripe' || !user.stripe_customer) { const e = new Error('No billing account yet'); e.status = 400; throw e; }
  const s = await stripe('/billing_portal/sessions', { customer: user.stripe_customer, return_url: baseUrl + '/app/account.html' });
  return { url: s.url };
}

function verifySignature(raw, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + raw).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handleWebhook(raw, sig) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !verifySignature(raw, sig, secret)) { const e = new Error('Bad signature'); e.status = 400; throw e; }
  const evt = JSON.parse(raw);
  const o = evt.data && evt.data.object;
  switch (evt.type) {
    case 'checkout.session.completed': {
      const uid = Number(o.client_reference_id || (o.metadata && o.metadata.user_id));
      const product = o.metadata && o.metadata.product;
      if (uid && product) {
        if (o.customer) run('UPDATE users SET stripe_customer = ? WHERE id = ?', o.customer, uid);
        if (o.subscription && product.startsWith('plan:')) run('UPDATE users SET stripe_subscription = ? WHERE id = ?', o.subscription, uid);
        applyProduct(uid, product, o.id, o.amount_total);
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const u = one('SELECT * FROM users WHERE stripe_subscription = ? OR stripe_customer = ?', o.id, o.customer);
      if (!u) break;
      const product = (o.metadata && o.metadata.product) || '';
      if (product && !product.startsWith('plan:')) break;
      if (evt.type === 'customer.subscription.deleted' || ['canceled', 'unpaid', 'incomplete_expired'].includes(o.status)) run("UPDATE users SET plan = 'free', plan_status = ?, stripe_subscription = NULL WHERE id = ?", o.status || 'canceled', u.id);
      else run('UPDATE users SET plan_status = ?, plan_renews_at = ? WHERE id = ?', o.status, o.current_period_end ? new Date(o.current_period_end * 1000).toISOString() : u.plan_renews_at, u.id);
      break;
    }
    default: break;
  }
  return { received: true, type: evt.type };
}

module.exports = { mode, checkout, portal, handleWebhook, applyProduct, verifySignature, validProduct };
