import { inArray } from 'drizzle-orm';
import { nameParts } from '../results/names.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { FichaAnswers, QuestionnaireId } from '@sanithelp/shared';
import type { Db } from '../db/client.js';
import { consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';
import { consentInto } from './consent.js';
import { fichaInto } from './ficha.js';
import { questionnaireInto } from './questionnaires.js';

export interface ExpedienteData {
  participantId: string;
  document: string;
  fullName: string;
  names: string;
  surnames: string;
  status: string;
  consent: { decision: 'authorized' | 'declined'; decidedAt: Date; version: string; textHash: string; revokedAt: Date | null } | null;
  ficha: { data: FichaAnswers; date: string } | null;
  questionnaires: { id: QuestionnaireId; answers: Record<number, number>; gates: { clients?: boolean; boss?: boolean }; date: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Carga y descifra los datos de varias participaciones con consultas por lote (sin N+1). */
export async function loadExpedientes(db: Db, crypto: Crypto, ids: string[]): Promise<ExpedienteData[]> {
  if (!ids.length) return [];
  const parts = await db.select().from(participants).where(inArray(participants.id, ids));
  const cons = new Map((await db.select().from(consents).where(inArray(consents.participantId, ids))).map((c) => [c.participantId, c]));
  const fich = new Map((await db.select().from(fichaAnswers).where(inArray(fichaAnswers.participantId, ids))).map((f) => [f.participantId, f]));
  const qs = new Map<string, (typeof questionnaireAnswers.$inferSelect)[]>();
  for (const q of await db.select().from(questionnaireAnswers).where(inArray(questionnaireAnswers.participantId, ids))) {
    qs.set(q.participantId, [...(qs.get(q.participantId) ?? []), q]);
  }
  const order: QuestionnaireId[] = ['intra_A', 'intra_B', 'extra', 'stress'];
  return parts.map((p) => {
    const c = cons.get(p.id);
    const f = fich.get(p.id);
    const list = (qs.get(p.id) ?? []).sort((a, b) => order.indexOf(a.instrument as QuestionnaireId) - order.indexOf(b.instrument as QuestionnaireId));
    return {
      participantId: p.id,
      document: crypto.decrypt(p.documentEnc),
      fullName: nameParts(crypto, p).full,
      names: nameParts(crypto, p).names,
      surnames: nameParts(crypto, p).surnames,
      status: p.status,
      consent: c ? { decision: c.decision, decidedAt: c.decidedAt, version: c.version, textHash: c.textHash, revokedAt: c.revokedAt } : null,
      ficha: f ? { data: JSON.parse(crypto.decrypt(f.dataEnc)) as FichaAnswers, date: iso(f.updatedAt) } : null,
      questionnaires: list.map((q) => {
        const d = JSON.parse(crypto.decrypt(q.dataEnc)) as { answers: Record<string, number>; gates: { clients?: boolean; boss?: boolean } };
        return { id: q.instrument as QuestionnaireId, answers: Object.fromEntries(Object.entries(d.answers).map(([k, v]) => [Number(k), v])), gates: d.gates, date: iso(q.updatedAt) };
      }),
    };
  });
}

export interface Professional {
  name?: string;
  document?: string;
  registry?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Expediente de respuestas de una persona, con el aspecto de las plantillas oficiales:
 * consentimiento (con constancia electrónica), ficha de datos generales y cuestionarios con las casillas marcadas.
 * NO incluye puntajes ni niveles de riesgo: es el soporte de las respuestas.
 */
export async function buildExpediente(e: ExpedienteData, professional: Professional, generatedAt: Date): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  if (e.consent) {
    await consentInto(out, { names: e.names, surnames: e.surnames, document: e.document, decision: e.consent.decision, decidedAt: e.consent.decidedAt, version: e.consent.version, textHash: e.consent.textHash, revokedAt: e.consent.revokedAt, professional });
  }
  if (e.consent?.decision === 'authorized') {
    if (e.ficha) await fichaInto(out, { data: e.ficha.data, date: e.ficha.date, document: e.document });
    for (const q of e.questionnaires) await questionnaireInto(out, { id: q.id, answers: q.answers, gates: q.gates, date: q.date, document: e.document });
  }
  // Pie de confidencialidad en todas las páginas
  const font = await out.embedFont(StandardFonts.Helvetica);
  const stamp = `Confidencial — uso exclusivo del profesional responsable · Generado el ${pad(generatedAt.getDate())}/${pad(generatedAt.getMonth() + 1)}/${generatedAt.getFullYear()} ${pad(generatedAt.getHours())}:${pad(generatedAt.getMinutes())}`;
  for (const pg of out.getPages()) {
    pg.drawText(stamp, { x: (pg.getWidth() - font.widthOfTextAtSize(stamp, 7)) / 2, y: 8, size: 7, font, color: rgb(0.45, 0.45, 0.5) });
  }
  out.setTitle('Expediente de respuestas — Batería de riesgo psicosocial');
  out.setProducer('Sanithelp');
  return out.save();
}
