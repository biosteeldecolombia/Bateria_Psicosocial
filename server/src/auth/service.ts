import { randomBytes } from 'node:crypto';
import { and, eq, lt } from 'drizzle-orm';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { IDLE_MINUTES, MFA_ROLES, DEFAULT_PREFERENCES, type AuthStatus, type MeResponse, type Preferences, type Role } from '@sanithelp/shared';
import type { Db } from '../db/client.js';
import { auditLog, campaigns, participants, sessions, users } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
  status: AuthStatus;
  campaignName: string | null;
  participant: { id: string; status: 'in_progress' | 'completed' | 'declined' | 'revoked' } | null;
}

export const ABSOLUTE_SESSION_HOURS = 12;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function computeStatus(user: UserRow, session: SessionRow): AuthStatus {
  if (MFA_ROLES.includes(user.role)) {
    if (!user.mfaEnabled) return 'mfa_setup';
    if (!session.mfaVerified) return 'mfa_required';
  }
  return 'ready';
}

export async function audit(db: Db, actorId: string | null, action: string, target?: { type: string; id: string }, meta: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({ actorId, action, targetType: target?.type, targetId: target?.id, meta });
}

export async function createSession(db: Db, crypto: Crypto, user: UserRow, mfaVerified = false) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + ABSOLUTE_SESSION_HOURS * 3600_000);
  await db.insert(sessions).values({ id: crypto.hashToken(token), userId: user.id, csrfToken: csrf, mfaVerified, expiresAt });
  return { token, expiresAt };
}

export async function loadAuth(db: Db, crypto: Crypto, token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const id = crypto.hashToken(token);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const now = Date.now();
  const idleMs = (user ? IDLE_MINUTES[user.role] : 0) * 60_000;
  if (!user || !user.active || session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + idleMs <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // La credencial de una campaña deja de servir cuando la campaña se cierra.
  let campaignName: string | null = null;
  if (user.role === 'collaborator') {
    const [c] = user.campaignId ? await db.select().from(campaigns).where(eq(campaigns.id, user.campaignId)).limit(1) : [];
    if (!c || c.status !== 'open') {
      await db.delete(sessions).where(eq(sessions.id, id));
      return null;
    }
    campaignName = c.name;
  }
  let participant: AuthContext['participant'] = null;
  if (session.participantId) {
    const [p] = await db.select({ id: participants.id, status: participants.status }).from(participants).where(eq(participants.id, session.participantId)).limit(1);
    participant = p ?? null;
  }
  // Ventana deslizante; se escribe como máximo cada 20 s para no saturar la BD.
  if (now - session.lastSeenAt.getTime() > 20_000) {
    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, id));
    session.lastSeenAt = new Date(now);
  }
  return { user, session, status: computeStatus(user, session), campaignName, participant };
}

export async function revokeUserSessions(db: Db, userId: string, exceptId?: string) {
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of all) if (s.id !== exceptId) await db.delete(sessions).where(eq(sessions.id, s.id));
}

export async function purgeExpiredSessions(db: Db) {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export function toPreferences(raw: Record<string, unknown>): Preferences {
  return { ...DEFAULT_PREFERENCES, ...(raw as Partial<Preferences>) };
}

export function buildMe(ctx: AuthContext, crypto: Crypto): MeResponse {
  const { user, session, status, campaignName, participant } = ctx;
  const idleMs = IDLE_MINUTES[user.role] * 60_000;
  const expires = Math.min(session.expiresAt.getTime(), session.lastSeenAt.getTime() + idleMs);
  return {
    id: user.id,
    role: user.role as Role,
    fullName: crypto.decrypt(user.fullNameEnc),
    status,
    csrfToken: session.csrfToken,
    expiresAt: new Date(expires).toISOString(),
    idleMinutes: IDLE_MINUTES[user.role],
    preferences: toPreferences(user.preferences),
    participant: participant ? { status: participant.status } : null,
    campaignName,
  };
}

// ---------- TOTP ----------
export function newTotp(secretBase32: string | null, label: string) {
  return new OTPAuth.TOTP({
    issuer: 'Sanithelp',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secretBase32 ? OTPAuth.Secret.fromBase32(secretBase32) : new OTPAuth.Secret({ size: 20 }),
  });
}

/** Devuelve el paso TOTP válido o null. Evita reutilizar un código ya usado. */
export function checkTotp(secretBase32: string, label: string, code: string, lastStep: number | null): number | null {
  const totp = newTotp(secretBase32, label);
  const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
  if (delta === null) return null;
  const step = Math.floor(Date.now() / 30_000) + delta;
  if (lastStep !== null && step <= lastStep) return null;
  return step;
}

export async function otpQr(totp: OTPAuth.TOTP) {
  return QRCode.toDataURL(totp.toString(), { margin: 1, width: 220 });
}

export function generateRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString('hex').toUpperCase().replace(/(.{5})(.{5})/, '$1-$2'));
}

export async function clearFailures(db: Db, userId: string) {
  await db.update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export { and, eq };
