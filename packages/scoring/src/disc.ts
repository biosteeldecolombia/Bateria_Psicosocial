import { DISC_GROUPS, DISC_SCALES, decodeDisc, isValidDiscAnswer, type DiscScale } from '@sanithelp/shared';

/**
 * Calificación del DISC.
 *
 * ATENCIÓN — CLAVE PROVISIONAL: la clave que asigna cada palabra a una escala se tomó TAL CUAL del repositorio
 * «evaluaciones-psicometricas»: la posición de la palabra dentro del grupo (0, 1, 2, 3) corresponde a D, I, S, C.
 * No se ha contrastado con la clave oficial del instrumento. Hasta que la psicóloga la valide, los resultados se
 * rotulan como provisionales. Para cambiarla basta editar DISC_KEY (una escala por palabra; null = no puntúa)
 * y poner DISC_KEY_VALIDATED en true.
 */
export const DISC_KEY: readonly (readonly (DiscScale | null)[])[] = DISC_GROUPS.map(() => ['D', 'I', 'S', 'C'] as const);
export const DISC_KEY_VALIDATED = false;

export interface DiscResult {
  /** Puntaje relativo por escala: +1 por cada MÁS y −1 por cada MENOS. Rango −28 a +28; la suma de las cuatro es 0. */
  scores: Record<DiscScale, number>;
  /** Segmento 1 a 7 de cada escala (patrón clásico simplificado). */
  segments: Record<DiscScale, number>;
  /** Escala de mayor puntaje; si hay empate, todas las empatadas (en orden D, I, S, C). */
  dominant: DiscScale[];
  groupsAnswered: number;
  complete: boolean;
  keyValidated: boolean;
}

export const discSegment = (score: number): number =>
  score >= 12 ? 7 : score >= 6 ? 6 : score >= 1 ? 5 : score >= -2 ? 4 : score >= -7 ? 3 : score >= -12 ? 2 : 1;

/** `answers`: grupo (1 a 28) → número codificado (posición MÁS × 4 + posición MENOS). */
export function scoreDisc(answers: Record<number | string, number>): DiscResult {
  const scores: Record<DiscScale, number> = { D: 0, I: 0, S: 0, C: 0 };
  let answered = 0;
  DISC_GROUPS.forEach((_, i) => {
    const v = answers[i + 1];
    if (!isValidDiscAnswer(v)) return;
    answered++;
    const [mas, menos] = decodeDisc(v);
    const m = DISC_KEY[i]![mas];
    const l = DISC_KEY[i]![menos];
    if (m) scores[m] += 1;
    if (l) scores[l] -= 1;
  });
  const max = Math.max(...DISC_SCALES.map((s) => scores[s]));
  return {
    scores,
    segments: Object.fromEntries(DISC_SCALES.map((s) => [s, discSegment(scores[s])])) as Record<DiscScale, number>,
    dominant: DISC_SCALES.filter((s) => scores[s] === max),
    groupsAnswered: answered,
    complete: answered === DISC_GROUPS.length,
    keyValidated: DISC_KEY_VALIDATED,
  };
}

export type DiscPattern = Record<'nombre' | 'emociones' | 'meta' | 'juzga' | 'influye' | 'valor' | 'abusa' | 'presion' | 'teme' | 'eficaz', string>;

/** Descripción del patrón de la escala dominante (texto del repositorio de origen; pendiente de aprobación de la psicóloga). */
export const DISC_PATTERNS: Record<DiscScale, DiscPattern> = {
  D: { nombre: 'El Director', emociones: 'Directo, competitivo y orientado a los resultados.', meta: 'Lograr objetivos y asumir retos.', juzga: 'La capacidad de decisión y la eficiencia.', influye: 'La firmeza, la iniciativa y la acción.', valor: 'Impulso para avanzar y resolver problemas.', abusa: 'La prisa y la exigencia excesiva.', presion: 'Puede mostrarse impaciente o dominante.', teme: 'Perder el control o no alcanzar el resultado.', eficaz: 'Escucha más y considera los ritmos de los demás.' },
  I: { nombre: 'El Influyente', emociones: 'Comunicativo, entusiasta y sociable.', meta: 'El reconocimiento y las relaciones positivas.', juzga: 'La aceptación y el entusiasmo de las personas.', influye: 'La comunicación y la motivación.', valor: 'Conecta personas y facilita la colaboración.', abusa: 'La espontaneidad y la falta de seguimiento.', presion: 'Puede perder concentración o ser impulsivo.', teme: 'El rechazo y el aislamiento.', eficaz: 'Organiza mejor sus compromisos y fechas límite.' },
  S: { nombre: 'El Consejero', emociones: 'Afectuoso, comprensivo y estable.', meta: 'La amistad, la armonía y la felicidad.', juzga: 'La aceptación positiva y el lado bueno de las personas.', influye: 'Las relaciones personales y la escucha.', valor: 'Estabilidad, cooperación y confianza.', abusa: 'La tolerancia y el acercamiento indirecto.', presion: 'Puede volverse demasiado flexible.', teme: 'Presionar a los demás o causar daño.', eficaz: 'Presta más atención a las fechas límite e iniciativa.' },
  C: { nombre: 'El Analista', emociones: 'Preciso, reservado y cuidadoso.', meta: 'La calidad, la exactitud y el orden.', juzga: 'La lógica, las normas y la evidencia.', influye: 'El análisis y los procedimientos claros.', valor: 'Rigor, precisión y confiabilidad.', abusa: 'El perfeccionismo y el exceso de control.', presion: 'Puede demorarse por analizar demasiado.', teme: 'Cometer errores o perder información.', eficaz: 'Decide con más agilidad y acepta cambios graduales.' },
};
