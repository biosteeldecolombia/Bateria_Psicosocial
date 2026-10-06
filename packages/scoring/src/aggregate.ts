/**
 * Agregaciones para el análisis de la psicóloga, con la misma lógica de los resúmenes del libro oficial:
 *  - ResTOT:   número de personas por nivel de riesgo (intralaboral, extralaboral, total) y por nivel de estrés.
 *  - ResTOT2:  la misma distribución para un grupo (tipo de cargo, área, cargo...).
 *  - TD_DomDim: por característica (sexo, estado civil...), conteo por nivel en cada dominio y dimensión,
 *               y «nivel de intervención requerido» según el nivel de riesgo más alto presente.
 * Trabajan sobre filas de 101 columnas con el formato de DatosRPS (ver export.ts).
 */
import { RPS_HEADERS, INTERVENTION_LEVELS, interventionIndex } from './export';
import { spec } from './engine';

export type RpsRow = (string | number | null)[];
const H = (name: string) => {
  const i = RPS_HEADERS.indexOf(name);
  if (i < 0) throw new Error(`Columna de DatosRPS inexistente: ${name}`);
  return i;
};
const col = (idx: number) => idx;

/** Columnas por las que se puede agrupar (características de la ficha). */
export const GROUPING_FIELDS = [
  'TIPO DE CARGO', 'Dpto/Area/Secc', 'CARGO', 'Sexo', 'ESTADO_CIVIL', 'NIVEL_ESTUDIOS', 'ESTRATO', 'TIPO_VIVIENDA',
  'TIPO_CONTRATO', 'TIPO_SALARIO', 'FORMATOINTRAL_TIPOCARGO', 'RESIDENCIA_CIUDAD', 'TRABAJO_CIUDAD',
] as const;
export type GroupingField = (typeof GROUPING_FIELDS)[number];

export const INTRA_LEVELS = spec.levels.intra;
export const STRESS_LEVELS = spec.levels.stress;
const STRESS_COLUMN = H('NIVEL DE ESTRÉS');
const INTRA_TOTAL_LEVEL = H('RIESGO INTRALABORAL');
const EXTRA_TOTAL_LEVEL = H('RIESGO EXTRALABORAL');
const TOTAL_LEVEL = H('RIESGO TOTAL (INTRA+EXTRA LABORAL)');

export interface LevelCounts {
  /** Conteo por nivel, en el orden de los niveles (sin riesgo ... muy alto). */
  counts: number[];
  /** Encuestas inválidas (no calificables). */
  invalid: number;
  /** Total de encuestas contadas (incluye inválidas), como «TOTAL encuestas aplicadas» del libro. */
  total: number;
}

function countLevels(rows: RpsRow[], column: number, levels: readonly string[]): LevelCounts {
  const counts = levels.map(() => 0);
  let invalid = 0;
  let total = 0;
  for (const r of rows) {
    const v = r[col(column)];
    if (v === 'No evaluado' || v === null || v === undefined) continue;
    total++;
    const i = typeof v === 'string' ? levels.findIndex((l) => l.toLowerCase() === v.toLowerCase()) : -1;
    if (i >= 0) counts[i]!++;
    else invalid++;
  }
  return { counts, invalid, total };
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export interface SummaryTotal {
  people: number;
  intra: LevelCounts;
  extra: LevelCounts;
  total: LevelCounts;
  stress: LevelCounts;
  /** Porcentajes de personas por nivel (sobre encuestas válidas+inválidas), 1 decimal. */
  percent: { intra: number[]; extra: number[]; total: number[]; stress: number[] };
  /** Promedios de puntaje transformado y el nivel que les corresponde (libro: «BAREMOS PROMEDIO»). */
  average: { intra: number | null; extra: number | null; total: number | null; stress: number | null };
}

function avg(rows: RpsRow[], column: number): number | null {
  const v = rows.map((r) => r[column]).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
}

/** ResTOT / ResTOT2: distribución de personas por nivel de riesgo. */
export function summaryTotal(rows: RpsRow[]): SummaryTotal {
  const intra = countLevels(rows, INTRA_TOTAL_LEVEL, INTRA_LEVELS);
  const extra = countLevels(rows, EXTRA_TOTAL_LEVEL, INTRA_LEVELS);
  const total = countLevels(rows, TOTAL_LEVEL, INTRA_LEVELS);
  const stress = countLevels(rows, STRESS_COLUMN, STRESS_LEVELS);
  const p = (c: LevelCounts) => c.counts.map((n) => pct(n, c.total));
  return {
    people: rows.length,
    intra, extra, total, stress,
    percent: { intra: p(intra), extra: p(extra), total: p(total), stress: p(stress) },
    average: {
      intra: avg(rows, H('puntaje total Intralaboral TRANSFORMADO')),
      extra: avg(rows, H('Puntaje extralaboral transformado')),
      total: avg(rows, H('PTAJE TRANSFORMADO (INTRA+EXTRA LABORAL)')),
      stress: avg(rows, H('Estres_Puntaje transformado')),
    },
  };
}

/** Valores presentes de un campo de agrupación, con su número de personas (para el selector de «grupo deseado»). */
export function groupValues(rows: RpsRow[], field: GroupingField): { value: string; people: number }[] {
  const i = H(field);
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[i] ?? '');
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([value, people]) => ({ value, people })).sort((a, b) => b.people - a.people || a.value.localeCompare(b.value, 'es'));
}

/** Filtra por característica; '*' = todas, como en el libro. */
export function filterRows(rows: RpsRow[], field: GroupingField | null, value: string): RpsRow[] {
  if (!field || value === '*') return rows;
  const i = H(field);
  return rows.filter((r) => String(r[i] ?? '') === value);
}

export interface DomainRowDef {
  label: string;
  /** Nombre de la columna de nivel en DatosRPS. */
  column: string;
  kind: 'dimension' | 'domain' | 'total';
}
export interface DomainBlock {
  title: string;
  rows: DomainRowDef[];
  levels: readonly string[];
}

const intraNames = (s: string) => `IntDim_RIESGO ${s}`;
const dom = (s: string) => `IntDOM_RIESGO ${s}`;
/** Estructura de la hoja TD_DomDim: dominios con sus dimensiones, extralaboral, totales y estrés. */
export const DOMAIN_BLOCKS: DomainBlock[] = [
  {
    title: 'LIDERAZGO Y RELACIONES SOCIALES', levels: INTRA_LEVELS,
    rows: [
      { label: 'Características del liderazgo', column: intraNames('Características del liderazgo'), kind: 'dimension' },
      { label: 'Relaciones sociales en el trabajo', column: intraNames('Relaciones sociales en el trabajo'), kind: 'dimension' },
      { label: 'Retroalimentación del desempeño', column: intraNames('Retroalimentación del desempeño'), kind: 'dimension' },
      { label: 'Relación con los colaboradores', column: intraNames('Relación con los colaboradores'), kind: 'dimension' },
      { label: 'TOTAL DOMINIO', column: dom('Liderazgo y relaciones sociales en el trabajo'), kind: 'domain' },
    ],
  },
  {
    title: 'CONTROL SOBRE EL TRABAJO', levels: INTRA_LEVELS,
    rows: [
      { label: 'Claridad de rol', column: intraNames('Claridad de rol'), kind: 'dimension' },
      { label: 'Capacitación', column: intraNames('Capacitación'), kind: 'dimension' },
      { label: 'Oportunidades para el uso y desarrollo de habilidades y conocimientos', column: intraNames('Oportunidades para el uso y desarrollo de habilidades y conocimientos'), kind: 'dimension' },
      { label: 'Participación y manejo del cambio', column: intraNames('Participación y manejo del cambio'), kind: 'dimension' },
      { label: 'Control y autonomía sobre el trabajo', column: intraNames('Control y autonomía sobre el trabajo'), kind: 'dimension' },
      { label: 'TOTAL DOMINIO', column: dom('Control sobre el trabajo'), kind: 'domain' },
    ],
  },
  {
    title: 'DEMANDAS DEL TRABAJO', levels: INTRA_LEVELS,
    rows: [
      { label: 'Demandas ambientales y de esfuerzo físico', column: intraNames('Demandas ambientales y de esfuerzo físico'), kind: 'dimension' },
      { label: 'Nivel de responsabilidad del cargo', column: intraNames('Nivel de responsabilidad del cargo'), kind: 'dimension' },
      { label: 'Consistencia del rol', column: intraNames('Consistencia del rol'), kind: 'dimension' },
      { label: 'Demandas emocionales', column: intraNames('Demandas emocionales'), kind: 'dimension' },
      { label: 'Demandas de la jornada de trabajo', column: intraNames('Demandas de la jornada de trabajo'), kind: 'dimension' },
      { label: 'Influencia del trabajo sobre el entorno extralaboral', column: intraNames('Influencia del trabajo sobre el entorno extralaboral'), kind: 'dimension' },
      { label: 'Demandas cuantitativas', column: intraNames('Demandas cuantitativas'), kind: 'dimension' },
      { label: 'Demandas de carga mental', column: intraNames('Demandas de carga mental'), kind: 'dimension' },
      { label: 'TOTAL DOMINIO', column: dom('Demandas del trabajo'), kind: 'domain' },
    ],
  },
  {
    title: 'RECOMPENSAS', levels: INTRA_LEVELS,
    rows: [
      { label: 'Reconocimiento y compensación', column: intraNames('Reconocimiento y compensación'), kind: 'dimension' },
      { label: 'Recompensas derivadas de la pertenencia a la organización y del trabajo que se realiza', column: intraNames('Recompensas derivadas de la pertenencia a la organización y del trabajo que se realiza'), kind: 'dimension' },
      { label: 'TOTAL DOMINIO', column: dom('Recompensas'), kind: 'domain' },
    ],
  },
  { title: 'RIESGO PSICOSOCIAL INTRALABORAL', levels: INTRA_LEVELS, rows: [{ label: 'TOTAL RIESGO INTRALABORAL', column: 'RIESGO INTRALABORAL', kind: 'total' }] },
  {
    title: 'RIESGO PSICOSOCIAL EXTRALABORAL', levels: INTRA_LEVELS,
    rows: [
      ...['Tiempo fuera del trabajo', 'Relaciones familiares', 'Comunicación y relaciones interpersonales', 'Situación económica', 'Características de la vivienda y de su entorno', 'Influencia del entorno extralaboral sobre el trabajo', 'Desplazamiento vivienda – trabajo – vivienda'].map(
        (l): DomainRowDef => ({ label: l, column: `ExtDim_${l === 'Situación económica' ? 'Situación económica' : l} riesgo`, kind: 'dimension' }),
      ),
      { label: 'TOTAL EXTRALABORAL', column: 'RIESGO EXTRALABORAL', kind: 'total' },
    ],
  },
  { title: 'RIESGO PSICOSOCIAL TOTAL (INTRA + EXTRALABORAL)', levels: INTRA_LEVELS, rows: [{ label: 'RIESGO TOTAL (INTRA+EXTRA LABORAL)', column: 'RIESGO TOTAL (INTRA+EXTRA LABORAL)', kind: 'total' }] },
  { title: 'NIVEL DE ESTRÉS', levels: STRESS_LEVELS, rows: [{ label: 'NIVEL DE ESTRÉS', column: 'NIVEL DE ESTRÉS', kind: 'total' }] },
];

export interface DomainTableRow {
  label: string;
  kind: 'dimension' | 'domain' | 'total';
  counts: number[];
  invalid: number;
  /** Índice 0-5 en INTERVENTION_LEVELS (regla del libro: nivel de riesgo más alto presente). */
  intervention: number;
  interventionText: string;
}
export interface DomainTable {
  title: string;
  levels: readonly string[];
  rows: DomainTableRow[];
}

/** TD_DomDim: por cada dominio y dimensión, personas por nivel e intervención requerida. */
export function domainTables(rows: RpsRow[]): DomainTable[] {
  return DOMAIN_BLOCKS.map((b) => ({
    title: b.title,
    levels: b.levels,
    rows: b.rows.map((d) => {
      const c = countLevels(rows, H(d.column), b.levels);
      const iv = interventionIndex(c.counts);
      return { label: d.label, kind: d.kind, counts: c.counts, invalid: c.invalid, intervention: iv, interventionText: INTERVENTION_LEVELS[iv]! };
    }),
  }));
}
