/**
 * DirtBid underwriting engine — shared types.
 *
 * Everything here is deterministic and pure: given the same input and market
 * config you get the same result. The API stores results verbatim so a report
 * can always be regenerated and audited.
 */

export type Tri = 'yes' | 'no' | 'unknown';

export type ProjectType =
  | 'fire_rebuild'      // disaster rebuild, like-for-like pathway, no demo
  | 'demo_rebuild'      // tear down existing structure and rebuild
  | 'vacant_land'       // nothing on the lot today
  | 'addition_adu'      // keep the structure, add ADU / expansion
  | 'subdivision';      // split into multiple lots / phased community

export type PermitTier =
  | 'ministerial'               // staff-level, as-of-right
  | 'ministerial_expedited'     // disaster / fast-track lane
  | 'administrative_review'     // staff review with conditions
  | 'discretionary'             // planning commission / BZA / conditional use
  | 'rezoning';                 // legislative approval required

export type Confidence = 'high' | 'moderate' | 'low';
export type RiskLevel = 'low' | 'moderate' | 'high';

export interface Comp {
  address?: string;
  salePrice: number;
  livingSf: number;
  soldDate?: string;        // ISO date
  distanceMiles?: number;
}

export interface Utilities {
  water: Tri;
  sewer: Tri;
  power: Tri;
  gas?: Tri;
  broadband?: Tri;
}

export interface SiteFlags {
  cornerLot?: boolean;
  hillside?: boolean;
  slopePct?: number;
  lotWidthFt?: number;
  lotDepthFt?: number;
  historic?: Tri;
  tenantOccupiedLast3Years?: Tri;
  priorLegalUnits?: number;
  /** FEMA flood zone designation, e.g. X, AE, VE, A, AO */
  floodZone?: string;
  /** Acres of delineated or suspected wetlands on the parcel */
  wetlandsAcres?: number;
  /** Chesapeake Bay Preservation Act Resource Protection Area buffer present (VA) */
  rpaBuffer?: Tri;
  /** Very High Fire Hazard Severity Zone (CA) */
  fireHazardZone?: Tri;
  /** Frontage on a state-maintained road (VA: VDOT entrance permit) */
  stateRouteFrontage?: Tri;
  soils?: 'stable' | 'marginal' | 'poor' | 'unknown';
  utilities?: Partial<Utilities>;
  transitWithinHalfMile?: Tri;
}

export interface CostAssumptions {
  /** Hard construction cost per living square foot, primary structure */
  hardCostPerSf: number;
  /** Hard cost per square foot for an accessory dwelling unit */
  aduHardCostPerSf: number;
  /** Soft costs (A&E, permits, legal, insurance) as a share of hard cost */
  softCostPct: number;
  /** Construction contingency as a share of hard + soft */
  contingencyPct: number;
  /** Demolition lump sum when an existing structure is removed */
  demoCost: number;
  /** Clearing, grading, erosion control, driveway — per lot */
  sitePrepPerLot: number;
  /** Water / sewer / power connection and tap fees — per unit */
  utilityConnectionFeesPerUnit: number;
  /** Impact fees, proffers, school/road contributions — per unit */
  impactFeesPerUnit: number;
  /** Listing + buyer agent commission as share of ARV */
  commissionPct: number;
  /** Seller closing costs (title, transfer tax, grantor tax) as share of ARV */
  closingPct: number;
  /** Required return on total investment (land + all costs) */
  targetRoi: number;
  /** Annual construction loan interest rate */
  annualFinancingRate: number;
  /** Share of project cost that is debt financed */
  financedPct: number;
  /** Months from permit to CO */
  buildMonths: number;
  /** Premium added to ARV/sf when an ADU is included */
  aduArvPremiumPerSf: number;
  /** Allowed expansion over existing footprint on rebuild (0.30 = +30%) */
  rebuildExpansionPct: number;
  /** Maximum ADU size the model will underwrite */
  maxAduSf: number;
  /** Floor-area ratio used for max-density massing */
  maxDensityFar: number;
  /** Default finished home size for vacant-land custom build */
  defaultHomeSf: number;
  /** Gross built area over living area (garage, circulation): hard cost is priced on living × (1 + factor) */
  grossAreaFactor: number;
  /**
   * How an ADU contributes to ARV.
   * premium_on_primary: ARV = primary sf × (ARV/sf + premium) — the ADU's own sf is not valued (Altadena model).
   * sf_at_arv: ARV = (primary + ADU sf) × ARV/sf + ADU sf × premium.
   */
  aduValuationMode: 'premium_on_primary' | 'sf_at_arv';
}

export interface UnderwritingInput {
  address?: string;
  marketCode: string;
  zip?: string;
  lotSizeSf: number;
  existingStructureSf?: number;
  zoningCode: string;
  /** Override for after-repair value per living sf. Derived from comps or market default when omitted. */
  arvPerSf?: number;
  comps?: Comp[];
  projectType: ProjectType;
  /** Desired finished home size (vacant land / custom build). Falls back to market default. */
  targetHomeSf?: number;
  site?: SiteFlags;
  assumptions?: Partial<CostAssumptions>;
}

export interface ZoningRule {
  code: string;
  aliases?: string[];
  label: string;
  minLotSf: number;
  minLotAreaPerUnitSf: number | null;
  /** null = computed from minLotAreaPerUnitSf */
  maxBaseUnits: number | null;
  aduAllowed: Tri;
  duplexAllowed: Tri;
  multifamilyAllowed: Tri;
  heightRule: string;
  setbacks: { front: string; side: string; rear: string };
  maxFar?: number;
  /** Minimum lot width (ft) for by-right subdivision */
  minLotWidthFt?: number;
  notes?: string;
}

export interface OverlayFlag {
  id: string;
  name: string;
  category:
    | 'state_density'
    | 'accessory_units'
    | 'fire_rebuild'
    | 'environmental'
    | 'utilities'
    | 'transportation'
    | 'entitlement'
    | 'hazard';
  status: Tri;
  reason: string;
  effect: string;
  /** How the engine treats this flag when pricing */
  treatment: 'as_of_right' | 'upside_only' | 'constraint' | 'cost_adder' | 'blocker' | 'note';
  permitTier?: PermitTier;
  /** Positive helps, negative hurts, applied to strategy scoring */
  scoreAdjustment: number;
  /** Additional cost the flag imposes, if any */
  costAdder?: number;
  /** ARV haircut (0.05 = -5%) */
  arvHaircutPct?: number;
  /** Months added to the permit timeline */
  monthsAdded?: number;
  sourceUrl?: string;
  verifyItem?: string;
}

export interface HazardScreen {
  result: 'clear' | 'likely_in_zone' | 'boundary_manual_review' | 'unknown_manual_review';
  label: string;
  maxOfferHaircutPct: number;
  buildCostBumpPct: number;
  manualReviewRequired: boolean;
  note: string;
}

export interface ScenarioCosts {
  hard: number;
  adu: number;
  demo: number;
  sitePrep: number;
  fees: number;
  soft: number;
  contingency: number;
  financing: number;
  total: number;
}

export interface Scenario {
  id: number;
  key: string;
  name: string;
  tag: string;
  description: string;
  units: number;
  primaryLivingSf: number;
  aduSf: number;
  totalBuildableSf: number;
  arvPerSfUsed: number;
  arv: number;
  costs: ScenarioCosts;
  saleCosts: { commission: number; closing: number; total: number };
  /** Maximum price to pay for the land / existing property at the target ROI */
  maxOffer: number;
  totalInvestment: number;
  profit: number;
  roi: number;
  marginOnArv: number;
  permitTier: PermitTier;
  permitMonths: number;
  buildMonths: number;
  confidence: Confidence;
  viable: boolean;
  assumptions: string[];
  flags: string[];
}

export interface SensitivityCell {
  arvDeltaPct: number;
  costDeltaPct: number;
  maxOffer: number;
  profit: number;
  roi: number;
}

export interface VerifyItem {
  item: string;
  why: string;
  owner: 'owner' | 'dirtbid' | 'engineer' | 'attorney' | 'jurisdiction';
  priority: 'high' | 'medium' | 'low';
}

export interface Scores {
  /** 0–100: probability the recommended path gets approved as modeled */
  approvalProbability: number;
  approvalLabel: 'HIGH' | 'MODERATE' | 'LOW';
  /** 0–10: how much of the lot's potential the recommended path captures */
  valueMaximization: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
}

export interface UnderwritingResult {
  version: string;
  generatedAt: string;
  input: UnderwritingInput;
  market: { code: string; name: string; state: string; jurisdiction: string; zipBand: { zip: string; area: string; label: string } | null };
  zoning: {
    recognized: boolean;
    rule: ZoningRule | null;
    baseUnits: number;
    maxUnitsEstimate: number;
    maxUnitsLabel: string;
  };
  overlays: OverlayFlag[];
  hazards: HazardScreen;
  utilities: { summary: string; connectable: Tri; detail: Utilities };
  environmental: { summary: string; constraintsIdentified: boolean; items: string[] };
  comps: { summary: string; count: number; medianPricePerSf: number | null; arvPerSfUsed: number; source: 'input' | 'comps' | 'market_default' };
  scenarios: Scenario[];
  recommended: { scenarioId: number; key: string; rationale: string };
  scores: Scores;
  sensitivity: SensitivityCell[];
  checklist: VerifyItem[];
  disclaimers: string[];
}

export type OverlayEvaluator = (ctx: OverlayContext) => OverlayFlag[];

export interface OverlayContext {
  input: UnderwritingInput;
  rule: ZoningRule | null;
  site: SiteFlags;
  utilities: Utilities;
  lotSizeSf: number;
  existingSf: number;
}

export interface MarketConfig {
  code: string;
  name: string;
  state: string;
  jurisdiction: string;
  zipBands: Record<string, { area: string; label: string; arvMultiplier: number }>;
  defaultArvPerSf: number;
  assumptions: CostAssumptions;
  zoning: ZoningRule[];
  overlays: OverlayEvaluator[];
  hazardScreen: (ctx: OverlayContext) => HazardScreen;
  permitMonths: Record<PermitTier, number>;
  /** Base approval probability for a clean as-of-right project */
  approvalBaseRate: number;
  /** Extra scenario builders specific to the market (optional) */
  calibrationNote: string;
}
