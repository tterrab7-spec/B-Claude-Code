import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { api, type Service } from '@/lib/api';
import { cents } from '@/lib/format';
import { useTitle } from '@/lib/useTitle';
import { Section, Eyebrow, H2, Lede, FAQ, Badge } from '@/components/ui';

export const FALLBACK_SERVICES: Service[] = [
  { code: 'feasibility_snapshot', name: 'Feasibility Snapshot', priceCents: 0, billing: 'one_time', description: 'High-level zoning, buildability and value range.', includes: ['Zoning + buildability check', 'What you could build', 'Initial value range', 'Worth pursuing or not'] },
  { code: 'feasibility_enhanced', name: 'Enhanced Feasibility Report', priceCents: 75000, billing: 'one_time', creditBack: { toService: 'design_predev', windowDays: 90 }, description: 'Investor-grade analysis for owners seriously considering development.', includes: ['Full zoning + buildability analysis', 'Itemized construction cost estimate', 'ARV projections from comps', 'Sell vs build vs partner scenarios', 'Pro forma and ROI with sensitivity'] },
  { code: 'design_predev', name: 'Design & Pre-Development', priceCents: 500000, billing: 'one_time', description: 'Everything in feasibility plus the design team.', includes: ['Engineering coordination', 'Architecture', 'Design management', 'Reporting'] },
  { code: 'entitlement', name: 'Entitlement & Permitting', priceCents: null, priceFromCents: 1000000, billing: 'quote', description: 'Scope-based.', includes: ['Plan-check submittals and RFIs', 'City, county and VDOT coordination', 'Permit issuance management'] },
  { code: 'construction', name: 'Construction', priceCents: null, billing: 'quote', description: 'Custom scope, quoted after permits.', includes: ['Open-book budget', 'Vetted trades', 'Draw management'] },
  { code: 'ai_readiness_audit', name: 'AI Readiness Audit', priceCents: 99700, billing: 'one_time', description: 'Where AI saves time in your business.', includes: [] },
  { code: 'ai_implementation', name: 'AI Implementation', priceCents: null, priceFromCents: 500000, billing: 'quote', description: 'Custom workflows.', includes: [] },
  { code: 'ai_ops_monthly', name: 'Monthly AI Operations', priceCents: 100000, billing: 'monthly', description: 'Ongoing support.', includes: [] },
];

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => api.get<Service[]>('/services'), retry: 0, staleTime: 5 * 60 * 1000, placeholderData: FALLBACK_SERVICES });
}

function price(s: Service | undefined, fallback: string) {
  if (!s) return fallback;
  if (s.priceCents !== null && s.priceCents !== undefined) return s.priceCents === 0 ? 'Free' : cents(s.priceCents);
  if (s.priceFromCents) return `From ${cents(s.priceFromCents)}`;
  return 'Quoted';
}

export function PricingPage() {
  useTitle('Pricing', 'Transparent development fees: feasibility $750, design $5,000, permitting from $10,000, construction quoted. Credit-back guarantee.');
  const { data } = useServices();
  const svc = (code: string) => (data ?? FALLBACK_SERVICES).find((s) => s.code === code);
  const steps = [
    { n: 'Step 1', name: 'Feasibility Report', s: svc('feasibility_enhanced'), fb: '$750', compare: '$3,500+ typical consult', tag: 'flat', items: ['Zoning, utilities and buildability analysis', 'Lot-specific opportunity report with max offer', 'DirtBid Build platform access'], cta: ['/feasibility', 'Order feasibility'], badge: '100% credited' },
    { n: 'Step 2', name: 'Design & Pre-Development', s: svc('design_predev'), fb: '$5,000', compare: '$15K+ a la carte', tag: 'flat', items: ['Everything in Step 1', 'Engineering coordination', 'Architecture', 'Design management and reporting'], cta: ['/ai', 'Start design'], badge: 'Best value' },
    { n: 'Step 3', name: 'Entitlement & Permitting', s: svc('entitlement'), fb: 'From $10,000', compare: '$25K+ from expediters', tag: 'scope-based', items: ['Everything in Step 2', 'Plats, site plans, plan-check and RFIs', 'City, county and VDOT coordination', 'Permit issuance management'], cta: ['/ai', 'Discuss permitting'] },
    { n: 'Step 4', name: 'Construction', s: svc('construction'), fb: 'Quoted', compare: 'after permits', tag: 'custom scope', items: ['Open-book budget and schedule', 'Vetted trades and bid comparison', 'Draws assembled from approved invoices'], cta: ['/builders', 'Talk construction'] },
  ];
  return (
    <div>
      <section className="border-b border-line bg-surface grid-paper"><div className="container-x py-14 sm:py-20"><Eyebrow>Pricing</Eyebrow><h1 className="h1 max-w-3xl">Build smarter. <span className="text-stake">Skip the chaos.</span></h1><p className="lede mt-5 max-w-2xl">Feasibility, design, permitting and execution under one team, priced in steps you can stop after. The average landowner loses 6 to 9 months and $50K to $200K to avoidable mistakes. One mistake costs more than our whole fee.</p><div className="mt-8 flex flex-wrap gap-3"><Link to="/feasibility" className="btn-primary">Get my free feasibility snapshot</Link><Link to="/ai" className="btn-ghost">Book a 15-min strategy call</Link></div></div></section>

      <Section>
        <Eyebrow>Landowner & BOYL program</Eyebrow><H2>Feasibility → Design → Approved → Built.</H2><Lede>Transparent stages. Start small, expand as the numbers prove out.</Lede>
        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {steps.map((st) => (
            <div key={st.n} className={`card flex flex-col p-6 ${st.badge === 'Best value' ? 'ring-2 ring-stake' : ''}`}>
              <div className="flex items-center justify-between"><p className="eyebrow !mb-0">{st.n}</p>{st.badge && <Badge tone="stake">{st.badge}</Badge>}</div>
              <h3 className="mt-3 text-lg font-bold">{st.name}</h3>
              <p className="mt-1 text-xs text-muted line-through">{st.compare}</p>
              <p className="mono mt-2 text-3xl font-bold">{price(st.s, st.fb)}<span className="ml-1 text-xs font-medium text-muted">{st.tag}</span></p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">{st.items.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{i}</li>)}</ul>
              <Link to={st.cta[0]!} className="btn-ghost mt-6">{st.cta[1]}</Link>
            </div>
          ))}
        </div>
        <div className="mt-6 card bg-surface-2 p-6"><h3 className="font-bold">The credit-back guarantee</h3><p className="mt-2 text-sm text-muted">Move to Step 2 within 90 days and your full $750 is credited toward Design & Pre-Development. Either you get a clear answer on your land, or the report is free when you build with us. The credit is tracked automatically on your account.</p></div>
        <ul className="mt-6 grid gap-2 text-sm text-muted sm:grid-cols-3"><li>• Architectural, engineering, survey and jurisdiction fees are billed at cost.</li><li>• Timelines depend on city, county and VDOT approvals and third parties.</li><li>• Rezoning, assemblage or special approvals follow a customized scope and fee.</li></ul>
      </Section>

      <Section className="bg-surface border-y border-line">
        <Eyebrow>Builder operations</Eyebrow><H2>Choose the level of support your company needs.</H2><Lede>Independent oversight, an ops team on demand, or full day-to-day delivery. Different projects can run at different levels.</Lede>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: 'Oversight', b: 'Your team executes. We independently track and report.', items: ['Independent budget tracking', 'Committed vs actual', 'Cost-to-complete reporting', 'Schedule and draw monitoring', 'Weekly status, monthly owner report', 'Early risk escalation', 'Platform access'] },
            { n: "Owner's Rep", b: 'Your team stays in control. We help execute.', items: ['Everything in Oversight', 'Permit and inspection coordination', 'Subcontractor scheduling', 'Vendor and material coordination', 'Draw preparation', 'Owner, GC, lender and trade coordination', 'Biweekly owner meetings'], pop: true },
            { n: 'Full Delivery', b: 'We proactively run the operating functions.', items: ["Everything in Owner's Rep", 'Active project management', 'Invoice intake and reconciliation', 'Construction finance management', 'Document control and RFIs', 'Punch list, closeout, warranty', 'Dedicated priority team, weekly meetings'] },
          ].map((t) => <div key={t.n} className={`card p-6 ${t.pop ? 'ring-2 ring-stake' : ''}`}>{t.pop && <Badge tone="stake">Most popular</Badge>}<h3 className="mt-2 text-lg font-bold">{t.n}</h3><p className="mt-1 text-sm text-muted">{t.b}</p><p className="mono mt-3 text-2xl font-bold">Quoted</p><ul className="mt-4 space-y-2 text-sm">{t.items.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" />{i}</li>)}</ul><Link to="/builders" className="btn-ghost mt-6 w-full">Explore {t.n}</Link></div>)}
        </div>
      </Section>

      <Section>
        <Eyebrow>AI strategy sprint</Eyebrow><H2>Not ready for the full platform? Start with a sprint.</H2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[['ai_readiness_audit', 'AI Readiness Audit', 'From $997', 'Identify where AI saves time, reduces overhead and improves execution.'], ['ai_implementation', 'AI Implementation', 'From $5,000', 'Custom workflows for capital raising, estimating, proposals, investor updates and operations.'], ['ai_ops_monthly', 'Monthly AI Operations', '$1,000/mo', 'Ongoing support, optimization and workflow management.']].map(([code, n, fb, b]) => <div key={code} className="card p-6"><h3 className="font-bold">{n}</h3><p className="mono mt-2 text-2xl font-bold">{price(svc(code!), fb!)}{svc(code!)?.billing === 'monthly' ? <span className="text-xs text-muted">/mo</span> : ''}</p><p className="mt-2 text-sm text-muted">{b}</p><Link to="/ai" className="btn-ghost mt-5">Schedule a call</Link></div>)}
        </div>
      </Section>

      <Section className="bg-surface border-t border-line">
        <Eyebrow>Questions</Eyebrow><H2>What landowners ask before saying yes.</H2>
        <div className="mt-8"><FAQ items={[
          { q: 'What if my project is not feasible?', a: 'We tell you, in writing, with the numbers. The report is designed to kill bad projects early. Most of our value is in the ones we talk people out of.' },
          { q: 'Are city, architect and engineering fees included?', a: 'No. Third-party and jurisdiction fees are passed through at cost and shown on your budget as their own lines.' },
          { q: 'How long does each step take?', a: 'Feasibility 2 to 3 days. Design 4 to 10 weeks. Permitting depends on the locality; the roadmap shows the dated path and what is blocking.' },
          { q: 'Do I have to use you for construction?', a: 'No. Steps 1 to 3 stand alone. Many owners take the approved plans to their own builder; the platform still tracks the build if you want it to.' },
          { q: 'What if I already have an architect or engineer?', a: 'We coordinate with them. The design step is priced for management and reporting, not for replacing a team you trust.' },
          { q: 'Can I skip straight to Step 3?', a: 'If you have approved construction documents, yes. We still run a feasibility pass so the entitlement scope is priced against reality.' },
          { q: 'Where do you work?', a: 'Hampton Roads, Virginia today. LA County launching. Outside those, request a snapshot and you join the waitlist for your jurisdiction.' },
        ]} /></div>
      </Section>
    </div>
  );
}
