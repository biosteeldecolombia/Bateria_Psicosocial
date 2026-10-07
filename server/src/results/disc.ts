import { DISC_GROUPS } from '@sanithelp/shared';
import { scoreDisc, type DiscResult } from '@sanithelp/scoring';
import type { Db } from '../db/client.js';
import type { Crypto } from '../security/crypto.js';
import { loadIndividual, type IndividualRecord } from './individual.js';

export interface DiscRecord extends IndividualRecord {
  result: DiscResult;
}

/** Resultados DISC de las participaciones completadas de una campaña (califica al consultar). */
export async function loadDisc(db: Db, crypto: Crypto, campaignId: string, onlyParticipant?: string): Promise<DiscRecord[]> {
  return (await loadIndividual(db, crypto, campaignId, 'disc', onlyParticipant)).map((r) => ({ ...r, result: scoreDisc(r.answers) }));
}

/** Vista de una persona para la psicóloga: puntajes, segmentos, código y patrón de perfil con su descripción. */
export function discView(rec: DiscRecord) {
  const { result } = rec;
  return {
    participantId: rec.participantId,
    person: { document: rec.document, fullName: rec.fullName },
    date: rec.date,
    scores: result.scores,
    segments: result.segments,
    code: result.code,
    pattern: result.pattern,
    keyValidated: result.keyValidated,
    groups: DISC_GROUPS.length,
  };
}
