import { and, eq, inArray } from 'drizzle-orm';
import { FICHA, type FichaAnswers } from '@sanithelp/shared';
import { buildRpsRow, scoreAll, type Answers, type FullResult, type Gates, type PersonalCodes, type RpsRow } from '@sanithelp/scoring';
import type { Db } from '../db/client.js';
import { fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';

export interface ResultRecord {
  participantId: string;
  personal: PersonalCodes;
  full: FullResult;
  row: RpsRow;
}

interface StoredQ {
  answers: Record<string, number>;
  gates: Gates;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const optionIndex = (n: number, v: unknown): number | undefined => {
  const q = FICHA.find((x) => x.n === n);
  if (!q || q.type !== 'single' || typeof v !== 'string') return undefined;
  const i = q.options.indexOf(v);
  return i < 0 ? undefined : i;
};

/** Ficha → códigos de DatosRPS (índices de opción y valores de texto). */
export function fichaToCodes(f: FichaAnswers, document: string, applicationDate: string): PersonalCodes {
  const place = (v: unknown) => (v && typeof v === 'object' ? (v as { city?: string; department?: string }) : {});
  const years = (v: unknown): number | undefined => {
    const y = v as { lessThanYear?: boolean; years?: number } | undefined;
    if (!y) return undefined;
    return y.lessThanYear ? -1 : y.years;
  };
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    document,
    fullName: str(f['1']) ?? '',
    applicationDate,
    sexo: optionIndex(2, f['2']),
    birthYear: num(f['3']),
    estadoCivil: optionIndex(4, f['4']),
    estudios: optionIndex(5, f['5']),
    profesion: str(f['6']),
    residenciaCiudad: place(f['7']).city,
    residenciaDpto: place(f['7']).department,
    estrato: optionIndex(8, f['8']),
    vivienda: optionIndex(9, f['9']),
    dependientes: num(f['10']),
    trabajoCiudad: place(f['11']).city,
    trabajoDpto: place(f['11']).department,
    antiguedadEmpresa: years(f['12']),
    cargo: str(f['13']),
    tipoCargo: optionIndex(14, f['14']),
    antiguedadCargo: years(f['15']),
    area: str(f['16']),
    contrato: optionIndex(17, f['17']),
    horasDia: num(f['18']),
    salario: optionIndex(19, f['19']),
  };
}

const toAnswers = (a: Record<string, number>): Answers => Object.fromEntries(Object.entries(a).map(([k, v]) => [Number(k), v]));

/** Calcula el resultado de las participaciones COMPLETADAS de una campaña (descifra y califica con el motor oficial). */
export async function loadRecords(db: Db, crypto: Crypto, campaignId: string, onlyParticipant?: string): Promise<ResultRecord[]> {
  const parts = await db
    .select()
    .from(participants)
    .where(and(eq(participants.campaignId, campaignId), eq(participants.status, 'completed'), ...(onlyParticipant ? [eq(participants.id, onlyParticipant)] : [])));
  if (!parts.length) return [];
  const ids = parts.map((p) => p.id);
  const fichas = new Map((await db.select().from(fichaAnswers).where(inArray(fichaAnswers.participantId, ids))).map((f) => [f.participantId, f]));
  const qs = new Map<string, Map<string, typeof questionnaireAnswers.$inferSelect>>();
  for (const q of await db.select().from(questionnaireAnswers).where(inArray(questionnaireAnswers.participantId, ids))) {
    if (!qs.has(q.participantId)) qs.set(q.participantId, new Map());
    qs.get(q.participantId)!.set(q.instrument, q);
  }
  const out: ResultRecord[] = [];
  for (const p of parts) {
    const f = fichas.get(p.id);
    const q = qs.get(p.id);
    const form = p.form;
    if (!f || !q || !form) continue;
    const intraQ = q.get(form === 'A' ? 'intra_A' : 'intra_B');
    const extraQ = q.get('extra');
    const stressQ = q.get('stress');
    if (!intraQ || !extraQ || !stressQ) continue;
    const ficha = JSON.parse(crypto.decrypt(f.dataEnc)) as FichaAnswers;
    const personal = fichaToCodes(ficha, crypto.decrypt(p.documentEnc), isoDate(f.updatedAt));
    if (personal.tipoCargo === undefined) continue;
    const di = JSON.parse(crypto.decrypt(intraQ.dataEnc)) as StoredQ;
    const de = JSON.parse(crypto.decrypt(extraQ.dataEnc)) as StoredQ;
    const ds = JSON.parse(crypto.decrypt(stressQ.dataEnc)) as StoredQ;
    const full = scoreAll({
      cargoIndex: personal.tipoCargo,
      intra: { answers: toAnswers(di.answers), gates: di.gates },
      extra: { answers: toAnswers(de.answers) },
      stress: { answers: toAnswers(ds.answers) },
    });
    const row = buildRpsRow(personal, full, { intra: isoDate(intraQ.updatedAt), extra: isoDate(extraQ.updatedAt), stress: isoDate(stressQ.updatedAt) });
    out.push({ participantId: p.id, personal, full, row });
  }
  return out;
}
