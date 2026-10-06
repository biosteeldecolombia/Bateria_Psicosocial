import { and, eq, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { Crypto } from '../security/crypto.js';
import { audit } from '../auth/service.js';
import { participants } from '../db/schema.js';
import { eraseParticipant } from '../results/erase.js';

/**
 * Política de retención: suprime los datos de las participaciones creadas hace más de `months` meses.
 * El plazo lo define Sanithelp con su asesoría legal (no hay valor por defecto a propósito).
 * Con `dryRun` solo cuenta, no borra.
 */
export async function purgeExpired(db: Db, crypto: Crypto, months: number, dryRun: boolean): Promise<number> {
  const limit = new Date();
  limit.setMonth(limit.getMonth() - months);
  const rows = await db.select({ id: participants.id }).from(participants).where(and(lt(participants.createdAt, limit), ne(participants.status, 'revoked')));
  if (!dryRun) {
    for (const r of rows) {
      await eraseParticipant(db, crypto, r.id, null);
      await audit(db, null, 'participant.purged_retention', { type: 'participant', id: r.id }, { months });
    }
  }
  return rows.length;
}

if (process.argv[1]?.split(String.fromCharCode(92)).join('/').endsWith('scripts/purge-expired.ts')) {
  const months = Number(process.argv[2]);
  const dryRun = process.argv[3] !== '--confirmar';
  if (!Number.isInteger(months) || months < 1) {
    console.error('Uso: npm run purge-expired -w server -- <meses> [--confirmar]\nSin --confirmar solo cuenta cuántas participaciones se suprimirían.');
    process.exit(1);
  }
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('../db/client.js');
  const { createCrypto } = await import('../security/crypto.js');
  const cfg = loadConfig();
  const { db, pool } = createDb(cfg);
  const n = await purgeExpired(db, createCrypto(cfg), months, dryRun);
  await pool.end();
  console.log(dryRun ? `${n} participaciones superan ${months} meses (simulación: no se borró nada).` : `${n} participaciones suprimidas.`);
}
