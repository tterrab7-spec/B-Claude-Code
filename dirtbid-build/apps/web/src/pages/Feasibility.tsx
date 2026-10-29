import { useEffect, useState } from 'react';
import type { ResolvedParcel } from '@dirtbid/parcel-data';
import { Link } from 'react-router';
import { Check, Minus } from 'lucide-react';
import { underwrite, buildReport, type UnderwritingResult, type FeasibilityReport } from '@dirtbid/underwriting';
import { useTitle } from '@/lib/useTitle';
import { api, type LeadResponse } from '@/lib/api';
import { Section, Eyebrow, H2, Lede, FAQ, Field, Input, Select, Textarea, Alert, Badge, Steps } from '@/components/ui';
import { ContactFields, ConsentRow, SubmitRow, contactSchema, useForm, zodResolver, z, useLeadMutation, applyServerErrors } from '@/components/LeadForm';
import { ReportView } from '@/components/Report';

const schema = contactSchema.extend({
  address: z.string().min(3, 'Enter the property address'),
  city: z.string().optional(), state: z.string().optional(), zip: z.string().optional(), apn: z.string().optional(),
  propertyType: z.enum(['vacant_land', 'residential_house', 'commercial']),
  lotSize: z.string().optional(), lotSizeUnit: z.enum(['sf', 'acres']), zoningCode: z.string().optional(), goals: z.string().optional(),
});
type Values = z.infer<typeof schema>;

export function FeasibilityPage() {
  useTitle('Free Feasibility Report: Is Your Land Worth Developing?', 'Free feasibility snapshot in 2 to 3 days. Enhanced $750 report credited back when you build.');
  return (
    <div>
      <section className="border-b border-line bg-surface grid-paper"><div className="container-x py-14 sm:py-20"><p className="pill mb-5">Free · No commitment · 2 to 3 day turnaround</p><h1 className="h1 max-w-3xl">You might be sitting on a <span className="text-stake">$500K to $2M</span> opportunity.</h1><p className="lede mt-5 max-w-2xl">Most landowners sell early and leave the upside to the developer. See what your property can become, with the real numbers, before you decide.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#intake" className="btn-primary">Get my free snapshot</a><Link to="/calculator" className="btn-ghost">Run the numbers now</Link></div></div></section>

      <Section>
        <Eyebrow>Why owners lose</Eyebrow><H2>Developer offers are priced on their upside, not yours.</H2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <ul className="card p-6 space-y-2 text-sm">{['You do not know what the property could actually become', 'Offers arrive before you have the zoning, cost and comp picture', 'Permits and construction cost feel like a black box', 'Nobody has time to figure it all out'].map((t) => <li key={t} className="flex gap-2"><Minus className="mt-0.5 h-4 w-4 text-bad" />{t}</li>)}</ul>
          <ul className="card p-6 space-y-2 text-sm">{['Understand what the lot can become, scenario by scenario', 'See the max offer, ARV and ROI before you talk to anyone', 'Build it yourself, partner with us, or sell with leverage', 'You stay in control. We carry the complexity.'].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" />{t}</li>)}</ul>
        </div>
      </Section>

      <Section className="bg-surface border-y border-line">
        <Eyebrow>Two reports</Eyebrow><H2>Start free. Upgrade when you are serious.</H2>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="card p-6"><Badge tone="ok">Most popular start</Badge><h3 className="mt-3 text-xl font-bold">Free Feasibility Snapshot</h3><p className="mono mt-1 text-3xl font-bold">Free</p><ul className="mt-4 space-y-2 text-sm">{['High-level zoning and buildability check', 'What you could potentially build', 'Initial value range estimate', 'Whether it is worth pursuing further'].map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" />{i}</li>)}</ul><p className="mt-4 text-xs text-muted">Timeline 2 to 3 days · No credit card · No obligation</p><a href="#intake" className="btn-primary mt-5">Get my free report</a></div>
          <div className="card p-6 ring-2 ring-stake"><Badge tone="stake">Most detailed</Badge><h3 className="mt-3 text-xl font-bold">Enhanced Feasibility Report</h3><p className="mono mt-1 text-3xl font-bold">$750</p><ul className="mt-4 space-y-2 text-sm">{['Full zoning and buildability analysis', 'Itemized construction cost estimate', 'Resale value (ARV) from comps', 'Sell vs build vs partner scenarios', 'Pro forma, ROI and sensitivity'].map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" />{i}</li>)}</ul><p className="mt-4 text-xs text-muted">Credited back in full toward the $5,000 design step within 90 days. If we do not find meaningful upside, we will say so.</p><Link to="/pricing" className="btn-dark mt-5">Get the enhanced report</Link></div>
        </div>
        <div className="card mt-6 overflow-x-auto"><table className="tbl"><thead><tr><th>Compare</th><th>Free snapshot</th><th>Enhanced $750</th></tr></thead><tbody>
          {[['Zoning check', 'High-level', 'Detailed with overlays'], ['Build options', 'Overview', 'Every viable scenario'], ['Cost estimates', '—', 'Itemized stack'], ['ARV / resale', '—', 'From comps, with sensitivity'], ['Pro forma', '—', 'Included with max offer'], ['Timeline', '2 to 3 days', '2 to 3 days']].map((r) => <tr key={r[0]}><td className="font-semibold">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>)}
        </tbody></table></div>
      </Section>

      <Section>
        <Eyebrow>Process</Eyebrow><H2>Simple, transparent, four steps.</H2>
        <div className="mt-8"><Steps steps={[{ n: '01', title: 'Submit your property', body: 'Address, APN and basic details.' }, { n: '02', title: 'We analyze everything', body: 'Zoning, utilities, environmental, costs, comps.' }, { n: '03', title: 'You review the options', body: 'Clear breakdown of what is possible and profitable.' }, { n: '04', title: 'We build (optional)', body: 'If you move forward, one team handles it.' }, { n: '05', title: 'You stay informed', body: 'Open-book budget and live dashboard.' }]} /></div>
      </Section>

      <Section className="bg-surface border-y border-line" id="intake"><IntakeForm /></Section>

      <Section><Eyebrow>Common questions</Eyebrow><H2>Before you submit.</H2><div className="mt-8"><FAQ items={[
        { q: 'What is the difference between the free and $750 reports?', a: 'The snapshot tells you whether the lot has potential. The enhanced report is the investor-grade package: itemized costs, ARV, every scenario, pro forma and the max offer.' },
        { q: 'I do not want to manage a construction project.', a: 'You do not have to. We handle end to end if you choose to proceed; the platform keeps you informed.' },
        { q: 'What if I just want to sell?', a: 'Fine. The report shows sell, build and partner side by side so you negotiate with real information.' },
        { q: 'Why not just take a developer offer?', a: 'Most offers are priced on information you do not have yet. This gives you that information first.' },
      ]} /></div></Section>
    </div>
  );
}

function IntakeForm() {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { propertyType: 'vacant_land', lotSizeUnit: 'sf', consent: false, website: '', state: 'VA' } });
  const [done, setDone] = useState<{ lead: LeadResponse; report?: FeasibilityReport; result?: UnderwritingResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lead = useLeadMutation('feasibility_snapshot');
  const [parcel, setParcel] = useState<ResolvedParcel | null>(null); const [looking, setLooking] = useState(false);
  const watchedAddress = form.watch('address'); const watchedCity = form.watch('city'); const watchedZip = form.watch('zip'); const watchedState = form.watch('state');
  useEffect(() => {
    const full = [watchedAddress, watchedCity, watchedState, watchedZip].filter(Boolean).join(', ');
    if (!watchedAddress || watchedAddress.length < 8 || !(watchedZip || watchedCity)) { setParcel(null); return; }
    const t = setTimeout(() => {
      setLooking(true);
      api.post<{ parcel: ResolvedParcel }>('/parcels/resolve', { address: full }).then((r) => {
        setParcel(r.parcel);
        const u = r.parcel.underwritingInput;
        if (u.lotSizeSf && !form.getValues('lotSize')) { form.setValue('lotSize', String(u.lotSizeSf)); form.setValue('lotSizeUnit', 'sf'); }
        if (u.zoningCode && !form.getValues('zoningCode')) form.setValue('zoningCode', u.zoningCode);
        if (r.parcel.geocode?.zip && !form.getValues('zip')) form.setValue('zip', r.parcel.geocode.zip);
      }).catch(() => setParcel(null)).finally(() => setLooking(false));
    }, 900);
    return () => clearTimeout(t);
  }, [watchedAddress, watchedCity, watchedZip, watchedState, form]);
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    const lot = v.lotSize ? Number(v.lotSize.replace(/[,]/g, '')) : undefined;
    try {
      const { res } = await lead.mutateAsync({ contact: { fullName: v.fullName, email: v.email, phone: v.phone }, property: { address: v.address, city: v.city, state: v.state, zip: v.zip, apn: v.apn ?? parcel?.parcel.parcelId, propertyType: v.propertyType, lotSize: lot, lotSizeUnit: v.lotSizeUnit, zoningCode: v.zoningCode }, answers: { goals: v.goals, parcel: parcel ? { parcelId: parcel.parcel.parcelId, locality: parcel.parcel.locality, floodZone: parcel.flood.zone, region: parcel.region.dirtbidRegion } : undefined }, consent: v.consent, website: v.website ?? '' });
      let report: FeasibilityReport | undefined; let result: UnderwritingResult | undefined;
      if (lot && v.zoningCode) {
        const base = parcel?.underwritingInput;
        const input = { ...(base ?? {}), marketCode: base?.marketCode ?? (v.state?.toUpperCase() === 'CA' ? 'ALTADENA_CA' : 'HAMPTON_ROADS_VA'), address: v.address, zip: v.zip || base?.zip, lotSizeSf: v.lotSizeUnit === 'acres' ? Math.round(lot * 43560) : lot, zoningCode: v.zoningCode, projectType: v.propertyType === 'vacant_land' ? 'vacant_land' as const : 'demo_rebuild' as const, existingStructureSf: v.propertyType === 'vacant_land' ? 0 : (base?.existingStructureSf || 1600) };
        try { result = underwrite(input); report = buildReport(result, 'lite'); api.post('/feasibility/runs', { input, leadId: res.leadId, tier: 'lite' }).catch(() => undefined); } catch { /* skip instant report */ }
      }
      setDone({ lead: res, report, result });
    } catch (e) { setError(applyServerErrors(form, e)); }
  });
  const e = form.formState.errors;
  if (done) return (
    <div className="space-y-6">
      <Alert kind="success"><span className="font-semibold">Request received.</span> Lead grade <span className="mono font-bold">{done.lead.grade}</span> ({done.lead.score}/100). {done.lead.nextStep.type === 'magic_link_sent' ? 'Check your email for a secure sign-in link.' : 'An analyst will deliver your snapshot within 2 to 3 business days.'}</Alert>
      {done.report && done.result ? <><p className="text-sm text-muted">Here is the instant screening-level read while the analyst version is prepared:</p><ReportView report={done.report} result={done.result} onPrint={() => window.print()} /></> : <p className="text-sm text-muted">Add lot size and zoning next time and you get an instant screening report on this page. Or <Link to="/calculator" className="text-stake underline">run the calculator</Link>.</p>}
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="card p-6 sm:p-8 space-y-6" aria-label="Free feasibility snapshot request">
      <div><Eyebrow>Free snapshot</Eyebrow><h2 className="h3">Tell us about the property.</h2><p className="mt-1 text-sm text-muted">Add lot size and zoning if you know them and you get an instant screening report on this page.</p></div>
      <ContactFields form={form} phoneRequired={false} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Field label="Street address" required error={e.address?.message}><Input {...form.register('address')} autoComplete="street-address" /></Field>
          {looking && <p className="mt-1 text-xs text-muted">Looking up the parcel…</p>}
          {parcel && !looking && <p className="mt-1 text-xs text-ok">{parcel.parcel.found ? `We found your parcel: ${parcel.parcel.acres ?? ((parcel.parcel.lotSizeSf ?? 0) / 43560).toFixed(2)} ac · ${parcel.parcel.locality ?? parcel.geocode?.countyName ?? ''}${parcel.flood.zone ? ` · Zone ${parcel.flood.zone}` : ''}${parcel.zoning.code ? ` · ${parcel.zoning.code}` : ''}` : `Address found${parcel.flood.zone ? ` · Zone ${parcel.flood.zone}` : ''}; parcel boundary not in the public layer.`}</p>}</div>
        <Field label="APN / parcel ID"><Input {...form.register('apn')} /></Field>
        <Field label="City"><Input {...form.register('city')} autoComplete="address-level2" /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="State"><Select {...form.register('state')}><option value="VA">VA</option><option value="CA">CA</option><option value="NC">NC</option><option value="MD">MD</option><option value="FL">FL</option><option value="WA">WA</option><option value="">Other</option></Select></Field><Field label="ZIP"><Input {...form.register('zip')} inputMode="numeric" /></Field></div>
      </div>
      <Field label="Property type" required>
        <div className="grid gap-2 sm:grid-cols-3">{([['vacant_land', 'Vacant land'], ['residential_house', 'Residential house'], ['commercial', 'Commercial property']] as const).map(([v, l]) => <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-sm has-[:checked]:border-stake has-[:checked]:bg-stake/10"><input type="radio" value={v} className="accent-stake" {...form.register('propertyType')} />{l}</label>)}</div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Lot size"><Input {...form.register('lotSize')} inputMode="decimal" placeholder="12,000" /></Field>
        <Field label="Unit"><Select {...form.register('lotSizeUnit')}><option value="sf">Square feet</option><option value="acres">Acres</option></Select></Field>
        <Field label="Zoning (if known)"><Input {...form.register('zoningCode')} placeholder="R-10" /></Field>
      </div>
      <Field label="Goals or plans for this property"><Textarea {...form.register('goals')} placeholder="Sell, build a home, hold and rent, subdivide…" /></Field>
      <ConsentRow form={form} text="I agree to be contacted by DirtBid about this property. No spam; unsubscribe anytime." />
      <SubmitRow loading={lead.isPending || form.formState.isSubmitting} label="Get my free report" error={error}><span className="text-xs text-muted">No credit card. No obligation.</span></SubmitRow>
    </form>
  );
}
