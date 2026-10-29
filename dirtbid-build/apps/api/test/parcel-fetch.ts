import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Fixture { address: string; recorded: Record<string, { status: number; body: unknown }> }

export function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8')) as Fixture;
}

/**
 * Builds a fetch from a recorded fixture: exact "<METHOD> <url>[ <body>]" keys win,
 * then the first key whose origin+path matches. Unmatched URLs return 404 so the
 * resolver records a warning instead of hanging. Counts calls for cache tests.
 */
export function fixtureFetch(fixture: Fixture, overrides: Record<string, { status: number; body: unknown }> = {}): { fetch: typeof fetch; calls: string[] } {
  const recorded = { ...fixture.recorded, ...overrides };
  const calls: string[] = [];
  const byPath = new Map<string, { status: number; body: unknown }>();
  for (const [k, v] of Object.entries(recorded)) {
    const [method, url] = k.split(' ', 2);
    try { const u = new URL(url!); byPath.set(`${method} ${u.origin}${u.pathname}`, v); } catch { /* ignore */ }
  }
  const f = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${url}`);
    const exact = recorded[`${method} ${url}${init?.body ? ' ' + init.body : ''}`] ?? recorded[`${method} ${url}`];
    let hit = exact;
    if (!hit) { const u = new URL(url); hit = byPath.get(`${method} ${u.origin}${u.pathname}`); }
    if (!hit) return new Response('not recorded', { status: 404 });
    return new Response(typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
