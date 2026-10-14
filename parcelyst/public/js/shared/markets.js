/*
 * Market configuration. Every number here is a REFERENCE DEFAULT used when a live
 * feed is not configured or a user has not overridden it. Each analysis shows which
 * values came from here vs. a live source, and every value is editable per deal.
 *
 * Adding a market = adding one object to MARKETS. Nothing else in the app is
 * market-specific.
 *
 * asOf: when these reference values were last reviewed. Re-verify tax rates each
 * fiscal year (Virginia localities adopt rates in spring for a July 1 FY start).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PMarkets = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // FMR multipliers relative to the 2BR Fair Market Rent (HUD's own bedroom ratios are close to these).
  var FMR_BR_FACTOR = { 0: 0.80, 1: 0.87, 2: 1.0, 3: 1.32, 4: 1.55, 5: 1.78, 6: 2.0 };

  var MARKETS = [
    {
      id: 'hampton-roads',
      name: 'Hampton Roads',
      state: 'VA',
      msa: 'Virginia Beach-Chesapeake-Norfolk, VA-NC',
      fredHpiSeries: 'ATNHPIUS47260Q',
      status: 'live',
      asOf: '2026-07',
      taxBasis: 'per100', // Virginia: rate per $100 of assessed value, assessed at 100% FMV
      residential: {
        appreciation1y: 0.040, appreciation5y: 0.065, vacancy: 0.050, insurancePct: 0.0050,
        fmr2br: 1640, rentGrowth: 0.030
      },
      commercial: {
        industrial: { cap: 0.065, rentPsf: 9.5, vacancy: 0.05 },
        multifamily: { cap: 0.0575, rentPsf: null, vacancy: 0.055 },
        retail: { cap: 0.070, rentPsf: 18, vacancy: 0.06 },
        office: { cap: 0.085, rentPsf: 22, vacancy: 0.12 },
        'self-storage': { cap: 0.060, rentPsf: 14, vacancy: 0.10 },
        'mixed-use': { cap: 0.0675, rentPsf: 20, vacancy: 0.07 }
      },
      land: { finishedLotSfd: 115000, finishedLotTh: 70000, devCostPerLot: 65000, impactFeePerLot: 5000 },
      localities: [
        { id: 'virginia-beach', name: 'Virginia Beach', taxRate: 0.97, zips: ['23451', '23452', '23453', '23454', '23455', '23456', '23462', '23464'], medianValue: 410000 },
        { id: 'norfolk', name: 'Norfolk', taxRate: 1.25, zips: ['23502', '23503', '23504', '23505', '23507', '23508', '23509', '23513', '23517', '23518'], medianValue: 315000 },
        { id: 'chesapeake', name: 'Chesapeake', taxRate: 0.98, zips: ['23320', '23321', '23322', '23323', '23324', '23325'], medianValue: 395000 },
        { id: 'portsmouth', name: 'Portsmouth', taxRate: 1.30, zips: ['23701', '23702', '23703', '23704', '23707'], medianValue: 255000 },
        { id: 'suffolk', name: 'Suffolk', taxRate: 1.04, zips: ['23432', '23434', '23435', '23436', '23437'], medianValue: 380000 },
        { id: 'hampton', name: 'Hampton', taxRate: 1.18, zips: ['23661', '23663', '23664', '23666', '23669'], medianValue: 265000 },
        { id: 'newport-news', name: 'Newport News', taxRate: 1.20, zips: ['23601', '23602', '23605', '23606', '23607', '23608'], medianValue: 275000 },
        { id: 'williamsburg', name: 'Williamsburg / James City', taxRate: 0.83, zips: ['23185', '23188'], medianValue: 450000 },
        { id: 'york', name: 'York County', taxRate: 0.76, zips: ['23690', '23692', '23693'], medianValue: 430000 }
      ]
    },
    {
      id: 'richmond',
      name: 'Richmond',
      state: 'VA',
      msa: 'Richmond, VA',
      fredHpiSeries: 'ATNHPIUS40060Q',
      status: 'live',
      asOf: '2026-07',
      taxBasis: 'per100',
      residential: {
        appreciation1y: 0.045, appreciation5y: 0.068, vacancy: 0.055, insurancePct: 0.0035,
        fmr2br: 1600, rentGrowth: 0.032
      },
      commercial: {
        industrial: { cap: 0.0625, rentPsf: 8.5, vacancy: 0.05 },
        multifamily: { cap: 0.056, rentPsf: null, vacancy: 0.06 },
        retail: { cap: 0.070, rentPsf: 17, vacancy: 0.05 },
        office: { cap: 0.0875, rentPsf: 21, vacancy: 0.13 },
        'self-storage': { cap: 0.060, rentPsf: 13, vacancy: 0.10 },
        'mixed-use': { cap: 0.0665, rentPsf: 19, vacancy: 0.07 }
      },
      land: { finishedLotSfd: 120000, finishedLotTh: 72000, devCostPerLot: 70000, impactFeePerLot: 6000 },
      localities: [
        { id: 'richmond-city', name: 'Richmond (City)', taxRate: 1.20, zips: ['23219', '23220', '23221', '23222', '23223', '23224', '23225', '23226', '23227'], medianValue: 360000 },
        { id: 'henrico', name: 'Henrico County', taxRate: 0.85, zips: ['23228', '23229', '23233', '23059', '23060', '23231', '23294'], medianValue: 375000 },
        { id: 'chesterfield', name: 'Chesterfield County', taxRate: 0.90, zips: ['23112', '23113', '23832', '23236', '23234', '23831', '23838'], medianValue: 380000 },
        { id: 'hanover', name: 'Hanover County', taxRate: 0.81, zips: ['23005', '23111', '23116', '23069'], medianValue: 430000 }
      ]
    },
    {
      id: 'austin',
      name: 'Austin',
      state: 'TX',
      msa: 'Austin-Round Rock-San Marcos, TX',
      fredHpiSeries: 'ATNHPIUS12420Q',
      status: 'beta',
      asOf: '2026-07',
      taxBasis: 'effective', // Texas: combined effective rate as % of market value, no homestead on investment property
      residential: {
        appreciation1y: -0.025, appreciation5y: 0.025, vacancy: 0.085, insurancePct: 0.0065,
        fmr2br: 1980, rentGrowth: 0.010
      },
      commercial: {
        industrial: { cap: 0.059, rentPsf: 13, vacancy: 0.09 },
        multifamily: { cap: 0.0525, rentPsf: null, vacancy: 0.10 },
        retail: { cap: 0.0625, rentPsf: 28, vacancy: 0.05 },
        office: { cap: 0.080, rentPsf: 40, vacancy: 0.24 },
        'self-storage': { cap: 0.0575, rentPsf: 16, vacancy: 0.12 },
        'mixed-use': { cap: 0.060, rentPsf: 30, vacancy: 0.08 }
      },
      land: { finishedLotSfd: 110000, finishedLotTh: 68000, devCostPerLot: 75000, impactFeePerLot: 8000 },
      localities: [
        { id: 'austin-city', name: 'Austin (Travis Co.)', taxRate: 0.0190, zips: ['78702', '78703', '78704', '78721', '78723', '78741', '78745', '78748', '78751', '78757'], medianValue: 520000 },
        { id: 'round-rock', name: 'Round Rock (Williamson Co.)', taxRate: 0.0200, zips: ['78664', '78665', '78681'], medianValue: 410000 },
        { id: 'pflugerville', name: 'Pflugerville', taxRate: 0.0220, zips: ['78660'], medianValue: 390000 },
        { id: 'georgetown', name: 'Georgetown', taxRate: 0.0190, zips: ['78626', '78628', '78633'], medianValue: 440000 },
        { id: 'kyle-buda', name: 'Kyle / Buda (Hays Co.)', taxRate: 0.0210, zips: ['78640', '78610'], medianValue: 345000 }
      ]
    },
    {
      id: 'jackson-county-mo',
      name: 'Jackson County, MO',
      state: 'MO',
      msa: 'Kansas City, MO-KS',
      fredHpiSeries: 'ATNHPIUS28140Q',
      status: 'beta',
      asOf: '2026-07',
      taxBasis: 'effective', // Missouri: residential assessed at 19% of market, commercial at 32%; shown as effective % of market value
      residential: {
        appreciation1y: 0.045, appreciation5y: 0.065, vacancy: 0.065, insurancePct: 0.0060,
        fmr2br: 1320, rentGrowth: 0.030
      },
      commercialTaxMultiplier: 1.68, // 32% / 19% assessment ratio
      commercial: {
        industrial: { cap: 0.065, rentPsf: 6.25, vacancy: 0.06 },
        multifamily: { cap: 0.060, rentPsf: null, vacancy: 0.07 },
        retail: { cap: 0.0725, rentPsf: 15, vacancy: 0.07 },
        office: { cap: 0.090, rentPsf: 21, vacancy: 0.17 },
        'self-storage': { cap: 0.0625, rentPsf: 12, vacancy: 0.10 },
        'mixed-use': { cap: 0.070, rentPsf: 17, vacancy: 0.08 }
      },
      land: { finishedLotSfd: 75000, finishedLotTh: 48000, devCostPerLot: 55000, impactFeePerLot: 4000 },
      localities: [
        { id: 'kansas-city', name: 'Kansas City', taxRate: 0.0145, zips: ['64105', '64108', '64109', '64110', '64111', '64113', '64114', '64124', '64131', '64134'], medianValue: 245000 },
        { id: 'independence', name: 'Independence', taxRate: 0.0140, zips: ['64050', '64052', '64055', '64056', '64057'], medianValue: 195000 },
        { id: 'lees-summit', name: "Lee's Summit", taxRate: 0.0135, zips: ['64063', '64064', '64081', '64082', '64086'], medianValue: 375000 },
        { id: 'blue-springs', name: 'Blue Springs', taxRate: 0.0135, zips: ['64014', '64015'], medianValue: 300000 },
        { id: 'grandview-raytown', name: 'Grandview / Raytown', taxRate: 0.0152, zips: ['64030', '64133', '64138'], medianValue: 185000 }
      ]
    }
  ];

  // National fallbacks used when a live rate feed is not configured.
  var RATES_FALLBACK = {
    asOf: '2026-09',
    mortgage30: 0.0625,   // Freddie Mac PMMS 30-yr fixed (FRED: MORTGAGE30US)
    treasury5y: 0.0375,   // 5-yr constant maturity (FRED: DGS5)
    treasury10y: 0.0415,  // FRED: DGS10
    savings: 0.0039,      // FDIC national rate, savings
    cd5y: 0.0134,         // FDIC national rate, 60-month CD
    cpiShelter: 0.035,    // BLS CPI shelter YoY
    commercialSpread: 0.0185 // typical commercial loan spread over 10y UST
  };

  function byId(id) {
    for (var i = 0; i < MARKETS.length; i++) if (MARKETS[i].id === id) return MARKETS[i];
    return null;
  }

  function findByZip(zip) {
    zip = String(zip || '').slice(0, 5);
    for (var i = 0; i < MARKETS.length; i++) {
      var m = MARKETS[i];
      for (var j = 0; j < m.localities.length; j++) {
        if (m.localities[j].zips.indexOf(zip) !== -1) return { market: m, locality: m.localities[j] };
      }
    }
    return null;
  }

  function findByCity(city, state) {
    city = String(city || '').toLowerCase().trim();
    state = String(state || '').toUpperCase().trim();
    if (!city) return null;
    for (var i = 0; i < MARKETS.length; i++) {
      var m = MARKETS[i];
      if (state && m.state !== state) continue;
      for (var j = 0; j < m.localities.length; j++) {
        var n = m.localities[j].name.toLowerCase();
        if (n.indexOf(city) !== -1 || city.indexOf(n.split(' (')[0]) !== -1) return { market: m, locality: m.localities[j] };
      }
    }
    return null;
  }

  // Annual property tax as a fraction of value for a locality.
  function effectiveTaxRate(market, locality, isCommercial) {
    if (!locality) return 0.011;
    var r = market.taxBasis === 'per100' ? locality.taxRate / 100 : locality.taxRate;
    if (isCommercial && market.commercialTaxMultiplier) r = r * market.commercialTaxMultiplier;
    return r;
  }

  function fmr(market, beds) {
    var b = Math.max(0, Math.min(6, Math.round(beds || 2)));
    return Math.round(market.residential.fmr2br * FMR_BR_FACTOR[b]);
  }

  return {
    MARKETS: MARKETS,
    RATES_FALLBACK: RATES_FALLBACK,
    byId: byId,
    findByZip: findByZip,
    findByCity: findByCity,
    effectiveTaxRate: effectiveTaxRate,
    fmr: fmr
  };
});
