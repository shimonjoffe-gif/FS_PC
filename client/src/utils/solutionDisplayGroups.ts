import type { Solution } from '../types';
import { compareCatalogCode } from './catalogCodeSort';

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
    .sort(compareCatalogCode);

  for (const root of roots) {
    const children = items
      .filter(c => c.parent_id === root.id)
      .sort(compareCatalogCode);
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
    const itemA = a.kind === 'group' ? a.parent : a.item;
    const itemB = b.kind === 'group' ? b.parent : b.item;
    return compareCatalogCode(itemA, itemB);
  });

  return units;
}
