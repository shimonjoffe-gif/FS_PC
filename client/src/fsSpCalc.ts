import type { BriefingFsSel, FsNmdValue, FsQueueKey } from './types';
import { FS_NMD_VALUES, FS_QUEUE_KEYS, anyQueueEnabled, itemQueues } from './types';
import { normalizeFsPrefix } from './utils/fsPrefix';

/** Раздел каталога ФС — пункты попадают в C21 (SP интеграций). */
export const FS_INTEGRATIONS_GROUP = 'ФС интеграции';
/** Префикс группы раздела интеграций в листе «2.ФС для Заполнения». */
export const FS_INTEGRATIONS_GROUP_PREFIX = '11';

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

/** Пункт ФС с требованием НМД (эвристика, если в НСИ нет значения). */
export function isFsItemNmdLegacy(item: Pick<BriefingFsSel, 'name' | 'func_type'>): boolean {
  return item.name?.toLowerCase().includes('нмд') === true
    || (item.func_type?.includes('НМД') ?? false);
}

/** @deprecated Используйте catalogRequiresNmd / autoFsItemNmdValueForQueue */
export function isFsItemNmd(item: BriefingFsSel): boolean {
  return catalogRequiresNmd(item);
}

export { FS_NMD_VALUES, type FsNmdValue } from './types';

/** Приводит текст НСИ (CR) или ручной ввод к каноническому значению НМД. */
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

/** Вклад пункта в D20 / nmd_sp_auto: полный SP или SP/5 для типовой. */
export function nmdSpContribution(value: FsNmdValue, sp: number): number {
  if (sp <= 0) return 0;
  if (value === 'Требуется разработать') return sp;
  if (value === 'Используется типовая') return Math.ceil(sp / 5);
  return 0;
}

/** Есть ненулевой вклад в D20. */
export function nmdValueAddsToD20(value: FsNmdValue): boolean {
  return value === 'Требуется разработать' || value === 'Используется типовая';
}

/** НМД требуется по значению из НСИ (колонка CR Excel), нормализованное. */
export function catalogRequiresNmd(item: Pick<BriefingFsSel, 'requires_nmd' | 'name' | 'func_type'>): boolean {
  return catalogNmdLabel(item) !== 'Не требуется';
}

/** Нормализованное требование НМД из НСИ для подсказок в UI. */
export function catalogNmdLabel(
  item: Pick<BriefingFsSel, 'requires_nmd' | 'name' | 'func_type'>,
): FsNmdValue {
  const text = (item.requires_nmd ?? '').trim();
  if (text) return normalizeFsNmdValue(text);
  if (isFsItemNmdLegacy(item)) return 'Требуется разработать';
  return 'Не требуется';
}

/** Пункт ФС из раздела интеграций (группа «ФС интеграции» / префикс 11). */
export function isFsItemIntegration(item: BriefingFsSel): boolean {
  if (isFsIntegrationsGroup(item.group_name)) return true;
  return isFsIntegrationsGroupPrefix(item.group_prefix, item.prefix);
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

/** Нормативный SP из НСИ каталога. */
export function catalogSpForItem(item: BriefingFsSel): number {
  return item.catalog_story_points ?? item.story_points ?? 0;
}

export function effectiveFsItemSpForQueue(item: BriefingFsSel, q: FsQueueKey): number {
  const overrides = parseQueueSpOverrides(item.queue_sp_json);
  const manual = overrides[q];
  if (manual != null && Number.isFinite(manual)) return manual;
  return catalogSpForItem(item);
}

export function isFsItemSpManualForQueue(item: BriefingFsSel, q: FsQueueKey): boolean {
  return parseQueueSpOverrides(item.queue_sp_json)[q] != null;
}

export function patchFsItemQueueSp(
  item: BriefingFsSel,
  q: FsQueueKey,
  value: number,
): Partial<BriefingFsSel> {
  const overrides = parseQueueSpOverrides(item.queue_sp_json);
  const next = Math.max(0, Math.round(value));
  if (next === catalogSpForItem(item)) {
    delete overrides[q];
  } else {
    overrides[q] = next;
  }
  const queue_sp_json = Object.keys(overrides).length > 0 ? overrides : null;
  return {
    queue_sp_json,
    source: item.source ?? 'manual',
  };
}

export function resetFsItemQueueSp(item: BriefingFsSel, q: FsQueueKey): Partial<BriefingFsSel> {
  const overrides = parseQueueSpOverrides(item.queue_sp_json);
  delete overrides[q];
  const queue_sp_json = Object.keys(overrides).length > 0 ? overrides : null;
  return { queue_sp_json };
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

function resolveQueueNmdOverride(
  item: BriefingFsSel,
  q: FsQueueKey,
): FsNmdValue | undefined {
  const raw = parseQueueNmdJson(item.queue_nmd_json)[q];
  if (raw === undefined) return undefined;
  if (raw === 0 || raw === '0') return 'Не требуется';
  if (raw === 1 || raw === '1') return undefined;
  return normalizeFsNmdValue(String(raw));
}

export function autoFsItemNmdValueForQueue(
  item: Pick<BriefingFsSel, 'requires_nmd' | 'name' | 'func_type'>,
  _q?: FsQueueKey,
): FsNmdValue {
  return catalogNmdLabel(item);
}

/** @deprecated Используйте autoFsItemNmdValueForQueue / nmdValueAddsToD20 */
export function autoFsItemNmdForQueue(item: BriefingFsSel, q?: FsQueueKey): boolean {
  return nmdValueAddsToD20(autoFsItemNmdValueForQueue(item, q));
}

export function effectiveFsItemNmdValueForQueue(item: BriefingFsSel, q: FsQueueKey): FsNmdValue {
  const queues = itemQueues(item);
  if (queues[q] !== 1) return 'Не требуется';
  const manual = resolveQueueNmdOverride(item, q);
  if (manual !== undefined) return manual;
  return autoFsItemNmdValueForQueue(item, q);
}

export function effectiveFsItemNmdForQueue(item: BriefingFsSel, q: FsQueueKey): boolean {
  const sp = effectiveFsItemSpForQueue(item, q);
  return nmdSpContribution(effectiveFsItemNmdValueForQueue(item, q), sp) > 0;
}

export function isFsItemNmdManualForQueue(item: BriefingFsSel, q: FsQueueKey): boolean {
  const manual = resolveQueueNmdOverride(item, q);
  if (manual === undefined) return false;
  return manual !== autoFsItemNmdValueForQueue(item, q);
}

export function patchFsItemQueueNmd(
  item: BriefingFsSel,
  q: FsQueueKey,
  value: FsNmdValue,
): Partial<BriefingFsSel> {
  const overrides: QueueNmdOverrides = {};
  for (const key of FS_QUEUE_KEYS) {
    if (key === q) continue;
    const manual = resolveQueueNmdOverride(item, key);
    if (manual !== undefined && manual !== autoFsItemNmdValueForQueue(item, key)) {
      overrides[key] = manual;
    }
  }
  const auto = autoFsItemNmdValueForQueue(item, q);
  if (value !== auto) {
    overrides[q] = value;
  }
  const queue_nmd_json = Object.keys(overrides).length > 0 ? overrides : null;
  return { queue_nmd_json, source: item.source ?? 'manual' };
}

export function resetFsItemQueueNmd(item: BriefingFsSel, q: FsQueueKey): Partial<BriefingFsSel> {
  const overrides: QueueNmdOverrides = {};
  for (const key of FS_QUEUE_KEYS) {
    if (key === q) continue;
    const manual = resolveQueueNmdOverride(item, key);
    if (manual !== undefined && manual !== autoFsItemNmdValueForQueue(item, key)) {
      overrides[key] = manual;
    }
  }
  const queue_nmd_json = Object.keys(overrides).length > 0 ? overrides : null;
  return { queue_nmd_json };
}

/** Переносит ручные SP, НМД и комментарий при смене очереди (drag-and-drop). */
export function relocateFsItemQueueOverrides(
  item: BriefingFsSel,
  from: FsQueueKey,
  to: FsQueueKey,
): Partial<BriefingFsSel> {
  if (from === to) return {};

  let working: BriefingFsSel = item;

  if (isFsItemSpManualForQueue(working, from)) {
    const sp = effectiveFsItemSpForQueue(working, from);
    working = { ...working, ...patchFsItemQueueSp(working, to, sp) };
    working = { ...working, ...resetFsItemQueueSp(working, from) };
  }

  const fromNmd = effectiveFsItemNmdValueForQueue(working, from);
  const toAutoNmd = autoFsItemNmdValueForQueue(working, to);
  if (isFsItemNmdManualForQueue(working, from) || fromNmd !== toAutoNmd) {
    working = { ...working, ...patchFsItemQueueNmd(working, to, fromNmd) };
    working = { ...working, ...resetFsItemQueueNmd(working, from) };
  }

  const comment = effectiveFsItemCommentForQueue(working, from).trim();
  if (comment) {
    working = { ...working, ...patchFsItemQueueComment(working, to, comment) };
    working = { ...working, ...patchFsItemQueueComment(working, from, '') };
  }

  return {
    queue_sp_json: working.queue_sp_json,
    queue_nmd_json: working.queue_nmd_json,
    queue_comment_json: working.queue_comment_json,
    source: 'manual',
  };
}

export type QueueCommentMap = Partial<Record<FsQueueKey, string>>;

export function parseQueueCommentJson(
  raw: string | QueueCommentMap | null | undefined,
): QueueCommentMap {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(raw) as QueueCommentMap;
    return parsed && typeof parsed === 'object' ? { ...parsed } : {};
  } catch {
    return {};
  }
}

export function effectiveFsItemCommentForQueue(item: BriefingFsSel, q: FsQueueKey): string {
  return parseQueueCommentJson(item.queue_comment_json)[q] ?? '';
}

export function patchFsItemQueueComment(
  item: BriefingFsSel,
  q: FsQueueKey,
  value: string,
): Partial<BriefingFsSel> {
  const overrides = parseQueueCommentJson(item.queue_comment_json);
  const trimmed = value.trim();
  if (!trimmed) {
    delete overrides[q];
  } else {
    overrides[q] = trimmed;
  }
  const queue_comment_json = Object.keys(overrides).length > 0 ? overrides : null;
  return { queue_comment_json, source: item.source ?? 'manual' };
}

export interface QueueSpTotals {
  /** Excel C20 — функциональный SP по очереди (без интеграций и НМД) */
  functional_sp: Record<FsQueueKey, number>;
  /** Авто-оценка C21 из ФС (сумма SP раздела 11 / «ФС интеграции») */
  integrations_sp_auto: Record<FsQueueKey, number>;
  /** Авто-оценка D20 из ФС (сумма SP пунктов с НМД) */
  nmd_sp_auto: Record<FsQueueKey, number>;
  /** Сумма C20 по всем очередям (уникальные пункты, без интеграций и НМД) */
  all_queues: number;
  /** Сумма C21 по всем очередям */
  all_integrations: number;
  /** Сумма D20 по всем очередям (уникальные пункты с НМД) */
  all_nmd: number;
}

function emptyQueueRecord(): Record<FsQueueKey, number> {
  return Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as Record<FsQueueKey, number>;
}

/** Суммирует story_points пунктов ФС по очередям (НСИ × выбор очереди). */
export function computeQueueSpFromFs(items: BriefingFsSel[]): QueueSpTotals {
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

/** Excel E20 — IF(очередь активна, ROUNDUP(C20/5, 0), 0). */
export function autoLoadTestScenarios(active: boolean, functionalSp: number): number {
  if (!active || functionalSp <= 0) return 0;
  return Math.ceil(functionalSp / 5);
}
