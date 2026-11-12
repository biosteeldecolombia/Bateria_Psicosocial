import { z } from 'zod';
import { ASSESSMENTS, ASSESSMENT_IDS } from './assessments';
import type { PermissionKey } from './permissions';

export * from './instrument';
export * from './assessments';
export * from './disc';
export * from './valanti';
export * from './pf16';
export * from './consent';
export * from './consent_ocupacional';
export * from './acrofobia';
export * from './claustrofobia';
export * from './ficha';
export * from './permissions';

export const ROLES = ['admin', 'psychologist', 'collaborator', 'company', 'assistant'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que deben usar MFA (TOTP). */
export const MFA_ROLES: readonly Role[] = ['admin', 'psychologist', 'assistant'];

export const MIN_PASSWORD_LENGTH: Record<Role, number> = {
  admin: 12,
  psychologist: 12,
  assistant: 12,
  company: 12,
  collaborator: 8,
};

/** Inactividad máxima antes de cerrar la sesión (minutos). */
export const IDLE_MINUTES: Record<Role, number> = {
  admin: 15,
  psychologist: 15,
  assistant: 15,
  company: 15,
  collaborator: 30,
};

export type AuthStatus = 'ready' | 'mfa_setup' | 'mfa_required';

export interface Preferences {
  theme: 'system' | 'light' | 'dark' | 'contrast';
  font: 'system' | 'atkinson' | 'lexend' | 'dyslexic' | 'serif';
  textScale: number; // 100..200
  lineHeight: number; // 1.2..2.4
  letterSpacing: number; // em, 0..0.2
  wordSpacing: number; // em, 0..0.5
  reduceMotion: boolean;
  focusReading: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  font: 'system',
  textScale: 100,
  lineHeight: 1.5,
  letterSpacing: 0,
  wordSpacing: 0,
  reduceMotion: false,
  focusReading: false,
};

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark', 'contrast']),
  font: z.enum(['system', 'atkinson', 'lexend', 'dyslexic', 'serif']),
  textScale: z.number().min(100).max(200),
  lineHeight: z.number().min(1.2).max(2.4),
  letterSpacing: z.number().min(0).max(0.2),
  wordSpacing: z.number().min(0).max(0.5),
  reduceMotion: z.boolean(),
  focusReading: z.boolean(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(500),
  newPassword: z.string().min(1).max(200),
});

export const mfaCodeSchema = z.object({
  code: z.string().trim().min(6).max(20),
  /** Método que se está activando: aplicación de autenticación o código por correo. */
  method: z.enum(['totp', 'email']).default('totp'),
  /** Recordar este equipo para no pedir el segundo paso durante unos días. */
  remember: z.boolean().optional(),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(200),
  nit: z.string().trim().max(30).optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  minGroupSize: z.number().int().min(2).max(100).default(5),
  /** Psicólogas responsables de la empresa (las que ven sus campañas y resultados). */
  psychologistIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  nit: z.string().trim().max(30).optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/).optional(),
  minGroupSize: z.number().int().min(2).max(100).optional(),
  active: z.boolean().optional(),
  psychologistIds: z.array(z.string().uuid()).max(50).optional(),
});

export const updateCampaignSchema = z
  .object({ name: z.string().trim().min(2).max(200).optional(), responsibleId: z.string().uuid().nullable().optional() })
  .refine((b) => b.name !== undefined || b.responsibleId !== undefined);

/** Cuentas de personas (admin, psicóloga, auxiliar administrativo, empresa). Los colaboradores no tienen cuenta: usan la credencial de la campaña. */
export const createUserSchema = z.object({
  role: z.enum(['admin', 'psychologist', 'assistant', 'company']),
  username: z.string().trim().min(3).max(200),
  fullName: z.string().trim().min(2).max(200),
  companyId: z.string().uuid().optional(),
  assignedCompanyIds: z.array(z.string().uuid()).optional(),
  /** Solo auxiliar administrativo: campañas sueltas a las que además tiene acceso. */
  assignedCampaignIds: z.array(z.string().uuid()).optional(),
  professionalRegistry: z.string().trim().max(100).optional(),
  professionalDocument: z.string().trim().max(40).optional(),
});

/** Edición de una cuenta de persona: todos los campos son opcionales. */
export const updateUserSchema = z.object({
  role: z.enum(['admin', 'psychologist', 'assistant', 'company']).optional(),
  username: z.string().trim().min(3).max(200).optional(),
  fullName: z.string().trim().min(2).max(200).optional(),
  companyId: z.string().uuid().optional(),
  assignedCompanyIds: z.array(z.string().uuid()).optional(),
  /** Solo auxiliar administrativo: campañas sueltas a las que además tiene acceso. */
  assignedCampaignIds: z.array(z.string().uuid()).optional(),
  professionalRegistry: z.string().trim().max(100).optional(),
  professionalDocument: z.string().trim().max(40).optional(),
});

export const createCampaignSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  /** Evaluaciones que se aplican en la campaña. Solo las disponibles; por defecto, la batería psicosocial. */
  assessments: z
    .array(z.enum(ASSESSMENT_IDS))
    .min(1)
    .max(ASSESSMENT_IDS.length)
    .refine((a) => a.every((id) => ASSESSMENTS[id].available), 'Evaluación no disponible')
    .default(['psychosocial']),
});

export const campaignStatusSchema = z.object({ status: z.enum(['open', 'closed']) });

/** Documento: se guardan solo letras y números (se quitan puntos, espacios y guiones). */
export const normalizeDocument = (v: string) => v.replace(/[\s.\-]/g, '').toUpperCase();

/** Correo opcional: vacío = no se envía nada. */
export const optionalEmailSchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.string().email().optional());

export const emailListSchema = z.object({ emails: z.array(z.string().trim().toLowerCase().email().max(200)).min(1).max(20) });

export const startParticipationSchema = z.object({
  /** Opcional: si la persona lo escribe, se le envía su código personal por correo (el correo no se guarda). */
  email: optionalEmailSchema,
  document: z.string().transform(normalizeDocument).pipe(z.string().regex(/^[A-Z0-9]{5,20}$/, 'Documento inválido')),
  names: z.string().trim().min(2).max(100),
  surnames: z.string().trim().min(2).max(100),
});

export const resumeParticipationSchema = z.object({
  document: z.string().transform(normalizeDocument).pipe(z.string().regex(/^[A-Z0-9]{5,20}$/, 'Documento inválido')),
  code: z.string().trim().min(6).max(20),
});

export interface MeResponse {
  id: string;
  role: Role;
  fullName: string;
  status: AuthStatus;
  csrfToken: string;
  expiresAt: string;
  idleMinutes: number;
  preferences: Preferences;
  /** Solo credencial de campaña: la persona que está respondiendo en esta sesión. */
  participant: { status: 'in_progress' | 'completed' | 'declined' | 'revoked' } | null;
  campaignName: string | null;
  /** Permisos efectivos del rol (la interfaz los usa para mostrar u ocultar opciones; el servidor siempre los vuelve a verificar). */
  permissions: PermissionKey[];
  mfaMethod: 'totp' | 'email' | null;
}
export * from './formatos';
export * from './pdfsettings';
