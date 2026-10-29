import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scoreLead } from '../src/modules/leads/service.js';
import { auth, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

const base = (over: Record<string, any> = {}) => ({ kind: 'feasibility_snapshot', contact: { fullName: 'Jane Landowner', email: `${uniq('jane')}@example.com`, phone: '757-555-0100' }, property: { address: '12 Oak St', city: 'Hampton', state: 'VA', zip: '23666', lotSize: 12000, lotSizeUnit: 'sf', ownsLand: true }, answers: { budget: 450000, targetTimeline: '6-12 months' }, consent: true, website: '', ...over });

describe('lead scoring', () => {
  it('scores per the contract table', () => {
    const r = scoreLead(base() as any);
    // ownsLand 25 + budget 15 + timeline 10 + zip 15 + lot 10 + consent 5 + phone 5 = 85
    expect(r.score).toBe(85);
    expect(r.grade).toBe('A');
    const weak = scoreLead(base({ property: {}, answers: {}, contact: { fullName: 'X Y', email: 'x@example.com' } }) as any);
    expect(weak.score).toBe(5);
    expect(weak.grade).toBe('D');
    const builder = scoreLead(base({ kind: 'builder_audit', property: {}, answers: { activeProjects: 4, annualVolume: 8000000 } }) as any);
    expect(builder.score).toBe(45); // consent 5 + phone 5 + 20 + 15
    expect(builder.grade).toBe('C');
  });
});

describe('POST /leads', () => {
  it('creates, scores, emits events and dedupes within 30 days', async () => {
    const payload = base();
    const r1 = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload });
    expect(r1.statusCode).toBe(201);
    expect(r1.json()).toMatchObject({ grade: 'A', score: 85, nextStep: { type: 'report_queued' } });
    const r2 = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().leadId).toBe(r1.json().leadId);
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const detail = await ctx.app.inject({ method: 'GET', url: `/v1/leads/${r1.json().leadId}`, headers: auth(staff.token) });
    expect(detail.json().lead.marketCode).toBe('HAMPTON_ROADS_VA');
    expect(detail.json().events.map((e: any) => e.type)).toEqual(expect.arrayContaining(['created', 'duplicate_submission']));
    const events = await ctx.app.inject({ method: 'GET', url: '/v1/events?type=lead.qualified', headers: auth(staff.token) });
    expect(events.json().items.some((e: any) => e.data.leadId === r1.json().leadId)).toBe(true);
  });

  it('rejects honeypot, disposable email and missing consent', async () => {
    const hp = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: base({ website: 'http://spam' }) });
    expect(hp.statusCode).toBe(400);
    const disp = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: base({ contact: { fullName: 'Spam Bot', email: 'x@mailinator.com' } }) });
    expect(disp.statusCode).toBe(400);
    expect(disp.json().error.fields['contact.email']).toBeTruthy();
    const nc = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: base({ consent: false }) });
    expect(nc.statusCode).toBe(400);
  });

  it('sends a magic link for homeowner rebuild and returns a checkout for enhanced report', async () => {
    const before = ctx.sent.length;
    const h = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: base({ kind: 'homeowner_rebuild', answers: { situation: 'rebuild', eatonFireAffected: 'yes' } }) });
    expect(h.statusCode).toBe(201);
    expect(h.json().nextStep.type).toBe('magic_link_sent');
    expect(ctx.sent.length).toBe(before + 1);
    expect(ctx.sent.at(-1)?.template).toBe('magic_link');
    const e = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: base({ kind: 'feasibility_enhanced' }) });
    expect(e.json().nextStep.type).toBe('checkout');
    expect(e.json().nextStep.url).toContain('/checkout/');
  });

  it('staff can list, filter, patch status and convert to a project', async () => {
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const created = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: base({ kind: 'strategy_call' }) });
    const id = created.json().leadId;
    const anon = await ctx.app.inject({ method: 'GET', url: '/v1/leads' });
    expect(anon.statusCode).toBe(401);
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`);
    const notStaff = await ctx.app.inject({ method: 'GET', url: '/v1/leads', headers: auth(owner.token) });
    expect(notStaff.statusCode).toBe(403);
    const list = await ctx.app.inject({ method: 'GET', url: '/v1/leads?kind=strategy_call&grade=A', headers: auth(staff.token) });
    expect(list.json().items.some((l: any) => l.id === id)).toBe(true);
    const patched = await ctx.app.inject({ method: 'PATCH', url: `/v1/leads/${id}`, headers: auth(staff.token), payload: { status: 'qualified', notes: 'Called back' } });
    expect(patched.json().lead.status).toBe('qualified');
    const conv = await ctx.app.inject({ method: 'POST', url: `/v1/leads/${id}/convert`, headers: auth(staff.token), payload: { programType: 'boyl' } });
    expect(conv.statusCode).toBe(201);
    expect(conv.json().projectId).toBeTruthy();
    const proj = await ctx.app.inject({ method: 'GET', url: `/v1/projects/${conv.json().projectId}`, headers: auth(staff.token) });
    expect(proj.json().project.programType).toBe('boyl');
    const audit = await ctx.app.inject({ method: 'GET', url: '/v1/admin/audit', headers: auth(staff.token) });
    expect(audit.json().items.some((a: any) => a.action === 'lead.convert' && a.entityId === id)).toBe(true);
  });
});
