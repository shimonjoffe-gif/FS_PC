import { normalizeFsPrefix } from './fsPrefix';

type FsPrefixItem = {
  prefix?: string | null;
  group_prefix?: string | null;
  code?: string | null;
  name?: string | null;
  sort_order?: number;
};

export function fsPrefixParts(item: FsPrefixItem): number[] {
  const normalized = normalizeFsPrefix(item.prefix) ?? normalizeFsPrefix(item.code);
  if (normalized) return normalized.split('.').map(n => parseInt(n, 10));

  const name = (item.name ?? '').trim();
  const num = name.match(/^(\d+(?:\.\d+)*)\.?/);
  if (num) return num[1].replace(/\.$/, '').split('.').map(n => parseInt(n, 10));

  const fs = name.match(/^ФС-(\d+)/i);
  if (fs) return [parseInt(fs[1], 10)];

  return [Number.MAX_SAFE_INTEGER];
}

export function compareFsPrefix(a: FsPrefixItem, b: FsPrefixItem): number {
  const pa = fsPrefixParts(a);
  const pb = fsPrefixParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

export function groupPrefixParts(item: FsPrefixItem): number[] {
  const normalized = normalizeFsPrefix(item.group_prefix);
  if (normalized) return normalized.split('.').map(n => parseInt(n, 10));
  return [fsPrefixParts(item)[0] ?? Number.MAX_SAFE_INTEGER];
}

export function compareFsByGroupPrefix(a: FsPrefixItem, b: FsPrefixItem): number {
  const pa = groupPrefixParts(a);
  const pb = groupPrefixParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function compareFsByGroupThenPrefix(a: FsPrefixItem, b: FsPrefixItem): number {
  const groupCmp = compareFsByGroupPrefix(a, b);
  if (groupCmp !== 0) return groupCmp;
  return compareFsPrefix(a, b);
}

/** Нетиповые пункты ФС (шаблоны 1С:____ / Др. вендор), начиная с 11.13. */
const NON_TYPICAL_FS_MIN_PREFIX = '11.13';

export function isNonTypicalFsPrefix(prefix: string | null | undefined): boolean {
  const normalized = normalizeFsPrefix(prefix);
  if (!normalized?.startsWith('11.')) return false;
  return compareFsPrefix({ prefix: normalized }, { prefix: NON_TYPICAL_FS_MIN_PREFIX }) >= 0;
}
