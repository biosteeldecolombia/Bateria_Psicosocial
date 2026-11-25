import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { REVIEW_STATUSES, WORKFLOW_LABEL, WORKFLOW_OWNERS, WORKFLOW_STAGE_KEYS, type WorkflowStage } from '@sanithelp/shared';
import { campaigns, participants, users, workflowEvents } from '../db/schema.js';
import { manageableCampaign } from '../auth/access.js';
import { audit } from '../auth/service.js';
import { putSetting } from '../settings.js';
import { autoAdvanceFromReviews, buildAlerts, defaultOwnerIds, loadAlertSettings, loadBoard, responseTimes, setStage } from '../workflow/service.js';
import { digestLines, runDigestNow } from '../workflow/digest.js';
import { DEFAULT_OWNERS, DEFAULT_SECURITY, getSetting, type DefaultOwners, type SecuritySettings } from '../settings.js';

const uuidParam = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

const stageBody = z.object({ stage: z.enum(WORKFLOW_STAGE_KEYS as [WorkflowStage, ...WorkflowStage[]]), note: z.string().trim().max(300).optional() });
const ownersBody = z.object({
  application: z.string().uuid().nullable().optional(),
  evaluation: z.string().uuid().nullable().optional(),
  delivery: z.string().uuid().nullable().optional(),
});
const reviewBody = z.object({ status: z.enum(REVIEW_STATUSES) });
const alertsBody = z.object({
  enabled: z.record(z.string(), z.boolean()),
  threshold: z.record(z.string(), z.number().min(0).max(1000)),
  dailyEmail: z.boolean(),
});

/** Flujo de trabajo por estado, responsables por proceso, tiempos, alertas y ajustes generales. */
export const workflowRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto, mailer } = app.appCtx;
  const view = app.requirePerm('workflow.view');
  const manage = app.requirePerm('workflow.manage');

  app.get('/workflow/board', { preHandler: view }, async (req) => {
    const actor = req.auth!.user;
    const board = await loadBoard(db, crypto, actor);
    return { ...board, me: { id: actor.id, role: actor.role } };
  });

  /** Historial de etapas de una campaña con cuánto estuvo en cada una, y los tiempos de respuesta de las personas. */
  app.get('/workflow/campaigns/:id', { preHandler: view }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = await manageableCampaign(db, actor.id, actor.role, id);
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const events = await db.select().from(workflowEvents).where(eq(workflowEvents.campaignId, c.id)).orderBy(asc(workflowEvents.at), asc(workflowEvents.id));
    const actorIds = [...new Set(events.map((e) => e.actorId).filter((x): x is string => !!x))];
    const names = new Map((actorIds.length ? await db.select({ id: users.id, n: users.fullNameEnc }).from(users).where(inArray(users.id, actorIds)) : []).map((u) => {
      try {
        return [u.id, crypto.decrypt(u.n)] as const;
      } catch {
        return [u.id, ''] as const;
      }
    }));
    // Línea de tiempo: la creación y cada cambio. La duración de una etapa es hasta el cambio siguiente (o hasta ahora).
    const points = [{ stage: 'created' as string, at: c.createdAt, actorId: null as string | null, note: null as string | null }, ...events.filter((e) => !(e.stage === 'created' && e.at.getTime() <= c.createdAt.getTime() + 1000))];
    const timeline = points.map((p, i) => {
      const next = points[i + 1]?.at ?? new Date();
      return { stage: p.stage, label: WORKFLOW_LABEL[p.stage as WorkflowStage] ?? p.stage, at: p.at.toISOString(), actorName: p.actorId ? names.get(p.actorId) ?? null : null, note: p.note, minutesInStage: Math.round((next.getTime() - p.at.getTime()) / 60_000) };
    });
    return { stage: c.stage, timeline, times: await responseTimes(db, c.id) };
  });

  /** Mueve la campaña a otra etapa (p. ej. «En evaluación» o «Informe entregado»). Queda con fecha y persona. */
  app.post('/campaigns/:id/stage', { preHandler: manage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = stageBody.safeParse(req.body);
    const actor = req.auth!.user;
    const c = body.success ? await manageableCampaign(db, actor.id, actor.role, id) : null;
    if (!c || !body.success) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const changed = await setStage(db, c.id, body.data.stage, actor.id, body.data.note);
    if (changed) await audit(db, actor.id, 'campaign.stage_changed', { type: 'campaign', id: c.id }, { from: c.stage, to: body.data.stage });
    return { ok: true, changed };
  });

  /** Quién responde de cada proceso. Deben ser personal activo con acceso a la campaña. */
  app.get('/campaigns/:id/owner-options', { preHandler: view }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = await manageableCampaign(db, actor.id, actor.role, id);
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const staff = await db.select().from(users).where(and(inArray(users.role, ['admin', 'psychologist', 'assistant']), eq(users.active, true)));
    const out: { id: string; name: string; role: string }[] = [];
    for (const u of staff) {
      if (await manageableCampaign(db, u.id, u.role, c.id)) {
        try {
          out.push({ id: u.id, name: crypto.decrypt(u.fullNameEnc), role: u.role });
        } catch {
          /* cuenta ilegible: se omite */
        }
      }
    }
    const sorted = out.sort((x, y) => x.name.localeCompare(y.name, 'es'));
    // Cada proceso propone a quien ya estaba asignado; si no hay nadie, la persona por defecto de los ajustes; y si tampoco, la primera de la lista.
    const defs = defaultOwnerIds(await getSetting<DefaultOwners>(db, 'default_owners', DEFAULT_OWNERS));
    const stored = { application: c.ownerApplicationId, evaluation: c.ownerEvaluationId, delivery: c.ownerDeliveryId };
    const owners: Record<string, string | null> = {};
    for (const o of WORKFLOW_OWNERS) {
      const eligible = sorted.filter((u) => (o.roles as readonly string[]).includes(u.role));
      const pick = [stored[o.key], defs[o.key]].find((id) => id && eligible.some((u) => u.id === id));
      owners[o.key] = pick ?? eligible[0]?.id ?? null;
    }
    return { owners, options: sorted };
  });

  app.put('/campaigns/:id/owners', { preHandler: manage }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ownersBody.safeParse(req.body);
    const actor = req.auth!.user;
    const c = body.success ? await manageableCampaign(db, actor.id, actor.role, id) : null;
    if (!c || !body.success) return reply.code(404).send({ error: 'Campaña no encontrada' });
    const set: Partial<typeof campaigns.$inferInsert> = {};
    for (const [k, col] of [['application', 'ownerApplicationId'], ['evaluation', 'ownerEvaluationId'], ['delivery', 'ownerDeliveryId']] as const) {
      const v = body.data[k];
      if (v === undefined) continue;
      if (v !== null) {
        const [u] = await db.select({ id: users.id, role: users.role, active: users.active }).from(users).where(eq(users.id, v)).limit(1);
        if (!u || !u.active || u.role === 'collaborator' || u.role === 'company' || !(await manageableCampaign(db, u.id, u.role, c.id))) return reply.code(400).send({ error: 'Esa persona no tiene acceso a esta campaña.' });
        const allowed = WORKFLOW_OWNERS.find((o) => o.key === k)!.roles as readonly string[];
        if (!allowed.includes(u.role)) return reply.code(400).send({ error: k === 'evaluation' ? 'La evaluación psicológica solo puede asignarse a una psicóloga.' : k === 'delivery' ? 'La entrega de informes solo puede asignarse a un auxiliar administrativo.' : 'La aplicación solo puede asignarse a una psicóloga o a un auxiliar administrativo.' });
      }
      set[col] = v;
    }
    if (Object.keys(set).length) await db.update(campaigns).set(set).where(eq(campaigns.id, c.id));
    await audit(db, actor.id, 'campaign.owners_changed', { type: 'campaign', id: c.id }, { fields: Object.keys(set) });
    return { ok: true };
  });

  /** La psicóloga marca el avance de la revisión de cada persona: por revisar → en revisión → evaluada. */
  app.post('/participants/:id/review', { preHandler: app.requirePerm('results.fill') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = reviewBody.safeParse(req.body);
    const actor = req.auth!.user;
    const [p] = uuidParam(id) && body.success ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    const c = p ? await manageableCampaign(db, actor.id, actor.role, p.campaignId) : null;
    if (!p || !c || !body.success) return reply.code(404).send({ error: 'Participante no encontrado' });
    if (p.status !== 'completed') return reply.code(409).send({ error: 'La persona todavía no termina sus cuestionarios.' });
    await db.update(participants).set({ reviewStatus: body.data.status, reviewedBy: body.data.status === 'pending' ? null : actor.id, reviewedAt: body.data.status === 'pending' ? null : new Date() }).where(eq(participants.id, p.id));
    await audit(db, actor.id, 'participant.review_changed', { type: 'participant', id: p.id }, { status: body.data.status });
    await autoAdvanceFromReviews(db, c.id, actor.id);
    return { ok: true };
  });

  // ---------- Alertas y configuración ----------
  /** Notificaciones del usuario según las reglas configuradas. */
  app.get('/notifications', { preHandler: app.requirePerm('workflow.view', 'results.view', 'campaigns.view') }, async (req) => ({ items: await buildAlerts(db, crypto, req.auth!.user) }));

  /** Personal activo que puede ser responsable por defecto: psicólogas y auxiliares administrativos. */
  async function staffByRole() {
    const rows = await db.select().from(users).where(and(inArray(users.role, ['psychologist', 'assistant']), eq(users.active, true)));
    const mine = (role: string) => rows.filter((u) => u.role === role).flatMap((u) => { try { return [{ id: u.id, name: crypto.decrypt(u.fullNameEnc) }]; } catch { return []; } }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return { psychologists: mine('psychologist'), assistants: mine('assistant') };
  }

  app.get('/settings', { preHandler: app.requirePerm('settings.manage') }, async () => ({
    alerts: await loadAlertSettings(db),
    security: await getSetting<SecuritySettings>(db, 'security', DEFAULT_SECURITY),
    defaultOwners: await getSetting<DefaultOwners>(db, 'default_owners', DEFAULT_OWNERS),
    staff: await staffByRole(),
    mail: { enabled: mailer.enabled, provider: mailer.provider, from: mailer.from },
  }));

  app.put('/settings/alerts', { preHandler: app.requirePerm('settings.manage') }, async (req, reply) => {
    const body = alertsBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    await putSetting(db, 'alerts', body.data, req.auth!.user.id);
    await audit(db, req.auth!.user.id, 'settings.alerts_updated', undefined, { dailyEmail: body.data.dailyEmail });
    return { ok: true, alerts: await loadAlertSettings(db) };
  });

  app.put('/settings/default-owners', { preHandler: app.requirePerm('settings.manage') }, async (req, reply) => {
    const body = z.object({ psychologistId: z.string().uuid().nullable(), assistantId: z.string().uuid().nullable() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos inválidos' });
    const staff = await staffByRole();
    if (body.data.psychologistId && !staff.psychologists.some((p) => p.id === body.data.psychologistId)) return reply.code(400).send({ error: 'Elige una psicóloga activa.' });
    if (body.data.assistantId && !staff.assistants.some((p) => p.id === body.data.assistantId)) return reply.code(400).send({ error: 'Elige un auxiliar administrativo activo.' });
    await putSetting(db, 'default_owners', body.data, req.auth!.user.id);
    await audit(db, req.auth!.user.id, 'settings.default_owners_updated', undefined, body.data);
    return { ok: true };
  });

  app.put('/settings/security', { preHandler: app.requirePerm('settings.manage') }, async (req, reply) => {
    const body = z.object({ trustedDeviceDays: z.number().int().min(0).max(60) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Los días deben estar entre 0 y 60.' });
    await putSetting(db, 'security', body.data, req.auth!.user.id);
    await audit(db, req.auth!.user.id, 'settings.security_updated', undefined, body.data);
    return { ok: true };
  });

  /** Vista previa y envío inmediato del resumen de pendientes al propio usuario (útil para probar el correo). */
  app.post('/settings/digest-test', { preHandler: app.requirePerm('settings.manage') }, async (req, reply) => {
    if (!mailer.enabled) return reply.code(409).send({ error: 'El correo no está configurado.' });
    const lines = await digestLines(db, crypto, req.auth!.user);
    await runDigestNow(db, crypto, mailer, req.auth!.user.id, true);
    return { ok: true, lines };
  });

};
