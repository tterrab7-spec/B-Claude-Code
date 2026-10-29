import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createProjectWithBudget, makeApp, orgWithMember, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('projects', () => {
  it('creates a project with the 15 default milestones across 5 phases and a summary', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`);
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/projects', headers: auth(owner.token), payload: { name: 'Lot 14 Pinecrest', programType: 'boyl', address: '14 Pinecrest', marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 9000 } });
    expect(r.statusCode).toBe(201);
    const id = r.json().project.id;
    const ms = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${id}/milestones`, headers: auth(owner.token) })).json().items;
    expect(ms).toHaveLength(15);
    expect(new Set(ms.map((m: any) => m.phase)).size).toBe(5);
    const detail = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${id}`, headers: auth(owner.token) })).json();
    expect(detail.summary).toMatchObject({ budgetCents: 0, scheduleStatus: 'on_track', drawStatus: 'none', riskLevel: 'low' });
    expect(detail.summary.nextMilestone.name).toBe('Site intake & data room');
    // completing a milestone advances stage
    const done = await ctx.app.inject({ method: 'PATCH', url: `/v1/milestones/${ms[0].id}`, headers: auth(owner.token), payload: { status: 'complete' } });
    expect(done.json().milestone.actualEnd).toBeTruthy();
    const list = (await ctx.app.inject({ method: 'GET', url: '/v1/projects', headers: auth(owner.token) })).json();
    expect(list.items.some((x: any) => x.project.id === id)).toBe(true);
  });

  it('enforces access: strangers get 403, org members get in, project members read', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`, ['builder']);
    const orgId = await orgWithMember(ctx.app, 'Cascade Homes Test', owner.id);
    const { project } = await createProjectWithBudget(ctx.app, owner.token, orgId);
    const stranger = await userWithToken(ctx.app, `${uniq('stranger')}@example.com`);
    const denied = await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}`, headers: auth(stranger.token) });
    expect(denied.statusCode).toBe(403);
    const deniedWrite = await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/budget`, headers: auth(stranger.token), payload: { csiDivision: '01', code: 'x', description: 'x' } });
    expect(deniedWrite.statusCode).toBe(403);
    const colleague = await userWithToken(ctx.app, `${uniq('pm')}@example.com`, ['builder']);
    await ctx.app.db.insert((await import('../src/db/client.js')).schema.orgMembers).values({ organizationId: orgId, userId: colleague.id, role: 'member' });
    const okOrg = await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}`, headers: auth(colleague.token) });
    expect(okOrg.statusCode).toBe(200);
    const viewer = await userWithToken(ctx.app, `${uniq('viewer')}@example.com`);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/members`, headers: auth(owner.token), payload: { userId: viewer.id, role: 'viewer' } });
    const okRead = await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/budget`, headers: auth(viewer.token) });
    expect(okRead.statusCode).toBe(200);
    const noWrite = await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/invoices`, headers: auth(viewer.token), payload: { budgetLineId: okRead.json().lines[0].id, invoiceNumber: '1', amountCents: 100, invoiceDate: '2026-10-01' } });
    expect(noWrite.statusCode).toBe(403);
    const notMember = await ctx.app.inject({ method: 'GET', url: `/v1/projects?organizationId=${orgId}`, headers: auth(stranger.token) });
    expect(notMember.statusCode).toBe(403);
  });
});
