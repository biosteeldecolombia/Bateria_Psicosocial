import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCrypto } from '../src/security/crypto.js';
import { createDb } from '../src/db/client.js';
import { seedSynthetic } from '../src/scripts/seed-synthetic.js';
import { purgeExpired } from '../src/scripts/purge-expired.js';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let psy: Client;
let psyPw: string;
let campaignId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  const { client: admin } = await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW);
  const co = await admin.call('POST', '/api/admin/companies', { name: 'Empresa Derechos', code: 'DER1', minGroupSize: 5 });
  campaignId = (await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda derechos' })).json.id;
  const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'der@sanithelp.test', fullName: 'Psicóloga Derechos', assignedCompanyIds: [co.json.id] });
  psyPw = u.json.password;
  psy = (await loginStaffReady(env, 'der@sanithelp.test', psyPw)).client;
  const { db, pool } = createDb(env.cfg);
  await seedSynthetic(db, createCrypto(env.cfg), { campaignId, companyId: co.json.id, count: 6, seed: 5 });
  await pool.end();
});
afterAll(async () => env?.stop());

describe('derechos del titular', () => {
  it('rectifica nombres y documento; rechaza un documento repetido', async () => {
    const list = (await psy.call('GET', `/api/campaigns/${campaignId}/participants`)).json as { id: string; document: string; fullName: string }[];
    const [a, b] = list;
    expect((await psy.call('PATCH', `/api/participants/${a!.id}`, { names: 'María José', surnames: 'Peña Ortiz' })).status).toBe(200);
    expect((await psy.call('PATCH', `/api/participants/${a!.id}`, { document: b!.document })).status).toBe(409);
    expect((await psy.call('PATCH', `/api/participants/${a!.id}`, { document: '1.234.567.890' })).status).toBe(200);
    const after = ((await psy.call('GET', `/api/campaigns/${campaignId}/participants`)).json as { id: string; document: string; fullName: string }[]).find((x) => x.id === a!.id)!;
    expect(after.fullName).toBe('María José Peña Ortiz');
    expect(after.document).toBe('1234567890');
    expect((await psy.call('PATCH', `/api/participants/${a!.id}`, {})).status).toBe(400);
  });

  it('suprime: exige contraseña, borra respuestas y datos personales y los saca de los resultados', async () => {
    const list = (await psy.call('GET', `/api/campaigns/${campaignId}/participants`)).json as { id: string }[];
    const id = list[2]!.id;
    const before = (await psy.call('GET', `/api/campaigns/${campaignId}/results`)).json.rows.length;
    expect((await psy.call('POST', `/api/participants/${id}/erase`, { password: 'incorrecta' })).status).toBe(403);
    expect((await psy.call('POST', `/api/participants/${id}/erase`, { password: psyPw })).status).toBe(200);
    const q = await env.pool.query('SELECT count(*)::int AS n FROM questionnaire_answers WHERE participant_id = $1', [id]);
    const f = await env.pool.query('SELECT count(*)::int AS n FROM ficha_answers WHERE participant_id = $1', [id]);
    expect(q.rows[0].n + f.rows[0].n).toBe(0);
    expect((await psy.call('GET', `/api/campaigns/${campaignId}/results`)).json.rows.length).toBe(before - 1);
    expect((await psy.call('POST', `/api/participants/${id}/erase`, { password: psyPw })).status).toBe(409);
    expect((await psy.call('PATCH', `/api/participants/${id}`, { names: 'Otro Nombre' })).status).toBe(409);
    const audit = await env.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action IN ('participant.erased','participant.rectified')");
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it('cambia la forma a mano: exige motivo y contraseña, conserva respuestas, reabre si falta el intralaboral y audita', async () => {
    type P = { id: string; form: string | null; formManual: boolean; status: string };
    const get = async () => (await psy.call('GET', `/api/campaigns/${campaignId}/participants`)).json as P[];
    const a = (await get()).find((x) => x.status === 'completed' && x.form === 'A')!;
    const base = { form: 'B', reason: 'Su cargo real es operativo', password: psyPw };
    expect((await psy.call('POST', `/api/participants/${a.id}/form`, { ...base, password: 'mala' })).status).toBe(403);
    expect((await psy.call('POST', `/api/participants/${a.id}/form`, { ...base, reason: 'corto' })).status).toBe(400);
    expect((await psy.call('POST', `/api/participants/${a.id}/form`, { ...base, form: 'A' })).status).toBe(409);
    const before = (await psy.call('GET', `/api/campaigns/${campaignId}/results`)).json.rows.length;
    const r = await psy.call('POST', `/api/participants/${a.id}/form`, base);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ form: 'B', needsIntra: true, status: 'in_progress' });
    const after = (await get()).find((x) => x.id === a.id)!;
    expect(after).toMatchObject({ form: 'B', formManual: true, status: 'in_progress' });
    const kept = await env.pool.query("SELECT instrument FROM questionnaire_answers WHERE participant_id = $1 AND instrument = 'intra_A'", [a.id]);
    expect(kept.rows.length).toBe(1); // no se borra nada
    expect((await psy.call('GET', `/api/campaigns/${campaignId}/results`)).json.rows.length).toBe(before - 1); // sin intra_B no hay resultado
    const audit = await env.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'participant.form_changed'");
    expect(audit.rows[0].n).toBe(1);
  });

  it('retención: simula sin borrar y, con confirmación, suprime lo que supera el plazo', async () => {
    const { db, pool } = createDb(env.cfg);
    const crypto = createCrypto(env.cfg);
    await pool.query("UPDATE participants SET created_at = now() - interval '30 months' WHERE id IN (SELECT id FROM participants WHERE status = 'completed' ORDER BY created_at LIMIT 2)");
    expect(await purgeExpired(db, crypto, 24, true)).toBe(2);
    expect((await pool.query("SELECT count(*)::int AS n FROM participants WHERE status = 'revoked'")).rows[0].n).toBe(1); // solo la suprimida a mano
    expect(await purgeExpired(db, crypto, 24, false)).toBe(2);
    expect(await purgeExpired(db, crypto, 24, false)).toBe(0);
    await pool.end();
  });
});
