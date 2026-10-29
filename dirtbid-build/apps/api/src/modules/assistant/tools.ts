import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { budgetFor } from '../projects/service.js';
import { cashFlowFor } from '../projects/cashflow.js';
import { portfolioSummaryFor } from '../portfolio/routes.js';
import { generateInvestorReport } from '../investors/routes.js';

export interface ToolScope { organizationId: string | null; projectIds: string[] | null; userId: string }

async function scopedProjects(app: App, scope: ToolScope, projectId?: string) {
  const where = projectId ? eq(schema.projects.id, projectId) : scope.organizationId ? and(eq(schema.projects.organizationId, scope.organizationId), eq(schema.projects.status, 'active')) : scope.projectIds ? (scope.projectIds.length ? and(inArray(schema.projects.id, scope.projectIds), eq(schema.projects.status, 'active')) : eq(schema.projects.id, '00000000-0000-0000-0000-000000000000')) : eq(schema.projects.status, 'active');
  const rows = await app.db.select().from(schema.projects).where(where);
  if (projectId && scope.organizationId) return rows.filter((p) => p.organizationId === scope.organizationId);
  if (projectId && scope.projectIds) return rows.filter((p) => scope.projectIds!.includes(p.id));
  return rows;
}

export const TOOL_DEFINITIONS = [
  { name: 'portfolio_summary', description: 'Portfolio-level numbers: active projects, budget, committed, forecast at completion, remaining loan proceeds, 30-day cash need, projects at risk, reports due, and one row per project.', input_schema: { type: 'object', properties: {} } },
  { name: 'project_variance', description: 'Budget vs forecast-at-completion variance for every project (or one project), with the worst budget lines.', input_schema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'cash_needs', description: 'Cash the portfolio (or a project) needs over the next N days, from the 12-week cash forecast.', input_schema: { type: 'object', properties: { days: { type: 'number' }, projectId: { type: 'string' } } } },
  { name: 'missing_invoices', description: 'Issued commitments with no invoice yet, and invoices awaiting approval, by vendor.', input_schema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'draws_ready', description: 'Draws in draft (ready to submit) and projects with approved-unpaid invoices that could be drawn.', input_schema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'generate_investor_report', description: 'Generate (or regenerate) the investor report for a project and period YYYY-MM. Returns the report id.', input_schema: { type: 'object', properties: { projectId: { type: 'string' }, period: { type: 'string' } }, required: ['projectId', 'period'] } },
] as const;

export type ToolName = typeof TOOL_DEFINITIONS[number]['name'];

export async function runTool(app: App, scope: ToolScope, name: ToolName, input: Record<string, any>): Promise<Record<string, unknown>> {
  switch (name) {
    case 'portfolio_summary': {
      const s = await portfolioSummaryFor(app, scope.organizationId, scope.projectIds ?? undefined);
      return s as unknown as Record<string, unknown>;
    }
    case 'project_variance': {
      const projects = await scopedProjects(app, scope, input.projectId);
      const rows = await Promise.all(projects.map(async (p) => { const b = await budgetFor(app, p.id); const worst = [...b.lines].sort((x, y) => x.varianceCents - y.varianceCents).slice(0, 3).filter((l) => l.varianceCents < 0); return { projectId: p.id, name: p.name, stage: p.stage, revisedCents: b.totals.revisedCents, forecastAtCompletionCents: b.totals.forecastAtCompletionCents, varianceCents: b.totals.varianceCents, variancePct: b.totals.revisedCents ? Number((b.totals.varianceCents / b.totals.revisedCents).toFixed(4)) : 0, worstLines: worst.map((l) => ({ code: l.code, description: l.description, varianceCents: l.varianceCents })) }; }));
      return { projects: rows.sort((a, b) => a.varianceCents - b.varianceCents), overBudget: rows.filter((r) => r.varianceCents < 0) };
    }
    case 'cash_needs': {
      const days = Number(input.days ?? 30); const weeks = Math.max(4, Math.ceil(days / 7) + 1);
      const projects = await scopedProjects(app, scope, input.projectId);
      const rows = await Promise.all(projects.map(async (p) => { const cf = await cashFlowFor(app, p.id, weeks); const horizon = cf.weeks.slice(0, Math.ceil(days / 7)); const need = Math.max(0, -Math.min(0, ...horizon.map((w) => w.cumulativeCents))); return { projectId: p.id, name: p.name, needCents: need, outflowsCents: horizon.reduce((s, w) => s + w.outflowsCents, 0), inflowsCents: horizon.reduce((s, w) => s + w.inflowsCents, 0), shortfallWeek: cf.shortfall?.weekStart ?? null }; }));
      return { days, totalNeedCents: rows.reduce((s, r) => s + r.needCents, 0), projects: rows.sort((a, b) => b.needCents - a.needCents) };
    }
    case 'missing_invoices': {
      const projects = await scopedProjects(app, scope, input.projectId);
      const ids = projects.map((p) => p.id);
      if (!ids.length) return { pendingApproval: [], uninvoicedCommitments: [] };
      const [pending, commitments, invoices, vendors] = await Promise.all([
        app.db.select().from(schema.invoices).where(and(inArray(schema.invoices.projectId, ids), eq(schema.invoices.status, 'pending_approval'))),
        app.db.select().from(schema.commitments).where(and(inArray(schema.commitments.projectId, ids), eq(schema.commitments.status, 'issued'))),
        app.db.select({ commitmentId: schema.invoices.commitmentId }).from(schema.invoices).where(inArray(schema.invoices.projectId, ids)),
        app.db.select().from(schema.vendors),
      ]);
      const invoiced = new Set(invoices.map((i) => i.commitmentId).filter(Boolean));
      const vn = (id: string | null) => vendors.find((v) => v.id === id)?.name ?? 'Unassigned';
      const pn = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
      return {
        pendingApproval: pending.map((i) => ({ invoiceId: i.id, project: pn(i.projectId), vendor: vn(i.vendorId), invoiceNumber: i.invoiceNumber, amountCents: i.amountCents, dueDate: i.dueDate })),
        uninvoicedCommitments: commitments.filter((c) => !invoiced.has(c.id)).map((c) => ({ commitmentId: c.id, project: pn(c.projectId), vendor: vn(c.vendorId), description: c.description, amountCents: c.amountCents })),
      };
    }
    case 'draws_ready': {
      const projects = await scopedProjects(app, scope, input.projectId);
      const ids = projects.map((p) => p.id);
      if (!ids.length) return { draftDraws: [], drawable: [] };
      const [drafts, approved] = await Promise.all([
        app.db.select().from(schema.draws).where(and(inArray(schema.draws.projectId, ids), eq(schema.draws.status, 'draft'))),
        app.db.select().from(schema.invoices).where(and(inArray(schema.invoices.projectId, ids), eq(schema.invoices.status, 'approved'), isNull(schema.invoices.drawId))),
      ]);
      const pn = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
      const byProject = new Map<string, number>();
      for (const i of approved) byProject.set(i.projectId, (byProject.get(i.projectId) ?? 0) + i.amountCents);
      return { draftDraws: drafts.map((d) => ({ drawId: d.id, project: pn(d.projectId), number: d.number, requestedCents: d.requestedCents, netCents: d.requestedCents - d.retainageHeldCents })), drawable: [...byProject.entries()].map(([projectId, cents]) => ({ projectId, project: pn(projectId), approvedUnpaidCents: cents })) };
    }
    case 'generate_investor_report': {
      const projects = await scopedProjects(app, scope, input.projectId);
      if (!projects[0]) return { error: 'project not in scope' };
      const report = await generateInvestorReport(app, projects[0].id, input.period, scope.userId);
      return { reportId: report.id, period: report.period, status: report.status, project: projects[0].name };
    }
  }
  void or;
  return {};
}
