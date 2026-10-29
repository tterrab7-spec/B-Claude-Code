import type { CostAssumptions, PermitTier, Scenario, ScenarioCosts } from './types.js';

export const fin = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
export const round0 = (n: number): number => Math.round(n);
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export interface ProFormaInput {
  primaryLivingSf: number;
  aduSf: number;
  units: number;
  arvPerSf: number;
  assumptions: CostAssumptions;
  demolitionRequired: boolean;
  /** Extra lump-sum costs from overlays (mitigation, VDOT entrance, etc.) */
  extraCosts: number;
  /** Build cost bump from hazard screen (0.03 = +3%) */
  buildCostBumpPct: number;
  /** Haircut applied to the max offer (0.05 = -5%) */
  maxOfferHaircutPct: number;
  /** ARV haircut from overlays (flood, RPA, etc.) */
  arvHaircutPct: number;
  /** Count of lots that need site prep (subdivision) */
  lots: number;
}

export interface ProForma {
  arvPerSfUsed: number;
  arv: number;
  costs: ScenarioCosts;
  saleCosts: { commission: number; closing: number; total: number };
  maxOffer: number;
  totalInvestment: number;
  profit: number;
  roi: number;
  marginOnArv: number;
}

/**
 * Residual land value at a target ROI.
 *
 *   maxOffer = (ARV − saleCosts − (1 + ROI) × totalCosts) / (1 + ROI)
 *
 * Total investment = maxOffer + totalCosts, and by construction
 * profit = totalInvestment × ROI when the offer is accepted at maxOffer.
 * A haircut shaves the offer (not the costs) when a hazard screen says so.
 */
export function proForma(i: ProFormaInput): ProForma {
  const a = i.assumptions;
  const primary = fin(i.primaryLivingSf);
  const adu = clamp(fin(i.aduSf), 0, a.maxAduSf);
  const bump = 1 + fin(i.buildCostBumpPct);

  const hard = primary * (1 + fin(a.grossAreaFactor)) * a.hardCostPerSf * bump;
  const aduCost = adu * a.aduHardCostPerSf * bump;
  const demo = i.demolitionRequired ? a.demoCost : 0;
  const sitePrep = a.sitePrepPerLot * Math.max(1, i.lots);
  const fees = (a.utilityConnectionFeesPerUnit + a.impactFeesPerUnit) * Math.max(1, i.units) + fin(i.extraCosts);
  const soft = (hard + aduCost) * a.softCostPct;
  const contingency = (hard + aduCost + soft + sitePrep) * a.contingencyPct;
  const preFinancing = hard + aduCost + demo + sitePrep + fees + soft + contingency;
  // Average outstanding balance ≈ half the financed amount over the build period.
  const financing = preFinancing * a.financedPct * a.annualFinancingRate * (a.buildMonths / 12) * 0.5;
  const total = preFinancing + financing;

  const arvPerSfUsed = adu > 0 ? fin(i.arvPerSf) + a.aduArvPremiumPerSf : fin(i.arvPerSf);
  const grossArv = adu > 0 && a.aduValuationMode === 'premium_on_primary'
    ? primary * arvPerSfUsed
    : (primary + adu) * fin(i.arvPerSf) + adu * a.aduArvPremiumPerSf;
  const arv = grossArv * (1 - clamp(fin(i.arvHaircutPct), 0, 0.9));

  const commission = arv * a.commissionPct;
  const closing = arv * a.closingPct;
  const saleTotal = commission + closing;

  const z = 1 + a.targetRoi;
  const rawOffer = (arv - saleTotal - z * total) / z;
  const haircut = clamp(fin(i.maxOfferHaircutPct), 0, 1);
  const maxOffer = Math.max(0, rawOffer * (1 - haircut));
  const totalInvestment = maxOffer + total;
  const profit = arv - saleTotal - totalInvestment;
  const roi = totalInvestment > 0 ? profit / totalInvestment : 0;
  const marginOnArv = arv > 0 ? profit / arv : 0;

  return {
    arvPerSfUsed,
    arv: round0(arv),
    costs: {
      hard: round0(hard),
      adu: round0(aduCost),
      demo: round0(demo),
      sitePrep: round0(sitePrep),
      fees: round0(fees),
      soft: round0(soft),
      contingency: round0(contingency),
      financing: round0(financing),
      total: round0(total),
    },
    saleCosts: { commission: round0(commission), closing: round0(closing), total: round0(saleTotal) },
    maxOffer: round0(maxOffer),
    totalInvestment: round0(totalInvestment),
    profit: round0(profit),
    roi: Number(roi.toFixed(4)),
    marginOnArv: Number(marginOnArv.toFixed(4)),
  };
}

export function medianPricePerSf(comps: { salePrice: number; livingSf: number }[]): number | null {
  const vals = comps
    .filter((c) => fin(c.salePrice) > 0 && fin(c.livingSf) > 0)
    .map((c) => c.salePrice / c.livingSf)
    .sort((x, y) => x - y);
  if (vals.length === 0) return null;
  const mid = Math.floor(vals.length / 2);
  const m = vals.length % 2 ? vals[mid]! : (vals[mid - 1]! + vals[mid]!) / 2;
  return Math.round(m);
}

export const PERMIT_TIER_ORDER: PermitTier[] = [
  'ministerial_expedited',
  'ministerial',
  'administrative_review',
  'discretionary',
  'rezoning',
];

export function worsePermitTier(a: PermitTier, b: PermitTier): PermitTier {
  return PERMIT_TIER_ORDER.indexOf(a) >= PERMIT_TIER_ORDER.indexOf(b) ? a : b;
}

export function scenarioViable(s: Pick<Scenario, 'maxOffer' | 'profit' | 'roi'>): boolean {
  return s.maxOffer > 0 && s.profit > 0;
}
