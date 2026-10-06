/**
 * Motor de calificación de la Batería de Riesgo Psicosocial.
 * Réplica del libro oficial «Bateria Psicosocial - PARA ENVIAR.xlsm» (RCG v08k, ajuste de baremos Ene/2011).
 * Módulo PURO: sin base de datos ni UI. Los datos (puntajes por ítem, dimensiones, baremos) están en spec.json,
 * generado por tools/extract_scoring_spec.py directamente de las fórmulas del Excel.
 *
 * Convención de respuestas: índice de opción 0-based en el orden mostrado (0 = «Siempre»).
 * null / undefined = sin responder (NR).
 */
import specJson from './spec.json';

export const ENGINE_VERSION = 'rcg-08k/1';
export const INVALID = 'invalido' as const;

export type Form = 'A' | 'B';
/** Grupo de tipo de cargo: '12' = jefatura o profesional/técnico (Forma A); '34' = auxiliar u operario (Forma B). */
export type CargoGroup = '12' | '34';
export type Answers = Record<number, number | null | undefined>;
export interface Gates {
  clients?: boolean;
  boss?: boolean;
}

interface ItemTable {
  n: number;
  scores: number[];
}
interface SpecRow {
  id: string;
  name: string;
  kind: 'dimension' | 'domain' | 'total';
  items?: number[];
  maxMissing?: number;
  parts?: string[];
  thresholds: number[] | Record<CargoGroup, number[]>;
}
interface Spec {
  source: { file: string; sha256: string; version: string };
  levels: { intra: string[]; stress: string[] };
  intraA: { items: ItemTable[]; gates: Record<string, [number, number]>; rows: SpecRow[] };
  intraB: { items: ItemTable[]; gates: Record<string, [number, number]>; rows: SpecRow[] };
  extra: { items: ItemTable[]; rows: SpecRow[] };
  stress: { items: ItemTable[]; groups: { id: string; items: number[]; weight: number }[]; divisor: number; thresholds: Record<CargoGroup, number[]> };
  total: Record<Form, { divisor: number; thresholds: number[] }>;
}
export const spec = specJson as unknown as Spec;

/** ROUND de Excel: redondeo «mitad hacia afuera» sobre la representación decimal de 15 cifras significativas. */
export function roundExcel(x: number, digits: number): number {
  const s = Number(x.toPrecision(15));
  const sign = s < 0 ? -1 : 1;
  return sign * Number(Math.round(Number(`${Math.abs(s)}e${digits}`)) + `e-${digits}`);
}

export interface RowResult {
  id: string;
  name: string;
  kind: 'dimension' | 'domain' | 'total';
  nItems: number;
  answered: number;
  valid: boolean;
  /** Puntaje bruto (null si inválido). */
  raw: number | null;
  /** Puntaje transformado 0-100 con un decimal (null si inválido). */
  transformed: number | null;
  /** Nivel de riesgo, o 'invalido'. */
  level: string;
}

function levelOf(value: number, thr: number[], labels: string[]): string {
  return value > thr[3]! ? labels[4]! : value > thr[2]! ? labels[3]! : value > thr[1]! ? labels[2]! : value > thr[0]! ? labels[1]! : labels[0]!;
}

function itemScore(items: ItemTable[], n: number, answer: number | null | undefined): { score: number; answered: boolean } {
  if (answer === null || answer === undefined) return { score: 0, answered: false };
  const s = items[n - 1]!.scores[answer];
  if (s === undefined) throw new Error(`Respuesta fuera de rango en el ítem ${n}`);
  return { score: s, answered: true };
}

/** Un ítem de una compuerta Sí/No respondida «No» cuenta como contestado con puntaje 0 (así lo hace el Excel oficial). */
function gateOff(gates: Record<string, [number, number]>, g: Gates, n: number): boolean {
  for (const [key, [a, b]] of Object.entries(gates)) if (n >= a && n <= b && g[key as keyof Gates] === false) return true;
  return false;
}

export interface IntraResult {
  form: Form;
  rows: RowResult[];
  byId: Record<string, RowResult>;
  total: RowResult;
}

export function scoreIntralaboral(form: Form, answers: Answers, gates: Gates = {}): IntraResult {
  const sp = form === 'A' ? spec.intraA : spec.intraB;
  const L = spec.levels.intra;
  const perItem = (n: number) => (gateOff(sp.gates, gates, n) ? { score: 0, answered: true } : itemScore(sp.items, n, answers[n]));
  const byId: Record<string, RowResult> = {};
  const rows: RowResult[] = [];
  for (const r of sp.rows) {
    let res: RowResult;
    if (r.kind === 'dimension') {
      let answered = 0;
      let sum = 0;
      for (const n of r.items!) {
        const s = perItem(n);
        answered += s.answered ? 1 : 0;
        sum += s.score;
      }
      const nItems = r.items!.length;
      const valid = answered >= nItems - (r.maxMissing ?? 0);
      res = { id: r.id, name: r.name, kind: r.kind, nItems, answered, valid, raw: valid ? sum : null, transformed: null, level: INVALID };
    } else {
      const parts = r.parts!.map((p) => byId[p]!);
      const valid = parts.every((p) => p.valid);
      res = {
        id: r.id,
        name: r.name,
        kind: r.kind,
        nItems: parts.reduce((a, p) => a + p.nItems, 0),
        answered: parts.reduce((a, p) => a + p.answered, 0),
        valid,
        raw: valid ? parts.reduce((a, p) => a + p.raw!, 0) : null,
        transformed: null,
        level: INVALID,
      };
    }
    if (res.valid) {
      res.transformed = roundExcel((res.raw! / (res.nItems * 4)) * 100, 1);
      res.level = levelOf(res.transformed, r.thresholds as number[], L);
    }
    byId[r.id] = res;
    rows.push(res);
  }
  return { form, rows, byId, total: byId['TOTAL']! };
}

export interface ExtraResult {
  rows: RowResult[];
  byId: Record<string, RowResult>;
  total: RowResult;
}

export function scoreExtralaboral(answers: Answers, cargo: CargoGroup): ExtraResult {
  const L = spec.levels.intra;
  const byId: Record<string, RowResult> = {};
  const rows: RowResult[] = [];
  for (const r of spec.extra.rows) {
    let res: RowResult;
    if (r.kind === 'dimension') {
      let answered = 0;
      let sum = 0;
      for (const n of r.items!) {
        const s = itemScore(spec.extra.items, n, answers[n]);
        answered += s.answered ? 1 : 0;
        sum += s.score;
      }
      const nItems = r.items!.length;
      const valid = answered >= nItems - (r.maxMissing ?? 0);
      res = { id: r.id, name: r.name, kind: r.kind, nItems, answered, valid, raw: sum, transformed: null, level: INVALID };
    } else {
      const parts = r.parts!.map((p) => byId[p]!);
      const valid = parts.every((p) => p.valid);
      res = {
        id: r.id,
        name: r.name,
        kind: r.kind,
        nItems: parts.reduce((a, p) => a + p.nItems, 0),
        answered: parts.reduce((a, p) => a + p.answered, 0),
        valid,
        // El total extralaboral suma los brutos de las 7 dimensiones (como el Excel), solo si todas son válidas.
        raw: valid ? parts.reduce((a, p) => a + p.raw!, 0) : null,
        transformed: null,
        level: INVALID,
      };
    }
    if (res.valid) {
      res.transformed = roundExcel((res.raw! / (res.nItems * 4)) * 100, 1);
      res.level = levelOf(res.transformed, (r.thresholds as Record<CargoGroup, number[]>)[cargo], L);
    } else if (r.kind === 'dimension') {
      res.raw = null;
    }
    byId[r.id] = res;
    rows.push(res);
  }
  return { rows, byId, total: byId['TOTAL']! };
}

export interface StressResult {
  valid: boolean;
  answered: number;
  raw: number | null;
  transformed: number | null;
  level: string;
}

export function scoreStress(answers: Answers, cargo: CargoGroup): StressResult {
  let answered = 0;
  const sc: Record<number, number> = {};
  for (const it of spec.stress.items) {
    const s = itemScore(spec.stress.items, it.n, answers[it.n]);
    answered += s.answered ? 1 : 0;
    sc[it.n] = s.score;
  }
  if (answered < 31) return { valid: false, answered, raw: null, transformed: null, level: 'Invalido' };
  let sum = 0;
  for (const g of spec.stress.groups) sum += (g.items.reduce((a, n) => a + sc[n]!, 0) / g.items.length) * g.weight;
  const raw = roundExcel(sum, 2);
  const transformed = roundExcel((raw * 100) / spec.stress.divisor, 1);
  return { valid: true, answered, raw, transformed, level: levelOf(transformed, spec.stress.thresholds[cargo], spec.levels.stress) };
}

export interface TotalResult {
  valid: boolean;
  raw: number | null;
  transformed: number | null;
  level: string;
}

/** Total general intra + extra (Tabla 34): suma de brutos sobre 616 (Forma A) o 512 (Forma B). */
export function scoreTotal(form: Form, intra: IntraResult, extra: ExtraResult): TotalResult {
  const i = intra.total;
  const e = extra.total;
  if (!i.valid || !e.valid) return { valid: false, raw: null, transformed: null, level: INVALID };
  const t = spec.total[form];
  const raw = i.raw! + e.raw!;
  const transformed = roundExcel((raw * 100) / t.divisor, 1);
  return { valid: true, raw, transformed, level: levelOf(transformed, t.thresholds, spec.levels.intra) };
}

/** Grupo de cargo desde la pregunta 14 de la ficha (índice de la opción: 0 jefatura, 1 profesional, 2 auxiliar, 3 operario). */
export const cargoGroupOf = (cargoIndex: number): CargoGroup => (cargoIndex <= 1 ? '12' : '34');
export const formOf = (cargoIndex: number): Form => (cargoIndex <= 1 ? 'A' : 'B');

export interface FullInput {
  cargoIndex: number;
  intra: { answers: Answers; gates: Gates };
  extra: { answers: Answers };
  stress: { answers: Answers };
}
export interface FullResult {
  form: Form;
  cargo: CargoGroup;
  intra: IntraResult;
  extra: ExtraResult;
  stress: StressResult;
  total: TotalResult;
}

export function scoreAll(input: FullInput): FullResult {
  const form = formOf(input.cargoIndex);
  const cargo = cargoGroupOf(input.cargoIndex);
  const intra = scoreIntralaboral(form, input.intra.answers, input.intra.gates);
  const extra = scoreExtralaboral(input.extra.answers, cargo);
  return { form, cargo, intra, extra, stress: scoreStress(input.stress.answers, cargo), total: scoreTotal(form, intra, extra) };
}
