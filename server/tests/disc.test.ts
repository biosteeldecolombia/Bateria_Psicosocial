import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createCrypto } from '../src/security/crypto.js';
import { CARGO_OPTIONS, DISC_GROUPS, encodeDisc } from '@sanithelp/shared';
import { scoreDisc } from '@sanithelp/scoring';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let psyPw: string;
let companyId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa DISC', code: 'DSC1', minGroupSize: 5 });
  companyId = co.json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'disc@sanithelp.test', fullName: 'Laura Sofía Martínez', assignedCompanyIds: [companyId], professionalRegistry: 'Licencia SST 1234', professionalDocument: '32456789' });
  psyPw = u.json.password;
  psy = (await loginStaffReady(env, 'disc@sanithelp.test', psyPw)).client;
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

async function newCampaign(assessments?: string[]) {
  const camp = await psy.call('POST', '/api/campaigns', { companyId, name: `Ronda ${Math.random()}`, ...(assessments ? { assessments } : {}) });
  expect(camp.status).toBe(201);
  const cl = newClient(env);
  expect((await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password })).status).toBe(200);
  return { campaignId: camp.json.id as string, cl };
}

async function enter(cl: Client, doc: string) {
  await cl.call('POST', '/api/participation/start', { document: doc, names: 'Ana', surnames: 'Prueba' });
  const consent = await cl.call('GET', '/api/participation/consent');
  expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash })).status).toBe(200);
  expect((await cl.call('PUT', '/api/participation/ficha', { data: ficha('Ana Prueba'), complete: true })).status).toBe(200);
  return consent.json;
}

describe('DISC', () => {
  it('una campaña DISC solo pide el DISC (sin la batería psicosocial) y el consentimiento lleva el anexo', async () => {
    const { campaignId, cl } = await newCampaign(['disc']);
    const consent = await enter(cl, '4000001');
    expect(consent.addenda.map((a: { id: string }) => a.id)).toEqual(['disc']);
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string }) => q.id)).toEqual(['disc']);
    expect(st.json.questionnaires[0].total).toBe(28);

    // Validaciones: la misma palabra en MÁS y MENOS, grupo inexistente, valores fuera de rango
    const put = (answers: Record<string, number>, complete = false) => cl.call('PUT', '/api/participation/questionnaires/disc', { answers, complete });
    expect((await put({ 1: encodeDisc(1, 1) })).status).toBe(400);
    expect((await put({ 29: encodeDisc(0, 1) })).status).toBe(400);
    expect((await put({ 1: 16 })).status).toBe(400);
    expect((await cl.call('PUT', '/api/participation/questionnaires/intra_A', { answers: {}, gates: {}, complete: false })).status).toBe(404);
    // no se puede cerrar incompleto, ni enviar
    const part: Record<string, number> = { 1: encodeDisc(0, 1) };
    const inc = await put(part, true);
    expect(inc.status).toBe(400);
    expect(inc.json.missing.length).toBe(27);
    expect((await cl.call('POST', '/api/participation/submit')).status).toBe(409);

    // Se guarda el avance y se completa: MÁS en la posición 0 y MENOS en la 3 en todos los grupos
    const all: Record<string, number> = {};
    for (let g = 1; g <= DISC_GROUPS.length; g++) all[g] = encodeDisc(0, 3);
    expect((await put(all, true)).status).toBe(200);
    expect((await cl.call('POST', '/api/participation/submit')).json).toEqual({ received: true });

    // La psicóloga ve el perfil; el colaborador no recibe puntajes
    const res = await psy.call('GET', `/api/campaigns/${campaignId}/disc`);
    expect(res.status).toBe(200);
    expect(res.json.people).toHaveLength(1);
    const p = res.json.people[0];
    // MÁS en la posición 0 y MENOS en la 3 de todos los grupos, calificado con la clave oficial
    const expected = scoreDisc(Object.fromEntries(Array.from({ length: DISC_GROUPS.length }, (_, i) => [i + 1, encodeDisc(0, 3)])));
    expect(p.scores).toEqual(expected.scores);
    expect(p.segments).toEqual(expected.segments);
    expect(p.code).toBe(expected.code);
    expect(p.pattern.nombre).toBe(expected.pattern.nombre);
    expect(p.keyValidated).toBe(true);

    const pdf = await env.app.inject({ method: 'GET', url: `/api/participants/${p.participantId}/disc.pdf`, headers: { origin: 'http://localhost:3000', cookie: psy.cookie, 'x-csrf-token': psy.csrf } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(pdf.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('el administrador debe justificar el acceso a los resultados DISC', async () => {
    const { campaignId } = await newCampaign(['disc']);
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/disc`)).status).toBe(403);
    expect((await admin.call('GET', `/api/campaigns/${campaignId}/disc?justification=Soporte%20tecnico%20caso%2055`)).status).toBe(200);
  });

  it('una campaña solo psicosocial no ofrece el DISC ni su anexo de consentimiento', async () => {
    const { cl } = await newCampaign();
    const consent = await enter(cl, '4000002');
    expect(consent.addenda).toEqual([]);
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string }) => q.id)).toEqual(['intra_A', 'extra', 'stress']);
    expect((await cl.call('GET', '/api/participation/questionnaires/disc')).status).toBe(404);
  });

  it('una campaña con batería y DISC pide primero la batería y después el DISC', async () => {
    const { cl } = await newCampaign(['psychosocial', 'disc']);
    await enter(cl, '4000003');
    const st = await cl.call('GET', '/api/participation/state');
    expect(st.json.questionnaires.map((q: { id: string }) => q.id)).toEqual(['intra_A', 'extra', 'stress', 'disc']);
    // el DISC no se puede saltar antes de completar la batería
    expect((await cl.call('PUT', '/api/participation/questionnaires/disc', { answers: {}, complete: false })).status).toBe(409);
  });

  it('el consentimiento de una campaña con anexo no acepta el hash del texto base', async () => {
    const camp = await psy.call('POST', '/api/campaigns', { companyId, name: `Ronda ${Math.random()}`, assessments: ['disc'] });
    const plain = await psy.call('POST', '/api/campaigns', { companyId, name: `Ronda ${Math.random()}` });
    const withAnnex = newClient(env);
    const base = newClient(env);
    await withAnnex.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
    await base.call('POST', '/api/auth/login', { username: plain.json.username, password: plain.json.password });
    await withAnnex.call('POST', '/api/participation/start', { document: '4000010', names: 'Ana', surnames: 'Prueba' });
    await base.call('POST', '/api/participation/start', { document: '4000011', names: 'Ana', surnames: 'Prueba' });
    const baseHash = (await base.call('GET', '/api/participation/consent')).json.hash;
    const annexHash = (await withAnnex.call('GET', '/api/participation/consent')).json.hash;
    expect(annexHash).not.toBe(baseHash);
    expect((await withAnnex.call('POST', '/api/participation/consent', { decision: 'authorized', hash: baseHash })).status).toBe(400);
    expect((await withAnnex.call('POST', '/api/participation/consent', { decision: 'authorized', hash: annexHash })).status).toBe(200);
  });

  it('el expediente PDF incluye el anexo aceptado y, al suprimir a la persona, desaparece de los resultados DISC', async () => {
    const { campaignId, cl } = await newCampaign(['disc']);
    await enter(cl, '4000020');
    const all: Record<string, number> = {};
    for (let g = 1; g <= DISC_GROUPS.length; g++) all[g] = encodeDisc(1, 2);
    expect((await cl.call('PUT', '/api/participation/questionnaires/disc', { answers: all, complete: true })).status).toBe(200);
    await cl.call('POST', '/api/participation/submit');
    const { people } = (await psy.call('GET', `/api/campaigns/${campaignId}/disc`)).json;
    expect(people).toHaveLength(1);
    const id = people[0].participantId as string;

    const pdf = await env.app.inject({ method: 'GET', url: `/api/participants/${id}/expediente.pdf`, headers: { origin: 'http://localhost:3000', cookie: psy.cookie, 'x-csrf-token': psy.csrf } });
    expect(pdf.statusCode).toBe(200);
    // consentimiento (2) + anexo (1) + ficha (4); sin cuestionarios de la batería
    expect((await PDFDocument.load(pdf.rawPayload)).getPageCount()).toBe(7);

    expect((await psy.call('POST', `/api/participants/${id}/erase`, { password: psyPw })).status).toBe(200);
    expect((await psy.call('GET', `/api/campaigns/${campaignId}/disc`)).json.people).toHaveLength(0);
  });

  it('el informe PDF se genera aunque la empresa no tenga psicóloga asignada (el administrador lo descarga con justificación)', async () => {
    const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa sin psicologa', code: 'DSC2', minGroupSize: 5 });
    const camp = await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda sin psicologa', assessments: ['disc'] });
    expect(camp.status).toBe(201);
    const cl = newClient(env);
    await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
    await enter(cl, '4000030');
    const all: Record<string, number> = {};
    for (let g = 1; g <= DISC_GROUPS.length; g++) all[g] = encodeDisc(0, 3);
    await cl.call('PUT', '/api/participation/questionnaires/disc', { answers: all, complete: true });
    await cl.call('POST', '/api/participation/submit');
    const q = '?justification=Soporte%20tecnico%20caso%2099';
    const { people } = (await admin.call('GET', `/api/campaigns/${camp.json.id}/disc${q}`)).json;
    const pdf = await env.app.inject({ method: 'GET', url: `/api/participants/${people[0].participantId}/disc.pdf${q}`, headers: { origin: 'http://localhost:3000', cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // el expediente (con consentimiento firmado por la psicóloga) sigue exigiendo la psicóloga asignada
    const exp = await env.app.inject({ method: 'GET', url: `/api/participants/${people[0].participantId}/expediente.pdf${q}`, headers: { origin: 'http://localhost:3000', cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
    expect(exp.statusCode).toBe(409);
  });

  it('las respuestas DISC guardadas con los grupos antiguos (sin versión) no se califican ni se reutilizan', async () => {
    const { campaignId, cl } = await newCampaign(['disc']);
    await enter(cl, '4000040');
    const all: Record<string, number> = {};
    for (let g = 1; g <= DISC_GROUPS.length; g++) all[g] = encodeDisc(0, 1);
    await cl.call('PUT', '/api/participation/questionnaires/disc', { answers: all, complete: true });
    await cl.call('POST', '/api/participation/submit');
    expect((await psy.call('GET', `/api/campaigns/${campaignId}/disc`)).json.people).toHaveLength(1);
    // simula un registro viejo: se quita la versión del contenido cifrado
    const crypto = createCrypto(env.cfg);
    const row = (await env.pool.query("SELECT participant_id, data_enc FROM questionnaire_answers WHERE instrument = 'disc' AND participant_id IN (SELECT id FROM participants WHERE campaign_id = $1)", [campaignId])).rows[0];
    const data = JSON.parse(crypto.decrypt(row.data_enc));
    delete data.v;
    await env.pool.query('UPDATE questionnaire_answers SET data_enc = $1 WHERE participant_id = $2 AND instrument = $3', [crypto.encrypt(JSON.stringify(data)), row.participant_id, 'disc']);
    expect((await psy.call('GET', `/api/campaigns/${campaignId}/disc`)).json.people).toHaveLength(0);
    const st = await cl.call('GET', '/api/participation/state');
    const q = st.json.questionnaires.find((x: { id: string }) => x.id === 'disc');
    expect(q.complete).toBe(false);
    expect(q.answered).toBe(0);
  });
});

