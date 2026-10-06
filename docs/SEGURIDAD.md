# Seguridad (estado al cierre de la Fase 1)

Documento vivo. Se completa en la Fase 5 con la revisión OWASP Top 10.

## Implementado y probado

| Control | Detalle | Prueba |
|---|---|---|
| Contraseñas | argon2id (19 MiB, t=2, p=1). Mínimo 12 caracteres para personal; lista de claves comunes; no puede contener usuario/nombre | `auth.test.ts` |
| Contraseñas generadas | Las crea el sistema (aleatorias, 10 caracteres para credenciales de campaña, 14 para personal), se muestran una sola vez. No hay cambio autogestionado: restablece el administrador | `auth.test.ts` |
| Código personal del participante | `XXXX-XXXX` (~40 bits), solo se guarda su hash; 5 fallos bloquean 15 min; mensaje genérico | `auth.test.ts` |
| Credencial de campaña | Se invalida al cerrar la campaña o regenerarla (cierra sesiones abiertas) | `auth.test.ts` |
| MFA (TOTP) | Obligatorio para administrador y psicóloga; códigos de recuperación (8, de un solo uso, guardados como hash); el código no se puede reutilizar | `auth.test.ts` |
| Sesiones | Cookie `HttpOnly`, `SameSite=Strict`, `Secure` y prefijo `__Host-` en producción; nueva sesión en cada login; token guardado solo como hash; inactividad 15 min (personal) / 30 min (colaborador); máximo absoluto 12 h; cierre en todos los dispositivos | `auth.test.ts` |
| Bloqueo | 5 fallos → cuenta bloqueada 15 min; mensaje genérico que no revela si el usuario existe; se iguala el tiempo de respuesta | `auth.test.ts` |
| Límites de peticiones | Login: 10/min por IP+usuario. Resto de la API: 600/min por sesión o IP | Verificado a mano (`curl`) |
| CSRF | Token por sesión + validación de `Origin` + `SameSite=Strict` | `auth.test.ts` |
| Cabeceras | `helmet` con CSP estricta (solo `self`; `data:` únicamente para imágenes del QR), HSTS en producción, `frame-ancestors 'none'` | Revisado en respuesta HTTP |
| Cifrado de campo | AES-256-GCM con versión de clave (`v1:`); claves anteriores en `DATA_ENCRYPTION_KEYS_OLD` para rotar; índice ciego HMAC con clave aparte | `auth.test.ts` (nada en texto plano en BD) |
| Autorización | Toda ruta de gestión valida el rol en el servidor; la psicóloga solo ve/gestiona empresas asignadas; si no tiene permiso responde 404 (no revela existencia) | `auth.test.ts` |
| Auditoría | Inicios de sesión, fallos, bloqueos, MFA, cambios de contraseña, altas y restablecimientos. Sin datos personales en el registro. Solo-inserción forzada con triggers | `auth.test.ts` |
| Configuración | Variables validadas con Zod al arrancar; sin ellas el servidor no inicia. Sin credenciales por defecto en el código | `auth.test.ts` |
| Entradas | Validación con Zod en cada endpoint; consultas parametrizadas (Drizzle); sin `dangerouslySetInnerHTML` | Revisión de código |

| Respuestas clínicas | Cifradas por persona y cuestionario (AES-256-GCM). El colaborador solo recibe estados y conteos de preguntas respondidas, nunca puntajes (verificado en `flow.test.ts`) | `flow.test.ts` |
| Acceso clínico | Psicóloga: solo empresas asignadas (404 si no). Administrador: debe escribir el motivo, que se audita | `flow.test.ts`, `exports.test.ts` |
| Exportación masiva de PDF | Reconfirma contraseña + código MFA (que se consume); trabajo en hilo aparte; archivo temporal de un solo uso, caduca a los 30 min; auditado | `exports.test.ts` |
| Empresa cliente | Solo agregados anónimos, grupos < mínimo ocultos, sin ruta a datos individuales ni a PDF | `company.test.ts` |
| CSV | Protección contra inyección de fórmulas al abrir en Excel | Revisión de código |

## Riesgos conocidos del modelo de credencial compartida

- Quien tenga la credencial de la empresa puede intentar retomar el avance de otro compañero adivinando su código personal; se mitiga con el bloqueo a 5 intentos por participante y el límite por IP. Quien conozca un documento puede saber si esa persona ya participó (respuesta "ya existe").
- Si el código personal se pierde, la psicóloga debe poder restablecerlo (pendiente, Fase 3).
- Una credencial filtrada permite crear participaciones falsas hasta que se regenere o se cierre la campaña.

## Riesgo conocido en reportes de la empresa

Aunque cada grupo mostrado tiene al menos 5 personas, restar el total de la suma de los grupos visibles podría revelar el tamaño de un grupo pequeño oculto. Es un límite aceptado de la regla del «mínimo por grupo»; si se requiere más rigor, se puede agrupar siempre en «Otros» hasta alcanzar el mínimo.

## Implementado en la Fase 5

| Control | Detalle | Prueba |
|---|---|---|
| Rectificar y suprimir (Ley 1581) | La psicóloga (o el administrador) corrige nombres, apellidos y documento, o suprime los datos de una persona (pide contraseña). La supresión borra respuestas, ficha y datos personales y conserva solo la constancia de consentimiento revocada y la auditoría | `rights.test.ts` |
| Acceso/portabilidad | Expediente en PDF y CSV `DatosRPS` por persona | `exports.test.ts` |
| Retención | `npm run purge-expired -- <meses> [--confirmar]` suprime lo que supere el plazo; por defecto solo simula. **El plazo lo define Sanithelp con su asesoría legal** | `rights.test.ts` |
| Rotación de clave | `npm run rotate-keys`: re-cifra todo con la clave vigente en una transacción; idempotente; una prueba verifica que ninguna columna `*_enc` quede fuera | `rotation.test.ts` |
| Rol de BD con privilegios mínimos | `ops/db-roles.sql` + `MIGRATION_DATABASE_URL`: la app no es dueña de las tablas, no puede quitar triggers ni tocar la auditoría | `dbrole.test.ts` |
| Revisión OWASP Top 10 | `docs/OWASP.md` | — |

## Pendiente

- Prueba de penetración por un tercero y monitoreo/alertas externos (Fase 6).
- Sin Redis: los límites de peticiones viven en memoria del proceso. Válido mientras haya **una sola instancia** del servicio. Si se escala a varias, hay que moverlos a la base de datos.
- Bloqueo por cuenta: un atacante puede bloquear a un usuario conocido (15 min) fallando a propósito. Se acepta como contrapartida; el personal tiene MFA como segunda barrera.
- La rotación del `BLIND_INDEX_KEY` no está automatizada (requiere recalcular índices desde el texto claro); no se recomienda cambiarla.
