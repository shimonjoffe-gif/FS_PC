export function catalogCodeParts(code: string | null | undefined): number[] {
  if (!code) return [Number.MAX_SAFE_INTEGER];
  return String(code).replace(/\.$/, '').split('.').map(n => parseInt(n, 10) || 0);
}

export function compareCatalogCode(
  a: { catalog_code?: string | null; sort_order?: number; id: number },
  b: { catalog_code?: string | null; sort_order?: number; id: number },
): number {
  const pa = catalogCodeParts(a.catalog_code);
  const pb = catalogCodeParts(b.catalog_code);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? Number.MAX_SAFE_INTEGER) - (pb[i] ?? Number.MAX_SAFE_INTEGER);
    if (diff !== 0) return diff;
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
}
