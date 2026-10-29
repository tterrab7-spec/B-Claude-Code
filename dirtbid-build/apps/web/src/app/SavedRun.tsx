import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router';
import type { FeasibilityReport, UnderwritingResult } from '@dirtbid/underwriting';
import { buildReport } from '@dirtbid/underwriting';
import { api } from '@/lib/api';
import { useTitle } from '@/lib/useTitle';
import { Empty, Spinner, Badge } from '@/components/ui';
import { ReportView } from '@/components/Report';

interface RunResponse { run: { id: string; status: string; version: number; input: unknown; result: UnderwritingResult; analystNotes?: string | null; createdAt: string }; report: FeasibilityReport }

export function SavedRunPage() {
  const { runId = '' } = useParams();
  useTitle('Feasibility run');
  const q = useQuery({ queryKey: ['run', runId], queryFn: () => api.get<RunResponse>(`/feasibility/runs/${runId}`), retry: 0, enabled: !!runId });
  if (q.isLoading) return <Spinner label="Loading run" />;
  if (q.isError || !q.data) return <Empty title="Run not found or API unreachable." body={q.error instanceof Error ? q.error.message : undefined} action={<Link to="/calculator" className="btn-ghost btn-sm">Open calculator</Link>} />;
  const { run } = q.data;
  const report = q.data.report ?? buildReport(run.result, 'enhanced');
  return <div className="space-y-4"><div className="flex flex-wrap items-center gap-2 no-print"><p className="eyebrow !mb-0">Saved run</p><span className="mono text-xs text-muted">{run.id}</span><Badge tone={run.status === 'delivered' ? 'ok' : run.status === 'reviewed' ? 'blueprint' : 'muted'}>{run.status} · v{run.version}</Badge></div>{run.analystNotes && <div className="card p-4 text-sm"><p className="label">Analyst notes</p>{run.analystNotes}</div>}<ReportView report={report} result={run.result} onPrint={() => window.print()} /></div>;
}
