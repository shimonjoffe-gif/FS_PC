import { db } from './db';

export interface NumberedItem {
  id: number;
  parent_id: number | null;
  sort_order: number;
}

function childCode(parentCode: string, childIndex: number): string {
  const inner = parentCode.replace(/\.$/, '');
  return `${inner}.${childIndex}.`;
}

function assignTreeCodes(
  items: NumberedItem[],
  roots: NumberedItem[],
): Map<number, string> {
  const byParent = new Map<number | null, NumberedItem[]>();
  for (const item of items) {
    const key = item.parent_id;
    const list = byParent.get(key) ?? [];
    list.push(item);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  }

  const codes = new Map<number, string>();

  function walkChildren(parentId: number, parentCode: string): void {
    const children = byParent.get(parentId) ?? [];
    children.forEach((child, idx) => {
      const code = childCode(parentCode, idx + 1);
      codes.set(child.id, code);
      walkChildren(child.id, code);
    });
  }

  const sortedRoots = [...roots].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  sortedRoots.forEach((root, idx) => {
    const code = `${idx + 1}.`;
    codes.set(root.id, code);
    walkChildren(root.id, code);
  });

  return codes;
}

function findRoots(items: NumberedItem[], idSet: Set<number>): NumberedItem[] {
  return items.filter(item => {
    if (!idSet.has(item.id)) return false;
    if (!item.parent_id) return true;
    return !idSet.has(item.parent_id);
  });
}

/** Сквозная нумерация решений по глобальному дереву (1., 1.1., 1.2., 2., …). */
export function recomputeCatalogCodes(): number {
  const items = db.prepare(`
    SELECT id, parent_id, sort_order FROM solutions
  `).all() as NumberedItem[];
  if (!items.length) return 0;

  const idSet = new Set(items.map(i => i.id));
  const roots = findRoots(items, idSet);
  const codes = assignTreeCodes(items, roots);

  const tx = db.transaction(() => {
    for (const item of items) {
      const code = codes.get(item.id) ?? null;
      db.prepare(`UPDATE solutions SET catalog_code=? WHERE id=?`).run(code, item.id);
    }
  });
  tx();
  return codes.size;
}

/** Нумерация решений внутри каждой гипотезы (отдельная от сквозной). */
export function recomputeHypothesisSolutionCodes(hypothesisId?: number): number {
  const hypotheses = hypothesisId
    ? db.prepare(`SELECT id FROM hypotheses WHERE id=?`).all(hypothesisId) as { id: number }[]
    : db.prepare(`SELECT id FROM hypotheses`).all() as { id: number }[];

  let assigned = 0;
  const tx = db.transaction(() => {
    if (!hypothesisId) {
      db.prepare(`DELETE FROM solution_hypothesis_codes`).run();
    } else {
      db.prepare(`DELETE FROM solution_hypothesis_codes WHERE hypothesis_id=?`).run(hypothesisId);
    }

    for (const hyp of hypotheses) {
      const linked = db.prepare(`
        SELECT s.id, s.parent_id, hs.sort_order AS sort_order
        FROM hypothesis_solutions hs
        JOIN solutions s ON s.id = hs.solution_id
        WHERE hs.hypothesis_id=?
      `).all(hyp.id) as NumberedItem[];

      // Fallback: solutions linked via problems if hypothesis_solutions empty for this hyp
      const items = linked.length
        ? linked
        : (db.prepare(`
            SELECT DISTINCT s.id, s.parent_id, s.sort_order
            FROM problem_solution_map psm
            JOIN hypothesis_problems hp ON hp.problem_id = psm.problem_id
            JOIN solutions s ON s.id = psm.solution_id
            WHERE hp.hypothesis_id=?
          `).all(hyp.id) as NumberedItem[]);

      if (!items.length) continue;

      const idSet = new Set(items.map(r => r.id));
      const allItems = [...items];

      // Включить предков, попадающих в цепочку
      const expanded = new Set(idSet);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of [...allItems]) {
          if (item.parent_id && !expanded.has(item.parent_id)) {
            const parent = db.prepare(`
              SELECT s.id, s.parent_id,
                     COALESCE(
                       (SELECT hs.sort_order FROM hypothesis_solutions hs
                        WHERE hs.hypothesis_id=? AND hs.solution_id=s.id),
                       s.sort_order
                     ) AS sort_order
              FROM solutions s WHERE s.id=?
            `).get(hyp.id, item.parent_id) as NumberedItem | undefined;
            if (parent) {
              expanded.add(parent.id);
              if (!allItems.some(i => i.id === parent.id)) allItems.push(parent);
              changed = true;
            }
          }
        }
      }

      const expandedSet = new Set(allItems.map(i => i.id));
      const roots = findRoots(allItems, expandedSet);
      const codes = assignTreeCodes(allItems, roots);

      const ins = db.prepare(`
        INSERT INTO solution_hypothesis_codes(solution_id, hypothesis_id, code) VALUES (?,?,?)
      `);
      for (const [solutionId, code] of codes) {
        if (!expandedSet.has(solutionId)) continue;
        ins.run(solutionId, hyp.id, code);
        assigned++;
      }
    }
  });
  tx();
  return assigned;
}

export function recomputeAllSolutionCodes(): void {
  recomputeCatalogCodes();
  recomputeHypothesisSolutionCodes();
}

export function getHypothesisCode(solutionId: number, hypothesisId: number): string | null {
  const row = db.prepare(`
    SELECT code FROM solution_hypothesis_codes WHERE solution_id=? AND hypothesis_id=?
  `).get(solutionId, hypothesisId) as { code: string } | undefined;
  return row?.code ?? null;
}
