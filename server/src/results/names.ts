import type { Crypto } from '../security/crypto.js';

/** Nombres y apellidos de una participación (los registros antiguos sin apellidos devuelven solo el nombre). */
export function nameParts(crypto: Crypto, p: { fullNameEnc: string; surnamesEnc: string | null }) {
  const names = crypto.decrypt(p.fullNameEnc);
  const surnames = p.surnamesEnc ? crypto.decrypt(p.surnamesEnc) : '';
  return { names, surnames, full: `${names} ${surnames}`.trim() };
}
