/**
 * Sitework estimator — the "what does the dirt cost" line that DirtBid AI
 * prices at bid grade. This is the feasibility-grade version: CSI 01/02/31/32/33
 * line items from parcel facts so a landowner gets a defensible number before
 * a plan exists. When a DirtBid Land Screening exists for the parcel, pass its
 * total through `UnderwritingInput.assumptions.sitePrepPerLot` and this is
 * bypassed; the result records which source was used.
 *
 * Unit costs are Richmond Metro = 1.00 baseline, multiplied by DirtBid's
 * regional factor (Hampton Roads 0.98, Northern Virginia 1.18, ...).
 */

export interface SiteworkInput {
  lotSizeSf: number;
  lots?: number;
  /** Share of the disturbed area that is wooded (0–1). Default 0.4 when unknown; 0.8 for a wooded lot, 0.1 for a cleared one. */
  treeCoverPct?: number;
  slopePct?: number;
  soils?: 'stable' | 'marginal' | 'poor' | 'unknown';
  hydric?: boolean;
  wetlandsAcres?: number;
  floodZone?: string;
  existingStructureSf?: number;
  demolitionRequired?: boolean;
  /** Distance from the lot line to the nearest water / sewer / power, feet. 0 = at the line. */
  waterMainDistanceFt?: number;
  sewerMainDistanceFt?: number;
  powerDistanceFt?: number;
  /** Stormwater management required (VA: any land disturbance ≥ 2,500 sf in CBPA areas, ≥ 10,000 sf elsewhere) */
  stormwaterRequired?: boolean;
  /** Frontage on a state route (VDOT entrance) */
  stateRouteFrontage?: boolean;
  /** New public street length for a subdivision, LF */
  newStreetLf?: number;
  /** DirtBid regional multiplier, Richmond Metro = 1.00 */
  regionMultiplier?: number;
  /** Markup waterfall; defaults match a feasibility (not bid) grade */
  markup?: { mobilizationPct?: number; contingencyPct?: number; overheadPct?: number; profitPct?: number; bondPct?: number };
}

export interface SiteworkLine {
  csi: string;            // e.g. "31 23 16"
  division: '01' | '02' | '31' | '32' | '33';
  item: string;
  qty: number;
  unit: 'LS' | 'AC' | 'CY' | 'SY' | 'LF' | 'EA' | 'SF';
  unitCost: number;
  total: number;
  note?: string;
}

export interface SiteworkEstimate {
  grade: 'feasibility';
  source: 'dirtbid_build_model' | 'dirtbid_land_screening';
  regionMultiplier: number;
  lines: SiteworkLine[];
  byDivision: { division: string; name: string; total: number; pct: number }[];
  directCost: number;
  waterfall: { label: string; amount: number }[];
  total: number;
  perLot: number;
  riskScore: number;        // 0–100, higher = more sitework risk
  riskLabel: 'Low' | 'Moderate' | 'High';
  flags: string[];
}

const DIV_NAMES: Record<string, string> = { '01': 'General Requirements', '02': 'Existing Conditions', '31': 'Earthwork', '32': 'Exterior Improvements', '33': 'Utilities' };

/** Richmond-baseline unit costs (2026 planning level). */
const UC = {
  clearGrubAc: 6500,
  stripTopsoilCy: 4.2,
  roughGradeCy: 6.8,
  undercutReplaceCy: 34,
  fineGradeSf: 0.18,
  erosionControlLs: 4800,
  constructionEntranceEa: 2600,
  siltFenceLf: 3.1,
  demoSf: 7.5,
  demoFoundationLs: 9000,
  drivewaySy: 48,
  sidewalkLf: 38,
  vdotEntranceEa: 12000,
  bioretentionLs: 28000,
  dryWellLs: 9500,
  stormPipeLf: 68,
  waterLateralLf: 62,
  sewerLateralLf: 74,
  grinderPumpEa: 9800,
  powerConduitLf: 22,
  tapFeesWaterSewerEa: 9500,
  streetLf: 420,
  mobilizationLs: 3500,
  surveyStakeoutLs: 2800,
  dewateringLs: 6500,
  floodFillCy: 28,
};

const round = (n: number) => Math.round(n);

export function estimateSitework(i: SiteworkInput): SiteworkEstimate {
  const lots = Math.max(1, i.lots ?? 1);
  const lotAc = i.lotSizeSf / 43560;
  const m = i.regionMultiplier ?? 1;
  const slope = i.slopePct ?? 2;
  const treeCover = i.treeCoverPct ?? 0.4;
  const soils = i.soils ?? 'unknown';
  const flags: string[] = [];
  const L: SiteworkLine[] = [];
  const add = (csi: string, division: SiteworkLine['division'], item: string, qty: number, unit: SiteworkLine['unit'], unitCost: number, note?: string) => {
    if (qty <= 0) return;
    const q = Number(qty.toFixed(2));
    const uc = round(unitCost * m * 100) / 100;
    L.push({ csi, division, item, qty: q, unit, unitCost: uc, total: round(q * uc), note });
  };

  // 01 General requirements
  add('01 71 23', '01', 'Mobilization & temporary facilities', lots, 'LS', UC.mobilizationLs);
  add('01 71 23', '01', 'Construction survey & stakeout', lots, 'LS', UC.surveyStakeoutLs);

  // 02 Existing conditions
  if (i.demolitionRequired && (i.existingStructureSf ?? 0) > 0) {
    add('02 41 16', '02', 'Structure demolition & haul-off', i.existingStructureSf!, 'SF', UC.demoSf);
    add('02 41 16', '02', 'Foundation / slab removal', 1, 'LS', UC.demoFoundationLs);
  }

  // 31 Earthwork
  // One house disturbs a pad, drive and yard (~0.3–0.45 ac) whatever the lot size; a subdivision disturbs most of the tract.
  const disturbedAc = lots > 1 ? lotAc * 0.85 : Math.min(lotAc, Math.max(0.2, Math.min(0.45, lotAc * 0.5)));
  const clearAc = disturbedAc * treeCover;
  add('31 11 00', '31', 'Clearing & grubbing', clearAc, 'AC', UC.clearGrubAc, treeCover >= 0.5 ? 'Wooded lot; verify with aerial' : 'Tree cover unknown; 40% assumed');
  const stripCy = (disturbedAc * 43560 * 0.5) / 27; // 6 in topsoil
  add('31 14 13', '31', 'Strip & stockpile topsoil (6 in)', stripCy, 'CY', UC.stripTopsoilCy);
  const gradeDepthFt = 0.5 + Math.max(0, slope - 2) * 0.12;
  const gradeCy = (disturbedAc * 43560 * gradeDepthFt) / 27;
  add('31 22 13', '31', 'Rough grading, cut/fill on site', gradeCy, 'CY', UC.roughGradeCy, slope > 8 ? `Slope ${slope}% drives balance` : undefined);
  if (soils === 'poor' || i.hydric) {
    const undercutCy = (Math.min(disturbedAc, 0.35 * lots) * 43560 * 2) / 27; // 2 ft under pads and drives
    add('31 23 23', '31', 'Undercut unsuitable & replace with select fill', undercutCy, 'CY', UC.undercutReplaceCy, 'Hydric / poorly drained soils; geotech to confirm');
    flags.push('Unsuitable soils likely: undercut and select fill carried');
    if (i.hydric) { add('31 23 19', '31', 'Dewatering allowance', 1, 'LS', UC.dewateringLs); flags.push('High water table: dewatering allowance'); }
  } else if (soils === 'marginal') {
    const undercutCy = (Math.min(disturbedAc, 0.2 * lots) * 43560 * 1) / 27;
    add('31 23 23', '31', 'Undercut allowance, marginal soils', undercutCy, 'CY', UC.undercutReplaceCy);
    flags.push('Marginal soils: 1 ft undercut allowance under pads');
  } else if (soils === 'unknown') {
    flags.push('Soils unknown: no undercut carried. Order a DirtBid Soil Report ($350) before pricing the dirt.');
  }
  const fz = (i.floodZone ?? '').toUpperCase();
  if (fz.startsWith('A') || fz.startsWith('V')) {
    const fillCy = (0.12 * lots * 43560 * 2.5) / 27; // raise pad 2.5 ft over ~5,200 sf
    add('31 24 00', '31', 'Structural fill to raise pad above BFE + freeboard', fillCy, 'CY', UC.floodFillCy, `Zone ${fz}`);
    flags.push(`Flood zone ${fz}: pad fill and elevation certificate`);
  }
  add('31 25 00', '31', 'Erosion & sediment control (plan, maintenance, stabilization)', lots, 'LS', UC.erosionControlLs);
  add('31 25 14', '31', 'Silt fence', Math.sqrt(disturbedAc * 43560) * 3.2, 'LF', UC.siltFenceLf);
  add('31 25 14', '31', 'Stabilized construction entrance', lots > 1 ? 2 : 1, 'EA', UC.constructionEntranceEa);
  add('31 22 19', '31', 'Fine grading & topsoil respread', disturbedAc * 43560 * 0.4, 'SF', UC.fineGradeSf);

  // 32 Exterior improvements
  if (i.newStreetLf && i.newStreetLf > 0) {
    add('32 12 16', '32', 'New public street (VDOT SSAR section, curb & gutter)', i.newStreetLf, 'LF', UC.streetLf, 'Includes storm, not water/sewer mains');
    add('32 16 13', '32', 'Sidewalk, one side', i.newStreetLf, 'LF', UC.sidewalkLf);
  }
  add('32 12 16', '32', 'Driveway apron & drive, asphalt or concrete', 85 * lots, 'SY', UC.drivewaySy);
  if (i.stateRouteFrontage) { add('32 17 00', '32', 'VDOT entrance, sight distance & permit', 1, 'EA', UC.vdotEntranceEa); flags.push('VDOT entrance permit'); }

  // 33 Utilities
  if (i.stormwaterRequired ?? true) {
    if (lots > 1) add('33 46 00', '33', 'Stormwater management facility (bioretention / dry pond)', Math.max(1, Math.ceil(lots / 12)), 'LS', UC.bioretentionLs, 'VSMP: quantity + quality');
    else add('33 46 00', '33', 'On-lot stormwater (dry well / rain garden)', 1, 'LS', UC.dryWellLs, 'VSMP / CBPA land disturbance');
    add('33 41 00', '33', 'Storm drainage pipe & structures', 60 * lots, 'LF', UC.stormPipeLf);
  }
  const wd = i.waterMainDistanceFt ?? 40, sd = i.sewerMainDistanceFt ?? 40, pd = i.powerDistanceFt ?? 40;
  add('33 11 00', '33', 'Water service lateral', wd * lots, 'LF', UC.waterLateralLf);
  add('33 31 00', '33', 'Sanitary sewer lateral', sd * lots, 'LF', UC.sewerLateralLf);
  if (sd > 300) { add('33 32 00', '33', 'Grinder pump / low-pressure sewer', lots, 'EA', UC.grinderPumpEa); flags.push('Sewer main > 300 ft: grinder pump carried'); }
  add('33 71 00', '33', 'Electrical service conduit & trench', pd * lots, 'LF', UC.powerConduitLf);
  add('33 05 00', '33', 'Water & sewer tap / availability fees', lots, 'EA', UC.tapFeesWaterSewerEa, 'Locality + HRSD; verify schedule');
  if ((i.wetlandsAcres ?? 0) > 0) flags.push(`${i.wetlandsAcres} ac wetlands: excluded from disturbance; mitigation priced in entitlement overlays`);

  const directCost = L.reduce((s, l) => s + l.total, 0);
  const mk = { mobilizationPct: 0.04, contingencyPct: 0.10, overheadPct: 0.10, profitPct: 0.08, bondPct: 0.015, ...(i.markup ?? {}) };
  const mob = round(directCost * mk.mobilizationPct);
  const cont = round(directCost * mk.contingencyPct);
  const sub1 = directCost + mob + cont;
  const oh = round(sub1 * mk.overheadPct);
  const profit = round((sub1 + oh) * mk.profitPct);
  const bond = round((sub1 + oh + profit) * mk.bondPct);
  const total = sub1 + oh + profit + bond;

  const divTotals = new Map<string, number>();
  for (const l of L) divTotals.set(l.division, (divTotals.get(l.division) ?? 0) + l.total);
  const byDivision = [...divTotals.entries()].sort().map(([division, t]) => ({ division, name: DIV_NAMES[division] ?? division, total: t, pct: directCost ? Math.round((t / directCost) * 100) : 0 }));

  let risk = 20;
  if (soils === 'poor') risk += 35; else if (soils === 'marginal') risk += 18; else if (soils === 'unknown') risk += 15;
  if (i.hydric) risk += 10;
  if (fz.startsWith('V')) risk += 25; else if (fz.startsWith('A')) risk += 15;
  if (slope > 8) risk += 10;
  if ((i.wetlandsAcres ?? 0) > 0) risk += 10;
  if (sd > 300) risk += 5;
  risk = Math.min(100, risk);

  return {
    grade: 'feasibility',
    source: 'dirtbid_build_model',
    regionMultiplier: m,
    lines: L,
    byDivision,
    directCost,
    waterfall: [
      { label: 'Direct cost', amount: directCost },
      { label: `Mobilization ${Math.round(mk.mobilizationPct * 100)}% · Contingency ${Math.round(mk.contingencyPct * 100)}%`, amount: mob + cont },
      { label: `Overhead ${Math.round(mk.overheadPct * 100)}%`, amount: oh },
      { label: `Profit ${Math.round(mk.profitPct * 100)}%`, amount: profit },
      { label: `Bond ${(mk.bondPct * 100).toFixed(1)}%`, amount: bond },
      { label: 'Total', amount: total },
    ],
    total,
    perLot: round(total / lots),
    riskScore: risk,
    riskLabel: risk >= 60 ? 'High' : risk >= 35 ? 'Moderate' : 'Low',
    flags,
  };
}

/** DirtBid regional multipliers (Richmond Metro = 1.00). */
export const DIRTBID_REGIONS: Record<string, { name: string; multiplier: number }> = {
  VA_NOVA: { name: 'Northern Virginia', multiplier: 1.18 },
  VA_FRED: { name: 'Fredericksburg / Northern Piedmont', multiplier: 1.08 },
  VA_RIC: { name: 'Richmond Metro', multiplier: 1.0 },
  VA_HR: { name: 'Hampton Roads', multiplier: 0.98 },
  VA_NNMP: { name: 'Northern Neck / Middle Peninsula / Eastern Shore', multiplier: 1.04 },
  VA_CSP: { name: 'Central & Southside Piedmont', multiplier: 0.9 },
  VA_SHEN: { name: 'Shenandoah Valley / Blue Ridge', multiplier: 0.95 },
  VA_SW: { name: 'Southwest Virginia', multiplier: 0.9 },
};
