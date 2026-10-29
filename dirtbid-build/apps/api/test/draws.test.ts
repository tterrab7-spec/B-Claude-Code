import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createProjectWithBudget, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

describe('draws and cash flow', () => {
  it('assembles a draw from approved invoices, submits, funds, pays invoices and bumps the loan', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`, ['builder']);
    const { project, lines } = await createProjectWithBudget(ctx.app, owner.token);
    const h = auth(owner.token);
    const loan = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/loans`, headers: h, payload: { lender: 'TowneBank', commitmentCents: 50_000_000, rateBps: 850, retainagePct: 10 } })).json().loan;
    const empty = await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/draws`, headers: h, payload: { loanId: loan.id, periodEnd: plusDays(0) } });
    expect(empty.statusCode).toBe(409);
    const mk = async (n: string, line: any, amt: number) => (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/invoices`, headers: h, payload: { budgetLineId: line.id, invoiceNumber: n, amountCents: amt, invoiceDate: plusDays(-10), dueDate: plusDays(5) } })).json().invoice;
    const a = await mk('A', lines[0], 5_000_000); const b = await mk('B', lines[1], 3_000_000); const c = await mk('C', lines[2], 1_000_000);
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${a.id}/approve`, headers: h });
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${b.id}/approve`, headers: h });
    // c stays pending and must not be drawn
    const draw = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/draws`, headers: h, payload: { loanId: loan.id, periodEnd: plusDays(0) } })).json();
    expect(draw.items).toBe(2);
    expect(draw.draw).toMatchObject({ number: 1, status: 'draft', requestedCents: 8_000_000, retainageHeldCents: 800_000 });
    const detail = (await ctx.app.inject({ method: 'GET', url: `/v1/draws/${draw.draw.id}`, headers: h })).json();
    expect(detail.items).toHaveLength(2);
    expect(detail.totals.netCents).toBe(7_200_000);
    const inDraw = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/invoices?status=in_draw`, headers: h })).json().items;
    expect(inDraw.map((i: any) => i.invoiceNumber).sort()).toEqual(['A', 'B']);
    const summary = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}`, headers: h })).json().summary;
    expect(summary.drawStatus).toBe('ready');

    const fundEarly = await ctx.app.inject({ method: 'POST', url: `/v1/draws/${draw.draw.id}/submit`, headers: h, payload: { expectedFundingDate: plusDays(10) } });
    expect(fundEarly.json().draw.status).toBe('submitted');
    const funded = (await ctx.app.inject({ method: 'POST', url: `/v1/draws/${draw.draw.id}/fund`, headers: h })).json();
    expect(funded.draw.status).toBe('funded');
    expect(funded.draw.fundedCents).toBe(7_200_000);
    expect(funded.invoicesPaid).toBe(2);
    const paid = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/invoices?status=paid`, headers: h })).json().items;
    expect(paid).toHaveLength(2);
    const loans = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/loans`, headers: h })).json().items;
    expect(loans[0].drawnCents).toBe(7_200_000);
    const again = await ctx.app.inject({ method: 'POST', url: `/v1/draws/${draw.draw.id}/fund`, headers: h });
    expect(again.statusCode).toBe(409);
    const budget = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/budget`, headers: h })).json();
    expect(budget.totals.paidCents).toBe(8_000_000);
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const types = (await ctx.app.inject({ method: 'GET', url: '/v1/events', headers: auth(staff.token) })).json().items.filter((e: any) => e.data.projectId === project.id).map((e: any) => e.type);
    expect(types).toEqual(expect.arrayContaining(['draw.ready', 'draw.submitted', 'draw.funded', 'invoice.pending_approval', 'invoice.approved']));
  });

  it('builds a 12-week cash flow and flags a shortfall from scheduled spend', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`, ['builder']);
    const { project, lines } = await createProjectWithBudget(ctx.app, owner.token);
    const h = auth(owner.token);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/schedule`, headers: h, payload: { name: 'Framing', start: plusDays(-7), end: plusDays(35), percentComplete: 20 } });
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/schedule`, headers: h, payload: { name: 'MEP rough', start: plusDays(28), end: plusDays(70), percentComplete: 0 } });
    const inv = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/invoices`, headers: h, payload: { budgetLineId: lines[0].id, invoiceNumber: 'X', amountCents: 2_000_000, invoiceDate: plusDays(-3), dueDate: plusDays(10) } })).json().invoice;
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv.id}/approve`, headers: h });
    const cf = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/cashflow`, headers: h })).json();
    expect(cf.weeks).toHaveLength(12);
    expect(cf.weeks[0]).toHaveProperty('weekStart');
    const totalOut = cf.weeks.reduce((s: number, w: any) => s + w.outflowsCents, 0);
    expect(totalOut).toBeGreaterThan(2_000_000);
    expect(cf.shortfall).not.toBeNull();
    expect(cf.shortfall.amountCents).toBeGreaterThan(0);
    expect(cf.weeks.at(-1).cumulativeCents).toBeLessThan(0);
    // a draw expected to fund reduces the need
    const loan = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/loans`, headers: h, payload: { lender: 'Atlantic Union', commitmentCents: 80_000_000 } })).json().loan;
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/draws`, headers: h, payload: { loanId: loan.id, periodEnd: plusDays(0), expectedFundingDate: plusDays(7) } });
    const cf2 = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/cashflow?weeks=8`, headers: h })).json();
    expect(cf2.weeks).toHaveLength(8);
    expect(cf2.weeks.reduce((s: number, w: any) => s + w.inflowsCents, 0)).toBeGreaterThan(0);
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const alerts = (await ctx.app.inject({ method: 'GET', url: '/v1/events?type=cash.shortfall_alert', headers: auth(staff.token) })).json().items;
    expect(alerts.some((e: any) => e.data.projectId === project.id)).toBe(true);
  });
});
