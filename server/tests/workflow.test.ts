import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_PW, fakeMailer, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

const mailer = fakeMailer();
let env: TestEnv;
let admin: Client;
let psy: Client;
let psyId: string;
let camp: { id: string; username: string; password: string; companyId: string };

beforeAll(async () => {
  env = await startEnv(undefined, { mailer });
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'flujo@sanithelp.test', fullName: 'Psicóloga Flujo' });
  psyId = u.json.id;
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa Flujo', code: 'FLUJO', psychologistIds: [psyId] });
  const c = await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda flujo' });
  camp = { id: c.json.id, username: c.json.username, password: c.json.password, companyId: co.json.id };
  psy = (await loginStaffReady(env, 'flujo@sanithelp.test', u.json.password)).client;
}, 120_000);

afterAll(async () => {
  await env?.stop();
});

const stageOf = async () => ((await admin.call('GET', '/api/workflow/board')).json.campaigns as { id: string; stage: string }[]).find((c) => c.id === camp.id)!.stage;

async function startPerson(doc: string) {
  const c = newClient(env);
  await c.call('POST', '/api/auth/login', { username: camp.username, password: camp.password });
  const r = await c.call('POST', '/api/participation/start', { document: doc, names: 'Persona', surnames: doc });
  expect(r.status).toBe(200);
}

describe('flujo de trabajo por estado', () => {
  it('una campaña nueva está «creada» y pasa a «en curso» cuando la primera persona empieza', async () => {
    expect(await stageOf()).toBe('created');
    await startPerson('1000000001');
    await startPerson('1000000002');
    expect(await stageOf()).toBe('in_progress');
    const board = (await psy.call('GET', '/api/workflow/board')).json;
    const mine = board.campaigns.find((c: { id: string }) => c.id === camp.id);
    expect(mine.stats.started).toBe(2);
    expect(mine.stats.inProgress).toBe(2);
    // Aún en curso: sin responsable de aplicación, la psicóloga no tiene pendientes de este proceso
    expect(board.tasks.filter((t: { kind: string }) => t.kind === 'review')).toHaveLength(0);
  });

  it('cerrar la campaña la deja «finalizada»; la psicóloga ve qué le falta revisar y evalúa persona por persona', async () => {
    // Las dos personas terminan (se simula el envío directamente en la base)
    await env.pool.query(`update participants set status='completed', submitted_at = created_at + interval '25 minutes' where campaign_id = $1`, [camp.id]);
    expect((await psy.call('POST', `/api/campaigns/${camp.id}/status`, { status: 'closed' })).status).toBe(200);
    expect(await stageOf()).toBe('finished');

    const tasks = (await psy.call('GET', '/api/workflow/board')).json.tasks as { kind: string; count: number }[];
    expect(tasks.find((t) => t.kind === 'review')?.count).toBe(2);
    const notes = (await psy.call('GET', '/api/notifications')).json.items as { key: string; text: string }[];
    expect(notes.find((n) => n.key === 'review_pending')?.text).toContain('2 personas esperando evaluación');

    const list = (await psy.call('GET', `/api/campaigns/${camp.id}/participants`)).json as { id: string; reviewStatus: string }[];
    expect(list.map((p) => p.reviewStatus)).toEqual(['pending', 'pending']);
    expect((await psy.call('POST', `/api/participants/${list[0]!.id}/review`, { status: 'in_review' })).status).toBe(200);
    expect(await stageOf()).toBe('in_evaluation');
    expect((await psy.call('POST', `/api/participants/${list[0]!.id}/review`, { status: 'evaluated' })).status).toBe(200);
    expect(await stageOf()).toBe('in_evaluation');
    expect((await psy.call('POST', `/api/participants/${list[1]!.id}/review`, { status: 'evaluated' })).status).toBe(200);
    expect(await stageOf()).toBe('evaluated');
    const deliver = (await psy.call('GET', '/api/workflow/board')).json.tasks.find((t: { kind: string }) => t.kind === 'deliver');
    expect(deliver).toBeTruthy();
  });

  it('asigna responsables por proceso, guarda el historial con tiempos y permite entregar', async () => {
    const opts = (await admin.call('GET', `/api/campaigns/${camp.id}/owner-options`)).json;
    expect(opts.options.map((o: { id: string }) => o.id)).toContain(psyId);
    expect((await admin.call('PUT', `/api/campaigns/${camp.id}/owners`, { evaluation: psyId })).status).toBe(200);
    // Alguien sin acceso a la campaña no puede ser responsable
    const other = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'otra@sanithelp.test', fullName: 'Otra Psicóloga' });
    expect((await admin.call('PUT', `/api/campaigns/${camp.id}/owners`, { delivery: other.json.id })).status).toBe(400);
    expect((await psy.call('POST', `/api/campaigns/${camp.id}/stage`, { stage: 'delivered', note: 'Enviado por correo a RRHH' })).status).toBe(200);
    expect(await stageOf()).toBe('delivered');
    const detail = (await psy.call('GET', `/api/workflow/campaigns/${camp.id}`)).json;
    expect(detail.timeline.map((t: { stage: string }) => t.stage)).toEqual(['created', 'in_progress', 'finished', 'in_evaluation', 'evaluated', 'delivered']);
    expect(detail.timeline.at(-1).actorName).toBe('Psicóloga Flujo');
    expect(detail.times.total.n).toBe(2);
    expect(detail.times.total.avgMinutes).toBe(25);
    const board = (await admin.call('GET', '/api/workflow/board')).json.campaigns.find((c: { id: string }) => c.id === camp.id);
    expect(board.owners.evaluation.name).toBe('Psicóloga Flujo');
  });

  it('los permisos del flujo se respetan: sin «cambiar etapas» la psicóloga no puede moverla', async () => {
    const cur = (await admin.call('GET', '/api/admin/roles')).json.matrix.psychologist;
    await admin.call('PUT', '/api/admin/roles/psychologist', { permissions: { ...cur, 'workflow.manage': false } });
    expect((await psy.call('POST', `/api/campaigns/${camp.id}/stage`, { stage: 'created' })).status).toBe(403);
    await admin.call('DELETE', '/api/admin/roles/psychologist');
  });
});

describe('alertas y configuración', () => {
  it('el administrador parametriza umbrales y apaga reglas', async () => {
    const s = (await admin.call('GET', '/api/settings')).json;
    expect(s.alerts.threshold.campaign_idle).toBe(7);
    expect((await psy.call('GET', '/api/settings')).status).toBe(403);
    const next = { ...s.alerts, enabled: { ...s.alerts.enabled, stuck_participants: false }, threshold: { ...s.alerts.threshold, review_pending: 5 }, dailyEmail: true };
    expect((await admin.call('PUT', '/api/settings/alerts', next)).status).toBe(200);
    expect((await admin.call('GET', '/api/settings')).json.alerts.threshold.review_pending).toBe(5);
    expect((await admin.call('PUT', '/api/settings/security', { trustedDeviceDays: 99 })).status).toBe(400);
    expect((await admin.call('PUT', '/api/settings/security', { trustedDeviceDays: 7 })).status).toBe(200);
  });

  it('el resumen de pendientes se envía por correo', async () => {
    // Una persona más esperando evaluación para que haya algo que resumir
    const c2 = await admin.call('POST', '/api/campaigns', { companyId: camp.companyId, name: 'Segunda ronda' });
    const p = newClient(env);
    await p.call('POST', '/api/auth/login', { username: c2.json.username, password: c2.json.password });
    await p.call('POST', '/api/participation/start', { document: '2000000001', names: 'Pedro', surnames: 'Uno' });
    await env.pool.query(`update participants set status='completed' where campaign_id = $1`, [c2.json.id]);
    await admin.call('POST', `/api/campaigns/${c2.json.id}/status`, { status: 'closed' });
    // Umbral en 1 de nuevo para que se vea
    const s = (await admin.call('GET', '/api/settings')).json.alerts;
    await admin.call('PUT', '/api/settings/alerts', { ...s, threshold: { ...s.threshold, review_pending: 1 } });
    mailer.sent.length = 0;
    const r = await admin.call('POST', '/api/settings/digest-test');
    expect(r.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.text).toContain('esperando evaluación');
  });
});
