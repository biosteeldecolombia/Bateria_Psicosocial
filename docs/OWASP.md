# Revisión OWASP Top 10 (2021)

Revisión hecha sobre el código y las pruebas del proyecto. **No es una prueba de penetración**: esa debe hacerla un tercero antes de manejar datos reales a escala (ver «Pendiente»).

| # | Riesgo | Estado | Cómo se cubre / evidencia |
|---|---|---|---|
| A01 | Control de acceso roto | Cubierto | Cada ruta valida el rol en el servidor (`requireReady`). La psicóloga solo accede a empresas asignadas (404 si no). La empresa cliente solo tiene rutas agregadas. El administrador debe justificar el acceso clínico (auditado). Pruebas: `auth`, `flow`, `exports`, `company`, `rights`. |
| A02 | Fallas criptográficas | Cubierto | Datos personales y respuestas con AES-256-GCM y clave versionada; índice ciego HMAC para búsquedas; contraseñas con argon2id; tokens solo como hash; script de rotación (`npm run rotate-keys`) probado. TLS lo termina Railway (HSTS activo en producción). |
| A03 | Inyección | Cubierto | Consultas parametrizadas (Drizzle); todas las entradas validadas con Zod; sin `dangerouslySetInnerHTML`; CSV protegido contra inyección de fórmulas; el script de rotación usa nombres de tabla/columna fijos (no de entrada). |
| A04 | Diseño inseguro | Cubierto con riesgos aceptados | Modelo de amenazas en `SEGURIDAD.md` (credencial compartida, ataque por diferencia en reportes de empresa). Mínimo privilegio, auditoría solo-inserción, mínimo de grupo para reportes. |
| A05 | Configuración incorrecta | Cubierto | Config validada al arrancar (no inicia sin secretos); CSP estricta, `frame-ancestors 'none'`, `nosniff`, `no-referrer`; cookie `__Host-` en producción; errores 5xx sin detalles; rol de BD con privilegios mínimos (`ops/db-roles.sql`, probado). |
| A06 | Componentes vulnerables | Cubierto hoy | `npm audit --omit=dev`: 0 vulnerabilidades. En desarrollo hay 4 moderadas (esbuild vía vite/drizzle-kit) que no llegan a producción. Revisar en cada despliegue. |
| A07 | Fallas de identificación y autenticación | Cubierto | MFA TOTP obligatorio para administrador y psicóloga, con códigos de recuperación y sin reutilización del código; bloqueo a 5 intentos; límites por IP+usuario; sesiones con inactividad y duración máxima; no hay autogestión de contraseñas (la restablece el administrador); código personal con bloqueo por intentos. |
| A08 | Fallas de integridad de software y datos | Cubierto | Lockfile (`npm ci`); sin carga dinámica de código; auditoría inmutable por triggers y privilegios; versión del motor de calificación en cada cálculo; el consentimiento guarda el hash del texto aceptado. |
| A09 | Registro y monitoreo | Parcial | Auditoría de accesos, cambios y descargas (sin datos personales); registros de la app sin cookies. **Falta** monitoreo externo y alertas (Fase 6). |
| A10 | SSRF | No aplica | La aplicación no hace peticiones a URLs suministradas por el usuario. |

## Verificaciones puntuales
- `trustProxy: true`: correcto **solo** detrás del proxy de Railway. Si se expusiera directamente, la IP sería falsificable (afectaría los límites de intentos).
- Límites de intentos en memoria: válidos con **una sola instancia** del servicio.
- Cabeceras de respuesta revisadas con `curl -I` (CSP, COOP/CORP, `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store` en la API).

## Pendiente
- Prueba de penetración por un tercero (autenticada, con los cuatro roles).
- Monitoreo y alertas (intentos fallidos masivos, errores 5xx, descargas masivas).
- Revisión legal del aviso de privacidad y de la política de retención (ver `DECISIONES.md`).
