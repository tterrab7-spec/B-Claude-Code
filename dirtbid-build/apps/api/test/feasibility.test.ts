import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

const input = { address: '45 Pine Ave, Hampton, VA 23666', marketCode: 'HAMPTON_ROADS_VA', zip: '23666', lotSizeSf: 12000, zoningCode: 'R-10', arvPerSf: 290, projectType: 'vacant_land', site: { floodZone: 'X', rpaBuffer: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } };

describe('feasibility runs', () => {
  it('runs the engine anonymously and returns a lite report', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/runs', payload: { input } });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.result.scenarios.length).toBeGreaterThan(0);
    expect(body.report.tier).toBe('lite');
    expect(body.report.sections.map((s: any) => s.key)).toEqual(['zoning', 'utilities', 'environmental', 'comps']);
    expect(body.accessToken).toBeTruthy();
    // token-based read for emailed links
    const read = await ctx.app.inject({ method: 'GET', url: `/v1/feasibility/runs/${body.runId}?access=${body.accessToken}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().enhancedAvailable).toBe(false);
    const noAccess = await ctx.app.inject({ method: 'GET', url: `/v1/feasibility/runs/${body.runId}` });
    expect(noAccess.statusCode).toBe(401);
  });

  it('maps engine validation errors to 400 with field names', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/runs', payload: { input: { ...input, projectType: 'fire_rebuild' } } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.fields['input.existingStructureSf']).toBeTruthy();
    const unknown = await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/runs', payload: { input: { ...input, marketCode: 'MARS' } } });
    expect(unknown.statusCode).toBe(400);
  });

  it('gates the enhanced report behind a paid order, unlocked by dev mark-paid', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('buyer')}@example.com`);
    const run = (await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/runs', headers: auth(owner.token), payload: { input } })).json();
    const gated = await ctx.app.inject({ method: 'GET', url: `/v1/feasibility/runs/${run.runId}/report?tier=enhanced`, headers: auth(owner.token) });
    expect(gated.statusCode).toBe(403);
    const order = (await ctx.app.inject({ method: 'POST', url: '/v1/orders', headers: auth(owner.token), payload: { serviceCode: 'feasibility_enhanced', runId: run.runId } })).json();
    expect(order.amountCents).toBe(75000);
    await ctx.app.inject({ method: 'POST', url: `/v1/orders/${order.orderId}/mark-paid` });
    const ok = await ctx.app.inject({ method: 'GET', url: `/v1/feasibility/runs/${run.runId}/report?tier=enhanced`, headers: auth(owner.token) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().sections.map((s: any) => s.key)).toContain('proforma');
    const mine = await ctx.app.inject({ method: 'GET', url: '/v1/feasibility/runs', headers: auth(owner.token) });
    expect(mine.json().items.some((x: any) => x.id === run.runId)).toBe(true);
  });

  it('staff review re-runs the engine, bumps the version and delivers by email', async () => {
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`);
    const run = (await ctx.app.inject({ method: 'POST', url: '/v1/feasibility/runs', headers: auth(owner.token), payload: { input } })).json();
    const notStaff = await ctx.app.inject({ method: 'POST', url: `/v1/feasibility/runs/${run.runId}/review`, headers: auth(owner.token), payload: { analystNotes: 'x' } });
    expect(notStaff.statusCode).toBe(403);
    const review = await ctx.app.inject({ method: 'POST', url: `/v1/feasibility/runs/${run.runId}/review`, headers: auth(staff.token), payload: { input: { arvPerSf: 320 }, analystNotes: 'Comps support $320/sf after reviewing 4 closed sales.' } });
    expect(review.statusCode).toBe(200);
    expect(review.json().run.version).toBe(2);
    expect(review.json().run.status).toBe('reviewed');
    expect(review.json().result.comps.arvPerSfUsed).toBe(320);
    const before = ctx.sent.length;
    const deliver = await ctx.app.inject({ method: 'POST', url: `/v1/feasibility/runs/${run.runId}/deliver`, headers: auth(staff.token), payload: { tier: 'enhanced' } });
    expect(deliver.statusCode).toBe(200);
    expect(deliver.json().run.status).toBe('delivered');
    expect(ctx.sent.length).toBe(before + 1);
    expect(ctx.sent.at(-1)?.to).toBe(owner.email);
    expect(ctx.sent.at(-1)?.text).toContain('access=');
  });
});
