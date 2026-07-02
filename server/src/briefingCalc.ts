import { db } from './db';
import {
  FS_QUEUE_KEYS, FsQueuesMap, EMPTY_QUEUES, parseQueuesJson, queuesFromLegacy, primaryQueue, anyQueueEnabled, enabledFromQueues,
  FS_QUEUE_LABELS,
} from './fsQueues';
import { compareFsByGroupThenPrefix } from './fsPrefixSort';
import { loadBriefingQueueRates, effectiveRateForQueue } from './briefingAssessmentRates';
import type { FsNmdValue } from './fsSpCalc';
import {
  ensureBriefingFsSnapshot, hasBriefingFsSnapshot, loadBriefingFsCustomLines, type FsCustomLine, type BriefingFsDetailLine,
  resolveFsDetails, detailsToDescription, resolveDetailLines,
} from './briefingFsSnapshot';
import {
  loadBriefingFsCustomerItems,
  customerItemsToFsSelections,
  computeCustomerQueueSp,
} from './fsCustomerItems';

export interface TeamProportions {
  рп: number;
  аналит_конс: number;
  аналит_эксп: number;
  архит: number;
  програм1: number;
  програм2: number;
  куратор: number;
}

export interface PhaseConfig {
  phase_id: number;
  name: string;
  enabled: boolean;
}

export interface BriefingParams {
  hourly_rate: number;
  /** Точность оценки C58, % — budget multiplier = 1 + accuracy/100 */
  accuracy: number;
  sp_cost_rub: number;
  phases_json: PhaseConfig[];
  team_json: TeamProportions;
  queue_labels_json?: Record<string, string>;
}

export interface FsSelection {
  fs_item_id: number;
  enabled: number;
  queue: string;
  queues_json: string | FsQueuesMap;
  source: string | null;
  story_points: number | null;
  catalog_story_points?: number;
  requires_nmd?: string | null;
  queue_sp_json?: string | Partial<Record<string, number>> | null;
  queue_nmd_json?: string | Partial<Record<string, FsNmdValue>> | null;
  queue_comment_json?: string | Partial<Record<string, string>> | null;
  phase: string | null;
  name: string;
  code?: string | null;
  prefix?: string | null;
  group_name?: string | null;
  group_prefix?: string | null;
  description?: string | null;
  item_type?: string;
  func_type?: string | null;
  sort_order?: number;
  matched_widgets?: { id: number; name: string; description?: string | null; image_path?: string | null }[];
  details?: { name: string; description: string | null }[];
  matched?: boolean;
  /** Расшифровка из снимка НСИ на момент оценки. */
  catalog_description?: string | null;
  customer_name?: string | null;
  customer_description?: string | null;
  inactive_for_customer?: boolean;
  custom_lines?: FsCustomLine[];
  detail_lines?: BriefingFsDetailLine[];
  is_customer_item?: boolean;
  customer_item_id?: number;
}

type DerivedFsMeta = { source: string; story_points: number | null; widget_ids: Set<number> };

function buildDerivedFsMap(briefingId: number): Map<number, DerivedFsMeta> {
  const briefing = db.prepare(`SELECT industry_id, segment_id FROM briefings WHERE id=?`).get(briefingId) as {
    industry_id: number | null; segment_id: number | null;
  } | undefined;
  if (!briefing) return new Map();

  const selectedSolutions = db.prepare(`
    SELECT solution_id FROM briefing_solution_sel WHERE briefing_id=?
  `).all(briefingId) as { solution_id: number }[];
  const solIds = selectedSolutions.map(s => s.solution_id);

  const fsMap = new Map<number, DerivedFsMeta>();

  if (solIds.length > 0) {
    const placeholders = solIds.map(() => '?').join(',');
    const fromSolutions = db.prepare(`
      SELECT sfm.fs_item_id, fc.story_points
      FROM solution_fs_map sfm
      JOIN fs_catalog fc ON fc.id = sfm.fs_item_id AND fc.published = 1 AND COALESCE(fc.is_deleted, 0) = 0
      WHERE sfm.solution_id IN (${placeholders}) AND (fc.item_type IS NULL OR fc.item_type = 'item')
    `).all(...solIds) as { fs_item_id: number; story_points: number }[];
    for (const r of fromSolutions) {
      fsMap.set(r.fs_item_id, { source: 'solution', story_points: r.story_points, widget_ids: new Set() });
    }
  }

  const widgets = db.prepare(`
    SELECT bws.widget_id, w.name as widget_name
    FROM briefing_widget_sel bws
    JOIN widgets w ON w.id = bws.widget_id
    WHERE bws.briefing_id=?
      AND bws.solution_id IN (SELECT solution_id FROM briefing_solution_sel WHERE briefing_id=?)
  `).all(briefingId, briefingId) as { widget_id: number; widget_name: string }[];
  if (widgets.length > 0) {
    const wIds = widgets.map(w => w.widget_id);
    const placeholders = wIds.map(() => '?').join(',');
    const fromWidgets = db.prepare(`
      SELECT wfm.widget_id, wfm.fs_item_id, fc.story_points
      FROM widget_fs_map wfm
      JOIN fs_catalog fc ON fc.id = wfm.fs_item_id AND fc.published = 1 AND COALESCE(fc.is_deleted, 0) = 0
      WHERE wfm.widget_id IN (${placeholders}) AND (fc.item_type IS NULL OR fc.item_type = 'item')
    `).all(...wIds) as { widget_id: number; fs_item_id: number; story_points: number }[];
    for (const r of fromWidgets) {
      const cur = fsMap.get(r.fs_item_id);
      if (cur) {
        cur.source = 'widget';
        cur.widget_ids.add(r.widget_id);
        if (cur.story_points == null) cur.story_points = r.story_points;
      } else {
        fsMap.set(r.fs_item_id, { source: 'widget', story_points: r.story_points, widget_ids: new Set([r.widget_id]) });
      }
    }
  }

  if (briefing.industry_id) {
    const industry = db.prepare(`SELECT name FROM industries WHERE id=?`).get(briefing.industry_id) as { name: string } | undefined;
    const profile = industry?.name ?? '';
    const industryProfiles = ['Девелопмент', 'Капстрой', 'EPC'];
    const matchedProfile = industryProfiles.find(p => profile.includes(p) || p.includes(profile));
    if (matchedProfile) {
      const blocks = db.prepare(`
        SELECT fib.fs_item_id, fc.story_points
        FROM fs_industry_blocks fib
        JOIN fs_catalog fc ON fc.id = fib.fs_item_id AND fc.published = 1 AND COALESCE(fc.is_deleted, 0) = 0
        WHERE fib.industry_profile=?
      `).all(matchedProfile) as { fs_item_id: number; story_points: number }[];
      for (const r of blocks) {
        if (!fsMap.has(r.fs_item_id)) {
          fsMap.set(r.fs_item_id, { source: 'industry', story_points: r.story_points, widget_ids: new Set() });
        }
      }
    }
  }

  return fsMap;
}

export interface QueueSummary {
  queue: string;
  phase: string;
  story_points: number;
  budget: number;
  rate: number;
  hours: number;
  duration_days: number;
}

export interface BriefingCalcResult {
  by_queue: QueueSummary[];
  totals: { story_points: number; budget: number; hours: number; duration_days: number };
}

const DEFAULT_TEAM: TeamProportions = {
  рп: 0.15, аналит_конс: 0.25, аналит_эксп: 0.1,
  архит: 0.15, програм1: 0.2, програм2: 0.1, куратор: 0.05,
};

const LEGACY_ACCURACY_PCT: Record<string, number> = {
  low: -15, medium: 0, high: 20,
};

export function parseAccuracyPct(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const key = raw.trim().toLowerCase();
    if (key in LEGACY_ACCURACY_PCT) return LEGACY_ACCURACY_PCT[key];
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function accuracyMultiplier(accuracyPct: unknown): number {
  return 1 + parseAccuracyPct(accuracyPct) / 100;
}

export function getDefaultParams(): BriefingParams {
  const phases = db.prepare(`SELECT id, name, enabled_default FROM fs_phases ORDER BY sort_order`).all() as {
    id: number; name: string; enabled_default: number;
  }[];
  const hourlyRate = (db.prepare(`SELECT value FROM constants WHERE key='ставкаЧасаРуб'`).get() as { value: number } | undefined)?.value ?? 1000;
  const hoursPerDay = (db.prepare(`SELECT value FROM constants WHERE key='часовВДень'`).get() as { value: number } | undefined)?.value ?? 8;

  return {
    hourly_rate: hourlyRate,
    accuracy: 0,
    sp_cost_rub: hourlyRate * hoursPerDay,
    phases_json: phases.map(p => ({ phase_id: p.id, name: p.name, enabled: p.enabled_default === 1 })),
    team_json: { ...DEFAULT_TEAM },
    queue_labels_json: { ...FS_QUEUE_LABELS },
  };
}

export function deriveFsFromSelections(briefingId: number): FsSelection[] {
  const fsMap = buildDerivedFsMap(briefingId);
  if (fsMap.size === 0 && !db.prepare(`SELECT id FROM briefings WHERE id=?`).get(briefingId)) return [];

  const existing = db.prepare(`
    SELECT fs_item_id, enabled, queue, queues_json, source, story_points
    FROM briefing_fs_sel WHERE briefing_id=?
  `).all(briefingId) as {
    fs_item_id: number; enabled: number; queue: string; queues_json: string | null;
    source: string; story_points: number | null;
  }[];
  const existingMap = new Map(existing.map(e => [e.fs_item_id, e]));

  const upsert = db.prepare(`
    INSERT INTO briefing_fs_sel (briefing_id, fs_item_id, enabled, queue, queues_json, source, story_points)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(briefing_id, fs_item_id) DO UPDATE SET
      enabled=excluded.enabled,
      queue=excluded.queue,
      queues_json=excluded.queues_json,
      source=excluded.source,
      story_points=COALESCE(briefing_fs_sel.story_points, excluded.story_points)
  `);

  const briefingItemIds = hasBriefingFsSnapshot(briefingId)
    ? new Set(
      (db.prepare(`SELECT fs_item_id FROM briefing_fs_sel WHERE briefing_id=?`).all(briefingId) as { fs_item_id: number }[])
        .map(r => r.fs_item_id),
    )
    : null;

  const tx = db.transaction(() => {
    for (const [fsId, meta] of fsMap) {
      if (briefingItemIds && !briefingItemIds.has(fsId)) continue;
      const ex = existingMap.get(fsId);
      const catalog = db.prepare(`
        SELECT queue, story_points, default_queues_json FROM fs_catalog WHERE id=?
      `).get(fsId) as { queue: string; story_points: number; default_queues_json: string | null } | undefined;

      const defaultQueues = parseQueuesJson(catalog?.default_queues_json);
      const derivedQueues: FsQueuesMap = { ...defaultQueues };
      if (!anyQueueEnabled(derivedQueues)) derivedQueues['1'] = 1;

      const queues = ex?.source === 'manual' && ex.queues_json
        ? parseQueuesJson(ex.queues_json)
        : ex?.queues_json
          ? parseQueuesJson(ex.queues_json)
          : derivedQueues;

      const enabled = enabledFromQueues(queues);
      const queue = ex?.queue ?? primaryQueue(queues);

      upsert.run(
        briefingId, fsId,
        enabled,
        queue,
        JSON.stringify(queues),
        ex?.source === 'manual' ? 'manual' : meta.source,
        ex?.story_points ?? meta.story_points ?? catalog?.story_points ?? 0,
      );
    }
    const derivedIds = [...fsMap.keys()];
    if (!hasBriefingFsSnapshot(briefingId)) {
      if (derivedIds.length > 0) {
        const ph = derivedIds.map(() => '?').join(',');
        db.prepare(`
          DELETE FROM briefing_fs_sel
          WHERE briefing_id=? AND source != 'manual' AND fs_item_id NOT IN (${ph})
        `).run(briefingId, ...derivedIds);
      } else {
        db.prepare(`
          DELETE FROM briefing_fs_sel WHERE briefing_id=? AND source != 'manual'
        `).run(briefingId);
      }
    }
  });
  tx();

  return loadFsSelections(briefingId);
}

export function loadFsSelections(briefingId: number): FsSelection[] {
  ensureBriefingFsSnapshot(briefingId);
  const derivedMap = buildDerivedFsMap(briefingId);

  const catalogItems = db.prepare(`
    SELECT fc.id as fs_item_id, fc.code, fc.prefix, fc.name, fc.phase, fc.group_name, fc.group_prefix, fc.description, fc.item_type, fc.func_type, fc.sort_order,
           fc.queue, fc.story_points, fc.default_queues_json, fc.requires_nmd
    FROM briefing_fs_sel bfs
    JOIN fs_catalog fc ON fc.id = bfs.fs_item_id
    WHERE bfs.briefing_id = ?
      AND (fc.item_type IS NULL OR fc.item_type = 'item')
    ORDER BY fc.sort_order, fc.id
  `).all(briefingId) as {
    fs_item_id: number; code: string | null; prefix: string | null; name: string; phase: string | null;
    group_name: string | null; group_prefix: string | null; description: string | null; item_type: string | null;
    func_type: string | null; sort_order: number; queue: string; story_points: number;
    default_queues_json: string | null; requires_nmd: string | null;
  }[];

  const selections = db.prepare(`
    SELECT fs_item_id, enabled, queue, queues_json, source, story_points, queue_sp_json, queue_nmd_json, queue_comment_json,
           snap_prefix, snap_name, snap_description, snap_details_json, snap_func_type, snap_story_points, snap_requires_nmd,
           customer_name, customer_description, inactive_for_customer, detail_lines_json
    FROM briefing_fs_sel WHERE briefing_id=?
  `).all(briefingId) as {
    fs_item_id: number; enabled: number; queue: string; queues_json: string | null;
    source: string; story_points: number | null;
    queue_sp_json: string | null; queue_nmd_json: string | null; queue_comment_json: string | null;
    snap_prefix: string | null; snap_name: string | null; snap_description: string | null;
    snap_details_json: string | null;
    snap_func_type: string | null; snap_story_points: number | null; snap_requires_nmd: string | null;
    customer_name: string | null; customer_description: string | null; inactive_for_customer: number | null;
    detail_lines_json: string | null;
  }[];
  const selMap = new Map(selections.map(s => [s.fs_item_id, s]));

  const customLines = loadBriefingFsCustomLines(briefingId);
  const customByParent = new Map<number | null, FsCustomLine[]>();
  for (const line of customLines) {
    const key = line.parent_fs_item_id;
    const list = customByParent.get(key) ?? [];
    list.push(line);
    customByParent.set(key, list);
  }

  const widgetLinks = db.prepare(`
    SELECT wfm.fs_item_id, w.id, w.name, w.description, w.image_path
    FROM briefing_widget_sel bws
    JOIN widget_fs_map wfm ON wfm.widget_id = bws.widget_id
    JOIN widgets w ON w.id = bws.widget_id
    WHERE bws.briefing_id=?
  `).all(briefingId) as { fs_item_id: number; id: number; name: string; description: string | null; image_path: string | null }[];
  const widgetsByFs = new Map<number, { id: number; name: string; description: string | null; image_path: string | null }[]>();
  for (const w of widgetLinks) {
    const list = widgetsByFs.get(w.fs_item_id) ?? [];
    if (!list.some(x => x.id === w.id)) list.push({ id: w.id, name: w.name, description: w.description, image_path: w.image_path });
    widgetsByFs.set(w.fs_item_id, list);
  }

  const result = catalogItems.map(fc => {
    const sel = selMap.get(fc.fs_item_id);
    const derived = derivedMap.get(fc.fs_item_id);
    const matched = derivedMap.has(fc.fs_item_id) || sel?.source === 'manual';
    const defaultQueues = parseQueuesJson(fc.default_queues_json);

    let enabled: number;
    let queue: string;
    let queues_json: FsQueuesMap;
    let source: string | null;
    let story_points: number | null;
    let queue_sp_json: string | null;
    let queue_nmd_json: string | null;
    let queue_comment_json: string | null;

    if (sel) {
      queues_json = parseQueuesJson(sel.queues_json);
      enabled = enabledFromQueues(queues_json);
      queue = sel.queue;
      source = sel.source;
      story_points = fc.story_points;
      queue_sp_json = sel.queue_sp_json ?? null;
      queue_nmd_json = sel.queue_nmd_json ?? null;
      queue_comment_json = sel.queue_comment_json ?? null;
    } else if (matched && derived) {
      const derivedQueues: FsQueuesMap = { ...defaultQueues };
      if (!anyQueueEnabled(derivedQueues)) derivedQueues['1'] = 1;
      enabled = 1;
      queue = primaryQueue(derivedQueues);
      queues_json = derivedQueues;
      source = derived.source;
      story_points = fc.story_points;
      queue_sp_json = null;
      queue_nmd_json = null;
      queue_comment_json = null;
    } else {
      enabled = 0;
      queue = fc.queue || '1';
      queues_json = { ...EMPTY_QUEUES };
      source = null;
      story_points = fc.story_points;
      queue_sp_json = null;
      queue_nmd_json = null;
      queue_comment_json = null;
    }

    const snapSp = sel?.snap_story_points ?? fc.story_points;
    const snapNmd = sel?.snap_requires_nmd ?? fc.requires_nmd;
    const snapFunc = sel?.snap_func_type ?? fc.func_type;
    const displayName = sel?.snap_name || fc.name;
    const itemDetails = resolveFsDetails(sel?.snap_details_json, fc.fs_item_id);
    const catalogDescription = sel?.snap_description?.trim()
      || detailsToDescription(itemDetails, fc.description)
      || null;
    const itemCustomLines = customByParent.get(fc.fs_item_id) ?? [];
    const detailLines = resolveDetailLines(
      sel?.detail_lines_json,
      sel?.snap_details_json,
      fc.fs_item_id,
      itemCustomLines,
    );

    return {
      fs_item_id: fc.fs_item_id,
      enabled,
      queue,
      queues_json,
      source,
      story_points: snapSp,
      catalog_story_points: snapSp,
      queue_sp_json,
      queue_nmd_json,
      queue_comment_json,
      code: fc.code,
      prefix: sel?.snap_prefix ?? fc.prefix,
      name: displayName,
      phase: fc.phase,
      group_name: fc.group_name,
      group_prefix: fc.group_prefix,
      description: catalogDescription,
      catalog_description: catalogDescription,
      customer_name: sel?.customer_name ?? null,
      customer_description: sel?.customer_description ?? null,
      inactive_for_customer: (sel?.inactive_for_customer ?? 0) === 1,
      item_type: fc.item_type ?? undefined,
      func_type: snapFunc,
      sort_order: fc.sort_order,
      requires_nmd: snapNmd,
      matched,
      details: itemDetails,
      matched_widgets: widgetsByFs.get(fc.fs_item_id) ?? [],
      custom_lines: itemCustomLines,
      detail_lines: detailLines,
    };
  });

  const customerRows = loadBriefingFsCustomerItems(briefingId);
  result.push(...customerItemsToFsSelections(customerRows) as typeof result);

  result.sort(compareFsByGroupThenPrefix);
  return result;
}

export function calculateBriefing(briefingId: number): BriefingCalcResult {
  const paramsRow = db.prepare(`SELECT * FROM briefing_params WHERE briefing_id=?`).get(briefingId) as {
    hourly_rate: number; accuracy: unknown; sp_cost_rub: number;
    phases_json: string; team_json: string;
  } | undefined;

  const defaults = getDefaultParams();
  const params: BriefingParams = paramsRow ? {
    hourly_rate: paramsRow.hourly_rate ?? defaults.hourly_rate,
    accuracy: parseAccuracyPct(paramsRow.accuracy ?? defaults.accuracy),
    sp_cost_rub: paramsRow.sp_cost_rub ?? defaults.sp_cost_rub,
    phases_json: paramsRow.phases_json ? JSON.parse(paramsRow.phases_json) : defaults.phases_json,
    team_json: paramsRow.team_json ? JSON.parse(paramsRow.team_json) : defaults.team_json,
  } : defaults;

  const hoursPerDay = (db.prepare(`SELECT value FROM constants WHERE key='часовВДень'`).get() as { value: number } | undefined)?.value ?? 8;
  const teamFte = Object.values(params.team_json).reduce((s, v) => s + v, 0) || 1;
  const accuracyMult = accuracyMultiplier(params.accuracy);

  const items = db.prepare(`
    SELECT bfs.queue, bfs.queues_json, bfs.story_points, bfs.enabled, fc.phase, fc.story_points as catalog_sp
    FROM briefing_fs_sel bfs
    JOIN fs_catalog fc ON fc.id = bfs.fs_item_id
    WHERE bfs.briefing_id=? AND bfs.enabled=1
  `).all(briefingId) as {
    queue: string; queues_json: string | null; story_points: number | null;
    enabled: number; phase: string; catalog_sp: number;
  }[];

  const queueMap = new Map<string, { phase: string; sp: number }>();
  for (const item of items) {
    const sp = item.story_points ?? item.catalog_sp ?? 0;
    const queues = item.queues_json
      ? parseQueuesJson(item.queues_json)
      : queuesFromLegacy(item.queue, item.enabled);
    if (!anyQueueEnabled(queues)) continue;
    for (const qKey of FS_QUEUE_KEYS) {
      if (!queues[qKey]) continue;
      const cur = queueMap.get(qKey) ?? { phase: item.phase || '', sp: 0 };
      cur.sp += sp;
      queueMap.set(qKey, cur);
    }
  }

  const customerSp = computeCustomerQueueSp(briefingId);
  for (const [qKey, sp] of customerSp) {
    const cur = queueMap.get(qKey) ?? { phase: '', sp: 0 };
    cur.sp += sp;
    queueMap.set(qKey, cur);
  }

  const queueRates = loadBriefingQueueRates(briefingId);

  const by_queue: QueueSummary[] = [];
  let totalSp = 0, totalBudget = 0, totalHours = 0, maxDuration = 0;

  for (const [queue, data] of [...queueMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'))) {
    const sp = data.sp;
    const budget = Math.round(sp * params.sp_cost_rub * accuracyMult);
    const rate = effectiveRateForQueue(queue, queueRates);
    const hours = rate > 0 ? Math.round(budget / rate) : 0;
    const duration_days = Math.ceil(hours / (teamFte * hoursPerDay));
    by_queue.push({ queue, phase: data.phase, story_points: sp, budget, rate, hours, duration_days });
    totalSp += sp;
    totalBudget += budget;
    totalHours += hours;
    maxDuration = Math.max(maxDuration, duration_days);
  }

  return {
    by_queue,
    totals: { story_points: totalSp, budget: totalBudget, hours: totalHours, duration_days: maxDuration },
  };
}
