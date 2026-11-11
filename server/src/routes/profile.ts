import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema.js';
import { audit } from '../auth/service.js';

const profileSchema = z.object({
  professionalDocument: z.string().trim().min(5).max(40),
  professionalRegistry: z.string().trim().min(3).max(100),
});

/** Firma escaneada o fotografiada: solo PNG o JPEG (se verifica la cabecera real del archivo), hasta 400 KB. */
export const SIGNATURE_MAX_BYTES = 400_000;
export function parseSignature(dataUrl: unknown): { mime: 'image/png' | 'image/jpeg'; b64: string } | null {
  const m = typeof dataUrl === 'string' ? /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
  if (!m) return null;
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length < 100 || bytes.length > SIGNATURE_MAX_BYTES) return null;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((m[1] === 'image/png' && !png) || (m[1] === 'image/jpeg' && !jpg)) return null;
  return { mime: m[1] as 'image/png' | 'image/jpeg', b64: m[2]! };
}

/** Imagen de la firma como data URL, o null. */
export const signatureOfEnc = (decrypt: (v: string) => string, enc: string | null): string | null => {
  if (!enc) return null;
  const s = JSON.parse(decrypt(enc)) as { mime: string; b64: string };
  return `data:${s.mime};base64,${s.b64}`;
};

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
      signature: signatureOfEnc((v) => crypto.decrypt(v), u.signatureEnc),
    };
  });

  app.get('/profile/signature', { preHandler: only }, async (req) => ({ signature: signatureOfEnc((v) => crypto.decrypt(v), req.auth!.user.signatureEnc) }));

  /** Carga la imagen de la firma (data URL PNG o JPEG). Reemplaza la anterior. */
  app.put('/profile/signature', { preHandler: only, bodyLimit: 700_000 }, async (req, reply) => {
    const sig = parseSignature((req.body as { image?: unknown } | null)?.image);
    if (!sig) return reply.code(400).send({ error: 'La firma debe ser una imagen PNG o JPG de hasta 400 KB.' });
    const u = req.auth!.user;
    await db.update(users).set({ signatureEnc: crypto.encrypt(JSON.stringify(sig)) }).where(eq(users.id, u.id));
    await audit(db, u.id, 'profile.signature_set', { type: 'user', id: u.id });
    return { ok: true };
  });

  app.delete('/profile/signature', { preHandler: only }, async (req) => {
    const u = req.auth!.user;
    await db.update(users).set({ signatureEnc: null }).where(eq(users.id, u.id));
    await audit(db, u.id, 'profile.signature_removed', { type: 'user', id: u.id });
    return { ok: true };
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
