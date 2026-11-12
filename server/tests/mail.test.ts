import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_PW, fakeMailer, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

const mailer = fakeMailer({ failFor: ['roto@correo.test'] });
let env: TestEnv;
let admin: Client;

beforeAll(async () => {
  env = await startEnv(undefined, { mailer });
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
}, 120_000);

afterAll(async () => {
  await env?.stop();
});

async function campaign(code: string) {
  const co = await admin.call('POST', '/api/admin/companies', { name: `Empresa ${code}`, code });
  const camp = await admin.call('POST', '/api/campaigns', { companyId: co.json.id, name: 'Ronda correo' });
  return { companyId: co.json.id as string, id: camp.json.id as string, username: camp.json.username as string, password: camp.json.password as string };
}

describe('credenciales por correo', () => {
  it('envía un correo individual por destinatario con usuario, contraseña y enlace; la auditoría no guarda direcciones', async () => {
    const c = await campaign('MAIL1');
    mailer.sent.length = 0;
    const r = await admin.call('POST', `/api/campaigns/${c.id}/email-access`, { emails: ['uno@correo.test', 'DOS@correo.test', 'roto@correo.test', 'uno@correo.test'] });
    expect(r.status).toBe(200);
    expect(r.json.sent.sort()).toEqual(['dos@correo.test', 'uno@correo.test']);
    expect(r.json.failed).toEqual(['roto@correo.test']);
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[0]!.text).toContain(c.username);
    expect(mailer.sent[0]!.text).toContain(c.password);
    expect(mailer.sent[0]!.html).toContain('http://localhost:3000');
    const audit = await admin.call('GET', '/api/admin/audit?category=campaign');
    expect(JSON.stringify(audit.json)).not.toContain('correo.test');
  });

  it('rechaza correos inválidos y campañas cerradas; el permiso se puede quitar', async () => {
    const c = await campaign('MAIL2');
    expect((await admin.call('POST', `/api/campaigns/${c.id}/email-access`, { emails: ['no-es-correo'] })).status).toBe(400);
    expect((await admin.call('POST', `/api/campaigns/${c.id}/email-access`, { emails: [] })).status).toBe(400);
    await admin.call('POST', `/api/campaigns/${c.id}/status`, { status: 'closed' });
    expect((await admin.call('POST', `/api/campaigns/${c.id}/email-access`, { emails: ['a@correo.test'] })).status).toBe(409);
    await admin.call('POST', `/api/campaigns/${c.id}/status`, { status: 'open' });

    const aux = await admin.call('POST', '/api/admin/users', { role: 'assistant', username: 'aux@sanithelp.test', fullName: 'Aux Prueba', assignedCompanyIds: [c.companyId] });
    const { client: auxClient } = await loginStaffReady(env, 'aux@sanithelp.test', aux.json.password);
    expect((await auxClient.call('POST', `/api/campaigns/${c.id}/email-access`, { emails: ['a@correo.test'] })).status).toBe(200);
    const cur = (await admin.call('GET', '/api/admin/roles')).json.matrix.assistant;
    await admin.call('PUT', '/api/admin/roles/assistant', { permissions: { ...cur, 'campaigns.email': false } });
    expect((await auxClient.call('POST', `/api/campaigns/${c.id}/email-access`, { emails: ['a@correo.test'] })).status).toBe(403);
    await admin.call('DELETE', '/api/admin/roles/assistant');
  });

  it('el código personal para continuar se envía al correo que la persona escribe, y el correo no se guarda', async () => {
    const c = await campaign('MAIL3');
    mailer.sent.length = 0;
    const person = newClient(env);
    await person.call('POST', '/api/auth/login', { username: c.username, password: c.password });
    const r = await person.call('POST', '/api/participation/start', { document: '1234567890', names: 'Ana', surnames: 'Prueba', email: 'ana@correo.test' });
    expect(r.status).toBe(200);
    expect(r.json.emailSent).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('ana@correo.test');
    expect(mailer.sent[0]!.text).toContain(r.json.resumeCode);
    // Sin correo, todo sigue igual
    const other = newClient(env);
    await other.call('POST', '/api/auth/login', { username: c.username, password: c.password });
    const r2 = await other.call('POST', '/api/participation/start', { document: '1234567891', names: 'Luis', surnames: 'Prueba' });
    expect(r2.status).toBe(200);
    expect(r2.json.emailSent).toBe(false);
    // Un correo mal escrito se rechaza antes de crear nada
    const bad = newClient(env);
    await bad.call('POST', '/api/auth/login', { username: c.username, password: c.password });
    expect((await bad.call('POST', '/api/participation/start', { document: '1234567892', names: 'Eva', surnames: 'Prueba', email: 'mal' })).status).toBe(400);
  });
});

describe('verificación en dos pasos por correo y dispositivos de confianza', () => {
  it('activa el método «correo», verifica con el código recibido y recuerda el equipo', async () => {
    const u = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'otp@sanithelp.test', fullName: 'Persona Otp' });
    const c = newClient(env);
    await c.call('POST', '/api/auth/login', { username: 'otp@sanithelp.test', password: u.json.password });
    expect((await c.call('GET', '/api/auth/mfa/methods')).json.email).toBe(true);
    mailer.sent.length = 0;
    expect((await c.call('POST', '/api/auth/mfa/email/send')).status).toBe(200);
    const code = /\b(\d{6})\b/.exec(mailer.sent[0]!.text)![1]!;
    expect((await c.call('POST', '/api/auth/mfa/enable', { code: '000000', method: 'email' })).status).toBe(400);
    const en = await c.call('POST', '/api/auth/mfa/enable', { code, method: 'email', remember: true });
    expect(en.status).toBe(200);
    expect(en.json.recoveryCodes).toHaveLength(8);
    expect(c.device).not.toBe('');

    // Mismo equipo: no pide el segundo paso
    const again = await c.call('POST', '/api/auth/login', { username: 'otp@sanithelp.test', password: u.json.password });
    expect(again.json.status).toBe('ready');

    // Otro equipo: sí lo pide y se resuelve con un código nuevo por correo
    const other = newClient(env);
    const l = await other.call('POST', '/api/auth/login', { username: 'otp@sanithelp.test', password: u.json.password });
    expect(l.json.status).toBe('mfa_required');
    mailer.sent.length = 0;
    expect((await other.call('POST', '/api/auth/mfa/email/send')).status).toBe(200);
    const code2 = /\b(\d{6})\b/.exec(mailer.sent[0]!.text)![1]!;
    expect((await other.call('POST', '/api/auth/mfa/verify', { code: code2 })).json.status).toBe('ready');
    // El código ya se usó
    const third = newClient(env);
    await third.call('POST', '/api/auth/login', { username: 'otp@sanithelp.test', password: u.json.password });
    expect((await third.call('POST', '/api/auth/mfa/verify', { code: code2 })).status).toBe(400);

    // Al restablecer la contraseña se olvidan los equipos recordados
    await admin.call('POST', `/api/admin/users/${u.json.id}/reset-password`);
    const after = await c.call('POST', '/api/auth/login', { username: 'otp@sanithelp.test', password: u.json.password });
    expect(after.status).toBe(401);
  });
});
