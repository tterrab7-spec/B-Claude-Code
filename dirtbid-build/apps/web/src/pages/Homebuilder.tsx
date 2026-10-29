import { useState } from 'react';
import { Link } from 'react-router';
import { Check, X } from 'lucide-react';
import { useTitle } from '@/lib/useTitle';
import type { LeadResponse } from '@/lib/api';
import { Section, Eyebrow, H2, Lede, Field, Input, Select, Textarea, Alert, Steps } from '@/components/ui';
import { ContactFields, ConsentRow, SubmitRow, contactSchema, useForm, zodResolver, z, useLeadMutation, applyServerErrors } from '@/components/LeadForm';

const schema = contactSchema.extend({ address: z.string().optional(), ownsLand: z.enum(['yes', 'no']), budget: z.string().optional(), homeSize: z.string().optional(), timeline: z.string().optional(), goal: z.string().optional(), concern: z.string().optional() });
type Values = z.infer<typeof schema>;

export function HomebuilderPage() {
  useTitle('Build On Your Lot Without the Six-Figure Mistake', 'Feasibility, permitting, budgeting, financing and construction through one guided system for first-time home builders and landowners.');
  return (
    <div>
      <section className="border-b border-line bg-surface grid-paper"><div className="container-x grid gap-10 py-14 sm:py-20 lg:grid-cols-2 lg:items-center"><div><Eyebrow>For first-time home builders</Eyebrow><h1 className="h1">Build your home with <span className="text-blueprint">clarity</span> before you commit.</h1><p className="lede mt-5">Feasibility, permitting, budgeting, financing and construction through one guided system. Most people should not build unless the numbers work. We tell you which side of that line you are on.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#qualify" className="btn-primary">See if my property qualifies</a><Link to="/ai" className="btn-ghost">Book a strategy call</Link></div></div>
        <div className="card p-5"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-muted">Project overview · Lot 14 Pinecrest</p><span className="text-xs font-semibold text-ok">Qualified</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm">{[['Feasibility', '92/100'], ['Budget estimate', '$485K'], ['Permit roadmap', '7 steps · 3 cleared'], ['Timeline', '11 mo · on track']].map(([k, v]) => <div key={k} className="rounded-lg bg-surface-2 p-3"><p className="text-[11px] uppercase tracking-wide text-muted">{k}</p><p className="mono mt-1 font-bold">{v}</p></div>)}</div><div className="mt-4"><p className="text-[11px] uppercase tracking-wide text-muted">Cost tracking $182K / $485K</p><div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 w-[37%] rounded-full bg-blueprint" /></div><div className="mt-2 grid grid-cols-3 text-xs text-muted"><span>Land $95K</span><span>Permits $12K</span><span>Construction $75K</span></div></div></div></div></section>

      <Section><Eyebrow>Who it is for</Eyebrow><H2>Four kinds of people build with us.</H2><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Landowners', 'You own land and want to know what can be built, what it costs and whether it pencils.'], ['First-time builders', 'You want to build instead of buy and need a roadmap, budget, team and process.'], ['Families with a long view', 'You want a home designed around your life, not whatever is on the market.'], ['Investors & owners', 'You want to unlock value from an underused lot, backyard parcel or redevelopment site.']].map(([t, b]) => <div key={t} className="card p-6"><h3 className="font-bold">{t}</h3><p className="mt-2 text-sm text-muted">{b}</p></div>)}</div></Section>

      <Section className="bg-surface border-y border-line"><div className="grid gap-8 lg:grid-cols-2"><div><Eyebrow>Selective on purpose</Eyebrow><H2>We are not for everyone.</H2><Lede>Building can be a powerful path, especially if you already own land or can buy at the right basis. The wrong project is a six-figure mistake, so we screen first.</Lede></div><ul className="card p-6 space-y-2 text-sm">{['Want a fully custom luxury home with unlimited changes', 'Have no financial cushion or contingency', 'Recently overpaid for land', 'Want to micromanage every subcontractor', 'Are not ready to make timely decisions', 'Are only looking for the cheapest option'].map((t) => <li key={t} className="flex gap-2"><X className="mt-0.5 h-4 w-4 text-bad" />{t}</li>)}</ul></div></Section>

      <Section><Eyebrow>The path</Eyebrow><H2>Land to home in five steps.</H2><div className="mt-8"><Steps steps={[{ n: '01', title: 'Property intake', body: 'Property, goals, budget and timeline.' }, { n: '02', title: 'Feasibility review', body: 'Zoning, buildability, utilities, permitting risk and potential.' }, { n: '03', title: 'Cost vs buy analysis', body: 'Estimated build cost against local market value.' }, { n: '04', title: 'Build roadmap', body: 'Design, permits, financing, budget and construction plan.' }, { n: '05', title: 'Guided development', body: 'Coordination, cost tracking, documents and updates.' }]} /></div></Section>

      <Section className="bg-surface border-y border-line" id="qualify"><div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]"><div><Eyebrow>Qualification</Eyebrow><H2>Six questions decide most projects.</H2><ol className="mt-6 space-y-3">{['Do you already own the land?', 'Is your budget realistic for the market?', 'Are you open to efficient plans?', 'Is the home size aligned with neighborhood values?', 'Do you have contingency reserves?', 'Are you ready to make timely decisions?'].map((q, i) => <li key={q} className="flex gap-3 text-sm"><span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-soil text-xs font-bold text-parchment dark:bg-parchment dark:text-ink">{i + 1}</span>{q}</li>)}</ol><ul className="mt-8 grid grid-cols-2 gap-2 text-sm">{['Clarity before commitment', 'Cost discipline', 'Permit roadmap', 'Transparent process', 'Vetted execution', 'Build vs buy comparison'].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" />{t}</li>)}</ul></div><QualifyForm /></div></Section>
    </div>
  );
}

function QualifyForm() {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { ownsLand: 'yes', consent: false, website: '' } });
  const [done, setDone] = useState<LeadResponse | null>(null); const [error, setError] = useState<string | null>(null);
  const m = useLeadMutation('builder_qualification');
  const onSubmit = form.handleSubmit(async (v) => { setError(null); try { const { res } = await m.mutateAsync({ contact: { fullName: v.fullName, email: v.email, phone: v.phone }, property: { address: v.address, ownsLand: v.ownsLand === 'yes', homeSizeSf: v.homeSize ? Number(v.homeSize.replace(/,/g, '')) : undefined }, answers: { budget: v.budget, targetTimeline: v.timeline, goal: v.goal, concern: v.concern }, consent: v.consent, website: v.website ?? '' }); setDone(res); } catch (e) { setError(applyServerErrors(form, e)); } });
  if (done) return <Alert kind="success"><span className="font-semibold">Thanks. Your qualification is in.</span> Grade {done.grade}. {done.nextStep.type === 'magic_link_sent' ? 'Check your email for a secure sign-in link to your project workspace.' : 'We will follow up within one business day.'}</Alert>;
  const e = form.formState.errors;
  return (
    <form onSubmit={onSubmit} className="card p-6 space-y-5" aria-label="Qualification">
      <h3 className="h3">Thinking about building instead of buying?</h3>
      <ContactFields form={form} />
      <Field label="Property address (if you have one)"><Input {...form.register('address')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Do you currently own the land?" required><Select {...form.register('ownsLand')}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Estimated budget" error={e.budget?.message}><Select {...form.register('budget')}><option value="">Select…</option><option value="<400k">Under $400K</option><option value="400-600k">$400K to $600K</option><option value="600-900k">$600K to $900K</option><option value=">900k">Over $900K</option></Select></Field>
        <Field label="Desired home size (sf)"><Input {...form.register('homeSize')} inputMode="numeric" placeholder="2,200" /></Field>
        <Field label="Target timeline"><Select {...form.register('timeline')}><option value="">Select…</option><option value="<6mo">Start within 6 months</option><option value="6-12mo">6 to 12 months</option><option value="12-24mo">1 to 2 years</option><option value="exploring">Just exploring</option></Select></Field>
      </div>
      <Field label="What are you hoping to build?"><Textarea rows={2} {...form.register('goal')} /></Field>
      <Field label="Biggest concern about building?"><Textarea rows={2} {...form.register('concern')} /></Field>
      <ConsentRow form={form} text="I agree to be contacted by DirtBid about my project." />
      <SubmitRow loading={m.isPending} label="See if my property qualifies" error={error}><Link to="/ai" className="text-sm font-semibold text-stake">or book a strategy call</Link></SubmitRow>
    </form>
  );
}
