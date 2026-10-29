import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '../src/db/client.js';
import { Outbox, sign } from '../src/lib/events.js';
import { makeApp, uniq, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await makeApp({ webhookUrl: 'https://n8n.example.test/webhook/dirtbid' }); });
afterAll(async () => { await ctx.app.close(); });

describe('outbox → n8n', () => {
  it('delivers signed payloads and marks events delivered', async () => {
    const email = `${uniq('hook')}@example.com`;
    const r = await ctx.app.inject({ method: 'POST', url: '/v1/leads', payload: { kind: 'strategy_call', contact: { fullName: 'Hook Test', email }, consent: true } });
    expect(r.statusCode).toBe(201);
    const delivered = await ctx.app.outbox.drain();
    expect(delivered).toBeGreaterThanOrEqual(1);
    const call = ctx.webhookCalls.find((c) => c.body.includes(email) && c.headers['X-DirtBid-Event'] === 'lead.created');
    expect(call).toBeTruthy();
    expect(call!.url).toBe('https://n8n.example.test/webhook/dirtbid');
    const expected = 'sha256=' + createHmac('sha256', 'test-secret').update(call!.body).digest('hex');
    expect(call!.headers['X-DirtBid-Signature']).toBe(expected);
    expect(sign(call!.body, 'test-secret')).toBe(expected);
    const parsed = JSON.parse(call!.body);
    expect(parsed).toMatchObject({ type: 'lead.created', data: { email } });
    expect(parsed.occurredAt).toMatch(/^\d{4}-/);
    const [row] = await ctx.app.db.select().from(schema.events).where(eq(schema.events.id, parsed.id));
    expect(row!.deliveredAt).toBeTruthy();
    expect(row!.attempts).toBe(1);
  });

  it('retries with backoff and gives up after 5 attempts', async () => {
    let calls = 0;
    const failing = (async () => { calls++; return new Response('nope', { status: 500 }); }) as unknown as typeof fetch;
    const box = new Outbox(ctx.app.db, { webhookUrl: 'https://n8n.example.test/x', secret: 's', fetchImpl: failing });
    const id = await box.emit('report.sent', { test: true });
    let now = new Date();
    for (let i = 0; i < 7; i++) { await box.drain(now); now = new Date(now.getTime() + 2 * 60 * 60 * 1000); }
    const [row] = await ctx.app.db.select().from(schema.events).where(eq(schema.events.id, id));
    expect(row!.deliveredAt).toBeNull();
    expect(row!.attempts).toBe(5);
    expect(calls).toBe(5);
    expect(row!.lastError).toContain('HTTP 500');
  });

  it('does nothing when no webhook url is configured', async () => {
    const box = new Outbox(ctx.app.db, { secret: 's' });
    await box.emit('report.sent', { test: true });
    expect(await box.drain()).toBe(0);
  });
});
