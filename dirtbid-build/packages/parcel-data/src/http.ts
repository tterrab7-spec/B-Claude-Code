import type { FetchLike } from './types.js';

export class UpstreamError extends Error {
  constructor(public readonly source: string, message: string, public readonly status?: number) {
    super(`${source}: ${message}`);
    this.name = 'UpstreamError';
  }
}

export function makeClient(fetchImpl: FetchLike | undefined, timeoutMs: number) {
  const f: FetchLike = fetchImpl ?? ((globalThis as unknown as { fetch: FetchLike }).fetch);
  async function getJson<T>(source: string, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<T> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await f(url, { ...init, signal: ctl.signal });
      if (!res.ok) throw new UpstreamError(source, `HTTP ${res.status}`, res.status);
      const text = await res.text();
      try { return JSON.parse(text) as T; } catch { throw new UpstreamError(source, 'non-JSON response'); }
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      throw new UpstreamError(source, (e as Error).name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (e as Error).message);
    } finally { clearTimeout(t); }
  }
  return { getJson };
}

export const qs = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
