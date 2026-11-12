import { z } from 'zod';

const b64Key = (name: string) =>
  z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, `${name} debe ser una clave de 32 bytes en base64 (openssl rand -base64 32)`);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  /** Opcional: conexión del dueño de las tablas, solo para migrar. Permite que la app use un rol sin privilegios de esquema (ops/db-roles.sql). */
  MIGRATION_DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
  DATA_ENCRYPTION_KEY: b64Key('DATA_ENCRYPTION_KEY'),
  DATA_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  /** Claves anteriores para poder descifrar tras una rotación: "1:base64,2:base64" */
  DATA_ENCRYPTION_KEYS_OLD: z.string().default(''),
  BLIND_INDEX_KEY: b64Key('BLIND_INDEX_KEY'),
  APP_BASE_URL: z.string().url('APP_BASE_URL debe ser una URL completa, p. ej. https://bateria.sanithelp.com'),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
  CLIENT_DIST: z.string().default('../client/dist'),
  // ----- Correo saliente (Outlook / Microsoft 365). Ver docs/CORREO_OUTLOOK.md -----
  /** 'graph' (recomendado: Microsoft Graph, app registrada en Entra ID), 'smtp' (SMTP AUTH de Outlook) o 'none'. */
  MAIL_PROVIDER: z.enum(['none', 'graph', 'smtp']).default('none'),
  /** Buzón desde el que salen los correos (p. ej. evaluaciones@sanithelp.com). */
  MAIL_FROM: z.string().email().optional(),
  MAIL_FROM_NAME: z.string().default('Sanithelp'),
  MS_TENANT_ID: z.string().optional(),
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  SMTP_HOST: z.string().default('smtp.office365.com'),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida. Revisa las variables de entorno:\n${lines.join('\n')}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && !c.APP_BASE_URL.startsWith('https://')) {
    throw new Error('En producción APP_BASE_URL debe usar https://');
  }
  if (c.MAIL_PROVIDER !== 'none' && !c.MAIL_FROM) throw new Error('MAIL_FROM es obligatorio cuando MAIL_PROVIDER no es "none".');
  if (c.MAIL_PROVIDER === 'graph' && !(c.MS_TENANT_ID && c.MS_CLIENT_ID && c.MS_CLIENT_SECRET)) throw new Error('MAIL_PROVIDER=graph exige MS_TENANT_ID, MS_CLIENT_ID y MS_CLIENT_SECRET.');
  if (c.MAIL_PROVIDER === 'smtp' && !(c.SMTP_USER && c.SMTP_PASSWORD)) throw new Error('MAIL_PROVIDER=smtp exige SMTP_USER y SMTP_PASSWORD.');
  return c;
}
