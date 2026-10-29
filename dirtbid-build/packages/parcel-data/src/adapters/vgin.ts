import type { LonLat, ParcelResult } from '../types.js';
import { qs } from '../http.js';
import { centroid, envelopeAround, esriPoint, pointInRing, ringAreaSqM, sqMToAcres, sqMToSf } from '../geo.js';

/** Virginia statewide parcel layer (VGIN). Covers most localities; Hampton Roads cities all publish. */
export const VGIN_URL = 'https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0/query';

interface Feat { attributes: Record<string, unknown>; geometry?: { rings?: number[][][] } }
interface Resp { features?: Feat[]; error?: { message?: string } }

const toRing = (rings: number[][][] | undefined): LonLat[] => (rings?.[0] ?? []).map(([lon, lat]) => ({ lon: lon!, lat: lat! }));

export async function parcelAt(pt: LonLat, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<ParcelResult> {
  const common = { geometryType: 'esriGeometryPoint', inSR: 4326, outSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'FIPS,LOCALITY,PARCELID,PTM_ID,VGIN_QPID', returnGeometry: true, f: 'json' };
  let url = `${VGIN_URL}?${qs({ ...common, geometry: esriPoint(pt) })}`;
  let d = await getJson<Resp>('vgin_parcels', url);
  let feats = d.features ?? [];
  let how: 'point' | 'envelope' = 'point';
  if (feats.length === 0) {
    // Point queries miss on some tiles; fall back to a 40 m envelope and pick the ring that contains the point, else the nearest centroid.
    const env = envelopeAround(pt, 40);
    url = `${VGIN_URL}?${qs({ ...common, geometryType: 'esriGeometryEnvelope', geometry: JSON.stringify({ ...env, spatialReference: { wkid: 4326 } }) })}`;
    d = await getJson<Resp>('vgin_parcels', url);
    feats = d.features ?? [];
    how = 'envelope';
  }
  if (feats.length === 0) return { found: false, provenance: { source: 'vgin_parcels', confidence: 'low', fetchedAt: now.toISOString(), url, note: 'No parcel polygon at this location' } };
  let pick = feats.find((f) => pointInRing(pt, toRing(f.geometry?.rings)));
  if (!pick) {
    pick = feats.map((f) => ({ f, d: dist(pt, centroid(toRing(f.geometry?.rings))) })).sort((a, b) => a.d - b.d)[0]!.f;
  }
  const ring = toRing(pick.geometry?.rings);
  const m2 = ringAreaSqM(ring);
  const a = pick.attributes;
  return {
    found: true,
    parcelId: str(a.PARCELID),
    taxMapId: str(a.PTM_ID) || undefined,
    locality: str(a.LOCALITY),
    fips: str(a.FIPS),
    lotSizeSf: Math.round(sqMToSf(m2)),
    acres: Number(sqMToAcres(m2).toFixed(3)),
    polygon: ring,
    centroid: centroid(ring),
    provenance: { source: 'vgin_parcels', confidence: how === 'point' ? 'high' : 'medium', fetchedAt: now.toISOString(), url, note: how === 'envelope' ? 'Matched by envelope search; confirm parcel id' : undefined },
  };
}

const str = (v: unknown) => (v == null ? '' : String(v));
const dist = (a: LonLat, b: LonLat) => Math.hypot(a.lon - b.lon, a.lat - b.lat);
