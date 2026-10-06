# Auditoría de ítems — MVP vs PDF oficiales

Comparación literal del banco `BANCO` de `bateria_psicosocial_mvp.jsx` contra el texto de los PDF de la Batería (Ministerio de la Protección Social / Pontificia Universidad Javeriana).

**Alcance:** enunciados y numeración. **No** valida la dirección de puntuación por ítem (vector `p`), porque los PDF no la contienen: eso se verifica contra el Excel oficial (ver «Pendiente»).

## Resumen

| Cuestionario | Ítems esperados | Leídos del PDF | En MVP | Idénticos | Dif. de forma | Dif. de fondo |
|---|---|---|---|---|---|---|
| Intralaboral Forma A | 123 | 123 | 123 | 118 | 0 | 4 |
| Intralaboral Forma B | 97 | 97 | 97 | 97 | 0 | 0 |
| Extralaboral | 31 | 31 | 31 | 30 | 0 | 1 |
| Estrés (3.ª versión) | 31 | 31 | 31 | 0 | 25 | 6 |

*Dif. de fondo* = cambia el texto (palabras sobrantes, faltantes o distintas). *Dif. de forma* = solo puntuación, mayúsculas, signos o espacios.

## Intralaboral Forma A

- Numeración completa y consecutiva en ambas fuentes.

### Diferencias de fondo (corregir)

| Ítem | MVP | PDF oficial | Cambio |
|---|---|---|---|
| 10 | En mi trabajo me preocupa estar expuesto amicrobios, animales o plantas que afecten mi salud | En mi trabajo me preocupa estar expuesto a microbios, animales o plantas que afecten mi salud | «amicrobios,» → «a microbios,» |
| 24 | Como parte de mis funciones debo responder por la seguridad de otros por la seguridad de otros | Como parte de mis funciones debo responder por la seguridad de otros | «por la seguridad de otros» → «∅» |
| 26 | Mi trabajo me exige cuidar la salud de otras personas personas | Mi trabajo me exige cuidar la salud de otras personas | «personas» → «∅» |
| 28 | En mi trabajo me piden hacer cosas innecesarias innecesarias | En mi trabajo me piden hacer cosas innecesarias | «innecesarias» → «∅» |

### Falsos positivos (el MVP está bien)

El PDF parte la palabra al extraer el texto; en el documento visual está completa.

| Ítem | MVP | Texto extraído del PDF |
|---|---|---|
| 71 | Mi jefe me ayuda a sentirme bien en el trabajo | Mi jefe me ayuda a sen tirme bien en el trabajo |

## Intralaboral Forma B

- Numeración completa y consecutiva en ambas fuentes.

Sin diferencias.

## Extralaboral

- Numeración completa y consecutiva en ambas fuentes.

### Diferencias de fondo (corregir)

| Ítem | MVP | PDF oficial | Cambio |
|---|---|---|---|
| 4 | Me transporto cómodamente entre mi casa y el trabajo | Me trasporto cómodamente entre mi casa y el trabajo | «transporto» → «trasporto» |

## Estrés (3.ª versión)

- Numeración completa y consecutiva en ambas fuentes.

### Diferencias de fondo (corregir)

| Ítem | MVP | PDF oficial | Cambio |
|---|---|---|---|
| 5 | Transtornos del sueño como somnolencia durante el día o desvelo en la noche | Trastornos del sueño como somnolencia durante el día o desvelo en la noche. | «Transtornos» → «Trastornos»; «noche» → «noche.» |
| 7 | Cambios fuertes en el apetito | Cambios fuertes del apetito. | «en el apetito» → «del apetito.» |
| 8 | Problemas relacionados con la función de los organos genitales (impotencia, frigidez) | Problemas relacionados con la función de los órganos genitales (impotencia, frigidez). | «organos» → «órganos»; «frigidez)» → «frigidez).» |
| 9 | Dificultades en las relaciones familiares | Dificultad en las relaciones familiares. | «Dificultades» → «Dificultad»; «familiares» → «familiares.» |
| 12 | Sensación de aislamiento o desinterés | Sensación de aislamiento y desinterés. | «o desinterés» → «y desinterés.» |
| 23 | Sentimiento de soledad o miedo | Sentimiento de soledad y miedo. | «o miedo» → «y miedo.» |

### Diferencias de forma (revisar)

| Ítem | MVP | PDF oficial |
|---|---|---|
| 1 | Dolores en el cuello y espalda o tensión muscular | Dolores en el cuello y espalda o tensión muscular. |
| 2 | Problemas gastrointestinales, úlcera péptica, acidez, problemas digestivos o del colon | Problemas gastrointestinales, úlcera péptica, acidez, problemas digestivos o del colon. |
| 3 | Problemas respiratorios | Problemas respiratorios. |
| 4 | Dolor de cabeza | Dolor de cabeza. |
| 6 | Palpitaciones en el pecho o problemas cardíacos | Palpitaciones en el pecho o problemas cardíacos. |
| 10 | Dificultad para permanecer quieto o dificultad para iniciar actividades | Dificultad para permanecer quieto o dificultad para iniciar actividades. |
| 11 | Dificultad en las relaciones con otras personas | Dificultad en las relaciones con otras personas. |
| 13 | Sentimiento de sobrecarga de trabajo | Sentimiento de sobrecarga de trabajo. |
| 14 | Dificultad para concentrarse, olvidos frecuentes | Dificultad para concentrarse, olvidos frecuentes. |
| 15 | Aumento en el número de accidentes de trabajo | Aumento en el número de accidentes de trabajo. |
| 16 | Sentimiento de frustración, de no haber hecho lo que se quería en la vida | Sentimiento de frustración, de no haber hecho lo que se quería en la vida. |
| 17 | Cansancio, tedio o desgano | Cansancio, tedio o desgano. |
| 18 | Disminución del rendimiento en el trabajo o poca creatividad | Disminución del rendimiento en el trabajo o poca creatividad. |
| 19 | Deseo de no asistir al trabajo | Deseo de no asistir al trabajo. |
| 20 | Bajo compromiso o poco interés con lo que se hace | Bajo compromiso o poco interés con lo que se hace. |
| 21 | Dificultad para tomar decisiones | Dificultad para tomar decisiones. |
| 22 | Deseo de cambiar de empleo | Deseo de cambiar de empleo. |
| 24 | Sentimiento de irritabilidad, actitudes y pensamientos negativos | Sentimiento de irritabilidad, actitudes y pensamientos negativos. |
| 25 | Sentimiento de angustia, preocupación o tristeza | Sentimiento de angustia, preocupación o tristeza. |
| 26 | Consumo de drogas para aliviar la tensión o los nervios | Consumo de drogas para aliviar la tensión o los nervios. |
| 27 | Sentimientos de que "no vale nada", o "no sirve para nada" | Sentimientos de que "no vale nada", o " no sirve para nada". |
| 28 | Consumo de bebidas alcohólicas o café o cigarrillo | Consumo de bebidas alcohólicas o café o cigarrillo. |
| 29 | Sentimiento de que está perdiendo la razón | Sentimiento de que está perdiendo la razón. |
| 30 | Comportamientos rígidos, obstinación o terquedad | Comportamientos rígidos, obstinación o terquedad. |
| 31 | Sensación de no poder manejar los problemas de la vida | Sensación de no poder manejar los problemas de la vida. |

## Decisiones que requieren criterio (no se corrigen solas)

- **Extralaboral ítem 4:** el PDF oficial escribe «trasporto» (sin *n*), igual que el ítem 1 («trasportarme»). La RAE acepta ambas formas. Por la exigencia de fidelidad literal (Res. 2404/2019) se recomienda **conservar la grafía del PDF** y aplicarla de forma consistente en los ítems 1 y 4; el MVP hoy mezcla las dos.
- **Estrés, punto final:** los 31 ítems del PDF terminan en punto; el MVP los omite. Recomendado: reproducir el punto.
- **Estrés ítem 27:** el PDF trae un espacio dentro de las comillas (`" no sirve para nada"`), es un defecto tipográfico del original. Recomendado: normalizarlo (no altera el sentido) y dejarlo anotado.
- **Estrés ítems 7, 9, 12, 23:** el MVP parafraseó («en el apetito», «Dificultades», «o desinterés», «o miedo»). Son cambios de fondo: usar el texto del PDF.

## Pendiente (no verificable con los PDF)

1. **Dirección de puntuación por ítem** (directo/inverso, vector `p`): comparar contra el Excel oficial.
2. **Baremos, factores de transformación y reglas de ítems omitidos:** el motor del MVP usa umbrales genéricos 20/40/60/80 %, no los oficiales.
3. **Estrés:** el MVP suma 3-2-1-0 simple; el procedimiento oficial pondera por grupos de ítems.
4. **Textos fuera de los ítems** (instrucciones, encabezados de dimensión, ejemplo): no auditados aquí.
