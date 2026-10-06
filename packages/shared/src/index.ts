import { z } from 'zod';

export * from './instrument';
export * from './consent';
export * from './ficha';

export const ROLES = ['admin', 'psychologist', 'collaborator', 'company'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que deben usar MFA (TOTP). */
export const MFA_ROLES: readonly Role[] = ['admin', 'psychologist'];

export const MIN_PASSWORD_LENGTH: Record<Role, number> = {
  admin: 12,
  psychologist: 12,
  company: 12,
  collaborator: 8,
};

/** Inactividad máxima antes de cerrar la sesión (minutos). */
export const IDLE_MINUTES: Record<Role, number> = {
  admin: 15,
  psychologist: 15,
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

export const mfaCodeSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(200),
  nit: z.string().trim().max(30).optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/),
  minGroupSize: z.number().int().min(2).max(100).default(5),
});

/** Cuentas de personas (admin, psicóloga, empresa). Los colaboradores no tienen cuenta: usan la credencial de la campaña. */
export const createUserSchema = z.object({
  role: z.enum(['admin', 'psychologist', 'company']),
  username: z.string().trim().min(3).max(200),
  fullName: z.string().trim().min(2).max(200),
  companyId: z.string().uuid().optional(),
  assignedCompanyIds: z.array(z.string().uuid()).optional(),
  professionalRegistry: z.string().trim().max(100).optional(),
  professionalDocument: z.string().trim().max(40).optional(),
});

/** Edición de una cuenta de persona: todos los campos son opcionales. */
export const updateUserSchema = z.object({
  role: z.enum(['admin', 'psychologist', 'company']).optional(),
  username: z.string().trim().min(3).max(200).optional(),
  fullName: z.string().trim().min(2).max(200).optional(),
  companyId: z.string().uuid().optional(),
  assignedCompanyIds: z.array(z.string().uuid()).optional(),
  professionalRegistry: z.string().trim().max(100).optional(),
  professionalDocument: z.string().trim().max(40).optional(),
});

export const createCampaignSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
});

export const campaignStatusSchema = z.object({ status: z.enum(['open', 'closed']) });

/** Documento: se guardan solo letras y números (se quitan puntos, espacios y guiones). */
export const normalizeDocument = (v: string) => v.replace(/[\s.\-]/g, '').toUpperCase();

export const startParticipationSchema = z.object({
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
}
