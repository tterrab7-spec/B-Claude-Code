import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { canAccessProject, isStaff, requireAuth, requireOrgMember } from '../../lib/policy.js';
import { claudeAnswer, rulesAnswer } from './service.js';
import type { ToolScope } from './tools.js';

export async function assistantRoutes(app: App): Promise<void> {
  app.post('/assistant/ask', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, schema: { tags: ['assistant'], body: z.object({ question: z.string().min(2).max(2000), projectId: z.uuid().optional(), organizationId: z.uuid().optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    let scope: ToolScope;
    if (req.body.projectId) { const project = await canAccessProject(app.db, p, req.body.projectId, 'read'); scope = { organizationId: project.organizationId, projectIds: project.organizationId ? null : [project.id], userId: p.id }; }
    else if (req.body.organizationId) { requireOrgMember(p, req.body.organizationId); scope = { organizationId: req.body.organizationId, projectIds: null, userId: p.id }; }
    else if (isStaff(p)) scope = { organizationId: null, projectIds: null, userId: p.id };
    else if (p.organizationIds[0]) scope = { organizationId: p.organizationIds[0], projectIds: null, userId: p.id };
    else {
      const own = await app.db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.ownerUserId, p.id));
      const member = await app.db.select({ id: schema.projectMembers.projectId }).from(schema.projectMembers).where(eq(schema.projectMembers.userId, p.id));
      scope = { organizationId: null, projectIds: [...new Set([...own.map((x) => x.id), ...member.map((x) => x.id)])], userId: p.id };
    }
    let result;
    if (app.cfg.anthropicApiKey) {
      try { result = await claudeAnswer(app, scope, req.body.question, req.body.projectId); }
      catch (e) { req.log.warn({ err: e }, 'assistant model call failed; using rules'); result = await rulesAnswer(app, scope, req.body.question, req.body.projectId); }
    } else {
      result = await rulesAnswer(app, scope, req.body.question, req.body.projectId);
    }
    await app.db.insert(schema.assistantThreads).values({ userId: p.id, organizationId: scope.organizationId, projectId: req.body.projectId ?? null, question: req.body.question, answer: result.answer, model: result.model, data: result.data });
    return result;
  });
}
