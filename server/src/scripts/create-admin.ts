// Uso: npm run create-admin -- correo@dominio.com "Nombre Apellido"
// La contraseña se toma de ADMIN_BOOTSTRAP_PASSWORD (no se acepta por argumento para que no quede en el historial).
import { loadConfig } from '../config.js';
import { createDb, runMigrations } from '../db/client.js';
import { createAdmin } from './bootstrap.js';

const [email, ...nameParts] = process.argv.slice(2);
const cfg = loadConfig();
if (!email || !cfg.ADMIN_BOOTSTRAP_PASSWORD) {
  console.error('Uso: ADMIN_BOOTSTRAP_PASSWORD=... npm run create-admin -- correo@dominio.com "Nombre Apellido"');
  process.exit(1);
}
const { db, pool } = createDb(cfg);
await runMigrations(db);
await createAdmin(cfg, db, email, cfg.ADMIN_BOOTSTRAP_PASSWORD, nameParts.join(' ') || 'Administrador Sanithelp');
await pool.end();
