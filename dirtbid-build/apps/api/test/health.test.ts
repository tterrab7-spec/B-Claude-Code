import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('system', () => {
  it('reports health with a live db', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: true });
  });
  it('serves OpenAPI json and docs ui', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/leads', '/feasibility/runs', '/projects/{id}/draws', '/assistant/ask']));
    const ui = await ctx.app.inject({ method: 'GET', url: '/docs' });
    expect([200, 302]).toContain(ui.statusCode);
  });
  it('lists markets and the service catalog', async () => {
    const m = await ctx.app.inject({ method: 'GET', url: '/v1/markets' });
    expect(m.json().map((x: any) => x.code)).toEqual(expect.arrayContaining(['ALTADENA_CA', 'HAMPTON_ROADS_VA']));
    const s = await ctx.app.inject({ method: 'GET', url: '/v1/services' });
    const enhanced = s.json().find((x: any) => x.code === 'feasibility_enhanced');
    expect(enhanced.priceCents).toBe(75000);
    expect(enhanced.creditBack).toEqual({ toService: 'design_predev', windowDays: 90 });
  });
  it('returns the standard error envelope for unknown routes and bad bodies', async () => {
    const nf = await ctx.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('not_found');
    const bad = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: { kind: 'bogus' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation');
    expect(bad.json().error.fields).toBeTruthy();
  });
});
