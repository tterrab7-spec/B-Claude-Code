import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api, type Project, type ProjectSummary, type Milestone, type BudgetLine, type Invoice, type Draw, type Loan, type ScheduleItem, type Cashflow, type Investor, type InvestorReport, type Doc, type ProjectUpdate } from '@/lib/api';
import { cents, dateShort, pct, titleCase } from '@/lib/format';
import { useTitle } from '@/lib/useTitle';
import { Alert, Badge, Button, Empty, Field, Input, Select, Spinner, Textarea } from '@/components/ui';

type Ctx = { id: string; project: Project; summary: ProjectSummary };
const useProject = () => useOutletContext<Ctx>();
const TABS = [['', 'Overview'], ['budget', 'Budget'], ['invoices', 'Invoices'], ['draws', 'Draws'], ['schedule', 'Schedule'], ['cashflow', 'Cash flow'], ['investors', 'Investors & reports'], ['documents', 'Documents'], ['updates', 'Updates']] as const;

export function ProjectLayout() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['project', id], queryFn: () => api.get<{ project: Project; summary: ProjectSummary }>(`/projects/${id}`), retry: 0, enabled: !!id });
  useTitle(q.data?.project.name ?? 'Project');
  if (q.isLoading) return <Spinner label="Loading project" />;
  if (q.isError || !q.data) return <Empty title="Project unavailable." body={q.error instanceof Error ? q.error.message : undefined} action={<Link to="/app" className="btn-ghost btn-sm">Back to dashboard</Link>} />;
  const { project, summary } = q.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><Link to="/app" className="text-xs text-muted hover:text-ink">← Dashboard</Link><h1 className="h3 mt-1">{project.name}</h1><p className="text-sm text-muted">{project.address} · {titleCase(project.programType)}</p></div><div className="flex gap-2"><Badge tone={summary.scheduleStatus === 'on_track' ? 'ok' : summary.scheduleStatus === 'at_risk' ? 'warn' : 'bad'}>{titleCase(summary.scheduleStatus)}</Badge><Badge tone={summary.riskLevel === 'low' ? 'ok' : summary.riskLevel === 'moderate' ? 'warn' : 'bad'}>{summary.riskLevel} risk</Badge></div></div>
      <nav className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Project tabs">{TABS.map(([p, l]) => <NavLink key={p} to={p ? `/app/projects/${id}/${p}` : `/app/projects/${id}`} end className={({ isActive }) => `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${isActive ? 'border-stake text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{l}</NavLink>)}</nav>
      <Outlet context={{ id, project, summary } satisfies Ctx} />
    </div>
  );
}

export function OverviewTab() {
  const { id, summary } = useProject();
  const ms = useQuery({ queryKey: ['milestones', id], queryFn: () => api.get<Milestone[]>(`/projects/${id}/milestones`), retry: 0 });
  const tiles = [['Budget', cents(summary.budgetCents, { compact: true })], ['Committed', cents(summary.committedCents, { compact: true })], ['Invoiced', cents(summary.invoicedCents, { compact: true })], ['Paid', cents(summary.paidCents, { compact: true })], ['Forecast at completion', cents(summary.forecastAtCompletionCents, { compact: true })], ['Variance', cents(summary.varianceCents, { compact: true })], ['% complete', `${Math.round(summary.percentComplete * (summary.percentComplete <= 1 ? 100 : 1))}%`], ['Open invoices', String(summary.openInvoices)]];
  return <div className="space-y-5"><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{tiles.map(([k, v]) => <div key={k} className="kpi"><p className="kpi-label">{k}</p><p className={`kpi-value ${k === 'Variance' && summary.varianceCents > 0 ? 'text-bad' : ''}`}>{v}</p></div>)}</div>
    <div className="card p-5"><h2 className="font-bold">Milestones</h2>{ms.isLoading && <Spinner />}{ms.isError && <p className="text-sm text-muted">Milestones unavailable.</p>}{ms.data && (ms.data.length === 0 ? <p className="text-sm text-muted">No milestones.</p> : <ol className="mt-3 relative border-l border-line pl-5 space-y-4">{ms.data.map((m) => <li key={m.id} className="relative"><span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-surface ${m.status === 'complete' ? 'bg-ok' : m.status === 'in_progress' ? 'bg-blueprint' : m.status === 'blocked' ? 'bg-bad' : 'bg-line'}`} /><p className="text-[11px] uppercase tracking-wide text-muted">{titleCase(m.phase)}</p><p className="font-semibold">{m.name} <Badge tone={m.status === 'complete' ? 'ok' : m.status === 'in_progress' ? 'blueprint' : m.status === 'blocked' ? 'bad' : 'muted'}>{titleCase(m.status)}</Badge></p><p className="text-xs text-muted">{dateShort(m.plannedStart)} → {dateShort(m.plannedEnd)}{m.actualEnd ? ` · done ${dateShort(m.actualEnd)}` : ''}</p></li>)}</ol>)}</div></div>;
}

export function BudgetTab() {
  const { id } = useProject(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['budget', id], queryFn: () => api.get<{ lines: BudgetLine[]; totals?: Partial<BudgetLine> }>(`/projects/${id}/budget`), retry: 0 });
  const [form, setForm] = useState({ csiDivision: '03', description: '', originalCents: '' });
  const add = useMutation({ mutationFn: () => api.post(`/projects/${id}/budget`, { csiDivision: form.csiDivision, description: form.description, originalCents: Math.round(Number(form.originalCents) * 100) }), onSuccess: () => { setForm({ csiDivision: '03', description: '', originalCents: '' }); void qc.invalidateQueries({ queryKey: ['budget', id] }); } });
  if (q.isLoading) return <Spinner />; if (q.isError) return <Empty title="Budget unavailable." />;
  const lines = q.data?.lines ?? []; const sum = (k: keyof BudgetLine) => lines.reduce((s, l) => s + (Number(l[k]) || 0), 0);
  return <div className="space-y-4"><div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>CSI</th><th>Description</th><th className="text-right">Original</th><th className="text-right">Changes</th><th className="text-right">Revised</th><th className="text-right">Committed</th><th className="text-right">Invoiced</th><th className="text-right">Paid</th><th className="text-right">FAC</th><th className="text-right">Variance</th></tr></thead><tbody>
    {lines.map((l) => <tr key={l.id}><td className="mono">{l.csiDivision}</td><td>{l.description}</td><td className="mono text-right">{cents(l.originalCents)}</td><td className="mono text-right">{cents(l.approvedChangesCents)}</td><td className="mono text-right">{cents(l.revisedCents)}</td><td className="mono text-right">{cents(l.committedCents)}</td><td className="mono text-right">{cents(l.invoicedCents)}</td><td className="mono text-right">{cents(l.paidCents)}</td><td className="mono text-right">{cents(l.forecastAtCompletionCents)}</td><td className={`mono text-right font-semibold ${l.varianceCents > 0 ? 'text-bad' : l.varianceCents < 0 ? 'text-ok' : ''}`}>{cents(l.varianceCents)}</td></tr>)}
    {lines.length === 0 && <tr><td colSpan={10} className="text-center text-muted">No budget lines yet.</td></tr>}
  </tbody>{lines.length > 0 && <tfoot><tr className="font-bold"><td colSpan={2}>Totals</td><td className="mono text-right">{cents(sum('originalCents'))}</td><td className="mono text-right">{cents(sum('approvedChangesCents'))}</td><td className="mono text-right">{cents(sum('revisedCents'))}</td><td className="mono text-right">{cents(sum('committedCents'))}</td><td className="mono text-right">{cents(sum('invoicedCents'))}</td><td className="mono text-right">{cents(sum('paidCents'))}</td><td className="mono text-right">{cents(sum('forecastAtCompletionCents'))}</td><td className={`mono text-right ${sum('varianceCents') > 0 ? 'text-bad' : 'text-ok'}`}>{cents(sum('varianceCents'))}</td></tr></tfoot>}</table></div>
    <form onSubmit={(e) => { e.preventDefault(); add.mutate(); }} className="card grid gap-3 p-4 sm:grid-cols-[120px_1fr_160px_auto] sm:items-end"><Field label="CSI division"><Select value={form.csiDivision} onChange={(e) => setForm({ ...form, csiDivision: e.target.value })}>{['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '21', '22', '23', '26', '27', '31', '32', '33'].map((d) => <option key={d}>{d}</option>)}</Select></Field><Field label="Description"><Input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field><Field label="Original ($)"><Input required inputMode="decimal" value={form.originalCents} onChange={(e) => setForm({ ...form, originalCents: e.target.value })} /></Field><Button type="submit" loading={add.isPending}>Add line</Button>{add.isError && <div className="sm:col-span-4"><Alert kind="error">{(add.error as Error).message}</Alert></div>}</form></div>;
}

export function InvoicesTab() {
  const { id } = useProject(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['invoices', id], queryFn: () => api.get<Invoice[]>(`/projects/${id}/invoices`), retry: 0 });
  const act = useMutation({ mutationFn: ({ inv, action }: { inv: string; action: 'approve' | 'reject' | 'mark-paid' }) => api.post(`/invoices/${inv}/${action}`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: ['invoices', id] }) });
  if (q.isLoading) return <Spinner />; if (q.isError) return <Empty title="Invoices unavailable." />;
  const rows = q.data ?? [];
  return <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Invoice</th><th>Vendor</th><th className="text-right">Amount</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{rows.map((i) => <tr key={i.id}><td className="mono">{i.invoiceNumber}</td><td>{i.vendorName ?? i.vendorId ?? '—'}</td><td className="mono text-right">{cents(i.amountCents)}</td><td>{dateShort(i.dueDate)}</td><td><Badge tone={i.status === 'paid' ? 'ok' : i.status === 'approved' ? 'blueprint' : i.status === 'rejected' ? 'bad' : 'warn'}>{titleCase(i.status)}</Badge></td><td className="text-right whitespace-nowrap">{i.status === 'pending_approval' && <><button className="btn-ghost btn-sm" onClick={() => act.mutate({ inv: i.id, action: 'approve' })}>Approve</button> <button className="btn-ghost btn-sm" onClick={() => act.mutate({ inv: i.id, action: 'reject' })}>Reject</button></>}{i.status === 'approved' && <button className="btn-ghost btn-sm" onClick={() => act.mutate({ inv: i.id, action: 'mark-paid' })}>Mark paid</button>}</td></tr>)}{rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted">No invoices.</td></tr>}</tbody></table>{act.isError && <div className="p-3"><Alert kind="error">{(act.error as Error).message}</Alert></div>}</div>;
}

export function DrawsTab() {
  const { id } = useProject(); const qc = useQueryClient();
  const draws = useQuery({ queryKey: ['draws', id], queryFn: () => api.get<Draw[]>(`/projects/${id}/draws`), retry: 0 });
  const loans = useQuery({ queryKey: ['loans', id], queryFn: () => api.get<Loan[]>(`/projects/${id}/loans`), retry: 0 });
  const [loanId, setLoanId] = useState(''); const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const inv = () => { void qc.invalidateQueries({ queryKey: ['draws', id] }); void qc.invalidateQueries({ queryKey: ['invoices', id] }); };
  const create = useMutation({ mutationFn: () => api.post(`/projects/${id}/draws`, { loanId: loanId || loans.data?.[0]?.id, periodEnd }), onSuccess: inv });
  const step = useMutation({ mutationFn: ({ d, a }: { d: string; a: 'submit' | 'fund' }) => api.post(`/draws/${d}/${a}`, {}), onSuccess: inv });
  if (draws.isLoading) return <Spinner />; if (draws.isError) return <Empty title="Draws unavailable." />;
  return <div className="space-y-4">
    <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="card grid gap-3 p-4 sm:grid-cols-[1fr_180px_auto] sm:items-end"><Field label="Loan"><Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>{(loans.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.lender} · {cents(l.commitmentCents, { compact: true })} ({cents(l.drawnCents, { compact: true })} drawn)</option>)}{(loans.data ?? []).length === 0 && <option value="">No loans on file</option>}</Select></Field><Field label="Period end"><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field><Button type="submit" loading={create.isPending} disabled={(loans.data ?? []).length === 0}>Assemble draw</Button>{create.isError && <div className="sm:col-span-3"><Alert kind="error">{(create.error as Error).message}</Alert></div>}</form>
    <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Draw</th><th>Period end</th><th className="text-right">Total</th><th className="text-right">Funded</th><th>Status</th><th></th></tr></thead><tbody>{(draws.data ?? []).map((d, i) => <tr key={d.id}><td className="mono">#{i + 1} · {d.id.slice(0, 8)}</td><td>{dateShort(d.periodEnd)}</td><td className="mono text-right">{cents(d.totalCents)}</td><td className="mono text-right">{cents(d.fundedCents)}</td><td><Badge tone={d.status === 'funded' ? 'ok' : d.status === 'submitted' ? 'blueprint' : 'warn'}>{titleCase(d.status)}</Badge></td><td className="text-right">{d.status === 'draft' && <button className="btn-ghost btn-sm" onClick={() => step.mutate({ d: d.id, a: 'submit' })}>Submit</button>}{d.status === 'submitted' && <button className="btn-ghost btn-sm" onClick={() => step.mutate({ d: d.id, a: 'fund' })}>Mark funded</button>}</td></tr>)}{(draws.data ?? []).length === 0 && <tr><td colSpan={6} className="text-center text-muted">No draws yet. Approved, unpaid invoices roll into the next draw.</td></tr>}</tbody></table></div></div>;
}

export function ScheduleTab() {
  const { id } = useProject();
  const q = useQuery({ queryKey: ['schedule', id], queryFn: () => api.get<ScheduleItem[]>(`/projects/${id}/schedule`), retry: 0 });
  if (q.isLoading) return <Spinner />; if (q.isError) return <Empty title="Schedule unavailable." />;
  const items = q.data ?? []; if (items.length === 0) return <Empty title="No schedule items." />;
  const min = Math.min(...items.map((i) => +new Date(i.start))); const max = Math.max(...items.map((i) => +new Date(i.end))); const span = Math.max(1, max - min); const today = ((Date.now() - min) / span) * 100;
  return <div className="card p-4 space-y-2"><div className="flex justify-between text-xs text-muted"><span>{dateShort(new Date(min).toISOString())}</span><span>{dateShort(new Date(max).toISOString())}</span></div>{items.map((i) => { const l = ((+new Date(i.start) - min) / span) * 100; const w = Math.max(1, ((+new Date(i.end) - +new Date(i.start)) / span) * 100); return <div key={i.id} className="grid grid-cols-[160px_1fr] items-center gap-3 text-sm"><span className="truncate">{i.name}</span><div className="relative h-6 rounded bg-surface-2"><div className="absolute top-0 h-6 rounded bg-blueprint/30" style={{ left: `${l}%`, width: `${w}%` }}><div className="h-6 rounded bg-blueprint" style={{ width: `${i.percentComplete}%` }} /></div>{today >= 0 && today <= 100 && <div className="absolute top-0 h-6 w-px bg-stake" style={{ left: `${today}%` }} />}</div></div>; })}<p className="text-[11px] text-muted">Orange line = today. Solid = % complete.</p></div>;
}

export function CashflowTab() {
  const { id } = useProject();
  const q = useQuery({ queryKey: ['cashflow', id], queryFn: () => api.get<Cashflow>(`/projects/${id}/cashflow?weeks=12`), retry: 0 });
  if (q.isLoading) return <Spinner />; if (q.isError || !q.data) return <Empty title="Cash flow unavailable." />;
  const data = q.data.weeks.map((w) => ({ week: dateShort(w.weekStart).replace(/, \d{4}/, ''), Outflows: -w.outflowsCents / 100, Inflows: w.inflowsCents / 100, Cumulative: w.cumulativeCents / 100 }));
  return <div className="space-y-4">{q.data.shortfall ? <Alert kind="error"><span className="font-semibold">Projected shortfall</span> of {cents(q.data.shortfall.amountCents)} in the week of {dateShort(q.data.shortfall.weekStart)}. Submit the next draw early or line up bridge capital.</Alert> : <Alert kind="success">No projected shortfall in the next 12 weeks.</Alert>}
    <div className="card p-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}K`} /><Tooltip formatter={(v: number) => cents(v * 100)} /><ReferenceLine y={0} stroke="rgb(var(--c-line))" /><Bar dataKey="Inflows" fill="rgb(42 168 160)" radius={[4, 4, 0, 0]} /><Bar dataKey="Outflows" fill="rgb(242 107 29)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
    <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>Week</th><th className="text-right">Outflows</th><th className="text-right">Inflows</th><th className="text-right">Net</th><th className="text-right">Cumulative</th></tr></thead><tbody>{q.data.weeks.map((w) => <tr key={w.weekStart}><td>{dateShort(w.weekStart)}</td><td className="mono text-right">{cents(w.outflowsCents)}</td><td className="mono text-right">{cents(w.inflowsCents)}</td><td className={`mono text-right ${w.netCents < 0 ? 'text-bad' : ''}`}>{cents(w.netCents)}</td><td className={`mono text-right ${w.cumulativeCents < 0 ? 'text-bad font-semibold' : ''}`}>{cents(w.cumulativeCents)}</td></tr>)}</tbody></table></div></div>;
}

export function InvestorsTab() {
  const { id } = useProject(); const qc = useQueryClient();
  const inv = useQuery({ queryKey: ['investors', id], queryFn: () => api.get<Investor[]>(`/projects/${id}/investors`), retry: 0 });
  const reps = useQuery({ queryKey: ['reports', id], queryFn: () => api.get<InvestorReport[]>(`/projects/${id}/reports`), retry: 0 });
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const gen = useMutation({ mutationFn: () => api.post(`/projects/${id}/reports`, { period }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['reports', id] }) });
  const send = useMutation({ mutationFn: (r: string) => api.post(`/reports/${r}/send`, {}), onSuccess: () => void qc.invalidateQueries({ queryKey: ['reports', id] }) });
  return <div className="grid gap-4 lg:grid-cols-2">
    <div className="card p-4"><h2 className="font-bold">Investors</h2>{inv.isLoading && <Spinner />}{inv.isError && <p className="text-sm text-muted">Unavailable.</p>}<ul className="mt-3 divide-y divide-line text-sm">{(inv.data ?? []).map((i) => <li key={i.id} className="flex items-center justify-between py-2"><span>{i.name ?? i.email ?? i.userId}</span><span className="mono">{cents(i.commitmentCents, { compact: true })} · {pct(i.ownershipPct / (i.ownershipPct > 1 ? 100 : 1))}</span></li>)}{inv.data && inv.data.length === 0 && <li className="py-2 text-muted">No investors on this project.</li>}</ul></div>
    <div className="card p-4"><h2 className="font-bold">Monthly reports</h2><form onSubmit={(e) => { e.preventDefault(); gen.mutate(); }} className="mt-3 flex gap-2"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /><Button type="submit" loading={gen.isPending}>Generate</Button></form>{gen.isError && <div className="mt-2"><Alert kind="error">{(gen.error as Error).message}</Alert></div>}<ul className="mt-3 divide-y divide-line text-sm">{(reps.data ?? []).map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span>{r.period} <Badge tone={r.status === 'sent' ? 'ok' : 'warn'}>{r.status}</Badge></span>{r.status === 'draft' ? <button className="btn-ghost btn-sm" onClick={() => send.mutate(r.id)}>Send to investors</button> : <span className="text-xs text-muted">Sent {dateShort(r.sentAt)}</span>}</li>)}{reps.data && reps.data.length === 0 && <li className="py-2 text-muted">No reports generated yet.</li>}</ul></div></div>;
}

export function DocumentsTab() {
  const { id } = useProject(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['documents', id], queryFn: () => api.get<Doc[]>(`/projects/${id}/documents`), retry: 0 });
  const [category, setCategory] = useState('plans'); const [err, setErr] = useState('');
  const up = useMutation({ mutationFn: async (file: File) => { const p = await api.post<{ uploadUrl: string; documentId: string }>('/documents/presign', { projectId: id, fileName: file.name, contentType: file.type || 'application/octet-stream', category }); if (!p.uploadUrl.startsWith('demo:')) await fetch(p.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); await api.post(`/documents/${p.documentId}/complete`, {}); }, onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', id] }), onError: (e) => setErr((e as Error).message) });
  return <div className="space-y-4"><div className="card flex flex-wrap items-end gap-3 p-4"><Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{['plans', 'permits', 'contracts', 'invoices', 'lien_waivers', 'photos', 'reports', 'other'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field><label className="btn-primary cursor-pointer">{up.isPending ? 'Uploading…' : 'Upload file'}<input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); }} /></label>{err && <Alert kind="error">{err}</Alert>}</div>
    {q.isLoading && <Spinner />}{q.isError && <Empty title="Documents unavailable." />}{q.data && <div className="card overflow-x-auto"><table className="tbl"><thead><tr><th>File</th><th>Category</th><th>Uploaded</th></tr></thead><tbody>{q.data.map((d) => <tr key={d.id}><td>{d.url ? <a href={d.url} className="text-stake hover:underline" target="_blank" rel="noreferrer">{d.fileName}</a> : d.fileName}</td><td>{titleCase(d.category)}</td><td>{dateShort(d.createdAt)}</td></tr>)}{q.data.length === 0 && <tr><td colSpan={3} className="text-center text-muted">No documents.</td></tr>}</tbody></table></div>}</div>;
}

export function UpdatesTab() {
  const { id } = useProject(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['updates', id], queryFn: () => api.get<ProjectUpdate[]>(`/projects/${id}/updates`), retry: 0 });
  const [body, setBody] = useState(''); const [visibility, setVisibility] = useState('owner');
  const post = useMutation({ mutationFn: () => api.post(`/projects/${id}/updates`, { body, visibility, photoDocumentIds: [] }), onSuccess: () => { setBody(''); void qc.invalidateQueries({ queryKey: ['updates', id] }); } });
  return <div className="space-y-4"><form onSubmit={(e) => { e.preventDefault(); post.mutate(); }} className="card p-4 space-y-3"><Field label="Update"><Textarea value={body} onChange={(e) => setBody(e.target.value)} required placeholder="Framing inspection passed; roof trusses deliver Thursday." /></Field><div className="flex flex-wrap items-end gap-3"><Field label="Visibility"><Select value={visibility} onChange={(e) => setVisibility(e.target.value)}><option value="owner">Owner</option><option value="investor">Investors</option><option value="internal">Internal</option></Select></Field><Button type="submit" loading={post.isPending}>Post update</Button></div>{post.isError && <Alert kind="error">{(post.error as Error).message}</Alert>}</form>
    {q.isLoading && <Spinner />}{q.isError && <Empty title="Updates unavailable." />}{q.data && <ul className="space-y-3">{q.data.map((u) => <li key={u.id} className="card p-4 text-sm"><div className="flex items-center justify-between text-xs text-muted"><span>{u.authorName ?? 'Team'} · {dateShort(u.createdAt)}</span><Badge>{u.visibility}</Badge></div><p className="mt-2 whitespace-pre-wrap">{u.body}</p></li>)}{q.data.length === 0 && <Empty title="No updates yet." />}</ul>}</div>;
}
