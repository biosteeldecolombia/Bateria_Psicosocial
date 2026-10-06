import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/client.js';
import { audit } from './service.js';
import { manageableCampaign } from './access.js';

/**
 * Autoriza el acceso a información clínica (respuestas o resultados) de una campaña.
 * Psicóloga: solo empresas asignadas. Administrador: mínimo privilegio, debe justificar el motivo (queda en la auditoría).
 * Devuelve la campaña o responde 403/404 y devuelve null.
 */
export async function clinicalAccess(db: Db, req: FastifyRequest, reply: FastifyReply, campaignId: string, justification?: string) {
  const actor = req.auth!.user;
  const c = await manageableCampaign(db, actor.id, actor.role, campaignId);
  if (!c) {
    reply.code(404).send({ error: 'Campaña no encontrada' });
    return null;
  }
  if (actor.role === 'admin') {
    const j = String(justification ?? (req.query as { justification?: string }).justification ?? '').trim();
    if (j.length < 10) {
      reply.code(403).send({ error: 'Como administrador debes indicar el motivo del acceso (mínimo 10 caracteres).', needsJustification: true });
      return null;
    }
    await audit(db, actor.id, 'results.admin_access', { type: 'campaign', id: c.id }, { justification: j.slice(0, 300) });
  }
  return c;
}
