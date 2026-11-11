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

const V = require('../public/js/shared/valuation.js');

test('valuation: identical comps return the comp price; superior comp is adjusted down', () => {
  const base = { kind: 'valuation', zip: '23320', assignment: { effectiveDate: '2026-11-01' }, subject: { type: 'residential', sf: 2000, yearBuilt: 2000, beds: 4, baths: 2, condition: 3, quality: 3 }, cost: { enabled: false }, income: { enabled: false },
    sales: { rates: { timePctPerYear: 0 }, comps: [1, 2, 3].map(() => ({ salePrice: 400000, saleDate: '2026-10-01', sf: 2000, yearBuilt: 2000, beds: 4, baths: 2, condition: 3 })) } };
  const r = E.analyze(base);
  assert.strictEqual(r.reconciliation.final, 400000);
  base.sales.comps[0].sf = 2200; base.sales.rates.glaPerSf = 80;
  const r2 = V.analyze(base);
  assert.strictEqual(Math.round(r2.sales.comps[0].adjusted), 400000 - 200 * 80);
});

test('valuation: market-conditions adjustment compounds from sale date to effective date', () => {
  const r = V.analyze({ kind: 'valuation', assignment: { effectiveDate: '2026-11-01' }, subject: { type: 'residential', sf: 1800 }, cost: { enabled: false }, income: { enabled: false },
    sales: { rates: { timePctPerYear: 0.05 }, comps: [{ salePrice: 300000, saleDate: '2025-11-01', sf: 1800 }] } });
  assert.ok(Math.abs(r.sales.comps[0].adjusted - 315000) < 60);
});

test('valuation: tax-loaded cap rate removes the dependence on the current tax bill', () => {
  const mk = (taxes) => V.analyze({ kind: 'valuation', zip: '23228', assignment: { purpose: 'assessment', effectiveDate: '2026-11-01' }, subject: { type: 'commercial', assetClass: 'office', sf: 20000, yearBuilt: 2000 }, assessment: { total: 3000000, taxRate: 0.01 }, cost: { enabled: false }, sales: { comps: [] },
    income: { capRate: 0.08, loadedCap: true, marketRentPsf: 20, vacancyPct: 0.1, creditLossPct: 0, mgmtPct: 0, reservesPsf: 0, deductLeaseUp: false, rentRoll: [{ label: 'A', sf: 20000, rentPsfYr: 20, leaseType: 'GROSS' }], expenses: { taxes, insurance: 10000, cam: 60000, utilities: 0, repairs: 0, payroll: 0, other: 0 } } });
  const a = mk(30000), b = mk(60000);
  assert.ok(Math.abs(a.income.value - b.income.value) < 1, 'value must not move with the entered tax expense');
  assert.ok(Math.abs(a.income.loaded.loadedCap - 0.09) < 1e-9);
  assert.ok(Math.abs(a.income.value - (400000 * 0.9 - 70000) / 0.09) < 1);
});

test('valuation: cost approach and assessment test', () => {
  const r = V.analyze({ kind: 'valuation', assignment: { effectiveDate: '2026-11-01' }, subject: { type: 'residential', sf: 2000, yearBuilt: 2006 }, assessment: { total: 500000, taxRate: 0.01 }, income: { enabled: false }, sales: { comps: [] },
    cost: { landValue: 100000, baseCostPsf: 150, localMultiplier: 1, siteImprovements: 0, softPct: 0, incentivePct: 0, economicLife: 50, effectiveAge: 10 } });
  assert.strictEqual(Math.round(r.cost.value), 100000 + 300000 * 0.8);
  assert.strictEqual(r.reconciliation.final, 340000);
  assert.ok(Math.abs(r.assessment.variance - 160000) < 1 && Math.abs(r.assessment.annualSavings - 1600) < 1);
  assert.notStrictEqual(r.assessment.recommendation.label, 'Appeal supported', 'low confidence must not produce a supported appeal');
});

test('valuation: band of investment and uniformity ratio', () => {
  global.window = {}; require('../public/js/samples.js');
  const r = V.analyze(global.window.PSamples.valuationCommercial.inputs);
  const band = r.income.capSupport.rows.find((x) => x.key === 'band');
  const mc = E.pmt(r.assumptions.income.loanRate, 25, 1) * 12;
  assert.ok(Math.abs(band.rate - (0.65 * mc + 0.35 * 0.09)) < 1e-9);
  assert.ok(r.equity && r.equity.count === 4 && r.equity.subjectRatio > r.equity.medianRatio);
  assert.strictEqual(r.assessment.recommendation.label, 'Appeal supported');
});
