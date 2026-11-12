import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { emailListSchema } from '@sanithelp/shared';
import { companies, users } from '../db/schema.js';
import { manageableCampaign } from '../auth/access.js';
import { audit } from '../auth/service.js';
import { campaignAccessEmail, testEmail } from '../mail/templates.js';

/** Envío de credenciales por correo (Outlook) y estado/prueba de la configuración de correo. */
export const mailRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto, mailer, cfg } = app.appCtx;
  const limit = { max: cfg.NODE_ENV === 'test' ? 10_000 : 10, timeWindow: '1 minute' };

  /** ¿Hay correo configurado? Lo usa la interfaz para mostrar u ocultar el icono de sobre. */
  app.get('/mail/status', { preHandler: app.requirePerm('campaigns.email', 'settings.manage') }, async () => ({ enabled: mailer.enabled, provider: mailer.provider, from: mailer.from }));

  /** Envía la credencial de la campaña a una o varias direcciones (un correo individual por destinatario). */
  app.post('/campaigns/:id/email-access', { preHandler: app.requirePerm('campaigns.email'), config: { rateLimit: limit } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = emailListSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Escribe de 1 a 20 correos válidos.' });
    if (!mailer.enabled) return reply.code(409).send({ error: 'El envío de correo todavía no está configurado. Pídele al administrador que lo active (docs/CORREO_OUTLOOK.md).' });
    const actor = req.auth!.user;
    const c = await manageableCampaign(db, actor.id, actor.role, id);
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    if (c.status !== 'open') return reply.code(409).send({ error: 'La campaña está cerrada: su credencial no funciona.' });
    if (!c.accessPasswordEnc) return reply.code(409).send({ error: 'Esta campaña es anterior a esta función: genera una contraseña nueva de acceso para poder enviarla.' });
    const [u] = await db.select().from(users).where(and(eq(users.campaignId, c.id), eq(users.role, 'collaborator'))).limit(1);
    const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, c.companyId)).limit(1);
    if (!u) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const username = crypto.decrypt(u.usernameEnc);
    const password = crypto.decrypt(c.accessPasswordEnc);
    const sent: string[] = [];
    const failed: string[] = [];
    for (const to of [...new Set(body.data.emails)]) {
      try {
        await mailer.send(campaignAccessEmail({ to, companyName: co?.name ?? '', campaignName: c.name, username, password, url: cfg.APP_BASE_URL }));
        sent.push(to);
      } catch (e) {
        failed.push(to);
        req.log.error({ err: (e as Error).message }, 'No se pudo enviar la credencial por correo');
      }
    }
    // En la auditoría solo queda cuántos se enviaron, nunca las direcciones.
    await audit(db, actor.id, 'campaign.access_emailed', { type: 'campaign', id: c.id }, { sent: sent.length, failed: failed.length });
    return { sent, failed };
  });

  /** Prueba de la configuración: envía un correo de prueba a la dirección indicada. */
  app.post('/admin/mail/test', { preHandler: app.requirePerm('settings.manage'), config: { rateLimit: limit } }, async (req, reply) => {
    const body = z.object({ to: z.string().trim().email().max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Escribe un correo válido.' });
    if (!mailer.enabled) return reply.code(409).send({ error: 'El correo no está configurado. Faltan las variables MAIL_* (ver docs/CORREO_OUTLOOK.md).' });
    try {
      await mailer.send(testEmail(body.data.to));
    } catch (e) {
      return reply.code(502).send({ error: (e as Error).message });
    }
    await audit(db, req.auth!.user.id, 'mail.test_sent');
    return { ok: true };
  });
};
