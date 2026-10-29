import { and, eq, inArray } from 'drizzle-orm';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { budgetFor } from './service.js';

export interface CashWeek { weekStart: string; outflowsCents: number; inflowsCents: number; netCents: number; cumulativeCents: number }
export interface CashFlow { weeks: CashWeek[]; shortfall: { weekStart: string; amountCents: number } | null; assumptions: string[] }

const startOfWeek = (d: Date): Date => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = x.getUTCDay(); x.setUTCDate(x.getUTCDate() - ((day + 6) % 7)); return x; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * 12-week cash forecast.
 * Outflows: open invoices land in the week of their due date (or next week), and the
 * remaining forecast-to-complete (FAC − paid − invoiced-unpaid) is spread across the
 * weeks of the in-progress schedule items, weighted by each item's remaining duration.
 * Inflows: submitted draws expected to fund on their expected funding date (default +14 days),
 * plus draft draws assumed submitted now (+21 days). Starting cash is 0: this is a project-level
 * need, so a negative cumulative is a shortfall the owner / lender must cover.
 */
export async function cashFlowFor(app: App, projectId: string, weeks = 12, today = new Date()): Promise<CashFlow> {
  const start = startOfWeek(today);
  const buckets: CashWeek[] = Array.from({ length: weeks }, (_, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i * 7); return { weekStart: iso(d), outflowsCents: 0, inflowsCents: 0, netCents: 0, cumulativeCents: 0 }; });
  const idx = (dateStr: string | Date | null | undefined): number => {
    const d = dateStr ? new Date(dateStr) : today;
    const i = Math.floor((startOfWeek(d).getTime() - start.getTime()) / (7 * 86400000));
    return Math.max(0, Math.min(weeks - 1, i));
  };

  const [{ totals }, openInvoices, draws, items] = await Promise.all([
    budgetFor(app, projectId),
    app.db.select().from(schema.invoices).where(and(eq(schema.invoices.projectId, projectId), inArray(schema.invoices.status, ['pending_approval', 'approved', 'in_draw']))),
    app.db.select().from(schema.draws).where(and(eq(schema.draws.projectId, projectId), inArray(schema.draws.status, ['draft', 'submitted']))),
    app.db.select().from(schema.scheduleItems).where(eq(schema.scheduleItems.projectId, projectId)),
  ]);

  for (const inv of openInvoices) buckets[idx(inv.dueDate ?? undefined)]!.outflowsCents += inv.amountCents;

  const invoicedUnpaid = totals.invoicedCents - totals.paidCents;
  const remaining = Math.max(0, totals.forecastAtCompletionCents - totals.paidCents - invoicedUnpaid);
  const active = items.filter((it) => it.percentComplete < 100);
  const weights: number[] = new Array(weeks).fill(0);
  if (active.length) {
    for (const it of active) {
      const s = Math.max(idx(it.start), 0); const e = idx(it.end);
      const span = Math.max(1, e - s + 1);
      const remainingShare = (100 - it.percentComplete) / 100;
      for (let w = s; w <= e; w++) weights[w]! += remainingShare / span;
    }
  } else {
    for (let w = 0; w < weeks; w++) weights[w] = 1;
  }
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;
  // Spend beyond the horizon stays beyond it: only the share of schedule inside the window is booked.
  const horizonShare = active.length ? Math.min(1, totalW / Math.max(totalW, active.reduce((acc, it) => acc + (100 - it.percentComplete) / 100, 0))) : 1;
  for (let w = 0; w < weeks; w++) buckets[w]!.outflowsCents += Math.round(remaining * horizonShare * (weights[w]! / totalW));

  for (const d of draws) {
    const base = d.expectedFundingDate ? new Date(d.expectedFundingDate) : new Date((d.submittedAt ?? today).getTime() + (d.status === 'submitted' ? 14 : 21) * 86400000);
    buckets[idx(base)]!.inflowsCents += Math.max(0, d.requestedCents - d.retainageHeldCents);
  }

  let cum = 0; let shortfall: CashFlow['shortfall'] = null;
  for (const b of buckets) {
    b.netCents = b.inflowsCents - b.outflowsCents; cum += b.netCents; b.cumulativeCents = cum;
    if (cum < 0 && !shortfall) shortfall = { weekStart: b.weekStart, amountCents: -cum };
  }
  if (shortfall) { for (const b of buckets) if (-b.cumulativeCents > shortfall.amountCents) shortfall.amountCents = -b.cumulativeCents; }
  return { weeks: buckets, shortfall, assumptions: ['Open invoices land in their due-date week', 'Remaining forecast-to-complete spread across in-progress schedule items by remaining duration', 'Submitted draws fund in 14 days, draft draws in 21 days, net of retainage', 'Starting balance is zero: cumulative negatives are owner/lender funding needs'] };
}
