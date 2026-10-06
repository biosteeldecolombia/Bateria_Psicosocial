import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCrypto } from '../src/security/crypto.js';
import { createDb } from '../src/db/client.js';
import { seedSynthetic } from '../src/scripts/seed-synthetic.js';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let company: Client;
let campaignId: string;
let other: { campaignId: string };

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Cliente SA', code: 'CLI', minGroupSize: 5 });
  campaignId = (await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda cliente' })).json.id;
  const co2 = await admin.call('POST', '/api/admin/companies', { name: 'Otro Cliente', code: 'OTR', minGroupSize: 5 });
  other = { campaignId: (await admin.call('POST', '/api/campaigns', { companyId: co2.json.id, name: 'Ronda ajena' })).json.id };
  const u = await admin.call('POST', '/api/admin/users', { role: 'company', username: 'rrhh@cliente.test', fullName: 'Talento Humano Cliente', companyId: co.json.id });
  company = newClient(env);
  expect((await company.call('POST', '/api/auth/login', { username: 'rrhh@cliente.test', password: u.json.password })).status).toBe(200);
  const { db, pool } = createDb(env.cfg);
  await seedSynthetic(db, createCrypto(env.cfg), { campaignId, companyId: co.json.id, count: 14, seed: 5 });
  await pool.end();
}, 180_000);
afterAll(async () => {
  await env?.stop();
});

describe('reportes para la empresa cliente', () => {
  it('ve resultados agregados y anónimos de su organización', async () => {
    const list = await company.call('GET', '/api/company/campaigns');
    expect(list.json.min).toBe(5);
    expect(list.json.campaigns[0].completed).toBe(14);
    const r = await company.call('GET', `/api/company/campaigns/${campaignId}/report`);
    expect(r.status).toBe(200);
    expect(r.json.suppressed).toBe(false);
    expect(r.json.people).toBe(14);
    expect(r.json.summary.intra.total).toBe(14);
    expect(r.json.tables.length).toBe(8);
    const blob = JSON.stringify(r.json);
    // ni nombres ni documentos ni filas individuales
    expect(blob).not.toContain('Participante Demo');
    expect(blob).not.toContain('9000000');
    expect(r.json.rows).toBeUndefined();
  });

  it('oculta los grupos con menos personas que el mínimo', async () => {
    const g = await company.call('GET', `/api/company/campaigns/${campaignId}/groups?field=${encodeURIComponent('Dpto/Area/Secc')}`);
    const visible = g.json.values as { value: string; people: number }[];
    expect(visible.every((v) => v.people >= 5)).toBe(true);
    // un área inexistente (0 personas) o pequeña devuelve «suprimido» sin cifras
    const small = await company.call('GET', `/api/company/campaigns/${campaignId}/report?field=${encodeURIComponent('Dpto/Area/Secc')}&value=${encodeURIComponent('Área inventada')}`);
    expect(small.json.suppressed).toBe(true);
    expect(small.json.summary).toBeUndefined();
    expect(small.json.tables).toBeUndefined();
  });

  it('no ve campañas de otras empresas ni accede a respuestas individuales, PDF o gestión', async () => {
    expect((await company.call('GET', `/api/company/campaigns/${other.campaignId}/report`)).status).toBe(404);
    expect((await company.call('GET', `/api/campaigns/${campaignId}/results`)).status).toBe(403);
    expect((await company.call('GET', `/api/campaigns/${campaignId}/participants`)).status).toBe(403);
    expect((await company.call('GET', '/api/campaigns')).status).toBe(403);
    expect((await company.call('GET', '/api/admin/audit')).status).toBe(403);
    const res = await env.app.inject({ method: 'GET', url: '/api/participants/00000000-0000-4000-8000-000000000000/expediente.pdf', headers: { origin: 'http://localhost:3000', cookie: company.cookie, 'x-csrf-token': company.csrf } });
    expect(res.statusCode).toBe(403);
  });

  it('un grupo por característica solo ofrece categorías con 5 o más personas', async () => {
    const r = await company.call('GET', `/api/company/campaigns/${campaignId}/report?field=Sexo&value=*`);
    expect(r.json.groups.every((x: { people: number }) => x.people >= 5)).toBe(true);
  });
});
