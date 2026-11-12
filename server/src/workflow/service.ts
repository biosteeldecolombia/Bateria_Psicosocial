import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import {
  ALERT_RULES,
  DEFAULT_ALERT_SETTINGS,
  WORKFLOW_LABEL,
  type AlertSettings,
  type ReviewStatus,
  type WorkflowStage,
} from '@sanithelp/shared';
import type { Db } from '../db/client.js';
import { campaigns, companies, participants, questionnaireAnswers, users, workflowEvents } from '../db/schema.js';
import { allowedCompanyIds, assistantScope } from '../auth/access.js';
import type { Crypto } from '../security/crypto.js';
import { getSetting } from '../settings.js';
import { formatoNotes } from './formatoNotes.js';

type CampaignRow = typeof campaigns.$inferSelect;

/** Cambia la etapa de una campaña y lo deja registrado (quién y cuándo). Devuelve false si ya estaba en esa etapa. */
export async function setStage(db: Db, campaignId: string, stage: WorkflowStage, actorId: string | null, note?: string): Promise<boolean> {
  const [c] = await db.select({ stage: campaigns.stage }).from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || c.stage === stage) return false;
  const now = new Date();
  await db.update(campaigns).set({ stage, stageChangedAt: now }).where(eq(campaigns.id, campaignId));
  await db.insert(workflowEvents).values({ campaignId, stage, at: now, actorId, note: note ?? null });
  return true;
}

/** Campañas que el usuario de personal puede ver (mismo alcance que el listado de campañas). */
export async function accessibleCampaigns(db: Db, actor: { id: string; role: string }): Promise<CampaignRow[]> {
  const ids = await allowedCompanyIds(db, actor.id, actor.role);
  if (ids === 'all') return db.select().from(campaigns);
  const extra = actor.role === 'assistant' ? (await assistantScope(db, actor.id)).campaignIds : [];
  if (!ids.length && !extra.length) return [];
  return db
    .select()
    .from(campaigns)
    .where(or(...(ids.length ? [inArray(campaigns.companyId, ids)] : []), ...(extra.length ? [inArray(campaigns.id, extra)] : [])));
}

/** Reacciona a un cambio en la revisión de las personas: «En evaluación» al empezar y «Evaluada» cuando todas lo están. */
export async function autoAdvanceFromReviews(db: Db, campaignId: string, actorId: string | null) {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || c.status !== 'closed') return;
  const rows = await db
    .select({ s: participants.reviewStatus, n: sql<number>`count(*)::int` })
    .from(participants)
    .where(and(eq(participants.campaignId, campaignId), eq(participants.status, 'completed')))
    .groupBy(participants.reviewStatus);
  const total = rows.reduce((n, r) => n + r.n, 0);
  const evaluated = rows.find((r) => r.s === 'evaluated')?.n ?? 0;
  const touched = total - (rows.find((r) => r.s === 'pending')?.n ?? 0);
  if (c.stage === 'finished' && touched > 0) await setStage(db, campaignId, 'in_evaluation', actorId, 'Empezó la revisión');
  if (total > 0 && evaluated === total && (c.stage === 'finished' || c.stage === 'in_evaluation')) await setStage(db, campaignId, 'evaluated', actorId, 'Todas las personas fueron evaluadas');
}

export interface BoardCampaign {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  status: 'open' | 'closed';
  stage: WorkflowStage;
  stageChangedAt: string;
  createdAt: string;
  closedAt: string | null;
  responsibleName: string | null;
  owners: { application: { id: string; name: string } | null; evaluation: { id: string; name: string } | null; delivery: { id: string; name: string } | null };
  stats: { started: number; completed: number; inProgress: number; declined: number };
  review: Record<ReviewStatus, number>;
  daysSinceCreated: number;
  daysInStage: number;
  /** Duración total (creación → cierre o ahora), en días. */
  durationDays: number;
  avgMinutes: number | null;
}

export interface BoardTask {
  kind: 'in_progress' | 'close' | 'review' | 'mark_evaluated' | 'deliver';
  campaignId: string;
  campaignName: string;
  companyName: string;
  count: number;
  text: string;
}

const DAY = 86_400_000;

/** Tablero del flujo de trabajo: todas las campañas visibles con su etapa, responsables, avance y tiempos, y los pendientes del usuario. */
export async function loadBoard(db: Db, crypto: Crypto, actor: { id: string; role: string }): Promise<{ campaigns: BoardCampaign[]; tasks: BoardTask[] }> {
  const rows = await accessibleCampaigns(db, actor);
  if (!rows.length) return { campaigns: [], tasks: [] };
  const ids = rows.map((c) => c.id);
  const coName = new Map((await db.select({ id: companies.id, name: companies.name }).from(companies)).map((c) => [c.id, c.name]));

  const userIds = [...new Set(rows.flatMap((c) => [c.responsibleUserId, c.ownerApplicationId, c.ownerEvaluationId, c.ownerDeliveryId]).filter((x): x is string => !!x))];
  const names = new Map((userIds.length ? await db.select({ id: users.id, n: users.fullNameEnc }).from(users).where(inArray(users.id, userIds)) : []).map((u) => [u.id, safeDecrypt(crypto, u.n)]));
  const owner = (id: string | null) => (id && names.has(id) ? { id, name: names.get(id)! } : null);

  const partRows = await db
    .select({ campaignId: participants.campaignId, status: participants.status, review: participants.reviewStatus, n: sql<number>`count(*)::int`, avgSec: sql<number | null>`avg(extract(epoch from (${participants.submittedAt} - ${participants.createdAt})))::float` })
    .from(participants)
    .where(inArray(participants.campaignId, ids))
    .groupBy(participants.campaignId, participants.status, participants.reviewStatus);
  type Agg = { stats: BoardCampaign['stats']; review: BoardCampaign['review']; secSum: number; secN: number };
  const agg = new Map<string, Agg>();
  for (const r of partRows) {
    const a = agg.get(r.campaignId) ?? { stats: { started: 0, completed: 0, inProgress: 0, declined: 0 }, review: { pending: 0, in_review: 0, evaluated: 0 }, secSum: 0, secN: 0 };
    a.stats.started += r.n;
    if (r.status === 'completed') {
      a.stats.completed += r.n;
      a.review[(r.review as ReviewStatus) in a.review ? (r.review as ReviewStatus) : 'pending'] += r.n;
      if (r.avgSec != null) {
        a.secSum += r.avgSec * r.n;
        a.secN += r.n;
      }
    } else if (r.status === 'in_progress') a.stats.inProgress += r.n;
    else if (r.status === 'declined') a.stats.declined += r.n;
    agg.set(r.campaignId, a);
  }

  const now = Date.now();
  const out: BoardCampaign[] = rows
    .map((c) => {
      const a = agg.get(c.id) ?? { stats: { started: 0, completed: 0, inProgress: 0, declined: 0 }, review: { pending: 0, in_review: 0, evaluated: 0 }, secSum: 0, secN: 0 };
      const end = c.closedAt ? c.closedAt.getTime() : now;
      return {
        id: c.id,
        name: c.name,
        companyId: c.companyId,
        companyName: coName.get(c.companyId) ?? '',
        status: c.status,
        stage: c.stage as WorkflowStage,
        stageChangedAt: c.stageChangedAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
        closedAt: c.closedAt?.toISOString() ?? null,
        responsibleName: c.responsibleUserId ? names.get(c.responsibleUserId) ?? null : null,
        owners: { application: owner(c.ownerApplicationId), evaluation: owner(c.ownerEvaluationId), delivery: owner(c.ownerDeliveryId) },
        stats: a.stats,
        review: a.review,
        daysSinceCreated: Math.floor((now - c.createdAt.getTime()) / DAY),
        daysInStage: Math.floor((now - c.stageChangedAt.getTime()) / DAY),
        durationDays: Math.max(0, Math.round(((end - c.createdAt.getTime()) / DAY) * 10) / 10),
        avgMinutes: a.secN ? Math.round(a.secSum / a.secN / 60) : null,
      };
    })
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  // Pendientes del usuario: lo que le toca según quién es responsable de cada proceso (sin responsable → por rol).
  const isAdmin = actor.role === 'admin';
  const tasks: BoardTask[] = [];
  for (const c of out) {
    const row = rows.find((r) => r.id === c.id)!;
    const evalOwner = row.ownerEvaluationId ?? row.responsibleUserId;
    const mineEval = evalOwner ? evalOwner === actor.id : actor.role === 'psychologist' || isAdmin;
    const mineApp = row.ownerApplicationId ? row.ownerApplicationId === actor.id : actor.role === 'assistant' || isAdmin;
    const mineDelivery = (row.ownerDeliveryId ?? evalOwner) ? (row.ownerDeliveryId ?? evalOwner) === actor.id : actor.role === 'psychologist' || isAdmin;
    const base = { campaignId: c.id, campaignName: c.name, companyName: c.companyName };
    if (c.stage === 'in_progress' && mineApp) {
      if (c.stats.started > 0 && c.stats.inProgress === 0 && c.status === 'open') tasks.push({ ...base, kind: 'close', count: c.stats.completed, text: `Todas las personas terminaron (${c.stats.completed}). Cierra la campaña para pasarla a revisión.` });
      else tasks.push({ ...base, kind: 'in_progress', count: c.stats.inProgress, text: `${c.stats.completed} de ${c.stats.started} personas terminaron; ${c.stats.inProgress} siguen respondiendo.` });
    }
    if ((c.stage === 'finished' || c.stage === 'in_evaluation') && mineEval) {
      const left = c.review.pending + c.review.in_review;
      if (left > 0) tasks.push({ ...base, kind: 'review', count: left, text: `${left} ${left === 1 ? 'persona espera' : 'personas esperan'} evaluación psicométrica.` });
      else if (c.stats.completed > 0) tasks.push({ ...base, kind: 'mark_evaluated', count: 0, text: 'Todas las personas están evaluadas: marca la campaña como evaluada.' });
    }
    if (c.stage === 'evaluated' && mineDelivery) tasks.push({ ...base, kind: 'deliver', count: 0, text: 'Evaluación lista: entrega el informe a la empresa.' });
  }
  return { campaigns: out, tasks };
}

const safeDecrypt = (crypto: Crypto, enc: string) => {
  try {
    return crypto.decrypt(enc);
  } catch {
    return '';
  }
};

export interface AlertItem { key: string; severity: 'info' | 'warn'; text: string; campaignId?: string }

export async function loadAlertSettings(db: Db): Promise<AlertSettings> {
  const s = await getSetting<Partial<AlertSettings>>(db, 'alerts', {});
  return { enabled: { ...DEFAULT_ALERT_SETTINGS.enabled, ...(s.enabled ?? {}) }, threshold: { ...DEFAULT_ALERT_SETTINGS.threshold, ...(s.threshold ?? {}) }, dailyEmail: s.dailyEmail ?? DEFAULT_ALERT_SETTINGS.dailyEmail };
}

const fill = (tpl: string, n: number, days: number) => tpl.replace('{n}', String(n)).replace('{days}', String(days));

/** Alertas del usuario según las reglas y umbrales que configuró el administrador. */
export async function buildAlerts(db: Db, crypto: Crypto, actor: { id: string; role: string }): Promise<AlertItem[]> {
  const settings = await loadAlertSettings(db);
  const { campaigns: list } = await loadBoard(db, crypto, actor);
  const rule = (key: string) => ALERT_RULES.find((r) => r.key === key)!;
  const on = (key: string) => settings.enabled[key] !== false && (rule(key).roles === 'admin+psychologist' ? actor.role === 'admin' || actor.role === 'psychologist' : (rule(key).roles as string[]).includes(actor.role));
  const th = (key: string) => settings.threshold[key] ?? rule(key).defaultThreshold;
  const out: AlertItem[] = [];

  if (on('review_pending')) {
    const pending = list.filter((c) => c.stage === 'finished' || c.stage === 'in_evaluation');
    const n = pending.reduce((s, c) => s + c.review.pending + c.review.in_review, 0);
    if (n >= th('review_pending')) out.push({ key: 'review_pending', severity: 'warn', text: fill(rule('review_pending').template, n, 0) });
  }
  if (on('formatos_pending') || on('formatos_ready')) {
    const notes = await formatoNotes(db, actor);
    const pend = notes.pending.reduce((s, x) => s + x.count, 0);
    const ready = notes.ready.reduce((s, x) => s + x.count, 0);
    if (on('formatos_pending') && pend >= th('formatos_pending')) out.push({ key: 'formatos_pending', severity: 'warn', text: fill(rule('formatos_pending').template, pend, 0) });
    if (on('formatos_ready') && ready >= th('formatos_ready')) out.push({ key: 'formatos_ready', severity: 'info', text: fill(rule('formatos_ready').template, ready, 0) });
  }
  if (on('campaign_idle')) {
    const days = th('campaign_idle');
    const idle = list.filter((c) => c.stage === 'in_progress' && c.daysInStage >= days);
    if (idle.length) out.push({ key: 'campaign_idle', severity: 'info', text: fill(rule('campaign_idle').template, idle.length, days), campaignId: idle.length === 1 ? idle[0]!.id : undefined });
  }
  if (on('evaluation_slow')) {
    const days = th('evaluation_slow');
    const slow = list.filter((c) => (c.stage === 'finished' || c.stage === 'in_evaluation') && c.daysInStage >= days);
    if (slow.length) out.push({ key: 'evaluation_slow', severity: 'warn', text: fill(rule('evaluation_slow').template, slow.length, days), campaignId: slow.length === 1 ? slow[0]!.id : undefined });
  }
  if (on('stuck_participants') && list.length) {
    const hours = th('stuck_participants');
    const cutoff = new Date(Date.now() - hours * 3_600_000);
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(participants)
      .where(and(inArray(participants.campaignId, list.map((c) => c.id)), eq(participants.status, 'in_progress'), lt(participants.createdAt, cutoff)));
    if (r && r.n > 0) out.push({ key: 'stuck_participants', severity: 'info', text: fill(rule('stuck_participants').template, r.n, hours) });
  }
  return out;
}

/** Tiempos de respuesta de una campaña: total por persona y por evaluación (en minutos). */
export async function responseTimes(db: Db, campaignId: string) {
  const per = await db
    .select({
      instrument: questionnaireAnswers.instrument,
      n: sql<number>`count(*)::int`,
      avgSec: sql<number>`avg(extract(epoch from (${questionnaireAnswers.completedAt} - ${questionnaireAnswers.startedAt})))::float`,
      medSec: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from (${questionnaireAnswers.completedAt} - ${questionnaireAnswers.startedAt})))::float`,
      maxSec: sql<number>`max(extract(epoch from (${questionnaireAnswers.completedAt} - ${questionnaireAnswers.startedAt})))::float`,
    })
    .from(questionnaireAnswers)
    .innerJoin(participants, eq(participants.id, questionnaireAnswers.participantId))
    .where(and(eq(participants.campaignId, campaignId), eq(questionnaireAnswers.complete, true), sql`${questionnaireAnswers.completedAt} is not null`))
    .groupBy(questionnaireAnswers.instrument);
  const [tot] = await db
    .select({
      n: sql<number>`count(*)::int`,
      avgSec: sql<number | null>`avg(extract(epoch from (${participants.submittedAt} - ${participants.createdAt})))::float`,
      medSec: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${participants.submittedAt} - ${participants.createdAt})))::float`,
      maxSec: sql<number | null>`max(extract(epoch from (${participants.submittedAt} - ${participants.createdAt})))::float`,
    })
    .from(participants)
    .where(and(eq(participants.campaignId, campaignId), eq(participants.status, 'completed'), sql`${participants.submittedAt} is not null`));
  const min = (s: number | null | undefined) => (s == null ? null : Math.round((s / 60) * 10) / 10);
  return {
    total: { n: tot?.n ?? 0, avgMinutes: min(tot?.avgSec), medianMinutes: min(tot?.medSec), maxMinutes: min(tot?.maxSec) },
    byInstrument: per.map((p) => ({ instrument: p.instrument, n: p.n, avgMinutes: min(p.avgSec), medianMinutes: min(p.medSec), maxMinutes: min(p.maxSec) })),
  };
}

export { WORKFLOW_LABEL };
