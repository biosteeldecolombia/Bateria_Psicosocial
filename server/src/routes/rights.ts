import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { instrumentsFor, normalizeDocument } from '@sanithelp/shared';
import { campaigns, consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import { audit } from '../auth/service.js';
import { manageableCampaign } from '../auth/access.js';
import { verifyPassword } from '../security/passwords.js';

import { eraseParticipant } from '../results/erase.js';

const reopenSchema = z.object({
  instrument: z.string().min(1).max(30),
  password: z.string().min(1).max(500),
  reason: z.string().trim().min(10, 'Escribe el motivo (mínimo 10 caracteres).').max(300),
});

const rectifySchema = z.object({
  names: z.string().trim().min(2).max(100).optional(),
  surnames: z.string().trim().min(2).max(100).optional(),
  document: z.string().transform(normalizeDocument).pipe(z.string().regex(/^[A-Z0-9]{5,20}$/)).optional(),
});

/**
 * Derechos del titular (Ley 1581/2012): rectificar y suprimir. El acceso/exportación lo cubren el expediente en PDF y el CSV.
 * Los ejerce la psicóloga responsable (o el administrador) a solicitud de la persona; todo queda auditado.
 */
export const rightsRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const staff = app.requireReady('admin', 'psychologist');

  async function target(req: FastifyRequest) {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    const c = p ? await manageableCampaign(db, actor.id, actor.role, p.campaignId) : null;
    return p && c ? p : null;
  }

  /** Rectificar nombres, apellidos o documento. */
  app.patch('/participants/:id', { preHandler: staff }, async (req, reply) => {
    const p = await target(req);
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    if (p.status === 'revoked') return reply.code(409).send({ error: 'Los datos de esta persona ya fueron suprimidos.' });
    const body = rectifySchema.safeParse(req.body);
    if (!body.success || Object.keys(body.data).length === 0) return reply.code(400).send({ error: 'Revisa los datos: nombres, apellidos y documento (5 a 20 letras o números).' });
    const set: Partial<typeof participants.$inferInsert> = {};
    if (body.data.names) set.fullNameEnc = crypto.encrypt(body.data.names);
    if (body.data.surnames) set.surnamesEnc = crypto.encrypt(body.data.surnames);
    if (body.data.document) {
      const blind = crypto.blindIndex(body.data.document);
      const [dup] = await db.select({ id: participants.id }).from(participants).where(and(eq(participants.campaignId, p.campaignId), eq(participants.documentBlind, blind))).limit(1);
      if (dup && dup.id !== p.id) return reply.code(409).send({ error: 'Ya existe otra participación con ese documento en esta campaña.' });
      set.documentBlind = blind;
      set.documentEnc = crypto.encrypt(body.data.document);
    }
    await db.update(participants).set(set).where(eq(participants.id, p.id));
    await audit(db, req.auth!.user.id, 'participant.rectified', { type: 'participant', id: p.id }, { fields: Object.keys(body.data) });
    return { ok: true };
  });

  /**
   * Repetir una prueba: la psicóloga decide cuál debe responder de nuevo la persona. Se borran las respuestas de esa prueba
   * (las demás se conservan) y, si la participación estaba enviada, vuelve a «en curso» para que la persona pueda retomarla
   * con su código personal. Exige la contraseña y un motivo; queda en la auditoría.
   */
  app.post('/participants/:id/reopen', { preHandler: staff }, async (req, reply) => {
    const p = await target(req);
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const body = reopenSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Revisa los datos: la prueba, el motivo y tu contraseña.' });
    const actor = req.auth!.user;
    if (!(await verifyPassword(actor.passwordHash, body.data.password))) return reply.code(403).send({ error: 'Contraseña incorrecta.' });
    if (p.status === 'revoked' || p.status === 'declined') return reply.code(409).send({ error: 'Esta participación no admite cambios (no autorizó o sus datos fueron suprimidos).' });
    const [consent] = await db.select().from(consents).where(eq(consents.participantId, p.id)).limit(1);
    if (!consent || consent.decision !== 'authorized' || consent.revokedAt) return reply.code(409).send({ error: 'La persona no tiene un consentimiento vigente.' });
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, p.campaignId)).limit(1);
    if (!campaign || campaign.status !== 'open') return reply.code(409).send({ error: 'La campaña está cerrada. Reábrela para que la persona pueda responder de nuevo.' });
    const plan: string[] = instrumentsFor(campaign.assessments, p.form);
    if (!plan.includes(body.data.instrument)) return reply.code(400).send({ error: 'Esa prueba no forma parte de la campaña de esta persona.' });
    const [row] = await db
      .select({ instrument: questionnaireAnswers.instrument })
      .from(questionnaireAnswers)
      .where(and(eq(questionnaireAnswers.participantId, p.id), eq(questionnaireAnswers.instrument, body.data.instrument)))
      .limit(1);
    if (!row) return reply.code(409).send({ error: 'La persona todavía no tiene respuestas en esa prueba.' });
    await db.transaction(async (tx) => {
      await tx.delete(questionnaireAnswers).where(and(eq(questionnaireAnswers.participantId, p.id), eq(questionnaireAnswers.instrument, body.data.instrument)));
      if (p.status === 'completed') await tx.update(participants).set({ status: 'in_progress', submittedAt: null }).where(eq(participants.id, p.id));
    });
    await audit(db, actor.id, 'participant.instrument_reopened', { type: 'participant', id: p.id }, { instrument: body.data.instrument, reason: body.data.reason });
    return { ok: true, instrument: body.data.instrument, status: 'in_progress' };
  });

  /**
   * Suprimir: borra respuestas y ficha y deja el registro como «suprimido» (sin datos personales).
   * Se conserva únicamente la constancia de consentimiento, marcada como revocada, y la auditoría. Exige la contraseña.
   */
  app.post('/participants/:id/erase', { preHandler: staff }, async (req, reply) => {
    const p = await target(req);
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const actor = req.auth!.user;
    const b = (req.body ?? {}) as { password?: unknown };
    if (typeof b.password !== 'string' || !(await verifyPassword(actor.passwordHash, b.password))) {
      return reply.code(403).send({ error: 'Contraseña incorrecta.' });
    }
    if (p.status === 'revoked') return reply.code(409).send({ error: 'Los datos de esta persona ya fueron suprimidos.' });
    await eraseParticipant(db, crypto, p.id, actor.id);
    await audit(db, actor.id, 'participant.erased', { type: 'participant', id: p.id });
    return { ok: true };
  });
};
