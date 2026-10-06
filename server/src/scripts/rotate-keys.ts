import type { Pool } from 'pg';
import type { Crypto } from '../security/crypto.js';

/** Columnas cifradas por tabla. Si se agrega una columna `*_enc`, debe agregarse aquí (lo verifica una prueba). */
export const ENCRYPTED_COLUMNS: Record<string, string[]> = {
  users: ['username_enc', 'full_name_enc', 'professional_registry_enc', 'professional_document_enc', 'mfa_secret_enc'],
  participants: ['document_enc', 'full_name_enc', 'surnames_enc'],
  ficha_answers: ['data_enc'],
  questionnaire_answers: ['data_enc'],
};

/**
 * Re-cifra con la clave vigente todo dato guardado con una versión anterior.
 * Corre en una sola transacción: o se re-cifra todo o no cambia nada. Es idempotente.
 * Antes: poner la clave nueva en DATA_ENCRYPTION_KEY (versión +1) y la anterior en DATA_ENCRYPTION_KEYS_OLD.
 */
export async function rotateEncryptionKeys(pool: Pool, crypto: Crypto, currentVersion: number): Promise<{ scanned: number; rotated: number }> {
  const client = await pool.connect();
  let scanned = 0;
  let rotated = 0;
  try {
    await client.query('BEGIN');
    for (const [table, cols] of Object.entries(ENCRYPTED_COLUMNS)) {
      for (const col of cols) {
        const { rows } = await client.query<{ ctid: string; v: string }>(`SELECT ctid::text AS ctid, ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL`);
        for (const r of rows) {
          scanned++;
          if (r.v.startsWith(`v${currentVersion}:`)) continue;
          await client.query(`UPDATE ${table} SET ${col} = $1 WHERE ctid = $2::tid`, [crypto.encrypt(crypto.decrypt(r.v)), r.ctid]);
          rotated++;
        }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { scanned, rotated };
}

if (process.argv[1]?.split('\\').join('/').endsWith('scripts/rotate-keys.ts')) {
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('../db/client.js');
  const { createCrypto } = await import('../security/crypto.js');
  const cfg = loadConfig();
  const { pool } = createDb(cfg);
  const res = await rotateEncryptionKeys(pool, createCrypto(cfg), cfg.DATA_ENCRYPTION_KEY_VERSION);
  await pool.end();
  console.log(`Rotación completada: ${res.rotated} de ${res.scanned} datos re-cifrados con la clave v${cfg.DATA_ENCRYPTION_KEY_VERSION}.`);
}
