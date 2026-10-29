import { buildApp } from './app.js';

const app = await buildApp();
try {
  await app.listen({ port: app.cfg.port, host: app.cfg.host });
  app.log.info(`DirtBid Build API on http://${app.cfg.host}:${app.cfg.port} (docs at /docs)`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
const shutdown = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
