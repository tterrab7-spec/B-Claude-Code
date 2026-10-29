import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTitle } from '@/lib/useTitle';
import type { LeadResponse } from '@/lib/api';
import { Section, Eyebrow, H2, Lede, Field, Select, Textarea, Alert, Badge } from '@/components/ui';
import { ContactFields, ConsentRow, SubmitRow, contactSchema, useForm, zodResolver, z, useLeadMutation, applyServerErrors } from '@/components/LeadForm';
import { useServices } from './Pricing';
import { cents } from '@/lib/format';

const schema = contactSchema.extend({ role: z.string().optional(), interest: z.string().optional(), notes: z.string().optional() });
type Values = z.infer<typeof schema>;

export function AIPage() {
  useTitle('AI Services for Builders and Developers', 'Capital raising, builder operations, feasibility and construction intelligence workflows. Strategy sprints from $997.');
  const { data } = useServices();
  const p = (code: string, fb: string) => { const s = data?.find((x) => x.code === code); return s?.priceCents ? cents(s.priceCents) : s?.priceFromCents ? `From ${cents(s.priceFromCents)}` : fb; };
  return (
    <div>
      <section className="border-b border-line bg-surface grid-paper"><div className="container-x py-14 sm:py-20"><Eyebrow>AI for residential development</Eyebrow><h1 className="h1 max-w-3xl">Builders do not need more software. They need <span className="text-blueprint">leverage</span>.</h1><p className="lede mt-5 max-w-2xl">We bring AI into the whole development workflow so a small team runs like an institutional platform: raise capital faster, automate operations, move projects from concept to construction with less friction.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#call" className="btn-primary">Schedule a strategy call</a><a href="#modules" className="btn-ghost">See the modules</a></div></div></section>
      <Section id="modules"><Eyebrow>Four modules</Eyebrow><H2>AI across the development workflow.</H2><div className="mt-8 grid gap-4 md:grid-cols-2">{[
        ['Capital raising', 'Investor decks, investment memos, pro formas, market narratives, risk analysis, investor CRM workflows, follow-up sequences and monthly reports, generated from the project ledger.'],
        ['Builder operations', 'Proposals, estimates, change orders, project communications, scheduling and admin workflows automated through n8n against your own data.'],
        ['Development feasibility', 'Land, zoning, build cost, timeline and deal viability analyzed before capital is committed, with the same engine behind the calculator.'],
        ['Construction intelligence', 'An assistant that reads budgets, invoices, schedules and loans and answers with numbers, alerts and next actions.'],
      ].map(([t, b]) => <div key={t} className="card p-6"><h3 className="font-bold">{t}</h3><p className="mt-2 text-sm text-muted">{b}</p></div>)}</div></Section>
      <Section className="bg-surface border-y border-line"><Eyebrow>AI strategy sprint</Eyebrow><H2>Not ready for the full platform? Start with a sprint.</H2><Lede>We find the highest-impact AI opportunities in your business and build them.</Lede><div className="mt-8 grid gap-4 md:grid-cols-3">{[['ai_readiness_audit', 'AI Readiness Audit', 'From $997', 'Where AI saves time, reduces overhead and improves execution.', false], ['ai_implementation', 'AI Implementation', 'From $5,000', 'Custom workflows for capital raising, estimating, proposals, investor updates and operations.', true], ['ai_ops_monthly', 'Monthly AI Operations', '$1,000/mo', 'Ongoing support, optimization and workflow management.', false]].map(([c, t, fb, b, pop]) => <div key={c as string} className={`card p-6 ${pop ? 'ring-2 ring-stake' : ''}`}>{pop ? <Badge tone="stake">Most popular</Badge> : null}<h3 className="mt-2 font-bold">{t as string}</h3><p className="mono mt-2 text-2xl font-bold">{p(c as string, fb as string)}</p><p className="mt-2 text-sm text-muted">{b as string}</p></div>)}</div></Section>
      <Section><div className="grid gap-8 lg:grid-cols-2"><div><Eyebrow>Who it is for</Eyebrow><H2>Built for the people actually building housing.</H2><ul className="mt-6 space-y-3 text-sm">{[['Small builders', 'Automate admin, proposals, estimates and project communication.'], ['Developers', 'Package deals, raise capital, manage investors, track projects.'], ['Landowners', 'Understand what can be built, what it costs and how to move.'], ['Investors', 'Review better-prepared opportunities with clearer reporting.']].map(([t, b]) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" /><span><span className="font-semibold">{t}.</span> {b}</span></li>)}</ul></div><CallForm /></div></Section>
    </div>
  );
}

function CallForm() {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { consent: false, website: '' } });
  const [done, setDone] = useState<LeadResponse | null>(null); const [error, setError] = useState<string | null>(null);
  const m = useLeadMutation('strategy_call');
  const onSubmit = form.handleSubmit(async (v) => { setError(null); try { const { res } = await m.mutateAsync({ contact: { fullName: v.fullName, email: v.email, phone: v.phone }, answers: { role: v.role, interest: v.interest, notes: v.notes }, consent: v.consent, website: v.website ?? '' }); setDone(res); } catch (e) { setError(applyServerErrors(form, e)); } });
  if (done) return <Alert kind="success"><span className="font-semibold">Got it.</span> We will send scheduling options to your email within one business day.</Alert>;
  return <form id="call" onSubmit={onSubmit} className="card p-6 space-y-5" aria-label="Strategy call request"><h3 className="h3">Schedule a strategy call</h3><ContactFields form={form} /><div className="grid gap-4 sm:grid-cols-2"><Field label="I am a"><Select {...form.register('role')}><option value="">Select…</option><option value="builder">Builder</option><option value="developer">Developer</option><option value="landowner">Landowner</option><option value="investor">Investor</option></Select></Field><Field label="Most interested in"><Select {...form.register('interest')}><option value="">Select…</option><option value="capital">Capital raising</option><option value="ops">Builder operations</option><option value="feasibility">Feasibility</option><option value="intelligence">Construction intelligence</option></Select></Field></div><Field label="What are you trying to get done?"><Textarea {...form.register('notes')} rows={3} /></Field><ConsentRow form={form} text="I agree to be contacted by DirtBid." /><SubmitRow loading={m.isPending} label="Request a call" error={error} /></form>;
}
