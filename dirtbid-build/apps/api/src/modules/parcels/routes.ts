import { z } from 'zod';
import type { App } from '../../app.js';
import { ParcelResolveError, resolveCached } from './service.js';

export async function parcelRoutes(app: App): Promise<void> {
  app.post('/parcels/resolve', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: (req: any) => req.principal?.id ?? req.ip } },
    schema: { tags: ['parcels'], description: 'Resolve a street address to parcel, zoning, flood, wetlands, slope and soils facts from public services. Cached 24h. Utilities always come back unknown; zoning only where a locality layer or Regrid key is configured.', body: z.object({ address: z.string().min(5).max(300) }) },
  }, async (req, reply) => {
    try {
      const { parcel, cached } = await resolveCached(app, req.body.address);
      return { parcel, cached };
    } catch (e) {
      if (e instanceof ParcelResolveError) return reply.status(422).send({ error: { code: 'validation', message: e.message, fields: { address: e.message } } });
      throw e;
    }
  });
}
