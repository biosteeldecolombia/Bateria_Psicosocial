import { describe, expect, it } from 'vitest';
import { encodeDisc } from '@sanithelp/shared';
import { discSegment, scoreDisc } from '../src/disc';

const all = (mas: number, menos: number) => Object.fromEntries(Array.from({ length: 28 }, (_, i) => [i + 1, encodeDisc(mas, menos)]));

describe('DISC', () => {
  it('suma +1 por MÁS y −1 por MENOS en la escala de la posición elegida', () => {
    const r = scoreDisc(all(0, 3));
    expect(r.scores).toEqual({ D: 28, I: 0, S: 0, C: -28 });
    expect(r.dominant).toEqual(['D']);
    expect(r.complete).toBe(true);
  });
  it('la suma de las cuatro escalas es siempre 0', () => {
    const a: Record<number, number> = {};
    for (let g = 1; g <= 28; g++) a[g] = encodeDisc(g % 4, (g + 1 + (g % 3)) % 4 === g % 4 ? (g + 2) % 4 : (g + 1 + (g % 3)) % 4);
    const s = scoreDisc(a).scores;
    expect(s.D + s.I + s.S + s.C).toBe(0);
  });
  it('ignora respuestas inválidas (misma palabra en MÁS y MENOS) y reporta que está incompleto', () => {
    const r = scoreDisc({ 1: encodeDisc(1, 1), 2: 99, 3: encodeDisc(2, 0) });
    expect(r.groupsAnswered).toBe(1);
    expect(r.complete).toBe(false);
    expect(r.scores).toEqual({ D: -1, I: 0, S: 1, C: 0 });
  });
  it('en empate devuelve todas las escalas empatadas', () => {
    expect(scoreDisc({}).dominant).toEqual(['D', 'I', 'S', 'C']);
  });
  it('segmentos según la tabla del repositorio de origen', () => {
    expect([28, 12, 11, 6, 5, 1, 0, -2, -3, -7, -8, -12, -13].map(discSegment)).toEqual([7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1]);
  });
  it('la clave se declara no validada', () => {
    expect(scoreDisc({}).keyValidated).toBe(false);
  });
});
