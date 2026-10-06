import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeDocument } from '@sanithelp/shared';
import { consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import { audit } from '../auth/service.js';
import { manageableCampaign } from '../auth/access.js';
import { verifyPassword } from '../security/passwords.js';

import { eraseParticipant } from '../results/erase.js';

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
