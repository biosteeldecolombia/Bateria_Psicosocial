import type { Crypto } from '../security/crypto.js';

/** Nombres y apellidos de una participación (los registros antiguos sin apellidos devuelven solo el nombre). */
/** Nombres y apellidos se guardan y muestran en MAYÚSCULAS, con espacios simples (también normaliza los registros antiguos al leerlos). */
export function normalizeName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLocaleUpperCase('es');
}

export function nameParts(crypto: Crypto, p: { fullNameEnc: string; surnamesEnc: string | null }) {
  const names = normalizeName(crypto.decrypt(p.fullNameEnc));
  const surnames = p.surnamesEnc ? normalizeName(crypto.decrypt(p.surnamesEnc)) : '';
  return { names, surnames, full: `${names} ${surnames}`.trim() };
}
