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

/** Сквозная нумерация проблематик по глобальному дереву. */
export function recomputeProblemCatalogCodes(): number {
  const items = db.prepare(`
    SELECT id, parent_id, sort_order FROM problems
  `).all() as NumberedItem[];
  if (!items.length) return 0;

  const idSet = new Set(items.map(i => i.id));
  const roots = findRoots(items, idSet);
  const codes = assignTreeCodes(items, roots);

  const tx = db.transaction(() => {
    for (const item of items) {
      const code = codes.get(item.id) ?? null;
      db.prepare(`UPDATE problems SET catalog_code=? WHERE id=?`).run(code, item.id);
    }
  });
  tx();
  return codes.size;
}

/** Нумерация проблематик внутри каждой гипотезы. */
export function recomputeHypothesisProblemCodes(hypothesisId?: number): number {
  const hypotheses = hypothesisId
    ? db.prepare(`SELECT id FROM hypotheses WHERE id=?`).all(hypothesisId) as { id: number }[]
    : db.prepare(`SELECT id FROM hypotheses`).all() as { id: number }[];

  let assigned = 0;
  const tx = db.transaction(() => {
    if (!hypothesisId) {
      db.prepare(`DELETE FROM problem_hypothesis_codes`).run();
    } else {
      db.prepare(`DELETE FROM problem_hypothesis_codes WHERE hypothesis_id=?`).run(hypothesisId);
    }

    for (const hyp of hypotheses) {
      const linked = db.prepare(`
        SELECT p.id, p.parent_id, hp.sort_order AS sort_order
        FROM hypothesis_problems hp
        JOIN problems p ON p.id = hp.problem_id
        WHERE hp.hypothesis_id=?
      `).all(hyp.id) as NumberedItem[];

      if (!linked.length) continue;

      const idSet = new Set(linked.map(r => r.id));
      const allItems = [...linked];

      const expanded = new Set(idSet);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of [...allItems]) {
          if (item.parent_id && !expanded.has(item.parent_id)) {
            const parent = db.prepare(`
              SELECT p.id, p.parent_id,
                     COALESCE(
                       (SELECT hp.sort_order FROM hypothesis_problems hp
                        WHERE hp.hypothesis_id=? AND hp.problem_id=p.id),
                       p.sort_order
                     ) AS sort_order
              FROM problems p WHERE p.id=?
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
        INSERT INTO problem_hypothesis_codes(problem_id, hypothesis_id, code) VALUES (?,?,?)
      `);
      for (const [problemId, code] of codes) {
        if (!expandedSet.has(problemId)) continue;
        ins.run(problemId, hyp.id, code);
        assigned++;
      }
    }
  });
  tx();
  return assigned;
}

export function recomputeAllProblemCodes(): void {
  recomputeProblemCatalogCodes();
  recomputeHypothesisProblemCodes();
}
