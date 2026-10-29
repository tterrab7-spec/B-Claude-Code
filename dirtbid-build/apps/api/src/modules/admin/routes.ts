import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { requireStaff } from '../../lib/policy.js';
import { leadStatuses } from '../leads/schema.js';

export async function adminRoutes(app: App): Promise<void> {
  app.get('/admin/pipeline', { schema: { tags: ['admin'] } }, async (req) => {
    requireStaff(req.principal);
    const rows = await app.db.select().from(schema.leads).orderBy(desc(schema.leads.createdAt)).limit(1000);
    const orders = await app.db.select().from(schema.orders).where(eq(schema.orders.status, 'paid'));
    const valueByLead = new Map<string, number>();
    for (const o of orders) if (o.leadId) valueByLead.set(o.leadId, (valueByLead.get(o.leadId) ?? 0) + o.amountCents);
    const stages = leadStatuses.map((status) => {
      const items = rows.filter((l) => l.status === status);
      return { status, count: items.length, valueCents: items.reduce((s, l) => s + (valueByLead.get(l.id) ?? 0), 0), gradeA: items.filter((l) => l.grade === 'A').length, items: items.slice(0, 50).map((l) => ({ id: l.id, kind: l.kind, fullName: l.fullName, email: l.email, grade: l.grade, score: l.score, marketCode: l.marketCode, createdAt: l.createdAt, assigneeUserId: l.assigneeUserId })) };
    });
    return { stages, total: rows.length };
  });

  app.get('/admin/metrics', { schema: { tags: ['admin'] } }, async (req) => {
    requireStaff(req.principal);
    const d7 = new Date(Date.now() - 7 * 86400000); const d30 = new Date(Date.now() - 30 * 86400000);
    const count = async (table: any, where: any) => (await app.db.select({ n: sql<number>`count(*)::int` }).from(table).where(where))[0]!.n;
    const [leads7d, leads30d, runs30d, ordersPaid30d, revenue, won30d, pendingEvents] = await Promise.all([
      count(schema.leads, gte(schema.leads.createdAt, d7)),
      count(schema.leads, gte(schema.leads.createdAt, d30)),
      count(schema.feasibilityRuns, gte(schema.feasibilityRuns.createdAt, d30)),
      count(schema.orders, and(eq(schema.orders.status, 'paid'), gte(schema.orders.paidAt, d30))),
      app.db.select({ s: sql<number>`coalesce(sum(${schema.orders.amountCents}),0)::bigint` }).from(schema.orders).where(and(eq(schema.orders.status, 'paid'), gte(schema.orders.paidAt, d30))),
      count(schema.leads, and(eq(schema.leads.status, 'won'), gte(schema.leads.updatedAt, d30))),
      count(schema.events, isNull(schema.events.deliveredAt)),
    ]);
    return { leads7d, leads30d, runs30d, ordersPaid30d, revenue30dCents: Number(revenue[0]!.s), conversionRate: leads30d ? Number((won30d / leads30d).toFixed(3)) : 0, pendingEvents };
  });

  app.get('/events', { schema: { tags: ['admin'], querystring: z.object({ type: z.string().optional(), since: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }) } }, async (req) => {
    requireStaff(req.principal);
    const rows = await app.db.select().from(schema.events).where(and(req.query.type ? eq(schema.events.type, req.query.type) : undefined, req.query.since ? gte(schema.events.occurredAt, new Date(req.query.since)) : undefined)).orderBy(desc(schema.events.occurredAt)).limit(req.query.limit);
    return { items: rows };
  });

  app.post('/events/drain', { schema: { tags: ['admin'] } }, async (req) => {
    requireStaff(req.principal);
    return { delivered: await app.outbox.drain() };
  });

  app.get('/admin/audit', { schema: { tags: ['admin'], querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }) } }, async (req) => {
    requireStaff(req.principal);
    return { items: await app.db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(req.query.limit) };
  });
}
