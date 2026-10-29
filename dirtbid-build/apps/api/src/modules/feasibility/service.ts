import { eq } from 'drizzle-orm';
import { underwrite, buildReport, UnderwritingError, type UnderwritingInput, type UnderwritingResult } from '@dirtbid/underwriting';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { validation } from '../../lib/errors.js';
import { randomToken } from '../../lib/ids.js';

export type RunRow = typeof schema.feasibilityRuns.$inferSelect;

export function runEngine(input: UnderwritingInput): UnderwritingResult {
  try {
    return underwrite(input);
  } catch (e) {
    if (e instanceof UnderwritingError) throw validation(e.message, e.field ? { [`input.${e.field}`]: e.message } : undefined);
    throw e;
  }
}

export async function createRun(app: App, args: { input: UnderwritingInput; leadId?: string | null; userId?: string | null; projectId?: string | null; organizationId?: string | null; tier?: 'lite' | 'enhanced'; source?: 'manual' | 'address'; resolvedParcel?: Record<string, unknown> | null }): Promise<{ run: RunRow; result: UnderwritingResult }> {
  const result = runEngine(args.input);
  const [run] = await app.db.insert(schema.feasibilityRuns).values({
    leadId: args.leadId ?? null, userId: args.userId ?? null, projectId: args.projectId ?? null, organizationId: args.organizationId ?? null,
    marketCode: args.input.marketCode, tier: args.tier ?? 'lite', input: args.input as unknown as Record<string, unknown>, result: result as unknown as Record<string, unknown>,
    accessToken: randomToken(24), source: args.source ?? 'manual', resolvedParcel: args.resolvedParcel ?? null,
  }).returning();
  await app.outbox.emit('feasibility.run.completed', { runId: run!.id, source: run!.source, leadId: run!.leadId, projectId: run!.projectId, marketCode: run!.marketCode, recommended: result.recommended, scores: result.scores, maxOffer: result.scenarios.find((s) => s.id === result.recommended.scenarioId)?.maxOffer ?? null });
  return { run: run!, result };
}

export async function reviewRun(app: App, run: RunRow, overrides: Partial<UnderwritingInput> | undefined, analystNotes: string): Promise<{ run: RunRow; result: UnderwritingResult }> {
  const input = { ...(run.input as unknown as UnderwritingInput), ...(overrides ?? {}) } as UnderwritingInput;
  const result = runEngine(input);
  const [updated] = await app.db.update(schema.feasibilityRuns).set({ input: input as unknown as Record<string, unknown>, result: result as unknown as Record<string, unknown>, analystNotes, status: 'reviewed', version: run.version + 1, updatedAt: new Date() }).where(eq(schema.feasibilityRuns.id, run.id)).returning();
  return { run: updated!, result };
}

export function reportFor(run: RunRow, tier: 'lite' | 'enhanced') {
  return buildReport(run.result as unknown as UnderwritingResult, tier);
}

export async function hasPaidEnhanced(app: App, run: RunRow): Promise<boolean> {
  const rows = await app.db.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.runId, run.id));
  if (!rows.length) {
    if (run.leadId) {
      const byLead = await app.db.select({ status: schema.orders.status, serviceCode: schema.orders.serviceCode }).from(schema.orders).where(eq(schema.orders.leadId, run.leadId));
      return byLead.some((o) => o.status === 'paid' && o.serviceCode === 'feasibility_enhanced');
    }
    return false;
  }
  const full = await app.db.select({ status: schema.orders.status, serviceCode: schema.orders.serviceCode }).from(schema.orders).where(eq(schema.orders.runId, run.id));
  return full.some((o) => o.status === 'paid' && o.serviceCode === 'feasibility_enhanced');
}
