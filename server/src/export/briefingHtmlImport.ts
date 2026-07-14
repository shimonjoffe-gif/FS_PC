import { db } from '../db';
import { getBriefingFull } from '../routes/briefings';
import { loadFsSelections } from '../briefingCalc';
import { replaceBriefingFsCustomerItems, isCustomerFsGroupPrefix } from '../fsCustomerItems';
import { parseQueuesJson, primaryQueue, enabledFromQueues } from '../fsQueues';
import { parseSellerCriteria, serializeSellerCriteria, computeAdvanceDeferralOk, ensureContractParams, ensureExtraCustomDocuments } from '../sellerCriteria';
import type { SellerCriteria } from '../sellerCriteria';
import { listStandardDocuments } from '../standardDocumentsSeed';
import { mergeStandardDocumentsIntoCriteria } from '../standardDocuments';
import { EXPORT_VERSION, type ExportBlockKey, type ExportBlocks, type ImportOptions } from './briefingExportTypes';
import { listBlocksInPayload } from './briefingHtmlExport';
import { isPublishedFsCatalogItem } from '../fsCatalogNsi';

export interface ParsedBriefingExport {
  version: number;
  briefing_id: number;
  briefing_name: string;
  exported_at: string;
  blocks: Partial<ExportBlocks>;
  customer?: {
    name: string;
    industry_id: number | null;
    segment_id: number | null;
    scenario: string | null;
    headcount?: number | null;
    headcount_category?: string;
    org_volume?: Record<string, unknown>;
    activity_type_ids?: number[];
  };
  fs?: {
    items: {
      fs_item_id: number;
      customer_name?: string | null;
      customer_description?: string | null;
      queues_json: Record<string, number>;
      queue_nmd_json?: Record<string, string> | null;
      queue_comment_json?: Record<string, string> | null;
      detail_lines?: {
        catalog_detail_id?: number | null;
        source: string;
        name: string;
        description?: string | null;
        inactive?: boolean;
        sort_order?: number;
      }[];
      is_customer_item?: boolean;
      customer_item_id?: number | null;
      group_prefix?: string | null;
      func_type?: string | null;
      name?: string;
      description?: string | null;
    }[];
  };
  assessment_criteria?: {
    standard_document_state?: SellerCriteria['standard_documents'];
    extra_custom_documents?: SellerCriteria['extra_custom_documents'];
  };
  assessment_contract?: {
    contract_params: {
      pm_version: string;
      advance_pct: number;
      payment_deferral_days: number;
      max_stage_duration_days: number | null;
    };
    criteria: Record<string, boolean>;
    advance_deferral_ok: boolean;
  };
  assessment_org_volume?: {
    org_volume: Record<string, unknown>;
  };
  assessment_headcount?: {
    headcount_category: string;
  };
  problems?: {
    selections: {
      problem_id: number | null;
      custom_text: string | null;
      linked_problem_id?: number | null;
    }[];
    activity_type_ids?: number[];
    segment_id?: number | null;
  };
  solutions?: {
    selections?: {
      solution_id: number;
      queue?: string;
      queue_comment_json?: Record<string, string> | null;
    }[];
    selected_ids?: number[];
  };
  widgets?: {
    selections: { solution_id: number; widget_id: number }[];
  };
}

export function parseBriefingHtml(html: string): ParsedBriefingExport {
  const match = html.match(/<script[^>]*id=["']briefing-export-data["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('Не найден блок данных в HTML-файле');
  let payload: ParsedBriefingExport;
  try {
    payload = JSON.parse(match[1].trim()) as ParsedBriefingExport;
  } catch {
    throw new Error('Некорректный JSON в HTML-файле');
  }
  if (payload.version !== EXPORT_VERSION) {
    throw new Error(`Неподдерживаемая версия формата: ${payload.version}`);
  }
  if (!payload.briefing_id) throw new Error('В файле отсутствует briefing_id');
  return payload;
}

function blocksToApply(payload: ParsedBriefingExport, options: ImportOptions): ExportBlockKey[] {
  const inFile = listBlocksInPayload(payload as unknown as Record<string, unknown>);
  if (options.mode === 'replace') return inFile;
  const selected = Object.entries(options.blocks ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k as ExportBlockKey);
  return inFile.filter(k => selected.includes(k));
}

function categoryToHeadcount(cat: string): number {
  const map: Record<string, number> = { 'до 200': 200, '201-500': 350, '501-1000': 750, '1001+': 1500 };
  return map[cat] ?? 200;
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

function applyCustomer(briefingId: number, customer: NonNullable<ParsedBriefingExport['customer']>) {
  const headcount = customer.headcount_category
    ? categoryToHeadcount(customer.headcount_category)
    : (customer.headcount ?? null);
  const industryId = customer.industry_id ?? null;
  db.prepare(`
    UPDATE briefings SET
      name=?, industry_id=COALESCE(?, industry_id), segment_id=?, scenario=?, headcount=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    customer.name?.trim() || 'Новая предоценка',
    industryId,
    customer.segment_id,
    customer.scenario,
    headcount,
    briefingId,
  );
  if (customer.headcount_category) {
    db.prepare(`
      UPDATE briefing_assessment SET headcount_category=?, headcount_manual=1 WHERE briefing_id=?
    `).run(customer.headcount_category, briefingId);
  }
  if (customer.org_volume) {
    applyOrgVolume(briefingId, { org_volume: customer.org_volume });
  }
  if (customer.activity_type_ids !== undefined) {
    saveBriefingActivityTypeIds(briefingId, customer.activity_type_ids);
  }
}

function applyFs(briefingId: number, fsData: NonNullable<ParsedBriefingExport['fs']>) {
  const current = loadFsSelections(briefingId);
  const importById = new Map(fsData.items.map(i => [i.fs_item_id, i]));

  const items = current
    .filter(item => item.fs_item_id > 0 && !item.is_customer_item)
    .map(item => {
      const imp = importById.get(item.fs_item_id);
      if (!imp) return null;
      if (!isPublishedFsCatalogItem(item.fs_item_id)) return null;
      const queues = parseQueuesJson(imp.queues_json as import('../fsQueues').FsQueuesMap);
      return {
        fs_item_id: item.fs_item_id,
        enabled: enabledFromQueues(queues),
        queue: primaryQueue(queues),
        queues_json: queues,
        source: item.source ?? 'manual',
        story_points: item.story_points ?? null,
        queue_sp_json: item.queue_sp_json ?? null,
        queue_nmd_json: imp.queue_nmd_json ?? null,
        queue_comment_json: imp.queue_comment_json ?? null,
        customer_name: imp.customer_name?.trim() || null,
        customer_description: imp.customer_description?.trim() || null,
        detail_lines: imp.detail_lines?.map((dl, i) => ({
          catalog_detail_id: dl.catalog_detail_id ?? null,
          source: dl.source === 'customer' ? 'customer' as const : 'nsi' as const,
          name: dl.name,
          description: dl.description ?? null,
          inactive: Boolean(dl.inactive),
          sort_order: dl.sort_order ?? i,
        })),
      };
    })
    .filter(Boolean) as {
      fs_item_id: number; enabled: number; queue: string;
      queues_json: Record<string, number>;
      source: string; story_points: number | null;
      queue_sp_json: unknown; queue_nmd_json: unknown; queue_comment_json: unknown;
      customer_name: string | null; customer_description: string | null;
      detail_lines?: { catalog_detail_id: number | null; source: 'nsi' | 'customer'; name: string; description: string | null; inactive: boolean; sort_order: number }[];
    }[];

  const upsert = db.prepare(`
    INSERT INTO briefing_fs_sel(
      briefing_id, fs_item_id, enabled, queue, queues_json, source, story_points,
      queue_sp_json, queue_nmd_json, queue_comment_json,
      customer_name, customer_description, detail_lines_json
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(briefing_id, fs_item_id) DO UPDATE SET
      enabled=excluded.enabled, queue=excluded.queue, queues_json=excluded.queues_json,
      queue_nmd_json=excluded.queue_nmd_json, queue_comment_json=excluded.queue_comment_json,
      customer_name=excluded.customer_name,
      customer_description=excluded.customer_description,
      detail_lines_json=excluded.detail_lines_json
  `);

  const tx = db.transaction(() => {
    for (const item of items) {
      const detailLinesJson = item.detail_lines == null
        ? null
        : JSON.stringify(item.detail_lines);
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

      upsert.run(
        briefingId, item.fs_item_id, item.enabled, item.queue,
        JSON.stringify(item.queues_json),
        item.source, item.story_points,
        queueSpJson, queueNmdJson, queueCommentJson,
        item.customer_name, item.customer_description,
        detailLinesJson,
      );
    }
  });
  tx();

  const customerImports = fsData.items.filter(
    imp => imp.is_customer_item || imp.fs_item_id < 0,
  );
  replaceBriefingFsCustomerItems(
    briefingId,
    customerImports
      .map((imp, i) => {
        const groupPrefix = imp.group_prefix?.trim();
        if (!isCustomerFsGroupPrefix(groupPrefix)) return null;
        const queues = parseQueuesJson(imp.queues_json as import('../fsQueues').FsQueuesMap);
        const name = (imp.customer_name ?? imp.name ?? '').trim();
        if (!name) return null;
        return {
          id: imp.customer_item_id ?? undefined,
          group_prefix: groupPrefix,
          name,
          description: (imp.description ?? imp.customer_description)?.trim() || null,
          func_type: imp.func_type?.trim() || 'ПРОФ',
          queues_json: queues,
          queue_nmd_json: imp.queue_nmd_json ?? null,
          queue_comment_json: imp.queue_comment_json ?? null,
          detail_lines: imp.detail_lines?.map((dl, idx) => ({
            catalog_detail_id: dl.catalog_detail_id ?? null,
            source: dl.source === 'nsi' ? 'nsi' as const : 'customer' as const,
            name: dl.name,
            description: dl.description ?? null,
            inactive: Boolean(dl.inactive),
            nsi_name: null,
            nsi_description: null,
            sort_order: dl.sort_order ?? idx,
          })),
          sort_order: i,
        };
      })
      .filter(Boolean) as import('../fsCustomerItems').BriefingFsCustomerItemInput[],
  );
}

function ensureAssessmentRow(briefingId: number) {
  const exists = db.prepare(`SELECT briefing_id FROM briefing_assessment WHERE briefing_id=?`).get(briefingId);
  if (!exists) db.prepare(`INSERT INTO briefing_assessment(briefing_id) VALUES (?)`).run(briefingId);
}

function applyAssessmentCriteria(briefingId: number, data: NonNullable<ParsedBriefingExport['assessment_criteria']>) {
  ensureAssessmentRow(briefingId);
  const row = db.prepare(`SELECT criteria_json FROM briefing_assessment WHERE briefing_id=?`).get(briefingId) as {
    criteria_json: string;
  } | undefined;
  if (!row) return;
  const criteria = parseSellerCriteria(JSON.parse(row.criteria_json || '{}'));
  const stdCatalog = listStandardDocuments();
  let next = {
    ...criteria,
    standard_documents: {
      ...(criteria.standard_documents ?? {}),
      ...(data.standard_document_state ?? {}),
    },
    extra_custom_documents: data.extra_custom_documents ?? criteria.extra_custom_documents ?? [],
  } as SellerCriteria;
  if (!next.extra_custom_documents?.length) {
    next.extra_custom_documents = ensureExtraCustomDocuments(next);
  }
  next = mergeStandardDocumentsIntoCriteria(stdCatalog, next, null, false);
  db.prepare(`UPDATE briefing_assessment SET criteria_json=? WHERE briefing_id=?`).run(
    JSON.stringify(serializeSellerCriteria(next)),
    briefingId,
  );
}

function applyAssessmentContract(briefingId: number, data: NonNullable<ParsedBriefingExport['assessment_contract']>) {
  ensureAssessmentRow(briefingId);
  const row = db.prepare(`SELECT criteria_json FROM briefing_assessment WHERE briefing_id=?`).get(briefingId) as {
    criteria_json: string;
  } | undefined;
  if (!row) return;
  const criteria = parseSellerCriteria(JSON.parse(row.criteria_json || '{}'));
  const contractParams = ensureContractParams(data.contract_params);
  const next = {
    ...criteria,
    contract_params: contractParams,
    advance_deferral_ok: computeAdvanceDeferralOk(contractParams),
  } as unknown as SellerCriteria;
  for (const [key, val] of Object.entries(data.criteria)) {
    (next as Record<string, unknown>)[key] = val;
  }
  db.prepare(`UPDATE briefing_assessment SET criteria_json=? WHERE briefing_id=?`).run(
    JSON.stringify(serializeSellerCriteria(next)),
    briefingId,
  );
}

function applyOrgVolume(briefingId: number, data: NonNullable<ParsedBriefingExport['assessment_org_volume']>) {
  db.prepare(`
    UPDATE briefing_assessment SET org_volume_json=?, org_volume_manual=1 WHERE briefing_id=?
  `).run(JSON.stringify(data.org_volume), briefingId);
}

function applyHeadcount(briefingId: number, data: NonNullable<ParsedBriefingExport['assessment_headcount']>) {
  db.prepare(`
    UPDATE briefing_assessment SET headcount_category=?, headcount_manual=1 WHERE briefing_id=?
  `).run(data.headcount_category, briefingId);
}

function applyProblems(briefingId: number, data: NonNullable<ParsedBriefingExport['problems']>) {
  if (data.activity_type_ids !== undefined) {
    saveBriefingActivityTypeIds(briefingId, data.activity_type_ids);
  }
  if (data.segment_id !== undefined) {
    db.prepare(`UPDATE briefings SET segment_id=? WHERE id=?`).run(data.segment_id, briefingId);
  }
  const del = db.prepare(`DELETE FROM briefing_problem_sel WHERE briefing_id=?`);
  const ins = db.prepare(`
    INSERT INTO briefing_problem_sel(briefing_id, problem_id, custom_text, linked_problem_id)
    VALUES (?,?,?,?)
  `);
  const tx = db.transaction(() => {
    del.run(briefingId);
    for (const s of data.selections ?? []) {
      ins.run(
        briefingId,
        s.problem_id ?? null,
        s.custom_text ?? null,
        s.linked_problem_id ?? null,
      );
    }
  });
  tx();
}

function applySolutions(briefingId: number, data: NonNullable<ParsedBriefingExport['solutions']>) {
  const rows = data.selections?.length
    ? data.selections
    : (data.selected_ids ?? []).map(solution_id => ({ solution_id, queue: '1' }));
  const del = db.prepare(`DELETE FROM briefing_solution_sel WHERE briefing_id=?`);
  const ins = db.prepare(`
    INSERT INTO briefing_solution_sel(briefing_id, solution_id, queue, queue_comment_json, source_problem_sel_id)
    VALUES (?,?,?,?,?)
  `);
  const tx = db.transaction(() => {
    del.run(briefingId);
    for (const row of rows) {
      const commentJson = row.queue_comment_json == null
        ? null
        : JSON.stringify(row.queue_comment_json);
      ins.run(briefingId, row.solution_id, row.queue ?? '1', commentJson, null);
    }
  });
  tx();
}

function applyWidgets(briefingId: number, data: NonNullable<ParsedBriefingExport['widgets']>) {
  const del = db.prepare(`DELETE FROM briefing_widget_sel WHERE briefing_id=?`);
  const ins = db.prepare(`INSERT INTO briefing_widget_sel(briefing_id, solution_id, widget_id) VALUES (?,?,?)`);
  const tx = db.transaction(() => {
    del.run(briefingId);
    for (const s of data.selections ?? []) ins.run(briefingId, s.solution_id, s.widget_id);
  });
  tx();
}

export function summarizeImport(payload: ParsedBriefingExport, options: ImportOptions): {
  blocks: ExportBlockKey[];
  briefing_name: string;
  exported_at: string;
  file_briefing_id: number;
} {
  return {
    blocks: blocksToApply(payload, options),
    briefing_name: payload.briefing_name,
    exported_at: payload.exported_at,
    file_briefing_id: payload.briefing_id,
  };
}

export function applyBriefingHtmlImport(
  briefingId: number,
  html: string,
  options: ImportOptions,
): { applied: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const applied: string[] = [];

  const payload = parseBriefingHtml(html);
  if (payload.briefing_id !== briefingId) {
    warnings.push(`ID в файле (${payload.briefing_id}) не совпадает с текущей предоценкой (${briefingId})`);
  }

  const full = getBriefingFull(briefingId);
  if (!full) throw new Error('Предоценка не найдена');

  const blocks = blocksToApply(payload, options);
  let problemsApplied = false;

  for (const block of blocks) {
    try {
      switch (block) {
        case 'customer':
          if (payload.customer) {
            applyCustomer(briefingId, payload.customer);
            applied.push('customer');
            if (payload.problems) {
              applyProblems(briefingId, payload.problems);
              problemsApplied = true;
            }
          }
          break;
        case 'fs':
          if (payload.fs) {
            applyFs(briefingId, payload.fs);
            applied.push('fs');
          }
          break;
        case 'assessment_criteria':
          if (payload.assessment_criteria) {
            applyAssessmentCriteria(briefingId, payload.assessment_criteria);
            applied.push('assessment_criteria');
          }
          break;
        case 'assessment_contract':
          if (payload.assessment_contract) {
            applyAssessmentContract(briefingId, payload.assessment_contract);
            applied.push('assessment_contract');
          }
          break;
        case 'assessment_org_volume':
          if (payload.assessment_org_volume) {
            applyOrgVolume(briefingId, payload.assessment_org_volume);
            applied.push('assessment_org_volume');
          }
          break;
        case 'assessment_headcount':
          if (payload.assessment_headcount) {
            applyHeadcount(briefingId, payload.assessment_headcount);
            applied.push('assessment_headcount');
          }
          break;
        case 'problems':
          if (payload.problems && !problemsApplied) {
            applyProblems(briefingId, payload.problems);
            applied.push('problems');
          }
          break;
        case 'solutions':
          if (payload.solutions) {
            applySolutions(briefingId, payload.solutions);
            applied.push('solutions');
          }
          break;
        case 'widgets':
          if (payload.widgets) {
            applyWidgets(briefingId, payload.widgets);
            applied.push('widgets');
          }
          break;
        default:
          break;
      }
    } catch (e) {
      warnings.push(`${block}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (applied.length > 0) {
    db.prepare(`UPDATE briefings SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(briefingId);
  }

  return { applied, warnings };
}

export function previewBriefingHtmlImport(
  briefingId: number,
  html: string,
  options: ImportOptions,
) {
  const payload = parseBriefingHtml(html);
  const summary = summarizeImport(payload, options);
  const warnings: string[] = [];
  if (payload.briefing_id !== briefingId) {
    warnings.push(`ID в файле (${payload.briefing_id}) не совпадает с текущей предоценкой (${briefingId})`);
  }
  return { ...summary, warnings };
}
