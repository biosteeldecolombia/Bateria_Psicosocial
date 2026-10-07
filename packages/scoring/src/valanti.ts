import { VALANTI_KEY, VALANTI_PAIRS, VALANTI_PART1_COUNT, VALANTI_VALUES, isValidValantiAnswer, type ValantiValue } from '@sanithelp/shared';

/**
 * Calificación del VALANTI.
 *
 * Cada pareja reparte 3 puntos entre dos frases; cada frase suma al valor que indica VALANTI_KEY. El puntaje directo
 * de cada valor es la suma de las 30 parejas (en total se reparten 90 puntos). Se reportan por separado la parte 1
 * (importancia personal) y la parte 2 (frases inaceptables).
 *
 * ATENCIÓN — NORMA PROVISIONAL: la media y la desviación («Norma nacional 1997») se tomaron del repositorio
 * «evaluaciones-psicometricas», sin fuente. Las cinco medias suman 91,95 y no 90 (los puntos que se reparten), así que
 * no parecen provenir de este mismo formato de 30 parejas. Hasta que la psicóloga confirme la norma, los puntajes
 * estándar se rotulan como provisionales. Para cambiarla, edita VALANTI_NORM y pon VALANTI_NORM_VALIDATED en true.
 */
export const VALANTI_NORM: Record<ValantiValue, { mean: number; sd: number }> = {
  Verdad: { mean: 15.65, sd: 4.7 },
  Rectitud: { mean: 21.05, sd: 4.44 },
  Paz: { mean: 17.35, sd: 6.61 },
  Amor: { mean: 16.68, sd: 5.41 },
  'No violencia': { mean: 21.22, sd: 7.19 },
};
export const VALANTI_NORM_LABEL = 'Norma nacional 1997 (según el repositorio de origen; sin fuente verificada)';
export const VALANTI_NORM_VALIDATED = false;

export interface ValantiResult {
  /** Puntaje directo por valor (suma de las dos partes). */
  total: Record<ValantiValue, number>;
  part1: Record<ValantiValue, number>;
  part2: Record<ValantiValue, number>;
  /** Puntaje estándar: 50 + 10 × (directo − media) / desviación, redondeado. */
  standard: Record<ValantiValue, number>;
  /** Distancia con la norma: directo − media, redondeada. */
  distance: Record<ValantiValue, number>;
  /** Interpretación del puntaje estándar: ≥ 60 alto, 50 a 59 medio, < 50 bajo. */
  band: Record<ValantiValue, 'alto' | 'medio' | 'bajo'>;
  /** Valor(es) de mayor puntaje directo; si hay empate, todos los empatados. */
  preferred: ValantiValue[];
  pairsAnswered: number;
  complete: boolean;
  normValidated: boolean;
}

const zero = (): Record<ValantiValue, number> => ({ Verdad: 0, Rectitud: 0, Paz: 0, Amor: 0, 'No violencia': 0 });

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
  for (const v of VALANTI_VALUES) {
    total[v] = part1[v] + part2[v];
    const { mean, sd } = VALANTI_NORM[v];
    standard[v] = Math.round(50 + ((total[v] - mean) / sd) * 10);
    distance[v] = Math.round(total[v] - mean);
    band[v] = standard[v] >= 60 ? 'alto' : standard[v] >= 50 ? 'medio' : 'bajo';
  }
  const max = Math.max(...VALANTI_VALUES.map((v) => total[v]));
  return {
    total,
    part1,
    part2,
    standard,
    distance,
    band,
    preferred: VALANTI_VALUES.filter((v) => total[v] === max),
    pairsAnswered: answered,
    complete: answered === VALANTI_PAIRS.length,
    normValidated: VALANTI_NORM_VALIDATED,
  };
}

/** Descripción de cada valor (texto del repositorio de origen; pendiente de aprobación de la psicóloga). */
export const VALANTI_DESCRIPTIONS: Record<ValantiValue, string> = {
  Verdad: 'La verdad se relaciona con la claridad del pensamiento, la honestidad, la concentración, la curiosidad y la capacidad de analizar con criterio.',
  Rectitud: 'La rectitud representa la integridad, la ética, la responsabilidad, la perseverancia, el respeto y el cumplimiento de los compromisos.',
  Paz: 'La paz se manifiesta en la calma, la estabilidad emocional, la reflexión, la paciencia, la serenidad y la capacidad de mantener el equilibrio.',
  Amor: 'El amor expresa empatía, afecto, cooperación, gratitud, solidaridad y una disposición genuina para cuidar a las demás personas.',
  'No violencia': 'La no violencia implica tolerancia, respeto, perdón, compasión, convivencia y rechazo de la agresión, el odio y la discriminación.',
};
