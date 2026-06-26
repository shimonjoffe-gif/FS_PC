/** Нормализует префикс пункта ФС: "1.1." → "1.1", "11.10." → "11.10" */
export function normalizeFsPrefix(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/\.+$/, '');
  if (!s || !/^\d+(?:\.\d+)*$/.test(s)) return null;
  return s;
}

/** Сравнение префиксов с натуральной сортировкой сегментов: 1.2 < 1.10 */
export function compareFsPrefix(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const pa = normalizeFsPrefix(a);
  const pb = normalizeFsPrefix(b);
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  const segA = pa.split('.').map(Number);
  const segB = pb.split('.').map(Number);
  const len = Math.max(segA.length, segB.length);
  for (let i = 0; i < len; i++) {
    const na = segA[i] ?? 0;
    const nb = segB[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}
