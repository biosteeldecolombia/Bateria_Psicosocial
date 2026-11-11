// Consentimiento informado para evaluación psicológica ocupacional (alturas y/o espacios confinados).
// Texto del documento entregado por la psicóloga (Word «CONSENTIMIENTO INFORMADO PARA EVALUACION PSICOLOGICA OCUPACIONAL»).
// {empresa} se reemplaza por el nombre de la empresa de la campaña. Cualquier cambio de texto exige nueva versión.
import { CONSENT_BLOCKS, CONSENT_DECISION_LEAD, CONSENT_OPTIONS, CONSENT_TITLE, CONSENT_VERSION, type ConsentBlock } from './consent';

export const CONSENT_OCC_TITLE = 'CONSENTIMIENTO INFORMADO PARA EVALUACIÓN PSICOLÓGICA OCUPACIONAL';

export const CONSENT_OCC_BLOCKS: ConsentBlock[] = [
  { kind: 'p', text: 'Declaro que he sido informado(a) de manera clara, suficiente y oportuna sobre la realización de una evaluación psicológica ocupacional, solicitada por la empresa {empresa}, con el fin de determinar mi aptitud para el desempeño de actividades de alto riesgo, tales como trabajo en alturas y/o espacios confinados.' },
  { kind: 'p', text: 'Se me ha informado que:' },
  { kind: 'li', text: 'Las pruebas psicotécnicas evaluarán aspectos como aptitudes, habilidades, personalidad y competencias laborales.' },
  { kind: 'li', text: 'La evaluación médica incluirá los exámenes necesarios según el perfil ocupacional y los riesgos del cargo.' },
  { kind: 'li', text: 'La información obtenida es de carácter confidencial y será manejada conforme a la normatividad vigente en materia de protección de datos personales.' },
  { kind: 'li', text: 'Los resultados serán entregados a la empresa solicitante únicamente en términos de aptitud ocupacional (apto, no apto o apto con recomendaciones), salvo autorización expresa del evaluado.' },
  { kind: 'li', text: 'Mis datos personales y de salud serán tratados conforme a la legislación aplicable y utilizados exclusivamente para fines ocupacionales.' },
  { kind: 'li', text: 'Tengo derecho a conocer, actualizar y rectificar mi información, así como a revocar esta autorización en los términos legales.' },
  { kind: 'li', text: 'Mi participación es voluntaria.' },
  { kind: 'h', text: '1. FINALIDAD DE LA EVALUACIÓN' },
  { kind: 'p', text: 'La evaluación tiene como propósito identificar condiciones cognitivas, conductuales y emocionales relacionadas con el desempeño seguro del cargo, tales como:' },
  { kind: 'li', text: 'Atención y concentración' },
  { kind: 'li', text: 'Memoria operativa' },
  { kind: 'li', text: 'Tiempo de reacción' },
  { kind: 'li', text: 'Toma de decisiones' },
  { kind: 'li', text: 'Percepción del riesgo' },
  { kind: 'li', text: 'Seguimiento de instrucciones' },
  { kind: 'li', text: 'Juicio y razonamiento' },
  { kind: 'li', text: 'Control emocional' },
  { kind: 'li', text: 'Orientación espacial' },
  { kind: 'h', text: '2. PROCEDIMIENTO' },
  { kind: 'p', text: 'Entiendo que la evaluación podrá incluir entrevista psicológica ocupacional, aplicación de pruebas psicotécnicas y cognitivas, cuestionarios psicológicos y observación conductual. La duración aproximada será de 20 minutos.' },
  { kind: 'h', text: '3. CONFIDENCIALIDAD Y USO DE LA INFORMACIÓN' },
  { kind: 'p', text: 'Se me ha informado que:' },
  { kind: 'li', text: 'La información obtenida es confidencial y será tratada conforme a la normatividad vigente en protección de datos personales (Ley 1581 de 2012).' },
  { kind: 'li', text: 'Los resultados serán reportados a la empresa solicitante únicamente en términos de concepto de aptitud ocupacional: Apto, Apto con recomendaciones o No apto.' },
  { kind: 'h', text: '4. AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES' },
  { kind: 'p', text: 'Autorizo de manera libre, previa, expresa e informada a SANITHELP S.A.S para recolectar, almacenar, usar y transmitir mis datos personales y datos sensibles (incluyendo información de salud), exclusivamente para fines de evaluación ocupacional, conforme a la Ley 1581 de 2012 y normas concordantes. Declaro que he sido informado(a) sobre mis derechos a conocer, actualizar y rectificar mis datos.' },
  { kind: 'h', text: '5. VOLUNTARIEDAD' },
  { kind: 'p', text: 'Entiendo que mi participación es voluntaria y que puedo desistir en cualquier momento; sin embargo, se me ha informado que esto puede tener implicaciones dentro del proceso de selección o evaluación laboral.' },
  { kind: 'p', text: 'Entiendo que los procedimientos a realizar corresponden exclusivamente a los aquí descritos y que cualquier procedimiento adicional requerirá mi información y autorización previa.' },
  { kind: 'p', text: 'EXISTE LA POSIBILIDAD DE REVOCAR EL CONSENTIMIENTO EN CUALQUIER MOMENTO, EN TAL CASO DEBE INFORMAR SU DECISIÓN AL PROFESIONAL DE LA SALUD.' },
];

/** Encabezado del documento (cuadro con logo, título, código, versión, fecha, página y proceso). */
export const CONSENT_OCC_HEADER = {
  title: 'CONSENTIMIENTO INFORMADO PARA EVALUACION PSICOLOGIA OCUPACIONAL',
  process: 'PROCESO: PRESTACIÓN DE SERVICIOS',
  code: 'FP-PS-CI',
  version: '01',
  date: '25/03/2026',
} as const;

export const CONSENT_OCC_OPTIONS = {
  authorize: 'AUTORIZO la realización de la evaluación psicológica ocupacional descrita en este documento.',
  decline: 'NO AUTORIZO la realización de la evaluación.',
} as const;

/** Declaración del profesional de la salud (se imprime en el PDF del consentimiento). */
export const CONSENT_OCC_PROFESSIONAL = [
  'Expliqué de manera clara el propósito, alcance y características de la evaluación.',
  'Informé sobre el manejo de la información y los derechos del evaluado.',
  'Verifiqué que el evaluado comprendió la información y otorgó su consentimiento de manera libre y voluntaria.',
];

export type ConsentDocId = 'psychosocial' | 'occupational';

export interface ConsentDoc {
  id: ConsentDocId;
  /** Nombre corto para mostrar a la psicóloga. */
  label: string;
  title: string;
  blocks: ConsentBlock[];
  options: { authorize: string; decline: string };
  /** Encabezado con código y versión que se muestra encima del texto (si el documento lo lleva). */
  header?: typeof CONSENT_OCC_HEADER;
}

const BASE_DOC: ConsentDoc = { id: 'psychosocial', label: 'Batería psicosocial', title: CONSENT_TITLE, blocks: CONSENT_BLOCKS, options: CONSENT_OPTIONS };
const OCC_DOC: ConsentDoc = { id: 'occupational', label: 'Evaluación ocupacional', title: CONSENT_OCC_TITLE, blocks: CONSENT_OCC_BLOCKS, options: CONSENT_OCC_OPTIONS, header: CONSENT_OCC_HEADER };

/** Evaluaciones que usan el consentimiento ocupacional. */
export const OCCUPATIONAL_ASSESSMENTS = ['acrofobia', 'claustrofobia'] as const;

/**
 * Documentos de consentimiento que aplican a una campaña: el de la batería psicosocial (también cuando solo hay DISC, VALANTI o 16PF)
 * y/o el de evaluación ocupacional (alturas / espacios confinados). Si hay ambos tipos de prueba se muestran los dos.
 */
export function consentDocsFor(assessments: readonly string[]): ConsentDoc[] {
  const occupational = OCCUPATIONAL_ASSESSMENTS.some((a) => assessments.includes(a));
  const docs: ConsentDoc[] = [];
  if (!occupational || assessments.includes('psychosocial')) docs.push(BASE_DOC);
  if (occupational) docs.push(OCC_DOC);
  return docs;
}

/** Opciones de decisión: las del documento si es uno solo; si son dos, una sola decisión que cubre ambos. */
export function consentOptionsFor(docs: readonly ConsentDoc[]): { lead: string; authorize: string; decline: string } {
  if (docs.length === 1) return { lead: CONSENT_DECISION_LEAD, ...docs[0]!.options };
  return {
    lead: CONSENT_DECISION_LEAD,
    authorize: 'AUTORIZO la aplicación de la Batería de Instrumentos para la Evaluación de Factores de Riesgo Psicosocial y la realización de la evaluación psicológica ocupacional, descritas en estos documentos.',
    decline: 'NO AUTORIZO la aplicación de la batería ni la realización de la evaluación psicológica ocupacional.',
  };
}

export const consentVersionLabel = (docs: readonly ConsentDoc[]) => (docs.length === 1 && docs[0]!.id === 'psychosocial' ? CONSENT_VERSION : `${CONSENT_VERSION} · ${docs.map((d) => d.label).join(' + ')}`);
