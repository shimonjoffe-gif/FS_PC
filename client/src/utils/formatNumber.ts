/** Целое с разделителем разрядов (ru-RU): 99 000 000 */
export function formatGroupedInteger(n: number): string {
  if (!Number.isFinite(n)) return '';
  return Math.round(n).toLocaleString('ru-RU');
}

/** Парсинг строки с пробелами/неразрывными пробелами как разделителями разрядов. */
export function parseGroupedInteger(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function formatMoneyRub(n: number | null, placeholder = '—'): string {
  if (n == null || !Number.isFinite(n)) return placeholder;
  return `${formatGroupedInteger(n)} ₽`;
}

export function formatStepNumber(n: number, placeholder = '—'): string {
  if (!Number.isFinite(n)) return placeholder;
  if (Number.isInteger(n)) return formatGroupedInteger(n);
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}
