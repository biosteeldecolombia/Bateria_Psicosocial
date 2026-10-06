import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { nameParts } from '../results/names.js';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
  CONSENT_BLOCKS,
  CONSENT_DATE,
  CONSENT_OPTIONS,
  CONSENT_VERSION,
  FICHA,
  QUESTIONNAIRES,
  applicableItems,
  formFromCargo,
  questionnairesFor,
  validateFicha,
  type FichaAnswers,
  type QuestionnaireId,
} from '@sanithelp/shared';
import { consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import { audit } from '../auth/service.js';

/** Hash del texto exacto que se muestra, para dejar constancia de qué versión aceptó la persona. */
export const CONSENT_TEXT_HASH = createHash('sha256')
  .update(JSON.stringify({ v: CONSENT_VERSION, d: CONSENT_DATE, b: CONSENT_BLOCKS, o: CONSENT_OPTIONS }))
  .digest('hex');

interface StoredQ {
  answers: Record<string, number>;
  gates: { clients?: boolean; boss?: boolean };
}

const isId = (v: unknown): v is QuestionnaireId => typeof v === 'string' && v in QUESTIONNAIRES;

/**
 * Flujo del colaborador: consentimiento → ficha → cuestionarios → envío.
 * IMPORTANTE: ninguna respuesta de esta API contiene puntajes, niveles ni mensajes de riesgo.
 */
export const flowRoutes: FastifyPluginAsync = async (app) => {
  const { db, crypto } = app.appCtx;
  const only = app.requireReady('collaborator');

  /** Participante de la sesión, o responde 409 si todavía no se ha identificado. */
  async function me(req: FastifyRequest, reply: FastifyReply) {
    const pid = req.auth?.session.participantId;
    const [p] = pid ? await db.select().from(participants).where(eq(participants.id, pid)).limit(1) : [];
    if (!p || p.campaignId !== req.auth!.user.campaignId) {
      reply.code(409).send({ error: 'Primero identifícate para continuar.' });
      return null;
    }
    return p;
  }
  const closed = (reply: FastifyReply) => reply.code(409).send({ error: 'Esta participación ya no admite cambios.' });

  async function consentOf(pid: string) {
    const [c] = await db.select().from(consents).where(eq(consents.participantId, pid)).limit(1);
    return c ?? null;
  }
  async function fichaOf(pid: string) {
    const [f] = await db.select().from(fichaAnswers).where(eq(fichaAnswers.participantId, pid)).limit(1);
    return f ? { data: JSON.parse(crypto.decrypt(f.dataEnc)) as FichaAnswers, complete: f.complete } : { data: {} as FichaAnswers, complete: false };
  }
  async function qOf(pid: string, id: QuestionnaireId) {
    const [r] = await db.select().from(questionnaireAnswers).where(and(eq(questionnaireAnswers.participantId, pid), eq(questionnaireAnswers.instrument, id))).limit(1);
    return r ? { data: JSON.parse(crypto.decrypt(r.dataEnc)) as StoredQ, complete: r.complete } : { data: { answers: {}, gates: {} } as StoredQ, complete: false };
  }

  /** Estado del avance. Solo estados y conteos de preguntas respondidas: nunca resultados. */
  async function stateOf(p: typeof participants.$inferSelect) {
    const c = await consentOf(p.id);
    const f = await fichaOf(p.id);
    const out: {
      status: string;
      consent: 'authorized' | 'declined' | 'revoked' | null;
      ficha: { complete: boolean };
      form: 'A' | 'B' | null;
      questionnaires: { id: QuestionnaireId; complete: boolean; answered: number; total: number }[];
      canSubmit: boolean;
    } = {
      status: p.status,
      consent: c ? (c.revokedAt ? 'revoked' : c.decision) : null,
      ficha: { complete: f.complete },
      form: p.form,
      questionnaires: [],
      canSubmit: false,
    };
    if (p.form) {
      for (const id of questionnairesFor(p.form)) {
        const q = await qOf(p.id, id);
        const total = applicableItems(QUESTIONNAIRES[id], q.data.gates).length;
        out.questionnaires.push({ id, complete: q.complete, answered: Object.keys(q.data.answers).length, total });
      }
      out.canSubmit = out.consent === 'authorized' && f.complete && out.questionnaires.every((q) => q.complete);
    }
    return out;
  }

  app.get('/state', { preHandler: only }, async (req, reply) => {
    const p = await me(req, reply);
    return p ? stateOf(p) : undefined;
  });

  // ---------- Consentimiento ----------
  app.get('/consent', { preHandler: only }, async (req, reply) => {
    const p = await me(req, reply);
    if (!p) return;
    return {
      version: CONSENT_VERSION,
      date: CONSENT_DATE,
      hash: CONSENT_TEXT_HASH,
      fullName: nameParts(crypto, p).full,
      document: crypto.decrypt(p.documentEnc),
      decision: (await consentOf(p.id))?.decision ?? null,
    };
  });

  app.post('/consent', { preHandler: only }, async (req, reply) => {
    const p = await me(req, reply);
    if (!p) return;
    const b = (req.body ?? {}) as { decision?: unknown; hash?: unknown };
    if ((b.decision !== 'authorized' && b.decision !== 'declined') || b.hash !== CONSENT_TEXT_HASH) {
      return reply.code(400).send({ error: 'Debes elegir una opción y haber leído la versión vigente del documento.' });
    }
    if (p.status !== 'in_progress' || (await consentOf(p.id))) return closed(reply);
    await db.insert(consents).values({ participantId: p.id, decision: b.decision, version: CONSENT_VERSION, textHash: CONSENT_TEXT_HASH });
    if (b.decision === 'declined') await db.update(participants).set({ status: 'declined' }).where(eq(participants.id, p.id));
    await audit(db, req.auth!.user.id, b.decision === 'authorized' ? 'consent.authorized' : 'consent.declined', { type: 'participant', id: p.id });
    return stateOf({ ...p, status: b.decision === 'declined' ? 'declined' : p.status });
  });

  /** Verifica que el participante puede escribir (consentimiento autorizado y participación abierta). */
  async function writable(req: FastifyRequest, reply: FastifyReply) {
    const p = await me(req, reply);
    if (!p) return null;
    const c = await consentOf(p.id);
    if (p.status !== 'in_progress' || !c || c.decision !== 'authorized' || c.revokedAt) {
      closed(reply);
      return null;
    }
    return p;
  }

  // ---------- Ficha de datos generales ----------
  app.get('/ficha', { preHandler: only }, async (req, reply) => {
    const p = await writable(req, reply);
    if (!p) return;
    const f = await fichaOf(p.id);
    // Se precarga el nombre y la identificación que la persona ya escribió; ella los confirma.
    if (f.data['1'] === undefined) f.data['1'] = nameParts(crypto, p).full;
    return { ...f, document: crypto.decrypt(p.documentEnc) };
  });

  app.put('/ficha', { preHandler: only, bodyLimit: 20_000 }, async (req, reply) => {
    const p = await writable(req, reply);
    if (!p) return;
    const b = (req.body ?? {}) as { data?: unknown; complete?: unknown };
    const complete = b.complete === true;
    const errors = validateFicha(b.data, complete);
    if (Object.keys(errors).length) return reply.code(400).send({ error: 'Revisa las respuestas marcadas.', errors });
    const data = b.data as FichaAnswers;
    const dataEnc = crypto.encrypt(JSON.stringify(data));
    await db
      .insert(fichaAnswers)
      .values({ participantId: p.id, dataEnc, complete })
      .onConflictDoUpdate({ target: fichaAnswers.participantId, set: { dataEnc, complete, updatedAt: new Date() } });
    if (complete) {
      const form = formFromCargo(String(data['14']));
      await db.update(participants).set({ form }).where(eq(participants.id, p.id));
      p.form = form;
    }
    return stateOf(p);
  });

  // ---------- Cuestionarios ----------
  async function guardQ(req: FastifyRequest, reply: FastifyReply) {
    const p = await writable(req, reply);
    if (!p) return null;
    const id = (req.params as { id?: string }).id;
    if (!isId(id)) {
      reply.code(404).send({ error: 'Cuestionario no encontrado' });
      return null;
    }
    const f = await fichaOf(p.id);
    if (!f.complete || !p.form) {
      reply.code(409).send({ error: 'Primero completa la ficha de datos generales.' });
      return null;
    }
    const order = questionnairesFor(p.form);
    const idx = order.indexOf(id);
    if (idx < 0) {
      reply.code(404).send({ error: 'Cuestionario no encontrado' });
      return null;
    }
    // Se responden en orden: el anterior debe estar completo.
    if (idx > 0 && !(await qOf(p.id, order[idx - 1]!)).complete) {
      reply.code(409).send({ error: 'Completa primero el cuestionario anterior.' });
      return null;
    }
    return { p, id };
  }

  app.get('/questionnaires/:id', { preHandler: only }, async (req, reply) => {
    const g = await guardQ(req, reply);
    if (!g) return;
    return qOf(g.p.id, g.id);
  });

  app.put('/questionnaires/:id', { preHandler: only, bodyLimit: 50_000 }, async (req, reply) => {
    const g = await guardQ(req, reply);
    if (!g) return;
    const def = QUESTIONNAIRES[g.id];
    if ((await qOf(g.p.id, g.id)).complete) return closed(reply);
    const b = (req.body ?? {}) as { answers?: Record<string, unknown>; gates?: Record<string, unknown>; complete?: unknown };
    const answers: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.answers ?? {})) {
      const n = Number(k);
      if (!Number.isInteger(n) || !def.items.some((it) => it.n === n) || typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= def.scale.length) {
        return reply.code(400).send({ error: 'Respuesta inválida.' });
      }
      answers[k] = v;
    }
    const gates: StoredQ['gates'] = {};
    for (const gate of def.gates) {
      const v = b.gates?.[gate.key];
      if (v !== undefined && typeof v !== 'boolean') return reply.code(400).send({ error: 'Respuesta inválida.' });
      if (typeof v === 'boolean') gates[gate.key] = v;
    }
    // Si una compuerta es "No", se descartan las respuestas de los ítems que ya no aplican.
    const applicable = new Set(applicableItems(def, gates).map((it) => String(it.n)));
    for (const k of Object.keys(answers)) if (!applicable.has(k)) delete answers[k];

    const complete = b.complete === true;
    if (complete) {
      const gatesDone = def.gates.every((gate) => typeof gates[gate.key] === 'boolean');
      const missing = [...applicable].filter((k) => answers[k] === undefined);
      if (!gatesDone || missing.length) {
        return reply.code(400).send({ error: 'Faltan preguntas por responder.', missing: missing.map(Number), gatesMissing: !gatesDone });
      }
    }
    const dataEnc = crypto.encrypt(JSON.stringify({ answers, gates } satisfies StoredQ));
    await db
      .insert(questionnaireAnswers)
      .values({ participantId: g.p.id, instrument: g.id, dataEnc, complete })
      .onConflictDoUpdate({ target: [questionnaireAnswers.participantId, questionnaireAnswers.instrument], set: { dataEnc, complete, updatedAt: new Date() } });
    return stateOf(g.p);
  });

  // ---------- Envío ----------
  app.post('/submit', { preHandler: only }, async (req, reply) => {
    const p = await writable(req, reply);
    if (!p) return;
    const s = await stateOf(p);
    if (!s.canSubmit) return reply.code(409).send({ error: 'Aún faltan secciones por completar.' });
    await db.update(participants).set({ status: 'completed', submittedAt: new Date() }).where(eq(participants.id, p.id));
    await audit(db, req.auth!.user.id, 'participant.submitted', { type: 'participant', id: p.id });
    // Solo "recibido": el colaborador nunca recibe resultados.
    return { received: true };
  });

  void FICHA;
};
