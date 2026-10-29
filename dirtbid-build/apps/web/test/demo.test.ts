import { beforeEach, describe, expect, it } from 'vitest';
import { buildSeed } from '@/demo/seed';
import { portfolioSummary, projectSummary, cashflow, assistantAnswer, scoreLead, demoRequest, resetDemo } from '@/demo/server';

const near = (a: number, b: number, tolPct = 0.012) => Math.abs(a - b) <= Math.abs(b) * tolPct;

describe('demo seed reconciles with the spec', () => {
  const s = buildSeed();
  it('has the four projects with the stated budget / committed / FAC', () => {
    const want: Record<string, [number, number, number]> = { 'Cascade Ridge Phase 2': [6.4, 4.1, 6.35], 'Alderwood Townhomes': [9.8, 5.9, 9.7], 'Sunset 4-plex': [1.9, 1.85, 1.92], 'Harbor Infill': [3.2, 0.4, 3.2] };
    for (const p of s.projects) { const sm = projectSummary(s, p); const [b, c, f] = want[p.name]!; expect(near(sm.budgetCents, b * 1e8), `${p.name} budget ${sm.budgetCents}`).toBe(true); expect(near(sm.committedCents, c * 1e8), `${p.name} committed ${sm.committedCents}`).toBe(true); expect(near(sm.forecastAtCompletionCents, f * 1e8), `${p.name} fac ${sm.forecastAtCompletionCents}`).toBe(true); }
  });
  it('portfolio totals equal the sum of project summaries', () => {
    const ps = portfolioSummary(s); const sums = s.projects.map((p) => projectSummary(s, p));
    expect(ps.activeProjects).toBe(4);
    expect(ps.constructionBudgetCents).toBe(sums.reduce((a, x) => a + x.budgetCents, 0));
    expect(ps.committedCents).toBe(sums.reduce((a, x) => a + x.committedCents, 0));
    expect(ps.projectsAtRisk).toBe(2);
    expect(ps.projects.find((p) => p.name === 'Cascade Ridge Phase 2')!.drawStatus).toBe('ready');
    expect(ps.projects.find((p) => p.name === 'Alderwood Townhomes')!.drawStatus).toBe('submitted');
    expect(ps.projects.find((p) => p.name === 'Sunset 4-plex')!.drawStatus).toBe('final');
    expect(ps.projects.find((p) => p.name === 'Harbor Infill')!.drawStatus).toBe('none');
  });
  it('seeds 8–12 budget lines per project, invoices in three states, vendors, leads and runs', () => {
    for (const p of s.projects) { const n = s.budgetLines.filter((l) => l.projectId === p.id).length; expect(n).toBeGreaterThanOrEqual(8); expect(n).toBeLessThanOrEqual(14); }
    const st = new Set(s.invoices.map((i) => i.status)); expect(st.has('pending_approval') && st.has('approved') && st.has('paid')).toBe(true);
    expect(s.vendors).toHaveLength(6); expect(s.vendors.filter((v) => +new Date(v.insuranceExpiry) - Date.now() < 25 * 86400000)).toHaveLength(1);
    expect(s.leads).toHaveLength(5); expect(new Set(s.leads.map((l) => l.status)).size).toBeGreaterThanOrEqual(4);
    expect(s.runs).toHaveLength(2); expect(s.runs[0]!.result.scenarios.length).toBeGreaterThan(0); expect(s.runs[1]!.input.marketCode).toBe('ALTADENA_CA');
    expect(s.draws.filter((d) => d.status === 'draft')).toHaveLength(1);
  });
  it('cashflow has 12 weeks and cumulative sums', () => { const cf = cashflow(s, s.projects[0]!); expect(cf.weeks).toHaveLength(12); let c = 0; for (const w of cf.weeks) { c += w.netCents; expect(w.cumulativeCents).toBe(c); } });
  it('assistant answers compute from data', () => {
    expect(assistantAnswer(s, 'Which projects are trending over budget?').answer).toContain('Sunset 4-plex');
    expect(assistantAnswer(s, 'How much cash will we need over the next 30 days?').answer).toMatch(/Net cash need/);
    expect(assistantAnswer(s, 'What lender draws are ready to submit?').answer).toContain('Cascade Ridge');
    expect(assistantAnswer(s, 'Which subcontractor invoices are still missing?').answer.length).toBeGreaterThan(20);
  });
  it('scores leads with the contract rules', () => {
    expect(scoreLead({ kind: 'feasibility_snapshot', contact: { phone: '1' }, property: { ownsLand: true, zip: '23666', lotSize: 12000 }, answers: {}, consent: true })).toBe(60);
    expect(scoreLead({ kind: 'builder_audit', contact: {}, answers: { activeProjects: 5, annualVolume: '5-15m' }, consent: true })).toBe(40);
  });
});

describe('demo request mutations', () => {
  beforeEach(() => { localStorage.clear(); resetDemo(); });
  it('approves an invoice, assembles, submits and funds a draw', async () => {
    const projects = await demoRequest<{ project: { id: string; name: string } }[]>('GET', '/projects');
    const sunset = projects.find((p) => p.project.name === 'Sunset 4-plex')!.project;
    const invs = await demoRequest<{ id: string; status: string }[]>('GET', `/projects/${sunset.id}/invoices`);
    const pending = invs.find((i) => i.status === 'pending_approval')!;
    await demoRequest('POST', `/invoices/${pending.id}/approve`);
    const loans = await demoRequest<{ id: string; drawnCents: number }[]>('GET', `/projects/${sunset.id}/loans`);
    const draw = await demoRequest<{ id: string; totalCents: number; items: unknown[] }>('POST', `/projects/${sunset.id}/draws`, { loanId: loans[0]!.id, periodEnd: '2026-10-31' });
    expect(draw.items.length).toBeGreaterThan(0);
    await demoRequest('POST', `/draws/${draw.id}/submit`);
    await demoRequest('POST', `/draws/${draw.id}/fund`);
    const after = await demoRequest<{ id: string; drawnCents: number }[]>('GET', `/projects/${sunset.id}/loans`);
    const loanMeta = await demoRequest<{ commitmentCents: number }[]>('GET', `/projects/${sunset.id}/loans`);
    expect(after[0]!.drawnCents).toBe(Math.min(loanMeta[0]!.commitmentCents, loans[0]!.drawnCents + draw.totalCents));
    const invs2 = await demoRequest<{ id: string; status: string }[]>('GET', `/projects/${sunset.id}/invoices`);
    expect(invs2.find((i) => i.id === pending.id)!.status).toBe('paid');
  });
  it('creates and converts a lead, persists to localStorage', async () => {
    const r = await demoRequest<{ leadId: string; grade: string }>('POST', '/leads', { kind: 'feasibility_snapshot', contact: { fullName: 'Test Person', email: 'test@example.com', phone: '1' }, property: { address: '1 Main St, Hampton, VA 23666', zip: '23666', lotSize: 12000, ownsLand: true }, consent: true, website: '' });
    expect(['A', 'B']).toContain(r.grade);
    const conv = await demoRequest<{ projectId: string }>('POST', `/leads/${r.leadId}/convert`, { programType: 'boyl' });
    const p = await demoRequest<{ project: { id: string } }>('GET', `/projects/${conv.projectId}`);
    expect(p.project.id).toBe(conv.projectId);
    expect(JSON.parse(localStorage.getItem('dirtbid_demo_state')!).leads[0].id).toBe(r.leadId);
    await expect(demoRequest('POST', '/leads', { kind: 'x', contact: { fullName: 'A', email: 'nope' }, consent: false, website: '' })).rejects.toMatchObject({ code: 'validation' });
  });
  it('creates a feasibility run and reads it back', async () => {
    const r = await demoRequest<{ runId: string }>('POST', '/feasibility/runs', { input: { marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 10000, zoningCode: 'R-10', projectType: 'vacant_land', arvPerSf: 280 }, tier: 'lite' });
    const back = await demoRequest<{ run: { id: string }; report: { sections: unknown[] } }>('GET', `/feasibility/runs/${r.runId}`);
    expect(back.run.id).toBe(r.runId); expect(back.report.sections.length).toBeGreaterThan(3);
  });
});
