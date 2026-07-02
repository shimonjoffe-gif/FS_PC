import type { BriefingFsDetailLine, BriefingFsSel } from './types';

export function isNsiLineModified(line: BriefingFsDetailLine): boolean {
  if (line.source !== 'nsi') return false;
  return line.name !== (line.nsi_name ?? '')
    || (line.description ?? '') !== (line.nsi_description ?? '')
    || line.inactive;
}

export function fsDetailLineFlags(item: BriefingFsSel): {
  modified: boolean;
  customerAdded: boolean;
} {
  const lines = item.detail_lines ?? [];
  return {
    modified: lines.some(isNsiLineModified),
    customerAdded: lines.some(l => l.source === 'customer'),
  };
}
