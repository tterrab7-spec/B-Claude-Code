import { type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export function Section({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`py-14 sm:py-20 ${className}`}><div className="container-x">{children}</div></section>;
}
export function Eyebrow({ children }: { children: ReactNode }) { return <p className="eyebrow mb-3">{children}</p>; }
export function H2({ children, className = '' }: { children: ReactNode; className?: string }) { return <h2 className={`h2 ${className}`}>{children}</h2>; }
export function Lede({ children, className = '' }: { children: ReactNode; className?: string }) { return <p className={`lede mt-4 max-w-2xl ${className}`}>{children}</p>; }

export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="label">{label}{required && <span className="text-stake"> *</span>}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-bad">{error}</span>}
    </label>
  );
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...p }, ref) { return <input ref={ref} className={`input ${className}`} {...p} />; });
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...p }, ref) { return <select ref={ref} className={`select ${className}`} {...p}>{children}</select>; });
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...p }, ref) { return <textarea ref={ref} className={`input min-h-[96px] ${className}`} {...p} />; });

export function Button({ variant = 'primary', loading, children, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'dark' | 'ghost'; loading?: boolean }) {
  const v = variant === 'primary' ? 'btn-primary' : variant === 'dark' ? 'btn-dark' : 'btn-ghost';
  return <button className={`${v} ${className}`} disabled={loading || p.disabled} {...p}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>;
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const cls = kind === 'error' ? 'border-bad/40 bg-bad/10 text-bad' : kind === 'success' ? 'border-ok/40 bg-ok/10 text-ok' : kind === 'warn' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-blueprint/40 bg-blueprint/10 text-blueprint';
  const Icon = kind === 'error' ? AlertCircle : CheckCircle2;
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${cls}`} role={kind === 'error' ? 'alert' : 'status'}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="text-ink">{children}</div></div>;
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ok' | 'warn' | 'bad' | 'stake' | 'blueprint' }) {
  const t = { muted: 'bg-surface-2 text-muted', ok: 'bg-ok/15 text-ok', warn: 'bg-warn/15 text-warn', bad: 'bg-bad/15 text-bad', stake: 'bg-stake/15 text-stake', blueprint: 'bg-blueprint/15 text-blueprint' }[tone];
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${t}`}>{children}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <div className="card grid-paper p-10 text-center"><p className="font-semibold">{title}</p>{body && <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}
export function Spinner({ label = 'Loading' }: { label?: string }) { return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />{label}…</div>; }

export function Steps({ steps }: { steps: { n: string; title: string; body: string }[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((s) => (
        <li key={s.n} className="card p-5"><span className="mono text-xs font-semibold text-stake">{s.n}</span><h3 className="mt-2 font-bold">{s.title}</h3><p className="mt-1.5 text-sm text-muted">{s.body}</p></li>
      ))}
    </ol>
  );
}

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-line rounded-xl2 border border-line bg-surface">
      {items.map((it) => (
        <details key={it.q} className="group p-5"><summary className="cursor-pointer list-none font-semibold flex items-center justify-between gap-4">{it.q}<span className="text-muted transition group-open:rotate-45">+</span></summary><p className="mt-3 text-sm text-muted leading-relaxed">{it.a}</p></details>
      ))}
    </div>
  );
}

export function Honeypot({ register }: { register: (name: 'website') => Record<string, unknown> }) {
  return <div className="sr-only-hp" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" {...register('website')} /></label></div>;
}
