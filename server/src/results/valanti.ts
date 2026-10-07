import { VALANTI_PAIRS } from '@sanithelp/shared';
import { VALANTI_DESCRIPTIONS, VALANTI_NORM, VALANTI_NORM_LABEL, scoreValanti, type ValantiResult } from '@sanithelp/scoring';
import type { Db } from '../db/client.js';
import type { Crypto } from '../security/crypto.js';
import { loadIndividual, type IndividualRecord } from './individual.js';

export interface ValantiRecord extends IndividualRecord {
  result: ValantiResult;
}

/** Resultados VALANTI de las participaciones completadas de una campaña (califica al consultar). */
export async function loadValanti(db: Db, crypto: Crypto, campaignId: string, onlyParticipant?: string): Promise<ValantiRecord[]> {
  return (await loadIndividual(db, crypto, campaignId, 'valanti', onlyParticipant)).map((r) => ({ ...r, result: scoreValanti(r.answers) }));
}

export function valantiView(rec: ValantiRecord) {
  const r = rec.result;
  return {
    participantId: rec.participantId,
    person: { document: rec.document, fullName: rec.fullName },
    date: rec.date,
    total: r.total,
    part1: r.part1,
    part2: r.part2,
    standard: r.standard,
    distance: r.distance,
    band: r.band,
    preferred: r.preferred,
    normValidated: r.normValidated,
    normLabel: VALANTI_NORM_LABEL,
    norm: VALANTI_NORM,
    descriptions: VALANTI_DESCRIPTIONS,
    pairs: VALANTI_PAIRS.length,
  };
}
