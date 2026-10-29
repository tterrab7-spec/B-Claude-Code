import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { audit } from '../../lib/audit.js';
import { forbidden, notFound, unauthorized, validation } from '../../lib/errors.js';
import { canAccessProject, isStaff, requireAuth } from '../../lib/policy.js';
import { createOrder, markOrderPaid, stripeClient } from './service.js';

const PUBLIC_PURCHASE = new Set(['feasibility_enhanced', 'ai_readiness_audit']);

export async function orderRoutes(app: App): Promise<void> {
  app.post('/orders', { schema: { tags: ['orders'], body: z.object({ serviceCode: z.string(), runId: z.uuid().optional(), leadId: z.uuid().optional(), projectId: z.uuid().optional(), email: z.email().optional() }) } }, async (req, reply) => {
    const p = req.principal;
    if (!p && !PUBLIC_PURCHASE.has(req.body.serviceCode)) throw unauthorized('Sign in to purchase this service');
    if (!p && !req.body.email && !req.body.leadId) throw validation('email or leadId is required', { email: 'required' });
    let organizationId: string | null = null;
    if (req.body.projectId) { const project = await canAccessProject(app.db, p, req.body.projectId, 'write'); organizationId = project.organizationId; }
    const order = await createOrder(app, { ...req.body, userId: p?.id ?? null, organizationId });
    reply.status(201);
    return { orderId: order.id, amountCents: order.amountCents, creditAppliedCents: order.creditAppliedCents, status: order.status, checkoutUrl: order.checkoutUrl ?? undefined };
  });

  app.get('/orders', { schema: { tags: ['orders'], querystring: z.object({ projectId: z.uuid().optional() }) } }, async (req) => {
    const p = requireAuth(req.principal);
    if (req.query.projectId) { await canAccessProject(app.db, p, req.query.projectId, 'read'); return { items: await app.db.select().from(schema.orders).where(eq(schema.orders.projectId, req.query.projectId)).orderBy(desc(schema.orders.createdAt)) }; }
    const where = isStaff(p) ? undefined : or(eq(schema.orders.userId, p.id), eq(schema.orders.email, p.email));
    return { items: await app.db.select().from(schema.orders).where(where).orderBy(desc(schema.orders.createdAt)).limit(200) };
  });

  app.get('/orders/:id', { schema: { tags: ['orders'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const [order] = await app.db.select().from(schema.orders).where(eq(schema.orders.id, req.params.id)).limit(1);
    if (!order) throw notFound('Order');
    const p = req.principal;
    if (p && (isStaff(p) || order.userId === p.id || order.email === p.email)) return { order };
    if (order.projectId && p) { await canAccessProject(app.db, p, order.projectId, 'read'); return { order }; }
    // Unauthenticated read: only the public-safe subset, for the checkout return page.
    return { order: { id: order.id, serviceCode: order.serviceCode, status: order.status, amountCents: order.amountCents, creditAppliedCents: order.creditAppliedCents, checkoutUrl: order.checkoutUrl } };
  });

  app.post('/orders/:id/checkout', { schema: { tags: ['orders'], params: z.object({ id: z.uuid() }) } }, async (req) => {
    const [order] = await app.db.select().from(schema.orders).where(eq(schema.orders.id, req.params.id)).limit(1);
    if (!order) throw notFound('Order');
    if (order.status === 'paid') return { url: null, status: 'paid' };
    if (order.checkoutUrl) return { url: order.checkoutUrl, status: order.status };
    const stripe = stripeClient(app);
    if (!stripe) return { url: null, status: order.status, note: 'Stripe not configured' };
    const [svc] = await app.db.select().from(schema.serviceCatalog).where(eq(schema.serviceCatalog.code, order.serviceCode));
    const session = await stripe.checkout.sessions.create({ mode: 'payment', customer_email: order.email ?? undefined, line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: order.amountCents, product_data: { name: svc?.name ?? order.serviceCode } } }], success_url: `${app.cfg.webUrl}/orders/${order.id}?paid=1`, cancel_url: `${app.cfg.webUrl}/orders/${order.id}?cancelled=1`, metadata: { orderId: order.id } });
    await app.db.update(schema.orders).set({ stripeSessionId: session.id, checkoutUrl: session.url ?? null }).where(eq(schema.orders.id, order.id));
    return { url: session.url, status: order.status };
  });

  if (app.cfg.nodeEnv !== 'production') {
    app.post('/orders/:id/mark-paid', { schema: { tags: ['orders'], params: z.object({ id: z.uuid() }), description: 'Development only: simulates a successful payment.' } }, async (req) => {
      const order = await markOrderPaid(app, req.params.id, { provider: 'dev' });
      if (req.principal) await audit(app.db, { actorUserId: req.principal.id, action: 'order.mark_paid_dev', entityType: 'order', entityId: order.id });
      return { order };
    });
  }

  app.get('/credits', { schema: { tags: ['orders'] } }, async (req) => {
    const p = requireAuth(req.principal);
    const rows = await app.db.select().from(schema.credits).where(or(eq(schema.credits.userId, p.id), eq(schema.credits.email, p.email))).orderBy(desc(schema.credits.createdAt));
    const now = Date.now();
    return { items: rows.map((c) => ({ ...c, status: c.status === 'available' && c.expiresAt.getTime() < now ? 'expired' : c.status })) };
  });

  // Stripe webhook: raw body needed for signature verification.
  app.post('/webhooks/stripe', { config: { rawBody: true }, schema: { tags: ['webhooks'] }, preParsing: async (req, _reply, payload) => { const chunks: Buffer[] = []; for await (const c of payload) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); (req as any).rawBody = Buffer.concat(chunks).toString('utf8'); const { Readable } = await import('node:stream'); return Readable.from([(req as any).rawBody]); } }, async (req, reply) => {
    const stripe = stripeClient(app);
    const sig = req.headers['stripe-signature'];
    if (!stripe || !app.cfg.stripeWebhookSecret || typeof sig !== 'string') throw forbidden('Stripe webhook not configured');
    let event;
    try { event = stripe.webhooks.constructEvent((req as any).rawBody, sig, app.cfg.stripeWebhookSecret); } catch (e) { throw validation(`Invalid Stripe signature: ${(e as Error).message}`); }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const orderId = session.metadata?.orderId;
      if (orderId) await markOrderPaid(app, orderId, { provider: 'stripe', providerRef: session.payment_intent ?? session.id, raw: { sessionId: session.id } });
    }
    return reply.send({ received: true });
  });
  void and;
}
