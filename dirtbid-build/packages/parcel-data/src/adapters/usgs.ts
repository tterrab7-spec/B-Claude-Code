import type { ElevationResult, LonLat } from '../types.js';
import { qs } from '../http.js';
import { offset } from '../geo.js';

/** USGS 3DEP Elevation Point Query Service. */
export const EPQS_URL = 'https://epqs.nationalmap.gov/v1/json';

interface Resp { value?: number | string }

export async function elevationAndSlope(pt: LonLat, getJson: <T>(s: string, u: string) => Promise<T>, now: Date): Promise<ElevationResult> {
  const R = 30; // metres
  const pts = [pt, offset(pt, R, 0), offset(pt, -R, 0), offset(pt, 0, R), offset(pt, 0, -R)];
  let url = '';
  const results = await Promise.all(pts.map(async (p) => {
    const u = `${EPQS_URL}?${qs({ x: p.lon, y: p.lat, units: 'Feet', wkid: 4326 })}`;
    url = u;
    try {
      const d = await getJson<Resp>('usgs_3dep', u);
      const v = Number(d.value);
      return Number.isFinite(v) && v > -1000 ? { lon: p.lon, lat: p.lat, ft: v } : null;
    } catch { return null; } // tolerate individual misses
  }));
  const samples: ElevationResult['samples'] = results.filter((s): s is { lon: number; lat: number; ft: number } => s !== null);
  if (samples.length === 0) return { samples, provenance: { source: 'usgs_3dep', confidence: 'low', fetchedAt: now.toISOString(), url, note: 'Elevation service unavailable' } };
  const center = samples[0]!.ft;
  const runFt = R * 3.28084;
  const slopes = samples.slice(1).map((s) => Math.abs(s.ft - center) / runFt);
  const slopePct = slopes.length ? Number((Math.max(...slopes) * 100).toFixed(1)) : undefined;
  return { centerFt: Number(center.toFixed(1)), slopePct, samples, provenance: { source: 'usgs_3dep', confidence: samples.length >= 4 ? 'medium' : 'low', fetchedAt: now.toISOString(), url, note: 'Slope from a 5-point 30 m cross; a survey governs' } };
}
