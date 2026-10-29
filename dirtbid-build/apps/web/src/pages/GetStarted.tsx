import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTitle } from '@/lib/useTitle';
import type { LeadResponse } from '@/lib/api';
import { Section, Field, Input, Select, Textarea, Alert, Eyebrow } from '@/components/ui';
import { ContactFields, ConsentRow, SubmitRow, contactSchema, useForm, zodResolver, z, useLeadMutation, applyServerErrors } from '@/components/LeadForm';

const schema = contactSchema.extend({ phone: z.string().min(7, 'Phone is required'), address: z.string().min(3, 'Property address is required'), city: z.string().optional(), disasterAffected: z.enum(['', 'yes', 'no', 'not_sure']), homeSizeSf: z.string().optional(), lotSize: z.string().optional(), situation: z.enum(['', 'rebuild', 'exploring', 'selling']), notes: z.string().optional() });
type Values = z.infer<typeof schema>;

export function GetStartedPage() {
  useTitle('Rebuilding After a Disaster? Start Here, Free', 'A free guided rebuild workspace: see what you can build, follow a dated roadmap, connect to vetted architects, lenders and builders.');
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { disasterAffected: '', situation: '', consent: false, website: '' } });
  const [done, setDone] = useState<LeadResponse | null>(null); const [error, setError] = useState<string | null>(null);
  const m = useLeadMutation('homeowner_rebuild');
  const onSubmit = form.handleSubmit(async (v) => { setError(null); try { const { res } = await m.mutateAsync({ contact: { fullName: v.fullName, email: v.email, phone: v.phone }, property: { address: v.address, city: v.city, homeSizeSf: v.homeSizeSf ? Number(v.homeSizeSf.replace(/,/g, '')) : undefined, lotSize: v.lotSize ? Number(v.lotSize.replace(/,/g, '')) : undefined, lotSizeUnit: 'sf' }, answers: { disasterAffected: v.disasterAffected, situation: v.situation, notes: v.notes }, consent: v.consent, website: v.website ?? '' }); setDone(res); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { setError(applyServerErrors(form, e)); } });
  const e = form.formState.errors;
  return (
    <div>
      <section className="border-b border-line bg-surface grid-paper"><div className="container-x py-14 sm:py-20"><p className="pill mb-5">Free for homeowners · rebuild and recovery communities</p><h1 className="h1 max-w-3xl">Rebuilding after a disaster? <span className="text-stake">Start here, free.</span></h1><p className="lede mt-5 max-w-2xl">A guided workspace from bare lot to move-in. We are the platform, not the contractor or architect: we connect you to vetted partners and keep the whole thing on one roadmap.</p><ul className="mt-8 grid gap-2 sm:grid-cols-2 text-sm">{['See what you can build on your lot', 'Follow a dated, step-by-step roadmap to move-in', 'Get matched to trusted architects, lenders and builders', 'Track your budget and progress from anywhere'].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 text-ok" />{t}</li>)}</ul></div></section>
      <Section>
        {done ? <Alert kind="success"><span className="font-semibold">Your free account is ready.</span> We emailed a secure sign-in link to set your password. Nothing is sent in plain text. Grade {done.grade} lead; a coordinator will reach out within one business day.</Alert> : (
          <form onSubmit={onSubmit} className="card mx-auto max-w-3xl p-6 sm:p-8 space-y-5" aria-label="Create free account">
            <div><Eyebrow>Create your free account</Eyebrow><h2 className="h3">About 60 seconds.</h2></div>
            <ContactFields form={form} phoneRequired />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Property address" required error={e.address?.message}><Input {...form.register('address')} /></Field>
              <Field label="City / area"><Input {...form.register('city')} /></Field>
              <Field label="Affected by a declared disaster?"><Select {...form.register('disasterAffected')}><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option><option value="not_sure">Not sure</option></Select></Field>
              <Field label="What best describes you?"><Select {...form.register('situation')}><option value="">Select…</option><option value="rebuild">I want to rebuild</option><option value="exploring">I am exploring my options</option><option value="selling">I am thinking about selling my lot</option></Select></Field>
              <Field label="Approx. home size before (sq ft)"><Input {...form.register('homeSizeSf')} inputMode="numeric" /></Field>
              <Field label="Approx. lot size (sq ft) or dimensions"><Input {...form.register('lotSize')} /></Field>
            </div>
            <Field label="Anything you would like us to know?"><Textarea {...form.register('notes')} /></Field>
            <ConsentRow form={form} text="I agree to be contacted by DirtBid about my rebuild." />
            <SubmitRow loading={m.isPending} label="Create my free account" error={error}><span className="text-xs text-muted">We email a secure link to set your password.</span></SubmitRow>
          </form>
        )}
      </Section>
    </div>
  );
}
