import { describe, expect, it } from 'vitest';
import { estimateSitework, underwrite, DIRTBID_REGIONS } from '../src/index.js';

describe('sitework estimator', () => {
  it('prices a clean infill lot across CSI 01/31/32/33 with a markup waterfall', () => {
    const e = estimateSitework({ lotSizeSf: 12000, soils: 'stable', floodZone: 'X', treeCoverPct: 0.3, regionMultiplier: DIRTBID_REGIONS.VA_HR!.multiplier });
    expect(e.byDivision.map((d) => d.division)).toEqual(['01', '31', '32', '33']);
    expect(e.directCost).toBeGreaterThan(20000);
    expect(e.total).toBeGreaterThan(e.directCost);
    expect(e.waterfall.at(-1)!.amount).toBe(e.total);
    expect(e.riskLabel).toBe('Low');
    expect(e.lines.every((l) => Math.abs(l.total - l.qty * l.unitCost) <= 1)).toBe(true);
  });

  it('adds undercut, dewatering and flood fill on bad ground', () => {
    const clean = estimateSitework({ lotSizeSf: 12000, soils: 'stable', floodZone: 'X' });
    const bad = estimateSitework({ lotSizeSf: 12000, soils: 'poor', hydric: true, floodZone: 'AE', sewerMainDistanceFt: 450 });
    expect(bad.total).toBeGreaterThan(clean.total * 1.5);
    expect(bad.lines.some((l) => l.csi === '31 23 23')).toBe(true);
    expect(bad.lines.some((l) => l.item.includes('Grinder'))).toBe(true);
    expect(bad.riskLabel).toBe('High');
    expect(bad.flags.length).toBeGreaterThanOrEqual(3);
  });

  it('includes demolition under division 02 when a structure comes down', () => {
    const e = estimateSitework({ lotSizeSf: 9000, existingStructureSf: 1800, demolitionRequired: true });
    expect(e.byDivision.some((d) => d.division === '02')).toBe(true);
  });

  it('scales to a subdivision with streets and a stormwater facility', () => {
    const e = estimateSitework({ lotSizeSf: 435600, lots: 32, newStreetLf: 1760, soils: 'marginal' });
    expect(e.lines.some((l) => l.item.startsWith('New public street'))).toBe(true);
    expect(e.lines.some((l) => l.item.startsWith('Stormwater management facility'))).toBe(true);
    expect(e.perLot).toBeLessThan(e.total);
    expect(e.perLot).toBeGreaterThan(20000);
  });
});

describe('engine + sitework', () => {
  const base = { marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 12000, zoningCode: 'R-10', projectType: 'vacant_land' as const, arvPerSf: 290 };

  it('derives site prep from the model for VA markets and zeroes the flat tap fee', () => {
    const r = underwrite({ ...base, site: { floodZone: 'X', soils: 'stable', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } });
    expect(r.sitework).not.toBeNull();
    expect(r.sitework!.source).toBe('dirtbid_build_model');
    expect(r.assumptions.sitePrepPerLot).toBe(r.sitework!.perLot);
    expect(r.assumptions.utilityConnectionFeesPerUnit).toBe(0);
    expect(r.scenarios[0]!.costs.sitePrep).toBe(r.sitework!.perLot);
  });

  it('uses a DirtBid Land Screening total when supplied', () => {
    const r = underwrite({ ...base, sitework: { dirtbidLandScreeningTotal: 61250 } });
    expect(r.sitework!.source).toBe('dirtbid_land_screening');
    expect(r.assumptions.sitePrepPerLot).toBe(61250);
    expect(r.scenarios[0]!.costs.sitePrep).toBe(61250);
  });

  it('respects an explicit site prep override and skips the model', () => {
    const r = underwrite({ ...base, assumptions: { sitePrepPerLot: 15000 } });
    expect(r.sitework).toBeNull();
    expect(r.scenarios[0]!.costs.sitePrep).toBe(15000);
  });

  it('leaves Altadena parity untouched (model off for that market)', () => {
    const r = underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 7500, existingStructureSf: 1800, zoningCode: 'R-1', arvPerSf: 900, projectType: 'fire_rebuild' });
    expect(r.sitework).toBeNull();
    expect(r.scenarios[0]!.costs.sitePrep).toBe(0);
  });
});
