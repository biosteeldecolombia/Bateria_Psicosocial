import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Config } from '../config.js';

export interface Crypto {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
  /** HMAC determinista para búsquedas por igualdad sin guardar texto plano. */
  blindIndex(value: string): string;
  /** Hash no reversible de tokens de sesión y códigos de recuperación. */
  hashToken(token: string): string;
}

export function normalizeForIndex(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

type CryptoCfg = Pick<
  Config,
  'DATA_ENCRYPTION_KEY' | 'DATA_ENCRYPTION_KEY_VERSION' | 'DATA_ENCRYPTION_KEYS_OLD' | 'BLIND_INDEX_KEY' | 'SESSION_SECRET'
>;

export function createCrypto(cfg: CryptoCfg): Crypto {
  const keys = new Map<number, Buffer>();
  keys.set(cfg.DATA_ENCRYPTION_KEY_VERSION, Buffer.from(cfg.DATA_ENCRYPTION_KEY, 'base64'));
  for (const part of cfg.DATA_ENCRYPTION_KEYS_OLD.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [v, k] = part.split(':');
    if (v && k) keys.set(Number(v), Buffer.from(k, 'base64'));
  }
  const currentVersion = cfg.DATA_ENCRYPTION_KEY_VERSION;
  const blindKey = Buffer.from(cfg.BLIND_INDEX_KEY, 'base64');

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keys.get(currentVersion)!, iv);
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v${currentVersion}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
    },
    decrypt(payload) {
      const [ver, iv, tag, ct] = payload.split(':');
      const key = keys.get(Number(ver?.slice(1)));
      if (!key || !iv || !tag || !ct) throw new Error('Dato cifrado con formato o versión de clave desconocidos');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
    },
    blindIndex(value) {
      return createHmac('sha256', blindKey).update(normalizeForIndex(value)).digest('hex');
    },
    hashToken(token) {
      return createHmac('sha256', cfg.SESSION_SECRET).update(token).digest('hex');
    },
  };
}
