import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { campaignStatusSchema, createCampaignSchema } from '@sanithelp/shared';
import { campaigns, companies, psychologistCompanies, users } from '../db/schema.js';
import { audit, revokeUserSessions } from '../auth/service.js';
import { generateTempPassword, hashPassword } from '../security/passwords.js';

const uuidParam = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Campañas = rondas de aplicación por empresa. Cada campaña tiene UNA credencial compartida
 * (usuario + contraseña) que la psicóloga entrega a los colaboradores de esa empresa.
 */
export const campaignRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const staff = app.requireReady('admin', 'psychologist');

  async function allowedCompanyIds(userId: string, role: string): Promise<string[] | 'all'> {
    if (role === 'admin') return 'all';
    return (await db.select({ id: psychologistCompanies.companyId }).from(psychologistCompanies).where(eq(psychologistCompanies.userId, userId))).map((r) => r.id);
  }

  /** Devuelve la campaña si el usuario puede gestionarla; si no, null (el llamador responde 404 sin revelar nada). */
  async function manageable(id: string, userId: string, role: string) {
    const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!c) return null;
    const ids = await allowedCompanyIds(userId, role);
    return ids === 'all' || ids.includes(c.companyId) ? c : null;
  }

  async function accessUserOf(campaignId: string) {
    const [u] = await db.select().from(users).where(and(eq(users.campaignId, campaignId), eq(users.role, 'collaborator'))).limit(1);
    return u ?? null;
  }

  app.get('/campaigns', { preHandler: staff }, async (req) => {
    const actor = req.auth!.user;
    const ids = await allowedCompanyIds(actor.id, actor.role);
    const rows =
      ids === 'all'
        ? await db.select().from(campaigns).orderBy(desc(campaigns.createdAt))
        : ids.length
          ? await db.select().from(campaigns).where(inArray(campaigns.companyId, ids)).orderBy(desc(campaigns.createdAt))
          : [];
    const names = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies)).map((c) => [c.id, c.name]));
    const out = [];
    for (const c of rows) {
      const u = await accessUserOf(c.id);
      out.push({ ...c, companyName: names.get(c.companyId) ?? '', accessUsername: u ? crypto.decrypt(u.usernameEnc) : null });
    }
    return out;
  });

  app.post('/campaigns', { preHandler: staff }, async (req, reply) => {
    const body = createCampaignSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const actor = req.auth!.user;
    const ids = await allowedCompanyIds(actor.id, actor.role);
    if (ids !== 'all' && !ids.includes(body.data.companyId)) return reply.code(404).send({ error: 'Empresa no encontrada' });
    const [company] = await db.select().from(companies).where(eq(companies.id, body.data.companyId)).limit(1);
    if (!company) return reply.code(404).send({ error: 'Empresa no encontrada' });

    // Usuario legible y único: CÓDIGO-EMPRESA + 4 dígitos
    let username = '';
    for (let i = 0; i < 20; i++) {
      const candidate = `${company.code}-${randomInt(1000, 10000)}`;
      const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.usernameBlind, crypto.blindIndex(candidate))).limit(1);
      if (!dup) {
        username = candidate;
        break;
      }
    }
    if (!username) return reply.code(500).send({ error: 'No se pudo generar un usuario único. Intenta de nuevo.' });

    const password = generateTempPassword(10);
    const [campaign] = await db.insert(campaigns).values({ companyId: company.id, name: body.data.name }).returning();
    await db.insert(users).values({
      role: 'collaborator',
      usernameBlind: crypto.blindIndex(username),
      usernameEnc: crypto.encrypt(username),
      fullNameEnc: crypto.encrypt(`Acceso ${company.name} · ${body.data.name}`),
      companyId: company.id,
      campaignId: campaign!.id,
      passwordHash: await hashPassword(password),
    });
    await audit(db, actor.id, 'campaign.created', { type: 'campaign', id: campaign!.id });
    // La contraseña se muestra una sola vez.
    return reply.code(201).send({ id: campaign!.id, username, password });
  });

  /** Nueva contraseña para la credencial de la campaña (p. ej. si se filtró). No afecta lo ya respondido. */
  app.post('/campaigns/:id/regenerate-access', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = uuidParam(id) ? await manageable(id, actor.id, actor.role) : null;
    const u = c ? await accessUserOf(c.id) : null;
    if (!c || !u) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const password = generateTempPassword(10);
    await db.update(users).set({ passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));
    await revokeUserSessions(db, u.id);
    await audit(db, actor.id, 'campaign.access_regenerated', { type: 'campaign', id: c.id });
    return { username: crypto.decrypt(u.usernameEnc), password };
  });

  /** Abrir o cerrar la campaña. Al cerrar, la credencial deja de funcionar y se cierran las sesiones abiertas. */
  app.post('/campaigns/:id/status', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = campaignStatusSchema.safeParse(req.body);
    const actor = req.auth!.user;
    const c = uuidParam(id) && body.success ? await manageable(id, actor.id, actor.role) : null;
    if (!c || !body.success) return reply.code(404).send({ error: 'Campaña no encontrada' });
    await db.update(campaigns).set({ status: body.data.status, closedAt: body.data.status === 'closed' ? new Date() : null }).where(eq(campaigns.id, c.id));
    const u = await accessUserOf(c.id);
    if (u && body.data.status === 'closed') await revokeUserSessions(db, u.id);
    await audit(db, actor.id, body.data.status === 'closed' ? 'campaign.closed' : 'campaign.reopened', { type: 'campaign', id: c.id });
    return { ok: true };
  });
};
