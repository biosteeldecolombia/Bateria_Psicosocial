// Entorno local de prueba: PostgreSQL embebido + servidor. SOLO para desarrollo, con datos sintéticos.
// Uso: npm run local   (desde la raíz)
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDb, runMigrations } from '../db/client.js';
import { campaigns, companies, psychologistCompanies, users } from '../db/schema.js';
import { createCrypto } from '../security/crypto.js';
import { generateTempPassword, hashPassword } from '../security/passwords.js';
import { createAdmin } from './bootstrap.js';
import { seedSynthetic } from './seed-synthetic.js';

const root = path.resolve(process.cwd(), '..');
const dataDir = path.join(root, '.pgdata');
const secretsFile = path.join(dataDir, 'dev-secrets.json');
const credsFile = path.join(dataDir, 'CREDENCIALES-DEMO.txt');
const PG_PORT = 54400;
const PORT = Number(process.env.PORT ?? 3000);

fs.mkdirSync(dataDir, { recursive: true });

// Los secretos se generan una vez y se conservan: así los datos cifrados siguen legibles entre reinicios.
const secrets: Record<string, string> = fs.existsSync(secretsFile)
  ? JSON.parse(fs.readFileSync(secretsFile, 'utf8'))
  : {
      SESSION_SECRET: randomBytes(48).toString('base64'),
      DATA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      BLIND_INDEX_KEY: randomBytes(32).toString('base64'),
    };
fs.writeFileSync(secretsFile, JSON.stringify(secrets));

const pgDir = path.join(dataDir, 'pg');
const pg = new EmbeddedPostgres({ databaseDir: pgDir, user: 'postgres', password: 'dev', port: PG_PORT, persistent: true, onLog: () => undefined, onError: () => undefined });
if (!fs.existsSync(path.join(pgDir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('bateria');
} catch {
  /* ya existe */
}

const cfg = loadConfig({
  NODE_ENV: 'development',
  PORT: String(PORT),
  DATABASE_URL: `postgres://postgres:dev@localhost:${PG_PORT}/bateria`,
  APP_BASE_URL: `http://localhost:${PORT}`,
  CLIENT_DIST: '../client/dist',
  ...secrets,
} as NodeJS.ProcessEnv);

const { db, pool } = createDb(cfg);
await runMigrations(db);

// Datos de demostración (solo la primera vez)
const [hasAdmin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
if (!hasAdmin) {
  const crypto = createCrypto(cfg);
  const adminPw = generateTempPassword(16);
  await createAdmin(cfg, db, 'admin@demo.local', adminPw, 'Administrador Demo');
  const [co] = await db.insert(companies).values({ name: 'Empresa Demo S.A.S.', code: 'DEMO', minGroupSize: 5 }).returning();
  const psyPw = generateTempPassword(14);
  const [psy] = await db
    .insert(users)
    .values({
      role: 'psychologist',
      usernameBlind: crypto.blindIndex('psicologa@demo.local'),
      usernameEnc: crypto.encrypt('psicologa@demo.local'),
      fullNameEnc: crypto.encrypt('Psicóloga Demo'),
      passwordHash: await hashPassword(psyPw),
    })
    .returning({ id: users.id });
  await db.insert(psychologistCompanies).values({ userId: psy!.id, companyId: co!.id });
  const [camp] = await db.insert(campaigns).values({ companyId: co!.id, name: 'Ronda de demostración' }).returning();
  const accessUser = 'DEMO-1000';
  const accessPw = generateTempPassword(10);
  await db.insert(users).values({
    role: 'collaborator',
    usernameBlind: crypto.blindIndex(accessUser),
    usernameEnc: crypto.encrypt(accessUser),
    fullNameEnc: crypto.encrypt('Acceso Empresa Demo · Ronda de demostración'),
    companyId: co!.id,
    campaignId: camp!.id,
    passwordHash: await hashPassword(accessPw),
  });
  await seedSynthetic(db, crypto, { campaignId: camp!.id, companyId: co!.id, count: 60 });
  fs.writeFileSync(
    credsFile,
    [
      'CREDENCIALES DE DEMOSTRACIÓN (datos sintéticos, solo local)',
      '',
      `Administrador:        admin@demo.local / ${adminPw}`,
      `Psicóloga:            psicologa@demo.local / ${psyPw}`,
      `Acceso de la empresa: ${accessUser} / ${accessPw}   (credencial compartida por los colaboradores de la campaña)`,
      '',
      'Administrador y psicóloga deben activar MFA al primer ingreso (app como Google Authenticator).',
      'Los colaboradores entran con la credencial de la empresa y se identifican con su documento; reciben un código personal para retomar.',
      'La campaña de demostración trae 60 participantes SINTÉTICOS ya completados para probar el análisis de resultados.',
      'Para empezar de cero: detén el servidor y borra la carpeta .pgdata',
    ].join('\n'),
  );
}

const app = await buildApp(cfg, db);
await app.listen({ port: PORT, host: '127.0.0.1' });

console.log('\n==============================================');
console.log(` Listo:  http://localhost:${PORT}`);
console.log(` Credenciales de demostración: ${credsFile}`);
console.log(' Para detener: Ctrl + C');
console.log('==============================================\n');

const shutdown = async () => {
  await app.close();
  await pool.end();
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
