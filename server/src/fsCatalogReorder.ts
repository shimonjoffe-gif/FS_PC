import { db } from './db';
import { compareFsPrefix, normalizeFsPrefix } from './fsPrefix';
import { createFsCatalogItem, loadFsCatalogItemById } from './fsCatalogNsi';
import { FS_CATALOG_ACTIVE_SQL } from './fsCatalogActive';

export interface FsCatalogGroupRow {
  id: number;
  group_prefix: string;
  group_name: string;
  sort_order: number;
  published: number;
}

function compareNumericPrefix(a: string | null | undefined, b: string | null | undefined): number {
  return compareFsPrefix(a, b);
}

export function loadFsCatalogGroups(): FsCatalogGroupRow[] {
  const rows = db.prepare(`
    SELECT id, group_prefix, group_name, sort_order, published
    FROM fs_catalog
    WHERE item_type = 'group' AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order, id
  `).all() as FsCatalogGroupRow[];
  return rows.sort((a, b) => compareNumericPrefix(a.group_prefix, b.group_prefix) || a.id - b.id);
}

export function resolveGroupMarker(groupKey: string | number): FsCatalogGroupRow | undefined {
  if (typeof groupKey === 'number') {
    return db.prepare(`
      SELECT id, group_prefix, group_name, sort_order, published
      FROM fs_catalog WHERE id=? AND item_type='group' AND ${FS_CATALOG_ACTIVE_SQL}
    `).get(groupKey) as FsCatalogGroupRow | undefined;
  }

  const key = String(groupKey);
  const normalized = normalizeFsPrefix(key);
  if (normalized && !normalized.includes('.')) {
    const byPrefix = db.prepare(`
      SELECT id, group_prefix, group_name, sort_order, published
      FROM fs_catalog WHERE item_type='group' AND group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
    `).get(normalized) as FsCatalogGroupRow | undefined;
    if (byPrefix) return byPrefix;
  }

  if (/^\d+$/.test(key)) {
    return db.prepare(`
      SELECT id, group_prefix, group_name, sort_order, published
      FROM fs_catalog WHERE id=? AND item_type='group' AND ${FS_CATALOG_ACTIVE_SQL}
    `).get(Number(key)) as FsCatalogGroupRow | undefined;
  }

  return undefined;
}

export function backfillFsCatalogGroups(): void {
  const itemGroups = db.prepare(`
    SELECT DISTINCT group_prefix, group_name
    FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item')
      AND group_prefix IS NOT NULL AND trim(group_prefix) != ''
      AND ${FS_CATALOG_ACTIVE_SQL}
  `).all() as { group_prefix: string; group_name: string | null }[];

  const ins = db.prepare(`
    INSERT INTO fs_catalog(
      name, group_name, group_prefix, prefix, item_type, sort_order, phase, queue, published
    ) VALUES (?,?,?,?,'group',?,?,1,1)
  `);

  for (const g of itemGroups) {
    const exists = db.prepare(`
      SELECT id FROM fs_catalog WHERE item_type='group' AND group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
    `).get(g.group_prefix);
    if (exists) continue;
    const maxSort = (db.prepare(`
      SELECT MAX(sort_order) as m FROM fs_catalog WHERE item_type='group'
    `).get() as { m: number | null })?.m ?? -1;
    const name = g.group_name?.trim() || g.group_prefix;
    ins.run(name, name, g.group_prefix, g.group_prefix, maxSort + 1, name);
  }

  backfillFsCatalogSortOrders();
}

export function backfillFsCatalogSortOrders(): void {
  const groups = loadFsCatalogGroups();
  if (groups.length === 0) return;

  const needsGroupSort = groups.some(g => g.sort_order === 0)
    && groups.filter(g => g.sort_order === 0).length > 1;
  const sortedGroups = [...groups].sort((a, b) => {
    if (!needsGroupSort && a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return compareNumericPrefix(a.group_prefix, b.group_prefix);
  });

  const updGroup = db.prepare(`UPDATE fs_catalog SET sort_order=? WHERE id=?`);
  for (let i = 0; i < sortedGroups.length; i++) {
    updGroup.run(i, sortedGroups[i].id);
  }

  const updItem = db.prepare(`UPDATE fs_catalog SET sort_order=? WHERE id=?`);
  for (const group of sortedGroups) {
    const items = db.prepare(`
      SELECT id, prefix, sort_order
      FROM fs_catalog
      WHERE (item_type IS NULL OR item_type = 'item') AND group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
    `).all(group.group_prefix) as { id: number; prefix: string | null; sort_order: number }[];

    const needsItemSort = items.length > 1 && items.every(it => it.sort_order === 0);
    const sortedItems = [...items].sort((a, b) => {
      if (!needsItemSort && a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return compareNumericPrefix(a.prefix, b.prefix);
    });
    for (let i = 0; i < sortedItems.length; i++) {
      updItem.run(i, sortedItems[i].id);
    }
  }
}

export function recalculateFsCatalogPrefixes(): void {
  const groups = loadFsCatalogGroups();
  if (groups.length === 0) return;

  const sorted = [...groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const updGroup = db.prepare(`
    UPDATE fs_catalog SET group_prefix=?, prefix=?, sort_order=? WHERE id=?
  `);
  const updItem = db.prepare(`
    UPDATE fs_catalog SET prefix=?, group_prefix=?, group_name=?, sort_order=? WHERE id=?
  `);

  const tx = db.transaction(() => {
    for (let gi = 0; gi < sorted.length; gi++) {
      const group = sorted[gi];
      const newGroupPrefix = String(gi + 1);
      const oldPrefix = group.group_prefix;

      updGroup.run(newGroupPrefix, newGroupPrefix, gi, group.id);

      const items = db.prepare(`
        SELECT id FROM fs_catalog
        WHERE (item_type IS NULL OR item_type = 'item') AND group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
        ORDER BY sort_order, id
      `).all(oldPrefix) as { id: number }[];

      for (let ii = 0; ii < items.length; ii++) {
        const newItemPrefix = `${newGroupPrefix}.${ii + 1}`;
        updItem.run(newItemPrefix, newGroupPrefix, group.group_name, ii, items[ii].id);
      }
    }
  });
  tx();
}

export function createFsCatalogGroup(name: string): FsCatalogGroupRow {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');

  const maxSort = (db.prepare(`
    SELECT MAX(sort_order) as m FROM fs_catalog WHERE item_type='group'
  `).get() as { m: number | null })?.m ?? -1;

  const tempPrefix = `__new_${Date.now()}`;
  const result = db.prepare(`
    INSERT INTO fs_catalog(
      name, group_name, group_prefix, prefix, item_type, sort_order, phase, queue, published
    ) VALUES (?,?,?,?,'group',?,?,1,0)
  `).run(trimmed, trimmed, tempPrefix, tempPrefix, maxSort + 1, trimmed);

  recalculateFsCatalogPrefixes();

  const row = db.prepare(`
    SELECT id, group_prefix, group_name, sort_order, published
    FROM fs_catalog WHERE id=?
  `).get(Number(result.lastInsertRowid)) as FsCatalogGroupRow;

  return row;
}

export function copyFsCatalogItem(id: number): { id: number; prefix: string } {
  const item = loadFsCatalogItemById(id);
  if (!item) throw new Error('not found');

  const copyName = item.name.trim().endsWith('(копия)')
    ? item.name.trim()
    : `${item.name.trim()} (копия)`;

  return createFsCatalogItem({
    group_prefix: item.group_prefix!,
    group_name: item.group_name ?? item.phase,
    name: copyName,
    func_type: item.func_type,
    story_points: item.story_points,
    requires_nmd: item.requires_nmd,
    description: item.description,
    details: item.details,
  });
}

export function copyFsCatalogGroup(groupKey: string | number): FsCatalogGroupRow {
  const group = resolveGroupMarker(groupKey);
  if (!group) throw new Error('group not found');

  const copyName = group.group_name.trim().endsWith('(копия)')
    ? group.group_name.trim()
    : `${group.group_name.trim()} (копия)`;

  const maxSort = (db.prepare(`
    SELECT MAX(sort_order) as m FROM fs_catalog WHERE item_type='group'
  `).get() as { m: number | null })?.m ?? -1;

  const tempPrefix = `__copy_${Date.now()}`;
  const newGroupResult = db.prepare(`
    INSERT INTO fs_catalog(
      name, group_name, group_prefix, prefix, item_type, sort_order, phase, queue, published
    ) VALUES (?,?,?,?,'group',?,?,1,0)
  `).run(copyName, copyName, tempPrefix, tempPrefix, maxSort + 1, copyName);

  const items = db.prepare(`
    SELECT id FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item') AND group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order, id
  `).all(group.group_prefix) as { id: number }[];

  for (const { id } of items) {
    const item = loadFsCatalogItemById(id);
    if (!item) continue;
    const itemCopyName = item.name.trim().endsWith('(копия)')
      ? item.name.trim()
      : `${item.name.trim()} (копия)`;
    createFsCatalogItem({
      group_prefix: tempPrefix,
      group_name: copyName,
      name: itemCopyName,
      func_type: item.func_type,
      story_points: item.story_points,
      requires_nmd: item.requires_nmd,
      description: item.description,
      details: item.details,
    });
  }

  recalculateFsCatalogPrefixes();

  return db.prepare(`
    SELECT id, group_prefix, group_name, sort_order, published
    FROM fs_catalog WHERE id=?
  `).get(Number(newGroupResult.lastInsertRowid)) as FsCatalogGroupRow;
}

export interface ReorderGroupInput {
  groupKey: string | number;
  sort_order: number;
  items?: { id: number; sort_order: number }[];
}

export function applyFsCatalogReorder(groups: ReorderGroupInput[]): void {
  const updGroup = db.prepare(`UPDATE fs_catalog SET sort_order=? WHERE id=? AND item_type='group'`);
  const updItem = db.prepare(`
    UPDATE fs_catalog SET sort_order=? WHERE id=? AND (item_type IS NULL OR item_type='item')
  `);

  const tx = db.transaction(() => {
    for (const g of groups) {
      const marker = resolveGroupMarker(g.groupKey);
      if (!marker) throw new Error(`group not found: ${g.groupKey}`);
      updGroup.run(g.sort_order, marker.id);
      for (const it of g.items ?? []) {
        updItem.run(it.sort_order, it.id);
      }
    }
  });
  tx();
  recalculateFsCatalogPrefixes();
}

export function moveFsCatalogItemToGroup(
  itemId: number,
  target: { target_group_prefix?: string; target_group_id?: number },
): void {
  const item = db.prepare(`
    SELECT id, group_prefix FROM fs_catalog
    WHERE id=? AND (item_type IS NULL OR item_type='item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).get(itemId) as { id: number; group_prefix: string } | undefined;
  if (!item) throw new Error('item not found');

  const targetGroup = target.target_group_id != null
    ? resolveGroupMarker(target.target_group_id)
    : target.target_group_prefix
      ? resolveGroupMarker(target.target_group_prefix)
      : undefined;
  if (!targetGroup) throw new Error('target group not found');

  const maxSort = (db.prepare(`
    SELECT MAX(sort_order) as m FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item') AND group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
  `).get(targetGroup.group_prefix) as { m: number | null })?.m ?? -1;

  db.prepare(`
    UPDATE fs_catalog SET group_prefix=?, group_name=?, sort_order=? WHERE id=?
  `).run(targetGroup.group_prefix, targetGroup.group_name, maxSort + 1, itemId);

  recalculateFsCatalogPrefixes();
}
