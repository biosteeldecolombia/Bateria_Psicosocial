import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CARGO_OPTIONS, QUESTIONNAIRES, applicableItems, questionnairesFor, type QuestionnaireId } from '@sanithelp/shared';
import { RPS_HEADERS, scoreAll } from '@sanithelp/scoring';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

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

async function campaign(code: string) {
  const co = await admin.call('POST', '/api/admin/companies', { name: `Empresa ${code}`, code, minGroupSize: 5 });
  const camp = await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda' });
  return { companyId: co.json.id as string, campaignId: camp.json.id as string, username: camp.json.username as string, password: camp.json.password as string };
}
async function collaborator(c: { username: string; password: string }) {
  const cl = newClient(env);
  expect((await cl.call('POST', '/api/auth/login', { username: c.username, password: c.password })).status).toBe(200);
  return cl;
}
const fichaFor = (cargo: number, name = 'Ana Pérez') => ({
  '1': name, '2': 'Femenino', '3': 1990, '4': 'Soltero (a)', '5': 'Profesional completo', '6': 'Contadora',
  '7': { city: 'Barranquilla', department: 'Atlántico' }, '8': '3', '9': 'Propia', '10': 2,
  '11': { city: 'Barranquilla', department: 'Atlántico' }, '12': { lessThanYear: false, years: 4 }, '13': 'Analista',
  '14': CARGO_OPTIONS[cargo], '15': { lessThanYear: true }, '16': 'Contabilidad', '17': 'Término indefinido', '18': 8, '19': 'Fijo (diario, semanal, quincenal o mensual)',
});
/** Responde un cuestionario con un patrón determinista; los ítems tras compuertas «No» no se envían. */
function answersFor(id: QuestionnaireId, seed: number, gates: { clients?: boolean; boss?: boolean }) {
  const def = QUESTIONNAIRES[id];
  const a: Record<number, number> = {};
  for (const it of applicableItems(def, gates)) a[it.n] = (it.n * 7 + seed) % def.scale.length;
  return a;
}

async function complete(cl: Client, cargo: number, seed: number, name: string, doc: string) {
  const start = await cl.call('POST', '/api/participation/start', { document: doc, names: name.split(' ')[0]!, surnames: name.split(' ').slice(1).join(' ') || 'Prueba' });
  expect(start.status).toBe(200);
  const consent = await cl.call('GET', '/api/participation/consent');
  expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash })).status).toBe(200);
  const f = await cl.call('PUT', '/api/participation/ficha', { data: fichaFor(cargo, name), complete: true });
  expect(f.status).toBe(200);
  const form = cargo <= 1 ? 'A' : 'B';
  const gates = { clients: seed % 2 === 0, boss: seed % 3 === 0 };
  const used: Record<string, { answers: Record<number, number>; gates: { clients?: boolean; boss?: boolean } }> = {};
  for (const id of questionnairesFor(form)) {
    const g: { clients?: boolean; boss?: boolean } = id.startsWith('intra') ? gates : {};
    const answers = answersFor(id, seed, g);
    used[id] = { answers, gates: g };
    const r = await cl.call('PUT', `/api/participation/questionnaires/${id}`, { answers, gates: g, complete: true });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
  return { used, gates, form: form as 'A' | 'B', startCode: start.json.resumeCode as string };
}

describe('flujo del colaborador', () => {
  it('no permite la ficha ni los cuestionarios antes de autorizar', async () => {
    const c = await campaign('FL1');
    const cl = await collaborator(c);
    await cl.call('POST', '/api/participation/start', { document: '2000001', names: 'Luis', surnames: 'Prueba' });
    expect((await cl.call('GET', '/api/participation/ficha')).status).toBe(409);
    expect((await cl.call('GET', '/api/participation/questionnaires/intra_A')).status).toBe(409);
    expect((await cl.call('PUT', '/api/participation/ficha', { data: {}, complete: false })).status).toBe(409);
  });

  it('«No autorizo» cierra el flujo: no hay acceso a ningún formulario', async () => {
    const c = await campaign('FL2');
    const cl = await collaborator(c);
    await cl.call('POST', '/api/participation/start', { document: '2000002', names: 'Eva', surnames: 'Prueba' });
    const consent = await cl.call('GET', '/api/participation/consent');
    const d = await cl.call('POST', '/api/participation/consent', { decision: 'declined', hash: consent.json.hash });
    expect(d.json.status).toBe('declined');
    expect((await cl.call('GET', '/api/participation/ficha')).status).toBe(409);
    expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash })).status).toBe(409);
  });

  it('rechaza una decisión sobre una versión distinta del texto', async () => {
    const c = await campaign('FL3');
    const cl = await collaborator(c);
    await cl.call('POST', '/api/participation/start', { document: '2000003', names: 'Ana', surnames: 'Prueba' });
    expect((await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: 'otro-hash' })).status).toBe(400);
  });

  it('valida la ficha y los cuestionarios; exige completitud para cerrar', async () => {
    const c = await campaign('FL4');
    const cl = await collaborator(c);
    await cl.call('POST', '/api/participation/start', { document: '2000004', names: 'Marta', surnames: 'Prueba' });
    const consent = await cl.call('GET', '/api/participation/consent');
    await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash });
    const bad = await cl.call('PUT', '/api/participation/ficha', { data: { '2': 'Otro' }, complete: false });
    expect(bad.status).toBe(400);
    expect((await cl.call('PUT', '/api/participation/ficha', { data: { '2': 'Femenino' }, complete: true })).status).toBe(400);
    // cuestionario antes de la ficha completa
    expect((await cl.call('PUT', '/api/participation/questionnaires/intra_A', { answers: {}, gates: {}, complete: false })).status).toBe(409);
    await cl.call('PUT', '/api/participation/ficha', { data: fichaFor(0, 'Marta Prueba'), complete: true });
    // no se puede saltar al siguiente cuestionario
    expect((await cl.call('PUT', '/api/participation/questionnaires/extra', { answers: {}, gates: {}, complete: false })).status).toBe(409);
    expect((await cl.call('PUT', '/api/participation/questionnaires/intra_A', { answers: { 1: 9 }, gates: {}, complete: false })).status).toBe(400); // opción fuera de rango
    const incomplete = await cl.call('PUT', '/api/participation/questionnaires/intra_A', { answers: { 1: 0 }, gates: { clients: false, boss: false }, complete: true });
    expect(incomplete.status).toBe(400);
    expect(incomplete.json.missing.length).toBeGreaterThan(50);
    expect((await cl.call('POST', '/api/participation/submit')).status).toBe(409);
  });

  it('descarta las respuestas de ítems que ya no aplican cuando una compuerta es «No»', async () => {
    const c = await campaign('FL5');
    const cl = await collaborator(c);
    await cl.call('POST', '/api/participation/start', { document: '2000005', names: 'Pedro', surnames: 'Prueba' });
    const consent = await cl.call('GET', '/api/participation/consent');
    await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash });
    await cl.call('PUT', '/api/participation/ficha', { data: fichaFor(0, 'Pedro Prueba'), complete: true });
    await cl.call('PUT', '/api/participation/questionnaires/intra_A', { answers: { 1: 0, 106: 2, 115: 3 }, gates: { clients: false, boss: false }, complete: false });
    const saved = await cl.call('GET', '/api/participation/questionnaires/intra_A');
    expect(Object.keys(saved.json.data.answers)).toEqual(['1']);
  });

  it('flujo completo: el colaborador no recibe puntajes y la psicóloga ve el registro con las 101 columnas', async () => {
    const c = await campaign('FL6');
    const people = [
      { cargo: 0, seed: 3, name: 'Persona Uno', doc: '3000001' },
      { cargo: 1, seed: 4, name: 'Persona Dos', doc: '3000002' },
      { cargo: 2, seed: 5, name: 'Persona Tres', doc: '3000003' },
      { cargo: 3, seed: 6, name: 'Persona Cuatro', doc: '3000004' },
    ];
    const done: Awaited<ReturnType<typeof complete>>[] = [];
    let submitJson: unknown;
    for (const p of people) {
      const cl = await collaborator(c);
      done.push(await complete(cl, p.cargo, p.seed, p.name, p.doc));
      const st = await cl.call('GET', '/api/participation/state');
      expect(st.json.canSubmit).toBe(true);
      const sub = await cl.call('POST', '/api/participation/submit');
      submitJson = sub.json;
      expect(sub.json).toEqual({ received: true });
      // reenviar o modificar tras el envío no es posible
      expect((await cl.call('PUT', '/api/participation/ficha', { data: fichaFor(p.cargo, p.name), complete: true })).status).toBe(409);
      // ninguna respuesta del flujo contiene puntajes, niveles ni riesgo
      const blob = JSON.stringify([st.json, submitJson]).toLowerCase();
      for (const word of ['riesgo', 'transformad', 'puntaje', 'nivel', 'score']) expect(blob).not.toContain(word);
    }

    // La psicóloga (asignada a la empresa) consulta los resultados
    const psy = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'psi-flujo@sanithelp.test', fullName: 'Psicóloga Flujo', assignedCompanyIds: [c.companyId] });
    const { client: p1 } = await loginStaffReady(env, 'psi-flujo@sanithelp.test', psy.json.password);
    const res = await p1.call('GET', `/api/campaigns/${c.campaignId}/results`);
    expect(res.status).toBe(200);
    expect(res.json.headers).toEqual(RPS_HEADERS);
    expect(res.json.headers.length).toBe(101);
    expect(res.json.rows.length).toBe(4);
    expect(res.json.rows.every((r: unknown[]) => r.length === 101)).toBe(true);

    // El registro coincide con lo que calcula el motor directamente a partir de las mismas respuestas
    const iDoc = RPS_HEADERS.indexOf('Id');
    const iTot = RPS_HEADERS.indexOf('PTAJE TRANSFORMADO (INTRA+EXTRA LABORAL)');
    const iLvl = RPS_HEADERS.indexOf('RIESGO TOTAL (INTRA+EXTRA LABORAL)');
    const iStress = RPS_HEADERS.indexOf('Estres_Puntaje transformado');
    for (const [i, p] of people.entries()) {
      const row = res.json.rows.find((r: unknown[]) => r[iDoc] === p.doc);
      const d = done[i]!;
      const expected = scoreAll({
        cargoIndex: p.cargo,
        intra: { answers: d.used[d.form === 'A' ? 'intra_A' : 'intra_B']!.answers, gates: d.gates },
        extra: { answers: d.used['extra']!.answers },
        stress: { answers: d.used['stress']!.answers },
      });
      expect(row[iTot]).toBe(expected.total.transformed);
      expect(row[iLvl]).toBe(expected.total.level);
      expect(row[iStress]).toBe(expected.stress.transformed);
    }

    // Resúmenes con la estructura del libro
    const sum = await p1.call('GET', `/api/campaigns/${c.campaignId}/summary`);
    expect(sum.json.summary.people).toBe(4);
    expect(sum.json.summary.intra.total).toBe(4);
    const dom = await p1.call('GET', `/api/campaigns/${c.campaignId}/domains`);
    expect(dom.json.tables.length).toBe(8);
    expect(dom.json.tables[0].rows.length).toBe(5);
    const csv = await p1.call('GET', `/api/campaigns/${c.campaignId}/results.csv`);
    expect(csv.status).toBe(200);
    expect(String(csv.json).split(String.fromCharCode(10)).length).toBe(5); // encabezado + 4 personas
    expect(String(csv.json)).toContain('PTAJE TRANSFORMADO (INTRA+EXTRA LABORAL)');

    // Informe individual
    const rep = await p1.call('GET', `/api/participants/${res.json.participantIds[0]}/report`);
    expect(rep.status).toBe(200);
    expect(rep.json.blocks.length).toBe(8);

    // El administrador necesita justificar el acceso a resultados clínicos
    expect((await admin.call('GET', `/api/campaigns/${c.campaignId}/results`)).status).toBe(403);
    expect((await admin.call('GET', `/api/campaigns/${c.campaignId}/results?justification=Soporte%20tecnico%20caso%20123`)).status).toBe(200);

    // Una psicóloga sin esa empresa no ve nada
    const other = await campaign('FL7');
    expect((await p1.call('GET', `/api/campaigns/${other.campaignId}/results`)).status).toBe(404);
    expect((await p1.call('GET', `/api/campaigns/${other.campaignId}/participants`)).status).toBe(404);

    // Un colaborador no accede a resultados
    const cl = await collaborator(c);
    expect((await cl.call('GET', `/api/campaigns/${c.campaignId}/results`)).status).toBe(403);

    // La auditoría registra las lecturas sin datos personales
    const log = await admin.call('GET', '/api/admin/audit?limit=500');
    expect(log.json.some((e: { action: string }) => e.action === 'results.viewed')).toBe(true);
    expect(JSON.stringify(log.json)).not.toContain('Persona Uno');

    // Restablecer el código personal
    const list = await p1.call('GET', `/api/campaigns/${c.campaignId}/participants`);
    expect(list.json.length).toBe(4);
    expect(list.json.some((x: { consent: string }) => x.consent === 'authorized')).toBe(true);
  });

  it('la psicóloga ve quién no autorizó y puede restablecer un código perdido', async () => {
    const c = await campaign('FL8');
    const cl = await collaborator(c);
    const start = await cl.call('POST', '/api/participation/start', { document: '4000001', names: 'Sin', surnames: 'Autorizar' });
    const consent = await cl.call('GET', '/api/participation/consent');
    await cl.call('POST', '/api/participation/consent', { decision: 'declined', hash: consent.json.hash });
    const list = await admin.call('GET', `/api/campaigns/${c.campaignId}/participants`);
    const me = list.json.find((x: { document: string }) => x.document === '4000001');
    expect(me.consent).toBe('declined');
    expect(me.status).toBe('declined');
    const reset = await admin.call('POST', `/api/participants/${me.id}/reset-code`);
    expect(reset.json.resumeCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(reset.json.resumeCode).not.toBe(start.json.resumeCode);
    const other = await collaborator(c);
    expect((await other.call('POST', '/api/participation/resume', { document: '4000001', code: reset.json.resumeCode })).status).toBe(200);
  });
});
