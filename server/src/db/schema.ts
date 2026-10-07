import { sql } from 'drizzle-orm';
import { bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Roles:
 *  - admin / psychologist / company: personas con cuenta propia.
 *  - collaborator: credencial COMPARTIDA de una campaña (empresa + ronda). Los colaboradores no tienen usuario propio;
 *    se identifican dentro del formulario (documento y nombre) y retoman con un código personal.
 */
export const roleEnum = pgEnum('role', ['admin', 'psychologist', 'collaborator', 'company']);
export const formEnum = pgEnum('form_type', ['A', 'B']);
export const campaignStatusEnum = pgEnum('campaign_status', ['open', 'closed']);
export const participantStatusEnum = pgEnum('participant_status', ['in_progress', 'completed', 'declined', 'revoked']);

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nit: text('nit'),
  code: text('code').notNull().unique(),
  minGroupSize: integer('min_group_size').notNull().default(5),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  name: text('name').notNull(),
  status: campaignStatusEnum('status').notNull().default('open'),
  consentVersion: text('consent_version').notNull().default('FP-PS-CI v01'),
  /** Evaluaciones que se aplican en esta campaña (ver catálogo en @sanithelp/shared). */
  assessments: jsonb('assessments').$type<string[]>().notNull().default(sql`'["psychosocial"]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    role: roleEnum('role').notNull(),
    // El usuario se guarda cifrado; la búsqueda usa el índice ciego.
    usernameBlind: text('username_blind').notNull().unique(),
    usernameEnc: text('username_enc').notNull(),
    fullNameEnc: text('full_name_enc').notNull(),
    professionalRegistryEnc: text('professional_registry_enc'),
    professionalDocumentEnc: text('professional_document_enc'),
    companyId: uuid('company_id').references(() => companies.id),
    /** Solo para la credencial compartida (role = collaborator): la campaña a la que da acceso. */
    campaignId: uuid('campaign_id').references(() => campaigns.id),
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaLastStep: integer('mfa_last_step'),
    recoveryCodeHashes: jsonb('recovery_code_hashes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (t) => [index('users_company_idx').on(t.companyId), index('users_campaign_idx').on(t.campaignId)],
);

/** Empresas asignadas a cada psicóloga. */
export const psychologistCompanies = pgTable(
  'psychologist_companies',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

/** Una persona que responde dentro de una campaña. Se crea cuando se identifica en el formulario. */
export const participants = pgTable(
  'participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
    companyId: uuid('company_id').notNull().references(() => companies.id),
    documentBlind: text('document_blind').notNull(),
    documentEnc: text('document_enc').notNull(),
    /** Nombres (el campo se llama «full_name» por historia: antes guardaba el nombre completo). */
    fullNameEnc: text('full_name_enc').notNull(),
    surnamesEnc: text('surnames_enc'),
    /** Hash del código personal con el que la persona retoma su avance. */
    resumeCodeHash: text('resume_code_hash').notNull(),
    resumeFailedAttempts: integer('resume_failed_attempts').notNull().default(0),
    resumeLockedUntil: timestamp('resume_locked_until', { withTimezone: true }),
    /** Se define con la pregunta 14 de la ficha (Fase 2); la psicóloga ve si hay discrepancia. */
    form: formEnum('form'),
    status: participantStatusEnum('status').notNull().default('in_progress'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('participants_campaign_doc_uq').on(t.campaignId, t.documentBlind)],
);

export const consentDecisionEnum = pgEnum('consent_decision', ['authorized', 'declined']);

/** Decisión de consentimiento de cada participante, ligada a la versión y al hash del texto mostrado. */
export const consents = pgTable('consents', {
  participantId: uuid('participant_id').primaryKey().references(() => participants.id),
  decision: consentDecisionEnum('decision').notNull(),
  version: text('version').notNull(),
  textHash: text('text_hash').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by'),
});

/** Ficha de datos generales (JSON cifrado). */
export const fichaAnswers = pgTable('ficha_answers', {
  participantId: uuid('participant_id').primaryKey().references(() => participants.id),
  dataEnc: text('data_enc').notNull(),
  complete: boolean('complete').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Respuestas de un cuestionario (JSON cifrado: índices de opción por ítem + respuestas Sí/No de las compuertas). */
export const questionnaireAnswers = pgTable(
  'questionnaire_answers',
  {
    participantId: uuid('participant_id').notNull().references(() => participants.id),
    instrument: text('instrument').notNull(),
    dataEnc: text('data_enc').notNull(),
    complete: boolean('complete').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.instrument] })],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // hash del token
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Persona que está respondiendo en esta sesión (solo credencial de campaña). */
    participantId: uuid('participant_id').references(() => participants.id, { onDelete: 'set null' }),
    csrfToken: text('csrf_token').notNull(),
    mfaVerified: boolean('mfa_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Auditoría solo-inserción. Sin datos personales ni respuestas en `meta`. */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
});

export const exportStatusEnum = pgEnum('export_status', ['queued', 'running', 'done', 'failed', 'expired']);

/** Trabajos de exportación masiva de PDF. El archivo es temporal y de un solo uso. */
export const exportJobs = pgTable('export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  requestedBy: uuid('requested_by').notNull().references(() => users.id),
  kind: text('kind').notNull(), // 'zip' | 'combined'
  status: exportStatusEnum('status').notNull().default('queued'),
  total: integer('total').notNull().default(0),
  done: integer('done').notNull().default(0),
  filePath: text('file_path'),
  downloadTokenHash: text('download_token_hash'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
});
