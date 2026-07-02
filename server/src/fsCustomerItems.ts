import { db } from './db';
import {
  FS_QUEUE_KEYS,
  type FsQueuesMap,
  parseQueuesJson,
  primaryQueue,
  anyQueueEnabled,
  enabledFromQueues,
} from './fsQueues';
import type { FsSelection } from './briefingCalc';
import type { FsNmdValue } from './fsSpCalc';
import { parseDetailLinesJson, type BriefingFsDetailLine } from './briefingFsSnapshot';

export const CUSTOMER_FS_GROUP_PREFIXES = ['10', '11'] as const;
export type CustomerFsGroupPrefix = typeof CUSTOMER_FS_GROUP_PREFIXES[number];

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

function maxCatalogSuffixInGroup(groupPrefix: string): number {
  const rows = db.prepare(`
    SELECT prefix FROM fs_catalog
    WHERE group_prefix=? AND prefix IS NOT NULL AND prefix LIKE ?
      AND COALESCE(is_deleted, 0) = 0
  `).all(groupPrefix, `${groupPrefix}.%`) as { prefix: string }[];
  return maxSuffixInGroup(groupPrefix, rows.map(r => r.prefix));
}

function nextDisplayPrefix(briefingId: number, groupPrefix: CustomerFsGroupPrefix): string {
  const catalogMax = maxCatalogSuffixInGroup(groupPrefix);
  const rows = db.prepare(`
    SELECT display_prefix FROM briefing_fs_customer_items
    WHERE briefing_id=? AND group_prefix=?
  `).all(briefingId, groupPrefix) as { display_prefix: string | null }[];
  const customerMax = maxSuffixInGroup(groupPrefix, rows.map(r => r.display_prefix));
  return `${groupPrefix}.${Math.max(catalogMax, customerMax) + 1}`;
}

/** Перенумеровать функции заказчика сразу после последнего пункта каталога (10.14 → 10.15). */
export function normalizeCustomerDisplayPrefixes(briefingId: number): void {
  const upd = db.prepare(`UPDATE briefing_fs_customer_items SET display_prefix=? WHERE id=?`);
  for (const groupPrefix of CUSTOMER_FS_GROUP_PREFIXES) {
    const catalogMax = maxCatalogSuffixInGroup(groupPrefix);
    const items = db.prepare(`
      SELECT id FROM briefing_fs_customer_items
      WHERE briefing_id=? AND group_prefix=?
      ORDER BY sort_order, id
    `).all(briefingId, groupPrefix) as { id: number }[];
    let next = catalogMax + 1;
    for (const row of items) {
      upd.run(`${groupPrefix}.${next++}`, row.id);
    }
  }
}

export function isCustomerFsGroupPrefix(prefix: string | null | undefined): prefix is CustomerFsGroupPrefix {
  return prefix === '10' || prefix === '11';
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

export function customerFsItemIdFromFsItemId(fsItemId: number): number | null {
  return fsItemId < 0 ? -fsItemId : null;
}

export function fsItemIdForCustomerItem(customerItemId: number): number {
  return -customerItemId;
}

export interface BriefingFsCustomerItemRow {
  id: number;
  briefing_id: number;
  group_prefix: string;
  display_prefix: string | null;
  name: string;
  description: string | null;
  func_type: string;
  story_points: number;
  queues_json: string;
  queue_sp_json: string | null;
  queue_nmd_json: string | null;
  queue_comment_json: string | null;
  sort_order: number;
  detail_lines_json: string | null;
  inactive_for_customer: number | null;
}

export interface BriefingFsCustomerItemInput {
  id?: number;
  group_prefix: string;
  name: string;
  description?: string | null;
  func_type: string;
  story_points?: number;
  queues_json?: string | FsQueuesMap | Record<string, number>;
  queue_sp_json?: string | Record<string, number> | null;
  queue_nmd_json?: string | Record<string, FsNmdValue> | null;
  queue_comment_json?: string | Record<string, string> | null;
  sort_order?: number;
  detail_lines?: BriefingFsDetailLine[];
  inactive_for_customer?: boolean | number;
}

function groupNameForPrefix(groupPrefix: string): string {
  const row = db.prepare(`
    SELECT group_name FROM fs_catalog WHERE group_prefix=? AND group_name IS NOT NULL LIMIT 1
  `).get(groupPrefix) as { group_name: string } | undefined;
  return row?.group_name ?? (groupPrefix === '10' ? 'Прочие функциональные блоки' : 'Интеграции');
}

function serializeJsonField(value: string | Record<string, unknown> | null | undefined): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function loadBriefingFsCustomerItems(briefingId: number): BriefingFsCustomerItemRow[] {
  return db.prepare(`
    SELECT * FROM briefing_fs_customer_items
    WHERE briefing_id=?
    ORDER BY group_prefix, sort_order, id
  `).all(briefingId) as BriefingFsCustomerItemRow[];
}

export function customerItemsToFsSelections(rows: BriefingFsCustomerItemRow[]): FsSelection[] {
  return rows.map(row => {
    const queues = parseQueuesJson(row.queues_json);
    const enabled = enabledFromQueues(queues);
    const groupName = groupNameForPrefix(row.group_prefix);
    const detailLines = parseDetailLinesJson(row.detail_lines_json) ?? [];
    return {
      fs_item_id: fsItemIdForCustomerItem(row.id),
      customer_item_id: row.id,
      is_customer_item: true,
      enabled,
      queue: primaryQueue(queues),
      queues_json: queues,
      source: 'customer',
      story_points: row.story_points,
      catalog_story_points: row.story_points,
      queue_sp_json: row.queue_sp_json,
      queue_nmd_json: row.queue_nmd_json,
      queue_comment_json: row.queue_comment_json,
      phase: groupName,
      name: row.name,
      prefix: row.display_prefix,
      group_name: groupName,
      group_prefix: row.group_prefix,
      description: row.description,
      func_type: row.func_type,
      sort_order: row.sort_order,
      matched: true,
      matched_widgets: [],
      details: [],
      custom_lines: [],
      detail_lines: detailLines,
      inactive_for_customer: (row.inactive_for_customer ?? 0) === 1,
    };
  });
}

export function replaceBriefingFsCustomerItems(
  briefingId: number,
  items: BriefingFsCustomerItemInput[],
): void {
  const existing = loadBriefingFsCustomerItems(briefingId);
  const existingById = new Map(existing.map(r => [r.id, r]));
  const keptIds = new Set<number>();

  const ins = db.prepare(`
    INSERT INTO briefing_fs_customer_items(
      briefing_id, group_prefix, display_prefix, name, description, func_type, story_points,
      queues_json, queue_sp_json, queue_nmd_json, queue_comment_json, sort_order,
      detail_lines_json, inactive_for_customer
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const upd = db.prepare(`
    UPDATE briefing_fs_customer_items SET
      group_prefix=?, display_prefix=?, name=?, description=?, func_type=?, story_points=?,
      queues_json=?, queue_sp_json=?, queue_nmd_json=?, queue_comment_json=?, sort_order=?,
      detail_lines_json=?, inactive_for_customer=?
    WHERE id=? AND briefing_id=?
  `);

  let sortOrder = 0;
  for (const item of items) {
    const name = item.name?.trim();
    if (!name || !isCustomerFsGroupPrefix(item.group_prefix)) continue;

    const funcType = item.func_type?.trim() || 'ПРОФ';
    const sp = item.story_points ?? defaultSpForFuncType(funcType);
    const queues = parseQueuesJson(
      typeof item.queues_json === 'string' ? item.queues_json : JSON.stringify(item.queues_json ?? null),
    );
    const queuesJson = JSON.stringify(queues);
    const queueSpJson = serializeJsonField(item.queue_sp_json);
    const queueNmdJson = serializeJsonField(item.queue_nmd_json);
    const queueCommentJson = serializeJsonField(item.queue_comment_json);
    const order = item.sort_order ?? sortOrder++;
    const detailLinesJson = item.detail_lines == null
      ? null
      : JSON.stringify(
        item.detail_lines
          .filter(l => l.name?.trim())
          .map((l, i) => ({
            catalog_detail_id: null,
            source: 'customer' as const,
            name: l.name.trim(),
            description: l.description?.trim() || null,
            inactive: Boolean(l.inactive),
            nsi_name: null,
            nsi_description: null,
            sort_order: l.sort_order ?? i,
          })),
      );
    const inactive = item.inactive_for_customer === true || item.inactive_for_customer === 1 ? 1 : 0;

    if (item.id && existingById.has(item.id)) {
      const prev = existingById.get(item.id)!;
      const displayPrefix = prev.display_prefix
        ?? nextDisplayPrefix(briefingId, item.group_prefix as CustomerFsGroupPrefix);
      upd.run(
        item.group_prefix, displayPrefix, name, item.description?.trim() || null,
        funcType, sp, queuesJson, queueSpJson, queueNmdJson, queueCommentJson, order,
        detailLinesJson, inactive,
        item.id, briefingId,
      );
      keptIds.add(item.id);
    } else {
      const displayPrefix = nextDisplayPrefix(briefingId, item.group_prefix as CustomerFsGroupPrefix);
      const result = ins.run(
        briefingId, item.group_prefix, displayPrefix, name, item.description?.trim() || null,
        funcType, sp, queuesJson, queueSpJson, queueNmdJson, queueCommentJson, order,
        detailLinesJson, inactive,
      );
      keptIds.add(Number(result.lastInsertRowid));
    }
  }

  const toDelete = existing.filter(r => !keptIds.has(r.id));
  if (toDelete.length > 0) {
    const ph = toDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM briefing_fs_customer_items WHERE briefing_id=? AND id IN (${ph})`)
      .run(briefingId, ...toDelete.map(r => r.id));
  }
  normalizeCustomerDisplayPrefixes(briefingId);
}

export function computeCustomerQueueSp(briefingId: number): Map<string, number> {
  const queueMap = new Map<string, number>();
  const rows = loadBriefingFsCustomerItems(briefingId);
  for (const row of rows) {
    const queues = parseQueuesJson(row.queues_json);
    if (!anyQueueEnabled(queues)) continue;
    const overrides = row.queue_sp_json ? JSON.parse(row.queue_sp_json) as Record<string, number> : {};
    for (const qKey of FS_QUEUE_KEYS) {
      if (!queues[qKey]) continue;
      const sp = overrides[qKey] ?? row.story_points ?? 0;
      queueMap.set(qKey, (queueMap.get(qKey) ?? 0) + sp);
    }
  }
  return queueMap;
}
