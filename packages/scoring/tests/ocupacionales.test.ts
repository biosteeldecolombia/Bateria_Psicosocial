import { describe, expect, it } from 'vitest';
import { ACROFOBIA_COUNT, CLQ_COUNT, CLQ_ITEMS, ACROFOBIA_ITEMS } from '@sanithelp/shared';
import { ACRO_BANDS, acroLevel, scoreAcrofobia } from '../src/acrofobia';
import { scoreClq } from '../src/claustrofobia';

const fill = (n: number, v: number, offset = 0) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1 + offset, v]));

describe('Acrofobia de Cohen', () => {
  it('tiene 20 situaciones y 5 niveles por escala sin huecos ni traslapes', () => {
    expect(ACROFOBIA_ITEMS).toHaveLength(20);
    for (const [scale, max] of [['anxiety', 120], ['avoidance', 40]] as const) {
      const b = ACRO_BANDS[scale];
      expect(b[0]!.from).toBe(0);
      expect(b.at(-1)!.to).toBe(max);
      b.slice(1).forEach((x, i) => expect(x.from).toBe(b[i]!.to + 1));
    }
  });

  it('clasifica ansiedad en los límites de los rangos', () => {
    const cases: [number, string][] = [[0, 'Ausente'], [30, 'Ausente'], [31, 'Discreto'], [50, 'Discreto'], [51, 'Moderado'], [70, 'Moderado'], [71, 'Severo'], [90, 'Severo'], [91, 'Alto'], [110, 'Alto'], [120, 'Alto']];
    for (const [t, l] of cases) expect(acroLevel('anxiety', t), `ansiedad ${t}`).toBe(l);
  });

  it('clasifica evitación en los límites de los rangos', () => {
    const cases: [number, string][] = [[0, 'Ausente'], [10, 'Ausente'], [11, 'Discreto'], [18, 'Discreto'], [19, 'Moderado'], [27, 'Moderado'], [28, 'Severo'], [31, 'Severo'], [32, 'Alto'], [40, 'Alto']];
    for (const [t, l] of cases) expect(acroLevel('avoidance', t), `evitación ${t}`).toBe(l);
  });

  it('suma cada escala por separado (las respuestas 21 a 40 son la evitación)', () => {
    const all6 = scoreAcrofobia({ ...fill(20, 6), ...fill(20, 2, 20) });
    expect(all6.anxiety).toEqual({ total: 120, level: 'Alto', answered: 20 });
    expect(all6.avoidance).toEqual({ total: 40, level: 'Alto', answered: 20 });
    const mixed = scoreAcrofobia({ ...fill(20, 2), ...fill(20, 0, 20) });
    expect(mixed.anxiety).toMatchObject({ total: 40, level: 'Discreto' });
    expect(mixed.avoidance).toMatchObject({ total: 0, level: 'Ausente' });
    expect(mixed.items[3]).toEqual({ n: 4, anxiety: 2, avoidance: 0 });
    expect(ACROFOBIA_COUNT).toBe(20);
  });
});

describe('CLQ de Radomsky', () => {
  it('tiene 26 situaciones y el total va de 0 a 104', () => {
    expect(CLQ_ITEMS).toHaveLength(26);
    expect(CLQ_COUNT).toBe(26);
    expect(scoreClq(fill(26, 0))).toEqual({ total: 0, max: 104, answered: 26 });
    expect(scoreClq(fill(26, 4))).toEqual({ total: 104, max: 104, answered: 26 });
    expect(scoreClq({ 1: 3, 2: 2, 26: 4 })).toEqual({ total: 9, max: 104, answered: 3 });
  });
});
