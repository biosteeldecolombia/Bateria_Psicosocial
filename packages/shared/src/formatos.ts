// Formatos de evaluación psicológica ocupacional que diligencia la psicóloga tras la entrevista (FP-PS-PS v01, 25/03/2026):
// trabajo en alturas (cuestionario de Acrofobia) y espacios confinados (test CLQ). Textos tomados de los formatos entregados.

export const FORMATO_KINDS = ['alturas', 'confinados'] as const;
export type FormatoKind = (typeof FORMATO_KINDS)[number];

export const FORMATO_HEADER = { code: 'FP-PS-PS', version: '01', date: '25/03/2026', process: 'PROCESO: PRESTACIÓN DE SERVICIOS', line1: 'EVALUACION PSICOLOGICA OCUPACIONAL' } as const;

export interface FormatoField {
  id: string;
  label: string;
}

export interface FormatoSpec {
  kind: FormatoKind;
  /** Evaluación (cuestionario) de la campaña que da lugar al formato. */
  assessment: 'acrofobia' | 'claustrofobia';
  /** Segunda línea del encabezado: «TRABAJO EN ALTURAS» / «ESPACIOS CONFINADOS». */
  headerTitle: string;
  tabLabel: string;
  note?: string;
  criteria: string;
  mental: FormatoField[];
  cognitiveTitle: string;
  cognitive: FormatoField[];
  factors: FormatoField[];
  /** Solo alturas: texto libre «Durante la evaluación se observa». */
  observation: boolean;
  /** Solo espacios confinados: puntaje CLQ e interpretación. */
  clqResult: boolean;
  concept: { apto: string; apto_rec: string; no_apto: string };
}

export const FORMATO_GENERAL: FormatoField[] = [
  { id: 'nombre', label: 'Nombre y apellido' },
  { id: 'edad', label: 'Edad' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'empresa', label: 'Empresa' },
  { id: 'antecedente', label: 'Antecedente familiar' },
  { id: 'fecha', label: 'Fecha' },
];

export const FORMATO_VALIDITY = 'El presente concepto aplica únicamente para las condiciones evaluadas al momento de la valoración y puede variar según cambios en el estado del evaluado.';

export const FORMATOS: Record<FormatoKind, FormatoSpec> = {
  alturas: {
    kind: 'alturas',
    assessment: 'acrofobia',
    headerTitle: 'TRABAJO EN ALTURAS',
    tabLabel: 'Formato · Trabajo en alturas',
    note: 'Evaluación psicológica ocupacional orientada a determinar la aptitud del colaborador para el desempeño seguro en trabajo en alturas.',
    criteria: 'Evaluación basada en entrevista clínica, observación conductual y valoración de funciones cognitivas y emocionales relacionadas con el trabajo en alturas.',
    mental: [
      { id: 'atencion', label: 'Atención' },
      { id: 'memoria', label: 'Memoria' },
      { id: 'orientacion', label: 'Orientación' },
      { id: 'lenguaje', label: 'Lenguaje' },
      { id: 'juicio', label: 'Juicio y raciocinio' },
      { id: 'afecto', label: 'Afecto y emoción' },
      { id: 'conducta', label: 'Conducta' },
    ],
    cognitiveTitle: 'EVALUACIÓN DE FUNCIONES COGNITIVAS PARA TRABAJO EN ALTURAS',
    cognitive: [
      { id: 'atencion_sostenida', label: 'Atención sostenida' },
      { id: 'concentracion', label: 'Concentración' },
      { id: 'percepcion_riesgo', label: 'Percepción del riesgo' },
      { id: 'instrucciones', label: 'Seguimiento de instrucciones' },
      { id: 'decisiones', label: 'Toma de decisiones' },
      { id: 'reaccion', label: 'Tiempo de reacción' },
      { id: 'control_emocional', label: 'Control emocional' },
      { id: 'impulsividad', label: 'Impulsividad' },
      { id: 'frustracion', label: 'Tolerancia a la frustración' },
    ],
    factors: [
      { id: 'vertigo', label: 'Vértigo o miedo a las alturas' },
      { id: 'ansiedad', label: 'Ansiedad significativa' },
      { id: 'sustancias', label: 'Consumo de sustancias psicoactivas' },
      { id: 'distractibilidad', label: 'Distractibilidad' },
      { id: 'impulsivas', label: 'Conductas impulsivas' },
      { id: 'normas', label: 'Dificultades en el cumplimiento de normas' },
    ],
    observation: true,
    clqResult: false,
    concept: { apto: 'Apto para trabajo en alturas', apto_rec: 'Apto con recomendaciones', no_apto: 'No apto para trabajo en alturas' },
  },
  confinados: {
    kind: 'confinados',
    assessment: 'claustrofobia',
    headerTitle: 'ESPACIOS CONFINADOS',
    tabLabel: 'Formato · Espacios confinados',
    criteria: 'Determinar la aptitud psicológica del trabajador para desempeñar actividades en espacios confinados, evaluando percepción del encierro, ansiedad situacional, respuesta cognitiva y control emocional, mediante entrevista clínica y aplicación del Test de Claustrofobia CLQ de Radomsky.',
    mental: [
      { id: 'atencion', label: 'Atención' },
      { id: 'memoria', label: 'Memoria' },
      { id: 'orientacion', label: 'Orientación' },
      { id: 'lenguaje', label: 'Lenguaje' },
      { id: 'pensamiento', label: 'Pensamiento' },
      { id: 'afecto', label: 'Afecto' },
      { id: 'juicio', label: 'Juicio y raciocinio' },
      { id: 'conducta', label: 'Conducta observada' },
    ],
    cognitiveTitle: 'EVALUACIÓN DE FUNCIONES COGNITIVAS PARA ESPACIOS CONFINADOS',
    cognitive: [
      { id: 'atencion_sostenida', label: 'Atención sostenida' },
      { id: 'concentracion', label: 'Concentración' },
      { id: 'percepcion_riesgo', label: 'Percepción del riesgo' },
      { id: 'instrucciones', label: 'Seguimiento de instrucciones' },
      { id: 'decisiones', label: 'Toma de decisiones' },
      { id: 'control_emocional', label: 'Control emocional' },
      { id: 'presion', label: 'Respuesta ante presión' },
      { id: 'encierro', label: 'Tolerancia al encierro' },
    ],
    factors: [
      { id: 'ansiedad_cerrados', label: 'Ansiedad en espacios cerrados' },
      { id: 'asfixia', label: 'Sensación de asfixia' },
      { id: 'panico', label: 'Pánico en lugares cerrados' },
      { id: 'evita', label: 'Evita espacios confinados' },
      { id: 'inquietud', label: 'Inquietud motora' },
      { id: 'hiperventilacion', label: 'Hiperventilación' },
    ],
    observation: false,
    clqResult: true,
    concept: { apto: 'Apto para trabajo en espacios confinados', apto_rec: 'Apto con recomendaciones', no_apto: 'No apto para trabajo en espacios confinados' },
  },
};

export const FORMATO_CONCEPTS = ['apto', 'apto_rec', 'no_apto'] as const;
export type FormatoConcept = (typeof FORMATO_CONCEPTS)[number];

/** Lo que guarda la psicóloga: textos por campo (clave = sección.campo), factores Sí/No y el concepto. */
export interface FormatoData {
  /** general.<id>, mental.<id>, cognitive.<id>, observation */
  values: Record<string, string>;
  factors: Record<string, 'yes' | 'no'>;
  concept: FormatoConcept | null;
}

export const FORMATO_TEXT_MAX = 2000;

/** Claves de texto válidas de un formato. */
export const formatoValueKeys = (kind: FormatoKind): string[] => {
  const s = FORMATOS[kind];
  return [
    ...FORMATO_GENERAL.map((f) => `general.${f.id}`),
    ...s.mental.map((f) => `mental.${f.id}`),
    ...s.cognitive.map((f) => `cognitive.${f.id}`),
    ...(s.observation ? ['observation'] : []),
  ];
};

/** Normaliza lo recibido: solo claves conocidas, textos recortados, factores Sí/No y concepto válido (o null si no es válido). */
export function parseFormatoData(kind: FormatoKind, input: unknown): FormatoData | null {
  if (!input || typeof input !== 'object') return null;
  const b = input as { values?: unknown; factors?: unknown; concept?: unknown };
  const allowed = new Set(formatoValueKeys(kind));
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries((b.values && typeof b.values === 'object' ? b.values : {}) as Record<string, unknown>)) {
    if (!allowed.has(k)) return null;
    if (typeof v !== 'string' || v.length > FORMATO_TEXT_MAX) return null;
    if (v.trim()) values[k] = v.trim();
  }
  const factorIds = new Set(FORMATOS[kind].factors.map((f) => f.id));
  const factors: Record<string, 'yes' | 'no'> = {};
  for (const [k, v] of Object.entries((b.factors && typeof b.factors === 'object' ? b.factors : {}) as Record<string, unknown>)) {
    if (!factorIds.has(k) || (v !== 'yes' && v !== 'no')) return null;
    factors[k] = v;
  }
  const concept = b.concept === null || b.concept === undefined ? null : (FORMATO_CONCEPTS as readonly unknown[]).includes(b.concept) ? (b.concept as FormatoConcept) : undefined;
  if (concept === undefined) return null;
  return { values, factors, concept };
}
