# Batería de Riesgo Psicosocial · Sanithelp

Aplicación web para aplicar la Batería de Instrumentos para la Evaluación de Factores de Riesgo Psicosocial (Resolución 2404 de 2019, Ministerio de Trabajo / Pontificia Universidad Javeriana) a colaboradores de empresas cliente de Sanithelp S.A.S.

- **Titularidad:** el software, la base de datos y las cuentas de infraestructura son de Sanithelp S.A.S.
- **Autoría del desarrollo:** Valeria Flórez.

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
packages/shared/   Tipos y esquemas compartidos
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
