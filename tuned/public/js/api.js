// Thin client for the TUNED server. Every call degrades gracefully when the app is
// running as static files with no server behind it.
import { get } from './store.js';

let online = null;

export async function health() {
  if (online !== null) return online;
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    online = r.ok ? await r.json() : false;
  } catch (e) { online = false; }
  return online;
}

async function call(method, path, body, headers = {}) {
  const r = await fetch('api/' + path, {
    method, headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

export const api = {
  get: (p, h) => call('GET', p, null, h),
  post: (p, b, h) => call('POST', p, b, h),
};

let syncTimer = null;
export function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 800);
}

export async function syncNow() {
  const h = await health();
  if (!h) return null;
  const s = get();
  if (!s.profile) return null;
  try { return await api.post('sync', { user: s }); } catch (e) { return null; }
}

// On-device clinic (PT dashboard without a server) keeps its records here.
export const LOCAL_KEYS = { clinic: 'tuned.clinic', library: 'tuned.library', audit: 'tuned.audit' };
export function localRead(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (e) { return fallback; } }
export function localWrite(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

export async function inbox() {
  const h = await health();
  if (!h) {
    const c = localRead(LOCAL_KEYS.clinic, {})[get().id] || {};
    return { messages: c.messages || [], visits: c.visits || [], overrides: c.overrides || [], reviewed: c.reviewed || null, assignment: c.assignment || null, library: localRead(LOCAL_KEYS.library, null) };
  }
  try { return await api.get('inbox/' + encodeURIComponent(get().id)); } catch (e) { return null; }
}

export async function sendToPT(text) {
  const s = get();
  if (await health()) {
    await syncNow();
    return api.post('messages/' + encodeURIComponent(s.id), { text });
  }
  const all = localRead(LOCAL_KEYS.clinic, {});
  const c = all[s.id] || {};
  c.messages = [...(c.messages || []), { from: s.profile?.name || 'Patient', role: 'patient', text: String(text).slice(0, 1000), at: new Date().toISOString() }];
  all[s.id] = c; localWrite(LOCAL_KEYS.clinic, all);
  return { ok: true, messages: c.messages };
}
