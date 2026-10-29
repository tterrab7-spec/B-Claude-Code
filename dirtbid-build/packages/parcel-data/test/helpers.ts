import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FetchLike } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));

export interface Fixture { address: string; recorded: Record<string, { status: number; body: string }> }

export function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(here, 'fixtures', `${name}.json`), 'utf8')) as Fixture;
}

/** Replays recorded responses. Unknown URLs fail loudly so a test cannot silently hit the network. */
export function fetchFromFixture(fx: Fixture, overrides: Record<string, { status: number; body: string }> = {}): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string, init?: { method?: string; body?: string }) => {
    const key = (init?.method ?? 'GET') + ' ' + url + (init?.body ? ' ' + init.body : '');
    calls.push(key);
    const hit = overrides[key] ?? fx.recorded[key] ?? matchLoose(fx.recorded, key, overrides);
    if (!hit) throw new Error(`No fixture for ${key.slice(0, 160)}`);
    return { ok: hit.status >= 200 && hit.status < 300, status: hit.status, text: async () => hit.body, json: async () => JSON.parse(hit.body) };
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

// Elevation samples carry floating-point coordinates that can differ in the last digit between runs; match on host + rounded coords.
function matchLoose(rec: Record<string, { status: number; body: string }>, key: string, overrides: Record<string, { status: number; body: string }>) {
  const norm = (k: string) => k.replace(/(-?\d+\.\d{6})\d+/g, '$1');
  const nk = norm(key);
  for (const [k, v] of Object.entries({ ...rec, ...overrides })) if (norm(k) === nk) return v;
  return undefined;
}

export const failingFetch: FetchLike = async () => { throw new Error('network down'); };
