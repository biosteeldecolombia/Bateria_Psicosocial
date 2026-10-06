import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { MIN_PASSWORD_LENGTH, type Role } from '@sanithelp/shared';

// argon2id (algorithm: 2) con parámetros mínimos recomendados por OWASP: m=19 MiB, t=2, p=1
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);
export const verifyPassword = (hashed: string, pw: string) => verify(hashed, pw).catch(() => false);

const COMMON = [
  'password', 'contrasena', 'contraseña', '12345678', '123456789', '1234567890', 'qwertyuiop', 'abcd1234',
  'colombia', 'barranquilla', 'sanithelp', 'biosteel', 'admin1234', 'bienvenido', 'iloveyou', 'qwerty123', 'passw0rd',
];

export function validatePasswordPolicy(pw: string, role: Role, context: string[] = []): string | null {
  const min = MIN_PASSWORD_LENGTH[role];
  if (pw.length < min) return `La contraseña debe tener al menos ${min} caracteres.`;
  const lower = pw.toLowerCase();
  const compact = lower.replace(/[^a-z0-9ñ]/g, '');
  if (COMMON.some((c) => compact === c || (compact.includes(c) && compact.length - c.length <= 4))) {
    return 'La contraseña es demasiado común. Elige otra.';
  }
  if (/^(.)\1+$/.test(pw)) return 'La contraseña no puede repetir un solo carácter.';
  if (context.some((c) => c && c.length >= 4 && lower.includes(c.toLowerCase()))) {
    return 'La contraseña no puede contener tu usuario o tu nombre.';
  }
  return null;
}

// Sin caracteres ambiguos (0/O, 1/l/I) para facilitar la entrega impresa.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function generateTempPassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
