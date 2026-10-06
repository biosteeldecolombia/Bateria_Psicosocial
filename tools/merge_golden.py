"""Une los casos y las respuestas del oráculo (Excel) en packages/scoring/tests/fixtures/golden.json."""
import json
cases, oracle = [], []
for s in ("ForA", "ForB", "ForEx", "ForEstr"):
    cases += json.load(open(f"tmp_xl/cases_{s}.json", encoding="utf-8"))["cases"]
    oracle += json.load(open(f"tmp_xl/oracle_{s}.json", encoding="utf-8-sig"))
json.dump({"generatedBy": "tools/run_excel_oracle.ps1 sobre 'Bateria Psicosocial - PARA ENVIAR.xlsm' (RCG 08k)", "cases": cases, "oracle": oracle}, open("packages/scoring/tests/fixtures/golden.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(cases), len(oracle))
