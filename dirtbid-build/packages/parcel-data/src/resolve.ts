import type { Tri, UnderwritingInput, ProjectType } from '@dirtbid/underwriting';
import { DIRTBID_REGIONS } from '@dirtbid/underwriting';
import type { ResolveOptions, ResolvedParcel, Provenance, GeocodeResult } from './types.js';
import { makeClient, UpstreamError } from './http.js';
import { geocode } from './adapters/census.js';
import { parcelAt } from './adapters/vgin.js';
import { floodZoneAt } from './adapters/fema.js';
import { wetlandsNear } from './adapters/nwi.js';
import { elevationAndSlope } from './adapters/usgs.js';
import { soilsAt } from './adapters/usda.js';
import { zoningAt, DEFAULT_ZONING_LAYERS } from './adapters/zoning.js';

/** County/city FIPS → DirtBid Build market and DirtBid sitework region. */
const HAMPTON_ROADS_FIPS = new Set(['51650', '51700', '51710', '51810', '51550', '51800', '51740', '51199', '51095', '51093', '51830', '51073', '51115', '51735']);
const VA_REGION_BY_FIPS: Record<string, string> = {};
for (const f of HAMPTON_ROADS_FIPS) VA_REGION_BY_FIPS[f] = 'VA_HR';
for (const f of ['51059', '51013', '51510', '51107', '51153', '51600', '51610', '51683', '51685']) VA_REGION_BY_FIPS[f] = 'VA_NOVA';
for (const f of ['51630', '51177', '51179', '51137', '51047', '51033']) VA_REGION_BY_FIPS[f] = 'VA_FRED';
for (const f of ['51760', '51087', '51041', '51085', '51127', '51570', '51730', '51036', '51075', '51145']) VA_REGION_BY_FIPS[f] = 'VA_RIC';

export function marketForFips(countyFips: string | undefined, stateFips: string | undefined): { marketCode: string; dirtbidRegion: string | null; multiplier: number } {
  if (countyFips && HAMPTON_ROADS_FIPS.has(countyFips)) return { marketCode: 'HAMPTON_ROADS_VA', dirtbidRegion: 'VA_HR', multiplier: DIRTBID_REGIONS.VA_HR!.multiplier };
  if (countyFips === '06037') return { marketCode: 'ALTADENA_CA', dirtbidRegion: null, multiplier: 1 };
  if (stateFips === '51' || countyFips?.startsWith('51')) {
    const region = (countyFips && VA_REGION_BY_FIPS[countyFips]) ?? 'VA_RIC';
    return { marketCode: 'GENERIC_US', dirtbidRegion: region, multiplier: DIRTBID_REGIONS[region]!.multiplier };
  }
  return { marketCode: 'GENERIC_US', dirtbidRegion: null, multiplier: 1 };
}

const unavailable = (source: string, now: Date, note: string): Provenance => ({ source, confidence: 'low', fetchedAt: now.toISOString(), note });

export async function resolveAddress(address: string, opts: ResolveOptions = {}): Promise<ResolvedParcel> {
  const started = Date.now();
  const now = opts.now ? opts.now() : new Date();
  const { getJson } = makeClient(opts.fetch, opts.timeoutMs ?? 12000);
  const warnings: string[] = [];
  const g = <T>(s: string, u: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => getJson<T>(s, u, init);

  let geo: GeocodeResult | null = null;
  try { geo = await geocode(address, g, now); } catch (e) { warnings.push(msg(e)); }
  if (!geo) {
    throw new UpstreamError('census_geocoder', `Address could not be geocoded: "${address}"${warnings.length ? ` (${warnings.join('; ')})` : ''}`);
  }
  const pt = geo.location;

  const [parcelR, floodR, elevR, soilsR] = await Promise.allSettled([
    parcelAt(pt, g, now),
    floodZoneAt(pt, g, now),
    elevationAndSlope(pt, g, now),
    soilsAt(pt, g, now),
  ]);
  const parcel = settled(parcelR, warnings) ?? { found: false, provenance: unavailable('vgin_parcels', now, 'Parcel service unavailable') };
  const flood = settled(floodR, warnings) ?? { provenance: unavailable('fema_nfhl', now, 'Flood service unavailable') };
  const elevation = settled(elevR, warnings) ?? { samples: [], provenance: unavailable('usgs_3dep', now, 'Elevation service unavailable') };
  const soils = settled(soilsR, warnings) ?? { components: [], classification: 'unknown' as const, hydricLikely: false, provenance: unavailable('usda_ssurgo', now, 'Soils service unavailable') };

  const fips = parcel.fips ?? geo.countyFips;
  const [wetR, zoneR] = await Promise.allSettled([
    wetlandsNear(parcel.centroid ?? pt, parcel.polygon, parcel.acres, g, now),
    zoningAt(parcel.centroid ?? pt, fips, { ...DEFAULT_ZONING_LAYERS, ...(opts.zoningLayers ?? {}) }, opts.regridApiKey, g, now),
  ]);
  const wetlands = settled(wetR, warnings) ?? { onParcel: 'unknown' as const, nearbyWithinFt: 0, features: [], estimatedAcresOnParcel: 0, tidalOrEstuarine: false, provenance: unavailable('fws_nwi', now, 'Wetlands service unavailable') };
  const zoning = settled(zoneR, warnings) ?? { provenance: unavailable('unavailable', now, 'Zoning lookup failed') };

  const region = marketForFips(fips, geo.stateFips);
  const isVA = (geo.stateFips ?? fips?.slice(0, 2)) === '51';

  // RPA (Chesapeake Bay Preservation Act): tidal wetlands or any NWI water within 100 ft ⇒ likely.
  let rpaLikely: Tri = 'unknown';
  let rpaNote = 'Not in a CBPA locality';
  if (isVA && region.dirtbidRegion && ['VA_HR', 'VA_NNMP', 'VA_RIC', 'VA_FRED', 'VA_NOVA'].includes(region.dirtbidRegion)) {
    if (wetlands.tidalOrEstuarine || wetlands.onParcel === true) { rpaLikely = 'yes'; rpaNote = 'Tidal or on-parcel wetlands: RPA buffer likely; perennial flow determination required'; }
    else if (wetlands.onParcel === false && wetlands.features.length === 0) { rpaLikely = 'no'; rpaNote = 'No NWI water within 150 m; RPA unlikely, confirm on locality layer'; }
    else { rpaNote = 'Wetlands nearby; RPA status needs the locality layer'; }
  }

  if (!parcel.found) warnings.push('Parcel polygon not found; lot size must be entered manually.');
  if (!zoning.code) warnings.push('Zoning district not available from a public layer for this locality; enter it from the locality GIS viewer.');
  if (soils.provenance.confidence === 'low') warnings.push('Soils are screening-level only; order a DirtBid Soil Report ($350) before pricing the dirt.');

  const projectType: ProjectType = 'vacant_land';
  const underwritingInput: UnderwritingInput = {
    address: geo.matchedAddress,
    marketCode: region.marketCode,
    zip: geo.zip,
    lotSizeSf: parcel.lotSizeSf ?? 0,
    existingStructureSf: 0,
    zoningCode: zoning.code ?? '',
    projectType,
    site: {
      floodZone: flood.zone,
      wetlandsAcres: wetlands.estimatedAcresOnParcel || undefined,
      rpaBuffer: isVA ? rpaLikely : undefined,
      soils: soils.classification,
      slopePct: elevation.slopePct,
      hillside: (elevation.slopePct ?? 0) > 15 || undefined,
      utilities: { water: 'unknown', sewer: 'unknown', power: 'unknown' },
      stateRouteFrontage: 'unknown',
      historic: 'unknown',
      tenantOccupiedLast3Years: 'unknown',
      fireHazardZone: region.marketCode === 'ALTADENA_CA' ? 'unknown' : undefined,
    },
    sitework: { hydric: soils.hydricLikely || undefined, regionMultiplier: region.multiplier },
  };

  return {
    query: address,
    geocode: geo,
    parcel, zoning, flood, wetlands, elevation, soils,
    region,
    utilities: { water: 'unknown', sewer: 'unknown', power: 'unknown', provenance: unavailable('heuristic', now, 'Request a utility availability letter from the locality') },
    rpa: { likely: rpaLikely, provenance: { source: 'heuristic', confidence: 'low', fetchedAt: now.toISOString(), note: rpaNote } },
    underwritingInput,
    siteworkInput: { lotSizeSf: parcel.lotSizeSf ?? 0, slopePct: elevation.slopePct, soils: soils.classification, hydric: soils.hydricLikely, floodZone: flood.zone, wetlandsAcres: wetlands.estimatedAcresOnParcel, regionMultiplier: region.multiplier },
    warnings,
    durationMs: Date.now() - started,
  };
}

function settled<T>(r: PromiseSettledResult<T>, warnings: string[]): T | null {
  if (r.status === 'fulfilled') return r.value;
  warnings.push(msg(r.reason));
  return null;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
