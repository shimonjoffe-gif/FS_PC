import type { FsCatalogGroup, FsCatalogItem } from '../types';
import { compareFsPrefix } from './fsPrefixSort';

export function buildFsDisplayGroups(groups: FsCatalogGroup[], items: FsCatalogItem[]) {
  const itemsByPrefix = new Map<string, FsCatalogItem[]>();
  for (const item of items) {
    const key = item.group_prefix ?? '';
    const list = itemsByPrefix.get(key) ?? [];
    list.push(item);
    itemsByPrefix.set(key, list);
  }

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const knownPrefixes = new Set(sortedGroups.map(g => g.group_prefix));

  const orphanPrefixes = [...itemsByPrefix.keys()].filter(p => p && !knownPrefixes.has(p));
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
    items: [...(itemsByPrefix.get(group.group_prefix) ?? [])].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return compareFsPrefix({ prefix: a.prefix }, { prefix: b.prefix });
    }),
  }));
}

export function filterFsCatalogItems(items: FsCatalogItem[]): FsCatalogItem[] {
  return items.filter(item => !item.item_type || item.item_type === 'item');
}
