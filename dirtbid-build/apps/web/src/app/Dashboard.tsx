import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api, ApiError, type PortfolioSummary } from '@/lib/api';
import { cents } from '@/lib/format';
import { useTitle } from '@/lib/useTitle';
import { Badge, Empty, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function DashboardPage() {
  useTitle('Dashboard');
  const { user } = useAuth();
  const orgId = user?.organizations[0]?.id;
  const q = useQuery({ queryKey: ['portfolio', orgId], queryFn: () => api.get<PortfolioSummary>(`/portfolio/summary${orgId ? `?organizationId=${orgId}` : ''}`), retry: 0 });
  const d = q.data;
  const tiles = d ? [
    ['Active projects', String(d.activeProjects)], ['Construction budget', cents(d.constructionBudgetCents, { compact: true })], ['Committed', cents(d.committedCents, { compact: true })], ['Forecast at completion', cents(d.forecastAtCompletionCents, { compact: true })],
    ['Remaining loan proceeds', cents(d.remainingLoanProceedsCents, { compact: true })], ['Cash needed (30d)', cents(d.cashNeeded30dCents, { compact: true })], ['Projects at risk', String(d.projectsAtRisk)], ['Reports due', String(d.reportsDue)],
  ] : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow !mb-1">Portfolio</p><h1 className="h3">Dashboard</h1></div><Link to="/calculator" className="btn-ghost btn-sm">New underwriting</Link></div>
      {q.isLoading && <Spinner label="Loading portfolio" />}
      {q.isError && <Empty title={q.error instanceof ApiError && q.error.code === 'network' ? 'The API is not reachable right now.' : 'Could not load your portfolio.'} body={q.error instanceof Error ? q.error.message : undefined} action={<button className="btn-ghost btn-sm" onClick={() => void q.refetch()}>Retry</button>} />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{tiles.map(([k, v]) => <div key={k} className="kpi"><p className="kpi-label">{k}</p><p className="kpi-value">{v}</p></div>)}</div>
          {d.projects.length === 0 ? <Empty title="No projects yet." body="Convert a lead or create a project from a saved feasibility run to see it here." /> : (
            <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Project</th><th>Stage</th><th className="text-right">Budget</th><th className="text-right">Committed</th><th className="text-right">FAC</th><th>Schedule</th><th>Draw</th><th>Risk</th></tr></thead><tbody>
              {d.projects.map((p) => <tr key={p.id}><td><Link to={`/app/projects/${p.id}`} className="font-semibold hover:text-stake">{p.name}</Link></td><td className="capitalize">{p.stage.replace(/_/g, ' ')}</td><td className="mono text-right">{cents(p.budgetCents, { compact: true })}</td><td className="mono text-right">{cents(p.committedCents, { compact: true })}</td><td className="mono text-right">{cents(p.facCents, { compact: true })}</td><td><Badge tone={p.scheduleStatus === 'on_track' ? 'ok' : p.scheduleStatus === 'at_risk' ? 'warn' : 'bad'}>{p.scheduleStatus.replace(/_/g, ' ')}</Badge></td><td className="capitalize">{p.drawStatus.replace(/_/g, ' ')}</td><td><Badge tone={p.riskLevel === 'low' ? 'ok' : p.riskLevel === 'moderate' ? 'warn' : 'bad'}>{p.riskLevel}</Badge></td></tr>)}
            </tbody></table></div>
          )}
        </>
      )}
    </div>
  );
}
