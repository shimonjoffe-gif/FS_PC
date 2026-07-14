import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { getBriefingFull } from '../routes/briefings';
import { parseQueuesJson, FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../fsQueues';
import { getDefaultParams } from '../briefingCalc';
import { compareFsByGroupThenPrefix } from '../fsPrefixSort';
import {
  CONTRACT_CRITERIA_DEFS,
  CONTRACT_FORMULA_ROW,
  ensureContractParams,
  ensureExtraCustomDocuments,
  computeAdvanceDeferralOk,
} from '../sellerCriteria';
import { listStandardDocuments, listStandardDocumentExclusions } from '../standardDocumentsSeed';
import type { ExportBlocks, ExportBlockKey } from './briefingExportTypes';
import { EXPORT_VERSION, normalizeExportBlocksForFill } from './briefingExportTypes';
import { BRIEFING_HTML_EXPORT_CLIENT_JS } from './briefingHtmlExportClient';
import { isPublishedFsCatalogItem } from '../fsCatalogNsi';
import { listProblemsCatalog } from '../problems';
import { listSolutionsCatalog } from '../solutions';
import { loadWidgetById } from '../widgets';

const UPLOADS_DIR = path.join(process.cwd(), '..', 'data', 'uploads');
const SCENARIOS = ['Кейс', 'ПРОФ', 'Совм.запуск'];
const HEADCOUNT_CATEGORIES = ['до 200', '201-500', '501-1000', '1001+'];

function catalogCodeParts(code: string | null | undefined): number[] {
  if (!code) return [Number.MAX_SAFE_INTEGER];
  return String(code).replace(/\.$/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function compareProblemCatalogCode(
  a: { catalog_code?: string | null; sort_order?: number; id: number },
  b: { catalog_code?: string | null; sort_order?: number; id: number },
): number {
  const pa = catalogCodeParts(a.catalog_code);
  const pb = catalogCodeParts(b.catalog_code);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? Number.MAX_SAFE_INTEGER) - (pb[i] ?? Number.MAX_SAFE_INTEGER);
    if (diff !== 0) return diff;
  }
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
}

function isGarbledDetailText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (/^[\?\s]+$/.test(t)) return true;
  const qCount = (t.match(/\?/g) ?? []).length;
  return qCount > 0 && qCount / t.length > 0.3;
}

function mapDetailLinesForExport(
  detailLines: Array<Record<string, unknown>>,
  catalogDetails: Array<{ name: string; description?: string | null }>,
) {
  return detailLines.map((dl, idx) => {
    const cat = catalogDetails[idx];
    const nsiName = (dl.nsi_name as string | null | undefined)?.trim() || cat?.name?.trim() || null;
    const nsiDesc = (dl.nsi_description as string | null | undefined) ?? cat?.description ?? null;
    let name = String(dl.name ?? '');
    let description = (dl.description as string | null) ?? null;
    if (isGarbledDetailText(name) && nsiName) name = nsiName;
    if (isGarbledDetailText(description) && nsiDesc) description = nsiDesc;
    return {
      catalog_detail_id: (dl.catalog_detail_id as number | null) ?? null,
      source: dl.source as string,
      name,
      description,
      nsi_name: nsiName,
      nsi_description: nsiDesc,
      inactive: Boolean(dl.inactive),
      sort_order: (dl.sort_order as number) ?? idx,
    };
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function readImageBase64(imagePath: string | null | undefined): string | null {
  if (!imagePath) return null;
  const full = path.join(UPLOADS_DIR, imagePath);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  const ext = path.extname(full).slice(1).toLowerCase() || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buf.toString('base64')}`;
}

function buildExportPayload(briefingId: number, blocks: ExportBlocks) {
  const full = getBriefingFull(briefingId) as Record<string, unknown> | null;
  if (!full) return null;

  const exportedAt = new Date().toISOString();
  const payload: Record<string, unknown> = {
    version: EXPORT_VERSION,
    briefing_id: briefingId,
    briefing_name: full.name,
    exported_at: exportedAt,
    blocks: { ...blocks },
  };

  if (blocks.customer) {
    const industries = db.prepare(`SELECT id, name FROM industries ORDER BY name`).all() as { id: number; name: string }[];
    const segments = db.prepare(`
      SELECT s.id, s.name, ism.industry_id
      FROM segments s
      LEFT JOIN industry_segment_map ism ON ism.segment_id = s.id
      ORDER BY s.name
    `).all() as {
      id: number; name: string; industry_id: number | null;
    }[];
    const defaults = getDefaultParams();
    const paramsRow = full.params as { queue_labels_json?: string };
    let queueLabels = defaults.queue_labels_json;
    try {
      if (paramsRow?.queue_labels_json) {
        queueLabels = typeof paramsRow.queue_labels_json === 'string'
          ? JSON.parse(paramsRow.queue_labels_json)
          : paramsRow.queue_labels_json;
      }
    } catch { /* keep defaults */ }
    const assessment = full.assessment as { headcount_category?: string; org_volume?: unknown };
    const activityTypes = db.prepare(`SELECT id, name FROM activity_types ORDER BY name`).all() as {
      id: number; name: string;
    }[];
    const activityTypeIds = (full.activity_type_ids as number[] | undefined) ?? [];
    payload.customer = {
      name: full.name as string,
      segment_id: full.segment_id as number | null,
      scenario: full.scenario as string | null,
      headcount_category: assessment.headcount_category ?? 'до 200',
      queue_labels: queueLabels,
      queue_keys: FS_QUEUE_KEYS,
      industries,
      segments,
      scenarios: SCENARIOS,
      headcount_categories: HEADCOUNT_CATEGORIES,
      activity_types: activityTypes,
      activity_type_ids: activityTypeIds,
    };
  }

  if (blocks.customer || blocks.assessment_criteria || blocks.assessment_org_volume) {
    const assessment = full.assessment as { org_volume?: unknown; headcount_category?: string };
    const defaults = getDefaultParams();
    const paramsRow = full.params as { queue_labels_json?: string };
    let queueLabels = defaults.queue_labels_json;
    try {
      if (paramsRow?.queue_labels_json) {
        queueLabels = typeof paramsRow.queue_labels_json === 'string'
          ? JSON.parse(paramsRow.queue_labels_json)
          : paramsRow.queue_labels_json;
      }
    } catch { /* keep defaults */ }
    payload.assessment_org_volume = {
      org_volume: assessment.org_volume,
      queue_labels: queueLabels,
      queue_keys: FS_QUEUE_KEYS,
    };
  }

  if (blocks.fs) {
    const defaults = getDefaultParams();
    const paramsRow = full.params as { queue_labels_json?: string };
    let queueLabels = defaults.queue_labels_json;
    try {
      if (paramsRow?.queue_labels_json) {
        queueLabels = typeof paramsRow.queue_labels_json === 'string'
          ? JSON.parse(paramsRow.queue_labels_json)
          : paramsRow.queue_labels_json;
      }
    } catch { /* keep defaults */ }

    const fsItems = full.fs_items as Array<Record<string, unknown>>;
    const parseJsonField = (v: unknown): Record<string, unknown> => {
      if (!v) return {};
      if (typeof v === 'object') return v as Record<string, unknown>;
      try { return JSON.parse(String(v)) as Record<string, unknown>; } catch { return {}; }
    };
    const mappedItems = fsItems.map(item => {
        const detailLines = (item.detail_lines as Array<Record<string, unknown>> | undefined) ?? [];
        const catalogDetails = (item.details as Array<{ name: string; description?: string | null }> | undefined) ?? [];
        return {
        fs_item_id: item.fs_item_id as number,
        prefix: (item.prefix as string | null) ?? null,
        name: (item.name as string) ?? '',
        catalog_name: (item.name as string) ?? '',
        group_name: (item.group_name as string) ?? (item.phase as string) ?? 'Прочее',
        group_prefix: (item.group_prefix as string | null) ?? null,
        func_type: (item.func_type as string | null) ?? null,
        customer_name: (item.customer_name as string | null) ?? null,
        customer_description: (item.customer_description as string | null) ?? null,
        queues_json: parseQueuesJson((item.queues_json ?? item.queue) as string | import('../fsQueues').FsQueuesMap),
        queue_nmd_json: parseJsonField(item.queue_nmd_json),
        queue_comment_json: parseJsonField(item.queue_comment_json),
        detail_lines: mapDetailLinesForExport(detailLines, catalogDetails),
        catalog_details: catalogDetails.map(d => ({
          name: d.name,
          description: d.description ?? null,
        })),
        is_customer_item: Boolean(item.is_customer_item),
        customer_item_id: (item.customer_item_id as number | null) ?? null,
        matched: item.matched !== false,
        requires_nmd: (item.requires_nmd as string | null | undefined) ?? null,
        catalog_story_points: (item.catalog_story_points as number | null | undefined) ?? (item.story_points as number | null | undefined) ?? null,
        description: (item.description as string | null | undefined) ?? null,
        matched_widgets: ((item.matched_widgets as Array<{
          id: number;
          name: string;
          description?: string | null;
          image_path?: string | null;
        }> | undefined) ?? []).map(w => ({
          id: w.id,
          name: w.name,
          description: w.description ?? null,
          image_base64: readImageBase64(w.image_path),
        })),
      };
      })
      .filter(item => {
        if (item.is_customer_item || item.fs_item_id < 0) return true;
        return isPublishedFsCatalogItem(item.fs_item_id);
      });
    mappedItems.sort(compareFsByGroupThenPrefix);
    payload.fs = {
      queue_labels: queueLabels,
      queue_keys: FS_QUEUE_KEYS,
      queue_defaults: FS_QUEUE_LABELS,
      items: mappedItems,
    };
  }

  if (blocks.assessment_criteria) {
    const assessment = full.assessment as {
      criteria: Parameters<typeof ensureCriteriaGroups>[0];
      project_type_id?: number | null;
      auto_project_type?: { code?: string } | null;
      project_types?: { id: number; code: string }[];
    };
    const criteria = assessment.criteria;
    const stdCatalog = listStandardDocuments();
    const typeFromList = assessment.project_types?.find(
      pt => pt.id === assessment.project_type_id,
    )?.code;
    const projectTypeCode = typeFromList ?? assessment.auto_project_type?.code ?? null;
    payload.assessment_criteria = {
      standard_documents: stdCatalog,
      standard_document_exclusions: listStandardDocumentExclusions(),
      standard_document_state: criteria.standard_documents ?? {},
      extra_custom_documents: ensureExtraCustomDocuments(criteria),
      project_type_code: projectTypeCode,
    };
  }

  if (blocks.assessment_contract) {
    const assessment = full.assessment as { criteria: Parameters<typeof ensureContractParams>[0] extends infer _ ? Record<string, unknown> : never };
    const criteria = assessment.criteria as Record<string, unknown>;
    const contractParams = ensureContractParams(criteria.contract_params as Parameters<typeof ensureContractParams>[0]);
    payload.assessment_contract = {
      contract_defs: CONTRACT_CRITERIA_DEFS.map(d => ({ key: d.key, label: d.label })),
      formula_row: CONTRACT_FORMULA_ROW,
      contract_params: contractParams,
      criteria: Object.fromEntries(
        CONTRACT_CRITERIA_DEFS.map(d => [d.key, criteria[d.key as keyof typeof criteria] !== false]),
      ),
      advance_deferral_ok: computeAdvanceDeferralOk(contractParams),
    };
  }

  if (blocks.problems || blocks.customer) {
    const allProblems = listProblemsCatalog();
    const problemHypothesisRows = db.prepare(`
      SELECT hp.problem_id, hp.hypothesis_id
      FROM hypothesis_problems hp
    `).all() as { problem_id: number; hypothesis_id: number }[];
    const problemHypothesisIds: Record<string, number[]> = {};
    for (const row of problemHypothesisRows) {
      const key = String(row.problem_id);
      const list = problemHypothesisIds[key] ?? [];
      list.push(row.hypothesis_id);
      problemHypothesisIds[key] = list;
    }
    const hypothesisRows = db.prepare(`
      SELECT h.id, h.name,
        (SELECT GROUP_CONCAT(hat.activity_type_id) FROM hypothesis_activity_types hat WHERE hat.hypothesis_id = h.id) AS activity_type_ids_csv
      FROM hypotheses h
      ORDER BY h.name
    `).all() as { id: number; name: string; activity_type_ids_csv: string | null }[];
    const hypotheses = hypothesisRows.map(h => ({
      id: h.id,
      name: h.name,
      activity_type_ids: h.activity_type_ids_csv
        ? h.activity_type_ids_csv.split(',').map(Number).filter(Boolean)
        : [],
    }));
    const activityTypes = db.prepare(`SELECT id, name FROM activity_types ORDER BY name`).all() as {
      id: number; name: string;
    }[];
    const activityTypeIds = (full.activity_type_ids as number[] | undefined) ?? [];
    const problems = (full.problems ?? []) as Array<{
      problem_id: number | null; custom_text: string | null; problem_name?: string;
      linked_problem_id?: number | null; linked_problem_name?: string;
    }>;
    const sortedProblems = [...allProblems].sort((a, b) => compareProblemCatalogCode(
      { catalog_code: a.catalog_code, sort_order: a.sort_order, id: a.id },
      { catalog_code: b.catalog_code, sort_order: b.sort_order, id: b.id },
    ));
    payload.problems = {
      catalog: sortedProblems.map(p => ({
        id: p.id,
        name: p.name,
        parent_id: p.parent_id,
        sort_order: p.sort_order,
        catalog_code: p.catalog_code,
        segment_id: p.segment_id,
        segment_name: p.segment_name,
        maturity_name: p.maturity_name,
        used_in_hypotheses: p.used_in_hypotheses,
      })),
      selections: problems.map(p => ({
        problem_id: p.problem_id,
        custom_text: p.custom_text,
        problem_name: p.problem_name,
        linked_problem_id: p.linked_problem_id ?? null,
        linked_problem_name: p.linked_problem_name,
      })),
      hypotheses,
      problem_hypothesis_ids: problemHypothesisIds,
      activity_types: activityTypes,
      activity_type_ids: activityTypeIds,
      segment_id: (full.segment_id as number | null) ?? null,
      hypothesis_filter_ids: [],
      show_all_problems: false,
    };
  }

  if (blocks.solutions) {
    const allSolutions = listSolutionsCatalog();
    const briefingSolutions = (full.solutions ?? []) as Array<{
      id: number; queue?: string; queue_comment_json?: unknown;
    }>;
    const selectedProblemIds = ((full.problems ?? []) as Array<{ problem_id: number | null }>)
      .filter(p => p.problem_id != null)
      .map(p => p.problem_id as number);
    const problemSolutionLinks = db.prepare(`
      SELECT problem_id, solution_id FROM problem_solution_map
    `).all() as { problem_id: number; solution_id: number }[];
    const matchedSolutionIds = selectedProblemIds.length > 0
      ? [...new Set(
        problemSolutionLinks
          .filter(l => selectedProblemIds.includes(l.problem_id))
          .map(l => l.solution_id),
      )]
      : [];
    const solutionWidgetRows = db.prepare(`
      SELECT swm.solution_id, w.id, w.name, w.description, w.image_path
      FROM solution_widget_map swm
      JOIN widgets w ON w.id = swm.widget_id
      ORDER BY w.name, w.id
    `).all() as { solution_id: number; id: number; name: string; description: string | null; image_path: string | null }[];
    const widgetsBySolution: Record<string, Array<{ id: number; name: string; description: string | null; image_base64: string | null }>> = {};
    for (const row of solutionWidgetRows) {
      const key = String(row.solution_id);
      const list = widgetsBySolution[key] ?? [];
      list.push({
        id: row.id,
        name: row.name,
        description: row.description,
        image_base64: readImageBase64(row.image_path),
      });
      widgetsBySolution[key] = list;
    }

    const hypothesisContextRows = db.prepare(`
      SELECT psm.solution_id,
             h.id AS hypothesis_id,
             h.name AS hypothesis_name,
             shc.code AS hypothesis_code,
             p.id AS problem_id,
             p.name AS problem_name,
             p.catalog_code,
             p.lcm_code,
             COALESCE(hp.sort_order, p.sort_order, 0) AS problem_sort
      FROM problem_solution_map psm
      JOIN problems p ON p.id = psm.problem_id
      JOIN hypothesis_problems hp ON hp.problem_id = p.id
      JOIN hypotheses h ON h.id = hp.hypothesis_id
      LEFT JOIN solution_hypothesis_codes shc
        ON shc.solution_id = psm.solution_id AND shc.hypothesis_id = h.id
      ORDER BY psm.solution_id, h.name, problem_sort, p.id
    `).all() as {
      solution_id: number;
      hypothesis_id: number;
      hypothesis_name: string;
      hypothesis_code: string | null;
      problem_id: number;
      problem_name: string;
      catalog_code: string | null;
      lcm_code: string | null;
      problem_sort: number;
    }[];

    const hypothesisContextBySolution: Record<string, Array<{
      hypothesis_id: number;
      hypothesis_name: string;
      code: string | null;
      problems: Array<{
        id: number;
        name: string;
        catalog_code: string | null;
        lcm_code: string | null;
        sort_order: number;
      }>;
    }>> = {};

    for (const row of hypothesisContextRows) {
      const key = String(row.solution_id);
      const list = hypothesisContextBySolution[key] ?? [];
      let usage = list.find(u => u.hypothesis_id === row.hypothesis_id);
      if (!usage) {
        usage = {
          hypothesis_id: row.hypothesis_id,
          hypothesis_name: row.hypothesis_name,
          code: row.hypothesis_code,
          problems: [],
        };
        list.push(usage);
        hypothesisContextBySolution[key] = list;
      }
      if (!usage.problems.some(p => p.id === row.problem_id)) {
        usage.problems.push({
          id: row.problem_id,
          name: row.problem_name,
          catalog_code: row.catalog_code,
          lcm_code: row.lcm_code,
          sort_order: row.problem_sort,
        });
      }
    }

    const fsLinkRows = db.prepare(`
      SELECT sfm.solution_id, sfm.fs_item_id, sfm.link_type,
             fc.name, fc.prefix, fc.group_name
      FROM solution_fs_map sfm
      JOIN fs_catalog fc ON fc.id = sfm.fs_item_id
      ORDER BY fc.group_name, fc.prefix, fc.name, sfm.fs_item_id
    `).all() as {
      solution_id: number;
      fs_item_id: number;
      link_type: string;
      name: string;
      prefix: string | null;
      group_name: string | null;
    }[];

    const fsBySolution: Record<string, Array<{
      fs_item_id: number;
      link_type: 'required' | 'optional';
      name: string;
      prefix: string | null;
      group_name: string | null;
    }>> = {};
    for (const row of fsLinkRows) {
      const key = String(row.solution_id);
      const list = fsBySolution[key] ?? [];
      list.push({
        fs_item_id: row.fs_item_id,
        link_type: row.link_type === 'optional' ? 'optional' : 'required',
        name: row.name,
        prefix: row.prefix,
        group_name: row.group_name,
      });
      fsBySolution[key] = list;
    }
    const defaults = getDefaultParams();
    const paramsRow = full.params as { queue_labels_json?: string };
    let queueLabels = defaults.queue_labels_json;
    try {
      if (paramsRow?.queue_labels_json) {
        queueLabels = typeof paramsRow.queue_labels_json === 'string'
          ? JSON.parse(paramsRow.queue_labels_json)
          : paramsRow.queue_labels_json;
      }
    } catch { /* keep defaults */ }
    const parseCommentJson = (v: unknown): Record<string, string> | null => {
      if (!v) return null;
      if (typeof v === 'object') return v as Record<string, string>;
      try { return JSON.parse(String(v)) as Record<string, string>; } catch { return null; }
    };
    payload.solutions = {
      catalog: allSolutions.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        parent_id: s.parent_id,
        sort_order: s.sort_order,
        catalog_code: s.catalog_code,
      })),
      selections: briefingSolutions.map(s => ({
        solution_id: s.id,
        queue: s.queue ?? '1',
        queue_comment_json: parseCommentJson(s.queue_comment_json),
      })),
      selected_problem_ids: selectedProblemIds,
      matched_solution_ids: matchedSolutionIds,
      problem_solution_links: problemSolutionLinks,
      show_all_solutions: false,
      widgets_by_solution: widgetsBySolution,
      hypothesis_context_by_solution: hypothesisContextBySolution,
      fs_by_solution: fsBySolution,
      queue_labels: queueLabels,
      queue_keys: FS_QUEUE_KEYS,
    };
  }

  if (blocks.widgets) {
    const widgetRows = db.prepare(`
      SELECT bws.solution_id, bws.widget_id, w.name, w.description, w.image_path, w.data_slice_id,
             ds.name AS data_slice_name, sol.name as solution_name
      FROM briefing_widget_sel bws
      JOIN widgets w ON w.id = bws.widget_id
      LEFT JOIN data_slices ds ON ds.id = w.data_slice_id
      JOIN solutions sol ON sol.id = bws.solution_id
      WHERE bws.briefing_id=?
    `).all(briefingId) as {
      solution_id: number; widget_id: number; name: string;
      description: string | null; image_path: string | null; solution_name: string;
      data_slice_id: number | null; data_slice_name: string | null;
    }[];
    const allWidgets = db.prepare(`
      SELECT w.id, w.name, w.description, w.image_path, w.data_slice_id,
             ds.name AS data_slice_name, swm.solution_id, sol.name as solution_name
      FROM widgets w
      JOIN solution_widget_map swm ON swm.widget_id = w.id
      LEFT JOIN data_slices ds ON ds.id = w.data_slice_id
      JOIN solutions sol ON sol.id = swm.solution_id
      ORDER BY sol.name, w.name
    `).all() as {
      id: number; name: string; description: string | null;
      image_path: string | null; solution_id: number; solution_name: string;
      data_slice_id: number | null; data_slice_name: string | null;
    }[];
    payload.widgets = {
      catalog: allWidgets.map(w => ({
        id: w.id,
        solution_id: w.solution_id,
        solution_name: w.solution_name,
        name: w.name,
        description: w.description,
        image_base64: readImageBase64(w.image_path),
        data_slice_id: w.data_slice_id,
        data_slice_name: w.data_slice_name,
      })),
      selections: widgetRows.map(w => ({
        solution_id: w.solution_id,
        widget_id: w.widget_id,
        solution_name: w.solution_name,
        name: w.name,
        description: w.description,
        image_base64: readImageBase64(w.image_path),
        data_slice_id: w.data_slice_id,
        data_slice_name: w.data_slice_name,
      })),
    };
  }

  if (blocks.fs || blocks.solutions || blocks.widgets) {
    const widgetIds = new Set<number>();
    if (payload.fs?.items) {
      for (const item of payload.fs.items) {
        for (const w of item.matched_widgets ?? []) widgetIds.add(w.id);
      }
    }
    if (payload.widgets?.catalog) {
      for (const w of payload.widgets.catalog) widgetIds.add(w.id);
    }
    const customerWidgetRows = db.prepare(`
      SELECT DISTINCT widget_id FROM briefing_customer_widget_sel WHERE briefing_id=?
    `).all(briefingId) as { widget_id: number }[];
    for (const row of customerWidgetRows) widgetIds.add(row.widget_id);
    const briefingWidgetRows = db.prepare(`
      SELECT DISTINCT widget_id FROM briefing_widget_sel WHERE briefing_id=?
    `).all(briefingId) as { widget_id: number }[];
    for (const row of briefingWidgetRows) widgetIds.add(row.widget_id);

    const problemsById = new Map(listProblemsCatalog().map(p => [p.id, p]));
    const widgetContextById: Record<string, {
      id: number;
      name: string;
      description: string | null;
      type: string;
      data_slice_name: string | null;
      image_base64: string | null;
      hypothesis_usages: Array<{
        hypothesis_id: number;
        hypothesis_name: string;
        problems: Array<{
          id: number;
          name: string;
          catalog_code: string | null;
          lcm_code: string | null;
          sort_order: number;
          solutions: Array<{
            id: number;
            name: string;
            catalog_code: string | null;
            lcm_code: string | null;
          }>;
        }>;
      }>;
      orphan_solutions: Array<{
        id: number;
        name: string;
        catalog_code: string | null;
        lcm_code: string | null;
      }>;
      fs_items: Array<{
        fs_item_id: number;
        name: string;
        prefix: string | null;
        group_name: string | null;
      }>;
    }> = {};

    for (const id of widgetIds) {
      const widget = loadWidgetById(id);
      if (!widget) continue;
      const fsItems = db.prepare(`
        SELECT fc.id as fs_item_id, fc.name, fc.prefix, fc.group_name
        FROM widget_fs_map wfm
        JOIN fs_catalog fc ON fc.id = wfm.fs_item_id
        WHERE wfm.widget_id=?
        ORDER BY fc.group_name, fc.prefix, fc.name, fc.id
      `).all(id) as {
        fs_item_id: number;
        name: string;
        prefix: string | null;
        group_name: string | null;
      }[];
      widgetContextById[String(id)] = {
        id: widget.id,
        name: widget.name,
        description: widget.description,
        type: widget.type,
        data_slice_name: widget.data_slice_name ?? null,
        image_base64: readImageBase64(widget.image_path),
        hypothesis_usages: widget.hypothesis_usages.map(usage => ({
          hypothesis_id: usage.hypothesis_id,
          hypothesis_name: usage.hypothesis_name,
          problems: usage.problems.map(p => ({
            id: p.id,
            name: p.name,
            catalog_code: problemsById.get(p.id)?.catalog_code ?? null,
            lcm_code: p.lcm_code,
            sort_order: p.sort_order,
            solutions: p.solutions,
          })),
        })),
        orphan_solutions: widget.orphan_solutions,
        fs_items: fsItems,
      };
    }
    payload.widget_context_by_id = widgetContextById;
  }

  return payload;
}

const INLINE_CSS = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;background:#f1f5f9;color:#1e293b;font-size:13px;line-height:1.4}
.wrap{width:100%;max-width:none;margin:0;padding:1cm 1cm 80px;box-sizing:border-box}
.hdr{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:16px}
.hdr h1{margin:0 0 6px;font-size:18px}
.hdr .meta{font-size:11px;color:#64748b}
.hdr .instr{margin-top:10px;font-size:12px;color:#475569}
.sec{background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden}
.sec-h{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;cursor:pointer;user-select:none}
.sec-h:hover{background:#f1f5f9}
.sec-h .arrow{color:#94a3b8;font-size:11px;width:14px}
.sec-b{padding:12px 14px;display:none}
.sec.open .sec-b{display:block}
label.field{display:block;margin-bottom:10px}
label.field span{display:block;font-size:11px;color:#64748b;margin-bottom:3px}
input[type=text],input[type=number],select,textarea{width:100%;max-width:480px;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px}
textarea{min-height:60px;resize:vertical}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th,.tbl td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}
.tbl th{background:#f8fafc;font-weight:600}
.type-impact{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.type-impact.prof{background:#fef3c7;color:#92400e}
.type-impact.korp{background:#fee2e2;color:#991b1b}
.crit-section-hdr td{background:#f1f5f9;font-weight:600;font-size:12px;color:#475569}
.crit-discrepancy .yesno{box-shadow:0 0 0 2px #a78bfa}
.crit-overridden .yesno{box-shadow:0 0 0 1px #fbbf24}
.grp td{background:#fef3c7;font-weight:600}
.yesno{display:inline-block;min-width:36px;padding:2px 8px;border-radius:4px;border:none;cursor:pointer;font-size:12px;line-height:1.25;text-align:center}
.yesno.yesno-readonly{cursor:default}
.yesno.yes{background:#dcfce7;color:#166534}
.yesno.yes[draggable="true"]:active{cursor:grabbing}
.yesno.no{background:#f1f5f9;color:#64748b}
.yesno.unmatched.no{background:#fee2e2;color:#b91c1c;font-weight:500}
.qcell.fs-drop-target{background:#dbeafe!important;box-shadow:inset 0 0 0 2px #60a5fa}
.dl-bar{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e2e8f0;padding:12px 1cm;text-align:center;z-index:100}
.dl-bar button{background:#7c3aed;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
.dl-bar button:hover{background:#6d28d9}
.chk-list label{display:flex;align-items:flex-start;gap:8px;padding:4px 0;cursor:pointer}
.chk-list input{margin-top:3px}
.widget-grid{display:flex;flex-wrap:wrap;gap:12px;padding:4px 0 8px}
.widget-group:not(.open) .widget-grid{display:none}
.widget-card{border:1px solid #e2e8f0;border-radius:8px;padding:8px;width:160px;display:flex;flex-direction:column;gap:6px}
.widget-card-check{display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;cursor:pointer}
.widget-card-check input{margin:0}
.widget-card-preview{border:none;background:none;padding:0;text-align:left;cursor:pointer;width:100%}
.widget-card-preview:hover .widget-card-name{color:#1d4ed8}
.widget-card-preview img{width:100%;height:80px;object-fit:contain;background:#f8fafc;border-radius:4px;display:block}
.widget-card-name{font-size:12px;font-weight:500;color:#1e293b;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35}
.widget-modal-solution{font-size:12px;color:#64748b;margin-top:2px}
.widget-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:300;display:none;align-items:center;justify-content:center;padding:16px}
.widget-modal-overlay.open{display:flex}
.widget-modal-close{border:none;background:none;color:#94a3b8;font-size:20px;line-height:1;cursor:pointer;padding:0}
.widget-modal-close:hover{color:#475569}
.fs-modal.widget-card-modal{max-width:72rem;width:100%}
.fs-modal.widget-card-modal .fs-modal-bd{flex:1;min-height:0;display:flex;flex-direction:column;padding:0!important}
.widget-card-grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;flex:1;min-height:0}
@media (max-width:768px){.widget-card-grid{grid-template-columns:1fr;grid-template-rows:repeat(4,minmax(120px,1fr))}}
.widget-card-meta{font-size:10px;color:#64748b;margin-top:4px}
.widget-card-cell{padding:12px 16px;overflow-y:auto;border-bottom:1px solid #f1f5f9}
.widget-card-cell:nth-child(odd){border-right:1px solid #f1f5f9}
@media (max-width:768px){.widget-card-cell:nth-child(odd){border-right:none}}
.widget-card-cell:nth-child(n+3){border-bottom:none}
.widget-card-img{display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden}
.widget-card-img img{max-width:100%;max-height:100%;object-fit:contain}
.widget-card-desc{font-size:12px;color:#334155;line-height:1.5;white-space:pre-wrap}
.widget-card-hyp-problem{padding:6px 12px;background:#fff;font-size:11px;color:#475569;border-top:1px solid #f8fafc;display:flex;gap:8px}
.widget-card-hyp-solutions{width:100%;border-collapse:collapse;font-size:12px}
.widget-card-hyp-solutions th,.widget-card-hyp-solutions td{padding:6px 12px;border-top:1px solid #f8fafc;text-align:left;vertical-align:top}
.widget-card-hyp-solutions th{font-size:11px;color:#94a3b8;font-weight:500;background:rgba(248,250,252,.8)}
.fs-widget-thumbs{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.fs-widget-thumbs img,.fs-widget-thumb-btn{width:40px;height:28px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;background:#fff;cursor:pointer;padding:0}
.fs-widget-thumbs img:hover,.fs-widget-thumb-btn:hover{border-color:#2563eb}
.fs-widget-thumb-btn{display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;background:#f8fafc}
.solution-card-widget img{cursor:pointer;border:1px solid #e2e8f0;border-radius:4px}
.solution-card-widget img:hover{border-color:#2563eb}
.solution-toolbar{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.solution-toolbar .solution-hint{font-size:11px;color:#64748b;flex:1;min-width:200px}
.solution-filter-btn{font-size:11px;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;background:#fff;color:#475569;cursor:pointer;white-space:nowrap}
.solution-filter-btn:hover{background:#f8fafc}
.solution-scroll{overflow-x:auto;border:1px solid #e2e8f0;border-radius:8px}
.solution-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:720px}
.solution-tbl th,.solution-tbl td{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top}
.solution-tbl thead th{background:#f8fafc;font-weight:600;color:#475569}
.solution-tbl thead tr.subhead th{background:rgba(248,250,252,.8);font-size:10px;font-weight:400;color:#64748b;padding:4px 8px}
.solution-tbl .solution-group td{background:rgba(255,251,235,.5)}
.solution-widget-row{display:flex;align-items:flex-start;gap:6px;margin-bottom:4px;cursor:pointer}
.solution-widget-row input{margin-top:2px;flex-shrink:0}
.solution-widget-row img{width:48px;height:32px;object-fit:contain;background:#fff;border:1px solid #e2e8f0;border-radius:4px;flex-shrink:0}
.solution-widget-name{font-size:11px;color:#334155;line-height:1.3}
.solution-name-btn{display:block;width:100%;text-align:left;border:none;background:none;padding:0;cursor:pointer;color:inherit;font:inherit}
.solution-name-btn:hover{color:#1d4ed8}
.solution-code{color:#94a3b8;font-family:ui-monospace,monospace;font-size:11px;font-weight:400;margin-right:4px}
.solution-card-desc{font-size:12px;color:#475569;margin-top:6px;font-weight:400;white-space:pre-wrap}
.solution-card-bd{padding:0!important}
.solution-card-split{display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:min(480px,calc(90vh - 10rem))}
@media (max-width:768px){.solution-card-split{grid-template-columns:1fr}}
.solution-card-col{padding:12px 16px;overflow-y:auto;max-height:calc(90vh - 10rem)}
.solution-card-col+.solution-card-col{border-left:1px solid #f1f5f9}
.solution-card-section-title{font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
.solution-card-section-gap{margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9}
.solution-card-empty{font-size:12px;color:#94a3b8;margin:0}
.solution-card-hyp{border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;margin-bottom:10px}
.solution-card-hyp-hd{padding:8px 12px;background:#f8fafc;font-size:12px;font-weight:600;color:#334155;display:flex;justify-content:space-between;gap:8px}
.solution-card-hyp-code{font-size:10px;font-family:ui-monospace,monospace;font-weight:400;color:#94a3b8}
.solution-card-hyp-tbl{width:100%;border-collapse:collapse;font-size:12px}
.solution-card-hyp-tbl th,.solution-card-hyp-tbl td{padding:6px 12px;border-top:1px solid #f8fafc;text-align:left;vertical-align:top}
.solution-card-hyp-tbl th{font-size:11px;color:#94a3b8;font-weight:500}
.solution-card-code{color:#94a3b8;font-family:ui-monospace,monospace;font-size:11px}
.solution-card-widget{display:flex;gap:8px;margin-bottom:8px;align-items:flex-start}
.solution-card-widget img{width:40px;height:28px;object-fit:contain;border:1px solid #e2e8f0;border-radius:4px;background:#fff;flex-shrink:0}
.solution-card-widget-name{font-size:12px;font-weight:500;color:#1e293b}
.solution-card-widget-desc{font-size:10px;color:#64748b;margin-top:2px;line-height:1.35}
.solution-card-fs-group{margin-bottom:10px}
.solution-card-fs-grp{font-size:11px;font-weight:600;color:#475569;margin-bottom:4px}
.solution-card-fs-row{display:flex;align-items:flex-start;gap:6px;font-size:12px;margin-bottom:4px}
.solution-card-fs-badge{font-size:10px;padding:2px 6px;border-radius:4px;min-width:32px;text-align:center;flex-shrink:0}
.solution-card-fs-badge.yes{background:#dcfce7;color:#166534}
.solution-card-fs-badge.opt{background:#dbeafe;color:#1d4ed8}
.solution-card-fs-name{color:#334155;line-height:1.35}
.solution-unmatched{font-style:italic;color:#64748b}
.solution-meta{font-size:10px;color:#94a3b8;margin-top:2px;line-height:1.35}
.child-row td:first-child{padding-left:28px}
.fs-toolbar{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-bottom:8px}
.fs-toolbar button{font-size:11px;color:#475569;border:1px solid #e2e8f0;background:#fff;padding:6px 12px;border-radius:6px;cursor:pointer}
.fs-toolbar button:hover{background:#f8fafc}
.fs-toolbar button.fs-filter-reset{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}
.fs-toolbar button.fs-filter-reset:hover{background:#dbeafe}
.fs-scroll{overflow:auto;max-height:calc(100vh - 220px);border:1px solid #e2e8f0;border-radius:8px;background:#fff}
.fs-tbl{width:100%;border-collapse:collapse;font-size:12px;min-width:900px;color:#1e293b}
.fs-tbl.fs-tbl-nsi{min-width:1100px}
.fs-tbl th,.fs-tbl td{border:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}
.fs-tbl thead{position:sticky;top:0;z-index:20}
.fs-tbl thead th{background:#f8fafc;font-weight:600;color:#475569}
.fs-tbl thead tr.fs-subhead th{background:rgba(248,250,252,.8);font-size:10px;font-weight:400;color:#64748b;padding:4px 8px}
.fs-tbl th.fs-filter-active{background:#dbeafe!important;box-shadow:inset 0 0 0 2px #60a5fa;color:#1e3a8a;cursor:pointer}
.fs-tbl th.fs-filterable{cursor:pointer;user-select:none}
.fs-tbl th.fs-filterable:hover{background:#f1f5f9}
.fs-tbl th.fs-filter-active .fs-filter-hint{font-size:9px;font-weight:400;color:#2563eb;margin-top:2px}
.fs-tbl th:first-child,.fs-tbl td:first-child{min-width:5rem;white-space:nowrap}
.fs-grp td{background:#fffbeb;font-weight:600;color:#334155}
.fs-grp:hover td{background:#fffbeb}
.fs-grp td.fs-grp-num{font-size:11px;font-weight:400;color:#64748b}
.fs-grp .fs-grp-toggle{background:none;border:none;cursor:pointer;color:#475569;width:24px;height:24px;padding:0;font-size:12px;line-height:1;vertical-align:middle}
.fs-grp .fs-grp-toggle:hover{color:#0f172a}
.fs-grp-count{font-size:10px;font-weight:400;color:#64748b;margin-left:8px}
.fs-row:hover td{background:#f8fafc}
.fs-row-customer td{background:rgba(236,253,245,.4)}
.fs-row-customer:hover td{background:rgba(236,253,245,.55)}
.fs-row-unmatched td{background:rgba(254,242,242,.3)}
.problem-filter-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
.customer-header-row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-bottom:12px}
.customer-header-row .field-hdr{flex:1;min-width:160px;margin-bottom:0}
.customer-header-row .field-hdr.shrink{flex:0 1 8rem;min-width:6rem}
.customer-header-row .field-hdr.hc{flex:0 1 10rem;min-width:8rem}
.customer-header-row .field-hdr span{display:block;font-size:11px;color:#64748b;margin-bottom:3px}
.customer-header-row input,.customer-header-row select{width:100%;max-width:none;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px}
.customer-filter-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(3rem,10%) auto;gap:8px;align-items:center;margin-bottom:8px}
.customer-filter-grid.no-showall{grid-template-columns:minmax(0,1fr) minmax(3rem,10%)}
.customer-filter-chips{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-width:0}
.customer-filter-chips .filter-label{font-size:11px;color:#64748b;white-space:nowrap;margin-right:4px}
.customer-segment-select{font-size:11px;border:1px solid #cbd5e1;border-radius:4px;padding:2px 6px;width:100%;max-width:none;background:#fff;justify-self:end}
.customer-hypothesis-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-bottom:8px}
.customer-hypothesis-row .filter-label{font-size:11px;color:#64748b;white-space:nowrap;margin-right:4px}
.customer-problems-block{margin-top:16px;padding-top:12px;border-top:1px solid #e2e8f0}
.customer-sub-h{font-size:12px;font-weight:600;color:#475569;margin:0 0 8px}
.problem-filter-bar .filter-label{font-size:11px;color:#64748b;white-space:nowrap}
.problem-filter-chips{display:flex;flex-wrap:wrap;gap:4px}
.problem-chip{font-size:11px;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;background:#fff;cursor:pointer;color:#475569}
.problem-chip.selected{background:#eff6ff;border-color:#93c5fd;color:#1d4ed8}
.problem-filter-btn{font-size:11px;border:1px solid #e2e8f0;border-radius:6px;padding:4px 10px;background:#fff;color:#475569;cursor:pointer;white-space:nowrap}
.problem-filter-btn:hover{background:#f8fafc}
.problem-tbl .problem-title-unmatched{font-style:italic;color:#64748b}
.problem-tbl .problem-hint{font-size:10px;color:#94a3b8;margin-top:2px}
.problem-tbl .problem-meta{font-size:10px;color:#94a3b8;margin-top:2px}
.problem-tbl .problem-group td{background:rgba(255,251,235,.5)}
.widget-toolbar{display:flex;justify-content:flex-end;margin-bottom:8px}
.widget-toolbar button{font-size:11px;color:#475569;border:1px solid #e2e8f0;background:#fff;padding:6px 12px;border-radius:6px;cursor:pointer}
.widget-toolbar button:hover{background:#f8fafc}
.widget-group-hd{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:8px 0 4px;font-size:11px;font-weight:600;color:#475569;cursor:pointer;user-select:none}
.widget-group-hd:hover{background:#f1f5f9}
.widget-group-hd .arrow{width:14px;text-align:center;color:#94a3b8;flex-shrink:0}
.fs-prefix-cell{font-size:11px;color:#64748b;white-space:nowrap;vertical-align:top}
.fs-prefix-wrap{display:inline-flex;align-items:flex-start;gap:4px}
.fs-prefix-wrap .fs-prefix-num{flex-shrink:0}
.fs-func-type{font-size:11px;color:#475569;white-space:nowrap}
.fs-func-select{font-size:11px;border:1px solid #a7f3d0;border-radius:4px;padding:2px 4px;background:#fff;max-width:100%}
.fs-widgets-cell{font-size:10px;color:#94a3b8}
.fs-name-btn{background:none;border:none;padding:0;text-align:left;width:100%;cursor:pointer;font:inherit}
.fs-name-btn:hover .fs-name-text{color:#1d4ed8;text-decoration:underline}
.fs-name-text{font-weight:500;color:#1e293b}
.fs-name-customer .fs-name-text{color:#065f46}
.fs-name-placeholder{color:#94a3b8;font-weight:400;font-style:italic}
.fs-inactive-tag{font-size:10px;color:#94a3b8;font-weight:400}
.fs-badge{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;font-size:10px;vertical-align:middle;margin-left:4px}
.fs-badge-wrap{display:inline-flex;align-items:center;gap:2px;margin-left:6px;vertical-align:middle}
.fs-grp-user-indicator{font-size:10px;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:4px;padding:2px 6px;margin-left:8px;font-weight:600;white-space:nowrap}
.fs-badge-customer{background:#d1fae5;color:#047857;font-weight:700}
.fs-badge-added{background:#d1fae5;color:#047857;font-weight:700}
.fs-badge-modified{background:#fef3c8;color:#b45309}
.fs-add-customer{font-size:10px;font-weight:400;color:#047857;margin-left:8px}
.fs-del-customer{color:#ef4444;border:none;background:none;cursor:pointer;font-size:12px;line-height:1;padding:0;flex-shrink:0}
.fs-del-customer:hover{color:#b91c1c}
.fs-comment-cell{text-align:center;vertical-align:middle;width:2.25rem;padding:4px!important;cursor:pointer}
.fs-comment-btn{width:28px;height:28px;border:none;border-radius:6px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0 auto}
.fs-comment-btn.has-comment{color:#b45309;background:#fef3c7;box-shadow:0 0 0 1px rgba(251,191,36,.6);cursor:grab}
.fs-comment-btn.has-comment:hover{background:#fde68a}
.fs-comment-btn.has-comment:active{cursor:grabbing}
.fs-comment-cell.fs-drop-target{background:#fffbeb!important;box-shadow:inset 0 0 0 2px #fbbf24}
.fs-nmd-select{font-size:10px;border:1px solid #cbd5e1;border-radius:4px;padding:2px 4px;max-width:9rem;width:100%}
.fs-nmd-select.manual{background:#fffbeb;border-color:#fcd34d}
.fs-nmd-select.auto{background:#f0f9ff;border-color:#bae6fd}
.fs-nmd-reset{font-size:10px;color:#2563eb;background:none;border:none;cursor:pointer;padding:0}
.fs-nmd-reset:hover{text-decoration:underline}
.fs-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.fs-modal{background:#fff;border-radius:12px;box-shadow:0 25px 50px -12px rgba(0,0,0,.25);width:100%;max-width:32rem;max-height:90vh;display:flex;flex-direction:column}
.fs-modal.fs-modal-lg{max-width:42rem}
.fs-modal.solution-card-modal{max-width:72rem;width:100%}
.fs-modal-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f5f9}
.fs-modal-bd{padding:16px;overflow-y:auto;flex:1}
.fs-modal-ft{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #f1f5f9}
.fs-modal-ft button{padding:6px 12px;border-radius:8px;font-size:13px;cursor:pointer;border:1px solid #e2e8f0;background:#fff}
.fs-modal-ft button.fs-modal-save{background:#2563eb;color:#fff;border-color:#2563eb}
.fs-modal-ft button.fs-modal-save:hover{background:#1d4ed8}
.fs-detail-line{border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-bottom:8px;background:#f8fafc}
.fs-detail-line input,.fs-detail-line textarea{width:100%;font-size:12px;border:1px solid #cbd5e1;border-radius:4px;padding:4px 8px;margin-bottom:4px}
.fs-widget-list{font-size:11px;color:#64748b;margin:0;padding-left:16px}
.org-branch td:first-child{padding-left:24px}
.org-region td:first-child{padding-left:12px}
.btn-link{background:none;border:none;color:#2563eb;font-size:10px;cursor:pointer;padding:0}
.btn-link:hover{text-decoration:underline}
.org-readonly{display:block;text-align:right;padding:2px 4px;background:#f1f5f9;border-radius:4px;min-height:1.4rem}
`;

const INLINE_JS = BRIEFING_HTML_EXPORT_CLIENT_JS;

export function buildBriefingHtmlExport(briefingId: number, blocks: ExportBlocks): string | null {
  const normalizedBlocks = normalizeExportBlocksForFill(blocks);
  const payload = buildExportPayload(briefingId, normalizedBlocks);
  if (!payload) return null;

  const json = JSON.stringify(payload);
  const title = escapeHtml(String(payload.briefing_name ?? 'Предоценка'));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — заполнение для заказчика</title>
<style>${INLINE_CSS}</style>
</head>
<body>
<div class="wrap">
  <div id="app"></div>
</div>
<div class="dl-bar">
  <button type="button" id="download-btn">Скачать заполненный файл</button>
</div>
<script type="application/json" id="briefing-export-data">${json.replace(/</g, '\\u003c')}</script>
<script>${INLINE_JS}</script>
</body>
</html>`;
}

export function listBlocksInPayload(payload: Record<string, unknown>): ExportBlockKey[] {
  const present: ExportBlockKey[] = [];
  for (const key of ['customer', 'fs', 'assessment_criteria', 'assessment_contract', 'assessment_org_volume', 'assessment_headcount', 'problems', 'solutions', 'widgets'] as ExportBlockKey[]) {
    if (payload[key] != null) present.push(key);
  }
  if (present.includes('customer') && present.includes('problems')) {
    return present.filter(k => k !== 'problems');
  }
  return present;
}
