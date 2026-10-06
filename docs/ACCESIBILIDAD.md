# Accesibilidad

Meta: WCAG 2.2 AA en los flujos de colaborador y de gestión.

## Funciones
- Panel «Accesibilidad» (botón o `Alt + A`): tema claro/oscuro/alto contraste, tipos de letra (Atkinson, Lexend, OpenDyslexic, serifa), tamaño de texto 100–200 %, interlineado, espaciado de letras y palabras, quitar animaciones, lectura enfocada (una pregunta a la vez). Se guardan por usuario.
- Panel «Ayuda» por rol (botón o `Alt + H`).
- Enlace «Saltar al contenido», foco visible, navegación completa con teclado, estructura de encabezados, tablas con `caption` y `scope`, mensajes de error con `role="alert"`, progreso anunciado, cierre con `Esc`.

## Auditoría automática (axe-core 4.x, reglas WCAG 2 A/AA, 2.1 A/AA, 2.2 AA y buenas prácticas)

Pantallas revisadas en el navegador: inicio de sesión, identificación del colaborador, código personal, consentimiento, ficha de datos generales, instrucciones y preguntas del cuestionario intralaboral, panel de gestión (con «Mi perfil»), las cinco pestañas de análisis, informe individual, formularios de corregir/suprimir, panel de Ayuda y de Accesibilidad. Temas probados: claro, oscuro y alto contraste.

Hallazgos y corrección:

| Hallazgo | Impacto | Corrección |
|---|---|---|
| El enlace de la marca tenía un nombre accesible distinto del texto visible | Serio | `aria-label` ahora incluye el texto visible |
| El anuncio de paso del formulario usaba `aria-label` en un `div` sin rol | Serio | Texto oculto visualmente (`sr-only`) que recibe el foco |
| Regiones de tabla con desplazamiento sin acceso por teclado | Serio | `tabIndex=0`, `role="region"` y nombre accesible |

Resultado tras las correcciones: **0 violaciones** en las pantallas anteriores y en los tres temas, incluido el contraste de color.

## Lo que una herramienta automática no verifica (pendiente, lo hace una persona)
- Lectura con **NVDA** (y VoiceOver en móvil): orden de lectura, anuncio de errores y de cambio de paso.
- **Zoom al 200 %** y reflujo a 320 px de ancho en todas las pantallas.
- Prueba en **móvil** real (tamaño de los objetivos táctiles, teclado en pantalla).
- Prueba con **usuarios** de baja visión o dislexia, idealmente con alguien de Sanithelp.
