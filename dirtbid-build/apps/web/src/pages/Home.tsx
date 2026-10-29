import { Link } from 'react-router';
import { ArrowRight, Layers, LineChart, ShieldCheck, Workflow, MapPin } from 'lucide-react';
import { useTitle } from '@/lib/useTitle';
import { Section, Eyebrow, H2, Lede, Steps } from '@/components/ui';

const STEPS = [
  { n: '01', title: 'Feasibility', body: 'Zoning, utilities, environmental and comps tied to a real cost stack and a max offer.' },
  { n: '02', title: 'Design & Pre-Dev', body: 'Architecture and engineering coordinated in parallel so the front end compresses.' },
  { n: '03', title: 'Entitlement & Permits', body: 'Plats, site plans, VDOT and plan-check managed against a dated roadmap.' },
  { n: '04', title: 'Construction', body: 'Vetted trades, open-book budget, draws assembled from approved invoices.' },
  { n: '05', title: 'Track & Deliver', body: 'Live budget, schedule, cash and investor reporting through closeout.' },
];

export function HomePage() {
  useTitle('DirtBid Build — Feasibility, build-on-your-lot and builder operations', 'DirtBid Build turns a parcel into a decision: underwriting, entitlement tracking, construction finance and investor reporting in one system.');
  return (
    <div>
      <section className="relative overflow-hidden border-b border-line bg-surface grid-paper">
        <div className="container-x grid gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="pill mb-5"><MapPin className="h-3.5 w-3.5 text-stake" /> Live in Hampton Roads, VA · Launching LA County, CA</p>
            <h1 className="h1">The operating system between <span className="text-stake">dirt</span> and <span className="text-blueprint">delivered</span>.</h1>
            <p className="lede mt-5 max-w-xl">DirtBid finds and bids the land. Build underwrites it, entitles it, builds it and reports on it, for landowners who want the upside without becoming developers and for builders who want institutional controls without a bigger back office.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link to="/feasibility" className="btn-primary">Get a free feasibility snapshot <ArrowRight className="h-4 w-4" /></Link><Link to="/calculator" className="btn-ghost">Run the calculator</Link></div>
            <p className="mt-4 text-xs text-muted">Built by the team that delivered 300+ finished lots to NVR / Ryan Homes and 250+ affordable units in Virginia.</p>
          </div>
          <MiniDashboard />
        </div>
      </section>

      <Section>
        <Eyebrow>The problem</Eyebrow>
        <H2>Most projects lose money before a shovel moves.</H2>
        <Lede>Feasibility that ignores real construction cost. Consultants who hand off in sequence. No single ledger for budget, schedule and scope. The result is 6 to 9 months and $50K to $200K of avoidable loss on a typical $1M to $3M project.</Lede>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { icon: Layers, t: 'Aligned from day one', b: 'Underwriting, design, engineering and permitting move in parallel against one cost model.' },
            { icon: LineChart, t: 'Earlier, better decisions', b: 'Value engineering happens before drawings are final, not after the bids come in high.' },
            { icon: ShieldCheck, t: 'One ledger, open book', b: 'Budget lines, commitments, invoices, draws and change orders reconcile to the same numbers investors see.' },
          ].map((c) => <div key={c.t} className="card p-6"><c.icon className="h-6 w-6 text-stake" /><h3 className="mt-4 font-bold">{c.t}</h3><p className="mt-2 text-sm text-muted">{c.b}</p></div>)}
        </div>
      </Section>

      <Section className="bg-surface border-y border-line" id="how-it-works">
        <Eyebrow>How it works</Eyebrow>
        <H2>Concept to closeout, in one workflow.</H2>
        <div className="mt-10"><Steps steps={STEPS} /></div>
      </Section>

      <Section>
        <Eyebrow>Who it is for</Eyebrow>
        <H2>Four doors into the same system.</H2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: 'Landowners', b: 'See what your lot can become and what it is worth before a developer tells you.', to: '/feasibility', cta: 'Free snapshot' },
            { t: 'Builders', b: 'Project accounting, draws, cash flow and investor reporting run by an ops team on one platform.', to: '/builders', cta: 'Book an audit' },
            { t: 'Investors', b: 'Review better-packaged deals with monthly reporting you did not have to chase.', to: '/ai', cta: 'See reporting' },
            { t: 'Homeowners rebuilding', b: 'A dated roadmap from bare lot to move-in, with vetted architects, lenders and builders.', to: '/get-started', cta: 'Start free' },
          ].map((c) => <Link key={c.t} to={c.to} className="card group p-6 hover:border-stake"><h3 className="font-bold">{c.t}</h3><p className="mt-2 text-sm text-muted">{c.b}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-stake">{c.cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span></Link>)}
        </div>
      </Section>

      <Section className="bg-soil text-parchment">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div><Eyebrow>Markets</Eyebrow><h2 className="h2 text-parchment">Calibrated per jurisdiction, not per press release.</h2><p className="mt-4 text-parchment/80 leading-relaxed">Each market ships with its own zoning table, overlay rules and cost stack. Hampton Roads carries Chesapeake Bay RPA buffers, FEMA zones, VDOT entrance and street-acceptance rules and HRSD availability. LA County carries SB 9, ADU law and the Eaton Fire like-for-like lane.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['Hampton Roads, VA', 'Hampton · Newport News · Norfolk · Virginia Beach · Chesapeake · Suffolk · York · James City', 'Live'], ['LA County, CA', 'Altadena · Pasadena · Sierra Madre · La Cañada · South Pasadena · San Marino · Arcadia', 'Launching']].map(([t, b, s]) => <div key={t} className="rounded-xl2 border border-parchment/15 bg-white/5 p-5"><div className="flex items-center justify-between"><h3 className="font-bold">{t}</h3><span className="rounded-md bg-stake/20 px-2 py-0.5 text-[11px] font-bold uppercase text-stake">{s}</span></div><p className="mt-2 text-sm text-parchment/70">{b}</p></div>)}
          </div>
        </div>
      </Section>

      <Section>
        <div className="card grid-paper flex flex-col items-start gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div><Eyebrow>Next step</Eyebrow><h2 className="h3">Bring your parcel under one system.</h2><p className="mt-1 text-sm text-muted">Free snapshot in 2 to 3 days. Or run the numbers yourself right now.</p></div>
          <div className="flex flex-wrap gap-3"><Link to="/feasibility" className="btn-primary">Free feasibility</Link><Link to="/ai" className="btn-ghost"><Workflow className="h-4 w-4" /> Book a strategy call</Link></div>
        </div>
      </Section>
    </div>
  );
}

function MiniDashboard() {
  return (
    <div className="card p-5 lg:ml-auto lg:w-[460px]" aria-hidden="true">
      <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-muted">Lot 14 · Pinecrest</p><span className="flex items-center gap-1.5 text-xs font-semibold text-ok"><span className="h-2 w-2 rounded-full bg-ok" /> Active</span></div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[['Budget', '$485K'], ['Progress', '68%'], ['Timeline', 'On track']].map(([k, v]) => <div key={k} className="rounded-lg bg-surface-2 p-3"><p className="text-[11px] uppercase tracking-wide text-muted">{k}</p><p className="mono mt-1 text-lg font-bold">{v}</p></div>)}
      </div>
      <div className="mt-4"><div className="flex justify-between text-[11px] text-muted"><span>Feasibility</span><span>Permits</span><span>Construction</span><span>Handoff</span></div><div className="mt-1 h-2 rounded-full bg-line"><div className="h-2 w-[68%] rounded-full bg-gradient-to-r from-blueprint to-stake" /></div></div>
      <div className="mt-4 flex items-end gap-1.5 h-20">{[30, 45, 40, 60, 55, 75, 70, 90, 85, 100].map((h, i) => <div key={i} className="flex-1 rounded-t bg-blueprint/70" style={{ height: `${h}%` }} />)}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div className="rounded-lg border border-line p-2.5"><p className="text-muted">Draw package</p><p className="font-semibold">Ready to submit</p></div><div className="rounded-lg border border-line p-2.5"><p className="text-muted">Investor report</p><p className="font-semibold">Sent · Oct</p></div></div>
    </div>
  );
}
