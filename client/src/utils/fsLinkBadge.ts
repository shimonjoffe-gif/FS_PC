export type SolutionFsLinkType = 'required' | 'optional';

export function fsLinkBadgeLabel(type: SolutionFsLinkType | null | undefined): string {
  if (type === 'required') return 'Да';
  if (type === 'optional') return 'Опц.';
  return 'Нет';
}

export function fsLinkBadgeClass(type: SolutionFsLinkType | null | undefined, unmatched = false): string {
  if (!type && unmatched) return 'bg-red-100 text-red-700 font-medium';
  if (type === 'required') return 'bg-green-100 text-green-800';
  if (type === 'optional') return 'bg-blue-100 text-blue-800';
  return 'bg-slate-100 text-slate-500';
}

export function cycleFsLinkType(current: SolutionFsLinkType | null | undefined): SolutionFsLinkType | null {
  if (!current) return 'required';
  if (current === 'required') return 'optional';
  return null;
}

export function fsLinksToMap(links: { fs_item_id: number; link_type: SolutionFsLinkType }[]): Map<number, SolutionFsLinkType> {
  return new Map(links.map(l => [l.fs_item_id, l.link_type]));
}

export function fsLinksFromMap(map: Map<number, SolutionFsLinkType>): { fs_item_id: number; link_type: SolutionFsLinkType }[] {
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([fs_item_id, link_type]) => ({ fs_item_id, link_type }));
}
