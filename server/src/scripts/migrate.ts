import { loadConfig } from '../config.js';
import { createDb, runMigrations } from '../db/client.js';

const cfg = loadConfig();
const { db, pool } = createDb({ ...cfg, DATABASE_URL: cfg.MIGRATION_DATABASE_URL ?? cfg.DATABASE_URL });
await runMigrations(db);
await pool.end();
console.log('Migraciones aplicadas.');
