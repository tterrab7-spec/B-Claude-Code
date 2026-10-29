import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';

export async function healthRoutes(app: App): Promise<void> {
  app.get('/health', { schema: { tags: ['system'], response: { 200: z.object({ ok: z.boolean(), db: z.boolean(), version: z.string() }) } } }, async () => {
    let db = false;
    try { await app.db.execute(sql`select 1`); db = true; } catch { db = false; }
    return { ok: db, db, version: '1.0.0' };
  });
}
