import { and, eq, gt, isNull } from 'drizzle-orm';
import Stripe from 'stripe';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { notFound, validation } from '../../lib/errors.js';

export type OrderRow = typeof schema.orders.$inferSelect;

export function stripeClient(app: App): Stripe | null {
  return app.cfg.stripeSecretKey ? new Stripe(app.cfg.stripeSecretKey) : null;
}

export async function createOrder(app: App, args: { serviceCode: string; runId?: string | null; leadId?: string | null; projectId?: string | null; organizationId?: string | null; userId?: string | null; email?: string | null }): Promise<OrderRow> {
  const [svc] = await app.db.select().from(schema.serviceCatalog).where(eq(schema.serviceCatalog.code, args.serviceCode)).limit(1);
  if (!svc || !svc.active) throw validation('Unknown service', { serviceCode: 'unknown' });
  if (svc.billing === 'quote' || svc.priceCents === null) throw validation('This service is quoted, not purchased online', { serviceCode: 'quote_only' });

  let email = args.email?.toLowerCase() ?? null;
  if (!email && args.userId) { const [u] = await app.db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, args.userId)); email = u?.email ?? null; }
  if (!email && args.leadId) { const [l] = await app.db.select({ email: schema.leads.email }).from(schema.leads).where(eq(schema.leads.id, args.leadId)); email = l?.email ?? null; }

  // Auto-apply available credits that target this service (e.g. the $750 report credit on design_predev).
  let creditApplied = 0; let appliedCreditIds: string[] = [];
  if (svc.priceCents > 0) {
    const now = new Date();
    const candidates = await app.db.select().from(schema.credits).where(and(eq(schema.credits.appliesTo, svc.code), eq(schema.credits.status, 'available'), gt(schema.credits.expiresAt, now), isNull(schema.credits.appliedOrderId)));
    const mine = candidates.filter((c) => (args.userId && c.userId === args.userId) || (email && c.email === email));
    for (const c of mine) {
      if (creditApplied >= svc.priceCents) break;
      creditApplied += Math.min(c.amountCents, svc.priceCents - creditApplied);
      appliedCreditIds.push(c.id);
    }
  }
  const amount = Math.max(0, svc.priceCents - creditApplied);
  const [order] = await app.db.insert(schema.orders).values({
    serviceCode: svc.code, email, userId: args.userId ?? null, leadId: args.leadId ?? null, runId: args.runId ?? null, projectId: args.projectId ?? null, organizationId: args.organizationId ?? null,
    listPriceCents: svc.priceCents, creditAppliedCents: creditApplied, amountCents: amount, status: amount === 0 ? 'paid' : 'awaiting_payment', paidAt: amount === 0 ? new Date() : null,
  }).returning();
  for (const id of appliedCreditIds) {
    await app.db.update(schema.credits).set({ status: 'applied', appliedOrderId: order!.id, appliedAt: new Date() }).where(eq(schema.credits.id, id));
    await app.outbox.emit('credit.applied', { creditId: id, orderId: order!.id, serviceCode: svc.code });
  }
  await app.outbox.emit('order.created', { orderId: order!.id, serviceCode: svc.code, amountCents: amount, creditAppliedCents: creditApplied, email, leadId: order!.leadId, projectId: order!.projectId });

  const stripe = stripeClient(app);
  if (stripe && amount > 0) {
    const session = await stripe.checkout.sessions.create({
      mode: svc.billing === 'monthly' ? 'subscription' : 'payment',
      customer_email: email ?? undefined,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount, product_data: { name: svc.name }, ...(svc.billing === 'monthly' ? { recurring: { interval: 'month' } } : {}) } }],
      success_url: `${app.cfg.webUrl}/orders/${order!.id}?paid=1`,
      cancel_url: `${app.cfg.webUrl}/orders/${order!.id}?cancelled=1`,
      metadata: { orderId: order!.id, serviceCode: svc.code },
    });
    const [updated] = await app.db.update(schema.orders).set({ stripeSessionId: session.id, checkoutUrl: session.url ?? null }).where(eq(schema.orders.id, order!.id)).returning();
    return updated!;
  }
  if (amount === 0) await afterPaid(app, order!, { provider: 'credit', providerRef: appliedCreditIds.join(',') });
  return order!;
}

/** Idempotent: marks paid, records payment, issues credit-back credits, emits events. */
export async function markOrderPaid(app: App, orderId: string, payment: { provider: string; providerRef?: string; raw?: Record<string, unknown> }): Promise<OrderRow> {
  const [order] = await app.db.select().from(schema.orders).where(eq(schema.orders.id, orderId)).limit(1);
  if (!order) throw notFound('Order');
  if (order.status === 'paid') return order;
  const [updated] = await app.db.update(schema.orders).set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() }).where(eq(schema.orders.id, orderId)).returning();
  await afterPaid(app, updated!, payment);
  return updated!;
}

async function afterPaid(app: App, order: OrderRow, payment: { provider: string; providerRef?: string; raw?: Record<string, unknown> }): Promise<void> {
  await app.db.insert(schema.payments).values({ orderId: order.id, provider: payment.provider, providerRef: payment.providerRef, amountCents: order.amountCents, raw: payment.raw });
  await app.outbox.emit('order.paid', { orderId: order.id, serviceCode: order.serviceCode, amountCents: order.amountCents, email: order.email, leadId: order.leadId, projectId: order.projectId, runId: order.runId });
  const [svc] = await app.db.select().from(schema.serviceCatalog).where(eq(schema.serviceCatalog.code, order.serviceCode)).limit(1);
  if (svc?.creditBack && order.listPriceCents > 0) {
    const expiresAt = new Date(Date.now() + svc.creditBack.windowDays * 24 * 60 * 60 * 1000);
    const [credit] = await app.db.insert(schema.credits).values({ userId: order.userId, email: order.email, sourceOrderId: order.id, appliesTo: svc.creditBack.toService, amountCents: order.listPriceCents, expiresAt }).returning();
    await app.outbox.emit('credit.issued', { creditId: credit!.id, orderId: order.id, appliesTo: svc.creditBack.toService, amountCents: order.listPriceCents, expiresAt: expiresAt.toISOString(), email: order.email });
  }
  if (order.leadId) {
    await app.db.update(schema.leads).set({ status: 'proposal', updatedAt: new Date() }).where(and(eq(schema.leads.id, order.leadId), eq(schema.leads.status, 'new')));
    await app.db.insert(schema.leadEvents).values({ leadId: order.leadId, type: 'order_paid', data: { orderId: order.id, serviceCode: order.serviceCode } });
  }
}
