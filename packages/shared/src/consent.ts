// Texto literal del documento FP-PS-CI v01 (25/03/2026). Cualquier cambio de texto exige nueva versión.
export const CONSENT_VERSION = 'FP-PS-CI v01';
export const CONSENT_DATE = '25/03/2026';

export type ConsentBlock = { kind: 'title' | 'h' | 'p' | 'li'; text: string };

export const CONSENT_TITLE = 'CONSENTIMIENTO INFORMADO PARA LA APLICACIÓN DE BATERÍA DE INSTRUMENTOS PARA LA EVALUACIÓN DE FACTORES DE RIESGO PSICOSOCIAL';

export const CONSENT_BLOCKS: ConsentBlock[] = [
  { kind: 'p', text: 'Declaro que he sido informado(a) de manera clara, suficiente y oportuna sobre la aplicación de la Batería de Instrumentos para la Evaluación de Factores de Riesgo Psicosocial, con el propósito de identificar y valorar factores de riesgo psicosocial relacionados con el trabajo y con las condiciones del entorno laboral y extralaboral.' },
  { kind: 'p', text: 'Se me ha informado que:' },
  { kind: 'li', text: 'La batería comprende instrumentos y cuestionarios orientados a evaluar factores de riesgo psicosocial, condiciones intralaborales, condiciones extralaborales y síntomas de estrés, según corresponda al proceso de evaluación.' },
  { kind: 'li', text: 'La información suministrada por mí será tratada de manera confidencial y conforme a la normatividad vigente en materia de protección de datos personales.' },
  { kind: 'li', text: 'Los resultados serán utilizados para fines de evaluación e intervención de factores de riesgo psicosocial y no para fines diferentes a los informados.' },
  { kind: 'li', text: 'La información individual será manejada de forma reservada y los resultados que se presenten a la organización deberán respetar la confidencialidad de la información personal.' },
  { kind: 'li', text: 'Tengo derecho a conocer, actualizar y rectificar mi información, así como a ejercer los demás derechos que correspondan conforme a la normativa aplicable.' },
  { kind: 'li', text: 'Mi participación es voluntaria y puedo manifestar mi decisión de no continuar con la aplicación.' },
  { kind: 'h', text: '1. FINALIDAD DE LA APLICACIÓN' },
  { kind: 'p', text: 'La aplicación de la batería tiene como finalidad identificar y valorar la presencia de factores de riesgo psicosocial relacionados con las condiciones de trabajo, las condiciones del entorno extralaboral y las manifestaciones asociadas al estrés, con el fin de aportar información para la prevención y el manejo de dichos factores.' },
  { kind: 'h', text: '2. PROCEDIMIENTO' },
  { kind: 'p', text: 'Entiendo que la evaluación podrá incluir el diligenciamiento de cuestionarios e instrumentos de la batería de riesgo psicosocial, así como la recopilación de información general necesaria para el proceso. La duración dependerá de los instrumentos aplicados y de las condiciones del proceso de evaluación.' },
  { kind: 'h', text: '3. CONFIDENCIALIDAD Y USO DE LA INFORMACIÓN' },
  { kind: 'p', text: 'Se me ha informado que:' },
  { kind: 'li', text: 'La información obtenida es confidencial y será tratada conforme a la normativa vigente en protección de datos personales.' },
  { kind: 'li', text: 'La información individual será utilizada exclusivamente para los fines relacionados con la evaluación de factores de riesgo psicosocial y las actividades de prevención e intervención que correspondan.' },
  { kind: 'li', text: 'Los resultados que sean comunicados a la organización deberán manejarse de manera que se preserve la confidencialidad de la información personal y sensible.' },
  { kind: 'h', text: '4. AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES' },
  { kind: 'p', text: 'Autorizo de manera libre, previa, expresa e informada a SANITHELP S.A.S. para recolectar, almacenar, usar y, cuando corresponda, transmitir mis datos personales y datos sensibles derivados de la aplicación de la batería de riesgo psicosocial, exclusivamente para los fines informados en este documento y de conformidad con la normatividad vigente sobre protección de datos personales. Declaro que he sido informado(a) sobre mis derechos a conocer, actualizar y rectificar mis datos.' },
  { kind: 'h', text: '5. VOLUNTARIEDAD' },
  { kind: 'p', text: 'Entiendo que mi participación es voluntaria y que puedo manifestar mi decisión de no continuar con la aplicación. He recibido información clara, suficiente y comprensible sobre la naturaleza, finalidad, procedimiento y alcance de la batería de evaluación de factores de riesgo psicosocial.' },
  { kind: 'p', text: 'Entiendo que los procedimientos a realizar corresponden exclusivamente a los aquí descritos y que cualquier procedimiento adicional requerirá mi información y autorización previa.' },
  { kind: 'p', text: 'EXISTE LA POSIBILIDAD DE REVOCAR EL CONSENTIMIENTO EN CUALQUIER MOMENTO, EN TAL CASO DEBE INFORMAR SU DECISIÓN AL PROFESIONAL RESPONSABLE DEL PROCESO.' },
];

export const CONSENT_DECISION_LEAD = 'Manifiesto que:';
export const CONSENT_OPTIONS = {
  authorize: 'AUTORIZO la aplicación de la Batería de Instrumentos para la Evaluación de Factores de Riesgo Psicosocial descrita en este documento.',
  decline: 'NO AUTORIZO la aplicación de la batería.',
} as const;

export type ConsentDecision = 'authorized' | 'declined';
