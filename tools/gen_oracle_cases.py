"""Genera casos aleatorios (semilla fija) con las celdas de entrada/salida de cada hoja del Excel oficial.
Salida: tmp_xl/cases.json -> lo consume tools/run_excel_oracle.ps1 -> tmp_xl/oracle.json -> packages/scoring/tests/fixtures/golden.json
"""
import json, random, re
random.seed(20261005)
def load(f):
    d = {}
    for line in open(f"tmp_xl/{f}.txt", encoding="utf-8"):
        p = line.rstrip("\n").split("\t"); d[p[0]] = p[1] if len(p) > 1 else ""
    return d
def item_cells(D):
    out = {}
    for k, v in D.items():
        m = re.fullmatch(r"B(\d+)", k)
        if m and v.isdigit() and ("F" + m.group(1)) in D: out[int(v)] = "E" + m.group(1)
    return out
SHEETS = {
    "ForA": dict(n=123, nopt=5, gates={"clients": ("E192", (106, 114)), "boss": ("E216", (115, 123))}, read=[f"{c}{r}" for r in range(131, 155) for c in ("AE", "AJ", "AK")]),
    "ForB": dict(n=97, nopt=5, gates={"clients": ("E186", (89, 97))}, read=[f"{c}{r}" for r in range(131, 155) for c in ("AE", "AJ", "AK")]),
    "ForEx": dict(n=31, nopt=5, read=[f"{c}{r}" for r in range(37, 45) for c in ("AF", "AK", "AM", "AS")]),  # AM = nivel con Tabla 17 (cargos 1-2), AS = nivel con Tabla 18 (cargos 3-4)
    "ForEstr": dict(n=31, nopt=4, read=["Y41", "Y42", "AI40", "AI41", "AA37"]),  # AI40 = nivel cargos 1-2, AI41 = cargos 3-4
}
cases = []
for sheet, cfg in SHEETS.items():
    cells = item_cells(load(sheet)); assert len(cells) == cfg["n"], (sheet, len(cells))
    cfg["cells"] = {str(k): v for k, v in sorted(cells.items())}
    N = 350
    for i in range(N):
        profile = random.choice(["uniform", "low", "high", "mid", "const"])
        const = random.randrange(cfg["nopt"])
        def draw():
            if profile == "uniform": return random.randrange(cfg["nopt"])
            if profile == "low": return min(cfg["nopt"] - 1, int(random.random() ** 2 * cfg["nopt"]))
            if profile == "high": return cfg["nopt"] - 1 - min(cfg["nopt"] - 1, int(random.random() ** 2 * cfg["nopt"]))
            if profile == "mid": return max(0, min(cfg["nopt"] - 1, round(random.gauss((cfg["nopt"] - 1) / 2, 0.8))))
            return const
        gates = {}
        for g, (cell, (a, b)) in (cfg.get("gates") or {}).items(): gates[g] = random.random() < 0.6
        ans = {}
        # ítems sin responder: 0 (60%), 1-3 (30%), muchos (10%)
        r = random.random(); nmiss = 0 if r < 0.55 else random.randint(1, 3) if r < 0.9 else random.randint(4, 25)
        missing = set(random.sample(range(1, cfg["n"] + 1), min(nmiss, cfg["n"])))
        for n in range(1, cfg["n"] + 1):
            ans[n] = None if n in missing else draw()
        # los ítems tras una compuerta «No» se envían sin responder (como hará la aplicación web)
        for g, (cell, (a, b)) in (cfg.get("gates") or {}).items():
            if not gates[g]:
                for n in range(a, b + 1): ans[n] = None
        case = {"sheet": sheet, "idx": i, "answers": ans, "gates": gates, "cargo": random.randint(1, 4)}
        cases.append(case)
json.dump({"sheets": {k: {"cells": v["cells"], "gates": {g: c for g, (c, _) in (v.get("gates") or {}).items()}, "read": v["read"]} for k, v in SHEETS.items()}, "cases": cases}, open("tmp_xl/cases.json", "w", encoding="utf-8"), ensure_ascii=False)
print(len(cases), "casos")

for sh in SHEETS:
    json.dump({"sheets": {sh: {"cells": SHEETS[sh]["cells"], "gates": {g: c for g, (c, _) in (SHEETS[sh].get("gates") or {}).items()}, "read": SHEETS[sh]["read"]}}, "cases": [c for c in cases if c["sheet"] == sh]}, open(f"tmp_xl/cases_{sh}.json", "w", encoding="utf-8"), ensure_ascii=False)
