import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreExtralaboral, scoreIntralaboral, scoreStress, spec, type Answers, type CargoGroup, type Form, type RowResult } from '../src/engine';

/**
 * CASOS DE ORO: 1.400 casos aleatorios (semilla fija) calificados por el propio Excel oficial
 * («Bateria Psicosocial - PARA ENVIAR.xlsm») mediante tools/run_excel_oracle.ps1.
 * El motor debe reproducir EXACTAMENTE el bruto, el transformado y el nivel de cada dimensión, dominio y total.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'golden.json'), 'utf8')) as {
  cases: { sheet: string; idx: number; answers: Record<string, number | null>; gates: Record<string, boolean>; cargo: number }[];
  oracle: { sheet: string; idx: number; out: Record<string, string | number | null> }[];
};
const oracle = new Map(golden.oracle.map((o) => [`${o.sheet}#${o.idx}`, o.out]));

const toAnswers = (a: Record<string, number | null>): Answers => Object.fromEntries(Object.entries(a).map(([k, v]) => [Number(k), v]));
const raw = (r: RowResult) => (r.valid ? r.raw : 'invalido');
const trans = (r: RowResult) => (r.valid ? r.transformed : 'invalido');

// Filas del libro (131..154) -> id de fila del motor. La Forma B omite las 3 filas «No aplica» (134, 143, 144).
const intraRowMap = (form: Form): [number, string][] => {
  const rows = form === 'A' ? spec.intraA.rows : spec.intraB.rows;
  const excelRows = Array.from({ length: 24 }, (_, i) => 131 + i).filter((r) => form === 'A' || ![134, 143, 144].includes(r));
  expect(excelRows.length).toBe(rows.length);
  return excelRows.map((r, i) => [r, rows[i]!.id]);
};

describe('motor vs Excel oficial', () => {
  for (const [sheet, form] of [['ForA', 'A'], ['ForB', 'B']] as const) {
    it(`Intralaboral Forma ${form}: todas las filas coinciden con el Excel`, () => {
      const cases = golden.cases.filter((c) => c.sheet === sheet);
      expect(cases.length).toBeGreaterThan(300);
      const map = intraRowMap(form);
      let checked = 0;
      for (const c of cases) {
        const ex = oracle.get(`${sheet}#${c.idx}`)!;
        const res = scoreIntralaboral(form, toAnswers(c.answers), c.gates);
        for (const [row, id] of map) {
          const r = res.byId[id]!;
          const where = `${sheet} caso ${c.idx} fila ${row} (${id})`;
          expect({ w: where, v: raw(r) }).toEqual({ w: where, v: ex[`AE${row}`] });
          expect({ w: where, v: trans(r) }).toEqual({ w: where, v: ex[`AJ${row}`] });
          expect({ w: where, v: r.valid ? r.level : 'invalido' }).toEqual({ w: where, v: ex[`AK${row}`] });
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(7000);
    });
  }

  it('Extralaboral: coincide con el Excel para ambos grupos de cargo', () => {
    const cases = golden.cases.filter((c) => c.sheet === 'ForEx');
    const ids = spec.extra.rows.map((r) => r.id);
    for (const c of cases) {
      const ex = oracle.get(`ForEx#${c.idx}`)!;
      const res = scoreExtralaboral(toAnswers(c.answers), (c.cargo <= 2 ? '12' : '34') as CargoGroup);
      ids.forEach((id, i) => {
        const row = 37 + i;
        const r = res.byId[id]!;
        const where = `ForEx caso ${c.idx} fila ${row} (${id}) cargo ${c.cargo}`;
        expect({ w: where, v: raw(r) }).toEqual({ w: where, v: ex[`AF${row}`] });
        expect({ w: where, v: trans(r) }).toEqual({ w: where, v: ex[`AK${row}`] });
        // AM = nivel con la Tabla 17 (cargos 1-2); AS = nivel con la Tabla 18 (cargos 3-4)
        const col = c.cargo <= 2 ? 'AM' : 'AS';
        // Si la dimensión es inválida, el libro (AL) devuelve «invalido»; AM/AS solos compararían texto con números.
        // La validez ya se verifica arriba contra AF/AK del propio Excel.
        expect({ w: where, v: r.level }).toEqual({ w: where, v: r.valid ? ex[`${col}${row}`] : 'invalido' });
      });
    }
  });

  it('Estrés: bruto, transformado y nivel coinciden con el Excel', () => {
    const cases = golden.cases.filter((c) => c.sheet === 'ForEstr');
    for (const c of cases) {
      const ex = oracle.get(`ForEstr#${c.idx}`)!;
      const r = scoreStress(toAnswers(c.answers), (c.cargo <= 2 ? '12' : '34') as CargoGroup);
      const where = `ForEstr caso ${c.idx} cargo ${c.cargo}`;
      expect({ w: where, v: r.raw ?? 'Invalido' }).toEqual({ w: where, v: ex['Y41'] });
      expect({ w: where, v: r.transformed ?? 'Invalido' }).toEqual({ w: where, v: ex['Y42'] });
      // AI40 = nivel con baremo de cargos 1-2; AI41 = cargos 3-4. El libro (Y43) devuelve «Invalido» si no se respondieron las 31 preguntas;
      // las celdas AI40/AI41 por sí solas comparan texto con números y darían «Muy alto», por eso no se usan en ese caso.
      const expectedLevel = r.valid ? ex[c.cargo <= 2 ? 'AI40' : 'AI41'] : 'Invalido';
      expect({ w: where, v: r.level }).toEqual({ w: where, v: expectedLevel });
    }
  });
});
