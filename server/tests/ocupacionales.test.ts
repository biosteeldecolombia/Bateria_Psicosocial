import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CARGO_OPTIONS } from '@sanithelp/shared';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let companyId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa Alturas SAS', code: 'OCU1', minGroupSize: 5 });
  companyId = co.json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'ocu@sanithelp.test', fullName: 'Laura Sofía Martínez', assignedCompanyIds: [companyId], professionalRegistry: 'Licencia SST 1234', professionalDocument: '32456789' });
  psy = (await loginStaffReady(env, 'ocu@sanithelp.test', u.json.password)).client;
}, 120_000);
afterAll(async () => {
  await env?.stop();
});

const ficha = (name: string) => ({
  '1': name, '2': 'Masculino', '3': 1990, '4': 'Soltero (a)', '5': 'Profesional completo', '6': 'Técnico',
  '7': { city: 'Barranquilla', department: 'Atlántico' }, '8': '3', '9': 'Propia', '10': 2,
  '11': { city: 'Barranquilla', department: 'Atlántico' }, '12': { lessThanYear: false, years: 4 }, '13': 'Operario',
  '14': CARGO_OPTIONS[3], '15': { lessThanYear: true }, '16': 'Mantenimiento', '17': 'Término indefinido', '18': 8, '19': 'Fijo (diario, semanal, quincenal o mensual)',
});

async function start(assessments: string[], doc: string) {
  const camp = await psy.call('POST', '/api/campaigns', { companyId, name: `Ronda ${Math.random()}`, assessments });
  expect(camp.status).toBe(201);
  const cl = newClient(env);
  await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
  await cl.call('POST', '/api/participation/start', { document: doc, names: 'Ana', surnames: 'Prueba' });
  const consent = await cl.call('GET', '/api/participation/consent');
  return { campaignId: camp.json.id as string, cl, consent: consent.json };
}
async function authorize(cl: Client, hash: string) {
  expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash })).status).toBe(200);
  expect((await cl.call('PUT', '/api/participation/ficha', { data: ficha('Ana Prueba'), complete: true })).status).toBe(200);
}
const range = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => i + 1 + offset);
const pdf = (client: Client, url: string) => env.app.inject({ method: 'GET', url, headers: { origin: 'http://localhost:3000', cookie: client.cookie, 'x-csrf-token': client.csrf } });

describe('consentimiento según las evaluaciones de la campaña', () => {
  it('ocupacional reemplaza al de la batería; con ambos tipos se muestran los dos; sin ocupacional todo sigue igual', async () => {
    const occ = (await start(['acrofobia'], '7000001')).consent;
    expect(occ.docs.map((d: { id: string }) => d.id)).toEqual(['occupational']);
    expect(occ.docs[0].title).toContain('PSICOLÓGICA OCUPACIONAL');
    expect(occ.version).toContain('Evaluación ocupacional');
    expect(occ.company).toBe('Empresa Alturas SAS');
    expect(occ.options.authorize).toContain('evaluación psicológica ocupacional');

    const both = (await start(['psychosocial', 'claustrofobia'], '7000002')).consent;
    expect(both.docs.map((d: { id: string }) => d.id)).toEqual(['psychosocial', 'occupational']);
    expect(both.options.authorize).toContain('Batería');
    expect(both.options.authorize).toContain('ocupacional');

    const base = (await start(['psychosocial'], '7000003')).consent;
    expect(base.docs.map((d: { id: string }) => d.id)).toEqual(['psychosocial']);
    expect(base.version).toBe('FP-PS-CI v01');
    expect(new Set([occ.hash, both.hash, base.hash]).size).toBe(3);
  });

  it('la decisión se acepta solo con el hash del texto vigente de la campaña', async () => {
    const { cl, consent } = await start(['acrofobia'], '7000004');
    const base = (await start(['psychosocial'], '7000005')).consent;
    expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: base.hash })).status).toBe(400);
    expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.hash })).status).toBe(200);
  });
});

describe('Acrofobia de Cohen', () => {
  it('valida rangos, califica ambas escalas, informe PDF y expediente con el consentimiento ocupacional', async () => {
    const { campaignId, cl, consent } = await start(['acrofobia'], '7100001');
    await authorize(cl, consent.hash);
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string; total: number }) => [q.id, q.total])).toEqual([['acrofobia', 40]]);

    const put = (answers: Record<string, number>, complete = false) => cl.call('PUT', '/api/participation/questionnaires/acrofobia', { answers, complete });
    expect((await put({ '1': 7 })).status).toBe(400); // ansiedad máxima 6
    expect((await put({ '21': 3 })).status).toBe(400); // evitación máxima 2
    expect((await put({ '41': 0 })).status).toBe(400); // solo hay 40
    expect((await put({ '1': 6, '21': 2 })).status).toBe(200);
    expect((await put({ '1': 6 }, true)).status).toBe(400); // incompleto

    const answers = Object.fromEntries([...range(20).map((n) => [n, 4]), ...range(20, 20).map((n) => [n, 1])]);
    expect((await put(answers, true)).status).toBe(200);
    expect((await cl.call('POST', '/api/participation/submit')).status).toBe(200);

    const res = await psy.call('GET', `/api/campaigns/${campaignId}/acrofobia`);
    expect(res.status).toBe(200);
    const [p] = res.json.people;
    expect(p.anxiety).toMatchObject({ total: 80, level: 'Severo' });
    expect(p.avoidance).toMatchObject({ total: 20, level: 'Moderado' });

    const r = await pdf(psy, `/api/participants/${p.participantId}/acrofobia.pdf`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((await PDFDocument.load(r.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(1);

    const exp = await pdf(psy, `/api/participants/${p.participantId}/expediente.pdf`);
    expect(exp.statusCode, exp.body).toBe(200);
    expect((await PDFDocument.load(exp.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(2); // consentimiento ocupacional + ficha

    expect((await admin.call('GET', `/api/campaigns/${campaignId}/acrofobia`)).status).toBe(403); // el admin debe justificar
  });
});

describe('CLQ de Claustrofobia', () => {
  it('califica el total; el PDF se habilita solo cuando la psicóloga marca la interpretación', async () => {
    const { campaignId, cl, consent } = await start(['claustrofobia'], '7200001');
    await authorize(cl, consent.hash);
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string; total: number }) => [q.id, q.total])).toEqual([['claustrofobia', 26]]);

    const put = (answers: Record<string, number>, complete = false) => cl.call('PUT', '/api/participation/questionnaires/claustrofobia', { answers, complete });
    expect((await put({ '1': 5 })).status).toBe(400); // máximo 4
    expect((await put({ '27': 0 })).status).toBe(400); // solo hay 26
    expect((await put({ '1': 4 }, true)).status).toBe(400);
    const answers = Object.fromEntries(range(26).map((n) => [n, n % 5]));
    expect((await put(answers, true)).status).toBe(200);
    expect((await cl.call('POST', '/api/participation/submit')).status).toBe(200);

    const list = await psy.call('GET', `/api/campaigns/${campaignId}/claustrofobia`);
    const [p] = list.json.people;
    const expected = range(26).reduce((a, n) => a + (n % 5), 0);
    expect(p).toMatchObject({ total: expected, max: 104, level: null, markedAt: null });

    expect((await pdf(psy, `/api/participants/${p.participantId}/claustrofobia.pdf`)).statusCode).toBe(409); // aún sin interpretación
    expect((await psy.call('PUT', `/api/participants/${p.participantId}/claustrofobia`, { level: 'extremo' })).status).toBe(400);
    expect((await psy.call('PUT', `/api/participants/${p.participantId}/claustrofobia`, { level: 'moderate' })).status).toBe(200);

    const after = (await psy.call('GET', `/api/campaigns/${campaignId}/claustrofobia`)).json.people[0];
    expect(after.level).toBe('moderate');
    const r = await pdf(psy, `/api/participants/${p.participantId}/claustrofobia.pdf`);
    expect(r.statusCode).toBe(200);
    expect((await PDFDocument.load(r.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(1);

    // La interpretación se guarda cifrada.
    const raw = await env.pool.query("SELECT data_enc FROM manual_results WHERE participant_id = $1", [p.participantId]);
    expect(raw.rows[0].data_enc).not.toContain('moderate');
  });
});
