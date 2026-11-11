import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { CARGO_OPTIONS } from '@sanithelp/shared';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let aux: Client;
let auxId: string;
let c1: string;
let c2: string;
let k1: { campaignId: string; participantId: string }; // empresa 1 (asignada completa)
let k2a: { campaignId: string; participantId: string }; // empresa 2, campaña NO asignada
let k2b: { campaignId: string; participantId: string }; // empresa 2, campaña asignada suelta

const ficha = {
  '1': 'Ana Prueba', '2': 'Masculino', '3': 1990, '4': 'Soltero (a)', '5': 'Profesional completo', '6': 'Técnico',
  '7': { city: 'Barranquilla', department: 'Atlántico' }, '8': '3', '9': 'Propia', '10': 2,
  '11': { city: 'Barranquilla', department: 'Atlántico' }, '12': { lessThanYear: false, years: 4 }, '13': 'Operario',
  '14': CARGO_OPTIONS[3], '15': { lessThanYear: true }, '16': 'Mantenimiento', '17': 'Término indefinido', '18': 8, '19': 'Fijo (diario, semanal, quincenal o mensual)',
};
const range = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => i + 1 + offset);
const pdf = (c: Client, url: string) => env.app.inject({ method: 'GET', url, headers: { origin: 'http://localhost:3000', cookie: c.cookie, 'x-csrf-token': c.csrf } });
const WHY = 'justification=Descarga%20solicitada%20por%20la%20psicologa';

async function campaign(companyId: string, name: string, doc: string) {
  const camp = await psy.call('POST', '/api/campaigns', { companyId, name, assessments: ['acrofobia'] });
  expect(camp.status).toBe(201);
  const cl = newClient(env);
  await cl.call('POST', '/api/auth/login', { username: camp.json.username, password: camp.json.password });
  await cl.call('POST', '/api/participation/start', { document: doc, names: 'Ana', surnames: 'Prueba' });
  const consent = await cl.call('GET', '/api/participation/consent');
  await cl.call('POST', '/api/participation/consent', { decision: 'authorized', hash: consent.json.hash });
  await cl.call('PUT', '/api/participation/ficha', { data: ficha, complete: true });
  await cl.call('PUT', '/api/participation/questionnaires/acrofobia', { answers: Object.fromEntries([...range(20).map((n) => [n, 3]), ...range(20, 20).map((n) => [n, 1])]), complete: true });
  expect((await cl.call('POST', '/api/participation/submit')).status).toBe(200);
  const p = (await psy.call('GET', `/api/campaigns/${camp.json.id}/participants`)).json[0] as { id: string };
  return { campaignId: camp.json.id as string, participantId: p.id };
}

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  c1 = (await admin.call('POST', '/api/admin/companies', { name: 'Empresa Uno', code: 'AUX1' })).json.id;
  c2 = (await admin.call('POST', '/api/admin/companies', { name: 'Empresa Dos', code: 'AUX2' })).json.id;
  const p = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'ap@sanithelp.test', fullName: 'Laura Martínez', assignedCompanyIds: [c1, c2], professionalRegistry: 'TP 1', professionalDocument: '3245' });
  psy = (await loginStaffReady(env, 'ap@sanithelp.test', p.json.password)).client;
  k1 = await campaign(c1, 'Campaña 1', '9000001');
  k2a = await campaign(c2, 'Campaña 2A', '9000002');
  k2b = await campaign(c2, 'Campaña 2B', '9000003');
  const a = await admin.call('POST', '/api/admin/users', { role: 'assistant', username: 'aux@sanithelp.test', fullName: 'Auxiliar Prueba', assignedCompanyIds: [c1], assignedCampaignIds: [k2b.campaignId] });
  expect(a.status, JSON.stringify(a.json)).toBe(201);
  auxId = a.json.id;
  aux = (await loginStaffReady(env, 'aux@sanithelp.test', a.json.password)).client; // el rol exige verificación en dos pasos
}, 180_000);
afterAll(async () => {
  await env?.stop();
});

describe('Auxiliar administrativo', () => {
  it('exige la verificación en dos pasos y solo ve lo que se le asignó (empresa completa o campaña suelta)', async () => {
    const list = (await aux.call('GET', '/api/campaigns')).json as { id: string; accessUsername: string | null }[];
    expect(list.map((c) => c.id).sort()).toEqual([k1.campaignId, k2b.campaignId].sort());
    expect(list.every((c) => c.accessUsername === null)).toBe(true); // no ve el usuario de acceso de la campaña
    const cos = ((await aux.call('GET', '/api/companies')).json as { id: string }[]).map((c) => c.id).sort();
    expect(cos).toEqual([c1, c2].sort());
    expect((await aux.call('GET', `/api/campaigns/${k1.campaignId}/participants`)).status).toBe(200);
    expect((await aux.call('GET', `/api/campaigns/${k2b.campaignId}/participants`)).status).toBe(200);
    expect((await aux.call('GET', `/api/campaigns/${k2a.campaignId}/participants`)).status).toBe(404); // la otra campaña de la empresa 2 no
  });

  it('descarga documentos solo con motivo y solo de lo asignado; todo queda en la auditoría', async () => {
    const own = `/api/participants/${k1.participantId}`;
    const noReason = await pdf(aux, `${own}/expediente.pdf`);
    expect(noReason.statusCode).toBe(403);
    expect(JSON.parse(noReason.body).needsJustification).toBe(true);
    for (const doc of ['expediente.pdf', 'acrofobia.pdf']) {
      const r = await pdf(aux, `${own}/${doc}?${WHY}`);
      expect(r.statusCode, `${doc}: ${r.body}`).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
      expect((await PDFDocument.load(r.rawPayload)).getPageCount()).toBeGreaterThanOrEqual(1);
    }
    expect((await pdf(aux, `/api/participants/${k2b.participantId}/expediente.pdf?${WHY}`)).statusCode).toBe(200); // campaña suelta
    expect((await pdf(aux, `/api/participants/${k2a.participantId}/expediente.pdf?${WHY}`)).statusCode).toBe(404); // no asignada
    const audit = await env.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'results.assistant_access'");
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it('no puede ver resultados en pantalla, gestionar personas, crear campañas ni administrar', async () => {
    const deny = async (r: Promise<{ status: number }>) => expect((await r).status).toBe(403);
    await deny(aux.call('GET', `/api/campaigns/${k1.campaignId}/acrofobia?${WHY}`)); // resultados
    await deny(aux.call('GET', `/api/campaigns/${k1.campaignId}/results?${WHY}`));
    await deny(aux.call('GET', `/api/campaigns/${k1.campaignId}/results.csv?${WHY}`));
    await deny(aux.call('GET', `/api/participants/${k1.participantId}/formatos/alturas?${WHY}`)); // diligenciar el formato
    await deny(aux.call('PUT', `/api/participants/${k1.participantId}/formatos/alturas`, { values: {}, factors: {}, concept: null }));
    await deny(aux.call('POST', `/api/participants/${k1.participantId}/reset-code`));
    await deny(aux.call('POST', `/api/participants/${k1.participantId}/reopen`, { instrument: 'acrofobia', reason: 'x'.repeat(12), password: 'x' }));
    await deny(aux.call('POST', `/api/participants/${k1.participantId}/erase`, { password: 'x' }));
    await deny(aux.call('PATCH', `/api/participants/${k1.participantId}`, { names: 'Otro' }));
    await deny(aux.call('POST', '/api/campaigns', { companyId: c1, name: 'Nueva', assessments: ['acrofobia'] }));
    await deny(aux.call('GET', `/api/campaigns/${k1.campaignId}/access`));
    await deny(aux.call('POST', `/api/campaigns/${k1.campaignId}/status`, { status: 'closed' }));
    await deny(aux.call('GET', '/api/admin/users'));
    await deny(aux.call('POST', '/api/admin/companies', { name: 'X', code: 'XX' }));
    await deny(aux.call('GET', '/api/profile'));
  });

  it('la exportación masiva exige contraseña y código de la aplicación, y respeta la asignación', async () => {
    expect((await aux.call('POST', `/api/campaigns/${k1.campaignId}/exports`, { justification: 'Descarga solicitada por la psicologa' })).status).toBe(403); // sin contraseña ni código
    expect((await aux.call('POST', `/api/campaigns/${k2a.campaignId}/exports`, { justification: 'Descarga solicitada por la psicologa', password: 'x', code: '000000' })).status).toBe(404);
  });

  it('el administrador cambia sus asignaciones y, si cambia de rol, se las quita', async () => {
    const rows = async () => ({
      cos: (await env.pool.query('SELECT company_id FROM assistant_companies WHERE user_id = $1', [auxId])).rows.length,
      cas: (await env.pool.query('SELECT campaign_id FROM assistant_campaigns WHERE user_id = $1', [auxId])).rows.length,
    });
    expect(await rows()).toEqual({ cos: 1, cas: 1 });
    const list = ((await admin.call('GET', '/api/admin/users')).json as { id: string; role: string; companies: { id: string }[]; campaigns: { id: string; companyName: string }[] }[]).find((u) => u.id === auxId)!;
    expect(list.role).toBe('assistant');
    expect(list.companies.map((c) => c.id)).toEqual([c1]);
    expect(list.campaigns.map((c) => [c.id, c.companyName])).toEqual([[k2b.campaignId, 'Empresa Dos']]);
    expect((await admin.call('PUT', `/api/admin/users/${auxId}`, { assignedCompanyIds: [c1, c2], assignedCampaignIds: [] })).status).toBe(200);
    expect(await rows()).toEqual({ cos: 2, cas: 0 });
    expect((await admin.call('PUT', `/api/admin/users/${auxId}`, { assignedCampaignIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(400);
    expect((await admin.call('PUT', `/api/admin/users/${auxId}`, { role: 'company', companyId: c1 })).status).toBe(200);
    expect(await rows()).toEqual({ cos: 0, cas: 0 });
  });
});
