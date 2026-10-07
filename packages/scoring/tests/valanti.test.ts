import { describe, expect, it } from 'vitest';
import { VALANTI_KEY, VALANTI_PAIRS, VALANTI_VALUES } from '@sanithelp/shared';
import { scoreValanti } from '../src/valanti';

const all = (a: number) => Object.fromEntries(VALANTI_PAIRS.map((_, i) => [i + 1, a]));

describe('VALANTI', () => {
  it('tiene 30 parejas (9 + 21) y la clave usa solo los cinco valores', () => {
    expect(VALANTI_PAIRS).toHaveLength(30);
    expect(VALANTI_KEY).toHaveLength(30);
    for (const [a, b] of VALANTI_KEY) {
      expect(VALANTI_VALUES).toContain(a);
      expect(VALANTI_VALUES).toContain(b);
    }
  });
  it('siempre reparte 90 puntos entre los cinco valores, con cualquier respuesta', () => {
    for (const a of [0, 1, 2, 3]) {
      const t = scoreValanti(all(a)).total;
      expect(Object.values(t).reduce((x, y) => x + y, 0)).toBe(90);
    }
  });
  it('suma los puntos de cada frase al valor de la clave (primer ejemplo calculado a mano)', () => {
    // Pregunta 1: A→Amor, B→Rectitud. Con A=3 solo suma Amor 3.
    const r = scoreValanti({ 1: 3 });
    expect(r.part1).toEqual({ Verdad: 0, Rectitud: 0, Paz: 0, Amor: 3, 'No violencia': 0 });
    // Pregunta 2: A→No violencia, B→Rectitud. Con A=1 suma No violencia 1 y Rectitud 2.
    const r2 = scoreValanti({ 2: 1 });
    expect(r2.part1['No violencia']).toBe(1);
    expect(r2.part1.Rectitud).toBe(2);
    expect(r.pairsAnswered).toBe(1);
    expect(r.complete).toBe(false);
  });
  it('calcula el puntaje estándar y la distancia con la norma provisional', () => {
    const r = scoreValanti(all(3));
    for (const v of VALANTI_VALUES) {
      expect(r.standard[v]).toBeTypeOf('number');
      expect(['alto', 'medio', 'bajo']).toContain(r.band[v]);
    }
    expect(r.normValidated).toBe(false);
  });
  it('ignora respuestas fuera de 0 a 3', () => {
    expect(scoreValanti({ 1: 4, 2: -1, 3: 1.5 }).pairsAnswered).toBe(0);
  });
});
