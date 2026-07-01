/**
 * Импорт справочников предоценки из трёх xlsx в корне проекта.
 * Запуск: npm run import:briefing-data (из server/)
 */
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { initDB, db } from '../db';
import { normalizeFsPrefix } from '../fsPrefix';
import { extractWidgetImageMap, copyWidgetImages, imagePathForWidgetRow } from './xlsxImages';

const ROOT = path.join(process.cwd(), '..');

const FILES = {
  caProblem: path.join(ROOT, 'Шаблон ЦА-Проблема-Решение.xlsx'),
  fsCatalog: path.join(ROOT, 'Копия ФС Lite и ПК для предварительной оценки заказного проекта.xlsx'),
  widgets: path.join(ROOT, 'Анкета для определения приоритетных бизнес показателей для сайта.xlsx'),
};

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function findSheet(wb: XLSX.WorkBook, ...names: string[]): XLSX.WorkSheet | null {
  for (const n of names) {
    if (wb.SheetNames.includes(n)) return wb.Sheets[n];
  }
  return null;
}

const HEADER_LABELS = /^(проблематика|сегмент|уровень зрелости|должность)$/i;

interface ProblemRow {
  maturity: string;
  segment: string;
  problem: string;
}

function findHeaderColumns(row: unknown[]): { maturityCol: number; segmentCol: number; problemCol: number } | null {
  let maturityCol = -1;
  let segmentCol = -1;
  let problemCol = -1;
  for (let j = 0; j < row.length; j++) {
    const cell = cellStr(row[j]).toLowerCase();
    if (/зрелост/.test(cell)) maturityCol = j;
    if (cell === 'сегмент') segmentCol = j;
    if (cell === 'проблематика') problemCol = j;
  }
  if (problemCol < 0) {
    for (let j = 0; j < row.length; j++) {
      if (/проблем/.test(cellStr(row[j]).toLowerCase())) {
        problemCol = j;
        break;
      }
    }
  }
  if (problemCol < 0) return null;
  return { maturityCol, segmentCol, problemCol };
}

function parseIndustryProblemRows(ws: XLSX.WorkSheet): ProblemRow[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  let headerIdx = -1;
  let cols: { maturityCol: number; segmentCol: number; problemCol: number } | null = null;

  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const found = findHeaderColumns(rows[i] ?? []);
    if (found) {
      headerIdx = i;
      cols = found;
      break;
    }
  }
  if (headerIdx < 0 || !cols) return [];

  const result: ProblemRow[] = [];
  let currentMaturity = '';
  let currentSegment = '';

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const matName = cols.maturityCol >= 0 ? cellStr(row[cols.maturityCol]) : '';
    const segName = cols.segmentCol >= 0 ? cellStr(row[cols.segmentCol]) : '';
    const probName = cellStr(row[cols.problemCol]);

    if (matName) currentMaturity = matName;
    if (segName) currentSegment = segName;
    if (!probName || HEADER_LABELS.test(probName)) continue;

    result.push({
      maturity: currentMaturity,
      segment: currentSegment,
      problem: probName,
    });
  }
  return result;
}

function parseArchiveRows(ws: XLSX.WorkSheet): { problem: string; solution: string; hypothesis: string }[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  let headerIdx = -1;
  let problemCol = -1;
  let solutionCol = -1;
  let hypothesisCol = -1;

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i] ?? [];
    for (let j = 0; j < row.length; j++) {
      const cell = cellStr(row[j]).toLowerCase();
      if (cell === 'проблематика') problemCol = j;
      if (cell === 'решение') solutionCol = j;
      if (/гипотез/.test(cell)) hypothesisCol = j;
    }
    if (problemCol < 0) {
      for (let j = 0; j < row.length; j++) {
        if (/проблем/.test(cellStr(row[j]).toLowerCase())) problemCol = j;
      }
    }
    if (problemCol >= 0 && solutionCol >= 0) {
      headerIdx = i;
      break;
    }
    problemCol = -1;
    solutionCol = -1;
    hypothesisCol = -1;
  }
  if (headerIdx < 0 || problemCol < 0 || solutionCol < 0) return [];

  const result: { problem: string; solution: string; hypothesis: string }[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const problem = cellStr(row[problemCol]);
    const solution = cellStr(row[solutionCol]);
    const hypothesis = hypothesisCol >= 0 ? cellStr(row[hypothesisCol]) : '';
    if (!problem || !solution || HEADER_LABELS.test(problem)) continue;
    result.push({ problem, solution, hypothesis });
  }
  return result;
}

function clearSolutionCatalog() {
  db.prepare(`DELETE FROM briefing_widget_sel`).run();
  db.prepare(`DELETE FROM briefing_solution_sel`).run();
  db.prepare(`DELETE FROM briefing_problem_sel`).run();
  db.prepare(`DELETE FROM solution_widget_map`).run();
  db.prepare(`DELETE FROM solution_fs_map`).run();
  db.prepare(`DELETE FROM widget_fs_map`).run();
  db.prepare(`DELETE FROM problem_solution_map`).run();
  db.prepare(`DELETE FROM solutions`).run();
}

function importIndustriesProblems(wb: XLSX.WorkBook) {
  const skipSheets = new Set(['архив', 'Свод', 'свод', 'Инструкция', 'Лист1']);

  clearSolutionCatalog();
  db.prepare(`DELETE FROM problems`).run();
  db.prepare(`DELETE FROM industry_segment_map`).run();
  db.prepare(`DELETE FROM segments`).run();
  db.prepare(`DELETE FROM maturity_levels`).run();

  const insIndustry = db.prepare(`INSERT OR IGNORE INTO industries(name, sheet_name) VALUES (?,?)`);
  const getIndustry = db.prepare(`SELECT id FROM industries WHERE name=? OR sheet_name=?`);
  const insSegment = db.prepare(`INSERT OR IGNORE INTO segments(name) VALUES (?)`);
  const getSegment = db.prepare(`SELECT id FROM segments WHERE name=?`);
  const insMap = db.prepare(`INSERT OR IGNORE INTO industry_segment_map(industry_id, segment_id) VALUES (?,?)`);
  const insMaturity = db.prepare(`INSERT OR IGNORE INTO maturity_levels(name) VALUES (?)`);
  const getMaturity = db.prepare(`SELECT id FROM maturity_levels WHERE name=?`);
  const insProblem = db.prepare(`INSERT INTO problems(name, industry_id, segment_id, maturity_id) VALUES (?,?,?,?)`);
  const insSolution = db.prepare(`INSERT OR IGNORE INTO solutions(name, description, hypothesis) VALUES (?,?,?)`);
  const getSolution = db.prepare(`SELECT id FROM solutions WHERE name=?`);

  let problemCount = 0;

  for (const sheetName of wb.SheetNames) {
    if (skipSheets.has(sheetName)) continue;
    const ws = wb.Sheets[sheetName];
    const parsed = parseIndustryProblemRows(ws);
    if (parsed.length === 0) continue;

    insIndustry.run(sheetName, sheetName);
    const industry = getIndustry.get(sheetName, sheetName) as { id: number };

    const segmentsSeen = new Set<string>();
    for (const { maturity, segment, problem } of parsed) {
      if (segment && !segmentsSeen.has(segment)) {
        insSegment.run(segment);
        const seg = getSegment.get(segment) as { id: number };
        insMap.run(industry.id, seg.id);
        segmentsSeen.add(segment);
      }

      let segmentId: number | null = null;
      if (segment) {
        const seg = getSegment.get(segment) as { id: number } | undefined;
        segmentId = seg?.id ?? null;
      }
      let maturityId: number | null = null;
      if (maturity) {
        insMaturity.run(maturity);
        const mat = getMaturity.get(maturity) as { id: number };
        maturityId = mat.id;
      }

      const exists = db.prepare(`SELECT id FROM problems WHERE name=? AND industry_id=?`).get(problem, industry.id);
      if (!exists) {
        insProblem.run(problem, industry.id, segmentId, maturityId);
        problemCount++;
      }
    }
  }
  console.log(`  Проблематики: ${problemCount} записей`);

  const archive = findSheet(wb, 'архив', 'Архив');
  if (archive) {
    const parsed = parseArchiveRows(archive);
    const insLink = db.prepare(`INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id) VALUES (?,?)`);
    let linkCount = 0;

    for (const { problem, solution, hypothesis } of parsed) {
      insSolution.run(solution, '', hypothesis || null);
      const sol = getSolution.get(solution) as { id: number };
      const prob = db.prepare(`SELECT id FROM problems WHERE name=? LIMIT 1`).get(problem) as { id: number } | undefined;
      if (prob && sol) {
        insLink.run(prob.id, sol.id);
        linkCount++;
      }
    }
    console.log(`  Архив: ${linkCount} связей проблема→решение`);
  }
}

function importFsCatalog(wb: XLSX.WorkBook) {
  const ws = findSheet(wb, '2.ФС для Заполнения', 'ФС для Заполнения');
  if (!ws) { console.warn('  Лист ФС не найден'); return; }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  const insFs = db.prepare(`
    INSERT INTO fs_catalog(code, prefix, name, group_name, group_prefix, description, item_type, func_type, parent_id, sort_order, phase, queue, default_queues_json, story_points, requires_nmd)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  db.prepare(`DELETE FROM briefing_fs_sel`).run();
  db.prepare(`DELETE FROM fs_industry_blocks`).run();
  db.prepare(`DELETE FROM solution_fs_map`).run();
  db.prepare(`DELETE FROM widget_fs_map`).run();
  db.prepare(`DELETE FROM fs_catalog`).run();

  let currentGroup = '';
  let currentGroupPrefix: string | null = null;
  let lastItemId: number | null = null;
  let sortOrder = 0;
  let count = 0;

  const startRow = rows.findIndex((r, i) => i >= 8 && cellStr(r?.[0]) === '№ п.п') + 1;
  const from = startRow > 0 ? startRow : 9;

  for (let i = from; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rawPrefix = cellStr(row[0]);
    const prefix = normalizeFsPrefix(rawPrefix);
    const name = cellStr(row[1]);
    const desc = cellStr(row[2]);
    const funcTypeRaw = cellStr(row[5]);
    const funcTypeUpper = funcTypeRaw.toUpperCase();
    if (!name && !desc) continue;

    const q1 = Number(row[14]) || 0;
    const q2 = Number(row[17]) || 0;
    const q3 = Number(row[20]) || 0;
    const q4 = Number(row[23]) || 0;
    const sp = Number(row[12]) || Number(row[13]) || 0;
    const requiresNmd = cellStr(row[95]) || null;
    const defaultQueues = JSON.stringify({
      '1': q1 > 0 ? 1 : 0,
      '2': q2 > 0 ? 1 : 0,
      '3': q3 > 0 ? 1 : 0,
      '4': q4 > 0 ? 1 : 0,
    });
    const primaryQueue = q1 > 0 ? '1' : q2 > 0 ? '2' : q3 > 0 ? '3' : q4 > 0 ? '4' : '1';

    if (funcTypeUpper === 'ГРУППА') {
      currentGroup = name;
      currentGroupPrefix = normalizeFsPrefix(rawPrefix);
      lastItemId = null;
      continue;
    }

    if (prefix && name) {
      const result = insFs.run(
        null, prefix, name, currentGroup || null, currentGroupPrefix, null, 'item', funcTypeRaw || null, null, sortOrder++,
        currentGroup, primaryQueue, defaultQueues, sp, requiresNmd,
      );
      lastItemId = Number(result.lastInsertRowid);
      count++;
    } else if (name && lastItemId) {
      insFs.run(
        null, null, name, currentGroup || null, currentGroupPrefix, desc || null, 'detail', null, lastItemId, sortOrder++,
        currentGroup, primaryQueue, '{}', 0, null,
      );
      count++;
    }
  }
  console.log(`  ФС каталог: ${count} пунктов`);

  const phasesWs = findSheet(wb, 'Оценка свод КейсПроф + очереди', 'очереди');
  if (phasesWs) {
    const phaseRows = XLSX.utils.sheet_to_json<unknown[]>(phasesWs, { header: 1, defval: '' }) as unknown[][];
    const insPhase = db.prepare(`INSERT OR IGNORE INTO fs_phases(name, sort_order) VALUES (?,?)`);
    db.prepare(`DELETE FROM fs_phases`).run();
    let phaseCount = 0;
    const seen = new Set<string>();
    for (let i = 1; i < phaseRows.length; i++) {
      const name = cellStr(phaseRows[i]?.[0]) || cellStr(phaseRows[i]?.[1]);
      if (!name || seen.has(name)) continue;
      insPhase.run(name, phaseCount++);
      seen.add(name);
    }
    console.log(`  Фазы: ${phaseCount}`);
  } else {
    const phases = [...new Set(
      (db.prepare(`SELECT DISTINCT phase FROM fs_catalog WHERE phase IS NOT NULL AND phase != ''`).all() as { phase: string }[])
        .map(r => r.phase)
    )];
    const insPhase = db.prepare(`INSERT OR IGNORE INTO fs_phases(name, sort_order) VALUES (?,?)`);
    db.prepare(`DELETE FROM fs_phases`).run();
    phases.forEach((p, i) => insPhase.run(p, i));
    console.log(`  Фазы из каталога: ${phases.length}`);
  }

  const industryWs = findSheet(wb, '3.ФС Девелопмент, Капстрой, EPC');
  if (industryWs) {
    const indRows = XLSX.utils.sheet_to_json<unknown[]>(industryWs, { header: 1, defval: '' }) as unknown[][];
    const insBlock = db.prepare(`INSERT OR IGNORE INTO fs_industry_blocks(industry_profile, fs_item_id) VALUES (?,?)`);
    db.prepare(`DELETE FROM fs_industry_blocks`).run();
    const headers = (indRows[0] ?? []).map(h => cellStr(h));
    const profiles = ['Девелопмент', 'Капстрой', 'EPC'];
    let blockCount = 0;
    for (let i = 1; i < indRows.length; i++) {
      const row = indRows[i];
      const fsName = cellStr(row?.[0]) || cellStr(row?.[1]);
      if (!fsName) continue;
      const fsItem = db.prepare(`SELECT id FROM fs_catalog WHERE name=? LIMIT 1`).get(fsName) as { id: number } | undefined;
      if (!fsItem) continue;
      for (let col = 0; col < headers.length; col++) {
        const hdr = headers[col];
        const profile = profiles.find(p => hdr.includes(p));
        if (!profile) continue;
        const val = cellStr(row?.[col]);
        if (val && val !== '0' && val.toLowerCase() !== 'нет') {
          insBlock.run(profile, fsItem.id);
          blockCount++;
        }
      }
    }
    console.log(`  Отраслевые блоки: ${blockCount}`);
  }

  const paramsWs = findSheet(wb, 'параметры расчета', 'Параметры расчета');
  if (paramsWs) {
    const pRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(paramsWs, { defval: '' });
    for (const row of pRows) {
      const key = cellStr(row['Параметр'] ?? row['параметр'] ?? Object.values(row)[0]);
      const val = Number(row['Значение'] ?? row['значение'] ?? Object.values(row)[1]);
      if (key && !isNaN(val)) {
        db.prepare(`INSERT OR REPLACE INTO constants(key, value) VALUES (?,?)`).run(key, val);
      }
    }
    console.log(`  Параметры расчёта импортированы`);
  }
}

const DASHBOARD_SOLUTION_RE = /дашборд|панел|отчет|мониторинг|аналитик/i;
const FINANCE_WIDGET_RE = /выручк|расход|доход|бюджет|денежн|рентабельн|поступлен|выплат|операционн|стоимост|финанс|бдр|бддс|портфел/i;
const PRODUCTION_WIDGET_RE = /трудозатрат|загрузк|мощност|выработк|ресурс|подразделен|срок|затрат|рол|выполн|отставан|превышен/i;

type WidgetCategory = 'finance' | 'production';

function widgetCategories(description: string): Set<WidgetCategory> {
  const cats = new Set<WidgetCategory>();
  if (FINANCE_WIDGET_RE.test(description)) cats.add('finance');
  if (PRODUCTION_WIDGET_RE.test(description)) cats.add('production');
  if (cats.size === 0) {
    cats.add('finance');
    cats.add('production');
  }
  return cats;
}

function solutionWidgetCategories(name: string, hypothesis: string | null): Set<WidgetCategory> | 'all' {
  const text = `${name} ${hypothesis ?? ''}`;
  if (hypothesis === 'БЗ Производство тр') return new Set(['production']);
  if (hypothesis === 'Проекты и бюджеты под контролем') return 'all';
  if (FINANCE_WIDGET_RE.test(text) && !PRODUCTION_WIDGET_RE.test(text)) return new Set(['finance']);
  if (PRODUCTION_WIDGET_RE.test(text) && !FINANCE_WIDGET_RE.test(text)) return new Set(['production']);
  if (DASHBOARD_SOLUTION_RE.test(text)) return 'all';
  return new Set();
}

function isDashboardSolution(name: string, hypothesis: string | null): boolean {
  return solutionWidgetCategories(name, hypothesis) === 'all'
    || (solutionWidgetCategories(name, hypothesis) as Set<WidgetCategory>).size > 0;
}

function widgetNameFromDescription(description: string, index: number): string {
  const line = description.split(/\r?\n/)[0].replace(/^[•\-]\s*/, '').trim();
  if (line.length > 5 && line.length <= 120) return line;
  return `Виджет ${index + 1}`;
}

function parseWidgetRows(ws: XLSX.WorkSheet): { name: string; description: string; rowIndex: number }[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  let startRow = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i] ?? [];
    if (/описание/i.test(cellStr(row[2])) || /диаграмм/i.test(cellStr(row[0]))) {
      startRow = i + 1;
      break;
    }
  }
  if (startRow < 0) startRow = 6;

  const result: { name: string; description: string; rowIndex: number }[] = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const description = cellStr(row[2]) || cellStr(row[1]) || cellStr(row[0]);
    if (!description || /^описание$/i.test(description)) continue;
    const diagramName = cellStr(row[0]) || cellStr(row[1]);
    const name = diagramName.length > 5
      ? diagramName.split('\n')[0].slice(0, 120)
      : widgetNameFromDescription(description, result.length);
    result.push({ name, description, rowIndex: i });
  }
  return result;
}

function importWidgets(wb: XLSX.WorkBook, xlsxPath: string) {
  const ws = findSheet(wb, 'Опрос для вебинара', 'опрос');
  if (!ws) { console.warn('  Лист виджетов не найден'); return; }

  const parsed = parseWidgetRows(ws);
  const uploadsDir = path.join(ROOT, 'data', 'uploads');
  const anchorMap = extractWidgetImageMap(xlsxPath);
  const copied = copyWidgetImages(xlsxPath, uploadsDir, anchorMap);

  const insWidget = db.prepare(`INSERT INTO widgets(name, description, type, image_path) VALUES (?,?,?,?)`);
  db.prepare(`DELETE FROM widgets`).run();

  let withImage = 0;
  for (const { name, description, rowIndex } of parsed) {
    const image_path = imagePathForWidgetRow(rowIndex, anchorMap, copied);
    if (image_path) withImage++;
    insWidget.run(name, description, 'dashboard', image_path);
  }
  console.log(`  Виджеты: ${parsed.length} (с картинкой: ${withImage})`);
}

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4);
}

function importSolutionWidgetLinks() {
  const solutions = db.prepare(`SELECT id, name, hypothesis FROM solutions`).all() as {
    id: number; name: string; hypothesis: string | null;
  }[];
  const widgets = db.prepare(`SELECT id, name, description FROM widgets`).all() as {
    id: number; name: string; description: string;
  }[];

  const insLink = db.prepare(`INSERT OR IGNORE INTO solution_widget_map(solution_id, widget_id) VALUES (?,?)`);
  let linkCount = 0;

  for (const sol of solutions) {
    if (!isDashboardSolution(sol.name, sol.hypothesis)) continue;
    const cats = solutionWidgetCategories(sol.name, sol.hypothesis);
    for (const w of widgets) {
      const wCats = widgetCategories(`${w.name} ${w.description}`);
      const match = cats === 'all'
        || [...cats].some(c => wCats.has(c));
      if (match) {
        insLink.run(sol.id, w.id);
        linkCount++;
      }
    }
  }
  console.log(`  Связи решение→виджет: ${linkCount}`);
}

function importWidgetFsLinks() {
  const widgets = db.prepare(`SELECT id, name, description FROM widgets`).all() as {
    id: number; name: string; description: string;
  }[];
  const fsItems = db.prepare(`SELECT id, name FROM fs_catalog`).all() as { id: number; name: string }[];

  const insLink = db.prepare(`INSERT OR IGNORE INTO widget_fs_map(widget_id, fs_item_id) VALUES (?,?)`);
  let linkCount = 0;

  for (const w of widgets) {
    const wTokens = new Set(tokenize(`${w.name} ${w.description}`));
    let best: { id: number; score: number } | null = null;

    for (const fs of fsItems) {
      const fsTokens = tokenize(fs.name);
      if (fsTokens.length === 0) continue;
      const overlap = fsTokens.filter(t => wTokens.has(t)).length;
      const score = overlap / fsTokens.length;
      if (score >= 0.4 && (!best || score > best.score)) {
        best = { id: fs.id, score };
      }
    }
    if (best) {
      insLink.run(w.id, best.id);
      linkCount++;
    }
  }
  console.log(`  Связи виджет→ФС: ${linkCount}`);
}

function main() {
  initDB();
  console.log('Импорт данных предоценки...\n');

  let imported = 0;
  if (fs.existsSync(FILES.caProblem)) {
    console.log('→ ЦА-Проблема-Решение');
    const wb = XLSX.readFile(FILES.caProblem);
    importIndustriesProblems(wb);
    imported++;
  } else {
    console.warn(`⚠ Не найден: ${FILES.caProblem}`);
  }

  if (fs.existsSync(FILES.fsCatalog)) {
    console.log('→ ФС Lite и ПК');
    const wb = XLSX.readFile(FILES.fsCatalog);
    importFsCatalog(wb);
    imported++;
  } else {
    console.warn(`⚠ Не найден: ${FILES.fsCatalog}`);
  }

  if (fs.existsSync(FILES.widgets)) {
    console.log('→ Анкета виджетов');
    const wb = XLSX.readFile(FILES.widgets);
    importWidgets(wb, FILES.widgets);
    imported++;
  } else {
    console.warn(`⚠ Не найден: ${FILES.widgets}`);
  }

  if (imported > 0) {
    console.log('→ Связи решение↔виджет и виджет↔ФС');
    importSolutionWidgetLinks();
    importWidgetFsLinks();
  }

  if (imported === 0) {
    console.log('\nФайлы xlsx не найдены. Положите их в корень проекта и повторите импорт.');
    seedMinimalData();
  } else {
    console.log(`\n✓ Импорт завершён (${imported} файлов)`);
  }
}

function seedMinimalData() {
  console.log('Создание минимальных тестовых данных...');
  const insIndustry = db.prepare(`INSERT OR IGNORE INTO industries(name) VALUES (?)`);
  const insSegment = db.prepare(`INSERT OR IGNORE INTO segments(name) VALUES (?)`);
  const insProblem = db.prepare(`INSERT OR IGNORE INTO problems(name, industry_id) VALUES (?,?)`);
  const insSolution = db.prepare(`INSERT OR IGNORE INTO solutions(name) VALUES (?)`);
  const insLink = db.prepare(`INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id) VALUES (?,?)`);
  const insFs = db.prepare(`INSERT OR IGNORE INTO fs_catalog(name, phase, queue, story_points) VALUES (?,?,?,?)`);
  const insPhase = db.prepare(`INSERT OR IGNORE INTO fs_phases(name, sort_order) VALUES (?,?)`);
  const insWidget = db.prepare(`INSERT OR IGNORE INTO widgets(name, description, type) VALUES (?,?,?)`);

  insIndustry.run('Машиностроение');
  insSegment.run('Трудоёмкое производство');
  const ind = db.prepare(`SELECT id FROM industries WHERE name='Машиностроение'`).get() as { id: number };
  const seg = db.prepare(`SELECT id FROM segments WHERE name='Трудоёмкое производство'`).get() as { id: number };
  db.prepare(`INSERT OR IGNORE INTO industry_segment_map(industry_id, segment_id) VALUES (?,?)`).run(ind.id, seg.id);

  insProblem.run('Нет единой системы планирования', ind.id);
  insProblem.run('Ручной учёт трудозатрат', ind.id);
  insSolution.run('Внедрение Case/Profi');
  insSolution.run('Дашборд KPI производства');

  const p1 = db.prepare(`SELECT id FROM problems WHERE name='Нет единой системы планирования'`).get() as { id: number };
  const s1 = db.prepare(`SELECT id FROM solutions WHERE name='Внедрение Case/Profi'`).get() as { id: number };
  const s2 = db.prepare(`SELECT id FROM solutions WHERE name='Дашборд KPI производства'`).get() as { id: number };
  insLink.run(p1.id, s1.id);

  insPhase.run('Этап 1. Проектирование', 0);
  insPhase.run('Этап 2. Разработка', 1);
  insFs.run('Инициация проекта', 'Этап 1. Проектирование', '1', 5);
  insFs.run('Настройка дашборда', 'Этап 2. Разработка', '1', 8);
  insWidget.run('Виджет загрузки ресурсов', 'Отображение загрузки ресурсов по проектам', 'dashboard');
  insWidget.run('Виджет KPI', 'Ключевые показатели эффективности', 'dashboard');

  const w1 = db.prepare(`SELECT id FROM widgets WHERE name LIKE 'Виджет загрузки%'`).get() as { id: number };
  db.prepare(`INSERT OR IGNORE INTO solution_widget_map(solution_id, widget_id) VALUES (?,?)`).run(s2.id, w1.id);

  const fs1 = db.prepare(`SELECT id FROM fs_catalog WHERE name='Инициация проекта'`).get() as { id: number };
  const fs2 = db.prepare(`SELECT id FROM fs_catalog WHERE name='Настройка дашборда'`).get() as { id: number };
  db.prepare(`INSERT OR IGNORE INTO solution_fs_map(solution_id, fs_item_id) VALUES (?,?)`).run(s1.id, fs1.id);
  db.prepare(`INSERT OR IGNORE INTO widget_fs_map(widget_id, fs_item_id) VALUES (?,?)`).run(w1.id, fs2.id);

  console.log('✓ Минимальные тестовые данные созданы');
}

main();
