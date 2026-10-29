import type { HazardScreen, OverlayFlag, Scenario, Scores, UnderwritingInput, Utilities, ZoningRule } from './types.js';
import { clamp } from './math.js';

export interface ScoreContext {
  input: UnderwritingInput;
  rule: ZoningRule | null;
  overlays: OverlayFlag[];
  hazards: HazardScreen;
  utilities: Utilities;
  recommended: Scenario;
  scenarios: Scenario[];
  approvalBaseRate: number;
  targetRoi: number;
}

/** Approval probability, value-maximization and risk — the three gauges on the report. */
export function score(ctx: ScoreContext): Scores {
  const reasons: string[] = [];
  let approval = ctx.approvalBaseRate;

  if (!ctx.rule) {
    approval -= 40;
    reasons.push('Zoning code not recognized for this market; manual planning review required.');
  }
  const tier = ctx.recommended.permitTier;
  if (tier === 'ministerial_expedited') approval += 8;
  if (tier === 'administrative_review') approval -= 8;
  if (tier === 'discretionary') { approval -= 22; reasons.push('Recommended path needs a discretionary approval.'); }
  if (tier === 'rezoning') { approval -= 38; reasons.push('Recommended path requires rezoning or a legislative approval.'); }

  for (const f of ctx.overlays) {
    if (f.treatment === 'blocker' && f.status === 'yes') { approval -= 25; reasons.push(f.name + ': ' + f.reason); }
    if (f.treatment === 'constraint' && f.status === 'yes') { approval -= 6; reasons.push(f.name); }
    if (f.treatment === 'cost_adder' && f.status === 'yes') { approval -= 3; }
    if (f.status === 'unknown' && f.treatment !== 'note') approval -= 2;
  }

  const u = ctx.utilities;
  if (u.sewer === 'no') { approval -= 10; reasons.push('No public sewer: septic feasibility and health-department approval needed.'); }
  if (u.water === 'no') { approval -= 8; reasons.push('No public water: well permit required.'); }
  if (u.sewer === 'unknown' || u.water === 'unknown' || u.power === 'unknown') approval -= 3;

  if (ctx.hazards.manualReviewRequired) { approval -= 5; reasons.push(ctx.hazards.note); }

  const site = ctx.input.site ?? {};
  const fz = (site.floodZone ?? '').toUpperCase();
  if (fz.startsWith('V')) { approval -= 20; reasons.push('Coastal high-hazard flood zone (V): elevated foundation and insurance drive cost.'); }
  else if (fz.startsWith('A')) { approval -= 10; reasons.push('Special flood hazard area (A/AE): elevation certificate and freeboard required.'); }
  if ((site.wetlandsAcres ?? 0) > 0) { approval -= 8; reasons.push('Wetlands on site: delineation and mitigation or avoidance required.'); }
  if (site.rpaBuffer === 'yes') { approval -= 8; reasons.push('Chesapeake Bay RPA buffer limits the buildable envelope.'); }
  if (site.historic === 'yes') { approval -= 12; reasons.push('Historic designation adds design review.'); }
  if (site.soils === 'poor') { approval -= 6; reasons.push('Poor soils: geotechnical report and engineered foundation likely.'); }
  if ((site.slopePct ?? 0) > 15 || site.hillside) { approval -= 5; reasons.push('Hillside / steep slope conditions.'); }

  approval = clamp(Math.round(approval), 5, 97);
  const approvalLabel: Scores['approvalLabel'] = approval >= 70 ? 'HIGH' : approval >= 45 ? 'MODERATE' : 'LOW';

  // Value maximization: how far the recommended path beats the target return and
  // whether cheap density upside is on the table.
  const r = ctx.recommended;
  let value = 5;
  if (ctx.targetRoi > 0) value += clamp(((r.roi - ctx.targetRoi) / ctx.targetRoi) * 4, -3, 3);
  if (r.aduSf > 0) value += 1;
  const upside = ctx.overlays.some((f) => f.treatment === 'upside_only' && f.status !== 'no');
  if (upside) value += 0.5;
  const bestViable = ctx.scenarios.filter((s) => s.viable).sort((a, b) => b.profit - a.profit)[0];
  if (bestViable && bestViable.id !== r.id && bestViable.profit > r.profit * 1.25) value += 0.5;
  if (!r.viable) value = Math.min(value, 2.5);
  value = clamp(Number(value.toFixed(1)), 0, 10);

  const riskScore = reasons.length + (r.viable ? 0 : 3) + (ctx.hazards.manualReviewRequired ? 1 : 0);
  const riskLevel = riskScore <= 1 ? 'low' : riskScore <= 4 ? 'moderate' : 'high';

  return { approvalProbability: approval, approvalLabel, valueMaximization: value, riskLevel, riskReasons: reasons };
}
