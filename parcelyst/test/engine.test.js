'use strict';
const test = require('node:test');
const assert = require('node:assert');
const E = require('../public/js/shared/engine.js');

test('residential matches the reference 25-page sample report (Rochester, NY)', () => {
  const r = E.analyzeResidential({ price: 391000, rentMonthly: 2747, beds: 5, baths: 4, sqft: 2186, taxAnnual: 12903, insuranceAnnual: 1693,
    maintenancePct: 3910 / 32964, capexPct: 0, mgmtPct: 0, vacancyPct: 0.062, downPct: 0.2, rate: 0.065, closingPct: 0.03,
    appreciation: 0.0574, rentGrowth: 0.02, expenseGrowth: 0.02, holdYears: 5 });
  assert.strictEqual(Math.round(r.year1.noi), 12414);
  assert.strictEqual(Math.round(r.metrics.cfMonthly), -943);
  assert.strictEqual(Math.round(r.projection.profit), 49081);
  assert.ok(Math.abs(r.projection.irr - 0.0763) < 0.0005);
  assert.ok(Math.abs(r.projection.equityMultiple - 1.55) < 0.005);
  assert.strictEqual(r.verdict.label, 'Pass');
});

test('break-even price zeroes cash flow', () => {
  const inp = { price: 300000, rentMonthly: 2400, taxAnnual: 3000, insuranceAnnual: 1200 };
  const r = E.analyzeResidential(inp);
  const at = E.analyzeResidential(Object.assign({}, inp, { price: r.breakEvenPrice }));
  assert.ok(Math.abs(at.metrics.cfMonthly) < 1);
});

test('flip MAO earns exactly the target ROI', () => {
  const r = E.analyzeResidential({ price: 250000, rentMonthly: 1900, sqft: 1500, flipTargetRoi: 0.15 });
  r.flip.forEach((t) => assert.ok(Math.abs(t.roiAtMao - 0.15) < 1e-6));
});

test('IRR and payment math', () => {
  assert.ok(Math.abs(E.irr([-100, 10, 10, 110]) - 0.10) < 1e-9);
  assert.ok(Math.abs(E.pmt(0.06, 30, 300000) - 1798.65) < 0.01);
  assert.strictEqual(E.irr([100, 10]), null);
});

test('commercial loan is the lesser of LTV and DSCR sizing', () => {
  const c = E.analyzeCommercial({ assetClass: 'industrial', price: 4000000, buildingSf: 50000, marketCap: 0.065,
    rentRoll: [{ label: 'A', sf: 50000, rentPsfYr: 5, leaseType: 'NNN', leaseEndYears: 5 }], expenses: { taxes: 40000, insurance: 15000, cam: 20000 }, ltv: 0.75 });
  assert.ok(c.run.loan.loan <= c.run.loan.byLtv + 1 && c.run.loan.loan <= c.run.loan.byDscr + 1);
  assert.strictEqual(c.run.loan.constrainedBy, 'DSCR');
  assert.ok(Math.abs(c.metrics.dscr - 1.25) < 0.01);
});

test('lease rollover dips NOI in the expiry year', () => {
  const c = E.analyzeCommercial({ assetClass: 'industrial', price: 3000000, buildingSf: 40000, marketRentPsf: 8, renewProb: 0, downtimeMonths: 12,
    rentRoll: [{ label: 'A', sf: 40000, rentPsfYr: 8, leaseType: 'NNN', leaseEndYears: 3, escalation: 0 }], rentGrowth: 0, expenseGrowth: 0 });
  const noi = c.run.rows.map((r) => r.noi);
  assert.ok(noi[3] < noi[2] * 0.5, 'year 4 should carry the downtime');
});

test('land residual: asking at the static residual leaves exactly the required margin', () => {
  const base = { acres: 50, density: 3, netDevelopablePct: 0.7, finishedLotValue: 100000, devCostPerLot: 60000, impactFeePerLot: 5000, marginPct: 0.18, carryTaxRate: 0 , price: 1 };
  const r1 = E.analyzeLand(base);
  const r2 = E.analyzeLand(Object.assign({}, base, { price: r1.metrics.staticResidual }));
  assert.strictEqual(r1.metrics.lots, 105);
  assert.ok(Math.abs(r2.metrics.margin - 0.18) < 0.002);
});
