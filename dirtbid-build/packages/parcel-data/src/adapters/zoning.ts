import type { LonLat, ZoningResult } from '../types.js';
import { qs } from '../http.js';
import { esriPoint } from '../geo.js';

export interface ZoningLayer { url: string; codeField: string; descField?: string }

/**
 * Localities that publish a queryable zoning layer. Entries are keyed by county/city FIPS.
 * Hampton Roads cities are inconsistent about public endpoints; add or correct entries as
 * Muhammad verifies them. Anything not listed resolves to "unknown" and the UI asks.
 */
export const DEFAULT_ZONING_LAYERS: Record<string, ZoningLayer> = {
  // Chesapeake City — OpenData MapServer layer 26 (unverified from this environment; CC BY-NC-ND terms apply)
  '51550': { url: 'https://public.cityofchesapeake.net/arcgis/rest/services/OpenData/MapServer/26/query', codeField: 'ZONING', descField: 'ZONE_DESC' },
};

interface Resp { features?: { attributes: Record<string, unknown> }[] }

export async function zoningAt(pt: LonLat, fips: string | undefined, layers: Record<string, ZoningLayer>, regridApiKey: string | undefined, getJson: <T>(s: string, u: string, init?: { headers?: Record<string, string> }) => Promise<T>, now: Date): Promise<ZoningResult> {
  const layer = fips ? layers[fips] : undefined;
  if (layer) {
    const url = `${layer.url}?${qs({ geometry: esriPoint(pt), geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: [layer.codeField, layer.descField].filter(Boolean).join(','), returnGeometry: false, f: 'json' })}`;
    try {
      const d = await getJson<Resp>('arcgis_zoning', url);
      const a = d.features?.[0]?.attributes;
      if (a && a[layer.codeField]) return { code: String(a[layer.codeField]), description: layer.descField ? String(a[layer.descField] ?? '') : undefined, provenance: { source: 'arcgis_zoning', confidence: 'high', fetchedAt: now.toISOString(), url } };
    } catch { /* fall through */ }
  }
  if (regridApiKey) {
    const url = `https://app.regrid.com/api/v2/parcels/point?${qs({ lat: pt.lat, lon: pt.lon, token: regridApiKey, return_zoning: true })}`;
    try {
      const d = await getJson<{ parcels?: { features?: { properties?: { fields?: { zoning?: string; zoning_description?: string } } }[] } }>('regrid', url);
      const f = d.parcels?.features?.[0]?.properties?.fields;
      if (f?.zoning) return { code: f.zoning, description: f.zoning_description, provenance: { source: 'regrid', confidence: 'medium', fetchedAt: now.toISOString(), url: url.replace(regridApiKey, '***') } };
    } catch { /* fall through */ }
  }
  return { provenance: { source: 'unavailable', confidence: 'low', fetchedAt: now.toISOString(), note: fips && layers[fips] ? 'Locality zoning layer did not answer' : 'No zoning layer configured for this locality; enter the district from the locality GIS viewer' } };
}
