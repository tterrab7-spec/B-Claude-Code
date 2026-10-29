import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { listMarkets } from '@dirtbid/underwriting';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { validation } from '../../lib/errors.js';
import type { CreateLead } from './schema.js';

export const DISPOSABLE_DOMAINS = new Set(['mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com']);

const activeZips = new Set(listMarkets().flatMap((m) => Object.keys(m.zipBands)));

const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; }
  return 0;
};

/** Lead score per contract. Returns 0–100 and a letter grade. */
export function scoreLead(input: CreateLead): { score: number; grade: 'A' | 'B' | 'C' | 'D'; reasons: string[] } {
  let s = 0; const reasons: string[] = [];
  const p = input.property ?? {}; const a = input.answers ?? {};
  const add = (n: number, why: string) => { s += n; reasons.push(`${why} +${n}`); };
  if (p.ownsLand === true || a.ownsLand === true || a.ownsLand === 'yes') add(25, 'owns land');
  if (num(a.budget) >= 400000) add(15, 'budget ≥ $400k');
  const months = num(a.timelineMonths) || timelineToMonths(a.targetTimeline);
  if (months > 0 && months <= 12) add(10, 'timeline ≤ 12 mo');
  if (p.zip && activeZips.has(p.zip)) add(15, 'active market zip');
  const lotSf = p.lotSizeUnit === 'acres' ? num(p.lotSize) * 43560 : num(p.lotSize);
  if (lotSf >= 5000) add(10, 'lot ≥ 5,000 sf');
  if (input.consent) add(5, 'consent');
  if (input.contact.phone) add(5, 'phone');
  if (input.kind === 'strategy_call' || input.kind === 'feasibility_enhanced') add(15, 'high-intent kind');
  if (input.kind === 'builder_qualification' || input.kind === 'builder_audit') {
    if (num(a.activeProjects) >= 3) add(20, 'active projects ≥ 3');
    if (num(a.annualVolume) >= 5_000_000) add(15, 'annual volume ≥ $5M');
  }
  const score = Math.min(100, s);
  const grade = score >= 70 ? 'A' : score >= 50 ? 'B' : score >= 30 ? 'C' : 'D';
  return { score, grade, reasons };
}

function timelineToMonths(v: unknown): number {
  if (typeof v !== 'string') return 0;
  const t = v.toLowerCase();
  if (/asap|immediately|now|0-3|3 months|<\s*6|under 6/.test(t)) return 3;
  if (/6-12|6 to 12|within a year|12 months|this year/.test(t)) return 12;
  if (/12-24|1-2 years|next year/.test(t)) return 18;
  if (/2\+|more than 2|someday|exploring/.test(t)) return 36;
  const m = t.match(/(\d+)\s*mo/); if (m) return Number(m[1]);
  return 0;
}

export function marketCodeFor(state?: string, zip?: string): string | null {
  for (const m of listMarkets()) if (zip && m.zipBands[zip]) return m.code;
  const st = (state ?? '').toUpperCase();
  if (st === 'CA' || st === 'CALIFORNIA') return 'ALTADENA_CA';
  if (st === 'VA' || st === 'VIRGINIA') return 'HAMPTON_ROADS_VA';
  return null;
}

export interface CreateLeadResult { lead: typeof schema.leads.$inferSelect; created: boolean; score: number; grade: string }

export async function createLead(app: App, input: CreateLead, ipAddress?: string): Promise<CreateLeadResult> {
  if (input.website) throw validation('Spam check failed', { website: 'must be empty' });
  const email = input.contact.email.trim().toLowerCase();
  const domain = email.split('@')[1] ?? '';
  if (DISPOSABLE_DOMAINS.has(domain)) throw validation('Please use a real, non-disposable email', { 'contact.email': 'disposable domain' });
  if (!input.consent) throw validation('Consent is required', { consent: 'required' });

  const address = (input.property?.address ?? '').trim().toLowerCase();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existing = await app.db.select().from(schema.leads)
    .where(and(eq(schema.leads.email, email), eq(schema.leads.kind, input.kind), gte(schema.leads.createdAt, since), inArray(schema.leads.status, ['new', 'contacted', 'qualified', 'proposal', 'nurture'])))
    .orderBy(desc(schema.leads.createdAt));
  const dupe = existing.find((l) => ((l.property as any)?.address ?? '').toString().trim().toLowerCase() === address);
  if (dupe) {
    await app.db.insert(schema.leadEvents).values({ leadId: dupe.id, type: 'duplicate_submission', data: { answers: input.answers, utm: input.utm ?? {} } });
    return { lead: dupe, created: false, score: dupe.score, grade: dupe.grade };
  }

  const { score, grade, reasons } = scoreLead(input);
  const marketCode = marketCodeFor(input.property?.state, input.property?.zip);
  const [lead] = await app.db.insert(schema.leads).values({
    kind: input.kind, email, fullName: input.contact.fullName.trim(), phone: input.contact.phone,
    property: input.property ?? {}, answers: input.answers ?? {}, utm: input.utm ?? {}, consent: input.consent,
    score, grade, marketCode, ipAddress,
  }).returning();
  // Attach to an existing user with the same email, if any.
  const [user] = await app.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (user) await app.db.update(schema.leads).set({ userId: user.id }).where(eq(schema.leads.id, lead!.id));

  await app.db.insert(schema.leadEvents).values({ leadId: lead!.id, type: 'created', data: { score, grade, reasons } });
  await app.outbox.emit('lead.created', { leadId: lead!.id, kind: lead!.kind, email, fullName: lead!.fullName, score, grade, marketCode, property: lead!.property, utm: lead!.utm });
  if (grade === 'A' || grade === 'B') await app.outbox.emit('lead.qualified', { leadId: lead!.id, kind: lead!.kind, email, score, grade });
  return { lead: lead!, created: true, score, grade };
}

export async function leadCountsByStatus(app: App): Promise<{ status: string; count: number }[]> {
  const rows = await app.db.select({ status: schema.leads.status, count: sql<number>`count(*)::int` }).from(schema.leads).groupBy(schema.leads.status);
  return rows;
}
