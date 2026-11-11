import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_PW, loginStaffReady, newClient, seedAdmin, startEnv, type Client, type TestEnv } from './helpers.js';

let env: TestEnv;
let admin: Client;
let psy: Client;
let victimId: string;
let companyId: string;

beforeAll(async () => {
  env = await startEnv();
  await seedAdmin(env);
  admin = (await loginStaffReady(env, ADMIN_EMAIL, ADMIN_PW)).client;
  companyId = (await admin.call('POST', '/api/admin/companies', { name: 'Empresa Auditada', code: 'AUD1' })).json.id;
  const p = await admin.call('POST', '/api/admin/users', { role: 'psychologist', username: 'audit-psy@sanithelp.test', fullName: 'Psicóloga Auditada', assignedCompanyIds: [companyId], professionalRegistry: 'TP 1', professionalDocument: '123456' });
  psy = (await loginStaffReady(env, 'audit-psy@sanithelp.test', p.json.password)).client;
  victimId = p.json.id;
}, 120_000);
afterAll(async () => {
  await env?.stop();
});

const login = (username: string, password: string) => newClient(env).call('POST', '/api/auth/login', { username, password });
const lockedFor = async () => {
  const r = await env.pool.query('SELECT failed_attempts, locked_until FROM users WHERE id = $1', [victimId]);
  const until = r.rows[0].locked_until as Date | null;
  return { attempts: r.rows[0].failed_attempts as number, seconds: until ? Math.round((until.getTime() - Date.now()) / 1000) : 0 };
};
/** Simula que ya pasó la espera para poder seguir intentando sin esperar de verdad. */
const skipWait = () => env.pool.query("UPDATE users SET locked_until = now() - interval '1 second' WHERE id = $1", [victimId]);

describe('espera progresiva tras intentos fallidos (personal)', () => {
  it('3.º intento 30 s, 4.º 1 min, 5.º 15 min y después se duplica; mientras espera ni la contraseña correcta entra', async () => {
    const pw = 'incorrecta-123';
    for (let i = 1; i <= 2; i++) {
      expect((await login('audit-psy@sanithelp.test', pw)).status).toBe(401);
      expect((await lockedFor()).seconds).toBe(0);
    }
    await login('audit-psy@sanithelp.test', pw); // 3.º
    let l = await lockedFor();
    expect(l.attempts).toBe(3);
    expect(l.seconds).toBeGreaterThan(20);
    expect(l.seconds).toBeLessThanOrEqual(30);
    // En espera: no cuenta como intento nuevo y tampoco deja entrar
    await login('audit-psy@sanithelp.test', pw);
    expect((await lockedFor()).attempts).toBe(3);
    await skipWait();
    await login('audit-psy@sanithelp.test', pw); // 4.º
    l = await lockedFor();
    expect(l.attempts).toBe(4);
    expect(l.seconds).toBeGreaterThan(50);
    expect(l.seconds).toBeLessThanOrEqual(60);
    await skipWait();
    await login('audit-psy@sanithelp.test', pw); // 5.º
    l = await lockedFor();
    expect(l.attempts).toBe(5);
    expect(l.seconds).toBeGreaterThan(14 * 60);
    await skipWait();
    await login('audit-psy@sanithelp.test', pw); // 6.º: el doble
    l = await lockedFor();
    expect(l.attempts).toBe(6);
    expect(l.seconds).toBeGreaterThan(29 * 60);
    expect(l.seconds).toBeLessThanOrEqual(30 * 60);
  });

  it('las alertas muestran la cuenta bloqueada y la IP con muchos intentos; las acciones llevan IP y no guardan lo escrito', async () => {
    // Intentos con usuarios inexistentes desde la misma IP (adivinación de contraseñas)
    for (const u of ['admin1', 'root', 'gerente', 'contabilidad', 'rrhh']) await login(`${u}@sanithelp.test`, 'ContraseñaSecreta-9');
    const a = await admin.call('GET', '/api/admin/audit/alerts');
    expect(a.status).toBe(200);
    const titles = a.json.alerts.map((x: { title: string; severity: string }) => `${x.severity}: ${x.title}`);
    expect(titles.some((t: string) => t.startsWith('high: Cuenta bloqueada por intentos fallidos: Psicóloga Auditada'))).toBe(true);
    expect(titles.some((t: string) => t.startsWith('high: Posible adivinación de contraseñas desde'))).toBe(true);
    expect(a.json.locked.map((u: { id: string }) => u.id)).toContain(victimId);
    expect(a.json.alerts.find((x: { key: string }) => x.key.startsWith('ip:')).filter.ip).toBeTruthy();

    const rows = (await env.pool.query("SELECT action, meta FROM audit_log WHERE action IN ('auth.login_failed','auth.locked','auth.login_failed_unknown','auth.login_blocked')")).rows as { action: string; meta: { ip?: string; ref?: string } }[];
    expect(rows.length).toBeGreaterThan(8);
    expect(rows.every((r) => typeof r.meta.ip === 'string' && r.meta.ip.length > 0)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('ContraseñaSecreta');
    expect(JSON.stringify(rows)).not.toContain('gerente'); // no se guarda el nombre de usuario escrito, solo una huella
    expect(rows.some((r) => r.action === 'auth.login_failed_unknown' && r.meta.ref?.length === 12)).toBe(true);
  });

  it('el administrador desbloquea la cuenta y queda registrado; las no administradoras no ven la auditoría', async () => {
    expect((await psy.call('POST', `/api/admin/users/${victimId}/unlock`)).status).toBe(403);
    expect((await admin.call('POST', `/api/admin/users/${victimId}/unlock`)).status).toBe(200);
    expect(await lockedFor()).toEqual({ attempts: 0, seconds: 0 });
    expect((await admin.call('GET', '/api/admin/audit/alerts')).json.locked.map((u: { id: string }) => u.id)).not.toContain(victimId);
    expect((await psy.call('GET', '/api/admin/audit')).status).toBe(403);
    expect((await psy.call('GET', '/api/admin/audit/alerts')).status).toBe(403);
    expect((await psy.call('GET', '/api/admin/audit.csv')).status).toBe(403);
    const un = await admin.call('GET', '/api/admin/audit?action=unlocked');
    expect(un.json.rows[0]).toMatchObject({ action: 'user.unlocked', targetId: victimId, actor: { role: 'admin' } });
  });
});

describe('credencial compartida de campaña', () => {
  it('sigue con 5 intentos → 15 min (sin escalar), para que no dejen sin acceso a toda la campaña', async () => {
    const camp = await psy.call('POST', '/api/campaigns', { companyId, name: 'Ronda auditoría', assessments: ['acrofobia'] });
    for (let i = 0; i < 3; i++) await login(camp.json.username, 'mala');
    // 3 intentos fallidos: aún sin espera, sigue entrando
    expect((await login(camp.json.username, camp.json.password)).status).toBe(200);
    for (let i = 0; i < 5; i++) await login(camp.json.username, 'mala');
    expect((await login(camp.json.username, camp.json.password)).status).toBe(401);
    const r = await env.pool.query("SELECT failed_attempts, locked_until FROM users WHERE campaign_id = $1", [camp.json.id]);
    expect(r.rows[0].failed_attempts).toBe(0); // el contador se reinicia al bloquear (como antes)
    expect(Math.round((r.rows[0].locked_until.getTime() - Date.now()) / 60_000)).toBeGreaterThanOrEqual(14);
  });
});

describe('consulta, filtros y exportación', () => {
  it('filtra por categoría, persona, IP y fechas; pagina con cursor; exporta CSV', async () => {
    const all = (await admin.call('GET', '/api/admin/audit?limit=200')).json;
    expect(all.rows.length).toBeGreaterThan(10);
    expect(all.rows[0].actor === null || typeof all.rows[0].actor.name === 'string').toBe(true);

    const auth = (await admin.call('GET', '/api/admin/audit?category=auth&limit=200')).json.rows as { action: string }[];
    expect(auth.length).toBeGreaterThan(5);
    expect(auth.every((r) => r.action.startsWith('auth.'))).toBe(true);

    const byPerson = (await admin.call('GET', '/api/admin/audit?actor=audit-psy%40sanithelp&limit=200')).json.rows as { actor: { name: string } }[];
    expect(byPerson.length).toBeGreaterThan(3);
    expect(byPerson.every((r) => r.actor.name === 'Psicóloga Auditada')).toBe(true);
    expect((await admin.call('GET', '/api/admin/audit?actor=nadie-existe-xyz')).json.rows).toEqual([]);

    const ip = auth.find((r) => (r as unknown as { ip: string | null }).ip) as unknown as { ip: string };
    const byIp = (await admin.call('GET', `/api/admin/audit?ip=${encodeURIComponent(ip.ip)}&limit=200`)).json.rows as { ip: string }[];
    expect(byIp.length).toBeGreaterThan(0);
    expect(byIp.every((r) => r.ip === ip.ip)).toBe(true);

    const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    expect((await admin.call('GET', `/api/admin/audit?from=${today}&to=${today}&limit=5`)).json.rows.length).toBe(5);
    expect((await admin.call('GET', '/api/admin/audit?from=2001-01-01&to=2001-01-02')).json.rows).toEqual([]);

    const p1 = (await admin.call('GET', '/api/admin/audit?limit=3')).json;
    expect(p1.rows).toHaveLength(3);
    const p2 = (await admin.call('GET', `/api/admin/audit?limit=3&before=${p1.nextBefore}`)).json;
    expect(p2.rows[0].id).toBeLessThan(p1.nextBefore);
    expect(p2.rows.map((r: { id: number }) => r.id)).not.toContain(p1.rows[0].id);

    const csv = await env.app.inject({ method: 'GET', url: '/api/admin/audit.csv?category=auth', headers: { origin: 'http://localhost:3000', cookie: admin.cookie, 'x-csrf-token': admin.csrf } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe('Fecha (UTC);Cuenta;Correo;Rol;Acción;Objeto;Identificador;IP;Detalle');
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.slice(1).every((l) => l.includes('auth.'))).toBe(true);
  });
});
