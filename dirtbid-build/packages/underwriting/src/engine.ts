import type {
  Confidence, HazardScreen, MarketConfig, OverlayContext, OverlayFlag, PermitTier, Scenario, SensitivityCell,
  UnderwritingInput, UnderwritingResult, Utilities, VerifyItem, ZoningRule,
} from './types.js';
import { getMarket } from './markets/index.js';
import { clamp, fin, medianPricePerSf, proForma, round0, scenarioViable, worsePermitTier } from './math.js';
import { score } from './scoring.js';
import { estimateSitework, DIRTBID_REGIONS, type SiteworkEstimate } from './sitework.js';

export const ENGINE_VERSION = '1.0.0';

export class UnderwritingError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'UnderwritingError';
  }
}

const normalizeZone = (z: string) => z.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9.]/g, '');

export function findZoningRule(market: MarketConfig, code: string): ZoningRule | null {
  const n = normalizeZone(code);
  if (!n) return null;
  for (const r of market.zoning) {
    const candidates = [r.code, ...(r.aliases ?? [])].map(normalizeZone);
    if (candidates.includes(n)) return r;
  }
  // Accept dash-less or suffixed forms like "R-1-7500" vs "R17500", or "R-7.5A".
  for (const r of market.zoning) {
    const base = normalizeZone(r.code);
    if (n.startsWith(base) && n.length - base.length <= 2) return r;
  }
  return null;
}

function validate(input: UnderwritingInput): void {
  if (!input.marketCode) throw new UnderwritingError('marketCode is required', 'marketCode');
  if (!(fin(input.lotSizeSf) > 0)) throw new UnderwritingError('lotSizeSf must be a positive number', 'lotSizeSf');
  if (!input.zoningCode || !input.zoningCode.trim()) throw new UnderwritingError('zoningCode is required', 'zoningCode');
  if (input.arvPerSf !== undefined && !(fin(input.arvPerSf) > 0)) throw new UnderwritingError('arvPerSf must be positive when provided', 'arvPerSf');
  if ((input.existingStructureSf ?? 0) < 0) throw new UnderwritingError('existingStructureSf cannot be negative', 'existingStructureSf');
  if (input.projectType === 'fire_rebuild' && !(fin(input.existingStructureSf) > 0)) throw new UnderwritingError('fire_rebuild requires the prior structure size', 'existingStructureSf');
}

function utilitiesFrom(input: UnderwritingInput): Utilities {
  const u = input.site?.utilities ?? {};
  return { water: u.water ?? 'unknown', sewer: u.sewer ?? 'unknown', power: u.power ?? 'unknown', gas: u.gas ?? 'unknown', broadband: u.broadband ?? 'unknown' };
}

function utilitiesSummary(u: Utilities): { summary: string; connectable: Utilities['water'] } {
  const core = [u.water, u.sewer, u.power];
  if (core.every((x) => x === 'yes')) return { summary: 'Water, sewer and power available at the lot line. Connectable.', connectable: 'yes' };
  if (core.some((x) => x === 'no')) {
    const missing = (['water', 'sewer', 'power'] as const).filter((k) => u[k] === 'no');
    return { summary: `Not served by public ${missing.join(' or ')}; on-site or extension solution required.`, connectable: 'no' };
  }
  return { summary: 'Utility availability not yet confirmed; request an availability letter.', connectable: 'unknown' };
}

function maxUnits(rule: ZoningRule | null, lotSizeSf: number): { base: number; max: number; label: string } {
  if (!rule) return { base: 0, max: 0, label: 'Unknown zoning' };
  const base = rule.maxBaseUnits ?? (rule.minLotAreaPerUnitSf ? Math.max(1, Math.floor(lotSizeSf / rule.minLotAreaPerUnitSf)) : 1);
  return { base, max: base, label: base === 1 ? '1 principal dwelling' : `Up to ${base} units` };
}

interface ScenarioSpec {
  key: string; name: string; tag: string; description: string; units: number; primaryLivingSf: number; aduSf: number;
  demolitionRequired: boolean; lots: number; permitTier: PermitTier; baseConfidence: Confidence; assumptions: string[]; dependsOn?: string[]; monthsAdjust?: number;
}

function buildSpecs(input: UnderwritingInput, market: MarketConfig, rule: ZoningRule | null, overlays: OverlayFlag[]): ScenarioSpec[] {
  const a = { ...market.assumptions, ...(input.assumptions ?? {}) };
  const lot = input.lotSizeSf;
  const existing = fin(input.existingStructureSf);
  const target = fin(input.targetHomeSf) || a.defaultHomeSf;
  const specs: ScenarioSpec[] = [];
  const has = (id: string, status: 'yes' | 'unknown' = 'yes') => overlays.some((f) => f.id === id && f.status === status);
  const r = (rule?.code ?? '').toUpperCase();
  const isMF = rule?.multifamilyAllowed === 'yes';
  const isDuplex = rule?.duplexAllowed === 'yes';
  const aduOk = rule?.aduAllowed === 'yes' || overlays.some((f) => f.category === 'accessory_units' && f.status === 'yes' && f.treatment === 'as_of_right');
  const expansion = Math.round(existing * (1 + a.rebuildExpansionPct));

  if (input.projectType === 'fire_rebuild') {
    specs.push({ key: 'accelerated_rebuild', name: 'Accelerated Rebuild', tag: 'PRIMARY FOCUS', description: `Rebuild the prior home on the same footprint plus ${Math.round(a.rebuildExpansionPct * 100)}% through the disaster-rebuild lane.`, units: 1, primaryLivingSf: expansion, aduSf: 0, demolitionRequired: false, lots: 1, permitTier: 'ministerial_expedited', baseConfidence: 'high', assumptions: [`Same footprint + ${Math.round(a.rebuildExpansionPct * 100)}% expansion`, 'Disaster rebuild pathway (fastest permitting)', 'No demolition cost'] });
    if (aduOk) specs.push({ key: 'rebuild_plus_adu', name: 'Rebuild + ADU (Hybrid)', tag: 'SELECT OPPORTUNITIES', description: `Rebuild and add one ADU up to ${a.maxAduSf.toLocaleString()} sf under ministerial approval.`, units: 2, primaryLivingSf: expansion, aduSf: a.maxAduSf, demolitionRequired: false, lots: 1, permitTier: 'ministerial', baseConfidence: 'moderate', assumptions: [`Main structure +${Math.round(a.rebuildExpansionPct * 100)}%`, `${a.maxAduSf.toLocaleString()} sf ADU`, 'ADU at ministerial approval'] });
  }

  if (input.projectType === 'demo_rebuild' || input.projectType === 'vacant_land') {
    const demo = input.projectType === 'demo_rebuild';
    // Size the replacement home to the market, not to a commercial or multifamily building that happens to be on the lot.
    const residentialScale = existing > 0 && existing <= 6000;
    const sf = demo && residentialScale ? Math.max(expansion, target) : target;
    specs.push({ key: 'single_home', name: demo ? 'Demolish + New Single-Family' : 'New Single-Family Home', tag: 'BASE CASE', description: `${sf.toLocaleString()} sf new home sized to the ${rule?.label ?? 'district'} and neighborhood comps.`, units: 1, primaryLivingSf: sf, aduSf: 0, demolitionRequired: demo, lots: 1, permitTier: 'ministerial', baseConfidence: 'high', assumptions: [`${sf.toLocaleString()} sf finished`, demo ? `Demolition $${a.demoCost.toLocaleString()}` : 'Vacant lot, site prep included'] });
    if (aduOk) specs.push({ key: 'home_plus_adu', name: 'New Home + ADU', tag: 'VALUE ADD', description: 'Primary home plus a detached ADU for rental income or multigenerational use.', units: 2, primaryLivingSf: sf, aduSf: Math.min(a.maxAduSf, 800), demolitionRequired: demo, lots: 1, permitTier: 'ministerial', baseConfidence: 'moderate', assumptions: [`${Math.min(a.maxAduSf, 800)} sf ADU`] });
    if (isDuplex && rule && rule.minLotAreaPerUnitSf && lot >= 2 * rule.minLotAreaPerUnitSf) specs.push({ key: 'duplex', name: 'Duplex', tag: 'DENSITY', description: 'Two principal units on one lot under the base district.', units: 2, primaryLivingSf: Math.round(Math.min(lot * a.maxDensityFar, 2 * target * 0.8)), aduSf: 0, demolitionRequired: demo, lots: 1, permitTier: 'ministerial', baseConfidence: 'moderate', assumptions: ['2 units', 'Parking and layout to verify'] });
  }

  if (input.projectType === 'addition_adu') {
    specs.push({ key: 'adu_only', name: 'Keep Home + Add ADU', tag: 'PRIMARY FOCUS', description: 'Retain the existing structure and add one ADU.', units: 2, primaryLivingSf: 0, aduSf: Math.min(a.maxAduSf, 800), demolitionRequired: false, lots: 1, permitTier: 'ministerial', baseConfidence: aduOk ? 'high' : 'low', assumptions: ['Existing home retained (not valued in this scenario)', `${Math.min(a.maxAduSf, 800)} sf ADU`] });
    specs.push({ key: 'addition', name: 'Addition / Expansion', tag: 'ALTERNATIVE', description: `Expand the existing home by ${Math.round(a.rebuildExpansionPct * 100)}%.`, units: 1, primaryLivingSf: Math.round(existing * a.rebuildExpansionPct), aduSf: 0, demolitionRequired: false, lots: 1, permitTier: 'ministerial', baseConfidence: 'moderate', assumptions: ['Addition only; existing value excluded'] });
  }

  if (input.projectType === 'subdivision' && rule) {
    const grossLots = Math.floor(lot / rule.minLotSf);
    const netLots = Math.max(1, Math.floor(grossLots * 0.75));
    const tier: PermitTier = has('REZONING_REQUIRED') ? 'rezoning' : 'administrative_review';
    specs.push({ key: 'subdivision_by_right', name: `${netLots}-Lot Subdivision`, tag: tier === 'rezoning' ? 'REQUIRES REZONING' : 'BY RIGHT', description: `${grossLots} gross lots at ${rule.minLotSf.toLocaleString()} sf; ${netLots} net after 25% for streets, stormwater and open space.`, units: netLots, primaryLivingSf: netLots * target, aduSf: 0, demolitionRequired: existing > 0, lots: netLots, permitTier: tier, baseConfidence: tier === 'rezoning' ? 'low' : 'moderate', assumptions: [`${netLots} finished lots`, `${target.toLocaleString()} sf homes`, '25% land take-out for infrastructure'] });
    if (netLots >= 4) {
      const lotsOnly = netLots;
      specs.push({ key: 'finished_lots', name: 'Finished Lots to Builder', tag: 'LOT SALE', description: 'Develop finished lots and sell to a production builder on a takedown schedule (no vertical construction).', units: lotsOnly, primaryLivingSf: 0, aduSf: 0, demolitionRequired: existing > 0, lots: lotsOnly, permitTier: tier, baseConfidence: 'moderate', assumptions: ['No vertical cost', 'Lot price = 22% of finished home value (edit in assumptions)'] });
    }
  }

  // SB 9 / density upside where flagged (CA) or multifamily zoning (any market)
  if (has('SB9_LOT_SPLIT') || has('SB9_LOT_SPLIT', 'unknown') || has('SB9_TWO_UNITS') || has('SB9_TWO_UNITS', 'unknown')) {
    const far = Math.round(lot * a.maxDensityFar);
    specs.push({ key: 'sb9_density', name: 'SB 9 Density', tag: 'LIMITED PILOT', description: '2 primary units + ADUs (3–5 units). Higher complexity, slower execution.', units: 4, primaryLivingSf: far, aduSf: 0, demolitionRequired: existing > 0 && input.projectType !== 'fire_rebuild', lots: 2, permitTier: 'ministerial', baseConfidence: 'low', assumptions: [`FAR estimate ${Math.round(a.maxDensityFar * 100)}% of lot`, '2 primary units + ADUs', 'Upside only until eligibility cleared'] });
  } else if (isMF && rule?.minLotAreaPerUnitSf) {
    const units = Math.max(2, Math.floor(lot / rule.minLotAreaPerUnitSf));
    const far = Math.round(lot * (rule.maxFar ?? a.maxDensityFar));
    specs.push({ key: 'max_density', name: `${units}-Unit Multifamily`, tag: 'MAX DENSITY', description: `Base-zone density screen at ${rule.minLotAreaPerUnitSf.toLocaleString()} sf per unit.`, units, primaryLivingSf: far, aduSf: 0, demolitionRequired: existing > 0, lots: 1, permitTier: units > 4 ? 'administrative_review' : 'ministerial', baseConfidence: 'moderate', assumptions: [`${units} units`, `FAR ${Math.round((rule.maxFar ?? a.maxDensityFar) * 100)}%`, 'Site plan review'] });
  }

  if (specs.length === 0) {
    specs.push({ key: 'single_home', name: 'New Single-Family Home', tag: 'BASE CASE', description: `${target.toLocaleString()} sf new home.`, units: 1, primaryLivingSf: target, aduSf: 0, demolitionRequired: existing > 0, lots: 1, permitTier: rule ? 'ministerial' : 'discretionary', baseConfidence: rule ? 'moderate' : 'low', assumptions: ['Fallback scenario; zoning not fully recognized'] });
  }
  void r;
  return specs;
}

function sensitivity(spec: ScenarioSpec, base: Parameters<typeof proForma>[0]): SensitivityCell[] {
  const cells: SensitivityCell[] = [];
  for (const arvDelta of [-0.1, 0, 0.1]) {
    for (const costDelta of [-0.1, 0, 0.1]) {
      const pf = proForma({ ...base, arvPerSf: base.arvPerSf * (1 + arvDelta), buildCostBumpPct: (1 + base.buildCostBumpPct) * (1 + costDelta) - 1 });
      cells.push({ arvDeltaPct: arvDelta * 100, costDeltaPct: costDelta * 100, maxOffer: pf.maxOffer, profit: pf.profit, roi: pf.roi });
    }
  }
  void spec;
  return cells;
}

export function underwrite(input: UnderwritingInput, now: Date = new Date()): UnderwritingResult {
  validate(input);
  const market = getMarket(input.marketCode);
  if (!market) throw new UnderwritingError(`Unknown market: ${input.marketCode}`, 'marketCode');

  const rule = findZoningRule(market, input.zoningCode);
  const site = input.site ?? {};

  // Sitework: model it from parcel facts unless the caller supplied a site-prep number
  // (their own bid, or a DirtBid Land Screening total passed through).
  let sitework: SiteworkEstimate | null = null;
  const merged = { ...market.assumptions, ...(input.assumptions ?? {}) };
  const sw = input.sitework ?? {};
  const lotsForSitework = input.projectType === 'subdivision' && rule ? Math.max(1, Math.floor(Math.floor(input.lotSizeSf / rule.minLotSf) * 0.75)) : 1;
  if (sw.dirtbidLandScreeningTotal && sw.dirtbidLandScreeningTotal > 0) {
    merged.sitePrepPerLot = Math.round(sw.dirtbidLandScreeningTotal / lotsForSitework);
    merged.utilityConnectionFeesPerUnit = 0; // a Land Screening carries taps and laterals
    sitework = { ...estimateSitework({ lotSizeSf: input.lotSizeSf, lots: lotsForSitework, regionMultiplier: sw.regionMultiplier ?? (market.state === 'VA' ? DIRTBID_REGIONS.VA_HR!.multiplier : 1) }), source: 'dirtbid_land_screening', total: sw.dirtbidLandScreeningTotal, perLot: merged.sitePrepPerLot, lines: [], byDivision: [], waterfall: [{ label: 'DirtBid Land Screening total', amount: sw.dirtbidLandScreeningTotal }], directCost: sw.dirtbidLandScreeningTotal };
  } else if (market.modelSitework && input.assumptions?.sitePrepPerLot === undefined) {
    sitework = estimateSitework({
      lotSizeSf: input.lotSizeSf,
      lots: lotsForSitework,
      treeCoverPct: sw.treeCoverPct,
      slopePct: site.slopePct,
      soils: site.soils,
      hydric: sw.hydric,
      wetlandsAcres: site.wetlandsAcres,
      floodZone: site.floodZone,
      existingStructureSf: input.existingStructureSf,
      demolitionRequired: input.projectType === 'demo_rebuild' || (input.projectType === 'subdivision' && (input.existingStructureSf ?? 0) > 0),
      waterMainDistanceFt: sw.waterMainDistanceFt ?? (site.utilities?.water === 'no' ? 600 : undefined),
      sewerMainDistanceFt: sw.sewerMainDistanceFt ?? (site.utilities?.sewer === 'no' ? 600 : undefined),
      powerDistanceFt: sw.powerDistanceFt ?? (site.utilities?.power === 'no' ? 600 : undefined),
      stormwaterRequired: sw.stormwaterRequired,
      stateRouteFrontage: site.stateRouteFrontage === 'yes',
      newStreetLf: sw.newStreetLf ?? (input.projectType === 'subdivision' ? Math.round(lotsForSitework * 55) : undefined),
      regionMultiplier: sw.regionMultiplier ?? (market.state === 'VA' ? DIRTBID_REGIONS.VA_HR!.multiplier : 1),
    });
    // The model carries taps, laterals and stormwater, so zero the flat per-unit fee to avoid double counting.
    merged.sitePrepPerLot = sitework.perLot;
    merged.utilityConnectionFeesPerUnit = 0;
  }
  const assumptions = merged;
  const utilities = utilitiesFrom(input);
  const existingSf = fin(input.existingStructureSf);
  const ctx: OverlayContext = { input, rule, site, utilities, lotSizeSf: input.lotSizeSf, existingSf };

  const overlays = market.overlays.flatMap((fn) => fn(ctx));
  const hazards: HazardScreen = market.hazardScreen(ctx);

  // ARV per square foot: explicit > comps > market default × zip band
  const zip = input.zip ?? (input.address?.match(/\b(\d{5})\b/)?.[1] ?? undefined);
  const zipBand = zip && market.zipBands[zip] ? { zip, ...market.zipBands[zip]! } : null;
  const compMedian = input.comps && input.comps.length ? medianPricePerSf(input.comps) : null;
  let arvPerSf: number; let arvSource: UnderwritingResult['comps']['source'];
  if (input.arvPerSf) { arvPerSf = input.arvPerSf; arvSource = 'input'; }
  else if (compMedian) { arvPerSf = compMedian; arvSource = 'comps'; }
  else { arvPerSf = Math.round(market.defaultArvPerSf * (zipBand?.arvMultiplier ?? 1)); arvSource = 'market_default'; }

  const extraCosts = overlays.filter((f) => f.status === 'yes').reduce((s, f) => s + fin(f.costAdder), 0);
  const arvHaircut = overlays.filter((f) => f.status === 'yes').reduce((s, f) => s + fin(f.arvHaircutPct), 0);
  const monthsAdded = overlays.filter((f) => f.status === 'yes').reduce((s, f) => s + fin(f.monthsAdded), 0);
  const blockers = overlays.filter((f) => f.treatment === 'blocker' && f.status === 'yes');

  const specs = buildSpecs(input, market, rule, overlays);
  const scenarios: Scenario[] = specs.map((spec, i) => {
    const isLotsOnly = spec.key === 'finished_lots';
    const pfInput = {
      primaryLivingSf: isLotsOnly ? 0 : spec.primaryLivingSf,
      aduSf: spec.aduSf,
      units: spec.units,
      arvPerSf,
      assumptions: isLotsOnly
        ? { ...assumptions, hardCostPerSf: 0, softCostPct: 0 }
        : assumptions,
      demolitionRequired: spec.demolitionRequired,
      extraCosts: extraCosts * (spec.lots > 1 ? 1 : 1),
      buildCostBumpPct: hazards.buildCostBumpPct,
      maxOfferHaircutPct: hazards.maxOfferHaircutPct,
      arvHaircutPct: arvHaircut,
      lots: spec.lots,
    };
    let pf = proForma(pfInput);
    if (isLotsOnly) {
      // Lot revenue = 22% of finished home value per lot; no vertical cost.
      const homeValue = (fin(input.targetHomeSf) || assumptions.defaultHomeSf) * arvPerSf;
      const lotRevenue = spec.units * homeValue * 0.22 * (1 - clamp(arvHaircut, 0, 0.9));
      const commission = lotRevenue * 0.03; const closing = lotRevenue * assumptions.closingPct;
      const z = 1 + assumptions.targetRoi;
      const rawOffer = (lotRevenue - commission - closing - z * pf.costs.total) / z;
      const maxOffer = Math.max(0, rawOffer * (1 - hazards.maxOfferHaircutPct));
      const totalInvestment = maxOffer + pf.costs.total;
      const profit = lotRevenue - commission - closing - totalInvestment;
      pf = { ...pf, arv: round0(lotRevenue), arvPerSfUsed: arvPerSf, saleCosts: { commission: round0(commission), closing: round0(closing), total: round0(commission + closing) }, maxOffer: round0(maxOffer), totalInvestment: round0(totalInvestment), profit: round0(profit), roi: totalInvestment > 0 ? Number((profit / totalInvestment).toFixed(4)) : 0, marginOnArv: lotRevenue > 0 ? Number((profit / lotRevenue).toFixed(4)) : 0 };
    }
    let tier = spec.permitTier;
    for (const f of overlays) if (f.status === 'yes' && f.permitTier && f.treatment !== 'upside_only') tier = worsePermitTier(tier, f.permitTier);
    if (blockers.length && spec.key !== 'sb9_density') tier = worsePermitTier(tier, 'rezoning');
    const permitMonths = Math.max(1, market.permitMonths[tier] + monthsAdded + (spec.monthsAdjust ?? 0));
    const viable = scenarioViable(pf);
    let confidence: Confidence = spec.baseConfidence;
    if (hazards.manualReviewRequired && confidence === 'high') confidence = 'moderate';
    if (!viable) confidence = 'low';
    const flags = overlays.filter((f) => f.status !== 'no' && (f.treatment === 'constraint' || f.treatment === 'blocker' || f.treatment === 'cost_adder')).map((f) => f.name);
    return {
      id: i + 1, key: spec.key, name: spec.name, tag: spec.tag, description: spec.description, units: spec.units,
      primaryLivingSf: spec.primaryLivingSf, aduSf: spec.aduSf, totalBuildableSf: spec.primaryLivingSf + spec.aduSf,
      arvPerSfUsed: pf.arvPerSfUsed, arv: pf.arv, costs: pf.costs, saleCosts: pf.saleCosts, maxOffer: pf.maxOffer,
      totalInvestment: pf.totalInvestment, profit: pf.profit, roi: pf.roi, marginOnArv: pf.marginOnArv,
      permitTier: tier, permitMonths, buildMonths: assumptions.buildMonths * (spec.lots > 1 ? 1.5 : 1), confidence, viable,
      assumptions: spec.assumptions, flags,
    };
  });

  // Recommendation: viable first, then the easiest approval path, then confidence-weighted profit.
  const tierRank = (t: PermitTier) => ({ ministerial_expedited: 0, ministerial: 0, administrative_review: 1, discretionary: 2, rezoning: 3 }[t]);
  const confW = (c: Confidence) => (c === 'high' ? 1 : c === 'moderate' ? 0.85 : 0.6);
  const recommended = [...scenarios].sort((a, b) => {
    if (a.viable !== b.viable) return a.viable ? -1 : 1;
    const ta = tierRank(a.permitTier), tb = tierRank(b.permitTier);
    if (ta !== tb && a.viable) return ta - tb;
    return b.profit * confW(b.confidence) - a.profit * confW(a.confidence);
  })[0]!;
  const rationale = recommended.viable
    ? `${recommended.name} is the cleanest underwriting basis: ${recommended.confidence} confidence, ${recommended.permitTier.replace(/_/g, ' ')} approval, ${Math.round(recommended.roi * 100)}% ROI at a $${recommended.maxOffer.toLocaleString()} max offer.`
    : `No scenario clears the ${Math.round(assumptions.targetRoi * 100)}% target return at current assumptions. ${recommended.name} is the least negative; revisit ARV, costs or acquisition basis before proceeding.`;

  const scores = score({ input, rule, overlays, hazards, utilities, recommended, scenarios, approvalBaseRate: market.approvalBaseRate, targetRoi: assumptions.targetRoi });

  const recSpec = specs[recommended.id - 1]!;
  const sens = sensitivity(recSpec, { primaryLivingSf: recSpec.primaryLivingSf, aduSf: recSpec.aduSf, units: recSpec.units, arvPerSf, assumptions, demolitionRequired: recSpec.demolitionRequired, extraCosts, buildCostBumpPct: hazards.buildCostBumpPct, maxOfferHaircutPct: hazards.maxOfferHaircutPct, arvHaircutPct: arvHaircut, lots: recSpec.lots });

  const env = overlays.filter((f) => (f.category === 'environmental' || f.category === 'hazard') && f.status !== 'no');
  const envItems = env.map((f) => `${f.name}: ${f.reason}`);
  const units = maxUnits(rule, input.lotSizeSf);
  const checklist: VerifyItem[] = [
    ...overlays.filter((f) => f.verifyItem).map<VerifyItem>((f) => ({ item: f.verifyItem!, why: f.name, owner: f.category === 'environmental' || f.category === 'transportation' ? 'engineer' : f.category === 'entitlement' || f.category === 'state_density' ? 'jurisdiction' : 'dirtbid', priority: f.treatment === 'blocker' || f.treatment === 'constraint' ? 'high' : 'medium' })),
    { item: 'Title report and recorded easements', why: 'Easements and dedications shrink the buildable envelope.', owner: 'attorney', priority: 'high' },
    { item: 'Boundary and topographic survey', why: 'Setbacks and grading depend on real lot geometry.', owner: 'engineer', priority: 'high' },
    { item: arvSource === 'market_default' ? 'Pull 3–6 closed comps within 1 mile / 6 months' : 'Confirm comps are arm\'s-length and post-renovation', why: 'ARV drives every number in the pro forma.', owner: 'dirtbid', priority: 'high' },
    { item: 'Utility availability letter', why: 'Tap fees and extension costs are lumpy.', owner: 'owner', priority: 'medium' },
  ];
  if (!rule) checklist.unshift({ item: `Confirm zoning district for "${input.zoningCode}" with the locality`, why: 'Zoning code not recognized in this market config.', owner: 'jurisdiction', priority: 'high' });

  return {
    version: ENGINE_VERSION,
    generatedAt: now.toISOString(),
    input,
    assumptions,
    sitework,
    market: { code: market.code, name: market.name, state: market.state, jurisdiction: market.jurisdiction, zipBand: zipBand ? { zip: zipBand.zip, area: zipBand.area, label: zipBand.label } : null },
    zoning: { recognized: !!rule, rule, baseUnits: units.base, maxUnitsEstimate: Math.max(units.max, ...scenarios.filter((s) => s.viable && s.confidence !== 'low').map((s) => s.units), 0), maxUnitsLabel: units.label },
    overlays,
    hazards,
    utilities: { ...utilitiesSummary(utilities), detail: utilities },
    environmental: { summary: envItems.length ? `${envItems.length} constraint${envItems.length > 1 ? 's' : ''} identified.` : 'No environmental constraints flagged from inputs.', constraintsIdentified: envItems.length > 0, items: envItems },
    comps: { summary: arvSource === 'comps' ? `${input.comps!.length} comps analyzed; median $${compMedian}/sf.` : arvSource === 'input' ? `ARV of $${arvPerSf}/sf supplied by analyst.` : `No comps supplied; market default $${arvPerSf}/sf${zipBand ? ` (${zipBand.area} band)` : ''}.`, count: input.comps?.length ?? 0, medianPricePerSf: compMedian, arvPerSfUsed: arvPerSf, source: arvSource },
    scenarios,
    recommended: { scenarioId: recommended.id, key: recommended.key, rationale },
    scores,
    sensitivity: sens,
    checklist,
    disclaimers: [
      'Screening-level analysis from public rules and user inputs. Not a survey, appraisal, title opinion or engineering report.',
      market.calibrationNote,
      'Max offer is the residual land value at the target ROI after all modeled costs; it is a ceiling, not a recommended bid.',
    ],
  };
}
