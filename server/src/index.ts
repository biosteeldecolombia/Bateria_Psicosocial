import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, runMigrations } from './db/client.js';
import { bootstrapAdmin } from './scripts/bootstrap.js';
import { purgeExpiredSessions } from './auth/service.js';

async function main() {
  let cfg;
  try {
    cfg = loadConfig();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  if (cfg.MIGRATION_DATABASE_URL) {
    const mig = createDb({ ...cfg, DATABASE_URL: cfg.MIGRATION_DATABASE_URL });
    await runMigrations(mig.db);
    await mig.pool.end();
  }
  const { db, pool } = createDb(cfg);
  if (!cfg.MIGRATION_DATABASE_URL) await runMigrations(db);
  await bootstrapAdmin(cfg, db);

  const app = await buildApp(cfg, db);
  const timer = setInterval(() => void purgeExpiredSessions(db).catch(() => undefined), 3600_000);
  timer.unref();

  const shutdown = async () => {
    clearInterval(timer);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
