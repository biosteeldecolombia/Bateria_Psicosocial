// VALANTI: 30 parejas de frases en las que se reparten 3 puntos. Textos y clave tomados del repositorio
// «evaluaciones-psicometricas» (src/App.jsx y reportes/generarPDFResultados.js).

export type ValantiValue = 'Verdad' | 'Rectitud' | 'Paz' | 'Amor' | 'No violencia';
export const VALANTI_VALUES: readonly ValantiValue[] = ['Verdad', 'Rectitud', 'Paz', 'Amor', 'No violencia'];

export const VALANTI_TITLE = 'Cuestionario VALANTI · Perfil de valores';

/** Parte 1: importancia personal (preguntas 1 a 9). Parte 2: frases inaceptables (preguntas 10 a 30). */
export const VALANTI_PART1: readonly (readonly [string, string])[] = [
  ["Muestro dedicación a las personas que amo", "Actúo con perseverancia"],
  ["Soy tolerante", "Prefiero actuar con ética"],
  ["Al pensar, utilizo mi intuición o \"sexto sentido\"", "Me siento una persona digna"],
  ["Logro buena concentración mental", "Perdono todas las ofensas de cualquier persona"],
  ["Normalmente razono mucho", "Me destaco por el liderazgo en mis acciones"],
  ["Pienso con integridad", "Me coloco objetivos y metas en mi vida personal"],
  ["Soy una persona de iniciativa", "En mi trabajo normalmente soy curioso"],
  ["Doy amor", "Para pensar hago síntesis de las distintas ideas"],
  ["Me siento en calma", "Pienso con veracidad"]
];
export const VALANTI_PART2: readonly (readonly [string, string])[] = [
  ["Irrespetar la propiedad", "Sentir inquietud"],
  ["Ser irresponsable", "Ser desconsiderado hacia cualquier persona"],
  ["Caer en contradicciones al pensar", "Sentir intolerancia"],
  ["Ser violento", "Actuar con cobardía"],
  ["Sentirse presumido", "Generar divisiones y discordia entre los seres humanos"],
  ["Ser cruel", "Sentir ira"],
  ["Pensar con confusión", "Tener odio en el corazón"],
  ["Decir blasfemias", "Ser escandaloso"],
  ["Crear desigualdades entre los seres humanos", "Apasionarse por una idea"],
  ["Sentirse inconstante", "Crear rivalidad hacia otros"],
  ["Pensamientos irracionales", "Traicionar a un desconocido"],
  ["Ostentar las riquezas materiales", "Sentirse infeliz"],
  ["Entorpecer la cooperación entre los seres humanos", "La maldad"],
  ["Odiar a cualquier ser de la naturaleza", "Hacer distinciones entre las personas"],
  ["Sentirse intranquilo", "Ser infiel"],
  ["Tener la mente dispersa", "Mostrar apatía al pensar"],
  ["La injusticia", "Sentirse angustiado"],
  ["Vengarse de los que odian a todo el mundo", "Vengarse del que hace daño a un familiar"],
  ["Usar abusivamente el poder", "Distraerse"],
  ["Ser desagradecido con los que ayudan", "Ser egoísta con todos"],
  ["Cualquier forma de irrespeto", "Odiar"]
];
export const VALANTI_PAIRS = [...VALANTI_PART1, ...VALANTI_PART2];
export const VALANTI_PART1_COUNT = VALANTI_PART1.length;

/** Clave: a qué valor suma cada frase de cada pareja (A, B). */
export const VALANTI_KEY: readonly (readonly [ValantiValue, ValantiValue])[] = [
  ["Amor", "Rectitud"],
  ["No violencia", "Rectitud"],
  ["Paz", "Amor"],
  ["Paz", "No violencia"],
  ["Verdad", "Rectitud"],
  ["Verdad", "Rectitud"],
  ["Rectitud", "Verdad"],
  ["Amor", "Verdad"],
  ["Paz", "Verdad"],
  ["Rectitud", "Paz"],
  ["Rectitud", "No violencia"],
  ["Verdad", "No violencia"],
  ["No violencia", "Rectitud"],
  ["Rectitud", "No violencia"],
  ["No violencia", "No violencia"],
  ["Verdad", "Amor"],
  ["Rectitud", "No violencia"],
  ["No violencia", "Paz"],
  ["Rectitud", "No violencia"],
  ["Verdad", "Rectitud"],
  ["Rectitud", "Paz"],
  ["No violencia", "Rectitud"],
  ["No violencia", "No violencia"],
  ["Paz", "Rectitud"],
  ["Paz", "Verdad"],
  ["Rectitud", "Paz"],
  ["No violencia", "Rectitud"],
  ["Rectitud", "Paz"],
  ["Amor", "Amor"],
  ["No violencia", "No violencia"]
];

export const VALANTI_INSTRUCTIONS = {
  part1: [
    'Parte 1 · Importancia personal. En cada pareja hay dos frases: reparte 3 puntos según la importancia que cada una tiene en tu vida personal.',
    'Elige la opción que refleje mejor tu reparto (por ejemplo 3-0, 2-1, 1-2 o 0-3). Los dos valores siempre suman 3.',
  ],
  part2: [
    'Parte 2 · Frases inaceptables. En cada pareja reparte 3 puntos dando el puntaje más alto a la frase que consideres más inaceptable.',
    'Los dos valores siempre suman 3. Tu avance se guarda automáticamente.',
  ],
};

/** La respuesta de cada pareja se guarda como los puntos de la frase A (0 a 3); la B es 3 menos ese número. */
export const isValidValantiAnswer = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
