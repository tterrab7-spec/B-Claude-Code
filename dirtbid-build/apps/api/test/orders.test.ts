import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('orders and credits', () => {
  it('paid enhanced report issues a 90-day credit that auto-applies to design', async () => {
    const buyer = await userWithToken(ctx.app, `${uniq('buyer')}@example.com`);
    const o = (await ctx.app.inject({ method: 'POST', url: '/v1/orders', headers: auth(buyer.token), payload: { serviceCode: 'feasibility_enhanced' } })).json();
    expect(o.status).toBe('awaiting_payment');
    const paid = await ctx.app.inject({ method: 'POST', url: `/v1/orders/${o.orderId}/mark-paid` });
    expect(paid.json().order.status).toBe('paid');
    // idempotent
    const again = await ctx.app.inject({ method: 'POST', url: `/v1/orders/${o.orderId}/mark-paid` });
    expect(again.json().order.paidAt).toBe(paid.json().order.paidAt);

    const credits = (await ctx.app.inject({ method: 'GET', url: '/v1/credits', headers: auth(buyer.token) })).json().items;
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ appliesTo: 'design_predev', amountCents: 75000, status: 'available' });
    const days = (new Date(credits[0].expiresAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(90.01);

    const design = (await ctx.app.inject({ method: 'POST', url: '/v1/orders', headers: auth(buyer.token), payload: { serviceCode: 'design_predev' } })).json();
    expect(design.creditAppliedCents).toBe(75000);
    expect(design.amountCents).toBe(425000);
    const after = (await ctx.app.inject({ method: 'GET', url: '/v1/credits', headers: auth(buyer.token) })).json().items;
    expect(after[0].status).toBe('applied');
    expect(after[0].appliedOrderId).toBe(design.orderId);
  });

  it('refuses quote-only services and anonymous purchase of gated services', async () => {
    const buyer = await userWithToken(ctx.app, `${uniq('buyer')}@example.com`);
    const q = await ctx.app.inject({ method: 'POST', url: '/v1/orders', headers: auth(buyer.token), payload: { serviceCode: 'entitlement' } });
    expect(q.statusCode).toBe(400);
    const anon = await ctx.app.inject({ method: 'POST', url: '/v1/orders', payload: { serviceCode: 'design_predev', email: 'a@example.com' } });
    expect(anon.statusCode).toBe(401);
    const pub = await ctx.app.inject({ method: 'POST', url: '/v1/orders', payload: { serviceCode: 'feasibility_enhanced', email: `${uniq('anon')}@example.com` } });
    expect(pub.statusCode).toBe(201);
    const read = await ctx.app.inject({ method: 'GET', url: `/v1/orders/${pub.json().orderId}` });
    expect(read.json().order.status).toBe('awaiting_payment');
    expect(read.json().order.email).toBeUndefined();
  });

  it('rejects the stripe webhook when Stripe is not configured', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/webhooks/stripe', payload: { type: 'checkout.session.completed' }, headers: { 'stripe-signature': 't=1,v1=abc' } });
    expect(r.statusCode).toBe(403);
  });
});
