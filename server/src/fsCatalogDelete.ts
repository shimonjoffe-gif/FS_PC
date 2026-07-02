import { db } from './db';
import { FS_CATALOG_ACTIVE_SQL } from './fsCatalogActive';
import { recalculateFsCatalogPrefixes, resolveGroupMarker } from './fsCatalogReorder';

function softDeleteDetails(parentId: number): void {
  db.prepare(`
    UPDATE fs_catalog SET is_deleted=1
    WHERE parent_id=? AND item_type='detail'
  `).run(parentId);
}

export function softDeleteFsCatalogItem(id: number): boolean {
  const row = db.prepare(`
    SELECT id FROM fs_catalog
    WHERE id=? AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).get(id);
  if (!row) return false;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE fs_catalog SET is_deleted=1 WHERE id=?`).run(id);
    softDeleteDetails(id);
  });
  tx();
  recalculateFsCatalogPrefixes();
  return true;
}

export function softDeleteFsCatalogGroup(groupKey: string | number): boolean {
  const group = resolveGroupMarker(groupKey);
  if (!group) return false;

  const items = db.prepare(`
    SELECT id FROM fs_catalog
    WHERE group_prefix=? AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).all(group.group_prefix) as { id: number }[];

  const tx = db.transaction(() => {
    db.prepare(`UPDATE fs_catalog SET is_deleted=1 WHERE id=?`).run(group.id);
    for (const item of items) {
      db.prepare(`UPDATE fs_catalog SET is_deleted=1 WHERE id=?`).run(item.id);
      softDeleteDetails(item.id);
    }
  });
  tx();
  recalculateFsCatalogPrefixes();
  return true;
}
