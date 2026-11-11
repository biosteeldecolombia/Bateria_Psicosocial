import { ACROFOBIA_COUNT } from '@sanithelp/shared';

export type AcroLevel = 'Ausente' | 'Discreto' | 'Moderado' | 'Severo' | 'Alto';

/** Rangos de severidad (límite inferior inclusivo de cada nivel) entregados por la psicóloga. */
export const ACRO_BANDS: Record<'anxiety' | 'avoidance', { level: AcroLevel; from: number; to: number }[]> = {
  anxiety: [
    { level: 'Ausente', from: 0, to: 30 },
    { level: 'Discreto', from: 31, to: 50 },
    { level: 'Moderado', from: 51, to: 70 },
    { level: 'Severo', from: 71, to: 90 },
    { level: 'Alto', from: 91, to: 120 },
  ],
  avoidance: [
    { level: 'Ausente', from: 0, to: 10 },
    { level: 'Discreto', from: 11, to: 18 },
    { level: 'Moderado', from: 19, to: 27 },
    { level: 'Severo', from: 28, to: 31 },
    { level: 'Alto', from: 32, to: 40 },
  ],
};

export const ACRO_MAX = { anxiety: 120, avoidance: 40 } as const;

export const acroLevel = (scale: 'anxiety' | 'avoidance', total: number): AcroLevel => ACRO_BANDS[scale].find((b) => total >= b.from && total <= b.to)!.level;

export interface AcroResult {
  anxiety: { total: number; level: AcroLevel; answered: number };
  avoidance: { total: number; level: AcroLevel; answered: number };
  /** Respuestas por situación (1 a 20): ansiedad y evitación. */
  items: { n: number; anxiety?: number; avoidance?: number }[];
}

/** Respuestas guardadas: 1 a 20 = ansiedad (0 a 6); 21 a 40 = evitación (0 a 2) de la misma situación n - 20. */
export function scoreAcrofobia(answers: Record<number, number>): AcroResult {
  const items = Array.from({ length: ACROFOBIA_COUNT }, (_, i) => ({ n: i + 1, anxiety: answers[i + 1], avoidance: answers[i + 1 + ACROFOBIA_COUNT] }));
  const sum = (k: 'anxiety' | 'avoidance') => items.reduce((a, it) => a + (it[k] ?? 0), 0);
  const count = (k: 'anxiety' | 'avoidance') => items.filter((it) => it[k] !== undefined).length;
  const a = sum('anxiety');
  const v = sum('avoidance');
  return { anxiety: { total: a, level: acroLevel('anxiety', a), answered: count('anxiety') }, avoidance: { total: v, level: acroLevel('avoidance', v), answered: count('avoidance') }, items };
}
