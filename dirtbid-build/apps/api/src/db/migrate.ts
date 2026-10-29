import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';
import { loadConfig } from '../config.js';

export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  const cfg = loadConfig();
  runMigrations(cfg.databaseUrl).then(() => { console.log('migrations applied'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
}
