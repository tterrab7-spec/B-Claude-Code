import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { notFound, validation } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireAuth, requireOrgMember } from '../../lib/policy.js';
import { createProject, PHASES, projectSummary } from './service.js';

const projectIdParam = z.object({ id: z.uuid() });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export async function projectCoreRoutes(app: App): Promise<void> {
  app.post('/projects', { schema: { tags: ['projects'], body: z.object({ name: z.string().min(2).max(200), programType: z.enum(['boyl', 'codev', 'rebuild', 'builder_ops']), organizationId: z.uuid().optional(), address: z.string().max(300).optional(), marketCode: z.string().optional(), lotSizeSf: z.number().int().positive().optional(), runId: z.uuid().optional(), serviceLevel: z.enum(['oversight', 'owners_rep', 'full_delivery']).optional() }) } }, async (req, reply) => {
    const p = requireAuth(req.principal);
    if (req.body.organizationId) requireOrgMember(p, req.body.organizationId);
    const project = await createProject(app, { ...req.body, organizationId: req.body.organizationId ?? null, ownerUserId: req.body.organizationId ? null : p.id }, p.id);
    if (req.body.organizationId) await app.db.insert(schema.projectMembers).values({ projectId: project.id, userId: p.id, role: 'owner' }).onConflictDoNothing();
    reply.status(201);
    return { project };
  });

  app.get('/projects', { schema: { tags: ['projects'], querystring: z.object({ organizationId: z.uuid().optional(), status: z.string().optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    let rows: (typeof schema.projects.$inferSelect)[];
    if (req.query.organizationId) {
      requireOrgMember(p, req.query.organizationId);
      rows = await app.db.select().from(schema.projects).where(eq(schema.projects.organizationId, req.query.organizationId)).orderBy(desc(schema.projects.createdAt));
    } else if (isStaff(p)) {
      rows = await app.db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt)).limit(500);
    } else {
      const memberIds = (await app.db.select({ projectId: schema.projectMembers.projectId }).from(schema.projectMembers).where(eq(schema.projectMembers.userId, p.id))).map((m) => m.projectId);
      const byOrg = p.organizationIds.length ? await app.db.select().from(schema.projects).where(inArray(schema.projects.organizationId, p.organizationIds)) : [];
      const own = await app.db.select().from(schema.projects).where(eq(schema.projects.ownerUserId, p.id));
      const byMember = memberIds.length ? await app.db.select().from(schema.projects).where(inArray(schema.projects.id, memberIds)) : [];
      const seen = new Set<string>(); rows = [];
      for (const r of [...own, ...byOrg, ...byMember]) if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); }
    }
    if (req.query.status) rows = rows.filter((r) => r.status === req.query.status);
    const items = await Promise.all(rows.map(async (project) => ({ project, summary: await projectSummary(app, project) })));
    return { items };
  });

  app.get('/projects/:id', { schema: { tags: ['projects'], params: projectIdParam } }, async (req) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { project, summary: await projectSummary(app, project), phases: PHASES };
  });

  app.patch('/projects/:id', { schema: { tags: ['projects'], params: projectIdParam, body: z.object({ name: z.string().min(2).max(200).optional(), stage: z.enum(PHASES).optional(), status: z.enum(['active', 'on_hold', 'complete', 'cancelled']).optional(), address: z.string().max(300).optional(), serviceLevel: z.enum(['oversight', 'owners_rep', 'full_delivery']).nullable().optional(), riskLevel: z.enum(['low', 'medium', 'high']).optional(), targetStart: dateStr.optional(), targetEnd: dateStr.optional(), meta: z.record(z.string(), z.unknown()).optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    await canAccessProject(app.db, p, req.params.id, 'write');
    const [project] = await app.db.update(schema.projects).set({ ...req.body, updatedAt: new Date() }).where(eq(schema.projects.id, req.params.id)).returning();
    if (isStaff(p)) await audit(app.db, { actorUserId: p.id, action: 'project.update', entityType: 'project', entityId: project!.id, data: req.body as Record<string, unknown> });
    return { project };
  });

  app.get('/projects/:id/members', { schema: { tags: ['projects'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    const rows = await app.db.select({ id: schema.projectMembers.id, role: schema.projectMembers.role, userId: schema.users.id, email: schema.users.email, fullName: schema.users.fullName, createdAt: schema.projectMembers.createdAt }).from(schema.projectMembers).innerJoin(schema.users, eq(schema.users.id, schema.projectMembers.userId)).where(eq(schema.projectMembers.projectId, req.params.id));
    return { items: rows };
  });

  app.post('/projects/:id/members', { schema: { tags: ['projects'], params: projectIdParam, body: z.object({ userId: z.uuid().optional(), email: z.email().optional(), role: z.enum(['owner', 'investor', 'gc', 'architect', 'lender', 'viewer']) }) } }, async (req, reply) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'write');
    if (!req.body.userId && !req.body.email) throw validation('userId or email required');
    let userId = req.body.userId;
    if (!userId) {
      const email = req.body.email!.toLowerCase();
      let [u] = await app.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!u) [u] = await app.db.insert(schema.users).values({ email, roles: [req.body.role === 'investor' ? 'investor' : req.body.role === 'gc' ? 'builder' : 'landowner'] }).returning();
      userId = u!.id;
    }
    const [m] = await app.db.insert(schema.projectMembers).values({ projectId: req.params.id, userId: userId!, role: req.body.role }).onConflictDoUpdate({ target: [schema.projectMembers.projectId, schema.projectMembers.userId], set: { role: req.body.role } }).returning();
    reply.status(201);
    return { member: m };
  });

  app.get('/projects/:id/milestones', { schema: { tags: ['projects'], params: projectIdParam } }, async (req) => {
    await canAccessProject(app.db, req.principal, req.params.id, 'read');
    return { items: await app.db.select().from(schema.milestones).where(eq(schema.milestones.projectId, req.params.id)).orderBy(asc(schema.milestones.sortOrder)) };
  });

  app.post('/projects/:id/milestones', { schema: { tags: ['projects'], params: projectIdParam, body: z.object({ phase: z.enum(PHASES), name: z.string().min(2).max(200), plannedStart: dateStr.optional(), plannedEnd: dateStr.optional(), owner: z.string().max(100).optional() }) } }, async (req, reply) => {
    const project = await canAccessProject(app.db, req.principal, req.params.id, 'write');
    const existing = await app.db.select({ n: schema.milestones.sortOrder }).from(schema.milestones).where(eq(schema.milestones.projectId, project.id));
    const [m] = await app.db.insert(schema.milestones).values({ projectId: project.id, organizationId: project.organizationId, ...req.body, sortOrder: existing.reduce((a, b) => Math.max(a, b.n), -1) + 1 }).returning();
    reply.status(201);
    return { milestone: m };
  });

  app.patch('/milestones/:id', { schema: { tags: ['projects'], params: z.object({ id: z.uuid() }), body: z.object({ status: z.enum(['pending', 'in_progress', 'complete', 'blocked']).optional(), actualStart: dateStr.optional(), actualEnd: dateStr.optional(), plannedStart: dateStr.optional(), plannedEnd: dateStr.optional(), note: z.string().max(2000).optional(), owner: z.string().max(100).optional() }) } }, async (req) => {
    const [m] = await app.db.select().from(schema.milestones).where(eq(schema.milestones.id, req.params.id)).limit(1);
    if (!m) throw notFound('Milestone');
    const project = await canAccessProject(app.db, req.principal, m.projectId, 'write');
    const set: Record<string, unknown> = { ...req.body, updatedAt: new Date() };
    if (req.body.status === 'complete' && !req.body.actualEnd && !m.actualEnd) set.actualEnd = new Date().toISOString().slice(0, 10);
    const [updated] = await app.db.update(schema.milestones).set(set).where(eq(schema.milestones.id, m.id)).returning();
    if (req.body.status === 'complete' && m.status !== 'complete') {
      await app.outbox.emit('milestone.completed', { projectId: project.id, milestoneId: m.id, name: m.name, phase: m.phase });
      // Advance project stage to the phase of the next open milestone.
      const open = await app.db.select().from(schema.milestones).where(and(eq(schema.milestones.projectId, project.id), inArray(schema.milestones.status, ['pending', 'in_progress', 'blocked']))).orderBy(asc(schema.milestones.sortOrder)).limit(1);
      if (open[0]) await app.db.update(schema.projects).set({ stage: open[0].phase, updatedAt: new Date() }).where(eq(schema.projects.id, project.id));
    }
    return { milestone: updated };
  });
}
