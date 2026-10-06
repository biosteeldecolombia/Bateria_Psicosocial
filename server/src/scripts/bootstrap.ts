import { eq } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { createCrypto } from '../security/crypto.js';
import { hashPassword, validatePasswordPolicy } from '../security/passwords.js';

/**
 * Crea el primer administrador si no existe ninguno y las variables de bootstrap están definidas.
 * Queda con cambio de contraseña obligatorio. No hay credenciales por defecto en el código.
 */
export async function bootstrapAdmin(cfg: Config, db: Db): Promise<'created' | 'exists' | 'skipped'> {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
  if (existing) return 'exists';
  if (!cfg.ADMIN_BOOTSTRAP_EMAIL || !cfg.ADMIN_BOOTSTRAP_PASSWORD) return 'skipped';
  return createAdmin(cfg, db, cfg.ADMIN_BOOTSTRAP_EMAIL, cfg.ADMIN_BOOTSTRAP_PASSWORD, 'Administrador Sanithelp');
}

export async function createAdmin(cfg: Config, db: Db, email: string, password: string, fullName: string): Promise<'created'> {
  const policy = validatePasswordPolicy(password, 'admin', [email.split('@')[0] ?? '']);
  if (policy) throw new Error(policy);
  const crypto = createCrypto(cfg);
  await db.insert(users).values({
    role: 'admin',
    usernameBlind: crypto.blindIndex(email),
    usernameEnc: crypto.encrypt(email),
    fullNameEnc: crypto.encrypt(fullName),
    passwordHash: await hashPassword(password),
  });
  console.log(`Administrador creado: ${email}. Deberá activar la verificación en dos pasos en su primer ingreso.`);
  return 'created';
}
