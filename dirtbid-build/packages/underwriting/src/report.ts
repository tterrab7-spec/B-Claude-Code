import type { UnderwritingResult } from './types.js';

/**
 * Report presenter: turns an UnderwritingResult into the sections a
 * "Feasibility Lite" one-pager or an "Enhanced" report renders. Keeps the
 * display logic out of the engine so web, PDF and email use one source.
 */
export interface ReportSection {
  key: string;
  title: string;
  status: 'ok' | 'warn' | 'bad' | 'info';
  headline: string;
  lines: string[];
}

export interface FeasibilityReport {
  tier: 'lite' | 'enhanced';
  title: string;
  subtitle: string;
  address: string;
  gauges: {
    approvalProbability: { value: number; label: string; caption: string };
    valueMaximization: { value: number; max: 10; caption: string };
    risk: { level: 'low' | 'moderate' | 'high'; caption: string };
  };
  callouts: { label: string; value: string }[];
  sections: ReportSection[];
  scenarios: UnderwritingResult['scenarios'];
  recommended: UnderwritingResult['recommended'];
  sensitivity: UnderwritingResult['sensitivity'];
  checklist: UnderwritingResult['checklist'];
  disclaimers: string[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function buildReport(r: UnderwritingResult, tier: 'lite' | 'enhanced' = 'lite'): FeasibilityReport {
  const rec = r.scenarios.find((s) => s.id === r.recommended.scenarioId)!;
  const u = r.utilities;
  const sections: ReportSection[] = [
    {
      key: 'zoning', title: 'Zoning & Density',
      status: r.zoning.recognized ? 'ok' : 'warn',
      headline: r.zoning.recognized ? `${r.zoning.rule!.code}: ${r.zoning.maxUnitsEstimate} unit${r.zoning.maxUnitsEstimate === 1 ? '' : 's'} buildable` : `Zoning "${r.input.zoningCode}" needs confirmation`,
      lines: r.zoning.rule ? [r.zoning.rule.label, `Min lot ${r.zoning.rule.minLotSf.toLocaleString()} sf · height ${r.zoning.rule.heightRule}`, `Setbacks F ${r.zoning.rule.setbacks.front} / S ${r.zoning.rule.setbacks.side} / R ${r.zoning.rule.setbacks.rear}`] : ['Verify district with the locality before relying on density.'],
    },
    {
      key: 'utilities', title: 'Utilities',
      status: u.connectable === 'yes' ? 'ok' : u.connectable === 'no' ? 'bad' : 'warn',
      headline: u.connectable === 'yes' ? 'Connectable' : u.connectable === 'no' ? 'Extension or on-site systems required' : 'Availability unconfirmed',
      lines: [u.summary, `Water ${u.detail.water} · Sewer ${u.detail.sewer} · Power ${u.detail.power}`],
    },
    {
      key: 'environmental', title: 'Environmental',
      status: r.environmental.constraintsIdentified ? 'warn' : 'ok',
      headline: r.environmental.constraintsIdentified ? 'Constraints identified' : 'No constraints flagged',
      lines: r.environmental.items.length ? r.environmental.items : [r.hazards.note],
    },
    {
      key: 'comps', title: 'Comp Sales',
      status: r.comps.source === 'market_default' ? 'warn' : 'ok',
      headline: r.comps.source === 'market_default' ? 'Using market default' : 'Data analyzed',
      lines: [r.comps.summary, `ARV used: $${r.comps.arvPerSfUsed}/sf`],
    },
  ];
  if (tier === 'enhanced') {
    sections.push({
      key: 'proforma', title: 'Pro Forma (recommended scenario)', status: rec.viable ? 'ok' : 'bad',
      headline: `${rec.name}: ${usd(rec.profit)} profit, ${pct(rec.roi)} ROI`,
      lines: [
        `ARV ${usd(rec.arv)} on ${rec.totalBuildableSf.toLocaleString()} sf at $${rec.arvPerSfUsed}/sf`,
        `Hard ${usd(rec.costs.hard + rec.costs.adu)} · Soft ${usd(rec.costs.soft)} · Site/fees ${usd(rec.costs.sitePrep + rec.costs.fees + rec.costs.demo)} · Contingency ${usd(rec.costs.contingency)} · Financing ${usd(rec.costs.financing)}`,
        `Sale costs ${usd(rec.saleCosts.total)} · Max offer ${usd(rec.maxOffer)} · Total investment ${usd(rec.totalInvestment)}`,
        `Permit ${rec.permitMonths} mo (${rec.permitTier.replace(/_/g, ' ')}) + build ${rec.buildMonths} mo`,
      ],
    });
    sections.push({
      key: 'overlays', title: 'Entitlement Overlays & Flags', status: r.overlays.some((f) => f.treatment === 'blocker' && f.status === 'yes') ? 'bad' : 'info',
      headline: `${r.overlays.length} rule${r.overlays.length === 1 ? '' : 's'} evaluated`,
      lines: r.overlays.map((f) => `${f.status.toUpperCase()} · ${f.name}: ${f.reason}`),
    });
  }
  return {
    tier,
    title: tier === 'lite' ? 'Feasibility Lite Report: Land Potential Analysis' : 'Enhanced Feasibility Report',
    subtitle: `${r.market.name} · ${r.market.jurisdiction}`,
    address: r.input.address ?? 'Address not provided',
    gauges: {
      approvalProbability: { value: r.scores.approvalProbability, label: r.scores.approvalLabel, caption: 'Based on district rules, overlays and comparable approvals' },
      valueMaximization: { value: r.scores.valueMaximization, max: 10, caption: `${rec.name} vs. ${pct(r.input.assumptions?.targetRoi ?? 0) || 'target'} return` },
      risk: { level: r.scores.riskLevel, caption: r.scores.riskReasons[0] ?? 'No material risks flagged' },
    },
    callouts: [
      { label: 'Current zoning', value: r.zoning.rule?.code ?? r.input.zoningCode },
      { label: 'Max density', value: `${r.zoning.maxUnitsEstimate} unit${r.zoning.maxUnitsEstimate === 1 ? '' : 's'}` },
      { label: 'Potential units', value: String(rec.units) },
      { label: 'Max offer', value: usd(rec.maxOffer) },
      { label: 'Projected ARV', value: usd(rec.arv) },
      { label: 'Projected ROI', value: pct(rec.roi) },
    ],
    sections,
    scenarios: r.scenarios,
    recommended: r.recommended,
    sensitivity: r.sensitivity,
    checklist: r.checklist,
    disclaimers: r.disclaimers,
  };
}
