# PROMPT — Versión en producción de la Batería de Riesgo Psicosocial · Sanithelp

> Pega todo este documento como primer mensaje en una sesión nueva de Claude Code, abierta en una carpeta vacía donde quieras el proyecto. Antes, deja en esa carpeta (o dile la ruta) los archivos listados en la sección 2.

---

## 0. Rol y forma de trabajo

Actúa como **ingeniero full-stack senior** con experiencia en aplicaciones que manejan **datos sensibles de salud** (Ley 1581 de 2012, Colombia), accesibilidad web (WCAG 2.2 AA) y despliegue en **Railway**.

Tu tarea: convertir el MVP `bateria_psicosocial_mvp.jsx` en una **aplicación lista para producción** para **Sanithelp S.A.S. (IPS, Barranquilla)**, que aplica la Batería de Instrumentos para la Evaluación de Factores de Riesgo Psicosocial (Resolución 2404 de 2019, Ministerio de Trabajo / Pontificia Universidad Javeriana).

Cómo quiero que trabajes:

1. **Primero lee, luego planea, luego construye.** Lee todos los insumos de la sección 2 y entrega un **plan por fases** (arquitectura, modelo de datos, lista de tareas, riesgos, preguntas abiertas) antes de escribir código. Espera mi visto bueno al plan.
2. **Construye por fases** (sección 11). Al terminar cada fase: ejecuta pruebas, corre la app, verifícala visualmente y reporta qué funciona, qué no y qué decidiste.
3. **No inventes datos del instrumento.** Si falta un baremo, un ítem o una tabla, **detente y pídemelo**; no lo estimes ni lo aproximes (ver 4.2).
4. Cuando una decisión sea mía (negocio, legal, clínica), pregúntame con una recomendación. Cuando sea técnica y razonable, decide tú y déjala anotada en `docs/DECISIONES.md`.
5. Responde en **español**. Código, nombres de variables y commits en inglés está bien; todo texto visible al usuario, manual y documentación, en español de Colombia.

---

## 1. Contexto del negocio (resumen)

- Sanithelp aplica la Batería a colaboradores de empresas cliente. Primer caso: **~800 colaboradores**; proyección de uso continuo con más empresas.
- Hoy se hace en Excel con macros enviado por correo y consolidado a mano (≈3.200 h de digitación por ronda). El aplicativo elimina impresión y digitación y prioriza casos de riesgo.
- Instrumentos a digitalizar: **Ficha de datos generales**, **Intralaboral Forma A** (123 ítems; jefes, profesionales, técnicos), **Intralaboral Forma B** (97 ítems; auxiliares, operarios), **Extralaboral** (31 ítems), **Estrés — tercera versión** (31 ítems), más el **Consentimiento informado FP-PS-CI v01**.
- **Modelo de identificación mixto:** identificación nominal guardada para uso clínico de la psicóloga; reportes **agregados y anónimos** para la empresa cliente. La empresa **nunca** ve respuestas individuales.
- **Pre-evaluación oculta:** el sistema calcula puntajes automáticamente y **el colaborador nunca los ve**. La psicóloga ve semáforo y alertas (riesgo alto/muy alto primero).
- Titularidad: software, base de datos y cuentas de infraestructura son de **Sanithelp**. La autoría del desarrollo queda acreditada a la desarrolladora (créditos en README y en el pie de la pantalla de administración).

---

## 2. Insumos (léelos antes del plan)

| Insumo | Ruta | Uso |
|---|---|---|
| MVP funcional | `D:\DESCARGAS\bateria_psicosocial_mvp.jsx` | Banco de ítems, flujo, motor de puntuación inicial, UI base |
| Requerimientos funcionales v1.0 | `D:\DESCARGAS\Requerimientos_Funcionales_Bateria_Psicosocial.md` | RF-01 a RF-26 y marco legal. **Aplican, salvo donde este prompt los sustituye** (ver sección 3) |
| Plantilla: Consentimiento FP-PS-CI | `C:\Users\valef\Downloads\CONSENTIMIENTO INFORMADO PARA LA APLICACIÓN DE.pdf` | Texto literal del consentimiento y diseño del PDF |
| Plantilla: Ficha de datos generales | `C:\Users\valef\Downloads\Ficha de datos generales (1).pdf` | 19 preguntas; campos y opciones literales |
| Plantilla: Intralaboral Forma A | `C:\Users\valef\Downloads\Cuestionario factores intralaborales - Forma A (1).pdf` | Ítems, escalas, diseño del PDF |
| Plantilla: Intralaboral Forma B | `C:\Users\valef\Downloads\Cuestionario factores intralaborales - Forma B (1).pdf` | Ídem |
| Plantilla: Extralaboral | `C:\Users\valef\Downloads\Cuestionario factores extralaborales (1).pdf` | Ídem |
| Plantilla: Estrés | `C:\Users\valef\Downloads\Cuestionario estres (1).pdf` | Ídem |
| Logos Sanithelp | (imágenes adjuntas a este prompt; copiar a `client/public/brand/`) | Logo completo (corazón de manos + «SanitHelp») y logo solo ícono |
| **Excel oficial con macros / tablas de baremos** | **Pendiente: te lo entrego yo** | **Fuente de verdad del puntaje, transformación y baremos (ver 4.2)** |

Notas de lectura:
- Los PDF de Intralaboral A y B son largos: léelos por rangos de páginas (máx. 20 por lectura). Si no puedes renderizar PDFs en tu entorno, extrae el texto con una librería (p. ej. `pdfjs-dist`/`pdf-parse`) y compáralo contra el banco del MVP.
- El consentimiento y la ficha ya vienen con los PDF; el membrete de Sanithelp (franjas teal/azul, logo centrado, pie con teléfono 316 702 9052, correo coordservicios@sanithelp.com y dirección Carrera 53 # 59 – 77 Local 2, Barrio El Prado) está en el PDF del consentimiento. **Reutiliza ese membrete** para los PDF generados de Sanithelp.

---

## 3. Qué cambia respecto a los requerimientos v1.0

| Tema | v1.0 decía | **Ahora** |
|---|---|---|
| Hosting | Cloudflare Pages + Supabase | **Railway** (un servicio web + PostgreSQL de Railway). Autenticación y control de roles **propios** en el backend, no Supabase |
| Acceso del colaborador | Enlace o código único sin cuenta | **Login obligatorio** con usuario y contraseña creados por admin/psicóloga, ligados a una empresa (sección 6) |
| Exportación individual | Word | **PDF** siguiendo las plantillas oficiales, individual y masivo. El informe base en Word para la psicóloga (RF-20) se mantiene como entregable secundario, Fase 4 |
| Accesibilidad | Solo «responsive» | Accesibilidad e inclusión como requisito central (sección 8) |
| Manual | No mencionado | Ayuda flotante integrada + tooltips (sección 9) |

---

## 4. Reglas críticas (no negociables)

### 4.1 Fidelidad al instrumento
- Los ítems, enunciados, opciones de respuesta, instrucciones y orden deben ser **literales** a los PDF oficiales (la Batería es de uso obligatorio y no puede modificarse).
- **El banco de ítems del MVP tiene errores de transcripción** que debes corregir contra los PDF, por ejemplo: «…por la seguridad de otros por la seguridad de otros» (A-24), «…de otras personas personas» (A-26), «…innecesarias innecesarias» (A-28), «expuesto a**microbios**» sin espacio (A-10). **Ya hay una primera auditoría hecha** (`auditoria/AUDITORIA_ITEMS.md` y su script `auditoria/auditar.py`, en la carpeta de este prompt): Forma A tiene 4 diferencias reales, Forma B ninguna, Extralaboral 1 por decidir (ortografía oficial «trasporto») y Estrés 6 de fondo más el punto final de los 31 ítems. **Reutilízala:** cópiala a `docs/AUDITORIA_ITEMS.md`, confirma cada hallazgo visualmente contra el PDF renderizado y aplica las correcciones. `auditoria/items_pdf_literal.json` es solo un borrador de banco limpio: verifícalo antes de adoptarlo. La auditoría cubre enunciados y numeración, **no** la dirección de puntuación (eso va contra el Excel oficial).
- Mantén el esquema de escala: Intralaboral y Extralaboral = Siempre / Casi siempre / Algunas veces / Casi nunca / Nunca. Estrés = Siempre / Casi siempre / A veces / Nunca (marco temporal «últimos tres meses»).

### 4.2 Motor de puntuación: el MVP es un **atajo**, no la versión oficial
El motor del MVP **no es el oficial**. Lo declara en sus propios comentarios («Simplificado para MVP») y usa umbrales genéricos 20/40/60/80 % para todos los casos. La versión en producción debe usar:
- Puntaje bruto por dimensión y dominio con la **matriz oficial por ítem** (directos e inversos; en la Forma A, 73 ítems son inversos; en la B, 68).
- Puntaje **transformado** con los factores oficiales de cada dimensión/dominio/total.
- **Baremos oficiales** por forma (A/B), por dimensión, dominio y total, y por cuestionario (intralaboral, extralaboral, estrés) → cinco niveles: *Sin riesgo o riesgo despreciable, Riesgo bajo, Riesgo medio, Riesgo alto, Riesgo muy alto*.
- Estrés con el **procedimiento oficial** (ponderación por grupos de ítems y su transformación), no la suma simple del MVP.
- Manejo oficial de **ítems sin responder** (reglas de validez del cuestionario).

**Fuente de verdad:** el Excel oficial / manual con tablas de baremos que te entregaré. Si todavía no lo tienes, **detente y pídemelo**. No reconstruyas baremos de memoria.

Implementa el motor como **módulo puro y aislado** (`packages/scoring` o `server/src/scoring`), sin dependencias de UI ni de base de datos, con:
- Datos del instrumento en archivos de datos versionados (JSON/TS) separados de la lógica.
- **Pruebas unitarias** con casos de oro: toma varias baterías ya calificadas por el Excel oficial (al menos 10 por forma, incluyendo extremos, ítems omitidos y empates en bordes de baremo) y verifica que el motor reproduzca el resultado del Excel **exactamente**.
- Ese conjunto de casos de oro es el criterio de aceptación de la Fase 2.

### 4.3 Confidencialidad
- El colaborador **jamás** recibe puntajes, niveles ni mensajes de riesgo, ni en pantalla, ni en red (tampoco en respuestas de API: el endpoint de envío devuelve solo «recibido»).
- La empresa cliente solo ve **reportes agregados y anónimos**, con **mínimo de 5 personas por grupo**; si el grupo es menor, se oculta o se fusiona con otro (parametrizable por empresa).
- Autoría/clínica: el software es un vehículo tecnológico; la aplicación e interpretación son de la psicóloga con licencia SST. Refleja esto en el pie del informe y en el manual.

---

## 5. Arquitectura y despliegue limpio en Railway (punto 1)

**Stack propuesto** (puedes ajustar con justificación):
- **Monorepo** con `npm workspaces`: `client/` (React 18 + Vite + TypeScript), `server/` (Node 20+ + TypeScript + Fastify o Express), `packages/shared` (tipos, esquemas Zod, datos del instrumento) y, si ayuda, `packages/scoring`.
- **PostgreSQL** (plugin de Railway), con **migraciones versionadas** (Drizzle o Prisma). Prohibido crear tablas a mano.
- **Un solo servicio web** en Railway: el backend sirve la API en `/api/*` y el build estático del cliente (mismo dominio, cookies sin problemas de CORS). Un solo servicio + una base de datos mantiene el costo bajo.
- **Generación de PDF:** preferir **`pdf-lib`** sobre las plantillas oficiales (ver 7) o, si es inviable, HTML→PDF con una librería ligera. Evita Chromium/Puppeteer en Railway salvo que lo justifiques (peso, memoria, arranque).
- **Trabajos pesados** (PDF masivo de cientos de personas): cola en la propia base de datos (p. ej. `pg-boss`) o proceso en segundo plano del mismo servicio; **nunca** bloquear una petición HTTP generando 800 PDF.
- **Almacenamiento de archivos generados:** temporal (volumen de Railway o en memoria con streaming) con **caducidad corta** y borrado automático; los PDF no se guardan indefinidamente.

**Estructura de carpeta esperada (propuesta):**
```
bateria-psicosocial/
├─ client/                 # React + Vite
├─ server/                 # API, auth, PDF, jobs
│  ├─ src/{auth,routes,db,scoring,pdf,jobs,security}/
│  ├─ migrations/
│  └─ assets/pdf-templates/   # PDF oficiales (consentimiento, ficha, A, B, extra, estrés)
├─ packages/shared/        # tipos, Zod, datos del instrumento
├─ docs/                   # DECISIONES, AUDITORIA_ITEMS, DESPLIEGUE, SEGURIDAD, MANUAL_ADMIN
├─ .env.example
├─ railway.json  (o nixpacks.toml / Dockerfile)
├─ package.json  (raíz, con scripts build/start/migrate/test)
└─ README.md
```

**Despliegue limpio, exigencias concretas:**
- Un solo comando de build y uno de start desde la raíz; `npm run build` compila shared → client → server; `npm start` ejecuta migraciones pendientes y arranca.
- **Healthcheck** en `/api/health` (sin datos sensibles) y configurado en `railway.json`.
- Toda la configuración por **variables de entorno** validadas al arrancar (con Zod): `DATABASE_URL`, `SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `APP_BASE_URL`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `NODE_ENV`, etc. Si falta una, el servidor **no arranca** y dice cuál. Entrega `.env.example` completo y comentado.
- **Primer administrador** creado por un script/CLI (`npm run create-admin`) o desde las variables de bootstrap, forzando cambio de contraseña en el primer ingreso. Nada de credenciales por defecto en el código.
- `docs/DESPLIEGUE.md` paso a paso para alguien que nunca usó Railway: crear proyecto, añadir Postgres, variables, dominio propio, primer admin, cómo ver logs, cómo hacer rollback y **backups** (Railway backups + procedimiento de restauración probado).
- `.gitignore` correcto (sin `.env`, sin PDF generados, sin datos reales). Cero secretos en el repo.
- Semillas de **demostración** solo con datos sintéticos y solo en `development` (nunca en producción).

---

## 6. Flujo, login y seguridad (puntos 3 y 4)

### 6.1 Roles
| Rol | Puede |
|---|---|
| **Administrador (Sanithelp)** | Crear/desactivar empresas, campañas y usuarios de cualquier rol; restablecer contraseñas; ver auditoría; configuración global. **No ve respuestas clínicas por defecto** (principio de mínimo privilegio; acceso solo con justificación registrada). |
| **Psicóloga** | Crear usuarios colaboradores y contraseñas **por empresa**; ver resultados individuales y semáforo; descargar PDF individuales y masivos; generar reportes agregados; perfil con registro profesional y datos para la declaración del profesional en el consentimiento. |
| **Colaborador** | Solo responder lo que le corresponde. No ve puntajes. |
| **Empresa cliente (opcional, Fase 4)** | Solo reportes agregados y anónimos de su empresa. |

### 6.2 Cómo se crean los accesos
- La psicóloga y el administrador **crean usuarios y contraseñas por empresa** (individualmente y **por carga masiva CSV/Excel**: cédula, nombre, área, cargo, tipo de cargo A/B). El sistema genera credenciales temporales, las muestra **una sola vez** y permite **exportar la lista de credenciales** en un PDF/CSV protegido para entregarlas.
- Contraseña temporal → **cambio obligatorio** en el primer ingreso.
- Cada usuario pertenece a **una empresa y a una campaña/ronda** (RF-26). Sin credencial válida de esa campaña no se accede al formulario. El enlace público solo muestra la pantalla de login.
- El tipo de cargo (Forma A o B) lo asigna la psicóloga/administrador al crear el usuario (a partir de la pregunta 14 de la ficha), y el colaborador lo **confirma** en la ficha; si hay discrepancia, queda marcada para la psicóloga, no se cambia sola.
- Un colaborador puede **guardar avance y retomar** (ver 6.4), y no puede enviar dos veces la misma campaña.

### 6.3 Seguridad (datos sensibles de salud)
Implementa y documenta en `docs/SEGURIDAD.md`:
- **Contraseñas:** `argon2id`; política mínima (largo ≥ 12 para psicóloga/admin, ≥ 8 para colaboradores con credencial temporal aleatoria); verificación contra lista de contraseñas comunes.
- **MFA (TOTP)** obligatorio para psicóloga y administrador; códigos de recuperación.
- **Sesiones:** cookies `HttpOnly`, `Secure`, `SameSite=Lax/Strict`; rotación al iniciar sesión; expiración por inactividad (p. ej. 15 min psicóloga, 30 min colaborador con aviso previo accesible); cierre de sesión en todos los dispositivos.
- **Bloqueo y límites:** rate limiting por IP y por usuario, bloqueo temporal tras N intentos fallidos, mensajes de error genéricos (sin revelar si el usuario existe).
- **Cifrado en reposo a nivel de campo** (AES-256-GCM, clave en variable de entorno con **versión de clave** para rotación) para: nombre, identificación, respuestas y datos de la ficha. Para búsquedas por cédula usa un **índice ciego** (HMAC con clave aparte), no texto plano. TLS lo da Railway; fuerza HTTPS y HSTS.
- **Autorización por fila:** toda consulta filtra por empresa/rol en el servidor. Pruebas automáticas de que un colaborador no puede leer datos de otro, y de que la psicóloga solo ve las empresas que tiene asignadas.
- **Cabeceras:** `helmet` con CSP estricta, CSRF protegido, validación de entradas con Zod en cada endpoint, protección contra inyección (consultas parametrizadas) y XSS (sin `dangerouslySetInnerHTML`).
- **Auditoría inmutable:** quién vio, descargó o exportó qué y cuándo (incluye cada PDF individual y masivo). Los logs **no contienen** datos personales ni respuestas.
- **Retención y derechos del titular (Ley 1581):** función para rectificar, exportar y suprimir datos de una persona a solicitud, con registro; política de retención configurable; borrado de PDF temporales.
- **Dependencias:** `npm audit` limpio en la entrega, versiones fijadas, `package-lock.json` incluido.
- **Pruebas de seguridad:** al final de la Fase 5, haz una revisión tipo OWASP Top 10 y entrega los hallazgos y correcciones.

### 6.4 Flujo del colaborador (en este orden)
1. **Login** (usuario/contraseña de su empresa).
2. **Consentimiento informado FP-PS-CI** (punto 4): ver 6.5. **Nada** se muestra antes de aceptar.
3. **Ficha de datos generales** (19 preguntas, literales).
4. **Intralaboral** (Forma A o B según corresponda).
5. **Extralaboral.**
6. **Estrés.**
7. Confirmación de envío. Nunca resultados.

Con **barra de progreso**, **guardado automático** de avance (borrador cifrado en servidor), validación de que todos los ítems estén respondidos antes de enviar (RF-08) y pantalla de revisión previa al envío. Una pregunta o bloque por pantalla en móvil; tabla/rejilla en escritorio; navegable por teclado.

### 6.5 Consentimiento antes de cualquier formulario (punto 4)
- Reproduce **literalmente** el texto del FP-PS-CI v01 (secciones 1 a 5, voluntariedad, revocación).
- Muestra el texto completo, **con scroll y versión descargable**, antes de los controles de respuesta.
- Campos: fecha (automática), nombres, apellidos, N.º de identificación (precargados del usuario, el colaborador confirma), y elección **AUTORIZO / NO AUTORIZO** (obligatoria, sin pre-selección).
- **NO AUTORIZO** → se registra la decisión, se agradece y se **cierra el flujo sin mostrar ningún formulario**; la psicóloga ve «No autorizó» en su panel.
- **AUTORIZO** → se guarda: versión del documento (FP-PS-CI v01, 25/03/2026), fecha-hora, hash del texto mostrado, y evidencia electrónica de aceptación (sin huella física; el campo «huella/firma» del PDF se reemplaza por la constancia electrónica con fecha-hora). Debe poder **revocarse** informando a la psicóloga; la revocación se registra y bloquea nuevos accesos.
- Si el consentimiento cambia de versión, se versiona; cada respuesta queda ligada a la versión aceptada.
- El consentimiento va **una vez por colaborador y campaña**, antes de la ficha y de todos los cuestionarios.
- En el PDF del consentimiento, «Declaración del profesional responsable» se completa con los datos de la psicóloga (nombre, ID, registro profesional) tomados de su perfil.

---

## 7. Descarga de respuestas en PDF siguiendo las plantillas (punto 2)

**Objetivo:** la psicóloga descarga las respuestas de cada colaborador en **PDF con el aspecto de las plantillas oficiales**, **individual y masivamente**.

Requisitos:
- **Contenido por colaborador:** consentimiento (con constancia de aceptación), ficha de datos generales, intralaboral (A/B), extralaboral y estrés, cada uno con **las casillas marcadas exactamente como respondió** y los encabezados de las plantillas (fecha de aplicación, ID del respondiente). **No incluyas puntajes ni niveles** en este PDF (es soporte de respuestas). Los resultados calculados van en un informe aparte, solo para la psicóloga.
- **Fidelidad visual:** usa los PDF oficiales de `server/assets/pdf-templates/` como base y superpón las marcas con `pdf-lib` mediante un **mapa de coordenadas por plantilla** (versionado, probado). Si una plantilla no se puede usar como base, reconstrúyela como réplica visual fiel. Los membretes institucionales del PDF oficial (Min. Protección Social / Javeriana) se **conservan** en los cuestionarios; el membrete Sanithelp se usa en el consentimiento y en los informes propios.
- **Descarga individual:** botón en la ficha del colaborador → un PDF con todo el expediente, o por cuestionario a elección.
- **Descarga masiva:** seleccionar por empresa, campaña, área, forma o estado (completo/incompleto/no autorizó) → generación **asíncrona** con indicador de progreso y notificación al terminar → entrega como **ZIP con un PDF por persona** (nombre de archivo pseudonimizado configurable, p. ej. `ID_campaña.pdf`) **o** un único PDF combinado. Diseñado para **800 personas** sin agotar memoria (streaming/lotes, límite de concurrencia).
- **Seguridad de la exportación:** requiere sesión activa de psicóloga **y reconfirmación de contraseña/MFA** para descargas masivas; enlace de descarga de un solo uso con caducidad corta; registro en auditoría; marca de agua o pie con «Confidencial — uso exclusivo del profesional responsable» y fecha-hora de generación.
- **Pruebas:** comparar visualmente (renderizar a imagen) al menos un PDF generado de cada plantilla contra la plantilla vacía para verificar alineación de casillas; pruebas con 800 registros sintéticos midiendo tiempo y memoria; documenta los resultados.

*(Fase 4, secundario)* Informe base en Word con tablas y gráficos por colaborador y reporte agregado anónimo por área para la empresa (RF-20, RF-22), usando el motor oficial.

---

## 8. Accesibilidad e inclusión (punto 5)

Cumplir **WCAG 2.2 nivel AA** como mínimo y aspirar a AAA donde sea viable. Panel **«Accesibilidad»** siempre visible (ícono fijo en la barra superior y atajo de teclado), disponible **antes del login** y dentro de la app, con preferencias **persistentes por usuario** (localStorage y, ya autenticado, en su perfil):

| Ajuste | Detalle |
|---|---|
| **Tema** | Claro, oscuro y **alto contraste**; por defecto sigue `prefers-color-scheme`. Tokens CSS de color con contraste verificado en ambos temas |
| **Fuente** | Selector con: sistema, **Atkinson Hyperlegible** (baja visión), **Lexend** o **OpenDyslexic** (dislexia), serif legible. Fuentes **autoalojadas** (sin CDN, por privacidad y fiabilidad) |
| **Tamaño de texto** | Escala de 100 % a 200 % sin pérdida de contenido ni scroll horizontal, en pasos claros |
| **Espaciado** | Interlineado, espaciado entre letras/palabras y ancho de línea ajustables (criterio WCAG 1.4.12) |
| **Lectura** | Modo «lectura enfocada» (una pregunta a la vez, fondo neutro, sin distracciones); regla/guía de línea opcional |
| **Movimiento** | Respeta `prefers-reduced-motion`; opción para quitar animaciones |
| **Lector de pantalla** | Etiquetas ARIA correctas, `lang="es-CO"`, orden de foco lógico, anuncios de progreso y errores (`aria-live`), grupos de radio con `fieldset/legend` |
| **Teclado** | Todo operable con teclado, foco visible y con buen contraste, enlace «Saltar al contenido», sin trampas de foco |
| **Objetivos táctiles** | ≥ 44×44 px en opciones de respuesta |
| **Lectura en voz alta (opcional)** | Botón «Escuchar pregunta» usando la API de síntesis de voz del navegador en español |
| **Lenguaje** | Instrucciones claras, frases cortas; **no alteres el texto del instrumento** |

Reglas de diseño derivadas:
- **No uses color como único indicador** (el semáforo de la psicóloga lleva texto e ícono además de color).
- Los colores de marca (ver 10) **no pasan contraste AA como texto sobre blanco** (el teal): úsalos para superficies y detalles; el texto va en azul oscuro de la paleta o en neutros con contraste ≥ 4,5:1.
- Tiempos de sesión con **aviso accesible y opción de extender**.
- Validaciones con mensajes específicos y asociados al campo.
- **Pruebas:** `axe-core` en CI (cero violaciones serias/críticas), revisión manual con teclado y con lector de pantalla (NVDA), prueba a 200 % de zoom y en móvil. Entrega `docs/ACCESIBILIDAD.md` con la matriz de cumplimiento y lo que quede pendiente.

---

## 9. Manual de usuario y ayudas (punto 5)

- **Manual integrado y flotante:** botón fijo «Ayuda» que abre un **panel flotante no modal** (se puede **abrir, cerrar, minimizar y reubicar**; si la pantalla es pequeña, ocupa la parte inferior). Se cierra con `Esc`, no bloquea el formulario y **recuerda dónde quedó**.
- **Contextual por pantalla y por rol:** muestra instrucciones de la pantalla actual (consentimiento, ficha, cada cuestionario, panel de la psicóloga, descargas, gestión de usuarios, administración). Contenido separado por rol (colaborador / psicóloga / administrador).
- Para el colaborador: explica cómo responder, que puede guardar y retomar, que no hay respuestas correctas, **cuánto tarda** cada parte, a quién acudir, que **sus resultados no se le muestran** y por qué (confidencialidad), y cómo ajustar accesibilidad.
- Para la psicóloga/admin: creación de usuarios y carga masiva, lectura del semáforo y las alertas, descargas individuales/masivas, reportes, seguridad (MFA, sesiones), buenas prácticas de manejo de datos.
- **Tooltips accesibles** (disparados por hover **y** foco de teclado, descartables con `Esc`, nunca la única vía de ayuda) en: términos del instrumento, niveles de riesgo, cada filtro, acciones masivas, MFA, caducidad de enlaces, etc. En el cuestionario del colaborador **no** pongas tooltips que expliquen ítems (alteraría la aplicación del instrumento).
- Un **tour de primer uso** opcional («¿Quieres un recorrido?») que se puede omitir y reabrir desde Ayuda.
- Además del integrado, genera **`docs/MANUAL_USUARIO.pdf`** (colaborador) y **`docs/MANUAL_PSICOLOGA_ADMIN.pdf`** con capturas, con el membrete de Sanithelp. El contenido vive en archivos de datos (Markdown/JSON) para que se pueda editar sin tocar componentes.

---

## 10. Marca Sanithelp (punto 6)

- **Logos:** colócalos en `client/public/brand/` (completo y solo ícono, en SVG si puedes vectorizarlos, si no WebP/PNG con `srcset`). Úsalos en login, barra superior, favicon/PWA, PDF y manuales. Incluye **texto alternativo** («Sanithelp»). Prepara variante para fondo oscuro (el logo azul sobre oscuro necesita versión clara o contenedor claro).
- **Paleta:** extráela de los archivos de logo (muestrea los colores reales con una herramienta; no estimes a ojo). Referencia aproximada: **teal ≈ `#61B5C9`** (corazón izquierdo, «Sanit») y **azul pizarra ≈ `#4F6797`** (corazón derecho, «Help»). Define tokens de diseño en CSS: `--brand-teal`, `--brand-navy`, derivados claros/oscuros, neutros, y colores semánticos para los **5 niveles de riesgo** (verde, verde claro, amarillo, naranja, rojo) distinguibles también para daltonismo y con ícono/texto.
- El MVP usa `#0B7A8C` / `#075A67`: **sustitúyelos** por la paleta del logo.
- Tipografía de marca: la que corresponda a los logos si se puede obtener con licencia; si no, Lexend/Atkinson como base inclusiva.
- Pie institucional: teléfono, correo y dirección del membrete oficial; «Instrumento oficial Mintrabajo (Res. 2404/2019) · Datos sensibles — Ley 1581/2012».
- Pantalla de error 404/500, correo/avisos y PDF también con la marca.

---

## 11. Modelo de datos (guía, ajústalo y justifícalo)

Modelo **normalizado** (una fila por respuesta, no una columna por pregunta):

`companies` · `campaigns` (ronda por empresa, fechas, estado, versión de consentimiento) · `users` (rol, empresa, hash, mfa, estado, must_change_password, registro profesional) · `participants` (usuario colaborador, forma A/B, área, cargo, estado del avance) · `consents` (versión, decisión, fecha-hora, hash del texto, revocado) · `general_info_answers` · `answers` (participant, instrumento, ítem, valor; **cifrado**) · `scores` (por dimensión/dominio/total: bruto, transformado, nivel; versión del motor) · `export_jobs` · `audit_log` · `sessions` · `instrument_versions`.

Los **datos del instrumento** (ítems, matriz de puntuación, baremos) van versionados; cada `score` guarda con qué versión se calculó.

---

## 12. Fases y entregables

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **0 — Plan** | Lectura de insumos, auditoría de ítems, plan, riesgos, preguntas abiertas | Documento de plan aprobado por mí |
| **1 — Base y despliegue** | Monorepo, BD y migraciones, auth con roles, login, MFA, marca, tema y accesibilidad base, **deploy en Railway funcionando** | App en Railway con login y roles; `/api/health` OK |
| **2 — Instrumento y motor** | Banco de ítems auditado, flujo del colaborador (consentimiento→ficha→cuestionarios), guardado de avance, **motor oficial con casos de oro** | Motor idéntico al Excel en todos los casos de oro |
| **3 — Panel de la psicóloga** | Gestión de empresas/campañas/usuarios (incl. carga masiva), tablero y semáforo, filtros, ficha por colaborador, alertas | Flujo completo con datos sintéticos de 800 personas |
| **4 — PDF y reportes** | PDF individual y masivo, auditoría de descargas, informe Word, reporte agregado anónimo | PDF fieles a las plantillas; masivo de 800 sin fallar |
| **5 — Ayuda, accesibilidad y endurecimiento** | Manual flotante, tooltips, tour, ajustes completos de accesibilidad, revisión OWASP, manuales PDF | `axe` limpio, revisión manual, `SEGURIDAD.md` y `ACCESIBILIDAD.md` entregados |
| **6 — Salida a producción** | Checklist final, backups probados, dominio, monitoreo, traspaso de titularidad a Sanithelp | Lista de verificación firmada (abajo) |

**Pruebas obligatorias:** unitarias (motor, cifrado, autorización), integración (API con BD de prueba), E2E con Playwright de los flujos clave (login → consentimiento → cuestionarios → envío; psicóloga → semáforo → descarga PDF), accesibilidad (`axe`), carga (800 usuarios en ráfagas con decenas simultáneas) y seguridad.

---

## 13. Lista de verificación para «listo para producción»

- [ ] Despliegue limpio en Railway desde cero siguiendo solo `docs/DESPLIEGUE.md`.
- [ ] Sin secretos en el repo; variables validadas al arrancar; sin credenciales por defecto.
- [ ] Motor reproduce el Excel oficial en todos los casos de oro; informe de auditoría de ítems entregado.
- [ ] El colaborador nunca ve ni recibe puntajes (revisado en UI **y** en respuestas de red).
- [ ] Consentimiento previo a toda pregunta; «No autorizo» cierra el flujo.
- [ ] Cifrado a nivel de campo, MFA para psicóloga/admin, auditoría de lecturas y exportaciones.
- [ ] PDF individual y masivo con aspecto de plantilla oficial; masivo de 800 probado.
- [ ] Reportes para la empresa solo agregados y anónimos (mín. 5 por grupo).
- [ ] Accesibilidad: temas claro/oscuro/alto contraste, fuentes (incl. dislexia), tamaño de texto hasta 200 %, teclado y lector de pantalla verificados.
- [ ] Manual flotante, tooltips, tour y manuales PDF.
- [ ] Marca Sanithelp (logos y paleta) en toda la app y los PDF.
- [ ] Backups configurados y **restauración probada**.
- [ ] Pruebas verdes; `npm audit` sin vulnerabilidades altas/críticas.
- [ ] README con créditos de autoría y guía de mantenimiento para el ingeniero de sistemas de Sanithelp.

---

## 14. Decisiones por defecto (confírmalas o cámbialas en el plan)

1. **Acceso del colaborador:** usuario individual (cédula) + contraseña temporal generada, por empresa y campaña. *Alternativa:* un código de campaña compartido + cédula (menos seguro; no recomendado).
2. **MFA:** obligatorio para psicóloga y admin; no para colaboradores.
3. **El administrador no ve respuestas clínicas** salvo acceso justificado y registrado.
4. **Tamaño mínimo de grupo** en reportes de empresa: 5.
5. **Idioma:** solo español (Colombia) en la v1; estructura lista para i18n.
6. **PWA/offline:** fuera de alcance en la v1; sí «guardar y retomar» con conexión.
7. **Integración con SGM Salud:** fuera de alcance; solo exportación de PDF.

## 15. Lo que necesito de ti antes de empezar a codificar

1. Confirmación de las decisiones de la sección 14.
2. Que me pidas el **Excel oficial con macros / tablas de baremos** si no lo has recibido (sin él no se puede cerrar la Fase 2).
3. Cualquier ambigüedad que veas en los insumos, con tu recomendación.
4. Una estimación de esfuerzo por fase y los riesgos principales (PDF de plantillas oficiales, rendimiento del PDF masivo, fidelidad de baremos).
