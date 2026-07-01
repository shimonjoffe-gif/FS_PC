import type {
  BriefingAssessment, BriefingFsSel, HeadcountCoeffs, OrgVolumeData,
  OrgVolumeBreakdownRow,
  ProjectType, QueueOrgVolume, RisksC51C57, RisksManualKeys, PhaseCalcState,
  AssessmentScenario,
} from './types';
import { mergePhaseCalcParams, type PhaseCalcParams } from './phaseCalcParams';
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
    if (isFsItemNmd(item)) {
      totals.NMD += sp;
    }
  }
  return totals;
}

/** Пункт ФС с требованием НМД (эвристика до появления явного флага в каталоге). */
export function isFsItemNmd(item: BriefingFsSel): boolean {
  return item.name?.toLowerCase().includes('нмд') === true
    || (item.func_type?.includes('НМД') ?? false);
}

/** Пункт ФС из раздела интеграций (группа/фаза каталога). */
export function isFsItemIntegration(item: BriefingFsSel): boolean {
  const hay = `${item.group_name ?? ''} ${item.phase ?? ''}`.toLowerCase();
  return hay.includes('интегр');
}

export interface QueueSpTotals {
  /** Excel C20 — функциональный SP по очереди (без интеграций и НМД) */
  functional_sp: Record<FsQueueKey, number>;
  /** Авто-оценка C21 из ФС (сумма SP пунктов интеграций) */
  integrations_sp_auto: Record<FsQueueKey, number>;
  /** Авто-оценка D20 из ФС (сумма SP пунктов с НМД) */
  nmd_sp_auto: Record<FsQueueKey, number>;
  /** Сумма C20 по всем очередям (уникальные пункты, без интеграций и НМД) */
  all_queues: number;
}

export function computeQueueSpFromFs(items: BriefingFsSel[]): QueueSpTotals {
  const functional_sp = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as Record<FsQueueKey, number>;
  const integrations_sp_auto = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as Record<FsQueueKey, number>;
  const nmd_sp_auto = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as Record<FsQueueKey, number>;
  let all_queues = 0;
  for (const item of items) {
    const queues = itemQueues(item);
    const sp = item.story_points ?? 0;
    const anyOn = anyQueueEnabled(queues);
    if (!anyOn) continue;
    const isNmd = isFsItemNmd(item);
    const isIntegration = isFsItemIntegration(item);
    const isFunctional = !isNmd && !isIntegration;
    if (isFunctional) all_queues += sp;
    for (const q of FS_QUEUE_KEYS) {
      if (queues[q] !== 1) continue;
      if (isFunctional) functional_sp[q] += sp;
      if (isIntegration) integrations_sp_auto[q] += sp;
      if (isNmd) nmd_sp_auto[q] += sp;
    }
  }
  return { functional_sp, integrations_sp_auto, nmd_sp_auto, all_queues };
}

// TODO: from FS import — dev defaults until columns are filled from FS and locked
export const DEV_TEST_FUNCTIONAL_SP: Record<FsQueueKey, number> = {
  '1': 16, '2': 12, '3': 8, '4': 0,
};
export const DEV_TEST_INTEGRATIONS_SP: Record<FsQueueKey, number> = {
  '1': 3, '2': 2, '3': 1, '4': 0,
};
export const DEV_TEST_NMD_SP: Record<FsQueueKey, number> = {
  '1': 2, '2': 1, '3': 0, '4': 0,
};

export function isQueueSpUnset(value: number | null | undefined): boolean {
  return value == null || value === 0;
}

/** Excel C20 — effective SP функционала (stored, FS auto, or dev default). */
export function effectiveFunctionalSp(
  q: FsQueueKey,
  stored: number | null | undefined,
  fsAuto = 0,
): number {
  if (!isQueueSpUnset(stored)) return stored as number;
  if (fsAuto > 0) return fsAuto;
  return DEV_TEST_FUNCTIONAL_SP[q];
}

/** Excel C21 — effective SP интеграций (stored, FS auto, or dev default). */
export function effectiveIntegrationsSp(
  q: FsQueueKey,
  stored: number | null | undefined,
  fsAuto = 0,
): number {
  if (!isQueueSpUnset(stored)) return stored as number;
  if (fsAuto > 0) return fsAuto;
  return DEV_TEST_INTEGRATIONS_SP[q];
}

/** Excel D20 — effective SP НМД (stored, FS auto, or dev default). */
export function effectiveNmdSp(
  q: FsQueueKey,
  stored: number | null | undefined,
  nmdAuto = 0,
): number {
  if (!isQueueSpUnset(stored)) return stored as number;
  if (nmdAuto > 0) return nmdAuto;
  return DEV_TEST_NMD_SP[q];
}

/** Excel E20 — авто: IF(очередь активна, ROUNDUP(C20/5, 0), 0). */
export function autoLoadTestScenarios(active: boolean, functionalSp: number): number {
  if (!active || functionalSp <= 0) return 0;
  return Math.ceil(functionalSp / 5);
}

/** Excel E20 — effective сценарии (stored или авто от C20). */
export function effectiveLoadTestScenarios(
  active: boolean,
  stored: number | null | undefined,
  functionalSpEffective: number,
): number {
  if (!isQueueSpUnset(stored)) return stored as number;
  return autoLoadTestScenarios(active, functionalSpEffective);
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

export function newOrgBreakdownRowId(): string {
  return `ob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const ORG_BREAKDOWN_NUMERIC_FIELDS = ['users', 'rp_rpo', 'executors', 'rg'] as const;

export function defaultOrgBreakdownRow(label = ''): OrgVolumeBreakdownRow {
  return {
    id: newOrgBreakdownRowId(),
    label,
    users: null,
    rp_rpo: null,
    executors: null,
    rg: null,
    rg_regions: null,
    branches: [],
  };
}

export type OrgBreakdownField = typeof ORG_BREAKDOWN_NUMERIC_FIELDS[number];

/** Эффективное значение колонки: сумма филиалов, если они есть. */
export function effectiveBreakdownField(
  row: OrgVolumeBreakdownRow,
  field: OrgBreakdownField,
): number | null {
  if (row.branches && row.branches.length > 0) {
    const childVals = row.branches.map(b => effectiveBreakdownField(b, field));
    if (childVals.every(v => v === null || v === undefined)) return null;
    return childVals.reduce<number>((acc, v) => acc + (v ?? 0), 0);
  }
  return row[field] ?? null;
}

/** Эффективное число пользователей: сумма филиалов, если они есть. */
export function effectiveBreakdownRow(row: OrgVolumeBreakdownRow): number | null {
  return effectiveBreakdownField(row, 'users');
}

export function hasQueueBreakdown(row: QueueOrgVolume): boolean {
  return (row.breakdown?.length ?? 0) > 0;
}

/** Патч числового поля breakdown-строки (users/rp/executors — те же правила, что у очереди). */
export function applyBreakdownFieldPatch(
  row: OrgVolumeBreakdownRow,
  field: OrgBreakdownField,
  rawValue: string | number,
): OrgVolumeBreakdownRow {
  const str = typeof rawValue === 'string' ? rawValue : String(rawValue);
  if (field === 'users') {
    const value = parseOrgNullableInt(str);
    if (value === null) {
      return { ...row, users: null };
    }
    const partners = rebalanceOrgQueuePartners(value, row.rp_rpo ?? null, row.executors ?? null);
    return { ...row, users: value, ...partners };
  }
  if (field === 'rp_rpo') {
    const value = parseOrgNullableInt(str);
    if (value === null) {
      return { ...row, rp_rpo: null };
    }
    if (!isOrgVolumeFieldEmpty(row.users)) {
      return { ...row, rp_rpo: value, executors: clampOrgInt((row.users as number) - value) };
    }
    return { ...row, rp_rpo: value };
  }
  if (field === 'executors') {
    const value = parseOrgNullableInt(str);
    if (value === null) {
      return { ...row, executors: null };
    }
    if (!isOrgVolumeFieldEmpty(row.users)) {
      return { ...row, executors: value, rp_rpo: clampOrgInt((row.users as number) - value) };
    }
    return { ...row, executors: value };
  }
  const parsed = parseOrgNullableInt(str);
  return { ...row, [field]: parsed };
}

function breakdownRowValuesEqual(a: OrgVolumeBreakdownRow, b: OrgVolumeBreakdownRow): boolean {
  if (a.label !== b.label) return false;
  return ORG_BREAKDOWN_NUMERIC_FIELDS.every(f => (a[f] ?? null) === (b[f] ?? null));
}

function mapBreakdownRows(
  rows: OrgVolumeBreakdownRow[],
  regionId: string,
  mapper: (row: OrgVolumeBreakdownRow) => OrgVolumeBreakdownRow,
): OrgVolumeBreakdownRow[] {
  return rows.map(r => {
    if (r.id !== regionId) return r;
    return mapper(r);
  });
}

function mapBreakdownBranches(
  rows: OrgVolumeBreakdownRow[],
  regionId: string,
  branchId: string,
  mapper: (branch: OrgVolumeBreakdownRow) => OrgVolumeBreakdownRow,
): OrgVolumeBreakdownRow[] {
  return mapBreakdownRows(rows, regionId, region => ({
    ...region,
    branches: (region.branches ?? []).map(b => (b.id === branchId ? mapper(b) : b)),
  }));
}

export function patchQueueBreakdownRegion(
  queue: QueueOrgVolume,
  regionId: string,
  patch: Partial<OrgVolumeBreakdownRow>,
): QueueOrgVolume {
  const breakdown = (queue.breakdown ?? []).map(r =>
    r.id === regionId ? { ...r, ...patch } : r,
  );
  return { ...queue, breakdown };
}

export function patchQueueBreakdownRegionField(
  queue: QueueOrgVolume,
  regionId: string,
  field: OrgBreakdownField | 'label',
  value: string | number,
): QueueOrgVolume {
  const breakdown = (queue.breakdown ?? []).map(r => {
    if (r.id !== regionId) return r;
    if (field === 'label') return { ...r, label: String(value) };
    return applyBreakdownFieldPatch(r, field, value);
  });
  return { ...queue, breakdown };
}

export function patchQueueBreakdownBranchField(
  queue: QueueOrgVolume,
  regionId: string,
  branchId: string,
  field: OrgBreakdownField | 'label',
  value: string | number,
): QueueOrgVolume {
  const breakdown = mapBreakdownBranches(queue.breakdown ?? [], regionId, branchId, branch => {
    if (field === 'label') return { ...branch, label: String(value) };
    return applyBreakdownFieldPatch(branch, field, value);
  });
  return { ...queue, breakdown };
}

export function addQueueBreakdownRegion(queue: QueueOrgVolume, label = ''): QueueOrgVolume {
  const breakdown = queue.breakdown ?? [];
  return {
    ...queue,
    breakdown: [...breakdown, defaultOrgBreakdownRow(label)],
  };
}

export function removeQueueBreakdownRegion(queue: QueueOrgVolume, regionId: string): QueueOrgVolume {
  const breakdown = (queue.breakdown ?? []).filter(r => r.id !== regionId);
  return { ...queue, breakdown };
}

export function addQueueBreakdownBranch(
  queue: QueueOrgVolume,
  regionId: string,
  label = '',
): QueueOrgVolume {
  const breakdown = mapBreakdownRows(queue.breakdown ?? [], regionId, region => ({
    ...region,
    branches: [...(region.branches ?? []), defaultOrgBreakdownRow(label)],
  }));
  return { ...queue, breakdown };
}

export function removeQueueBreakdownBranch(
  queue: QueueOrgVolume,
  regionId: string,
  branchId: string,
): QueueOrgVolume {
  const breakdown = mapBreakdownRows(queue.breakdown ?? [], regionId, region => ({
    ...region,
    branches: (region.branches ?? []).filter(b => b.id !== branchId),
  }));
  return { ...queue, breakdown };
}

export interface BreakdownCommitResult {
  queue: QueueOrgVolume;
  partialChanged: boolean;
}

export function commitQueueBreakdownRegionField(
  queue: QueueOrgVolume,
  regionId: string,
  field: OrgBreakdownField | 'label',
  rawValue: string,
): BreakdownCommitResult {
  const breakdown = queue.breakdown ?? [];
  const idx = breakdown.findIndex(r => r.id === regionId);
  if (idx < 0) return { queue, partialChanged: false };

  const row = breakdown[idx];
  const nextRow = field === 'label'
    ? { ...row, label: rawValue }
    : applyBreakdownFieldPatch(row, field, rawValue);
  const nextBreakdown = [...breakdown];
  nextBreakdown[idx] = nextRow;

  return {
    queue: { ...queue, breakdown: nextBreakdown },
    partialChanged: !breakdownRowValuesEqual(row, nextRow),
  };
}

export function commitQueueBreakdownBranchField(
  queue: QueueOrgVolume,
  regionId: string,
  branchId: string,
  field: OrgBreakdownField | 'label',
  rawValue: string,
): BreakdownCommitResult {
  const region = (queue.breakdown ?? []).find(r => r.id === regionId);
  if (!region) return { queue, partialChanged: false };
  const branches = region.branches ?? [];
  const idx = branches.findIndex(b => b.id === branchId);
  if (idx < 0) return { queue, partialChanged: false };

  const row = branches[idx];
  const nextRow = field === 'label'
    ? { ...row, label: rawValue }
    : applyBreakdownFieldPatch(row, field, rawValue);
  const nextBranches = [...branches];
  nextBranches[idx] = nextRow;

  const breakdown = mapBreakdownRows(queue.breakdown ?? [], regionId, r => ({
    ...r,
    branches: nextBranches,
  }));
  return {
    queue: { ...queue, breakdown },
    partialChanged: !breakdownRowValuesEqual(row, nextRow),
  };
}

/** Заполнена, если оба поля РП/РПО и Исполн. заданы (как у очереди). */
export function isBreakdownRowFilled(row: OrgVolumeBreakdownRow): boolean {
  return !isOrgVolumeFieldEmpty(row.rp_rpo) && !isOrgVolumeFieldEmpty(row.executors);
}

function findBreakdownRegionByMatch(
  breakdown: OrgVolumeBreakdownRow[],
  source: OrgVolumeBreakdownRow,
  queueRegion = '',
): OrgVolumeBreakdownRow | undefined {
  const byId = breakdown.find(r => r.id === source.id);
  if (byId) return byId;
  return breakdown.find(r =>
    r.label.trim() !== ''
    && r.label === source.label
    && !isBreakdownPlaceholderRow(r, queueRegion),
  );
}

function withoutBreakdownPlaceholders(
  breakdown: OrgVolumeBreakdownRow[],
  queueRegion: string,
): OrgVolumeBreakdownRow[] {
  return breakdown.filter(r => !isBreakdownPlaceholderRow(r, queueRegion));
}

function findBreakdownBranchByMatch(
  branches: OrgVolumeBreakdownRow[],
  source: OrgVolumeBreakdownRow,
): OrgVolumeBreakdownRow | undefined {
  return branches.find(b => b.id === source.id)
    ?? branches.find(b => b.label.trim() !== '' && b.label === source.label);
}

function copyBreakdownRowStructure(source: OrgVolumeBreakdownRow): OrgVolumeBreakdownRow {
  return {
    id: source.id,
    label: source.label,
    users: null,
    rp_rpo: null,
    executors: null,
    rg: null,
    rg_regions: null,
    branches: (source.branches ?? []).map(b => copyBreakdownRowStructure(b)),
  };
}

function copyBreakdownRowFromSource(source: OrgVolumeBreakdownRow): OrgVolumeBreakdownRow {
  return {
    id: source.id,
    label: source.label,
    users: source.users,
    rp_rpo: source.rp_rpo,
    executors: source.executors,
    rg: source.rg,
    rg_regions: source.rg_regions,
    branches: (source.branches ?? []).map(b => copyBreakdownRowFromSource(b)),
  };
}

/** Пустой placeholder: дефолтное имя очереди, без значений и филиалов. */
function isBreakdownPlaceholderRow(
  row: OrgVolumeBreakdownRow,
  queueRegion: string,
): boolean {
  if ((row.branches?.length ?? 0) > 0) return false;
  const valuesEmpty = ORG_BREAKDOWN_NUMERIC_FIELDS.every(f => isOrgVolumeFieldEmpty(row[f]));
  const labelEmptyOrDefault = row.label === '' || row.label === queueRegion;
  return valuesEmpty && labelEmptyOrDefault;
}

function applyBreakdownCascadeToRow(
  source: OrgVolumeBreakdownRow,
  target: OrgVolumeBreakdownRow,
  trigger: OrgBreakdownField | 'label',
): OrgVolumeBreakdownRow {
  if (trigger === 'label') {
    return target.label === source.label ? target : { ...target, label: source.label };
  }
  if (trigger === 'rg') {
    return target.rg === source.rg ? target : { ...target, rg: source.rg };
  }

  if (!isBreakdownRowFilled(target)) {
    return {
      ...target,
      label: source.label,
      users: source.users,
      rp_rpo: source.rp_rpo,
      executors: source.executors,
      rg: source.rg,
      rg_regions: source.rg_regions,
    };
  }

  const preserveUsers = trigger !== 'users'
    && !isOrgVolumeFieldEmpty(target.users)
    && target.users !== source.users;
  const users = preserveUsers ? target.users : source.users;
  const partners = rebalanceOrgQueuePartners(
    users ?? 0,
    source.rp_rpo ?? null,
    source.executors ?? null,
  );

  return {
    ...target,
    users,
    rp_rpo: partners.rp_rpo,
    executors: partners.executors,
    rg: source.rg,
  };
}

function breakdownRowHasConflictingData(
  source: OrgVolumeBreakdownRow,
  target: OrgVolumeBreakdownRow,
): boolean {
  if (!isBreakdownRowFilled(target)) return false;
  return !breakdownRowValuesEqual(source, target);
}

function ensureBreakdownRegion(
  breakdown: OrgVolumeBreakdownRow[],
  sourceRegion: OrgVolumeBreakdownRow,
  queueRegion = '',
  opts?: { copyValuesOnPlaceholderReplace?: boolean },
): { breakdown: OrgVolumeBreakdownRow[]; region: OrgVolumeBreakdownRow; added: boolean } {
  const existing = findBreakdownRegionByMatch(breakdown, sourceRegion, queueRegion);
  if (existing) return { breakdown, region: existing, added: false };

  const realRows = withoutBreakdownPlaceholders(breakdown, queueRegion);
  const hadPlaceholders = realRows.length < breakdown.length;
  const newRegion = opts?.copyValuesOnPlaceholderReplace && hadPlaceholders
    ? copyBreakdownRowFromSource(sourceRegion)
    : copyBreakdownRowStructure(sourceRegion);
  return { breakdown: [...realRows, newRegion], region: newRegion, added: true };
}

function ensureBreakdownBranch(
  region: OrgVolumeBreakdownRow,
  sourceBranch: OrgVolumeBreakdownRow,
): { region: OrgVolumeBreakdownRow; branch: OrgVolumeBreakdownRow; added: boolean } {
  const branches = region.branches ?? [];
  const existing = findBreakdownBranchByMatch(branches, sourceBranch);
  if (existing) return { region, branch: existing, added: false };
  const newBranch = copyBreakdownRowStructure(sourceBranch);
  return {
    region: { ...region, branches: [...branches, newBranch] },
    branch: newBranch,
    added: true,
  };
}


export type OrgBreakdownCascadeTrigger = OrgBreakdownField | 'label';

/** Breakdown каскадирует все числовые поля на все последующие очереди (включая неактивные). */
function getBreakdownCascadeTargets(
  _queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  _trigger: OrgBreakdownCascadeTrigger,
): FsQueueKey[] {
  const sourceIdx = FS_QUEUE_KEYS.indexOf(sourceKey);
  if (sourceIdx < 0) return [];
  return FS_QUEUE_KEYS.slice(sourceIdx + 1);
}

/** Каскад значений breakdown-строки на последующие очереди (по id, затем по label). */
export function applyOrgBreakdownCascade(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  regionId: string,
  branchId: string | null,
  overwriteFilled: boolean,
  trigger: OrgBreakdownCascadeTrigger = 'rp_rpo',
): OrgQueueCascadeResult {
  const sourceQueue = queues[sourceKey];
  const sourceRegion = (sourceQueue.breakdown ?? []).find(r => r.id === regionId);
  if (!sourceRegion) {
    return { queues, emptyTargets: [], filledTargets: [], changed: false };
  }

  let sourceRow: OrgVolumeBreakdownRow;
  let sourceBranch: OrgVolumeBreakdownRow | null = null;
  if (branchId) {
    sourceBranch = (sourceRegion.branches ?? []).find(b => b.id === branchId) ?? null;
    if (!sourceBranch) {
      return { queues, emptyTargets: [], filledTargets: [], changed: false };
    }
    sourceRow = sourceBranch;
  } else {
    sourceRow = sourceRegion;
  }

  const emptyTargets: FsQueueKey[] = [];
  const filledTargets: FsQueueKey[] = [];
  let nextQueues = { ...queues };
  let changed = false;

  for (const q of getBreakdownCascadeTargets(queues, sourceKey, trigger)) {
    const targetQueue = nextQueues[q];
    let targetBreakdown = targetQueue.breakdown ?? [];

    const ensuredRegion = ensureBreakdownRegion(
      targetBreakdown,
      sourceRegion,
      targetQueue.region,
      { copyValuesOnPlaceholderReplace: true },
    );
    targetBreakdown = ensuredRegion.breakdown;
    let targetRegion = ensuredRegion.region;
    let structureAdded = ensuredRegion.added;

    let targetRow: OrgVolumeBreakdownRow;
    if (branchId && sourceBranch) {
      const ensuredBranch = ensureBreakdownBranch(targetRegion, sourceBranch);
      targetRegion = ensuredBranch.region;
      targetRow = ensuredBranch.branch;
      structureAdded = structureAdded || ensuredBranch.added;
      targetBreakdown = targetBreakdown.map(r => (r.id === targetRegion.id ? targetRegion : r));
    } else {
      targetRow = targetRegion;
    }

    const hasConflict = breakdownRowHasConflictingData(sourceRow, targetRow);
    if (hasConflict) {
      filledTargets.push(q);
      if (!overwriteFilled) {
        if (structureAdded) {
          nextQueues = { ...nextQueues, [q]: { ...targetQueue, breakdown: targetBreakdown } };
          changed = true;
        }
        continue;
      }
    } else if (!isBreakdownRowFilled(targetRow)) {
      emptyTargets.push(q);
    }

    const nextRow = applyBreakdownCascadeToRow(sourceRow, targetRow, trigger);
    const rowChanged = !breakdownRowValuesEqual(targetRow, nextRow);
    if (!rowChanged && !structureAdded) continue;

    const finalRegion = branchId
      ? {
          ...targetRegion,
          branches: (targetRegion.branches ?? []).map(b => (b.id === targetRow.id ? nextRow : b)),
        }
      : nextRow;
    const finalBreakdown = targetBreakdown.map(r => (r.id === finalRegion.id ? finalRegion : r));
    nextQueues = { ...nextQueues, [q]: { ...targetQueue, breakdown: finalBreakdown } };
    changed = true;
  }

  return { queues: nextQueues, emptyTargets, filledTargets, changed };
}

/** Каскад структуры: новый регион появляется в последующих очередях (пустые значения). */
export function cascadeBreakdownRegionAdded(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  regionId: string,
): OrgQueueCascadeResult {
  const sourceQueue = queues[sourceKey];
  const sourceRegion = (sourceQueue.breakdown ?? []).find(r => r.id === regionId);
  if (!sourceRegion) {
    return { queues, emptyTargets: [], filledTargets: [], changed: false };
  }

  const emptyTargets: FsQueueKey[] = [];
  let nextQueues = { ...queues };
  let changed = false;

  for (const q of getSubsequentCascadeTargets(queues, sourceKey, 'users')) {
    const targetQueue = nextQueues[q];
    const targetBreakdown = targetQueue.breakdown ?? [];
    if (findBreakdownRegionByMatch(targetBreakdown, sourceRegion, targetQueue.region)) continue;

    const newRegion = copyBreakdownRowFromSource(sourceRegion);
    const realRows = withoutBreakdownPlaceholders(targetBreakdown, targetQueue.region);
    const nextBreakdown = [...realRows, newRegion];
    nextQueues = {
      ...nextQueues,
      [q]: { ...targetQueue, breakdown: nextBreakdown },
    };
    emptyTargets.push(q);
    changed = true;
  }

  return { queues: nextQueues, emptyTargets, filledTargets: [], changed };
}

/** Каскад структуры: новый филиал появляется в последующих очередях (пустые значения). */
export function cascadeBreakdownBranchAdded(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  regionId: string,
  branchId: string,
): OrgQueueCascadeResult {
  const sourceQueue = queues[sourceKey];
  const sourceRegion = (sourceQueue.breakdown ?? []).find(r => r.id === regionId);
  const sourceBranch = sourceRegion?.branches?.find(b => b.id === branchId);
  if (!sourceRegion || !sourceBranch) {
    return { queues, emptyTargets: [], filledTargets: [], changed: false };
  }

  const emptyTargets: FsQueueKey[] = [];
  let nextQueues = { ...queues };
  let changed = false;

  for (const q of getSubsequentCascadeTargets(queues, sourceKey, 'users')) {
    const targetQueue = nextQueues[q];
    let targetBreakdown = targetQueue.breakdown ?? [];

    const ensuredRegion = ensureBreakdownRegion(targetBreakdown, sourceRegion, targetQueue.region);
    targetBreakdown = ensuredRegion.breakdown;
    const targetRegion = ensuredRegion.region;
    const branches = targetRegion.branches ?? [];
    if (findBreakdownBranchByMatch(branches, sourceBranch)) continue;

    const newBranch = copyBreakdownRowFromSource(sourceBranch);
    const nextRegion = { ...targetRegion, branches: [...branches, newBranch] };
    const nextBreakdown = targetBreakdown.map(r => (r.id === targetRegion.id ? nextRegion : r));

    nextQueues = {
      ...nextQueues,
      [q]: { ...targetQueue, breakdown: nextBreakdown },
    };
    emptyTargets.push(q);
    changed = true;
  }

  return { queues: nextQueues, emptyTargets, filledTargets: [], changed };
}

export function buildOrgBreakdownCascadeConfirmMessage(
  sourceKey: FsQueueKey,
  rowLabel: string,
  filledTargets: FsQueueKey[],
  labels: Record<FsQueueKey, string>,
): string {
  const sourceLabel = labels[sourceKey];
  const targetLabels = filledTargets.map(tq => `«${labels[tq]}»`).join(', ');
  const rowPart = rowLabel.trim() ? `«${rowLabel.trim()}»` : 'Регион';
  if (filledTargets.length === 1) {
    return `${rowPart} в очереди ${targetLabels} уже заполнен. Применить значения из «${sourceLabel}»?`;
  }
  return `${rowPart} в очередях ${targetLabels} уже заполнен. Применить значения из «${sourceLabel}»?`;
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
): Pick<QueueOrgVolume, 'users' | 'rp_rpo' | 'executors' | 'rg' | 'rg_regions' | 'region'> {
  return {
    users: source.users,
    rp_rpo: source.rp_rpo,
    executors: source.executors,
    rg: source.rg,
    rg_regions: source.rg_regions,
    region: source.region,
  };
}

export type TrainingEField = 'e47' | 'e48' | 'e49';

const TRAINING_E_ORG_FIELD: Record<TrainingEField, 'users' | 'executors' | 'rg'> = {
  e47: 'users',
  e48: 'executors',
  e49: 'rg',
};

/** E47–E49: численность из орг. объёма (вкладка «Параметры оценки»). */
export function effectiveTrainingEValues(queueRow: QueueOrgVolume): {
  e47: number;
  e48: number;
  e49: number;
} {
  const partners = rebalanceOrgQueuePartners(queueRow.users, queueRow.rp_rpo, queueRow.executors);
  return {
    e47: queueRow.users ?? 0,
    e48: partners.executors ?? 0,
    e49: queueRow.rg ?? 0,
  };
}

export function trainingEOrgField(field: TrainingEField): 'users' | 'executors' | 'rg' {
  return TRAINING_E_ORG_FIELD[field];
}

export function isTrainingEOverridden(
  queueRow: QueueOrgVolume,
  autoRow: QueueOrgVolume | undefined,
  field: TrainingEField,
): boolean {
  if (!autoRow) return false;
  const cur = effectiveTrainingEValues(queueRow);
  const auto = effectiveTrainingEValues(autoRow);
  return cur[field] !== auto[field];
}

export function resetTrainingEField(
  row: QueueOrgVolume,
  field: TrainingEField,
  autoRow?: QueueOrgVolume,
): QueueOrgVolume {
  if (!autoRow) return row;
  if (field === 'e47') return applyOrgQueueFieldPatch(row, 'users', autoRow.users);
  if (field === 'e48') return applyOrgQueueFieldPatch(row, 'executors', autoRow.executors ?? '');
  return applyOrgQueueFieldPatch(row, 'rg', autoRow.rg);
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

export type OrgQueueCascadeTrigger = 'users' | 'rp_rpo' | 'executors' | 'rg';

function applyCascadeToTarget(
  source: QueueOrgVolume,
  target: QueueOrgVolume,
  trigger: OrgQueueCascadeTrigger,
): QueueOrgVolume {
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
    && a.rg_regions === b.rg_regions
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

/** Польз./РГ каскадируются на все последующие очереди; РП/Исполн. — только на активные. */
export function getSubsequentCascadeTargets(
  queues: Record<FsQueueKey, QueueOrgVolume>,
  sourceKey: FsQueueKey,
  trigger: OrgQueueCascadeTrigger,
): FsQueueKey[] {
  const sourceIdx = FS_QUEUE_KEYS.indexOf(sourceKey);
  if (sourceIdx < 0) return [];
  const subsequent = FS_QUEUE_KEYS.slice(sourceIdx + 1);
  if (trigger === 'users' || trigger === 'rg') return subsequent;
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
  field: 'users' | 'rp_rpo' | 'executors' | 'rg' | 'rg_regions' | 'functional_sp' | 'integrations_sp' | 'nmd_sp' | 'load_test_scenarios',
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
  if (field === 'rg_regions') {
    return { ...row, rg_regions: parseOrgInt(str) };
  }
  if (field === 'functional_sp') {
    return { ...row, functional_sp: parseOrgInt(str) };
  }
  if (field === 'integrations_sp') {
    return { ...row, integrations_sp: parseOrgInt(str) };
  }
  if (field === 'nmd_sp') {
    return { ...row, nmd_sp: parseOrgInt(str) };
  }
  if (field === 'load_test_scenarios') {
    return { ...row, load_test_scenarios: parseOrgInt(str) };
  }
  const value = parseOrgInt(str);
  return { ...row, rg: value };
}

function defaultQueueVolume(headcount: number, active: boolean, q: FsQueueKey): QueueOrgVolume {
  const users = headcount > 0 ? headcount : 30;
  return {
    users,
    rp_rpo: null,
    executors: null,
    rg: Math.max(1, Math.ceil(users * 0.05)),
    rg_regions: 0,
    functional_sp: 0,
    integrations_sp: 0,
    nmd_sp: 0,
    load_test_scenarios: 0,
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
    const base = defaultQueueVolume(hc, active, q);
    queues[q] = storedQ ? { ...base, ...storedQ, active } : base;
  }

  const maxUsers = Math.max(hc, ...FS_QUEUE_KEYS.map(q => queues[q].users));
  return {
    queues,
    headcount_category: headcountToCategory(maxUsers),
  };
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

  const c53 = computeCompanyFundC53(c52, c54, c57, c56);

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

export const LEGACY_MANUAL_RISK_KEYS: (keyof RisksC51C57)[] = [
  'c52_rpo', 'c56_sales_comp', 'c57_rk',
];

/** C53 = MAX(C52+C54, C57+C56) — ключи, от которых зависит авто-пересчёт C53. */
export const C53_DRIVER_KEYS: (keyof RisksC51C57)[] = [
  'c52_rpo', 'c54_contract_rpo', 'c56_sales_comp', 'c57_rk',
];

/** MAX(Резерв РПО + Риски РПО, Резерв компании + Компенсация продаж). */
export function computeCompanyFundC53(
  rpoReserve: number,
  rpoRisks: number,
  companyReserve: number,
  salesComp: number,
): number {
  return Math.max(rpoReserve + rpoRisks, companyReserve + salesComp);
}

export interface RiskPatchContext {
  risks: Partial<RisksC51C57>;
  auto_risks: RisksC51C57;
  risks_manual_keys: RisksManualKeys;
  risks_manual: boolean;
}

export type RiskSide = 'ot' | 'do';

export interface RiskSidePatchContext {
  auto_risks: RisksC51C57;
  risks_ot: Partial<RisksC51C57>;
  risks_do: Partial<RisksC51C57>;
  risks_manual_keys_ot: RisksManualKeys;
  risks_manual_keys_do: RisksManualKeys;
  risks_manual_ot: boolean;
  risks_manual_do: boolean;
}

function sideFields(side: RiskSide): {
  risksKey: 'risks_ot' | 'risks_do';
  keysKey: 'risks_manual_keys_ot' | 'risks_manual_keys_do';
  manualKey: 'risks_manual_ot' | 'risks_manual_do';
} {
  return side === 'ot'
    ? { risksKey: 'risks_ot', keysKey: 'risks_manual_keys_ot', manualKey: 'risks_manual_ot' }
    : { risksKey: 'risks_do', keysKey: 'risks_manual_keys_do', manualKey: 'risks_manual_do' };
}

/** Патч ручного изменения % резерва с авто-пересчётом C53, если он не переопределён. */
export function buildManualRiskPatch(
  key: keyof RisksC51C57,
  value: number,
  ctx: RiskPatchContext,
): {
  risks: Partial<RisksC51C57>;
  risks_manual_keys: RisksManualKeys;
  risks_manual: true;
} {
  const nextStored = { ...ctx.risks, [key]: value };
  const nextManualKeys = { ...ctx.risks_manual_keys, [key]: true };
  const risks: Partial<RisksC51C57> = { [key]: value };

  if (
    C53_DRIVER_KEYS.includes(key)
    && !isRiskKeyManual('c53_company_fund', ctx.risks_manual_keys, ctx.risks_manual, ctx.risks)
  ) {
    risks.c53_company_fund = mergeEffectiveRisks(
      ctx.auto_risks,
      nextStored,
      nextManualKeys,
      ctx.risks_manual,
    ).c53_company_fund;
  }

  return {
    risks,
    risks_manual_keys: { [key]: true },
    risks_manual: true,
  };
}

/** Патч ручного % для стороны ОТ/ДО в таблице фаз (независимый C53 на сторону). */
export function buildManualRiskPatchForSide(
  side: RiskSide,
  key: keyof RisksC51C57,
  value: number,
  ctx: RiskSidePatchContext,
): Record<string, unknown> {
  const { risksKey, keysKey, manualKey } = sideFields(side);
  const stored = side === 'ot' ? ctx.risks_ot : ctx.risks_do;
  const manualKeys = side === 'ot' ? ctx.risks_manual_keys_ot : ctx.risks_manual_keys_do;
  const legacyManual = side === 'ot' ? ctx.risks_manual_ot : ctx.risks_manual_do;

  const nextStored = { ...stored, [key]: value };
  const nextManualKeys = { ...manualKeys, [key]: true };
  const risksPatch: Partial<RisksC51C57> = { [key]: value };

  if (
    C53_DRIVER_KEYS.includes(key)
    && !isRiskKeyManual('c53_company_fund', manualKeys, legacyManual, stored)
  ) {
    risksPatch.c53_company_fund = mergeEffectiveRisks(
      ctx.auto_risks,
      nextStored,
      nextManualKeys,
      legacyManual,
    ).c53_company_fund;
  }

  return {
    [risksKey]: risksPatch,
    [keysKey]: { [key]: true },
    [manualKey]: true,
  };
}

export function migrateLegacyRisksToSides(
  legacyRisks: Partial<RisksC51C57>,
  legacyManualKeys: RisksManualKeys,
  legacyManual: boolean,
  storedOt: Partial<RisksC51C57>,
  storedDo: Partial<RisksC51C57>,
  manualKeysOt: RisksManualKeys,
  manualKeysDo: RisksManualKeys,
  manualOt: boolean,
  manualDo: boolean,
): {
  storedOt: Partial<RisksC51C57>;
  storedDo: Partial<RisksC51C57>;
  manualKeysOt: RisksManualKeys;
  manualKeysDo: RisksManualKeys;
  manualOt: boolean;
  manualDo: boolean;
} {
  const legacyHasData =
    Object.keys(legacyRisks).length > 0
    || legacyManual
    || Object.values(legacyManualKeys).some(Boolean);

  let ot = storedOt;
  let doSide = storedDo;
  let mkOt = manualKeysOt;
  let mkDo = manualKeysDo;
  let mOt = manualOt;
  let mDo = manualDo;

  if (Object.keys(ot).length === 0 && Object.keys(doSide).length === 0 && legacyHasData) {
    ot = { ...legacyRisks };
    doSide = { ...legacyRisks };
  }
  if (
    Object.keys(mkOt).length === 0
    && Object.keys(mkDo).length === 0
    && legacyHasData
  ) {
    mkOt = { ...legacyManualKeys };
    mkDo = { ...legacyManualKeys };
  }
  if (!mOt && !mDo && legacyManual) {
    mOt = true;
    mDo = true;
  }

  return {
    storedOt: ot,
    storedDo: doSide,
    manualKeysOt: mkOt,
    manualKeysDo: mkDo,
    manualOt: mOt || hasAnyManualRiskKeys(mkOt, false),
    manualDo: mDo || hasAnyManualRiskKeys(mkDo, false),
  };
}

function applyResetRiskSide(
  assessment: BriefingAssessment,
  side: RiskSide,
  resetAll: boolean,
  resetKeys?: (keyof RisksC51C57)[],
): Partial<BriefingAssessment> {
  const { risksKey, keysKey, manualKey } = sideFields(side);
  const curKeys = side === 'ot'
    ? (assessment.risks_manual_keys_ot ?? {})
    : (assessment.risks_manual_keys_do ?? {});
  const curRisks = side === 'ot' ? (assessment.risks_ot ?? {}) : (assessment.risks_do ?? {});

  if (resetAll) {
    return {
      [keysKey]: {},
      [manualKey]: false,
      [risksKey]: {},
    } as Partial<BriefingAssessment>;
  }
  if (resetKeys && resetKeys.length > 0) {
    const nextKeys = { ...curKeys };
    const nextRisks = { ...curRisks };
    for (const k of resetKeys) {
      delete nextKeys[k];
      delete nextRisks[k];
    }
    return {
      [risksKey]: nextRisks,
      [keysKey]: nextKeys,
      [manualKey]: hasAnyManualRiskKeys(nextKeys, false),
    } as Partial<BriefingAssessment>;
  }
  return {};
}

export function formatRiskPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const v = Math.round(n * 1000) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${s}%`;
}

export function parseRiskPctInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/%/g, '');
  if (trimmed === '') return null;
  const pctVal = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(pctVal)) return null;
  return Math.min(1, Math.max(0, pctVal / 100));
}

export function isRiskKeyManual(
  key: keyof RisksC51C57,
  manualKeys: RisksManualKeys,
  legacyManual: boolean,
  storedRisks: Partial<RisksC51C57>,
): boolean {
  if (manualKeys[key]) return true;
  if (legacyManual && LEGACY_MANUAL_RISK_KEYS.includes(key) && storedRisks[key] != null) return true;
  return false;
}

export function hasAnyManualRiskKeys(
  manualKeys: RisksManualKeys,
  legacyManual: boolean,
): boolean {
  if (legacyManual) return true;
  return Object.values(manualKeys).some(Boolean);
}

export function computeReserveAmount(
  production: number | null | undefined,
  pct: number,
): number | null {
  if (production == null || !Number.isFinite(production)) return null;
  if (!Number.isFinite(pct)) return null;
  return production * pct;
}

export function mergeEffectiveRisks(
  autoRisks: RisksC51C57,
  storedRisks: Partial<RisksC51C57>,
  manualKeys: RisksManualKeys,
  legacyManual = false,
): RisksC51C57 {
  const pick = (key: keyof RisksC51C57): number => {
    if (isRiskKeyManual(key, manualKeys, legacyManual, storedRisks) && storedRisks[key] != null) {
      return storedRisks[key] as number;
    }
    return autoRisks[key];
  };

  const c52 = pick('c52_rpo');
  const c54 = pick('c54_contract_rpo');
  const c55 = pick('c55_contract_fund');
  const c56 = pick('c56_sales_comp');
  const c57 = pick('c57_rk');
  const c53 = isRiskKeyManual('c53_company_fund', manualKeys, legacyManual, storedRisks)
    && storedRisks.c53_company_fund != null
    ? storedRisks.c53_company_fund
    : computeCompanyFundC53(c52, c54, c57, c56);

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

export function getHourlyRateForTechnologyLabel(
  nsi: AssessmentNsiCache,
  technology: string,
  projectTypes?: ProjectType[],
): number {
  const code = typeCodeForTechnologyLabel(technology);
  const types = projectTypes ?? nsi.projectTypes;
  const typeId = types.find(pt => pt.code === code)?.id ?? null;
  return getHourlyRateForType(nsi, typeId);
}

export function resolveQueueTechnology(
  qc: Pick<QueueRateRow, 'technology' | 'technology_manual' | 'auto_technology'>,
  fallbackAuto: string,
): string {
  if (isTruthyDbFlag(qc.technology_manual) && qc.technology) return qc.technology;
  return qc.auto_technology ?? fallbackAuto;
}

export interface QueueRateRow {
  queue: string;
  technology: string;
  auto_technology: string;
  technology_manual: number;
  rate: number;
  nsi_rate: number;
  rate_manual: number;
}

export function getQueueRateValue(qc: Pick<QueueRateRow, 'rate' | 'nsi_rate'>): number {
  return qc.rate ?? qc.nsi_rate;
}

export const QUEUE_TECHNOLOGY_OPTIONS = [
  'Кейс-проект',
  'Быстрый запуск',
  'Проф/мини',
  'ПРОФ-проект',
  'КОРП-проект',
] as const;

/** Приводит устаревшие подписи к актуальным (БЗ → Быстрый запуск). */
export function normalizeQueueTechnologyLabel(label: string): string {
  if (label === 'БЗ') return 'Быстрый запуск';
  return label;
}

export type QueueTechnologyLabel = (typeof QUEUE_TECHNOLOGY_OPTIONS)[number];

export function typeCodeForTechnologyLabel(label: string): string {
  switch (normalizeQueueTechnologyLabel(label)) {
    case 'КОРП-проект': return 'KORP';
    case 'ПРОФ-проект': return 'PROF';
    case 'Проф/мини': return 'PROF_MINI';
    case 'Быстрый запуск': return 'BZ';
    default: return 'CASE';
  }
}

export function technologyLabelForTypeCode(code: string | null | undefined): string {
  switch (code) {
    case 'KORP': return 'КОРП-проект';
    case 'PROF': return 'ПРОФ-проект';
    case 'PROF_MINI': return 'Проф/мини';
    case 'BZ': return 'Быстрый запуск';
    default: return 'Кейс-проект';
  }
}

export function effectiveProjectTypeCode(
  assessment: Pick<BriefingAssessment, 'project_type_id' | 'project_types'>,
): string {
  const id = assessment.project_type_id;
  const pt = assessment.project_types?.find(t => t.id === id);
  return pt?.code ?? 'CASE';
}

export function isCaseProjectType(code: string): boolean {
  return code === 'CASE' || code === 'BZ';
}

export function getAutoQueueRate(
  qc: Pick<QueueRateRow, 'nsi_rate'>,
): number {
  return qc.nsi_rate;
}

export function computeMaxQueueRate(
  queueCalcs: QueueRateRow[],
  activeQueues?: Iterable<string>,
): number {
  let rows = queueCalcs;
  if (activeQueues) {
    const active = new Set(activeQueues);
    const filtered = queueCalcs.filter(q => active.has(q.queue));
    if (filtered.length > 0) rows = filtered;
  }
  if (rows.length === 0) return 0;
  return Math.max(...rows.map(getQueueRateValue));
}

export function isTruthyDbFlag(v: unknown): boolean {
  return v === true || v === 1;
}

export function isUnifiedRateAutoMode(
  assessment: Pick<BriefingAssessment, 'unified_rate_enabled' | 'unified_rate_manual'>,
): boolean {
  return isTruthyDbFlag(assessment.unified_rate_enabled)
    && !isTruthyDbFlag(assessment.unified_rate_manual);
}

export function getActiveQueueKeys(orgVolume: OrgVolumeData): FsQueueKey[] {
  return FS_QUEUE_KEYS.filter(q => orgVolume.queues[q]?.active);
}

export function computeAutoUnifiedRate(queueCalcs: QueueRateRow[]): number {
  return computeMaxQueueRate(queueCalcs);
}

export function getEffectiveQueueRate(
  qc: Pick<QueueRateRow, 'rate' | 'nsi_rate'>,
  unifiedEnabled: boolean,
  unifiedRate: number | null | undefined,
): number {
  if (unifiedEnabled && unifiedRate != null) return unifiedRate;
  return getQueueRateValue(qc);
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
    next.risks_manual_keys = {};
  }
  if (patch.reset_risks_ot) {
    Object.assign(next, applyResetRiskSide(assessment, 'ot', true));
  }
  if (patch.reset_risks_do) {
    Object.assign(next, applyResetRiskSide(assessment, 'do', true));
  }
  if (patch.reset_risk_keys && Array.isArray(patch.reset_risk_keys)) {
    const keys = patch.reset_risk_keys as (keyof RisksC51C57)[];
    const nextKeys = { ...assessment.risks_manual_keys };
    const nextRisks = { ...assessment.risks };
    for (const k of keys) {
      delete nextKeys[k];
      delete nextRisks[k];
    }
    next.risks = nextRisks;
    next.risks_manual_keys = nextKeys;
    if (!hasAnyManualRiskKeys(nextKeys, next.risks_manual)) {
      next.risks_manual = false;
    }
  }
  if (patch.reset_risk_keys_ot && Array.isArray(patch.reset_risk_keys_ot)) {
    Object.assign(next, applyResetRiskSide(
      assessment,
      'ot',
      false,
      patch.reset_risk_keys_ot as (keyof RisksC51C57)[],
    ));
  }
  if (patch.reset_risk_keys_do && Array.isArray(patch.reset_risk_keys_do)) {
    Object.assign(next, applyResetRiskSide(
      assessment,
      'do',
      false,
      patch.reset_risk_keys_do as (keyof RisksC51C57)[],
    ));
  }
  if (patch.reset_org_volume) {
    next.org_volume_manual = false;
  }
  if (patch.reset_headcount) {
    next.headcount_manual = false;
  }
  if (patch.reset_unified_rate) {
    next.unified_rate_manual = false;
  }
  if (patch.unified_rate_enabled !== undefined) {
    next.unified_rate_enabled = Boolean(patch.unified_rate_enabled);
  }
  if (patch.unified_rate_manual !== undefined) {
    next.unified_rate_manual = Boolean(patch.unified_rate_manual);
  }
  if (patch.unified_rate !== undefined) {
    next.unified_rate = patch.unified_rate as number;
  }

  if (patch.phase_calc && typeof patch.phase_calc === 'object') {
    const incoming = patch.phase_calc as PhaseCalcState;
    const prevQueues = assessment.phase_calc?.queues ?? incoming.queues;
    const queues = { ...prevQueues };
    if (incoming.queues) {
      for (const q of FS_QUEUE_KEYS) {
        if (incoming.queues[q]) {
          queues[q] = { ...queues[q], ...incoming.queues[q] };
        }
      }
    }
    next.phase_calc = { queues };
  }

  if (patch.reset_phase_calc_params) {
    next.phase_calc_params = mergePhaseCalcParams(null);
  } else if (
    (patch.phase_calc_params && typeof patch.phase_calc_params === 'object')
    || (Array.isArray(patch.phase_calc_params_omit) && patch.phase_calc_params_omit.length > 0)
  ) {
    const base: Partial<PhaseCalcParams> = { ...(assessment.phase_calc_params ?? {}) };
    if (Array.isArray(patch.phase_calc_params_omit)) {
      for (const k of patch.phase_calc_params_omit as string[]) {
        delete base[k as keyof PhaseCalcParams];
      }
    }
    if (patch.phase_calc_params && typeof patch.phase_calc_params === 'object') {
      Object.assign(base, patch.phase_calc_params as Partial<PhaseCalcParams>);
    }
    next.phase_calc_params = mergePhaseCalcParams(base);
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
  if (patch.risks_manual_keys && typeof patch.risks_manual_keys === 'object') {
    next.risks_manual_keys = {
      ...assessment.risks_manual_keys,
      ...(patch.risks_manual_keys as RisksManualKeys),
    };
  }
  if (patch.risks_manual !== undefined) {
    next.risks_manual = Boolean(patch.risks_manual);
  }
  if (patch.risks_ot && typeof patch.risks_ot === 'object') {
    next.risks_ot = { ...(assessment.risks_ot ?? {}), ...(patch.risks_ot as Partial<RisksC51C57>) };
  }
  if (patch.risks_do && typeof patch.risks_do === 'object') {
    next.risks_do = { ...(assessment.risks_do ?? {}), ...(patch.risks_do as Partial<RisksC51C57>) };
  }
  if (patch.risks_manual_keys_ot && typeof patch.risks_manual_keys_ot === 'object') {
    next.risks_manual_keys_ot = {
      ...(assessment.risks_manual_keys_ot ?? {}),
      ...(patch.risks_manual_keys_ot as RisksManualKeys),
    };
  }
  if (patch.risks_manual_keys_do && typeof patch.risks_manual_keys_do === 'object') {
    next.risks_manual_keys_do = {
      ...(assessment.risks_manual_keys_do ?? {}),
      ...(patch.risks_manual_keys_do as RisksManualKeys),
    };
  }
  if (patch.risks_manual_ot !== undefined) {
    next.risks_manual_ot = Boolean(patch.risks_manual_ot);
  }
  if (patch.risks_manual_do !== undefined) {
    next.risks_manual_do = Boolean(patch.risks_manual_do);
  }
  if (patch.headcount_coeffs && typeof patch.headcount_coeffs === 'object') {
    next.headcount_coeffs = {
      ...assessment.headcount_coeffs,
      ...(patch.headcount_coeffs as HeadcountCoeffs),
    };
  }
  if (patch.queue_calcs !== undefined && Array.isArray(patch.queue_calcs)) {
    next.queue_calcs = patch.queue_calcs as BriefingAssessment['queue_calcs'];
  }

  if (patch.assessment_scenarios !== undefined && Array.isArray(patch.assessment_scenarios)) {
    next.assessment_scenarios = patch.assessment_scenarios as AssessmentScenario[];
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
    {},
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
    assessment.risks_manual_keys ?? {},
    assessment.risks_manual,
  );

  const effectiveRisksOt = mergeEffectiveRisks(
    autoRisks,
    assessment.risks_ot ?? {},
    assessment.risks_manual_keys_ot ?? {},
    assessment.risks_manual_ot,
  );

  const effectiveRisksDo = mergeEffectiveRisks(
    autoRisks,
    assessment.risks_do ?? {},
    assessment.risks_manual_keys_do ?? {},
    assessment.risks_manual_do,
  );

  const effectiveOrg: OrgVolumeData = assessment.org_volume_manual && assessment.org_volume?.queues
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

  const autoTechnology = technologyLabelForTypeCode(autoType?.code ?? 'CASE');

  const queue_calcs = FS_QUEUE_KEYS.map(q => {
    const qc = assessment.queue_calcs.find(r => r.queue === q) ?? {
      queue: q,
      technology: autoTechnology,
      auto_technology: autoTechnology,
      technology_manual: 0,
      rate: 5000,
      nsi_rate: 5000,
      rate_manual: 0,
    };
    const autoTech = autoTechnology;
    const technology = normalizeQueueTechnologyLabel(resolveQueueTechnology(
      { ...qc, auto_technology: qc.auto_technology ?? autoTech },
      autoTech,
    ));
    const nsiRate = getHourlyRateForTechnologyLabel(nsi, technology, projectTypes);
    const rateManual = isTruthyDbFlag(qc.rate_manual);
    return {
      ...qc,
      queue: q,
      technology,
      auto_technology: autoTech,
      technology_manual: isTruthyDbFlag(qc.technology_manual) ? 1 : 0,
      nsi_rate: nsiRate,
      rate: rateManual ? qc.rate : nsiRate,
      rate_manual: rateManual ? 1 : 0,
    };
  });

  const unifiedEnabled = isTruthyDbFlag(assessment.unified_rate_enabled);
  const unifiedManual = isTruthyDbFlag(assessment.unified_rate_manual);
  let unified_rate = assessment.unified_rate ?? 0;
  if (unifiedEnabled && !unifiedManual) {
    unified_rate = computeAutoUnifiedRate(queue_calcs);
  }

  return {
    ...assessment,
    project_types: projectTypes,
    auto_risks: autoRisks,
    risks: effectiveRisks,
    effective_risks_ot: effectiveRisksOt,
    effective_risks_do: effectiveRisksDo,
    risks_manual_keys: assessment.risks_manual_keys ?? {},
    risks_manual_keys_ot: assessment.risks_manual_keys_ot ?? {},
    risks_manual_keys_do: assessment.risks_manual_keys_do ?? {},
    risks_manual_ot: assessment.risks_manual_ot ?? false,
    risks_manual_do: assessment.risks_manual_do ?? false,
    auto_project_type: autoType,
    auto_project_type_id: autoType?.id ?? null,
    project_type_id: effectiveTypeId,
    org_volume: effectiveOrg,
    auto_org_volume: autoOrg,
    headcount_category: category,
    headcount_coeffs: effectiveCoeffs,
    auto_headcount_coeffs: autoCoeffsDisplay,
    auto_criteria_sp: autoCriteriaSp,
    nsi_hourly_rate: getHourlyRateForType(nsi, effectiveTypeId),
    queue_calcs,
    unified_rate_enabled: unifiedEnabled,
    unified_rate,
    unified_rate_manual: unifiedManual,
  };
}
