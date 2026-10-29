import { and, asc, eq, inArray } from 'drizzle-orm';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { sum } from '../../lib/money.js';

export type ProjectRow = typeof schema.projects.$inferSelect;
export type BudgetLineRow = typeof schema.budgetLines.$inferSelect;
export type InvoiceRow = typeof schema.invoices.$inferSelect;

export const PHASES = ['Feasibility', 'Design & Pre-Dev', 'Entitlement & Permits', 'Construction', 'Handoff'] as const;

const DEFAULT_MILESTONES: { phase: typeof PHASES[number]; name: string }[] = [
  { phase: 'Feasibility', name: 'Site intake & data room' },
  { phase: 'Feasibility', name: 'Feasibility report delivered' },
  { phase: 'Feasibility', name: 'Go / no-go decision' },
  { phase: 'Design & Pre-Dev', name: 'Survey & geotech ordered' },
  { phase: 'Design & Pre-Dev', name: 'Schematic design approved' },
  { phase: 'Design & Pre-Dev', name: 'Preliminary budget validated' },
  { phase: 'Entitlement & Permits', name: 'Plan check / site plan submitted' },
  { phase: 'Entitlement & Permits', name: 'Comments resolved' },
  { phase: 'Entitlement & Permits', name: 'Permit issued' },
  { phase: 'Construction', name: 'Notice to proceed' },
  { phase: 'Construction', name: 'Foundation complete' },
  { phase: 'Construction', name: 'Dried in' },
  { phase: 'Construction', name: 'Final inspection / CO' },
  { phase: 'Handoff', name: 'Punch list closed' },
  { phase: 'Handoff', name: 'Closeout package & warranty' },
];

export const CSI_DIVISIONS: Record<string, string> = {
  '00': 'Procurement & Contracting', '01': 'General Requirements', '02': 'Existing Conditions', '03': 'Concrete', '04': 'Masonry', '05': 'Metals', '06': 'Wood, Plastics & Composites', '07': 'Thermal & Moisture Protection', '08': 'Openings', '09': 'Finishes', '10': 'Specialties', '11': 'Equipment', '12': 'Furnishings', '13': 'Special Construction', '14': 'Conveying Equipment', '21': 'Fire Suppression', '22': 'Plumbing', '23': 'HVAC', '25': 'Integrated Automation', '26': 'Electrical', '27': 'Communications', '28': 'Electronic Safety & Security', '31': 'Earthwork', '32': 'Exterior Improvements', '33': 'Utilities', '34': 'Transportation', '35': 'Waterway & Marine', '40': 'Process Interconnections', '41': 'Material Processing', '44': 'Pollution Control', '46': 'Water & Wastewater', '48': 'Electrical Power Generation',
};

export async function createProject(app: App, args: { name: string; programType: string; organizationId?: string | null; ownerUserId?: string | null; address?: string | null; marketCode?: string | null; lotSizeSf?: number | null; runId?: string | null; serviceLevel?: string | null }, actorUserId?: string): Promise<ProjectRow> {
  const [project] = await app.db.insert(schema.projects).values({
    name: args.name, programType: args.programType, organizationId: args.organizationId ?? null, ownerUserId: args.ownerUserId ?? null,
    address: args.address ?? null, marketCode: args.marketCode ?? null, lotSizeSf: args.lotSizeSf ?? null, runId: args.runId ?? null, serviceLevel: args.serviceLevel ?? null,
  }).returning();
  await app.db.insert(schema.milestones).values(DEFAULT_MILESTONES.map((m, i) => ({ projectId: project!.id, organizationId: project!.organizationId, phase: m.phase, name: m.name, sortOrder: i })));
  if (args.ownerUserId) await app.db.insert(schema.projectMembers).values({ projectId: project!.id, userId: args.ownerUserId, role: 'owner' }).onConflictDoNothing();
  if (args.runId) await app.db.update(schema.feasibilityRuns).set({ projectId: project!.id, organizationId: project!.organizationId }).where(eq(schema.feasibilityRuns.id, args.runId));
  await app.outbox.emit('project.created', { projectId: project!.id, name: project!.name, programType: project!.programType, organizationId: project!.organizationId, ownerUserId: project!.ownerUserId, actorUserId: actorUserId ?? null });
  return project!;
}

export interface BudgetLineView {
  id: string; csiDivision: string; csiDivisionName: string; code: string; description: string;
  originalCents: number; approvedChangesCents: number; revisedCents: number; committedCents: number; invoicedCents: number; paidCents: number;
  forecastToCompleteCents: number | null; forecastAtCompletionCents: number; varianceCents: number;
}
export interface BudgetTotals { originalCents: number; approvedChangesCents: number; revisedCents: number; committedCents: number; invoicedCents: number; paidCents: number; forecastAtCompletionCents: number; varianceCents: number; percentComplete: number }

/**
 * Budget math (per contract):
 *   revised = original + approved changes
 *   FAC     = paid + invoiced-unpaid + forecastToComplete  (when FTC is set)
 *           = revised                                        (otherwise)
 *   variance = revised − FAC   (positive = under budget)
 */
export async function budgetFor(app: App, projectId: string): Promise<{ lines: BudgetLineView[]; totals: BudgetTotals }> {
  const [lines, commitments, invoices] = await Promise.all([
    app.db.select().from(schema.budgetLines).where(eq(schema.budgetLines.projectId, projectId)).orderBy(asc(schema.budgetLines.csiDivision), asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.code)),
    app.db.select().from(schema.commitments).where(and(eq(schema.commitments.projectId, projectId), inArray(schema.commitments.status, ['issued', 'closed']))),
    app.db.select().from(schema.invoices).where(and(eq(schema.invoices.projectId, projectId), inArray(schema.invoices.status, ['approved', 'in_draw', 'paid']))),
  ]);
  const views = lines.map((l) => {
    const committed = sum(commitments.filter((c) => c.budgetLineId === l.id).map((c) => c.amountCents));
    const lineInvoices = invoices.filter((i) => i.budgetLineId === l.id);
    const paid = sum(lineInvoices.filter((i) => i.status === 'paid').map((i) => i.amountCents));
    const invoicedUnpaid = sum(lineInvoices.filter((i) => i.status !== 'paid').map((i) => i.amountCents));
    const invoiced = paid + invoicedUnpaid;
    const revised = l.originalCents + l.approvedChangesCents;
    const fac = l.forecastToCompleteCents !== null && l.forecastToCompleteCents !== undefined ? paid + invoicedUnpaid + l.forecastToCompleteCents : Math.max(revised, Math.max(committed, invoiced));
    return { id: l.id, csiDivision: l.csiDivision, csiDivisionName: CSI_DIVISIONS[l.csiDivision] ?? 'Other', code: l.code, description: l.description, originalCents: l.originalCents, approvedChangesCents: l.approvedChangesCents, revisedCents: revised, committedCents: committed, invoicedCents: invoiced, paidCents: paid, forecastToCompleteCents: l.forecastToCompleteCents, forecastAtCompletionCents: fac, varianceCents: revised - fac };
  });
  const t = (k: keyof BudgetLineView) => sum(views.map((v) => Number(v[k] ?? 0)));
  const revised = t('revisedCents'); const fac = t('forecastAtCompletionCents'); const paid = t('paidCents');
  return { lines: views, totals: { originalCents: t('originalCents'), approvedChangesCents: t('approvedChangesCents'), revisedCents: revised, committedCents: t('committedCents'), invoicedCents: t('invoicedCents'), paidCents: paid, forecastAtCompletionCents: fac, varianceCents: revised - fac, percentComplete: fac > 0 ? Math.round((paid / fac) * 100) : 0 } };
}

export type ScheduleStatus = 'on_track' | 'at_risk' | 'delayed';

export async function scheduleStatusFor(app: App, projectId: string, today = new Date()): Promise<{ status: ScheduleStatus; daysLate: number; nextMilestone: { id: string; name: string; phase: string; plannedEnd: string | null } | null }> {
  const [items, ms] = await Promise.all([
    app.db.select().from(schema.scheduleItems).where(eq(schema.scheduleItems.projectId, projectId)),
    app.db.select().from(schema.milestones).where(eq(schema.milestones.projectId, projectId)).orderBy(asc(schema.milestones.sortOrder)),
  ]);
  const t = today.getTime();
  let daysLate = 0;
  for (const it of items) {
    if (it.percentComplete >= 100) continue;
    const end = new Date(it.end).getTime(); const start = new Date(it.start).getTime();
    if (t > end) daysLate = Math.max(daysLate, Math.round((t - end) / 86400000));
    else if (end > start) {
      const expected = Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100));
      if (expected - it.percentComplete > 25) daysLate = Math.max(daysLate, Math.round(((expected - it.percentComplete) / 100) * ((end - start) / 86400000)));
    }
  }
  for (const m of ms) if (m.status !== 'complete' && m.plannedEnd && new Date(m.plannedEnd).getTime() < t) daysLate = Math.max(daysLate, Math.round((t - new Date(m.plannedEnd).getTime()) / 86400000));
  const next = ms.find((m) => m.status !== 'complete');
  const status: ScheduleStatus = daysLate === 0 ? 'on_track' : daysLate <= 7 ? 'at_risk' : 'delayed';
  return { status, daysLate, nextMilestone: next ? { id: next.id, name: next.name, phase: next.phase, plannedEnd: next.plannedEnd } : null };
}

export async function projectSummary(app: App, project: ProjectRow) {
  const [{ totals }, sched, openInvoices, draws] = await Promise.all([
    budgetFor(app, project.id),
    scheduleStatusFor(app, project.id),
    app.db.select({ id: schema.invoices.id }).from(schema.invoices).where(and(eq(schema.invoices.projectId, project.id), inArray(schema.invoices.status, ['pending_approval', 'approved']))),
    app.db.select().from(schema.draws).where(eq(schema.draws.projectId, project.id)),
  ]);
  const latestDraw = draws.sort((a, b) => b.number - a.number)[0];
  const drawStatus = latestDraw ? (latestDraw.status === 'draft' ? 'ready' : latestDraw.status) : 'none';
  const varianceRatio = totals.revisedCents > 0 ? totals.varianceCents / totals.revisedCents : 0;
  const riskLevel = varianceRatio <= -0.05 || sched.status === 'delayed' ? 'high' : varianceRatio < -0.01 || sched.status === 'at_risk' ? 'medium' : 'low';
  return {
    budgetCents: totals.revisedCents, originalBudgetCents: totals.originalCents, committedCents: totals.committedCents, invoicedCents: totals.invoicedCents, paidCents: totals.paidCents,
    forecastAtCompletionCents: totals.forecastAtCompletionCents, varianceCents: totals.varianceCents, percentComplete: totals.percentComplete,
    scheduleStatus: sched.status, daysLate: sched.daysLate, nextMilestone: sched.nextMilestone, openInvoices: openInvoices.length, drawStatus, riskLevel,
  };
}

export async function nextNumber(app: App, table: 'draws' | 'change_orders', projectId: string): Promise<number> {
  const rows = table === 'draws'
    ? await app.db.select({ n: schema.draws.number }).from(schema.draws).where(eq(schema.draws.projectId, projectId))
    : await app.db.select({ n: schema.changeOrders.number }).from(schema.changeOrders).where(eq(schema.changeOrders.projectId, projectId));
  return rows.reduce((m, r) => Math.max(m, r.n), 0) + 1;
}
