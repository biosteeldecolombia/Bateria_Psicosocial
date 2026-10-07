// DISC: 28 grupos de 4 palabras; en cada uno la persona marca la que MÁS y la que MENOS la representa.
// Grupos y palabras tomados de la hoja oficial «DISC_HOJA_DE_PRUEBA_Y_CORRECCION.xlsm» (cada grupo es una columna de la hoja de prueba).
// OJO: el repositorio «evaluaciones-psicometricas» armaba los grupos leyendo las filas de esa hoja, no las columnas; esos grupos eran incorrectos.

/**
 * Versión del formato de respuestas del DISC. La 2 usa los grupos oficiales de la hoja de corrección; las respuestas guardadas
 * sin versión (grupos mal armados del repositorio de origen) no se pueden calificar y se descartan.
 */
export const DISC_DATA_VERSION = 2;

export type DiscScale = 'D' | 'I' | 'S' | 'C';
export const DISC_SCALES: readonly DiscScale[] = ['D', 'I', 'S', 'C'];

export const DISC_TITLE = 'Cuestionario DISC · Perfil de comportamiento';
export const DISC_INSTRUCTIONS = [
  'En cada uno de los 28 grupos encontrarás cuatro palabras. No hay respuestas buenas ni malas.',
  'Marca MÁS en la palabra que mejor te describe y MENOS en la que menos te describe. Deben ser dos palabras diferentes.',
  'Piensa en cómo eres normalmente, no en cómo quisieras ser. Tu avance se guarda automáticamente.',
];

export const DISC_GROUPS: readonly (readonly [string, string, string, string])[] = [
  ["Entusiasta", "Rápido(a)", "Lógico(a)", "Apacible"],
  ["Cauteloso(a)", "Decidido(a)", "Receptivo(a)", "Bondadoso(a)"],
  ["Amigable", "Preciso(a)", "Franco(a)", "Tranquilo(a)"],
  ["Elocuente", "Controlado(a)", "Tolerante", "Decisivo(a)"],
  ["Atrevido(a)", "Concienzudo(a)", "Comunicativo(a)", "Moderado(a)"],
  ["Ameno(a)", "Ingenioso(a)", "Investigador(a)", "Acepta Riesgos"],
  ["Expresivo(a)", "Cuidadoso(a)", "Dominante", "Sensible"],
  ["Extrovertido(a)", "Precavido(a)", "Constante", "Impaciente"],
  ["Discreto(a)", "Complaciente", "Encantador(a)", "Insistente"],
  ["Valeroso(a)", "Anima a los demás", "Pacífico(a)", "Perfeccionista"],
  ["Reservado(a)", "Atento(a)", "Osado(a)", "Alegre"],
  ["Estimulante", "Gentil", "Perceptivo(a)", "Independiente"],
  ["Competitivo(a)", "Considerado(a)", "Alegre", "Sagaz"],
  ["Meticuloso(a)", "Obediente", "Ideas Firmes", "Alentador(a)"],
  ["Popular", "Reflexivo(a)", "Tenaz", "Calmado(a)"],
  ["Analítico(a)", "Audaz", "Leal", "Promotor(a)"],
  ["Sociable", "Paciente", "Autosuficiente", "Certero(a)"],
  ["Adaptable", "Resuelto(a)", "Prevenido(a)", "Vivaz"],
  ["Agresivo(a)", "Impetuoso(a)", "Amistoso(a)", "Discerniente"],
  ["De trato Fácil", "Compasivo(a)", "Cauto(a)", "Habla Directo"],
  ["Evaluador(a)", "Generoso(a)", "Animado(a)", "Persistente"],
  ["Impulsivo(a)", "Cuida los Detalles", "Enérgico(a)", "Tranquilo(a)"],
  ["Sociable", "Sistemático(a)", "Vigoroso(a)", "Tolerante"],
  ["Cautivador(a)", "Contento(a)", "Exigente", "Apegado(a) a las normas"],
  ["Le agrada discutir", "Metódico(a)", "Comedido(a)", "Desenvuelto(a)"],
  ["Jovial", "Preciso(a)", "Directo(a)", "Ecuánime"],
  ["Inquieto(a)", "Amable", "Elocuente", "Cuidadoso(a)"],
  ["Prudente", "Pionero(a)", "Espontáneo(a)", "Colaborador"],
];

/**
 * Las respuestas se guardan como un solo número por grupo: posición_MÁS * 4 + posición_MENOS (posiciones 0 a 3, distintas).
 */
export const encodeDisc = (mas: number, menos: number) => mas * 4 + menos;
export const decodeDisc = (v: number): [mas: number, menos: number] => [Math.floor(v / 4), v % 4];
export const isValidDiscAnswer = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 16 && Math.floor(v / 4) !== v % 4;
