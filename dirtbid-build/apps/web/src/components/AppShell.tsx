import { Link, NavLink, Outlet } from 'react-router';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IS_DEMO, DEMO_BANNER_KEY } from '@/lib/demo';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-bold tracking-tight ${className}`} aria-label="DirtBid Build home">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true"><rect width="32" height="32" rx="7" className="fill-soil dark:fill-parchment" /><path d="M6 24 L16 7 L26 24 Z" fill="none" stroke="rgb(242 107 29)" strokeWidth="2.5" strokeLinejoin="round" /><path d="M10 24 L22 24" stroke="rgb(42 168 160)" strokeWidth="2.5" /></svg>
      <span>DirtBid <span className="text-stake">Build</span></span>
    </Link>
  );
}

const NAV = [
  { to: '/', label: 'Platform' },
  { to: '/feasibility', label: 'Feasibility' },
  { to: '/calculator', label: 'Calculator' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/builders', label: 'Builders' },
];

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return <button onClick={toggle} className="btn-ghost btn-sm !px-2" aria-label="Toggle theme">{resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>;
}

/** In-page anchors (href="#section") must scroll, not route, under the hash router. */
export function useInPageAnchors() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
      if (!a) return; const href = a.getAttribute('href') ?? ''; if (href.startsWith('#/') || href === '#') return;
      const el = document.getElementById(href.slice(1)); if (!el) return;
      e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    document.addEventListener('click', onClick); return () => document.removeEventListener('click', onClick);
  }, []);
}

export function DemoPill() { return IS_DEMO ? <span className="rounded-md bg-stake/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-stake" title="Demo mode: in-memory data">Demo</span> : null; }

export function DemoBanner() {
  const [seen, setSeen] = useState<boolean>(() => { try { return localStorage.getItem(DEMO_BANNER_KEY) === '1'; } catch { return false; } });
  if (!IS_DEMO || seen) return null;
  return <div className="bg-soil text-parchment text-xs sm:text-sm no-print"><div className="container-x flex items-center justify-between gap-3 py-2"><span>Demo data. Nothing here is a real project.</span><button className="rounded px-2 py-0.5 hover:bg-white/10" onClick={() => { setSeen(true); try { localStorage.setItem(DEMO_BANNER_KEY, '1'); } catch { /* ignore */ } }} aria-label="Dismiss">Got it</button></div></div>;
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { token } = useAuth();
  useInPageAnchors();
  return (
    <div className="min-h-screen flex flex-col">
      <DemoBanner />
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur no-print">
        <div className="container-x flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2"><Logo /><DemoPill /></div>
          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>{n.label}</NavLink>)}
          </nav>
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            <Link to={token ? '/app' : '/login'} className="btn-ghost btn-sm">{token ? 'Portal' : 'Log in'}</Link>
            <Link to="/feasibility" className="btn-primary btn-sm">Free feasibility</Link>
          </div>
          <button className="md:hidden btn-ghost btn-sm !px-2" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {open && (
          <div className="md:hidden border-t border-line bg-bg px-4 py-3 space-y-1">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface-2">{n.label}</NavLink>)}
            <div className="flex items-center gap-2 pt-2"><ThemeToggle /><Link to={token ? '/app' : '/login'} onClick={() => setOpen(false)} className="btn-ghost btn-sm">{token ? 'Portal' : 'Log in'}</Link><Link to="/feasibility" onClick={() => setOpen(false)} className="btn-primary btn-sm">Free feasibility</Link></div>
          </div>
        )}
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="border-t border-line bg-surface no-print">
        <div className="container-x py-10 grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2"><Logo /><p className="mt-3 max-w-sm text-sm text-muted">The feasibility, build-on-your-lot and builder-operations layer of the DirtBid land platform. Built in Hampton Roads, Virginia.</p></div>
          <div><p className="label">Programs</p><ul className="space-y-2 text-sm"><li><Link to="/feasibility" className="hover:text-stake">Landowners</Link></li><li><Link to="/homebuilder" className="hover:text-stake">Home Builders</Link></li><li><Link to="/get-started" className="hover:text-stake">Homeowner Sign-Up</Link></li><li><Link to="/builders" className="hover:text-stake">Builder Operations</Link></li><li><Link to="/ai" className="hover:text-stake">AI Services</Link></li></ul></div>
          <div><p className="label">Company</p><ul className="space-y-2 text-sm"><li><Link to="/pricing" className="hover:text-stake">Pricing</Link></li><li><Link to="/calculator" className="hover:text-stake">Calculator</Link></li><li><a href="mailto:hello@dirtbid.example" className="hover:text-stake">Contact</a></li><li><a href="https://dirtbid.example" className="hover:text-stake">DirtBid</a></li></ul></div>
        </div>
        <div className="container-x pb-8 text-xs text-muted">© {new Date().getFullYear()} DirtBid. Screening-level analysis only; not a survey, appraisal, title opinion or engineering report.</div>
      </footer>
    </div>
  );
}
