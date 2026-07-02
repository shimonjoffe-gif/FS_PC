import { db } from './db';
import { normalizeFsPrefix } from './fsPrefix';
import { maxSuffixInGroup } from './fsCustomerItems';
import { defaultSpForFuncType } from './fsCustomerItems';
import { FS_CATALOG_ACTIVE_SQL } from './fsCatalogActive';

export function nextFsCatalogPrefixInGroup(groupPrefix: string): string {
  const rows = db.prepare(`
    SELECT prefix FROM fs_catalog
    WHERE group_prefix=? AND prefix IS NOT NULL AND trim(prefix) != ''
      AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).all(groupPrefix) as { prefix: string }[];
  const max = maxSuffixInGroup(groupPrefix, rows.map(r => r.prefix));
  return `${groupPrefix}.${max + 1}`;
}

export function groupDefaults(groupPrefix: string, groupName: string) {
  const sample = db.prepare(`
    SELECT phase, queue, default_queues_json, sort_order
    FROM fs_catalog
    WHERE group_prefix=? AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order DESC, id DESC
    LIMIT 1
  `).get(groupPrefix) as {
    phase: string | null;
    queue: string | null;
    default_queues_json: string | null;
    sort_order: number | null;
  } | undefined;

  const maxSort = (db.prepare(`
    SELECT MAX(sort_order) as m FROM fs_catalog WHERE group_prefix=? AND ${FS_CATALOG_ACTIVE_SQL}
  `).get(groupPrefix) as { m: number | null } | undefined)?.m ?? 0;

  return {
    phase: sample?.phase ?? groupName,
    queue: sample?.queue ?? '1',
    default_queues_json: sample?.default_queues_json ?? '{"1":0,"2":0,"3":0,"4":0}',
    sort_order: maxSort + 1,
  };
}

export interface CreateFsCatalogItemInput {
  group_prefix: string;
  group_name: string;
  name: string;
  prefix?: string | null;
  func_type?: string | null;
  story_points?: number;
  requires_nmd?: string | null;
  description?: string | null;
  details?: { name: string; description?: string | null }[];
}

export function createFsCatalogItem(input: CreateFsCatalogItemInput): {
  id: number;
  prefix: string;
} {
  const groupPrefix = normalizeFsPrefix(input.group_prefix) ?? input.group_prefix;
  const name = input.name?.trim();
  if (!name || !groupPrefix) throw new Error('invalid input');

  const prefix = normalizeFsPrefix(input.prefix) ?? nextFsCatalogPrefixInGroup(groupPrefix);
  const funcType = input.func_type?.trim() || 'ПРОФ';
  const sp = input.story_points ?? defaultSpForFuncType(funcType);
  const requiresNmd = input.requires_nmd?.trim() || 'Не требуется';
  const defaults = groupDefaults(groupPrefix, input.group_name);

  const ins = db.prepare(`
    INSERT INTO fs_catalog(
      prefix, name, description, group_name, group_prefix, item_type, parent_id, sort_order,
      phase, queue, default_queues_json, story_points, func_type, requires_nmd, published
    ) VALUES (?,?,?,?,?,'item',NULL,?,?,?,?,?,?,?,0)
  `);

  const result = ins.run(
    prefix,
    name,
    input.description?.trim() || null,
    input.group_name,
    groupPrefix,
    defaults.sort_order,
    defaults.phase,
    defaults.queue,
    defaults.default_queues_json,
    sp,
    funcType,
    requiresNmd,
  );

  const id = Number(result.lastInsertRowid);
  const lines = (input.details ?? []).filter(d => d.name?.trim());
  if (lines.length > 0) {
    const insDetail = db.prepare(`
      INSERT INTO fs_catalog(name, description, item_type, parent_id, sort_order, phase, queue, story_points, default_queues_json)
      VALUES (?,?,?,?,?,?,?,0,'{"1":0,"2":0,"3":0,"4":0}')
    `);
    let order = 0;
    for (const line of lines) {
      insDetail.run(
        line.name.trim(),
        line.description?.trim() || null,
        'detail',
        id,
        order++,
        defaults.phase,
        defaults.queue ?? '1',
      );
    }
  }

  return { id, prefix };
}

export function publishFsCatalogItem(id: number): boolean {
  const row = db.prepare(`
    SELECT id FROM fs_catalog WHERE id=? AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).get(id);
  if (!row) return false;
  db.prepare(`UPDATE fs_catalog SET published=1 WHERE id=?`).run(id);
  return true;
}

export function loadFsCatalogItemById(id: number) {
  const item = db.prepare(`
    SELECT id, prefix, name, description, func_type, story_points, requires_nmd, group_name, group_prefix, sort_order, phase, queue, published
    FROM fs_catalog
    WHERE id=? AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).get(id) as {
    id: number; prefix: string | null; name: string; description: string | null;
    func_type: string | null; story_points: number; requires_nmd: string | null;
    group_name: string | null; group_prefix: string | null; sort_order: number;
    phase: string; queue: string; published: number;
  } | undefined;
  if (!item) return null;

  const details = db.prepare(`
    SELECT name, description FROM fs_catalog
    WHERE parent_id=? AND item_type='detail' AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order, id
  `).all(id) as { name: string; description: string | null }[];

  return { ...item, details };
}
