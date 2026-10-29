import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { listMarkets } from '@dirtbid/underwriting';
import type { App } from '../../app.js';
import { schema } from '../../db/client.js';
import { SERVICE_CATALOG } from './catalog.js';

export async function ensureCatalog(db: App['db']): Promise<void> {
  for (const s of SERVICE_CATALOG) {
    await db.insert(schema.serviceCatalog).values(s).onConflictDoUpdate({ target: schema.serviceCatalog.code, set: { name: s.name, priceCents: s.priceCents, priceFromCents: s.priceFromCents, billing: s.billing, creditBack: s.creditBack, description: s.description, includes: s.includes, sortOrder: s.sortOrder } });
  }
}

export async function catalogRoutes(app: App): Promise<void> {
  app.get('/markets', { schema: { tags: ['catalog'] } }, async () =>
    listMarkets().map((m) => ({
      code: m.code, name: m.name, state: m.state, jurisdiction: m.jurisdiction,
      zoningCodes: m.zoning.map((z) => z.code), zipBands: m.zipBands, defaultArvPerSf: m.defaultArvPerSf,
      assumptions: m.assumptions, permitMonths: m.permitMonths, calibrationNote: m.calibrationNote,
    })),
  );

  app.get('/services', { schema: { tags: ['catalog'], querystring: z.object({ includeInactive: z.coerce.boolean().optional() }) } }, async (req) => {
    const rows = await app.db.select().from(schema.serviceCatalog).where(req.query.includeInactive ? undefined : eq(schema.serviceCatalog.active, true)).orderBy(asc(schema.serviceCatalog.sortOrder));
    return rows.map((r) => ({ code: r.code, name: r.name, priceCents: r.priceCents, priceFromCents: r.priceFromCents, billing: r.billing, creditBack: r.creditBack ?? undefined, description: r.description, includes: r.includes }));
  });
}
