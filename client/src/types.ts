export interface User {
  id: number;
  name: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  type: string;
  is_template: number;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: number;
  project_id: number;
  sort_order: number;
  этап: string;
  работа: string;
  исполнитель: string;
  рамки: string;
  результаты: string;
  отчет_doc: string;
  длит_трудоемк: number;
  согл_заказчика: number;
  риск_этапа: number;
  компенсация_продаж: number;
  загрузка_рп: number;
  загрузка_аналит_конс: number;
  загрузка_аналит_эксп: number;
  загрузка_архит: number;
  загрузка_програм1: number;
  загрузка_програм2: number;
  загрузка_куратор: number;
  трудозатраты_итог: number;
  фонд_компании: number;
  резерв_компании: number;
  бюджет_усн: number;
  бюджет_кп: number;
  бюджет_с_рисками: number;
  created_at: string;
  updated_at: string;
}

export interface WorkReference {
  id: number;
  ref_type: 'рамки' | 'результаты' | 'документ';
  work_name: string;
  content: string;
  author_id: number | null;
  author_name: string;
  usage_count: number;
  created_at: string;
}

export interface RefAuthor {
  author_id: number;   // -1 = Базовый
  author_name: string;
}

export interface BaseWork {
  id: string;
  этап: string;
  работа: string;
  рамки: string;
  отчет_doc: string;
  результат: string;
  длит_трудоемк: number;
  риск_этапа: number;
  загрузка_рп: number;
  загрузка_аналит_конс: number;
  загрузка_аналит_эксп: number;
  загрузка_архит: number;
  загрузка_програм1: number;
  загрузка_програм2: number;
  загрузка_куратор: number;
}

export interface Constants {
  ставкаЧасаРуб: number;
  ставкаНДС: number;
  часовВДень: number;
  резервКомпанииПроцент: number;
  компенсацияПродажПервойСтроки: number;
}

export interface HistoryEntry {
  id: number;
  project_id: number;
  row_id: number | null;
  user_id: number | null;
  user_name: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export type RefType = 'рамки' | 'результаты' | 'документ';

// === Briefing / Предоценка ===

export interface Industry {
  id: number;
  name: string;
  sheet_name?: string;
}

export interface Segment {
  id: number;
  name: string;
}

export interface MaturityLevel {
  id: number;
  name: string;
}

export interface Problem {
  id: number;
  name: string;
  industry_id: number | null;
  segment_id: number | null;
  maturity_id: number | null;
  industry_name?: string;
  segment_name?: string;
  maturity_name?: string;
}

export interface Solution {
  id: number;
  name: string;
  description?: string;
  hypothesis?: string;
}

export interface Widget {
  id: number;
  name: string;
  description: string;
  type: string;
  image_path?: string | null;
}

export interface FsCatalogItem {
  id: number;
  code: string | null;
  prefix?: string | null;
  name: string;
  description?: string | null;
  group_name?: string | null;
  group_prefix?: string | null;
  item_type?: string;
  func_type?: string | null;
  parent_id?: number | null;
  sort_order?: number;
  phase: string;
  queue: string;
  default_queues_json?: string;
  story_points: number;
  base_work_id: string | null;
}

export const FS_QUEUE_KEYS = ['1', '2', '3', '4'] as const;
export type FsQueueKey = typeof FS_QUEUE_KEYS[number];

export const FS_QUEUE_LABELS: Record<FsQueueKey, string> = {
  '1': '1 очередь',
  '2': '2 очередь',
  '3': '3 очередь',
  '4': 'Развитие',
};

export type FsQueuesMap = Record<FsQueueKey, number>;

export function parseQueuesJson(raw: string | FsQueuesMap | null | undefined): FsQueuesMap {
  const empty: FsQueuesMap = { '1': 0, '2': 0, '3': 0, '4': 0 };
  if (!raw) return { ...empty };
  if (typeof raw === 'object') return { ...empty, ...raw };
  try {
    return { ...empty, ...(JSON.parse(raw) as Partial<FsQueuesMap>) };
  } catch {
    return { ...empty };
  }
}

export function anyQueueEnabled(queues: FsQueuesMap): boolean {
  return FS_QUEUE_KEYS.some(k => queues[k] === 1);
}

export function queuesFromLegacy(queue: string | null | undefined, enabled = 1): FsQueuesMap {
  const q = parseQueuesJson(null);
  const key = (queue && FS_QUEUE_KEYS.includes(queue as FsQueueKey) ? queue : '1') as FsQueueKey;
  if (enabled) q[key] = 1;
  return q;
}

export interface FsPhase {
  id: number;
  name: string;
  sort_order: number;
  enabled_default: number;
}

export interface Briefing {
  id: number;
  name: string;
  industry_id: number | null;
  segment_id: number | null;
  scenario: string | null;
  headcount: number | null;
  project_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  industry_name?: string;
  segment_name?: string;
}

export interface BriefingProblemSel {
  id?: number;
  problem_id: number | null;
  custom_text: string | null;
  problem_name?: string;
}

export interface BriefingWidgetSel {
  solution_id: number;
  widget_id: number;
  name?: string;
  description?: string;
}

export interface BriefingFsSel {
  fs_item_id: number;
  enabled: number;
  queue: string;
  queues_json?: string | FsQueuesMap;
  source: string | null;
  story_points: number | null;
  name?: string;
  phase?: string;
  code?: string;
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
}

export function itemQueues(item: BriefingFsSel): FsQueuesMap {
  if (item.queues_json) return parseQueuesJson(item.queues_json);
  return queuesFromLegacy(item.queue, item.enabled);
}

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
  briefing_id?: number;
  hourly_rate: number;
  accuracy: string;
  sp_cost_rub: number;
  phases_json: string | PhaseConfig[];
  team_json: string | TeamProportions;
}

export interface ProjectType {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active?: number;
  base_type_id?: number | null;
  base_type_name?: string;
}

export interface ProjectTypeRate {
  id: number;
  project_type_id: number;
  hourly_rate: number;
  valid_from: string;
}

export interface HeadcountCoefficient {
  id?: number;
  project_type_id?: number;
  category: string;
  c63: number;
  c64: number;
  c67: number;
  c68: number;
}

export interface SellerCriteriaDef {
  key: string;
  label: string;
  group: string;
  typeImpact?: 'PROF' | 'KORP';
  excelRow?: number;
  hasFormula?: boolean;
  childFields?: { key: string; label: string; excelRef: string }[];
  allowsCustomRows?: boolean;
}

export interface CriteriaChildState {
  rp_value?: boolean;
  op_value?: boolean;
}

export interface CriteriaCustomRow {
  id: string;
  label: string;
  rp_value?: boolean;
  op_value?: boolean;
}

export interface CriteriaGroupState {
  children: Record<string, CriteriaChildState>;
  custom_rows: CriteriaCustomRow[];
  group_rp_override?: boolean | null;
  group_op_override?: boolean | null;
}

export type CriteriaGroups = Partial<Record<string, CriteriaGroupState>>;

export type SellerCriteria = Partial<Record<string, boolean>> & {
  content_selections?: Partial<Record<string, boolean | string>>;
  groups?: CriteriaGroups;
  contract_params?: {
    pm_version?: string;
    advance_pct?: number;
    payment_deferral_days?: number;
    max_stage_duration_days?: number | null;
  };
};

export interface RisksC51C57 {
  c52_rpo: number;
  c53_company_fund: number;
  c54_contract_rpo: number;
  c55_contract_fund: number;
  c56_sales_comp: number;
  c57_rk: number;
}

export interface QueueOrgVolume {
  users: number;
  rp_rpo: number | null;
  executors: number | null;
  rg: number;
  region: string;
  active: boolean;
}

export interface OrgVolumeData {
  queues: Record<FsQueueKey, QueueOrgVolume>;
  headcount_category: string;
}

export interface HeadcountCoeffs {
  c62: string;
  c63: number;
  c64: number;
  c67: number;
  c68: number;
}

export interface QueueCalcRow {
  queue: string;
  technology: string;
  rate: number;
  nsi_rate: number;
  rate_manual: number;
}

export interface BriefingAssessment {
  criteria: SellerCriteria;
  criteria_defs: SellerCriteriaDef[];
  auto_criteria_sp: Record<string, boolean>;
  project_type_id: number | null;
  project_type_manual: boolean;
  auto_project_type_id: number | null;
  auto_project_type: ProjectType | null;
  project_types: ProjectType[];
  risks: RisksC51C57;
  risks_manual: boolean;
  auto_risks: RisksC51C57;
  org_volume: OrgVolumeData;
  org_volume_manual: boolean;
  auto_org_volume: OrgVolumeData;
  headcount_category: string;
  headcount_coeffs: HeadcountCoeffs;
  headcount_manual: boolean;
  auto_headcount_coeffs: HeadcountCoeffs;
  queue_calcs: QueueCalcRow[];
  nsi_hourly_rate: number;
}

export interface BriefingFull extends Briefing {
  problems: BriefingProblemSel[];
  solutions: Solution[];
  widgets: BriefingWidgetSel[];
  fs_items: BriefingFsSel[];
  params: BriefingParams;
  assessment: BriefingAssessment;
}

export interface QueueSummary {
  queue: string;
  phase: string;
  story_points: number;
  budget: number;
  hours: number;
  duration_days: number;
}

export interface BriefingCalcResult {
  by_queue: QueueSummary[];
  totals: { story_points: number; budget: number; hours: number; duration_days: number };
}

export interface CatalogLink {
  problem_id?: number;
  solution_id?: number;
  widget_id?: number;
  fs_item_id?: number;
  problem_name?: string;
  solution_name?: string;
  widget_name?: string;
  fs_name?: string;
}
