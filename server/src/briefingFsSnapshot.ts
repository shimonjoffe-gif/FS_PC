import { db } from './db';
import { EMPTY_QUEUES, parseQueuesJson } from './fsQueues';
import { FS_CATALOG_ACTIVE_SQL } from './fsCatalogActive';

export interface FsCatalogDetail {
  name: string;
  description: string | null;
}

export interface FsCustomLine {
  id: number;
  briefing_id: number;
  parent_fs_item_id: number | null;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface BriefingFsDetailLine {
  catalog_detail_id?: number | null;
  source: 'nsi' | 'customer';
  name: string;
  description: string | null;
  inactive: boolean;
  nsi_name?: string | null;
  nsi_description?: string | null;
  sort_order: number;
}

export function loadCatalogDetails(fsItemId: number): FsCatalogDetail[] {
  return db.prepare(`
    SELECT name, description FROM fs_catalog
    WHERE parent_id=? AND item_type='detail'
    ORDER BY sort_order, id
  `).all(fsItemId) as FsCatalogDetail[];
}

export function loadCatalogDetailsWithIds(fsItemId: number): { id: number; name: string; description: string | null }[] {
  return db.prepare(`
    SELECT id, name, description FROM fs_catalog
    WHERE parent_id=? AND item_type='detail'
    ORDER BY sort_order, id
  `).all(fsItemId) as { id: number; name: string; description: string | null }[];
}

export function parseDetailLinesJson(raw: string | null | undefined): BriefingFsDetailLine[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((d): d is BriefingFsDetailLine => d != null && typeof d === 'object' && typeof (d as BriefingFsDetailLine).name === 'string')
      .map((d, i) => ({
        catalog_detail_id: d.catalog_detail_id ?? null,
        source: d.source === 'customer' ? 'customer' as const : 'nsi' as const,
        name: d.name,
        description: d.description ?? null,
        inactive: Boolean(d.inactive),
        nsi_name: d.nsi_name ?? null,
        nsi_description: d.nsi_description ?? null,
        sort_order: typeof d.sort_order === 'number' ? d.sort_order : i,
      }));
  } catch {
    return null;
  }
}

export function buildDetailLinesFromSources(
  snapDetailsJson: string | null | undefined,
  fsItemId: number,
  customLines: FsCustomLine[],
): BriefingFsDetailLine[] {
  const snapDetails = resolveFsDetails(snapDetailsJson, fsItemId);
  const catalogRows = loadCatalogDetailsWithIds(fsItemId);
  const lines: BriefingFsDetailLine[] = [];
  let order = 0;
  for (const d of snapDetails) {
    const match = catalogRows.find(c => c.name === d.name && (c.description ?? '') === (d.description ?? ''))
      ?? catalogRows.find(c => c.name === d.name);
    lines.push({
      catalog_detail_id: match?.id ?? null,
      source: 'nsi',
      name: d.name,
      description: d.description,
      inactive: false,
      nsi_name: d.name,
      nsi_description: d.description,
      sort_order: order++,
    });
  }
  for (const c of customLines.filter(l => l.parent_fs_item_id === fsItemId)) {
    lines.push({
      catalog_detail_id: null,
      source: 'customer',
      name: c.name,
      description: c.description,
      inactive: false,
      sort_order: order++,
    });
  }
  return lines;
}

export function resolveDetailLines(
  detailLinesJson: string | null | undefined,
  snapDetailsJson: string | null | undefined,
  fsItemId: number,
  customLines: FsCustomLine[],
): BriefingFsDetailLine[] {
  const stored = parseDetailLinesJson(detailLinesJson);
  if (stored && stored.length > 0) return stored;
  return buildDetailLinesFromSources(snapDetailsJson, fsItemId, customLines);
}

export function detailsToDescription(details: FsCatalogDetail[], itemDescription?: string | null): string {
  const parts: string[] = [];
  if (itemDescription?.trim()) parts.push(itemDescription.trim());
  for (const d of details) {
    const line = [d.name, d.description].filter(Boolean).join(' — ');
    if (line.trim()) parts.push(line.trim());
  }
  return parts.join('\n');
}

function buildCatalogDescription(fsItemId: number, itemDescription: string | null): string {
  return detailsToDescription(loadCatalogDetails(fsItemId), itemDescription);
}

export function parseSnapDetailsJson(raw: string | null | undefined): FsCatalogDetail[] | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((d): d is FsCatalogDetail => d != null && typeof d === 'object' && typeof (d as FsCatalogDetail).name === 'string')
      .map(d => ({ name: d.name, description: d.description ?? null }));
  } catch {
    return null;
  }
}

export function resolveFsDetails(
  snapDetailsJson: string | null | undefined,
  fsItemId: number,
): FsCatalogDetail[] {
  const fromSnap = parseSnapDetailsJson(snapDetailsJson);
  if (fromSnap) return fromSnap;
  return loadCatalogDetails(fsItemId);
}

export function hasBriefingFsSnapshot(briefingId: number): boolean {
  const row = db.prepare(`SELECT 1 FROM briefing_fs_snapshot WHERE briefing_id=?`).get(briefingId);
  return row != null;
}

/** Копия актуального НСИ ФС в брифинг (один раз при создании). */
export function ensureBriefingFsSnapshot(briefingId: number): void {
  if (hasBriefingFsSnapshot(briefingId)) return;

  const catalogItems = db.prepare(`
    SELECT id, prefix, name, description, func_type, story_points, requires_nmd, default_queues_json, queue
    FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item') AND published = 1 AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order, id
  `).all() as {
    id: number; prefix: string | null; name: string; description: string | null;
    func_type: string | null; story_points: number; requires_nmd: string | null;
    default_queues_json: string | null; queue: string;
  }[];

  const ins = db.prepare(`
    INSERT OR IGNORE INTO briefing_fs_sel(
      briefing_id, fs_item_id, enabled, queue, queues_json, source, story_points,
      snap_prefix, snap_name, snap_description, snap_details_json, snap_func_type, snap_story_points, snap_requires_nmd,
      inactive_for_customer
    ) VALUES (?,?,0,?,?,NULL,?,?,?,?,?,?,?,?,0)
  `);

  const tx = db.transaction(() => {
    for (const fc of catalogItems) {
      const details = loadCatalogDetails(fc.id);
      const description = detailsToDescription(details, fc.description);
      ins.run(
        briefingId,
        fc.id,
        fc.queue || '1',
        JSON.stringify({ ...EMPTY_QUEUES }),
        fc.story_points,
        fc.prefix,
        fc.name,
        description || null,
        details.length > 0 ? JSON.stringify(details) : null,
        fc.func_type,
        fc.story_points,
        fc.requires_nmd,
      );
    }
    db.prepare(`
      INSERT INTO briefing_fs_snapshot(briefing_id, catalog_items_count)
      VALUES (?,?)
    `).run(briefingId, catalogItems.length);
  });
  tx();
}

export function listPublishedCatalogItemsMissingFromBriefing(briefingId: number) {
  return db.prepare(`
    SELECT fc.id, fc.prefix, fc.name, fc.description, fc.func_type, fc.story_points, fc.requires_nmd,
           fc.group_name, fc.group_prefix, fc.sort_order
    FROM fs_catalog fc
    WHERE (fc.item_type IS NULL OR fc.item_type = 'item')
      AND fc.published = 1 AND COALESCE(fc.is_deleted, 0) = 0
      AND fc.id NOT IN (SELECT fs_item_id FROM briefing_fs_sel WHERE briefing_id = ?)
    ORDER BY fc.sort_order, fc.id
  `).all(briefingId);
}

export function addPublishedCatalogItemsToBriefing(briefingId: number, fsItemIds: number[]): number {
  if (fsItemIds.length === 0) return 0;
  ensureBriefingFsSnapshot(briefingId);

  const placeholders = fsItemIds.map(() => '?').join(',');
  const catalogItems = db.prepare(`
    SELECT id, prefix, name, description, func_type, story_points, requires_nmd, default_queues_json, queue
    FROM fs_catalog
    WHERE id IN (${placeholders}) AND published = 1 AND (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
  `).all(...fsItemIds) as {
    id: number; prefix: string | null; name: string; description: string | null;
    func_type: string | null; story_points: number; requires_nmd: string | null;
    default_queues_json: string | null; queue: string;
  }[];

  const ins = db.prepare(`
    INSERT OR IGNORE INTO briefing_fs_sel(
      briefing_id, fs_item_id, enabled, queue, queues_json, source, story_points,
      snap_prefix, snap_name, snap_description, snap_details_json, snap_func_type, snap_story_points, snap_requires_nmd,
      inactive_for_customer
    ) VALUES (?,?,0,?,?,NULL,?,?,?,?,?,?,?,?,0)
  `);

  let added = 0;
  const tx = db.transaction(() => {
    for (const fc of catalogItems) {
      const details = loadCatalogDetails(fc.id);
      const description = detailsToDescription(details, fc.description);
      const result = ins.run(
        briefingId,
        fc.id,
        fc.queue || '1',
        JSON.stringify({ ...EMPTY_QUEUES }),
        fc.story_points,
        fc.prefix,
        fc.name,
        description || null,
        details.length > 0 ? JSON.stringify(details) : null,
        fc.func_type,
        fc.story_points,
        fc.requires_nmd,
      );
      if (result.changes > 0) added++;
    }
  });
  tx();
  return added;
}

export function loadBriefingFsCustomLines(briefingId: number): FsCustomLine[] {
  return db.prepare(`
    SELECT id, briefing_id, parent_fs_item_id, name, description, sort_order
    FROM briefing_fs_custom
    WHERE briefing_id=?
    ORDER BY parent_fs_item_id, sort_order, id
  `).all(briefingId) as FsCustomLine[];
}

export function replaceBriefingFsCustomLines(
  briefingId: number,
  lines: { id?: number; parent_fs_item_id: number | null; name: string; description?: string | null; sort_order?: number }[],
): void {
  const del = db.prepare(`DELETE FROM briefing_fs_custom WHERE briefing_id=?`);
  const ins = db.prepare(`
    INSERT INTO briefing_fs_custom(briefing_id, parent_fs_item_id, name, description, sort_order)
    VALUES (?,?,?,?,?)
  `);
  const tx = db.transaction(() => {
    del.run(briefingId);
    let order = 0;
    for (const line of lines) {
      if (!line.name?.trim()) continue;
      ins.run(
        briefingId,
        line.parent_fs_item_id,
        line.name.trim(),
        line.description?.trim() || null,
        line.sort_order ?? order++,
      );
    }
  });
  tx();
}

export function recordFsCatalogUsage(
  briefingId: number,
  fsItemId: number,
  data: {
    catalog_prefix?: string | null;
    catalog_name?: string | null;
    catalog_description?: string | null;
    func_type?: string | null;
    story_points?: number | null;
    requires_nmd?: string | null;
  },
): void {
  db.prepare(`
    INSERT INTO briefing_fs_catalog_usage(
      briefing_id, fs_item_id, catalog_prefix, catalog_name, catalog_description,
      func_type, story_points, requires_nmd
    ) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(briefing_id, fs_item_id) DO UPDATE SET
      catalog_prefix=excluded.catalog_prefix,
      catalog_name=excluded.catalog_name,
      catalog_description=excluded.catalog_description,
      func_type=excluded.func_type,
      story_points=excluded.story_points,
      requires_nmd=excluded.requires_nmd,
      recorded_at=CURRENT_TIMESTAMP
  `).run(
    briefingId,
    fsItemId,
    data.catalog_prefix ?? null,
    data.catalog_name ?? null,
    data.catalog_description ?? null,
    data.func_type ?? null,
    data.story_points ?? null,
    data.requires_nmd ?? null,
  );
}

export function listFsCatalogUsageForBriefing(briefingId: number) {
  return db.prepare(`
    SELECT u.*, b.name as briefing_name, b.project_id
    FROM briefing_fs_catalog_usage u
    JOIN briefings b ON b.id = u.briefing_id
    WHERE u.briefing_id=?
    ORDER BY u.fs_item_id
  `).all(briefingId);
}

export function listFsCatalogUsageByCatalogItem(fsItemId: number) {
  return db.prepare(`
    SELECT u.*, b.name as briefing_name, b.project_id, b.created_at
    FROM briefing_fs_catalog_usage u
    JOIN briefings b ON b.id = u.briefing_id
    WHERE u.fs_item_id=?
    ORDER BY u.recorded_at DESC
  `).all(fsItemId);
}

export { buildCatalogDescription };
