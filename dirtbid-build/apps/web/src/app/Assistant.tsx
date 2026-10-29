import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Sparkles } from 'lucide-react';
import { api, type AssistantResponse } from '@/lib/api';
import { useTitle } from '@/lib/useTitle';
import { Alert, Badge, Button } from '@/components/ui';
import { CANONICAL_QA } from '@/pages/Builders';

interface Msg { role: 'user' | 'assistant'; text: string; model?: string; actions?: AssistantResponse['actions'] }

export function AssistantPage() {
  useTitle('Assistant');
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState('');
  const ask = useMutation({ mutationFn: (question: string) => api.post<AssistantResponse>('/assistant/ask', { question }) });
  const send = async (question: string) => {
    if (!question.trim()) return;
    setMsgs((m) => [...m, { role: 'user', text: question }]); setQ('');
    try { const r = await ask.mutateAsync(question); setMsgs((m) => [...m, { role: 'assistant', text: r.answer, model: r.model, actions: r.actions }]); }
    catch (e) { setMsgs((m) => [...m, { role: 'assistant', text: e instanceof Error ? `Could not reach the assistant: ${e.message}` : 'Could not reach the assistant.' }]); }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div><p className="eyebrow !mb-1">Construction intelligence</p><h1 className="h3">Ask your company a question.</h1><p className="mt-1 text-sm text-muted">Answers come from your budgets, invoices, schedules and loans. Works with rule-based answers when no model key is configured.</p></div>
      <div className="flex flex-wrap gap-2">{CANONICAL_QA.map((c) => <button key={c.q} onClick={() => void send(c.q)} className="pill hover:border-stake">{c.q}</button>)}</div>
      <div className="card min-h-[320px] p-4 space-y-3">
        {msgs.length === 0 && <Alert><span className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Pick a prompt above or type your own.</span></Alert>}
        {msgs.map((m, i) => <div key={i} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${m.role === 'user' ? 'ml-auto bg-soil text-parchment dark:bg-parchment dark:text-ink' : 'bg-surface-2'}`}><p className="whitespace-pre-wrap">{m.text}</p>{m.model && <p className="mt-2 flex items-center gap-2 text-[11px] text-muted"><Badge tone={m.model === 'claude' ? 'blueprint' : 'muted'}>{m.model}</Badge></p>}{m.actions && m.actions.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.actions.map((a, j) => <span key={j} className="pill">{a.label}</span>)}</div>}</div>)}
        {ask.isPending && <p className="text-xs text-muted">Thinking…</p>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void send(q); }} className="flex gap-2"><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Which draws are ready to submit?" aria-label="Question" /><Button type="submit" loading={ask.isPending}><Send className="h-4 w-4" /></Button></form>
    </div>
  );
}
