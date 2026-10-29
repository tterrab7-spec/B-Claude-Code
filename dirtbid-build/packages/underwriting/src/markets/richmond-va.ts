import type { MarketConfig, OverlayContext, OverlayFlag, HazardScreen, ZoningRule } from '../types.js';
import { DIRTBID_REGIONS } from '../sitework.js';

/**
 * City of Richmond, Virginia. Zoning codes follow Chapter 30 of the City Code.
 * Residential-by-right in the business and urban-business districts is the
 * engine's main question on a corridor like Hull Street; the rules below are
 * screening-level readings of the ordinance and every run says so.
 */

const sb = (front: string, side: string, rear: string) => ({ front, side, rear });

export const richmondZoning: ZoningRule[] = [
  { code: 'R-1', aliases: ['R1'], label: 'Single-Family Residential, 20,000 sf', minLotSf: 20000, minLotAreaPerUnitSf: 20000, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '10 ft', '25 ft') },
  { code: 'R-2', aliases: ['R2'], label: 'Single-Family Residential, 12,000 sf', minLotSf: 12000, minLotAreaPerUnitSf: 12000, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '8 ft', '25 ft') },
  { code: 'R-3', aliases: ['R3'], label: 'Single-Family Residential, 9,000 sf', minLotSf: 9000, minLotAreaPerUnitSf: 9000, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '6 ft', '25 ft') },
  { code: 'R-4', aliases: ['R4'], label: 'Single-Family Residential, 7,500 sf', minLotSf: 7500, minLotAreaPerUnitSf: 7500, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '5 ft', '25 ft') },
  { code: 'R-5', aliases: ['R5', 'R-5A', 'R5A'], label: 'Single-Family Residential, 6,000 sf (R-5A 3,000 sf)', minLotSf: 6000, minLotAreaPerUnitSf: 6000, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '5 ft', '25 ft') },
  { code: 'R-6', aliases: ['R6'], label: 'Single-Family Attached Residential, 5,000 sf', minLotSf: 5000, minLotAreaPerUnitSf: 2500, maxBaseUnits: 2, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('15 ft', '5 ft', '20 ft') },
  { code: 'R-7', aliases: ['R7'], label: 'Single- and Two-Family Urban Residential', minLotSf: 3000, minLotAreaPerUnitSf: 1500, maxBaseUnits: 2, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('15 ft', '3 ft', '15 ft') },
  { code: 'R-8', aliases: ['R8'], label: 'Urban Residential (row houses)', minLotSf: 2200, minLotAreaPerUnitSf: 2200, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('10 ft', '0 ft', '15 ft'), notes: 'Row-house district; 22 ft minimum lot width.' },
  { code: 'R-43', aliases: ['R43'], label: 'Multifamily Residential, 43 du/ac', minLotSf: 6000, minLotAreaPerUnitSf: 1013, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft', setbacks: sb('15 ft', '10 ft', '20 ft') },
  { code: 'R-48', aliases: ['R48'], label: 'Multifamily Residential, 48 du/ac', minLotSf: 6000, minLotAreaPerUnitSf: 907, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft', setbacks: sb('15 ft', '10 ft', '20 ft') },
  { code: 'R-53', aliases: ['R53'], label: 'Multifamily Residential, 53 du/ac', minLotSf: 6000, minLotAreaPerUnitSf: 822, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft', setbacks: sb('15 ft', '10 ft', '20 ft') },
  { code: 'R-63', aliases: ['R63'], label: 'Multifamily Urban Residential', minLotSf: 1600, minLotAreaPerUnitSf: 800, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '3 stories', setbacks: sb('0–15 ft build-to', '0 ft', '15 ft'), maxFar: 1.0, notes: 'Form-based; corner-store commercial allowed.' },
  { code: 'R-73', aliases: ['R73'], label: 'Multifamily Residential, 73 du/ac', minLotSf: 6000, minLotAreaPerUnitSf: 597, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft + bonus', setbacks: sb('15 ft', '10 ft', '20 ft') },
  { code: 'RF-1', aliases: ['RF1', 'RF-2', 'RF2'], label: 'Riverfront', minLotSf: 1600, minLotAreaPerUnitSf: 600, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '5 stories (RF-1) / 10+ (RF-2)', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 2.0 },
  { code: 'B-1', aliases: ['B1'], label: 'Neighborhood Business', minLotSf: 1600, minLotAreaPerUnitSf: 1000, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 1.0, notes: 'Dwelling units permitted above ground-floor commercial; verify unit limits.' },
  { code: 'B-2', aliases: ['B2'], label: 'Community Business', minLotSf: 1600, minLotAreaPerUnitSf: 800, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 1.5, notes: 'Dwelling units permitted; ground-floor commercial on principal streets.' },
  { code: 'B-3', aliases: ['B3'], label: 'General Business', minLotSf: 1600, minLotAreaPerUnitSf: 800, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft (3 stories); taller by special use', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 1.5, notes: 'Multifamily and mixed-use permitted; verify ground-floor use and parking requirements on Hull Street.' },
  { code: 'B-4', aliases: ['B4', 'B-5', 'B5', 'B-6', 'B6'], label: 'Central Business', minLotSf: 1600, minLotAreaPerUnitSf: 400, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: 'No height limit in B-4; B-5/B-6 per plan', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 3.0 },
  { code: 'B-7', aliases: ['B7'], label: 'Mixed-Use Business', minLotSf: 1600, minLotAreaPerUnitSf: 600, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '5 stories', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 2.0 },
  { code: 'UB', aliases: ['UB-1', 'UB1', 'UB-2', 'UB2'], label: 'Urban Business', minLotSf: 1600, minLotAreaPerUnitSf: 800, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '3 stories (UB) / 4 stories (UB-2)', setbacks: sb('0–10 ft build-to', '0 ft', '0 ft'), maxFar: 1.5, notes: 'Form-based corridor district; ground-floor commercial on street frontage.' },
  { code: 'TOD-1', aliases: ['TOD1', 'TOD'], label: 'Transit-Oriented Nodal', minLotSf: 1600, minLotAreaPerUnitSf: 400, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '12 stories', setbacks: sb('0 ft', '0 ft', '0 ft'), maxFar: 3.0, notes: 'No parking minimums; no density maximum beyond massing.' },
  { code: 'M-1', aliases: ['M1', 'M-2', 'M2'], label: 'Light / Heavy Industrial', minLotSf: 5000, minLotAreaPerUnitSf: null, maxBaseUnits: 0, aduAllowed: 'no', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '45 ft', setbacks: sb('0 ft', '0 ft', '0 ft'), notes: 'Residential not permitted; rezoning required.' },
];

function corridor(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const code = ctx.rule?.code ?? '';
  if (/^B-|^UB|^TOD/.test(code)) {
    out.push({ id: 'RVA_MIXED_USE_GROUND_FLOOR', name: 'Business district: ground-floor use and parking', category: 'entitlement', status: 'yes', reason: `${code} permits dwelling units, but principal-street frontage generally needs a non-residential ground floor and parking is set per use.`, effect: 'Model ground-floor commercial or stoop-entry residential per Chapter 30; parking relief may need a special use permit.', treatment: 'constraint', permitTier: 'administrative_review', scoreAdjustment: -8, monthsAdded: 1, verifyItem: 'Confirm ground-floor use rule and parking schedule for this frontage with Planning & Development Review.' });
    out.push({ id: 'RVA_PLAN_OF_DEVELOPMENT', name: 'Plan of Development review', category: 'entitlement', status: ctx.lotSizeSf >= 10000 || ctx.input.projectType === 'subdivision' ? 'yes' : 'unknown', reason: 'Multifamily and larger infill in Richmond goes through Plan of Development (POD) review.', effect: 'Administrative review with public notice; 3–5 months.', treatment: 'note', permitTier: 'administrative_review', scoreAdjustment: 0, monthsAdded: 2 });
  }
  if (ctx.input.projectType === 'subdivision' && ctx.rule && ctx.rule.maxBaseUnits === 0) {
    out.push({ id: 'REZONING_REQUIRED', name: 'Rezoning required', category: 'entitlement', status: 'yes', reason: 'Residential not permitted in the current district.', effect: 'Legislative approval; 9–15 months.', treatment: 'blocker', permitTier: 'rezoning', scoreAdjustment: -40, monthsAdded: 10, costAdder: 40000 });
  }
  return out;
}

function environmental(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const s = ctx.site;
  const fz = (s.floodZone ?? '').toUpperCase();
  if (fz.startsWith('A')) out.push({ id: 'FEMA_A', name: 'FEMA special flood hazard area', category: 'hazard', status: 'yes', reason: `Zone ${fz}.`, effect: 'Richmond requires 2 ft freeboard; floodproofing for non-residential.', treatment: 'cost_adder', costAdder: 40000, arvHaircutPct: 0.03, scoreAdjustment: -12, monthsAdded: 1 });
  if (s.rpaBuffer === 'yes') out.push({ id: 'CBPA_RPA', name: 'Chesapeake Bay RPA buffer', category: 'environmental', status: 'yes', reason: '100 ft RPA buffer on the parcel.', effect: 'Buildable envelope reduced; WQIA likely.', treatment: 'constraint', costAdder: 12000, scoreAdjustment: -15, monthsAdded: 2 });
  if ((s.wetlandsAcres ?? 0) > 0) out.push({ id: 'WETLANDS', name: 'Wetlands', category: 'environmental', status: 'yes', reason: `${s.wetlandsAcres} ac on parcel.`, effect: 'Delineation and permitting.', treatment: 'constraint', costAdder: Math.round((s.wetlandsAcres ?? 0) * 60000), scoreAdjustment: -15, monthsAdded: 4 });
  if (s.historic === 'yes') out.push({ id: 'HISTORIC_DISTRICT', name: 'City Old & Historic District', category: 'entitlement', status: 'yes', reason: 'Commission of Architectural Review approval needed.', effect: 'Certificate of Appropriateness; design constraints.', treatment: 'constraint', scoreAdjustment: -10, monthsAdded: 2 });
  if (s.soils === 'poor') out.push({ id: 'POOR_SOILS', name: 'Poor soils', category: 'environmental', status: 'yes', reason: 'Poorly drained or fill soils reported.', effect: 'Geotech and undercut.', treatment: 'cost_adder', costAdder: 30000, scoreAdjustment: -8 });
  return out;
}

function utilitiesRva(ctx: OverlayContext): OverlayFlag[] {
  const u = ctx.utilities;
  const out: OverlayFlag[] = [];
  if (u.sewer === 'no') out.push({ id: 'NO_SEWER', name: 'No public sewer', category: 'utilities', status: 'yes', reason: 'Parcel not served.', effect: 'Extension required.', treatment: 'cost_adder', costAdder: 35000, scoreAdjustment: -12, monthsAdded: 2 });
  if (u.water === 'no') out.push({ id: 'NO_WATER', name: 'No public water', category: 'utilities', status: 'yes', reason: 'Parcel not served.', effect: 'Extension required.', treatment: 'cost_adder', costAdder: 20000, scoreAdjustment: -8, monthsAdded: 1 });
  return out;
}

function hazardScreen(ctx: OverlayContext): HazardScreen {
  const fz = (ctx.site.floodZone ?? '').toUpperCase();
  if (fz.startsWith('A')) return { result: 'likely_in_zone', label: 'Special flood hazard area', maxOfferHaircutPct: 0.04, buildCostBumpPct: 0.03, manualReviewRequired: true, note: 'Freeboard and flood insurance assumptions must be verified.' };
  if (fz.startsWith('X')) return { result: 'clear', label: 'Zone X', maxOfferHaircutPct: 0, buildCostBumpPct: 0, manualReviewRequired: false, note: 'No flood haircut applied.' };
  return { result: 'unknown_manual_review', label: 'Flood zone not confirmed', maxOfferHaircutPct: 0.02, buildCostBumpPct: 0.01, manualReviewRequired: true, note: 'A conservative 2% offer haircut is applied until the FIRM zone is confirmed.' };
}

export const RICHMOND_VA: MarketConfig = {
  code: 'RICHMOND_VA',
  name: 'Richmond, Virginia',
  state: 'VA',
  jurisdiction: 'City of Richmond',
  zipBands: {
    '23224': { area: 'Manchester / Hull Street corridor', label: 'Appreciating urban infill', arvMultiplier: 1 },
    '23220': { area: 'Fan / VCU', label: 'Premium urban', arvMultiplier: 1.25 },
    '23221': { area: 'Museum District / Carytown', label: 'Premium urban', arvMultiplier: 1.3 },
    '23223': { area: 'Church Hill / East End', label: 'Mixed', arvMultiplier: 1.05 },
    '23225': { area: 'Westover Hills / Forest Hill', label: 'Suburban-in-city', arvMultiplier: 1.1 },
    '23227': { area: 'Northside (Bellevue)', label: 'Mixed', arvMultiplier: 1.05 },
    '23230': { area: 'Scott\'s Addition', label: 'Premium new construction', arvMultiplier: 1.2 },
  },
  defaultArvPerSf: 300,
  assumptions: {
    hardCostPerSf: 165,
    aduHardCostPerSf: 200,
    softCostPct: 0.12,
    contingencyPct: 0.06,
    demoCost: 22000,
    sitePrepPerLot: 24000,
    utilityConnectionFeesPerUnit: 8500,
    impactFeesPerUnit: 0,
    commissionPct: 0.05,
    closingPct: 0.02,
    targetRoi: 0.20,
    annualFinancingRate: 0.09,
    financedPct: 0.75,
    buildMonths: 10,
    aduArvPremiumPerSf: 0,
    rebuildExpansionPct: 0.20,
    maxAduSf: 800,
    maxDensityFar: 1.0,
    defaultHomeSf: 1900,
    grossAreaFactor: 0.12,
    aduValuationMode: 'sf_at_arv',
  },
  zoning: richmondZoning,
  overlays: [corridor, environmental, utilitiesRva],
  hazardScreen,
  permitMonths: { ministerial_expedited: 1, ministerial: 2, administrative_review: 5, discretionary: 8, rezoning: 14 },
  approvalBaseRate: 84,
  modelSitework: true,
  calibrationNote: `Richmond infill basis: $165/sf hard (+12% gross), soft 12%, contingency 6%, 20% target ROI, 9% debt at 75% LTC, $300/sf default ARV (Manchester). DirtBid sitework region ${DIRTBID_REGIONS.VA_RIC!.name} ×${DIRTBID_REGIONS.VA_RIC!.multiplier}. Placeholders until fitted to closed Richmond comps.`,
};
