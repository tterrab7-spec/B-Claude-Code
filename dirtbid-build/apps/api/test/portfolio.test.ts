import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createProjectWithBudget, makeApp, orgWithMember, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('portfolio, investors, vendors, assistant', () => {
  it('summarizes an organization portfolio, generates and sends investor reports, compares bids, and answers the six questions', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('builder')}@example.com`, ['builder']);
    const orgId = await orgWithMember(ctx.app, 'Cascade Homes', owner.id);
    const h = auth(owner.token);
    const p1 = await createProjectWithBudget(ctx.app, owner.token, orgId);
    const p2 = await createProjectWithBudget(ctx.app, owner.token, orgId);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p1.project.id}/loans`, headers: h, payload: { lender: 'TowneBank', commitmentCents: 50_000_000, drawnCents: 10_000_000 } });
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p1.project.id}/commitments`, headers: h, payload: { budgetLineId: p1.lines[0].id, description: 'Concrete sub', amountCents: 21_000_000 } });
    const inv = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p1.project.id}/invoices`, headers: h, payload: { budgetLineId: p1.lines[0].id, invoiceNumber: 'C-9', amountCents: 21_000_000, invoiceDate: '2026-10-01', dueDate: '2026-10-20' } })).json().invoice;
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv.id}/approve`, headers: h });
    await ctx.app.inject({ method: 'PATCH', url: `/v1/budget-lines/${p1.lines[0].id}`, headers: h, payload: { forecastToCompleteCents: 2_000_000 } }); // FAC 23M vs 20M → over
    const investor = await userWithToken(ctx.app, `${uniq('lp')}@example.com`, ['investor']);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p1.project.id}/investors`, headers: h, payload: { userId: investor.id, commitmentCents: 25_000_000, ownershipPct: 40 } });

    const s = (await ctx.app.inject({ method: 'GET', url: `/v1/portfolio/summary?organizationId=${orgId}`, headers: h })).json();
    expect(s.activeProjects).toBe(2);
    expect(s.constructionBudgetCents).toBe(120_000_000);
    expect(s.committedCents).toBe(21_000_000);
    expect(s.forecastAtCompletionCents).toBe(123_000_000);
    expect(s.remainingLoanProceedsCents).toBe(40_000_000);
    expect(s.projectsAtRisk).toBeGreaterThanOrEqual(1);
    expect(s.reportsDue).toBe(1);
    expect(s.projects.find((p: any) => p.id === p1.project.id).riskLevel).toBe('high');
    const implicit = (await ctx.app.inject({ method: 'GET', url: '/v1/portfolio/summary', headers: h })).json();
    expect(implicit.activeProjects).toBe(2);

    // investor report
    const rep = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p1.project.id}/reports`, headers: h, payload: { period: '2026-10' } })).json().report;
    expect(rep.status).toBe('draft');
    expect(rep.html).toContain('Investor report');
    expect(rep.data.budget.varianceCents).toBe(-3_000_000);
    const html = await ctx.app.inject({ method: 'GET', url: `/v1/reports/${rep.id}?format=html`, headers: h });
    expect(html.headers['content-type']).toContain('text/html');
    const before = ctx.sent.length;
    const sent = (await ctx.app.inject({ method: 'POST', url: `/v1/reports/${rep.id}/send`, headers: h })).json();
    expect(sent.recipients).toBe(1);
    expect(ctx.sent.length).toBe(before + 1);
    expect(ctx.sent.at(-1)?.to).toBe(investor.email);
    const lpView = await ctx.app.inject({ method: 'GET', url: `/v1/projects/${p1.project.id}/reports`, headers: auth(investor.token) });
    expect(lpView.statusCode).toBe(200);
    expect(lpView.json().items[0].status).toBe('sent');
    const afterSend = (await ctx.app.inject({ method: 'GET', url: `/v1/portfolio/summary?organizationId=${orgId}`, headers: h })).json();
    expect(afterSend.reportsDue).toBe(0);

    // capital call notifies investors with their share
    const cc = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p1.project.id}/capital-calls`, headers: h, payload: { amountCents: 10_000_000, dueDate: '2026-11-15', memo: 'Framing draw gap' } })).json();
    expect(cc.notified).toBe(1);
    expect(ctx.sent.at(-1)?.text).toContain('$40,000');

    // vendors + compliance + bids
    const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const v1 = (await ctx.app.inject({ method: 'POST', url: '/v1/vendors', headers: h, payload: { name: 'Tidewater Concrete', trades: ['concrete'], insuranceExpiry: soon, rating: 4 } })).json().vendor;
    const v2 = (await ctx.app.inject({ method: 'POST', url: '/v1/vendors', headers: h, payload: { name: 'Peninsula Foundations', trades: ['concrete'], insuranceExpiry: '2027-12-31', rating: 5 } })).json().vendor;
    const expiring = (await ctx.app.inject({ method: 'GET', url: '/v1/vendors?expiringWithinDays=30', headers: h })).json().items;
    expect(expiring.map((v: any) => v.id)).toContain(v1.id);
    expect(expiring.map((v: any) => v.id)).not.toContain(v2.id);
    const byTrade = (await ctx.app.inject({ method: 'GET', url: '/v1/vendors?trade=concrete', headers: h })).json().items;
    expect(byTrade.length).toBeGreaterThanOrEqual(2);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p2.project.id}/bids`, headers: h, payload: { scopeCode: '03-30-00', vendorId: v1.id, amountCents: 22_000_000, leadTimeDays: 14 } });
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${p2.project.id}/bids`, headers: h, payload: { scopeCode: '03-30-00', vendorId: v2.id, amountCents: 19_500_000, leadTimeDays: 21 } });
    const cmp = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${p2.project.id}/bids/compare?scopeCode=03-30-00`, headers: h })).json();
    expect(cmp.count).toBe(2);
    expect(cmp.bids[0].vendorName).toBe('Peninsula Foundations');
    expect(cmp.budgetLine.budgetCents).toBe(20_000_000);
    expect(cmp.bids[1].deltaToLowCents).toBe(2_500_000);
    expect(cmp.spreadCents).toBe(2_500_000);
    expect(cmp.recommendation).toContain('Peninsula');

    // assistant (rules mode)
    const ask = async (question: string) => (await ctx.app.inject({ method: 'POST', url: '/v1/assistant/ask', headers: h, payload: { question, organizationId: orgId } })).json();
    const q1 = await ask('Which projects are trending over budget?');
    expect(q1.model).toBe('rules');
    expect(q1.answer).toContain(p1.project.name);
    expect(q1.answer).toMatch(/\$30,000 overrun/);
    expect(q1.actions[0].type).toBe('open_project');
    const q2 = await ask('How much cash will we need over the next 30 days?');
    expect(q2.answer).toMatch(/need about \$|No cash shortfall/);
    expect(q2.data.days).toBe(30);
    const q3 = await ask('Which subcontractor invoices are still missing?');
    expect(q3.data).toHaveProperty('uninvoicedCommitments');
    const q4 = await ask('What lender draws are ready to submit?');
    expect(q4.answer).toContain('approved invoices not yet in a draw');
    expect(q4.actions.some((a: any) => a.type === 'create_draw')).toBe(true);
    const q5 = (await ctx.app.inject({ method: 'POST', url: '/v1/assistant/ask', headers: h, payload: { question: "Generate this month's investor report.", projectId: p1.project.id } })).json();
    expect(q5.answer).toContain('Generated');
    expect(q5.actions[0].type).toBe('generate_report');
    const q6 = await ask('Give me a portfolio overview');
    expect(q6.answer).toContain('2 active projects');
    const stranger = await userWithToken(ctx.app, `${uniq('stranger')}@example.com`);
    const denied = await ctx.app.inject({ method: 'POST', url: '/v1/assistant/ask', headers: auth(stranger.token), payload: { question: 'Which projects are over budget?', organizationId: orgId } });
    expect(denied.statusCode).toBe(403);
  });
});
