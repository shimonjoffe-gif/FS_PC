import type { BriefingFsDetailLine, BriefingFsSel } from './types';
import { isCustomerFsItem } from './fsCustomerItems';

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

/** Функции заказчика (10/11) и пункты с пользовательскими подпунктами расшифровки. */
export function countGroupUserItems(items: BriefingFsSel[]): number {
  let n = 0;
  for (const item of items) {
    if (isCustomerFsItem(item)) n++;
    else if (fsDetailLineFlags(item).customerAdded) n++;
  }
  return n;
}
