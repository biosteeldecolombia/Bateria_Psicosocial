import { questionnairesFor, type QuestionnaireId } from './instrument';

/** Cualquier cuestionario que se responde en el flujo: los de la batería psicosocial, el DISC, el VALANTI y el 16PF. */
export type InstrumentId = QuestionnaireId | 'disc' | 'valanti' | 'pf16';

/**
 * Catálogo de evaluaciones que la psicóloga puede aplicar. Cada campaña elige cuáles.
 * `available: false` = ya está en el catálogo pero todavía no tiene cuestionario ni calificación (se activa al incorporarla).
 */
export const ASSESSMENT_IDS = ['psychosocial', 'disc', 'valanti', 'pf16'] as const;
export type AssessmentId = (typeof ASSESSMENT_IDS)[number];

export interface AssessmentDef {
  id: AssessmentId;
  title: string;
  description: string;
  available: boolean;
}

export const ASSESSMENTS: Record<AssessmentId, AssessmentDef> = {
  psychosocial: { id: 'psychosocial', title: 'Batería de riesgo psicosocial', description: 'Intralaboral, extralaboral y estrés (Res. 2646/2008).', available: true },
  disc: { id: 'disc', title: 'DISC', description: 'Estilo de comportamiento: dominancia, influencia, estabilidad y cumplimiento.', available: true },
  valanti: { id: 'valanti', title: 'VALANTI', description: 'Valores personales: verdad, rectitud, paz, amor y no violencia.', available: true },
  pf16: { id: 'pf16', title: '16PF', description: 'Cuestionario de personalidad de 16 factores (se aplica y se registra; la calificación está pendiente).', available: true },
};

/**
 * Cuestionarios que debe responder una persona tras la ficha, en orden, según las evaluaciones de su campaña.
 * La forma A/B solo importa para la batería psicosocial.
 */
export function instrumentsFor(assessments: readonly string[], form: 'A' | 'B' | null): InstrumentId[] {
  const out: InstrumentId[] = [];
  for (const id of ASSESSMENT_IDS) {
    if (!assessments.includes(id) || !ASSESSMENTS[id].available) continue;
    if (id === 'psychosocial' && form) out.push(...questionnairesFor(form));
    if (id === 'disc') out.push('disc');
    if (id === 'valanti') out.push('valanti');
    if (id === 'pf16') out.push('pf16');
  }
  return out;
}

/** Texto adicional del consentimiento para las evaluaciones individuales. BORRADOR: lo aprueba la psicóloga responsable y el asesor legal. */
export const CONSENT_ADDENDA: Partial<Record<AssessmentId, { title: string; paragraphs: string[] }>> = {
  disc: {
    title: 'ANEXO · PRUEBA DISC (PERFIL DE COMPORTAMIENTO)',
    paragraphs: [
      'Además de lo anterior, he sido informado(a) de que también responderé la prueba DISC, que describe mi estilo de comportamiento en el trabajo.',
      'Sus resultados son individuales: los interpreta únicamente la psicóloga responsable, se tratan con la misma confidencialidad y reserva descritas en este documento, y solo se utilizarán para la finalidad que la psicóloga me informe. No constituyen un diagnóstico clínico.',
    ],
  },
  valanti: {
    title: 'ANEXO · PRUEBA VALANTI (PERFIL DE VALORES)',
    paragraphs: [
      'Además de lo anterior, he sido informado(a) de que también responderé la prueba VALANTI, que describe la importancia que doy a algunos valores personales.',
      'Sus resultados son individuales: los interpreta únicamente la psicóloga responsable, se tratan con la misma confidencialidad y reserva descritas en este documento, y solo se utilizarán para la finalidad que la psicóloga me informe. No constituyen un diagnóstico clínico.',
    ],
  },
  pf16: {
    title: 'ANEXO · PRUEBA 16PF (CUESTIONARIO DE PERSONALIDAD)',
    paragraphs: [
      'Además de lo anterior, he sido informado(a) de que también responderé el cuestionario 16PF, que describe rasgos de mi personalidad.',
      'Sus resultados son individuales: los interpreta únicamente la psicóloga responsable, se tratan con la misma confidencialidad y reserva descritas en este documento, y solo se utilizarán para la finalidad que la psicóloga me informe. No constituyen un diagnóstico clínico.',
    ],
  },
};

/** Anexos de consentimiento que aplican a una campaña según sus evaluaciones. */
export const consentAddendaFor = (assessments: readonly string[]) =>
  ASSESSMENT_IDS.filter((id) => assessments.includes(id) && CONSENT_ADDENDA[id]).map((id) => ({ id, ...CONSENT_ADDENDA[id]! }));
