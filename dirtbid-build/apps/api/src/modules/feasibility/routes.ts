import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { forbidden, notFound, unauthorized } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireStaff } from '../../lib/policy.js';
import { createRun, hasPaidEnhanced, reportFor, reviewRun, type RunRow } from './service.js';
import { resolveCached, ParcelResolveError } from '../parcels/service.js';

const tri = z.enum(['yes', 'no', 'unknown']);
export const underwritingInputSchema = z.object({
  address: z.string().max(300).optional(),
  marketCode: z.string().min(2),
  zip: z.string().max(12).optional(),
  lotSizeSf: z.number().positive(),
  existingStructureSf: z.number().nonnegative().optional(),
  zoningCode: z.string().min(1).max(30),
  arvPerSf: z.number().positive().optional(),
  comps: z.array(z.object({ address: z.string().optional(), salePrice: z.number().positive(), livingSf: z.number().positive(), soldDate: z.string().optional(), distanceMiles: z.number().optional() })).optional(),
  projectType: z.enum(['fire_rebuild', 'demo_rebuild', 'vacant_land', 'addition_adu', 'subdivision']),
  targetHomeSf: z.number().positive().optional(),
  site: z.object({
    cornerLot: z.boolean().optional(), hillside: z.boolean().optional(), slopePct: z.number().optional(), lotWidthFt: z.number().optional(), lotDepthFt: z.number().optional(),
    historic: tri.optional(), tenantOccupiedLast3Years: tri.optional(), priorLegalUnits: z.number().int().optional(), floodZone: z.string().max(4).optional(), wetlandsAcres: z.number().nonnegative().optional(),
    rpaBuffer: tri.optional(), fireHazardZone: tri.optional(), stateRouteFrontage: tri.optional(), soils: z.enum(['stable', 'marginal', 'poor', 'unknown']).optional(),
    utilities: z.object({ water: tri.optional(), sewer: tri.optional(), power: tri.optional(), gas: tri.optional(), broadband: tri.optional() }).optional(), transitWithinHalfMile: tri.optional(),
  }).optional(),
  assumptions: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  sitework: z.object({ treeCoverPct: z.number().min(0).max(1).optional(), waterMainDistanceFt: z.number().nonnegative().optional(), sewerMainDistanceFt: z.number().nonnegative().optional(), powerDistanceFt: z.number().nonnegative().optional(), newStreetLf: z.number().nonnegative().optional(), stormwaterRequired: z.boolean().optional(), hydric: z.boolean().optional(), regionMultiplier: z.number().positive().optional(), dirtbidLandScreeningTotal: z.number().nonnegative().optional() }).optional(),
});

/** Overrides win; `site` and `sitework` merge per key; everything else is replaced. */
export function mergeUnderwritingInput(base: Record<string, any>, overrides: Record<string, any> | undefined): Record<string, any> {
  if (!overrides) return { ...base };
  const out: Record<string, any> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) continue;
    if ((k === 'site' || k === 'sitework') && v && typeof v === 'object' && !Array.isArray(v)) {
      const merged: Record<string, any> = { ...(base[k] ?? {}) };
      for (const [sk, sv] of Object.entries(v as Record<string, any>)) {
        if (sv === undefined) continue;
        if (sk === 'utilities' && sv && typeof sv === 'object') merged[sk] = { ...(merged[sk] ?? {}), ...sv };
        else merged[sk] = sv;
      }
      out[k] = merged;
    } else out[k] = v;
  }
  return out;
}

async function loadRun(app: App, id: string): Promise<RunRow> {
  const [run] = await app.db.select().from(schema.feasibilityRuns).where(eq(schema.feasibilityRuns.id, id)).limit(1);
  if (!run) throw notFound('Feasibility run');
  return run;
}

/** Owner, staff, project member or a holder of the run's signed access token may read it. */
async function assertCanRead(app: App, req: { principal: any; query?: any; headers: any }, run: RunRow): Promise<void> {
  const p = req.principal;
  const token = (req.query as any)?.access ?? req.headers['x-run-access'];
  if (token && token === run.accessToken) return;
  if (!p) throw unauthorized();
  if (isStaff(p)) return;
  if (run.userId === p.id) return;
  if (run.projectId) { await canAccessProject(app.db, p, run.projectId, 'read'); return; }
  if (run.leadId) {
    const [lead] = await app.db.select({ email: schema.leads.email }).from(schema.leads).where(eq(schema.leads.id, run.leadId)).limit(1);
    if (lead && lead.email === p.email) return;
  }
  throw forbidden('No access to this run');
}

export async function feasibilityRoutes(app: App): Promise<void> {
  app.post('/feasibility/runs', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour', keyGenerator: (req: any) => req.principal?.id ?? req.ip } },
    schema: { tags: ['feasibility'], body: z.object({ input: underwritingInputSchema, leadId: z.uuid().optional(), projectId: z.uuid().optional(), tier: z.enum(['lite', 'enhanced']).optional() }) },
  }, async (req, reply) => {
    const p = req.principal;
    let organizationId: string | null = null;
    if (req.body.projectId) { const project = await canAccessProject(app.db, p, req.body.projectId, 'write'); organizationId = project.organizationId; }
    const tier = req.body.tier === 'enhanced' && p && isStaff(p) ? 'enhanced' : 'lite';
    const { run, result } = await createRun(app, { input: req.body.input as any, leadId: req.body.leadId ?? null, userId: p?.id ?? null, projectId: req.body.projectId ?? null, organizationId, tier });
    reply.status(201);
    return { runId: run.id, accessToken: run.accessToken, source: run.source, result, report: reportFor(run, tier) };
  });

  /** Address-first: resolve public parcel data, merge analyst overrides, underwrite, store with the parcel snapshot. */
  app.post('/feasibility/from-address', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: (req: any) => req.principal?.id ?? req.ip } },
    schema: { tags: ['feasibility'], body: z.object({ address: z.string().min(5).max(300), leadId: z.uuid().optional(), projectId: z.uuid().optional(), overrides: underwritingInputSchema.partial().optional() }) },
  }, async (req, reply) => {
    const p = req.principal;
    let organizationId: string | null = null;
    if (req.body.projectId) { const project = await canAccessProject(app.db, p, req.body.projectId, 'write'); organizationId = project.organizationId; }
    let resolved;
    try { resolved = await resolveCached(app, req.body.address); }
    catch (e) {
      if (e instanceof ParcelResolveError) return reply.status(422).send({ error: { code: 'validation', message: e.message, fields: { address: e.message } } });
      throw e;
    }
    const parcel = resolved.parcel;
    const input = mergeUnderwritingInput(parcel.underwritingInput as unknown as Record<string, any>, req.body.overrides as Record<string, any> | undefined);
    if (!input.zoningCode || !String(input.zoningCode).trim()) {
      return reply.status(422).send({ error: { code: 'validation', message: 'Zoning not found for this locality; supply it', fields: { zoningCode: 'Zoning not found for this locality; supply it' } }, parcel });
    }
    if (!(Number(input.lotSizeSf) > 0)) {
      return reply.status(422).send({ error: { code: 'validation', message: 'Lot size not found; supply lotSizeSf', fields: { lotSizeSf: 'Parcel polygon not found; supply lotSizeSf' } }, parcel });
    }
    const tier = p && isStaff(p) ? 'enhanced' : 'lite';
    const { run, result } = await createRun(app, { input: input as any, leadId: req.body.leadId ?? null, userId: p?.id ?? null, projectId: req.body.projectId ?? null, organizationId, tier, source: 'address', resolvedParcel: parcel as unknown as Record<string, unknown> });
    reply.status(201);
    return { runId: run.id, accessToken: run.accessToken, parcel, cached: resolved.cached, result, report: reportFor(run, tier) };
  });

  app.get('/feasibility/runs', { schema: { tags: ['feasibility'], querystring: z.object({ projectId: z.uuid().optional(), leadId: z.uuid().optional() }) } }, async (req) => {
    const p = req.principal; if (!p) throw unauthorized();
    if (req.query.projectId) await canAccessProject(app.db, p, req.query.projectId, 'read');
    if (req.query.leadId && !isStaff(p)) throw forbidden('Staff only');
    const where = and(
      req.query.projectId ? eq(schema.feasibilityRuns.projectId, req.query.projectId) : undefined,
      req.query.leadId ? eq(schema.feasibilityRuns.leadId, req.query.leadId) : undefined,
      !req.query.projectId && !req.query.leadId && !isStaff(p) ? eq(schema.feasibilityRuns.userId, p.id) : undefined,
    );
    const rows = await app.db.select({ id: schema.feasibilityRuns.id, status: schema.feasibilityRuns.status, version: schema.feasibilityRuns.version, tier: schema.feasibilityRuns.tier, marketCode: schema.feasibilityRuns.marketCode, projectId: schema.feasibilityRuns.projectId, leadId: schema.feasibilityRuns.leadId, createdAt: schema.feasibilityRuns.createdAt }).from(schema.feasibilityRuns).where(where).orderBy(desc(schema.feasibilityRuns.createdAt)).limit(100);
    return { items: rows };
  });

  app.get('/feasibility/runs/:id', { schema: { tags: ['feasibility'], params: z.object({ id: z.uuid() }), querystring: z.object({ access: z.string().optional() }) } }, async (req) => {
    const run = await loadRun(app, req.params.id);
    await assertCanRead(app, req, run);
    const enhanced = (req.principal && isStaff(req.principal)) || await hasPaidEnhanced(app, run);
    return { run: { id: run.id, status: run.status, version: run.version, tier: run.tier, source: run.source, input: run.input, result: run.result, sitework: (run.result as any)?.sitework ?? null, resolvedParcel: run.resolvedParcel ?? null, analystNotes: run.analystNotes, createdAt: run.createdAt, projectId: run.projectId, leadId: run.leadId }, report: reportFor(run, enhanced ? 'enhanced' : 'lite'), enhancedAvailable: enhanced };
  });

  app.get('/feasibility/runs/:id/report', { schema: { tags: ['feasibility'], params: z.object({ id: z.uuid() }), querystring: z.object({ tier: z.enum(['lite', 'enhanced']).default('lite'), access: z.string().optional() }) } }, async (req) => {
    const run = await loadRun(app, req.params.id);
    await assertCanRead(app, req, run);
    if (req.query.tier === 'enhanced') {
      const ok = (req.principal && isStaff(req.principal)) || await hasPaidEnhanced(app, run);
      if (!ok) throw forbidden('Enhanced report requires a paid Enhanced Feasibility order');
    }
    return reportFor(run, req.query.tier);
  });

  app.post('/feasibility/runs/:id/review', { schema: { tags: ['feasibility'], params: z.object({ id: z.uuid() }), body: z.object({ input: underwritingInputSchema.partial().optional(), analystNotes: z.string().max(10000) }) } }, async (req) => {
    const staff = requireStaff(req.principal);
    const run = await loadRun(app, req.params.id);
    const { run: updated, result } = await reviewRun(app, run, req.body.input as any, req.body.analystNotes);
    await audit(app.db, { actorUserId: staff.id, action: 'feasibility.review', entityType: 'feasibility_run', entityId: run.id, data: { version: updated.version } });
    return { run: { id: updated.id, status: updated.status, version: updated.version, analystNotes: updated.analystNotes }, result, report: reportFor(updated, 'enhanced') };
  });

  app.post('/feasibility/runs/:id/deliver', { schema: { tags: ['feasibility'], params: z.object({ id: z.uuid() }), body: z.object({ tier: z.enum(['lite', 'enhanced']), email: z.email().optional() }) } }, async (req) => {
    const staff = requireStaff(req.principal);
    const run = await loadRun(app, req.params.id);
    let to = req.body.email ?? null;
    if (!to && run.userId) { const [u] = await app.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, run.userId)); to = u?.email ?? null; }
    if (!to && run.leadId) { const [l] = await app.db.select({ email: schema.leads.email }).from(schema.leads).where(eq(schema.leads.id, run.leadId)); to = l?.email ?? null; }
    if (!to) throw forbidden('No recipient email on this run');
    const link = `${app.cfg.webUrl}/report/${run.id}?access=${run.accessToken}&tier=${req.body.tier}`;
    const report = reportFor(run, req.body.tier);
    await app.mailer.send({ to, template: 'feasibility_report', subject: `${report.title} — ${report.address}`, text: `Your ${req.body.tier} feasibility report is ready: ${link}`, html: `<p>Your ${req.body.tier} feasibility report is ready.</p><p><a href="${link}">Open the report</a></p>` });
    const [updated] = await app.db.update(schema.feasibilityRuns).set({ status: 'delivered', tier: req.body.tier, deliveredAt: new Date(), updatedAt: new Date() }).where(eq(schema.feasibilityRuns.id, run.id)).returning();
    await app.outbox.emit('feasibility.delivered', { runId: run.id, tier: req.body.tier, to, leadId: run.leadId, projectId: run.projectId });
    await audit(app.db, { actorUserId: staff.id, action: 'feasibility.deliver', entityType: 'feasibility_run', entityId: run.id, data: { tier: req.body.tier, to } });
    return { run: { id: updated!.id, status: updated!.status, deliveredAt: updated!.deliveredAt }, link };
  });
}
