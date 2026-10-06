import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCrypto } from '../src/security/crypto.js';
import { createDb } from '../src/db/client.js';
import { seedSynthetic } from '../src/scripts/seed-synthetic.js';
import { ENCRYPTED_COLUMNS, rotateEncryptionKeys } from '../src/scripts/rotate-keys.js';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, seedAdmin, startEnv, type TestEnv } from './helpers.js';
import { randomBytes } from 'node:crypto';

let env: TestEnv;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  const { client: admin } = await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW);
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa Rotación', code: 'ROT1', minGroupSize: 5 });
  const camp = await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda rotación' });
  const { db, pool } = createDb(env.cfg);
  await seedSynthetic(db, createCrypto(env.cfg), { campaignId: camp.json.id, companyId: co.json.id, count: 3, seed: 3 });
  await pool.end();
});
afterAll(async () => env?.stop());

describe('rotación de la clave de cifrado', () => {
  it('toda columna *_enc de la base está cubierta por el script', async () => {
    const { rows } = await env.pool.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name LIKE '%\_enc'",
    );
    const found = rows.map((r) => `${r.table_name}.${r.column_name}`).sort();
    const listed = Object.entries(ENCRYPTED_COLUMNS).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)).sort();
    expect(listed).toEqual(found);
  });

  it('re-cifra con la versión nueva, conserva el contenido y es idempotente', async () => {
    const newKey = randomBytes(32).toString('base64');
    const cfg2 = { ...env.cfg, DATA_ENCRYPTION_KEY: newKey, DATA_ENCRYPTION_KEY_VERSION: 2, DATA_ENCRYPTION_KEYS_OLD: `1:${env.cfg.DATA_ENCRYPTION_KEY}` };
    const c1 = createCrypto(env.cfg);
    const c2 = createCrypto(cfg2);
    const before = (await env.pool.query('SELECT document_enc FROM participants ORDER BY created_at')).rows.map((r) => c1.decrypt(r.document_enc));

    const first = await rotateEncryptionKeys(env.pool, c2, 2);
    expect(first.rotated).toBeGreaterThan(0);
    const after = (await env.pool.query('SELECT document_enc FROM participants ORDER BY created_at')).rows;
    expect(after.every((r) => r.document_enc.startsWith('v2:'))).toBe(true);
    expect(after.map((r) => c2.decrypt(r.document_enc))).toEqual(before);
    expect((await rotateEncryptionKeys(env.pool, c2, 2)).rotated).toBe(0);
  });
});
