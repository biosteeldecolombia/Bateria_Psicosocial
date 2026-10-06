import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';
import type { Config } from '../config.js';

export function createDb(cfg: Pick<Config, 'DATABASE_URL' | 'DATABASE_SSL'>) {
  const pool = new pg.Pool({
    connectionString: cfg.DATABASE_URL,
    max: 10,
    ssl: cfg.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>['db'];

export async function runMigrations(db: Db) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // desarrollo: src/db → ../../migrations ; compilado: dist → ../migrations
  const folder = [path.resolve(here, '../../migrations'), path.resolve(here, '../migrations')].find((p) =>
    fs.existsSync(path.join(p, 'meta', '_journal.json')),
  );
  if (!folder) throw new Error('No se encontró la carpeta de migraciones');
  await migrate(db, { migrationsFolder: folder });
}
