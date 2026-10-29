import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { LayoutDashboard, MessageSquare, KanbanSquare, LogOut, Home } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ThemeToggle, Logo, DemoPill, DemoBanner, useInPageAnchors } from '@/components/AppShell';
import { IS_DEMO } from '@/lib/demo';
import { useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';

export function PortalLayout() {
  const { token, user, loading, logout, refresh } = useAuth();
  const loc = useLocation();
  const qc = useQueryClient();
  useInPageAnchors();
  const resetDemo = async () => { const { resetDemo: reset } = await import('@/demo/server'); reset(); await qc.invalidateQueries(); await refresh(); };
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const isStaff = user?.roles.some((r) => r === 'staff' || r === 'admin');
  const items = [
    { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/app/assistant', label: 'Assistant', icon: MessageSquare },
    ...(isStaff || !user ? [{ to: '/app/leads', label: 'Leads', icon: KanbanSquare }] : []),
  ];
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {IS_DEMO && <div className="md:hidden"><DemoBanner /></div>}
      <aside className="border-b border-line bg-surface md:w-60 md:shrink-0 md:border-b-0 md:border-r no-print">
        <div className="flex items-center justify-between px-4 py-4 md:block"><div className="flex items-center gap-2"><Logo /><DemoPill /></div><div className="md:hidden flex items-center gap-2">{IS_DEMO && <button onClick={() => void resetDemo()} className="btn-ghost btn-sm">Reset demo data</button>}<ThemeToggle /></div></div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0" aria-label="Portal">
          {items.map((it) => <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}><it.icon className="h-4 w-4" />{it.label}</NavLink>)}
          <NavLink to="/" className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink"><Home className="h-4 w-4" />Site</NavLink>
        </nav>
        <div className="hidden md:block px-4 py-4 mt-auto text-xs text-muted">
          {loading ? <Spinner /> : <p className="truncate">{user?.fullName ?? user?.email ?? 'Signed in'}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2"><ThemeToggle /><button onClick={() => void logout()} className="btn-ghost btn-sm"><LogOut className="h-3.5 w-3.5" /> Log out</button>{IS_DEMO && <button onClick={() => void resetDemo()} className="btn-ghost btn-sm" title="Re-seed the in-memory demo data">Reset demo data</button>}</div>
        </div>
      </aside>
      <main className="flex-1 min-w-0"><div className="hidden md:block"><DemoBanner /></div><div className="p-4 sm:p-6 lg:p-8"><Outlet /></div></main>
    </div>
  );
}
