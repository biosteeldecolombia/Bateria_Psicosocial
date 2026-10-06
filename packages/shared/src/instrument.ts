// GENERADO a partir de los PDF oficiales (ver docs/AUDITORIA_ITEMS.md y docs/DECISIONES.md). Textos literales; no editar a mano.
// Aquí NO hay puntajes, direcciones de puntuación ni baremos: eso vive en el motor oficial (Fase 2b, pendiente del Excel).

export type QuestionnaireId = 'intra_A' | 'intra_B' | 'extra' | 'stress';
export interface Item { n: number; t: string }
export interface Gate {
  key: 'clients' | 'boss';
  /** Pregunta Sí/No que decide si se responden los ítems first..last */
  prompt: string;
  first: number;
  last: number;
}
export interface QuestionnaireDef {
  id: QuestionnaireId;
  title: string;
  instructions: string[];
  /** Opciones de respuesta en el orden en que se muestran; se guarda el índice (0 = primera). */
  scale: readonly string[];
  items: Item[];
  /** Encabezado de sección que se muestra antes del ítem `before`. */
  headings: { before: number; text: string }[];
  gates: Gate[];
}

export const SCALE_5 = ['Siempre', 'Casi siempre', 'Algunas veces', 'Casi nunca', 'Nunca'] as const;
export const SCALE_4 = ['Siempre', 'Casi siempre', 'A veces', 'Nunca'] as const;

const INTRA_INSTR_BASE = [
  'Este cuestionario de factores psicosociales busca conocer su opinión sobre algunos aspectos de su trabajo.',
  'Le agradecemos que usted se sirva contestar a las siguientes preguntas de forma absolutamente sincera. Las respuestas que usted de al cuestionario, no son ni buenas, ni malas, lo importante es que reflejen su manera de pensar sobre su trabajo.',
  'Al responder por favor lea cuidadosamente cada pregunta, luego piense como es su trabajo y responda a todas las preguntas, en cada una de ellas marque una sola respuesta. Señale con una “X” en la casilla de la respuesta que refleje mejor su trabajo. Si se equivoca en una respuesta táchela y escriba la correcta.',
];

export const QUESTIONNAIRES: Record<QuestionnaireId, QuestionnaireDef> = {
  intra_A: {
    id: 'intra_A',
    title: 'Cuestionario de factores de riesgo psicosocial intralaboral — Forma A',
    instructions: [
      ...INTRA_INSTR_BASE,
      'Tenga presente que el cuestionario NO lo evalúa a usted como trabajador, sino busca conocer cómo es el trabajo que le han asignado.',
      'Sus respuestas serán manejadas de forma absolutamente confidencial.',
      'Si tiene dudas respecto a una pregunta, solicite mayor explicación a la persona que le entregó el cuestionario.',
      'El cuestionario no tiene límite de tiempo; sin embargo, aproximadamente usted requerirá 1 hora para contestar todas las preguntas.',
      'Gracias por su colaboración.',
    ],
    scale: SCALE_5,
    items: [
 {
  "n": 1,
  "t": "El ruido en el lugar donde trabajo es molesto"
 },
 {
  "n": 2,
  "t": "En el lugar donde trabajo hace mucho frío"
 },
 {
  "n": 3,
  "t": "En el lugar donde trabajo hace mucho calor"
 },
 {
  "n": 4,
  "t": "El aire en el lugar donde trabajo es fresco y agradable"
 },
 {
  "n": 5,
  "t": "La luz del sitio donde trabajo es agradable"
 },
 {
  "n": 6,
  "t": "El espacio donde trabajo es cómodo"
 },
 {
  "n": 7,
  "t": "En mi trabajo me preocupa estar expuesto a sustancias químicas que afecten mi salud"
 },
 {
  "n": 8,
  "t": "Mi trabajo me exige hacer mucho esfuerzo físico"
 },
 {
  "n": 9,
  "t": "Los equipos o herramientas con los que trabajo son cómodos"
 },
 {
  "n": 10,
  "t": "En mi trabajo me preocupa estar expuesto a microbios, animales o plantas que afecten mi salud"
 },
 {
  "n": 11,
  "t": "Me preocupa accidentarme en mi trabajo"
 },
 {
  "n": 12,
  "t": "El lugar donde trabajo es limpio y ordenado"
 },
 {
  "n": 13,
  "t": "Por la cantidad de trabajo que tengo debo quedarme tiempo adicional"
 },
 {
  "n": 14,
  "t": "Me alcanza el tiempo de trabajo para tener al día mis deberes"
 },
 {
  "n": 15,
  "t": "Por la cantidad de trabajo que tengo debo trabajar sin parar"
 },
 {
  "n": 16,
  "t": "Mi trabajo me exige hacer mucho esfuerzo mental"
 },
 {
  "n": 17,
  "t": "Mi trabajo me exige estar muy concentrado"
 },
 {
  "n": 18,
  "t": "Mi trabajo me exige memorizar mucha información"
 },
 {
  "n": 19,
  "t": "En mi trabajo tengo que tomar decisiones difíciles muy rápido"
 },
 {
  "n": 20,
  "t": "Mi trabajo me exige atender a muchos asuntos al mismo tiempo"
 },
 {
  "n": 21,
  "t": "Mi trabajo requiere que me fije en pequeños detalles"
 },
 {
  "n": 22,
  "t": "En mi trabajo respondo por cosas de mucho valor"
 },
 {
  "n": 23,
  "t": "En mi trabajo respondo por dinero de la empresa"
 },
 {
  "n": 24,
  "t": "Como parte de mis funciones debo responder por la seguridad de otros"
 },
 {
  "n": 25,
  "t": "Respondo ante mi jefe por los resultados de toda mi área de trabajo"
 },
 {
  "n": 26,
  "t": "Mi trabajo me exige cuidar la salud de otras personas"
 },
 {
  "n": 27,
  "t": "En el trabajo me dan órdenes contradictorias"
 },
 {
  "n": 28,
  "t": "En mi trabajo me piden hacer cosas innecesarias"
 },
 {
  "n": 29,
  "t": "En mi trabajo se presentan situaciones en las que debo pasar por alto normas o procedimientos"
 },
 {
  "n": 30,
  "t": "En mi trabajo tengo que hacer cosas que se podrían hacer de una forma más práctica"
 },
 {
  "n": 31,
  "t": "Trabajo en horario de noche"
 },
 {
  "n": 32,
  "t": "En mi trabajo es posible tomar pausas para descansar"
 },
 {
  "n": 33,
  "t": "Mi trabajo me exige laborar en días de descanso, festivos o fines de semana"
 },
 {
  "n": 34,
  "t": "En mi trabajo puedo tomar fines de semana o días de descanso al mes"
 },
 {
  "n": 35,
  "t": "Cuando estoy en casa sigo pensando en el trabajo"
 },
 {
  "n": 36,
  "t": "Discuto con mi familia o amigos por causa de mi trabajo"
 },
 {
  "n": 37,
  "t": "Debo atender asuntos de trabajo cuando estoy en casa"
 },
 {
  "n": 38,
  "t": "Por mi trabajo el tiempo que paso con mi familia y amigos es muy poco"
 },
 {
  "n": 39,
  "t": "Mi trabajo me permite desarrollar mis habilidades"
 },
 {
  "n": 40,
  "t": "Mi trabajo me permite aplicar mis conocimientos"
 },
 {
  "n": 41,
  "t": "Mi trabajo me permite aprender nuevas cosas"
 },
 {
  "n": 42,
  "t": "Me asignan el trabajo teniendo en cuenta mis capacidades."
 },
 {
  "n": 43,
  "t": "Puedo tomar pausas cuando las necesito"
 },
 {
  "n": 44,
  "t": "Puedo decidir cuánto trabajo hago en el día"
 },
 {
  "n": 45,
  "t": "Puedo decidir la velocidad a la que trabajo"
 },
 {
  "n": 46,
  "t": "Puedo cambiar el orden de las actividades en mi trabajo"
 },
 {
  "n": 47,
  "t": "Puedo parar un momento mi trabajo para atender algún asunto personal"
 },
 {
  "n": 48,
  "t": "Los cambios en mi trabajo han sido beneficiosos"
 },
 {
  "n": 49,
  "t": "Me explican claramente los cambios que ocurren en mi trabajo"
 },
 {
  "n": 50,
  "t": "Puedo dar sugerencias sobre los cambios que ocurren en mi trabajo"
 },
 {
  "n": 51,
  "t": "Cuando se presentan cambios en mi trabajo se tienen en cuenta mis ideas y sugerencias"
 },
 {
  "n": 52,
  "t": "Los cambios que se presentan en mi trabajo dificultan mi labor"
 },
 {
  "n": 53,
  "t": "Me informan con claridad cuáles son mis funciones"
 },
 {
  "n": 54,
  "t": "Me informan cuáles son las decisiones que puedo tomar en mi trabajo"
 },
 {
  "n": 55,
  "t": "Me explican claramente los resultados que debo lograr en mi trabajo"
 },
 {
  "n": 56,
  "t": "Me explican claramente el efecto de mi trabajo en la empresa"
 },
 {
  "n": 57,
  "t": "Me explican claramente los objetivos de mi trabajo"
 },
 {
  "n": 58,
  "t": "Me informan claramente quien me puede orientar para hacer mi trabajo"
 },
 {
  "n": 59,
  "t": "Me informan claramente con quien puedo resolver los asuntos de trabajo"
 },
 {
  "n": 60,
  "t": "La empresa me permite asistir a capacitaciones relacionadas con mi trabajo"
 },
 {
  "n": 61,
  "t": "Recibo capacitación útil para hacer mi trabajo"
 },
 {
  "n": 62,
  "t": "Recibo capacitación que me ayuda a hacer mejor mi trabajo"
 },
 {
  "n": 63,
  "t": "Mi jefe me da instrucciones claras"
 },
 {
  "n": 64,
  "t": "Mi jefe ayuda a organizar mejor el trabajo"
 },
 {
  "n": 65,
  "t": "Mi jefe tiene en cuenta mis puntos de vista y opiniones"
 },
 {
  "n": 66,
  "t": "Mi jefe me anima para hacer mejor mi trabajo"
 },
 {
  "n": 67,
  "t": "Mi jefe distribuye las tareas de forma que me facilita el trabajo"
 },
 {
  "n": 68,
  "t": "Mi jefe me comunica a tiempo la información relacionada con el trabajo"
 },
 {
  "n": 69,
  "t": "La orientación que me da mi jefe me ayuda a hacer mejor el trabajo"
 },
 {
  "n": 70,
  "t": "Mi jefe me ayuda a progresar en el trabajo"
 },
 {
  "n": 71,
  "t": "Mi jefe me ayuda a sentirme bien en el trabajo"
 },
 {
  "n": 72,
  "t": "Mi jefe ayuda a solucionar los problemas que se presentan en el trabajo"
 },
 {
  "n": 73,
  "t": "Siento que puedo confiar en mi jefe"
 },
 {
  "n": 74,
  "t": "Mi jefe me escucha cuando tengo problemas de trabajo"
 },
 {
  "n": 75,
  "t": "Mi jefe me brinda su apoyo cuando lo necesito"
 },
 {
  "n": 76,
  "t": "Me agrada el ambiente de mi grupo de trabajo"
 },
 {
  "n": 77,
  "t": "En mi grupo de trabajo me tratan de forma respetuosa"
 },
 {
  "n": 78,
  "t": "Siento que puedo confiar en mis compañeros de trabajo"
 },
 {
  "n": 79,
  "t": "Me siento a gusto con mis compañeros de trabajo"
 },
 {
  "n": 80,
  "t": "En mi grupo de trabajo algunas personas me maltratan"
 },
 {
  "n": 81,
  "t": "Entre compañeros solucionamos los problemas de forma respetuosa"
 },
 {
  "n": 82,
  "t": "Hay integración en mi grupo de trabajo"
 },
 {
  "n": 83,
  "t": "Mi grupo de trabajo es muy unido"
 },
 {
  "n": 84,
  "t": "Las personas en mi trabajo me hacen sentir parte del grupo"
 },
 {
  "n": 85,
  "t": "Cuando tenemos que realizar trabajo de grupo los compañeros colaboran"
 },
 {
  "n": 86,
  "t": "Es fácil poner de acuerdo al grupo para hacer el trabajo"
 },
 {
  "n": 87,
  "t": "Mis compañeros de trabajo me ayudan cuando tengo dificultades"
 },
 {
  "n": 88,
  "t": "En mi trabajo las personas nos apoyamos unos a otros"
 },
 {
  "n": 89,
  "t": "Algunos compañeros de trabajo me escuchan cuando tengo problemas"
 },
 {
  "n": 90,
  "t": "Me informan sobre lo que hago bien en mi trabajo"
 },
 {
  "n": 91,
  "t": "Me informan sobre lo que debo mejorar en mi trabajo"
 },
 {
  "n": 92,
  "t": "La información que recibo sobre mi rendimiento en el trabajo es clara"
 },
 {
  "n": 93,
  "t": "La forma como evalúan mi trabajo en la empresa me ayuda a mejorar"
 },
 {
  "n": 94,
  "t": "Me informan a tiempo sobre lo que debo mejorar en el trabajo"
 },
 {
  "n": 95,
  "t": "En la empresa confían en mi trabajo"
 },
 {
  "n": 96,
  "t": "En la empresa me pagan a tiempo mi salario"
 },
 {
  "n": 97,
  "t": "El pago que recibo es el que me ofreció la empresa"
 },
 {
  "n": 98,
  "t": "El pago que recibo es el que merezco por el trabajo que realizo"
 },
 {
  "n": 99,
  "t": "En mi trabajo tengo posibilidades de progresar"
 },
 {
  "n": 100,
  "t": "Las personas que hacen bien el trabajo pueden progresar en la empresa"
 },
 {
  "n": 101,
  "t": "La empresa se preocupa por el bienestar de los trabajadores"
 },
 {
  "n": 102,
  "t": "Mi trabajo en la empresa es estable"
 },
 {
  "n": 103,
  "t": "El trabajo que hago me hace sentir bien"
 },
 {
  "n": 104,
  "t": "Siento orgullo de trabajar en esta empresa"
 },
 {
  "n": 105,
  "t": "Hablo bien de la empresa con otras personas"
 },
 {
  "n": 106,
  "t": "Atiendo clientes o usuarios muy enojados"
 },
 {
  "n": 107,
  "t": "Atiendo clientes o usuarios muy preocupados"
 },
 {
  "n": 108,
  "t": "Atiendo clientes o usuarios muy tristes"
 },
 {
  "n": 109,
  "t": "Mi trabajo me exige atender personas muy enfermas"
 },
 {
  "n": 110,
  "t": "Mi trabajo me exige atender personas muy necesitadas de ayuda"
 },
 {
  "n": 111,
  "t": "Atiendo clientes o usuarios que me maltratan"
 },
 {
  "n": 112,
  "t": "Para hacer mi trabajo debo demostrar sentimientos distintos a los míos"
 },
 {
  "n": 113,
  "t": "Mi trabajo me exige atender situaciones de violencia"
 },
 {
  "n": 114,
  "t": "Mi trabajo me exige atender situaciones muy tristes o dolorosas"
 },
 {
  "n": 115,
  "t": "Tengo colaboradores que comunican tarde los asuntos de trabajo"
 },
 {
  "n": 116,
  "t": "Tengo colaboradores que tienen comportamientos irrespetuosos"
 },
 {
  "n": 117,
  "t": "Tengo colaboradores que dificultan la organización del trabajo"
 },
 {
  "n": 118,
  "t": "Tengo colaboradores que guardan silencio cuando les piden opiniones"
 },
 {
  "n": 119,
  "t": "Tengo colaboradores que dificultan el logro de los resultados del trabajo"
 },
 {
  "n": 120,
  "t": "Tengo colaboradores que expresan de forma irrespetuosa sus desacuerdos"
 },
 {
  "n": 121,
  "t": "Tengo colaboradores que cooperan poco cuando se necesita"
 },
 {
  "n": 122,
  "t": "Tengo colaboradores que me preocupan por su desempeño"
 },
 {
  "n": 123,
  "t": "Tengo colaboradores que ignoran las sugerencias para mejorar su trabajo"
 }
],
    headings: [
 {
  "before": 1,
  "text": "Las siguientes preguntas están relacionadas con las condiciones ambientales del(los) sitio(s) o lugar(es) donde habitualmente realiza su trabajo."
 },
 {
  "before": 13,
  "text": "Para responder a las siguientes preguntas piense en la cantidad de trabajo que usted tiene a cargo."
 },
 {
  "before": 16,
  "text": "Las siguientes preguntas están relacionadas con el esfuerzo mental que le exige su trabajo."
 },
 {
  "before": 22,
  "text": "Las siguientes preguntas están relacionadas con las responsabilidades y actividades que usted debe hacer en su trabajo"
 },
 {
  "before": 31,
  "text": "Las siguientes preguntas están relacionadas con la jornada de trabajo."
 },
 {
  "before": 39,
  "text": "Las siguientes preguntas están relacionadas con las decisiones y el control que le permite su trabajo."
 },
 {
  "before": 48,
  "text": "Las siguientes preguntas están relacionadas con cualquier tipo de cambio que ocurra en su trabajo."
 },
 {
  "before": 53,
  "text": "Las siguientes preguntas están relacionadas con la información que la empresa le ha dado sobre su trabajo."
 },
 {
  "before": 60,
  "text": "Las siguientes preguntas están relacionadas con la formación y capacitación que la empresa le facilita para hacer su trabajo."
 },
 {
  "before": 63,
  "text": "Las siguientes preguntas están relacionadas con el o los jefes con quien tenga más contacto."
 },
 {
  "before": 76,
  "text": "Las siguientes preguntas indagan sobre las relaciones con otras personas y el apoyo entre las personas de su trabajo."
 },
 {
  "before": 90,
  "text": "Las siguientes preguntas están relacionadas con la información que usted recibe sobre su rendimiento en el trabajo."
 },
 {
  "before": 95,
  "text": "Las siguientes preguntas están relacionadas con la satisfacción, reconocimiento y la seguridad que le ofrece su trabajo."
 },
 {
  "before": 106,
  "text": "Las siguientes preguntas están relacionadas con la atención a clientes y usuarios."
 },
 {
  "before": 115,
  "text": "Las siguientes preguntas están relacionadas con las personas que usted supervisa o dirige."
 }
],
    gates: [
      { key: 'clients', prompt: 'En mi trabajo debo brindar servicio a clientes o usuarios:', first: 106, last: 114 },
      { key: 'boss', prompt: 'Soy jefe de otras personas en mi trabajo:', first: 115, last: 123 },
    ],
  },
  intra_B: {
    id: 'intra_B',
    title: 'Cuestionario de factores de riesgo psicosocial intralaboral — Forma B',
    instructions: INTRA_INSTR_BASE,
    scale: SCALE_5,
    items: [
 {
  "n": 1,
  "t": "El ruido en el lugar donde trabajo es molesto"
 },
 {
  "n": 2,
  "t": "En el lugar donde trabajo hace mucho frío"
 },
 {
  "n": 3,
  "t": "En el lugar donde trabajo hace mucho calor"
 },
 {
  "n": 4,
  "t": "El aire en el lugar donde trabajo es fresco y agradable"
 },
 {
  "n": 5,
  "t": "La luz del sitio donde trabajo es agradable"
 },
 {
  "n": 6,
  "t": "El espacio donde trabajo es cómodo"
 },
 {
  "n": 7,
  "t": "En mi trabajo me preocupa estar expuesto a sustancias químicas que afecten mi salud"
 },
 {
  "n": 8,
  "t": "Mi trabajo me exige hacer mucho esfuerzo físico"
 },
 {
  "n": 9,
  "t": "Los equipos o herramientas con los que trabajo son cómodos"
 },
 {
  "n": 10,
  "t": "En mi trabajo me preocupa estar expuesto a microbios, animales o plantas que afecten mi salud"
 },
 {
  "n": 11,
  "t": "Me preocupa accidentarme en mi trabajo"
 },
 {
  "n": 12,
  "t": "El lugar donde trabajo es limpio y ordenado"
 },
 {
  "n": 13,
  "t": "Por la cantidad de trabajo que tengo debo quedarme tiempo adicional"
 },
 {
  "n": 14,
  "t": "Me alcanza el tiempo de trabajo para tener al día mis deberes"
 },
 {
  "n": 15,
  "t": "Por la cantidad de trabajo que tengo debo trabajar sin parar"
 },
 {
  "n": 16,
  "t": "Mi trabajo me exige hacer mucho esfuerzo mental"
 },
 {
  "n": 17,
  "t": "Mi trabajo me exige estar muy concentrado"
 },
 {
  "n": 18,
  "t": "Mi trabajo me exige memorizar mucha información"
 },
 {
  "n": 19,
  "t": "En mi trabajo tengo que hacer cálculos matemáticos"
 },
 {
  "n": 20,
  "t": "Mi trabajo requiere que me fije en pequeños detalles"
 },
 {
  "n": 21,
  "t": "Trabajo en horario de noche"
 },
 {
  "n": 22,
  "t": "En mi trabajo es posible tomar pausas para descansar"
 },
 {
  "n": 23,
  "t": "Mi trabajo me exige laborar en días de descanso, festivos o fines de semana"
 },
 {
  "n": 24,
  "t": "En mi trabajo puedo tomar fines de semana o días de descanso al mes"
 },
 {
  "n": 25,
  "t": "Cuando estoy en casa sigo pensando en el trabajo"
 },
 {
  "n": 26,
  "t": "Discuto con mi familia o amigos por causa de mi trabajo"
 },
 {
  "n": 27,
  "t": "Debo atender asuntos de trabajo cuando estoy en casa"
 },
 {
  "n": 28,
  "t": "Por mi trabajo el tiempo que paso con mi familia y amigos es muy poco"
 },
 {
  "n": 29,
  "t": "En mi trabajo puedo hacer cosas nuevas"
 },
 {
  "n": 30,
  "t": "Mi trabajo me permite desarrollar mis habilidades"
 },
 {
  "n": 31,
  "t": "Mi trabajo me permite aplicar mis conocimientos"
 },
 {
  "n": 32,
  "t": "Mi trabajo me permite aprender nuevas cosas"
 },
 {
  "n": 33,
  "t": "Puedo tomar pausas cuando las necesito"
 },
 {
  "n": 34,
  "t": "Puedo decidir cuánto trabajo hago en el día"
 },
 {
  "n": 35,
  "t": "Puedo decidir la velocidad a la que trabajo"
 },
 {
  "n": 36,
  "t": "Puedo cambiar el orden de las actividades en mi trabajo"
 },
 {
  "n": 37,
  "t": "Puedo parar un momento mi trabajo para atender algún asunto personal"
 },
 {
  "n": 38,
  "t": "Me explican claramente los cambios que ocurren en mi trabajo"
 },
 {
  "n": 39,
  "t": "Puedo dar sugerencias sobre los cambios que ocurren en mi trabajo"
 },
 {
  "n": 40,
  "t": "Cuando se presentan cambios en mi trabajo se tienen en cuenta mis ideas y sugerencias"
 },
 {
  "n": 41,
  "t": "Me informan con claridad cuáles son mis funciones"
 },
 {
  "n": 42,
  "t": "Me informan cuáles son las decisiones que puedo tomar en mi trabajo"
 },
 {
  "n": 43,
  "t": "Me explican claramente los resultados que debo lograr en mi trabajo"
 },
 {
  "n": 44,
  "t": "Me explican claramente los objetivos de mi trabajo"
 },
 {
  "n": 45,
  "t": "Me informan claramente con quien puedo resolver los asuntos de trabajo"
 },
 {
  "n": 46,
  "t": "La empresa me permite asistir a capacitaciones relacionadas con mi trabajo"
 },
 {
  "n": 47,
  "t": "Recibo capacitación útil para hacer mi trabajo"
 },
 {
  "n": 48,
  "t": "Recibo capacitación que me ayuda a hacer mejor mi trabajo"
 },
 {
  "n": 49,
  "t": "Mi jefe ayuda a organizar mejor el trabajo"
 },
 {
  "n": 50,
  "t": "Mi jefe tiene en cuenta mis puntos de vista y opiniones"
 },
 {
  "n": 51,
  "t": "Mi jefe me anima para hacer mejor mi trabajo"
 },
 {
  "n": 52,
  "t": "Mi jefe distribuye las tareas de forma que me facilita el trabajo"
 },
 {
  "n": 53,
  "t": "Mi jefe me comunica a tiempo la información relacionada con el trabajo"
 },
 {
  "n": 54,
  "t": "La orientación que me da mi jefe me ayuda a hacer mejor el trabajo"
 },
 {
  "n": 55,
  "t": "Mi jefe me ayuda a progresar en el trabajo"
 },
 {
  "n": 56,
  "t": "Mi jefe me ayuda a sentirme bien en el trabajo"
 },
 {
  "n": 57,
  "t": "Mi jefe ayuda a solucionar los problemas que se presentan en el trabajo"
 },
 {
  "n": 58,
  "t": "Mi jefe me trata con respeto"
 },
 {
  "n": 59,
  "t": "Siento que puedo confiar en mi jefe"
 },
 {
  "n": 60,
  "t": "Mi jefe me escucha cuando tengo problemas de trabajo"
 },
 {
  "n": 61,
  "t": "Mi jefe me brinda su apoyo cuando lo necesito"
 },
 {
  "n": 62,
  "t": "Me agrada el ambiente de mi grupo de trabajo"
 },
 {
  "n": 63,
  "t": "En mi grupo de trabajo me tratan de forma respetuosa"
 },
 {
  "n": 64,
  "t": "Siento que puedo confiar en mis compañeros de trabajo"
 },
 {
  "n": 65,
  "t": "Me siento a gusto con mis compañeros de trabajo"
 },
 {
  "n": 66,
  "t": "En mi grupo de trabajo algunas personas me maltratan"
 },
 {
  "n": 67,
  "t": "Entre compañeros solucionamos los problemas de forma respetuosa"
 },
 {
  "n": 68,
  "t": "Mi grupo de trabajo es muy unido"
 },
 {
  "n": 69,
  "t": "Cuando tenemos que realizar trabajo de grupo los compañeros colaboran"
 },
 {
  "n": 70,
  "t": "Es fácil poner de acuerdo al grupo para hacer el trabajo"
 },
 {
  "n": 71,
  "t": "Mis compañeros de trabajo me ayudan cuando tengo dificultades"
 },
 {
  "n": 72,
  "t": "En mi trabajo las personas nos apoyamos unos a otros"
 },
 {
  "n": 73,
  "t": "Algunos compañeros de trabajo me escuchan cuando tengo problemas"
 },
 {
  "n": 74,
  "t": "Me informan sobre lo que hago bien en mi trabajo"
 },
 {
  "n": 75,
  "t": "Me informan sobre lo que debo mejorar en mi trabajo"
 },
 {
  "n": 76,
  "t": "La información que recibo sobre mi rendimiento en el trabajo es clara"
 },
 {
  "n": 77,
  "t": "La forma como evalúan mi trabajo en la empresa me ayuda a mejorar"
 },
 {
  "n": 78,
  "t": "Me informan a tiempo sobre lo que debo mejorar en el trabajo"
 },
 {
  "n": 79,
  "t": "En la empresa me pagan a tiempo mi salario"
 },
 {
  "n": 80,
  "t": "El pago que recibo es el que me ofreció la empresa"
 },
 {
  "n": 81,
  "t": "El pago que recibo es el que merezco por el trabajo que realizo"
 },
 {
  "n": 82,
  "t": "En mi trabajo tengo posibilidades de progresar"
 },
 {
  "n": 83,
  "t": "Las personas que hacen bien el trabajo pueden progresar en la empresa"
 },
 {
  "n": 84,
  "t": "La empresa se preocupa por el bienestar de los trabajadores"
 },
 {
  "n": 85,
  "t": "Mi trabajo en la empresa es estable"
 },
 {
  "n": 86,
  "t": "El trabajo que hago me hace sentir bien"
 },
 {
  "n": 87,
  "t": "Siento orgullo de trabajar en esta empresa"
 },
 {
  "n": 88,
  "t": "Hablo bien de la empresa con otras personas"
 },
 {
  "n": 89,
  "t": "Atiendo clientes o usuarios muy enojados"
 },
 {
  "n": 90,
  "t": "Atiendo clientes o usuarios muy preocupados"
 },
 {
  "n": 91,
  "t": "Atiendo clientes o usuarios muy tristes"
 },
 {
  "n": 92,
  "t": "Mi trabajo me exige atender personas muy enfermas"
 },
 {
  "n": 93,
  "t": "Mi trabajo me exige atender personas muy necesitadas de ayuda"
 },
 {
  "n": 94,
  "t": "Atiendo clientes o usuarios que me maltratan"
 },
 {
  "n": 95,
  "t": "Mi trabajo me exige atender situaciones de violencia"
 },
 {
  "n": 96,
  "t": "Mi trabajo me exige atender situaciones muy tristes o dolorosas"
 },
 {
  "n": 97,
  "t": "Puedo expresar tristeza o enojo frente a las personas que atiendo"
 }
],
    headings: [
 {
  "before": 1,
  "text": "Las siguientes preguntas están relacionadas con las condiciones ambientales del(los) sitio(s) o lugar(es) donde habitualmente realiza su trabajo."
 },
 {
  "before": 13,
  "text": "Para responder a las siguientes preguntas piense en la cantidad de trabajo que usted tiene a cargo."
 },
 {
  "before": 16,
  "text": "Las siguientes preguntas están relacionadas con el esfuerzo mental que le exige su trabajo."
 },
 {
  "before": 21,
  "text": "Las siguientes preguntas están relacionadas con la jornada de trabajo."
 },
 {
  "before": 29,
  "text": "Las siguientes preguntas están relacionadas con las decisiones y el control que le permite su trabajo."
 },
 {
  "before": 38,
  "text": "Las siguientes preguntas están relacionadas con cualquier tipo de cambio que ocurra en su trabajo."
 },
 {
  "before": 41,
  "text": "Las siguientes preguntas están relacionadas con la información que la empresa le ha dado sobre su trabajo"
 },
 {
  "before": 46,
  "text": "Las siguientes preguntas están relacionadas con la formación y capacitación que la empresa le facilita para hacer su trabajo."
 },
 {
  "before": 49,
  "text": "Las siguientes preguntas están relacionadas con el o los jefes con quien tenga más contacto."
 },
 {
  "before": 62,
  "text": "Las siguientes preguntas indagan sobre las relaciones con otras personas y el apoyo entre las personas de su trabajo."
 },
 {
  "before": 74,
  "text": "Las siguientes preguntas están relacionadas con la información que usted recibe sobre su rendimiento en el trabajo."
 },
 {
  "before": 79,
  "text": "Las siguientes preguntas están relacionadas con la satisfacción, reconocimiento y la seguridad que le ofrece su trabajo."
 },
 {
  "before": 89,
  "text": "Las siguientes preguntas están relacionadas con la atención a clientes y usuarios."
 }
],
    gates: [{ key: 'clients', prompt: 'En mi trabajo debo brindar servicio a clientes o usuarios:', first: 89, last: 97 }],
  },
  extra: {
    id: 'extra',
    title: 'Cuestionario de factores psicosociales extralaborales',
    instructions: [
      'Este cuestionario de factores psicosociales busca conocer su opinión sobre algunos aspectos de su vida familiar y personal.',
      'Le agradecemos que usted se sirva contestar a las siguientes preguntas de forma absolutamente sincera. Las respuestas que usted de al cuestionario, no son ni buenas, ni malas, lo importante es que reflejen su manera de pensar sobre las condiciones de su vida familiar y personal.',
      'Sus respuestas serán manejadas de forma absolutamente confidencial.',
      'Es muy importante que usted responda a todas las preguntas y en cada una de ellas marque una sola respuesta.',
      'Por favor lea cuidadosamente cada pregunta y conteste señalando con una “X” en la casilla de la respuesta que mejor se ajuste a su modo de pensar. Si se equivoca en una respuesta táchela y escriba la correcta.',
    ],
    scale: SCALE_5,
    items: [
 {
  "n": 1,
  "t": "Es fácil trasportarme entre mi casa y el trabajo"
 },
 {
  "n": 2,
  "t": "Tengo que tomar varios medios de transporte para llegar a mi lugar de trabajo"
 },
 {
  "n": 3,
  "t": "Paso mucho tiempo viajando de ida y regreso al trabajo"
 },
 {
  "n": 4,
  "t": "Me trasporto cómodamente entre mi casa y el trabajo"
 },
 {
  "n": 5,
  "t": "La zona donde vivo es segura"
 },
 {
  "n": 6,
  "t": "En la zona donde vivo se presentan hurtos y mucha delincuencia"
 },
 {
  "n": 7,
  "t": "Desde donde vivo me es fácil llegar al centro médico donde me atienden"
 },
 {
  "n": 8,
  "t": "Cerca a mi vivienda las vías están en buenas condiciones"
 },
 {
  "n": 9,
  "t": "Cerca a mi vivienda encuentro fácilmente transporte"
 },
 {
  "n": 10,
  "t": "Las condiciones de mi vivienda son buenas"
 },
 {
  "n": 11,
  "t": "En mi vivienda hay servicios de agua y luz"
 },
 {
  "n": 12,
  "t": "Las condiciones de mi vivienda me permiten descansar cuando lo requiero"
 },
 {
  "n": 13,
  "t": "Las condiciones de mi vivienda me permiten sentirme cómodo"
 },
 {
  "n": 14,
  "t": "Me queda tiempo para actividades de recreación"
 },
 {
  "n": 15,
  "t": "Fuera del trabajo tengo tiempo suficiente para descansar"
 },
 {
  "n": 16,
  "t": "Tengo tiempo para atender mis asuntos personales y del hogar"
 },
 {
  "n": 17,
  "t": "Tengo tiempo para compartir con mi familia o amigos"
 },
 {
  "n": 18,
  "t": "Tengo buena comunicación con las personas cercanas"
 },
 {
  "n": 19,
  "t": "Las relaciones con mis amigos son buenas"
 },
 {
  "n": 20,
  "t": "Converso con personas cercanas sobre diferentes temas"
 },
 {
  "n": 21,
  "t": "Mis amigos están dispuestos a escucharme cuando tengo problemas"
 },
 {
  "n": 22,
  "t": "Cuento con el apoyo de mi familia cuando tengo problemas"
 },
 {
  "n": 23,
  "t": "Puedo hablar con personas cercanas sobre las cosas que me pasan"
 },
 {
  "n": 24,
  "t": "Mis problemas personales o familiares afectan mi trabajo"
 },
 {
  "n": 25,
  "t": "La relación con mi familia cercana es cordial"
 },
 {
  "n": 26,
  "t": "Mis problemas personales o familiares me quitan la energía que necesito para trabajar"
 },
 {
  "n": 27,
  "t": "Los problemas con mis familiares los resolvemos de manera amistosa"
 },
 {
  "n": 28,
  "t": "Mis problemas personales o familiares afectan mis relaciones en el trabajo"
 },
 {
  "n": 29,
  "t": "El dinero que ganamos en el hogar alcanza para cubrir los gastos básicos"
 },
 {
  "n": 30,
  "t": "Tengo otros compromisos económicos que afectan mucho el presupuesto familiar"
 },
 {
  "n": 31,
  "t": "En mi hogar tenemos deudas difíciles de pagar"
 }
],
    headings: [],
    gates: [],
  },
  stress: {
    id: 'stress',
    title: 'Cuestionario para la evaluación del estrés — Tercera versión',
    instructions: ['Señale con una X la casilla que indique la frecuencia con que se le han presentado los siguientes malestares en los últimos tres meses.'],
    scale: SCALE_4,
    items: [
 {
  "n": 1,
  "t": "Dolores en el cuello y espalda o tensión muscular."
 },
 {
  "n": 2,
  "t": "Problemas gastrointestinales, úlcera péptica, acidez, problemas digestivos o del colon."
 },
 {
  "n": 3,
  "t": "Problemas respiratorios."
 },
 {
  "n": 4,
  "t": "Dolor de cabeza."
 },
 {
  "n": 5,
  "t": "Trastornos del sueño como somnolencia durante el día o desvelo en la noche."
 },
 {
  "n": 6,
  "t": "Palpitaciones en el pecho o problemas cardíacos."
 },
 {
  "n": 7,
  "t": "Cambios fuertes del apetito."
 },
 {
  "n": 8,
  "t": "Problemas relacionados con la función de los órganos genitales (impotencia, frigidez)."
 },
 {
  "n": 9,
  "t": "Dificultad en las relaciones familiares."
 },
 {
  "n": 10,
  "t": "Dificultad para permanecer quieto o dificultad para iniciar actividades."
 },
 {
  "n": 11,
  "t": "Dificultad en las relaciones con otras personas."
 },
 {
  "n": 12,
  "t": "Sensación de aislamiento y desinterés."
 },
 {
  "n": 13,
  "t": "Sentimiento de sobrecarga de trabajo."
 },
 {
  "n": 14,
  "t": "Dificultad para concentrarse, olvidos frecuentes."
 },
 {
  "n": 15,
  "t": "Aumento en el número de accidentes de trabajo."
 },
 {
  "n": 16,
  "t": "Sentimiento de frustración, de no haber hecho lo que se quería en la vida."
 },
 {
  "n": 17,
  "t": "Cansancio, tedio o desgano."
 },
 {
  "n": 18,
  "t": "Disminución del rendimiento en el trabajo o poca creatividad."
 },
 {
  "n": 19,
  "t": "Deseo de no asistir al trabajo."
 },
 {
  "n": 20,
  "t": "Bajo compromiso o poco interés con lo que se hace."
 },
 {
  "n": 21,
  "t": "Dificultad para tomar decisiones."
 },
 {
  "n": 22,
  "t": "Deseo de cambiar de empleo."
 },
 {
  "n": 23,
  "t": "Sentimiento de soledad y miedo."
 },
 {
  "n": 24,
  "t": "Sentimiento de irritabilidad, actitudes y pensamientos negativos."
 },
 {
  "n": 25,
  "t": "Sentimiento de angustia, preocupación o tristeza."
 },
 {
  "n": 26,
  "t": "Consumo de drogas para aliviar la tensión o los nervios."
 },
 {
  "n": 27,
  "t": "Sentimientos de que \"no vale nada\", o \"no sirve para nada\"."
 },
 {
  "n": 28,
  "t": "Consumo de bebidas alcohólicas o café o cigarrillo."
 },
 {
  "n": 29,
  "t": "Sentimiento de que está perdiendo la razón."
 },
 {
  "n": 30,
  "t": "Comportamientos rígidos, obstinación o terquedad."
 },
 {
  "n": 31,
  "t": "Sensación de no poder manejar los problemas de la vida."
 }
],
    headings: [],
    gates: [],
  },
};

/** Orden de aplicación tras la ficha. La forma intralaboral depende de la pregunta 14 de la ficha. */
export const questionnairesFor = (form: 'A' | 'B'): QuestionnaireId[] => [form === 'A' ? 'intra_A' : 'intra_B', 'extra', 'stress'];

/** Ítems que debe responder la persona según las compuertas Sí/No. */
export function applicableItems(def: QuestionnaireDef, gates: Partial<Record<'clients' | 'boss', boolean>>): Item[] {
  return def.items.filter((it) => !def.gates.some((g) => it.n >= g.first && it.n <= g.last && gates[g.key] !== true));
}
