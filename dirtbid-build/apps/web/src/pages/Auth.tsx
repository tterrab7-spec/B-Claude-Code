import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTitle } from '@/lib/useTitle';
import { api, setToken, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Alert, Button, Field, Input } from '@/components/ui';
import { IS_DEMO } from '@/lib/demo';

export function LoginPage() {
  useTitle('Log in');
  const [email, setEmail] = useState(''); const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle'); const [devLink, setDevLink] = useState<string | null>(null); const [err, setErr] = useState('');
  const nav = useNavigate(); const { refresh } = useAuth();
  const enterDemo = async (token: string) => { const r = await api.get<{ token: string; user: User }>(`/auth/verify?token=${token}`); setToken(r.token); await refresh(); nav('/app'); };
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setState('sending'); setErr(''); try { const r = await api.post<{ ok: boolean; devLink?: string }>('/auth/magic-link', { email, redirectTo: `${window.location.origin}/auth/verify` }); setDevLink(r?.devLink ?? null); setState('sent'); } catch (ex) { setErr(ex instanceof Error ? ex.message : 'Failed'); setState('error'); } };
  return <div className="container-x py-16 sm:py-24"><div className="card mx-auto max-w-md p-6 sm:p-8"><p className="eyebrow mb-2">Portal</p><h1 className="h3">Log in with a magic link</h1><p className="mt-1 text-sm text-muted">No passwords. We email a one-time link that works for 15 minutes.</p>
    {IS_DEMO && <div className="mt-6 space-y-2 rounded-lg border border-stake/40 bg-stake/5 p-4"><p className="text-xs font-bold uppercase tracking-wide text-stake">Demo mode</p><Button className="w-full" onClick={() => void enterDemo('demo:staff')}>Enter demo as staff</Button><Button variant="ghost" className="w-full" onClick={() => void enterDemo('demo:builder')}>Enter demo as builder (Cascade Homes)</Button></div>}
    {state === 'sent' ? <Alert kind="success">If that address has an account, a sign-in link is on its way. {devLink && <span className="block mt-1 text-xs">Dev link: <a className="underline break-all" href={devLink}>{devLink}</a></span>}</Alert> : (
      <form onSubmit={submit} className="mt-6 space-y-4"><Field label="Email" required><Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>{err && <Alert kind="error">{err}</Alert>}<Button type="submit" loading={state === 'sending'} className="w-full">Send my link</Button></form>
    )}
    <p className="mt-6 text-xs text-muted">New here? <Link to="/get-started" className="text-stake underline">Create a free homeowner account</Link> or <Link to="/builders" className="text-stake underline">request a builder audit</Link>.</p></div></div>;
}

export function VerifyPage() {
  useTitle('Signing you in');
  const [params] = useSearchParams(); const nav = useNavigate(); const { refresh } = useAuth(); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const token = params.get('token');
    if (!token) { setErr('Missing token.'); return; }
    api.get<{ token: string; user: User }>(`/auth/verify?token=${encodeURIComponent(token)}`).then(async (r) => { setToken(r.token); await refresh(); nav('/app', { replace: true }); }).catch((e) => setErr(e instanceof Error ? e.message : 'This link is invalid or expired.'));
  }, [params, nav, refresh]);
  return <div className="container-x py-24 text-center">{err ? <div className="mx-auto max-w-md space-y-4"><Alert kind="error">{err}</Alert><Link to="/login" className="btn-ghost">Request a new link</Link></div> : <p className="text-sm text-muted">Verifying your link…</p>}</div>;
}
