import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { loginSchema, mfaCodeSchema, preferencesSchema, MFA_ROLES } from '@sanithelp/shared';
import { campaigns, users, sessions } from '../db/schema.js';
import {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  audit,
  buildMe,
  checkTotp,
  clearFailures,
  createSession,
  generateRecoveryCodes,
  loadAuth,
  newTotp,
  otpQr,
  revokeUserSessions,
} from '../auth/service.js';
import { verifyPassword } from '../security/passwords.js';

const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos, o cuenta bloqueada temporalmente.';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto, dummyHash, cookieName, cfg } = app.appCtx;
  const isProd = cfg.NODE_ENV === 'production';
  // En pruebas todas las peticiones salen de la misma IP; el límite real se mantiene en desarrollo y producción.
  const sensitiveLimit = { max: cfg.NODE_ENV === 'test' ? 10_000 : 10, timeWindow: '1 minute' };

  const setCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(cookieName, token, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' });

  // Login: 10 intentos/min por (IP + usuario), y un techo por IP para evitar rociado de usuarios.
  const loginLimit = {
    max: cfg.NODE_ENV === 'test' ? 10_000 : 10,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (req: { ip: string; body?: unknown }) => {
      const u = (req.body as { username?: unknown } | undefined)?.username;
      return `login:${req.ip}:${typeof u === 'string' ? crypto.blindIndex(u).slice(0, 16) : ''}`;
    },
  };
  app.post('/login', { config: { rateLimit: loginLimit } }, async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { username, password } = body.data;

    const [user] = await db.select().from(users).where(eq(users.usernameBlind, crypto.blindIndex(username))).limit(1);
    // Se verifica siempre un hash para igualar tiempos y no revelar si el usuario existe.
    const passwordOk = await verifyPassword(user?.passwordHash ?? dummyHash, password);
    const locked = user?.lockedUntil && user.lockedUntil.getTime() > Date.now();

    let campaignClosed = false;
    if (user?.role === 'collaborator') {
      const [c] = user.campaignId ? await db.select({ status: campaigns.status }).from(campaigns).where(eq(campaigns.id, user.campaignId)).limit(1) : [];
      campaignClosed = c?.status !== 'open';
    }

    if (!user || !user.active || locked || !passwordOk || campaignClosed) {
      if (user && user.active && !locked) {
        const failed = user.failedAttempts + 1;
        const lock = failed >= MAX_FAILED_ATTEMPTS;
        await db
          .update(users)
          .set({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
          .where(eq(users.id, user.id));
        await audit(db, user.id, lock ? 'auth.locked' : 'auth.login_failed');
      }
      return reply.code(401).send({ error: GENERIC_LOGIN_ERROR });
    }

    await clearFailures(db, user.id);
    const { token } = await createSession(db, crypto, user); // sesión nueva en cada login (rotación)
    setCookie(reply, token);
    await audit(db, user.id, 'auth.login');
    const ctx = await loadAuth(db, crypto, token);
    return buildMe(ctx!, crypto);
  });

  app.get('/me', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    return buildMe(req.auth, crypto);
  });

  /** Mantiene viva la sesión (el cliente lo llama cuando el usuario elige "Seguir conectado"). */
  app.post('/keepalive', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    return buildMe(req.auth, crypto);
  });

  app.post('/logout', async (req, reply) => {
    if (req.auth) {
      await db.delete(sessions).where(eq(sessions.id, req.auth.session.id));
      await audit(db, req.auth.user.id, 'auth.logout');
    }
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  app.post('/logout-all', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    await revokeUserSessions(db, req.auth.user.id);
    await audit(db, req.auth.user.id, 'auth.logout_all');
    reply.clearCookie(cookieName, { path: '/' });
    return { ok: true };
  });

  // ---------- MFA ----------
  app.post('/mfa/setup', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const { user } = req.auth;
    if (!MFA_ROLES.includes(user.role)) return reply.code(403).send({ error: 'Sin permiso' });
    if (user.mfaEnabled) return reply.code(409).send({ error: 'La verificación en dos pasos ya está activa.' });
    const totp = newTotp(null, crypto.decrypt(user.usernameEnc));
    await db.update(users).set({ mfaSecretEnc: crypto.encrypt(totp.secret.base32) }).where(eq(users.id, user.id));
    return { secret: totp.secret.base32, otpauthUrl: totp.toString(), qrDataUrl: await otpQr(totp) };
  });

  app.post('/mfa/enable', { config: { rateLimit: sensitiveLimit } }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const body = mfaCodeSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { user, session } = req.auth;
    if (!MFA_ROLES.includes(user.role) || user.mfaEnabled || !user.mfaSecretEnc) {
      return reply.code(409).send({ error: 'No se puede activar la verificación en este momento.' });
    }
    const step = checkTotp(crypto.decrypt(user.mfaSecretEnc), crypto.decrypt(user.usernameEnc), body.data.code, user.mfaLastStep);
    if (step === null) return reply.code(400).send({ error: 'Código incorrecto. Intenta con el código actual de tu aplicación.' });
    const codes = generateRecoveryCodes();
    await db
      .update(users)
      .set({ mfaEnabled: true, mfaLastStep: step, recoveryCodeHashes: codes.map((c) => crypto.hashToken(c)) })
      .where(eq(users.id, user.id));
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, session.id));
    await audit(db, user.id, 'auth.mfa_enabled');
    return { recoveryCodes: codes };
  });

  app.post('/mfa/verify', { config: { rateLimit: sensitiveLimit } }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const body = mfaCodeSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { user, session } = req.auth;
    if (!user.mfaEnabled || !user.mfaSecretEnc) return reply.code(409).send({ error: 'La verificación en dos pasos no está activa.' });

    const code = body.data.code.trim();
    const step = checkTotp(crypto.decrypt(user.mfaSecretEnc), crypto.decrypt(user.usernameEnc), code, user.mfaLastStep);
    let ok = false;
    if (step !== null) {
      await db.update(users).set({ mfaLastStep: step }).where(eq(users.id, user.id));
      ok = true;
    } else {
      const h = crypto.hashToken(code.toUpperCase());
      if (user.recoveryCodeHashes.includes(h)) {
        await db.update(users).set({ recoveryCodeHashes: user.recoveryCodeHashes.filter((x) => x !== h) }).where(eq(users.id, user.id));
        await audit(db, user.id, 'auth.recovery_code_used');
        ok = true;
      }
    }
    if (!ok) {
      const failed = user.failedAttempts + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await db.update(users).set({ failedAttempts: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null }).where(eq(users.id, user.id));
      await audit(db, user.id, 'auth.mfa_failed');
      if (lock) {
        await revokeUserSessions(db, user.id);
        reply.clearCookie(cookieName, { path: '/' });
      }
      return reply.code(400).send({ error: 'Código incorrecto.' });
    }
    await db.update(users).set({ failedAttempts: 0 }).where(eq(users.id, user.id));
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, session.id));
    await audit(db, user.id, 'auth.mfa_verified');
    const ctx = await loadAuth(db, crypto, req.cookies[cookieName]);
    return buildMe(ctx!, crypto);
  });

  // ---------- Preferencias de accesibilidad ----------
  app.put('/preferences', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const body = preferencesSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    await db.update(users).set({ preferences: body.data }).where(eq(users.id, req.auth.user.id));
    return body.data;
  });
};
