# -*- coding: utf-8 -*-
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "scripts/methodology_dump.json").read_text(encoding="utf-8"))

MAIN_SHEETS = [
    "параметры расчета",
    "2.ФС для Заполнения",
    "Оценка свод КейсПроф + очереди",
    "Очередь 1 ПРОФ_КОРП",
    "Очередь 1 Кейс-Совм",
    "ПК Кейс Шаблон",
    "ПК Совместный Запуск Шаблон",
    "1.Содержание проекта",
]

def fmt_row(row):
    cells = {c["col"]: c for c in row["cells"]}
    parts = [f"R{row['row']}"]
    for col in sorted(cells.keys()):
        c = cells[col]
        v = c.get("value")
        comp = c.get("computed")
        f = c.get("formula")
        if f:
            parts.append(f"{c['addr']}: {f}" + (f" => {comp}" if comp is not None else ""))
        else:
            disp = v if v is not None else comp
            if disp is not None and disp != "":
                parts.append(f"{c['addr']}: {disp}")
    return " | ".join(parts)

out_lines = []
out_lines.append("# EXTRACT SUMMARY\n")

for name in MAIN_SHEETS:
    d = data["sheet_analysis"].get(name)
    if not d:
        out_lines.append(f"\n## {name} — NOT FOUND\n")
        continue
    out_lines.append(f"\n## {name}\n")
    if d.get("header_rows_1_25"):
        out_lines.append("### Header 1-25\n")
        for row in d["header_rows_1_25"]:
            out_lines.append(fmt_row(row))
    if d.get("params_rows_27_68"):
        out_lines.append("\n### Params 27-68\n")
        for row in d["params_rows_27_68"]:
            out_lines.append(fmt_row(row))
    if d.get("phases_rows_73_90"):
        out_lines.append("\n### Phases 73-90\n")
        for row in d["phases_rows_73_90"]:
            out_lines.append(fmt_row(row))

(ROOT / "scripts/methodology_summary.txt").write_text("\n".join(out_lines), encoding="utf-8")
print("done", len(out_lines), "lines")
