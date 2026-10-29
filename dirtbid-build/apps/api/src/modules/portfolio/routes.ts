import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { isStaff, requireAuth, requireOrgMember } from '../../lib/policy.js';
import { cashFlowFor } from '../projects/cashflow.js';
import { projectSummary } from '../projects/service.js';

export interface PortfolioSummary {
  activeProjects: number; constructionBudgetCents: number; committedCents: number; forecastAtCompletionCents: number; remainingLoanProceedsCents: number; cashNeeded30dCents: number; projectsAtRisk: number; reportsDue: number;
  projects: { id: string; name: string; stage: string; budgetCents: number; committedCents: number; facCents: number; varianceCents: number; scheduleStatus: string; drawStatus: string; riskLevel: string }[];
}

export async function portfolioSummaryFor(app: App, organizationId: string | null, projectIds?: string[]): Promise<PortfolioSummary> {
  const where = organizationId ? and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.status, 'active')) : projectIds && projectIds.length ? and(inArray(schema.projects.id, projectIds), eq(schema.projects.status, 'active')) : eq(schema.projects.status, 'active');
  const projects = await app.db.select().from(schema.projects).where(where);
  const rows = await Promise.all(projects.map(async (p) => {
    const [summary, loans, cf, reports] = await Promise.all([
      projectSummary(app, p),
      app.db.select().from(schema.loans).where(eq(schema.loans.projectId, p.id)),
      cashFlowFor(app, p.id, 5),
      app.db.select({ period: schema.investorReports.period, status: schema.investorReports.status }).from(schema.investorReports).where(eq(schema.investorReports.projectId, p.id)),
    ]);
    const remainingLoan = loans.reduce((s, l) => s + Math.max(0, l.commitmentCents - l.drawnCents), 0);
    const need30 = Math.max(0, -Math.min(0, ...cf.weeks.slice(0, 5).map((w) => w.cumulativeCents)));
    const currentPeriod = new Date().toISOString().slice(0, 7);
    const lastMonth = new Date(); lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const duePeriod = lastMonth.toISOString().slice(0, 7);
    const investors = await app.db.select({ id: schema.projectInvestors.id }).from(schema.projectInvestors).where(eq(schema.projectInvestors.projectId, p.id));
    const reportDue = investors.length > 0 && !reports.some((r) => (r.period === duePeriod || r.period === currentPeriod) && r.status === 'sent');
    return { p, summary, remainingLoan, need30, reportDue };
  }));
  return {
    activeProjects: rows.length,
    constructionBudgetCents: rows.reduce((s, r) => s + r.summary.budgetCents, 0),
    committedCents: rows.reduce((s, r) => s + r.summary.committedCents, 0),
    forecastAtCompletionCents: rows.reduce((s, r) => s + r.summary.forecastAtCompletionCents, 0),
    remainingLoanProceedsCents: rows.reduce((s, r) => s + r.remainingLoan, 0),
    cashNeeded30dCents: rows.reduce((s, r) => s + r.need30, 0),
    projectsAtRisk: rows.filter((r) => r.summary.riskLevel === 'high' || r.summary.riskLevel === 'medium').length,
    reportsDue: rows.filter((r) => r.reportDue).length,
    projects: rows.map((r) => ({ id: r.p.id, name: r.p.name, stage: r.p.stage, budgetCents: r.summary.budgetCents, committedCents: r.summary.committedCents, facCents: r.summary.forecastAtCompletionCents, varianceCents: r.summary.varianceCents, scheduleStatus: r.summary.scheduleStatus, drawStatus: r.summary.drawStatus, riskLevel: r.summary.riskLevel })),
  };
}

export async function portfolioRoutes(app: App): Promise<void> {
  app.get('/portfolio/summary', { schema: { tags: ['portfolio'], querystring: z.object({ organizationId: z.uuid().optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    if (req.query.organizationId) { requireOrgMember(p, req.query.organizationId); return portfolioSummaryFor(app, req.query.organizationId); }
    if (isStaff(p)) return portfolioSummaryFor(app, null);
    const orgId = p.organizationIds[0];
    if (orgId) return portfolioSummaryFor(app, orgId);
    const own = await app.db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.ownerUserId, p.id));
    const member = await app.db.select({ id: schema.projectMembers.projectId }).from(schema.projectMembers).where(eq(schema.projectMembers.userId, p.id));
    return portfolioSummaryFor(app, null, [...own.map((x) => x.id), ...member.map((x) => x.id)]);
  });
}
