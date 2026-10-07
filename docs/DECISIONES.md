# Decisiones técnicas

Registro de decisiones tomadas durante el desarrollo. Las de negocio, legales o clínicas las toma Sanithelp.

## Fase 1

| # | Decisión | Motivo |
|---|---|---|
| 1 | Fastify (no Express) | Validación y registro integrados, buen rendimiento, plugins oficiales de seguridad (`helmet`, `rate-limit`, `cookie`) |
| 2 | Drizzle (no Prisma) | Más ligero en el despliegue, migraciones SQL legibles y revisables |
| 3 | `tsup` empaqueta el servidor; el paquete `shared` se incluye en el bundle | Un solo `dist/index.js`; evita compilar paquetes del monorepo en orden |
| 4 | Sesiones en BD con cookie opaca (no JWT) | Se pueden revocar al instante (cierre en todos los dispositivos, desactivar usuario, restablecer clave). Se guarda solo el hash del token |
| 5 | **Los colaboradores no tienen usuario propio.** Cada campaña (empresa + ronda) tiene una credencial compartida que entrega la psicóloga; el colaborador se identifica dentro del formulario con documento y nombre | Decisión de Sanithelp. Evita crear y entregar cientos de cuentas |
| 6 | **Código personal para retomar:** al empezar, el sistema entrega un código `XXXX-XXXX` (se muestra una sola vez; se guarda solo su hash). Retomar exige documento + código; 5 fallos bloquean 15 min | Con credencial compartida, el documento por sí solo permitiría ver el avance de un compañero. Decisión de Sanithelp |
| 6b | **Credencial vigente por campaña** (se cierra con la ronda; se puede regenerar si se filtra) | Recomendación mía, **confirmada por Sanithelp**. Cambiar si prefieren una fija por empresa |
| 6c | **Sin cambio de contraseña autogestionado.** Las contraseñas las genera el sistema y las restablece el administrador (personal) o se regeneran por campaña | Decisión de Sanithelp. Contrapartida: la contraseña inicial del personal es la definitiva hasta que el admin la restablezca; por eso es aleatoria de 14 caracteres y el personal tiene MFA |
| 6d | El mismo documento en dos campañas = dos participaciones distintas; en la misma campaña es único | Una persona puede aplicarse en rondas distintas |
| 7 | CSRF: token por sesión (`x-csrf-token`) + verificación de `Origin` + cookie `SameSite=Strict` | Triple capa sin depender de librerías externas |
| 8 | Límite de intentos de login **por (IP + usuario)**, no solo por IP | Una oficina con muchos colaboradores detrás de una misma IP no se bloquea entre sí. Además hay bloqueo de cuenta a los 5 fallos (15 min) |
| 9 | Límite global por sesión (o IP si no hay sesión), solo en `/api` | Idem; los archivos estáticos no cuentan |
| 10 | Auditoría solo-inserción **forzada por la base de datos** (triggers que bloquean UPDATE/DELETE/TRUNCATE) | No depende de que el código se porte bien. Para que ni la propia app pueda quitarlos, la app usa un rol sin ser dueña de las tablas (`ops/db-roles.sql`, decisión 29) |
| 11 | TOTP con prevención de reutilización del código (se guarda el último paso usado) | Un código interceptado no sirve dos veces |
| 12 | Fuentes autoalojadas con `@fontsource` (Atkinson, Lexend, OpenDyslexic; las tres con licencia OFL) | Sin CDN: privacidad y funcionamiento sin conexión a terceros |
| 13 | Pruebas con PostgreSQL embebido (`embedded-postgres`) | Prueban contra Postgres real (triggers, cifrado, migraciones) sin instalar nada |
| 14 | Colores de marca muestreados de los logos: teal `#5CB4C4`, azul `#4C6494` | Medidos, no estimados. El teal solo se usa en superficies (no pasa AA como texto sobre blanco) |
| 15 | `npm audit`: 4 vulnerabilidades *moderadas*, solo en herramientas de desarrollo (`esbuild` vía `vite`/`drizzle-kit`); 0 en dependencias de producción | No se fuerza una actualización con cambios incompatibles. Se revisa en la Fase 5 |

## Fases 2 a 4

| # | Decisión | Motivo |
|---|---|---|
| 16 | El motor se **genera leyendo las fórmulas del Excel oficial** (`tools/extract_scoring_spec.py`), no se transcribe | Elimina errores de copia y deja trazabilidad (SHA-256 del libro) |
| 17 | El Excel se usó como **oráculo**: 1.400 casos aleatorios calificados por él mismo; el motor los reproduce exactamente | Es el criterio de aceptación de la Fase 2 |
| 18 | Se replica el criterio del libro para compuertas «No» (ítems contados como contestados con 0) | Fuente de verdad pedida por Sanithelp. **Difiere del Manual** para quien no es jefe; confirmar con la psicóloga |
| 19 | Respuestas guardadas como índice de opción (0-5), cifradas en bloque por persona y cuestionario | El colaborador nunca recibe puntajes; el cálculo ocurre solo en el servidor y se hace al consultar |
| 20 | El cliente (navegador) **no incluye el motor de calificación** | Garantiza que el colaborador no pueda obtener puntajes ni de forma indirecta |
| 21 | La psicóloga ve **la misma estructura de columnas de `DatosRPS`** y los mismos resúmenes del libro | Pedido expreso: seguir la estructura que ya usa para su análisis |
| 22 | El administrador **debe justificar** el acceso a resultados clínicos (queda en auditoría) | Mínimo privilegio (decisión por defecto 3 del prompt) |
| 23 | PDF con `pdf-lib` sobre las plantillas oficiales; coordenadas medidas, no estimadas | Fidelidad visual verificada renderizando muestras |
| 24 | La generación masiva de PDF corre en un **hilo de trabajo con límite de memoria** | Sin él: 3,6 GB de memoria y el servidor bloqueado; con él: 533 MB y el servidor responde |
| 25 | Empresa cliente: solo agregados; grupos con menos de 5 personas se ocultan | Confidencialidad |

## Fase 5

| # | Decisión | Motivo |
|---|---|---|
| 26 | **MFA obligatorio** para administrador y psicóloga | Confirmado por Sanithelp |
| 27 | **Nombres y Apellidos en campos separados** al identificarse (`surnames_enc` nuevo; los registros sin apellidos siguen funcionando) | Confirmado por Sanithelp; el consentimiento ya no usa una regla aproximada |
| 28 | La psicóloga completa **su documento y registro profesional en «Mi perfil»**; sin ellos no se generan expedientes (salen en el consentimiento) | Pedido de Sanithelp |
| 29 | La app se conecta con un rol sin privilegios de esquema; las migraciones las corre el dueño (`MIGRATION_DATABASE_URL`) | La inmutabilidad de la auditoría no depende de que el código de la app «se porte bien» |
| 30 | Derechos del titular: corregir y suprimir por la psicóloga (con contraseña); se conserva solo la constancia del consentimiento revocada | Ley 1581/2012 |
| 31 | La **retención** no tiene plazo por defecto: el script exige indicar los meses y simula primero | El plazo es una decisión legal de Sanithelp, no técnica |

## Decisiones que se delegan a la psicóloga responsable

Son criterio clínico o profesional; no las tomo yo.

1. **«Relación con los colaboradores» para quien no es jefe.** El libro de Excel cuenta esa dimensión con 0 puntos dentro del dominio «Liderazgo y relaciones sociales»; el Manual describe excluirla del cálculo. Hoy se replica el libro (decisión 18). Cambiar el criterio exige ajustar el motor (cómo se recalcula el dominio sin esa dimensión) y volver a verificarlo contra casos de referencia; se hace cuando ella decida. Cambia los niveles de quienes no son jefes.
2. **Protocolo ante resultados altos** (qué se informa y cómo, a quién se deriva, plazos).
3. **Formato del informe individual y del informe a la empresa** (el libro trae formatos Word): hace falta su plantilla o aprobación del contenido antes de generarlos.
4. **Texto del consentimiento y del aviso de privacidad:** hoy es el FP-PS-CI v01 literal; cualquier cambio lo aprueba ella (y el asesor legal).
5. **Plazo de retención** de los expedientes (con el asesor legal).
6. **Mínimo de personas por grupo** en los reportes a la empresa (hoy 5; configurable por empresa).

## Evaluaciones adicionales (DISC, VALANTI, 16PF)

| # | Decisión | Motivo |
|---|---|---|
| 32 | Las pruebas del repo `evaluaciones-psicometricas` se **portan como instrumentos** de esta app; no se fusiona ni se incrusta ese repo | Aquel repo no tiene autenticación, cifrado, consentimiento ni auditoría |
| 33 | **Catálogo de evaluaciones** (`packages/shared/src/assessments.ts`) y columna `campaigns.assessments`; cada campaña elige qué aplica (por defecto, la batería psicosocial) | Las campañas existentes quedan como estaban; DISC, VALANTI y 16PF figuran «próximamente» hasta incorporar su cuestionario y calificación |
| 34 | El orden de cuestionarios lo da `instrumentsFor(assessments, forma)` | Sustituye la lista fija de la batería en el flujo del colaborador |
| 35 | **DISC activado.** Respuesta por grupo = `posición MÁS × 4 + posición MENOS`, guardada en el mismo `questionnaire_answers` (cifrada). Validación en servidor: posiciones distintas, grupos 1 a 28 | Reutiliza el almacenamiento y el autoguardado de la batería |
| 36 | **Clave de calificación DISC PROVISIONAL** (`DISC_KEY`, `packages/scoring/src/disc.ts`): la posición de la palabra en el grupo (0 a 3) puntúa D, I, S, C, tal como está en el repo de origen. Los resultados e informes se rotulan «provisional» hasta poner `DISC_KEY_VALIDATED = true` | No hay evidencia de que sea la clave oficial: varios grupos tienen 3 palabras de un mismo estilo, lo que una clave por posición no refleja. **La valida la psicóloga** |
| 37 | Segmentos 1 a 7 y descripción del patrón: tomados del repo de origen (un solo patrón, el de la escala más alta; si hay empate no se asigna patrón) | Pendiente de aprobación de la psicóloga |
| 38 | Resultados DISC solo para la psicóloga (pestaña «DISC» del análisis, informe PDF individual), con la misma regla de acceso clínico que la batería (el administrador justifica) | El colaborador nunca ve puntajes |
| 39 | **Anexo de consentimiento DISC (borrador)**: se muestra solo en campañas con DISC; el hash y la versión guardados incluyen el anexo | Finalidad distinta a la batería psicosocial. El texto lo aprueba la psicóloga y el asesor legal (mismo trato que el texto base) |
| 40 | El expediente PDF de respuestas sigue siendo solo de la batería psicosocial; el DISC tiene su propio informe | La plantilla oficial es de la batería |
| 41 | **VALANTI activado.** Respuesta por pareja = puntos de la frase A (0 a 3); la B recibe 3 menos. Clave (frase → valor) y textos tomados del repo de origen; 90 puntos repartidos en total | Reutiliza el almacenamiento, validación y autoguardado del DISC |
| 42 | **Norma VALANTI PROVISIONAL** (`VALANTI_NORM`, `packages/scoring/src/valanti.ts`): media y desviación «nacional 1997» del repo de origen, sin fuente. Las cinco medias suman 91,95 y no 90, así que no parecen corresponder a este formato de 30 parejas. Los puntajes directos no dependen de la norma; los estándar y su interpretación se rotulan provisionales hasta `VALANTI_NORM_VALIDATED = true` | **La valida la psicóloga** |
| 43 | Informe VALANTI en PDF y pestaña «VALANTI» en el análisis, con el mismo control de acceso clínico que el DISC; anexo de consentimiento (borrador) | Mismo trato que el DISC |
| 44 | Las respuestas del formato anterior de 28 preguntas (29/09 al 02/10/2026) del repo de origen **no se migran** | Aquellos datos no entran a esta app |
| 45 | **16PF: solo se aplica y se registra; no se califica.** Respuesta por cuestión = índice de la opción (0 = A, 1 = B, 2 = C), 187 cuestiones del repo de origen. La psicóloga descarga la hoja de respuestas en PDF y un CSV (1 = A, 2 = B, 3 = C, 0 = en blanco) para corregirlas con las plantillas y baremos del editor (TEA) | La usuaria confirmó que puede usar el texto del test, pero no se dispone de las claves de corrección ni de los baremos: el documento del COP aportado es solo la evaluación del 16PF-5 (no los trae) y señala que el 16PF-5 solo se corrige con la plataforma de TEA. No se inventa una calificación
| 46 | **Edición del 16PF por aclarar.** El texto del repo tiene 187 cuestiones (cuestionario clásico, Forma A); el 16PF-5 que describe el COP tiene 185 ítems y otros rasgos y escalas | Son ediciones distintas: la corrección (y la licencia) depende de cuál se use. La confirma la psicóloga |
