import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { roundExcel, spec } from '../src/engine';

/** El redondeo del motor debe ser idéntico al ROUND de Excel (valores calculados por Excel, tools/excel_round_oracle.ps1). */
const here = path.dirname(fileURLToPath(import.meta.url));
const ref = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'round.json'), 'utf8').replace(/^﻿/, '')) as {
  A: number[];
  B: number[];
  stress: { a: number; b: number; c: number; d: number; raw: number; tr: number }[];
};

describe('redondeo idéntico a Excel', () => {
  it('total intra + extra, Forma A: todos los brutos 0..616', () => {
    expect(ref.A.length).toBe(617);
    ref.A.forEach((expected, x) => expect(roundExcel((x * 100) / spec.total.A.divisor, 1), `bruto ${x}`).toBe(expected));
  });
  it('total intra + extra, Forma B: todos los brutos 0..512', () => {
    expect(ref.B.length).toBe(513);
    ref.B.forEach((expected, x) => expect(roundExcel((x * 100) / spec.total.B.divisor, 1), `bruto ${x}`).toBe(expected));
  });
  it('estrés: bruto (2 decimales) y transformado sobre 61,16', () => {
    expect(ref.stress.length).toBeGreaterThan(2000);
    for (const r of ref.stress) {
      const raw = roundExcel((r.a / 8) * 4 + (r.b / 4) * 3 + (r.c / 10) * 2 + r.d / 9, 2);
      expect({ r, v: raw }).toEqual({ r, v: r.raw });
      expect({ r, v: roundExcel((raw * 100) / spec.stress.divisor, 1) }).toEqual({ r, v: r.tr });
    }
  });
  it('mitad hacia afuera con representación binaria inexacta', () => {
    expect(roundExcel(1.005, 2)).toBe(1.01);
    expect(roundExcel(2.675, 2)).toBe(2.68);
    expect(roundExcel(12.25, 1)).toBe(12.3);
    expect(roundExcel(0.05, 1)).toBe(0.1);
  });
});
