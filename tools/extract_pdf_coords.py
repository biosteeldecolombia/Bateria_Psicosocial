"""Mapa de coordenadas de las casillas de respuesta en las plantillas PDF oficiales.
Salida: server/assets/pdf-templates/coords.json  {plantilla: {ítem: {page, y, xs[]}}}  (puntos PDF, origen arriba-izquierda, páginas desde 1)
Las columnas de opciones varían un poco entre páginas/tablas, por eso se miden en la línea horizontal que encabeza cada fila.
"""
import json, re, sys
import pdfplumber
T = {"intra_A": ("intralaboral_A", 123, 5), "intra_B": ("intralaboral_B", 97, 5), "extra": ("extralaboral", 31, 5), "stress": ("estres", 31, 4)}
out, problems = {}, []
for key, (fname, n_items, n_opts) in T.items():
    res = {}
    with pdfplumber.open(f"server/assets/pdf-templates/{fname}.pdf") as pdf:
        for pi, p in enumerate(pdf.pages, 1):
            # los números de ítem: texto numérico aislado en la primera columna (a veces seguido de un punto en Estrés)
            cand = []
            for w in p.extract_words():
                m = re.fullmatch(r"(\d{1,3})\.?", w["text"])
                if not m: continue
                n = int(m.group(1))
                if not (1 <= n <= n_items): continue
                if key == "stress":
                    if w["x0"] > 120: continue
                elif not (45 < w["x0"] < 80): continue
                cand.append((n, w))
            hsegs = [r for r in p.rects if r["height"] < 1.0 and r["width"] > 20]
            for n, w in cand:
                if n in res: continue  # primera aparición (las páginas de portada no contienen ítems válidos)
                yc = (w["top"] + w["bottom"]) / 2
                above = [r for r in hsegs if r["top"] < yc and yc - r["top"] < 45]
                if not above: problems.append((key, n, pi, "sin borde superior")); continue
                top = max(r["top"] for r in above)
                row = [r for r in above if abs(r["top"] - top) < 1.0]
                xs = sorted({round((r["x0"] + r["x1"]) / 2, 1) for r in row})
                opts = xs[-n_opts:]
                res[n] = {"page": pi, "y": round(yc, 1), "xs": opts}
    # Filas con segmentos de borde partidos: se usa la fila válida más cercana de la misma página (misma tabla = mismas columnas)
    ok = lambda v: len(v["xs"]) == n_opts and all(30 <= b - a <= 70 for a, b in zip(v["xs"], v["xs"][1:]))
    for n in sorted(res):
        if ok(res[n]): continue
        near = sorted([m for m in res if m != n and res[m]["page"] == res[n]["page"] and ok(res[m])], key=lambda m: abs(m - n))
        if near: res[n]["xs"] = res[near[0]]["xs"]; res[n]["fixedFrom"] = near[0]
        else: problems.append((key, n, "sin fila vecina válida"))
    missing = [n for n in range(1, n_items + 1) if n not in res]
    bad = [n for n, v in res.items() if not ok(v)]
    if missing: problems.append((key, "faltan", missing))
    if bad: problems.append((key, "columnas dudosas", bad))
    out[key] = {str(k): res[k] for k in sorted(res)}
    print(key, len(res), "ítems")
json.dump(out, open("server/assets/pdf-templates/coords.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("PROBLEMAS:", problems[:20])

# ---- Encabezado (fecha de aplicación dd/mm/aaaa y N.º de identificación) y casillas Sí/No de las compuertas ----
coords = json.load(open("server/assets/pdf-templates/coords.json", encoding="utf-8"))
HEADERS = {"intra_A": "intralaboral_A", "intra_B": "intralaboral_B", "extra": "extralaboral", "stress": "estres", "ficha": "ficha"}
coords["header"] = {}
for key, fname in HEADERS.items():
    with pdfplumber.open(f"server/assets/pdf-templates/{fname}.pdf") as pdf:
        p = pdf.pages[0]
        W = {w["text"]: w for w in p.extract_words()}
        dd, mm, aaaa = W.get("dd"), W.get("mm"), W.get("aaaa")
        idw = W.get("(ID):")
        if not (dd and mm and aaaa and idw):
            coords["header"][key] = None; print("header no encontrado en", fname); continue
        cx = lambda w: round((w["x0"] + w["x1"]) / 2, 1)
        coords["header"][key] = {"page": 1, "dateY": round(dd["top"] - 5, 1), "ddX": cx(dd), "mmX": cx(mm), "aaaaX": cx(aaaa), "idX": round(idw["x1"] + 17, 1), "idY": round(idw["top"] + 2, 1)}
coords["gates"] = {}
for key, fname, specs in (("intra_A", "intralaboral_A", {"clients": 11, "boss": 12}), ("intra_B", "intralaboral_B", {"clients": 11})):
    coords["gates"][key] = {}
    with pdfplumber.open(f"server/assets/pdf-templates/{fname}.pdf") as pdf:
        for gate, pg in specs.items():
            p = pdf.pages[pg - 1]
            ws = [w for w in p.extract_words() if 140 < w["top"] < 260]
            si = next(w for w in ws if w["text"] == "Si")      # primera aparición = la tablita Sí/No (la de la derecha de la pregunta)
            no = next(w for w in ws if w["text"] == "No")
            coords["gates"][key][gate] = {"page": pg, "x": round(si["x0"] + 40.3, 1), "ySi": round((si["top"] + si["bottom"]) / 2, 1), "yNo": round((no["top"] + no["bottom"]) / 2, 1)}
json.dump(coords, open("server/assets/pdf-templates/coords.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("header:", {k: bool(v) for k, v in coords["header"].items()}, "gates:", coords["gates"])
