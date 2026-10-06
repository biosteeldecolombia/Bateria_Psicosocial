import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { buildApp } from '../src/app.js';
import { createDb } from '../src/db/client.js';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, seedAdmin, startEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let appPool: pg.Pool;
let appEnv: TestEnv;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  const sql = fs.readFileSync(path.resolve(__dirname, '../../ops/db-roles.sql'), 'utf8').replaceAll('__APP_PASSWORD__', 'clave-de-prueba-larga');
  await env.pool.query(sql);
  const url = new URL(env.cfg.DATABASE_URL);
  url.username = 'sanithelp_app';
  url.password = 'clave-de-prueba-larga';
  appPool = new pg.Pool({ connectionString: url.toString() });
  const cfg2 = { ...env.cfg, DATABASE_URL: url.toString() };
  const { db, pool } = createDb(cfg2);
  const app = await buildApp(cfg2, db);
  await app.ready();
  appEnv = { ...env, app, pool, cfg: cfg2 };
});
afterAll(async () => {
  await appEnv?.app.close();
  await appEnv?.pool.end();
  await appPool?.end();
  await env?.stop();
});

describe('rol de la aplicación con privilegios mínimos', () => {
  it('la aplicación funciona completa con ese rol (inicio de sesión de administrador, MFA, creación de datos)', async () => {
    const { client } = await loginStaffReady(appEnv, ADMIN_EMAIL, ADMIN_PW);
    const co = await client.call('POST', '/api/admin/companies', { name: 'Empresa Rol', code: 'ROL1', minGroupSize: 5 });
    expect(co.status).toBe(201);
    expect((await client.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda rol' })).status).toBe(201);
  });

  it('no puede quitar los triggers de auditoría, alterar tablas ni modificar o borrar la auditoría', async () => {
    await expect(appPool.query('DROP TRIGGER audit_log_no_update_delete ON audit_log')).rejects.toThrow();
    await expect(appPool.query('ALTER TABLE audit_log DISABLE TRIGGER ALL')).rejects.toThrow();
    await expect(appPool.query('DROP TABLE audit_log')).rejects.toThrow();
    await expect(appPool.query("UPDATE audit_log SET action = 'x'")).rejects.toThrow();
    await expect(appPool.query('DELETE FROM audit_log')).rejects.toThrow();
    await expect(appPool.query('TRUNCATE audit_log')).rejects.toThrow();
    expect((await appPool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n).toBeGreaterThan(0);
  });
});
