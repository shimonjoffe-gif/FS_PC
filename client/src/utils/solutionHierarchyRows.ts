import { catalogCodeParts } from './catalogCodeSort';
import { formatTreeCode } from './treeNumbering';

export type SolutionHierarchySortBy = 'catalog' | 'lcm';

export interface SolutionHierarchyInput {
  id: number;
  name: string;
  parent_id?: number | null;
  catalog_code?: string | null;
  /** LCM / hypothesis-scoped code */
  hypothesis_code?: string | null;
  lcm_code?: string | null;
  sort_order?: number;
  linked?: boolean;
}

export interface SolutionHierarchyRow {
  id: number;
  name: string;
  catalogCode: string;
  lcmCode: string;
  depth: number;
  linked: boolean;
}

function compareCode(a: string, b: string): number {
  const pa = catalogCodeParts(a || null);
  const pb = catalogCodeParts(b || null);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? Number.MAX_SAFE_INTEGER) - (pb[i] ?? Number.MAX_SAFE_INTEGER);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sortKey(item: SolutionHierarchyInput, sortBy: SolutionHierarchySortBy): string {
  if (sortBy === 'lcm') {
    return item.hypothesis_code || item.lcm_code || item.catalog_code || '';
  }
  return item.catalog_code || item.lcm_code || '';
}

/**
 * Строит иерархический список: связанные + предки.
 * Сортировка соседей — по сквозному или LCM-коду (в зависимости от контекста открытия карточки).
 */
export function buildSolutionHierarchyRows(
  items: SolutionHierarchyInput[],
  sortBy: SolutionHierarchySortBy,
  catalog?: SolutionHierarchyInput[],
): SolutionHierarchyRow[] {
  const byId = new Map<number, SolutionHierarchyInput>();
  for (const item of items) byId.set(item.id, { ...item, linked: item.linked !== false });

  if (catalog?.length) {
    const catalogById = new Map(catalog.map(s => [s.id, s]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of [...byId.values()]) {
        if (!item.parent_id || byId.has(item.parent_id)) continue;
        const parent = catalogById.get(item.parent_id);
        if (!parent) continue;
        byId.set(parent.id, {
          ...parent,
          linked: false,
          hypothesis_code: parent.hypothesis_code ?? null,
        });
        changed = true;
      }
    }
  }

  const idSet = new Set(byId.keys());
  const byParent = new Map<number | null, SolutionHierarchyInput[]>();
  for (const item of byId.values()) {
    const key = item.parent_id != null && idSet.has(item.parent_id) ? item.parent_id : null;
    const list = byParent.get(key) ?? [];
    list.push(item);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const cmp = compareCode(sortKey(a, sortBy), sortKey(b, sortBy));
      if (cmp !== 0) return cmp;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id || a.name.localeCompare(b.name, 'ru');
    });
  }

  const rows: SolutionHierarchyRow[] = [];
  function walk(parentId: number | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      const catalogCode = formatTreeCode(child.catalog_code ?? '') || '—';
      const lcmRaw = child.hypothesis_code || child.lcm_code || '';
      rows.push({
        id: child.id,
        name: child.name,
        catalogCode,
        lcmCode: formatTreeCode(lcmRaw) || '—',
        depth,
        linked: child.linked !== false,
      });
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}
