import type { PhaseCalcParams } from './phaseCalcParams';

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
  industry_name?: string | null;
  segment_name?: string | null;
  maturity_name?: string | null;
  parent_id?: number | null;
  sort_order?: number;
  lcm_code?: string | null;
  catalog_code?: string | null;
  used_in_hypotheses?: string[];
  hypothesis_codes?: Record<string, string>;
}

export interface ProblemSolutionUsage {
  id: number;
  name: string;
  lcm_code?: string | null;
  catalog_code?: string | null;
  sort_order: number;
}

export interface ProblemHypothesisUsage {
  hypothesis_id: number;
  hypothesis_name: string;
  code?: string | null;
  solutions: ProblemSolutionUsage[];
}

export interface ProblemDetail extends Problem {
  hypothesis_usages: ProblemHypothesisUsage[];
}

export interface Solution {
  id: number;
  name: string;
  description?: string | null;
  hypothesis?: string | null;
  parent_id?: number | null;
  sort_order?: number;
  lcm_code?: string | null;
  catalog_code?: string | null;
  hypothesis_code?: string | null;
  fs_mapped?: boolean;
  used_in_hypotheses?: string[];
  hypothesis_codes?: Record<string, string>;
}

export interface SolutionHypothesisUsage {
  hypothesis_id: number;
  hypothesis_name: string;
  code?: string | null;
  problems: {
    id: number;
    name: string;
    lcm_code?: string | null;
    sort_order: number;
  }[];
}

export interface SolutionDetail extends Solution {
  hypothesis_usages: SolutionHypothesisUsage[];
}

export interface HypothesisListItem {
  id: number;
  name: string;
  target_audience: string | null;
  maturity_id: number | null;
  maturity_name: string | null;
  problem_count: number;
  activity_type_count: number;
  updated_at: string;
}

export interface ActivityType {
  id: number;
  name: string;
}

export interface HypothesisProblemRow {
  id: number;
  name: string;
  industry_name?: string | null;
  segment_name?: string | null;
  maturity_name?: string | null;
  parent_id?: number | null;
  sort_order: number;
  lcm_code?: string | null;
  depth?: number;
  solutions: { id: number; name: string; description?: string | null; parent_id?: number | null; sort_order?: number; lcm_code?: string | null; catalog_code?: string | null; hypothesis_code?: string | null }[];
}

export interface HypothesisDetail {
  id: number;
  name: string;
  target_audience: string | null;
  maturity_id: number | null;
  maturity_name: string | null;
  activity_types: ActivityType[];
  problems: HypothesisProblemRow[];
}

export interface HypothesisProblemDraft {
  problem_id?: number;
  name: string;
  parent_id?: number | null;
  depth?: number;
  lcm_code?: string | null;
  sort_order?: number;
  solution_ids: number[];
  new_solution_name: string;
}

export interface Widget {
  id: number;
  name: string;
  description: string;
  type: string;
  image_path?: string | null;
}

export interface FsCatalogGroup {
  id: number;
  group_prefix: string;
  group_name: string;
  sort_order: number;
  published?: number;
}

export interface FsCatalogItemsResponse {
  groups: FsCatalogGroup[];
  items: FsCatalogItem[];
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
  requires_nmd?: string | null;
  base_work_id: string | null;
  details?: { name: string; description: string | null }[];
  published?: number;
}

export const FS_QUEUE_KEYS = ['1', '2', '3', '4'] as const;
export type FsQueueKey = typeof FS_QUEUE_KEYS[number];

export const FS_QUEUE_LABELS: Record<FsQueueKey, string> = {
  '1': '1 очередь',
  '2': '2 очередь',
  '3': '3 очередь',
  '4': 'Развитие',
};

export const FS_NMD_VALUES = [
  'Не требуется',
  'Предоставляется Заказчиком',
  'Используется типовая',
  'Требуется разработать',
] as const;
export type FsNmdValue = typeof FS_NMD_VALUES[number];

export const FS_FUNC_TYPE_VALUES = [
  'Базовый',
  'Проф-мини',
  'ПРОФ',
  'Экспертный',
] as const;
export type FsFuncTypeValue = typeof FS_FUNC_TYPE_VALUES[number];

export type QueueLabelsMap = Record<FsQueueKey, string>;

export function defaultQueueLabels(): QueueLabelsMap {
  return { ...FS_QUEUE_LABELS };
}

export function parseQueueLabels(
  raw: string | QueueLabelsMap | null | undefined,
): QueueLabelsMap {
  const defaults = defaultQueueLabels();
  if (!raw) return defaults;
  if (typeof raw === 'object') return { ...defaults, ...raw };
  try {
    return { ...defaults, ...(JSON.parse(raw) as Partial<QueueLabelsMap>) };
  } catch {
    return defaults;
  }
}

export function queueLabel(labels: QueueLabelsMap | undefined, q: FsQueueKey): string {
  return labels?.[q]?.trim() || FS_QUEUE_LABELS[q];
}

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
  /** НСИ каталога (нормативный SP пункта). */
  catalog_story_points?: number;
  /** Требование НМД из НСИ каталога (колонка CR Excel). */
  requires_nmd?: string | null;
  /** Ручные SP по очередям; отсутствие ключа = норматив из каталога. */
  queue_sp_json?: string | Partial<Record<FsQueueKey, number>> | null;
  /** НМД по очередям; отсутствие ключа = авто из пункта ФС. */
  queue_nmd_json?: string | Partial<Record<FsQueueKey, FsNmdValue>> | null;
  /** Комментарий по очередям. */
  queue_comment_json?: string | Partial<Record<FsQueueKey, string>> | null;
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
  /** Расшифровка из снимка НСИ. */
  catalog_description?: string | null;
  customer_name?: string | null;
  customer_description?: string | null;
  inactive_for_customer?: boolean;
  custom_lines?: BriefingFsCustomLine[];
  detail_lines?: BriefingFsDetailLine[];
  /** Пункт ФС заказчика (разделы 10/11), не из НСИ. */
  is_customer_item?: boolean;
  customer_item_id?: number;
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

export interface BriefingFsCustomLine {
  id?: number;
  briefing_id?: number;
  parent_fs_item_id: number | null;
  name: string;
  description?: string | null;
  sort_order?: number;
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
  accuracy: number;
  sp_cost_rub: number;
  phases_json: string | PhaseConfig[];
  team_json: string | TeamProportions;
  queue_labels_json?: string | QueueLabelsMap;
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

export type RisksManualKeys = Partial<Record<keyof RisksC51C57, boolean>>;

export type RiskSide = 'ot' | 'do';

export interface OrgVolumeBreakdownRow {
  id: string;
  /** Регион или название филиала */
  label: string;
  /** Пользователи в регионе/филиале (у региона с филиалами = сумма филиалов) */
  users: number | null;
  rp_rpo?: number | null;
  executors?: number | null;
  rg?: number | null;
  rg_regions?: number | null;
  branches?: OrgVolumeBreakdownRow[];
}

export interface QueueOrgVolume {
  users: number;
  rp_rpo: number | null;
  executors: number | null;
  /** Excel D7 — РГ в СПб/МСК */
  rg: number;
  /** Excel E7 — РГ в регионах */
  rg_regions: number;
  /** Excel C20 — SP функционала (авто из ФС или ручной ввод) */
  functional_sp: number;
  /** Excel C21 — SP интеграций (авто из раздела «ФС интеграции» или ручной ввод) */
  integrations_sp: number;
  /** Excel D20 — SP с требованием НМД (авто из ФС или ручной ввод) */
  nmd_sp: number;
  /** Excel E20 — сценариев нагрузочного тестирования */
  load_test_scenarios: number;
  region: string;
  active: boolean;
  /** Географическая детализация пользователей; итоги очереди независимы */
  breakdown?: OrgVolumeBreakdownRow[];
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
  auto_technology: string;
  technology_manual: number;
  rate: number;
  nsi_rate: number;
  rate_manual: number;
}

export interface PhaseCalcLineDef {
  id: string;
  excel_row: number;
  label: string;
  is_phase: boolean;
  default_enabled: boolean;
  c_formula_stub?: string;
  hours_formula_stub?: string;
  days_formula_stub?: string;
}

export type PhaseCalcQueuesState = Record<FsQueueKey, Record<string, boolean>>;

/** Доли FTE по ролям: очередь → id фазы → роли. */
export type PhaseCalcTeamFteState = Partial<Record<FsQueueKey, Record<string, TeamProportions>>>;

export interface PhaseCalcState {
  queues: PhaseCalcQueuesState;
  team_fte?: PhaseCalcTeamFteState;
}

export type { PhaseCalcParams } from './phaseCalcParams';

export interface AssessmentScenario {
  id: string;
  name: string;
  note?: string;
  created_at: string;
  updated_at: string;
  /** Only diffs from base phase_calc.queues */
  phase_enabled?: Partial<Record<FsQueueKey, Record<string, boolean>>>;
  /** fs_item_id excluded from scenario (base ФС unchanged). */
  fs_excluded?: number[];
  /** Technology / rate overrides per queue (diffs from base queue_calcs). */
  queue_technology?: Partial<Record<FsQueueKey, ScenarioQueueTechnologyOverride>>;
}

export interface ScenarioQueueTechnologyOverride {
  technology: string;
  /** Manual C32 override; omit to use NSI rate for technology. */
  rate?: number;
}

/** Детализация ОТ по фазе (сумма по активным очередям). */
export interface ScenarioPhaseDetail {
  budgetWithRisks: number;
  travel: number;
  productionCore: number;
  hours: number;
  weeks: number;
  reserveRpo: number;
  reserveCompany: number;
  salesComp: number;
  companyFund: number;
  contractRpoRisks: number;
  contractFundRisks: number;
  total: number;
}

export interface ScenarioSnapshotOtTotals {
  byPhase: Record<string, number>;
  grandTotal: number;
  /** Недели по фазам (сумма по активным очередям). */
  weeksByPhase: Record<string, number>;
  grandTotalWeeks: number;
  detailByPhase: Record<string, ScenarioPhaseDetail>;
  grandDetail: ScenarioPhaseDetail;
}

export interface ScenarioSnapshotResults {
  comparison: {
    base: ScenarioSnapshotOtTotals;
    scenario: ScenarioSnapshotOtTotals;
  };
  sp_functional_all_queues?: number;
  scenario_sp_functional_all_queues?: number;
}

export interface AssessmentScenarioSnapshot {
  id: string;
  briefing_id: number;
  scenario_id: string | null;
  name: string;
  frozen_at: string;
  sent_to_client: boolean;
  extended: boolean;
  scenario_overrides: AssessmentScenario | null;
  results: ScenarioSnapshotResults;
  extended_dump?: {
    assessment: BriefingAssessment;
    fs_items: BriefingFsSel[];
    accuracy_pct: number;
    team_fte_sum: number;
  };
  base_revision?: string;
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
  risks_manual_keys: RisksManualKeys;
  /** Stored partial overrides for Итого ОТ (phase calc). */
  risks_ot: Partial<RisksC51C57>;
  risks_do: Partial<RisksC51C57>;
  risks_manual_ot: boolean;
  risks_manual_do: boolean;
  risks_manual_keys_ot: RisksManualKeys;
  risks_manual_keys_do: RisksManualKeys;
  /** Effective merged risks per side (auto + side overrides). */
  effective_risks_ot: RisksC51C57;
  effective_risks_do: RisksC51C57;
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
  unified_rate_enabled: boolean;
  unified_rate: number;
  unified_rate_manual: boolean;
  phase_calc_defs: PhaseCalcLineDef[];
  phase_calc: PhaseCalcState;
  phase_calc_params: PhaseCalcParams;
  assessment_scenarios?: AssessmentScenario[];
}

export interface BriefingFull extends Briefing {
  problems: BriefingProblemSel[];
  solutions: Solution[];
  widgets: BriefingWidgetSel[];
  fs_items: BriefingFsSel[];
  params: BriefingParams;
  assessment: BriefingAssessment;
  assessment_snapshots?: AssessmentScenarioSnapshot[];
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
