// Cuestionario de Claustrofobia CLQ (Radomsky et al.): 26 situaciones, malestar de 0 a 4.
// Textos del formato entregado por la psicóloga (Evaluación psicológica.pdf, «Test psicológico para espacios confinados»).

export const CLQ_TITLE = 'Test de Claustrofobia · CLQ (Radomsky)';

export const CLQ_ITEMS: readonly string[] = [
  'Estar encerrado en una habitación pequeña y oscura sin ventanas durante 15 minutos.',
  'Estar encerrado en una habitación pequeña y bien iluminada sin ventanas durante 15 minutos.',
  'Estar esposado durante 15 minutos.',
  'Estar atado con las manos detrás de la espalda durante 15 minutos.',
  'Sentirse atrapado en ropa estrecha y no poder quitársela.',
  'Llevar una camisa de fuerza durante 15 minutos.',
  'Estar tumbado en un saco de dormir estrecho, con los brazos y piernas dentro, abrochado hasta el cuello, sin poder salir durante 15 minutos.',
  'Entrar de cabeza en un saco de dormir con el cierre subido, con la posibilidad de salir cuando se quiera.',
  'Estar dentro de la maletera de un carro en el que pasa el aire libremente durante 15 minutos.',
  'Tener las piernas atadas a una silla que no se puede mover.',
  'Estar en un baño público y se atasca la cerradura.',
  'Estar en un tren lleno de gente que para en cada estación.',
  'Nadar llevando una pinza en la nariz.',
  'Trabajar debajo del lavadero durante 15 minutos.',
  'Estar en un ascensor en el piso más bajo con la puerta cerrada.',
  'Intentar aguantar la respiración mientras se hace un ejercicio físico intenso.',
  'Tener un resfriado y tener dificultad para respirar por la nariz.',
  'Bucear en un tanque de agua seguro durante 15 minutos.',
  'Ponerse una máscara de oxígeno.',
  'Estar tumbado en la cama de debajo de una camarote.',
  'Estar en la 3.ª fila de un concierto repleto de gente y darse cuenta que no podrá salir hasta el final.',
  'Estar en el centro de una fila llena de gente en un cine.',
  'Trabajar debajo de un automóvil durante 15 minutos.',
  'Estar en el punto más alejado de la salida de una mina subterránea.',
  'Estar tumbado en una sauna durante 15 minutos.',
  'Esperar durante 15 minutos en un avión estando en tierra y con la puerta cerrada.',
];
export const CLQ_COUNT = CLQ_ITEMS.length;
export const CLQ_MAX = CLQ_COUNT * 4;

export const CLQ_SCALE: readonly string[] = ['Nada incómodo', 'Muy poco incómodo', 'Algo incómodo', 'Mucha incomodidad', 'Extremadamente incómodo'];

export const CLQ_INSTRUCTIONS = [
  'Marca en qué grado sentirías malestar o incomodidad frente a cada una de estas situaciones.',
  'Responde de 0 (nada incómodo) a 4 (extremadamente incómodo). Tu avance se guarda automáticamente.',
];

/** Interpretación que marca la psicóloga a mano (el formato no trae puntos de corte). */
export const CLQ_LEVELS = [
  ['low', 'Bajo nivel de claustrofobia'],
  ['moderate', 'Nivel moderado de claustrofobia'],
  ['high', 'Alto nivel de claustrofobia'],
] as const;
export type ClqLevel = (typeof CLQ_LEVELS)[number][0];
export const isClqLevel = (v: unknown): v is ClqLevel => CLQ_LEVELS.some(([k]) => k === v);

export const isValidClqAnswer = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4;
