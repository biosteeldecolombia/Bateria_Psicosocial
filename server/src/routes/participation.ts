import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { resumeParticipationSchema, startParticipationSchema } from '@sanithelp/shared';
import { participants, sessions } from '../db/schema.js';
import { audit, buildMe, loadAuth } from '../auth/service.js';

const MAX_RESUME_ATTEMPTS = 5;
const RESUME_LOCK_MINUTES = 15;
// Sin caracteres ambiguos (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newResumeCode(): string {
  const raw = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Identificación de cada persona dentro de la campaña. Todas comparten la credencial de la empresa;
 * lo que las separa es el documento y un código personal que solo ellas conocen.
 */
export const participationRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto, cookieName, cfg } = app.appCtx;
  const only = app.requireReady('collaborator');
  const limit = {
    max: cfg.NODE_ENV === 'test' ? 10_000 : 10,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (req: { ip: string; cookies?: Record<string, string | undefined> }) => `part:${req.ip}:${(req.cookies?.[cookieName] ?? '').slice(0, 12)}`,
  };

  const bind = (sessionId: string, participantId: string | null) => db.update(sessions).set({ participantId }).where(eq(sessions.id, sessionId));
  const meOf = async (token: string | undefined) => buildMe((await loadAuth(db, crypto, token))!, crypto);

  /** Empezar: crea la participación y entrega el código personal (se muestra una sola vez). */
  app.post('/start', { preHandler: only, config: { rateLimit: limit } }, async (req, reply) => {
    const body = startParticipationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Revisa el documento (5 a 20 letras o números) tus nombres y tus apellidos.' });
    const { user, session } = req.auth!;
    const [dup] = await db
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.campaignId, user.campaignId!), eq(participants.documentBlind, crypto.blindIndex(body.data.document))))
      .limit(1);
    if (dup) return reply.code(409).send({ error: 'Ya hay una participación con ese documento. Si ya empezaste, elige "Retomar" e ingresa tu código personal.' });

    const code = newResumeCode();
    const [p] = await db
      .insert(participants)
      .values({
        campaignId: user.campaignId!,
        companyId: user.companyId!,
        documentBlind: crypto.blindIndex(body.data.document),
        documentEnc: crypto.encrypt(body.data.document),
        fullNameEnc: crypto.encrypt(body.data.names),
        surnamesEnc: crypto.encrypt(body.data.surnames),
        resumeCodeHash: crypto.hashToken(normalizeCode(code)),
      })
      .returning({ id: participants.id });
    await bind(session.id, p!.id);
    await audit(db, user.id, 'participant.started', { type: 'participant', id: p!.id });
    return { resumeCode: code, me: await meOf(req.cookies[cookieName]) };
  });

  /** Retomar: documento + código personal. Mensaje genérico ante cualquier fallo y bloqueo tras 5 intentos. */
  app.post('/resume', { preHandler: only, config: { rateLimit: limit } }, async (req, reply) => {
    const body = resumeParticipationSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Revisa tu documento y tu código.' });
    const { user, session } = req.auth!;
    const GENERIC = 'Documento o código incorrecto, o el acceso está bloqueado temporalmente.';
    const [p] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.campaignId, user.campaignId!), eq(participants.documentBlind, crypto.blindIndex(body.data.document))))
      .limit(1);
    if (!p || (p.resumeLockedUntil && p.resumeLockedUntil.getTime() > Date.now())) return reply.code(401).send({ error: GENERIC });

    if (p.resumeCodeHash !== crypto.hashToken(normalizeCode(body.data.code))) {
      const failed = p.resumeFailedAttempts + 1;
      const lock = failed >= MAX_RESUME_ATTEMPTS;
      await db
        .update(participants)
        .set({ resumeFailedAttempts: lock ? 0 : failed, resumeLockedUntil: lock ? new Date(Date.now() + RESUME_LOCK_MINUTES * 60_000) : null })
        .where(eq(participants.id, p.id));
      await audit(db, user.id, lock ? 'participant.resume_locked' : 'participant.resume_failed', { type: 'participant', id: p.id });
      return reply.code(401).send({ error: GENERIC });
    }
    await db.update(participants).set({ resumeFailedAttempts: 0, resumeLockedUntil: null }).where(eq(participants.id, p.id));
    await bind(session.id, p.id);
    await audit(db, user.id, 'participant.resumed', { type: 'participant', id: p.id });
    return meOf(req.cookies[cookieName]);
  });

  /** Termina la participación en este equipo (para que otra persona use el mismo equipo). */
  app.post('/leave', { preHandler: only }, async (req) => {
    await bind(req.auth!.session.id, null);
    return meOf(req.cookies[cookieName]);
  });
};
