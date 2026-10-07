import { DISC_GROUPS, DISC_SCALES, decodeDisc, isValidDiscAnswer, type DiscScale } from '@sanithelp/shared';
import { DISC_KEY_MAS, DISC_KEY_MENOS, DISC_PATTERN_BY_CODE, DISC_PATTERN_NAMES, DISC_PATTERN_TEXTS, DISC_SEGMENT_UPPER } from './disc_data';

/**
 * Calificación del DISC según la hoja oficial «DISC_HOJA_DE_PRUEBA_Y_CORRECCION.xlsm» (ver disc_data.ts).
 *
 *  1. Cada palabra marcada puntúa en una escala según su posición en el grupo; la clave de MÁS y la de MENOS son distintas
 *     y hay una palabra que no puntúa en cada una.
 *  2. Puntaje por escala (intensidad / «cambio») = palabras MÁS de la escala − palabras MENOS de la escala.
 *  3. Cada escala se convierte a un segmento de 1 a 7 con sus propios límites.
 *  4. Los cuatro segmentos (D, I, S, C) forman un código que da el patrón de perfil (18 nombres; 15 con descripción).
 */
export const DISC_KEY_VALIDATED = true;
export const DISC_KEY_SOURCE = 'Hoja de corrección DISC aportada por la usuaria (TEST DISC.zip)';

export interface DiscPattern {
  nombre: string;
  /** Falta cuando el patrón («Subactivo», «Superactivo», «Desconcertante») no tiene descripción en la hoja oficial. */
  descripcion: { emociones: string; meta: string; juzga: string; influye: string; valor: string; abusa: string; presion: string; teme: string; eficaz: string; observaciones: string[] } | null;
}

export interface DiscResult {
  /** Puntaje por escala: palabras MÁS que puntúan en la escala menos palabras MENOS que puntúan en ella. */
  scores: Record<DiscScale, number>;
  /** Segmento 1 a 7 de cada escala. */
  segments: Record<DiscScale, number>;
  /** Código de cuatro dígitos con los segmentos D, I, S, C (por ejemplo «2654»). */
  code: string;
  pattern: DiscPattern;
  /** Grupos con respuesta válida (de 28). */
  groupsAnswered: number;
  complete: boolean;
  keyValidated: boolean;
}

/** Segmento (1 a 7) de un puntaje en una escala. */
export const discSegment = (scale: DiscScale, score: number): number => {
  const i = DISC_SEGMENT_UPPER[scale].findIndex((u) => score <= u);
  return i < 0 ? 7 : i + 1;
};

/** Patrón de un código de segmentos (cuatro dígitos del 1 al 7). */
export function discPatternOf(segments: Record<DiscScale, number>): DiscPattern {
  const idx = ((segments.D - 1) * 7 + (segments.I - 1)) * 49 + (segments.S - 1) * 7 + (segments.C - 1);
  const nombre = DISC_PATTERN_NAMES[DISC_PATTERN_BY_CODE.charCodeAt(idx) - 97]!;
  return { nombre, descripcion: DISC_PATTERN_TEXTS[nombre] ?? null };
}

/** `answers`: grupo (1 a 28) → número codificado (posición MÁS × 4 + posición MENOS). */
export function scoreDisc(answers: Record<number | string, number>): DiscResult {
  const scores: Record<DiscScale, number> = { D: 0, I: 0, S: 0, C: 0 };
  let answered = 0;
  DISC_GROUPS.forEach((_, i) => {
    const v = answers[i + 1];
    if (!isValidDiscAnswer(v)) return;
    answered++;
    const [mas, menos] = decodeDisc(v);
    const m = DISC_KEY_MAS[i]![mas]!;
    const l = DISC_KEY_MENOS[i]![menos]!;
    if (m !== '-') scores[m as DiscScale] += 1;
    if (l !== '-') scores[l as DiscScale] -= 1;
  });
  const segments = Object.fromEntries(DISC_SCALES.map((s) => [s, discSegment(s, scores[s])])) as Record<DiscScale, number>;
  return {
    scores,
    segments,
    code: DISC_SCALES.map((s) => segments[s]).join(''),
    pattern: discPatternOf(segments),
    groupsAnswered: answered,
    complete: answered === DISC_GROUPS.length,
    keyValidated: DISC_KEY_VALIDATED,
  };
}
