import { eq } from 'drizzle-orm';
import { buildApp, type App } from '../src/app.js';
import { schema } from '../src/db/client.js';
import { createSessionFor } from '../src/modules/auth/service.js';
import { ensureCatalog } from '../src/modules/catalog/routes.js';
import type { EmailDriver, EmailMessage } from '../src/lib/email.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL_TEST = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:5432/dirtbid_test';

export interface TestCtx { app: App; sent: EmailMessage[]; webhookCalls: { url: string; headers: Record<string, string>; body: string }[] }

export async function makeApp(opts: { webhookUrl?: string; webhookStatus?: number; parcelFetch?: typeof fetch } = {}): Promise<TestCtx> {
  const sent: EmailMessage[] = [];
  const webhookCalls: TestCtx['webhookCalls'] = [];
  const driver: EmailDriver = { async send(msg) { sent.push(msg); } };
  const webhookFetch = (async (url: any, init: any) => { webhookCalls.push({ url: String(url), headers: Object.fromEntries(Object.entries(init?.headers ?? {})) as Record<string, string>, body: String(init?.body ?? '') }); return new Response('ok', { status: opts.webhookStatus ?? 200 }); }) as unknown as typeof fetch;
  const app = await buildApp({ config: { nodeEnv: 'test', n8nWebhookUrl: opts.webhookUrl, webhookSecret: 'test-secret' }, emailDriver: driver, webhookFetch, parcelFetch: opts.parcelFetch ?? ((async () => new Response('offline in tests', { status: 503 })) as unknown as typeof fetch), logger: false });
  await app.ready();
  await ensureCatalog(app.db);
  return { app, sent, webhookCalls };
}

export async function userWithToken(app: App, email: string, roles: string[] = ['landowner'], fullName = 'Test User'): Promise<{ id: string; token: string; email: string }> {
  let [u] = await app.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!u) [u] = await app.db.insert(schema.users).values({ email, roles, fullName }).returning();
  else if (roles.some((r) => !u!.roles.includes(r))) [u] = await app.db.update(schema.users).set({ roles: [...new Set([...u.roles, ...roles])] }).where(eq(schema.users.id, u.id)).returning();
  const token = await createSessionFor(app, u!.id);
  return { id: u!.id, token, email };
}

export async function orgWithMember(app: App, name: string, userId: string): Promise<string> {
  const [org] = await app.db.insert(schema.organizations).values({ name }).returning();
  await app.db.insert(schema.orgMembers).values({ organizationId: org!.id, userId, role: 'owner' });
  return org!.id;
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });
export const uniq = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function createProjectWithBudget(app: App, token: string, organizationId?: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/projects', headers: auth(token), payload: { name: uniq('Project'), programType: 'builder_ops', organizationId, address: '1 Test Way, Hampton, VA 23666', marketCode: 'HAMPTON_ROADS_VA' } });
  if (res.statusCode !== 201) throw new Error('project create failed: ' + res.body);
  const project = res.json().project;
  const b = await app.inject({ method: 'POST', url: `/v1/projects/${project.id}/budget`, headers: auth(token), payload: { lines: [
    { csiDivision: '03', code: '03-30-00', description: 'Cast-in-place concrete', originalCents: 20_000_000 },
    { csiDivision: '06', code: '06-10-00', description: 'Rough carpentry', originalCents: 30_000_000 },
    { csiDivision: '26', code: '26-05-00', description: 'Electrical', originalCents: 10_000_000 },
  ] } });
  const lines = b.json().lines;
  return { project, lines };
}
