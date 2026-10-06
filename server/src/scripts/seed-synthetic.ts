// Datos SINTÉTICOS para demostración y pruebas de carga. Nunca usar con personas reales.
import { CARGO_OPTIONS, FICHA, QUESTIONNAIRES, applicableItems, formFromCargo, questionnairesFor, type FichaAnswers, type QuestionnaireId } from '@sanithelp/shared';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/client.js';
import { consents, fichaAnswers, participants, questionnaireAnswers } from '../db/schema.js';
import type { Crypto } from '../security/crypto.js';
import { CONSENT_TEXT_HASH } from '../routes/flow.js';
import { newResumeCode, normalizeCode } from '../routes/participation.js';

/** Generador pseudoaleatorio con semilla (reproducible). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AREAS = ['Producción', 'Administración', 'Calidad', 'Logística', 'Contabilidad', 'Talento Humano', 'Mantenimiento', 'Ventas'];
const CARGOS: Record<number, string[]> = {
  0: ['Jefe de área', 'Coordinador', 'Gerente de planta'],
  1: ['Analista', 'Ingeniero', 'Contador', 'Técnico de calidad'],
  2: ['Auxiliar administrativo', 'Asistente técnico', 'Auxiliar de bodega'],
  3: ['Operario', 'Ayudante de producción', 'Operador de máquina', 'Servicios generales'],
};
const CITIES: [string, string][] = [['Barranquilla', 'Atlántico'], ['Soledad', 'Atlántico'], ['Malambo', 'Atlántico'], ['Cartagena', 'Bolívar']];

export async function seedSynthetic(db: Db, crypto: Crypto, opts: { campaignId: string; companyId: string; count: number; seed?: number; startDoc?: number }) {
  const r = rng(opts.seed ?? 12345);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const startDoc = opts.startDoc ?? 90_000_000;
  const now = new Date();

  const partRows: (typeof participants.$inferInsert)[] = [];
  const consentRows: (typeof consents.$inferInsert)[] = [];
  const fichaRows: (typeof fichaAnswers.$inferInsert)[] = [];
  const qRows: (typeof questionnaireAnswers.$inferInsert)[] = [];

  for (let i = 0; i < opts.count; i++) {
    const uuid = randomUUID();
    const doc = String(startDoc + i);
    const name = `Participante Demo ${String(i + 1).padStart(3, '0')}`;
    const cargo = r() < 0.15 ? 0 : r() < 0.4 ? 1 : r() < 0.65 ? 2 : 3;
    const form = formFromCargo(CARGO_OPTIONS[cargo]!)!;
    const [city, dept] = pick(CITIES);
    const ficha: FichaAnswers = {
      '1': name,
      '2': r() < 0.55 ? 'Masculino' : 'Femenino',
      '3': 1960 + Math.floor(r() * 45),
      '4': pick(['Soltero (a)', 'Casado (a)', 'Unión libre', 'Separado (a)']),
      '5': pick(['Bachillerato completo', 'Técnico / tecnológico completo', 'Profesional completo', 'Primaria completa', 'Post-grado completo']),
      '6': pick(CARGOS[cargo]!),
      '7': { city, department: dept },
      '8': pick(['1', '2', '3', '4']),
      '9': pick(['Propia', 'En arriendo', 'Familiar']),
      '10': Math.floor(r() * 4),
      '11': { city: 'Barranquilla', department: 'Atlántico' },
      '12': r() < 0.2 ? { lessThanYear: true } : { lessThanYear: false, years: 1 + Math.floor(r() * 20) },
      '13': pick(CARGOS[cargo]!),
      '14': CARGO_OPTIONS[cargo]!,
      '15': r() < 0.3 ? { lessThanYear: true } : { lessThanYear: false, years: 1 + Math.floor(r() * 10) },
      '16': pick(AREAS),
      '17': pick(['Término indefinido', 'Término indefinido', 'Temporal de 1 año o más', 'Prestación de servicios']),
      '18': pick([8, 8, 8, 6, 10]),
      '19': pick(['Fijo (diario, semanal, quincenal o mensual)', 'Fijo (diario, semanal, quincenal o mensual)', 'Una parte fija y otra variable']),
    };
    void FICHA;
    const gates = { clients: r() < 0.5, boss: cargo === 0 ? r() < 0.9 : false };
    // «Sesgo» de la persona: algunas responden más favorable, otras menos (da variedad de niveles)
    const bias = r();
    const answer = (id: QuestionnaireId, n: number): number => {
      const k = QUESTIONNAIRES[id].scale.length;
      const x = Math.min(0.999, Math.max(0, bias + (r() - 0.5) * 0.9));
      return Math.floor(x * k);
    };
    partRows.push({
      id: uuid, campaignId: opts.campaignId, companyId: opts.companyId,
      documentBlind: crypto.blindIndex(doc), documentEnc: crypto.encrypt(doc), fullNameEnc: crypto.encrypt('Participante'), surnamesEnc: crypto.encrypt(`Demo ${String(i + 1).padStart(3, '0')}`),
      resumeCodeHash: crypto.hashToken(normalizeCode(newResumeCode())), form, status: 'completed', submittedAt: now,
    });
    consentRows.push({ participantId: uuid, decision: 'authorized', version: 'FP-PS-CI v01', textHash: CONSENT_TEXT_HASH });
    fichaRows.push({ participantId: uuid, dataEnc: crypto.encrypt(JSON.stringify(ficha)), complete: true });
    for (const qid of questionnairesFor(form)) {
      const g = qid.startsWith('intra') ? gates : {};
      const answers: Record<string, number> = {};
      for (const it of applicableItems(QUESTIONNAIRES[qid], g)) answers[String(it.n)] = answer(qid, it.n);
      qRows.push({ participantId: uuid, instrument: qid, dataEnc: crypto.encrypt(JSON.stringify({ answers, gates: g })), complete: true });
    }
  }
  const chunk = async <T,>(rows: T[], fn: (c: T[]) => Promise<unknown>) => {
    for (let i = 0; i < rows.length; i += 200) await fn(rows.slice(i, i + 200));
  };
  await chunk(partRows, (c) => db.insert(participants).values(c));
  await chunk(consentRows, (c) => db.insert(consents).values(c));
  await chunk(fichaRows, (c) => db.insert(fichaAnswers).values(c));
  await chunk(qRows, (c) => db.insert(questionnaireAnswers).values(c));
  return opts.count;
}
