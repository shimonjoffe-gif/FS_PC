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
  parent_id: number | null;
  lcm_code: string | null;
  catalog_code: string | null;
  hypothesis_code: string | null;
  sort_order: number;
  linked: boolean;
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
  industry_ids?: number[];
  activity_type_ids?: number[];
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
  const activityTypeIds = filters?.activity_type_ids?.length
    ? [...new Set(filters.activity_type_ids)]
    : [];
  if (activityTypeIds.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM hypothesis_problems hp
      JOIN hypothesis_activity_types hat ON hat.hypothesis_id = hp.hypothesis_id
      WHERE hp.problem_id = p.id
        AND hat.activity_type_id IN (${activityTypeIds.map(() => '?').join(',')})
    )`;
    params.push(...activityTypeIds);
  } else {
    const industryIds = filters?.industry_ids?.length
      ? [...new Set(filters.industry_ids)]
      : filters?.industry_id
        ? [filters.industry_id]
        : [];
    if (industryIds.length > 0) {
      sql += ` AND EXISTS (
        SELECT 1 FROM hypothesis_problems hp
        JOIN hypothesis_activity_types hat ON hat.hypothesis_id = hp.hypothesis_id
        JOIN activity_types at ON at.id = hat.activity_type_id
        JOIN industries i ON i.name = at.name
        WHERE hp.problem_id = p.id
          AND i.id IN (${industryIds.map(() => '?').join(',')})
      )`;
      params.push(...industryIds);
    }
  }
  if (filters?.segment_id) { sql += ` AND p.segment_id=?`; params.push(filters.segment_id); }
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

function loadProblemSolutions(problemId: number, hypothesisId?: number): ProblemSolutionUsage[] {
  const linked = db.prepare(`
    SELECT s.id, s.name, s.parent_id, s.lcm_code, s.catalog_code, s.sort_order
    FROM solutions s
    JOIN problem_solution_map psm ON psm.solution_id = s.id
    WHERE psm.problem_id=?
    ORDER BY s.sort_order, s.name, s.id
  `).all(problemId) as Omit<ProblemSolutionUsage, 'hypothesis_code' | 'linked'>[];

  const byId = new Map<number, ProblemSolutionUsage>();
  for (const row of linked) {
    byId.set(row.id, {
      ...row,
      hypothesis_code: null,
      linked: true,
    });
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const item of [...byId.values()]) {
      if (!item.parent_id || byId.has(item.parent_id)) continue;
      const parent = db.prepare(`
        SELECT id, name, parent_id, lcm_code, catalog_code, sort_order
        FROM solutions WHERE id=?
      `).get(item.parent_id) as Omit<ProblemSolutionUsage, 'hypothesis_code' | 'linked'> | undefined;
      if (!parent) continue;
      byId.set(parent.id, { ...parent, hypothesis_code: null, linked: false });
      changed = true;
    }
  }

  if (hypothesisId != null && byId.size > 0) {
    const ids = [...byId.keys()];
    const codeRows = db.prepare(`
      SELECT solution_id, code FROM solution_hypothesis_codes
      WHERE hypothesis_id=? AND solution_id IN (${ids.map(() => '?').join(',')})
    `).all(hypothesisId, ...ids) as { solution_id: number; code: string }[];
    for (const row of codeRows) {
      const sol = byId.get(row.solution_id);
      if (sol) sol.hypothesis_code = row.code;
    }
  }

  return [...byId.values()];
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

  const hypothesis_usages: ProblemHypothesisUsage[] = hypRows.map(h => ({
    hypothesis_id: h.hypothesis_id,
    hypothesis_name: h.hypothesis_name,
    code: hypCodeById.get(h.hypothesis_id) ?? null,
    solutions: loadProblemSolutions(id, h.hypothesis_id),
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
  db.prepare(`DELETE FROM problem_hypothesis_codes WHERE problem_id=?`).run(id);
  db.prepare(`DELETE FROM problem_solution_map WHERE problem_id=?`).run(id);
  db.prepare(`DELETE FROM briefing_problem_sel WHERE problem_id=?`).run(id);
  db.prepare(`UPDATE briefing_problem_sel SET linked_problem_id=NULL WHERE linked_problem_id=?`).run(id);
  db.prepare(`UPDATE problems SET parent_id=NULL WHERE parent_id=?`).run(id);
  db.prepare(`DELETE FROM problems WHERE id=?`).run(id);
}

function problemLinkScore(id: number): number {
  const solutions = (db.prepare(`SELECT COUNT(*) c FROM problem_solution_map WHERE problem_id=?`)
    .get(id) as { c: number }).c;
  const briefing = (db.prepare(`
    SELECT COUNT(*) c FROM briefing_problem_sel
    WHERE problem_id=? OR linked_problem_id=?
  `).get(id, id) as { c: number }).c;
  return solutions + briefing;
}

/** Переносит связи дубля на каноническую проблематику и удаляет дубль. */
function mergeProblemInto(canonicalId: number, duplicateId: number): void {
  if (canonicalId === duplicateId) return;

  const hypLinks = db.prepare(`
    SELECT hypothesis_id, sort_order FROM hypothesis_problems WHERE problem_id=?
  `).all(duplicateId) as { hypothesis_id: number; sort_order: number }[];
  for (const { hypothesis_id, sort_order } of hypLinks) {
    db.prepare(`
      INSERT INTO hypothesis_problems(hypothesis_id, problem_id, sort_order)
      VALUES (?,?,?)
      ON CONFLICT(hypothesis_id, problem_id) DO NOTHING
    `).run(hypothesis_id, canonicalId, sort_order);
  }
  db.prepare(`DELETE FROM hypothesis_problems WHERE problem_id=?`).run(duplicateId);

  const codes = db.prepare(`
    SELECT hypothesis_id, code FROM problem_hypothesis_codes WHERE problem_id=?
  `).all(duplicateId) as { hypothesis_id: number; code: string }[];
  for (const { hypothesis_id, code } of codes) {
    db.prepare(`
      INSERT INTO problem_hypothesis_codes(problem_id, hypothesis_id, code)
      VALUES (?,?,?)
      ON CONFLICT(problem_id, hypothesis_id) DO NOTHING
    `).run(canonicalId, hypothesis_id, code);
  }
  db.prepare(`DELETE FROM problem_hypothesis_codes WHERE problem_id=?`).run(duplicateId);

  db.prepare(`
    INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id)
    SELECT ?, solution_id FROM problem_solution_map WHERE problem_id=?
  `).run(canonicalId, duplicateId);
  db.prepare(`DELETE FROM problem_solution_map WHERE problem_id=?`).run(duplicateId);

  const leftoverProblemSels = db.prepare(`
    SELECT id, briefing_id FROM briefing_problem_sel WHERE problem_id=?
  `).all(duplicateId) as { id: number; briefing_id: number }[];
  for (const { id, briefing_id } of leftoverProblemSels) {
    const clash = db.prepare(`
      SELECT id FROM briefing_problem_sel
      WHERE briefing_id=? AND problem_id=? AND id!=?
    `).get(briefing_id, canonicalId, id);
    if (clash) {
      db.prepare(`DELETE FROM briefing_problem_sel WHERE id=?`).run(id);
    } else {
      db.prepare(`UPDATE briefing_problem_sel SET problem_id=? WHERE id=?`).run(canonicalId, id);
    }
  }

  db.prepare(`
    UPDATE briefing_problem_sel SET linked_problem_id=? WHERE linked_problem_id=?
  `).run(canonicalId, duplicateId);

  db.prepare(`UPDATE problems SET parent_id=? WHERE parent_id=?`).run(canonicalId, duplicateId);
  db.prepare(`DELETE FROM problems WHERE id=?`).run(duplicateId);
}

/**
 * Объединяет проблематики с полностью совпадающим name.
 * Канон: больше связей (решения + брифинги), при равенстве — меньший id.
 */
export function deduplicateProblems(): { groups: number; deleted: number } {
  const all = db.prepare(`SELECT id, name FROM problems`).all() as { id: number; name: string }[];
  const byName = new Map<string, number[]>();
  for (const row of all) {
    const list = byName.get(row.name) ?? [];
    list.push(row.id);
    byName.set(row.name, list);
  }

  let groups = 0;
  let deleted = 0;
  const tx = db.transaction(() => {
    for (const ids of byName.values()) {
      if (ids.length < 2) continue;
      groups++;
      const scored = ids
        .map(id => ({ id, links: problemLinkScore(id) }))
        .sort((a, b) => b.links - a.links || a.id - b.id);
      const canonicalId = scored[0].id;
      for (const dup of scored.slice(1)) {
        mergeProblemInto(canonicalId, dup.id);
        deleted++;
      }
    }
  });
  tx();
  recomputeAllProblemCodes();
  return { groups, deleted };
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
