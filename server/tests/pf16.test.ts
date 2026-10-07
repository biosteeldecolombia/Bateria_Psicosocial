import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CARGO_OPTIONS, PF16_ITEMS } from '@sanithelp/shared';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let companyId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa PF', code: 'PF16', minGroupSize: 5 });
  companyId = co.json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'pf@sanithelp.test', fullName: 'Laura Sofía Martínez', assignedCompanyIds: [companyId], professionalRegistry: 'Licencia SST 1234', professionalDocument: '32456789' });
  psy = (await loginStaffReady(env, 'pf@sanithelp.test', u.json.password)).client;
}, 120_000);
afterAll(async () => {
  await env?.stop();
});

const ficha = (name: string) => ({
  '1': name, '2': 'Femenino', '3': 1990, '4': 'Soltero (a)', '5': 'Profesional completo', '6': 'Contadora',
  '7': { city: 'Barranquilla', department: 'Atlántico' }, '8': '3', '9': 'Propia', '10': 2,
  '11': { city: 'Barranquilla', department: 'Atlántico' }, '12': { lessThanYear: false, years: 4 }, '13': 'Analista',
  '14': CARGO_OPTIONS[0], '15': { lessThanYear: true }, '16': 'Contabilidad', '17': 'Término indefinido', '18': 8, '19': 'Fijo (diario, semanal, quincenal o mensual)',
});

async function start(assessments: string[], doc: string) {
  const camp = await psy.call('POST', '/api/campaigns', { companyId, name: `Ronda ${Math.random()}`, assessments });
  expect(camp.status).toBe(201);
  const cl = newClient(env);
  await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
  await cl.call('POST', '/api/participation/start', { document: doc, names: 'Ana', surnames: 'Prueba' });
  const consent = await cl.call('GET', '/api/participation/consent');
  await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash });
  await cl.call('PUT', '/api/participation/ficha', { data: ficha('Ana Prueba'), complete: true });
  return { campaignId: camp.json.id as string, cl, consent: consent.json };
}

describe('16PF', () => {
  it('tiene 187 cuestiones con tres alternativas', () => {
    expect(PF16_ITEMS).toHaveLength(187);
    expect(PF16_ITEMS.every(([, o]) => o.length === 3)).toBe(true);
  });

  it('flujo completo: validación, guardado, exportación CSV y hoja de respuestas en PDF (sin puntajes)', async () => {
    const { campaignId, cl, consent } = await start(['pf16'], '6000001');
    expect(consent.addenda.map((a: { id: string }) => a.id)).toEqual(['pf16']);
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string; total: number }) => [q.id, q.total])).toEqual([['pf16', 187]]);

    const put = (answers: Record<string, number>, complete = false) => cl.call('PUT', '/api/participation/questionnaires/pf16', { answers, complete });
    expect((await put({ 1: 3 })).status).toBe(400); // solo A, B o C
    expect((await put({ 1: -1 })).status).toBe(400);
    expect((await put({ 188: 0 })).status).toBe(400);
    const inc = await put({ 1: 0 }, true);
    expect(inc.status).toBe(400);
    expect(inc.json.missing.length).toBe(186);

    const all: Record<string, number> = {};
    for (let n = 1; n <= PF16_ITEMS.length; n++) all[n] = n % 3; // A, B, C en ciclo; la cuestión 1 queda en B
    expect((await put(all, true)).status).toBe(200);
    expect((await cl.call('POST', '/api/participation/submit')).json).toEqual({ received: true });

    const list = await psy.call('GET', `/api/campaigns/${campaignId}/pf16`);
    expect(list.status).toBe(200);
    expect(list.json.people).toHaveLength(1);
    expect(list.json.people[0].answered).toBe(187);

    const csv = await env.app.inject({ method: 'GET', url: `/api/campaigns/${campaignId}/pf16.csv`, headers: { origin: 'http://localhost:3000', cookie: psy.cookie, 'x-csrf-token': psy.csrf } });
    expect(csv.statusCode).toBe(200);
    const lines = csv.body.replace('﻿', '').split('\r\n');
    const cells = lines[1]!.split(';');
    expect(cells).toHaveLength(2 + 187);
    expect(cells.slice(2, 5)).toEqual(['2', '3', '1']); // n % 3 = 1, 2, 0 → B, C, A → 2, 3, 1

    const pdf = await env.app.inject({ method: 'GET', url: `/api/participants/${list.json.people[0].participantId}/pf16.pdf`, headers: { origin: 'http://localhost:3000', cookie: psy.cookie, 'x-csrf-token': psy.csrf } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf.rawPayload)).getPageCount()).toBe(1);
  });

  it('el administrador debe justificar el acceso a las respuestas del 16PF', async () => {
    const { campaignId } = await start(['pf16'], '6000002');
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/pf16`)).status).toBe(403);
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/pf16.csv`)).status).toBe(403);
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/pf16?justification=Soporte%20tecnico%20caso%2088`)).status).toBe(200);
  });

  it('batería, DISC, VALANTI y 16PF juntos: se piden en ese orden', async () => {
    const { cl } = await start(['pf16', 'valanti', 'disc', 'psychosocial'], '6000003');
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string }) => q.id)).toEqual(['intra_A', 'extra', 'stress', 'disc', 'valanti', 'pf16']);
  });
});
