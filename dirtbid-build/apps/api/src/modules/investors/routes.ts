import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { conflict, notFound, validation } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireAuth } from '../../lib/policy.js';
import { budgetFor, scheduleStatusFor } from '../projects/service.js';
import { renderInvestorReport, type ReportData } from './report.js';

const projectIdParam = z.object({ id: z.uuid() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function generateInvestorReport(app: App, projectId: string, period: string, actorUserId?: string) {
  const [project] = await app.db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
  if (!project) throw notFound('Project');
  const [y, m] = period.split('-').map(Number);
  const periodStart = new Date(Date.UTC(y!, m! - 1, 1)); const periodEnd = new Date(Date.UTC(y!, m!, 1));
  const [{ totals }, sched, ms, draws, loans, updates, photos, investors, run] = await Promise.all([
    budgetFor(app, projectId), scheduleStatusFor(app, projectId),
    app.db.select().from(schema.milestones).where(eq(schema.milestones.projectId, projectId)),
    app.db.select().from(schema.draws).where(eq(schema.draws.projectId, projectId)).orderBy(desc(schema.draws.number)),
    app.db.select().from(schema.loans).where(eq(schema.loans.projectId, projectId)),
    app.db.select().from(schema.projectUpdates).where(and(eq(schema.projectUpdates.projectId, projectId), inArray(schema.projectUpdates.visibility, ['owner', 'investor']), gte(schema.projectUpdates.createdAt, periodStart), lte(schema.projectUpdates.createdAt, periodEnd))).orderBy(asc(schema.projectUpdates.createdAt)),
    app.db.select().from(schema.documents).where(and(eq(schema.documents.projectId, projectId), eq(schema.documents.category, 'photo'), gte(schema.documents.createdAt, periodStart), lte(schema.documents.createdAt, periodEnd))),
    app.db.select().from(schema.projectInvestors).where(eq(schema.projectInvestors.projectId, projectId)),
    project.runId ? app.db.select().from(schema.feasibilityRuns).where(eq(schema.feasibilityRuns.id, project.runId)).limit(1) : Promise.resolve([]),
  ]);
  let projectedProfitCents: number | null = null; let projectedRoi: number | null = null; let note = 'Return projection updates when a feasibility run is attached to the project.';
  const result = (run[0]?.result ?? null) as any;
  if (result) {
    const rec = result.scenarios?.find((s: any) => s.id === result.recommended?.scenarioId);
    if (rec) {
      const arvCents = Math.round(rec.arv * 100); const landCents = Math.round(rec.maxOffer * 100); const saleCents = Math.round(rec.saleCosts.total * 100);
      const costBasis = landCents + totals.forecastAtCompletionCents;
      projectedProfitCents = arvCents - saleCents - costBasis; projectedRoi = costBasis > 0 ? projectedProfitCents / costBasis : null;
      note = `Underwritten ARV ${rec.arv.toLocaleString()} less sale costs, against land basis plus current forecast at completion.`;
    }
  }
  const data: ReportData = {
    project: { id: project.id, name: project.name, address: project.address, stage: project.stage, programType: project.programType }, period,
    budget: { revisedCents: totals.revisedCents, committedCents: totals.committedCents, paidCents: totals.paidCents, forecastAtCompletionCents: totals.forecastAtCompletionCents, varianceCents: totals.varianceCents, percentComplete: totals.percentComplete },
    schedule: { status: sched.status, daysLate: sched.daysLate, nextMilestone: sched.nextMilestone, milestonesComplete: ms.filter((x) => x.status === 'complete').length, milestonesTotal: ms.length },
    draws: draws.filter((d) => d.status !== 'draft').slice(0, 6).map((d) => ({ number: d.number, status: d.status, requestedCents: d.requestedCents, fundedCents: d.fundedCents, periodEnd: d.periodEnd })),
    loans: loans.map((l) => ({ lender: l.lender, commitmentCents: l.commitmentCents, drawnCents: l.drawnCents })),
    photos: photos.map((p) => ({ id: p.id, fileName: p.fileName })),
    updates: updates.map((u) => ({ body: u.body, createdAt: u.createdAt.toISOString() })),
    investors: investors.map((i) => ({ commitmentCents: i.commitmentCents, fundedCents: i.fundedCents, ownershipPct: i.ownershipPct })),
    updatedReturns: { projectedProfitCents, projectedRoi, note },
  };
  const html = renderInvestorReport(data);
  const [report] = await app.db.insert(schema.investorReports).values({ projectId, organizationId: project.organizationId, period, html, data: data as unknown as Record<string, unknown> })
    .onConflictDoUpdate({ target: [schema.investorReports.projectId, schema.investorReports.period], set: { html, data: data as unknown as Record<string, unknown>, status: 'draft', updatedAt: new Date() } }).returning();
  await app.outbox.emit('report.generated', { projectId, reportId: report!.id, period, actorUserId: actorUserId ?? null });
  return report!;
}

export async function investorRoutes(app: App): Promise<void> {
  app.get('/projects/:id/investors', { schema: { tags: ['investors'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    const rows = await app.db.select({ id: schema.projectInvestors.id, userId: schema.projectInvestors.userId, email: schema.users.email, fullName: schema.users.fullName, commitmentCents: schema.projectInvestors.commitmentCents, fundedCents: schema.projectInvestors.fundedCents, ownershipPct: schema.projectInvestors.ownershipPct, prefReturnBps: schema.projectInvestors.prefReturnBps }).from(schema.projectInvestors).innerJoin(schema.users, eq(schema.users.id, schema.projectInvestors.userId)).where(eq(schema.projectInvestors.projectId, req.params.id));
    return { items: rows };
  });

  app.post('/projects/:id/investors', { schema: { tags: ['investors'], params: projectIdParam, body: z.object({ userId: z.uuid().optional(), email: z.email().optional(), commitmentCents: z.number().int().nonnegative(), fundedCents: z.number().int().nonnegative().default(0), ownershipPct: z.number().int().min(0).max(100), prefReturnBps: z.number().int().nonnegative().optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    let userId = req.body.userId;
    if (!userId) {
      if (!req.body.email) throw validation('userId or email required');
      const email = req.body.email.toLowerCase();
      let [u] = await app.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!u) [u] = await app.db.insert(schema.users).values({ email, roles: ['investor'] }).returning();
      userId = u!.id;
    }
    const [inv] = await app.db.insert(schema.projectInvestors).values({ projectId: project.id, organizationId: project.organizationId, userId: userId!, commitmentCents: req.body.commitmentCents, fundedCents: req.body.fundedCents, ownershipPct: req.body.ownershipPct, prefReturnBps: req.body.prefReturnBps }).onConflictDoUpdate({ target: [schema.projectInvestors.projectId, schema.projectInvestors.userId], set: { commitmentCents: req.body.commitmentCents, ownershipPct: req.body.ownershipPct } }).returning();
    await app.db.insert(schema.projectMembers).values({ projectId: project.id, userId: userId!, role: 'investor' }).onConflictDoNothing();
    reply.status(201);
    return { investor: inv };
  });

  app.post('/projects/:id/capital-calls', { schema: { tags: ['investors'], params: projectIdParam, body: z.object({ amountCents: z.number().int().positive(), dueDate: dateStr, memo: z.string().max(2000).optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [call] = await app.db.insert(schema.capitalCalls).values({ projectId: project.id, organizationId: project.organizationId, ...req.body }).returning();
    const investors = await app.db.select({ email: schema.users.email, userId: schema.users.id, pct: schema.projectInvestors.ownershipPct }).from(schema.projectInvestors).innerJoin(schema.users, eq(schema.users.id, schema.projectInvestors.userId)).where(eq(schema.projectInvestors.projectId, project.id));
    for (const i of investors) {
      const share = Math.round(req.body.amountCents * (i.pct / 100));
      await app.mailer.send({ to: i.email, userId: i.userId, template: 'capital_call', subject: `Capital call: ${project.name}`, text: `A capital call of $${(share / 100).toLocaleString()} (your ${i.pct}% share of $${(req.body.amountCents / 100).toLocaleString()}) is due ${req.body.dueDate}. ${req.body.memo ?? ''}` });
    }
    reply.status(201);
    return { capitalCall: call, notified: investors.length };
  });

  app.get('/projects/:id/reports', { schema: { tags: ['investors'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    const rows = await app.db.select({ id: schema.investorReports.id, period: schema.investorReports.period, status: schema.investorReports.status, sentAt: schema.investorReports.sentAt, createdAt: schema.investorReports.createdAt, data: schema.investorReports.data }).from(schema.investorReports).where(eq(schema.investorReports.projectId, req.params.id)).orderBy(desc(schema.investorReports.period));
    return { items: rows };
  });

  app.post('/projects/:id/reports', { schema: { tags: ['investors'], params: projectIdParam, body: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM') }) } }, async (req, reply) => {
    const p = requireAuth(req.principal);
    await canAccessProject(app.db, p, req.params.id, 'write');
    const report = await generateInvestorReport(app, req.params.id, req.body.period, p.id);
    reply.status(201);
    return { report };
  });

  app.get('/reports/:id', { schema: { tags: ['investors'], params: z.object({ id: z.uuid() }), querystring: z.object({ format: z.enum(['json', 'html']).default('json') }) } }, async (req, reply) => {
    const [report] = await app.db.select().from(schema.investorReports).where(eq(schema.investorReports.id, req.params.id)).limit(1);
    if (!report) throw notFound('Report');
    await canAccessProject(app.db, req.principal, report.projectId, 'read');
    if (req.query.format === 'html') return reply.type('text/html').send(report.html);
    return { report };
  });

  app.post('/reports/:id/send', { schema: { tags: ['investors'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    const [report] = await app.db.select().from(schema.investorReports).where(eq(schema.investorReports.id, req.params.id)).limit(1);
    if (!report) throw notFound('Report');
    const project = await canAccessProject(app.db, p, report.projectId, 'write');
    if (report.status === 'sent') throw conflict('Report already sent');
    const investors = await app.db.select({ email: schema.users.email, userId: schema.users.id }).from(schema.projectInvestors).innerJoin(schema.users, eq(schema.users.id, schema.projectInvestors.userId)).where(eq(schema.projectInvestors.projectId, project.id));
    for (const i of investors) await app.mailer.send({ to: i.email, userId: i.userId, template: 'investor_report', subject: `${project.name} — Investor report ${report.period}`, text: `Your ${report.period} investor report for ${project.name} is attached.`, html: report.html });
    const [updated] = await app.db.update(schema.investorReports).set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() }).where(eq(schema.investorReports.id, report.id)).returning();
    await app.outbox.emit('report.sent', { projectId: project.id, reportId: report.id, period: report.period, recipients: investors.length });
    if (isStaff(p)) await audit(app.db, { actorUserId: p.id, action: 'report.send', entityType: 'investor_report', entityId: report.id });
    return { report: updated, recipients: investors.length };
  });
}
