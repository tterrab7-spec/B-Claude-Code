import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('admin', () => {
  it('exposes pipeline and metrics to staff only', async () => {
    await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: { kind: 'strategy_call', contact: { fullName: 'Pipe Line', email: `${uniq('p')}@example.com`, phone: '1' }, consent: true } });
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const owner = await userWithToken(ctx.app, `${uniq('o')}@example.com`);
    expect((await ctx.app.inject({ method: 'GET', url: '/v1/admin/pipeline', headers: auth(owner.token) })).statusCode).toBe(403);
    const pipe = (await ctx.app.inject({ method: 'GET', url: '/v1/admin/pipeline', headers: auth(staff.token) })).json();
    expect(pipe.stages.map((s: any) => s.status)).toEqual(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'nurture']);
    expect(pipe.stages[0].count).toBeGreaterThanOrEqual(1);
    const m = (await ctx.app.inject({ method: 'GET', url: '/v1/admin/metrics', headers: auth(staff.token) })).json();
    expect(m.leads7d).toBeGreaterThanOrEqual(1);
    expect(m).toHaveProperty('revenue30dCents');
    expect(m).toHaveProperty('conversionRate');
  });
});
