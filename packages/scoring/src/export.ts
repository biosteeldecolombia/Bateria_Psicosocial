/**
 * Registro de resultados por persona con la MISMA estructura que la hoja «DatosRPS» del libro oficial
 * (101 columnas A..CW). Es la estructura sobre la que la psicóloga hace su análisis (resumen total,
 * resumen por grupo, dominios y dimensiones), por lo que se conservan nombres, orden y etiquetas.
 */
import headersJson from './rps_headers.json';
import type { FullResult, RowResult } from './engine';
import { INVALID, spec } from './engine';

export const RPS_HEADERS = headersJson as string[];

// Etiquetas de codificación tal como las escribe el libro en DatosRPS (hoja DatGen).
export const RPS_LABELS = {
  sexo: ['Masculino', 'Femenino'],
  estadoCivil: ['Soltero(a)', 'Casado(a)', 'Union libre', 'Separado(a)', 'Divorciado(a)', 'Viudo(a)', 'Sacerdote/Monja'],
  estudios: ['Ninguno', 'Primaria incompleta', 'Primaria completa', 'Bachillerato incompleto', 'Bachillerato completo', 'Tecnico - tecnologo incompleto', 'Tecnico - tecnologo completo', 'Profesional incompleto', 'Profesional completo', 'Carrera militar / policia', 'Post-grado incompleto', 'Post-grado completo'],
  estrato: ['1', '2', '3', '4', '5', '6', 'Finca', 'No se'],
  vivienda: ['Propia', 'En arriendo', 'Familiar'],
  tipoCargo: ['Jefatura - tiene personal a cargo', 'Profesional - analista - técnico - tecnólogo', 'Auxiliar - asistente administrativo - asistente técnico', 'Operario, operador, ayudante, servicios generales'],
  contrato: ['Temporal de menos de 1 año', 'Temporal de 1 año o mas', 'Termino indefinido', 'Cooperado (cooperativa)', 'Prestacion de servicios', 'No se'],
  salario: ['Fijo', 'Una parte fija y otra variable', 'Todo variable'],
} as const;
export const NO_RESPONDE = 'No responde';

/** Datos de la ficha ya codificados como índices de opción (0-based); undefined = no responde. */
export interface PersonalCodes {
  document: string;
  fullName: string;
  /** Fecha de aplicación (ISO yyyy-mm-dd). */
  applicationDate: string;
  sexo?: number;
  birthYear?: number;
  estadoCivil?: number;
  estudios?: number;
  profesion?: string;
  residenciaCiudad?: string;
  residenciaDpto?: string;
  estrato?: number;
  vivienda?: number;
  dependientes?: number;
  trabajoCiudad?: string;
  trabajoDpto?: string;
  /** Antigüedad en la empresa: -1 = menos de un año, 0 = no responde, n = años. */
  antiguedadEmpresa?: number;
  cargo?: string;
  tipoCargo?: number;
  antiguedadCargo?: number;
  area?: string;
  contrato?: number;
  horasDia?: number;
  salario?: number;
}

const pick = (arr: readonly string[], i: number | undefined) => (i === undefined || arr[i] === undefined ? NO_RESPONDE : arr[i]!);

/** Columnas A..X de DatosRPS. */
export function personalColumns(p: PersonalCodes): (string | number)[] {
  const appYear = Number(p.applicationDate.slice(0, 4));
  return [
    p.document,
    p.fullName,
    pick(RPS_LABELS.sexo, p.sexo),
    p.applicationDate,
    p.birthYear === undefined || p.birthYear === 1900 ? NO_RESPONDE : appYear - p.birthYear,
    pick(RPS_LABELS.estadoCivil, p.estadoCivil),
    p.estudios === undefined ? NO_RESPONDE : `${p.estudios + 1}-${RPS_LABELS.estudios[p.estudios]}`,
    p.profesion ?? 0,
    p.residenciaCiudad ?? 0,
    p.residenciaDpto ?? 0,
    pick(RPS_LABELS.estrato, p.estrato),
    pick(RPS_LABELS.vivienda, p.vivienda),
    p.dependientes ?? 0,
    p.trabajoCiudad ?? 0,
    p.trabajoDpto ?? 0,
    p.antiguedadEmpresa ?? 0,
    p.cargo ?? 0,
    pick(RPS_LABELS.tipoCargo, p.tipoCargo),
    p.tipoCargo === undefined ? NO_RESPONDE : p.tipoCargo <= 1 ? 'A' : 'B',
    p.antiguedadCargo ?? 0,
    p.area ?? 0,
    pick(RPS_LABELS.contrato, p.contrato),
    p.horasDia === undefined || p.horasDia === 0 ? NO_RESPONDE : p.horasDia,
    pick(RPS_LABELS.salario, p.salario),
  ];
}

// Orden canónico de las 23 filas intralaborales en DatosRPS: [clave, id en Forma A, id en Forma B].
export const INTRA_ORDER: readonly [string, string, string | null][] = [
  ['lid', 'CARLID', 'CL'], ['relsoc', 'RELSOCTR', 'RST'], ['retro', 'RETRDES', 'RD'], ['relcol', 'RELCOL', null], ['dom_lrst', 'DOMINIO_LRST', 'DOMINIO_LRST'],
  ['clarol', 'CLARROL', 'CR'], ['cap', 'CAP', 'CAP'], ['oport', 'OPDLLOHAB', 'OP'], ['partic', 'PARTMANCAM', 'PMC'], ['control', 'CONTRAUTTR', 'CAT'], ['dom_cst', 'DOMINIO_CST', 'DOMINIO_CST'],
  ['ambient', 'DAEF', 'DAEF'], ['resp', 'ERC', null], ['consrol', 'CONSROL', null], ['emocion', 'DEMEM', 'DEM'], ['jornada', 'DJT', 'DJT'], ['influencia', 'ITREEXTR', 'IEE'], ['cuant', 'DEMCUANT', 'DCT'], ['mental', 'DEMCARMEN', 'DCM'], ['dom_dt', 'DOMINIO_DT', 'DOMINIO_DT'],
  ['reconoc', 'RECCOM', 'RECCOM'], ['recomp', 'RECOMP', 'RECOMP'], ['dom_rec', 'DOMINIO_REC', 'DOMINIO_REC'],
];
export const EXTRA_ORDER = ['TFT', 'RELF', 'CRI', 'SITE', 'CVE', 'IET', 'DVT'] as const;

const NA = 'No evaluado'; // así lo escribe el libro para las dimensiones que no aplican en la Forma B
const tv = (r: RowResult | undefined): string | number => (!r ? NA : r.valid ? r.transformed! : INVALID);
const lv = (r: RowResult | undefined): string => (!r ? NA : r.level);

/** Columnas Y..CW de DatosRPS para una persona con resultado completo. */
export function resultColumns(res: FullResult, dates: { intra: string; extra: string; stress: string }): (string | number | null)[] {
  const intraId = (a: string, b: string | null) => (res.form === 'A' ? a : b);
  const rowsI = INTRA_ORDER.map(([, a, b]) => {
    const id = intraId(a, b);
    return id ? res.intra.byId[id] : undefined;
  });
  const T = res.total;
  const rowsE = EXTRA_ORDER.map((id) => res.extra.byId[id]);
  const out: (string | number | null)[] = [dates.intra];
  out.push(...rowsI.map(tv));
  out.push(tv(res.intra.total), res.intra.total.valid ? res.intra.total.raw! : INVALID);
  out.push(...rowsI.map(lv));
  out.push(res.intra.total.level);
  out.push(dates.extra);
  out.push(...rowsE.map(tv));
  out.push(tv(res.extra.total), res.extra.total.valid ? res.extra.total.raw! : INVALID);
  out.push(...rowsE.map(lv));
  out.push(res.extra.total.level);
  out.push(T.valid ? T.raw! : 'Invalido', T.valid ? T.transformed! : 'Invalido', T.valid ? T.level : 'Invalido');
  out.push(dates.stress);
  out.push(res.stress.valid ? res.stress.raw! : 'Invalido', res.stress.valid ? res.stress.transformed! : 'Invalido', res.stress.level);
  out.push(null, null); // CV, CW: auxiliares internos del libro
  return out;
}

/** Fila completa (101 columnas) con el orden y los encabezados de DatosRPS. */
export function buildRpsRow(p: PersonalCodes, res: FullResult, dates: { intra: string; extra: string; stress: string }): (string | number | null)[] {
  const row = [...personalColumns(p), ...resultColumns(res, dates)];
  if (row.length !== RPS_HEADERS.length) throw new Error(`Fila DatosRPS con ${row.length} columnas; se esperaban ${RPS_HEADERS.length}`);
  return row;
}

/** Orden de gravedad de los niveles intralaborales y extralaborales (índice 0-4); null si inválido/no aplica. */
export function levelIndex(level: string): number | null {
  const i = spec.levels.intra.indexOf(level);
  return i >= 0 ? i : null;
}
export function stressLevelIndex(level: string): number | null {
  const i = spec.levels.stress.indexOf(level);
  return i >= 0 ? i : null;
}

/** Niveles de intervención del libro (hoja TD_DomDim, E107:E112). */
export const INTERVENTION_LEVELS = [
  'No requiere',
  'Acciones o programas de prevención',
  'Acciones o programas de intervención',
  'Observación y acciones sistemáticas de intervención',
  'Intervención en el marco de un Sistema de Vigilancia Epidemiológica',
  'Intervención INMEDIATA en el marco de un Sistema de Vigilancia Epidemiológica',
] as const;

/**
 * Nivel de intervención requerido para un grupo (regla del libro): se toma el nivel de riesgo MÁS ALTO presente.
 * counts[i] = personas en el nivel i (0 = sin riesgo ... 4 = muy alto). Devuelve 0 si no hay nadie.
 */
export function interventionIndex(counts: readonly number[]): number {
  for (let i = 4; i >= 0; i--) if ((counts[i] ?? 0) > 0) return i + 1;
  return 0;
}
