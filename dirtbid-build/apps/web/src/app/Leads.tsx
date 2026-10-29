import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { X } from 'lucide-react';
import { api, type Lead } from '@/lib/api';
import { dateShort, titleCase } from '@/lib/format';
import { useTitle } from '@/lib/useTitle';
import { Alert, Badge, Button, Empty, Field, Select, Spinner, Textarea } from '@/components/ui';

const STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'nurture'] as const;
const gradeTone = (g: string) => (g === 'A' ? 'ok' : g === 'B' ? 'blueprint' : g === 'C' ? 'warn' : 'muted') as 'ok';

export function LeadsPage() {
  useTitle('Leads');
  const qc = useQueryClient(); const nav = useNavigate();
  const [kind, setKind] = useState(''); const [open, setOpen] = useState<Lead | null>(null); const [notes, setNotes] = useState('');
  const q = useQuery({ queryKey: ['leads', kind], queryFn: () => api.get<{ items: Lead[]; total: number }>(`/leads?limit=200${kind ? `&kind=${kind}` : ''}`), retry: 0 });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch<Lead>(`/leads/${id}`, body), onSuccess: () => void qc.invalidateQueries({ queryKey: ['leads'] }) });
  const convert = useMutation({ mutationFn: (id: string) => api.post<{ projectId: string }>(`/leads/${id}/convert`, { programType: 'boyl' }), onSuccess: (r) => nav(`/app/projects/${r.projectId}`) });
  const items = q.data?.items ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow !mb-1">Pipeline</p><h1 className="h3">Leads</h1></div><Field label="Kind"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All kinds</option>{['feasibility_snapshot', 'feasibility_enhanced', 'homeowner_rebuild', 'builder_qualification', 'builder_audit', 'calculator_unlock', 'strategy_call', 'codev_partner'].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field></div>
      {q.isLoading && <Spinner label="Loading leads" />}
      {q.isError && <Empty title="Leads unavailable." body={q.error instanceof Error ? q.error.message : undefined} />}
      {q.data && (
        <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-4 xl:grid-cols-7">
          {STATUSES.map((s) => { const col = items.filter((l) => l.status === s); return (
            <div key={s} className="min-w-[220px] rounded-xl2 border border-line bg-surface-2/60 p-2"><div className="flex items-center justify-between px-1 pb-2"><p className="text-xs font-bold uppercase tracking-wide text-muted">{s}</p><span className="mono text-xs">{col.length}</span></div><ul className="space-y-2">{col.map((l) => <li key={l.id}><button onClick={() => { setOpen(l); setNotes(l.notes ?? ''); }} className="card w-full p-3 text-left hover:border-stake"><div className="flex items-center justify-between"><span className="truncate text-sm font-semibold">{l.contact.fullName}</span><Badge tone={gradeTone(l.grade)}>{l.grade}</Badge></div><p className="mt-1 truncate text-xs text-muted">{titleCase(l.kind)}</p><p className="truncate text-xs text-muted">{l.property?.address ?? l.contact.email}</p><p className="mt-1 text-[11px] text-muted">{dateShort(l.createdAt)}</p></button></li>)}</ul></div>
          ); })}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setOpen(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} aria-label="Lead detail">
            <div className="flex items-start justify-between"><div><p className="eyebrow !mb-1">{titleCase(open.kind)}</p><h2 className="h3">{open.contact.fullName}</h2><p className="text-sm text-muted">{open.contact.email}{open.contact.phone ? ` · ${open.contact.phone}` : ''}</p></div><button className="btn-ghost btn-sm !px-2" onClick={() => setOpen(null)} aria-label="Close"><X className="h-4 w-4" /></button></div>
            <div className="mt-4 flex items-center gap-2"><Badge tone={gradeTone(open.grade)}>Grade {open.grade}</Badge><span className="mono text-sm">{open.score}/100</span></div>
            {open.property && <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">{Object.entries(open.property).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => <div key={k}><dt className="text-[11px] uppercase tracking-wide text-muted">{titleCase(k)}</dt><dd>{String(v)}</dd></div>)}</dl>}
            {open.answers && Object.keys(open.answers).length > 0 && <details className="mt-4 text-sm"><summary className="cursor-pointer font-semibold">Answers</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs">{JSON.stringify(open.answers, null, 2)}</pre></details>}
            <div className="mt-5 space-y-3">
              <Field label="Status"><Select value={open.status} onChange={(e) => { const status = e.target.value; setOpen({ ...open, status }); patch.mutate({ id: open.id, body: { status } }); }}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></Field>
              <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <div className="flex flex-wrap gap-2"><Button variant="ghost" loading={patch.isPending} onClick={() => patch.mutate({ id: open.id, body: { notes } })}>Save notes</Button><Button loading={convert.isPending} onClick={() => convert.mutate(open.id)}>Convert to project</Button></div>
              {(patch.isError || convert.isError) && <Alert kind="error">{((patch.error ?? convert.error) as Error).message}</Alert>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
