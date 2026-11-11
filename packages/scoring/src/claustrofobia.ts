import { CLQ_COUNT, CLQ_MAX } from '@sanithelp/shared';

export interface ClqResult {
  total: number;
  max: number;
  answered: number;
}

/** CLQ: suma simple de las 26 situaciones (0 a 4 cada una; 0 a 104). Sin puntos de corte: la interpretación la marca la psicóloga. */
export function scoreClq(answers: Record<number, number>): ClqResult {
  let total = 0;
  let answered = 0;
  for (let n = 1; n <= CLQ_COUNT; n++) {
    if (answers[n] !== undefined) {
      total += answers[n]!;
      answered++;
    }
  }
  return { total, max: CLQ_MAX, answered };
}
