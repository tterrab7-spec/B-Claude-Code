import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { conflict, notFound, validation } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireAuth } from '../../lib/policy.js';
import { cashFlowFor } from './cashflow.js';
import { nextNumber } from './service.js';

const projectIdParam = z.object({ id: z.uuid() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function projectFinanceRoutes(app: App): Promise<void> {
  app.get('/projects/:id/schedule', { schema: { tags: ['schedule'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.scheduleItems).where(eq(schema.scheduleItems.projectId, req.params.id)).orderBy(asc(schema.scheduleItems.start)) };
  });
  app.post('/projects/:id/schedule', { schema: { tags: ['schedule'], params: projectIdParam, body: z.object({ name: z.string().min(1).max(200), start: dateStr, end: dateStr, percentComplete: z.number().int().min(0).max(100).default(0), dependsOn: z.uuid().optional(), milestoneId: z.uuid().optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    if (req.body.end < req.body.start) throw validation('end must be on or after start', { end: 'before start' });
    const [it] = await app.db.insert(schema.scheduleItems).values({ projectId: project.id, organizationId: project.organizationId, ...req.body }).returning();
    reply.status(201);
    return { item: it };
  });
  app.patch('/schedule/:id', { schema: { tags: ['schedule'], params: z.object({ id: z.uuid() }), body: z.object({ name: z.string().optional(), start: dateStr.optional(), end: dateStr.optional(), percentComplete: z.number().int().min(0).max(100).optional(), dependsOn: z.uuid().nullable().optional(), milestoneId: z.uuid().nullable().optional() }) } }, async (req) => {
    const [it] = await app.db.select().from(schema.scheduleItems).where(eq(schema.scheduleItems.id, req.params.id)).limit(1);
    if (!it) throw notFound('Schedule item');
    await canAccessProject(app.db, req.principal, it.projectId, 'write');
    const [updated] = await app.db.update(schema.scheduleItems).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.scheduleItems.id, it.id)).returning();
    return { item: updated };
  });

  app.get('/projects/:id/loans', { schema: { tags: ['draws'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.loans).where(eq(schema.loans.projectId, req.params.id)) };
  });
  app.post('/projects/:id/loans', { schema: { tags: ['draws'], params: projectIdParam, body: z.object({ lender: z.string().min(1).max(200), commitmentCents: z.number().int().nonnegative(), rateBps: z.number().int().nonnegative().default(0), maturity: dateStr.optional(), retainagePct: z.number().int().min(0).max(100).default(10), drawnCents: z.number().int().nonnegative().default(0) }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [loan] = await app.db.insert(schema.loans).values({ projectId: project.id, organizationId: project.organizationId, ...req.body }).returning();
    reply.status(201);
    return { loan };
  });

  app.get('/projects/:id/draws', { schema: { tags: ['draws'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.draws).where(eq(schema.draws.projectId, req.params.id)).orderBy(desc(schema.draws.number)) };
  });

  /** Assemble a draw from approved, unpaid invoices not already in a draw. */
  app.post('/projects/:id/draws', { schema: { tags: ['draws'], params: projectIdParam, body: z.object({ loanId: z.uuid(), periodEnd: dateStr, expectedFundingDate: dateStr.optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [loan] = await app.db.select().from(schema.loans).where(and(eq(schema.loans.id, req.body.loanId), eq(schema.loans.projectId, project.id))).limit(1);
    if (!loan) throw notFound('Loan');
    const eligible = await app.db.select().from(schema.invoices).where(and(eq(schema.invoices.projectId, project.id), eq(schema.invoices.status, 'approved')));
    if (!eligible.length) throw conflict('No approved, unpaid invoices to include in a draw');
    const retainage = (amt: number) => Math.round(amt * (loan.retainagePct / 100));
    const requested = eligible.reduce((s, i) => s + i.amountCents, 0);
    const held = eligible.reduce((s, i) => s + (i.retainageCents || retainage(i.amountCents)), 0);
    const [draw] = await app.db.insert(schema.draws).values({ projectId: project.id, organizationId: project.organizationId, loanId: loan.id, number: await nextNumber(app, 'draws', project.id), periodEnd: req.body.periodEnd, expectedFundingDate: req.body.expectedFundingDate, requestedCents: requested, retainageHeldCents: held }).returning();
    await app.db.insert(schema.drawItems).values(eligible.map((i) => ({ drawId: draw!.id, invoiceId: i.id, budgetLineId: i.budgetLineId, description: `Invoice ${i.invoiceNumber}`, amountCents: i.amountCents, retainageCents: i.retainageCents || retainage(i.amountCents) })));
    await app.db.update(schema.invoices).set({ status: 'in_draw', drawId: draw!.id, updatedAt: new Date() }).where(inArray(schema.invoices.id, eligible.map((i) => i.id)));
    await app.outbox.emit('draw.ready', { projectId: project.id, drawId: draw!.id, number: draw!.number, requestedCents: requested, retainageHeldCents: held, lender: loan.lender, invoiceCount: eligible.length });
    reply.status(201);
    return { draw, items: eligible.length };
  });

  app.get('/draws/:id', { schema: { tags: ['draws'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const [draw] = await app.db.select().from(schema.draws).where(eq(schema.draws.id, req.params.id)).limit(1);
    if (!draw) throw notFound('Draw');
    await canAccessProject(app.db, req.principal, draw.projectId, 'read');
    const items = await app.db.select().from(schema.drawItems).where(eq(schema.drawItems.drawId, draw.id));
    const docs = await app.db.select().from(schema.documents).where(and(eq(schema.documents.projectId, draw.projectId), eq(schema.documents.category, `draw-${draw.number}`)));
    return { draw, items, totals: { requestedCents: draw.requestedCents, retainageHeldCents: draw.retainageHeldCents, netCents: draw.requestedCents - draw.retainageHeldCents, fundedCents: draw.fundedCents }, documents: docs };
  });

  app.post('/draws/:id/submit', { schema: { tags: ['draws'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const body = z.object({ expectedFundingDate: dateStr.optional() }).parse(req.body ?? {});
    const p = requireAuth(req.principal);
    const [draw] = await app.db.select().from(schema.draws).where(eq(schema.draws.id, req.params.id)).limit(1);
    if (!draw) throw notFound('Draw');
    await canAccessProject(app.db, p, draw.projectId, 'write');
    if (draw.status !== 'draft') throw conflict(`Draw is ${draw.status}`);
    const [updated] = await app.db.update(schema.draws).set({ status: 'submitted', submittedAt: new Date(), expectedFundingDate: body.expectedFundingDate ?? draw.expectedFundingDate, updatedAt: new Date() }).where(eq(schema.draws.id, draw.id)).returning();
    await app.outbox.emit('draw.submitted', { projectId: draw.projectId, drawId: draw.id, number: draw.number, requestedCents: draw.requestedCents });
    if (isStaff(p)) await audit(app.db, { actorUserId: p.id, action: 'draw.submit', entityType: 'draw', entityId: draw.id });
    return { draw: updated };
  });

  /** Funding reconciles: invoices in the draw become paid, loan drawn balance increases by the funded amount. */
  app.post('/draws/:id/fund', { schema: { tags: ['draws'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const body = z.object({ fundedCents: z.number().int().nonnegative().optional(), fundedAt: z.string().optional() }).parse(req.body ?? {});
    const p = requireAuth(req.principal);
    const [draw] = await app.db.select().from(schema.draws).where(eq(schema.draws.id, req.params.id)).limit(1);
    if (!draw) throw notFound('Draw');
    await canAccessProject(app.db, p, draw.projectId, 'write');
    if (draw.status === 'funded') throw conflict('Draw already funded');
    const funded = body.fundedCents ?? (draw.requestedCents - draw.retainageHeldCents);
    const fundedAt = body.fundedAt ? new Date(body.fundedAt) : new Date();
    const [updated] = await app.db.update(schema.draws).set({ status: 'funded', fundedCents: funded, fundedAt, updatedAt: new Date() }).where(eq(schema.draws.id, draw.id)).returning();
    const items = await app.db.select().from(schema.drawItems).where(eq(schema.drawItems.drawId, draw.id));
    const invoiceIds = items.map((i) => i.invoiceId).filter((x): x is string => !!x);
    if (invoiceIds.length) await app.db.update(schema.invoices).set({ status: 'paid', paidAt: fundedAt, updatedAt: new Date() }).where(inArray(schema.invoices.id, invoiceIds));
    if (draw.loanId) {
      const [loan] = await app.db.select().from(schema.loans).where(eq(schema.loans.id, draw.loanId));
      if (loan) await app.db.update(schema.loans).set({ drawnCents: loan.drawnCents + funded, updatedAt: new Date() }).where(eq(schema.loans.id, loan.id));
    }
    await app.outbox.emit('draw.funded', { projectId: draw.projectId, drawId: draw.id, number: draw.number, fundedCents: funded, variance: funded - (draw.requestedCents - draw.retainageHeldCents) });
    if (isStaff(p)) await audit(app.db, { actorUserId: p.id, action: 'draw.fund', entityType: 'draw', entityId: draw.id, data: { fundedCents: funded } });
    return { draw: updated, invoicesPaid: invoiceIds.length };
  });

  app.get('/projects/:id/cashflow', { schema: { tags: ['draws'], params: projectIdParam, querystring: z.object({ weeks: z.coerce.number().int().min(4).max(52).default(12) }) } }, async (req) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'read');
    const cf = await cashFlowFor(app, project.id, req.query.weeks);
    const meta = (project.meta ?? {}) as Record<string, unknown>;
    if (cf.shortfall && meta.lastShortfallWeek !== cf.shortfall.weekStart) {
      await app.db.update(schema.projects).set({ meta: { ...meta, lastShortfallWeek: cf.shortfall.weekStart } }).where(eq(schema.projects.id, project.id));
      await app.outbox.emit('cash.shortfall_alert', { projectId: project.id, weekStart: cf.shortfall.weekStart, amountCents: cf.shortfall.amountCents });
    }
    return cf;
  });
}
