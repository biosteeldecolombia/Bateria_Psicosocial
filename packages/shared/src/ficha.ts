// Ficha de datos generales: 19 preguntas con textos y opciones literales del formato oficial.

export type FichaQuestion =
  | { n: number; label: string; type: 'text'; max?: number }
  | { n: number; label: string; type: 'single'; options: readonly string[] }
  | { n: number; label: string; type: 'number'; min: number; max: number; suffix?: string }
  | { n: number; label: string; type: 'place' }
  | { n: number; label: string; type: 'years'; lessThanYear: string; moreThanYear: string };

export const FICHA_INTRO = [
  'Las siguientes son algunas preguntas que se refieren a información general de usted o su ocupación.',
  'Por favor seleccione una sola respuesta para cada pregunta y márquela o escríbala en la casilla. Escriba con letra clara y legible.',
];

export const CARGO_OPTIONS = [
  'Jefatura - tiene personal a cargo',
  'Profesional, analista, técnico, tecnólogo',
  'Auxiliar, asistente administrativo, asistente técnico',
  'Operario, operador, ayudante, servicios generales',
] as const;

/** Forma intralaboral según el tipo de cargo (pregunta 14): A = jefaturas y profesionales/técnicos; B = auxiliares y operarios. */
export const formFromCargo = (cargo: string): 'A' | 'B' | null => {
  const i = (CARGO_OPTIONS as readonly string[]).indexOf(cargo);
  return i < 0 ? null : i <= 1 ? 'A' : 'B';
};

const YEARS = { lessThanYear: 'Si lleva menos de un año marque esta opción', moreThanYear: 'Si lleva más de un año, anote cuántos años' } as const;

export const FICHA: readonly FichaQuestion[] = [
  { n: 1, label: 'Nombre completo:', type: 'text', max: 200 },
  { n: 2, label: 'Sexo:', type: 'single', options: ['Masculino', 'Femenino'] },
  { n: 3, label: 'Año de nacimiento:', type: 'number', min: 1900, max: 2100 },
  { n: 4, label: 'Estado civil:', type: 'single', options: ['Soltero (a)', 'Casado (a)', 'Unión libre', 'Separado (a)', 'Divorciado (a)', 'Viudo (a)', 'Sacerdote / Monja'] },
  {
    n: 5,
    label: 'Último nivel de estudios que alcanzó (marque una sola opción)',
    type: 'single',
    options: ['Ninguno', 'Primaria incompleta', 'Primaria completa', 'Bachillerato incompleto', 'Bachillerato completo', 'Técnico / tecnológico incompleto', 'Técnico / tecnológico completo', 'Profesional incompleto', 'Profesional completo', 'Carrera militar / policía', 'Post-grado incompleto', 'Post-grado completo'],
  },
  { n: 6, label: '¿Cuál es su ocupación o profesión?', type: 'text', max: 200 },
  { n: 7, label: 'Lugar de residencia actual:', type: 'place' },
  { n: 8, label: 'Seleccione y marque el estrato de los servicios públicos de su vivienda', type: 'single', options: ['1', '2', '3', '4', '5', '6', 'Finca', 'No sé'] },
  { n: 9, label: 'Tipo de vivienda', type: 'single', options: ['Propia', 'En arriendo', 'Familiar'] },
  { n: 10, label: 'Número de personas que dependen económicamente de usted (aunque vivan en otro lugar)', type: 'number', min: 0, max: 50 },
  { n: 11, label: 'Lugar donde trabaja actualmente:', type: 'place' },
  { n: 12, label: '¿Hace cuántos años que trabaja en esta empresa?', type: 'years', ...YEARS },
  { n: 13, label: '¿Cuál es el nombre del cargo que ocupa en la empresa?', type: 'text', max: 200 },
  { n: 14, label: 'Seleccione el tipo de cargo que más se parece al que usted desempeña y señalelo en el cuadro correspondiente de la derecha. Si tiene dudas pida apoyo a la persona que le entregó este cuestionario', type: 'single', options: CARGO_OPTIONS },
  { n: 15, label: '¿Hace cuántos años que desempeña el cargo u oficio actual en esta empresa?', type: 'years', ...YEARS },
  { n: 16, label: 'Escriba el nombre del departamento, área o sección de la empresa en el que trabaja', type: 'text', max: 200 },
  { n: 17, label: 'Seleccione el tipo de contrato que tiene actualmente (marque una sola opción)', type: 'single', options: ['Temporal de menos de 1 año', 'Temporal de 1 año o más', 'Término indefinido', 'Cooperado (cooperativa)', 'Prestación de servicios', 'No sé'] },
  { n: 18, label: 'Indique cuántas horas diarias de trabajo están establecidas habitualmente por la empresa para su cargo', type: 'number', min: 1, max: 24, suffix: 'horas de trabajo al día' },
  { n: 19, label: 'Seleccione y marque el tipo de salario que recibe (marque una sola opción)', type: 'single', options: ['Fijo (diario, semanal, quincenal o mensual)', 'Una parte fija y otra variable', 'Todo variable (a destajo, por producción, por comisión)'] },
];

/** Respuestas de la ficha, por número de pregunta. */
export type FichaAnswers = {
  [n: string]: string | number | { city: string; department: string } | { lessThanYear: boolean; years?: number };
};

const str = (v: unknown, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Valida cada respuesta presente; con `complete` exige además que estén las 19. Devuelve errores por pregunta. */
export function validateFicha(data: unknown, complete: boolean): Record<number, string> {
  const errors: Record<number, string> = {};
  const a = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  for (const key of Object.keys(a)) if (!FICHA.some((q) => String(q.n) === key)) errors[Number(key) || 0] = 'Pregunta desconocida';
  for (const q of FICHA) {
    const v = a[String(q.n)];
    if (v === undefined || v === null || v === '') {
      if (complete) errors[q.n] = 'Esta pregunta es obligatoria.';
      continue;
    }
    switch (q.type) {
      case 'text':
        if (!str(v, q.max ?? 200)) errors[q.n] = 'Escribe una respuesta (máximo 200 caracteres).';
        break;
      case 'single':
        if (typeof v !== 'string' || !q.options.includes(v)) errors[q.n] = 'Selecciona una de las opciones.';
        break;
      case 'number':
        if (typeof v !== 'number' || !Number.isInteger(v) || v < q.min || v > q.max) errors[q.n] = `Escribe un número entero entre ${q.min} y ${q.max}.`;
        break;
      case 'place': {
        const p = v as { city?: unknown; department?: unknown };
        if (typeof v !== 'object' || !str(p.city, 100) || !str(p.department, 100)) errors[q.n] = 'Escribe la ciudad o municipio y el departamento.';
        break;
      }
      case 'years': {
        const y = v as { lessThanYear?: unknown; years?: unknown };
        const ok = typeof v === 'object' && typeof y.lessThanYear === 'boolean' && (y.lessThanYear || (typeof y.years === 'number' && Number.isInteger(y.years) && y.years >= 1 && y.years <= 80));
        if (!ok) errors[q.n] = 'Marca "menos de un año" o escribe cuántos años (1 a 80).';
        break;
      }
    }
  }
  if (a['3'] !== undefined && typeof a['3'] === 'number' && a['3'] > new Date().getFullYear()) errors[3] = 'El año de nacimiento no puede ser futuro.';
  return errors;
}
