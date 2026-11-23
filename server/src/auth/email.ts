import type { Crypto } from '../security/crypto.js';

/**
 * Correo de una cuenta: el guardado aparte o, si no hay, el usuario cuando ya es una dirección de correo.
 * Devuelve null si la cuenta no tiene ninguno (no se le pueden enviar mensajes).
 */
export function userEmail(crypto: Crypto, u: { usernameEnc: string; emailEnc: string | null }): string | null {
  if (u.emailEnc) return crypto.decrypt(u.emailEnc);
  const name = crypto.decrypt(u.usernameEnc);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name) ? name : null;
}
