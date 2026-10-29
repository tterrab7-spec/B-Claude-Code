import type { LonLat } from './types.js';

const FT_PER_M = 3.28084;

/** Planar approximation good to <0.5% at parcel scale. Returns square meters. */
export function ringAreaSqM(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p.lat, 0) / ring.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
    a += p.lon * kx * (q.lat * ky) - q.lon * kx * (p.lat * ky);
  }
  return Math.abs(a) / 2;
}
export const sqMToSf = (m2: number) => m2 * 10.7639;
export const sqMToAcres = (m2: number) => m2 / 4046.856;

export function pointInRing(pt: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]!.lon, yi = ring[i]!.lat, xj = ring[j]!.lon, yj = ring[j]!.lat;
    const intersect = yi > pt.lat !== yj > pt.lat && pt.lon < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function centroid(ring: LonLat[]): LonLat {
  const n = ring.length || 1;
  return { lon: ring.reduce((s, p) => s + p.lon, 0) / n, lat: ring.reduce((s, p) => s + p.lat, 0) / n };
}

export function distanceFt(a: LonLat, b: LonLat): number {
  const lat0 = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lon - a.lon) * 111320 * Math.cos(lat0), dy = (b.lat - a.lat) * 110540;
  return Math.sqrt(dx * dx + dy * dy) * FT_PER_M;
}

/** Offset a point by meters east/north. */
export function offset(p: LonLat, dxM: number, dyM: number): LonLat {
  const lat0 = (p.lat * Math.PI) / 180;
  return { lon: p.lon + dxM / (111320 * Math.cos(lat0)), lat: p.lat + dyM / 110540 };
}

export function envelopeAround(p: LonLat, halfM: number) {
  const a = offset(p, -halfM, -halfM), b = offset(p, halfM, halfM);
  return { xmin: a.lon, ymin: a.lat, xmax: b.lon, ymax: b.lat };
}

export const esriPoint = (p: LonLat) => JSON.stringify({ x: p.lon, y: p.lat, spatialReference: { wkid: 4326 } });
export const esriPolygon = (ring: LonLat[]) => JSON.stringify({ rings: [ring.map((p) => [p.lon, p.lat])], spatialReference: { wkid: 4326 } });
export const wktPoint = (p: LonLat) => `point(${p.lon} ${p.lat})`;
