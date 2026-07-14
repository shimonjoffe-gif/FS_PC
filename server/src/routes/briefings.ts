import { Router } from 'express';
import { db } from '../db';
import { deriveFsFromSelections, calculateBriefing, getDefaultParams, loadFsSelections, parseAccuracyPct } from '../briefingCalc';
import { ensureBriefingFsSnapshot, replaceBriefingFsCustomLines, recordFsCatalogUsage, listPublishedCatalogItemsMissingFromBriefing, addPublishedCatalogItemsToBriefing } from '../briefingFsSnapshot';
import { parseQueuesJson, primaryQueue, enabledFromQueues, anyQueueEnabled } from '../fsQueues';
import { FS_QUEUE_KEYS } from '../fsQueues';
import {
  computeAutoProjectType, computeRisks, mergeEffectiveRisks, computeOrgVolume,
  getHourlyRateForType, getHeadcountCoeffs, getHourlyRateForTechnologyLabel,
  computeCriteriaSpAuto, computeAutoUnifiedRate, migrateLegacyRisksToSides,
  computeQueueAutoTechnologies,
  hasAnyManualRiskKeys,
  SELLER_CRITERIA_DEFS, type SellerCriteria, type OrgVolumeData, type RisksC51C57,
} from '../assessmentCalc';
import { parseSellerCriteria, serializeSellerCriteria } from '../sellerCriteria';
import type { FsNmdValue } from '../fsSpCalc';
import { replaceBriefingFsCustomerItems } from '../fsCustomerItems';
import {
  PHASE_CALC_LINE_DEFS,
  parsePhaseCalcJson,
  type PhaseCalcState,
} from '../phaseCalcDefs';
import {
  mergePhaseCalcParams,
  parsePhaseCalcParamsJson,
  type PhaseCalcParams,
} from '../phaseCalcParams';
import { buildBriefingHtmlExport } from '../export/briefingHtmlExport';
import { applyBriefingHtmlImport, previewBriefingHtmlImport } from '../export/briefingHtmlImport';
import { mergeExportBlocks, type ExportBlocks, type ImportOptions } from '../export/briefingExportTypes';
import { listStandardDocuments, listStandardDocumentExclusions } from '../standardDocumentsSeed';
import { mergeStandardDocumentsIntoCriteria } from '../standardDocuments';

function loadBriefingActivityTypeIds(briefingId: number): number[] {
  return (db.prepare(`
    SELECT activity_type_id FROM briefing_activity_type_sel WHERE briefing_id=? ORDER BY activity_type_id
  `).all(briefingId) as { activity_type_id: number }[]).map(r => r.activity_type_id);
}

function saveBriefingActivityTypeIds(briefingId: number, activityTypeIds: number[]) {
  const unique = [...new Set(activityTypeIds.filter(id => Number.isFinite(id)))];
  db.prepare(`DELETE FROM briefing_activity_type_sel WHERE briefing_id=?`).run(briefingId);
  const ins = db.prepare(`INSERT INTO briefing_activity_type_sel(briefing_id, activity_type_id) VALUES (?,?)`);
  for (const id of unique) ins.run(briefingId, id);

  const firstIndustry = unique.length > 0
    ? db.prepare(`
      SELECT i.id FROM activity_types at
      JOIN industries i ON i.name = at.name
      WHERE at.id=?
      LIMIT 1
    `).get(unique[0]) as { id: number } | undefined
    : undefined;
  db.prepare(`UPDATE briefings SET industry_id=? WHERE id=?`).run(firstIndustry?.id ?? null, briefingId);

  db.prepare(`DELETE FROM briefing_industry_sel WHERE briefing_id=?`).run(briefingId);
  const insIndustry = db.prepare(`INSERT INTO briefing_industry_sel(briefing_id, industry_id) VALUES (?,?)`);
  for (const atId of unique) {
    const row = db.prepare(`
      SELECT i.id FROM activity_types at
      JOIN industries i ON i.name = at.name
      WHERE at.id=?
    `).get(atId) as { id: number } | undefined;
    if (row) insIndustry.run(briefingId, row.id);
  }
}

function loadBriefingIndustryIds(briefingId: number): number[] {
  const fromSel = (db.prepare(`
    SELECT industry_id FROM briefing_industry_sel WHERE briefing_id=? ORDER BY industry_id
  `).all(briefingId) as { industry_id: number }[]).map(r => r.industry_id);
  if (fromSel.length > 0) return fromSel;
  const legacy = db.prepare(`SELECT industry_id FROM briefings WHERE id=?`).get(briefingId) as {
    industry_id: number | null;
  } | undefined;
  return legacy?.industry_id ? [legacy.industry_id] : [];
}

function saveBriefingIndustryIds(briefingId: number, industryIds: number[]) {
  const unique = [...new Set(industryIds.filter(id => Number.isFinite(id)))];
  db.prepare(`DELETE FROM briefing_industry_sel WHERE briefing_id=?`).run(briefingId);
  const ins = db.prepare(`INSERT INTO briefing_industry_sel(briefing_id, industry_id) VALUES (?,?)`);
  for (const id of unique) ins.run(briefingId, id);
  db.prepare(`UPDATE briefings SET industry_id=? WHERE id=?`).run(unique[0] ?? null, briefingId);
}

export const briefingsRouter = Router();

function parseJson<T>(raw: string | T | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function ensureAssessmentRow(briefingId: number) {
  const exists = db.prepare(`SELECT briefing_id FROM briefing_assessment WHERE briefing_id=?`).get(briefingId);
  if (!exists) {
    db.prepare(`INSERT INTO briefing_assessment(briefing_id) VALUES (?)`).run(briefingId);
  }
}

function loadAssessment(briefingId: number) {
  ensureAssessmentRow(briefingId);
  const row = db.prepare(`SELECT * FROM briefing_assessment WHERE briefing_id=?`).get(briefingId) as {
    criteria_json: string;
    project_type_id: number | null;
    project_type_manual: number;
    risks_json: string;
    risks_manual: number;
    risks_manual_keys_json: string | null;
    risks_ot_json: string | null;
    risks_do_json: string | null;
    risks_manual_keys_ot_json: string | null;
    risks_manual_keys_do_json: string | null;
    risks_manual_ot: number | null;
    risks_manual_do: number | null;
    org_volume_json: string;
    org_volume_manual: number;
    headcount_category: string | null;
    headcount_coeffs_json: string;
    headcount_manual: number;
    unified_rate_enabled: number | null;
    unified_rate: number | null;
    unified_rate_manual: number | null;
    phase_calc_json: string | null;
    phase_calc_params_json: string | null;
    assessment_scenarios_json: string | null;
  };

  const criteriaRaw = parseSellerCriteria(parseJson(row.criteria_json, {}));
  const stdCatalog = listStandardDocuments();
  let criteria = mergeStandardDocumentsIntoCriteria(stdCatalog, criteriaRaw, null, false);
  const storedOrg = parseJson<Partial<OrgVolumeData>>(row.org_volume_json, {});

  const autoTypeInitial = computeAutoProjectType(briefingId, criteria);
  let effectiveTypeIdPre = row.project_type_manual && row.project_type_id
    ? row.project_type_id
    : autoTypeInitial?.id ?? row.project_type_id ?? autoTypeInitial?.id ?? null;
  const typeRowPre = effectiveTypeIdPre
    ? db.prepare(`SELECT code FROM project_types WHERE id=?`).get(effectiveTypeIdPre) as { code: string } | undefined
    : undefined;
  criteria = mergeStandardDocumentsIntoCriteria(stdCatalog, criteria, typeRowPre?.code ?? null, true);

  const autoType = row.project_type_manual
    ? computeAutoProjectType(briefingId, criteria)
    : (() => {
      const t = computeAutoProjectType(briefingId, criteria);
      const code = t?.code ?? null;
      criteria = mergeStandardDocumentsIntoCriteria(stdCatalog, criteria, code, true);
      return computeAutoProjectType(briefingId, criteria);
    })();
  const autoOrg = computeOrgVolume(briefingId, {});

  const effectiveTypeId = row.project_type_manual && row.project_type_id
    ? row.project_type_id
    : autoType?.id ?? row.project_type_id ?? autoType?.id ?? null;

  const typeRow = effectiveTypeId
    ? db.prepare(`SELECT * FROM project_types WHERE id=?`).get(effectiveTypeId) as { id: number; code: string; name: string } | undefined
    : undefined;

  const autoRisks = computeRisks(criteria, { projectTypeCode: typeRow?.code ?? autoType?.code ?? null });

  const storedRisks = parseJson<Partial<RisksC51C57>>(row.risks_json, {});
  const manualKeys = parseJson<Partial<Record<keyof RisksC51C57, boolean>>>(
    row.risks_manual_keys_json ?? '{}',
    {},
  );
  const effectiveRisks = mergeEffectiveRisks(
    autoRisks,
    storedRisks,
    manualKeys,
    row.risks_manual === 1,
  );

  let storedRisksOt = parseJson<Partial<RisksC51C57>>(row.risks_ot_json ?? '{}', {});
  let storedRisksDo = parseJson<Partial<RisksC51C57>>(row.risks_do_json ?? '{}', {});
  let manualKeysOt = parseJson<Partial<Record<keyof RisksC51C57, boolean>>>(
    row.risks_manual_keys_ot_json ?? '{}',
    {},
  );
  let manualKeysDo = parseJson<Partial<Record<keyof RisksC51C57, boolean>>>(
    row.risks_manual_keys_do_json ?? '{}',
    {},
  );
  const migrated = migrateLegacyRisksToSides(
    storedRisks,
    manualKeys,
    row.risks_manual === 1,
    storedRisksOt,
    storedRisksDo,
    manualKeysOt,
    manualKeysDo,
    row.risks_manual_ot === 1,
    row.risks_manual_do === 1,
  );
  storedRisksOt = migrated.storedOt;
  storedRisksDo = migrated.storedDo;
  manualKeysOt = migrated.manualKeysOt;
  manualKeysDo = migrated.manualKeysDo;

  const effectiveRisksOt = mergeEffectiveRisks(
    autoRisks,
    storedRisksOt,
    manualKeysOt,
    migrated.manualOt,
  );
  const effectiveRisksDo = mergeEffectiveRisks(
    autoRisks,
    storedRisksDo,
    manualKeysDo,
    migrated.manualDo,
  );

  const effectiveOrg: OrgVolumeData = row.org_volume_manual && storedOrg.queues
    ? { ...autoOrg, ...storedOrg, queues: { ...autoOrg.queues, ...storedOrg.queues } }
    : autoOrg;

  const category = row.headcount_manual && row.headcount_category
    ? row.headcount_category
    : effectiveOrg.headcount_category;

  const autoCoeffs = getHeadcountCoeffs(effectiveTypeId, category);
  const storedCoeffs = parseJson(row.headcount_coeffs_json, {});
  const effectiveCoeffs = row.headcount_manual
    ? { ...autoCoeffs, ...storedCoeffs, c62: category }
    : { ...autoCoeffs, c62: category };

  const queueAutoTech = computeQueueAutoTechnologies(briefingId, autoType?.code ?? typeRow?.code ?? null);

  const queueCalcs = FS_QUEUE_KEYS.map(q => {
    const stored = db.prepare(`
      SELECT * FROM briefing_queue_calc WHERE briefing_id=? AND queue=?
    `).get(briefingId, q) as {
      technology: string | null;
      rate: number | null;
      rate_manual: number;
      technology_manual: number | null;
    } | undefined;

    const techManual = stored?.technology_manual === 1;
    const autoTech = queueAutoTech[q];
    const rawTechnology = techManual && stored?.technology
      ? stored.technology
      : autoTech;
    const technology = rawTechnology === 'БЗ' ? 'Быстрый запуск' : rawTechnology;
    const autoRate = getHourlyRateForTechnologyLabel(technology);
    const rate = stored?.rate_manual && stored.rate != null ? stored.rate : autoRate;

    return {
      queue: q,
      technology,
      auto_technology: autoTech,
      technology_manual: stored?.technology_manual ?? 0,
      rate,
      nsi_rate: autoRate,
      rate_manual: stored?.rate_manual ?? 0,
    };
  });

  const unifiedRateEnabled = row.unified_rate_enabled === 1;
  const maxQueueRate = computeAutoUnifiedRate(queueCalcs);
  const unifiedRate = row.unified_rate_manual === 1 && row.unified_rate != null
    ? row.unified_rate
    : maxQueueRate;

  const projectTypes = db.prepare(`
    SELECT id, code, name, sort_order FROM project_types WHERE is_active=1 ORDER BY sort_order
  `).all();

  return {
    criteria,
    criteria_defs: SELLER_CRITERIA_DEFS.filter(d => d.group === 'contract'),
    standard_documents_catalog: stdCatalog,
    standard_document_exclusions: listStandardDocumentExclusions(),
    auto_criteria_sp: computeCriteriaSpAuto(
      criteria.content_selections,
      criteria.groups,
    ),
    project_type_id: effectiveTypeId,
    project_type_manual: row.project_type_manual === 1,
    auto_project_type_id: autoType?.id ?? null,
    auto_project_type: autoType,
    project_types: projectTypes,
    risks: effectiveRisks,
    risks_manual: row.risks_manual === 1,
    risks_manual_keys: manualKeys,
    risks_ot: storedRisksOt,
    risks_do: storedRisksDo,
    effective_risks_ot: effectiveRisksOt,
    effective_risks_do: effectiveRisksDo,
    risks_manual_ot: migrated.manualOt,
    risks_manual_do: migrated.manualDo,
    risks_manual_keys_ot: manualKeysOt,
    risks_manual_keys_do: manualKeysDo,
    auto_risks: autoRisks,
    org_volume: effectiveOrg,
    org_volume_manual: row.org_volume_manual === 1,
    auto_org_volume: autoOrg,
    headcount_category: category,
    headcount_coeffs: effectiveCoeffs,
    headcount_manual: row.headcount_manual === 1,
    auto_headcount_coeffs: getHeadcountCoeffs(effectiveTypeId, effectiveOrg.headcount_category),
    queue_calcs: queueCalcs,
    nsi_hourly_rate: getHourlyRateForType(effectiveTypeId),
    unified_rate_enabled: unifiedRateEnabled,
    unified_rate: unifiedRate,
    unified_rate_manual: row.unified_rate_manual === 1,
    phase_calc_defs: PHASE_CALC_LINE_DEFS,
    phase_calc: parsePhaseCalcJson(row.phase_calc_json),
    phase_calc_params: parsePhaseCalcParamsJson(row.phase_calc_params_json),
    assessment_scenarios: parseJson(row.assessment_scenarios_json ?? '[]', []),
  };
}

interface SnapshotRow {
  id: string;
  briefing_id: number;
  scenario_id: string | null;
  name: string;
  frozen_at: string;
  sent_to_client: number;
  extended: number;
  scenario_overrides_json: string | null;
  results_json: string;
  extended_dump_json: string | null;
  base_revision: string | null;
}

function loadAssessmentSnapshots(briefingId: number) {
  const rows = db.prepare(`
    SELECT * FROM briefing_assessment_snapshots
    WHERE briefing_id=?
    ORDER BY frozen_at DESC
  `).all(briefingId) as SnapshotRow[];

  return rows.map(row => ({
    id: row.id,
    briefing_id: row.briefing_id,
    scenario_id: row.scenario_id,
    name: row.name,
    frozen_at: row.frozen_at,
    sent_to_client: row.sent_to_client === 1,
    extended: row.extended === 1,
    scenario_overrides: parseJson(row.scenario_overrides_json, null),
    results: parseJson(row.results_json, {}),
    extended_dump: row.extended_dump_json
      ? parseJson(row.extended_dump_json, undefined)
      : undefined,
    base_revision: row.base_revision ?? undefined,
  }));
}

export function getBriefingFull(id: number) {
  const briefing = db.prepare(`
    SELECT b.*, i.name as industry_name, s.name as segment_name
    FROM briefings b
    LEFT JOIN industries i ON i.id = b.industry_id
    LEFT JOIN segments s ON s.id = b.segment_id
    WHERE b.id=?
  `).get(id);
  if (!briefing) return null;

  const problems = db.prepare(`
    SELECT bps.*, p.name as problem_name, lp.name as linked_problem_name
    FROM briefing_problem_sel bps
    LEFT JOIN problems p ON p.id = bps.problem_id
    LEFT JOIN problems lp ON lp.id = bps.linked_problem_id
    WHERE bps.briefing_id=?
  `).all(id);

  const solutions = db.prepare(`
    SELECT bss.solution_id AS id, sol.name, sol.description, bss.queue, bss.queue_comment_json,
           bss.source_problem_sel_id
    FROM briefing_solution_sel bss
    JOIN solutions sol ON sol.id = bss.solution_id
    WHERE bss.briefing_id=?
  `).all(id);

  const widgets = db.prepare(`
    SELECT bws.solution_id, bws.widget_id, w.name, w.description
    FROM briefing_widget_sel bws
    JOIN widgets w ON w.id = bws.widget_id
    WHERE bws.briefing_id=?
  `).all(id);

  const customer_widgets = db.prepare(`
    SELECT bcw.widget_id, bcw.queue, w.name, w.description, w.image_path, w.type
    FROM briefing_customer_widget_sel bcw
    JOIN widgets w ON w.id = bcw.widget_id
    WHERE bcw.briefing_id=?
    ORDER BY w.name, w.id
  `).all(id);

  const fsItems = loadFsSelections(id);

  const paramsRow = db.prepare(`SELECT * FROM briefing_params WHERE briefing_id=?`).get(id) as Record<string, unknown> | undefined;
  const defaults = getDefaultParams();

  const params = paramsRow
    ? {
      ...paramsRow,
      accuracy: parseAccuracyPct(paramsRow.accuracy ?? defaults.accuracy),
      queue_labels_json: paramsRow.queue_labels_json ?? JSON.stringify(defaults.queue_labels_json),
    }
    : {
      briefing_id: id,
      ...defaults,
      phases_json: JSON.stringify(defaults.phases_json),
      team_json: JSON.stringify(defaults.team_json),
      queue_labels_json: JSON.stringify(defaults.queue_labels_json),
    };

  return {
    ...briefing,
    industry_ids: loadBriefingIndustryIds(id),
    industry_names: loadBriefingIndustryIds(id).map(indId => {
      const row = db.prepare(`SELECT name FROM industries WHERE id=?`).get(indId) as { name: string } | undefined;
      return row?.name ?? String(indId);
    }),
    activity_type_ids: loadBriefingActivityTypeIds(id),
    activity_type_names: loadBriefingActivityTypeIds(id).map(atId => {
      const row = db.prepare(`SELECT name FROM activity_types WHERE id=?`).get(atId) as { name: string } | undefined;
      return row?.name ?? String(atId);
    }),
    problems,
    solutions,
    widgets,
    customer_widgets,
    fs_items: fsItems,
    params,
    assessment: loadAssessment(id),
    assessment_snapshots: loadAssessmentSnapshots(id),
  };
}

briefingsRouter.get('/', (_req, res) => {
  res.json(db.prepare(`
    SELECT b.*, i.name as industry_name
    FROM briefings b
    LEFT JOIN industries i ON i.id = b.industry_id
    ORDER BY b.updated_at DESC
  `).all());
});

briefingsRouter.get('/:id', (req, res) => {
  const data = getBriefingFull(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'not found' });
  res.json(data);
});

briefingsRouter.post('/', (req, res) => {
  const { name, created_by } = req.body as { name?: string; created_by?: number };
  const result = db.prepare(`
    INSERT INTO briefings(name, created_by) VALUES (?,?)
  `).run(name?.trim() || 'Новая предоценка', created_by ?? null);
  const id = Number(result.lastInsertRowid);
  const defaults = getDefaultParams();
  db.prepare(`
    INSERT INTO briefing_params(briefing_id, hourly_rate, accuracy, sp_cost_rub, phases_json, team_json, queue_labels_json)
    VALUES (?,?,?,?,?,?,?)
  `).run(id, defaults.hourly_rate, defaults.accuracy, defaults.sp_cost_rub,
    JSON.stringify(defaults.phases_json), JSON.stringify(defaults.team_json),
    JSON.stringify(defaults.queue_labels_json));
  ensureAssessmentRow(id);
  ensureBriefingFsSnapshot(id);
  res.json({ id });
});

briefingsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM briefings WHERE id=?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { name, industry_id, industry_ids, activity_type_ids, segment_id, scenario, headcount } = req.body as {
    name?: string;
    industry_id?: number | null;
    industry_ids?: number[];
    activity_type_ids?: number[];
    segment_id?: number | null;
    scenario?: string;
    headcount?: number | null;
  };
  const cur = existing as Record<string, unknown>;
  if (activity_type_ids !== undefined) {
    saveBriefingActivityTypeIds(id, activity_type_ids);
  } else if (industry_ids !== undefined) {
    saveBriefingIndustryIds(id, industry_ids);
    const atIds = industry_ids.map(indId => {
      const row = db.prepare(`
        SELECT at.id FROM industries i
        JOIN activity_types at ON at.name = i.name
        WHERE i.id=?
      `).get(indId) as { id: number } | undefined;
      return row?.id;
    }).filter((x): x is number => x != null);
    saveBriefingActivityTypeIds(id, atIds);
  } else if (industry_id !== undefined) {
    saveBriefingIndustryIds(id, industry_id != null ? [industry_id] : []);
  }
  const syncedIndustryId = activity_type_ids !== undefined
    ? (db.prepare(`SELECT industry_id FROM briefings WHERE id=?`).get(id) as { industry_id: number | null }).industry_id
    : industry_ids !== undefined
      ? (industry_ids[0] ?? null)
      : industry_id !== undefined
        ? industry_id
        : cur.industry_id;
  db.prepare(`
    UPDATE briefings SET
      name=?, industry_id=?, segment_id=?, scenario=?, headcount=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    name ?? cur.name,
    syncedIndustryId,
    segment_id !== undefined ? segment_id : cur.segment_id,
    scenario !== undefined ? scenario : cur.scenario,
    headcount !== undefined ? headcount : cur.headcount,
    id,
  );
  res.json({ ok: true });
});

briefingsRouter.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM briefings WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/problems', (req, res) => {
  const id = Number(req.params.id);
  const { selections } = req.body as {
    selections: {
      id?: number;
      problem_id?: number | null;
      custom_text?: string | null;
      linked_problem_id?: number | null;
    }[];
  };
  const existing = db.prepare(`SELECT id FROM briefing_problem_sel WHERE briefing_id=?`).all(id) as { id: number }[];
  const keptIds = new Set<number>();
  const update = db.prepare(`
    UPDATE briefing_problem_sel
    SET problem_id=?, custom_text=?, linked_problem_id=?
    WHERE id=? AND briefing_id=?
  `);
  const insert = db.prepare(`
    INSERT INTO briefing_problem_sel(briefing_id, problem_id, custom_text, linked_problem_id)
    VALUES (?,?,?,?)
  `);
  const delOne = db.prepare(`DELETE FROM briefing_problem_sel WHERE id=? AND briefing_id=?`);
  const tx = db.transaction(() => {
    for (const s of selections ?? []) {
      if (s.id) {
        update.run(
          s.problem_id ?? null,
          s.custom_text ?? null,
          s.linked_problem_id ?? null,
          s.id,
          id,
        );
        keptIds.add(s.id);
      } else {
        const result = insert.run(
          id,
          s.problem_id ?? null,
          s.custom_text ?? null,
          s.linked_problem_id ?? null,
        );
        keptIds.add(Number(result.lastInsertRowid));
      }
    }
    for (const row of existing) {
      if (!keptIds.has(row.id)) delOne.run(row.id, id);
    }
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/solutions', (req, res) => {
  const id = Number(req.params.id);
  const { solution_ids, selections } = req.body as {
    solution_ids?: number[];
    selections?: {
      solution_id: number;
      queue?: string;
      queue_comment_json?: Record<string, string> | string | null;
      source_problem_sel_id?: number | null;
    }[];
  };
  const rows = selections ?? (solution_ids ?? []).map(solution_id => ({ solution_id, queue: '1' }));
  const del = db.prepare(`DELETE FROM briefing_solution_sel WHERE briefing_id=?`);
  const ins = db.prepare(`
    INSERT INTO briefing_solution_sel(briefing_id, solution_id, queue, queue_comment_json, source_problem_sel_id)
    VALUES (?,?,?,?,?)
  `);
  const tx = db.transaction(() => {
    del.run(id);
    for (const row of rows) {
      const commentJson = row.queue_comment_json == null
        ? null
        : typeof row.queue_comment_json === 'string'
          ? row.queue_comment_json
          : JSON.stringify(row.queue_comment_json);
      ins.run(
        id,
        row.solution_id,
        row.queue ?? '1',
        commentJson,
        row.source_problem_sel_id ?? null,
      );
    }
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/widgets', (req, res) => {
  const id = Number(req.params.id);
  const { selections } = req.body as { selections: { solution_id: number; widget_id: number }[] };
  const del = db.prepare(`DELETE FROM briefing_widget_sel WHERE briefing_id=?`);
  const ins = db.prepare(`INSERT INTO briefing_widget_sel(briefing_id, solution_id, widget_id) VALUES (?,?,?)`);
  const tx = db.transaction(() => {
    del.run(id);
    for (const s of selections ?? []) ins.run(id, s.solution_id, s.widget_id);
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/customer-widgets', (req, res) => {
  const id = Number(req.params.id);
  const { selections } = req.body as { selections: { widget_id: number; queue?: string }[] };
  const del = db.prepare(`DELETE FROM briefing_customer_widget_sel WHERE briefing_id=?`);
  const ins = db.prepare(`
    INSERT INTO briefing_customer_widget_sel(briefing_id, widget_id, queue) VALUES (?,?,?)
  `);
  const tx = db.transaction(() => {
    del.run(id);
    for (const s of selections ?? []) {
      if (!s.widget_id) continue;
      ins.run(id, s.widget_id, s.queue ?? '1');
    }
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.put('/:id/fs', (req, res) => {
  const id = Number(req.params.id);
  const { items, custom_lines, customer_items } = req.body as {
    items: {
      fs_item_id: number; enabled?: number; queue?: string;
      queues_json?: string | Record<string, number>;
      source?: string; story_points?: number;
      queue_sp_json?: string | Record<string, number> | null;
      queue_nmd_json?: string | Record<string, FsNmdValue> | null;
      queue_comment_json?: string | Record<string, string> | null;
      customer_name?: string | null;
      customer_description?: string | null;
      inactive_for_customer?: boolean | number;
      detail_lines?: {
        catalog_detail_id?: number | null;
        source: 'nsi' | 'customer';
        name: string;
        description?: string | null;
        inactive?: boolean;
        nsi_name?: string | null;
        nsi_description?: string | null;
        sort_order?: number;
      }[];
    }[];
    custom_lines?: {
      parent_fs_item_id: number | null;
      name: string;
      description?: string | null;
      sort_order?: number;
    }[];
    customer_items?: {
      id?: number;
      group_prefix: string;
      name: string;
      description?: string | null;
      func_type: string;
      story_points?: number;
      queues_json?: string | Record<string, number>;
      queue_sp_json?: string | Record<string, number> | null;
      queue_nmd_json?: string | Record<string, FsNmdValue> | null;
      queue_comment_json?: string | Record<string, string> | null;
      sort_order?: number;
      detail_lines?: {
        name: string;
        description?: string | null;
        inactive?: boolean;
        sort_order?: number;
      }[];
      inactive_for_customer?: boolean | number;
    }[];
  };
  const upsert = db.prepare(`
    INSERT INTO briefing_fs_sel(
      briefing_id, fs_item_id, enabled, queue, queues_json, source, story_points,
      queue_sp_json, queue_nmd_json, queue_comment_json,
      customer_name, customer_description, inactive_for_customer, detail_lines_json
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(briefing_id, fs_item_id) DO UPDATE SET
      enabled=excluded.enabled, queue=excluded.queue, queues_json=excluded.queues_json,
      source=excluded.source, story_points=excluded.story_points,
      queue_sp_json=excluded.queue_sp_json,
      queue_nmd_json=excluded.queue_nmd_json,
      queue_comment_json=excluded.queue_comment_json,
      customer_name=excluded.customer_name,
      customer_description=excluded.customer_description,
      inactive_for_customer=excluded.inactive_for_customer,
      detail_lines_json=excluded.detail_lines_json
  `);
  const tx = db.transaction(() => {
    for (const item of items ?? []) {
      if (item.fs_item_id <= 0) continue;
      const queues = parseQueuesJson(
        typeof item.queues_json === 'string' ? item.queues_json : JSON.stringify(item.queues_json ?? null),
      );
      const queue = item.queue ?? primaryQueue(queues);
      const enabled = enabledFromQueues(queues);
      const queueSpJson = item.queue_sp_json == null
        ? null
        : typeof item.queue_sp_json === 'string'
          ? item.queue_sp_json
          : JSON.stringify(item.queue_sp_json);
      const queueNmdJson = item.queue_nmd_json == null
        ? null
        : typeof item.queue_nmd_json === 'string'
          ? item.queue_nmd_json
          : JSON.stringify(item.queue_nmd_json);
      const queueCommentJson = item.queue_comment_json == null
        ? null
        : typeof item.queue_comment_json === 'string'
          ? item.queue_comment_json
          : JSON.stringify(item.queue_comment_json);
      const inactive = item.inactive_for_customer === true || item.inactive_for_customer === 1 ? 1 : 0;
      const detailLinesJson = item.detail_lines == null
        ? null
        : JSON.stringify(
          item.detail_lines
            .filter(l => l.name?.trim())
            .map((l, i) => ({
              catalog_detail_id: l.catalog_detail_id ?? null,
              source: l.source === 'customer' ? 'customer' : 'nsi',
              name: l.name.trim(),
              description: l.description?.trim() || null,
              inactive: Boolean(l.inactive),
              nsi_name: l.nsi_name ?? null,
              nsi_description: l.nsi_description ?? null,
              sort_order: l.sort_order ?? i,
            })),
        );
      upsert.run(
        id, item.fs_item_id, enabled, queue,
        JSON.stringify(queues),
        item.source ?? 'manual', item.story_points ?? null,
        queueSpJson, queueNmdJson, queueCommentJson,
        item.customer_name?.trim() || null,
        item.customer_description?.trim() || null,
        inactive,
        detailLinesJson,
      );

      if (anyQueueEnabled(queues)) {
        const snap = db.prepare(`
          SELECT snap_prefix, snap_name, snap_description, snap_func_type, snap_story_points, snap_requires_nmd
          FROM briefing_fs_sel WHERE briefing_id=? AND fs_item_id=?
        `).get(id, item.fs_item_id) as {
          snap_prefix: string | null; snap_name: string | null; snap_description: string | null;
          snap_func_type: string | null; snap_story_points: number | null; snap_requires_nmd: string | null;
        } | undefined;
        if (snap) {
          recordFsCatalogUsage(id, item.fs_item_id, {
            catalog_prefix: snap.snap_prefix,
            catalog_name: snap.snap_name,
            catalog_description: snap.snap_description,
            func_type: snap.snap_func_type,
            story_points: snap.snap_story_points,
            requires_nmd: snap.snap_requires_nmd,
          });
        }
      }
    }
    if (custom_lines) {
      replaceBriefingFsCustomLines(id, custom_lines);
    }
    if (customer_items) {
      replaceBriefingFsCustomerItems(id, customer_items);
    }
  });
  tx();
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.get('/:id/fs/available-catalog-items', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });
  ensureBriefingFsSnapshot(id);
  res.json(listPublishedCatalogItemsMissingFromBriefing(id));
});

briefingsRouter.post('/:id/fs/add-catalog-items', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });
  const { fs_item_ids } = req.body as { fs_item_ids?: number[] };
  const ids = (fs_item_ids ?? []).map(Number).filter(n => n > 0);
  if (ids.length === 0) return res.status(400).json({ error: 'fs_item_ids required' });
  const added = addPublishedCatalogItemsToBriefing(id, ids);
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true, added, fs_items: loadFsSelections(id) });
});

briefingsRouter.put('/:id/params', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM briefing_params WHERE briefing_id=?`).get(id) as {
    hourly_rate: number; accuracy: unknown; sp_cost_rub: number;
    phases_json: string; team_json: string; queue_labels_json: string | null;
  } | undefined;
  const defaults = getDefaultParams();
  const { hourly_rate, accuracy, sp_cost_rub, phases_json, team_json, queue_labels_json } = req.body;
  const resolved = {
    hourly_rate: hourly_rate ?? existing?.hourly_rate ?? defaults.hourly_rate,
    accuracy: accuracy !== undefined && accuracy !== null
      ? parseAccuracyPct(accuracy)
      : parseAccuracyPct(existing?.accuracy ?? defaults.accuracy),
    sp_cost_rub: sp_cost_rub ?? existing?.sp_cost_rub ?? defaults.sp_cost_rub,
    phases_json: phases_json ?? existing?.phases_json ?? JSON.stringify(defaults.phases_json),
    team_json: team_json ?? existing?.team_json ?? JSON.stringify(defaults.team_json),
    queue_labels_json: queue_labels_json != null
      ? (typeof queue_labels_json === 'string' ? queue_labels_json : JSON.stringify(queue_labels_json))
      : (existing?.queue_labels_json ?? JSON.stringify(defaults.queue_labels_json)),
  };
  db.prepare(`
    INSERT INTO briefing_params(briefing_id, hourly_rate, accuracy, sp_cost_rub, phases_json, team_json, queue_labels_json)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(briefing_id) DO UPDATE SET
      hourly_rate=excluded.hourly_rate, accuracy=excluded.accuracy,
      sp_cost_rub=excluded.sp_cost_rub, phases_json=excluded.phases_json, team_json=excluded.team_json,
      queue_labels_json=excluded.queue_labels_json
  `).run(
    id, resolved.hourly_rate, resolved.accuracy, resolved.sp_cost_rub,
    typeof resolved.phases_json === 'string' ? resolved.phases_json : JSON.stringify(resolved.phases_json),
    typeof resolved.team_json === 'string' ? resolved.team_json : JSON.stringify(resolved.team_json),
    resolved.queue_labels_json,
  );
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ ok: true });
});

briefingsRouter.post('/:id/derive-fs', (req, res) => {
  const id = Number(req.params.id);
  const items = deriveFsFromSelections(id);
  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json({ items });
});

briefingsRouter.get('/:id/assessment', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });
  res.json(loadAssessment(id));
});

briefingsRouter.patch('/:id/assessment', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });

  ensureAssessmentRow(id);
  const body = req.body as {
    criteria?: SellerCriteria;
    project_type_id?: number | null;
    project_type_manual?: boolean;
    reset_project_type?: boolean;
    risks?: Partial<RisksC51C57>;
    risks_manual?: boolean;
    risks_manual_keys?: Partial<Record<keyof RisksC51C57, boolean>>;
    reset_risks?: boolean;
    reset_risk_keys?: (keyof RisksC51C57)[];
    risks_ot?: Partial<RisksC51C57>;
    risks_do?: Partial<RisksC51C57>;
    risks_manual_ot?: boolean;
    risks_manual_do?: boolean;
    risks_manual_keys_ot?: Partial<Record<keyof RisksC51C57, boolean>>;
    risks_manual_keys_do?: Partial<Record<keyof RisksC51C57, boolean>>;
    reset_risks_ot?: boolean;
    reset_risks_do?: boolean;
    reset_risk_keys_ot?: (keyof RisksC51C57)[];
    reset_risk_keys_do?: (keyof RisksC51C57)[];
    org_volume?: Partial<OrgVolumeData>;
    org_volume_manual?: boolean;
    reset_org_volume?: boolean;
    headcount_category?: string;
    headcount_coeffs?: Record<string, number | string>;
    headcount_manual?: boolean;
    reset_headcount?: boolean;
    queue_calcs?: {
      queue: string;
      technology?: string;
      technology_manual?: boolean;
      reset_technology?: boolean;
      rate?: number;
      rate_manual?: boolean;
      reset_rate?: boolean;
    }[];
    unified_rate_enabled?: boolean;
    unified_rate?: number;
    unified_rate_manual?: boolean;
    reset_unified_rate?: boolean;
    phase_calc?: Partial<PhaseCalcState>;
    reset_phase_calc?: boolean;
    phase_calc_params?: Partial<PhaseCalcParams>;
    reset_phase_calc_params?: boolean;
    assessment_scenarios?: {
      id: string;
      name: string;
      note?: string;
      created_at: string;
      updated_at: string;
      phase_enabled?: Partial<Record<string, Record<string, boolean>>>;
    }[];
  };

  const cur = db.prepare(`SELECT * FROM briefing_assessment WHERE briefing_id=?`).get(id) as Record<string, unknown>;

  let project_type_manual = cur.project_type_manual as number;
  let project_type_id = cur.project_type_id as number | null;
  if (body.reset_project_type) {
    project_type_manual = 0;
    project_type_id = null;
  } else {
    if (body.project_type_manual !== undefined) project_type_manual = body.project_type_manual ? 1 : 0;
    if (body.project_type_id !== undefined) project_type_id = body.project_type_id;
  }

  let risks_manual = cur.risks_manual as number;
  let risks_json = cur.risks_json as string;
  let risks_manual_keys_json = (cur.risks_manual_keys_json as string | null) ?? '{}';
  let risks_ot_json = (cur.risks_ot_json as string | null) ?? '{}';
  let risks_do_json = (cur.risks_do_json as string | null) ?? '{}';
  let risks_manual_keys_ot_json = (cur.risks_manual_keys_ot_json as string | null) ?? '{}';
  let risks_manual_keys_do_json = (cur.risks_manual_keys_do_json as string | null) ?? '{}';
  let risks_manual_ot = (cur.risks_manual_ot as number | null) ?? 0;
  let risks_manual_do = (cur.risks_manual_do as number | null) ?? 0;

  if (body.reset_risks) {
    risks_manual = 0;
    risks_json = '{}';
    risks_manual_keys_json = '{}';
  } else {
    if (body.reset_risk_keys && body.reset_risk_keys.length > 0) {
      const stored = parseJson<Partial<RisksC51C57>>(risks_json, {});
      const mk = parseJson<Partial<Record<keyof RisksC51C57, boolean>>>(risks_manual_keys_json, {});
      for (const k of body.reset_risk_keys) {
        delete stored[k];
        delete mk[k];
      }
      risks_json = JSON.stringify(stored);
      risks_manual_keys_json = JSON.stringify(mk);
      if (Object.keys(mk).length === 0) risks_manual = 0;
    }
    if (body.risks_manual !== undefined) risks_manual = body.risks_manual ? 1 : 0;
    if (body.risks_manual_keys !== undefined) {
      risks_manual_keys_json = JSON.stringify(body.risks_manual_keys);
    }
    if (body.risks) {
      const prev = parseJson<Partial<RisksC51C57>>(risks_json, {});
      risks_json = JSON.stringify({ ...prev, ...body.risks });
    }
  }

  if (body.reset_risks_ot) {
    risks_manual_ot = 0;
    risks_ot_json = '{}';
    risks_manual_keys_ot_json = '{}';
  } else {
    if (body.reset_risk_keys_ot && body.reset_risk_keys_ot.length > 0) {
      const stored = parseJson<Partial<RisksC51C57>>(risks_ot_json, {});
      const mk = parseJson<Partial<Record<keyof RisksC51C57, boolean>>>(risks_manual_keys_ot_json, {});
      for (const k of body.reset_risk_keys_ot) {
        delete stored[k];
        delete mk[k];
      }
      risks_ot_json = JSON.stringify(stored);
      risks_manual_keys_ot_json = JSON.stringify(mk);
      if (!hasAnyManualRiskKeys(mk, false)) risks_manual_ot = 0;
    }
    if (body.risks_manual_ot !== undefined) risks_manual_ot = body.risks_manual_ot ? 1 : 0;
    if (body.risks_manual_keys_ot !== undefined) {
      risks_manual_keys_ot_json = JSON.stringify(body.risks_manual_keys_ot);
    }
    if (body.risks_ot) {
      const prev = parseJson<Partial<RisksC51C57>>(risks_ot_json, {});
      risks_ot_json = JSON.stringify({ ...prev, ...body.risks_ot });
    }
  }

  if (body.reset_risks_do) {
    risks_manual_do = 0;
    risks_do_json = '{}';
    risks_manual_keys_do_json = '{}';
  } else {
    if (body.reset_risk_keys_do && body.reset_risk_keys_do.length > 0) {
      const stored = parseJson<Partial<RisksC51C57>>(risks_do_json, {});
      const mk = parseJson<Partial<Record<keyof RisksC51C57, boolean>>>(risks_manual_keys_do_json, {});
      for (const k of body.reset_risk_keys_do) {
        delete stored[k];
        delete mk[k];
      }
      risks_do_json = JSON.stringify(stored);
      risks_manual_keys_do_json = JSON.stringify(mk);
      if (!hasAnyManualRiskKeys(mk, false)) risks_manual_do = 0;
    }
    if (body.risks_manual_do !== undefined) risks_manual_do = body.risks_manual_do ? 1 : 0;
    if (body.risks_manual_keys_do !== undefined) {
      risks_manual_keys_do_json = JSON.stringify(body.risks_manual_keys_do);
    }
    if (body.risks_do) {
      const prev = parseJson<Partial<RisksC51C57>>(risks_do_json, {});
      risks_do_json = JSON.stringify({ ...prev, ...body.risks_do });
    }
  }

  let org_volume_manual = cur.org_volume_manual as number;
  let org_volume_json = cur.org_volume_json as string;
  if (body.reset_org_volume) {
    org_volume_manual = 0;
    org_volume_json = '{}';
  } else {
    if (body.org_volume_manual !== undefined) org_volume_manual = body.org_volume_manual ? 1 : 0;
    if (body.org_volume) org_volume_json = JSON.stringify(body.org_volume);
  }

  let headcount_manual = cur.headcount_manual as number;
  let headcount_category = cur.headcount_category as string | null;
  let headcount_coeffs_json = cur.headcount_coeffs_json as string;
  if (body.reset_headcount) {
    headcount_manual = 0;
    headcount_category = null;
    headcount_coeffs_json = '{}';
  } else {
    if (body.headcount_manual !== undefined) headcount_manual = body.headcount_manual ? 1 : 0;
    if (body.headcount_category !== undefined) headcount_category = body.headcount_category;
    if (body.headcount_coeffs) headcount_coeffs_json = JSON.stringify(body.headcount_coeffs);
  }

  const criteria_json = body.criteria !== undefined
    ? JSON.stringify(serializeSellerCriteria(body.criteria))
    : cur.criteria_json as string;

  let phase_calc_json = (cur.phase_calc_json as string | null) ?? '{}';
  if (body.reset_phase_calc) {
    phase_calc_json = '{}';
  } else if (body.phase_calc) {
    const merged = parsePhaseCalcJson(phase_calc_json);
    if (body.phase_calc.queues) {
      for (const [queue, lines] of Object.entries(body.phase_calc.queues)) {
        if (!lines || typeof lines !== 'object') continue;
        merged.queues[queue as keyof typeof merged.queues] = {
          ...merged.queues[queue as keyof typeof merged.queues],
          ...lines,
        };
      }
    }
    if (body.phase_calc.team_fte) {
      merged.team_fte = merged.team_fte ?? {};
      for (const q of FS_QUEUE_KEYS) {
        const incoming = body.phase_calc.team_fte[q];
        if (!incoming || typeof incoming !== 'object') continue;
        merged.team_fte[q] = { ...(merged.team_fte[q] ?? {}), ...incoming };
      }
    }
    phase_calc_json = JSON.stringify(merged);
  }

  let phase_calc_params_json = (cur.phase_calc_params_json as string | null) ?? '{}';
  if (body.reset_phase_calc_params) {
    phase_calc_params_json = '{}';
  } else if (body.phase_calc_params) {
    phase_calc_params_json = JSON.stringify(
      mergePhaseCalcParams(body.phase_calc_params as Partial<PhaseCalcParams>),
    );
  }

  let assessment_scenarios_json = (cur.assessment_scenarios_json as string | null) ?? '[]';
  if (body.assessment_scenarios !== undefined) {
    assessment_scenarios_json = JSON.stringify(body.assessment_scenarios);
  }

  let unified_rate_enabled = (cur.unified_rate_enabled as number | null) ?? 0;
  let unified_rate = cur.unified_rate as number | null;
  let unified_rate_manual = (cur.unified_rate_manual as number | null) ?? 0;

  if (body.reset_unified_rate) {
    unified_rate_manual = 0;
    unified_rate = null;
  } else {
    if (body.unified_rate_enabled !== undefined) unified_rate_enabled = body.unified_rate_enabled ? 1 : 0;
    if (body.unified_rate_manual !== undefined) unified_rate_manual = body.unified_rate_manual ? 1 : 0;
    if (body.unified_rate !== undefined) unified_rate = body.unified_rate;
  }

  db.prepare(`
    UPDATE briefing_assessment SET
      criteria_json=?, project_type_id=?, project_type_manual=?,
      risks_json=?, risks_manual=?, risks_manual_keys_json=?,
      risks_ot_json=?, risks_do_json=?,
      risks_manual_keys_ot_json=?, risks_manual_keys_do_json=?,
      risks_manual_ot=?, risks_manual_do=?,
      org_volume_json=?, org_volume_manual=?,
      headcount_category=?, headcount_coeffs_json=?, headcount_manual=?,
      unified_rate_enabled=?, unified_rate=?, unified_rate_manual=?,
      phase_calc_json=?, phase_calc_params_json=?, assessment_scenarios_json=?
    WHERE briefing_id=?
  `).run(
    criteria_json, project_type_id, project_type_manual,
    risks_json, risks_manual, risks_manual_keys_json,
    risks_ot_json, risks_do_json,
    risks_manual_keys_ot_json, risks_manual_keys_do_json,
    risks_manual_ot, risks_manual_do,
    org_volume_json, org_volume_manual,
    headcount_category, headcount_coeffs_json, headcount_manual,
    unified_rate_enabled, unified_rate, unified_rate_manual,
    phase_calc_json, phase_calc_params_json, assessment_scenarios_json,
    id,
  );

  if (body.queue_calcs) {
    const upsert = db.prepare(`
      INSERT INTO briefing_queue_calc(briefing_id, queue, technology, rate, rate_manual, technology_manual)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(briefing_id, queue) DO UPDATE SET
        technology=excluded.technology,
        rate=excluded.rate,
        rate_manual=excluded.rate_manual,
        technology_manual=excluded.technology_manual
    `);
    for (const qc of body.queue_calcs) {
      const existing = db.prepare(`SELECT * FROM briefing_queue_calc WHERE briefing_id=? AND queue=?`).get(id, qc.queue) as {
        technology: string | null;
        rate: number | null;
        rate_manual: number;
        technology_manual: number | null;
      } | undefined;

      let rate_manual = existing?.rate_manual ?? 0;
      let rate = existing?.rate ?? null;
      let technology = existing?.technology ?? null;
      let technology_manual = existing?.technology_manual ?? 0;

      if (qc.reset_rate) {
        rate_manual = 0;
        rate = null;
      } else if (qc.reset_technology) {
        technology_manual = 0;
        technology = null;
        rate_manual = 0;
        rate = null;
      } else {
        if (qc.rate_manual !== undefined) rate_manual = qc.rate_manual ? 1 : 0;
        if (qc.rate !== undefined) rate = qc.rate;
        if (qc.technology !== undefined) technology = qc.technology;
        if (qc.technology_manual !== undefined) technology_manual = qc.technology_manual ? 1 : 0;
      }

      upsert.run(id, qc.queue, technology, rate, rate_manual, technology_manual);
    }
  }

  db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
  res.json(loadAssessment(id));
});

briefingsRouter.get('/:id/assessment-snapshots', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare(`SELECT id FROM briefings WHERE id=?`).get(id)) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(loadAssessmentSnapshots(id));
});

briefingsRouter.post('/:id/assessment-snapshots', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id, updated_at FROM briefings WHERE id=?`).get(id) as {
    id: number; updated_at: string;
  } | undefined;
  if (!briefing) return res.status(404).json({ error: 'not found' });

  const body = req.body as {
    scenario_id?: string | null;
    name?: string;
    sent_to_client?: boolean;
    extended?: boolean;
    scenario_overrides?: unknown;
    results?: unknown;
    extended_dump?: unknown;
    base_revision?: string;
  };

  if (!body.name?.trim()) {
    return res.status(400).json({ error: 'name required' });
  }
  if (!body.results || typeof body.results !== 'object') {
    return res.status(400).json({ error: 'results required' });
  }

  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const frozenAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO briefing_assessment_snapshots (
      id, briefing_id, scenario_id, name, frozen_at,
      sent_to_client, extended, scenario_overrides_json,
      results_json, extended_dump_json, base_revision
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    snapshotId,
    id,
    body.scenario_id ?? null,
    body.name.trim(),
    frozenAt,
    body.sent_to_client ? 1 : 0,
    body.extended ? 1 : 0,
    body.scenario_overrides != null ? JSON.stringify(body.scenario_overrides) : null,
    JSON.stringify(body.results),
    body.extended && body.extended_dump != null ? JSON.stringify(body.extended_dump) : null,
    body.base_revision ?? briefing.updated_at,
  );

  res.status(201).json(loadAssessmentSnapshots(id).find(s => s.id === snapshotId));
});

briefingsRouter.delete('/:id/assessment-snapshots/:snapshotId', (req, res) => {
  const id = Number(req.params.id);
  const snapshotId = req.params.snapshotId;
  const result = db.prepare(`
    DELETE FROM briefing_assessment_snapshots WHERE briefing_id=? AND id=?
  `).run(id, snapshotId);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

briefingsRouter.get('/:id/calculate', (req, res) => {
  const result = calculateBriefing(Number(req.params.id));
  res.json(result);
});

briefingsRouter.post('/:id/generate-project', (req, res) => {
  const briefingId = Number(req.params.id);
  const { name, created_by } = req.body as { name?: string; created_by?: number };

  const briefing = db.prepare(`SELECT * FROM briefings WHERE id=?`).get(briefingId) as {
    name: string; project_id: number | null;
  } | undefined;
  if (!briefing) return res.status(404).json({ error: 'briefing not found' });
  if (briefing.project_id) return res.status(400).json({ error: 'project already generated', project_id: briefing.project_id });

  const template = db.prepare(`SELECT id FROM projects WHERE is_template=1 ORDER BY id LIMIT 1`).get() as { id: number } | undefined;
  if (!template) return res.status(400).json({ error: 'no template project found' });

  const projectName = name?.trim() || `Проект — ${briefing.name}`;
  const newProj = db.prepare(`INSERT INTO projects(name, type, is_template, created_by) VALUES (?, 'Стандартный проект', 0, ?)`)
    .run(projectName, created_by ?? null);
  const projectId = Number(newProj.lastInsertRowid);

  const fsItems = db.prepare(`
    SELECT bfs.*, fc.name, fc.phase, fc.base_work_id
    FROM briefing_fs_sel bfs
    JOIN fs_catalog fc ON fc.id = bfs.fs_item_id
    WHERE bfs.briefing_id=? AND bfs.enabled=1
    ORDER BY fc.phase, fc.queue
  `).all(briefingId) as { fs_item_id: number; queue: string; name: string; phase: string; base_work_id: string | null; story_points: number | null }[];

  const params = db.prepare(`SELECT team_json FROM briefing_params WHERE briefing_id=?`).get(briefingId) as { team_json: string } | undefined;
  const team = params?.team_json ? JSON.parse(params.team_json) : {};

  const insertRow = db.prepare(`
    INSERT INTO project_rows
    (project_id, sort_order, этап, работа, исполнитель, рамки, результаты, отчет_doc,
     длит_трудоемк, риск_этапа, компенсация_продаж,
     загрузка_рп, загрузка_аналит_конс, загрузка_аналит_эксп, загрузка_архит,
     загрузка_програм1, загрузка_програм2, загрузка_куратор)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const tx = db.transaction(() => {
    fsItems.forEach((item, idx) => {
      let baseWork: Record<string, unknown> | undefined;
      if (item.base_work_id) {
        baseWork = db.prepare(`SELECT * FROM base_works WHERE id=?`).get(item.base_work_id) as Record<string, unknown> | undefined;
      }
      const sp = item.story_points ?? 0;
      const длит = sp > 0 ? Math.max(1, Math.round(sp / 2)) : (baseWork?.длит_трудоемк as number ?? 1);
      insertRow.run(
        projectId, idx,
        item.phase || (baseWork?.этап as string) || '',
        item.name || (baseWork?.работа as string) || '',
        'ITLand/Заказчик',
        (baseWork?.рамки as string) || '',
        (baseWork?.результат as string) || '',
        (baseWork?.отчет_doc as string) || '',
        длит, baseWork?.риск_этапа ?? 0, 0,
        (team.рп ?? baseWork?.загрузка_рп ?? 0) * 100,
        (team.аналит_конс ?? baseWork?.загрузка_аналит_конс ?? 0) * 100,
        (team.аналит_эксп ?? baseWork?.загрузка_аналит_эксп ?? 0) * 100,
        (team.архит ?? baseWork?.загрузка_архит ?? 0) * 100,
        (team.програм1 ?? baseWork?.загрузка_програм1 ?? 0) * 100,
        (team.програм2 ?? baseWork?.загрузка_програм2 ?? 0) * 100,
        (team.куратор ?? baseWork?.загрузка_куратор ?? 0) * 100,
      );
    });
    db.prepare(`UPDATE briefings SET project_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(projectId, briefingId);
  });
  tx();

  res.json({ project_id: projectId });
});

function sanitizeExportFilename(name: string): string {
  const cleaned = (name || 'briefing').replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 80);
  return cleaned.replace(/[^\x20-\x7E]/g, '_') || 'briefing';
}

briefingsRouter.post('/:id/export', (req, res) => {
  const id = Number(req.params.id);
  const briefing = db.prepare(`SELECT id, name FROM briefings WHERE id=?`).get(id);
  if (!briefing) return res.status(404).json({ error: 'not found' });

  const blocks = mergeExportBlocks((req.body as { blocks?: Partial<ExportBlocks> }).blocks);
  const html = buildBriefingHtmlExport(id, blocks);
  if (!html) return res.status(404).json({ error: 'not found' });

  const filename = `${sanitizeExportFilename((briefing as { name: string }).name)}-customer.html`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(html);
});

briefingsRouter.post('/:id/import/preview', (req, res) => {
  const id = Number(req.params.id);
  const { html, mode, blocks } = req.body as { html?: string; mode?: ImportOptions['mode']; blocks?: Partial<ExportBlocks> };
  if (!html?.trim()) return res.status(400).json({ error: 'html required' });
  try {
    const preview = previewBriefingHtmlImport(id, html, { mode: mode ?? 'replace', blocks });
    res.json(preview);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

briefingsRouter.post('/:id/import', (req, res) => {
  const id = Number(req.params.id);
  const { html, mode, blocks } = req.body as { html?: string; mode?: ImportOptions['mode']; blocks?: Partial<ExportBlocks> };
  if (!html?.trim()) return res.status(400).json({ error: 'html required' });
  try {
    const result = applyBriefingHtmlImport(id, html, { mode: mode ?? 'replace', blocks });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});
