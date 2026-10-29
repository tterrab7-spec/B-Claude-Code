import { createHmac } from 'node:crypto';
import { and, asc, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';

export type EventType =
  | 'lead.created' | 'lead.qualified' | 'lead.status_changed'
  | 'feasibility.run.completed' | 'feasibility.delivered'
  | 'order.created' | 'order.paid' | 'credit.issued' | 'credit.applied'
  | 'project.created' | 'milestone.completed'
  | 'invoice.pending_approval' | 'invoice.approved' | 'change_order.approved'
  | 'draw.ready' | 'draw.submitted' | 'draw.funded'
  | 'cash.shortfall_alert' | 'budget.variance_alert'
  | 'report.generated' | 'report.sent' | 'vendor.compliance_expiring'
  | 'parcel.resolved';

export interface OutboxOptions {
  webhookUrl?: string;
  secret: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  log?: (msg: string) => void;
}

export function sign(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Transactional outbox: domain code calls `emit` (a DB insert), the drainer
 * POSTs to n8n with an HMAC signature and exponential backoff (5 attempts).
 */
export class Outbox {
  private timer: NodeJS.Timeout | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  constructor(private readonly db: Db, private readonly opts: OutboxOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxAttempts = opts.maxAttempts ?? 5;
  }

  async emit(type: EventType, data: Record<string, unknown>): Promise<string> {
    const [row] = await this.db.insert(schema.events).values({ type, data }).returning({ id: schema.events.id });
    return row!.id;
  }

  /** Attempt delivery of all due, undelivered events. Returns number delivered. */
  async drain(now: Date = new Date()): Promise<number> {
    if (!this.opts.webhookUrl) return 0;
    const due = await this.db.select().from(schema.events)
      .where(and(isNull(schema.events.deliveredAt), lte(schema.events.nextAttemptAt, now)))
      .orderBy(asc(schema.events.occurredAt)).limit(100);
    let delivered = 0;
    for (const ev of due) {
      if (ev.attempts >= this.maxAttempts) continue;
      const body = JSON.stringify({ id: ev.id, type: ev.type, occurredAt: ev.occurredAt.toISOString(), data: ev.data });
      try {
        const res = await this.fetchImpl(this.opts.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-DirtBid-Signature': sign(body, this.opts.secret), 'X-DirtBid-Event': ev.type },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await this.db.update(schema.events).set({ deliveredAt: now, attempts: ev.attempts + 1 }).where(and(isNull(schema.events.deliveredAt), lte(schema.events.nextAttemptAt, now), eqId(ev.id)));
        delivered++;
      } catch (e) {
        const attempts = ev.attempts + 1;
        const backoffMs = Math.min(60 * 60 * 1000, 1000 * 2 ** attempts * 15);
        await this.db.update(schema.events).set({ attempts, lastError: (e as Error).message.slice(0, 500), nextAttemptAt: new Date(now.getTime() + backoffMs) }).where(eqId(ev.id));
        this.opts.log?.(`event ${ev.id} (${ev.type}) delivery failed attempt ${attempts}: ${(e as Error).message}`);
      }
    }
    return delivered;
  }

  start(intervalMs = 5000): void {
    if (this.timer || !this.opts.webhookUrl) return;
    this.timer = setInterval(() => { this.drain().catch((e) => this.opts.log?.(String(e))); }, intervalMs);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

import { eq } from 'drizzle-orm';
const eqId = (id: string) => eq(schema.events.id, id);
