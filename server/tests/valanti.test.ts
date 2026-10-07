import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CARGO_OPTIONS, VALANTI_PAIRS } from '@sanithelp/shared';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let companyId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa VAL', code: 'VAL1', minGroupSize: 5 });
  companyId = co.json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'val@sanithelp.test', fullName: 'Laura Sofía Martínez', assignedCompanyIds: [companyId], professionalRegistry: 'Licencia SST 1234', professionalDocument: '32456789' });
  psy = (await loginStaffReady(env, 'val@sanithelp.test', u.json.password)).client;
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

describe('VALANTI', () => {
  it('flujo completo: validación, guardado, resultados para la psicóloga e informe PDF', async () => {
    const { campaignId, cl, consent } = await start(['valanti'], '5000001');
    expect(consent.addenda.map((a: { id: string }) => a.id)).toEqual(['valanti']);
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string; total: number }) => [q.id, q.total])).toEqual([['valanti', 30]]);

    const put = (answers: Record<string, number>, complete = false) => cl.call('PUT', '/api/participation/questionnaires/valanti', { answers, complete });
    expect((await put({ 1: 4 })).status).toBe(400); // más de 3 puntos
    expect((await put({ 1: -1 })).status).toBe(400);
    expect((await put({ 31: 1 })).status).toBe(400); // pareja inexistente
    expect((await put({ 1: 1.5 })).status).toBe(400);
    const inc = await put({ 1: 3 }, true);
    expect(inc.status).toBe(400);
    expect(inc.json.missing.length).toBe(29);
    expect((await cl.call('POST', '/api/participation/submit')).status).toBe(409);

    // Todas las parejas con 3 puntos para la frase A
    const all: Record<string, number> = {};
    for (let n = 1; n <= VALANTI_PAIRS.length; n++) all[n] = 3;
    expect((await put(all, true)).status).toBe(200);
    expect((await cl.call('POST', '/api/participation/submit')).json).toEqual({ received: true });

    const res = await psy.call('GET', `/api/campaigns/${campaignId}/valanti`);
    expect(res.status).toBe(200);
    expect(res.json.people).toHaveLength(1);
    const p = res.json.people[0];
    expect(Object.values(p.total as Record<string, number>).reduce((a, b) => a + b, 0)).toBe(90);
    expect(p.normValidated).toBe(false);
    expect(p.preferred.length).toBeGreaterThanOrEqual(1);

    const pdf = await env.app.inject({ method: 'GET', url: `/api/participants/${p.participantId}/valanti.pdf`, headers: { origin: 'http://localhost:3000', cookie: psy.cookie, 'x-csrf-token': psy.csrf } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('el administrador debe justificar el acceso a los resultados VALANTI', async () => {
    const { campaignId } = await start(['valanti'], '5000002');
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/valanti`)).status).toBe(403);
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/valanti?justification=Soporte%20tecnico%20caso%2077`)).status).toBe(200);
  });

  it('DISC y VALANTI juntos: se piden en orden y se pueden completar ambos', async () => {
    const { cl } = await start(['disc', 'valanti'], '5000003');
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string }) => q.id)).toEqual(['disc', 'valanti']);
    // el VALANTI no se puede saltar antes del DISC
    expect((await cl.call('PUT', '/api/participation/questionnaires/valanti', { answers: {}, complete: false })).status).toBe(409);
  });
});
