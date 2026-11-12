import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
}, 120_000);

afterAll(async () => {
  await env?.stop();
});

describe('formatos PDF editables', () => {
  it('guarda código, versión y colores, y la vista previa sale como PDF', async () => {
    const cur = (await admin.call('GET', '/api/admin/pdf-settings')).json;
    expect(cur.settings.docs.disc.code).toBe('');
    expect(cur.settings.accent).toBe('#0B5C7A');
    const next = { ...cur.settings, accent: '#112233', docs: { ...cur.settings.docs, disc: { code: 'FP-PS-DISC', version: '02', title: 'Informe DISC' } } };
    expect((await admin.call('PUT', '/api/admin/pdf-settings', next)).status).toBe(200);
    expect((await admin.call('GET', '/api/admin/pdf-settings')).json.settings.docs.disc.code).toBe('FP-PS-DISC');
    const res = await env.app.inject({ method: 'POST', url: '/api/admin/pdf-settings/preview', payload: { kind: 'disc' }, headers: { origin: 'http://localhost:3000', cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rechaza colores inválidos y exige el permiso', async () => {
    const cur = (await admin.call('GET', '/api/admin/pdf-settings')).json;
    expect((await admin.call('PUT', '/api/admin/pdf-settings', { ...cur.settings, accent: 'rojo' })).status).toBe(400);
    const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'pdf@sanithelp.test', fullName: 'Psicóloga Pdf' });
    const { client: psy } = await loginStaffReady(env, 'pdf@sanithelp.test', u.json.password);
    expect((await psy.call('GET', '/api/admin/pdf-settings')).status).toBe(403);
  });
});
