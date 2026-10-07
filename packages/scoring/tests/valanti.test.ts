import { describe, expect, it } from 'vitest';
import { VALANTI_KEY, VALANTI_PAIRS, VALANTI_VALUES } from '@sanithelp/shared';
import { scoreValanti } from '../src/valanti';
import oracle from './fixtures/valanti_oracle.json';

/** Oráculo: 25 casos aleatorios calificados por la hoja oficial Valanti.xls (Excel), con puntaje directo, estándar, banda y estrellas. */
type Case = { a: number[]; direct: number[]; standard: number[]; band: string[]; stars: string[]; dist: number[]; text: string[]; most: string };
const cases = oracle as unknown as Case[];
const asAnswers = (a: number[]) => Object.fromEntries(a.map((v, i) => [i + 1, v]));

describe('VALANTI contra la hoja oficial', () => {
  it('tiene 30 parejas y la clave usa solo los cinco valores, una vez cada frase', () => {
    expect(VALANTI_PAIRS).toHaveLength(30);
    expect(VALANTI_KEY).toHaveLength(30);
    for (const [a, b] of VALANTI_KEY) {
      expect(VALANTI_VALUES).toContain(a);
      expect(VALANTI_VALUES).toContain(b);
    }
  });

  it('reproduce los 25 casos de Excel: directo, estándar, banda, estrellas y distancia', () => {
    expect(cases).toHaveLength(25);
    cases.forEach((c, i) => {
      const r = scoreValanti(asAnswers(c.a));
      VALANTI_VALUES.forEach((v, k) => {
        expect(r.total[v], `caso ${i} ${v} directo`).toBe(c.direct[k]);
        expect(r.standard[v], `caso ${i} ${v} estándar`).toBeCloseTo(c.standard[k]!, 8);
        expect(r.band[v], `caso ${i} ${v} banda`).toBe(c.band[k]);
        expect(r.stars[v], `caso ${i} ${v} estrellas`).toBe(c.stars[k]);
        expect(r.distance[v], `caso ${i} ${v} distancia`).toBeCloseTo(c.dist[k]!, 8);
      });
    });
  });

  it('el texto de interpretación de cada valor es el que muestra Excel', () => {
    cases.forEach((c, i) => {
      const r = scoreValanti(asAnswers(c.a));
      VALANTI_VALUES.forEach((v, k) => expect(r.interpretation[v], `caso ${i} ${v}`).toBe(c.text[k]));
    });
  });

  it('siempre reparte 90 puntos entre los cinco valores', () => {
    for (const a of [0, 1, 2, 3]) {
      const t = scoreValanti(asAnswers(Array(30).fill(a))).total;
      expect(Object.values(t).reduce((x, y) => x + y, 0)).toBe(90);
    }
  });

  it('el valor más importante es el de mayor puntaje estándar', () => {
    const c = cases[0]!;
    const r = scoreValanti(asAnswers(c.a));
    const top = VALANTI_VALUES.reduce((m, v) => (r.standard[v] > r.standard[m] ? v : m));
    expect(r.mostImportant.map((x) => x.value)).toContain(top);
    expect(c.most.toUpperCase()).toContain(top.toUpperCase());
  });

  it('ignora respuestas fuera de 0 a 3', () => {
    expect(scoreValanti({ 1: 4, 2: -1, 3: 1.5 }).pairsAnswered).toBe(0);
  });
});
