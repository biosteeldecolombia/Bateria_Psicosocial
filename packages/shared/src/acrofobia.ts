// Cuestionario de Acrofobia de Cohen (miedo a las alturas): 20 situaciones, dos escalas independientes.
// Textos del formato entregado por la psicóloga (Evaluación psicológica.pdf). La Parte II (evitación) usa las mismas 20 situaciones.
// Se guarda una sola evaluación con 40 respuestas: 1 a 20 = ansiedad (0 a 6); 21 a 40 = evitación (0 a 2, pregunta n + 20).

export const ACROFOBIA_TITLE = 'Cuestionario de Acrofobia · Cohen';

export const ACROFOBIA_ITEMS: readonly string[] = [
  'Saltando desde el trampolín más bajo de una piscina.',
  'Saltando sobre las piedras para pasar por encima de una corriente de agua.',
  'Mirando hacia abajo en una escalera de caracol desde una altura de varios pisos.',
  'De pie en el peldaño de una escalera que está apoyada sobre la fachada de una casa en el segundo piso.',
  'Sentado en la platea de un segundo piso de un teatro.',
  'Montado en la noria de una feria.',
  'Subiendo a una colina inclinada de excursión por el campo.',
  'Un viaje en avión (al otro extremo del mismo país).',
  'De pie cerca de una ventana abierta en el tercer piso.',
  'Pasando por un puente peatonal por encima de una autopista.',
  'Conduciendo sobre un puente muy amplio.',
  'Alejado de una ventana en una oficina del piso 15 de un edificio.',
  'Ver a personas sobre una plataforma limpiando ventanas en el piso 10 de un edificio.',
  'Andando por el borde de un escenario de un teatro.',
  'De pie en el borde del andén del metro.',
  'Subiendo por la escalera de incendios exterior en el tercer piso.',
  'En la azotea de un edificio de 10 pisos.',
  'Subiendo en un ascensor hasta el piso 50.',
  'De pie sobre una silla intentando coger algo de una estantería.',
  'Subiendo por la pasarela a una embarcación.',
];
export const ACROFOBIA_COUNT = ACROFOBIA_ITEMS.length;

/** Parte I: grado de ansiedad (0 a 6). */
export const ACROFOBIA_ANXIETY_SCALE: readonly string[] = [
  'Nada de ansiedad, tranquilo y relajado',
  'Muy leve ansiedad',
  'Ligeramente ansioso',
  'Ansiedad moderada baja',
  'Moderadamente ansioso',
  'Ansiedad alta',
  'Extremadamente ansioso',
];
/** Parte II: conducta de evitación (0 a 2). */
export const ACROFOBIA_AVOID_SCALE: readonly string[] = ['No la evitaría', 'Intentaría evitarla', 'No la soportaría'];

export const ACROFOBIA_INSTRUCTIONS = {
  anxiety: [
    'Parte I · Ansiedad. A continuación se presenta una lista de situaciones que tienen que ver con las alturas. Nos interesa saber el grado de ansiedad (tensión o malestar) que sentirías en cada una de ellas actualmente.',
    'Responde de 0 (nada de ansiedad, tranquilo y relajado) a 6 (extremadamente ansioso).',
  ],
  avoid: [
    'Parte II · Evitación. Estas son las mismas situaciones. Indica qué harías ante cada una.',
    'Responde 0 (no la evitaría), 1 (intentaría evitarla) o 2 (no la soportaría).',
  ],
};

/** Número de respuesta guardada: ansiedad = n; evitación = n + 20 (n de 1 a 20). */
export const ACROFOBIA_ANSWER_COUNT = ACROFOBIA_COUNT * 2;
export const isValidAcrofobiaAnswer = (n: number, v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= (n <= ACROFOBIA_COUNT ? ACROFOBIA_ANXIETY_SCALE.length - 1 : ACROFOBIA_AVOID_SCALE.length - 1);
