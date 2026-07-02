/**
 * Backfill snap_details_json (and snap_description) for existing briefing snapshots.
 * Run: npm run backfill:fs-details (from server/)
 */
import { initDB, db } from '../db';
import {
  loadCatalogDetails,
  detailsToDescription,
} from '../briefingFsSnapshot';

function main() {
  initDB();

  const catalogDetailCount = (db.prepare(`SELECT COUNT(*) as c FROM fs_catalog WHERE item_type='detail'`).get() as { c: number }).c;
  console.log(`Каталог: ${catalogDetailCount} строк расшифровки (item_type=detail)`);

  const rows = db.prepare(`
    SELECT bfs.briefing_id, bfs.fs_item_id, bfs.snap_description, bfs.snap_details_json,
           fc.description as item_description
    FROM briefing_fs_sel bfs
    JOIN briefing_fs_snapshot snap ON snap.briefing_id = bfs.briefing_id
    LEFT JOIN fs_catalog fc ON fc.id = bfs.fs_item_id
    WHERE bfs.snap_details_json IS NULL OR trim(bfs.snap_details_json) = ''
  `).all() as {
    briefing_id: number;
    fs_item_id: number;
    snap_description: string | null;
    snap_details_json: string | null;
    item_description: string | null;
  }[];

  const update = db.prepare(`
    UPDATE briefing_fs_sel
    SET snap_details_json=?, snap_description=COALESCE(?, snap_description)
    WHERE briefing_id=? AND fs_item_id=?
  `);

  let updated = 0;
  let withDetails = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const details = loadCatalogDetails(row.fs_item_id);
      if (details.length === 0) continue;
      const json = JSON.stringify(details);
      const description = detailsToDescription(details, row.item_description);
      update.run(
        json,
        description || null,
        row.briefing_id,
        row.fs_item_id,
      );
      updated++;
      withDetails++;
    }
  });
  tx();

  const briefings = new Set(rows.map(r => r.briefing_id));
  console.log(`Брифингов со снимком: ${briefings.size}`);
  console.log(`Обновлено строк briefing_fs_sel: ${updated} (с расшифровкой из каталога)`);

  const stillEmpty = (db.prepare(`
    SELECT COUNT(*) as c FROM briefing_fs_sel bfs
    JOIN briefing_fs_snapshot snap ON snap.briefing_id = bfs.briefing_id
    WHERE bfs.snap_details_json IS NULL OR trim(bfs.snap_details_json) = '' OR bfs.snap_details_json = '[]'
  `).get() as { c: number }).c;
  console.log(`Строк без snap_details_json после backfill: ${stillEmpty}`);
}

main();
