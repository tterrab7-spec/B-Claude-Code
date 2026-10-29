import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { conflict, notFound } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireAuth } from '../../lib/policy.js';
import { budgetFor, nextNumber } from './service.js';

const projectIdParam = z.object({ id: z.uuid() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lineSchema = z.object({ csiDivision: z.string().regex(/^\d{2}$/), code: z.string().min(1).max(40), description: z.string().min(1).max(300), originalCents: z.number().int().nonnegative().default(0), approvedChangesCents: z.number().int().default(0), forecastToCompleteCents: z.number().int().nonnegative().nullable().optional(), sortOrder: z.number().int().optional() });
// Patch schema has no defaults: a partial update must never reset untouched fields.
const linePatchSchema = z.object({ csiDivision: z.string().regex(/^\d{2}$/).optional(), code: z.string().min(1).max(40).optional(), description: z.string().min(1).max(300).optional(), originalCents: z.number().int().nonnegative().optional(), approvedChangesCents: z.number().int().optional(), forecastToCompleteCents: z.number().int().nonnegative().nullable().optional(), sortOrder: z.number().int().optional() });

export async function projectBudgetRoutes(app: App): Promise<void> {
  app.get('/projects/:id/budget', { schema: { tags: ['budget'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return budgetFor(app, req.params.id);
  });

  app.post('/projects/:id/budget', { schema: { tags: ['budget'], params: projectIdParam, body: z.union([lineSchema, z.object({ lines: z.array(lineSchema).min(1) })]) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const lines = 'lines' in req.body ? req.body.lines : [req.body];
    const rows = await app.db.insert(schema.budgetLines).values(lines.map((l, i) => ({ projectId: project.id, organizationId: project.organizationId, ...l, sortOrder: l.sortOrder ?? i }))).returning();
    reply.status(201);
    return { lines: rows };
  });

  app.patch('/budget-lines/:id', { schema: { tags: ['budget'], params: z.object({ id: z.uuid() }), body: linePatchSchema } }, async (req) => {
    const [line] = await app.db.select().from(schema.budgetLines).where(eq(schema.budgetLines.id, req.params.id)).limit(1);
    if (!line) throw notFound('Budget line');
    await canAccessProject(app.db, req.principal, line.projectId, 'write');
    const [updated] = await app.db.update(schema.budgetLines).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.budgetLines.id, line.id)).returning();
    await maybeVarianceAlert(app, line.projectId);
    return { line: updated };
  });

  app.get('/projects/:id/commitments', { schema: { tags: ['budget'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.commitments).where(eq(schema.commitments.projectId, req.params.id)).orderBy(desc(schema.commitments.createdAt)) };
  });

  app.post('/projects/:id/commitments', { schema: { tags: ['budget'], params: projectIdParam, body: z.object({ vendorId: z.uuid().optional(), budgetLineId: z.uuid(), description: z.string().min(1).max(300), amountCents: z.number().int().nonnegative(), status: z.enum(['draft', 'issued', 'closed']).default('issued') }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [c] = await app.db.insert(schema.commitments).values({ projectId: project.id, organizationId: project.organizationId, ...req.body }).returning();
    reply.status(201);
    return { commitment: c };
  });

  app.patch('/commitments/:id', { schema: { tags: ['budget'], params: z.object({ id: z.uuid() }), body: z.object({ description: z.string().optional(), amountCents: z.number().int().nonnegative().optional(), status: z.enum(['draft', 'issued', 'closed']).optional(), vendorId: z.uuid().nullable().optional() }) } }, async (req) => {
    const [c] = await app.db.select().from(schema.commitments).where(eq(schema.commitments.id, req.params.id)).limit(1);
    if (!c) throw notFound('Commitment');
    await canAccessProject(app.db, req.principal, c.projectId, 'write');
    const [updated] = await app.db.update(schema.commitments).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.commitments.id, c.id)).returning();
    return { commitment: updated };
  });

  app.get('/projects/:id/invoices', { schema: { tags: ['invoices'], params: projectIdParam, querystring: z.object({ status: z.enum(['pending_approval', 'approved', 'rejected', 'in_draw', 'paid']).optional() }) } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.invoices).where(and(eq(schema.invoices.projectId, req.params.id), req.query.status ? eq(schema.invoices.status, req.query.status) : undefined)).orderBy(desc(schema.invoices.createdAt)) };
  });

  app.post('/projects/:id/invoices', { schema: { tags: ['invoices'], params: projectIdParam, body: z.object({ vendorId: z.uuid().optional(), commitmentId: z.uuid().optional(), budgetLineId: z.uuid(), invoiceNumber: z.string().min(1).max(60), amountCents: z.number().int().positive(), retainageCents: z.number().int().nonnegative().default(0), invoiceDate: dateStr, dueDate: dateStr.optional(), documentId: z.uuid().optional(), note: z.string().max(1000).optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [inv] = await app.db.insert(schema.invoices).values({ projectId: project.id, organizationId: project.organizationId, ...req.body }).returning();
    await app.outbox.emit('invoice.pending_approval', { projectId: project.id, invoiceId: inv!.id, vendorId: inv!.vendorId, amountCents: inv!.amountCents, invoiceNumber: inv!.invoiceNumber });
    reply.status(201);
    return { invoice: inv };
  });

  for (const action of ['approve', 'reject', 'mark-paid'] as const) {
    app.post(`/invoices/:id/${action}`, { schema: { tags: ['invoices'], params: z.object({ id: z.uuid() }) } }, async (req) => {
      const note = typeof (req.body as any)?.note === 'string' ? String((req.body as any).note).slice(0, 1000) : undefined;
      const p = requireAuth(req.principal);
      const [inv] = await app.db.select().from(schema.invoices).where(eq(schema.invoices.id, req.params.id)).limit(1);
      if (!inv) throw notFound('Invoice');
      await canAccessProject(app.db, p, inv.projectId, 'write');
      const allowed: Record<string, string[]> = { approve: ['pending_approval'], reject: ['pending_approval', 'approved'], 'mark-paid': ['approved', 'in_draw'] };
      if (!allowed[action]!.includes(inv.status)) throw conflict(`Cannot ${action} an invoice in status ${inv.status}`);
      const set: Partial<typeof schema.invoices.$inferInsert> = { updatedAt: new Date(), note: note ?? inv.note };
      if (action === 'approve') { set.status = 'approved'; set.approvedAt = new Date(); }
      if (action === 'reject') set.status = 'rejected';
      if (action === 'mark-paid') { set.status = 'paid'; set.paidAt = new Date(); }
      const [updated] = await app.db.update(schema.invoices).set(set).where(eq(schema.invoices.id, inv.id)).returning();
      if (action === 'approve') await app.outbox.emit('invoice.approved', { projectId: inv.projectId, invoiceId: inv.id, amountCents: inv.amountCents });
      if (isStaff(p)) await audit(app.db, { actorUserId: p.id, action: `invoice.${action}`, entityType: 'invoice', entityId: inv.id });
      await maybeVarianceAlert(app, inv.projectId);
      return { invoice: updated };
    });
  }

  app.get('/projects/:id/change-orders', { schema: { tags: ['budget'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.changeOrders).where(eq(schema.changeOrders.projectId, req.params.id)).orderBy(asc(schema.changeOrders.number)) };
  });

  app.post('/projects/:id/change-orders', { schema: { tags: ['budget'], params: projectIdParam, body: z.object({ budgetLineId: z.uuid(), description: z.string().min(1).max(300), amountCents: z.number().int(), daysImpact: z.number().int().default(0), reason: z.string().max(1000).optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [co] = await app.db.insert(schema.changeOrders).values({ projectId: project.id, organizationId: project.organizationId, number: await nextNumber(app, 'change_orders', project.id), ...req.body }).returning();
    reply.status(201);
    return { changeOrder: co };
  });

  for (const action of ['approve', 'reject'] as const) {
    app.post(`/change-orders/:id/${action}`, { schema: { tags: ['budget'], params: z.object({ id: z.uuid() }) } }, async (req) => {
      const p = requireAuth(req.principal);
      const [co] = await app.db.select().from(schema.changeOrders).where(eq(schema.changeOrders.id, req.params.id)).limit(1);
      if (!co) throw notFound('Change order');
      await canAccessProject(app.db, p, co.projectId, 'write');
      if (co.status !== 'proposed') throw conflict(`Change order already ${co.status}`);
      const [updated] = await app.db.update(schema.changeOrders).set({ status: action === 'approve' ? 'approved' : 'rejected', decidedAt: new Date(), updatedAt: new Date() }).where(eq(schema.changeOrders.id, co.id)).returning();
      if (action === 'approve' && co.budgetLineId) {
        const [line] = await app.db.select().from(schema.budgetLines).where(eq(schema.budgetLines.id, co.budgetLineId));
        if (line) await app.db.update(schema.budgetLines).set({ approvedChangesCents: line.approvedChangesCents + co.amountCents, updatedAt: new Date() }).where(eq(schema.budgetLines.id, line.id));
        await app.outbox.emit('change_order.approved', { projectId: co.projectId, changeOrderId: co.id, amountCents: co.amountCents, daysImpact: co.daysImpact, budgetLineId: co.budgetLineId });
        if (co.daysImpact) {
          const items = await app.db.select().from(schema.scheduleItems).where(eq(schema.scheduleItems.projectId, co.projectId));
          for (const it of items.filter((x) => x.percentComplete < 100)) {
            const end = new Date(it.end); end.setUTCDate(end.getUTCDate() + co.daysImpact);
            await app.db.update(schema.scheduleItems).set({ end: end.toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(schema.scheduleItems.id, it.id));
          }
        }
      }
      if (isStaff(p)) await audit(app.db, { actorUserId: p.id, action: `change_order.${action}`, entityType: 'change_order', entityId: co.id });
      return { changeOrder: updated };
    });
  }
}

/** Emit a variance alert once per project when FAC exceeds revised budget by more than 2%. */
export async function maybeVarianceAlert(app: App, projectId: string): Promise<void> {
  const { totals } = await budgetFor(app, projectId);
  if (totals.revisedCents > 0 && totals.varianceCents < -0.02 * totals.revisedCents) {
    const [project] = await app.db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    const meta = (project?.meta ?? {}) as Record<string, unknown>;
    if (meta.lastVarianceAlertCents === totals.varianceCents) return;
    await app.db.update(schema.projects).set({ meta: { ...meta, lastVarianceAlertCents: totals.varianceCents }, riskLevel: 'high' }).where(eq(schema.projects.id, projectId));
    await app.outbox.emit('budget.variance_alert', { projectId, varianceCents: totals.varianceCents, revisedCents: totals.revisedCents, forecastAtCompletionCents: totals.forecastAtCompletionCents });
  }
}
