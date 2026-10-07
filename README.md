# Batería de Riesgo Psicosocial · Sanithelp

Aplicación web para aplicar la Batería de Instrumentos para la Evaluación de Factores de Riesgo Psicosocial (Resolución 2404 de 2019, Ministerio de Trabajo / Pontificia Universidad Javeriana) a colaboradores de empresas cliente de Sanithelp S.A.S.

Además de la Batería, la psicóloga puede aplicar tres pruebas individuales en línea: **DISC**, **VALANTI** y **16PF** (ver [Evaluaciones](#evaluaciones)).

- **Titularidad:** el software, la base de datos y las cuentas de infraestructura son de Sanithelp S.A.S.
- **Autoría del desarrollo:** Valeria Flórez.

## Evaluaciones

Cada campaña (empresa + ronda) elige **qué evaluaciones aplica** al crearla. Los colaboradores las responden en orden, con una sola credencial de campaña, y **nunca ven puntajes**. Los resultados son solo para la psicóloga responsable (el administrador debe justificar el acceso y queda en la auditoría).

| Evaluación | Qué es | Estado | Qué falta |
|---|---|---|---|
| **Batería de riesgo psicosocial** | Intralaboral (forma A o B), extralaboral y estrés. Resultados agregados por empresa | **Lista y verificada** contra el Excel oficial | Informe Word (formato de la psicóloga) |
| **DISC** | 28 grupos de 4 palabras (MÁS / MENOS). Perfil D, I, S, C, segmentos 1 a 7 y patrón de perfil (18 patrones) | **Lista y verificada** contra la hoja oficial de corrección (40 casos de Excel reproducidos) | Confirmar la licencia del material |
| **VALANTI** | 30 parejas de frases con 3 puntos que se reparten. Cinco valores, puntaje estándar con la norma nacional de 1997 (n = 730) | **Lista y verificada** contra la hoja oficial Valanti.xls (25 casos de Excel reproducidos) | Confirmar la licencia del material |
| **16PF** | 187 cuestiones A, B, C | **Se aplica y se registra; no se califica** | La **clave ítem → escala** del instrumento (TEA no permite corrección manual) y confirmar la edición: el texto es de 187 cuestiones, el 16PF-5 tiene 185 ítems. Hay baremos del 16PF-5 en decatipos, pero sin la clave no sirven |

### Guía para la psicóloga

1. **Mi perfil:** completa tu documento y registro profesional. Salen en el consentimiento y en los informes; sin ellos no se generan PDF.
2. **Campañas → Nueva campaña:** elige la empresa, el nombre y las evaluaciones. Se genera la credencial que entregas a todos los colaboradores (se muestra una sola vez). Las evaluaciones **no se pueden cambiar** después de crear la campaña: si falta una, crea otra campaña.
3. **El colaborador** entra con la credencial, se identifica (documento, nombres y apellidos), recibe un **código personal** para retomar su avance, autoriza el consentimiento (con un anexo por cada prueba individual), llena la ficha de datos generales y responde las evaluaciones. El avance se guarda solo.
4. **Resultados** (botón de la campaña): pestañas por evaluación.
   - *Batería:* participantes, resumen total, por grupo, dominios y dimensiones, registro individual.
   - *DISC:* puntajes D, I, S, C con su segmento, patrón de perfil con su descripción e **informe PDF** por persona (el informe también se despliega en pantalla con «Ver informe»).
   - *VALANTI:* puntaje directo y estándar por valor (norma nacional 1997), banda, valor más y menos importante, interpretación e **informe PDF** por persona (también desplegable con «Ver informe»).
   - *16PF:* quién lo completó, **hoja de respuestas en PDF** por persona y **CSV** con todas las respuestas (1 = A, 2 = B, 3 = C, 0 = en blanco) para corregir con las plantillas o la plataforma del editor.
5. **Expediente PDF** (pestaña Participantes): consentimiento firmado electrónicamente (con sus anexos), ficha y las respuestas de la Batería. Las respuestas de DISC, VALANTI y 16PF van en sus propios informes, no en el expediente.

### Lo que debe aprobar la psicóloga (o el asesor legal) antes de usar en producción

- **Anexos del consentimiento** de DISC, VALANTI y 16PF: son **borradores** (`CONSENT_ADDENDA` en [assessments.ts](packages/shared/src/assessments.ts)).
- **Licencias:** la hoja del VALANTI está marcada «© Octavio Escobar, copia para uso exclusivo de Listos S.A.», el formulario es © PSINERGIA y el manual lo distribuye psicologiacientifica.com. Conviene tener la autorización por escrito de los titulares del DISC, del VALANTI y del 16PF (TEA).
- **Textos de interpretación** del DISC y del VALANTI: son los de las hojas oficiales; ella decide si los usa tal cual en el informe.
- **Edición y clave del 16PF** (ver la tabla).
- Las decisiones de siempre: criterio de «Relación con los colaboradores» para quien no es jefe, protocolo ante resultados altos, formato de informes, plazo de retención.

Todo lo decidido está en [docs/DECISIONES.md](docs/DECISIONES.md) (decisiones 32 a 53 para las evaluaciones).

### Agregar otra evaluación

1. Preguntas y tipos de respuesta en `packages/shared/src/<prueba>.ts`; id en `ASSESSMENT_IDS`, `InstrumentId`, `ASSESSMENTS` e `instrumentsFor` ([assessments.ts](packages/shared/src/assessments.ts)). Añade su anexo en `CONSENT_ADDENDA`.
2. Calificación en `packages/scoring/src/<prueba>.ts`, con pruebas en `packages/scoring/tests/`.
3. Servidor: validación en `saveSimple` y total en `totalOf` ([flow.ts](server/src/routes/flow.ts)); lectura en `server/src/results/`; rutas en `results.ts` y `exports.ts`; informe en `server/src/pdf/`.
4. Cliente: componente en `client/src/flow/`, y su pestaña en `client/src/analysis/Analysis.tsx`.
5. Prueba de extremo a extremo en `server/tests/` (ver `disc.test.ts` como modelo).

Las respuestas se guardan cifradas en `questionnaire_answers` (una fila por persona y evaluación) y la calificación se calcula **al consultar**, nunca en el navegador.

## Estado

| Fase | Estado |
|---|---|
| 0 Plan | Hecha ([docs/PLAN_FASE_0.md](docs/PLAN_FASE_0.md)) |
| 1 Base y despliegue | Hecha en local; **falta desplegar en Railway** |
| 2 Instrumento y motor | **Hecha.** Flujo del colaborador completo y motor oficial verificado contra el Excel ([docs/MOTOR_CALIFICACION.md](docs/MOTOR_CALIFICACION.md)) |
| 3 Panel de la psicóloga | **Hecha.** Mismos análisis del libro (`DatosRPS`, `ResTOT`, `ResTOT2`, `TD_DomDim`, informe individual) |
| 4 PDF y reportes | **Mayormente hecha.** PDF individual y masivo con el aspecto de las plantillas ([docs/PDF_RESPUESTAS.md](docs/PDF_RESPUESTAS.md)); reporte agregado para la empresa. Falta informe Word |
| 5 Ayuda, accesibilidad y endurecimiento | **Hecha en lo automatizable:** ayuda por rol, auditoría `axe` sin violaciones ([docs/ACCESIBILIDAD.md](docs/ACCESIBILIDAD.md)), revisión OWASP ([docs/OWASP.md](docs/OWASP.md)), derechos del titular, retención, rotación de claves. **Faltan** pruebas manuales (NVDA, zoom, móvil) y manuales en PDF |
| 6 Salida a producción | Pendiente: despliegue, dominio, backups probados, traspaso |

## Estructura

```
client/            React + Vite (TypeScript)
server/            API Fastify, autenticación, base de datos (Drizzle)
  migrations/      Migraciones SQL versionadas
  assets/pdf-templates/   PDF oficiales (se usarán en la Fase 4)
packages/shared/   Tipos, esquemas y textos de las evaluaciones (catálogo en assessments.ts)
packages/scoring/  Motores de calificación (Batería, DISC, VALANTI) y sus pruebas
docs/              Despliegue, seguridad, decisiones, auditoría de ítems
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm ci` | Instala dependencias |
| `npm run build` | Compila cliente y servidor |
| `npm start` | Aplica migraciones pendientes y arranca |
| `npm test` | Pruebas (PostgreSQL embebido, no requiere instalación) |
| `npm run typecheck` | Verifica tipos |
| `npm run db:generate` | Genera una migración tras cambiar `server/src/db/schema.ts` |
| `npm run local` | Entorno local completo con datos de demostración (ver abajo) |
| `npm run create-admin` | Crea un administrador (ver `docs/DESPLIEGUE.md`) |

## Documentación

- [Despliegue en Railway](docs/DESPLIEGUE.md)
- [Seguridad](docs/SEGURIDAD.md)
- [Decisiones técnicas](docs/DECISIONES.md)
- [Auditoría de ítems](docs/AUDITORIA_ITEMS.md)

## Nota clínica

El aplicativo es un vehículo tecnológico. La aplicación e interpretación de la Batería corresponden a la psicóloga con licencia en SST. El colaborador nunca ve puntajes ni niveles de riesgo.
