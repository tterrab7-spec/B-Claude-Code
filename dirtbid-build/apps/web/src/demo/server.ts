/**
 * In-memory implementation of docs/API_CONTRACT.md for demo mode.
 * Same paths, same shapes as the real API; state persisted to localStorage.
 */
import { underwrite, buildReport, listMarkets, UnderwritingError, type UnderwritingInput } from '@dirtbid/underwriting';
import { ApiError } from '@/lib/api';
import { DEMO_STATE_KEY } from '@/lib/demo';
import { buildSeed, SEED_VERSION, STAFF_TOKEN, BUILDER_TOKEN, ORG_ID, type DemoState, type DLead, type DProject, type DInvoice, type DDraw, type DRun } from './seed';
import { FALLBACK_SERVICES } from '@/pages/Pricing';

let state: DemoState | null = null;
let seq = 1000;
const nid = (p: string) => `${p}_${(++seq).toString(36)}${Date.now().toString(36).slice(-3)}`;
const nowIso = () => new Date().toISOString();

function load(): DemoState {
  if (state) return state;
  try {
    const raw = localStorage.getItem(DEMO_STATE_KEY);
    if (raw) { const parsed = JSON.parse(raw) as DemoState; if (parsed.version === SEED_VERSION) { state = parsed; return state; } }
  } catch { /* ignore */ }
  state = buildSeed();
  save();
  return state;
}
function save(): void { try { if (state) localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(state)); } catch { /* ignore */ } }
export function resetDemo(): void { state = buildSeed(); save(); }
export function demoToken(): string | null { return load().currentToken; }

const notFound = (what: string): never => { throw new ApiError('not_found', `${what} not found`, {}, 404); };
const bad = (message: string, fields: Record<string, string> = {}): never => { throw new ApiError('validation', message, fields, 400); };

// ---------- auth ----------
function userFromToken(token: string | null) {
  const s = load();
  if (!token) return null;
  if (token === STAFF_TOKEN || token.startsWith('demo:staff')) return s.users.find((u) => u.id === 'usr_staff') ?? null;
  if (token === BUILDER_TOKEN || token.startsWith('demo:builder')) return s.users.find((u) => u.id === 'usr_builder') ?? null;
  if (token.startsWith('demo:user:')) return s.users.find((u) => u.id === token.slice('demo:user:'.length)) ?? null;
  return s.users.find((u) => u.id === 'usr_staff') ?? null;
}
const publicUser = (u: NonNullable<ReturnType<typeof userFromToken>>) => { const s = load(); return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, roles: u.roles, organizations: s.orgs.filter((o) => u.organizationIds.includes(o.id)) }; };

// ---------- scoring (contract rules) ----------
const ACTIVE_ZIPS = new Set(['23666', '23669', '23602', '23606', '23692', '23185', '23456', '23322', '23435', '23518', '91001', '91104', '91103', '91011', '91024']);
export function scoreLead(body: { kind: string; contact: { phone?: string }; property?: Record<string, unknown>; answers?: Record<string, unknown>; consent?: boolean }): number {
  const p = body.property ?? {}; const a = body.answers ?? {}; let s = 0;
  if (p.ownsLand === true) s += 25;
  const budget = String(a.budget ?? ''); if (/^(400|600|>9|>900)/.test(budget) || Number(a.budget) >= 400000) s += 15;
  const tl = String(a.targetTimeline ?? a.timeline ?? ''); if (/^(<6|6-12)/.test(tl)) s += 10;
  const zip = String(p.zip ?? (String(p.address ?? '').match(/\b(\d{5})\b/)?.[1] ?? '')); if (ACTIVE_ZIPS.has(zip)) s += 15;
  const lot = Number(p.lotSize ?? 0) * (p.lotSizeUnit === 'acres' ? 43560 : 1); if (lot >= 5000) s += 10;
  if (body.consent) s += 5; if (body.contact.phone) s += 5;
  if (body.kind === 'strategy_call' || body.kind === 'feasibility_enhanced') s += 15;
  if (body.kind.startsWith('builder')) { if (Number(a.activeProjects ?? 0) >= 3) s += 20; const vol = String(a.annualVolume ?? ''); if (/^(5-15m|15-50m|>50m)/.test(vol) || Number(a.annualVolume) >= 5_000_000) s += 15; }
  return Math.min(100, s);
}
const gradeOf = (s: number): DLead['grade'] => (s >= 70 ? 'A' : s >= 50 ? 'B' : s >= 30 ? 'C' : 'D');
const DISPOSABLE = new Set(['mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'yopmail.com']);

// ---------- derived numbers ----------
function lineView(s: DemoState, lineId: string) {
  const l = s.budgetLines.find((x) => x.id === lineId)!;
  const committed = s.commitments.filter((c) => c.budgetLineId === l.id).reduce((a, c) => a + c.amountCents, 0);
  const invs = s.invoices.filter((i) => i.budgetLineId === l.id && i.status !== 'rejected');
  const invoiced = invs.reduce((a, i) => a + i.amountCents, 0);
  const paid = invs.filter((i) => i.status === 'paid').reduce((a, i) => a + i.amountCents, 0);
  const revised = l.originalCents + l.approvedChangesCents;
  const fac = invoiced + l.forecastToCompleteCents;
  return { id: l.id, csiDivision: l.csiDivision, code: l.code, description: l.description, originalCents: l.originalCents, approvedChangesCents: l.approvedChangesCents, revisedCents: revised, committedCents: committed, invoicedCents: invoiced, paidCents: paid, forecastToCompleteCents: l.forecastToCompleteCents, forecastAtCompletionCents: fac, varianceCents: fac - revised };
}
function drawStatusOf(s: DemoState, p: DProject): string {
  const draws = s.draws.filter((d) => d.projectId === p.id);
  if (draws.some((d) => d.status === 'draft')) return 'ready';
  if (draws.some((d) => d.status === 'submitted')) return 'submitted';
  if (p.stage === 'punch' && draws.length) return 'final';
  return draws.length ? 'funded' : 'none';
}
export function projectSummary(s: DemoState, p: DProject) {
  const lines = s.budgetLines.filter((l) => l.projectId === p.id).map((l) => lineView(s, l.id));
  const sum = (k: keyof ReturnType<typeof lineView>) => lines.reduce((a, l) => a + (l[k] as number), 0);
  const budget = sum('revisedCents'), fac = sum('forecastAtCompletionCents');
  const sched = s.scheduleItems.filter((x) => x.projectId === p.id);
  const pc = sched.length ? sched.reduce((a, x) => a + x.percentComplete, 0) / (sched.length * 100) : 0;
  const next = s.milestones.filter((m) => m.projectId === p.id && m.status !== 'complete').sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd))[0];
  return { budgetCents: budget, committedCents: sum('committedCents'), invoicedCents: sum('invoicedCents'), paidCents: sum('paidCents'), forecastAtCompletionCents: fac, varianceCents: fac - budget, percentComplete: Number(pc.toFixed(3)), scheduleStatus: p.scheduleStatus, nextMilestone: next ? { name: next.name, plannedEnd: next.plannedEnd } : null, openInvoices: s.invoices.filter((i) => i.projectId === p.id && (i.status === 'pending_approval' || i.status === 'approved')).length, drawStatus: drawStatusOf(s, p), riskLevel: p.riskLevel };
}
function weekStart(d: Date): Date { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x; }
export function cashflow(s: DemoState, p: DProject, weeks = 12) {
  const start = weekStart(new Date()); const W = 7 * 86400000;
  const out = new Array<number>(weeks).fill(0), inn = new Array<number>(weeks).fill(0);
  const idx = (iso: string) => Math.min(weeks - 1, Math.max(0, Math.floor((+new Date(iso) - +start) / W)));
  // open invoices land on their due week
  for (const i of s.invoices.filter((x) => x.projectId === p.id && (x.status === 'approved' || x.status === 'pending_approval'))) out[idx(i.dueDate)]! += i.amountCents;
  // remaining forecast-to-complete beyond open invoices spreads across remaining schedule weeks
  const openTotal = s.invoices.filter((x) => x.projectId === p.id && (x.status === 'approved' || x.status === 'pending_approval')).reduce((a, x) => a + x.amountCents, 0);
  const ftc = s.budgetLines.filter((l) => l.projectId === p.id).reduce((a, l) => a + l.forecastToCompleteCents, 0) - openTotal;
  const end = Math.max(...s.scheduleItems.filter((x) => x.projectId === p.id).map((x) => +new Date(x.end)), +start + W);
  const remainingWeeks = Math.max(1, Math.ceil((end - +start) / W));
  const perWeek = Math.max(0, ftc) / remainingWeeks;
  for (let w = 1; w < weeks; w++) if (w < remainingWeeks) out[w]! += Math.round(perWeek);
  // inflows: submitted draws fund next week, draft draws in two weeks; thereafter lender reimburses 75% of prior-week spend with a 2-week lag while capacity remains
  const loan = s.loans.find((l) => l.projectId === p.id);
  let capacity = loan ? loan.commitmentCents - loan.drawnCents : 0;
  for (const d of s.draws.filter((x) => x.projectId === p.id)) { if (d.status === 'submitted') { inn[1]! += Math.min(capacity, d.totalCents); capacity -= Math.min(capacity, d.totalCents); } else if (d.status === 'draft') { inn[2]! += Math.min(capacity, d.totalCents); capacity -= Math.min(capacity, d.totalCents); } }
  for (let w = 3; w < weeks; w++) { const reimb = Math.min(capacity, Math.round(out[w - 2]! * 0.75)); inn[w]! += reimb; capacity -= reimb; }
  let cum = 0; let worstCum = 0; let worstWeek = '';
  const rows = out.map((o, w) => { const net = inn[w]! - o; cum += net; const ws = new Date(+start + w * W).toISOString(); if (cum < worstCum) { worstCum = cum; worstWeek = ws; } return { weekStart: ws, outflowsCents: Math.round(o), inflowsCents: Math.round(inn[w]!), netCents: Math.round(net), cumulativeCents: Math.round(cum) }; });
  const shortfall = worstCum < 0 ? { weekStart: worstWeek, amountCents: -worstCum } : null;
  return { weeks: rows, shortfall };
}
export function portfolioSummary(s: DemoState, orgId: string = ORG_ID) {
  const projects = s.projects.filter((p) => p.organizationId === orgId && p.status === 'active');
  const sums = projects.map((p) => ({ p, sm: projectSummary(s, p), cf: cashflow(s, p, 5) }));
  const period = new Date().toISOString().slice(0, 7);
  const loans = s.loans.filter((l) => projects.some((p) => p.id === l.projectId));
  return {
    activeProjects: projects.length,
    constructionBudgetCents: sums.reduce((a, x) => a + x.sm.budgetCents, 0),
    committedCents: sums.reduce((a, x) => a + x.sm.committedCents, 0),
    forecastAtCompletionCents: sums.reduce((a, x) => a + x.sm.forecastAtCompletionCents, 0),
    remainingLoanProceedsCents: loans.reduce((a, l) => a + (l.commitmentCents - l.drawnCents), 0),
    cashNeeded30dCents: sums.reduce((a, x) => a + Math.max(0, x.cf.weeks.slice(0, 5).reduce((b, w) => b + w.outflowsCents - w.inflowsCents, 0)), 0),
    projectsAtRisk: projects.filter((p) => p.riskLevel !== 'low').length,
    reportsDue: projects.filter((p) => s.investors.some((i) => i.projectId === p.id) && !s.reports.some((r) => r.projectId === p.id && r.period === period && r.status === 'sent')).length,
    projects: sums.map(({ p, sm }) => ({ id: p.id, name: p.name, stage: p.stage, budgetCents: sm.budgetCents, committedCents: sm.committedCents, facCents: sm.forecastAtCompletionCents, scheduleStatus: p.scheduleStatus, drawStatus: sm.drawStatus, riskLevel: p.riskLevel })),
  };
}

// ---------- assistant ----------
const usd = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
export function assistantAnswer(s: DemoState, question: string, projectId?: string) {
  const q = question.toLowerCase();
  const projects = s.projects.filter((p) => p.status === 'active' && (!projectId || p.id === projectId));
  const actions: { type: string; label: string; payload?: unknown }[] = [];
  if (/over budget|variance|trending/.test(q)) {
    const over = projects.map((p) => ({ p, sm: projectSummary(s, p) })).filter((x) => x.sm.varianceCents > 0).sort((a, b) => b.sm.varianceCents - a.sm.varianceCents);
    over.forEach((x) => actions.push({ type: 'open_project', label: `Open ${x.p.name}`, payload: { projectId: x.p.id } }));
    return { answer: over.length ? `${over.length} of ${projects.length} projects are forecasting over budget:\n` + over.map((x) => `• ${x.p.name}: forecast at completion ${usd(x.sm.forecastAtCompletionCents)} vs budget ${usd(x.sm.budgetCents)} (${usd(x.sm.varianceCents)} over, ${(x.sm.varianceCents / x.sm.budgetCents * 100).toFixed(1)}%). Largest driver: ${topVarianceLine(s, x.p.id)}.`).join('\n') : 'No project is forecasting over budget right now.', data: over.map((x) => ({ projectId: x.p.id, varianceCents: x.sm.varianceCents })), actions };
  }
  if (/cash|30 days|next month/.test(q)) {
    const rows = projects.map((p) => ({ p, cf: cashflow(s, p, 5) })).map((x) => ({ ...x, out: x.cf.weeks.slice(0, 5).reduce((a, w) => a + w.outflowsCents, 0), inn: x.cf.weeks.slice(0, 5).reduce((a, w) => a + w.inflowsCents, 0) }));
    const need = rows.reduce((a, r) => a + Math.max(0, r.out - r.inn), 0);
    const worst = rows.map((r) => ({ r, sf: cashflow(s, r.p, 12).shortfall })).filter((x) => x.sf);
    worst.forEach((x) => actions.push({ type: 'create_draw', label: `Assemble draw: ${x.r.p.name}`, payload: { projectId: x.r.p.id } }));
    return { answer: `Net cash need over the next 30 days: ${usd(need)}.\n` + rows.map((r) => `• ${r.p.name}: ${usd(r.out)} out (open invoices + scheduled work), ${usd(r.inn)} expected from lender draws → net ${usd(r.out - r.inn)}`).join('\n') + (worst.length ? `\nProjected shortfall: ${worst.map((x) => `${x.r.p.name} ${usd(x.sf!.amountCents)} in the week of ${x.sf!.weekStart.slice(0, 10)}`).join('; ')}. Submit the next draw early or line up bridge capital.` : '\nNo 12-week shortfall projected.'), data: rows.map((r) => ({ projectId: r.p.id, outflowsCents: r.out, inflowsCents: r.inn })), actions };
  }
  if (/missing|unbilled|haven.t billed|subcontractor invoices/.test(q)) {
    const items: { project: string; vendor: string; unbilled: number }[] = [];
    for (const p of projects) for (const c of s.commitments.filter((x) => x.projectId === p.id)) {
      const si = s.scheduleItems.find((x) => x.budgetLineIds.includes(c.budgetLineId)); const prog = si ? si.percentComplete / 100 : 0;
      const billed = s.invoices.filter((i) => i.commitmentId === c.id && i.status !== 'rejected').reduce((a, i) => a + i.amountCents, 0);
      const expected = Math.round(c.amountCents * prog * 0.9); const gap = expected - billed;
      if (gap > 1_000_000) items.push({ project: p.name, vendor: s.vendors.find((v) => v.id === c.vendorId)?.name ?? c.vendorId, unbilled: gap });
    }
    items.sort((a, b) => b.unbilled - a.unbilled);
    return { answer: items.length ? `${items.length} commitments are billed below schedule progress (≈${usd(items.reduce((a, i) => a + i.unbilled, 0))} unbilled):\n` + items.slice(0, 8).map((i) => `• ${i.vendor} on ${i.project}: ~${usd(i.unbilled)} unbilled`).join('\n') + '\nChase these before the next draw so the package reflects real progress.' : 'Every commitment is billed in line with schedule progress.', data: items, actions };
  }
  if (/draw/.test(q)) {
    const lines: string[] = [];
    for (const p of projects) {
      const drafts = s.draws.filter((d) => d.projectId === p.id && d.status === 'draft'); const submitted = s.draws.filter((d) => d.projectId === p.id && d.status === 'submitted');
      const unassigned = s.invoices.filter((i) => i.projectId === p.id && i.status === 'approved' && !i.drawId).reduce((a, i) => a + i.amountCents, 0);
      if (drafts.length) { lines.push(`• ${p.name}: draw of ${usd(drafts[0]!.totalCents)} is assembled and ready to submit.`); actions.push({ type: 'open_project', label: `Submit ${p.name} draw`, payload: { projectId: p.id, tab: 'draws' } }); }
      if (submitted.length) lines.push(`• ${p.name}: ${usd(submitted[0]!.totalCents)} submitted, awaiting lender inspection.`);
      if (unassigned > 0) { lines.push(`• ${p.name}: ${usd(unassigned)} of approved invoices not yet in a draw.`); actions.push({ type: 'create_draw', label: `Assemble draw: ${p.name}`, payload: { projectId: p.id } }); }
    }
    return { answer: lines.length ? lines.join('\n') : 'No draws are ready; approve pending invoices first.', data: null, actions };
  }
  if (/investor report|generate.*report|monthly report/.test(q)) {
    const period = new Date().toISOString().slice(0, 7);
    const target = projectId ? projects : projects.filter((p) => !s.reports.some((r) => r.projectId === p.id && r.period === period));
    const made = target.map((p) => generateReport(s, p, period));
    save();
    made.forEach((r) => actions.push({ type: 'generate_report', label: `Review ${projects.find((p) => p.id === r.projectId)!.name} ${period}`, payload: { projectId: r.projectId, reportId: r.id } }));
    return { answer: made.length ? `Drafted ${made.length} investor report${made.length > 1 ? 's' : ''} for ${period}: ${made.map((r) => projects.find((p) => p.id === r.projectId)!.name).join(', ')}. Each includes budget vs actual, schedule by phase, draw status and the latest update. Review in the project's Investors tab, then send.` : `Reports for ${period} already exist for every project.`, data: made.map((r) => r.id), actions };
  }
  if (/attention|first|priorit/.test(q)) {
    const ranked = projects.map((p) => ({ p, sm: projectSummary(s, p) })).sort((a, b) => (b.p.riskLevel === 'high' ? 2 : b.p.riskLevel === 'moderate' ? 1 : 0) - (a.p.riskLevel === 'high' ? 2 : a.p.riskLevel === 'moderate' ? 1 : 0));
    return { answer: ranked.slice(0, 3).map((x, i) => `${i + 1}. ${x.p.name} (${x.p.riskLevel} risk, ${x.p.scheduleStatus.replace('_', ' ')}${x.p.scheduleNote ? `, ${x.p.scheduleNote}` : ''}): ${x.sm.openInvoices} open invoices, variance ${usd(x.sm.varianceCents)}, draw ${x.sm.drawStatus}.`).join('\n'), data: null, actions: ranked.slice(0, 3).map((x) => ({ type: 'open_project', label: `Open ${x.p.name}`, payload: { projectId: x.p.id } })) };
  }
  const ps = portfolioSummary(s);
  return { answer: `Portfolio: ${ps.activeProjects} active projects, ${usd(ps.constructionBudgetCents)} budget, ${usd(ps.committedCents)} committed, ${usd(ps.forecastAtCompletionCents)} forecast at completion, ${usd(ps.remainingLoanProceedsCents)} undrawn loan proceeds, ${usd(ps.cashNeeded30dCents)} cash needed in 30 days, ${ps.projectsAtRisk} at risk, ${ps.reportsDue} reports due. Ask about budget variance, cash, missing invoices, draws or investor reports.`, data: ps, actions: [] };
}
function topVarianceLine(s: DemoState, projectId: string): string { const l = s.budgetLines.filter((x) => x.projectId === projectId).map((x) => lineView(s, x.id)).sort((a, b) => b.varianceCents - a.varianceCents)[0]; return l ? `${l.description} (${usd(l.varianceCents)})` : 'n/a'; }
function generateReport(s: DemoState, p: DProject, period: string) {
  const sm = projectSummary(s, p); const upd = s.updates.filter((u) => u.projectId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const html = `<h1>${p.name} — Investor report ${period}</h1><p>${p.address}</p><h2>Budget</h2><p>Budget ${usd(sm.budgetCents)} · Committed ${usd(sm.committedCents)} · Invoiced ${usd(sm.invoicedCents)} · Paid ${usd(sm.paidCents)} · Forecast at completion ${usd(sm.forecastAtCompletionCents)} (variance ${usd(sm.varianceCents)})</p><h2>Schedule</h2><p>${Math.round(sm.percentComplete * 100)}% complete, ${p.scheduleStatus.replace('_', ' ')}${p.scheduleNote ? ` (${p.scheduleNote})` : ''}. Next milestone: ${sm.nextMilestone?.name ?? 'closeout'}.</p><h2>Draws</h2><p>Status: ${sm.drawStatus}.</p><h2>Update</h2><p>${upd?.body ?? 'No update this period.'}</p>`;
  const r = { id: nid('rpt'), projectId: p.id, period, status: 'draft' as const, html, data: { summary: sm }, createdAt: nowIso(), sentAt: null };
  s.reports.push(r); emit(s, 'report.generated', { reportId: r.id, projectId: p.id, period });
  return r;
}
function emit(s: DemoState, type: string, data: unknown) { s.events.push({ id: nid('evt'), type, occurredAt: nowIso(), data }); }

// ---------- router ----------
type Body = Record<string, unknown>;
export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((r) => setTimeout(r, 60)); // feel like a network
  const s = load();
  const url = new URL(path, 'http://demo.local'); const parts = url.pathname.split('/').filter(Boolean); const qs = url.searchParams; const b = (body ?? {}) as Body;
  const token = (globalThis as { __dirtbidToken?: string | null }).__dirtbidToken ?? null;
  const me = userFromToken(token ?? s.currentToken);
  const R = (v: unknown) => { save(); return v as T; };
  const [a, b1, c, d] = parts;

  if (a === 'health') return R({ ok: true, db: 'memory', version: 'demo' });
  if (a === 'auth') {
    if (b1 === 'magic-link') return R({ ok: true, devLink: `${location.origin}${location.pathname}#/auth/verify?token=${String(b.email).includes('cascade') ? 'demo:builder' : 'demo:staff'}` });
    if (b1 === 'verify') { const t = qs.get('token') ?? 'demo:staff'; const u = userFromToken(t) ?? notFound('user'); s.currentToken = t; return R({ token: t, user: publicUser(u) }); }
    if (b1 === 'me') { if (!me) throw new ApiError('unauthorized', 'Not signed in', {}, 401); return R({ user: publicUser(me) }); }
    if (b1 === 'logout') { s.currentToken = null; return R(undefined); }
  }
  if (a === 'parcels' && b1 === 'resolve') {
    const address = String(b.address ?? '').trim(); if (!address) bad('address is required', { address: 'Enter an address' });
    const { resolveAddress } = await import('@dirtbid/parcel-data');
    const parcel = await resolveAddress(address);
    return R({ parcel });
  }
  if (a === 'feasibility' && b1 === 'from-address' && method === 'POST') {
    const address = String(b.address ?? '').trim(); if (!address) bad('address is required', { address: 'Enter an address' });
    const { resolveAddress } = await import('@dirtbid/parcel-data');
    const parcel = await resolveAddress(address);
    const overrides = (b.overrides ?? {}) as Partial<UnderwritingInput>;
    const input: UnderwritingInput = { ...parcel.underwritingInput, ...overrides, site: { ...(parcel.underwritingInput.site ?? {}), ...(overrides.site ?? {}) }, sitework: { ...(parcel.underwritingInput.sitework ?? {}), ...(overrides.sitework ?? {}) } };
    if (!input.zoningCode) throw new ApiError('validation', 'Zoning could not be resolved for this parcel; enter it and run again.', { zoningCode: 'Zoning could not be resolved; enter the district code.' }, 422);
    try {
      const result = underwrite(input);
      const run: DRun = { id: nid('run'), status: 'draft', version: 1, input, result, leadId: (b.leadId as string) ?? null, userId: me?.id ?? null, analystNotes: `Resolved from address (${parcel.durationMs} ms). Warnings: ${parcel.warnings.join(' | ') || 'none'}`, createdAt: nowIso() };
      s.runs.unshift(run); emit(s, 'feasibility.run.completed', { runId: run.id, fromAddress: true });
      return R({ runId: run.id, parcel, result, report: buildReport(result, 'enhanced') });
    } catch (e) { if (e instanceof UnderwritingError) bad(e.message, e.field ? { [e.field]: e.message } : {}); throw e; }
  }
  if (a === 'markets') return R(listMarkets().map((m) => ({ code: m.code, name: m.name, state: m.state, jurisdiction: m.jurisdiction, zoningCodes: m.zoning.map((z) => z.code), defaultArvPerSf: m.defaultArvPerSf, assumptions: m.assumptions, calibrationNote: m.calibrationNote })));
  if (a === 'services') return R(FALLBACK_SERVICES);

  if (a === 'leads') {
    if (!b1 && method === 'POST') {
      const contact = (b.contact ?? {}) as { fullName?: string; email?: string; phone?: string };
      const fields: Record<string, string> = {};
      if (String(b.website ?? '')) throw new ApiError('validation', 'Rejected', {}, 400);
      if (!contact.fullName || contact.fullName.length < 2) fields['contact.fullName'] = 'Enter your full name';
      if (!contact.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)) fields['contact.email'] = 'Enter a valid email';
      else if (DISPOSABLE.has(contact.email.split('@')[1]!.toLowerCase())) fields['contact.email'] = 'Please use a real, non-disposable email';
      if (!b.consent) fields.consent = 'Consent is required';
      if (Object.keys(fields).length) bad('Please fix the highlighted fields.', fields);
      const kind = String(b.kind); const prop = (b.property ?? {}) as Record<string, unknown>;
      const dup = s.leads.find((l) => l.contact.email.toLowerCase() === contact.email!.toLowerCase() && l.kind === kind && String(l.property?.address ?? '') === String(prop.address ?? '') && !['won', 'lost'].includes(l.status) && Date.now() - +new Date(l.createdAt) < 30 * 86400000);
      if (dup) return R({ leadId: dup.id, score: dup.score, grade: dup.grade, nextStep: { type: 'book_call' } });
      const score = scoreLead({ kind, contact, property: prop, answers: b.answers as Record<string, unknown>, consent: !!b.consent });
      const lead: DLead = { id: nid('lead'), kind, status: 'new', grade: gradeOf(score), score, contact: { fullName: contact.fullName!, email: contact.email!, phone: contact.phone }, property: prop, answers: (b.answers ?? {}) as Record<string, unknown>, consent: true, utm: b.utm as Record<string, string> | undefined, assigneeUserId: null, notes: null, createdAt: nowIso(), updatedAt: nowIso(), events: [{ at: nowIso(), type: 'lead.created' }] };
      s.leads.unshift(lead); emit(s, 'lead.created', { leadId: lead.id, kind, grade: lead.grade }); if (lead.grade === 'A' || lead.grade === 'B') emit(s, 'lead.qualified', { leadId: lead.id });
      const nextType = kind === 'homeowner_rebuild' || kind.startsWith('builder') ? 'magic_link_sent' : kind === 'feasibility_enhanced' ? 'checkout' : kind === 'strategy_call' ? 'book_call' : 'report_queued';
      return R({ leadId: lead.id, score, grade: lead.grade, nextStep: { type: nextType } });
    }
    if (!b1 && method === 'GET') { let items = [...s.leads]; for (const k of ['status', 'kind', 'grade'] as const) { const v = qs.get(k); if (v) items = items.filter((l) => l[k] === v); } const q = qs.get('q')?.toLowerCase(); if (q) items = items.filter((l) => JSON.stringify(l).toLowerCase().includes(q)); return R({ items: items.map(leadOut), total: items.length }); }
    const lead = s.leads.find((l) => l.id === b1) ?? notFound('Lead');
    if (c === 'convert' && method === 'POST') {
      const programType = String(b.programType ?? 'boyl');
      const user = s.users.find((u) => u.email === lead.contact.email) ?? (() => { const u = { id: nid('usr'), email: lead.contact.email, fullName: lead.contact.fullName, phone: lead.contact.phone, roles: [programType === 'builder_ops' ? 'builder' : 'landowner'], organizationIds: [ORG_ID] }; s.users.push(u); return u; })();
      const p: DProject = { id: nid('proj'), organizationId: ORG_ID, name: String(b.projectName ?? `${lead.contact.fullName} — ${String(lead.property?.address ?? 'New project')}`), address: String(lead.property?.address ?? ''), marketCode: String(lead.property?.address ?? '').includes(', CA') ? 'ALTADENA_CA' : 'HAMPTON_ROADS_VA', stage: 'feasibility', scheduleStatus: 'on_track', riskLevel: 'low', status: 'active', programType, createdAt: nowIso() };
      s.projects.push(p); seedMilestones(s, p);
      lead.status = 'won'; lead.updatedAt = nowIso(); lead.events.push({ at: nowIso(), type: 'lead.converted', note: p.id });
      emit(s, 'project.created', { projectId: p.id, leadId: lead.id });
      return R({ projectId: p.id, userId: user.id });
    }
    if (method === 'PATCH') { if (b.status) { lead.status = String(b.status); lead.events.push({ at: nowIso(), type: 'lead.status_changed', note: lead.status }); emit(s, 'lead.status_changed', { leadId: lead.id, status: lead.status }); } if (b.notes !== undefined) lead.notes = String(b.notes); if (b.assigneeUserId !== undefined) lead.assigneeUserId = b.assigneeUserId as string; lead.updatedAt = nowIso(); return R(leadOut(lead)); }
    return R({ ...leadOut(lead), events: lead.events, runs: s.runs.filter((r) => r.leadId === lead.id).map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })), orders: [] });
  }

  if (a === 'feasibility' && b1 === 'runs') {
    if (!c && method === 'POST') {
      try {
        const input = b.input as UnderwritingInput; const result = underwrite(input);
        const run: DRun = { id: nid('run'), status: 'draft', version: 1, input, result, leadId: (b.leadId as string) ?? null, userId: me?.id ?? null, analystNotes: null, createdAt: nowIso() };
        s.runs.unshift(run); emit(s, 'feasibility.run.completed', { runId: run.id });
        return R({ runId: run.id, result, report: buildReport(result, (b.tier as 'lite' | 'enhanced') ?? 'lite') });
      } catch (e) { if (e instanceof UnderwritingError) bad(e.message, e.field ? { [e.field]: e.message } : {}); throw e; }
    }
    if (!c && method === 'GET') return R(s.runs.filter((r) => (!qs.get('leadId') || r.leadId === qs.get('leadId')) && (!qs.get('projectId') || r.projectId === qs.get('projectId'))).map((r) => ({ id: r.id, status: r.status, version: r.version, createdAt: r.createdAt, address: r.input.address })));
    const run = s.runs.find((r) => r.id === c) ?? notFound('Run');
    if (d === 'report') return R(buildReport(run.result, (qs.get('tier') as 'lite' | 'enhanced') ?? 'lite'));
    if (d === 'review' && method === 'POST') { const input = { ...run.input, ...((b.input as Partial<UnderwritingInput>) ?? {}) }; run.input = input; run.result = underwrite(input); run.version += 1; run.status = 'reviewed'; run.analystNotes = String(b.analystNotes ?? run.analystNotes ?? ''); return R({ run, report: buildReport(run.result, 'enhanced') }); }
    if (d === 'deliver' && method === 'POST') { run.status = 'delivered'; emit(s, 'feasibility.delivered', { runId: run.id }); return R({ ok: true }); }
    return R({ run: { id: run.id, status: run.status, version: run.version, input: run.input, result: run.result, analystNotes: run.analystNotes, createdAt: run.createdAt }, report: buildReport(run.result, 'enhanced') });
  }

  if (a === 'orders') { if (method === 'POST') { const svc = FALLBACK_SERVICES.find((x) => x.code === b.serviceCode) ?? notFound('Service'); const o = { orderId: nid('ord'), amountCents: svc.priceCents ?? 0, status: 'awaiting_payment' }; emit(s, 'order.created', o); return R(o); } return R({ id: b1, status: 'awaiting_payment' }); }
  if (a === 'credits') return R([]);
  if (a === 'portfolio' && b1 === 'summary') return R(portfolioSummary(s, qs.get('organizationId') ?? ORG_ID));
  if (a === 'vendors') { if (method === 'POST') { const v = { id: nid('ven'), organizationId: ORG_ID, ...(b as object) }; s.vendors.push(v as never); return R(v); } const days = Number(qs.get('expiringWithinDays') ?? 0); return R(s.vendors.filter((v) => (!qs.get('trade') || v.trades.some((t) => t.toLowerCase().includes(qs.get('trade')!.toLowerCase()))) && (!days || +new Date(v.insuranceExpiry) - Date.now() < days * 86400000))); }
  if (a === 'events') return R(s.events.filter((e) => !qs.get('type') || e.type === qs.get('type')));
  if (a === 'admin') { if (b1 === 'pipeline') { const by: Record<string, number> = {}; for (const l of s.leads) by[l.status] = (by[l.status] ?? 0) + 1; return R({ byStatus: by, total: s.leads.length }); } return R({ leads7d: s.leads.filter((l) => Date.now() - +new Date(l.createdAt) < 7 * 86400000).length, leads30d: s.leads.length, runs30d: s.runs.length, ordersPaid30d: 0, revenue30dCents: 0, conversionRate: s.leads.length ? s.leads.filter((l) => l.status === 'won').length / s.leads.length : 0 }); }
  if (a === 'assistant' && b1 === 'ask') { const r = assistantAnswer(s, String(b.question ?? ''), b.projectId as string | undefined); return R({ ...r, model: 'rules' }); }
  if (a === 'documents') {
    if (b1 === 'presign' && method === 'POST') { const doc = { id: nid('doc'), projectId: String(b.projectId), fileName: String(b.fileName), category: String(b.category ?? 'other'), contentType: String(b.contentType ?? 'application/octet-stream'), createdAt: nowIso(), status: 'pending' as const }; s.documents.push(doc); return R({ uploadUrl: `demo://upload/${doc.id}`, documentId: doc.id, key: `demo/${doc.id}` }); }
    const doc = s.documents.find((x) => x.id === b1) ?? notFound('Document'); if (c === 'complete') { doc.status = 'complete'; return R(doc); } return R(doc);
  }
  if (a === 'invoices') { const inv = s.invoices.find((i) => i.id === b1) ?? notFound('Invoice'); if (c === 'approve') { inv.status = 'approved'; emit(s, 'invoice.approved', { invoiceId: inv.id }); } else if (c === 'reject') inv.status = 'rejected'; else if (c === 'mark-paid') { inv.status = 'paid'; inv.paidAt = nowIso(); } return R(invOut(s, inv)); }
  if (a === 'draws') {
    const dr = s.draws.find((x) => x.id === b1) ?? notFound('Draw');
    if (c === 'submit') { if (dr.status !== 'draft') throw new ApiError('conflict', 'Draw already submitted', {}, 409); dr.status = 'submitted'; dr.submittedAt = nowIso(); emit(s, 'draw.submitted', { drawId: dr.id }); }
    else if (c === 'fund') { if (dr.status === 'funded') throw new ApiError('conflict', 'Draw already funded', {}, 409); dr.status = 'funded'; dr.fundedCents = Number(b.fundedCents ?? dr.totalCents); dr.fundedAt = String(b.fundedAt ?? nowIso()); for (const it of dr.items) { const inv = s.invoices.find((i) => i.id === it.invoiceId); if (inv) { inv.status = 'paid'; inv.paidAt = nowIso(); } } const loan = s.loans.find((l) => l.id === dr.loanId); if (loan) loan.drawnCents = Math.min(loan.commitmentCents, loan.drawnCents + dr.fundedCents); emit(s, 'draw.funded', { drawId: dr.id, fundedCents: dr.fundedCents }); }
    return R(dr);
  }
  if (a === 'milestones' && method === 'PATCH') { const m = s.milestones.find((x) => x.id === b1) ?? notFound('Milestone'); Object.assign(m, b); if (b.status === 'complete') { m.actualEnd = nowIso(); emit(s, 'milestone.completed', { milestoneId: m.id }); } return R(m); }
  if (a === 'budget-lines' && method === 'PATCH') { const l = s.budgetLines.find((x) => x.id === b1) ?? notFound('Budget line'); Object.assign(l, b); return R(lineView(s, l.id)); }
  if (a === 'schedule' && method === 'PATCH') { const it = s.scheduleItems.find((x) => x.id === b1) ?? notFound('Schedule item'); Object.assign(it, b); return R(it); }
  if (a === 'reports') { const r = s.reports.find((x) => x.id === b1) ?? notFound('Report'); if (c === 'send') { r.status = 'sent'; r.sentAt = nowIso(); emit(s, 'report.sent', { reportId: r.id }); } return R(r); }
  if (a === 'change-orders') { return R({ id: b1, status: c === 'approve' ? 'approved' : 'rejected' }); }

  if (a === 'projects') {
    if (!b1 && method === 'GET') return R(s.projects.filter((p) => p.status === 'active').map((p) => ({ project: p, summary: projectSummary(s, p) })));
    if (!b1 && method === 'POST') { const p: DProject = { id: nid('proj'), organizationId: String(b.organizationId ?? ORG_ID), name: String(b.name), address: String(b.address ?? ''), marketCode: String(b.marketCode ?? 'HAMPTON_ROADS_VA'), lotSizeSf: Number(b.lotSizeSf ?? 0) || undefined, stage: 'feasibility', scheduleStatus: 'on_track', riskLevel: 'low', status: 'active', programType: String(b.programType ?? 'boyl'), createdAt: nowIso() }; s.projects.push(p); seedMilestones(s, p); if (b.runId) { const run = s.runs.find((r) => r.id === b.runId); if (run) run.projectId = p.id; } emit(s, 'project.created', { projectId: p.id }); return R({ project: p }); }
    const p = s.projects.find((x) => x.id === b1) ?? notFound('Project');
    if (!c) { if (method === 'PATCH') { Object.assign(p, b); return R({ project: p }); } return R({ project: p, summary: projectSummary(s, p) }); }
    const own = <X extends { projectId: string }>(rows: X[]) => rows.filter((r) => r.projectId === p.id);
    switch (c) {
      case 'members': return R(method === 'POST' ? { id: nid('mem'), ...(b as object) } : [{ id: 'mem_1', userId: 'usr_builder', role: 'owner', email: 'kevin@cascadehomes.example' }, { id: 'mem_2', userId: 'usr_inv1', role: 'investor', email: 'r.okafor@harborlight.example' }]);
      case 'milestones': if (method === 'POST') { const m = { id: nid('ms'), projectId: p.id, phase: String(b.phase), name: String(b.name), plannedStart: String(b.plannedStart), plannedEnd: String(b.plannedEnd), actualStart: null, actualEnd: null, status: 'pending' as const, owner: (b.owner as string) ?? null }; s.milestones.push(m); return R(m); } return R(own(s.milestones));
      case 'budget': if (method === 'POST') { const rows = Array.isArray(b.lines) ? (b.lines as Body[]) : [b]; const made = rows.map((r) => { const l = { id: nid('bl'), projectId: p.id, csiDivision: String(r.csiDivision ?? '01'), code: String(r.code ?? `${r.csiDivision}-000`), description: String(r.description ?? ''), originalCents: Number(r.originalCents ?? 0), approvedChangesCents: 0, forecastToCompleteCents: Number(r.forecastToCompleteCents ?? r.originalCents ?? 0) }; s.budgetLines.push(l); return lineView(s, l.id); }); return R(Array.isArray(b.lines) ? made : made[0]); } { const lines = own(s.budgetLines).map((l) => lineView(s, l.id)); const totals: Record<string, number> = {}; for (const k of ['originalCents', 'approvedChangesCents', 'revisedCents', 'committedCents', 'invoicedCents', 'paidCents', 'forecastToCompleteCents', 'forecastAtCompletionCents', 'varianceCents'] as const) totals[k] = lines.reduce((a, l) => a + l[k], 0); return R({ lines, totals }); }
      case 'commitments': if (method === 'POST') { const cm = { id: nid('po'), projectId: p.id, vendorId: String(b.vendorId), budgetLineId: String(b.budgetLineId), description: String(b.description ?? ''), amountCents: Number(b.amountCents ?? 0), status: (b.status as 'draft') ?? 'issued' }; s.commitments.push(cm); return R(cm); } return R(own(s.commitments));
      case 'invoices': if (method === 'POST') { const inv: DInvoice = { id: nid('inv'), projectId: p.id, vendorId: String(b.vendorId), commitmentId: (b.commitmentId as string) ?? null, budgetLineId: String(b.budgetLineId), invoiceNumber: String(b.invoiceNumber), amountCents: Number(b.amountCents), retainageCents: Number(b.retainageCents ?? 0), invoiceDate: String(b.invoiceDate ?? nowIso()), dueDate: String(b.dueDate ?? nowIso()), status: 'pending_approval', drawId: null }; s.invoices.push(inv); emit(s, 'invoice.pending_approval', { invoiceId: inv.id }); return R(invOut(s, inv)); } return R(own(s.invoices).filter((i) => !qs.get('status') || i.status === qs.get('status')).sort((x, y) => y.invoiceDate.localeCompare(x.invoiceDate)).map((i) => invOut(s, i)));
      case 'change-orders': return R(method === 'POST' ? { id: nid('co'), projectId: p.id, status: 'proposed', ...(b as object) } : []);
      case 'schedule': if (method === 'POST') { const it = { id: nid('sch'), projectId: p.id, name: String(b.name), start: String(b.start), end: String(b.end), percentComplete: Number(b.percentComplete ?? 0), milestoneId: (b.milestoneId as string) ?? null, budgetLineIds: [] as string[] }; s.scheduleItems.push(it); return R(it); } return R(own(s.scheduleItems));
      case 'loans': if (method === 'POST') { const l = { id: nid('loan'), projectId: p.id, lender: String(b.lender), commitmentCents: Number(b.commitmentCents), rateBps: Number(b.rateBps ?? 0), maturity: String(b.maturity ?? ''), retainagePct: Number(b.retainagePct ?? 10), drawnCents: Number(b.drawnCents ?? 0) }; s.loans.push(l); return R(l); } return R(own(s.loans));
      case 'draws': {
        if (method === 'POST') {
          const loan = s.loans.find((l) => l.id === b.loanId && l.projectId === p.id) ?? own(s.loans)[0] ?? bad('No loan on this project', { loanId: 'Add a loan first' });
          const eligible = own(s.invoices).filter((i) => i.status === 'approved' && !i.drawId);
          if (!eligible.length) bad('No approved, unpaid invoices to draw against. Approve invoices first.', { invoices: 'none eligible' });
          const dr: DDraw = { id: nid('drw'), projectId: p.id, loanId: loan.id, periodEnd: String(b.periodEnd ?? nowIso().slice(0, 10)), status: 'draft', items: eligible.map((i) => ({ id: nid('di'), invoiceId: i.id, amountCents: i.amountCents, description: `${i.invoiceNumber} — ${s.vendors.find((v) => v.id === i.vendorId)?.name ?? ''}` })), totalCents: eligible.reduce((x, i) => x + i.amountCents, 0), fundedCents: null, createdAt: nowIso() };
          eligible.forEach((i) => { i.drawId = dr.id; }); s.draws.push(dr); emit(s, 'draw.ready', { drawId: dr.id, totalCents: dr.totalCents });
          return R(dr);
        }
        return R(own(s.draws).sort((x, y) => x.createdAt.localeCompare(y.createdAt)));
      }
      case 'cashflow': return R(cashflow(s, p, Number(qs.get('weeks') ?? 12)));
      case 'documents': return R(own(s.documents).filter((x) => x.status === 'complete' && (!qs.get('category') || x.category === qs.get('category'))));
      case 'updates': if (method === 'POST') { const u = { id: nid('upd'), projectId: p.id, body: String(b.body), visibility: String(b.visibility ?? 'owner'), createdAt: nowIso(), authorName: me?.fullName ?? 'Team', photoDocumentIds: (b.photoDocumentIds as string[]) ?? [] }; s.updates.unshift(u); return R(u); } return R(own(s.updates).sort((x, y) => y.createdAt.localeCompare(x.createdAt)));
      case 'investors': if (method === 'POST') { const i = { id: nid('ivr'), projectId: p.id, email: String(b.email ?? ''), name: String(b.name ?? b.email ?? 'Investor'), commitmentCents: Number(b.commitmentCents ?? 0), ownershipPct: Number(b.ownershipPct ?? 0) }; s.investors.push(i); return R(i); } return R(own(s.investors));
      case 'capital-calls': emit(s, 'capital_call.created', { projectId: p.id, ...(b as object) }); return R({ id: nid('cc'), projectId: p.id, ...(b as object) });
      case 'reports': if (method === 'POST') return R(generateReport(s, p, String(b.period ?? nowIso().slice(0, 7)))); return R(own(s.reports).sort((x, y) => y.period.localeCompare(x.period)));
      case 'bids': return R(method === 'POST' ? { id: nid('bid'), projectId: p.id, ...(b as object) } : []);
    }
  }
  throw new ApiError('not_found', `No demo handler for ${method} ${path}`, {}, 404);
}

function seedMilestones(s: DemoState, p: DProject) {
  const phases: [string, string, number][] = [['feasibility', 'Feasibility & underwriting', 14], ['design', 'Design & pre-development', 70], ['entitlement', 'Entitlement & permits', 150], ['construction', 'Construction', 420], ['handoff', 'Closeout & handoff', 450]];
  let prev = new Date();
  for (const [phase, name, days] of phases) { const end = new Date(); end.setDate(end.getDate() + days); s.milestones.push({ id: nid('ms'), projectId: p.id, phase, name, plannedStart: prev.toISOString(), plannedEnd: end.toISOString(), actualStart: phase === 'feasibility' ? prev.toISOString() : null, actualEnd: null, status: phase === 'feasibility' ? 'in_progress' : 'pending', owner: 'PM' }); prev = end; }
}
const leadOut = (l: DLead) => ({ id: l.id, kind: l.kind, status: l.status, grade: l.grade, score: l.score, contact: l.contact, property: l.property, answers: l.answers, createdAt: l.createdAt, updatedAt: l.updatedAt, assigneeUserId: l.assigneeUserId, notes: l.notes });
const invOut = (s: DemoState, i: DInvoice) => ({ ...i, vendorName: s.vendors.find((v) => v.id === i.vendorId)?.name ?? i.vendorId });
