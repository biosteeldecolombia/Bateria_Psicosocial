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
  companyId = (await admin.call('POST', '/api/admin/companies', { name: 'Empresa Formatos SAS', code: 'FMT1', minGroupSize: 5 })).json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'fm@sanithelp.test', fullName: 'Laura Sofía Martínez', assignedCompanyIds: [companyId], professionalRegistry: 'TP 123456', professionalDocument: '32456789' });
  psy = (await loginStaffReady(env, 'fm@sanithelp.test', u.json.password)).client;
}, 120_000);
afterAll(async () => {
  await env?.stop();
});

const ficha = {
  '1': 'Ana Prueba', '2': 'Masculino', '3': 1990, '4': 'Soltero (a)', '5': 'Profesional completo', '6': 'Técnico',
  '7': { city: 'Barranquilla', department: 'Atlántico' }, '8': '3', '9': 'Propia', '10': 2,
  '11': { city: 'Barranquilla', department: 'Atlántico' }, '12': { lessThanYear: false, years: 4 }, '13': 'Operario de alturas',
  '14': CARGO_OPTIONS[3], '15': { lessThanYear: true }, '16': 'Mantenimiento', '17': 'Término indefinido', '18': 8, '19': 'Fijo (diario, semanal, quincenal o mensual)',
};
const range = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => i + 1 + offset);
const pdf = (c: Client, url: string) => env.app.inject({ method: 'GET', url, headers: { origin: 'http://localhost:3000', cookie: c.cookie, 'x-csrf-token': c.csrf } });

async function person(assessments: string[], doc: string, finish = true) {
  const camp = await psy.call('POST', '/api/campaigns', { companyId, name: `Ronda ${Math.random()}`, assessments });
  const cl = newClient(env);
  await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
  await cl.call('POST', '/api/participation/start', { document: doc, names: 'Ana', surnames: 'Prueba' });
  const consent = await cl.call('GET', '/api/participation/consent');
  await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash });
  await cl.call('PUT', '/api/participation/ficha', { data: ficha, complete: true });
  if (finish) {
    if (assessments.includes('acrofobia')) await cl.call('PUT', '/api/participation/questionnaires/acrofobia', { answers: Object.fromEntries([...range(20).map((n) => [n, 5]), ...range(20, 20).map((n) => [n, 2])]), complete: true });
    if (assessments.includes('claustrofobia')) await cl.call('PUT', '/api/participation/questionnaires/claustrofobia', { answers: Object.fromEntries(range(26).map((n) => [n, 2])), complete: true });
    expect((await cl.call('POST', '/api/participation/submit')).status).toBe(200);
  }
  const p = (await psy.call('GET', `/api/campaigns/${camp.json.id}/participants`)).json[0] as { id: string };
  return { campaignId: camp.json.id as string, participantId: p.id };
}

describe('formato de evaluación psicológica ocupacional', () => {
  it('trabajo en alturas: precarga desde la ficha, valida, guarda cifrado y genera el PDF solo tras guardar', async () => {
    const unfinished = await person(['acrofobia'], '8000001', false);
    expect((await psy.call('GET', `/api/participants/${unfinished.participantId}/formatos/alturas`)).status).toBe(404); // aún no envía

    const { campaignId, participantId } = await person(['acrofobia'], '8000002');
    const url = `/api/participants/${participantId}/formatos/alturas`;
    const first = await psy.call('GET', url);
    expect(first.status).toBe(200);
    expect(first.json.prefill).toMatchObject({ nombre: 'Ana Prueba', cargo: 'Operario de alturas', empresa: 'Empresa Formatos SAS', edad: String(new Date().getFullYear() - 1990) });
    expect(first.json.test).toMatchObject({ type: 'acrofobia', anxiety: { total: 100, level: 'Alto' }, avoidance: { total: 40, level: 'Alto' } });
    expect(first.json.saved).toBeNull();
    expect((await pdf(psy, `${url}/pdf`)).statusCode).toBe(409); // nada guardado todavía

    const body = {
      values: { 'general.antecedente': 'Ninguno', 'mental.atencion': 'Conservada', 'cognitive.impulsividad': 'Baja', observation: 'Colaboradora tranquila durante la entrevista.' },
      factors: { vertigo: 'yes', ansiedad: 'no' },
      concept: 'apto_rec',
    };
    expect((await psy.call('PUT', url, { ...body, values: { ...body.values, 'mental.inventada': 'x' } })).status).toBe(400); // clave desconocida
    expect((await psy.call('PUT', url, { ...body, factors: { vertigo: 'quizás' } })).status).toBe(400);
    expect((await psy.call('PUT', url, { ...body, concept: 'excelente' })).status).toBe(400);
    expect((await psy.call('PUT', url, { ...body, values: { 'mental.atencion': 'x'.repeat(2001) } })).status).toBe(400);
    expect((await psy.call('PUT', url, body)).status).toBe(200);

    const again = (await psy.call('GET', url)).json;
    expect(again.saved.data).toMatchObject({ concept: 'apto_rec', factors: { vertigo: 'yes', ansiedad: 'no' } });
    expect(again.saved.data.values['mental.atencion']).toBe('Conservada');
    const raw = await env.pool.query("SELECT data_enc FROM manual_results WHERE participant_id = $1 AND instrument = 'formato_alturas'", [participantId]);
    expect(raw.rows[0].data_enc).not.toContain('Conservada');

    const r = await pdf(psy, `${url}/pdf`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((await PDFDocument.load(r.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(2);

    expect((await admin.call('GET', url)).status).toBe(403); // el administrador debe justificar el acceso
    expect((await admin.call('GET', `${url}?justification=Soporte%20tecnico%20caso%2077`)).status).toBe(200);
    expect((await psy.call('GET', `/api/participants/${participantId}/formatos/confinados`)).status).toBe(404); // la campaña no aplica ese formato
    expect(campaignId).toBeTruthy();
  });

  it('espacios confinados: guarda la interpretación del CLQ en el mismo registro que la pestaña del CLQ', async () => {
    const { campaignId, participantId } = await person(['claustrofobia'], '8000003');
    const url = `/api/participants/${participantId}/formatos/confinados`;
    const first = (await psy.call('GET', url)).json;
    expect(first.test).toMatchObject({ type: 'clq', total: 52, max: 104, level: null });
    expect((await psy.call('PUT', url, { values: {}, factors: {}, concept: 'apto', clqLevel: 'extremo' })).status).toBe(400);
    expect((await psy.call('PUT', url, { values: { 'mental.pensamiento': 'Coherente' }, factors: { asfixia: 'no' }, concept: 'apto', clqLevel: 'moderate' })).status).toBe(200);
    const list = (await psy.call('GET', `/api/campaigns/${campaignId}/claustrofobia`)).json.people[0];
    expect(list.level).toBe('moderate');
    expect((await psy.call('GET', url)).json.test.level).toBe('moderate');
    const r = await pdf(psy, `${url}/pdf`);
    expect(r.statusCode, r.body).toBe(200);
    expect((await PDFDocument.load(r.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
