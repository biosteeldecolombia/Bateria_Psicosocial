import { VALANTI_KEY, VALANTI_PAIRS, VALANTI_PART1_COUNT, VALANTI_VALUES, isValidValantiAnswer, type ValantiValue } from '@sanithelp/shared';
import { VALANTI_AREAS, VALANTI_BANDS, VALANTI_BAND_TEXTS, VALANTI_NORM_DATA } from './valanti_data';

/**
 * Calificación del VALANTI según la hoja oficial «Valanti.xls» y el manual v2.01 (Ps. Octavio Escobar).
 *
 *  1. Cada pareja reparte 3 puntos; cada frase suma al valor que indica VALANTI_KEY. El puntaje directo de cada valor
 *     es la suma de las 30 parejas (en total, 90 puntos).
 *  2. Puntaje estándar = 50 + 10 × (directo − media) / desviación, con la norma nacional de 1997 (n = 730), sin redondear.
 *  3. La banda (Muy bajo … Muy alto), las estrellas y el texto salen del puntaje estándar sin redondear.
 *  4. «Distancia con la organización» = estándar − 50.
 *  5. Valor más / menos importante = el de mayor / menor puntaje estándar.
 *
 * La hoja original incluye un candado de licencia que distorsiona el puntaje de Rectitud si cambia el nombre de quien
 * tiene la licencia; aquí no se replica (equivale a la hoja con el nombre autorizado).
 */
export const VALANTI_NORM = VALANTI_NORM_DATA as Record<ValantiValue, { mean: number; sd: number }>;
export const VALANTI_NORM_LABEL = 'Norma nacional 1997 (n = 730), manual VALANTI v2.01 de O. Escobar';
export const VALANTI_NORM_VALIDATED = true;
export const VALANTI_NORM_SOURCE = 'Hoja Valanti.xls y manual aportados por la usuaria (TEST VALANTI.zip)';

export interface ValantiResult {
  /** Puntaje directo por valor (suma de las dos partes). */
  total: Record<ValantiValue, number>;
  part1: Record<ValantiValue, number>;
  part2: Record<ValantiValue, number>;
  /** Puntaje estándar sin redondear (para mostrar, redondear). */
  standard: Record<ValantiValue, number>;
  /** Distancia con la organización (norma): estándar − 50. */
  distance: Record<ValantiValue, number>;
  /** Banda del puntaje estándar: Muy bajo, Bajo, Promedio Bajo, Promedio, Promedio Alto, Alto o Muy alto. */
  band: Record<ValantiValue, string>;
  /** Estrellas de la banda (de * a *******). */
  stars: Record<ValantiValue, string>;
  /** Interpretación de la banda de cada valor (texto de la hoja oficial). */
  interpretation: Record<ValantiValue, string>;
  /** Valor(es) de mayor puntaje estándar y su área; si hay empate, todos los empatados. */
  mostImportant: { value: ValantiValue; area: string }[];
  /** Valor(es) de menor puntaje estándar y su área. */
  leastImportant: { value: ValantiValue; area: string }[];
  pairsAnswered: number;
  complete: boolean;
  normValidated: boolean;
}

const zero = (): Record<ValantiValue, number> => ({ Verdad: 0, Rectitud: 0, Paz: 0, Amor: 0, 'No violencia': 0 });

/** Índice de la banda de un puntaje estándar (sin redondear). */
export const valantiBandIndex = (standard: number): number => {
  let idx = 0;
  VALANTI_BANDS.forEach((b, i) => {
    if (standard >= b.desde) idx = i;
  });
  return idx;
};

/** `answers`: pareja (1 a 30) → puntos de la frase A (0 a 3); la B recibe 3 menos. */
export function scoreValanti(answers: Record<number | string, number>): ValantiResult {
  const part1 = zero();
  const part2 = zero();
  let answered = 0;
  VALANTI_PAIRS.forEach((_, i) => {
    const a = answers[i + 1];
    if (!isValidValantiAnswer(a)) return;
    answered++;
    const target = i < VALANTI_PART1_COUNT ? part1 : part2;
    const [ka, kb] = VALANTI_KEY[i]!;
    target[ka] += a;
    target[kb] += 3 - a;
  });
  const total = zero();
  const standard = zero();
  const distance = zero();
  const band = {} as ValantiResult['band'];
  const stars = {} as ValantiResult['stars'];
  const interpretation = {} as ValantiResult['interpretation'];
  for (const v of VALANTI_VALUES) {
    total[v] = part1[v] + part2[v];
    const { mean, sd } = VALANTI_NORM[v];
    standard[v] = 50 + (10 * (total[v] - mean)) / sd;
    distance[v] = standard[v] - 50;
    const bi = valantiBandIndex(standard[v]);
    band[v] = VALANTI_BANDS[bi]!.nombre;
    stars[v] = VALANTI_BANDS[bi]!.estrellas;
    interpretation[v] = VALANTI_BAND_TEXTS[v]![bi]!;
  }
  const max = Math.max(...VALANTI_VALUES.map((v) => standard[v]));
  const min = Math.min(...VALANTI_VALUES.map((v) => standard[v]));
  const pick = (target: number) => VALANTI_VALUES.filter((v) => standard[v] === target).map((value) => ({ value, area: VALANTI_AREAS[value]! }));
  return {
    total,
    part1,
    part2,
    standard,
    distance,
    band,
    stars,
    interpretation,
    mostImportant: pick(max),
    leastImportant: pick(min),
    pairsAnswered: answered,
    complete: answered === VALANTI_PAIRS.length,
    normValidated: VALANTI_NORM_VALIDATED,
  };
}
