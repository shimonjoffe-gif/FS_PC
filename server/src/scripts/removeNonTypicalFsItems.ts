/**
 * Удаление нетиповых пунктов ФС (11.13+) из каталога и связанных таблиц.
 * Run: npm run remove:non-typical-fs (from server/)
 */
import { initDB, db } from '../db';
import { isNonTypicalFsPrefix } from '../fsPrefixSort';

function collectIdsToRemove(): number[] {
  const items = db.prepare(`
    SELECT id, prefix FROM fs_catalog
    WHERE item_type IS NULL OR item_type = 'item'
  `).all() as { id: number; prefix: string | null }[];

  const itemIds = items.filter(r => isNonTypicalFsPrefix(r.prefix)).map(r => r.id);
  if (itemIds.length === 0) return [];

  const placeholders = itemIds.map(() => '?').join(',');
  const details = db.prepare(`
    SELECT id FROM fs_catalog WHERE parent_id IN (${placeholders})
  `).all(...itemIds) as { id: number }[];

  return [...itemIds, ...details.map(d => d.id)];
}

function deleteByIds(ids: number[]) {
  if (ids.length === 0) return;
  const ph = ids.map(() => '?').join(',');

  const del = (sql: string) => db.prepare(sql.replace('__IDS__', ph)).run(...ids);

  del(`DELETE FROM briefing_fs_sel WHERE fs_item_id IN (__IDS__)`);
  del(`DELETE FROM briefing_fs_catalog_usage WHERE fs_item_id IN (__IDS__)`);
  del(`DELETE FROM briefing_fs_custom WHERE parent_fs_item_id IN (__IDS__)`);
  del(`DELETE FROM widget_fs_map WHERE fs_item_id IN (__IDS__)`);
  del(`DELETE FROM solution_fs_map WHERE fs_item_id IN (__IDS__)`);
  del(`DELETE FROM fs_industry_blocks WHERE fs_item_id IN (__IDS__)`);
  del(`DELETE FROM fs_catalog WHERE id IN (__IDS__)`);
}

function main() {
  initDB();

  const before = db.prepare(`
    SELECT prefix, name FROM fs_catalog
    WHERE prefix IS NOT NULL AND prefix LIKE '11.%'
    ORDER BY prefix
  `).all() as { prefix: string; name: string }[];

  const toRemove = before.filter(r => isNonTypicalFsPrefix(r.prefix));
  console.log(`К удалению: ${toRemove.length} пунктов`);
  for (const r of toRemove) console.log(`  ${r.prefix} ${r.name.slice(0, 60)}`);

  const ids = collectIdsToRemove();
  const tx = db.transaction(() => deleteByIds(ids));
  tx();

  const after = db.prepare(`
    SELECT prefix, name FROM fs_catalog
    WHERE prefix IS NOT NULL AND prefix LIKE '11.%'
    ORDER BY prefix
  `).all() as { prefix: string; name: string }[];
  console.log(`\nОсталось в группе 11: ${after.length} пунктов (последний: ${after[after.length - 1]?.prefix ?? '—'})`);
}

main();
