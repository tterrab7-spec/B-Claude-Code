import { and, eq, gt, isNull } from 'drizzle-orm';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { randomToken, sha256 } from '../../lib/ids.js';
import { signJwt } from '../../lib/jwt.js';
import { validation } from '../../lib/errors.js';

const MAGIC_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function issueMagicLink(app: App, email: string, opts: { redirectTo?: string; role?: string; fullName?: string; phone?: string } = {}): Promise<{ link: string }> {
  const normalized = email.trim().toLowerCase();
  const token = randomToken(32);
  await app.db.insert(schema.magicTokens).values({ email: normalized, tokenHash: sha256(token), redirectTo: opts.redirectTo, role: opts.role, expiresAt: new Date(Date.now() + MAGIC_TTL_MS) });
  // Pre-create the user so names from a lead survive to first login.
  if (opts.fullName || opts.phone) {
    await app.db.insert(schema.users).values({ email: normalized, fullName: opts.fullName, phone: opts.phone, roles: [opts.role ?? 'landowner'] }).onConflictDoNothing();
  }
  const link = `${app.cfg.webUrl}/auth/verify?token=${token}${opts.redirectTo ? `&redirectTo=${encodeURIComponent(opts.redirectTo)}` : ''}`;
  await app.mailer.send({ to: normalized, template: 'magic_link', subject: 'Your DirtBid Build sign-in link', text: `Click to sign in (valid 15 minutes): ${link}`, html: `<p>Click to sign in (valid 15 minutes):</p><p><a href="${link}">${link}</a></p>` });
  return { link };
}

export async function verifyMagicToken(app: App, token: string, userAgent?: string): Promise<{ jwt: string; user: typeof schema.users.$inferSelect; redirectTo: string | null }> {
  const hash = sha256(token);
  const [row] = await app.db.select().from(schema.magicTokens).where(and(eq(schema.magicTokens.tokenHash, hash), isNull(schema.magicTokens.usedAt), gt(schema.magicTokens.expiresAt, new Date()))).limit(1);
  if (!row) throw validation('This sign-in link is invalid or has expired', { token: 'invalid_or_expired' });
  await app.db.update(schema.magicTokens).set({ usedAt: new Date() }).where(eq(schema.magicTokens.id, row.id));

  let [user] = await app.db.select().from(schema.users).where(eq(schema.users.email, row.email)).limit(1);
  if (!user) {
    [user] = await app.db.insert(schema.users).values({ email: row.email, roles: [row.role ?? 'landowner'] }).returning();
  } else if (row.role && !user.roles.includes(row.role)) {
    [user] = await app.db.update(schema.users).set({ roles: [...user.roles, row.role] }).where(eq(schema.users.id, user.id)).returning();
  }
  await app.db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user!.id));
  // Link any leads with this email to the user.
  await app.db.update(schema.leads).set({ userId: user!.id }).where(and(eq(schema.leads.email, row.email), isNull(schema.leads.userId)));

  const [session] = await app.db.insert(schema.sessions).values({ userId: user!.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS), userAgent }).returning();
  const jwt = await signJwt({ sub: user!.id, sid: session!.id, roles: user!.roles }, app.cfg.jwtSecret);
  return { jwt, user: user!, redirectTo: row.redirectTo };
}

export async function createSessionFor(app: App, userId: string): Promise<string> {
  const [user] = await app.db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) throw validation('user not found');
  const [session] = await app.db.insert(schema.sessions).values({ userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }).returning();
  return signJwt({ sub: userId, sid: session!.id, roles: user.roles }, app.cfg.jwtSecret);
}
