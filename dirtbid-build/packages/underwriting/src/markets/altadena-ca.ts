import type { MarketConfig, OverlayContext, OverlayFlag, HazardScreen, ZoningRule } from '../types.js';

/**
 * Altadena / West San Gabriel Valley, unincorporated LA County.
 * Faithful port of the public offer-calculator rule set, with the same cost
 * constants, extended with environmental and utility flags the original lacked.
 */

const SRC_SB9 = 'https://planning.lacounty.gov/planning-permits/sb-9/';
const SRC_ADU = 'https://planning.lacounty.gov/wp-content/uploads/2025/08/ADU-OrdinanceAmendment-Certified-Ordinance.pdf';
const SRC_LFL = 'https://recovery.lacounty.gov/rebuilding/like-for-like-rebuild/';

const r1Setbacks = { front: '20 ft', side: '5 ft interior / corner side', rear: '15 ft' };

export const altadenaZoning: ZoningRule[] = [
  { code: 'R-1', aliases: ['R1'], label: 'Single-Family Residence (Altadena CSD)', minLotSf: 5000, minLotAreaPerUnitSf: null, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'unknown', multifamilyAllowed: 'no', heightRule: '30 ft if net lot area under 20,000 sf; 35 ft at or above 20,000 sf', setbacks: r1Setbacks, notes: '1 principal dwelling per legal lot before ADU/JADU or SB 9 review.' },
  { code: 'R-1-7500', aliases: ['R17500'], label: 'Single-Family, 7,500 sf min lot', minLotSf: 7500, minLotAreaPerUnitSf: null, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'unknown', multifamilyAllowed: 'no', heightRule: '30 ft under 20,000 sf net; 35 ft at or above', setbacks: r1Setbacks },
  { code: 'R-1-10000', aliases: ['R110000'], label: 'Single-Family, 10,000 sf min lot', minLotSf: 10000, minLotAreaPerUnitSf: null, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'unknown', multifamilyAllowed: 'no', heightRule: '30 ft under 20,000 sf net; 35 ft at or above', setbacks: r1Setbacks },
  { code: 'R-1-20000', aliases: ['R120000'], label: 'Single-Family, 20,000 sf min lot', minLotSf: 20000, minLotAreaPerUnitSf: null, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'unknown', multifamilyAllowed: 'no', heightRule: '35 ft at or above 20,000 sf net lot area', setbacks: r1Setbacks, notes: 'Slope, oak and ridgeline constraints often matter on large lots.' },
  { code: 'R-A', aliases: ['RA'], label: 'Residential Agricultural', minLotSf: 5000, minLotAreaPerUnitSf: null, maxBaseUnits: 1, aduAllowed: 'yes', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '30 ft under 20,000 sf net; 35 ft at or above', setbacks: r1Setbacks },
  { code: 'R-2', aliases: ['R2'], label: 'Two-Family Residence', minLotSf: 5000, minLotAreaPerUnitSf: 2500, maxBaseUnits: 2, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'no', heightRule: '30 ft if lot is 20,000 sf or less', setbacks: { front: '20 ft', side: '5 ft', rear: '15 ft' }, notes: 'Up to 2 principal units subject to lot area per unit and parking.' },
  { code: 'R-3', aliases: ['R3'], label: 'Limited Multiple Residence', minLotSf: 5000, minLotAreaPerUnitSf: 1452, maxBaseUnits: null, aduAllowed: 'yes', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '35 ft base; extra side/rear setbacks above 25 ft when adjoining R-1/R-2', setbacks: { front: '15 ft', side: '5 ft', rear: '15 ft' }, notes: 'Density screen = lot area / 1,452 sf per unit, subject to General Plan and Title 22.' },
];

const isR1Family = (code: string) => /^R-?1/.test(code) || code === 'R-A';

function sb9(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  if (!ctx.rule || !isR1Family(ctx.rule.code)) return out;
  const s = ctx.site;
  if (s.historic === 'yes') {
    out.push({ id: 'SB9_TWO_UNITS', name: 'SB 9 two primary units', category: 'state_density', status: 'no', reason: 'Historic property: SB 9 is disqualified.', effect: '', treatment: 'note', scoreAdjustment: 0, sourceUrl: SRC_SB9 });
    return out;
  }
  if (s.tenantOccupiedLast3Years === 'yes') {
    out.push({ id: 'SB9_TWO_UNITS', name: 'SB 9 two primary units', category: 'state_density', status: 'no', reason: 'Tenant-occupied within the last 3 years: blocked by anti-displacement rules.', effect: '', treatment: 'note', scoreAdjustment: 0, sourceUrl: SRC_SB9 });
    return out;
  }
  const clear = s.historic === 'no' && s.tenantOccupiedLast3Years === 'no';
  out.push({
    id: 'SB9_TWO_UNITS', name: 'SB 9 two primary units on a single-family lot', category: 'state_density',
    status: clear ? 'yes' : 'unknown',
    reason: clear ? 'Historic and tenancy screens clear; SB 9 two-unit path available ministerially.' : 'SB 9 may apply. Historic, tenancy and environmental eligibility not yet confirmed: do not price as a guaranteed path.',
    effect: 'Up to two primary units if all eligibility criteria are confirmed.',
    treatment: 'upside_only', permitTier: 'ministerial', scoreAdjustment: clear ? 40 : -20, sourceUrl: SRC_SB9,
    verifyItem: 'Confirm SB 9 eligibility: historic status, tenancy history, environmental exclusions.',
  });
  if (ctx.lotSizeSf >= 2400) {
    out.push({
      id: 'SB9_LOT_SPLIT', name: 'SB 9 urban lot split', category: 'state_density',
      status: clear ? 'yes' : 'unknown',
      reason: clear ? 'Lot ≥ 2,400 sf; each child parcel ≥ 1,200 sf at a 40/60 split or better.' : 'Lot split may be possible; ratio and minimum-lot data incomplete.',
      effect: 'Ministerial two-lot split; up to 2 units per parcel (4 total).',
      treatment: 'upside_only', permitTier: 'ministerial', scoreAdjustment: clear ? 78 : 0, sourceUrl: SRC_SB9,
      verifyItem: 'Verify split geometry and owner-occupancy affidavit requirement.',
    });
  }
  return out;
}

function adu(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  if (!ctx.rule || ctx.rule.aduAllowed === 'no') return out;
  const units = ctx.site.priorLegalUnits ?? (ctx.existingSf > 0 ? 1 : 0);
  if (ctx.rule.multifamilyAllowed === 'yes' && units >= 2) {
    const interior = Math.floor(units * 0.25);
    const detached = Math.min(8, units);
    out.push({ id: 'ADU_MF_COUNTS', name: 'Multifamily ADU path', category: 'accessory_units', status: 'yes', reason: `Up to ${interior} interior/attached (25% of ${units} units) + up to ${detached} detached (SB 1211 cap 8).`, effect: 'Secondary value path on existing multifamily.', treatment: 'as_of_right', permitTier: 'ministerial', scoreAdjustment: 68, sourceUrl: SRC_ADU });
  } else {
    out.push({ id: 'ADU_SF_COUNTS', name: 'Single-family ADU / JADU', category: 'accessory_units', status: 'yes', reason: 'LA County allows one JADU, one attached ADU and one detached ADU on a single-family property.', effect: 'Ministerial ADU up to 1,100 sf modeled; ~60-day approvals.', treatment: 'as_of_right', permitTier: 'ministerial', scoreAdjustment: 72, sourceUrl: SRC_ADU });
  }
  if (ctx.site.fireHazardZone === 'yes') {
    out.push({ id: 'ADU_VHFHSZ_PARKING', name: 'ADU parking check in VHFHSZ', category: 'accessory_units', status: 'yes', reason: 'In a Very High Fire Hazard Severity Zone an ADU needs a replacement parking space unless exempt.', effect: 'Layout constraint only.', treatment: 'constraint', permitTier: 'ministerial', scoreAdjustment: 0, sourceUrl: SRC_ADU, verifyItem: 'Confirm parking exemption or fit one space on the site plan.' });
  } else if (ctx.site.fireHazardZone === 'unknown' || ctx.site.fireHazardZone === undefined) {
    out.push({ id: 'ADU_VHFHSZ_PARKING', name: 'ADU parking check: verify VHFHSZ status', category: 'accessory_units', status: 'unknown', reason: 'Fire-hazard zone status unknown; verify before finalizing the ADU layout.', effect: '', treatment: 'note', scoreAdjustment: -10, sourceUrl: SRC_ADU, verifyItem: 'Look up the parcel on the CAL FIRE FHSZ viewer.' });
  }
  return out;
}

function fireRebuild(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  if (ctx.input.projectType !== 'fire_rebuild') return out;
  const sf = ctx.existingSf;
  out.push({
    id: 'EATON_LFL_PLUS_10_OR_200', name: 'Eaton Fire like-for-like rebuild (+10% or 200 sf)', category: 'fire_rebuild', status: sf > 0 ? 'yes' : 'unknown',
    reason: sf > 0 ? `Prior legal structure of ${sf.toLocaleString()} sf supports a like-for-like rebuild up to ${Math.round(Math.max(sf * 1.1, sf + 200)).toLocaleString()} sf.` : 'Prior structure size not provided.',
    effect: 'Expedited ministerial permit; fee waivers; no demo cost.', treatment: 'as_of_right', permitTier: 'ministerial_expedited', scoreAdjustment: 60, sourceUrl: SRC_LFL, monthsAdded: -2,
    verifyItem: 'Document prior legal square footage with assessor records or permits.',
  });
  out.push({ id: 'FIRE_REBUILD_EXPEDITED', name: 'Expedited fire-rebuild permit lane', category: 'fire_rebuild', status: 'yes', reason: 'County one-stop rebuild center handles plan check on an expedited track; the entitlement is transferable to a buyer.', effect: 'Shorter permit timeline.', treatment: 'as_of_right', permitTier: 'ministerial_expedited', scoreAdjustment: 20, sourceUrl: SRC_LFL });
  if (ctx.rule && isR1Family(ctx.rule.code)) {
    out.push({ id: 'ALTADENA_FRONT_SETBACK_20', name: 'Altadena non-LFL 20 ft front setback override', category: 'fire_rebuild', status: 'yes', reason: 'Non-like-for-like rebuilds in the CSD may use a 20 ft front setback.', effect: 'Larger buildable envelope.', treatment: 'as_of_right', scoreAdjustment: 30, sourceUrl: SRC_LFL });
  }
  return out;
}

function environmental(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const s = ctx.site;
  if (s.hillside || (s.slopePct ?? 0) > 15) {
    out.push({ id: 'HILLSIDE', name: 'Hillside / slope conditions', category: 'environmental', status: 'yes', reason: 'Slope over 15% or hillside designation triggers grading review and retaining costs.', effect: 'Adds site cost and design review.', treatment: 'cost_adder', costAdder: 45000, scoreAdjustment: -10, monthsAdded: 1, verifyItem: 'Order a topographic survey and preliminary geotech.' });
  }
  if ((s.wetlandsAcres ?? 0) > 0) {
    out.push({ id: 'WETLANDS', name: 'Wetlands / riparian buffer', category: 'environmental', status: 'yes', reason: `${s.wetlandsAcres} ac of wetland or streambed on the parcel.`, effect: 'Buildable area reduced; mitigation or avoidance required.', treatment: 'constraint', costAdder: 25000, scoreAdjustment: -15, monthsAdded: 3, verifyItem: 'Wetland delineation and agency consultation.' });
  }
  return out;
}

function utilities(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const u = ctx.utilities;
  if (u.sewer === 'no') out.push({ id: 'NO_SEWER', name: 'No public sewer', category: 'utilities', status: 'yes', reason: 'Parcel is not served by public sewer.', effect: 'Septic design and health-department approval; cost adder.', treatment: 'cost_adder', costAdder: 35000, scoreAdjustment: -15, monthsAdded: 2 });
  if (u.water === 'no') out.push({ id: 'NO_WATER', name: 'No public water', category: 'utilities', status: 'yes', reason: 'Parcel is not served by public water.', effect: 'Well permit and drilling.', treatment: 'cost_adder', costAdder: 30000, scoreAdjustment: -10, monthsAdded: 2 });
  if (u.power === 'no') out.push({ id: 'NO_POWER', name: 'Power extension required', category: 'utilities', status: 'yes', reason: 'No electrical service at the lot line.', effect: 'Utility extension cost and lead time.', treatment: 'cost_adder', costAdder: 20000, scoreAdjustment: -8, monthsAdded: 3 });
  return out;
}

function hazardScreen(ctx: OverlayContext): HazardScreen {
  const z = ctx.site.fireHazardZone;
  if (z === 'yes') return { result: 'likely_in_zone', label: 'Likely in VHFHSZ', maxOfferHaircutPct: 0.05, buildCostBumpPct: 0.03, manualReviewRequired: true, note: 'Fire-zone exposure likely; verify insurance and Chapter 7A construction assumptions.' };
  if (z === 'no') return { result: 'clear', label: 'Outside VHFHSZ', maxOfferHaircutPct: 0, buildCostBumpPct: 0, manualReviewRequired: false, note: 'No fire-hazard haircut applied.' };
  return { result: 'unknown_manual_review', label: 'VHFHSZ status unknown', maxOfferHaircutPct: 0.03, buildCostBumpPct: 0.02, manualReviewRequired: true, note: 'Fire-hazard zone not confirmed; a conservative 3% offer haircut and 2% cost bump are applied until verified.' };
}

export const ALTADENA_CA: MarketConfig = {
  code: 'ALTADENA_CA',
  name: 'Altadena / West San Gabriel Valley',
  state: 'CA',
  jurisdiction: 'Los Angeles County (unincorporated), Altadena Community Standards District',
  zipBands: {
    '91001': { area: 'Altadena', label: 'Primary market', arvMultiplier: 1 },
    '91104': { area: 'Pasadena', label: 'Closest comp market', arvMultiplier: 1 },
    '91103': { area: 'Pasadena (NW)', label: 'Lower price band', arvMultiplier: 0.92 },
    '91011': { area: 'La Cañada Flintridge', label: 'Higher-end comps', arvMultiplier: 1.15 },
    '91024': { area: 'Sierra Madre', label: 'Similar hillside', arvMultiplier: 1.05 },
  },
  defaultArvPerSf: 650,
  assumptions: {
    hardCostPerSf: 350,
    aduHardCostPerSf: 200,
    softCostPct: 0.10,
    contingencyPct: 0,
    demoCost: 35000,
    sitePrepPerLot: 0,
    utilityConnectionFeesPerUnit: 0,
    impactFeesPerUnit: 0,
    commissionPct: 0.05,
    closingPct: 0.03,
    targetRoi: 0.40,
    annualFinancingRate: 0,
    financedPct: 0,
    buildMonths: 12,
    aduArvPremiumPerSf: 300,
    rebuildExpansionPct: 0.10,
    maxAduSf: 1100,
    maxDensityFar: 0.45,
    defaultHomeSf: 2400, grossAreaFactor: 0.30, aduValuationMode: 'premium_on_primary',
  },
  zoning: altadenaZoning,
  overlays: [fireRebuild, sb9, adu, environmental, utilities],
  hazardScreen,
  permitMonths: { ministerial_expedited: 2, ministerial: 3, administrative_review: 5, discretionary: 10, rezoning: 18 },
  approvalBaseRate: 88,
  calibrationNote: 'Cost constants match the public Altadena offer model ($350/sf hard, $200/sf ADU, 10% soft, 40% ROI, 5%+3% sale costs, $35k demo). Financing and contingency are zeroed to reproduce it; turn them on for a real pro forma.',
};
