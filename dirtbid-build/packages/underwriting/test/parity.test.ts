import { describe, expect, it } from 'vitest';
import { underwrite, proForma, ALTADENA_CA } from '../src/index.js';

/**
 * Parity with the public Altadena offer model (constants lifted from its bundle):
 *   HG=350 hard/sf, OG=0.10 soft, Zx=0.40 ROI, TQ=0.05 commission, RQ=0.03 closing,
 *   MG=35,000 demo, jG=0.30 gross-up, DQ=200 ADU/sf, Zv=1,100 max ADU, PQ=300 ADU premium.
 *   maxOffer = (ARV − saleCosts − 1.4 × costs) / 1.4
 */
function reference(livingSf: number, aduSf: number, arvPerSf: number, bump = 0, haircut = 0, demo = false) {
  const o = livingSf, s = Math.min(aduSf, 1100), m = 1 + bump;
  const p = o * 1.3;
  const B = p * 350 * m, g = s * 200 * m, y = B + g, C = y * 0.1, F = demo ? 35000 : 0, I = y + C + F;
  const H = s > 0 ? arvPerSf + 300 : arvPerSf;
  const N = o * H, k = N * 0.05 + N * 0.03, z = 1.4;
  const M = (N - k - z * I) / z;
  const offer = Math.max(0, M * (1 - haircut));
  return { maxOffer: Math.round(offer), totalCosts: Math.round(I), arv: Math.round(N), totalInvestment: Math.round(offer + I) };
}

describe('Altadena parity', () => {
  it('reproduces the accelerated-rebuild max offer', () => {
    const r = underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 7500, existingStructureSf: 1800, zoningCode: 'R-1', arvPerSf: 900, projectType: 'fire_rebuild', site: { fireHazardZone: 'no', historic: 'no', tenantOccupiedLast3Years: 'no' } });
    const s1 = r.scenarios.find((s) => s.key === 'accelerated_rebuild')!;
    const ref = reference(Math.round(1800 * 1.1), 0, 900);
    expect(s1.primaryLivingSf).toBe(1980);
    expect(s1.costs.total).toBe(ref.totalCosts);
    expect(s1.arv).toBe(ref.arv);
    expect(s1.maxOffer).toBe(ref.maxOffer);
    expect(s1.totalInvestment).toBe(ref.totalInvestment);
    expect(s1.roi).toBeCloseTo(0.4, 2);
  });

  it('reproduces the rebuild + ADU scenario with the $300/sf premium on primary sf only', () => {
    const r = underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 7500, existingStructureSf: 1800, zoningCode: 'R-1', arvPerSf: 900, projectType: 'fire_rebuild', site: { fireHazardZone: 'no', historic: 'no', tenantOccupiedLast3Years: 'no' } });
    const s2 = r.scenarios.find((s) => s.key === 'rebuild_plus_adu')!;
    const ref = reference(1980, 1100, 900);
    expect(s2.aduSf).toBe(1100);
    expect(s2.arv).toBe(ref.arv);
    expect(s2.maxOffer).toBe(ref.maxOffer);
  });

  it('applies the 5% VHFHSZ haircut and 3% cost bump when the lot is in the fire zone', () => {
    const r = underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 7500, existingStructureSf: 1800, zoningCode: 'R-1', arvPerSf: 900, projectType: 'fire_rebuild', site: { fireHazardZone: 'yes', historic: 'no', tenantOccupiedLast3Years: 'no' } });
    const s1 = r.scenarios.find((s) => s.key === 'accelerated_rebuild')!;
    const ref = reference(1980, 0, 900, 0.03, 0.05);
    expect(r.hazards.maxOfferHaircutPct).toBe(0.05);
    expect(s1.maxOffer).toBe(ref.maxOffer);
    expect(s1.costs.total).toBe(ref.totalCosts);
  });

  it('adds $35k demolition on demo-rebuild', () => {
    const r = underwrite({ marketCode: 'ALTADENA_CA', lotSizeSf: 7500, existingStructureSf: 1800, zoningCode: 'R-1', arvPerSf: 900, projectType: 'demo_rebuild', targetHomeSf: 1980, site: { fireHazardZone: 'no' } });
    const s = r.scenarios.find((x) => x.key === 'single_home')!;
    expect(s.costs.demo).toBe(35000);
    expect(s.costs.total).toBe(reference(1980, 0, 900, 0, 0, true).totalCosts);
  });

  it('proForma profit equals ROI × total investment when buying at max offer', () => {
    const pf = proForma({ primaryLivingSf: 2000, aduSf: 0, units: 1, arvPerSf: 800, assumptions: ALTADENA_CA.assumptions, demolitionRequired: false, extraCosts: 0, buildCostBumpPct: 0, maxOfferHaircutPct: 0, arvHaircutPct: 0, lots: 1 });
    expect(pf.maxOffer).toBeGreaterThan(0);
    expect(pf.profit / pf.totalInvestment).toBeCloseTo(0.4, 3);
  });
});
