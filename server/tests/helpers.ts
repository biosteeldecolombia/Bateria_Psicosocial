import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDb, runMigrations } from '../src/db/client.js';
import { createAdmin } from '../src/scripts/bootstrap.js';
import type { Mailer, MailMessage } from '../src/mail/mailer.js';

/** Correo falso para pruebas: guarda lo que se «envía». */
export function fakeMailer(opts: { failFor?: string[] } = {}): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    enabled: true,
    provider: 'smtp',
    from: 'evaluaciones@sanithelp.test',
    sent,
    async send(m) {
      if (opts.failFor?.includes(m.to)) throw new Error('fallo simulado');
      sent.push(m);
    },
  };
}

export interface TestEnv {
  app: FastifyInstance;
  cfg: Config;
  pool: ReturnType<typeof createDb>['pool'];
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export async function startEnv(preferredPort?: number, opts: { mailer?: Mailer } = {}): Promise<TestEnv> {
  const port = preferredPort ?? (await freePort());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgtest-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'test', port, persistent: false, onLog: () => undefined, onError: () => undefined });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('bateria');
  const cfg = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: `postgres://postgres:test@localhost:${port}/bateria`,
    SESSION_SECRET: randomBytes(32).toString('base64'),
    DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    BLIND_INDEX_KEY: randomBytes(32).toString('base64'),
    APP_BASE_URL: 'http://localhost:3000',
    CLIENT_DIST: '../no-existe',
  } as NodeJS.ProcessEnv);
  const { db, pool } = createDb(cfg);
  await runMigrations(db);
  const app = await buildApp(cfg, db, opts);
  await app.ready();
  return {
    app,
    cfg,
    pool,
    stop: async () => {
      await app.close();
      await pool.end();
      await pg.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const ADMIN_EMAIL = 'admin@sanithelp.test';
export const ADMIN_PW = 'Clave-Temporal-Larga-91';

export async function seedAdmin(env: TestEnv) {
  const { db, pool } = createDb(env.cfg);
  await createAdmin(env.cfg, db, ADMIN_EMAIL, ADMIN_PW, 'Admin Prueba');
  await pool.end();
}

export interface Client {
  cookie: string;
  /** Cookie del dispositivo de confianza (si se recordó este equipo). */
  device: string;
  csrf: string;
  call: (method: string, url: string, body?: unknown) => Promise<{ status: number; json: any }>;
}

export function newClient(env: TestEnv): Client {
  const c: Client = {
    cookie: '',
    device: '',
    csrf: '',
    async call(method, url, body) {
      const res = await env.app.inject({
        method: method as 'GET',
        url,
        payload: body as object | undefined,
        headers: { origin: 'http://localhost:3000', ...(c.cookie || c.device ? { cookie: [c.cookie, c.device ? `td=${c.device}` : ''].filter(Boolean).join('; ') } : {}), ...(c.csrf ? { 'x-csrf-token': c.csrf } : {}) },
      });
      const set = res.cookies.find((x) => x.name === 'sid');
      if (set) c.cookie = `sid=${set.value}`;
      const dev = res.cookies.find((x) => x.name === 'td');
      if (dev) c.device = dev.value;
      const isJson = String(res.headers['content-type'] ?? '').includes('json');
      const json = res.body ? (isJson ? JSON.parse(res.body) : res.body) : null;
      if (json?.csrfToken) c.csrf = json.csrfToken;
      return { status: res.statusCode, json };
    },
  };
  return c;
}

export const totpNow = (secretBase32: string, offsetSteps = 0) =>
  new OTPAuth.TOTP({ digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secretBase32) }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });

/** Inicia sesión como personal (admin/psicóloga), activa MFA y devuelve cliente listo y secreto TOTP. */
export async function loginStaffReady(env: TestEnv, username: string, password: string) {
  const c = newClient(env);
  const r = await c.call('POST', '/api/auth/login', { username, password });
  if (r.status !== 200) throw new Error(`login ${r.status} ${JSON.stringify(r.json)}`);
  const setup = await c.call('POST', '/api/auth/mfa/setup');
  const en = await c.call('POST', '/api/auth/mfa/enable', { code: totpNow(setup.json.secret) });
  if (en.status !== 200) throw new Error(`enable ${JSON.stringify(en.json)}`);
  return { client: c, secret: setup.json.secret as string, recoveryCodes: en.json.recoveryCodes as string[] };
}
