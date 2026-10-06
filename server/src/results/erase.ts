import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Db } from '../db/client.js';
import type { Crypto } from '../security/crypto.js';
import { consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';

/**
 * Suprime los datos de una persona: borra respuestas y ficha y deja el registro como «suprimido» (sin datos personales).
 * Se conserva únicamente la constancia del consentimiento, marcada como revocada.
 */
export async function eraseParticipant(db: Db, crypto: Crypto, participantId: string, actorId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(questionnaireAnswers).where(eq(questionnaireAnswers.participantId, participantId));
    await tx.delete(fichaAnswers).where(eq(fichaAnswers.participantId, participantId));
    await tx.update(consents).set({ revokedAt: new Date(), revokedBy: actorId }).where(eq(consents.participantId, participantId));
    await tx
      .update(participants)
      .set({
        status: 'revoked',
        documentBlind: crypto.blindIndex(`suprimido-${participantId}`),
        documentEnc: crypto.encrypt('SUPRIMIDO'),
        fullNameEnc: crypto.encrypt('Dato suprimido'),
        surnamesEnc: null,
        resumeCodeHash: crypto.hashToken(randomBytes(16).toString('hex')),
        form: null,
      })
      .where(eq(participants.id, participantId));
  });
}
