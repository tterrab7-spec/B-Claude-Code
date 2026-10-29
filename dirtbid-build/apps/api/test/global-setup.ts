import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';

const TEST_URL = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@127.0.0.1:5432/dirtbid_test';

export default async function setup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL_TEST = TEST_URL;
  const pool = new pg.Pool({ connectionString: TEST_URL });
  await pool.query('drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;');
  await pool.end();
  await runMigrations(TEST_URL);
}
