import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { nameParts } from '../results/names.js';
import { and, eq, inArray } from 'drizzle-orm';
import { DISC_DATA_VERSION, PF16_ITEMS } from '@sanithelp/shared';
import {
  DOMAIN_BLOCKS,
  GROUPING_FIELDS,
  INTERVENTION_LEVELS,
  INTRA_LEVELS,
  RPS_HEADERS,
  STRESS_LEVELS,
  domainTables,
  filterRows,
  groupValues,
  interventionIndex,
  summaryTotal,
  type GroupingField,
  type RpsRow,
} from '@sanithelp/scoring';
import { consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import { audit } from '../auth/service.js';
import { manageableCampaign } from '../auth/access.js';
import { clinicalAccess as clinical } from '../auth/clinical.js';
import { loadRecords } from '../results/service.js';
import { discView, loadDisc } from '../results/disc.js';
import { loadValanti, valantiView } from '../results/valanti.js';
import { loadIndividual } from '../results/individual.js';
import { newResumeCode, normalizeCode } from './participation.js';

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Evita inyección de fórmulas al abrir en Excel
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Análisis de resultados para el profesional responsable, con la estructura de los resúmenes del libro oficial.
 * Solo personal con permiso sobre la empresa; el administrador debe dejar una justificación (queda en la auditoría).
 */
export const resultsRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const staff = app.requireReady('admin', 'psychologist');

  const clinicalAccess = (req: FastifyRequest, reply: FastifyReply, campaignId: string) => clinical(db, req, reply, campaignId);

  const field = (q: unknown): GroupingField | null => {
    const f = (q as { field?: string }).field;
    return GROUPING_FIELDS.includes(f as GroupingField) ? (f as GroupingField) : null;
  };

  app.get('/campaigns/:id/participants', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const c = await manageableCampaign(db, actor.id, actor.role, id);
    if (!c) return reply.code(404).send({ error: 'Campaña no encontrada' });
    // El listado muestra identidad y estado (no resultados), así que el administrador puede verlo para soporte.
    const parts = await db.select().from(participants).where(eq(participants.campaignId, c.id));
    const ids = parts.map((p) => p.id);
    const cons = ids.length ? await db.select().from(consents).where(inArray(consents.participantId, ids)) : [];
    const fichas = ids.length ? await db.select().from(fichaAnswers).where(inArray(fichaAnswers.participantId, ids)) : [];
    const qs = ids.length ? await db.select({ participantId: questionnaireAnswers.participantId, instrument: questionnaireAnswers.instrument, complete: questionnaireAnswers.complete }).from(questionnaireAnswers).where(inArray(questionnaireAnswers.participantId, ids)) : [];
    // DISC guardado con los grupos antiguos: no cuenta como respondido y se ofrece repetirlo
    const staleDisc = new Set<string>();
    if (ids.length) {
      for (const r of await db.select({ participantId: questionnaireAnswers.participantId, dataEnc: questionnaireAnswers.dataEnc }).from(questionnaireAnswers).where(and(inArray(questionnaireAnswers.participantId, ids), eq(questionnaireAnswers.instrument, 'disc')))) {
        if ((JSON.parse(crypto.decrypt(r.dataEnc)) as { v?: number }).v !== DISC_DATA_VERSION) staleDisc.add(r.participantId);
      }
    }
    const consentBy = new Map(cons.map((x) => [x.participantId, x]));
    const fichaBy = new Map(fichas.map((x) => [x.participantId, x.complete]));
    await audit(db, actor.id, 'participants.listed', { type: 'campaign', id: c.id });
    return parts
      .map((p) => {
        const cs = consentBy.get(p.id);
        const done = qs.filter((q) => q.participantId === p.id && q.complete && !(q.instrument === 'disc' && staleDisc.has(p.id))).map((q) => q.instrument);
        return {
          id: p.id,
          document: crypto.decrypt(p.documentEnc),
          fullName: nameParts(crypto, p).full,
          status: p.status,
          consent: cs ? (cs.revokedAt ? 'revoked' : cs.decision) : null,
          form: p.form,
          progress: { ficha: fichaBy.get(p.id) ?? false, intralaboral: done.some((x) => x.startsWith('intra')), extralaboral: done.includes('extra'), estres: done.includes('stress'), disc: done.includes('disc'), discOutdated: staleDisc.has(p.id), valanti: done.includes('valanti'), pf16: done.includes('pf16') },
          startedAt: p.createdAt,
          submittedAt: p.submittedAt,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  });

  /** Nuevo código personal cuando la persona perdió el suyo. Se muestra una sola vez. */
  app.post('/participants/:id/reset-code', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const actor = req.auth!.user;
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    const c = p ? await manageableCampaign(db, actor.id, actor.role, p.campaignId) : null;
    if (!p || !c) return reply.code(404).send({ error: 'Participante no encontrado' });
    if (p.status === 'completed') return reply.code(409).send({ error: 'Esta participación ya fue enviada.' });
    const code = newResumeCode();
    await db.update(participants).set({ resumeCodeHash: crypto.hashToken(normalizeCode(code)), resumeFailedAttempts: 0, resumeLockedUntil: null }).where(eq(participants.id, id));
    await audit(db, actor.id, 'participant.code_reset', { type: 'participant', id });
    return { resumeCode: code };
  });

  /** Registro individual: una fila por persona con las 101 columnas de la hoja DatosRPS del libro. */
  app.get('/campaigns/:id/results', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const recs = await loadRecords(db, crypto, c.id);
    await audit(db, req.auth!.user.id, 'results.viewed', { type: 'campaign', id: c.id }, { people: recs.length });
    return { headers: RPS_HEADERS, rows: recs.map((r) => r.row), participantIds: recs.map((r) => r.participantId) };
  });

  app.get('/campaigns/:id/results.csv', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const recs = await loadRecords(db, crypto, c.id);
    const lines = [RPS_HEADERS.map(csvCell).join(';'), ...recs.map((r) => r.row.map(csvCell).join(';'))];
    await audit(db, req.auth!.user.id, 'results.exported', { type: 'campaign', id: c.id }, { people: recs.length, format: 'csv' });
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="DatosRPS.csv"')
      .send('﻿' + lines.join('\r\n'));
  });

  /** ResTOT / ResTOT2: distribución por nivel de riesgo, opcionalmente para un grupo. */
  app.get('/campaigns/:id/summary', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const f = field(req.query);
    const value = String((req.query as { value?: string }).value ?? '*');
    const all = (await loadRecords(db, crypto, c.id)).map((r) => r.row);
    const rows = filterRows(all, f, value);
    await audit(db, req.auth!.user.id, 'results.summary', { type: 'campaign', id: c.id });
    return { levels: { intra: INTRA_LEVELS, stress: STRESS_LEVELS }, field: f, value, summary: summaryTotal(rows) };
  });

  app.get('/campaigns/:id/groups', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const f = field(req.query);
    if (!f) return { fields: GROUPING_FIELDS, values: [] };
    const all = (await loadRecords(db, crypto, c.id)).map((r) => r.row);
    return { fields: GROUPING_FIELDS, values: groupValues(all, f) };
  });

  /** TD_DomDim: por dominio y dimensión, personas por nivel y nivel de intervención requerido. */
  app.get('/campaigns/:id/domains', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const f = field(req.query);
    const value = String((req.query as { value?: string }).value ?? '*');
    const all = (await loadRecords(db, crypto, c.id)).map((r) => r.row);
    const rows = filterRows(all, f, value);
    await audit(db, req.auth!.user.id, 'results.domains', { type: 'campaign', id: c.id });
    return { field: f, value, people: rows.length, interventionLevels: INTERVENTION_LEVELS, tables: domainTables(rows) };
  });

  /** DISC: perfil de cada persona que completó la prueba (para la psicóloga). */
  app.get('/campaigns/:id/disc', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const recs = await loadDisc(db, crypto, c.id);
    await audit(db, req.auth!.user.id, 'results.disc_viewed', { type: 'campaign', id: c.id }, { people: recs.length });
    return { people: recs.map(discView) };
  });

  /** VALANTI: perfil de valores de cada persona que completó la prueba (para la psicóloga). */
  app.get('/campaigns/:id/valanti', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const recs = await loadValanti(db, crypto, c.id);
    await audit(db, req.auth!.user.id, 'results.valanti_viewed', { type: 'campaign', id: c.id }, { people: recs.length });
    return { people: recs.map(valantiView) };
  });

  /** 16PF: quién completó el cuestionario (la calificación no está incluida: requiere las plantillas y baremos del editor). */
  app.get('/campaigns/:id/pf16', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const recs = await loadIndividual(db, crypto, c.id, 'pf16');
    await audit(db, req.auth!.user.id, 'results.pf16_viewed', { type: 'campaign', id: c.id }, { people: recs.length });
    return { people: recs.map((r) => ({ participantId: r.participantId, person: { document: r.document, fullName: r.fullName }, date: r.date, answered: Object.keys(r.answers).length, answers: PF16_ITEMS.map((_, i) => (r.answers[i + 1] === undefined ? '-' : 'ABC'[r.answers[i + 1]!])).join('') })) };
  });

  /**
   * Respuestas del 16PF para la corrección en la plataforma del editor: una fila por persona, una columna por cuestión
   * con 1 (A), 2 (B), 3 (C) o 0 (en blanco).
   */
  app.get('/campaigns/:id/pf16.csv', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await clinicalAccess(req, reply, id);
    if (!c) return;
    const recs = await loadIndividual(db, crypto, c.id, 'pf16');
    const head = ['Documento', 'Nombre', ...PF16_ITEMS.map((_, i) => String(i + 1))];
    const lines = [head.map(csvCell).join(';'), ...recs.map((r) => [r.document, r.fullName, ...PF16_ITEMS.map((_, i) => (r.answers[i + 1] === undefined ? 0 : r.answers[i + 1]! + 1))].map(csvCell).join(';'))];
    await audit(db, req.auth!.user.id, 'results.exported', { type: 'campaign', id: c.id }, { people: recs.length, format: 'csv-pf16' });
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="Respuestas16PF.csv"')
      .send('﻿' + lines.join('\r\n'));
  });

  /** Informe individual de una persona (para la psicóloga). */
  app.get('/participants/:id/report', { preHandler: staff }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const [p] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(participants).where(eq(participants.id, id)).limit(1) : [];
    if (!p) return reply.code(404).send({ error: 'Participante no encontrado' });
    const c = await clinicalAccess(req, reply, p.campaignId);
    if (!c) return;
    const [rec] = await loadRecords(db, crypto, c.id, id);
    if (!rec) return reply.code(404).send({ error: 'Esta persona aún no tiene resultados (no ha enviado la batería).' });
    await audit(db, req.auth!.user.id, 'results.individual_viewed', { type: 'participant', id });
    const rowsByHeader = new Map(RPS_HEADERS.map((h, i) => [h, rec.row[i]]));
    const blocks = DOMAIN_BLOCKS.map((b) => ({
      title: b.title,
      rows: b.rows.map((d) => {
        const level = String(rowsByHeader.get(d.column) ?? '');
        const li = b.levels.findIndex((l) => l.toLowerCase() === level.toLowerCase());
        const counts = b.levels.map((_, i) => (i === li ? 1 : 0));
        return { label: d.label, kind: d.kind, level, levelIndex: li, intervention: INTERVENTION_LEVELS[interventionIndex(counts)] };
      }),
    }));
    return {
      participantId: id,
      engineVersion: 'rcg-08k/1',
      form: rec.full.form,
      person: { document: rec.personal.document, fullName: rec.personal.fullName },
      scores: {
        intralaboral: { transformed: rec.full.intra.total.transformed, raw: rec.full.intra.total.raw, level: rec.full.intra.total.level },
        extralaboral: { transformed: rec.full.extra.total.transformed, raw: rec.full.extra.total.raw, level: rec.full.extra.total.level },
        total: rec.full.total,
        stress: rec.full.stress,
      },
      dimensions: [...rec.full.intra.rows, ...rec.full.extra.rows].map((r) => ({ id: r.id, name: r.name, kind: r.kind, raw: r.raw, transformed: r.transformed, level: r.level })),
      blocks,
    };
  });
};
