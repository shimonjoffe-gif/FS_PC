import type { Solution } from '../types';

export type SolutionDisplayUnit =
  | { kind: 'group'; parent: Solution; children: Solution[] }
  | { kind: 'standalone'; item: Solution };

export function collectSolutionWithAncestors(items: Solution[], matchIds: Set<number>): Set<number> {
  const byId = new Map(items.map(s => [s.id, s]));
  const result = new Set<number>();
  for (const id of matchIds) {
    let cursor: number | null = id;
    while (cursor) {
      if (result.has(cursor)) break;
      result.add(cursor);
      const row = byId.get(cursor);
      cursor = row?.parent_id ?? null;
    }
  }
  return result;
}

export function buildSolutionDisplayUnits(items: Solution[]): SolutionDisplayUnit[] {
  const byId = new Map(items.map(s => [s.id, s]));
  const units: SolutionDisplayUnit[] = [];
  const consumed = new Set<number>();

  const roots = items
    .filter(s => !s.parent_id || !byId.has(s.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

  for (const root of roots) {
    const children = items
      .filter(c => c.parent_id === root.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    if (children.length > 0) {
      units.push({ kind: 'group', parent: root, children });
      consumed.add(root.id);
      for (const child of children) consumed.add(child.id);
    }
  }

  for (const item of items) {
    if (!consumed.has(item.id)) {
      units.push({ kind: 'standalone', item });
    }
  }

  units.sort((a, b) => {
    const orderA = a.kind === 'group' ? (a.parent.sort_order ?? 0) : (a.item.sort_order ?? 0);
    const orderB = b.kind === 'group' ? (b.parent.sort_order ?? 0) : (b.item.sort_order ?? 0);
    return orderA - orderB || (a.kind === 'group' ? a.parent.id : a.item.id) - (b.kind === 'group' ? b.parent.id : b.item.id);
  });

  return units;
}
