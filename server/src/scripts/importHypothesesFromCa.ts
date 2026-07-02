/**
 * Импорт гипотез (LCM) из «Шаблон ЦА-Проблема-Решение.xlsx»
 * Колонки: B — уровень зрелости, C — сегмент (ЦА), E/D — проблематика, G/F — гипотеза
 * Решения при импорте не заполняются — только проблематики
 * Вид деятельности — название листа (M:N, одна гипотеза может быть на нескольких листах)
 */
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { initDB, db } from '../db';
import { ensureActivityType, syncHypothesisActivityTypes } from '../activityTypes';
import { saveHypothesis } from '../hypotheses';

const ROOT = path.join(process.cwd(), '..');
const FILE = path.join(ROOT, 'Шаблон ЦА-Проблема-Решение.xlsx');

const SKIP_SHEETS = new Set(['архив', 'Свод', 'свод', 'Инструкция', 'Лист1']);
const HEADER_LABELS = /^(проблематика|сегмент|уровень зрелости|должность)$/i;

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

interface SheetColumns {
  maturityCol: number;
  segmentCol: number;
  problemCol: number;
  hypothesisCol: number;
}

interface ParsedBlock {
  name: string;
  maturity: string;
  targetAudience: string;
  problems: string[];
  activityType: string;
}

function findSheetColumns(row: unknown[]): SheetColumns | null {
  let maturityCol = -1;
  let segmentCol = -1;
  let problemCol = -1;
  let hypothesisCol = -1;
  for (let j = 0; j < row.length; j++) {
    const cell = cellStr(row[j]).toLowerCase();
    if (/зрелост/.test(cell)) maturityCol = j;
    if (cell === 'сегмент') segmentCol = j;
    if (cell === 'проблематика') problemCol = j;
    if (/гипотез/.test(cell)) hypothesisCol = j;
  }
  if (problemCol < 0) {
    for (let j = 0; j < row.length; j++) {
      if (/проблем/.test(cellStr(row[j]).toLowerCase())) {
        problemCol = j;
        break;
      }
    }
  }
  if (problemCol < 0 || hypothesisCol < 0) return null;
  return { maturityCol, segmentCol, problemCol, hypothesisCol };
}

function findHeaderRowAndColumns(rows: unknown[][]): { headerIdx: number; cols: SheetColumns } | null {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const cols = findSheetColumns(rows[i] ?? []);
    if (cols) return { headerIdx: i, cols };
  }
  return null;
}

function resolveMaturityId(name: string): number | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  db.prepare(`INSERT OR IGNORE INTO maturity_levels(name) VALUES (?)`).run(trimmed);
  const row = db.prepare(`SELECT id FROM maturity_levels WHERE name=?`).get(trimmed) as { id: number } | undefined;
  return row?.id ?? null;
}

function parseSheetBlocks(ws: XLSX.WorkSheet, sheetName: string): ParsedBlock[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  const header = findHeaderRowAndColumns(rows);
  if (!header) return [];

  const { headerIdx, cols } = header;
  const sheetCa = cellStr(rows[0]?.[1]);
  let currentMaturity = '';
  let currentSegment = '';
  let current: ParsedBlock | null = null;
  const blocks: ParsedBlock[] = [];

  function flush() {
    if (current && current.problems.length > 0) blocks.push(current);
    current = null;
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const mat = cols.maturityCol >= 0 ? cellStr(row[cols.maturityCol]) : '';
    const seg = cols.segmentCol >= 0 ? cellStr(row[cols.segmentCol]) : '';
    const problem = cellStr(row[cols.problemCol]);
    const hypothesisName = cellStr(row[cols.hypothesisCol]);

    if (mat) currentMaturity = mat;
    if (seg) currentSegment = seg;

    if (hypothesisName) {
      flush();
      const ca = seg || currentSegment || sheetCa;
      current = {
        name: hypothesisName,
        maturity: mat || currentMaturity,
        targetAudience: ca,
        problems: [],
        activityType: sheetName,
      };
      if (problem && !HEADER_LABELS.test(problem)) {
        current.problems.push(problem);
      }
      continue;
    }

    if (problem && !HEADER_LABELS.test(problem) && current) {
      current.problems.push(problem);
    }
  }
  flush();
  return blocks;
}

function mergeBlocks(all: ParsedBlock[]): Map<string, {
  name: string;
  maturity: string;
  targetAudience: string;
  problems: Set<string>;
  activityTypes: Set<string>;
}> {
  const map = new Map<string, {
    name: string;
    maturity: string;
    targetAudience: string;
    problems: Set<string>;
    activityTypes: Set<string>;
  }>();

  for (const b of all) {
    const key = b.name.trim();
    if (!key) continue;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        name: key,
        maturity: b.maturity,
        targetAudience: b.targetAudience,
        problems: new Set(),
        activityTypes: new Set(),
      };
      map.set(key, entry);
    }
    entry.activityTypes.add(b.activityType);
    for (const p of b.problems) entry.problems.add(p);
    if (!entry.targetAudience && b.targetAudience) entry.targetAudience = b.targetAudience;
    if (!entry.maturity && b.maturity) entry.maturity = b.maturity;
  }
  return map;
}

function upsertHypothesis(entry: {
  name: string;
  maturity: string;
  targetAudience: string;
  problems: Set<string>;
  activityTypes: Set<string>;
}): 'created' | 'updated' {
  const maturityId = resolveMaturityId(entry.maturity);
  const activityTypeIds = [...entry.activityTypes].map(n => ensureActivityType(n).id);

  const existing = db.prepare(`SELECT id FROM hypotheses WHERE name=?`).get(entry.name) as { id: number } | undefined;

  const problemsPayload = [...entry.problems].map(name => ({ name }));

  if (existing) {
    saveHypothesis(existing.id, {
      name: entry.name,
      target_audience: entry.targetAudience || null,
      maturity_id: maturityId,
      activity_type_ids: activityTypeIds,
      problems: problemsPayload,
    });
    return 'updated';
  }

  const result = db.prepare(`
    INSERT INTO hypotheses(name, target_audience, maturity_id) VALUES (?,?,?)
  `).run(entry.name, entry.targetAudience || null, maturityId);
  const id = Number(result.lastInsertRowid);
  syncHypothesisActivityTypes(id, activityTypeIds);
  saveHypothesis(id, {
    name: entry.name,
    target_audience: entry.targetAudience || null,
    maturity_id: maturityId,
    activity_type_ids: activityTypeIds,
    problems: problemsPayload,
  });
  return 'created';
}

function main() {
  initDB();
  if (!fs.existsSync(FILE)) {
    console.error(`Файл не найден: ${FILE}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(FILE);
  const allBlocks: ParsedBlock[] = [];
  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.has(sheetName)) continue;
    const blocks = parseSheetBlocks(wb.Sheets[sheetName], sheetName);
    const problemCount = blocks.reduce((n, b) => n + b.problems.length, 0);
    console.log(`  ${sheetName}: ${blocks.length} блоков гипотез, ${problemCount} проблем`);
    allBlocks.push(...blocks);
  }

  const merged = mergeBlocks(allBlocks);
  let created = 0;
  let updated = 0;
  for (const entry of merged.values()) {
    const r = upsertHypothesis(entry);
    if (r === 'created') created++;
    else updated++;
  }

  console.log(`\n✓ Импорт гипотез: ${merged.size} уникальных, создано ${created}, обновлено ${updated}`);
}

main();
