import type { LonLat, WetlandsResult } from '../types.js';
import { qs } from '../http.js';
import { esriPoint, esriPolygon } from '../geo.js';

/** USFWS National Wetlands Inventory. */
export const NWI_URL = 'https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query';

interface Resp { features?: { attributes: { WETLAND_TYPE?: string; ATTRIBUTE?: string; ACRES?: number } }[] }

export async function wetlandsNear(pt: LonLat, polygon: LonLat[] | undefined, lotAcres: number | undefined, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<WetlandsResult> {
  const fields = { outFields: 'WETLAND_TYPE,ATTRIBUTE,ACRES', returnGeometry: false, f: 'json', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' };
  let onParcel: boolean | 'unknown' = 'unknown';
  let feats: Resp['features'] = [];
  let url = '';
  if (polygon && polygon.length >= 3) {
    url = `${NWI_URL}?${qs({ ...fields, geometry: esriPolygon(polygon), geometryType: 'esriGeometryPolygon' })}`;
    const d = await getJson<Resp>('fws_nwi', url);
    feats = d.features ?? [];
    onParcel = feats.length > 0;
  }
  let nearby: Resp['features'] = feats;
  if (!feats?.length) {
    url = `${NWI_URL}?${qs({ ...fields, geometry: esriPoint(pt), geometryType: 'esriGeometryPoint', distance: 150, units: 'esriSRUnit_Meter' })}`;
    const d = await getJson<Resp>('fws_nwi', url);
    nearby = d.features ?? [];
    if (onParcel === 'unknown' && nearby.length === 0) onParcel = false;
  }
  const features = (nearby ?? []).map((f) => ({ type: f.attributes.WETLAND_TYPE ?? 'Wetland', code: f.attributes.ATTRIBUTE ?? '', acres: Number((f.attributes.ACRES ?? 0).toFixed(2)) }));
  const tidal = features.some((f) => /^E|^M|Estuarine|Marine|Tidal/i.test(f.code + ' ' + f.type));
  const totalNearby = features.reduce((s, f) => s + f.acres, 0);
  const est = onParcel === true ? Number(Math.min(totalNearby, (lotAcres ?? 1) * 0.25).toFixed(2)) : 0;
  return {
    onParcel,
    nearbyWithinFt: features.length ? 492 : 0,
    features,
    estimatedAcresOnParcel: est,
    tidalOrEstuarine: tidal,
    provenance: { source: 'fws_nwi', confidence: onParcel === true ? 'medium' : features.length ? 'medium' : 'high', fetchedAt: now.toISOString(), url, note: onParcel === true ? 'NWI polygon intersects parcel; acreage on parcel is a 25%-of-lot cap estimate pending delineation' : undefined },
  };
}
