import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import fs from 'node:fs';
import { randomInt } from 'node:crypto';
import { campaignStatusSchema, createCampaignSchema, updateCampaignSchema } from '@sanithelp/shared';
import { assistantCampaigns, campaigns, companies, consents, exportJobs, fichaAnswers, participants, psychologistCompanies, questionnaireAnswers, users } from '../db/schema.js';
import { allowedCompanyIds as allowedIds, assistantScope, manageableCampaign } from '../auth/access.js';
import { audit, revokeUserSessions } from '../auth/service.js';
import { generateTempPassword, hashPassword, verifyPassword } from '../security/passwords.js';

const uuidParam = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

/**
 * Campañas = rondas de aplicación por empresa. Cada campaña tiene UNA credencial compartida
 * (usuario + contraseña) que la psicóloga entrega a los colaboradores de esa empresa.
 */
export const campaignRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  // El auxiliar administrativo tiene en campañas lo mismo que la psicóloga (acotado a lo que se le asignó: ver `manageableCampaign`).
  const staff = app.requireReady('admin', 'psychologist', 'assistant');
  const staffOrAssistant = staff;

  const allowedCompanyIds = (userId: string, role: string) => allowedIds(db, userId, role);

  /** Devuelve la campaña si el usuario puede gestionarla; si no, null (el llamador responde 404 sin revelar nada). */
  const manageable = (id: string, userId: string, role: string) => manageableCampaign(db, userId, role, id);

  async function accessUserOf(campaignId: string) {
    const [u] = await db.select().from(users).where(and(eq(users.campaignId, campaignId), eq(users.role, 'collaborator'))).limit(1);
    return u ?? null;
  }

  app.get('/campaigns', { preHandler: staffOrAssistant }, async (req) => {
    const actor = req.auth!.user;
    const ids = await allowedCompanyIds(actor.id, actor.role);
    const extra = actor.role === 'assistant' ? (await assistantScope(db, actor.id)).campaignIds : [];
    const rows =
      ids === 'all'
        ? await db.select().from(campaigns).orderBy(desc(campaigns.createdAt))
        : ids.length || extra.length
          ? await db
              .select()
              .from(campaigns)
              .where(or(...(ids.length ? [inArray(campaigns.companyId, ids)] : []), ...(extra.length ? [inArray(campaigns.id, extra)] : [])))
              .orderBy(desc(campaigns.createdAt))
          : [];
    // Totales por campaña y estado (sin abrir los resultados): iniciaron, completaron, en curso, no autorizaron, revocaron.
    const stats = new Map<string, { started: number; completed: number; inProgress: number; declined: number; revoked: number }>();
    for (const r of await db.select({ id: participants.campaignId, status: participants.status, n: sql<number>`count(*)::int` }).from(participants).groupBy(participants.campaignId, participants.status)) {
      const s = stats.get(r.id) ?? { started: 0, completed: 0, inProgress: 0, declined: 0, revoked: 0 };
      s.started += r.n;
      if (r.status === 'completed') s.completed += r.n;
      else if (r.status === 'in_progress') s.inProgress += r.n;
      else if (r.status === 'declined') s.declined += r.n;
      else if (r.status === 'revoked') s.revoked += r.n;
      stats.set(r.id, s);
    }
    const names = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies)).map((c) => [c.id, c.name]));
    const respIds = [...new Set(rows.map((c) => c.responsibleUserId).filter((x): x is string => !!x))];
    const respNames = new Map((respIds.length ? await db.select({ id: users.id, n: users.fullNameEnc }).from(users).where(inArray(users.id, respIds)) : []).map((u) => [u.id, crypto.decrypt(u.n)]));
    const out = [];
    for (const c of rows) {
      const u = await accessUserOf(c.id);
      const st = stats.get(c.id) ?? { started: 0, completed: 0, inProgress: 0, declined: 0, revoked: 0 };
      out.push({ ...c, participantCount: st.started, stats: st, companyName: names.get(c.companyId) ?? '', responsibleName: c.responsibleUserId ? respNames.get(c.responsibleUserId) ?? null : null, accessUsername: u ? crypto.decrypt(u.usernameEnc) : null });
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
    if (!company.active) return reply.code(409).send({ error: 'La empresa está desactivada. Actívala para crear campañas.' });

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
    // La psicóloga que crea la campaña es su responsable; si la crea un administrador, queda la asignada a la empresa (o la que elija después).
    const [campaign] = await db.insert(campaigns).values({ responsibleUserId: actor.role === 'psychologist' ? actor.id : null, companyId: company.id, name: body.data.name, assessments: [...new Set(body.data.assessments)], accessPasswordEnc: crypto.encrypt(password) }).returning();
    await db.insert(users).values({
      role: 'collaborator',
      usernameBlind: crypto.blindIndex(username),
      usernameEnc: crypto.encrypt(username),
      fullNameEnc: crypto.encrypt(`Acceso ${company.name} · ${body.data.name}`),
      companyId: company.id,
      campaignId: campaign!.id,
      passwordHash: await hashPassword(password),
    });
    await audit(db, actor.id, 'campaign.created', { type: 'campaign', id: campaign!.id }, { assessments: campaign!.assessments });
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
    await db.update(campaigns).set({ accessPasswordEnc: crypto.encrypt(password) }).where(eq(campaigns.id, c.id));
    await revokeUserSessions(db, u.id);
    await audit(db, actor.id, 'campaign.access_regenerated', { type: 'campaign', id: c.id });
    return { username: crypto.decrypt(u.usernameEnc), password };
  });

  /** Candado: usuario y contraseña de la campaña. Solo admin o la psicóloga asignada a la empresa (lo decide `manageable`). */
  app.get('/campaigns/:id/access', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = uuidParam(id) ? await manageable(id, actor.id, actor.role) : null;
    const u = c ? await accessUserOf(c.id) : null;
    if (!c || !u) return reply.code(404).send({ error: 'Campaña no encontrada' });
    await audit(db, actor.id, 'campaign.access_viewed', { type: 'campaign', id: c.id });
    reply.header('Cache-Control', 'no-store');
    return { username: crypto.decrypt(u.usernameEnc), password: c.accessPasswordEnc ? crypto.decrypt(c.accessPasswordEnc) : null };
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

  /** Renombra la campaña. */
  app.patch('/campaigns/:id', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateCampaignSchema.safeParse(req.body);
    const actor = req.auth!.user;
    const c = uuidParam(id) && body.success ? await manageable(id, actor.id, actor.role) : null;
    if (!c || !body.success) return reply.code(404).send({ error: 'Campaña no encontrada' });
    if (body.data.responsibleId !== undefined && body.data.responsibleId !== null) {
      const ok = (await responsiblesOf(c.companyId)).some((r) => r.id === body.data.responsibleId);
      if (!ok) return reply.code(400).send({ error: 'Esa persona no es una psicóloga activa asignada a la empresa de la campaña.' });
    }
    await db
      .update(campaigns)
      .set({ ...(body.data.name !== undefined ? { name: body.data.name } : {}), ...(body.data.responsibleId !== undefined ? { responsibleUserId: body.data.responsibleId } : {}) })
      .where(eq(campaigns.id, c.id));
    if (body.data.name !== undefined) await audit(db, actor.id, 'campaign.renamed', { type: 'campaign', id: c.id });
    if (body.data.responsibleId !== undefined) await audit(db, actor.id, 'campaign.responsible_changed', { type: 'campaign', id: c.id }, { responsibleId: body.data.responsibleId });
    return { ok: true };
  });

  /** Psicólogas activas asignadas a la empresa: candidatas a responsable de la campaña. */
  async function responsiblesOf(companyId: string) {
    const rows = await db
      .select({ u: users })
      .from(psychologistCompanies)
      .innerJoin(users, eq(users.id, psychologistCompanies.userId))
      .where(and(eq(psychologistCompanies.companyId, companyId), eq(users.active, true), eq(users.role, 'psychologist')));
    return rows.map((r) => ({ id: r.u.id, name: crypto.decrypt(r.u.fullNameEnc), hasSignature: !!r.u.signatureEnc }));
  }

  app.get('/campaigns/:id/responsibles', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = uuidParam(id) ? await manageable(id, actor.id, actor.role) : null;
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    return { responsibleId: c.responsibleUserId, options: await responsiblesOf(c.companyId) };
  });

  /**
   * Elimina una campaña. Sin participantes: cualquier miembro del personal con acceso, con su contraseña.
   * Con participantes: solo el administrador, con la campaña cerrada y escribiendo el nombre exacto;
   * borra respuestas, fichas y constancias de consentimiento de forma definitiva (queda la auditoría).
   */
  app.delete('/campaigns/:id', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = uuidParam(id) ? await manageable(id, actor.id, actor.role) : null;
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const b = (req.body ?? {}) as { password?: unknown; confirmName?: unknown };
    if (typeof b.password !== 'string' || !(await verifyPassword(actor.passwordHash, b.password))) return reply.code(403).send({ error: 'Contraseña incorrecta.' });
    const people = await db.select({ id: participants.id }).from(participants).where(eq(participants.campaignId, c.id));
    if (people.length) {
      if (actor.role !== 'admin') return reply.code(403).send({ error: 'La campaña tiene participantes. Solo el administrador puede eliminarla.' });
      if (c.status !== 'closed') return reply.code(409).send({ error: 'Cierra la campaña antes de eliminarla.' });
      if (b.confirmName !== c.name) return reply.code(400).send({ error: 'Escribe el nombre exacto de la campaña para confirmar.' });
    }
    const jobs = await db.select({ filePath: exportJobs.filePath }).from(exportJobs).where(eq(exportJobs.campaignId, c.id));
    const access = await db.select({ id: users.id }).from(users).where(and(eq(users.campaignId, c.id), eq(users.role, 'collaborator')));
    await db.transaction(async (tx) => {
      const ids = people.map((p) => p.id);
      if (ids.length) {
        await tx.delete(questionnaireAnswers).where(inArray(questionnaireAnswers.participantId, ids));
        await tx.delete(fichaAnswers).where(inArray(fichaAnswers.participantId, ids));
        await tx.delete(consents).where(inArray(consents.participantId, ids));
      }
      // Las sesiones se borran con el usuario (cascada) o quedan sin participante (set null).
      await tx.delete(participants).where(eq(participants.campaignId, c.id));
      await tx.delete(exportJobs).where(eq(exportJobs.campaignId, c.id));
      await tx.delete(assistantCampaigns).where(eq(assistantCampaigns.campaignId, c.id));
      if (access.length) await tx.delete(users).where(inArray(users.id, access.map((u) => u.id)));
      await tx.delete(campaigns).where(eq(campaigns.id, c.id));
    });
    for (const j of jobs) if (j.filePath) fs.rmSync(j.filePath, { force: true });
    await audit(db, actor.id, 'campaign.deleted', { type: 'campaign', id: c.id }, { participants: people.length });
    return { ok: true };
  });
};
