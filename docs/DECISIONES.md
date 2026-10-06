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
