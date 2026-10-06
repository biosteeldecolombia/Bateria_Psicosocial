import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCrypto } from '../src/security/crypto.js';
import { createDb } from '../src/db/client.js';
import { seedSynthetic } from '../src/scripts/seed-synthetic.js';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, seedAdmin, startEnv, totpNow, type Client, type TestEnv } from './helpers.js';

/**
 * Prueba de carga con 800 personas sintéticas (una empresa grande). Se ejecuta con:  PERF=1 npm test -w server -- perf
 * Mide tiempo de cálculo de resultados, de los resúmenes y de la exportación masiva de PDF (con pico de memoria).
 */
const N = 800;
let env: TestEnv;
let psy: Client;
let secret: string;
let pw: string;
let campaignId: string;

describe.skipIf(!process.env.PERF)(`carga: ${N} personas`, () => {
  beforeAll(async () => {
    env = await startEnv();
    await seedAdmin(env);
    const admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
    const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa Grande', code: 'BIG', minGroupSize: 5 });
    campaignId = (await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda masiva' })).json.id;
    const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'carga@sanithelp.test', fullName: 'Psicóloga Carga', assignedCompanyIds: [co.json.id] });
    pw = u.json.password;
    const r = await loginStaffReady(env, 'carga@sanithelp.test', pw);
    psy = r.client;
    secret = r.secret;
    const { db, pool } = createDb(env.cfg);
    const t = Date.now();
    await seedSynthetic(db, createCrypto(env.cfg), { campaignId, companyId: co.json.id, count: N, seed: 99 });
    await pool.end();
    console.log(`[carga] ${N} participantes sembrados en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }, 600_000);
  afterAll(async () => {
    await env?.stop();
  });

  it('calcula los resultados de 800 personas y arma los resúmenes', async () => {
    const t0 = Date.now();
    const res = await psy.call('GET', `/api/campaigns/${campaignId}/results`);
    const t1 = Date.now();
    const sum = await psy.call('GET', `/api/campaigns/${campaignId}/summary`);
    const dom = await psy.call('GET', `/api/campaigns/${campaignId}/domains`);
    const t2 = Date.now();
    console.log(`[carga] resultados ${res.json.rows.length} filas: ${t1 - t0} ms · resumen+dominios: ${t2 - t1} ms`);
    expect(res.json.rows.length).toBe(N);
    expect(sum.json.summary.people).toBe(N);
    expect(dom.json.people).toBe(N);
    expect(t1 - t0).toBeLessThan(30_000);
  }, 120_000);

  it('exporta 800 expedientes PDF en un ZIP sin agotar la memoria', async () => {
    let peak = process.memoryUsage().rss;
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 200);
    const t0 = Date.now();
    const job = await psy.call('POST', `/api/campaigns/${campaignId}/exports`, { password: pw, code: totpNow(secret, 1) });
    expect(job.status).toBe(202);
    let st: { status: string; done: number; total: number } = { status: 'queued', done: 0, total: 0 };
    while (st.status !== 'done' && st.status !== 'failed') {
      await new Promise((r) => setTimeout(r, 2000));
      st = (await psy.call('GET', `/api/exports/${job.json.id}`)).json;
    }
    clearInterval(timer);
    const secs = (Date.now() - t0) / 1000;
    console.log(`[carga] exportación ${st.done}/${st.total} PDF: ${secs.toFixed(1)} s (${((secs / st.done) * 1000).toFixed(0)} ms por persona) · pico de memoria ${(peak / 1048576).toFixed(0)} MB`);
    expect(st.status).toBe('done');
    expect(st.done).toBe(N);
    expect(peak / 1048576).toBeLessThan(2048);
  }, 1_800_000);
});
