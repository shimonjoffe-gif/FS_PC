import * as XLSX from 'xlsx';
import { db } from '../db';
import { findSolutionByName, pruneUnlinkedSolutionsForHypothesis } from '../solutions';

export function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\r\n/g, '\n').trim();
}

export interface LcmColumns {
  headerIdx: number;
  problemCol: number;
  problemLinkCol: number;
  solutionCol: number;
  solutionLinkCol: number;
}

/** Явные колонки листа (0-based): B=1, C=2, D=3, E=4 */
export interface LcmColumnOverride {
  headerIdx: number;
  problemCol: number;
  problemLinkCol: number;
  solutionCol: number;
  solutionLinkCol?: number;
  /** Текст решения, если в solutionCol только ссылки или пусто (напр. D при E=ссылки) */
  solutionTextFallbackCol?: number;
  /** Доп. колонки со связями проблема→решение (напр. C) */
  extraProblemLinkCols?: number[];
  /** Разбивать ячейку решения по переносам строк на отдельные пункты */
  splitMultilineSolutions?: boolean;
  /** Связи только по строкам, игнорировать колонку «Связь» и прочие ссылки */
  rowPairingOnly?: boolean;
}

export interface LcmRowPair {
  problem: string;
  solutions: LcmRowSolutionEntry[];
}

/** Строка, группа с детьми или дочерний пункт со ссылкой на родителя из другой строки. */
export type LcmRowSolutionEntry =
  | string
  | { name: string; children?: string[] }
  | { child: string; under: string };

export interface LcmItem {
  code: string;
  name: string;
  parentCode: string | null;
  sortOrder: number;
  linkRefs: string[];
  rowIdx: number;
}

export interface ParsedLcmCanvas {
  problems: LcmItem[];
  solutions: LcmItem[];
  /** problem code -> solution codes */
  problemToSolution: Map<string, Set<string>>;
  /** solution code -> problem codes */
  solutionToProblem: Map<string, Set<string>>;
  warnings: string[];
}

const SKIP_ROW = [
  /^2\.2\s/i,
  /^7\.\s/,
  /^8\.\s*ключев/i,
  /уникальн.*ценност/i,
  /скрытое преимущество/i,
  /сегменты потребителей/i,
  /^решение не сформулировано/i,
  /^не занимались$/i,
  /^в работе$/i,
  /^техническая реализация$/i,
  /что нужно доработать/i,
  /^главная проблематика/i,
  /^2\.1\s*проблема/i,
  /^4\.\s*решение/i,
  /^рЕШЕНИЕ:/i,
  /^уровень\s+\d/i,
  /сколько запросов/i,
  /как первый шаг/i,
  /какое количество/i,
  /больше 2 млрд/i,
  /запросов какое/i,
];

function shouldSkipRow(...cells: string[]): boolean {
  for (const raw of cells) {
    const s = raw.trim();
    if (!s) continue;
    if (SKIP_ROW.some(re => re.test(s))) return true;
  }
  return false;
}

function isScoreOnly(s: string): boolean {
  return /^\d+([.,]\d+)?$/.test(s.trim());
}

export function normalizeLcmCode(raw: string): string {
  const t = raw.trim().replace(/\s/g, '').replace(/[,;]+$/g, '');
  if (!t) return '';
  if (/^[IVXLC]+$/i.test(t)) return `${t.toUpperCase()}.`;
  const cleaned = t.replace(/\.+$/, '');
  if (!cleaned) return '';
  return `${cleaned}.`;
}

export function parentLcmCode(code: string): string | null {
  if (!code) return null;
  const inner = code.replace(/\.$/, '');
  if (!inner.includes('.')) return null;
  const parts = inner.split('.');
  if (parts.length <= 1) return null;
  return `${parts.slice(0, -1).join('.')}.`;
}

export function extractLcmCode(text: string): { code: string; name: string } {
  const trimmed = text.trim();
  if (!trimmed) return { code: '', name: '' };

  const numbered = trimmed.match(/^((?:\d+(?:\.\d+)*\.?|[IVXLC]+\.|\d{3,}\.))\s*(.*)$/is);
  if (numbered) {
    const code = normalizeLcmCode(numbered[1]);
    const rest = numbered[2]?.trim();
    if (rest) return { code, name: rest };
    return { code, name: trimmed };
  }

  const paren = trimmed.match(/^\((\d+(?:\.\d+)*\.?)\)\s*(.*)$/);
  if (paren) {
    const code = normalizeLcmCode(paren[1]);
    const rest = paren[2]?.trim();
    return { code, name: rest || trimmed };
  }

  return { code: '', name: trimmed };
}

export function parseLinkRefs(text: string): string[] {
  const s = cellStr(text);
  if (!s || isScoreOnly(s)) return [];

  const range = s.match(/^(\d+)\s*[-–—]\s*(\d+)\.?$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isInteger(start) && Number.isInteger(end) && end >= start && end - start <= 30) {
      return Array.from({ length: end - start + 1 }, (_, i) => `${start + i}.`);
    }
  }

  const refs: string[] = [];
  const normalized = s.replace(/[\[\]()]/g, ' ').replace(/\s+и\s+/gi, ' ');
  const re = /\b(\d+(?:\.\d+)*\.?|[IVXLC]+\.?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const code = normalizeLcmCode(m[1]);
    if (code) refs.push(code);
  }
  return [...new Set(refs)];
}

function isRefsOnly(text: string): boolean {
  const s = cellStr(text);
  if (!s) return false;
  const refs = parseLinkRefs(s);
  if (refs.length === 0) return false;
  const stripped = s.replace(/\d+(?:\.\d+)*\.?/gi, '').replace(/[;,\s]/g, '').replace(/и/gi, '');
  return stripped.length < 4;
}

function collectLinkRefs(row: unknown[], cols: number[]): string[] {
  const refs: string[] = [];
  for (const col of cols) {
    if (col < 0) continue;
    const raw = cellStr(row[col]);
    if (raw && isRefsOnly(raw)) refs.push(...parseLinkRefs(raw));
  }
  return [...new Set(refs)];
}

function splitMultilineText(text: string): string[] {
  return text.split(/\n/).map(s => s.trim()).filter(Boolean);
}

function groupSolutionsByRow(solutions: LcmItem[]): Map<number, LcmItem[]> {
  const map = new Map<number, LcmItem[]>();
  for (const s of solutions) {
    const list = map.get(s.rowIdx) ?? [];
    list.push(s);
    map.set(s.rowIdx, list);
  }
  return map;
}

function pushLcmItem(
  items: LcmItem[],
  text: string,
  rowIdx: number,
  sortOrderRef: { value: number },
  linkRefs: string[],
): void {
  const { code, name } = extractLcmCode(text);
  if (!name || shouldSkipRow(name)) return;
  if (/^уровень\s+\d/i.test(name)) return;
  items.push({
    code,
    name,
    parentCode: null,
    sortOrder: sortOrderRef.value++,
    linkRefs,
    rowIdx,
  });
}

function overrideToColumns(o: LcmColumnOverride): LcmColumns {
  return {
    headerIdx: o.headerIdx,
    problemCol: o.problemCol,
    problemLinkCol: o.problemLinkCol,
    solutionCol: o.solutionCol,
    solutionLinkCol: o.solutionLinkCol ?? -1,
  };
}

function findLcmColumns(rows: unknown[][]): LcmColumns | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] ?? [];
    let problemCol = -1;
    let solutionCol = -1;
    for (let j = 0; j < row.length; j++) {
      const cell = cellStr(row[j]).toLowerCase();
      if (problemCol < 0 && /2\.1/.test(cell) && /проблем/.test(cell)) problemCol = j;
      if (solutionCol < 0 && /^4\./.test(cell) && /решени/.test(cell)) solutionCol = j;
    }
    if (problemCol < 0 || solutionCol < 0) continue;

    let problemLinkCol = -1;
    let solutionLinkCol = -1;
    for (let j = 0; j < row.length; j++) {
      const cell = cellStr(row[j]).toLowerCase();
      if (cell !== 'связь') continue;
      if (j > problemCol && j < solutionCol) problemLinkCol = j;
      else if (j > solutionCol && solutionLinkCol < 0) solutionLinkCol = j;
    }
    return { headerIdx: i, problemCol, problemLinkCol, solutionCol, solutionLinkCol };
  }
  return null;
}

function inferParentCode(code: string, knownCodes: Set<string>): string | null {
  const direct = parentLcmCode(code);
  if (direct && knownCodes.has(direct)) return direct;
  if (!code) return null;
  const inner = code.replace(/\.$/, '');
  const parts = inner.split('.');
  for (let len = parts.length - 1; len >= 1; len--) {
    const candidate = `${parts.slice(0, len).join('.')}.`;
    if (knownCodes.has(candidate)) return candidate;
  }
  return direct;
}

function buildItems(
  rows: unknown[][],
  cols: LcmColumns,
  side: 'problem' | 'solution',
  override?: LcmColumnOverride,
): LcmItem[] {
  const textCol = side === 'problem' ? cols.problemCol : cols.solutionCol;
  const linkCol = side === 'problem' ? cols.problemLinkCol : cols.solutionLinkCol;
  const items: LcmItem[] = [];
  let sortOrder = 0;

  for (let i = cols.headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    let text = cellStr(row[textCol]);
    let linkRaw = linkCol >= 0 ? cellStr(row[linkCol]) : '';

    if (side === 'solution' && override) {
      const fallback = override.solutionTextFallbackCol;
      if ((!text || isRefsOnly(text)) && fallback !== undefined && fallback >= 0) {
        const fb = cellStr(row[fallback]);
        if (fb && !isRefsOnly(fb)) text = fb;
      }
      if (override.solutionLinkCol !== undefined && override.solutionLinkCol >= 0) {
        const sl = cellStr(row[override.solutionLinkCol]);
        if (sl && isRefsOnly(sl)) linkRaw = sl;
      }
    }

    if (!text && !linkRaw) continue;
    if (shouldSkipRow(text, linkRaw)) continue;
    if (!text) continue;
    if (isScoreOnly(text)) continue;

    let linkRefs: string[] = [];
    if (!override?.rowPairingOnly) {
      if (side === 'problem' && override) {
        const linkCols = [
          override.problemLinkCol,
          ...(override.extraProblemLinkCols ?? []),
        ];
        linkRefs = collectLinkRefs(row, linkCols);
      } else {
        linkRefs = parseLinkRefs(linkRaw);
      }
    }

    const sortOrderRef = { value: sortOrder };
    if (side === 'solution' && override?.splitMultilineSolutions && text.includes('\n')) {
      for (const line of splitMultilineText(text)) {
        pushLcmItem(items, line, i, sortOrderRef, linkRefs);
      }
      sortOrder = sortOrderRef.value;
      continue;
    }

    pushLcmItem(items, text, i, sortOrderRef, linkRefs);
    sortOrder = sortOrderRef.value;
  }

  const codes = new Set(items.filter(it => it.code).map(it => it.code));
  for (const item of items) {
    if (item.code) {
      item.parentCode = inferParentCode(item.code, codes);
    }
  }
  return items;
}

function addLink(
  map: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  if (!from || !to) return;
  let set = map.get(from);
  if (!set) {
    set = new Set();
    map.set(from, set);
  }
  set.add(to);
}

export function parseLcmSheet(
  ws: XLSX.WorkSheet,
  sheetLabel?: string,
  columnOverride?: LcmColumnOverride,
): ParsedLcmCanvas | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  const cols = columnOverride
    ? overrideToColumns(columnOverride)
    : findLcmColumns(rows);
  if (!cols) return null;

  const problems = buildItems(rows, cols, 'problem', columnOverride);
  const solutions = buildItems(rows, cols, 'solution', columnOverride);
  const problemToSolution = new Map<string, Set<string>>();
  const solutionToProblem = new Map<string, Set<string>>();
  const warnings: string[] = [];

  if (!columnOverride?.rowPairingOnly) {
    const problemCodes = new Set(problems.map(p => p.code).filter(Boolean));
    const solutionCodes = new Set(solutions.map(s => s.code).filter(Boolean));

    for (const p of problems) {
      for (const ref of p.linkRefs) {
        if (solutionCodes.has(ref)) addLink(problemToSolution, p.code, ref);
        else if (ref) {
          warnings.push(`${sheetLabel ?? 'sheet'}: проблема «${p.name.slice(0, 40)}» — связь ${ref} не найдена среди решений`);
        }
      }
    }
    for (const s of solutions) {
      for (const ref of s.linkRefs) {
        if (problemCodes.has(ref)) addLink(solutionToProblem, s.code, ref);
        else if (ref) {
          warnings.push(`${sheetLabel ?? 'sheet'}: решение «${s.name.slice(0, 40)}» — связь ${ref} не найдена среди проблем`);
        }
      }
    }

    // Bidirectional merge: solution->problem also implies problem->solution
    for (const [solCode, probCodes] of solutionToProblem) {
      for (const probCode of probCodes) {
        addLink(problemToSolution, probCode, solCode);
        addLink(solutionToProblem, solCode, probCode);
      }
    }
  }

  // Same-row pairing: all solutions on row N link only to problem on row N
  const solutionsByRow = groupSolutionsByRow(solutions);
  for (const p of problems) {
    const rowSols = solutionsByRow.get(p.rowIdx) ?? [];
    for (const s of rowSols) {
      if (p.code && s.code) {
        addLink(problemToSolution, p.code, s.code);
        addLink(solutionToProblem, s.code, p.code);
      }
    }
  }

  return { problems, solutions, problemToSolution, solutionToProblem, warnings };
}

/** Построить ParsedLcmCanvas из явных пар «проблема → решения» (напр. данные со скрина). */
export function buildParsedLcmFromRowPairs(rows: LcmRowPair[]): ParsedLcmCanvas {
  const problems: LcmItem[] = [];
  const solutions: LcmItem[] = [];
  const nameToCode = new Map<string, string>();
  let problemSort = 0;
  let solutionSort = 0;
  let codeSeq = 0;

  const allocCode = (name: string): string => {
    const trimmed = name.trim();
    const existing = nameToCode.get(trimmed);
    if (existing) return existing;
    const code = `rs:${++codeSeq}`;
    nameToCode.set(trimmed, code);
    return code;
  };

  const pushSolution = (name: string, parentCode: string | null, rowIdx: number): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const code = allocCode(trimmed);
    solutions.push({
      code,
      name: trimmed,
      parentCode,
      sortOrder: solutionSort++,
      linkRefs: [],
      rowIdx,
    });
  };

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const problemName = row.problem.trim();
    if (!problemName) continue;

    problems.push({
      code: '',
      name: problemName,
      parentCode: null,
      sortOrder: problemSort++,
      linkRefs: [],
      rowIdx,
    });

    for (const entry of row.solutions) {
      if (typeof entry === 'string') {
        pushSolution(entry, null, rowIdx);
        continue;
      }
      if ('under' in entry) {
        const parentCode = nameToCode.get(entry.under.trim()) ?? null;
        pushSolution(entry.child, parentCode, rowIdx);
        continue;
      }
      const parentCode = allocCode(entry.name);
      solutions.push({
        code: parentCode,
        name: entry.name.trim(),
        parentCode: null,
        sortOrder: solutionSort++,
        linkRefs: [],
        rowIdx,
      });
      for (const child of entry.children ?? []) {
        pushSolution(child, parentCode, rowIdx);
      }
    }
  }

  return {
    problems,
    solutions,
    problemToSolution: new Map(),
    solutionToProblem: new Map(),
    warnings: [],
  };
}

export interface ImportLcmResult {
  hypothesisId: number;
  hypothesisName: string;
  problems: number;
  solutions: number;
  links: number;
  warnings: string[];
}

function deleteOrphanProblems(problemIds: number[]): void {
  const toDelete = problemIds.filter(pid => {
    const used = db.prepare(`SELECT 1 FROM hypothesis_problems WHERE problem_id=? LIMIT 1`).get(pid);
    const briefing = db.prepare(`SELECT 1 FROM briefing_problem_sel WHERE problem_id=? LIMIT 1`).get(pid);
    return !used && !briefing;
  });
  if (!toDelete.length) return;

  const placeholders = toDelete.map(() => '?').join(',');
  db.prepare(`UPDATE problems SET parent_id=NULL WHERE parent_id IN (${placeholders})`).run(...toDelete);
  db.prepare(`DELETE FROM problem_solution_map WHERE problem_id IN (${placeholders})`).run(...toDelete);
  db.prepare(`DELETE FROM problems WHERE id IN (${placeholders})`).run(...toDelete);
}

function upsertSolution(
  name: string,
  hypothesisName: string,
  parentId: number | null,
  sortOrder: number,
  lcmCode: string | null,
): number {
  const existing = findSolutionByName(name);

  if (existing) {
    db.prepare(`
      UPDATE solutions SET parent_id=?, sort_order=?, lcm_code=? WHERE id=?
    `).run(parentId, sortOrder, lcmCode, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO solutions(name, hypothesis, parent_id, sort_order, lcm_code) VALUES (?,?,?,?,?)
  `).run(name, null, parentId, sortOrder, lcmCode);
  return Number(result.lastInsertRowid);
}

export function importLcmToHypothesis(
  hypothesisId: number,
  hypothesisName: string,
  parsed: ParsedLcmCanvas,
): ImportLcmResult {
  const oldProblemIds = db.prepare(`
    SELECT problem_id FROM hypothesis_problems WHERE hypothesis_id=?
  `).all(hypothesisId) as { problem_id: number }[];

  const insProblem = db.prepare(`
    INSERT INTO problems(name, parent_id, sort_order, lcm_code) VALUES (?,?,?,?)
  `);
  const insHp = db.prepare(`
    INSERT INTO hypothesis_problems(hypothesis_id, problem_id, sort_order) VALUES (?,?,?)
  `);
  const insLink = db.prepare(`
    INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id) VALUES (?,?)
  `);
  const clearHp = db.prepare(`DELETE FROM hypothesis_problems WHERE hypothesis_id=?`);
  const clearLinksForProblems = db.prepare(`
    DELETE FROM problem_solution_map WHERE problem_id=?
  `);

  let linkCount = 0;
  const linkedPairs = new Set<string>();

  const tx = db.transaction(() => {
    clearHp.run(hypothesisId);

    const problemIdByCode = new Map<string, number>();
    const problemIdBySort = new Map<number, number>();

    for (const item of parsed.problems) {
      const parentId = item.parentCode ? problemIdByCode.get(item.parentCode) ?? null : null;
      const result = insProblem.run(item.name, parentId, item.sortOrder, item.code || null);
      const id = Number(result.lastInsertRowid);
      if (item.code) problemIdByCode.set(item.code, id);
      problemIdBySort.set(item.sortOrder, id);
      insHp.run(hypothesisId, id, item.sortOrder);
    }

    const solutionIdByCode = new Map<string, number>();
    const solutionIdBySort = new Map<number, number>();
    for (const item of parsed.solutions) {
      const parentId = item.parentCode ? solutionIdByCode.get(item.parentCode) ?? null : null;
      const id = upsertSolution(item.name, hypothesisName, parentId, item.sortOrder, item.code || null);
      if (item.code) solutionIdByCode.set(item.code, id);
      solutionIdBySort.set(item.sortOrder, id);
    }

    const resolveProblemId = (code: string, sortOrder?: number): number | undefined => {
      if (sortOrder !== undefined && problemIdBySort.has(sortOrder)) return problemIdBySort.get(sortOrder);
      if (code && problemIdByCode.has(code)) return problemIdByCode.get(code);
      return undefined;
    };

    const resolveSolutionId = (code: string, sortOrder?: number): number | undefined => {
      if (sortOrder !== undefined && solutionIdBySort.has(sortOrder)) return solutionIdBySort.get(sortOrder);
      if (code && solutionIdByCode.has(code)) return solutionIdByCode.get(code);
      return undefined;
    };

    const solutionsByRow = groupSolutionsByRow(parsed.solutions);

    const addLinkPair = (problemId: number, solutionId: number) => {
      const key = `${problemId}:${solutionId}`;
      if (linkedPairs.has(key)) return;
      insLink.run(problemId, solutionId);
      linkedPairs.add(key);
      linkCount++;
    };

    const clearedProblems = new Set<number>();

    for (const p of parsed.problems) {
      const problemId = resolveProblemId(p.code, p.sortOrder);
      if (!problemId) continue;
      if (!clearedProblems.has(problemId)) {
        clearLinksForProblems.run(problemId);
        clearedProblems.add(problemId);
      }

      const solCodes = new Set<string>([
        ...(parsed.problemToSolution.get(p.code) ?? []),
        ...p.linkRefs,
      ]);
      for (const solCode of solCodes) {
        const solutionId = resolveSolutionId(solCode);
        if (solutionId) addLinkPair(problemId, solutionId);
      }

      for (const rowSol of solutionsByRow.get(p.rowIdx) ?? []) {
        const solutionId = resolveSolutionId(rowSol.code, rowSol.sortOrder);
        if (solutionId) addLinkPair(problemId, solutionId);
      }
    }

    for (const s of parsed.solutions) {
      const solutionId = resolveSolutionId(s.code, s.sortOrder);
      if (!solutionId) continue;
      for (const ref of s.linkRefs) {
        const problemId = resolveProblemId(ref);
        if (problemId) addLinkPair(problemId, solutionId);
      }
    }
  });

  tx();
  deleteOrphanProblems(oldProblemIds.map(r => r.problem_id));

  const pruned = pruneUnlinkedSolutionsForHypothesis(hypothesisId, hypothesisName);
  if (pruned > 0) {
    parsed.warnings.push(`Удалено несвязанных решений гипотезы: ${pruned}`);
  }

  return {
    hypothesisId,
    hypothesisName,
    problems: parsed.problems.length,
    solutions: parsed.solutions.length,
    links: linkCount,
    warnings: parsed.warnings,
  };
}
