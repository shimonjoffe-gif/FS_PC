/**
 * Briefing versioning (hybrid model):
 * - draft = live briefing_* tables
 * - frozen = JSON dump of getBriefingFull at freeze time
 */
import { db } from './db';
import { getDefaultParams } from './briefingCalc';
import { ensureBriefingFsSnapshot } from './briefingFsSnapshot';

export type BriefingVersionStatus = 'draft' | 'frozen';

export interface BriefingVersionMeta {
  id: number;
  briefing_id: number;
  version_no: number;
  status: BriefingVersionStatus;
  label: string;
  note: string | null;
  source: string | null;
  created_at: string;
  frozen_at: string | null;
}

export interface BriefingVersionDump {
  dump_format: 1;
  frozen_at: string;
  /** Full API snapshot at freeze time (for read-only view + compare). */
  full: Record<string, unknown>;
}

async function ensureAssessmentRowLocal(briefingId: number) {
  const exists = await db.prepare(`SELECT briefing_id FROM briefing_assessment WHERE briefing_id=?`).get(briefingId);
  if (!exists) {
    await db.prepare(`INSERT INTO briefing_assessment(briefing_id) VALUES (?)`).run(briefingId);
  }
}

export async function listBriefingVersions(briefingId: number): Promise<BriefingVersionMeta[]> {
  await ensureBriefingVersionsMigrated(briefingId);
  return await db.prepare(`
    SELECT id, briefing_id, version_no, status, label, note, source, created_at, frozen_at
    FROM briefing_versions
    WHERE briefing_id=?
    ORDER BY version_no ASC
  `).all(briefingId) as BriefingVersionMeta[];
}

export async function getDraftVersion(briefingId: number): Promise<BriefingVersionMeta | null> {
  await ensureBriefingVersionsMigrated(briefingId);
  return (await db.prepare(`
    SELECT id, briefing_id, version_no, status, label, note, source, created_at, frozen_at
    FROM briefing_versions
    WHERE briefing_id=? AND status='draft'
    ORDER BY version_no DESC
    LIMIT 1
  `).get(briefingId) as BriefingVersionMeta | undefined) ?? null;
}

export async function getBriefingVersion(versionId: number): Promise<BriefingVersionMeta | null> {
  return (await db.prepare(`
    SELECT id, briefing_id, version_no, status, label, note, source, created_at, frozen_at
    FROM briefing_versions WHERE id=?
  `).get(versionId) as BriefingVersionMeta | undefined) ?? null;
}

export async function getVersionDump(versionId: number): Promise<BriefingVersionDump | null> {
  const row = await db.prepare(`SELECT dump_json FROM briefing_versions WHERE id=?`).get(versionId) as
    | { dump_json: string | null }
    | undefined;
  if (!row?.dump_json) return null;
  try {
    return JSON.parse(row.dump_json) as BriefingVersionDump;
  } catch {
    return null;
  }
}

/** Migrate one briefing: create v1 draft if no versions exist. */
export async function ensureBriefingVersionsMigrated(briefingId: number): unknown {
  const count = await db.prepare(`
    SELECT COUNT(*) AS c FROM briefing_versions WHERE briefing_id=?
  `).get(briefingId) as { c: number };
  if (count.c > 0) return;

  const briefing = await db.prepare(`SELECT id FROM briefings WHERE id=?`).get(briefingId) as
    | { id: number }
    | undefined;
  if (!briefing) return;

  await db.prepare(`
    INSERT INTO briefing_versions(briefing_id, version_no, status, label, source, created_at)
    VALUES (?, 1, 'draft', 'v1', 'migration', CURRENT_TIMESTAMP)
  `).run(briefingId);

  const ver = await db.prepare(`
    SELECT id FROM briefing_versions WHERE briefing_id=? AND version_no=1
  `).get(briefingId) as { id: number };

  await db.prepare(`UPDATE briefings SET active_version_id=? WHERE id=?`).run(ver.id, briefingId);
}

/** Migrate all briefings missing versions (called from initDB). */
export async function migrateAllBriefingVersions(): unknown {
  const ids = await db.prepare(`SELECT id FROM briefings`).all() as { id: number }[];
  for (const { id } of ids) {
    await ensureBriefingVersionsMigrated(id);
  }
}

export async function clearLiveBriefingContent(briefingId: number): unknown {
  await db.prepare(`DELETE FROM briefing_assessment_snapshots WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_widget_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_customer_widget_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_solution_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_problem_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_fs_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_fs_customer_items WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_fs_custom WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_fs_catalog_usage WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_fs_snapshot WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_queue_calc WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_industry_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_activity_type_sel WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_assessment WHERE briefing_id=?`).run(briefingId);
  await db.prepare(`DELETE FROM briefing_params WHERE briefing_id=?`).run(briefingId);

  await db.prepare(`
    UPDATE briefings SET
      industry_id=NULL, segment_id=NULL, scenario=NULL, headcount=NULL,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(briefingId);

  const defaults = await getDefaultParams();
  await db.prepare(`
    INSERT INTO briefing_params(briefing_id, hourly_rate, accuracy, sp_cost_rub, phases_json, team_json, queue_labels_json)
    VALUES (?,?,?,?,?,?,?)
  `).run(
    briefingId,
    defaults.hourly_rate,
    defaults.accuracy,
    defaults.sp_cost_rub,
    JSON.stringify(defaults.phases_json),
    JSON.stringify(defaults.team_json),
    JSON.stringify(defaults.queue_labels_json),
  );
  await ensureAssessmentRowLocal(briefingId);
  await ensureBriefingFsSnapshot(briefingId);
}

export interface CreateBriefingVersionOptions {
  label?: string;
  note?: string;
  source?: 'manual' | 'customer_import';
}

export interface CreateBriefingVersionResult {
  frozen: BriefingVersionMeta;
  draft: BriefingVersionMeta;
}

/**
 * Freeze current draft (dump full briefing), create next draft as clean shell.
 */
export async function createBriefingVersion(
  briefingId: number,
  getFull: (id: number) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null,
  options: CreateBriefingVersionOptions = {},
): Promise<CreateBriefingVersionResult> {
  await ensureBriefingVersionsMigrated(briefingId);

  const draft = await getDraftVersion(briefingId);
  if (!draft) throw new Error('Нет черновика версии для заморозки');

  const full = await getFull(briefingId);
  if (!full) throw new Error('Предоценка не найдена');

  const now = new Date().toISOString();
  const dump: BriefingVersionDump = {
    dump_format: 1,
    frozen_at: now,
    full,
  };

  const newDraftId = await db.transaction(async () => {
    await db.prepare(`
      UPDATE briefing_versions SET
        status='frozen',
        frozen_at=?,
        dump_json=?,
        note=COALESCE(?, note)
      WHERE id=?
    `).run(now, JSON.stringify(dump), options.note ?? null, draft.id);

    const maxNo = (await db.prepare(`
      SELECT MAX(version_no) AS m FROM briefing_versions WHERE briefing_id=?
    `).get(briefingId) as { m: number }).m;

    const nextNo = maxNo + 1;
    const label = options.label?.trim() || `v${nextNo}`;
    const source = options.source ?? 'manual';

    const ins = await db.prepare(`
      INSERT INTO briefing_versions(briefing_id, version_no, status, label, note, source, created_at)
      VALUES (?, ?, 'draft', ?, NULL, ?, CURRENT_TIMESTAMP)
    `).run(briefingId, nextNo, label, source);

    const id = Number(ins.lastInsertRowid);
    await clearLiveBriefingContent(briefingId);
    await db.prepare(`UPDATE briefings SET active_version_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(id, briefingId);

    return id;
  });

  const frozen = (await getBriefingVersion(draft.id))!;
  const newDraft = (await getBriefingVersion(newDraftId))!;
  return { frozen, draft: newDraft };
}

/** Build a read-only BriefingFull-like payload from a frozen dump. */
export async function viewFrozenVersion(versionId: number): Promise<{
  meta: BriefingVersionMeta;
  data: Record<string, unknown>;
} | null> {
  const meta = await getBriefingVersion(versionId);
  if (!meta || meta.status !== 'frozen') return null;
  const dump = await getVersionDump(versionId);
  if (!dump?.full) return null;
  return {
    meta,
    data: {
      ...dump.full,
      read_only: true,
      viewed_version_id: meta.id,
    },
  };
}
