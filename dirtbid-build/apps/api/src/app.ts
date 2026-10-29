import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { loadConfig, type Config } from './config.js';
import { createDb, schema, type Db } from './db/client.js';
import { ApiError } from './lib/errors.js';
import { verifyJwt } from './lib/jwt.js';
import { createEmailDriver, Mailer, type EmailDriver } from './lib/email.js';
import { Outbox } from './lib/events.js';
import { loadPrincipal, type Principal } from './lib/policy.js';
import { registerRoutes } from './modules/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    cfg: Config;
    db: Db;
    mailer: Mailer;
    outbox: Outbox;
    parcelFetch: typeof fetch | undefined;
  }
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export interface BuildOptions {
  config?: Partial<Config>;
  emailDriver?: EmailDriver;
  webhookFetch?: typeof fetch;
  /** Fetch used for public parcel-data services (tests inject recorded fixtures). */
  parcelFetch?: typeof fetch;
  logger?: boolean;
}

export type App = FastifyInstance<any, any, any, any, ZodTypeProvider>;

export async function buildApp(opts: BuildOptions = {}): Promise<App> {
  const cfg = loadConfig(process.env, opts.config);
  const { db, pool } = createDb(cfg.databaseUrl);

  const app = Fastify({
    logger: opts.logger ?? (cfg.nodeEnv !== 'test'
      ? { level: process.env.LOG_LEVEL ?? 'info', ...(cfg.nodeEnv === 'development' ? { transport: { target: 'pino-pretty' } } : {}) }
      : false),
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('cfg', cfg);
  app.decorate('db', db);
  app.decorate('mailer', new Mailer(opts.emailDriver ?? createEmailDriver(cfg, (s) => app.log.info(s)), cfg.emailFrom, db));
  app.decorate('outbox', new Outbox(db, { webhookUrl: cfg.n8nWebhookUrl, secret: cfg.webhookSecret, fetchImpl: opts.webhookFetch, log: (m) => app.log.warn(m) }));
  app.decorate('parcelFetch', opts.parcelFetch);
  app.decorateRequest('principal', null);

  await app.register(cors, { origin: [cfg.webUrl, /localhost:\d+$/], credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: cfg.rateLimitMax, timeWindow: '1 minute', allowList: cfg.nodeEnv === 'test' ? () => true : undefined });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'DirtBid Build API', version: '1.0.0', description: 'Feasibility, build-on-your-lot programs and builder operations for the DirtBid land platform.' },
      servers: [{ url: '/v1' }],
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Authentication: Bearer JWT or the session cookie. Sessions are revocable.
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.[cfg.cookieName] ?? null);
    if (!token) return;
    const claims = await verifyJwt(token, cfg.jwtSecret);
    if (!claims) return;
    const [session] = await db.select().from(schema.sessions).where(and(eq(schema.sessions.id, claims.sid), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date()))).limit(1);
    if (!session) return;
    req.principal = await loadPrincipal(db, claims.sub, claims.sid);
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
    }
    const anyErr = err as any;
    if (anyErr?.validation || err instanceof ZodError || anyErr?.code === 'FST_ERR_VALIDATION') {
      const fields: Record<string, string> = {};
      const issues = (anyErr.validation ?? anyErr.issues ?? []) as any[];
      for (const i of issues) {
        const path = Array.isArray(i.path) ? i.path.join('.') : (i.instancePath ?? i.params?.issue?.path?.join('.') ?? '');
        fields[path || 'body'] = i.message;
      }
      return reply.status(400).send({ error: { code: 'validation', message: 'Request failed validation', fields } });
    }
    if (anyErr?.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests' } });
    if (anyErr?.statusCode && anyErr.statusCode < 500) return reply.status(anyErr.statusCode).send({ error: { code: 'validation', message: (err as Error).message } });
    req.log.error(err as Error);
    return reply.status(500).send({ error: { code: 'internal', message: 'Internal error' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'not_found', message: 'Route not found' } }));

  await app.register(async (v1) => { await registerRoutes(v1 as unknown as App); }, { prefix: '/v1' });

  app.addHook('onClose', async () => { app.outbox.stop(); await pool.end(); });
  app.addHook('onReady', async () => { if (cfg.nodeEnv !== 'test') app.outbox.start(); });
  return app as App;
}
