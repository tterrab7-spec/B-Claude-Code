import { describe, expect, it } from 'vitest';
import { lihtcProForma, RICHMOND_60AMI_2026 } from '../src/index.js';

describe('4% LIHTC pro forma', () => {
  // Swansboro Place, Richmond: 90 units (54/28/8), 4 stories, 64 spaces, land $995,000.
  const mix = { oneBr: 54, twoBr: 28, threeBr: 8 };
  it('sizes a 90-unit bond deal with a perm loan, credits and a gap', () => {
    const r = lihtcProForma(mix, 995000, 336000, { ...RICHMOND_60AMI_2026, parkingSpaces: 64 });
    expect(r.units).toBe(90);
    expect(r.grossBuildingSf).toBeGreaterThan(80000);
    expect(r.grossBuildingSf).toBeLessThan(95000);
    expect(r.noi).toBeGreaterThan(500000);
    expect(r.dscr).toBeCloseTo(1.15, 1);
    expect(r.lihtcEquity).toBeGreaterThan(r.permLoan * 0.8); // bond deals in a QCT lean on equity
    expect(r.sources.total).toBe(r.uses.total);
    expect(r.totalDevelopmentCostPerUnit).toBeGreaterThan(220000);
    expect(r.totalDevelopmentCostPerUnit).toBeLessThan(360000);
    expect(r.landSupportableAtZeroGap).toBeGreaterThanOrEqual(0);
  });
  it('removing the basis boost shrinks equity and widens the gap', () => {
    const boosted = lihtcProForma(mix, 995000, 336000, { ...RICHMOND_60AMI_2026, parkingSpaces: 64 });
    const flat = lihtcProForma(mix, 995000, 336000, { ...RICHMOND_60AMI_2026, parkingSpaces: 64, qctOrDda: false });
    expect(flat.lihtcEquity).toBeLessThan(boosted.lihtcEquity);
    expect(flat.sources.gap).toBeGreaterThan(boosted.sources.gap);
  });
});
