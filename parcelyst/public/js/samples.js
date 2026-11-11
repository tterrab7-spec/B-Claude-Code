/* Sample deals used on the homepage, sample report and analyzer. Illustrative figures, not live listings. */
(function () {
  'use strict';
  window.PSamples = {
    residential: {
      kind: 'residential',
      record: { address: '4417 Bayberry Ln', city: 'Chesapeake', state: 'VA', zip: '23321', assetType: 'SFR', beds: 4, baths: 2.5, sqft: 2140, yearBuilt: 1994, lotAcres: 0.24, market: 'hampton-roads', locality: 'chesapeake', localityName: 'Chesapeake', source: 'sample' },
      inputs: {
        kind: 'residential', address: '4417 Bayberry Ln', city: 'Chesapeake', state: 'VA', zip: '23321', marketId: 'hampton-roads', localityId: 'chesapeake',
        propertyType: 'SFR', units: 1, beds: 4, baths: 2.5, sqft: 2140, yearBuilt: 1994, price: 349000, estValue: 362000, rehab: 8000,
        rentMonthly: 2650, taxAnnual: 3420, insuranceAnnual: 1745, hoaMonthly: 0, vacancyPct: 0.05, maintenancePct: 0.06, capexPct: 0.05, mgmtPct: 0.08,
        downPct: 0.25, rate: 0.0625, termYears: 30, closingPct: 0.03, appreciation: 0.04, appreciation5y: 0.065, rentGrowth: 0.03, expenseGrowth: 0.03, holdYears: 7, sellingPct: 0.06,
        marginalTaxRate: 0.24, landPct: 0.22,
        sources: { price: 'Sample deal', rentMonthly: 'HUD FMR Virginia Beach-Norfolk MSA (4BR), adjusted to comps', taxAnnual: 'Chesapeake $0.98/$100 x assessed value', insuranceAnnual: 'Hampton Roads reference: 0.50% of value', vacancyPct: 'Hampton Roads reference: rental vacancy', appreciation: 'Hampton Roads reference: FHFA HPI 1-yr', rate: 'Freddie Mac PMMS reference' }
      }
    },
    commercial: {
      kind: 'commercial',
      record: { address: '2900 Deepwater Terminal Rd', city: 'Richmond', state: 'VA', zip: '23234', assetType: 'Industrial', buildingSf: 64000, yearBuilt: 1998, lotAcres: 5.2, market: 'richmond', locality: 'chesterfield', localityName: 'Chesterfield County', source: 'sample' },
      inputs: {
        kind: 'commercial', assetClass: 'industrial', address: '2900 Deepwater Terminal Rd', city: 'Richmond', state: 'VA', zip: '23234', marketId: 'richmond', localityId: 'chesterfield',
        price: 5400000, buildingSf: 64000, yearBuilt: 1998, marketRentPsf: 8.5, marketCap: 0.0625, exitCap: 0.065, vacancyPct: 0.03, creditLossPct: 0.01,
        rentRoll: [
          { label: 'Atlantic Freight (anchor)', sf: 38000, rentPsfYr: 7.85, leaseType: 'NNN', leaseEndYears: 5.5, escalation: 0.03 },
          { label: 'James River Supply', sf: 16000, rentPsfYr: 8.40, leaseType: 'NNN', leaseEndYears: 1.75, escalation: 0.025 },
          { label: 'Suite C (vacant)', sf: 10000, rentPsfYr: 0, leaseType: 'NNN', vacant: true }
        ],
        expenses: { taxes: 48600, insurance: 21500, cam: 38400, utilities: 0, repairs: 14000, payroll: 0, other: 6000 }, mgmtPct: 0.03, reservesPsf: 0.15,
        ltv: 0.65, rate: 0.0625, amortYears: 25, ioYears: 1, minDscr: 1.25, holdYears: 7, sellingPct: 0.02, rentGrowth: 0.03, expenseGrowth: 0.03, marginalTaxRate: 0.37,
        sources: { price: 'Sample deal', marketRentPsf: 'Richmond reference: industrial NNN market rent', marketCap: 'Richmond reference: industrial cap rate', rentRoll: 'Sample rent roll', rate: '10-yr Treasury + 2.10% spread' }
      }
    },
    land: {
      kind: 'land',
      record: { address: 'Parcel off Benefit Rd', city: 'Chesapeake', state: 'VA', zip: '23322', assetType: 'Land', lotAcres: 48, zoning: 'A-1 (rezoning to R-15s)', market: 'hampton-roads', locality: 'chesapeake', localityName: 'Chesapeake', source: 'sample' },
      inputs: {
        kind: 'land', address: 'Parcel off Benefit Rd', city: 'Chesapeake', state: 'VA', zip: '23322', marketId: 'hampton-roads', localityId: 'chesapeake',
        price: 1050000, acres: 48, zoning: 'A-1 (rezoning to R-15s)', product: 'sfd', netDevelopablePct: 0.68, density: 2.8,
        finishedLotValue: 118000, devCostPerLot: 68000, impactFeePerLot: 6500, softCostPct: 0.10, contingencyPct: 0.05, entitlementCost: 175000,
        entitlementMonths: 14, devMonths: 12, takedownPerYear: 36, lotEscalation: 0.03, costEscalation: 0.04, marginPct: 0.18, discountRate: 0.18, carryTaxRate: 0.0098,
        sources: { finishedLotValue: 'Sample: builder takedown comps, Chesapeake', devCostPerLot: 'Sample: civil engineer budget', impactFeePerLot: 'Sample: proffer estimate', carryTaxRate: 'Chesapeake $0.98/$100' }
      }
    }
  };

  // Desktop valuation samples. Fictional subjects and comparables for illustration only.
  window.PSamples.valuationResidential = {
    kind: 'valuation',
    inputs: {
      kind: 'valuation', address: '2208 Sparrow Rd', city: 'Chesapeake', state: 'VA', zip: '23320', marketId: 'hampton-roads', localityId: 'chesapeake',
      assignment: { client: 'Sample homeowner', purpose: 'assessment', effectiveDate: '2026-11-01', interest: 'Fee simple', preparedBy: '', firm: 'Sterling Tax Management', fileNo: 'SAMPLE-R1' },
      subject: { type: 'residential', propertyType: 'SFR', sf: 2180, lotAcres: 0.26, yearBuilt: 1996, beds: 4, baths: 2.5, garage: 2, condition: 3, quality: 3, parcelId: 'Sample' },
      assessment: { total: 438600, land: 135000, improvements: 303600, taxYear: '2026', feePct: 0.30 },
      sales: { comps: [
        { address: '2311 Wren Ct', saleDate: '2026-08-14', salePrice: 392000, sf: 2090, lotAcres: 0.24, yearBuilt: 1994, beds: 4, baths: 2.5, garage: 2, condition: 3, quality: 3, distanceMi: 0.3, assessed: 371400, source: 'Sample' },
        { address: '1904 Heron Way', saleDate: '2026-06-02', salePrice: 409500, sf: 2310, lotAcres: 0.28, yearBuilt: 1998, beds: 4, baths: 2.5, garage: 2, condition: 4, quality: 3, distanceMi: 0.5, assessed: 386000, source: 'Sample' },
        { address: '2450 Sparrow Rd', saleDate: '2026-03-21', salePrice: 379000, sf: 2040, lotAcres: 0.25, yearBuilt: 1995, beds: 4, baths: 2, garage: 2, condition: 3, quality: 3, distanceMi: 0.2, assessed: 362800, source: 'Sample' },
        { address: '817 Kestrel Ln', saleDate: '2026-09-30', salePrice: 401000, sf: 2240, lotAcres: 0.23, yearBuilt: 1997, beds: 4, baths: 2.5, garage: 2, condition: 3, quality: 3, distanceMi: 0.7, assessed: 380200, source: 'Sample' },
        { address: '3022 Osprey Dr', saleDate: '2025-12-10', salePrice: 368500, sf: 1980, lotAcres: 0.22, yearBuilt: 1993, beds: 3, baths: 2.5, garage: 1, condition: 3, quality: 3, distanceMi: 0.9, assessed: 349900, source: 'Sample' }
      ] },
      income: { enabled: false }, cost: { landValue: 135000 }
    }
  };
  window.PSamples.valuationCommercial = {
    kind: 'valuation',
    inputs: {
      kind: 'valuation', address: '8400 Sanford Dr', city: 'Henrico', state: 'VA', zip: '23228', marketId: 'richmond', localityId: 'henrico',
      assignment: { client: 'Sample owner LLC', purpose: 'assessment', effectiveDate: '2026-11-01', interest: 'Fee simple', preparedBy: '', firm: 'Sterling Tax Management', fileNo: 'SAMPLE-C1' },
      subject: { type: 'commercial', assetClass: 'industrial', sf: 42000, lotAcres: 3.8, yearBuilt: 2001, condition: 3, quality: 3, occupancyPct: 0.857, zoning: 'M-1', parcelId: 'Sample' },
      assessment: { total: 5650000, land: 1050000, improvements: 4600000, taxYear: '2026', feePct: 0.30 },
      sales: { comps: [
        { address: '2700 Distribution Dr, Henrico', saleDate: '2026-05-18', salePrice: 5150000, sf: 46500, yearBuilt: 2003, condition: 3, quality: 3, occupancyPct: 1.0, distanceMi: 2.1, capRate: 0.0665, assessed: 4780000, source: 'Sample' },
        { address: '1120 Dabney Rd, Richmond', saleDate: '2025-11-06', salePrice: 3480000, sf: 31200, yearBuilt: 1996, condition: 3, quality: 3, occupancyPct: 0.92, distanceMi: 3.4, capRate: 0.0705, assessed: 3310000, source: 'Sample' },
        { address: '5601 Lewis Rd, Sandston', saleDate: '2026-02-27', salePrice: 6900000, sf: 58000, yearBuilt: 2008, condition: 4, quality: 3, occupancyPct: 1.0, distanceMi: 8.6, capRate: 0.0640, assessed: 6420000, source: 'Sample' },
        { address: '9950 Maryland Dr, Henrico', saleDate: '2026-08-08', salePrice: 4275000, sf: 38400, yearBuilt: 1999, condition: 3, quality: 3, occupancyPct: 0.88, distanceMi: 1.6, capRate: 0.0690, assessed: 4050000, source: 'Sample' }
      ] },
      income: { enabled: true, rentBasis: 'market', marketRentPsf: 9.25, vacancyPct: 0.05, creditLossPct: 0.01, capRate: 0.0675,
        rentRoll: [
          { label: 'Tenant A (distribution)', sf: 21000, rentPsfYr: 8.90, leaseType: 'NNN', leaseEndYears: 4.5, escalation: 0.03 },
          { label: 'Tenant B (contractor supply)', sf: 15000, rentPsfYr: 9.40, leaseType: 'NNN', leaseEndYears: 2.0, escalation: 0.03 },
          { label: 'Suite C', sf: 6000, rentPsfYr: 0, leaseType: 'NNN', vacant: true }
        ],
        expenses: { taxes: 48025, insurance: 13000, cam: 40000, utilities: 0, repairs: 14000, payroll: 0, other: 0 }, mgmtPct: 0.03, reservesPsf: 0.20 },
      cost: { landValue: 1050000 }
    }
  };
})();
