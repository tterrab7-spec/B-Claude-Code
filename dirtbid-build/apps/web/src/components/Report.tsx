import type { FeasibilityReport, Scenario, UnderwritingResult } from '@dirtbid/underwriting';
import { CheckCircle2, AlertTriangle, XCircle, Info, Printer } from 'lucide-react';
import { usd, pct, num } from '@/lib/format';
import { Badge } from './ui';
import { SiteworkCard } from './Sitework';

export function Gauge({ value, label, caption }: { value: number; label: string; caption: string }) {
  const r = 44; const c = Math.PI * r; const v = Math.max(0, Math.min(100, value));
  const color = v >= 70 ? 'rgb(var(--c-ok))' : v >= 45 ? 'rgb(var(--c-warn))' : 'rgb(var(--c-bad))';
  return (
    <div className="text-center">
      <svg viewBox="0 0 120 70" className="mx-auto w-40" role="img" aria-label={`Approval probability ${v}%`}>
        <path d="M16 62 A44 44 0 0 1 104 62" fill="none" stroke="rgb(var(--c-line))" strokeWidth="10" strokeLinecap="round" />
        <path d="M16 62 A44 44 0 0 1 104 62" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
        <text x="60" y="58" textAnchor="middle" className="fill-ink" fontSize="22" fontWeight="700">{v}%</text>
      </svg>
      <p className="text-xs font-bold uppercase tracking-wide">Approval probability: <span style={{ color }}>{label}</span></p>
      <p className="mt-1 text-[11px] text-muted">{caption}</p>
    </div>
  );
}

export function ValueBars({ value, caption }: { value: number; caption: string }) {
  const bars = [2, 4, 6, 8, 10];
  return (
    <div className="text-center">
      <div className="mx-auto flex h-16 w-40 items-end justify-center gap-2" role="img" aria-label={`Value maximization ${value} of 10`}>
        {bars.map((b, i) => <div key={b} className={`w-6 rounded-t ${value >= b - 1 ? 'bg-blueprint' : 'bg-line'}`} style={{ height: `${28 + i * 16}%` }} />)}
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide">Value maximization: <span className="text-blueprint">{value}/10</span></p>
      <p className="mt-1 text-[11px] text-muted">{caption}</p>
    </div>
  );
}

export function RiskLight({ level, caption }: { level: 'low' | 'moderate' | 'high'; caption: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex w-40 items-center justify-center gap-3 rounded-full bg-soil px-4 py-3" role="img" aria-label={`Risk ${level}`}>
        <span className={`h-5 w-5 rounded-full ${level === 'high' ? 'bg-bad shadow-[0_0_12px_rgb(var(--c-bad))]' : 'bg-white/10'}`} />
        <span className={`h-5 w-5 rounded-full ${level === 'moderate' ? 'bg-warn shadow-[0_0_12px_rgb(var(--c-warn))]' : 'bg-white/10'}`} />
        <span className={`h-5 w-5 rounded-full ${level === 'low' ? 'bg-ok shadow-[0_0_12px_rgb(var(--c-ok))]' : 'bg-white/10'}`} />
      </div>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide">Risk assessment: <span className={level === 'low' ? 'text-ok' : level === 'moderate' ? 'text-warn' : 'text-bad'}>{level}</span></p>
      <p className="mt-1 text-[11px] text-muted line-clamp-2">{caption}</p>
    </div>
  );
}

const statusIcon = { ok: <CheckCircle2 className="h-4 w-4 text-ok" />, warn: <AlertTriangle className="h-4 w-4 text-warn" />, bad: <XCircle className="h-4 w-4 text-bad" />, info: <Info className="h-4 w-4 text-blueprint" /> };

export function ScenarioCard({ s, recommended }: { s: Scenario; recommended: boolean }) {
  const tone = s.confidence === 'high' ? 'ok' : s.confidence === 'moderate' ? 'warn' : 'bad';
  return (
    <div className={`card p-5 ${recommended ? 'ring-2 ring-stake' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-[11px] font-bold uppercase tracking-wide text-muted">{s.tag}</p><h4 className="font-bold">{s.name}</h4></div>
        <div className="flex gap-1">{recommended && <Badge tone="stake">Recommended</Badge>}<Badge tone={tone}>{s.confidence}</Badge></div>
      </div>
      <p className="mt-2 text-sm text-muted">{s.description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Max offer</dt><dd className="mono text-lg font-bold">{usd(s.maxOffer)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">ARV</dt><dd className="mono text-lg font-bold">{usd(s.arv)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Total costs</dt><dd className="mono">{usd(s.costs.total)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Profit</dt><dd className={`mono ${s.profit >= 0 ? 'text-ok' : 'text-bad'}`}>{usd(s.profit)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">ROI</dt><dd className="mono">{pct(s.roi)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Units / sf</dt><dd className="mono">{s.units} / {num(s.totalBuildableSf)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Permit path</dt><dd className="capitalize">{s.permitTier.replace(/_/g, ' ')} · {s.permitMonths} mo</dd></div>
        <div><dt className="text-[11px] uppercase tracking-wide text-muted">Build</dt><dd>{s.buildMonths} mo</dd></div>
      </dl>
      <details className="mt-3 text-xs text-muted"><summary className="cursor-pointer font-semibold">Cost stack & assumptions</summary>
        <ul className="mt-2 space-y-0.5 mono">
          <li>Hard {usd(s.costs.hard)} · ADU {usd(s.costs.adu)} · Demo {usd(s.costs.demo)}</li>
          <li>Site {usd(s.costs.sitePrep)} · Fees {usd(s.costs.fees)} · Soft {usd(s.costs.soft)}</li>
          <li>Contingency {usd(s.costs.contingency)} · Financing {usd(s.costs.financing)}</li>
          <li>Sale costs {usd(s.saleCosts.total)} · Total investment {usd(s.totalInvestment)}</li>
        </ul>
        <ul className="mt-2 list-disc pl-4 font-sans">{s.assumptions.map((a) => <li key={a}>{a}</li>)}{s.flags.map((f) => <li key={f} className="text-warn">{f}</li>)}</ul>
      </details>
    </div>
  );
}

export function ReportView({ report, result, onPrint, children }: { report: FeasibilityReport; result: UnderwritingResult; onPrint?: () => void; children?: React.ReactNode }) {
  const rec = report.scenarios.find((s) => s.id === report.recommended.scenarioId);
  return (
    <div className="report-root space-y-6">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-4">
          <div><p className="eyebrow !mb-1">{report.tier === 'lite' ? 'Feasibility Lite' : 'Enhanced Feasibility'}</p><h3 className="text-lg font-bold">{report.title}</h3><p className="text-sm text-muted">{report.address} · {report.subtitle}</p></div>
          <div className="flex items-center gap-2 no-print">{children}{onPrint && <button onClick={onPrint} className="btn-ghost btn-sm"><Printer className="h-4 w-4" /> Export PDF</button>}</div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-3">
          <Gauge value={report.gauges.approvalProbability.value} label={report.gauges.approvalProbability.label} caption={report.gauges.approvalProbability.caption} />
          <ValueBars value={report.gauges.valueMaximization.value} caption={report.gauges.valueMaximization.caption} />
          <RiskLight level={report.gauges.risk.level} caption={report.gauges.risk.caption} />
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {report.callouts.map((c) => <div key={c.label} className="bg-surface p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.label}</p><p className="mono mt-1 text-base font-bold">{c.value}</p></div>)}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {report.sections.map((s) => (
          <div key={s.key} className="card p-5"><div className="flex items-center gap-2">{statusIcon[s.status]}<h4 className="font-bold">{s.title}</h4></div><p className="mt-2 text-sm font-semibold">{s.headline}</p><ul className="mt-2 space-y-1 text-sm text-muted">{s.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
        ))}
      </div>

      <SiteworkCard sitework={(result as { sitework?: Parameters<typeof SiteworkCard>[0]['sitework'] }).sitework} />

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><h4 className="h3">Scenarios</h4>{rec && <p className="text-sm text-muted">Recommended: <span className="font-semibold text-ink">{rec.name}</span></p>}</div>
        <p className="mb-4 text-sm text-muted">{report.recommended.rationale}</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{report.scenarios.map((s) => <ScenarioCard key={s.id} s={s} recommended={s.id === report.recommended.scenarioId} />)}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h4 className="font-bold">Sensitivity (recommended scenario)</h4><p className="text-xs text-muted">Max offer across ARV ±10% and cost ±10%.</p>
          <div className="mt-3 overflow-x-auto"><table className="tbl"><thead><tr><th>ARV \ Cost</th>{[-10, 0, 10].map((c) => <th key={c} className="text-right">{c > 0 ? '+' : ''}{c}%</th>)}</tr></thead>
            <tbody>{[-10, 0, 10].map((a) => <tr key={a}><td className="font-semibold">{a > 0 ? '+' : ''}{a}%</td>{[-10, 0, 10].map((c) => { const cell = report.sensitivity.find((x) => x.arvDeltaPct === a && x.costDeltaPct === c); return <td key={c} className={`mono text-right ${cell && cell.maxOffer <= 0 ? 'text-bad' : ''} ${a === 0 && c === 0 ? 'font-bold' : ''}`}>{cell ? usd(cell.maxOffer) : '—'}</td>; })}</tr>)}</tbody></table></div>
        </div>
        <div className="card p-5">
          <h4 className="font-bold">Verification checklist</h4>
          <ul className="mt-3 space-y-2 text-sm">{report.checklist.map((c, i) => <li key={i} className="flex gap-2"><Badge tone={c.priority === 'high' ? 'bad' : c.priority === 'medium' ? 'warn' : 'muted'}>{c.priority}</Badge><span><span className="font-medium">{c.item}</span> <span className="text-muted">— {c.why}</span> <span className="text-[11px] uppercase text-muted">({c.owner})</span></span></li>)}</ul>
        </div>
      </div>

      {result.overlays.length > 0 && (
        <div className="card p-5"><h4 className="font-bold">Rules evaluated ({result.overlays.length})</h4>
          <ul className="mt-3 divide-y divide-line text-sm">{result.overlays.map((f) => <li key={f.id} className="flex flex-wrap items-start gap-2 py-2"><Badge tone={f.status === 'yes' ? (f.treatment === 'blocker' || f.treatment === 'constraint' ? 'bad' : f.treatment === 'cost_adder' ? 'warn' : 'ok') : f.status === 'unknown' ? 'warn' : 'muted'}>{f.status}</Badge><div className="flex-1"><p className="font-medium">{f.name}</p><p className="text-muted">{f.reason} {f.effect}</p>{f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blueprint hover:underline no-print">Source</a>}</div></li>)}</ul></div>
      )}
      <ul className="text-xs text-muted space-y-1">{report.disclaimers.map((d) => <li key={d}>• {d}</li>)}</ul>
    </div>
  );
}
