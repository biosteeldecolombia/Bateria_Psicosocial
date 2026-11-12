import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { changePasswordSchema, loginSchema, mfaCodeSchema, preferencesSchema, MFA_ROLES } from '@sanithelp/shared';
import { randomBytes, randomInt } from 'node:crypto';
import { campaigns, users, sessions, trustedDevices } from '../db/schema.js';
import { otpEmail } from '../mail/templates.js';
import { DEFAULT_SECURITY, getSetting, type SecuritySettings } from '../settings.js';
import {
  LOCK_MINUTES,
  lockoutAfter,
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
  type SessionRow,
} from '../auth/service.js';
import { hashPassword, validatePasswordPolicy, verifyPassword } from '../security/passwords.js';

const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos, o cuenta bloqueada temporalmente.';

export const authRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto, dummyHash, cookieName, cfg, mailer } = app.appCtx;
  const deviceCookie = cfg.NODE_ENV === 'production' ? '__Host-td' : 'td';
  const OTP_MINUTES = 10;
  const OTP_MAX_ATTEMPTS = 5;
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
      const ip = req.ip;
      if (user && user.active && !locked && !campaignClosed) {
        const failed = user.failedAttempts + 1;
        const { waitMs, resetCounter } = lockoutAfter(user.role, failed);
        await db
          .update(users)
          .set({ failedAttempts: resetCounter ? 0 : failed, lockedUntil: waitMs ? new Date(Date.now() + waitMs) : null })
          .where(eq(users.id, user.id));
        await audit(db, user.id, waitMs >= LOCK_MINUTES * 60_000 ? 'auth.locked' : 'auth.login_failed', undefined, { ip, attempts: failed, waitSeconds: Math.round(waitMs / 1000) });
      } else if (user && locked) {
        await audit(db, user.id, 'auth.login_blocked', undefined, { ip }); // intento mientras la cuenta espera
      } else if (!user) {
        // Usuario inexistente: no se guarda lo escrito (podría ser una contraseña); solo una huella para agrupar intentos repetidos.
        await audit(db, null, 'auth.login_failed_unknown', undefined, { ip, ref: crypto.blindIndex(username).slice(0, 12) });
      } else if (!user.active) {
        await audit(db, user.id, 'auth.login_inactive', undefined, { ip });
      }
      return reply.code(401).send({ error: GENERIC_LOGIN_ERROR });
    }

    await clearFailures(db, user.id);
    // Si este equipo ya pasó la verificación en dos pasos hace poco, no se vuelve a pedir.
    let trusted = false;
    const deviceToken = req.cookies[deviceCookie];
    if (deviceToken && MFA_ROLES.includes(user.role) && user.mfaEnabled) {
      const [d] = await db.select().from(trustedDevices).where(eq(trustedDevices.id, crypto.hashToken(deviceToken))).limit(1);
      trusted = !!d && d.userId === user.id && d.expiresAt.getTime() > Date.now();
    }
    const { token } = await createSession(db, crypto, user, trusted); // sesión nueva en cada login (rotación)
    if (trusted) await audit(db, user.id, 'auth.mfa_trusted_device', undefined, { ip: req.ip });
    setCookie(reply, token);
    await audit(db, user.id, 'auth.login', undefined, { ip: req.ip });
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
    reply.clearCookie(deviceCookie, { path: '/' });
    return { ok: true };
  });

  /**
   * Cambio de contraseña por la propia persona (administrador, psicóloga, auxiliar, empresa). Pide la contraseña actual,
   * cierra las demás sesiones y borra la contraseña temporal que el administrador podía ver con la llave.
   */
  app.post('/change-password', { config: { rateLimit: sensitiveLimit } }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    if (req.auth.status !== 'ready') return reply.code(403).send({ error: 'Completa los pasos de seguridad pendientes', status: req.auth.status });
    const { user, session } = req.auth;
    if (user.role === 'collaborator') return reply.code(403).send({ error: 'Sin permiso' });
    const body = changePasswordSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    if (!(await verifyPassword(user.passwordHash, body.data.currentPassword))) {
      await audit(db, user.id, 'auth.password_change_failed', undefined, { ip: req.ip });
      return reply.code(403).send({ error: 'La contraseña actual no es correcta.' });
    }
    const username = crypto.decrypt(user.usernameEnc);
    const policy = validatePasswordPolicy(body.data.newPassword, user.role, [username.split('@')[0] ?? '', crypto.decrypt(user.fullNameEnc)]);
    if (policy) return reply.code(400).send({ error: policy });
    if (body.data.newPassword === body.data.currentPassword) return reply.code(400).send({ error: 'La contraseña nueva debe ser distinta de la actual.' });
    await db.update(users).set({ passwordHash: await hashPassword(body.data.newPassword), initialPasswordEnc: null, passwordChangedAt: new Date() }).where(eq(users.id, user.id));
    await revokeUserSessions(db, user.id, session.id);
    await db.delete(trustedDevices).where(eq(trustedDevices.userId, user.id));
    await audit(db, user.id, 'auth.password_changed', undefined, { ip: req.ip });
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

  /** Métodos de verificación disponibles para quien está activando o verificando. */
  app.get('/mfa/methods', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const sec = await getSetting<SecuritySettings>(db, 'security', DEFAULT_SECURITY);
    return { totp: true, email: mailer.enabled, current: req.auth.user.mfaMethod ?? (req.auth.user.mfaEnabled ? 'totp' : null), trustedDeviceDays: sec.trustedDeviceDays };
  });

  /** Envía un código de un solo uso al correo de la cuenta (para activar el método «correo» o como alternativa a la aplicación). */
  app.post('/mfa/email/send', { config: { rateLimit: sensitiveLimit } }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const { user, session } = req.auth;
    if (!MFA_ROLES.includes(user.role)) return reply.code(403).send({ error: 'Sin permiso' });
    if (!mailer.enabled) return reply.code(409).send({ error: 'El correo no está configurado. Usa la aplicación de autenticación o pídele al administrador que lo active.' });
    if (req.auth.status === 'ready' && user.mfaEnabled) return reply.code(409).send({ error: 'Ya verificaste esta sesión.' });
    // Un reenvío cada 30 s como máximo
    if (session.otpExpiresAt && session.otpExpiresAt.getTime() - OTP_MINUTES * 60_000 + 30_000 > Date.now()) return reply.code(429).send({ error: 'Espera unos segundos antes de pedir otro código.' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await db.update(sessions).set({ otpHash: crypto.hashToken(`otp:${session.id}:${code}`), otpExpiresAt: new Date(Date.now() + OTP_MINUTES * 60_000), otpAttempts: 0 }).where(eq(sessions.id, session.id));
    try {
      await mailer.send(otpEmail({ to: crypto.decrypt(user.usernameEnc), code, minutes: OTP_MINUTES }));
    } catch (e) {
      req.log.error({ err: (e as Error).message }, 'No se pudo enviar el código de verificación');
      return reply.code(502).send({ error: 'No se pudo enviar el correo. Intenta con la aplicación de autenticación.' });
    }
    await audit(db, user.id, 'auth.mfa_email_sent', undefined, { ip: req.ip });
    return { ok: true, minutes: OTP_MINUTES };
  });

  /** Comprueba el código de correo de esta sesión. Devuelve true si es correcto (y lo consume). */
  async function checkEmailOtp(session: SessionRow, code: string): Promise<boolean> {
    if (!session.otpHash || !session.otpExpiresAt || session.otpExpiresAt.getTime() < Date.now() || session.otpAttempts >= OTP_MAX_ATTEMPTS) return false;
    const ok = session.otpHash === crypto.hashToken(`otp:${session.id}:${code.replace(/\s/g, '')}`);
    if (ok) await db.update(sessions).set({ otpHash: null, otpExpiresAt: null, otpAttempts: 0 }).where(eq(sessions.id, session.id));
    else await db.update(sessions).set({ otpAttempts: session.otpAttempts + 1 }).where(eq(sessions.id, session.id));
    return ok;
  }

  /** Recuerda este equipo unos días (no vuelve a pedir el segundo paso en él). */
  async function rememberDevice(reply: FastifyReply, userId: string, label: string) {
    const sec = await getSetting<SecuritySettings>(db, 'security', DEFAULT_SECURITY);
    if (sec.trustedDeviceDays <= 0) return;
    const token = randomBytes(32).toString('base64url');
    await db.insert(trustedDevices).values({ id: crypto.hashToken(token), userId, label: label.slice(0, 80), expiresAt: new Date(Date.now() + sec.trustedDeviceDays * 86_400_000) });
    reply.setCookie(deviceCookie, token, { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/', maxAge: sec.trustedDeviceDays * 86_400 });
  }

  app.post('/mfa/enable', { config: { rateLimit: sensitiveLimit } }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const body = mfaCodeSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { user, session } = req.auth;
    const method = body.data.method;
    if (!MFA_ROLES.includes(user.role) || user.mfaEnabled || (method === 'totp' && !user.mfaSecretEnc) || (method === 'email' && !mailer.enabled)) {
      return reply.code(409).send({ error: 'No se puede activar la verificación en este momento.' });
    }
    let step: number | null = null;
    if (method === 'totp') {
      step = checkTotp(crypto.decrypt(user.mfaSecretEnc!), crypto.decrypt(user.usernameEnc), body.data.code, user.mfaLastStep);
      if (step === null) return reply.code(400).send({ error: 'Código incorrecto. Intenta con el código actual de tu aplicación.' });
    } else if (!(await checkEmailOtp(session, body.data.code))) {
      return reply.code(400).send({ error: 'Código incorrecto o vencido. Pide uno nuevo.' });
    }
    const codes = generateRecoveryCodes();
    await db
      .update(users)
      .set({ mfaEnabled: true, mfaMethod: method, ...(step !== null ? { mfaLastStep: step } : {}), recoveryCodeHashes: codes.map((c) => crypto.hashToken(c)) })
      .where(eq(users.id, user.id));
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, session.id));
    if (body.data.remember) await rememberDevice(reply, user.id, String(req.headers['user-agent'] ?? ''));
    await audit(db, user.id, 'auth.mfa_enabled', undefined, { method });
    return { recoveryCodes: codes };
  });

  app.post('/mfa/verify', { config: { rateLimit: sensitiveLimit } }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'No autenticado' });
    const body = mfaCodeSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const { user, session } = req.auth;
    if (!user.mfaEnabled) return reply.code(409).send({ error: 'La verificación en dos pasos no está activa.' });
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await audit(db, user.id, 'auth.mfa_blocked', undefined, { ip: req.ip });
      return reply.code(429).send({ error: `Demasiados intentos. Espera ${Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000))} segundos para volver a intentarlo.` });
    }

    const code = body.data.code.trim();
    let ok = false;
    // 1) aplicación de autenticación (si la cuenta tiene una), 2) código enviado por correo, 3) código de recuperación
    if (user.mfaSecretEnc) {
      const step = checkTotp(crypto.decrypt(user.mfaSecretEnc), crypto.decrypt(user.usernameEnc), code, user.mfaLastStep);
      if (step !== null) {
        await db.update(users).set({ mfaLastStep: step }).where(eq(users.id, user.id));
        ok = true;
      }
    }
    if (!ok && /^\d{6}$/.test(code.replace(/\s/g, '')) && (await checkEmailOtp(session, code))) ok = true;
    if (!ok) {
      const h = crypto.hashToken(code.toUpperCase());
      if (user.recoveryCodeHashes.includes(h)) {
        await db.update(users).set({ recoveryCodeHashes: user.recoveryCodeHashes.filter((x) => x !== h) }).where(eq(users.id, user.id));
        await audit(db, user.id, 'auth.recovery_code_used', undefined, { ip: req.ip });
        ok = true;
      }
    }
    if (!ok) {
      const failed = user.failedAttempts + 1;
      const { waitMs, resetCounter } = lockoutAfter(user.role, failed);
      const lock = waitMs >= LOCK_MINUTES * 60_000;
      await db.update(users).set({ failedAttempts: resetCounter ? 0 : failed, lockedUntil: waitMs ? new Date(Date.now() + waitMs) : null }).where(eq(users.id, user.id));
      await audit(db, user.id, lock ? 'auth.locked' : 'auth.mfa_failed', undefined, { ip: req.ip, attempts: failed, waitSeconds: Math.round(waitMs / 1000) });
      if (lock) {
        await revokeUserSessions(db, user.id);
        reply.clearCookie(cookieName, { path: '/' });
      }
      return reply.code(400).send({ error: 'Código incorrecto.' });
    }
    await db.update(users).set({ failedAttempts: 0 }).where(eq(users.id, user.id));
    await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, session.id));
    if (body.data.remember) await rememberDevice(reply, user.id, String(req.headers['user-agent'] ?? ''));
    await audit(db, user.id, 'auth.mfa_verified', undefined, { ip: req.ip, remembered: !!body.data.remember });
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
