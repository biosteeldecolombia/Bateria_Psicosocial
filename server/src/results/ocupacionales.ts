import { and, eq, inArray } from 'drizzle-orm';
import { isClqLevel, type ClqLevel } from '@sanithelp/shared';
import { scoreAcrofobia, scoreClq, type AcroResult, type ClqResult } from '@sanithelp/scoring';
import type { Db } from '../db/client.js';
import { manualResults } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';
import { loadIndividual, type IndividualRecord } from './individual.js';

export interface AcrofobiaRecord extends IndividualRecord {
  result: AcroResult;
}
export interface ClqRecord extends IndividualRecord {
  result: ClqResult;
  /** Interpretación marcada por la psicóloga (null mientras no la marque). */
  level: ClqLevel | null;
  markedAt: string | null;
}

/** Acrofobia de Cohen de las participaciones completadas (califica al consultar). */
export async function loadAcrofobia(db: Db, crypto: Crypto, campaignId: string, onlyParticipant?: string): Promise<AcrofobiaRecord[]> {
  return (await loadIndividual(db, crypto, campaignId, 'acrofobia', onlyParticipant)).map((r) => ({ ...r, result: scoreAcrofobia(r.answers) }));
}

/** CLQ de las participaciones completadas, con la interpretación que marcó la psicóloga. */
export async function loadClq(db: Db, crypto: Crypto, campaignId: string, onlyParticipant?: string): Promise<ClqRecord[]> {
  const recs = await loadIndividual(db, crypto, campaignId, 'claustrofobia', onlyParticipant);
  if (!recs.length) return [];
  const rows = await db.select().from(manualResults).where(and(inArray(manualResults.participantId, recs.map((r) => r.participantId)), eq(manualResults.instrument, 'claustrofobia')));
  const by = new Map(rows.map((r) => [r.participantId, r]));
  return recs.map((r) => {
    const m = by.get(r.participantId);
    const level = m ? (JSON.parse(crypto.decrypt(m.dataEnc)) as { level?: unknown }).level : null;
    return { ...r, result: scoreClq(r.answers), level: isClqLevel(level) ? level : null, markedAt: m ? m.updatedAt.toISOString().slice(0, 10) : null };
  });
}

export const acrofobiaView = (rec: AcrofobiaRecord) => ({
  participantId: rec.participantId,
  person: { document: rec.document, fullName: rec.fullName },
  date: rec.date,
  anxiety: rec.result.anxiety,
  avoidance: rec.result.avoidance,
  items: rec.result.items,
});

export const clqView = (rec: ClqRecord) => ({
  participantId: rec.participantId,
  person: { document: rec.document, fullName: rec.fullName },
  date: rec.date,
  total: rec.result.total,
  max: rec.result.max,
  level: rec.level,
  markedAt: rec.markedAt,
  answers: Array.from({ length: 26 }, (_, i) => rec.answers[i + 1] ?? null),
});
