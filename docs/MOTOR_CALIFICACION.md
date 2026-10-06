# Motor de calificación

Réplica del libro oficial **«Bateria Psicosocial - PARA ENVIAR.xlsm»** (RCG versión 08k, «incluye ajuste de baremos informado en enero/2011»), basado en la Batería del Ministerio de la Protección Social y la Pontificia Universidad Javeriana (Res. 2404/2019).

- Código: `packages/scoring` (módulo puro: sin base de datos ni interfaz).
- Datos: `packages/scoring/src/spec.json`, **generado por `tools/extract_scoring_spec.py` leyendo las fórmulas del Excel**, no transcrito a mano. Guarda el SHA-256 del libro de origen.
- Versión del motor en cada cálculo: `rcg-08k/1`.

## Qué calcula

| Cuestionario | Cálculo |
|---|---|
| Intralaboral A y B | Puntaje por ítem (tabla `Ptajes`, con su dirección directa/inversa) → suma por dimensión → dominio → total. Transformado = `ROUND(bruto / (ítems × 4) × 100, 1)`. Nivel: primer umbral «hasta» que el transformado **no supere** (comparación `>`) en los baremos de las Tablas 29 a 33. |
| Extralaboral | Igual, con baremos de la Tabla 17 (cargos 1-2: jefatura y profesional/técnico) o la 18 (cargos 3-4: auxiliar y operario). |
| Estrés (3.ª versión) | Promedios por grupo de ítems (1-8 ×4, 9-12 ×3, 13-22 ×2, 23-31 ×1), suma redondeada a 2 decimales, transformado = `ROUND(bruto × 100 / 61,16, 1)`. Baremos de la Tabla 6 por grupo de cargo. |
| Total intra + extra | `ROUND((bruto intra + bruto extra) × 100 / 616, 1)` en Forma A o `/ 512` en Forma B; baremos de la Tabla 34. |

### Validez (reglas del libro)

- Cada dimensión exige tener respondidos todos sus ítems, **salvo** las que toleran uno sin responder (Forma A: características del liderazgo, relaciones sociales, relación con colaboradores, demandas ambientales; Forma B: liderazgo, relaciones sociales, demandas ambientales; Extralaboral: características de la vivienda).
- Un dominio o total es válido solo si todas sus dimensiones lo son.
- Estrés: exige las 31 respuestas.
- Un ítem sin responder suma 0 y no cuenta como respondido; **no se prorratea**.

### Compuertas «Sí / No» (clientes y jefe)

Si la respuesta es **No**, los ítems condicionados cuentan como contestados con puntaje 0. Así lo hace el libro.
Consecuencia a tener presente: para una persona que **no es jefe**, la dimensión «Relación con los colaboradores» sale con 0 y sus 9 ítems entran al denominador del dominio «Liderazgo y relaciones sociales». El Manual de la Batería describe excluirla; el libro (y por tanto esta aplicación) la incluye. **Confirmar con la psicóloga responsable cuál criterio prefiere** antes de la primera aplicación real.

## Cómo se verificó (casos de oro)

El propio Excel se usó como oráculo (`tools/run_excel_oracle.ps1`): se cargaron en una **copia** del libro, con macros desactivadas, **1.400 casos aleatorios** (semilla fija; 350 por cuestionario; con ítems sin responder, compuertas Sí/No y ambos grupos de cargo) y se registró lo que Excel calculó.

`packages/scoring/tests/oracle.test.ts` exige que el motor reproduzca **exactamente** el bruto, el transformado y el nivel de las 24 filas de la Forma A, las 21 de la Forma B, las 8 del Extralaboral y el Estrés. `rounding.test.ts` compara el redondeo contra el `ROUND` de Excel para todos los brutos posibles del total (0-616 y 0-512) y 3.000 combinaciones del estrés.

Resultado: **8 de 8 pruebas, coincidencia exacta**. Para repetir:

```bash
python tools/dump_workbook.py "ruta/al/libro.xlsm"
python tools/extract_scoring_spec.py "ruta/al/libro.xlsm"
python tools/gen_oracle_cases.py
powershell -File tools/run_excel_oracle.ps1 -Xlsm "ruta/al/libro.xlsm" -Cases tmp_xl/cases_ForA.json -Out tmp_xl/oracle_ForA.json   # y ForB, ForEx, ForEstr
python tools/merge_golden.py
npm test -w packages/scoring
```

Requiere Excel de escritorio (se maneja por COM) y no modifica el archivo original.

## Estructura de los resultados para la psicóloga

El registro por persona usa **las 101 columnas de la hoja `DatosRPS`** del libro (mismos nombres y orden): datos generales, puntajes transformados y niveles de cada dimensión y dominio, totales y estrés (`packages/scoring/src/export.ts`). Sobre él se arman los mismos análisis del libro:

| Hoja del libro | En la aplicación |
|---|---|
| `DatosRPS` | Pestaña «Registro individual» y descarga `DatosRPS.csv` |
| `ResTOT` | «Resumen total» (personas por nivel, %, promedio) |
| `ResTOT2` | «Resumen por grupo» (tipo de cargo, área, sexo…) |
| `TD_DomDim` | «Dominios y dimensiones» con el **nivel de intervención** requerido (el más alto presente en el grupo) |
| Informes individuales | «Ver informe» por persona |

## Advertencia sobre el libro de origen

El archivo «PARA ENVIAR» conserva dentro de las tablas dinámicas de `ResTOT2` datos de una aplicación anterior (áreas, cargos y conteos de unas 80 personas). **No contiene nombres de personas**, pero sí información de una organización. Conviene limpiar el libro antes de enviarlo a otros. Además, el macro `Módulo1` incluye en texto claro la contraseña de protección de hojas; no se usó ni se necesita para este proyecto.
