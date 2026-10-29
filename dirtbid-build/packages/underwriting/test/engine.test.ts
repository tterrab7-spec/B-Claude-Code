import { describe, expect, it } from 'vitest';
import { underwrite, findZoningRule, buildReport, listMarkets, HAMPTON_ROADS_VA, UnderwritingError } from '../src/index.js';

describe('validation', () => {
  it('rejects bad input with field names', () => {
    expect(() => underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 0, zoningCode: 'R-1', projectType: 'vacant_land' })).toThrow(UnderwritingError);
    expect(() => underwrite({ marketCode: 'NOPE', lotSizeSf: 5000, zoningCode: 'R-1', projectType: 'vacant_land' })).toThrow(/Unknown market/);
    expect(() => underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 5000, zoningCode: 'R-1', projectType: 'fire_rebuild' })).toThrow(/prior structure/);
  });
});

describe('zoning lookup', () => {
  it('matches aliases and dash-less codes', () => {
    expect(findZoningRule(HAMPTON_ROADS_VA, 'r11')?.code).toBe('R-10');
    expect(findZoningRule(HAMPTON_ROADS_VA, 'R-7.5')?.code).toBe('R-7.5');
    expect(findZoningRule(HAMPTON_ROADS_VA, 'A-24')?.code).toBe('R-M');
    expect(findZoningRule(HAMPTON_ROADS_VA, 'ZZZ')).toBeNull();
  });
});

describe('Hampton Roads market', () => {
  const base = { marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 12000, zoningCode: 'R-10', projectType: 'vacant_land' as const, zip: '23666' };

  it('prices a vacant infill lot with financing, contingency and tap fees', () => {
    const r = underwrite({ ...base, arvPerSf: 290, site: { floodZone: 'X', rpaBuffer: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } });
    const s = r.scenarios.find((x) => x.key === 'single_home')!;
    expect(s.primaryLivingSf).toBe(2200);
    expect(s.costs.financing).toBeGreaterThan(0);
    expect(s.costs.contingency).toBeGreaterThan(0);
    expect(s.costs.fees).toBe(9500);
    expect(s.costs.sitePrep).toBe(28000);
    expect(r.hazards.maxOfferHaircutPct).toBe(0);
    expect(r.scores.approvalProbability).toBeGreaterThanOrEqual(70);
    expect(r.scores.riskLevel).toBe('low');
    expect(r.utilities.connectable).toBe('yes');
  });

  it('penalizes flood zone, RPA buffer and missing sewer', () => {
    const clean = underwrite({ ...base, arvPerSf: 290, site: { floodZone: 'X', rpaBuffer: 'no', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } });
    const dirty = underwrite({ ...base, arvPerSf: 290, site: { floodZone: 'AE', rpaBuffer: 'yes', wetlandsAcres: 0.5, utilities: { water: 'yes', sewer: 'no', power: 'yes' } } });
    const c = clean.scenarios.find((x) => x.key === 'single_home')!;
    const d = dirty.scenarios.find((x) => x.key === 'single_home')!;
    expect(d.maxOffer).toBeLessThan(c.maxOffer);
    expect(d.costs.fees).toBeGreaterThan(c.costs.fees);
    expect(dirty.scores.approvalProbability).toBeLessThan(clean.scores.approvalProbability - 20);
    expect(dirty.scores.riskLevel).toBe('high');
    expect(dirty.environmental.constraintsIdentified).toBe(true);
    expect(dirty.overlays.map((f) => f.id)).toEqual(expect.arrayContaining(['CBPA_RPA', 'WETLANDS', 'FEMA_A', 'NO_SEWER']));
    expect(d.permitMonths).toBeGreaterThan(c.permitMonths);
  });

  it('models a by-right subdivision and a finished-lot exit', () => {
    const r = underwrite({ marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 435600, zoningCode: 'R-10', projectType: 'subdivision', arvPerSf: 240, targetHomeSf: 2400, site: { floodZone: 'X', rpaBuffer: 'no', stateRouteFrontage: 'yes', utilities: { water: 'yes', sewer: 'yes', power: 'yes' } } });
    const sub = r.scenarios.find((x) => x.key === 'subdivision_by_right')!;
    const lots = r.scenarios.find((x) => x.key === 'finished_lots')!;
    expect(sub.units).toBe(32); // 43 gross × 0.75
    expect(sub.permitTier).toBe('administrative_review');
    expect(lots.costs.hard).toBe(0);
    expect(lots.arv).toBeGreaterThan(0);
    expect(r.overlays.some((f) => f.id === 'VDOT_ENTRANCE' && f.status === 'yes')).toBe(true);
    expect(r.overlays.some((f) => f.id === 'BY_RIGHT_SUBDIVISION')).toBe(true);
  });

  it('flags rezoning when agricultural land cannot subdivide by right', () => {
    const r = underwrite({ marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 435600, zoningCode: 'A-1', projectType: 'subdivision', arvPerSf: 240, site: { floodZone: 'X' } });
    const sub = r.scenarios.find((x) => x.key === 'subdivision_by_right')!;
    expect(sub.permitTier).toBe('rezoning');
    expect(r.scores.approvalProbability).toBeLessThan(45);
    expect(r.overlays.some((f) => f.id === 'REZONING_REQUIRED')).toBe(true);
  });

  it('derives ARV from comps when supplied', () => {
    const r = underwrite({ ...base, comps: [{ salePrice: 520000, livingSf: 2000 }, { salePrice: 480000, livingSf: 2000 }, { salePrice: 600000, livingSf: 2400 }] });
    expect(r.comps.source).toBe('comps');
    expect(r.comps.medianPricePerSf).toBe(250);
    expect(r.comps.arvPerSfUsed).toBe(250);
  });

  it('falls back to zip-band market default', () => {
    const r = underwrite({ ...base, zip: '23456' });
    expect(r.comps.source).toBe('market_default');
    expect(r.comps.arvPerSfUsed).toBe(Math.round(265 * 1.18));
    expect(r.market.zipBand?.area).toContain('Virginia Beach');
  });
});

describe('report presenter', () => {
  it('builds the four lite sections and six callouts', () => {
    const r = underwrite({ marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 12000, zoningCode: 'R-10', projectType: 'vacant_land', arvPerSf: 290, address: '123 Example St, Hampton, VA 23666' });
    const rep = buildReport(r, 'lite');
    expect(rep.sections.map((s) => s.key)).toEqual(['zoning', 'utilities', 'environmental', 'comps']);
    expect(rep.callouts).toHaveLength(6);
    expect(rep.gauges.approvalProbability.value).toBe(r.scores.approvalProbability);
    const enh = buildReport(r, 'enhanced');
    expect(enh.sections.map((s) => s.key)).toContain('proforma');
    expect(enh.sections.map((s) => s.key)).toContain('overlays');
  });

  it('exposes a sensitivity grid of 9 cells on the recommended scenario', () => {
    const r = underwrite({ marketCode: 'HAMPTON_ROADS_VA', lotSizeSf: 12000, zoningCode: 'R-10', projectType: 'vacant_land', arvPerSf: 290 });
    expect(r.sensitivity).toHaveLength(9);
    const up = r.sensitivity.find((c) => c.arvDeltaPct === 10 && c.costDeltaPct === 0)!;
    const down = r.sensitivity.find((c) => c.arvDeltaPct === -10 && c.costDeltaPct === 0)!;
    expect(up.maxOffer).toBeGreaterThan(down.maxOffer);
  });
});

describe('registry', () => {
  it('lists three markets', () => {
    expect(listMarkets().map((m) => m.code).sort()).toEqual(['ALTADENA_CA', 'GENERIC_US', 'HAMPTON_ROADS_VA']);
  });
});
