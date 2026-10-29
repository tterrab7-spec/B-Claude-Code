import type { MarketConfig, OverlayContext, OverlayFlag, HazardScreen, ZoningRule } from '../types.js';

/**
 * Hampton Roads, Virginia (Hampton, Newport News, Norfolk, Virginia Beach,
 * Chesapeake, Suffolk, York, James City, Isle of Wight).
 *
 * Zoning codes here are generic "R-<min lot in thousands of sf>" districts that
 * map onto most Hampton Roads localities. Localities use their own labels
 * (Hampton R-11, Virginia Beach R-7.5, Chesapeake R-15) so aliases cover the
 * common ones. Dollar assumptions are starting points to calibrate against
 * Canterbury's own closed lots and NVR/Ryan Homes takedown pricing.
 */

const sb = (front: string, side: string, rear: string) => ({ front, side, rear });

export const hamptonRoadsZoning: ZoningRule[] = [
  { code: 'R-5', aliases: ['R5', 'R-5S', 'R-5D', 'R-6'], label: 'Residential, 5,000 sf lots', minLotSf: 5000, minLotAreaPerUnitSf: 5000, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'unknown', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '8 ft', '20 ft'), minLotWidthFt: 50 },
  { code: 'R-7.5', aliases: ['R7.5', 'R-7', 'R-8', 'R8', 'R-9', 'R9'], label: 'Residential, 7,500 sf lots', minLotSf: 7500, minLotAreaPerUnitSf: 7500, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('30 ft', '10 ft', '20 ft'), minLotWidthFt: 60 },
  { code: 'R-10', aliases: ['R10', 'R-11', 'R11', 'R-12', 'R12'], label: 'Residential, 10,000 sf lots', minLotSf: 10000, minLotAreaPerUnitSf: 10000, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('30 ft', '10 ft', '25 ft'), minLotWidthFt: 75 },
  { code: 'R-15', aliases: ['R15', 'R-13', 'R13'], label: 'Residential, 15,000 sf lots', minLotSf: 15000, minLotAreaPerUnitSf: 15000, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('35 ft', '15 ft', '25 ft'), minLotWidthFt: 90 },
  { code: 'R-20', aliases: ['R20', 'R-22', 'R22', 'R-33', 'R33'], label: 'Residential, 20,000 sf lots', minLotSf: 20000, minLotAreaPerUnitSf: 20000, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('40 ft', '15 ft', '30 ft'), minLotWidthFt: 100 },
  { code: 'R-40', aliases: ['R40', 'RE', 'R-E', 'RR', 'R-R'], label: 'Rural / Estate Residential, 1 ac lots', minLotSf: 43560, minLotAreaPerUnitSf: 43560, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('50 ft', '20 ft', '40 ft'), minLotWidthFt: 125, notes: 'Usually well and septic; soils drive buildability.' },
  { code: 'A-1', aliases: ['A1', 'AG', 'A-2', 'RC', 'RAC'], label: 'Agricultural / Rural Conservation', minLotSf: 87120, minLotAreaPerUnitSf: 87120, maxBaseUnits: 1, aduAllowed: 'unknown', duplexAllowed: 'no', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('50 ft', '25 ft', '50 ft'), minLotWidthFt: 150, notes: 'Residential subdivision generally requires rezoning; family subdivisions sometimes by right.' },
  { code: 'R-2F', aliases: ['R2F', 'R-D', 'RD', 'R-T', 'RT'], label: 'Two-Family / Townhouse Residential', minLotSf: 6000, minLotAreaPerUnitSf: 3000, maxBaseUnits: 2, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'no', heightRule: '35 ft', setbacks: sb('25 ft', '8 ft', '20 ft'), minLotWidthFt: 60 },
  { code: 'C-1', aliases: ['C1', 'C-2', 'C2', 'C-3', 'C3', 'B-1', 'B1', 'B-2', 'B2', 'B-3', 'B3', 'B-4', 'B4', 'B-5', 'B5', 'O-1', 'O1', 'O-2', 'O2', 'CB', 'CBD'], label: 'Commercial / Office (residential by conditional use or rezoning)', minLotSf: 10000, minLotAreaPerUnitSf: 1815, maxBaseUnits: null, aduAllowed: 'no', duplexAllowed: 'unknown', multifamilyAllowed: 'yes', heightRule: '35–45 ft', setbacks: sb('25 ft', '10 ft', '20 ft'), maxFar: 0.5, notes: 'Base district is commercial. Residential or mixed-use modeled at 24 du/ac screening density and requires a conditional use permit or rezoning in most Hampton Roads localities.' },
  { code: 'R-M', aliases: ['RM', 'R-3', 'R3', 'R-4', 'R4', 'MF', 'A-12', 'A-18', 'A-24', 'A-36'], label: 'Multifamily Residential', minLotSf: 10000, minLotAreaPerUnitSf: 3630, maxBaseUnits: null, aduAllowed: 'unknown', duplexAllowed: 'yes', multifamilyAllowed: 'yes', heightRule: '45 ft', setbacks: sb('30 ft', '15 ft', '25 ft'), maxFar: 0.6, notes: 'Density screen = lot area / 3,630 sf (12 du/ac). Many districts carry 18–36 du/ac; override per locality.' },
];

function chesapeakeBay(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const s = ctx.site;
  if (s.rpaBuffer === 'yes') {
    out.push({ id: 'CBPA_RPA', name: 'Chesapeake Bay Preservation Act RPA buffer', category: 'environmental', status: 'yes', reason: '100 ft Resource Protection Area buffer from perennial water or tidal wetlands crosses the parcel.', effect: 'No disturbance in the buffer without an exception; buildable envelope reduced; Water Quality Impact Assessment likely.', treatment: 'constraint', costAdder: 12000, scoreAdjustment: -15, monthsAdded: 2, verifyItem: 'Have Timmons confirm RPA boundary with a perennial flow determination and site-specific delineation.' });
  } else if (s.rpaBuffer === 'unknown' || s.rpaBuffer === undefined) {
    out.push({ id: 'CBPA_RPA', name: 'Chesapeake Bay RPA screen', category: 'environmental', status: 'unknown', reason: 'All of Tidewater is in the CBPA area; RPA presence on this parcel not yet confirmed.', effect: 'Verify before pricing.', treatment: 'note', scoreAdjustment: -5, verifyItem: 'Check locality RPA map layer and order a perennial flow determination if a stream or ditch is nearby.' });
  }
  if ((s.wetlandsAcres ?? 0) > 0) {
    const ac = s.wetlandsAcres ?? 0;
    out.push({ id: 'WETLANDS', name: 'Non-tidal / tidal wetlands', category: 'environmental', status: 'yes', reason: `${ac} ac of wetlands on the parcel.`, effect: 'Buildable area reduced; Corps/DEQ permitting and mitigation credits if impacted.', treatment: 'constraint', costAdder: Math.round(ac * 60000), scoreAdjustment: -15, monthsAdded: 4, verifyItem: 'Wetland delineation and jurisdictional determination (USACE Norfolk District).' });
  }
  const fz = (s.floodZone ?? '').toUpperCase();
  if (fz.startsWith('V')) out.push({ id: 'FEMA_V', name: 'FEMA coastal high-hazard zone (V/VE)', category: 'hazard', status: 'yes', reason: 'Parcel in a V zone.', effect: 'Open pile foundation, breakaway walls, freeboard; insurance drives resale.', treatment: 'cost_adder', costAdder: 85000, arvHaircutPct: 0.05, scoreAdjustment: -25, monthsAdded: 2 });
  else if (fz.startsWith('A')) out.push({ id: 'FEMA_A', name: 'FEMA special flood hazard area (A/AE/AO)', category: 'hazard', status: 'yes', reason: `Parcel in zone ${fz}.`, effect: 'Elevation certificate, locality freeboard (often +2 ft or +3 ft), flood insurance.', treatment: 'cost_adder', costAdder: 40000, arvHaircutPct: 0.03, scoreAdjustment: -12, monthsAdded: 1, verifyItem: 'Pull the FIRM panel and locality floodplain ordinance freeboard requirement.' });
  else if (!fz) out.push({ id: 'FEMA_UNKNOWN', name: 'Flood zone not provided', category: 'hazard', status: 'unknown', reason: 'Hampton Roads has broad A/AE coverage; confirm the FIRM zone.', effect: '', treatment: 'note', scoreAdjustment: -3, verifyItem: 'Look up the parcel on the FEMA Flood Map Service Center.' });
  return out;
}

function vdot(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const s = ctx.site;
  if (s.stateRouteFrontage === 'yes') {
    out.push({ id: 'VDOT_ENTRANCE', name: 'VDOT land use / entrance permit', category: 'transportation', status: 'yes', reason: 'Frontage is on a VDOT-maintained route.', effect: 'Commercial or private entrance permit, sight distance, possible turn lane under Access Management regs; Road Design Manual applies to any public street.', treatment: 'cost_adder', costAdder: ctx.input.projectType === 'subdivision' ? 60000 : 8000, scoreAdjustment: -6, monthsAdded: ctx.input.projectType === 'subdivision' ? 3 : 1, verifyItem: 'Sight-distance exhibit and VDOT pre-application with the residency.' });
  }
  if (ctx.input.projectType === 'subdivision') {
    out.push({ id: 'VDOT_STREET_ACCEPTANCE', name: 'Public street acceptance (Secondary Street Acceptance Requirements)', category: 'transportation', status: 'yes', reason: 'New public streets must meet SSAR for VDOT acceptance; private streets need an HOA.', effect: 'Pavement design, connectivity index, bond and one-year maintenance period.', treatment: 'note', scoreAdjustment: 0, monthsAdded: 0, verifyItem: 'Decide public vs private streets before preliminary plat.' });
  }
  return out;
}

function utilitiesVa(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const u = ctx.utilities;
  if (u.sewer === 'no') out.push({ id: 'NO_SEWER', name: 'No public sewer (HRSD / locality)', category: 'utilities', status: 'yes', reason: 'Parcel not served by public sewer.', effect: 'Soil evaluation, VDH septic permit, drainfield area removed from the buildable envelope.', treatment: 'cost_adder', costAdder: 28000, scoreAdjustment: -15, monthsAdded: 2, verifyItem: 'Order a soils evaluation from a licensed OSE.' });
  else if (u.sewer === 'unknown') out.push({ id: 'SEWER_UNKNOWN', name: 'Sewer availability unconfirmed', category: 'utilities', status: 'unknown', reason: 'Gravity vs grinder pump vs no service changes cost materially.', effect: '', treatment: 'note', scoreAdjustment: -5, verifyItem: 'Request a utility availability letter from the locality.' });
  if (u.water === 'no') out.push({ id: 'NO_WATER', name: 'No public water', category: 'utilities', status: 'yes', reason: 'Parcel not served by public water.', effect: 'Private well permit.', treatment: 'cost_adder', costAdder: 15000, scoreAdjustment: -8, monthsAdded: 1 });
  if (u.power === 'no') out.push({ id: 'NO_POWER', name: 'Dominion service extension', category: 'utilities', status: 'yes', reason: 'No service at lot line.', effect: 'Extension cost and 3–6 month lead time.', treatment: 'cost_adder', costAdder: 18000, scoreAdjustment: -8, monthsAdded: 3 });
  return out;
}

function entitlement(ctx: OverlayContext): OverlayFlag[] {
  const out: OverlayFlag[] = [];
  const rule = ctx.rule;
  if (!rule) return out;
  if (rule.code === 'C-1') {
    out.push({ id: 'COMMERCIAL_RESIDENTIAL_APPROVAL', name: 'Residential use in a commercial district', category: 'entitlement', status: 'yes', reason: `${ctx.input.zoningCode} is a commercial/office district; dwellings or mixed-use need a conditional use permit or rezoning.`, effect: 'Discretionary approval with public hearing; density and parking set by the approval.', treatment: 'constraint', permitTier: 'discretionary', scoreAdjustment: -20, monthsAdded: 5, costAdder: 25000, verifyItem: 'Pre-application with Planning: confirm whether the locality allows residential above ground-floor commercial by right in this district.' });
    out.push({ id: 'COMMERCIAL_AS_OF_RIGHT_ALTERNATIVE', name: 'Commercial redevelopment as of right', category: 'entitlement', status: 'yes', reason: 'Retail, office, medical and service uses are permitted without a hearing.', effect: 'Not priced by this residential model; carry as the comparison case.', treatment: 'note', scoreAdjustment: 0 });
  }
  const lots = Math.floor(ctx.lotSizeSf / rule.minLotSf);
  if (ctx.input.projectType === 'subdivision') {
    if (lots >= 2 && rule.code !== 'A-1') {
      out.push({ id: 'BY_RIGHT_SUBDIVISION', name: 'By-right subdivision under current zoning', category: 'entitlement', status: 'yes', reason: `${ctx.lotSizeSf.toLocaleString()} sf supports up to ${lots} lots at ${rule.minLotSf.toLocaleString()} sf gross before road, stormwater and open-space take-outs (model nets 25%).`, effect: 'Subdivision plat approval is administrative; no rezoning.', treatment: 'as_of_right', permitTier: 'administrative_review', scoreAdjustment: 40, verifyItem: 'Confirm minimum lot width and cul-de-sac length limits with the subdivision ordinance.' });
    } else {
      out.push({ id: 'REZONING_REQUIRED', name: 'Rezoning or conditional rezoning required', category: 'entitlement', status: 'yes', reason: 'Current district does not yield the lot count by right.', effect: 'Legislative approval; proffers (cash or in-kind) likely; 9–18 months.', treatment: 'blocker', permitTier: 'rezoning', scoreAdjustment: -40, monthsAdded: 12, costAdder: 45000, verifyItem: 'Pre-application meeting with planning staff; proffer policy review.' });
    }
  }
  if (ctx.site.historic === 'yes') out.push({ id: 'HISTORIC_DISTRICT', name: 'Historic district / ARB review', category: 'entitlement', status: 'yes', reason: 'Parcel in a local historic district.', effect: 'Certificate of Appropriateness adds a hearing cycle.', treatment: 'constraint', scoreAdjustment: -10, monthsAdded: 2 });
  return out;
}

function soils(ctx: OverlayContext): OverlayFlag[] {
  const s = ctx.site.soils;
  if (s === 'poor') return [{ id: 'POOR_SOILS', name: 'Poor soils', category: 'environmental', status: 'yes', reason: 'Marine clay, organics or high water table reported.', effect: 'Geotech, undercut and select fill, possibly piles.', treatment: 'cost_adder', costAdder: 30000, scoreAdjustment: -8, verifyItem: 'Geotechnical borings before contract.' }];
  if (s === 'marginal') return [{ id: 'MARGINAL_SOILS', name: 'Marginal soils', category: 'environmental', status: 'yes', reason: 'Some undercut or stabilization expected.', effect: 'Cost adder.', treatment: 'cost_adder', costAdder: 12000, scoreAdjustment: -4 }];
  return [];
}

function hazardScreen(ctx: OverlayContext): HazardScreen {
  const fz = (ctx.site.floodZone ?? '').toUpperCase();
  if (fz.startsWith('V')) return { result: 'likely_in_zone', label: 'Coastal high-hazard (V)', maxOfferHaircutPct: 0.08, buildCostBumpPct: 0.06, manualReviewRequired: true, note: 'V-zone construction and insurance assumptions must be verified.' };
  if (fz.startsWith('A')) return { result: 'likely_in_zone', label: 'Special flood hazard area (A)', maxOfferHaircutPct: 0.04, buildCostBumpPct: 0.03, manualReviewRequired: true, note: 'Freeboard and flood insurance assumptions must be verified.' };
  if (fz === 'X' || fz.startsWith('X')) return { result: 'clear', label: 'Zone X (minimal flood risk)', maxOfferHaircutPct: 0, buildCostBumpPct: 0, manualReviewRequired: false, note: 'No flood haircut applied.' };
  return { result: 'unknown_manual_review', label: 'Flood zone not confirmed', maxOfferHaircutPct: 0.02, buildCostBumpPct: 0.01, manualReviewRequired: true, note: 'A conservative 2% offer haircut is applied until the FIRM zone is confirmed.' };
}

export const HAMPTON_ROADS_VA: MarketConfig = {
  code: 'HAMPTON_ROADS_VA',
  name: 'Hampton Roads, Virginia',
  state: 'VA',
  jurisdiction: 'Hampton, Newport News, Norfolk, Virginia Beach, Chesapeake, Suffolk, York, James City, Isle of Wight',
  zipBands: {
    '23666': { area: 'Hampton', label: 'Primary market', arvMultiplier: 1 },
    '23669': { area: 'Hampton (Phoebus / Fox Hill)', label: 'Waterfront band', arvMultiplier: 1.05 },
    '23602': { area: 'Newport News (Denbigh)', label: 'Value band', arvMultiplier: 0.92 },
    '23606': { area: 'Newport News (Hidenwood)', label: 'Higher-end comps', arvMultiplier: 1.08 },
    '23692': { area: 'Yorktown', label: 'Premium suburban', arvMultiplier: 1.12 },
    '23185': { area: 'Williamsburg', label: 'Premium suburban', arvMultiplier: 1.15 },
    '23456': { area: 'Virginia Beach (Princess Anne)', label: 'Premium suburban', arvMultiplier: 1.18 },
    '23322': { area: 'Chesapeake (Great Bridge)', label: 'Premium suburban', arvMultiplier: 1.12 },
    '23435': { area: 'Suffolk (North)', label: 'Growth corridor', arvMultiplier: 1.02 },
    '23518': { area: 'Norfolk (Ocean View)', label: 'Flood-exposed waterfront', arvMultiplier: 0.98 },
  },
  defaultArvPerSf: 265,
  assumptions: {
    hardCostPerSf: 125,
    aduHardCostPerSf: 175,
    softCostPct: 0.10,
    contingencyPct: 0.05,
    demoCost: 18000,
    sitePrepPerLot: 28000,
    utilityConnectionFeesPerUnit: 9500,
    impactFeesPerUnit: 0,
    commissionPct: 0.05,
    closingPct: 0.02,
    targetRoi: 0.18,
    annualFinancingRate: 0.09,
    financedPct: 0.75,
    buildMonths: 9,
    aduArvPremiumPerSf: 0,
    rebuildExpansionPct: 0.20,
    maxAduSf: 900,
    maxDensityFar: 0.35,
    defaultHomeSf: 2200, grossAreaFactor: 0.10, aduValuationMode: 'sf_at_arv',
  },
  zoning: hamptonRoadsZoning,
  overlays: [entitlement, chesapeakeBay, vdot, utilitiesVa, soils],
  hazardScreen,
  permitMonths: { ministerial_expedited: 1, ministerial: 2, administrative_review: 5, discretionary: 8, rezoning: 15 },
  approvalBaseRate: 85,
  modelSitework: true,
  calibrationNote: 'Semi-custom build-on-your-lot basis: $125/sf living hard cost (+10% gross area), soft 10%, contingency 5%, site prep $28k/lot, taps $9.5k/unit, 18% target ROI on total investment, 9% construction debt at 75% LTC, $265/sf default ARV. These are placeholders: calibrate against Canterbury lot deliveries and local builder bids before quoting a landowner.',
};
