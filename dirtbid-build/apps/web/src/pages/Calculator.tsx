import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { underwrite, buildReport, listMarkets, UnderwritingError, type UnderwritingInput, type CostAssumptions, type Tri, type ProjectType, type UnderwritingResult } from '@dirtbid/underwriting';
import { Calculator as CalcIcon, Save, SlidersHorizontal, MapPin, CloudUpload } from 'lucide-react';
import type { ResolvedParcel, Provenance } from '@dirtbid/parcel-data';
import { ProvenanceChip } from '@/components/Provenance';
import { useTitle } from '@/lib/useTitle';
import { api, ApiError } from '@/lib/api';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { ReportView } from '@/components/Report';
import { ContactFields, ConsentRow, contactSchema, useForm, zodResolver, useLeadMutation, applyServerErrors, type ContactValues } from '@/components/LeadForm';

const PROJECT_TYPES: { value: ProjectType; label: string; hint: string }[] = [
  { value: 'vacant_land', label: 'Vacant land', hint: 'Nothing on the lot today' },
  { value: 'demo_rebuild', label: 'Demo + rebuild', hint: 'Tear down and build new' },
  { value: 'fire_rebuild', label: 'Fire / disaster rebuild', hint: 'Like-for-like expedited lane' },
  { value: 'addition_adu', label: 'Addition or ADU', hint: 'Keep the house, add value' },
  { value: 'subdivision', label: 'Subdivision', hint: 'Split into lots' },
];
const TRI: { value: Tri; label: string }[] = [{ value: 'unknown', label: 'Unknown' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const ASSUMPTION_LABELS: Record<keyof CostAssumptions, string> = {
  hardCostPerSf: 'Hard cost $/sf (living)', aduHardCostPerSf: 'ADU hard cost $/sf', softCostPct: 'Soft cost % of hard', contingencyPct: 'Contingency %', demoCost: 'Demolition $', sitePrepPerLot: 'Site prep $/lot', utilityConnectionFeesPerUnit: 'Tap & connection fees $/unit', impactFeesPerUnit: 'Impact fees / proffers $/unit', commissionPct: 'Commission %', closingPct: 'Seller closing %', targetRoi: 'Target ROI on investment', annualFinancingRate: 'Construction loan rate', financedPct: 'Loan-to-cost %', buildMonths: 'Build months', aduArvPremiumPerSf: 'ADU ARV premium $/sf', rebuildExpansionPct: 'Rebuild expansion %', maxAduSf: 'Max ADU sf', maxDensityFar: 'Max-density FAR', defaultHomeSf: 'Default home sf', grossAreaFactor: 'Gross area factor', aduValuationMode: 'ADU valuation mode',
};
const PCT_KEYS = new Set<keyof CostAssumptions>(['softCostPct', 'contingencyPct', 'commissionPct', 'closingPct', 'targetRoi', 'annualFinancingRate', 'financedPct', 'rebuildExpansionPct', 'maxDensityFar', 'grossAreaFactor']);

interface FormState {
  marketCode: string; address: string; zip: string; lotSize: string; lotUnit: 'sf' | 'acres'; existingSf: string; zoningCode: string; arvPerSf: string; targetHomeSf: string; projectType: ProjectType;
  comps: { price: string; sf: string }[];
  site: { floodZone: string; wetlandsAcres: string; rpaBuffer: Tri; fireHazardZone: Tri; water: Tri; sewer: Tri; power: Tri; soils: 'unknown' | 'stable' | 'marginal' | 'poor'; hillside: boolean; stateRouteFrontage: Tri; historic: Tri; tenantOccupied: Tri; cornerLot: boolean };
  assumptions: Partial<Record<keyof CostAssumptions, string>>;
  /** Parcel-derived sitework facts carried through from the resolver */
  siteworkInput: NonNullable<UnderwritingInput['sitework']>;
  dirtbidLandScreeningTotal: string;
}
export type ProvMap = Partial<Record<'market' | 'address' | 'zip' | 'lotSize' | 'zoning' | 'existingSf' | 'floodZone' | 'wetlands' | 'rpa' | 'soils' | 'utilities' | 'hillside' | 'stateRoute', { p?: Provenance; needsInput?: boolean }>>;

const markets = listMarkets();
const initial: FormState = {
  marketCode: 'HAMPTON_ROADS_VA', address: '', zip: '', lotSize: '', lotUnit: 'sf', existingSf: '', zoningCode: '', arvPerSf: '', targetHomeSf: '', projectType: 'vacant_land',
  comps: [{ price: '', sf: '' }, { price: '', sf: '' }, { price: '', sf: '' }],
  site: { floodZone: '', wetlandsAcres: '', rpaBuffer: 'unknown', fireHazardZone: 'unknown', water: 'unknown', sewer: 'unknown', power: 'unknown', soils: 'unknown', hillside: false, stateRouteFrontage: 'unknown', historic: 'unknown', tenantOccupied: 'unknown', cornerLot: false },
  assumptions: {},
  siteworkInput: {},
  dirtbidLandScreeningTotal: '',
};

/** Map a resolved parcel onto the form and record where each value came from. */
export function applyParcel(f: FormState, r: ResolvedParcel): { form: FormState; prov: ProvMap } {
  const u = r.underwritingInput; const site = u.site ?? {};
  const util = site.utilities ?? {};
  const form: FormState = {
    ...f,
    marketCode: u.marketCode || f.marketCode,
    address: u.address ?? r.geocode?.matchedAddress ?? f.address,
    zip: u.zip ?? r.geocode?.zip ?? f.zip,
    lotSize: u.lotSizeSf ? String(u.lotSizeSf) : f.lotSize, lotUnit: 'sf',
    existingSf: u.existingStructureSf !== undefined ? String(u.existingStructureSf) : f.existingSf,
    zoningCode: u.zoningCode || r.zoning.code || '',
    projectType: u.projectType ?? f.projectType,
    site: {
      ...f.site,
      floodZone: site.floodZone ?? r.flood.zone ?? '',
      wetlandsAcres: site.wetlandsAcres !== undefined ? String(site.wetlandsAcres) : f.site.wetlandsAcres,
      rpaBuffer: site.rpaBuffer ?? r.rpa.likely ?? 'unknown',
      soils: site.soils ?? r.soils.classification ?? 'unknown',
      hillside: site.hillside ?? ((site.slopePct ?? r.elevation.slopePct ?? 0) > 15),
      water: util.water ?? 'unknown', sewer: util.sewer ?? 'unknown', power: util.power ?? 'unknown',
      stateRouteFrontage: site.stateRouteFrontage ?? f.site.stateRouteFrontage,
      fireHazardZone: site.fireHazardZone ?? f.site.fireHazardZone,
    },
    siteworkInput: { ...(u.sitework ?? {}), ...(r.siteworkInput as NonNullable<UnderwritingInput['sitework']>) },
  };
  const prov: ProvMap = {
    market: { p: r.geocode?.provenance }, address: { p: r.geocode?.provenance }, zip: { p: r.geocode?.provenance },
    lotSize: r.parcel.found ? { p: r.parcel.provenance } : { needsInput: true },
    zoning: form.zoningCode ? { p: r.zoning.provenance } : { needsInput: true },
    existingSf: r.parcel.found ? { p: r.parcel.provenance } : { needsInput: true },
    floodZone: r.flood.zone ? { p: r.flood.provenance } : { needsInput: true },
    wetlands: { p: r.wetlands.provenance }, rpa: { p: r.rpa.provenance }, soils: r.soils.classification === 'unknown' ? { needsInput: true } : { p: r.soils.provenance },
    utilities: util.water && util.water !== 'unknown' ? { p: r.utilities.provenance } : { needsInput: true },
    hillside: { p: r.elevation.provenance }, stateRoute: { needsInput: true },
  };
  return { form, prov };
}

export function toInput(f: FormState): UnderwritingInput {
  const n = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/[,$]/g, '')));
  const lot = n(f.lotSize) ?? 0;
  const comps = f.comps.filter((c) => n(c.price) && n(c.sf)).map((c) => ({ salePrice: n(c.price)!, livingSf: n(c.sf)! }));
  const assumptions: Partial<CostAssumptions> = {};
  for (const [k, v] of Object.entries(f.assumptions)) {
    if (v === undefined || v === '') continue;
    if (k === 'aduValuationMode') (assumptions as Record<string, unknown>)[k] = v; else { const x = Number(v); if (Number.isFinite(x)) (assumptions as Record<string, unknown>)[k] = PCT_KEYS.has(k as keyof CostAssumptions) ? x / 100 : x; }
  }
  const input: UnderwritingInput = {
    marketCode: f.marketCode,
    lotSizeSf: f.lotUnit === 'acres' ? Math.round(lot * 43560) : lot,
    zoningCode: f.zoningCode,
    projectType: f.projectType,
    site: {
      utilities: { water: f.site.water, sewer: f.site.sewer, power: f.site.power },
      rpaBuffer: f.site.rpaBuffer, fireHazardZone: f.site.fireHazardZone, stateRouteFrontage: f.site.stateRouteFrontage, historic: f.site.historic, tenantOccupiedLast3Years: f.site.tenantOccupied,
      soils: f.site.soils, hillside: f.site.hillside, cornerLot: f.site.cornerLot,
    },
  };
  if (f.address) input.address = f.address;
  if (f.zip) input.zip = f.zip;
  const ex = n(f.existingSf); if (ex !== undefined) input.existingStructureSf = ex;
  const arv = n(f.arvPerSf); if (arv !== undefined) input.arvPerSf = arv;
  const th = n(f.targetHomeSf); if (th !== undefined) input.targetHomeSf = th;
  if (comps.length) input.comps = comps;
  if (f.site.floodZone) input.site!.floodZone = f.site.floodZone;
  const w = n(f.site.wetlandsAcres); if (w !== undefined) input.site!.wetlandsAcres = w;
  if (Object.keys(assumptions).length) input.assumptions = assumptions;
  const sw: NonNullable<UnderwritingInput['sitework']> = { ...f.siteworkInput };
  const screening = n(f.dirtbidLandScreeningTotal); if (screening !== undefined && screening > 0) sw.dirtbidLandScreeningTotal = screening;
  if (Object.keys(sw).length) input.sitework = sw;
  return input;
}

export function CalculatorPage() {
  useTitle('Land Underwriting Calculator', 'Underwrite a lot in 60 seconds: max offer, build cost, ARV and ROI across every viable scenario.');
  const [f, setF] = useState<FormState>(initial);
  const [submitted, setSubmitted] = useState<UnderwritingInput | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addr, setAddr] = useState('');
  const [parcel, setParcel] = useState<ResolvedParcel | null>(null);
  const [prov, setProv] = useState<ProvMap>({});
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const market = markets.find((m) => m.code === f.marketCode) ?? markets[0]!;
  const resolve = async (e?: React.FormEvent) => {
    e?.preventDefault(); if (!addr.trim()) return;
    setResolving(true); setResolveError(null);
    try {
      const r = await api.post<{ parcel: ResolvedParcel }>('/parcels/resolve', { address: addr.trim() });
      const applied = applyParcel(f, r.parcel); setF(applied.form); setProv(applied.prov); setParcel(r.parcel); setSubmitted(null);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'not_found' || err.code === 'network')) setResolveError('Address lookup is not available right now. Fill the form manually; everything below still works.');
      else setResolveError(err instanceof Error ? err.message : 'Could not resolve that address.');
    } finally { setResolving(false); }
  };
  const Chip = ({ k }: { k: keyof ProvMap }) => (parcel ? <ProvenanceChip p={prov[k]?.p} needsInput={prov[k]?.needsInput} /> : null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const setSite = <K extends keyof FormState['site']>(k: K, v: FormState['site'][K]) => setF((s) => ({ ...s, site: { ...s.site, [k]: v } }));

  const computed = useMemo(() => {
    if (!submitted) return null;
    try { const result = underwrite(submitted); return { result, report: buildReport(result, 'enhanced'), error: null as string | null, field: null as string | null }; }
    catch (e) { return { result: null, report: null, error: e instanceof Error ? e.message : 'Could not compute', field: e instanceof UnderwritingError ? e.field ?? null : null }; }
  }, [submitted]);

  const run = (e: React.FormEvent) => { e.preventDefault(); setSubmitted(toInput(f)); setTimeout(() => document.getElementById('report')?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const isCA = market.state === 'CA'; const isVA = market.state === 'VA';

  return (
    <div>
      <section className="border-b border-line bg-surface grid-paper no-print">
        <div className="container-x py-12 sm:py-16">
          <p className="eyebrow mb-3">Live tool · {market.name}</p>
          <h1 className="h1 max-w-3xl">Underwrite a lot in <span className="text-stake">60 seconds</span>.</h1>
          <p className="lede mt-4 max-w-2xl">The same residual-land model we use on our own deals. Enter the parcel and get max offer, build cost, ARV and ROI across every viable scenario, with the zoning, utility and environmental flags that drive them.</p>
        </div>
      </section>

      <div className="container-x pt-8 no-print">
        <form onSubmit={resolve} className="card grid-paper p-4 sm:p-5" aria-label="Start from an address">
          <p className="eyebrow !mb-2">Start from an address</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input id="resolve-address" className="pl-9" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="318 Big Bethel Rd, Hampton, VA 23666" aria-label="Address" /></div>
            <Button type="submit" loading={resolving} variant="dark">Resolve parcel</Button>
          </div>
          <p className="mt-2 text-xs text-muted">Pulls the parcel, lot size, flood zone, wetlands, slope, soils and region from public GIS and prefills the form. You confirm zoning and utilities.</p>
          {resolveError && <div className="mt-3"><Alert kind="warn">{resolveError}</Alert></div>}
          {parcel && (
            <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
              <p className="font-semibold">{parcel.parcel.found ? `Parcel ${parcel.parcel.parcelId ?? ''} · ${parcel.parcel.acres ?? (parcel.parcel.lotSizeSf ? (parcel.parcel.lotSizeSf / 43560).toFixed(2) : '?')} ac · ${parcel.parcel.locality ?? parcel.geocode?.countyName ?? ''}` : 'Address geocoded; parcel polygon not found'}{parcel.flood.zone ? ` · Zone ${parcel.flood.zone}` : ''}{parcel.region.dirtbidRegion ? ` · ${parcel.region.dirtbidRegion} ×${parcel.region.multiplier.toFixed(2)}` : ''}</p>
              {parcel.warnings.length > 0 && <ul className="mt-1.5 space-y-0.5 text-xs text-muted">{parcel.warnings.map((w) => <li key={w}>• {w}</li>)}</ul>}
            </div>
          )}
        </form>
      </div>

      <div className="container-x grid gap-8 py-10 lg:grid-cols-[420px_1fr]">
        <form onSubmit={run} className="card p-5 space-y-5 self-start lg:sticky lg:top-20 no-print" aria-label="Underwriting inputs">
          <Field label="Market" required><span className="-mt-1 mb-1 block"><Chip k="market" /></span><Select value={f.marketCode} onChange={(e) => set('marketCode', e.target.value)}>{markets.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</Select></Field>
          <Field label="Property address"><Chip k="address" /><Input id="address" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder={isVA ? '123 Mercury Blvd, Hampton, VA 23666' : '123 Lake Ave, Altadena, CA 91001'} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ZIP"><Chip k="zip" /><Input id="zip" inputMode="numeric" value={f.zip} onChange={(e) => set('zip', e.target.value)} placeholder={Object.keys(market.zipBands)[0] ?? ''} /></Field>
            <Field label="Zoning code" required hint={`e.g. ${market.zoning.slice(0, 4).map((z) => z.code).join(', ')}`}><Chip k="zoning" /><Input id="zoning" list="zoning-list" value={f.zoningCode} onChange={(e) => set('zoningCode', e.target.value)} placeholder={market.zoning[0]?.code} /><datalist id="zoning-list">{market.zoning.map((z) => <option key={z.code} value={z.code}>{z.label}</option>)}</datalist></Field>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <Field label="Lot size" required><Chip k="lotSize" /><Input id="lotSize" inputMode="decimal" value={f.lotSize} onChange={(e) => set('lotSize', e.target.value)} placeholder={f.lotUnit === 'sf' ? '12,000' : '0.28'} /></Field>
            <div className="flex rounded-lg border border-line overflow-hidden mb-px">{(['sf', 'acres'] as const).map((u) => <button type="button" key={u} onClick={() => set('lotUnit', u)} className={`px-3 py-2.5 text-xs font-semibold ${f.lotUnit === u ? 'bg-soil text-parchment dark:bg-parchment dark:text-ink' : 'bg-surface text-muted'}`}>{u}</button>)}</div>
          </div>
          <Field label="Project type" required>
            <div className="grid grid-cols-1 gap-2">{PROJECT_TYPES.map((p) => <button type="button" key={p.value} onClick={() => set('projectType', p.value)} className={`rounded-lg border px-3 py-2 text-left text-sm ${f.projectType === p.value ? 'border-stake bg-stake/10' : 'border-line hover:bg-surface-2'}`}><span className="font-semibold">{p.label}</span><span className="block text-xs text-muted">{p.hint}</span></button>)}</div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Existing structure sf" required={f.projectType === 'fire_rebuild'} hint="0 if vacant"><Chip k="existingSf" /><Input id="existingSf" inputMode="numeric" value={f.existingSf} onChange={(e) => set('existingSf', e.target.value)} placeholder="1,800" /></Field>
            <Field label="Target home sf" hint={`Default ${market.assumptions.defaultHomeSf.toLocaleString()}`}><Input id="targetHomeSf" inputMode="numeric" value={f.targetHomeSf} onChange={(e) => set('targetHomeSf', e.target.value)} placeholder={String(market.assumptions.defaultHomeSf)} /></Field>
          </div>
          <Field label="ARV $/sf" hint={`Blank = comps below or market default $${market.defaultArvPerSf}`}><Input id="arvPerSf" inputMode="numeric" value={f.arvPerSf} onChange={(e) => set('arvPerSf', e.target.value)} placeholder={String(market.defaultArvPerSf)} /></Field>
          <details><summary className="cursor-pointer text-sm font-semibold">Comparable sales (optional)</summary>
            <div className="mt-2 space-y-2">{f.comps.map((c, i) => <div key={i} className="grid grid-cols-2 gap-2"><Input placeholder="Sale price" inputMode="numeric" value={c.price} onChange={(e) => set('comps', f.comps.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} /><Input placeholder="Living sf" inputMode="numeric" value={c.sf} onChange={(e) => set('comps', f.comps.map((x, j) => j === i ? { ...x, sf: e.target.value } : x))} /></div>)}</div>
          </details>
          <details open><summary className="cursor-pointer text-sm font-semibold">Site characteristics</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="FEMA flood zone"><Chip k="floodZone" /><Select value={f.site.floodZone} onChange={(e) => setSite('floodZone', e.target.value)}><option value="">Unknown</option><option value="X">X (minimal)</option><option value="AE">AE</option><option value="A">A</option><option value="AO">AO</option><option value="VE">VE (coastal)</option></Select></Field>
              <Field label="Wetlands (acres)"><Chip k="wetlands" /><Input inputMode="decimal" value={f.site.wetlandsAcres} onChange={(e) => setSite('wetlandsAcres', e.target.value)} placeholder="0" /></Field>
              {isVA && <Field label="Chesapeake Bay RPA buffer"><Chip k="rpa" /><Select value={f.site.rpaBuffer} onChange={(e) => setSite('rpaBuffer', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>}
              {isVA && <Field label="State route frontage (VDOT)"><Chip k="stateRoute" /><Select value={f.site.stateRouteFrontage} onChange={(e) => setSite('stateRouteFrontage', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>}
              {isCA && <Field label="Fire hazard zone (VHFHSZ)"><Select value={f.site.fireHazardZone} onChange={(e) => setSite('fireHazardZone', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>}
              {isCA && <Field label="Tenant-occupied last 3 yrs"><Select value={f.site.tenantOccupied} onChange={(e) => setSite('tenantOccupied', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>}
              <Field label="Water"><Chip k="utilities" /><Select value={f.site.water} onChange={(e) => setSite('water', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
              <Field label="Sewer"><Chip k="utilities" /><Select value={f.site.sewer} onChange={(e) => setSite('sewer', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
              <Field label="Power"><Chip k="utilities" /><Select value={f.site.power} onChange={(e) => setSite('power', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
              <Field label="Soils"><Chip k="soils" /><Select value={f.site.soils} onChange={(e) => setSite('soils', e.target.value as FormState['site']['soils'])}><option value="unknown">Unknown</option><option value="stable">Stable</option><option value="marginal">Marginal</option><option value="poor">Poor</option></Select></Field>
              <Field label="Historic designation"><Select value={f.site.historic} onChange={(e) => setSite('historic', e.target.value as Tri)}>{TRI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
              <div className="col-span-2 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" className="accent-stake" checked={f.site.hillside} onChange={(e) => setSite('hillside', e.target.checked)} />Hillside / steep slope</label><label className="flex items-center gap-2"><input type="checkbox" className="accent-stake" checked={f.site.cornerLot} onChange={(e) => setSite('cornerLot', e.target.checked)} />Corner lot</label></div>
            </div>
          </details>
          <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="flex w-full items-center justify-between text-sm font-semibold"><span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" />Advanced assumptions</span><span className="text-xs text-muted">{showAdvanced ? 'Hide' : 'Show'}</span></button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-surface-2 p-3">
              <p className="col-span-2 text-xs text-muted">Prefilled from {market.name}. Percent fields are whole numbers (10 = 10%). {market.calibrationNote}</p>
              <div className="col-span-2"><Field label="DirtBid Land Screening total ($)" hint="If you have a bid-grade sitework number from a DirtBid Land Screening, enter it and it replaces the model."><Input inputMode="numeric" value={f.dirtbidLandScreeningTotal} onChange={(e) => set('dirtbidLandScreeningTotal', e.target.value)} placeholder="e.g. 86,500" /></Field></div>
              {(Object.keys(ASSUMPTION_LABELS) as (keyof CostAssumptions)[]).map((k) => {
                const def = market.assumptions[k];
                if (k === 'aduValuationMode') return <Field key={k} label={ASSUMPTION_LABELS[k]}><Select value={f.assumptions[k] ?? String(def)} onChange={(e) => set('assumptions', { ...f.assumptions, [k]: e.target.value })}><option value="sf_at_arv">ADU sf at ARV</option><option value="premium_on_primary">Premium on primary sf</option></Select></Field>;
                const shown = PCT_KEYS.has(k) ? Math.round((def as number) * 10000) / 100 : (def as number);
                return <Field key={k} label={ASSUMPTION_LABELS[k]}><Input inputMode="decimal" value={f.assumptions[k] ?? ''} onChange={(e) => set('assumptions', { ...f.assumptions, [k]: e.target.value })} placeholder={String(shown)} /></Field>;
              })}
            </div>
          )}
          <Button type="submit" className="w-full"><CalcIcon className="h-4 w-4" /> Calculate offers</Button>
          {parcel && <ServerRun address={parcel.query || addr} overrides={() => toInput(f)} />}
          <p className="text-[11px] text-muted">Free · runs in your browser · nothing is stored until you save.</p>
        </form>

        <div id="report" className="min-w-0 scroll-mt-20">
          {!computed && (
            <div className="card grid-paper p-10 text-center">
              <p className="font-semibold">Your report will appear here.</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">Three gauges, six headline numbers, four diligence sections, every viable scenario with a max offer, a 3×3 sensitivity grid and the verification checklist.</p>
              <p className="mt-6 text-xs text-muted">Try: {isVA ? 'R-10 · 12,000 sf · vacant land · ZIP 23666 · zone X · water/sewer/power yes' : 'R-1 · 7,500 sf · fire rebuild · 1,800 sf prior · $650/sf'}</p>
            </div>
          )}
          {computed?.error && <Alert kind="error">{computed.error}{computed.field ? ` (field: ${computed.field})` : ''}</Alert>}
          {computed?.result && computed.report && (
            <ReportView report={computed.report} result={computed.result} onPrint={() => window.print()}>
              <SaveRun input={submitted!} result={computed.result} />
            </ReportView>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveRun({ input, result }: { input: UnderwritingInput; result: UnderwritingResult }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{ runId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: { consent: false, website: '' } });
  const lead = useLeadMutation('calculator_unlock');
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const { res } = await lead.mutateAsync({ contact: { fullName: v.fullName, email: v.email, phone: v.phone }, property: { address: input.address, zip: input.zip, zoningCode: input.zoningCode, lotSize: input.lotSizeSf, lotSizeUnit: 'sf' }, answers: { marketCode: input.marketCode, projectType: input.projectType, recommended: result.recommended.key, maxOffer: result.scenarios.find((s) => s.id === result.recommended.scenarioId)?.maxOffer }, consent: v.consent, website: v.website ?? '' });
      const run = await api.post<{ runId: string }>('/feasibility/runs', { input, leadId: res.leadId, tier: 'lite' });
      setSaved({ runId: run.runId });
    } catch (e) { setError(applyServerErrors(form, e)); if (e instanceof ApiError && e.code === 'network') setError('The API is offline, so the run was not saved. Your report is still shown above and you can export it to PDF.'); }
  });
  if (saved) return <div className="text-xs text-ok">Saved · <Link className="underline" to={`/app/feasibility/${saved.runId}`}>run {saved.runId.slice(0, 8)}</Link></div>;
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="btn-primary btn-sm"><Save className="h-4 w-4" /> Save & email my full report</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16" onClick={() => setOpen(false)}><form onSubmit={onSubmit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md card p-5 space-y-3 text-left">
          <p className="text-sm font-semibold">Where should we send the full underwriting package?</p>
          <ContactFields form={form} />
          <Field label="Notes"><Textarea rows={2} placeholder="Anything we should know about the parcel?" /></Field>
          <ConsentRow form={form} text="I agree to be contacted about this property." />
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex gap-2"><Button type="submit" loading={lead.isPending || form.formState.isSubmitting}>Save run</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form></div>
      )}
    </div>
  );
}

function ServerRun({ address, overrides }: { address: string; overrides: () => UnderwritingInput }) {
  const [state, setState] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; runId?: string; message?: string }>({ status: 'idle' });
  const go = async () => {
    setState({ status: 'running' });
    try { const r = await api.post<{ runId: string }>('/feasibility/from-address', { address, overrides: overrides() }); setState({ status: 'done', runId: r.runId }); }
    catch (e) { setState({ status: 'error', message: e instanceof ApiError ? (e.fields.zoningCode ?? e.message) : 'Server run failed' }); }
  };
  if (state.status === 'done') return <p className="text-xs text-ok">Saved on server · <Link className="underline" to={`/app/feasibility/${state.runId}`}>open run {state.runId!.slice(0, 8)}</Link></p>;
  return <div><Button type="button" variant="ghost" className="w-full" loading={state.status === 'running'} onClick={() => void go()}><CloudUpload className="h-4 w-4" /> Run on server & save</Button>{state.status === 'error' && <p className="mt-1 text-xs text-bad">{state.message}</p>}</div>;
}
