import { describe, expect, it } from 'vitest';
import { toInput } from '@/pages/Calculator';

describe('calculator form → engine input', () => {
  it('converts acres and percent assumptions', () => {
    const input = toInput({
      marketCode: 'HAMPTON_ROADS_VA', address: '1 Main St', zip: '23666', lotSize: '0.5', lotUnit: 'acres', existingSf: '', zoningCode: 'R-10', arvPerSf: '290', targetHomeSf: '', projectType: 'vacant_land',
      comps: [{ price: '500,000', sf: '2,000' }, { price: '', sf: '' }, { price: '', sf: '' }],
      site: { floodZone: 'AE', wetlandsAcres: '0.2', rpaBuffer: 'yes', fireHazardZone: 'unknown', water: 'yes', sewer: 'no', power: 'yes', soils: 'marginal', hillside: false, stateRouteFrontage: 'unknown', historic: 'unknown', tenantOccupied: 'unknown', cornerLot: true },
      assumptions: { softCostPct: '12', hardCostPerSf: '150' },
      siteworkInput: { regionMultiplier: 1.04 }, dirtbidLandScreeningTotal: '86,500',
    });
    expect(input.lotSizeSf).toBe(21780);
    expect(input.comps).toEqual([{ salePrice: 500000, livingSf: 2000 }]);
    expect(input.site?.floodZone).toBe('AE');
    expect(input.site?.wetlandsAcres).toBe(0.2);
    expect(input.site?.utilities?.sewer).toBe('no');
    expect(input.assumptions?.softCostPct).toBeCloseTo(0.12);
    expect(input.assumptions?.hardCostPerSf).toBe(150);
    expect(input.sitework?.dirtbidLandScreeningTotal).toBe(86500);
    expect(input.sitework?.regionMultiplier).toBe(1.04);
  });
});

import { applyParcel } from '@/pages/Calculator';
import fixture from '../scripts/fixtures/parcel.json';
import type { ResolvedParcel } from '@dirtbid/parcel-data';

describe('applyParcel', () => {
  it('prefills the form and marks unresolved fields as needing input', () => {
    const base = { marketCode: 'GENERIC_US', address: '', zip: '', lotSize: '', lotUnit: 'acres' as const, existingSf: '', zoningCode: '', arvPerSf: '', targetHomeSf: '', projectType: 'demo_rebuild' as const, comps: [], site: { floodZone: '', wetlandsAcres: '', rpaBuffer: 'unknown' as const, fireHazardZone: 'unknown' as const, water: 'unknown' as const, sewer: 'unknown' as const, power: 'unknown' as const, soils: 'unknown' as const, hillside: false, stateRouteFrontage: 'unknown' as const, historic: 'unknown' as const, tenantOccupied: 'unknown' as const, cornerLot: false }, assumptions: {}, siteworkInput: {}, dirtbidLandScreeningTotal: '' };
    const { form, prov } = applyParcel(base, fixture as unknown as ResolvedParcel);
    expect(form.marketCode).toBe('HAMPTON_ROADS_VA'); expect(form.lotSize).toBe('30928'); expect(form.lotUnit).toBe('sf'); expect(form.site.floodZone).toBe('AE'); expect(form.site.rpaBuffer).toBe('yes'); expect(form.site.soils).toBe('marginal');
    expect(prov.lotSize?.p?.source).toBe('vgin_parcels'); expect(prov.zoning?.needsInput).toBe(true); expect(prov.utilities?.needsInput).toBe(true);
    expect(form.siteworkInput.regionMultiplier).toBe(1.04);
  });
});
