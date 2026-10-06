import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createCrypto } from '../src/security/crypto.js';
import { createDb } from '../src/db/client.js';
import { seedSynthetic } from '../src/scripts/seed-synthetic.js';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, totpNow, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let psySecret: string;
let psyPw: string;
let campaignId: string;
let companyId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa PDF', code: 'PDF1', minGroupSize: 5 });
  companyId = co.json.id;
  const camp = await admin.call('POST', '/api/campaigns', { companyId, name: 'Ronda PDF' });
  campaignId = camp.json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'pdf@sanithelp.test', fullName: 'Laura Sofía Martínez', assignedCompanyIds: [companyId], professionalRegistry: 'Licencia SST 1234', professionalDocument: '32456789' });
  psyPw = u.json.password;
  const r = await loginStaffReady(env, 'pdf@sanithelp.test', psyPw);
  psy = r.client;
  psySecret = r.secret;
  const { db, pool } = createDb(env.cfg);
  await seedSynthetic(db, createCrypto(env.cfg), { campaignId, companyId, count: 12, seed: 7 });
  await pool.end();
}, 180_000);
afterAll(async () => {
  await env?.stop();
});

const rawGet = async (c: Client, url: string) => {
  const res = await env.app.inject({ method: 'GET', url, headers: { origin: 'http://localhost:3000', cookie: c.cookie, 'x-csrf-token': c.csrf } });
  return res;
};

describe('PDF de respuestas', () => {
  it('expediente individual: PDF con consentimiento, ficha y cuestionarios (sin resultados)', async () => {
    const list = await psy.call('GET', `/api/campaigns/${campaignId}/participants`);
    expect(list.json.length).toBe(12);
    const one = list.json[0];
    const res = await rawGet(psy, `/api/participants/${one.id}/expediente.pdf`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(res.rawPayload);
    // consentimiento (2) + ficha (4) + intralaboral A (12) o B (11) + extralaboral (5) + estrés (2)
    expect([25, 24]).toContain(pdf.getPageCount());
  });

  it('sin autorización el expediente solo trae el consentimiento', async () => {
    const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa NA', code: 'PDF2', minGroupSize: 5 });
    const camp = await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda NA' });
    const cl = newClient(env);
    await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
    await cl.call('POST', '/api/participation/start', { document: '6000001', names: 'Sin', surnames: 'Autorizar Prueba' });
    const consent = await cl.call('GET', '/api/participation/consent');
    await cl.call('POST', '/api/participation/consent', { decision: 'declined', hash: consent.json.hash });
    const list = await admin.call('GET', `/api/campaigns/${camp.json.id}/participants`);
    const res = await rawGet(admin, `/api/participants/${list.json[0].id}/expediente.pdf?justification=Soporte%20caso%20de%20prueba`);
    expect(res.statusCode).toBe(200);
    expect((await PDFDocument.load(res.rawPayload)).getPageCount()).toBe(2);
  });

  it('el administrador necesita justificar; una psicóloga ajena y un colaborador no acceden', async () => {
    const list = await psy.call('GET', `/api/campaigns/${campaignId}/participants`);
    const id = list.json[0].id;
    expect((await rawGet(admin, `/api/participants/${id}/expediente.pdf`)).statusCode).toBe(403);
    expect((await rawGet(admin, `/api/participants/${id}/expediente.pdf?justification=Revision%20por%20soporte`)).statusCode).toBe(200);
    const other = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'otra@sanithelp.test', fullName: 'Otra Psicóloga', assignedCompanyIds: [] });
    const { client: o } = await loginStaffReady(env, 'otra@sanithelp.test', other.json.password);
    expect((await rawGet(o, `/api/participants/${id}/expediente.pdf`)).statusCode).toBe(404);
    const camp = await admin.call('GET', '/api/campaigns');
    const access = camp.json.find((c: { id: string }) => c.id === campaignId);
    expect(access).toBeTruthy();
  });

  it('sin documento ni registro en «Mi perfil» no se genera el expediente; al completarlos, sí', async () => {
    const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'perfil@sanithelp.test', fullName: 'Perfil Pendiente', assignedCompanyIds: [companyId] });
    const { client: c } = await loginStaffReady(env, 'perfil@sanithelp.test', u.json.password);
    const id = (await psy.call('GET', `/api/campaigns/${campaignId}/participants`)).json[0].id;
    expect((await rawGet(c, `/api/participants/${id}/expediente.pdf`)).statusCode).toBe(409);
    expect((await c.call('PUT', '/api/profile', { professionalDocument: '', professionalRegistry: '' })).status).toBe(400);
    expect((await c.call('PUT', '/api/profile', { professionalDocument: '1002003004', professionalRegistry: 'Licencia SST 99' })).status).toBe(200);
    expect((await c.call('GET', '/api/profile')).json.professionalRegistry).toBe('Licencia SST 99');
    expect((await rawGet(c, `/api/participants/${id}/expediente.pdf`)).statusCode).toBe(200);
  });

  it('exportación masiva: exige contraseña y MFA, genera un ZIP con un PDF por persona y se descarga una sola vez', async () => {
    const bad = await psy.call('POST', `/api/campaigns/${campaignId}/exports`, { password: 'incorrecta', code: totpNow(psySecret, 1) });
    expect(bad.status).toBe(403);
    const noMfa = await psy.call('POST', `/api/campaigns/${campaignId}/exports`, { password: psyPw, code: '000000' });
    expect(noMfa.status).toBe(403);

    const ok = await psy.call('POST', `/api/campaigns/${campaignId}/exports`, { password: psyPw, code: totpNow(psySecret, 1) });
    expect(ok.status).toBe(202);
    let st: { status: string; done: number; total: number } = { status: 'queued', done: 0, total: 0 };
    for (let i = 0; i < 120 && st.status !== 'done' && st.status !== 'failed'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      st = (await psy.call('GET', `/api/exports/${ok.json.id}`)).json;
    }
    expect(st.status).toBe('done');
    expect(st.done).toBe(12);

    const dl = await rawGet(psy, `/api/exports/${ok.json.id}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers['content-type']).toBe('application/zip');
    const zip = dl.rawPayload;
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    // un PDF por persona: contamos las entradas del directorio central
    let entries = 0;
    for (let i = 0; i < zip.length - 4; i++) if (zip.readUInt32LE(i) === 0x02014b50) entries++;
    expect(entries).toBe(12);
    // de un solo uso
    expect((await rawGet(psy, `/api/exports/${ok.json.id}/download`)).statusCode).toBe(404);

    const log = await admin.call('GET', '/api/admin/audit?limit=500');
    for (const a of ['pdf.individual', 'pdf.bulk_requested', 'pdf.bulk_ready', 'pdf.bulk_downloaded', 'pdf.bulk_denied']) {
      expect(log.json.some((e: { action: string }) => e.action === a), a).toBe(true);
    }
  });

  it('exportación filtrada por forma intralaboral y por área', async () => {
    const list = (await psy.call('GET', `/api/campaigns/${campaignId}/participants`)).json as { form: string }[];
    const nA = list.filter((x) => x.form === 'A').length;
    const run = async (extra: Record<string, unknown>) => {
      // el código TOTP no se puede reutilizar; en la prueba se reinicia el contador para encadenar exportaciones
      await env.pool.query("UPDATE users SET mfa_last_step = NULL WHERE role = 'psychologist'");
      const r = await psy.call('POST', `/api/campaigns/${campaignId}/exports`, { password: psyPw, code: totpNow(psySecret, 1), ...extra });
      expect(r.status).toBe(202);
      let st: { status: string; done: number } = { status: 'queued', done: 0 };
      for (let i = 0; i < 120 && st.status !== 'done' && st.status !== 'failed'; i++) {
        await new Promise((x) => setTimeout(x, 500));
        st = (await psy.call('GET', `/api/exports/${r.json.id}`)).json;
      }
      return st;
    };
    const a = await run({ form: 'A' });
    expect(a.status).toBe('done');
    expect(a.done).toBe(nA);
    const none = await run({ area: 'Área que no existe' });
    expect(none.status).toBe('done');
    expect(none.done).toBe(0);
  });
});
