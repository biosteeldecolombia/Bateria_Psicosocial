"""Auditoría ítem por ítem: banco del MVP (.jsx) vs PDF oficiales de la Batería.

Uso:  python auditar.py
Salidas (en esta misma carpeta):
  AUDITORIA_ITEMS.md      informe de diferencias
  items_pdf_literal.json  ítems tal como salen de los PDF (candidato a banco limpio)
"""
import difflib, json, re, unicodedata
from pathlib import Path
import pdfplumber

OUT = Path(__file__).resolve().parent
DL = Path(r"C:\Users\valef\Downloads")
JSX = Path(r"D:\DESCARGAS\bateria_psicosocial_mvp.jsx")
PDFS = {
    "A": ("Intralaboral Forma A", "Cuestionario factores intralaborales - Forma A (1).pdf", 123),
    "B": ("Intralaboral Forma B", "Cuestionario factores intralaborales - Forma B (1).pdf", 97),
    "EX": ("Extralaboral", "Cuestionario factores extralaborales (1).pdf", 31),
    "ES": ("Estrés (3.ª versión)", "Cuestionario estres (1).pdf", 31),
}


def limpiar(s):
    s = unicodedata.normalize("NFC", s or "")
    s = s.replace("\u201c", '"').replace("\u201d", '"').replace("\u2019", "'")
    return re.sub(r"\s+", " ", s).strip()


def items_pdf(path):
    """Devuelve {n: texto} leyendo las filas de las tablas de cada página."""
    out, vistos = {}, []
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            for tabla in pg.extract_tables():
                for fila in tabla:
                    c0 = limpiar(fila[0]) if fila and fila[0] else ""
                    c1 = limpiar(fila[1]) if len(fila) > 1 and fila[1] else ""
                    if c0.isdigit() and c1:
                        n, t = int(c0), c1
                    else:  # formato «12. Texto» en una sola celda
                        m = re.match(r"^(\d{1,3})[.\s]\s*(.+)$", c0)
                        if not m:
                            continue
                        n, t = int(m.group(1)), m.group(2)
                    vistos.append(n)
                    out.setdefault(n, t)
    return out, vistos


def banco_mvp():
    src = JSX.read_text(encoding="utf-8")
    m = re.search(r"const BANCO = (\{.*\});", src)
    return json.loads(m.group(1))


def norm_cmp(s):
    """Normalización «tolerante» para separar diferencias de forma de las de fondo."""
    s = limpiar(s).lower().rstrip(".")
    s = re.sub(r"[¿?¡!,;:\"']", "", s)
    return re.sub(r"\s+", " ", s)


def diff_palabras(mvp, pdf):
    a, b = mvp.split(), pdf.split()
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    partes = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        partes.append(f"«{' '.join(a[i1:i2]) or '∅'}» → «{' '.join(b[j1:j2]) or '∅'}»")
    return "; ".join(partes)


# Ítems donde la diferencia es solo un defecto de extracción del PDF, verificados visualmente
# contra la página renderizada (el MVP es el correcto). Cualquier otro caso cuenta como diferencia de fondo.
ARTEFACTOS_VERIFICADOS = {("A", 71)}  # PDF muestra «sentirme»; la extracción da «sen tirme»

REP = re.compile(r"\b((?:\w+\s+){0,5}\w+)\s+\1\b", re.I)

resultado, lineas, json_pdf = {}, [], {}
bank = banco_mvp()
for clave, (nombre, archivo, esperado) in PDFS.items():
    pdf_items, orden = items_pdf(DL / archivo)
    json_pdf[clave] = [{"n": n, "t": pdf_items[n]} for n in sorted(pdf_items)]
    mvp = {it["n"]: it["t"] for it in bank[clave]}
    sec = {"nombre": nombre, "pdf_n": len(pdf_items), "mvp_n": len(mvp), "esperado": esperado,
           "faltan_pdf": sorted(set(range(1, esperado + 1)) - set(pdf_items)),
           "faltan_mvp": sorted(set(range(1, esperado + 1)) - set(mvp)),
           "dup_pdf": sorted({n for n in orden if orden.count(n) > 1}),
           "iguales": 0, "forma": [], "fondo": [], "artefacto": [], "repeticion_mvp": []}
    for n in sorted(set(pdf_items) & set(mvp)):
        a, b = limpiar(mvp[n]), limpiar(pdf_items[n])
        if a == b:
            sec["iguales"] += 1
        elif (clave, n) in ARTEFACTOS_VERIFICADOS:
            sec["artefacto"].append((n, a, b))  # el PDF parte palabras por espaciado de letra
        elif norm_cmp(a) == norm_cmp(b):
            sec["forma"].append((n, a, b))
        else:
            sec["fondo"].append((n, a, b, diff_palabras(a, b)))
        if REP.search(a) and not REP.search(b):
            sec["repeticion_mvp"].append((n, a))
    resultado[clave] = sec

# --------------------------- informe ---------------------------
L = ["# Auditoría de ítems — MVP vs PDF oficiales", "",
     "Comparación literal del banco `BANCO` de `bateria_psicosocial_mvp.jsx` contra el texto de los PDF de la Batería "
     "(Ministerio de la Protección Social / Pontificia Universidad Javeriana).", "",
     "**Alcance:** enunciados y numeración. **No** valida la dirección de puntuación por ítem (vector `p`), porque los PDF no la contienen: "
     "eso se verifica contra el Excel oficial (ver «Pendiente»).", "",
     "## Resumen", "",
     "| Cuestionario | Ítems esperados | Leídos del PDF | En MVP | Idénticos | Dif. de forma | Dif. de fondo |",
     "|---|---|---|---|---|---|---|"]
for k, s in resultado.items():
    L.append(f"| {s['nombre']} | {s['esperado']} | {s['pdf_n']} | {s['mvp_n']} | {s['iguales']} | {len(s['forma'])} | {len(s['fondo'])} |")
L += ["", "*Dif. de fondo* = cambia el texto (palabras sobrantes, faltantes o distintas). "
      "*Dif. de forma* = solo puntuación, mayúsculas, signos o espacios.", ""]

for k, s in resultado.items():
    L += [f"## {s['nombre']}", ""]
    if s["faltan_pdf"] or s["dup_pdf"]:
        L.append(f"- ⚠️ **Extracción del PDF:** ítems no leídos {s['faltan_pdf'] or '—'}; números repetidos {s['dup_pdf'] or '—'}. Revisar a mano.")
    if s["faltan_mvp"]:
        L.append(f"- ⚠️ Ítems ausentes en el MVP: {s['faltan_mvp']}")
    if not (s["faltan_pdf"] or s["dup_pdf"] or s["faltan_mvp"]):
        L.append("- Numeración completa y consecutiva en ambas fuentes.")
    L.append("")
    if s["fondo"]:
        L += ["### Diferencias de fondo (corregir)", "", "| Ítem | MVP | PDF oficial | Cambio |", "|---|---|---|---|"]
        for n, a, b, d in s["fondo"]:
            L.append(f"| {n} | {a} | {b} | {d} |")
        L.append("")
    if s["forma"]:
        L += ["### Diferencias de forma (revisar)", "", "| Ítem | MVP | PDF oficial |", "|---|---|---|"]
        for n, a, b in s["forma"]:
            L.append(f"| {n} | {a} | {b} |")
        L.append("")
    if s["artefacto"]:
        L += ["### Falsos positivos (el MVP está bien)", "",
              "El PDF parte la palabra al extraer el texto; en el documento visual está completa.", "",
              "| Ítem | MVP | Texto extraído del PDF |", "|---|---|---|"]
        for n, a, b in s["artefacto"]:
            L.append(f"| {n} | {a} | {b} |")
        L.append("")
    if not (s["fondo"] or s["forma"] or s["artefacto"]):
        L += ["Sin diferencias.", ""]

L += ["## Decisiones que requieren criterio (no se corrigen solas)", "",
      "- **Extralaboral ítem 4:** el PDF oficial escribe «trasporto» (sin *n*), igual que el ítem 1 («trasportarme»). "
      "La RAE acepta ambas formas. Por la exigencia de fidelidad literal (Res. 2404/2019) se recomienda **conservar la grafía del PDF** "
      "y aplicarla de forma consistente en los ítems 1 y 4; el MVP hoy mezcla las dos.",
      "- **Estrés, punto final:** los 31 ítems del PDF terminan en punto; el MVP los omite. Recomendado: reproducir el punto.",
      "- **Estrés ítem 27:** el PDF trae un espacio dentro de las comillas (`\" no sirve para nada\"`), es un defecto tipográfico "
      "del original. Recomendado: normalizarlo (no altera el sentido) y dejarlo anotado.",
      "- **Estrés ítems 7, 9, 12, 23:** el MVP parafraseó («en el apetito», «Dificultades», «o desinterés», «o miedo»). "
      "Son cambios de fondo: usar el texto del PDF.", ""]
L += ["## Pendiente (no verificable con los PDF)", "",
      "1. **Dirección de puntuación por ítem** (directo/inverso, vector `p`): comparar contra el Excel oficial.",
      "2. **Baremos, factores de transformación y reglas de ítems omitidos:** el motor del MVP usa umbrales genéricos 20/40/60/80 %, no los oficiales.",
      "3. **Estrés:** el MVP suma 3-2-1-0 simple; el procedimiento oficial pondera por grupos de ítems.",
      "4. **Textos fuera de los ítems** (instrucciones, encabezados de dimensión, ejemplo): no auditados aquí.", ""]

(OUT / "AUDITORIA_ITEMS.md").write_text("\n".join(L), encoding="utf-8")
(OUT / "items_pdf_literal.json").write_text(json.dumps(json_pdf, ensure_ascii=False, indent=1), encoding="utf-8")
for k, s in resultado.items():
    print(f"{k}: pdf={s['pdf_n']} mvp={s['mvp_n']} iguales={s['iguales']} forma={len(s['forma'])} fondo={len(s['fondo'])} "
          f"faltan_pdf={s['faltan_pdf']} dup={s['dup_pdf']}")
