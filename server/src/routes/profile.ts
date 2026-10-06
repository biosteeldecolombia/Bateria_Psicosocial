import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema.js';
import { audit } from '../auth/service.js';

const profileSchema = z.object({
  professionalDocument: z.string().trim().min(5).max(40),
  professionalRegistry: z.string().trim().min(3).max(100),
});

/** Perfil profesional de la psicóloga: documento y registro/licencia que salen en el consentimiento de cada expediente. */
export const profileRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const only = app.requireReady('psychologist');

  app.get('/profile', { preHandler: only }, async (req) => {
    const u = req.auth!.user;
    return {
      fullName: crypto.decrypt(u.fullNameEnc),
      professionalDocument: u.professionalDocumentEnc ? crypto.decrypt(u.professionalDocumentEnc) : '',
      professionalRegistry: u.professionalRegistryEnc ? crypto.decrypt(u.professionalRegistryEnc) : '',
    };
  });

  app.put('/profile', { preHandler: only }, async (req, reply) => {
    const body = profileSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Escribe tu documento de identidad y tu registro o licencia profesional.' });
    const u = req.auth!.user;
    await db
      .update(users)
      .set({
        professionalDocumentEnc: crypto.encrypt(body.data.professionalDocument),
        professionalRegistryEnc: crypto.encrypt(body.data.professionalRegistry),
      })
      .where(eq(users.id, u.id));
    await audit(db, u.id, 'profile.updated', { type: 'user', id: u.id });
    return { ok: true };
  });
};
