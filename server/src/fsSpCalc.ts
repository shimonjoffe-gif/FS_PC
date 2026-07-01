import { FS_QUEUE_KEYS, FsQueueKey, parseQueuesJson, anyQueueEnabled } from './fsQueues';
import { normalizeFsPrefix } from './fsPrefix';

/** Раздел каталога ФС — пункты попадают в C21 (SP интеграций). */
export const FS_INTEGRATIONS_GROUP = 'ФС интеграции';
export const FS_INTEGRATIONS_GROUP_PREFIX = '11';

export const FS_NMD_VALUES = [
  'Не требуется',
  'Предоставляется Заказчиком',
  'Используется типовая',
  'Требуется разработать',
] as const;
export type FsNmdValue = typeof FS_NMD_VALUES[number];

export function normalizeFsGroupName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

export function isFsIntegrationsGroup(groupName: string | null | undefined): boolean {
  const normalized = normalizeFsGroupName(groupName);
  if (!normalized) return false;
  if (normalized.localeCompare(FS_INTEGRATIONS_GROUP, 'ru', { sensitivity: 'accent' }) === 0) {
    return true;
  }
  const lower = normalized.toLowerCase();
  return lower.startsWith('фс интеграц') || lower === 'интеграции' || lower.startsWith('интеграци');
}

export function isFsIntegrationsGroupPrefix(
  groupPrefix: string | null | undefined,
  itemPrefix?: string | null,
): boolean {
  const candidates = [groupPrefix, itemPrefix]
    .map(p => normalizeFsPrefix(p))
    .filter((p): p is string => p != null);
  for (const prefix of candidates) {
    const top = prefix.split('.')[0];
    if (top === FS_INTEGRATIONS_GROUP_PREFIX) return true;
  }
  return false;
}

export function isFsItemNmdLegacy(item: Pick<FsSpItemLike, 'name' | 'func_type'>): boolean {
  return item.name?.toLowerCase().includes('нмд') === true
    || (item.func_type?.includes('НМД') ?? false);
}

export function isFsItemNmd(item: Pick<FsSpItemLike, 'name' | 'func_type' | 'requires_nmd'>): boolean {
  return catalogRequiresNmd(item);
}

export function normalizeFsNmdValue(raw: string | null | undefined): FsNmdValue {
  const text = (raw ?? '').trim();
  if (!text) return 'Не требуется';
  const lower = text.toLowerCase();
  if (lower === 'не требуется' || lower === 'нет') return 'Не требуется';
  if (lower.includes('предоставля') && lower.includes('заказчик')) {
    return 'Предоставляется Заказчиком';
  }
  if ((FS_NMD_VALUES as readonly string[]).includes(text)) return text as FsNmdValue;
  if (lower.includes('типовая')) {
    return 'Используется типовая';
  }
  if (lower.includes('разработ') || lower.includes('необходимо разработать')) {
    return 'Требуется разработать';
  }
  if (lower.includes('требуется') && !lower.includes('не требуется')) {
    return 'Требуется разработать';
  }
  return 'Требуется разработать';
}

export function nmdSpContribution(value: FsNmdValue, sp: number): number {
  if (sp <= 0) return 0;
  if (value === 'Требуется разработать') return sp;
  if (value === 'Используется типовая') return Math.ceil(sp / 5);
  return 0;
}

export function nmdValueAddsToD20(value: FsNmdValue): boolean {
  return value === 'Требуется разработать' || value === 'Используется типовая';
}

export function catalogRequiresNmd(
  item: Pick<FsSpItemLike, 'requires_nmd' | 'name' | 'func_type'>,
): boolean {
  return catalogNmdLabel(item) !== 'Не требуется';
}

export function catalogNmdLabel(
  item: Pick<FsSpItemLike, 'requires_nmd' | 'name' | 'func_type'>,
): FsNmdValue {
  const text = (item.requires_nmd ?? '').trim();
  if (text) return normalizeFsNmdValue(text);
  if (isFsItemNmdLegacy(item)) return 'Требуется разработать';
  return 'Не требуется';
}

export interface FsSpItemLike {
  story_points?: number | null;
  catalog_story_points?: number;
  queue_sp_json?: string | Partial<Record<FsQueueKey, number>> | null;
  queue_nmd_json?: string | Partial<Record<FsQueueKey, FsNmdValue>> | null;
  queue_comment_json?: string | Partial<Record<FsQueueKey, string>> | null;
  group_name?: string | null;
  group_prefix?: string | null;
  prefix?: string | null;
  name?: string;
  func_type?: string | null;
  requires_nmd?: string | null;
  queues_json: string | Record<FsQueueKey, number>;
}

export type QueueSpOverrides = Partial<Record<FsQueueKey, number>>;

export function parseQueueSpOverrides(
  raw: string | QueueSpOverrides | null | undefined,
): QueueSpOverrides {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(raw) as QueueSpOverrides;
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
  } catch {
    return {};
  }
}

export function catalogSpForItem(item: FsSpItemLike): number {
  return item.catalog_story_points ?? item.story_points ?? 0;
}

export function effectiveFsItemSpForQueue(item: FsSpItemLike, q: FsQueueKey): number {
  const manual = parseQueueSpOverrides(item.queue_sp_json)[q];
  if (manual != null && Number.isFinite(manual)) return manual;
  return catalogSpForItem(item);
}

type QueueNmdRaw = Partial<Record<FsQueueKey, 0 | 1 | FsNmdValue | string>>;

export type QueueNmdOverrides = Partial<Record<FsQueueKey, FsNmdValue>>;

export function parseQueueNmdJson(
  raw: string | QueueNmdRaw | null | undefined,
): QueueNmdRaw {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(raw) as QueueNmdRaw;
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function resolveQueueNmdOverride(item: FsSpItemLike, q: FsQueueKey): FsNmdValue | undefined {
  const raw = parseQueueNmdJson(item.queue_nmd_json)[q];
  if (raw === undefined) return undefined;
  if (raw === 0 || raw === '0') return 'Не требуется';
  if (raw === 1 || raw === '1') return undefined;
  return normalizeFsNmdValue(String(raw));
}

export function autoFsItemNmdValueForQueue(
  item: Pick<FsSpItemLike, 'requires_nmd' | 'name' | 'func_type'>,
  _q?: FsQueueKey,
): FsNmdValue {
  return catalogNmdLabel(item);
}

export function autoFsItemNmdForQueue(item: FsSpItemLike, q?: FsQueueKey): boolean {
  return nmdValueAddsToD20(autoFsItemNmdValueForQueue(item, q));
}

export function effectiveFsItemNmdValueForQueue(item: FsSpItemLike, q: FsQueueKey): FsNmdValue {
  const queues = itemQueues(item);
  if (queues[q] !== 1) return 'Не требуется';
  const manual = resolveQueueNmdOverride(item, q);
  if (manual !== undefined) return manual;
  return autoFsItemNmdValueForQueue(item, q);
}

export function effectiveFsItemNmdForQueue(item: FsSpItemLike, q: FsQueueKey): boolean {
  const sp = effectiveFsItemSpForQueue(item, q);
  return nmdSpContribution(effectiveFsItemNmdValueForQueue(item, q), sp) > 0;
}

export function isFsItemIntegration(
  item: Pick<FsSpItemLike, 'group_name' | 'group_prefix' | 'prefix'>,
): boolean {
  if (isFsIntegrationsGroup(item.group_name)) return true;
  return isFsIntegrationsGroupPrefix(item.group_prefix, item.prefix);
}

export interface QueueSpTotals {
  functional_sp: Record<FsQueueKey, number>;
  integrations_sp_auto: Record<FsQueueKey, number>;
  nmd_sp_auto: Record<FsQueueKey, number>;
  all_queues: number;
  all_integrations: number;
  all_nmd: number;
}

function itemQueues(item: FsSpItemLike): Record<FsQueueKey, number> {
  const raw = item.queues_json;
  if (typeof raw === 'string') return parseQueuesJson(raw);
  return raw as Record<FsQueueKey, number>;
}

function emptyQueueRecord(): Record<FsQueueKey, number> {
  return Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as Record<FsQueueKey, number>;
}

export function computeQueueSpFromFs(items: FsSpItemLike[]): QueueSpTotals {
  const functional_sp = emptyQueueRecord();
  const integrations_sp_auto = emptyQueueRecord();
  const nmd_sp_auto = emptyQueueRecord();
  let all_queues = 0;
  let all_integrations = 0;
  let all_nmd = 0;

  for (const item of items) {
    const queues = itemQueues(item);
    if (!anyQueueEnabled(queues)) continue;

    const isIntegration = isFsItemIntegration(item);
    const catalogSp = catalogSpForItem(item);
    const catalogNmdSp = nmdSpContribution(catalogNmdLabel(item), catalogSp);

    if (!isIntegration && catalogSp > catalogNmdSp) {
      all_queues += catalogSp - catalogNmdSp;
    }
    if (isIntegration && catalogSp > 0) {
      all_integrations += catalogSp;
    }
    if (catalogNmdSp > 0) {
      all_nmd += catalogNmdSp;
    }

    for (const q of FS_QUEUE_KEYS) {
      if (queues[q] !== 1) continue;
      const sp = effectiveFsItemSpForQueue(item, q);
      if (sp <= 0) continue;
      const nmdSp = nmdSpContribution(effectiveFsItemNmdValueForQueue(item, q), sp);
      if (isIntegration) {
        integrations_sp_auto[q] += sp;
      } else {
        const functionalSp = sp - nmdSp;
        if (functionalSp > 0) functional_sp[q] += functionalSp;
        if (nmdSp > 0) nmd_sp_auto[q] += nmdSp;
      }
    }
  }

  return { functional_sp, integrations_sp_auto, nmd_sp_auto, all_queues, all_integrations, all_nmd };
}

export function autoLoadTestScenarios(active: boolean, functionalSp: number): number {
  if (!active || functionalSp <= 0) return 0;
  return Math.ceil(functionalSp / 5);
}
