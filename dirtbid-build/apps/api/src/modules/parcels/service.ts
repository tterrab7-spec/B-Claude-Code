import { and, desc, eq, gte } from 'drizzle-orm';
import { resolveAddress, UpstreamError, type ResolvedParcel } from '@dirtbid/parcel-data';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';

export class ParcelResolveError extends Error {
  constructor(message: string) { super(message); this.name = 'ParcelResolveError'; }
}

/** Lower-case, collapse whitespace, strip punctuation, drop a trailing "usa"/"united states". */
export function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').replace(/\b(usa|united states)\b\s*$/i, '').trim();
}

export interface ResolveOutcome { parcel: ResolvedParcel; cached: boolean; lookupId: string }

/**
 * Resolve an address through the public parcel services, cached by normalized
 * address for PARCEL_CACHE_TTL_HOURS. Only geocode failure is an error; every
 * other upstream miss is reported inside parcel.warnings.
 */
export async function resolveCached(app: App, address: string): Promise<ResolveOutcome> {
  const normalized = normalizeAddress(address);
  const since = new Date(Date.now() - app.cfg.parcelCacheTtlHours * 60 * 60 * 1000);
  const [hit] = await app.db.select().from(schema.parcelLookups)
    .where(and(eq(schema.parcelLookups.normalizedAddress, normalized), gte(schema.parcelLookups.createdAt, since)))
    .orderBy(desc(schema.parcelLookups.createdAt)).limit(1);
  if (hit) return { parcel: hit.resolved as unknown as ResolvedParcel, cached: true, lookupId: hit.id };

  let parcel: ResolvedParcel;
  try {
    parcel = await resolveAddress(address, { fetch: app.parcelFetch as any, timeoutMs: app.cfg.parcelTimeoutMs, regridApiKey: app.cfg.regridApiKey });
  } catch (e) {
    if (e instanceof UpstreamError) throw new ParcelResolveError(`We could not locate "${address}". Check the street number, city and state and try again.`);
    throw e;
  }
  const fips = parcel.parcel.fips ?? parcel.geocode?.countyFips ?? null;
  const [row] = await app.db.insert(schema.parcelLookups).values({
    normalizedAddress: normalized, address, lon: parcel.geocode?.location.lon ?? null, lat: parcel.geocode?.location.lat ?? null, fips,
    resolved: parcel as unknown as Record<string, unknown>,
  }).returning({ id: schema.parcelLookups.id });
  await app.outbox.emit('parcel.resolved', { lookupId: row!.id, address: parcel.geocode?.matchedAddress ?? address, fips, lotSizeSf: parcel.parcel.lotSizeSf ?? null, marketCode: parcel.region.marketCode, floodZone: parcel.flood.zone ?? null, zoningCode: parcel.zoning.code ?? null, warningsCount: parcel.warnings.length, durationMs: parcel.durationMs });
  return { parcel, cached: false, lookupId: row!.id };
}
