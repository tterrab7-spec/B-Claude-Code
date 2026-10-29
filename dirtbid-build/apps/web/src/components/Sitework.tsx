import { useState } from 'react';
import type { SiteworkEstimate } from '@dirtbid/underwriting';
import { Shovel } from 'lucide-react';
import { usd, num } from '@/lib/format';
import { Badge } from './ui';

const DIV_COLOR: Record<string, string> = { '01': 'bg-soil', '02': 'bg-muted', '31': 'bg-stake', '32': 'bg-blueprint', '33': 'bg-ok' };

export function SiteworkCard({ sitework }: { sitework: SiteworkEstimate | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!sitework) return null;
  const tone = sitework.riskLabel === 'Low' ? 'ok' : sitework.riskLabel === 'Moderate' ? 'warn' : 'bad';
  const fromScreening = sitework.source === 'dirtbid_land_screening';
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2"><Shovel className="h-4 w-4 text-stake" /><h4 className="font-bold">Site Work</h4><Badge tone="muted">{fromScreening ? 'Land Screening' : 'Feasibility grade'}</Badge></div>
        <div className="flex items-center gap-3"><Badge tone={tone}>{sitework.riskLabel} sitework risk · {sitework.riskScore}/100</Badge><p className="mono text-2xl font-bold">{usd(sitework.total)}</p></div>
      </div>
      <p className="mt-1 text-xs text-muted">{sitework.perLot !== sitework.total ? `${usd(sitework.perLot)} per lot · ` : ''}regional multiplier {sitework.regionMultiplier.toFixed(2)} (Richmond Metro = 1.00)</p>
      {sitework.byDivision.length > 0 && (
        <div className="mt-4">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-line" role="img" aria-label="Cost by CSI division">{sitework.byDivision.filter((d) => d.pct > 0).map((d) => <div key={d.division} className={`${DIV_COLOR[d.division] ?? 'bg-muted'} h-4`} style={{ width: `${d.pct}%` }} title={`${d.division} ${d.name}: ${usd(d.total)} (${d.pct}%)`} />)}</div>
          <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">{sitework.byDivision.map((d) => <li key={d.division} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${DIV_COLOR[d.division] ?? 'bg-muted'}`} /><span className="mono font-semibold">{d.division}</span><span className="truncate text-muted">{d.name}</span><span className="mono ml-auto">{d.pct}%</span></li>)}</ul>
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="label">Markup waterfall</p>
          <ul className="space-y-1 text-sm">{sitework.waterfall.map((w, i) => <li key={i} className="flex justify-between gap-3"><span className="text-muted">{w.label}</span><span className="mono">{usd(w.amount)}</span></li>)}<li className="flex justify-between gap-3 border-t border-line pt-1 font-bold"><span>Total</span><span className="mono">{usd(sitework.total)}</span></li></ul>
        </div>
        <div>
          <p className="label">Flags</p>
          {sitework.flags.length ? <ul className="space-y-1 text-sm">{sitework.flags.map((f) => <li key={f} className="flex gap-2"><span className="text-warn">•</span>{f}</li>)}</ul> : <p className="text-sm text-muted">No sitework flags.</p>}
        </div>
      </div>
      {sitework.lines.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-semibold text-stake hover:underline no-print">{open ? 'Hide' : 'Show'} {sitework.lines.length} line items</button>
          {open && <div className="mt-2 overflow-x-auto"><table className="tbl"><thead><tr><th>CSI</th><th>Item</th><th className="text-right">Qty</th><th>Unit</th><th className="text-right">Unit cost</th><th className="text-right">Total</th></tr></thead><tbody>{sitework.lines.map((l, i) => <tr key={i}><td className="mono whitespace-nowrap">{l.csi}</td><td>{l.item}{l.note && <span className="block text-xs text-muted">{l.note}</span>}</td><td className="mono text-right">{num(Math.round(l.qty * 10) / 10)}</td><td>{l.unit}</td><td className="mono text-right">{usd(l.unitCost)}</td><td className="mono text-right">{usd(l.total)}</td></tr>)}</tbody><tfoot><tr className="font-bold"><td colSpan={5}>Direct cost</td><td className="mono text-right">{usd(sitework.directCost)}</td></tr></tfoot></table></div>}
        </div>
      )}
      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{fromScreening ? 'From your DirtBid Land Screening.' : 'Feasibility-grade. Order a DirtBid Land Screening ($950) for a bid-grade number.'}</p>
    </div>
  );
}
