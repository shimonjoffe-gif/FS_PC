import { db } from './db';
import { recomputeAllSolutionCodes } from './solutionNumbering';

export interface SolutionRow {
  id: number;
  name: string;
  description: string | null;
  hypothesis: string | null;
  parent_id: number | null;
  sort_order: number;
  lcm_code: string | null;
  catalog_code: string | null;
  fs_mapped: boolean;
  used_in_hypotheses: string[];
  hypothesis_codes: Record<string, string>;
}

export interface SolutionProblemUsage {
  id: number;
  name: string;
  parent_id: number | null;
  lcm_code: string | null;
  catalog_code: string | null;
  hypothesis_code: string | null;
  sort_order: number;
  linked: boolean;
}

export interface SolutionHypothesisUsage {
  hypothesis_id: number;
  hypothesis_name: string;
  code: string | null;
  problems: SolutionProblemUsage[];
}

export interface SolutionDetail extends SolutionRow {
  hypothesis_usages: SolutionHypothesisUsage[];
}

export function normalizeSolutionName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSolutionRow<T extends { fs_mapped?: number | boolean | null }>(row: T): Omit<T, 'fs_mapped'> & { fs_mapped: boolean } {
  return { ...row, fs_mapped: Boolean(row.fs_mapped) };
}

export function listSolutionsCatalog(): SolutionRow[] {
  const rows = (db.prepare(`
    SELECT id, name, description, hypothesis, parent_id, sort_order, lcm_code, catalog_code, fs_mapped
    FROM solutions
    ORDER BY sort_order, id
  `).all() as Omit<SolutionRow, 'used_in_hypotheses' | 'hypothesis_codes'>[]).map(normalizeSolutionRow);

  const usageMap = new Map<number, string[]>();
  const usageRows = db.prepare(`
    SELECT DISTINCT psm.solution_id, h.name AS hypothesis_name
    FROM problem_solution_map psm
    JOIN hypothesis_problems hp ON hp.problem_id = psm.problem_id
    JOIN hypotheses h ON h.id = hp.hypothesis_id
    ORDER BY h.name
  `).all() as { solution_id: number; hypothesis_name: string }[];

  for (const row of usageRows) {
    const list = usageMap.get(row.solution_id) ?? [];
    list.push(row.hypothesis_name);
    usageMap.set(row.solution_id, list);
  }

  const codeMap = new Map<number, Record<string, string>>();
  const codeRows = db.prepare(`
    SELECT shc.solution_id, h.name AS hypothesis_name, shc.code
    FROM solution_hypothesis_codes shc
    JOIN hypotheses h ON h.id = shc.hypothesis_id
  `).all() as { solution_id: number; hypothesis_name: string; code: string }[];

  for (const row of codeRows) {
    const codes = codeMap.get(row.solution_id) ?? {};
    codes[row.hypothesis_name] = row.code;
    codeMap.set(row.solution_id, codes);
  }

  return rows.map(row => ({
    ...row,
    used_in_hypotheses: usageMap.get(row.id) ?? [],
    hypothesis_codes: codeMap.get(row.id) ?? {},
  }));
}

export function loadSolutionById(id: number): SolutionDetail | null {
  const raw = db.prepare(`
    SELECT id, name, description, hypothesis, parent_id, sort_order, lcm_code, catalog_code, fs_mapped
    FROM solutions WHERE id=?
  `).get(id) as Omit<SolutionRow, 'used_in_hypotheses' | 'hypothesis_codes'> | undefined;
  if (!raw) return null;
  const row = normalizeSolutionRow(raw);

  const hypCodeRows = db.prepare(`
    SELECT hypothesis_id, code FROM solution_hypothesis_codes WHERE solution_id=?
  `).all(id) as { hypothesis_id: number; code: string }[];
  const hypCodeById = new Map(hypCodeRows.map(r => [r.hypothesis_id, r.code]));

  const usageRows = db.prepare(`
    SELECT DISTINCT
      h.id as hypothesis_id,
      h.name as hypothesis_name,
      p.id as problem_id,
      p.name as problem_name,
      p.parent_id as problem_parent_id,
      p.lcm_code,
      p.catalog_code,
      COALESCE(hp.sort_order, p.sort_order, 0) as problem_sort
    FROM problem_solution_map psm
    JOIN problems p ON p.id = psm.problem_id
    JOIN hypothesis_problems hp ON hp.problem_id = p.id
    JOIN hypotheses h ON h.id = hp.hypothesis_id
    WHERE psm.solution_id=?
    ORDER BY h.name, problem_sort, p.id
  `).all(id) as {
    hypothesis_id: number;
    hypothesis_name: string;
    problem_id: number;
    problem_name: string;
    problem_parent_id: number | null;
    lcm_code: string | null;
    catalog_code: string | null;
    problem_sort: number;
  }[];

  const byHypothesis = new Map<number, SolutionHypothesisUsage>();
  for (const usage of usageRows) {
    let entry = byHypothesis.get(usage.hypothesis_id);
    if (!entry) {
      entry = {
        hypothesis_id: usage.hypothesis_id,
        hypothesis_name: usage.hypothesis_name,
        code: hypCodeById.get(usage.hypothesis_id) ?? null,
        problems: [],
      };
      byHypothesis.set(usage.hypothesis_id, entry);
    }
    entry.problems.push({
      id: usage.problem_id,
      name: usage.problem_name,
      parent_id: usage.problem_parent_id,
      lcm_code: usage.lcm_code,
      catalog_code: usage.catalog_code,
      hypothesis_code: null,
      sort_order: usage.problem_sort,
      linked: true,
    });
  }

  for (const entry of byHypothesis.values()) {
    const byId = new Map(entry.problems.map(p => [p.id, p]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of [...byId.values()]) {
        if (!item.parent_id || byId.has(item.parent_id)) continue;
        const parent = db.prepare(`
          SELECT id, name, parent_id, lcm_code, catalog_code, sort_order
          FROM problems WHERE id=?
        `).get(item.parent_id) as {
          id: number; name: string; parent_id: number | null;
          lcm_code: string | null; catalog_code: string | null; sort_order: number;
        } | undefined;
        if (!parent) continue;
        byId.set(parent.id, {
          id: parent.id,
          name: parent.name,
          parent_id: parent.parent_id,
          lcm_code: parent.lcm_code,
          catalog_code: parent.catalog_code,
          hypothesis_code: null,
          sort_order: parent.sort_order,
          linked: false,
        });
        changed = true;
      }
    }

    const ids = [...byId.keys()];
    if (ids.length > 0) {
      const codeRows = db.prepare(`
        SELECT problem_id, code FROM problem_hypothesis_codes
        WHERE hypothesis_id=? AND problem_id IN (${ids.map(() => '?').join(',')})
      `).all(entry.hypothesis_id, ...ids) as { problem_id: number; code: string }[];
      for (const row of codeRows) {
        const prob = byId.get(row.problem_id);
        if (prob) prob.hypothesis_code = row.code;
      }
    }

    entry.problems = [...byId.values()];
  }

  return {
    ...row,
    used_in_hypotheses: [...byHypothesis.values()].map(u => u.hypothesis_name),
    hypothesis_codes: Object.fromEntries(
      [...byHypothesis.values()].map(u => [u.hypothesis_name, u.code ?? '']),
    ),
    hypothesis_usages: [...byHypothesis.values()],
  };
}

export interface SolutionInput {
  name: string;
  description?: string | null;
  hypothesis?: string | null;
  parent_id?: number | null;
  lcm_code?: string | null;
  fs_mapped?: boolean;
}

function nextSortOrder(): number {
  const row = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM solutions`).get() as { next: number };
  return row.next;
}

export function findSolutionByName(name: string): { id: number } | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return db.prepare(`SELECT id FROM solutions WHERE name=? LIMIT 1`).get(trimmed) as { id: number } | undefined;
}

export type SolutionFsLinkType = 'required' | 'optional';

export interface SolutionFsLink {
  fs_item_id: number;
  link_type: SolutionFsLinkType;
}

export function getSolutionFsLinks(solutionId: number): SolutionFsLink[] {
  return (db.prepare(`
    SELECT fs_item_id, link_type FROM solution_fs_map WHERE solution_id=? ORDER BY fs_item_id
  `).all(solutionId) as { fs_item_id: number; link_type: string }[]).map(r => ({
    fs_item_id: r.fs_item_id,
    link_type: r.link_type === 'optional' ? 'optional' : 'required',
  }));
}

export function getSolutionFsItemIds(solutionId: number): number[] {
  return getSolutionFsLinks(solutionId).map(r => r.fs_item_id);
}

function normalizeSolutionFsLinks(links: SolutionFsLink[]): SolutionFsLink[] {
  const byId = new Map<number, SolutionFsLinkType>();
  for (const link of links) {
    if (link.fs_item_id <= 0) continue;
    byId.set(link.fs_item_id, link.link_type === 'optional' ? 'optional' : 'required');
  }
  return [...byId.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fs_item_id, link_type]) => ({ fs_item_id, link_type }));
}

function isPublishedFsItem(fsItemId: number): boolean {
  const row = db.prepare(`
    SELECT id FROM fs_catalog
    WHERE id=? AND published=1 AND COALESCE(is_deleted, 0)=0
      AND (item_type IS NULL OR item_type='item')
  `).get(fsItemId);
  return Boolean(row);
}

export function syncSolutionFsLinks(solutionId: number, links: SolutionFsLink[]): SolutionFsLink[] {
  const existing = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(solutionId);
  if (!existing) throw new Error('not found');
  const unique = normalizeSolutionFsLinks(links).filter(link => isPublishedFsItem(link.fs_item_id));
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM solution_fs_map WHERE solution_id=?`).run(solutionId);
    const ins = db.prepare(`INSERT OR IGNORE INTO solution_fs_map(solution_id, fs_item_id, link_type) VALUES (?,?,?)`);
    for (const link of unique) ins.run(solutionId, link.fs_item_id, link.link_type);
  });
  tx();
  return unique;
}

/** @deprecated use syncSolutionFsLinks with link types */
export function syncSolutionFsItemIds(solutionId: number, fsItemIds: number[]): number[] {
  return syncSolutionFsLinks(
    solutionId,
    fsItemIds.map(fs_item_id => ({ fs_item_id, link_type: 'required' as const })),
  ).map(r => r.fs_item_id);
}

export function getSolutionWidgetIds(solutionId: number): number[] {
  return (db.prepare(`
    SELECT widget_id FROM solution_widget_map WHERE solution_id=? ORDER BY widget_id
  `).all(solutionId) as { widget_id: number }[]).map(r => r.widget_id);
}

export function syncSolutionWidgetLinks(solutionId: number, widgetIds: number[]): number[] {
  const existing = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(solutionId);
  if (!existing) throw new Error('not found');
  const unique = [...new Set(widgetIds.filter(id => id > 0))];
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM solution_widget_map WHERE solution_id=?`).run(solutionId);
    const ins = db.prepare(`INSERT OR IGNORE INTO solution_widget_map(solution_id, widget_id) VALUES (?,?)`);
    for (const widgetId of unique) ins.run(solutionId, widgetId);
  });
  tx();
  return unique;
}

export function createSolutionCatalog(input: SolutionInput): SolutionDetail {
  const name = input.name?.trim();
  if (!name) throw new Error('name is required');
  if (input.parent_id) {
    const parent = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(input.parent_id);
    if (!parent) throw new Error('parent not found');
  }
  if (findSolutionByName(name)) throw new Error('решение с таким названием уже есть');
  const result = db.prepare(`
    INSERT INTO solutions(name, description, hypothesis, parent_id, sort_order, lcm_code, fs_mapped)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    name,
    input.description?.trim() || null,
    input.hypothesis?.trim() || null,
    input.parent_id ?? null,
    nextSortOrder(),
    input.lcm_code?.trim() || null,
    input.fs_mapped ? 1 : 0,
  );
  const detail = loadSolutionById(Number(result.lastInsertRowid));
  if (!detail) throw new Error('create failed');
  recomputeAllSolutionCodes();
  return loadSolutionById(detail.id) ?? detail;
}

export function updateSolution(id: number, input: Partial<SolutionInput>): SolutionDetail | null {
  const existing = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(id);
  if (!existing) return null;

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) throw new Error('name is required');

  if (input.parent_id !== undefined && input.parent_id !== null) {
    if (input.parent_id === id) throw new Error('solution cannot be its own parent');
    const parent = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(input.parent_id);
    if (!parent) throw new Error('parent not found');
    let cursor: number | null = input.parent_id;
    while (cursor) {
      if (cursor === id) throw new Error('circular parent reference');
      const row = db.prepare(`SELECT parent_id FROM solutions WHERE id=?`).get(cursor) as { parent_id: number | null } | undefined;
      cursor = row?.parent_id ?? null;
    }
  }

  const current = db.prepare(`SELECT * FROM solutions WHERE id=?`).get(id) as SolutionRow;
  db.prepare(`
    UPDATE solutions SET
      name=COALESCE(?, name),
      description=?,
      hypothesis=?,
      parent_id=?,
      lcm_code=?,
      fs_mapped=?
    WHERE id=?
  `).run(
    name ?? null,
    input.description !== undefined ? (input.description?.trim() || null) : current.description,
    input.hypothesis !== undefined ? (input.hypothesis?.trim() || null) : current.hypothesis,
    input.parent_id !== undefined ? input.parent_id : current.parent_id,
    input.lcm_code !== undefined ? (input.lcm_code?.trim() || null) : current.lcm_code,
    input.fs_mapped !== undefined ? (input.fs_mapped ? 1 : 0) : (current.fs_mapped ? 1 : 0),
    id,
  );

  recomputeAllSolutionCodes();
  return loadSolutionById(id);
}

function deleteSolutionSubtree(id: number): void {
  const children = db.prepare(`SELECT id FROM solutions WHERE parent_id=?`).all(id) as { id: number }[];
  for (const child of children) deleteSolutionSubtree(child.id);
  deleteSolutionRow(id);
}

export function deleteSolution(id: number): boolean {
  const existing = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(id);
  if (!existing) return false;
  const tx = db.transaction(() => deleteSolutionSubtree(id));
  tx();
  recomputeAllSolutionCodes();
  return true;
}

/** Удаляет решения, связанные только с одной гипотезой (общие не трогает). */
export function deleteSolutionsExclusiveToHypothesis(hypothesisName: string): { deleted: number; skipped_shared: number } {
  const hyp = db.prepare(`SELECT id FROM hypotheses WHERE name=?`).get(hypothesisName) as { id: number } | undefined;
  if (!hyp) return { deleted: 0, skipped_shared: 0 };

  const candidateIds = db.prepare(`
    SELECT DISTINCT psm.solution_id AS id FROM problem_solution_map psm
    JOIN hypothesis_problems hp ON hp.problem_id = psm.problem_id
    WHERE hp.hypothesis_id = ?
  `).all(hyp.id) as { id: number }[];

  let deleted = 0;
  let skippedShared = 0;
  const tx = db.transaction(() => {
    for (const { id } of candidateIds) {
      const hyps = db.prepare(`
        SELECT DISTINCT h.name FROM problem_solution_map psm
        JOIN hypothesis_problems hp ON hp.problem_id = psm.problem_id
        JOIN hypotheses h ON h.id = hp.hypothesis_id
        WHERE psm.solution_id = ?
      `).all(id) as { name: string }[];
      if (hyps.length !== 1 || hyps[0].name !== hypothesisName) {
        skippedShared++;
        continue;
      }
      deleteSolutionSubtree(id);
      deleted++;
    }
  });
  tx();
  recomputeAllSolutionCodes();
  return { deleted, skipped_shared: skippedShared };
}

function mergeSolutionInto(canonicalId: number, duplicateId: number): void {
  if (canonicalId === duplicateId) return;

  const problemLinks = db.prepare(`SELECT problem_id FROM problem_solution_map WHERE solution_id=?`)
    .all(duplicateId) as { problem_id: number }[];
  for (const { problem_id } of problemLinks) {
    db.prepare(`INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id) VALUES (?,?)`)
      .run(problem_id, canonicalId);
  }
  db.prepare(`DELETE FROM problem_solution_map WHERE solution_id=?`).run(duplicateId);

  db.prepare(`
    UPDATE briefing_solution_sel SET solution_id=?
    WHERE solution_id=? AND briefing_id NOT IN (
      SELECT briefing_id FROM briefing_solution_sel WHERE solution_id=?
    )
  `).run(canonicalId, duplicateId, canonicalId);
  db.prepare(`DELETE FROM briefing_solution_sel WHERE solution_id=?`).run(duplicateId);

  db.prepare(`
    INSERT OR IGNORE INTO solution_widget_map(solution_id, widget_id)
    SELECT ?, widget_id FROM solution_widget_map WHERE solution_id=?
  `).run(canonicalId, duplicateId);
  db.prepare(`DELETE FROM solution_widget_map WHERE solution_id=?`).run(duplicateId);

  db.prepare(`
    INSERT OR IGNORE INTO solution_fs_map(solution_id, fs_item_id, link_type)
    SELECT ?, fs_item_id, link_type FROM solution_fs_map WHERE solution_id=?
  `).run(canonicalId, duplicateId);
  db.prepare(`DELETE FROM solution_fs_map WHERE solution_id=?`).run(duplicateId);

  db.prepare(`
    UPDATE briefing_widget_sel SET solution_id=?
    WHERE solution_id=? AND (briefing_id, widget_id) NOT IN (
      SELECT briefing_id, widget_id FROM briefing_widget_sel WHERE solution_id=?
    )
  `).run(canonicalId, duplicateId, canonicalId);
  db.prepare(`DELETE FROM briefing_widget_sel WHERE solution_id=?`).run(duplicateId);

  db.prepare(`UPDATE solutions SET parent_id=? WHERE parent_id=?`).run(canonicalId, duplicateId);
  deleteSolutionRow(duplicateId);
}

/** Объединяет дубли по нормализованному названию, перепривязывает проблематики. */
export function deduplicateSolutions(): { groups: number; deleted: number } {
  const all = db.prepare(`SELECT id, name FROM solutions`).all() as { id: number; name: string }[];
  const byNorm = new Map<string, number[]>();
  for (const row of all) {
    const key = normalizeSolutionName(row.name);
    const list = byNorm.get(key) ?? [];
    list.push(row.id);
    byNorm.set(key, list);
  }

  let groups = 0;
  let deleted = 0;
  const tx = db.transaction(() => {
    for (const ids of byNorm.values()) {
      if (ids.length < 2) continue;
      groups++;
      const scored = ids.map(id => {
        const links = (db.prepare(`SELECT COUNT(*) c FROM problem_solution_map WHERE solution_id=?`)
          .get(id) as { c: number }).c;
        return { id, links };
      }).sort((a, b) => b.links - a.links || a.id - b.id);
      const canonicalId = scored[0].id;
      for (const dup of scored.slice(1)) {
        mergeSolutionInto(canonicalId, dup.id);
        deleted++;
      }
    }
    db.prepare(`UPDATE solutions SET hypothesis=NULL`).run();
  });
  tx();
  recomputeAllSolutionCodes();
  return { groups, deleted };
}

/** Удаляет решения без связей с проблематиками, которых нет в LCM-файлах. */
export function pruneOrphanSolutions(allowedNames: Set<string>): number {
  const orphans = db.prepare(`
    SELECT s.id, s.name FROM solutions s
    WHERE s.id NOT IN (SELECT DISTINCT solution_id FROM problem_solution_map)
  `).all() as { id: number; name: string }[];

  let deleted = 0;
  const tx = db.transaction(() => {
    for (const row of orphans) {
      if (allowedNames.has(normalizeSolutionName(row.name))) continue;
      db.prepare(`DELETE FROM briefing_solution_sel WHERE solution_id=?`).run(row.id);
      db.prepare(`DELETE FROM solution_widget_map WHERE solution_id=?`).run(row.id);
      db.prepare(`DELETE FROM solution_fs_map WHERE solution_id=?`).run(row.id);
      db.prepare(`UPDATE solutions SET parent_id=NULL WHERE parent_id=?`).run(row.id);
      db.prepare(`DELETE FROM solutions WHERE id=?`).run(row.id);
      deleted++;
    }
  });
  tx();
  recomputeAllSolutionCodes();
  return deleted;
}

/** Удаляет решения, не связанные ни с одной гипотезой (через проблематики). */
export function pruneSolutionsWithoutHypothesis(): number {
  let totalDeleted = 0;
  for (;;) {
    const linkedIds = new Set(
      (db.prepare(`
        SELECT DISTINCT psm.solution_id AS id
        FROM problem_solution_map psm
        JOIN hypothesis_problems hp ON hp.problem_id = psm.problem_id
      `).all() as { id: number }[]).map(r => r.id),
    );

    const rows = db.prepare(`SELECT id, parent_id FROM solutions`).all() as { id: number; parent_id: number | null }[];
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
        if (!db.prepare(`SELECT id FROM solutions WHERE id=?`).get(row.id)) continue;
        deleteSolutionRow(row.id);
        totalDeleted++;
      }
    });
    tx();
  }
  recomputeAllSolutionCodes();
  return totalDeleted;
}

function deleteSolutionRow(id: number): void {
  db.prepare(`DELETE FROM problem_solution_map WHERE solution_id=?`).run(id);
  db.prepare(`DELETE FROM briefing_solution_sel WHERE solution_id=?`).run(id);
  db.prepare(`DELETE FROM solution_widget_map WHERE solution_id=?`).run(id);
  db.prepare(`DELETE FROM solution_fs_map WHERE solution_id=?`).run(id);
  db.prepare(`UPDATE solutions SET parent_id=NULL WHERE parent_id=?`).run(id);
  db.prepare(`DELETE FROM solutions WHERE id=?`).run(id);
}

/** Удаляет решения гипотезы, не связанные с её проблематиками (и не являющиеся родителями связанных). */
export function pruneUnlinkedSolutionsForHypothesis(hypothesisId: number, hypothesisName: string): number {
  const linkedRows = db.prepare(`
    SELECT DISTINCT psm.solution_id AS id FROM hypothesis_problems hp
    JOIN problem_solution_map psm ON psm.problem_id = hp.problem_id
    WHERE hp.hypothesis_id=?
  `).all(hypothesisId) as { id: number }[];

  const keepIds = new Set(linkedRows.map(r => r.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...keepIds]) {
      const row = db.prepare(`SELECT parent_id FROM solutions WHERE id=?`).get(id) as { parent_id: number | null } | undefined;
      if (row?.parent_id && !keepIds.has(row.parent_id)) {
        keepIds.add(row.parent_id);
        changed = true;
      }
    }
  }

  const candidates = db.prepare(`
    SELECT id FROM solutions WHERE hypothesis=? OR id IN (
      SELECT DISTINCT psm.solution_id FROM hypothesis_problems hp
      JOIN problem_solution_map psm ON psm.problem_id = hp.problem_id
      WHERE hp.hypothesis_id=?
    )
  `).all(hypothesisName, hypothesisId) as { id: number }[];

  let deleted = 0;
  const tx = db.transaction(() => {
    for (const row of candidates) {
      if (keepIds.has(row.id)) continue;
      deleteSolutionRow(row.id);
      deleted++;
    }
  });
  tx();
  recomputeAllSolutionCodes();
  return deleted;
}
