import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { consents, participants, questionnaireAnswers } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';
import { nameParts } from './names.js';

export interface IndividualRecord {
  participantId: string;
  document: string;
  fullName: string;
  date: string;
  /** Pregunta o grupo (desde 1) → número guardado. */
  answers: Record<number, number>;
}

/**
 * Respuestas de una evaluación individual (DISC, VALANTI…) de las participaciones COMPLETADAS de una campaña,
 * con consentimiento vigente y la evaluación terminada. Descifra al consultar.
 */
export async function loadIndividual(db: Db, crypto: Crypto, campaignId: string, instrument: string, onlyParticipant?: string): Promise<IndividualRecord[]> {
  const parts = await db
    .select()
    .from(participants)
    .where(and(eq(participants.campaignId, campaignId), eq(participants.status, 'completed'), ...(onlyParticipant ? [eq(participants.id, onlyParticipant)] : [])));
  if (!parts.length) return [];
  const ids = parts.map((p) => p.id);
  const noConsent = new Set((await db.select().from(consents).where(inArray(consents.participantId, ids))).filter((c) => c.revokedAt || c.decision !== 'authorized').map((c) => c.participantId));
  const rows = await db.select().from(questionnaireAnswers).where(and(inArray(questionnaireAnswers.participantId, ids), eq(questionnaireAnswers.instrument, instrument), eq(questionnaireAnswers.complete, true)));
  const byPerson = new Map(rows.map((r) => [r.participantId, r]));
  const out: IndividualRecord[] = [];
  for (const p of parts) {
    const r = byPerson.get(p.id);
    if (!r || noConsent.has(p.id)) continue;
    const stored = JSON.parse(crypto.decrypt(r.dataEnc)) as { answers: Record<string, number> };
    out.push({
      participantId: p.id,
      document: crypto.decrypt(p.documentEnc),
      fullName: nameParts(crypto, p).full,
      date: r.updatedAt.toISOString().slice(0, 10),
      answers: Object.fromEntries(Object.entries(stored.answers).map(([k, v]) => [Number(k), v])),
    });
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
}
