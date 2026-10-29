import type { MarketConfig, ZoningRule } from '../types.js';

const zoning: ZoningRule[] = [
  { code: 'R-1', aliases: ['R1', 'RS', 'SFR', 'SR'], label: 'Single-family residential', minLotSf: 6000, minLotAreaPerUnitSf: 6000, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'unknown', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: { front: '25 ft', side: '7.5 ft', rear: '20 ft' } },
  { code: 'R-2', aliases: ['R2', 'RD'], label: 'Two-family residential', minLotSf: 6000, minLotAreaPerUnitSf: 3000, maxBaseUnits: 2, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: { front: '25 ft', side: '7.5 ft', rear: '20 ft' } },
  { code: 'R-3', aliases: ['R3', 'RM', 'MF'], label: 'Multifamily residential', minLotSf: 8000, minLotAreaPerUnitSf: 2000, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '45 ft', setbacks: { front: '20 ft', side: '10 ft', rear: '20 ft' }, maxFar: 0.75 },
];

export const GENERIC_US: MarketConfig = {
  code: 'GENERIC_US',
  name: 'Generic US market (uncalibrated)',
  state: 'US',
  jurisdiction: 'Unknown locality',
  zipBands: {},
  defaultArvPerSf: 300,
  assumptions: {
    hardCostPerSf: 225, aduHardCostPerSf: 250, softCostPct: 0.12, contingencyPct: 0.07, demoCost: 25000, sitePrepPerLot: 30000,
    utilityConnectionFeesPerUnit: 12000, impactFeesPerUnit: 5000, commissionPct: 0.05, closingPct: 0.02, targetRoi: 0.25,
    annualFinancingRate: 0.09, financedPct: 0.75, buildMonths: 10, aduArvPremiumPerSf: 0, rebuildExpansionPct: 0.15, maxAduSf: 1000, maxDensityFar: 0.4, defaultHomeSf: 2200, grossAreaFactor: 0.15, aduValuationMode: 'sf_at_arv',
  },
  zoning,
  overlays: [],
  hazardScreen: () => ({ result: 'unknown_manual_review', label: 'No hazard screen configured', maxOfferHaircutPct: 0.03, buildCostBumpPct: 0.02, manualReviewRequired: true, note: 'Generic market: 3% offer haircut applied until a local hazard screen is configured.' }),
  permitMonths: { ministerial_expedited: 2, ministerial: 3, administrative_review: 5, discretionary: 9, rezoning: 15 },
  approvalBaseRate: 75,
  modelSitework: true,
  calibrationNote: 'Uncalibrated national defaults. Add a market config before using for pricing.',
};
