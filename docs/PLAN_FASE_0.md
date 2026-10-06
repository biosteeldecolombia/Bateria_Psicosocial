# Plan Fase 0 — Batería de Riesgo Psicosocial · Sanithelp

Estado: **borrador para aprobación**. No se ha escrito código.

## 1. Insumos: qué hay y qué falta

| Insumo | Estado |
|---|---|
| Prompt de producción | Leído |
| MVP `bateria_psicosocial_mvp.jsx` (43 KB) y `.html` | Encontrado en `D:\DESCARGAS` |
| Requerimientos v1.0 (RF-01…RF-26) | Encontrado en `D:\DESCARGAS` |
| PDF: consentimiento, ficha, Intra A, Intra B, Extra, Estrés | Encontrados en `C:\Users\valef\Downloads` |
| Logos (completo e ícono, .webp) | En esta carpeta |
| Auditoría de ítems (`auditoria/`) | Presente; hay que confirmarla visualmente contra los PDF |
| **Excel oficial con macros / baremos** | **NO encontrado. Bloquea la Fase 2** |

Otros hallazgos: la carpeta no es repositorio git (se inicializará en Fase 1). `D:\DESCARGAS` también tiene `Propuesta_Bateria_Psicosocial_Sanithelp.docx`, que no figura en el prompt; la leeré por si contiene alcance o precio comprometido.

## 2. Arquitectura

- Monorepo npm workspaces: `client/` (React 18 + Vite + TS), `server/` (Node 20 + TS + **Fastify**), `packages/shared` (tipos, Zod, datos del instrumento), `packages/scoring` (motor puro).
- PostgreSQL de Railway + **Drizzle** (migraciones versionadas). Un solo servicio web: API en `/api/*` y estático del cliente en el mismo dominio.
- Auth propia: argon2id, sesiones en BD con cookie HttpOnly/Secure/SameSite, TOTP para psicóloga/admin, CSRF, rate limiting.
- Cifrado de campo AES-256-GCM con versión de clave; índice ciego HMAC para cédula.
- PDF: `pdf-lib` sobre las plantillas oficiales con mapa de coordenadas versionado. Masivo asíncrono con `pg-boss` y salida en ZIP vía streaming, descarga de un solo uso.
- Variables de entorno validadas con Zod al arrancar; `/api/health`; `railway.json`.

## 3. Modelo de datos

Según sección 11 del prompt. Ajustes propuestos:
- `participants` guarda forma A/B **declarada** (por psicóloga) y **confirmada** (ficha), con bandera de discrepancia.
- `answers`: una fila por ítem, valor cifrado; el borrador de avance vive en la misma tabla con estado `draft`.
- `scores` incluye `engine_version` e `instrument_version`.
- `audit_log` solo-inserción (sin UPDATE/DELETE por permisos de BD) y sin datos personales.

## 4. Fases, esfuerzo y riesgos

Esfuerzo en sesiones de trabajo (aproximado; una sesión ≈ una jornada de desarrollo asistido).

| Fase | Esfuerzo | Riesgo principal |
|---|---|---|
| 1 Base y despliegue | 3–4 | Configuración Railway/Postgres, MFA y sesiones bien hechas |
| 2 Instrumento y motor | 4–6 | **Depende del Excel**; transcribir baremos sin error |
| 3 Panel psicóloga | 4–5 | Carga masiva CSV, semáforo, rendimiento con 800 |
| 4 PDF y reportes | 5–7 | **Alineación de casillas sobre PDF oficiales** (pueden ser escaneos o sin campos) y memoria en masivo |
| 5 Ayuda, a11y, OWASP | 4–5 | Verificación con NVDA es manual y debe hacerla una persona |
| 6 Producción | 2 | Restauración de backups, traspaso de titularidad |

Riesgos transversales:
1. **Baremos:** sin el Excel no hay motor oficial. Nunca se estimarán de memoria.
2. **PDF oficiales:** si son imágenes, el mapa de coordenadas se hace a mano por casilla (≈ 280 ítems por colaborador); alternativa: réplica fiel en HTML→PDF.
3. **Colaborador con dispositivo/conexión limitada:** el guardado automático y el bloqueo de doble envío deben ser robustos.
4. **Datos sensibles:** pérdida de la `DATA_ENCRYPTION_KEY` implica pérdida irreversible de datos; requiere procedimiento de custodia documentado.
5. **Fuentes:** OpenDyslexic tiene licencia propia; confirmar antes de autoalojarla.

## 5. Decisiones técnicas que tomo yo (se anotarán en `DECISIONES.md`)

Fastify sobre Express; Drizzle sobre Prisma (más ligero en el despliegue); `pg-boss` para la cola; sesiones en BD en vez de JWT (revocables); nombres de archivo de exportación pseudonimizados por defecto.

## 6. Preguntas abiertas (necesito tu respuesta)

1. **Excel oficial con macros / baremos:** ¿dónde está o cuándo lo tendrás? Necesito además ≥10 baterías ya calificadas por forma para los casos de oro.
2. ¿Confirmas las 7 decisiones por defecto de la sección 14 del prompt?
3. **Extralaboral ítem 4:** ¿conservar «trasporto» como el PDF (recomendado)? ¿Y el punto final en los 31 ítems de Estrés (recomendado: sí)?
4. **Consentimiento:** ¿quién es la psicóloga responsable cuyos datos (nombre, ID, registro profesional) irán en la declaración? ¿Habrá una o varias por empresa?
5. **Empresa cliente (Fase 4):** ¿se acuerda ya un acceso para ver reportes agregados, o solo se entregan PDF/Word?
6. **Titularidad y cuentas:** ¿la cuenta de Railway y el dominio los crea Sanithelp desde el inicio, o los creo yo y los traspaso al final?
7. **Entorno de desarrollo:** ¿tienes Node 20+ y Docker/Postgres local instalados, o preparo el entorno?
8. **Docx de propuesta:** ¿rige algo de `Propuesta_Bateria_Psicosocial_Sanithelp.docx` sobre alcance o plazos que deba respetar?
