import { and, eq } from 'drizzle-orm';
import { FORMATOS, isClqLevel, type FichaAnswers, type FormatoData, type FormatoKind } from '@sanithelp/shared';
import type { Db } from '../db/client.js';
import { companies, fichaAnswers, manualResults, type participants } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';
import { acrofobiaView, clqView, loadAcrofobia, loadClq, type AcrofobiaRecord, type ClqRecord } from './ocupacionales.js';
import { nameParts } from './names.js';

type Participant = typeof participants.$inferSelect;

export const formatoInstrument = (kind: FormatoKind) => `formato_${kind}`;

export interface FormatoContext {
  kind: FormatoKind;
  person: { document: string; fullName: string };
  /** Datos que se precargan desde la ficha (la psicóloga los puede corregir). */
  prefill: { nombre: string; edad: string; cargo: string; empresa: string; fecha: string };
  /** Resultado del cuestionario (null si la persona aún no lo completa). */
  record: AcrofobiaRecord | ClqRecord | null;
  saved: { data: FormatoData; savedAt: string } | null;
}

/** Reúne lo que necesita la psicóloga para diligenciar el formato: precarga, resultados del test y lo ya guardado. */
export async function loadFormatoContext(db: Db, crypto: Crypto, p: Participant, kind: FormatoKind): Promise<FormatoContext> {
  const [f] = await db.select().from(fichaAnswers).where(eq(fichaAnswers.participantId, p.id)).limit(1);
  const ficha = f ? (JSON.parse(crypto.decrypt(f.dataEnc)) as FichaAnswers) : ({} as FichaAnswers);
  const [co] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, p.companyId)).limit(1);
  const nm = nameParts(crypto, p);
  const birth = typeof ficha['3'] === 'number' ? ficha['3'] : null;
  const now = new Date();
  const record = FORMATOS[kind].assessment === 'acrofobia' ? (await loadAcrofobia(db, crypto, p.campaignId, p.id))[0] ?? null : (await loadClq(db, crypto, p.campaignId, p.id))[0] ?? null;
  const [m] = await db
    .select()
    .from(manualResults)
    .where(and(eq(manualResults.participantId, p.id), eq(manualResults.instrument, formatoInstrument(kind))))
    .limit(1);
  return {
    kind,
    person: { document: crypto.decrypt(p.documentEnc), fullName: nm.full },
    prefill: {
      nombre: nm.full,
      edad: birth && birth > 1900 ? String(now.getFullYear() - birth) : '',
      cargo: typeof ficha['13'] === 'string' ? ficha['13'] : '',
      empresa: co?.name ?? '',
      fecha: `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
    },
    record,
    saved: m ? { data: JSON.parse(crypto.decrypt(m.dataEnc)) as FormatoData, savedAt: m.updatedAt.toISOString() } : null,
  };
}

/** Resultados del test, en la forma que ve la psicóloga junto al formato. */
export function formatoTestView(kind: FormatoKind, record: AcrofobiaRecord | ClqRecord | null) {
  if (!record) return null;
  return kind === 'alturas' ? { type: 'acrofobia' as const, ...acrofobiaView(record as AcrofobiaRecord) } : { type: 'clq' as const, ...clqView(record as ClqRecord) };
}

export { isClqLevel };
