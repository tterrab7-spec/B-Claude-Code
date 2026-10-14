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
})();
