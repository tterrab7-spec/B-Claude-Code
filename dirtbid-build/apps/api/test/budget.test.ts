import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth, createProjectWithBudget, makeApp, uniq, userWithToken, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(async () => { await ctx.app.close(); });

describe('budget math', () => {
  it('computes revised, committed, invoiced, paid, FAC and variance per contract', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`, ['builder']);
    const { project, lines } = await createProjectWithBudget(ctx.app, owner.token);
    const concrete = lines[0]; const framing = lines[1];
    const h = auth(owner.token);
    await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/commitments`, headers: h, payload: { budgetLineId: concrete.id, description: 'Concrete sub', amountCents: 19_000_000 } });
    const inv1 = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/invoices`, headers: h, payload: { budgetLineId: concrete.id, invoiceNumber: 'C-1', amountCents: 8_000_000, invoiceDate: '2026-09-15', dueDate: '2026-10-15' } })).json().invoice;
    const inv2 = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/invoices`, headers: h, payload: { budgetLineId: concrete.id, invoiceNumber: 'C-2', amountCents: 4_000_000, invoiceDate: '2026-10-01', dueDate: '2026-10-31' } })).json().invoice;
    // pending invoices do not count
    let b = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/budget`, headers: h })).json();
    let c = b.lines.find((l: any) => l.id === concrete.id);
    expect(c).toMatchObject({ csiDivisionName: 'Concrete', committedCents: 19_000_000, invoicedCents: 0, paidCents: 0, revisedCents: 20_000_000, forecastAtCompletionCents: 20_000_000, varianceCents: 0 });
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv1.id}/approve`, headers: h });
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv1.id}/mark-paid`, headers: h });
    await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv2.id}/approve`, headers: h });
    // set FTC on concrete: FAC = paid 8M + unpaid 4M + FTC 9.5M = 21.5M → variance -1.5M
    await ctx.app.inject({ method: 'PATCH', url: `/v1/budget-lines/${concrete.id}`, headers: h, payload: { forecastToCompleteCents: 9_500_000 } });
    // change order on framing +2M approved → revised 32M
    const co = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/change-orders`, headers: h, payload: { budgetLineId: framing.id, description: 'Engineered lumber upgrade', amountCents: 2_000_000, daysImpact: 5, reason: 'Owner request' } })).json().changeOrder;
    expect(co.number).toBe(1);
    const approved = await ctx.app.inject({ method: 'POST', url: `/v1/change-orders/${co.id}/approve`, headers: h });
    expect(approved.json().changeOrder.status).toBe('approved');
    const twice = await ctx.app.inject({ method: 'POST', url: `/v1/change-orders/${co.id}/approve`, headers: h });
    expect(twice.statusCode).toBe(409);

    b = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/budget`, headers: h })).json();
    c = b.lines.find((l: any) => l.id === concrete.id);
    const f = b.lines.find((l: any) => l.id === framing.id);
    expect(c).toMatchObject({ invoicedCents: 12_000_000, paidCents: 8_000_000, forecastToCompleteCents: 9_500_000, forecastAtCompletionCents: 21_500_000, varianceCents: -1_500_000 });
    expect(f).toMatchObject({ approvedChangesCents: 2_000_000, revisedCents: 32_000_000, forecastAtCompletionCents: 32_000_000, varianceCents: 0 });
    expect(b.totals).toMatchObject({ originalCents: 60_000_000, approvedChangesCents: 2_000_000, revisedCents: 62_000_000, committedCents: 19_000_000, invoicedCents: 12_000_000, paidCents: 8_000_000, forecastAtCompletionCents: 63_500_000, varianceCents: -1_500_000 });
    expect(b.totals.percentComplete).toBe(13);
    // variance alert emitted (>2% over)
    const staff = await userWithToken(ctx.app, `${uniq('staff')}@dirtbid.local`, ['staff']);
    const ev = (await ctx.app.inject({ method: 'GET', url: '/v1/events?type=budget.variance_alert', headers: auth(staff.token) })).json().items;
    expect(ev.some((e: any) => e.data.projectId === project.id)).toBe(true);
  });

  it('enforces the invoice state machine', async () => {
    const owner = await userWithToken(ctx.app, `${uniq('owner')}@example.com`, ['builder']);
    const { project, lines } = await createProjectWithBudget(ctx.app, owner.token);
    const h = auth(owner.token);
    const inv = (await ctx.app.inject({ method: 'POST', url: `/v1/projects/${project.id}/invoices`, headers: h, payload: { budgetLineId: lines[2].id, invoiceNumber: 'E-1', amountCents: 500_000, invoiceDate: '2026-10-01' } })).json().invoice;
    expect(inv.status).toBe('pending_approval');
    const payEarly = await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv.id}/mark-paid`, headers: h });
    expect(payEarly.statusCode).toBe(409);
    const rej = await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv.id}/reject`, headers: h, payload: { note: 'Wrong PO' } });
    expect(rej.json().invoice.status).toBe('rejected');
    const approveRejected = await ctx.app.inject({ method: 'POST', url: `/v1/invoices/${inv.id}/approve`, headers: h });
    expect(approveRejected.statusCode).toBe(409);
    const pending = (await ctx.app.inject({ method: 'GET', url: `/v1/projects/${project.id}/invoices?status=pending_approval`, headers: h })).json().items;
    expect(pending).toHaveLength(0);
  });
});
