import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { requireAuth } from '../../lib/policy.js';
import { issueMagicLink, verifyMagicToken } from './service.js';

const userOut = (u: typeof schema.users.$inferSelect, organizations: { id: string; name: string; role: string }[]) => ({ id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, roles: u.roles, organizations });

export async function authRoutes(app: App): Promise<void> {
  app.post('/auth/magic-link', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: { tags: ['auth'], body: z.object({ email: z.email(), redirectTo: z.string().max(500).optional() }) },
  }, async (req, reply) => {
    const { link } = await issueMagicLink(app, req.body.email, { redirectTo: req.body.redirectTo });
    reply.status(202);
    return app.cfg.nodeEnv !== 'production' ? { ok: true, devLink: link } : { ok: true };
  });

  app.get('/auth/verify', { schema: { tags: ['auth'], querystring: z.object({ token: z.string().min(10) }) } }, async (req, reply) => {
    const { jwt, user, redirectTo } = await verifyMagicToken(app, req.query.token, req.headers['user-agent']);
    reply.setCookie(app.cfg.cookieName, jwt, { httpOnly: true, sameSite: 'lax', secure: app.cfg.nodeEnv === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
    const orgs = await orgsFor(app, user.id);
    return { token: jwt, user: userOut(user, orgs), redirectTo };
  });

  app.get('/auth/me', { schema: { tags: ['auth'] } }, async (req) => {
    const p = requireAuth(req.principal);
    const [user] = await app.db.select().from(schema.users).where(eq(schema.users.id, p.id)).limit(1);
    return { user: userOut(user!, await orgsFor(app, p.id)) };
  });

  app.post('/auth/logout', { schema: { tags: ['auth'] } }, async (req, reply) => {
    if (req.principal) await app.db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, req.principal.sessionId));
    reply.clearCookie(app.cfg.cookieName, { path: '/' });
    return reply.status(204).send();
  });
}

async function orgsFor(app: App, userId: string) {
  const memberships = await app.db.select().from(schema.orgMembers).where(eq(schema.orgMembers.userId, userId));
  if (!memberships.length) return [];
  const orgs = await app.db.select().from(schema.organizations).where(inArray(schema.organizations.id, memberships.map((m) => m.organizationId)));
  return orgs.map((o) => ({ id: o.id, name: o.name, role: memberships.find((m) => m.organizationId === o.id)!.role }));
}
