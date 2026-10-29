import type { FloodResult, LonLat } from '../types.js';
import { qs } from '../http.js';
import { esriPoint } from '../geo.js';

/** FEMA National Flood Hazard Layer, S_FLD_HAZ_AR (layer 28). */
export const FEMA_URL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query';

interface Resp { features?: { attributes: { FLD_ZONE?: string; ZONE_SUBTY?: string | null; SFHA_TF?: string; STATIC_BFE?: number } }[] }

export async function floodZoneAt(pt: LonLat, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<FloodResult> {
  const url = `${FEMA_URL}?${qs({ geometry: esriPoint(pt), geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE', returnGeometry: false, f: 'json' })}`;
  const d = await getJson<Resp>('fema_nfhl', url);
  const a = d.features?.[0]?.attributes;
  if (!a) return { provenance: { source: 'fema_nfhl', confidence: 'low', fetchedAt: now.toISOString(), url, note: 'No NFHL polygon here (unmapped area)' } };
  const bfe = typeof a.STATIC_BFE === 'number' && a.STATIC_BFE > -9000 ? a.STATIC_BFE : null;
  return { zone: a.FLD_ZONE, subtype: a.ZONE_SUBTY ?? undefined, sfha: a.SFHA_TF === 'T', staticBfeFt: bfe, provenance: { source: 'fema_nfhl', confidence: 'high', fetchedAt: now.toISOString(), url } };
}
