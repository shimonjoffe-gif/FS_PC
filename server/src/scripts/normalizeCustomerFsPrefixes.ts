/** Перенумерация display_prefix у существующих функций заказчика. */
import { initDB, db } from '../db';
import { normalizeCustomerDisplayPrefixes } from '../fsCustomerItems';

initDB();
const rows = db.prepare(`SELECT DISTINCT briefing_id FROM briefing_fs_customer_items`).all() as {
  briefing_id: number;
}[];
for (const row of rows) {
  normalizeCustomerDisplayPrefixes(row.briefing_id);
}
console.log(`Перенумеровано брифингов: ${rows.length}`);
