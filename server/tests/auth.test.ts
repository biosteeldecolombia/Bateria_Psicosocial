import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, totpNow, type Client, type TestEnv } from './helpers.js';
import { createCrypto } from '../src/security/crypto.js';
import { validatePasswordPolicy } from '../src/security/passwords.js';

let env: TestEnv;
let admin: Client;
let adminSecret: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  const r = await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW);
  admin = r.client;
  adminSecret = r.secret;
}, 120_000);

afterAll(async () => {
  await env?.stop();
});

/** Crea empresa + campaña y devuelve la credencial compartida. */
async function newCampaign(client: Client, code: string, name = 'Ronda 1') {
  const co = await client.call('POST', '/api/admin/companies', { name: `Empresa ${code}`, code, minGroupSize: 5 });
  const camp = await client.call('POST', '/api/campaigns', { companyId: co.json.id, name });
  expect(camp.status).toBe(201);
  return { companyId: co.json.id as string, campaignId: camp.json.id as string, username: camp.json.username as string, password: camp.json.password as string };
}

async function accessClient(a: { username: string; password: string }) {
  const c = newClient(env);
  const r = await c.call('POST', '/api/auth/login', { username: a.username, password: a.password });
  expect(r.status).toBe(200);
  return { c, me: r.json };
}

describe('infraestructura', () => {
  it('health responde sin datos sensibles', async () => {
    const r = await newClient(env).call('GET', '/api/health');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: 'ok' });
  });

  it('rechaza configuración incompleta y dice qué falta', async () => {
    const { loadConfig } = await import('../src/config.js');
    expect(() => loadConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('cifra y descifra; el índice ciego es determinista; versiona la clave', () => {
    const c = createCrypto(env.cfg);
    const enc = c.encrypt('1.234.567');
    expect(enc).not.toContain('1.234.567');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(c.decrypt(enc)).toBe('1.234.567');
    expect(c.blindIndex(' ABC ')).toBe(c.blindIndex('abc'));
    expect(() => c.decrypt(enc.slice(0, -3) + 'AAA')).toThrow();
  });
});

describe('autenticación del personal', () => {
  it('login con credenciales erróneas devuelve mensaje genérico', async () => {
    const a = await newClient(env).call('POST', '/api/auth/login', { username: ADMIN_EMAIL, password: 'mala' });
    const b = await newClient(env).call('POST', '/api/auth/login', { username: 'noexiste@x.co', password: 'mala' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error).toBe(b.json.error);
  });

  it('el administrador exige MFA y no hay cambio de contraseña obligatorio', async () => {
    const c = newClient(env);
    const r = await c.call('POST', '/api/auth/login', { username: ADMIN_EMAIL, password: ADMIN_PW });
    expect(r.json.status).toBe('mfa_required');
    expect((await c.call('GET', '/api/companies')).status).toBe(403);
    expect((await c.call('POST', '/api/auth/mfa/verify', { code: '000000' })).status).toBe(400);
    const ok = await c.call('POST', '/api/auth/mfa/verify', { code: totpNow(adminSecret, 1) });
    expect(ok.json.status).toBe('ready');
    expect((await c.call('GET', '/api/companies')).status).toBe(200);
  });

  it('ya no existe la ruta de cambio de contraseña autogestionado', async () => {
    expect((await admin.call('POST', '/api/auth/change-password', { currentPassword: 'a', newPassword: 'b' })).status).toBe(404);
  });

  it('no acepta reutilizar un código TOTP ya usado', async () => {
    const c = newClient(env);
    await c.call('POST', '/api/auth/login', { username: ADMIN_EMAIL, password: ADMIN_PW });
    expect((await c.call('POST', '/api/auth/mfa/verify', { code: totpNow(adminSecret, 1) })).status).toBe(400);
  });

  it('el administrador restablece contraseñas y la anterior deja de servir', async () => {
    const p = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'reset@sanithelp.test', fullName: 'Persona Reset' });
    const r = await admin.call('POST', `/api/admin/users/${p.json.id}/reset-password`);
    expect(r.status).toBe(200);
    expect((await newClient(env).call('POST', '/api/auth/login', { username: 'reset@sanithelp.test', password: p.json.password })).status).toBe(401);
    expect((await newClient(env).call('POST', '/api/auth/login', { username: 'reset@sanithelp.test', password: r.json.password })).status).toBe(200);
  });

  it('cierra sesión y la cookie deja de servir', async () => {
    const c = newClient(env);
    await c.call('POST', '/api/auth/login', { username: ADMIN_EMAIL, password: ADMIN_PW });
    const old = c.cookie;
    await c.call('POST', '/api/auth/logout');
    c.cookie = old;
    expect((await c.call('GET', '/api/auth/me')).status).toBe(401);
  });

  it('política de contraseñas', () => {
    expect(validatePasswordPolicy('corta', 'psychologist')).toMatch(/12/);
    expect(validatePasswordPolicy('sanithelp2026', 'psychologist')).toMatch(/común/);
  });
});

describe('credencial de campaña y participantes', () => {
  it('la credencial compartida entra sin pasos extra y aún no tiene participante', async () => {
    const a = await newCampaign(admin, 'CP1');
    const { me } = await accessClient(a);
    expect(me.status).toBe('ready');
    expect(me.role).toBe('collaborator');
    expect(me.participant).toBeNull();
    expect(me.campaignName).toBe('Ronda 1');
  });

  it('empezar entrega un código personal una sola vez y retomar exige documento + código', async () => {
    const a = await newCampaign(admin, 'CP2');
    const { c } = await accessClient(a);
    const start = await c.call('POST', '/api/participation/start', { document: '1.234.567-8', names: 'Ana', surnames: 'Pérez' });
    expect(start.status).toBe(200);
    expect(start.json.resumeCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(start.json.me.participant.status).toBe('in_progress');
    expect(JSON.stringify(start.json.me)).not.toContain('Ana'); // /me no devuelve datos personales del participante

    // Otro equipo, misma credencial de empresa: retoma con documento + código
    const other = await accessClient(a);
    expect((await other.c.call('POST', '/api/participation/resume', { document: '12345678', code: 'AAAA-BBBB' })).status).toBe(401);
    const ok = await other.c.call('POST', '/api/participation/resume', { document: '1234567-8', code: start.json.resumeCode.toLowerCase() });
    expect(ok.status).toBe(200);
    expect(ok.json.participant.status).toBe('in_progress');
  });

  it('no permite empezar dos veces con el mismo documento', async () => {
    const a = await newCampaign(admin, 'CP3');
    const { c } = await accessClient(a);
    expect((await c.call('POST', '/api/participation/start', { document: '55555555', names: 'Luis', surnames: 'Gómez' })).status).toBe(200);
    expect((await c.call('POST', '/api/participation/start', { document: '55.555.555', names: 'Luis', surnames: 'Gómez' })).status).toBe(409);
  });

  it('bloquea el retomar tras 5 códigos incorrectos, incluso con el código correcto', async () => {
    const a = await newCampaign(admin, 'CP4');
    const { c } = await accessClient(a);
    const start = await c.call('POST', '/api/participation/start', { document: '77777777', names: 'Eva', surnames: 'Ríos' });
    const { c: c2 } = await accessClient(a);
    for (let i = 0; i < 5; i++) await c2.call('POST', '/api/participation/resume', { document: '77777777', code: 'ZZZZ-ZZZZ' });
    expect((await c2.call('POST', '/api/participation/resume', { document: '77777777', code: start.json.resumeCode })).status).toBe(401);
  });

  it('el mismo documento en otra campaña es una participación distinta', async () => {
    const a = await newCampaign(admin, 'CP5');
    const b = await newCampaign(admin, 'CP6');
    const { c: ca } = await accessClient(a);
    const { c: cb } = await accessClient(b);
    expect((await ca.call('POST', '/api/participation/start', { document: '99999999', names: 'Same', surnames: 'Person' })).status).toBe(200);
    expect((await cb.call('POST', '/api/participation/start', { document: '99999999', names: 'Same', surnames: 'Person' })).status).toBe(200);
  });

  it('"leave" libera el equipo para otra persona', async () => {
    const a = await newCampaign(admin, 'CP7');
    const { c } = await accessClient(a);
    await c.call('POST', '/api/participation/start', { document: '11111111', names: 'Primera', surnames: 'Persona' });
    const left = await c.call('POST', '/api/participation/leave');
    expect(left.json.participant).toBeNull();
  });

  it('cerrar la campaña invalida la credencial y las sesiones abiertas; reabrir la restituye', async () => {
    const a = await newCampaign(admin, 'CP8');
    const { c } = await accessClient(a);
    expect((await admin.call('POST', `/api/campaigns/${a.campaignId}/status`, { status: 'closed' })).status).toBe(200);
    expect((await c.call('GET', '/api/auth/me')).status).toBe(401);
    expect((await newClient(env).call('POST', '/api/auth/login', { username: a.username, password: a.password })).status).toBe(401);
    await admin.call('POST', `/api/campaigns/${a.campaignId}/status`, { status: 'open' });
    expect((await newClient(env).call('POST', '/api/auth/login', { username: a.username, password: a.password })).status).toBe(200);
  });

  it('regenerar la credencial invalida la anterior', async () => {
    const a = await newCampaign(admin, 'CP9');
    const { c } = await accessClient(a);
    const r = await admin.call('POST', `/api/campaigns/${a.campaignId}/regenerate-access`);
    expect(r.json.username).toBe(a.username);
    expect((await c.call('GET', '/api/auth/me')).status).toBe(401);
    expect((await newClient(env).call('POST', '/api/auth/login', { username: a.username, password: a.password })).status).toBe(401);
    expect((await newClient(env).call('POST', '/api/auth/login', { username: a.username, password: r.json.password })).status).toBe(200);
  });

  it('bloquea la credencial tras 5 intentos fallidos', async () => {
    const a = await newCampaign(admin, 'CPA');
    const c = newClient(env);
    for (let i = 0; i < 5; i++) await c.call('POST', '/api/auth/login', { username: a.username, password: 'incorrecta' });
    expect((await c.call('POST', '/api/auth/login', { username: a.username, password: a.password })).status).toBe(401);
  });
});

describe('autorización y CSRF', () => {
  it('rechaza peticiones sin token CSRF o con origen ajeno', async () => {
    const noCsrf = await env.app.inject({ method: 'POST', url: '/api/admin/companies', headers: { origin: 'http://localhost:3000', cookie: admin.cookie }, payload: { name: 'X', code: 'XX' } });
    expect(noCsrf.statusCode).toBe(403);
    const evil = await env.app.inject({ method: 'POST', url: '/api/admin/companies', headers: { origin: 'https://evil.example', cookie: admin.cookie, 'x-csrf-token': admin.csrf }, payload: { name: 'X', code: 'XX' } });
    expect(evil.statusCode).toBe(403);
  });

  it('la psicóloga solo gestiona campañas de sus empresas y no crea cuentas', async () => {
    const a = await admin.call('POST', '/api/admin/companies', { name: 'Empresa PA', code: 'PSA', minGroupSize: 5 });
    const b = await admin.call('POST', '/api/admin/companies', { name: 'Empresa PB', code: 'PSB', minGroupSize: 5 });
    const p = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'agenda@sanithelp.test', fullName: 'Psi Cóloga', assignedCompanyIds: [a.json.id] });
    expect(p.status).toBe(201);
    const { client: psy } = await loginStaffReady(env, 'agenda@sanithelp.test', p.json.password);

    expect((await psy.call('GET', '/api/companies')).json.map((x: { code: string }) => x.code)).toEqual(['PSA']);
    expect((await psy.call('POST', '/api/campaigns', { companyId: a.json.id, name: 'Mi ronda' })).status).toBe(201);
    expect((await psy.call('POST', '/api/campaigns', { companyId: b.json.id, name: 'Ajena' })).status).toBe(404);

    const other = await admin.call('POST', '/api/campaigns', { companyId: b.json.id, name: 'De B' });
    expect((await psy.call('POST', `/api/campaigns/${other.json.id}/regenerate-access`)).status).toBe(404);
    expect((await psy.call('POST', `/api/campaigns/${other.json.id}/status`, { status: 'closed' })).status).toBe(404);
    expect((await psy.call('GET', '/api/campaigns')).json.every((c: { companyId: string }) => c.companyId === a.json.id)).toBe(true);

    expect((await psy.call('POST', '/api/admin/users', { role: 'admin', username: 'x@x.co', fullName: 'Intruso' })).status).toBe(403);
    expect((await psy.call('POST', '/api/admin/companies', { name: 'Z', code: 'ZZ' })).status).toBe(403);
    expect((await psy.call('GET', '/api/admin/audit')).status).toBe(403);
  });

  it('la credencial de campaña no accede a gestión ni a otras campañas', async () => {
    const a = await newCampaign(admin, 'CPB');
    const { c } = await accessClient(a);
    expect((await c.call('GET', '/api/companies')).status).toBe(403);
    expect((await c.call('GET', '/api/campaigns')).status).toBe(403);
    expect((await c.call('POST', '/api/campaigns', { companyId: a.companyId, name: 'x' })).status).toBe(403);
    expect((await c.call('GET', '/api/admin/audit')).status).toBe(403);
  });

  it('el personal no puede usar las rutas de participación', async () => {
    expect((await admin.call('POST', '/api/participation/start', { document: '12345678', names: 'Admin', surnames: 'Intruso' })).status).toBe(403);
  });
});

describe('datos y auditoría', () => {
  it('no guarda usuario, nombre, documento ni contraseña en texto plano', async () => {
    const { rows } = await env.pool.query('SELECT username_enc, full_name_enc, password_hash FROM users');
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain('admin@sanithelp.test');
    expect(dump).not.toContain('Admin Prueba');
    expect(rows.every((r: { password_hash: string }) => r.password_hash.startsWith('$argon2id$'))).toBe(true);
    const parts = JSON.stringify((await env.pool.query('SELECT document_enc, full_name_enc, resume_code_hash FROM participants')).rows);
    expect(parts).not.toContain('Ana');
    expect(parts).not.toContain('12345678');
  });

  it('la auditoría registra eventos sin datos personales y no se puede modificar ni borrar', async () => {
    const log = await admin.call('GET', '/api/admin/audit?limit=500');
    expect(log.json.some((e: { action: string }) => e.action === 'participant.started')).toBe(true);
    const dump = JSON.stringify(log.json);
    expect(dump).not.toContain(ADMIN_EMAIL);
    expect(dump).not.toContain('Ana Pérez');
    await expect(env.pool.query('UPDATE audit_log SET action = $1', ['x'])).rejects.toThrow(/solo inserción/);
    await expect(env.pool.query('DELETE FROM audit_log')).rejects.toThrow(/solo inserción/);
    await expect(env.pool.query('TRUNCATE audit_log')).rejects.toThrow(/solo inserción/);
  });
});
