import type { BriefingFsSel, FsQueuesMap } from './types';
import { FS_FUNC_TYPE_VALUES } from './types';

export const CUSTOMER_FS_GROUP_PREFIXES = ['10', '11'] as const;
export type CustomerFsGroupPrefix = typeof CUSTOMER_FS_GROUP_PREFIXES[number];

export { FS_FUNC_TYPE_VALUES };

export function extractGroupSuffix(groupPrefix: string, prefix: string | null | undefined): number | null {
  if (!prefix?.trim()) return null;
  const m = prefix.trim().match(new RegExp(`^${groupPrefix}\\.(\\d+)$`));
  return m ? parseInt(m[1], 10) : null;
}

export function maxSuffixInGroup(
  groupPrefix: string,
  prefixes: (string | null | undefined)[],
): number {
  let max = 0;
  for (const p of prefixes) {
    const suffix = extractGroupSuffix(groupPrefix, p);
    if (suffix != null) max = Math.max(max, suffix);
  }
  return max;
}

export function isCustomerFsGroupPrefix(prefix: string | null | undefined): prefix is CustomerFsGroupPrefix {
  return prefix === '10' || prefix === '11';
}

export function isCustomerFsItem(item: Pick<BriefingFsSel, 'is_customer_item' | 'fs_item_id'>): boolean {
  return item.is_customer_item === true || item.fs_item_id < 0;
}

export function defaultSpForFuncType(funcType: string | null | undefined): number {
  switch (funcType?.trim()) {
    case 'Экспертный': return 10;
    case 'ПРОФ': return 5;
    case 'Проф-мини': return 3;
    case 'Базовый': return 1;
    default: return 5;
  }
}

export function nextCustomerDisplayPrefix(
  groupPrefix: CustomerFsGroupPrefix,
  items: BriefingFsSel[],
): string {
  const prefixes = items
    .filter(i => (i.group_prefix ?? i.prefix?.split('.')[0]) === groupPrefix)
    .map(i => i.prefix);
  return `${groupPrefix}.${maxSuffixInGroup(groupPrefix, prefixes) + 1}`;
}

export function createCustomerFsItem(
  groupPrefix: CustomerFsGroupPrefix,
  groupName: string,
  items: BriefingFsSel[],
  funcType = 'ПРОФ',
): BriefingFsSel {
  const sp = defaultSpForFuncType(funcType);
  const queues: FsQueuesMap = { '1': 1, '2': 0, '3': 0, '4': 0 };
  return {
    fs_item_id: -Date.now(),
    is_customer_item: true,
    enabled: 1,
    queue: '1',
    queues_json: queues,
    source: 'customer',
    matched: true,
    name: '',
    group_prefix: groupPrefix,
    group_name: groupName,
    phase: groupName,
    prefix: nextCustomerDisplayPrefix(groupPrefix, items),
    func_type: funcType,
    story_points: sp,
    catalog_story_points: sp,
    sort_order: 100000,
    matched_widgets: [],
  };
}

export function patchCustomerFuncType(item: BriefingFsSel, funcType: string): Partial<BriefingFsSel> {
  const sp = defaultSpForFuncType(funcType);
  return {
    func_type: funcType,
    story_points: sp,
    catalog_story_points: sp,
    queue_sp_json: null,
    source: 'customer',
  };
}

export function groupNameForCustomerPrefix(
  groupPrefix: CustomerFsGroupPrefix,
  items: BriefingFsSel[],
): string {
  const found = items.find(i => i.group_prefix === groupPrefix && i.group_name);
  if (found?.group_name) return found.group_name;
  return groupPrefix === '10' ? 'Прочие функциональные блоки' : 'Интеграции с ИС Заказчика';
}
