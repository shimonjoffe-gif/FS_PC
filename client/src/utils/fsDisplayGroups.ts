import type { FsCatalogGroup, FsCatalogItem } from '../types';
import { compareFsByGroupPrefix, compareFsByGroupThenPrefix, compareFsPrefix } from './fsPrefixSort';

export type FsGroupable = {
  group_name?: string | null;
  phase?: string | null;
  group_prefix?: string | null;
  prefix?: string | null;
  sort_order?: number;
};

/** Группировка пунктов ФС с сортировкой разделов и пунктов по коду (префиксу). */
export function groupFsItemsSorted<T extends FsGroupable>(
  items: T[],
  groupLabel: (item: T) => string = item => item.group_name || item.phase || 'Прочее',
): { group: string; groupPrefix: string | null; items: T[] }[] {
  const sorted = [...items].sort((a, b) => compareFsByGroupThenPrefix(a, b));
  const out: { group: string; groupPrefix: string | null; items: T[] }[] = [];
  const idxByGroup = new Map<string, number>();
  for (const item of sorted) {
    const g = groupLabel(item);
    let idx = idxByGroup.get(g);
    if (idx === undefined) {
      idx = out.length;
      idxByGroup.set(g, idx);
      out.push({ group: g, groupPrefix: item.group_prefix ?? null, items: [] });
    }
    const block = out[idx];
    if (!block.groupPrefix && item.group_prefix) block.groupPrefix = item.group_prefix;
    block.items.push(item);
  }
  return out;
}

export function buildFsDisplayGroups(groups: FsCatalogGroup[], items: FsCatalogItem[]) {
  const itemsByPrefix = new Map<string, FsCatalogItem[]>();
  for (const item of items) {
    const key = item.group_prefix ?? '';
    const list = itemsByPrefix.get(key) ?? [];
    list.push(item);
    itemsByPrefix.set(key, list);
  }

  const sortedGroups = [...groups].sort((a, b) =>
    compareFsByGroupPrefix({ group_prefix: a.group_prefix }, { group_prefix: b.group_prefix })
    || a.id - b.id,
  );
  const knownPrefixes = new Set(sortedGroups.map(g => g.group_prefix));

  const orphanPrefixes = [...itemsByPrefix.keys()]
    .filter(p => p && !knownPrefixes.has(p))
    .sort((a, b) => compareFsByGroupPrefix({ group_prefix: a }, { group_prefix: b }));
  for (const prefix of orphanPrefixes) {
    const sample = itemsByPrefix.get(prefix)?.[0];
    sortedGroups.push({
      id: -1,
      group_prefix: prefix,
      group_name: sample?.group_name ?? sample?.phase ?? prefix,
      sort_order: 9999,
    });
  }

  return sortedGroups.map(group => ({
    ...group,
    items: [...(itemsByPrefix.get(group.group_prefix) ?? [])].sort((a, b) => compareFsPrefix(a, b)),
  }));
}

export function filterFsCatalogItems(items: FsCatalogItem[]): FsCatalogItem[] {
  return items.filter(item =>
    (!item.item_type || item.item_type === 'item')
    && Number(item.published ?? 1) === 1,
  );
}
