import type { Tri, UnderwritingInput } from '@dirtbid/underwriting';
import type { ResolvedParcel, Provenance } from './types.js';

/**
 * Combine several resolved addresses into one development site.
 * Lot areas add (distinct parcels only), hazards take the worst case,
 * soils take the weakest reading, and every source stays attributed.
 */
export interface AssembledSite {
  addresses: string[];
  parcels: { address: string; parcelId?: string; taxMapId?: string; lotSizeSf?: number; acres?: number; provenance: Provenance }[];
  distinctParcelIds: string[];
  duplicateAddresses: string[];
  lotSizeSf: number;
  acres: number;
  marketCode: string;
  zip?: string;
  jurisdiction?: string;
  floodZone?: string;
  floodBfeFt?: number | null;
  soils: 'stable' | 'marginal' | 'poor' | 'unknown';
  hydricLikely: boolean;
  slopePct?: number;
  wetlandsAcres: number;
  rpaBuffer: Tri;
  zoningCodes: string[];
  regionMultiplier: number;
  warnings: string[];
  underwritingInput: UnderwritingInput;
}

const FLOOD_RANK: Record<string, number> = { V: 4, VE: 4, A: 3, AE: 3, AO: 3, AH: 3, X: 1 };
const SOIL_RANK = { poor: 3, marginal: 2, unknown: 1, stable: 0 } as const;

export function assembleParcels(resolved: ResolvedParcel[]): AssembledSite {
  if (resolved.length === 0) throw new Error('assembleParcels needs at least one resolved address');
  const seen = new Map<string, ResolvedParcel>();
  const duplicates: string[] = [];
  for (const r of resolved) {
    const key = r.parcel.parcelId ? `${r.parcel.fips ?? ''}:${r.parcel.parcelId}` : `addr:${r.query}`;
    if (seen.has(key)) duplicates.push(r.query); else seen.set(key, r);
  }
  const distinct = [...seen.values()];
  const lotSizeSf = distinct.reduce((s, r) => s + (r.parcel.lotSizeSf ?? 0), 0);
  const worst = <T>(items: T[], rank: (t: T) => number) => items.slice().sort((a, b) => rank(b) - rank(a))[0];
  const flood = worst(resolved.map((r) => r.flood), (f) => FLOOD_RANK[(f.zone ?? '').toUpperCase()] ?? 0);
  const soilsR = worst(resolved.map((r) => r.soils), (s) => SOIL_RANK[s.classification]);
  const first = resolved[0]!;
  const zoningCodes = [...new Set(resolved.map((r) => r.zoning.code).filter((z): z is string => !!z))];
  const warnings = [...new Set(resolved.flatMap((r) => r.warnings))];
  if (duplicates.length) warnings.unshift(`${duplicates.length} address${duplicates.length > 1 ? 'es' : ''} (${duplicates.join('; ')}) resolve to a parcel already counted; one tax parcel carries multiple street numbers.`);
  if (zoningCodes.length > 1) warnings.push(`Split zoning across the assemblage: ${zoningCodes.join(', ')}. The engine prices the first; a rezoning to one district is the usual path.`);
  const rpa: Tri = resolved.some((r) => r.rpa.likely === 'yes') ? 'yes' : resolved.every((r) => r.rpa.likely === 'no') ? 'no' : 'unknown';
  const slope = Math.max(...resolved.map((r) => r.elevation.slopePct ?? 0)) || undefined;
  const wetlands = Number(distinct.reduce((s, r) => s + r.wetlands.estimatedAcresOnParcel, 0).toFixed(2));
  const base = first.underwritingInput;
  const underwritingInput: UnderwritingInput = {
    ...base,
    address: resolved.map((r) => r.geocode?.matchedAddress ?? r.query).join(' + '),
    lotSizeSf,
    zoningCode: zoningCodes[0] ?? '',
    site: { ...base.site, floodZone: flood?.zone, soils: soilsR?.classification ?? 'unknown', slopePct: slope, wetlandsAcres: wetlands || undefined, rpaBuffer: base.site?.rpaBuffer === undefined ? undefined : rpa },
    sitework: { ...base.sitework, hydric: soilsR?.hydricLikely || undefined },
  };
  return {
    addresses: resolved.map((r) => r.query),
    parcels: resolved.map((r) => ({ address: r.query, parcelId: r.parcel.parcelId, taxMapId: r.parcel.taxMapId, lotSizeSf: r.parcel.lotSizeSf, acres: r.parcel.acres, provenance: r.parcel.provenance })),
    distinctParcelIds: distinct.map((r) => r.parcel.parcelId ?? r.query),
    duplicateAddresses: duplicates,
    lotSizeSf,
    acres: Number((lotSizeSf / 43560).toFixed(3)),
    marketCode: first.region.marketCode,
    zip: first.geocode?.zip,
    jurisdiction: first.parcel.locality ?? first.geocode?.countyName,
    floodZone: flood?.zone,
    floodBfeFt: flood?.staticBfeFt ?? null,
    soils: soilsR?.classification ?? 'unknown',
    hydricLikely: !!soilsR?.hydricLikely,
    slopePct: slope,
    wetlandsAcres: wetlands,
    rpaBuffer: rpa,
    zoningCodes,
    regionMultiplier: first.region.multiplier,
    warnings,
    underwritingInput,
  };
}
