"""Extrae la especificación de calificación (ítems, dimensiones, validez, baremos) del Excel oficial
'Bateria Psicosocial - PARA ENVIAR.xlsm' (RCG v08k) leyendo sus fórmulas. Salida: packages/scoring/src/spec.json
Uso: python tools/extract_scoring_spec.py "<ruta al .xlsm>"
"""
import json, re, sys, hashlib, openpyxl, warnings
warnings.filterwarnings("ignore")
path = sys.argv[1]
wb = openpyxl.load_workbook(path, keep_vba=True, data_only=False)
sha = hashlib.sha256(open(path, "rb").read()).hexdigest()
col = openpyxl.utils.column_index_from_string
cell = lambda ws, a: ws[a].value
num = lambda v: float(v) if isinstance(v, (int, float)) else None

def table(ws, c_item, c_first, n_opts, rows, n_items, label):
    """Tabla de puntajes por ítem y opción de Ptajes. Se busca por número de ítem (el libro usa VLOOKUP; hay filas separadoras)."""
    out = {}
    for r in range(rows[0], 140):
        item = ws.cell(r, col(c_item)).value
        if item is None or isinstance(item, str) and not item.strip().isdigit():
            continue
        item = int(item)
        sc = [ws.cell(r, col(c_first) + k).value for k in range(n_opts)]
        assert all(isinstance(x, (int, float)) for x in sc), (label, r, sc)
        assert item not in out, (label, "ítem repetido", item)
        out[item] = {"n": item, "scores": [float(x) for x in sc]}
    assert sorted(out) == list(range(1, n_items + 1)), (label, "faltan ítems", sorted(set(range(1, n_items + 1)) - set(out)))
    return [out[i] for i in sorted(out)]

P = wb["Ptajes"]
itemsA = table(P, "B", "D", 5, (4,), 123, "A")
itemsB = table(P, "J", "L", 5, (4,), 97, "B")
itemsEx = table(P, "R", "T", 5, (4,), 31, "EX")
itemsEs = table(P, "Z", "AB", 4, (4,), 31, "ES")

def rows_to_items(ws, expr):
    """'SUM(U68:U80)', 'SUM(U24,U27:U31)' -> números de ítem usando la columna S (índice) de la hoja."""
    out = []
    for a, b in re.findall(r"U(\d+)(?::U(\d+))?", expr):
        for r in range(int(a), int(b or a) + 1):
            s = ws.cell(r, col("S")).value
            assert isinstance(s, (int, float)), (ws.title, r, s)
            out.append(int(s))
    return out

def intra(ws, label):
    rows, byrow = [], {}
    for r in range(131, 155):
        kind = cell(ws, f"AB{r}")
        cid, name = cell(ws, f"AC{r}"), cell(ws, f"AD{r}")
        ae = str(cell(ws, f"AE{r}"))
        if cid is None: continue
        if ae == "No aplica": continue
        thr = [num(cell(ws, f"{c}{r}")) for c in ("AM", "AN", "AO", "AP", "AQ")]
        is_total = cid == "TOTAL"
        kind = "total" if is_total else ("domain" if kind == "DOMINIO" else "dimension")
        row = {"id": cid, "name": name, "kind": kind, "thresholds": thr}
        if kind == "dimension":
            row["items"] = rows_to_items(ws, ae)
            af = str(cell(ws, f"AF{r}")); ae_all = ae
            # A: AF=IF(AG>=AH-1,1,0) | B: AE=IF(AF<AH-1,"invalido",...)
            row["maxMissing"] = 1 if ("AH%d-1" % r) in af.replace(" ", "") or ("AH%d-1" % r) in ae_all.replace(" ", "") else 0
            assert len(row["items"]) == int(cell(ws, f"AH{r}")), (label, cid)
        elif kind == "domain":
            row["parts"] = [byrow[int(x)] for x in sorted({int(x) for x in re.findall(r"AE(\d+)", ae)}) if int(x) in byrow]
        else:
            row["parts"] = [byrow[int(x)] for x in sorted({int(x) for x in re.findall(r"AE(\d+)", ae)}) if int(x) in byrow]
        byrow[r] = cid
        rows.append(row)
    return rows

FA, FB = wb["ForA"], wb["ForB"]
rowsA, rowsB = intra(FA, "A"), intra(FB, "B")

# --- Extralaboral
FE = wb["ForEx"]
exrows, byrow = [], {}
for r in range(37, 45):
    cid, name = cell(FE, f"AC{r}"), cell(FE, f"AD{r}")
    thr12 = [num(cell(FE, f"{c}{r}")) for c in ("AN", "AO", "AP", "AQ", "AR")]
    thr34 = [num(cell(FE, f"{c}{r}")) for c in ("AT", "AU", "AV", "AW", "AX")]
    if cid == "TOTAL":
        exrows.append({"id": cid, "name": name, "kind": "total", "parts": list(byrow.values()), "thresholds": {"12": thr12, "34": thr34}})
    else:
        ae, ah = str(cell(FE, f"AE{r}")), str(cell(FE, f"AH{r}"))
        exrows.append({"id": cid, "name": name, "kind": "dimension", "items": rows_to_items(FE, ae), "maxMissing": 1 if "AI%d-1" % r in ah.replace(" ", "") else 0, "thresholds": {"12": thr12, "34": thr34}})
    byrow[r] = cid

# --- Estrés
ES = wb["ForEstr"]
groups = []
for r, lab in ((37, "A"), (38, "B"), (39, "C"), (40, "D")):
    f = str(cell(ES, f"Y{r}"))
    m = re.search(r"U(\d+):U(\d+)", f); w = re.search(r"\)\*(\d+)", f)
    items = rows_to_items(ES, f"U{m.group(1)}:U{m.group(2)}")
    groups.append({"id": lab, "items": items, "weight": int(w.group(1)) if w else 1})
assert str(cell(ES, "Y42")).replace(" ", "") == '=IF(AA37<31,"Invalido",ROUND(Y41*100/61.16,1))'
stress_thr = {"12": [num(cell(ES, f"{c}40")) for c in ("AD", "AE", "AF", "AG", "AH")], "34": [num(cell(ES, f"{c}41")) for c in ("AD", "AE", "AF", "AG", "AH")]}

# --- Total intra+extra (Tabla 34)
tot = {"A": {"divisor": 616, "thresholds": [num(cell(P, f"{c}14")) for c in ("BJ", "BK", "BL", "BM", "BN")]},
       "B": {"divisor": 512, "thresholds": [num(cell(P, f"{c}15")) for c in ("BJ", "BK", "BL", "BM", "BN")]}}

# --- Compuertas Sí/No (ForA E192 clientes, E216 jefe; ForB: clientes)
spec = {
    "source": {"file": "Bateria Psicosocial - PARA ENVIAR.xlsm", "sha256": sha, "version": "RCG Version 08k (ajuste de baremos Ene/2011)"},
    "levels": {"intra": ["Sin riesgo o riesgo despreciable", "Riesgo bajo", "Riesgo medio", "Riesgo alto", "Riesgo muy alto"], "stress": ["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"]},
    "intraA": {"items": itemsA, "gates": {"clients": [106, 114], "boss": [115, 123]}, "rows": rowsA},
    "intraB": {"items": itemsB, "gates": {"clients": [89, 97]}, "rows": rowsB},
    "extra": {"items": itemsEx, "rows": exrows},
    "stress": {"items": itemsEs, "groups": groups, "divisor": 61.16, "thresholds": stress_thr},
    "total": tot,
}
json.dump(spec, open("packages/scoring/src/spec.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("OK", len(rowsA), len(rowsB), len(exrows), [(g["id"], len(g["items"]), g["weight"]) for g in groups])
