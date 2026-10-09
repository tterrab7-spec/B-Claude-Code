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

export async function inbox() {
  const h = await health();
  if (!h) {
    // On-device demo clinic (PT dashboard without a server) writes here.
    try { const c = JSON.parse(localStorage.getItem('tuned.clinic') || '{}')[get().id]; return c ? { messages: c.messages || [], visits: c.visits || [], overrides: c.overrides || [], reviewed: c.reviewed } : null; } catch (e) { return null; }
  }
  try { return await api.get('inbox/' + encodeURIComponent(get().id)); } catch (e) { return null; }
}
