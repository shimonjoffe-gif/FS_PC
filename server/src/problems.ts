import { db } from './db';
import { recomputeAllProblemCodes } from './problemNumbering';

export interface ProblemRow {
  id: number;
  name: string;
  industry_id: number | null;
  segment_id: number | null;
  maturity_id: number | null;
  parent_id: number | null;
  sort_order: number;
  lcm_code: string | null;
  catalog_code: string | null;
  industry_name?: string | null;
  segment_name?: string | null;
  maturity_name?: string | null;
  used_in_hypotheses: string[];
  hypothesis_codes: Record<string, string>;
}

export interface ProblemSolutionUsage {
  id: number;
  name: string;
  lcm_code: string | null;
  catalog_code: string | null;
  sort_order: number;
}

export interface ProblemHypothesisUsage {
  hypothesis_id: number;
  hypothesis_name: string;
  code: string | null;
  solutions: ProblemSolutionUsage[];
}

export interface ProblemDetail extends ProblemRow {
  hypothesis_usages: ProblemHypothesisUsage[];
}

export interface ProblemCatalogFilters {
  industry_id?: number;
  segment_id?: number;
  maturity_id?: number;
}

export interface ProblemInput {
  name: string;
  parent_id?: number | null;
  lcm_code?: string | null;
  industry_id?: number | null;
  segment_id?: number | null;
  maturity_id?: number | null;
}

export function normalizeProblemName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function listProblemsCatalog(filters?: ProblemCatalogFilters): ProblemRow[] {
  let sql = `
    SELECT p.id, p.name, p.industry_id, p.segment_id, p.maturity_id,
           p.parent_id, p.sort_order, p.lcm_code, p.catalog_code,
           i.name as industry_name, s.name as segment_name, m.name as maturity_name
    FROM problems p
    LEFT JOIN industries i ON i.id = p.industry_id
    LEFT JOIN segments s ON s.id = p.segment_id
    LEFT JOIN maturity_levels m ON m.id = p.maturity_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (filters?.industry_id) { sql += ` AND (p.industry_id=? OR p.industry_id IS NULL)`; params.push(filters.industry_id); }
  if (filters?.segment_id) { sql += ` AND (p.segment_id=? OR p.segment_id IS NULL)`; params.push(filters.segment_id); }
  if (filters?.maturity_id) { sql += ` AND (p.maturity_id=? OR p.maturity_id IS NULL)`; params.push(filters.maturity_id); }
  sql += ` ORDER BY p.sort_order, p.id`;

  const rows = db.prepare(sql).all(...params) as Omit<ProblemRow, 'used_in_hypotheses' | 'hypothesis_codes'>[];

  const usageMap = new Map<number, string[]>();
  const usageRows = db.prepare(`
    SELECT DISTINCT hp.problem_id, h.name AS hypothesis_name
    FROM hypothesis_problems hp
    JOIN hypotheses h ON h.id = hp.hypothesis_id
    ORDER BY h.name
  `).all() as { problem_id: number; hypothesis_name: string }[];

  for (const row of usageRows) {
    const list = usageMap.get(row.problem_id) ?? [];
    list.push(row.hypothesis_name);
    usageMap.set(row.problem_id, list);
  }

  const codeMap = new Map<number, Record<string, string>>();
  const codeRows = db.prepare(`
    SELECT phc.problem_id, h.name AS hypothesis_name, phc.code
    FROM problem_hypothesis_codes phc
    JOIN hypotheses h ON h.id = phc.hypothesis_id
  `).all() as { problem_id: number; hypothesis_name: string; code: string }[];

  for (const row of codeRows) {
    const codes = codeMap.get(row.problem_id) ?? {};
    codes[row.hypothesis_name] = row.code;
    codeMap.set(row.problem_id, codes);
  }

  return rows.map(row => ({
    ...row,
    used_in_hypotheses: usageMap.get(row.id) ?? [],
    hypothesis_codes: codeMap.get(row.id) ?? {},
  }));
}

function loadProblemSolutions(problemId: number): ProblemSolutionUsage[] {
  return db.prepare(`
    SELECT s.id, s.name, s.lcm_code, s.catalog_code, s.sort_order
    FROM solutions s
    JOIN problem_solution_map psm ON psm.solution_id = s.id
    WHERE psm.problem_id=?
    ORDER BY s.sort_order, s.name, s.id
  `).all(problemId) as ProblemSolutionUsage[];
}

export function loadProblemById(id: number): ProblemDetail | null {
  const row = db.prepare(`
    SELECT p.id, p.name, p.industry_id, p.segment_id, p.maturity_id,
           p.parent_id, p.sort_order, p.lcm_code, p.catalog_code,
           i.name as industry_name, s.name as segment_name, m.name as maturity_name
    FROM problems p
    LEFT JOIN industries i ON i.id = p.industry_id
    LEFT JOIN segments s ON s.id = p.segment_id
    LEFT JOIN maturity_levels m ON m.id = p.maturity_id
    WHERE p.id=?
  `).get(id) as Omit<ProblemRow, 'used_in_hypotheses' | 'hypothesis_codes'> | undefined;
  if (!row) return null;

  const hypCodeRows = db.prepare(`
    SELECT hypothesis_id, code FROM problem_hypothesis_codes WHERE problem_id=?
  `).all(id) as { hypothesis_id: number; code: string }[];
  const hypCodeById = new Map(hypCodeRows.map(r => [r.hypothesis_id, r.code]));

  const hypRows = db.prepare(`
    SELECT DISTINCT h.id AS hypothesis_id, h.name AS hypothesis_name
    FROM hypothesis_problems hp
    JOIN hypotheses h ON h.id = hp.hypothesis_id
    WHERE hp.problem_id=?
    ORDER BY h.name
  `).all(id) as { hypothesis_id: number; hypothesis_name: string }[];

  const solutions = loadProblemSolutions(id);
  const hypothesis_usages: ProblemHypothesisUsage[] = hypRows.map(h => ({
    hypothesis_id: h.hypothesis_id,
    hypothesis_name: h.hypothesis_name,
    code: hypCodeById.get(h.hypothesis_id) ?? null,
    solutions,
  }));

  return {
    ...row,
    used_in_hypotheses: hypothesis_usages.map(u => u.hypothesis_name),
    hypothesis_codes: Object.fromEntries(
      hypothesis_usages.map(u => [u.hypothesis_name, u.code ?? '']),
    ),
    hypothesis_usages,
  };
}

function nextSortOrder(): number {
  const row = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM problems`).get() as { next: number };
  return row.next;
}

export function findProblemByName(name: string): { id: number } | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return db.prepare(`SELECT id FROM problems WHERE name=? LIMIT 1`).get(trimmed) as { id: number } | undefined;
}

export function createProblemCatalog(input: ProblemInput): ProblemDetail {
  const name = input.name?.trim();
  if (!name) throw new Error('name is required');
  if (input.parent_id) {
    const parent = db.prepare(`SELECT id FROM problems WHERE id=?`).get(input.parent_id);
    if (!parent) throw new Error('parent not found');
  }
  if (findProblemByName(name)) throw new Error('проблематика с таким названием уже есть');
  const result = db.prepare(`
    INSERT INTO problems(name, industry_id, segment_id, maturity_id, parent_id, sort_order, lcm_code)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    name,
    input.industry_id ?? null,
    input.segment_id ?? null,
    input.maturity_id ?? null,
    input.parent_id ?? null,
    nextSortOrder(),
    input.lcm_code?.trim() || null,
  );
  const detail = loadProblemById(Number(result.lastInsertRowid));
  if (!detail) throw new Error('create failed');
  recomputeAllProblemCodes();
  return loadProblemById(detail.id) ?? detail;
}

export function updateProblem(id: number, input: Partial<ProblemInput>): ProblemDetail | null {
  const existing = db.prepare(`SELECT id FROM problems WHERE id=?`).get(id);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) throw new Error('name is required');

  if (input.parent_id !== undefined && input.parent_id !== null) {
    if (input.parent_id === id) throw new Error('problem cannot be its own parent');
    const parent = db.prepare(`SELECT id FROM problems WHERE id=?`).get(input.parent_id);
    if (!parent) throw new Error('parent not found');
    let cursor: number | null = input.parent_id;
    while (cursor) {
      if (cursor === id) throw new Error('circular parent reference');
      const row = db.prepare(`SELECT parent_id FROM problems WHERE id=?`).get(cursor) as { parent_id: number | null } | undefined;
      cursor = row?.parent_id ?? null;
    }
  }

  const current = db.prepare(`SELECT * FROM problems WHERE id=?`).get(id) as ProblemRow;
  db.prepare(`
    UPDATE problems SET
      name=COALESCE(?, name),
      industry_id=?,
      segment_id=?,
      maturity_id=?,
      parent_id=?,
      lcm_code=?
    WHERE id=?
  `).run(
    name ?? null,
    input.industry_id !== undefined ? input.industry_id : current.industry_id,
    input.segment_id !== undefined ? input.segment_id : current.segment_id,
    input.maturity_id !== undefined ? input.maturity_id : current.maturity_id,
    input.parent_id !== undefined ? input.parent_id : current.parent_id,
    input.lcm_code !== undefined ? (input.lcm_code?.trim() || null) : current.lcm_code,
    id,
  );

  recomputeAllProblemCodes();
  return loadProblemById(id);
}

function deleteProblemRow(id: number): void {
  db.prepare(`DELETE FROM hypothesis_problems WHERE problem_id=?`).run(id);
  db.prepare(`DELETE FROM problem_solution_map WHERE problem_id=?`).run(id);
  db.prepare(`DELETE FROM briefing_problem_sel WHERE problem_id=?`).run(id);
  db.prepare(`UPDATE problems SET parent_id=NULL WHERE parent_id=?`).run(id);
  db.prepare(`DELETE FROM problems WHERE id=?`).run(id);
}

function deleteProblemSubtree(id: number): void {
  const children = db.prepare(`SELECT id FROM problems WHERE parent_id=?`).all(id) as { id: number }[];
  for (const child of children) deleteProblemSubtree(child.id);
  deleteProblemRow(id);
}

export function deleteProblem(id: number): boolean {
  const existing = db.prepare(`SELECT id FROM problems WHERE id=?`).get(id);
  if (!existing) return false;
  const tx = db.transaction(() => deleteProblemSubtree(id));
  tx();
  recomputeAllProblemCodes();
  return true;
}

/** Удаляет проблематики, связанные только с одной гипотезой. */
export function deleteProblemsExclusiveToHypothesis(hypothesisName: string): { deleted: number; skipped_shared: number } {
  const hyp = db.prepare(`SELECT id FROM hypotheses WHERE name=?`).get(hypothesisName) as { id: number } | undefined;
  if (!hyp) return { deleted: 0, skipped_shared: 0 };

  const candidateIds = db.prepare(`
    SELECT DISTINCT problem_id AS id FROM hypothesis_problems WHERE hypothesis_id=?
  `).all(hyp.id) as { id: number }[];

  let deleted = 0;
  let skippedShared = 0;
  const tx = db.transaction(() => {
    for (const { id } of candidateIds) {
      const hyps = db.prepare(`
        SELECT DISTINCT h.name FROM hypothesis_problems hp
        JOIN hypotheses h ON h.id = hp.hypothesis_id
        WHERE hp.problem_id=?
      `).all(id) as { name: string }[];
      if (hyps.length !== 1 || hyps[0].name !== hypothesisName) {
        skippedShared++;
        continue;
      }
      deleteProblemSubtree(id);
      deleted++;
    }
  });
  tx();
  recomputeAllProblemCodes();
  return { deleted, skipped_shared: skippedShared };
}

/** Удаляет проблематики, не привязанные ни к одной гипотезе (до стабилизации). */
export function pruneProblemsWithoutHypothesis(): number {
  let totalDeleted = 0;
  for (;;) {
    const linkedIds = new Set(
      (db.prepare(`SELECT DISTINCT problem_id AS id FROM hypothesis_problems`).all() as { id: number }[])
        .map(r => r.id),
    );

    const rows = db.prepare(`SELECT id, parent_id FROM problems`).all() as { id: number; parent_id: number | null }[];
    const byId = new Map(rows.map(r => [r.id, r]));

    function depth(id: number): number {
      const row = byId.get(id);
      if (!row?.parent_id || !byId.has(row.parent_id)) return 0;
      return depth(row.parent_id) + 1;
    }

    const toDelete = rows
      .filter(r => !linkedIds.has(r.id))
      .sort((a, b) => depth(b.id) - depth(a.id));

    if (!toDelete.length) break;

    const tx = db.transaction(() => {
      for (const row of toDelete) {
        if (!db.prepare(`SELECT id FROM problems WHERE id=?`).get(row.id)) continue;
        deleteProblemRow(row.id);
        totalDeleted++;
      }
    });
    tx();
  }
  recomputeAllProblemCodes();
  return totalDeleted;
}

/** Для обратной совместимости: простое создание по имени. */
export function createProblem(name: string): { id: number; name: string } {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');
  const existing = findProblemByName(trimmed);
  if (existing) return { id: existing.id, name: trimmed };
  const result = db.prepare(`INSERT INTO problems(name, sort_order) VALUES (?,?)`).run(trimmed, nextSortOrder());
  recomputeAllProblemCodes();
  return { id: Number(result.lastInsertRowid), name: trimmed };
}
