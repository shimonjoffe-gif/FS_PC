import { db } from './db';
import { loadHypothesisActivityTypes, syncHypothesisActivityTypes } from './activityTypes';
import { recomputeCatalogCodes, recomputeHypothesisSolutionCodes } from './solutionNumbering';
import { recomputeAllProblemCodes, pruneProblemsWithoutHypothesis, createProblem } from './problems';
import { pruneSolutionsWithoutHypothesis } from './solutions';

export { createProblem };

export interface HypothesisProblemInput {
  problem_id?: number;
  name?: string;
  solution_ids?: number[];
  new_solutions?: { name: string }[];
}

export interface HypothesisListRow {
  id: number;
  name: string;
  target_audience: string | null;
  maturity_id: number | null;
  maturity_name: string | null;
  problem_count: number;
  activity_type_count: number;
  activity_type_names?: string | null;
  activity_type_ids?: number[];
  updated_at: string;
}

export interface HypothesisSolutionRow {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
  sort_order: number;
  lcm_code: string | null;
  catalog_code: string | null;
  hypothesis_code: string | null;
}

export interface HypothesisProblemRow {
  id: number;
  name: string;
  industry_name: string | null;
  segment_name: string | null;
  maturity_name: string | null;
  parent_id: number | null;
  sort_order: number;
  lcm_code: string | null;
  depth: number;
  solutions: HypothesisSolutionRow[];
}

export interface HypothesisDetail {
  id: number;
  name: string;
  target_audience: string | null;
  maturity_id: number | null;
  maturity_name: string | null;
  activity_types: { id: number; name: string }[];
  problems: HypothesisProblemRow[];
}

export function listHypotheses(): HypothesisListRow[] {
  const rows = db.prepare(`
    SELECT h.id, h.name, h.target_audience, h.maturity_id, m.name as maturity_name, h.updated_at,
           (SELECT COUNT(*) FROM hypothesis_problems hp WHERE hp.hypothesis_id = h.id) as problem_count,
           (SELECT COUNT(*) FROM hypothesis_activity_types hat WHERE hat.hypothesis_id = h.id) as activity_type_count,
           (SELECT GROUP_CONCAT(at.name, ', ')
            FROM hypothesis_activity_types hat
            JOIN activity_types at ON at.id = hat.activity_type_id
            WHERE hat.hypothesis_id = h.id) as activity_type_names,
           (SELECT GROUP_CONCAT(hat.activity_type_id)
            FROM hypothesis_activity_types hat
            WHERE hat.hypothesis_id = h.id) as activity_type_ids_csv
    FROM hypotheses h
    LEFT JOIN maturity_levels m ON m.id = h.maturity_id
    ORDER BY h.name, h.id
  `).all() as (HypothesisListRow & { activity_type_ids_csv: string | null })[];

  return rows.map(row => ({
    ...row,
    activity_type_ids: row.activity_type_ids_csv
      ? row.activity_type_ids_csv.split(',').map(Number).filter(Boolean)
      : [],
  }));
}

function loadProblemSolutions(problemId: number, hypothesisId: number): HypothesisSolutionRow[] {
  return db.prepare(`
    SELECT s.id, s.name, s.description, s.parent_id, s.sort_order, s.lcm_code, s.catalog_code,
           shc.code AS hypothesis_code
    FROM solutions s
    JOIN problem_solution_map psm ON psm.solution_id = s.id
    LEFT JOIN solution_hypothesis_codes shc
      ON shc.solution_id = s.id AND shc.hypothesis_id = ?
    WHERE psm.problem_id=?
    ORDER BY s.sort_order, s.name, s.id
  `).all(hypothesisId, problemId) as HypothesisSolutionRow[];
}

function computeDepths(items: { id: number; parent_id: number | null }[]): Map<number, number> {
  const byId = new Map(items.map(p => [p.id, p]));
  const cache = new Map<number, number>();
  function depth(id: number): number {
    if (cache.has(id)) return cache.get(id)!;
    const row = byId.get(id);
    if (!row?.parent_id) {
      cache.set(id, 0);
      return 0;
    }
    const d = depth(row.parent_id) + 1;
    cache.set(id, d);
    return d;
  }
  for (const item of items) depth(item.id);
  return cache;
}

export function loadHypothesisById(id: number): HypothesisDetail | null {
  const row = db.prepare(`
    SELECT h.id, h.name, h.target_audience, h.maturity_id, m.name as maturity_name
    FROM hypotheses h
    LEFT JOIN maturity_levels m ON m.id = h.maturity_id
    WHERE h.id=?
  `).get(id) as {
    id: number; name: string; target_audience: string | null;
    maturity_id: number | null; maturity_name: string | null;
  } | undefined;
  if (!row) return null;

  const problems = db.prepare(`
    SELECT p.id, p.name, p.parent_id, p.sort_order, p.lcm_code,
           i.name as industry_name, seg.name as segment_name, m.name as maturity_name, hp.sort_order as hp_sort
    FROM hypothesis_problems hp
    JOIN problems p ON p.id = hp.problem_id
    LEFT JOIN industries i ON i.id = p.industry_id
    LEFT JOIN segments seg ON seg.id = p.segment_id
    LEFT JOIN maturity_levels m ON m.id = p.maturity_id
    WHERE hp.hypothesis_id=?
    ORDER BY hp.sort_order, p.sort_order, p.id
  `).all(id) as {
    id: number; name: string; parent_id: number | null; sort_order: number; lcm_code: string | null;
    industry_name: string | null; segment_name: string | null; maturity_name: string | null; hp_sort: number;
  }[];

  const depths = computeDepths(problems.map(p => ({ id: p.id, parent_id: p.parent_id })));

  return {
    ...row,
    activity_types: loadHypothesisActivityTypes(id),
    problems: problems.map(p => ({
      id: p.id,
      name: p.name,
      industry_name: p.industry_name,
      segment_name: p.segment_name,
      maturity_name: p.maturity_name,
      parent_id: p.parent_id,
      sort_order: p.hp_sort ?? p.sort_order,
      lcm_code: p.lcm_code,
      depth: depths.get(p.id) ?? 0,
      solutions: loadProblemSolutions(p.id, id),
    })),
  };
}

export function createHypothesis(
  name: string,
  target_audience?: string | null,
  maturity_id?: number | null,
  activity_type_ids?: number[],
): HypothesisDetail {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');
  const result = db.prepare(`
    INSERT INTO hypotheses(name, target_audience, maturity_id) VALUES (?,?,?)
  `).run(trimmed, target_audience?.trim() || null, maturity_id ?? null);
  const id = Number(result.lastInsertRowid);
  if (activity_type_ids?.length) syncHypothesisActivityTypes(id, activity_type_ids);
  const detail = loadHypothesisById(id);
  if (!detail) throw new Error('create failed');
  return detail;
}

function resolveProblemId(entry: HypothesisProblemInput): number {
  if (entry.problem_id) return entry.problem_id;
  const name = entry.name?.trim();
  if (!name) throw new Error('problem name or id required');
  const existing = db.prepare(`SELECT id FROM problems WHERE name=? LIMIT 1`).get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(`INSERT INTO problems(name) VALUES (?)`).run(name);
  return Number(result.lastInsertRowid);
}

function resolveSolutionId(name: string): number {
  const trimmed = name.trim();
  const existing = db.prepare(`SELECT id FROM solutions WHERE name=? LIMIT 1`).get(trimmed) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db.prepare(`INSERT INTO solutions(name) VALUES (?)`).run(trimmed);
  return Number(result.lastInsertRowid);
}

function syncProblemSolutions(problemId: number, solutionIds: number[]): void {
  const unique = [...new Set(solutionIds.filter(id => id > 0))];
  const current = db.prepare(`
    SELECT solution_id FROM problem_solution_map WHERE problem_id=?
  `).all(problemId) as { solution_id: number }[];
  const currentSet = new Set(current.map(r => r.solution_id));
  const targetSet = new Set(unique);

  const ins = db.prepare(`INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id) VALUES (?,?)`);
  const del = db.prepare(`DELETE FROM problem_solution_map WHERE problem_id=? AND solution_id=?`);

  for (const sid of unique) {
    if (!currentSet.has(sid)) ins.run(problemId, sid);
  }
  for (const sid of currentSet) {
    if (!targetSet.has(sid)) del.run(problemId, sid);
  }
}

export function saveHypothesis(
  id: number,
  data: {
    name: string;
    target_audience?: string | null;
    maturity_id?: number | null;
    activity_type_ids?: number[];
    problems?: HypothesisProblemInput[];
  },
): HypothesisDetail {
  const trimmed = data.name?.trim();
  if (!trimmed) throw new Error('name is required');
  const existing = db.prepare(`SELECT id FROM hypotheses WHERE id=?`).get(id);
  if (!existing) throw new Error('not found');

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE hypotheses SET name=?, target_audience=?, maturity_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(trimmed, data.target_audience?.trim() || null, data.maturity_id ?? null, id);

    if (data.activity_type_ids !== undefined) {
      syncHypothesisActivityTypes(id, data.activity_type_ids);
    }

    if (data.problems !== undefined) {
      db.prepare(`DELETE FROM hypothesis_problems WHERE hypothesis_id=?`).run(id);

      const insHp = db.prepare(`
        INSERT INTO hypothesis_problems(hypothesis_id, problem_id, sort_order) VALUES (?,?,?)
      `);

      for (let i = 0; i < data.problems.length; i++) {
        const entry = data.problems[i];
        const problemId = resolveProblemId(entry);

        insHp.run(id, problemId, i);

        const hasSolutionPatch = entry.solution_ids !== undefined
          || (entry.new_solutions?.length ?? 0) > 0;
        if (hasSolutionPatch) {
          const solutionIds = [...(entry.solution_ids ?? [])];
          for (const ns of entry.new_solutions ?? []) {
            if (ns.name?.trim()) solutionIds.push(resolveSolutionId(ns.name));
          }
          syncProblemSolutions(problemId, solutionIds);
        }
      }
    }
  });
  tx();
  recomputeCatalogCodes();
  recomputeHypothesisSolutionCodes(id);
  recomputeAllProblemCodes();

  const detail = loadHypothesisById(id);
  if (!detail) throw new Error('save failed');
  return detail;
}

export function deleteHypothesis(id: number): boolean {
  const row = db.prepare(`SELECT id FROM hypotheses WHERE id=?`).get(id);
  if (!row) return false;
  db.prepare(`DELETE FROM hypotheses WHERE id=?`).run(id);
  for (;;) {
    const deletedProblems = pruneProblemsWithoutHypothesis();
    const deletedSolutions = pruneSolutionsWithoutHypothesis();
    if (deletedProblems === 0 && deletedSolutions === 0) break;
  }
  return true;
}

export function createSolution(name: string): { id: number; name: string } {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');
  const existing = db.prepare(`SELECT id, name FROM solutions WHERE name=? LIMIT 1`).get(trimmed) as { id: number; name: string } | undefined;
  if (existing) return existing;
  const result = db.prepare(`INSERT INTO solutions(name) VALUES (?)`).run(trimmed);
  return { id: Number(result.lastInsertRowid), name: trimmed };
}
