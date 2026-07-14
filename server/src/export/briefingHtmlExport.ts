import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { getBriefingFull } from '../routes/briefings';
import { parseQueuesJson, FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../fsQueues';
import { getDefaultParams } from '../briefingCalc';
import { compareFsByGroupThenPrefix } from '../fsPrefixSort';
import {
  TYPE_CRITERIA_DEFS,
  CONTRACT_CRITERIA_DEFS,
  CONTRACT_FORMULA_ROW,
  ensureContractParams,
  ensureCriteriaGroups,
  computeAdvanceDeferralOk,
} from '../sellerCriteria';
import type { ExportBlocks, ExportBlockKey } from './briefingExportTypes';
import { EXPORT_VERSION, normalizeExportBlocksForFill } from './briefingExportTypes';
import { BRIEFING_HTML_EXPORT_CLIENT_JS } from './briefingHtmlExportClient';
import { isPublishedFsCatalogItem } from '../fsCatalogNsi';
import { listProblemsCatalog } from '../problems';

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
        matched_widgets: (item.matched_widgets as Array<{ id: number; name: string; description?: string | null }> | undefined) ?? [],
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
    const assessment = full.assessment as { criteria: Parameters<typeof ensureCriteriaGroups>[0] };
    const criteria = assessment.criteria;
    const groups = ensureCriteriaGroups(criteria);
    payload.assessment_criteria = {
      criteria_defs: TYPE_CRITERIA_DEFS.map(d => ({
        key: d.key,
        label: d.label,
        childFields: d.childFields ?? [],
        allowsCustomRows: Boolean(d.allowsCustomRows),
      })),
      groups,
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
    const allSolutions = db.prepare(`SELECT id, name, description FROM solutions ORDER BY name`).all() as {
      id: number; name: string; description: string | null;
    }[];
    const solutions = (full.solutions ?? []) as Array<{ id: number }>;
    payload.solutions = {
      catalog: allSolutions,
      selected_ids: solutions.map(s => s.id),
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
.widget-grid{display:flex;flex-wrap:wrap;gap:12px}
.widget-card{border:1px solid #e2e8f0;border-radius:8px;padding:8px;width:160px}
.widget-card img{width:100%;height:80px;object-fit:contain;background:#f8fafc;border-radius:4px}
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
