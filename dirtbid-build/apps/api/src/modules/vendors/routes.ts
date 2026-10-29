import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { notFound } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireAuth, requireOrgMember } from '../../lib/policy.js';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const vendorBody = z.object({ organizationId: z.uuid().optional(), name: z.string().min(1).max(200), trades: z.array(z.string().max(60)).default([]), contactName: z.string().max(120).optional(), email: z.email().optional(), phone: z.string().max(40).optional(), licenseNo: z.string().max(60).optional(), licenseExpiry: dateStr.optional(), insuranceExpiry: dateStr.optional(), w9OnFile: z.boolean().default(false), rating: z.number().int().min(1).max(5).optional(), notes: z.string().max(2000).optional() });

const vendorPatch = z.object({ name: z.string().min(1).max(200).optional(), trades: z.array(z.string().max(60)).optional(), contactName: z.string().max(120).optional(), email: z.email().optional(), phone: z.string().max(40).optional(), licenseNo: z.string().max(60).optional(), licenseExpiry: dateStr.optional(), insuranceExpiry: dateStr.optional(), w9OnFile: z.boolean().optional(), rating: z.number().int().min(1).max(5).optional(), notes: z.string().max(2000).optional() });

export async function vendorsWithExpiringCompliance(app: App, organizationId: string | null, withinDays: number) {
  const cutoff = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);
  const where = and(organizationId ? eq(schema.vendors.organizationId, organizationId) : undefined, or(lte(schema.vendors.insuranceExpiry, cutoff), lte(schema.vendors.licenseExpiry, cutoff)));
  return app.db.select().from(schema.vendors).where(where).orderBy(asc(schema.vendors.insuranceExpiry));
}

export async function vendorRoutes(app: App): Promise<void> {
  app.get('/vendors', { schema: { tags: ['vendors'], querystring: z.object({ organizationId: z.uuid().optional(), trade: z.string().optional(), expiringWithinDays: z.coerce.number().int().positive().optional(), q: z.string().optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    const orgIds = req.query.organizationId ? [requireOrgMember(p, req.query.organizationId) && req.query.organizationId] : isStaff(p) ? null : p.organizationIds;
    if (req.query.expiringWithinDays) {
      const rows = await vendorsWithExpiringCompliance(app, orgIds?.[0] ?? null, req.query.expiringWithinDays);
      return { items: orgIds ? rows.filter((v) => v.organizationId && orgIds.includes(v.organizationId)) : rows };
    }
    const where = and(
      orgIds ? (orgIds.length ? inArray(schema.vendors.organizationId, orgIds) : sql`false`) : undefined,
      req.query.trade ? sql`${schema.vendors.trades} @> ${JSON.stringify([req.query.trade])}::jsonb` : undefined,
      req.query.q ? sql`${schema.vendors.name} ilike ${'%' + req.query.q + '%'}` : undefined,
    );
    return { items: await app.db.select().from(schema.vendors).where(where).orderBy(asc(schema.vendors.name)) };
  });

  app.post('/vendors', { schema: { tags: ['vendors'], body: vendorBody } }, async (req, reply) => {
    const p = requireAuth(req.principal);
    const organizationId = req.body.organizationId ?? p.organizationIds[0] ?? null;
    if (organizationId) requireOrgMember(p, organizationId); else if (!isStaff(p)) requireOrgMember(p, null);
    const [v] = await app.db.insert(schema.vendors).values({ ...req.body, organizationId }).returning();
    reply.status(201);
    return { vendor: v };
  });

  app.patch('/vendors/:id', { schema: { tags: ['vendors'], params: z.object({ id: z.uuid() }), body: vendorPatch } }, async (req) => {
    const p = requireAuth(req.principal);
    const [v] = await app.db.select().from(schema.vendors).where(eq(schema.vendors.id, req.params.id)).limit(1);
    if (!v) throw notFound('Vendor');
    requireOrgMember(p, v.organizationId);
    const [updated] = await app.db.update(schema.vendors).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.vendors.id, v.id)).returning();
    return { vendor: updated };
  });

  app.get('/projects/:id/bids', { schema: { tags: ['vendors'], params: z.object({ id: z.uuid() }), querystring: z.object({ scopeCode: z.string().optional() }) } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.bids).where(and(eq(schema.bids.projectId, req.params.id), req.query.scopeCode ? eq(schema.bids.scopeCode, req.query.scopeCode) : undefined)).orderBy(asc(schema.bids.amountCents)) };
  });

  app.post('/projects/:id/bids', { schema: { tags: ['vendors'], params: z.object({ id: z.uuid() }), body: z.object({ scopeCode: z.string().min(1).max(60), vendorId: z.uuid(), amountCents: z.number().int().nonnegative(), leadTimeDays: z.number().int().nonnegative().optional(), notes: z.string().max(2000).optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const [b] = await app.db.insert(schema.bids).values({ projectId: project.id, organizationId: project.organizationId, ...req.body }).returning();
    reply.status(201);
    return { bid: b };
  });

  /** Rank bids for a scope and show spread against the matching budget line (by code or CSI division). */
  app.get('/projects/:id/bids/compare', { schema: { tags: ['vendors'], params: z.object({ id: z.uuid() }), querystring: z.object({ scopeCode: z.string().min(1) }) } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    const [bids, lines, vendors] = await Promise.all([
      app.db.select().from(schema.bids).where(and(eq(schema.bids.projectId, req.params.id), eq(schema.bids.scopeCode, req.query.scopeCode))).orderBy(asc(schema.bids.amountCents)),
      app.db.select().from(schema.budgetLines).where(eq(schema.budgetLines.projectId, req.params.id)),
      app.db.select().from(schema.vendors),
    ]);
    const scope = req.query.scopeCode.toLowerCase();
    const line = lines.find((l) => l.code.toLowerCase() === scope) ?? lines.find((l) => l.csiDivision === scope.slice(0, 2)) ?? null;
    const budget = line ? line.originalCents + line.approvedChangesCents : null;
    const low = bids[0]?.amountCents ?? null;
    const ranked = bids.map((b, i) => {
      const v = vendors.find((x) => x.id === b.vendorId);
      return { rank: i + 1, bidId: b.id, vendorId: b.vendorId, vendorName: v?.name ?? 'Unknown', rating: v?.rating ?? null, insuranceExpiry: v?.insuranceExpiry ?? null, amountCents: b.amountCents, leadTimeDays: b.leadTimeDays, deltaToLowCents: low !== null ? b.amountCents - low : null, deltaToBudgetCents: budget !== null ? b.amountCents - budget : null, pctOfBudget: budget ? Number((b.amountCents / budget).toFixed(3)) : null, notes: b.notes };
    });
    const avg = bids.length ? Math.round(bids.reduce((s, b) => s + b.amountCents, 0) / bids.length) : null;
    return { scopeCode: req.query.scopeCode, budgetLine: line ? { id: line.id, code: line.code, description: line.description, budgetCents: budget } : null, count: bids.length, lowCents: low, averageCents: avg, spreadCents: bids.length > 1 ? bids[bids.length - 1]!.amountCents - low! : 0, bids: ranked, recommendation: ranked[0] ? (budget !== null && ranked[0].amountCents > budget ? `Low bid is ${Math.round(((ranked[0].amountCents - budget) / budget) * 100)}% over budget; value-engineer scope or rebid.` : `Award to ${ranked[0].vendorName} pending insurance and reference check.`) : 'No bids received.' };
  });
}
