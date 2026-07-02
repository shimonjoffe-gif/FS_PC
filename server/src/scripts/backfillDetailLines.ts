/**
 * Backfill detail_lines_json from snap_details_json + briefing_fs_custom.
 * Run: npm run backfill:detail-lines (from server/)
 */
import { initDB, db } from '../db';
import {
  buildDetailLinesFromSources,
  loadBriefingFsCustomLines,
} from '../briefingFsSnapshot';

function main() {
  initDB();

  const rows = db.prepare(`
    SELECT bfs.briefing_id, bfs.fs_item_id, bfs.snap_details_json, bfs.detail_lines_json
    FROM briefing_fs_sel bfs
    JOIN briefing_fs_snapshot snap ON snap.briefing_id = bfs.briefing_id
    WHERE bfs.detail_lines_json IS NULL OR trim(bfs.detail_lines_json) = '' OR bfs.detail_lines_json = '[]'
  `).all() as {
    briefing_id: number;
    fs_item_id: number;
    snap_details_json: string | null;
    detail_lines_json: string | null;
  }[];

  const customByBriefing = new Map<number, ReturnType<typeof loadBriefingFsCustomLines>>();
  for (const row of rows) {
    if (!customByBriefing.has(row.briefing_id)) {
      customByBriefing.set(row.briefing_id, loadBriefingFsCustomLines(row.briefing_id));
    }
  }

  const update = db.prepare(`
    UPDATE briefing_fs_sel SET detail_lines_json=? WHERE briefing_id=? AND fs_item_id=?
  `);

  let updated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const customLines = customByBriefing.get(row.briefing_id) ?? [];
      const lines = buildDetailLinesFromSources(
        row.snap_details_json,
        row.fs_item_id,
        customLines,
      );
      if (lines.length === 0) continue;
      update.run(JSON.stringify(lines), row.briefing_id, row.fs_item_id);
      updated++;
    }
  });
  tx();

  const briefings = new Set(rows.map(r => r.briefing_id));
  console.log(`Брифингов со снимком: ${briefings.size}`);
  console.log(`Обновлено строк briefing_fs_sel (detail_lines_json): ${updated}`);
}

main();
