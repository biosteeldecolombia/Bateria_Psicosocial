# PDF de respuestas (expedientes)

Cada persona tiene un **expediente en PDF con el aspecto de las plantillas oficiales**: consentimiento FP-PS-CI v01 (con constancia electrónica de aceptación en lugar de la huella), ficha de datos generales y los cuestionarios con las casillas marcadas como respondió. **No incluye puntajes ni niveles**: es el soporte de las respuestas. Cada página lleva el pie «Confidencial — uso exclusivo del profesional responsable» con fecha y hora de generación.

## Cómo está hecho

- Plantillas oficiales en `server/assets/pdf-templates/` (consentimiento, ficha, Intralaboral A y B, Extralaboral, Estrés).
- **Mapa de coordenadas versionado** `coords.json`, generado midiendo las líneas de cada plantilla (`tools/extract_pdf_coords.py` y `tools/extract_ficha_coords.py`). Las columnas de opciones cambian un poco de página en página, por eso se miden fila por fila; 4 filas con bordes partidos reutilizan las de su vecina de la misma tabla.
- `pdf-lib` superpone las marcas (X en casilla, círculo en estrato, texto en recuadros) sobre las páginas copiadas de las plantillas, que se analizan una sola vez.
- Verificación visual: se renderizaron muestras de cada plantilla a imagen y se comprobó la alineación (consentimiento, ficha de 4 páginas, Forma A incluida la página de compuertas Sí/No, Forma B con columnas de ancho desigual, Extralaboral y Estrés).

## Descarga

| Modo | Detalle |
|---|---|
| Individual | `GET /api/participants/:id/expediente.pdf`. Inmediato. Botón «PDF» en la pestaña Participantes. |
| Masivo | ZIP con un PDF por persona (`ID_campaña.pdf`), trabajo en segundo plano con barra de progreso. Filtros por estado, forma y área. Exige **contraseña + código MFA**; el archivo es **temporal, de un solo uso y caduca a los 30 minutos**. |
| Seguridad | Solo psicóloga con la empresa asignada; el administrador debe escribir el motivo (queda en la auditoría). Todo se audita sin datos personales. |

## Rendimiento (800 personas sintéticas, prueba `tests/perf.test.ts`)

| Medida | Resultado |
|---|---|
| Calcular resultados de 800 personas | 0,7 s |
| Resúmenes + dominios | 1,3 s |
| Exportar 800 expedientes | 2,9 min (217 ms por persona) |
| Pico de memoria durante la exportación | 533 MB (con el generador en un hilo de trabajo limitado a 640 MB; sin él llegaba a 3,6 GB) |

**Tamaño:** cada expediente pesa unos 5 MB (las plantillas oficiales son pesadas), así que 800 personas ocupan cerca de 4 GB. Por eso la exportación permite filtrar por área o forma y conviene descargar por lotes.

## Pendiente

- «Nombres» y «Apellidos» del consentimiento se separan con una regla simple (la primera mitad del nombre completo) porque la aplicación recoge un solo campo. Mejora recomendada: pedirlos por separado al identificarse.
- PDF combinado en un único archivo y nombre de archivo pseudonimizado configurable.
- Informe individual en Word (el libro trae formatos Word de informes).
