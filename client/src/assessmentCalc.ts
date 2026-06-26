import type {
  BriefingAssessment, BriefingFsSel, HeadcountCoeffs, OrgVolumeData,
  ProjectType, QueueOrgVolume, RisksC51C57,
} from './types';
import {
  FS_QUEUE_KEYS, type FsQueueKey, anyQueueEnabled, itemQueues,
} from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import {
  criteriaFlag, computeCriteriaSpAuto, ensureCriteriaGroups,
  ensureContractParams, computeAdvanceDeferralOk,
  CONTRACT_CRITERIA_DEFS,
  type SellerCriteria, type SellerCriteriaKey,
} from './sellerCriteria';

export interface ComputeRisksContext {
  projectTypeCode?: string | null;
  phaseRiskRatio?: number;
}

export { computeCriteriaSpAuto };
export type { SellerCriteria, SellerCriteriaKey };

export const HEADCOUNT_CATEGORIES = ['до 200', '201-500', '501-1000', '1001+'] as const;
export type HeadcountCategory = typeof HEADCOUNT_CATEGORIES[number];

const FUNC_TYPE_MAP: Record<string, string> = {
  'Кейс-проект': 'CASE',
  'Проф/мини': 'PROF_MINI',
  'ПРОФ-проект': 'PROF',
  'КОРП-проект': 'KORP',
  'Базовый': 'CASE',
  'Проф': 'PROF_MINI',
  'Экспертный': 'PROF',
};

export function headcountToCategory(n: number): HeadcountCategory {
  if (n <= 200) return 'до 200';
  if (n <= 500) return '201-500';
  if (n <= 1000) return '501-1000';
  return '1001+';
}

function spByFuncType(fsItems: BriefingFsSel[]): Record<string, number> {
  const totals: Record<string, number> = { CASE: 0, PROF_MINI: 0, PROF: 0, KORP: 0, NMD: 0 };
  for (const item of fsItems) {
    const queues = itemQueues(item);
    if (!anyQueueEnabled(queues)) continue;
    const sp = item.story_points ?? 0;
    const code = FUNC_TYPE_MAP[item.func_type ?? ''] ?? 'CASE';
    totals[code] = (totals[code] ?? 0) + sp;
    if (item.name?.toLowerCase().includes('нмд') || item.func_type?.includes('НМД')) {
      totals.NMD += sp;
    }
  }
  return totals;
}

export function clampOrgInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function parseOrgInt(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  return clampOrgInt(Number(trimmed));
}

/** Пустая строка → null; «0» — заполненное значение. */
export function parseOrgNullableInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return clampOrgInt(Number(trimmed));
}

/** Пусто только null/undefined; 0 — заполненное значение. */
export function isOrgVolumeFieldEmpty(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}

/** Заполнена, если оба поля РП/РПО и Исполн. заданы (те же правила, что и для красной подсветки). */
export function isQueueOrgFilled(row: QueueOrgVolume): boolean {
  if (!row.active) return false;
  return !isOrgVolumeFieldEmpty(row.rp_rpo) && !isOrgVolumeFieldEmpty(row.executors);
}

export function copyOrgQueueValues(
  source: QueueOrgVolume,
): Pick<QueueOrgVolume, 'users' | 'rp_rpo' | 'executors' | 'rg' | 'region'> {
  return {
    users: source.users,
    rp_rpo: source.rp_rpo,
    executors: source.executors,
    rg: source.rg,
    region: source.region,
  };
}

/** Польз. = РП/РПО + Исполн.; приоритет у заполненного РП/РПО. */
export function rebalanceOrgQueuePartners(
  users: number,
  rp_rpo: number | null,
  executors: number | null,
): Pick<QueueOrgVolume, 'rp_rpo' | 'executors'> {
  if (!isOrgVolumeFieldEmpty(rp_rpo)) {
    const rp = rp_rpo as number;
    return { rp_rpo: rp, executors: clampOrgInt(users - rp) };
  }
  if (!isOrgVolumeFieldEmpty(executors)) {
    const exec = executors as number;
    return { rp_rpo: clampOrgInt(users - exec), executors: exec };
  }
  return { rp_rpo, executors };
}

export type OrgQueueCascadeTrigger = 'users' | 'rp_rpo' | 'executors' | 'rg' | 'region';

function applyCascadeToTarget(
  source: QueueOrgVolume,
  target: QueueOrgVolume,
  trigger: OrgQueueCascadeTrigger,
): QueueOrgVolume {
  if (trigger === 'region') {
    return target.region === source.region ? target : { ...target, region: source.region };
  }
  if (trigger === 'rg') {
    return target.rg === source.rg ? target : { ...target, rg: source.rg };
  }

  const preserveUsers = trigger !== 'users' && target.users !== source.users;
  const users = preserveUsers ? target.users : source.users;
  const partners = rebalanceOrgQueuePartners(users, source.rp_rpo, source.executors);

  return {
    ...target,
    users,
    rp_rpo: partners.rp_rpo,
    executors: partners.executors,
    rg: source.rg,
    region: source.region,
  };
}

function orgQueueValuesEqual(a: QueueOrgVolume, b: QueueOrgVolume): boolean {
  return a.users === b.users
    && a.rp_rpo === b.rp_rpo
    && a.executors === b.executors
    && a.rg === b.rg
    && a.region === b.region;
}

export function getSubsequentActiveQueues(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
): FsQueueKey[] {
  const sourceIdx = FS_QUEUE_KEYS.indexOf(sourceKey);
  if (sourceIdx < 0) return [];
  return FS_QUEUE_KEYS.slice(sourceIdx + 1).filter(q => queues[q].active);
}

/** Польз./РГ/регион каскадируются на все последующие очереди; РП/Исполн. — только на активные. */
export function getSubsequentCascadeTargets(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  trigger: OrgQueueCascadeTrigger,
): FsQueueKey[] {
  const sourceIdx = FS_QUEUE_KEYS.indexOf(sourceKey);
  if (sourceIdx < 0) return [];
  const subsequent = FS_QUEUE_KEYS.slice(sourceIdx + 1);
  if (trigger === 'users' || trigger === 'rg' || trigger === 'region') return subsequent;
  return subsequent.filter(q => queues[q].active);
}

export interface OrgQueueCascadeResult {
  queues: Record<FsQueueKey, QueueOrgVolume>;
  emptyTargets: FsQueueKey[];
  filledTargets: FsQueueKey[];
  changed: boolean;
}

/** Каскад значений org volume на последующие активные очереди. */
export function applyOrgQueueCascade(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  overwriteFilled: boolean,
  trigger: OrgQueueCascadeTrigger = 'rp_rpo',
): OrgQueueCascadeResult {
  const source = queues[sourceKey];
  const emptyTargets: FsQueueKey[] = [];
  const filledTargets: FsQueueKey[] = [];
  let nextQueues = { ...queues };
  let changed = false;

  for (const q of getSubsequentCascadeTargets(queues, sourceKey, trigger)) {
    const row = queues[q];
    if (isQueueOrgFilled(row)) {
      filledTargets.push(q);
      if (!overwriteFilled) continue;
    } else {
      emptyTargets.push(q);
    }
    const nextRow = applyCascadeToTarget(source, row, trigger);
    if (!orgQueueValuesEqual(row, nextRow)) changed = true;
    nextQueues = { ...nextQueues, [q]: nextRow };
  }

  return { queues: nextQueues, emptyTargets, filledTargets, changed };
}

export function buildOrgQueueCascadeConfirmMessage(
  sourceKey: FsQueueKey,
  filledTargets: FsQueueKey[],
  labels: Record<FsQueueKey, string>,
): string {
  const sourceLabel = labels[sourceKey];
  const targetLabels = filledTargets.map(q => `«${labels[q]}»`).join(', ');
  if (filledTargets.length === 1) {
    return `Очередь ${targetLabels} уже заполнена. Применить значения из «${sourceLabel}»?`;
  }
  return `Очереди ${targetLabels} уже заполнены. Применить значения из «${sourceLabel}»?`;
}

/** Польз. = РП/РПО + Исполн.; при редактировании Польз. пересчитывается парное поле. */
export function applyOrgQueueFieldPatch(
  row: QueueOrgVolume,
  field: 'users' | 'rp_rpo' | 'executors' | 'rg',
  rawValue: string | number,
): QueueOrgVolume {
  const str = typeof rawValue === 'string' ? rawValue : String(rawValue);
  if (field === 'users') {
    const value = parseOrgInt(str);
    const partners = rebalanceOrgQueuePartners(value, row.rp_rpo, row.executors);
    return { ...row, users: value, ...partners };
  }
  if (field === 'rp_rpo') {
    const value = parseOrgNullableInt(str);
    if (value === null) {
      return { ...row, rp_rpo: null };
    }
    return { ...row, rp_rpo: value, executors: clampOrgInt(row.users - value) };
  }
  if (field === 'executors') {
    const value = parseOrgNullableInt(str);
    if (value === null) {
      return { ...row, executors: null };
    }
    return { ...row, executors: value, rp_rpo: clampOrgInt(row.users - value) };
  }
  const value = parseOrgInt(str);
  return { ...row, rg: value };
}

function defaultQueueVolume(headcount: number, active: boolean): QueueOrgVolume {
  const users = headcount > 0 ? headcount : 30;
  return {
    users,
    rp_rpo: null,
    executors: null,
    rg: Math.max(1, Math.ceil(users * 0.05)),
    region: 'СПб/МСК',
    active,
  };
}

export function computeOrgVolume(
  headcount: number | null,
  fsItems: BriefingFsSel[],
  stored: Partial<OrgVolumeData>,
): OrgVolumeData {
  const hc = headcount ?? 30;
  const activeQueues = new Set<FsQueueKey>();
  for (const item of fsItems) {
    const queues = itemQueues(item);
    for (const q of FS_QUEUE_KEYS) {
      if (queues[q] === 1) activeQueues.add(q);
    }
  }
  if (activeQueues.size === 0) activeQueues.add('1');

  const queues = {} as Record<FsQueueKey, QueueOrgVolume>;
  for (const q of FS_QUEUE_KEYS) {
    const active = activeQueues.has(q);
    const storedQ = stored.queues?.[q];
    const base = defaultQueueVolume(hc, active);
    queues[q] = storedQ ? { ...base, ...storedQ, active } : base;
  }

  const maxUsers = Math.max(hc, ...FS_QUEUE_KEYS.map(q => queues[q].users));
  return { queues, headcount_category: headcountToCategory(maxUsers) };
}

export function computeAutoProjectType(
  headcount: number | null,
  fsItems: BriefingFsSel[],
  criteria: SellerCriteria,
  projectTypes: ProjectType[],
): ProjectType | null {
  const hc = headcount ?? 0;
  const sp = spByFuncType(fsItems);
  const orgAuto = computeOrgVolume(headcount, fsItems, {});

  const users = Math.max(
    hc,
    ...FS_QUEUE_KEYS.map(q => orgAuto.queues[q].users),
  );
  const rpRpo = Math.max(...FS_QUEUE_KEYS.map(q => orgAuto.queues[q].rp_rpo ?? 0));

  const isKorp =
    sp.KORP > 0
    || hc >= 1001
    || criteriaFlag(criteria, 'gost_customer_tech')
    || users > 500
    || criteriaFlag(criteria, 'methodology')
    || sp.NMD > 0
    || criteriaFlag(criteria, 'bp_optimization')
    || criteriaFlag(criteria, 'ib_requirements');

  const isProf =
    sp.PROF > 0
    || criteriaFlag(criteria, 'non_standard_docs')
    || criteriaFlag(criteria, 'bp_description')
    || users > 200
    || rpRpo > 20
    || criteriaFlag(criteria, 'load_testing');

  let code = 'CASE';
  if (isKorp) code = 'KORP';
  else if (isProf) code = 'PROF';
  else if (sp.PROF_MINI > 0) code = 'PROF_MINI';

  return projectTypes.find(pt => pt.code === code && pt.is_active !== 0) ?? null;
}

export function computeRisks(criteria: SellerCriteria, ctx: ComputeRisksContext = {}): RisksC51C57 {
  const params = ensureContractParams(criteria.contract_params);
  const phaseRatio = ctx.phaseRiskRatio ?? 1;

  const c52 = 0.2;
  const c56 = 0.01;
  const c57 = 0.2;

  let c54 = 0;
  if (!criteriaFlag(criteria, 'confidential_stamped_only')) c54 += 0.10;
  if (!criteriaFlag(criteria, 'liability_cap_10pct')) c54 += 0.05;
  if (!criteriaFlag(criteria, 'sok_liability_cap_10pct')) c54 += 0.20;

  let c55 = 0;
  if (!criteriaFlag(criteria, 'rid_holder_executor')) {
    const base = params.pm_version === 'PM5' ? 0.50 : 0.15;
    c55 += base * phaseRatio;
  }
  if (!criteriaFlag(criteria, 'review_signoff')) c55 += 0.10;

  if (!computeAdvanceDeferralOk(params)) {
    const code = ctx.projectTypeCode ?? '';
    const isProfOrKorp = code === 'PROF' || code === 'KORP';
    if (isProfOrKorp && params.advance_pct < 0.30 && params.payment_deferral_days <= 10) {
      const e55 = params.max_stage_duration_days ?? 100;
      c55 += 0.02 * (e55 / 20);
    } else {
      c55 += 0.10;
    }
  }

  const c53 = Math.max(c52 + c54, c56 + c57);

  return {
    c52_rpo: c52,
    c53_company_fund: c53,
    c54_contract_rpo: c54,
    c55_contract_fund: c55,
    c56_sales_comp: c56,
    c57_rk: c57,
  };
}

/** C51 = SUM(C52:C57) — итог резервов и рисков (C53 уже MAX-подитог). */
export function computeRisksTotalC51(risks: RisksC51C57): number {
  return risks.c52_rpo
    + risks.c53_company_fund
    + risks.c54_contract_rpo
    + risks.c55_contract_fund
    + risks.c56_sales_comp
    + risks.c57_rk;
}

export function mergeEffectiveRisks(
  autoRisks: RisksC51C57,
  storedRisks: Partial<RisksC51C57>,
  risksManual: boolean,
): RisksC51C57 {
  const c52 = risksManual && storedRisks.c52_rpo != null ? storedRisks.c52_rpo : autoRisks.c52_rpo;
  const c56 = risksManual && storedRisks.c56_sales_comp != null
    ? storedRisks.c56_sales_comp
    : autoRisks.c56_sales_comp;
  const c57 = risksManual && storedRisks.c57_rk != null ? storedRisks.c57_rk : autoRisks.c57_rk;
  const c54 = autoRisks.c54_contract_rpo;
  const c55 = autoRisks.c55_contract_fund;
  const c53 = Math.max(c52 + c54, c56 + c57);
  return {
    c52_rpo: c52,
    c53_company_fund: c53,
    c54_contract_rpo: c54,
    c55_contract_fund: c55,
    c56_sales_comp: c56,
    c57_rk: c57,
  };
}

function resolveProjectTypeId(typeId: number | null, projectTypes: ProjectType[]): number | null {
  if (!typeId) return null;
  const row = projectTypes.find(pt => pt.id === typeId);
  if (!row) return null;
  return row.base_type_id ?? row.id;
}

export function getHourlyRateForType(
  nsi: AssessmentNsiCache,
  typeId: number | null,
): number {
  const resolved = resolveProjectTypeId(typeId, nsi.projectTypes);
  if (!resolved) return 5000;
  return nsi.ratesByTypeId.get(resolved) ?? 5000;
}

export function getHeadcountCoeffs(
  nsi: AssessmentNsiCache,
  typeId: number | null,
  category: string,
): HeadcountCoeffs {
  const defaults: HeadcountCoeffs = { c62: category, c63: 1, c64: 1, c67: 6, c68: 1 };
  const resolved = resolveProjectTypeId(typeId, nsi.projectTypes);
  if (!resolved) return defaults;

  const byCat = nsi.coeffsByTypeId.get(resolved);
  const row = byCat?.get(category);
  if (!row) return defaults;
  return { c62: category, c63: row.c63, c64: row.c64, c67: row.c67, c68: row.c68 };
}

export interface AssessmentContext {
  headcount: number | null;
  fs_items: BriefingFsSel[];
}

export function applyAssessmentPatch(
  assessment: BriefingAssessment,
  patch: Record<string, unknown>,
): BriefingAssessment {
  const next = { ...assessment, ...patch } as BriefingAssessment;

  if (patch.reset_project_type) {
    next.project_type_manual = false;
    next.project_type_id = null;
  }
  if (patch.reset_risks) {
    next.risks_manual = false;
  }
  if (patch.reset_org_volume) {
    next.org_volume_manual = false;
  }
  if (patch.reset_headcount) {
    next.headcount_manual = false;
  }

  if (patch.criteria && typeof patch.criteria === 'object') {
    const incoming = patch.criteria as SellerCriteria;
    const prevGroups = ensureCriteriaGroups(assessment.criteria);
    let mergedGroups = prevGroups;
    if (incoming.groups) {
      mergedGroups = { ...prevGroups };
      for (const [gk, gv] of Object.entries(incoming.groups)) {
        const prev = prevGroups[gk];
        if (!prev) {
          mergedGroups[gk] = gv;
          continue;
        }
        mergedGroups[gk] = {
          ...prev,
          ...gv,
          children: { ...prev.children, ...(gv.children ?? {}) },
          custom_rows: gv.custom_rows ?? prev.custom_rows,
        };
      }
    }
    next.criteria = {
      ...assessment.criteria,
      ...incoming,
      groups: mergedGroups,
    };
    for (const def of CONTRACT_CRITERIA_DEFS) {
      if (incoming[def.key] !== undefined) next.criteria[def.key] = incoming[def.key];
    }
    if (incoming.contract_params) {
      next.criteria.contract_params = ensureContractParams({
        ...ensureContractParams(assessment.criteria.contract_params),
        ...incoming.contract_params,
      });
    }
  }
  if (patch.org_volume && typeof patch.org_volume === 'object') {
    const incoming = patch.org_volume as Partial<OrgVolumeData>;
    next.org_volume = {
      ...assessment.org_volume,
      ...incoming,
      queues: incoming.queues
        ? { ...assessment.org_volume.queues, ...incoming.queues }
        : assessment.org_volume.queues,
    };
  }
  if (patch.risks && typeof patch.risks === 'object') {
    next.risks = { ...assessment.risks, ...(patch.risks as RisksC51C57) };
  }
  if (patch.headcount_coeffs && typeof patch.headcount_coeffs === 'object') {
    next.headcount_coeffs = {
      ...assessment.headcount_coeffs,
      ...(patch.headcount_coeffs as HeadcountCoeffs),
    };
  }

  return next;
}

export function recomputeAssessmentDerived(
  assessment: BriefingAssessment,
  context: AssessmentContext,
  nsi: AssessmentNsiCache,
): BriefingAssessment {
  const projectTypes = nsi.projectTypes.length > 0 ? nsi.projectTypes : assessment.project_types;
  const criteria = assessment.criteria;

  const autoOrg = computeOrgVolume(
    context.headcount,
    context.fs_items,
    assessment.org_volume_manual ? assessment.org_volume : {},
  );
  const autoType = computeAutoProjectType(
    context.headcount,
    context.fs_items,
    criteria,
    projectTypes,
  );

  const effectiveTypeId = assessment.project_type_manual && assessment.project_type_id
    ? assessment.project_type_id
    : autoType?.id ?? assessment.project_type_id ?? autoType?.id ?? null;

  const typeCode = projectTypes.find(pt => pt.id === effectiveTypeId)?.code ?? null;
  const autoRisks = computeRisks(criteria, { projectTypeCode: typeCode });

  const effectiveRisks = mergeEffectiveRisks(
    autoRisks,
    assessment.risks,
    assessment.risks_manual,
  );

  const effectiveOrg: OrgVolumeData = assessment.org_volume_manual && assessment.org_volume.queues
    ? {
        ...autoOrg,
        ...assessment.org_volume,
        queues: { ...autoOrg.queues, ...assessment.org_volume.queues },
      }
    : autoOrg;

  const category = assessment.headcount_manual && assessment.headcount_category
    ? assessment.headcount_category
    : effectiveOrg.headcount_category;

  const autoCoeffs = getHeadcountCoeffs(nsi, effectiveTypeId, category);
  const effectiveCoeffs = assessment.headcount_manual
    ? { ...autoCoeffs, ...assessment.headcount_coeffs, c62: category }
    : { ...autoCoeffs, c62: category };

  const autoCoeffsDisplay = getHeadcountCoeffs(
    nsi,
    effectiveTypeId,
    effectiveOrg.headcount_category,
  );

  const groups = ensureCriteriaGroups(criteria);
  const autoCriteriaSp = computeCriteriaSpAuto(criteria.content_selections, groups);

  const nsiRate = getHourlyRateForType(nsi, effectiveTypeId);

  return {
    ...assessment,
    project_types: projectTypes,
    auto_risks: autoRisks,
    risks: effectiveRisks,
    auto_project_type: autoType,
    auto_project_type_id: autoType?.id ?? null,
    project_type_id: effectiveTypeId,
    org_volume: effectiveOrg,
    auto_org_volume: autoOrg,
    headcount_category: category,
    headcount_coeffs: effectiveCoeffs,
    auto_headcount_coeffs: autoCoeffsDisplay,
    auto_criteria_sp: autoCriteriaSp,
    nsi_hourly_rate: nsiRate,
  };
}
