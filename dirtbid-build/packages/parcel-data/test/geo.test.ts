import { describe, expect, it } from 'vitest';
import { ringAreaSqM, pointInRing, centroid, distanceFt } from '../src/index.js';

describe('geo helpers', () => {
  // ~100 m × 100 m square near Hampton
  const sq = [{ lon: -76.345, lat: 37.03 }, { lon: -76.345 + 0.001124, lat: 37.03 }, { lon: -76.345 + 0.001124, lat: 37.03 + 0.000905 }, { lon: -76.345, lat: 37.03 + 0.000905 }];
  it('computes area within 2% of 10,000 m²', () => {
    const a = ringAreaSqM(sq);
    expect(a).toBeGreaterThan(9800);
    expect(a).toBeLessThan(10200);
  });
  it('point in ring and centroid', () => {
    const c = centroid(sq);
    expect(pointInRing(c, sq)).toBe(true);
    expect(pointInRing({ lon: -76.35, lat: 37.03 }, sq)).toBe(false);
  });
  it('distance in feet', () => {
    expect(distanceFt(sq[0]!, sq[1]!)).toBeGreaterThan(320);
    expect(distanceFt(sq[0]!, sq[1]!)).toBeLessThan(335);
  });
});
