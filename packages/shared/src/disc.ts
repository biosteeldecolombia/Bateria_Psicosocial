// DISC: 28 grupos de 4 palabras; en cada uno la persona marca la que MÁS y la que MENOS la representa.
// Palabras tomadas del repositorio «evaluaciones-psicometricas» (reportes/discPreguntas.js).

export type DiscScale = 'D' | 'I' | 'S' | 'C';
export const DISC_SCALES: readonly DiscScale[] = ['D', 'I', 'S', 'C'];

export const DISC_TITLE = 'Cuestionario DISC · Perfil de comportamiento';
export const DISC_INSTRUCTIONS = [
  'En cada uno de los 28 grupos encontrarás cuatro palabras. No hay respuestas buenas ni malas.',
  'Marca MÁS en la palabra que mejor te describe y MENOS en la que menos te describe. Deben ser dos palabras diferentes.',
  'Piensa en cómo eres normalmente, no en cómo quisieras ser. Tu avance se guarda automáticamente.',
];

export const DISC_GROUPS: readonly (readonly [string, string, string, string])[] = [
  ["Entusiasta", "Extrovertido(a)", "Popular", "Impulsivo(a)"],
  ["Rápido(a)", "Precavido(a)", "Reflexivo(a)", "Cuida los Detalles"],
  ["Lógico(a)", "Constante", "Tenaz", "Enérgico(a)"],
  ["Apacible", "Impaciente", "Calmado(a)", "Tranquilo(a)"],
  ["Cauteloso(a)", "Discreto(a)", "Analítico(a)", "Sociable"],
  ["Decidido(a)", "Complaciente", "Audaz", "Sistemático(a)"],
  ["Receptivo(a)", "Encantador(a)", "Leal", "Vigoroso(a)"],
  ["Bondadoso(a)", "Insistente", "Promotor(a)", "Tolerante"],
  ["Amigable", "Valeroso(a)", "Sociable", "Cautivador(a)"],
  ["Preciso(a)", "Anima a los demás", "Paciente", "Contento(a)"],
  ["Franco(a)", "Pacífico(a)", "Autosuficiente", "Exigente"],
  ["Tranquilo(a)", "Perfeccionista", "Certero(a)", "Apegado(a) a las normas"],
  ["Elocuente", "Reservado(a)", "Adaptable", "Le agrada discutir"],
  ["Controlado(a)", "Atento(a)", "Resuelto(a)", "Metódico(a)"],
  ["Tolerante", "Osado(a)", "Prevenido(a)", "Comedido(a)"],
  ["Decisivo(a)", "Alegre", "Vivaz", "Desenvuelto(a)"],
  ["Atrevido(a)", "Estimulante", "Agresivo(a)", "Jovial"],
  ["Concienzudo(a)", "Gentil", "Impetuoso(a)", "Preciso(a)"],
  ["Comunicativo(a)", "Perceptivo(a)", "Amistoso(a)", "Directo(a)"],
  ["Moderado(a)", "Independiente", "Discerniente", "Ecuánime"],
  ["Ameno(a)", "Competitivo(a)", "De trato Fácil", "Inquieto(a)"],
  ["Ingenioso(a)", "Considerado(a)", "Compasivo(a)", "Amable"],
  ["Investigador(a)", "Alegre", "Cauto(a)", "Elocuente"],
  ["Acepta Riesgos", "Sagaz", "Habla Directo", "Cuidadoso(a)"],
  ["Expresivo(a)", "Meticuloso(a)", "Evaluador(a)", "Prudente"],
  ["Cuidadoso(a)", "Obediente", "Generoso(a)", "Pionero(a)"],
  ["Dominante", "Ideas Firmes", "Animado(a)", "Espontáneo(a)"],
  ["Sensible", "Alentador(a)", "Persistente", "Colaborador"]
];

/**
 * Las respuestas se guardan como un solo número por grupo: posición_MÁS * 4 + posición_MENOS (posiciones 0 a 3, distintas).
 */
export const encodeDisc = (mas: number, menos: number) => mas * 4 + menos;
export const decodeDisc = (v: number): [mas: number, menos: number] => [Math.floor(v / 4), v % 4];
export const isValidDiscAnswer = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 16 && Math.floor(v / 4) !== v % 4;
