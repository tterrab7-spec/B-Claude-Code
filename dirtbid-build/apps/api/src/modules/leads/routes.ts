import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { notFound } from '../../lib/errors.js';
import { requireStaff } from '../../lib/policy.js';
import { issueMagicLink } from '../auth/service.js';
import { createOrder } from '../orders/service.js';
import { createProject } from '../projects/service.js';
import { convertLeadSchema, createLeadSchema, leadKinds, leadStatuses, patchLeadSchema } from './schema.js';
import { createLead } from './service.js';

const roleForKind = (kind: string): string => kind === 'homeowner_rebuild' ? 'homeowner' : kind.startsWith('builder') ? 'builder' : 'landowner';

export async function leadRoutes(app: App): Promise<void> {
  app.post('/leads', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: { tags: ['leads'], body: createLeadSchema },
  }, async (req, reply) => {
    const { lead, created, score, grade } = await createLead(app, req.body, req.ip);
    let nextStep: { type: string; url?: string } = { type: 'report_queued' };
    const kind = req.body.kind;
    if (kind === 'homeowner_rebuild' || kind === 'builder_qualification' || kind === 'builder_audit') {
      const { link } = await issueMagicLink(app, lead.email, { role: roleForKind(kind), fullName: lead.fullName, phone: lead.phone ?? undefined, redirectTo: kind === 'homeowner_rebuild' ? '/app' : '/app/portfolio' });
      nextStep = { type: 'magic_link_sent', ...(app.cfg.nodeEnv !== 'production' ? { url: link } : {}) };
    } else if (kind === 'feasibility_enhanced') {
      const order = await createOrder(app, { serviceCode: 'feasibility_enhanced', leadId: lead.id, email: lead.email });
      nextStep = { type: 'checkout', url: order.checkoutUrl ?? `${app.cfg.webUrl}/checkout/${order.id}` };
    } else if (kind === 'strategy_call' || kind === 'codev_partner') {
      nextStep = { type: 'book_call', url: `${app.cfg.webUrl}/book` };
    } else if (kind === 'calculator_unlock') {
      nextStep = { type: 'report_queued', url: `${app.cfg.webUrl}/calculator?lead=${lead.id}` };
    }
    reply.status(created ? 201 : 200);
    return { leadId: lead.id, score, grade, nextStep };
  });

  app.get('/leads', { schema: { tags: ['leads'], querystring: z.object({ status: z.enum(leadStatuses).optional(), kind: z.enum(leadKinds).optional(), grade: z.enum(['A', 'B', 'C', 'D']).optional(), q: z.string().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) }) } }, async (req) => {
    requireStaff(req.principal);
    const q = req.query;
    const where = and(
      q.status ? eq(schema.leads.status, q.status) : undefined,
      q.kind ? eq(schema.leads.kind, q.kind) : undefined,
      q.grade ? eq(schema.leads.grade, q.grade) : undefined,
      q.q ? or(ilike(schema.leads.email, `%${q.q}%`), ilike(schema.leads.fullName, `%${q.q}%`)) : undefined,
    );
    const [items, totalRows] = await Promise.all([
      app.db.select().from(schema.leads).where(where).orderBy(desc(schema.leads.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit),
      app.db.select({ total: sql<number>`count(*)::int` }).from(schema.leads).where(where),
    ]);
    return { items, total: totalRows[0]?.total ?? 0 };
  });

  app.get('/leads/:id', { schema: { tags: ['leads'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    requireStaff(req.principal);
    const [lead] = await app.db.select().from(schema.leads).where(eq(schema.leads.id, req.params.id)).limit(1);
    if (!lead) throw notFound('Lead');
    const [events, runs, orders] = await Promise.all([
      app.db.select().from(schema.leadEvents).where(eq(schema.leadEvents.leadId, lead.id)).orderBy(desc(schema.leadEvents.createdAt)),
      app.db.select({ id: schema.feasibilityRuns.id, status: schema.feasibilityRuns.status, version: schema.feasibilityRuns.version, tier: schema.feasibilityRuns.tier, marketCode: schema.feasibilityRuns.marketCode, createdAt: schema.feasibilityRuns.createdAt }).from(schema.feasibilityRuns).where(eq(schema.feasibilityRuns.leadId, lead.id)),
      app.db.select().from(schema.orders).where(eq(schema.orders.leadId, lead.id)),
    ]);
    return { lead, events, runs, orders };
  });

  app.patch('/leads/:id', { schema: { tags: ['leads'], params: z.object({ id: z.uuid() }), body: patchLeadSchema } }, async (req) => {
    const staff = requireStaff(req.principal);
    const [before] = await app.db.select().from(schema.leads).where(eq(schema.leads.id, req.params.id)).limit(1);
    if (!before) throw notFound('Lead');
    const [lead] = await app.db.update(schema.leads).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.leads.id, req.params.id)).returning();
    await audit(app.db, { actorUserId: staff.id, action: 'lead.update', entityType: 'lead', entityId: lead!.id, data: req.body as Record<string, unknown>, ipAddress: req.ip });
    if (req.body.status && req.body.status !== before.status) {
      await app.db.insert(schema.leadEvents).values({ leadId: lead!.id, type: 'status_changed', data: { from: before.status, to: req.body.status }, actorUserId: staff.id });
      await app.outbox.emit('lead.status_changed', { leadId: lead!.id, from: before.status, to: req.body.status, email: lead!.email });
    }
    return { lead };
  });

  app.post('/leads/:id/convert', { schema: { tags: ['leads'], params: z.object({ id: z.uuid() }), body: convertLeadSchema } }, async (req, reply) => {
    const staff = requireStaff(req.principal);
    const [lead] = await app.db.select().from(schema.leads).where(eq(schema.leads.id, req.params.id)).limit(1);
    if (!lead) throw notFound('Lead');
    let [user] = await app.db.select().from(schema.users).where(eq(schema.users.email, lead.email)).limit(1);
    if (!user) [user] = await app.db.insert(schema.users).values({ email: lead.email, fullName: lead.fullName, phone: lead.phone, roles: [roleForKind(lead.kind)] }).returning();
    const property = lead.property as Record<string, any>;
    const [run] = await app.db.select({ id: schema.feasibilityRuns.id }).from(schema.feasibilityRuns).where(eq(schema.feasibilityRuns.leadId, lead.id)).orderBy(desc(schema.feasibilityRuns.createdAt)).limit(1);
    const project = await createProject(app, {
      name: req.body.projectName ?? (property.address ? `${property.address}` : `${lead.fullName} project`),
      programType: req.body.programType,
      ownerUserId: user!.id,
      address: property.address ?? null,
      marketCode: lead.marketCode ?? null,
      lotSizeSf: property.lotSizeUnit === 'acres' ? Math.round(Number(property.lotSize ?? 0) * 43560) || null : Number(property.lotSize ?? 0) || null,
      runId: run?.id ?? null,
    }, staff.id);
    await app.db.update(schema.leads).set({ status: 'won', userId: user!.id, projectId: project.id, updatedAt: new Date() }).where(eq(schema.leads.id, lead.id));
    await app.db.insert(schema.leadEvents).values({ leadId: lead.id, type: 'converted', data: { projectId: project.id }, actorUserId: staff.id });
    await audit(app.db, { actorUserId: staff.id, action: 'lead.convert', entityType: 'lead', entityId: lead.id, data: { projectId: project.id, userId: user!.id } });
    reply.status(201);
    return { projectId: project.id, userId: user!.id };
  });
}
