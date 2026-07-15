import * as XLSX from 'xlsx';
import path from 'path';

const file = path.join(process.cwd(), '..', 'Файлы LCM', 'Lean Canvas Model_БЗ Производство.xlsx');
const wb = XLSX.readFile(file);
console.log('sheets:', wb.SheetNames.join(', '));

for (const sn of ['LCM', 'БЗ Производство']) {
  if (!wb.SheetNames.includes(sn)) continue;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' }) as unknown[][];
  console.log('\n===', sn, 'rows', rows.length, '===');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const joined = row.map(c => String(c ?? '').replace(/\s+/g, ' ').trim()).join('|');
    if (/[0-9]+\.|Сегмент|Уник|Скрыт|Ключ|Канал|Доход|Затрат|Проблем|Решен|Продукт|Рынок|УТП/i.test(joined)) {
      const cells: string[] = [];
      for (let j = 0; j < row.length; j++) {
        const v = String(row[j] ?? '').replace(/\s+/g, ' ').trim();
        if (v) cells.push(`${String.fromCharCode(65 + j)}:${v.slice(0, 90)}`);
      }
      console.log(`R${i}`, cells.join(' | '));
    }
  }
}
