import { describe, expect, it } from 'vitest';
import { DISC_GROUPS, encodeDisc } from '@sanithelp/shared';
import { DISC_KEY_MAS, DISC_KEY_MENOS, DISC_PATTERN_NAMES } from '../src/disc_data';
import { discPatternOf, discSegment, scoreDisc } from '../src/disc';
import oracle from './fixtures/disc_oracle.json';

/**
 * Oráculo: la hoja oficial DISC_HOJA_DE_PRUEBA_Y_CORRECCION.xlsm trae un caso ya calificado por Excel (caso «jaime»).
 * También se compara la conversión a segmentos de toda la tabla (−28 a +28) con lo que calcula Excel.
 */
describe('DISC contra la hoja oficial', () => {
  const answers = Object.fromEntries(
    Object.entries(oracle.sample.mas as Record<string, number>).map(([g, mas]) => [g, encodeDisc(mas, (oracle.sample.menos as Record<string, number>)[g]!)]),
  );

  it('reproduce el caso calificado por Excel: puntajes, segmentos y patrón', () => {
    const r = scoreDisc(answers);
    expect(r.complete).toBe(true);
    expect(r.scores).toEqual(oracle.sample.esperado.puntajes);
    expect(r.segments).toEqual(oracle.sample.esperado.segmentos);
    expect(`Patrón del ${r.pattern.nombre}`).toBe(oracle.sample.esperado.patron);
    expect(r.pattern.descripcion?.emociones.length).toBeGreaterThan(10);
    expect(r.keyValidated).toBe(true);
  });

  it('reproduce 40 casos aleatorios calificados por Excel (puntajes, segmentos y patrón)', () => {
    const cases = (oracle as unknown as { cases: { marks: Record<string, [number, number]>; scores: number[]; segs: number[]; pattern: string }[] }).cases;
    expect(cases).toHaveLength(40);
    cases.forEach((c, i) => {
      const r = scoreDisc(Object.fromEntries(Object.entries(c.marks).map(([g, [mas, menos]]) => [g, encodeDisc(mas, menos)])));
      expect([r.scores.D, r.scores.I, r.scores.S, r.scores.C], `caso ${i} puntajes`).toEqual(c.scores);
      expect([r.segments.D, r.segments.I, r.segments.S, r.segments.C], `caso ${i} segmentos`).toEqual(c.segs);
      expect(`Patrón del ${r.pattern.nombre}`, `caso ${i} patrón`).toBe(c.pattern);
    });
  });

  it('convierte cada puntaje de −28 a +28 al mismo segmento que Excel, en las cuatro escalas', () => {
    for (const sc of ['D', 'I', 'S', 'C'] as const) {
      for (const [v, seg] of Object.entries(oracle.segments[sc] as Record<string, number>)) {
        expect(discSegment(sc, Number(v)), `${sc} ${v}`).toBe(seg);
      }
    }
  });

  it('la clave de cada grupo usa D, I, S y C una vez por palabra, salvo una palabra sin puntaje en MÁS y otra en MENOS', () => {
    expect(DISC_KEY_MAS).toHaveLength(DISC_GROUPS.length);
    expect(DISC_KEY_MENOS).toHaveLength(DISC_GROUPS.length);
    expect(DISC_KEY_MAS.join('').split('-').length - 1).toBe(1);
    expect(DISC_KEY_MENOS.join('').split('-').length - 1).toBe(1);
    for (const row of [...DISC_KEY_MAS, ...DISC_KEY_MENOS]) {
      expect(row).toHaveLength(4);
      const letters = row.replace('-', '');
      expect(new Set(letters).size).toBe(letters.length); // sin repetir escala dentro del grupo
    }
  });

  it('todos los códigos de segmentos tienen patrón y los 15 patrones principales tienen descripción', () => {
    const names = new Set<string>();
    for (let d = 1; d <= 7; d++) for (let i = 1; i <= 7; i++) for (let s = 1; s <= 7; s++) for (let c = 1; c <= 7; c++) names.add(discPatternOf({ D: d, I: i, S: s, C: c }).nombre);
    expect(names.size).toBe(DISC_PATTERN_NAMES.length);
    expect(DISC_PATTERN_NAMES.filter((n) => !['Subactivo', 'Superactivo', 'Desconcertante'].includes(n))).toHaveLength(15);
  });

  it('ignora respuestas inválidas (misma palabra en MÁS y MENOS) y reporta que está incompleto', () => {
    const r = scoreDisc({ 1: encodeDisc(1, 1), 2: 99 });
    expect(r.groupsAnswered).toBe(0);
    expect(r.complete).toBe(false);
  });
});
