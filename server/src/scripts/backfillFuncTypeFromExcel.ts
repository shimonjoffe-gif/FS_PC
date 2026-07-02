/**
 * Перезаполнение func_type в fs_catalog из колонки G Excel («Тип проекта»).
 * Run: npm run backfill:func-type (from server/)
 */
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { initDB, db } from '../db';
import { normalizeFsPrefix } from '../fsPrefix';
import { technologyLabelToFuncType } from '../fsFuncType';

const ROOT = path.join(process.cwd(), '..');
const FS_XLSX = path.join(ROOT, 'Копия ФС Lite и ПК для предварительной оценки заказного проекта.xlsx');

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function findSheet(wb: XLSX.WorkBook, ...names: string[]): XLSX.WorkSheet | null {
  for (const n of names) {
    if (wb.SheetNames.includes(n)) return wb.Sheets[n];
  }
  return null;
}

function loadFuncTypeByPrefix(): Map<string, string> {
  const wb = XLSX.readFile(FS_XLSX);
  const ws = findSheet(wb, '2.ФС для Заполнения', 'ФС для Заполнения');
  if (!ws) throw new Error('Лист «2.ФС для Заполнения» не найден');

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
  const startRow = rows.findIndex((r, i) => i >= 8 && cellStr(r?.[0]) === '№ п.п') + 1;
  const from = startRow > 0 ? startRow : 9;

  const map = new Map<string, string>();
  for (let i = from; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const rawPrefix = cellStr(row[0]);
    const prefix = normalizeFsPrefix(rawPrefix);
    const name = cellStr(row[1]);
    const projectTypeRaw = cellStr(row[6]);
    const rowKindUpper = projectTypeRaw.toUpperCase() || cellStr(row[5]).toUpperCase();
    if (rowKindUpper === 'ГРУППА' || !prefix || !name) continue;

    const funcType = technologyLabelToFuncType(projectTypeRaw);
    if (funcType) map.set(prefix, funcType);
  }
  return map;
}

function main() {
  if (!fs.existsSync(FS_XLSX)) {
    console.error(`Файл не найден: ${FS_XLSX}`);
    process.exit(1);
  }

  initDB();
  const byPrefix = loadFuncTypeByPrefix();
  console.log(`Из Excel загружено ${byPrefix.size} пунктов с типом из колонки G`);

  const items = db.prepare(`
    SELECT id, prefix, name, func_type
    FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item') AND prefix IS NOT NULL AND trim(prefix) != ''
  `).all() as { id: number; prefix: string; name: string; func_type: string | null }[];

  const update = db.prepare(`UPDATE fs_catalog SET func_type=? WHERE id=?`);
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const unknown: string[] = [];

  const tx = db.transaction(() => {
    for (const item of items) {
      const prefix = normalizeFsPrefix(item.prefix);
      const next = byPrefix.get(prefix);
      if (!next) {
        skipped++;
        if (item.func_type && !['Базовый', 'Проф-мини', 'ПРОФ', 'Экспертный'].includes(item.func_type)) {
          unknown.push(`${prefix} ${item.name}: было «${item.func_type}»`);
        }
        continue;
      }
      if (item.func_type === next) {
        unchanged++;
        continue;
      }
      update.run(next, item.id);
      updated++;
    }
  });
  tx();

  console.log(`Обновлено: ${updated}, без изменений: ${unchanged}, без данных в G: ${skipped}`);
  if (unknown.length > 0) {
    console.log(`Пункты без сопоставления в G (первые 10):`);
    for (const line of unknown.slice(0, 10)) console.log(`  ${line}`);
  }

  const summary = db.prepare(`
    SELECT func_type, COUNT(*) c
    FROM fs_catalog
    WHERE item_type IS NULL OR item_type = 'item'
    GROUP BY func_type
    ORDER BY c DESC
  `).all();
  console.log('Итог по func_type:', summary);
}

main();
