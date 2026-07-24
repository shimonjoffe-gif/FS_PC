import type {
  AssessmentScenario, BriefingAssessment, BriefingFsSel, FsQueueKey, OrgVolumeData, PhaseCalcLineDef,
  QueueOrgVolume, ScenarioPhaseDetail, ScenarioSnapshotResults, TeamProportions,
} from './types';
import { FS_QUEUE_KEYS, anyQueueEnabled, itemQueues } from './types';
import type { FsQueuesMap } from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import {
  getEvaluatedQueueKeys, computeQueueSpFromFs, getEffectiveQueueRate,
  getHourlyRateForTechnologyLabel, resolveQueueTechnology,
  normalizeQueueTechnologyLabel, QUEUE_TECHNOLOGY_OPTIONS,
  recomputeAssessmentDerived,
} from './assessmentCalc';
import type { QueueSpTotals } from './fsSpCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { computeAllPhaseProds, type PhaseProdSide } from './phaseCalcProd';
import type { RisksC51C57 } from './types';
import { sumTeamFte } from './teamLabels';

export const EMPTY_SCENARIO_PHASE_DETAIL: ScenarioPhaseDetail = {
  budgetWithRisks: 0,
  travel: 0,
  productionCore: 0,
  hours: 0,
  weeks: 0,
  reserveRpo: 0,
  reserveCompany: 0,
  salesComp: 0,
  companyFund: 0,
  contractRpoRisks: 0,
  contractFundRisks: 0,
  total: 0,
};

export function addScenarioPhaseDetails(
  a: ScenarioPhaseDetail,
  b: ScenarioPhaseDetail,
): ScenarioPhaseDetail {
  return {
    budgetWithRisks: a.budgetWithRisks + b.budgetWithRisks,
    travel: a.travel + b.travel,
    productionCore: a.productionCore + b.productionCore,
    hours: a.hours + b.hours,
    weeks: a.weeks + b.weeks,
    reserveRpo: a.reserveRpo + b.reserveRpo,
    reserveCompany: a.reserveCompany + b.reserveCompany,
    salesComp: a.salesComp + b.salesComp,
    companyFund: a.companyFund + b.companyFund,
    contractRpoRisks: a.contractRpoRisks + b.contractRpoRisks,
    contractFundRisks: a.contractFundRisks + b.contractFundRisks,
    total: a.total + b.total,
  };
}

export function detailFromProdSide(side: PhaseProdSide, risks: RisksC51C57): ScenarioPhaseDetail {
  const p = side.production;
  return {
    budgetWithRisks: side.budgetWithRisks,
    travel: side.travel,
    productionCore: side.productionCore,
    hours: side.hours,
    weeks: side.weeks,
    reserveRpo: p * risks.c52_rpo,
    reserveCompany: p * risks.c57_rk,
    salesComp: p * risks.c56_sales_comp,
    companyFund: p * risks.c53_company_fund,
    contractRpoRisks: p * risks.c54_contract_rpo,
    contractFundRisks: p * risks.c55_contract_fund,
    total: side.total,
  };
}

/** Нормализация старых снимков без detailByPhase. */
export function normalizeScenarioOtTotals(
  raw: Partial<ScenarioOtTotals> | null | undefined,
): ScenarioOtTotals {
  if (!raw) {
    return {
      byPhase: {},
      grandTotal: 0,
      weeksByPhase: {},
      grandTotalWeeks: 0,
      detailByPhase: {},
      grandDetail: { ...EMPTY_SCENARIO_PHASE_DETAIL },
    };
  }
  const detailByPhase = raw.detailByPhase ?? {};
  let grandDetail = raw.grandDetail
    ? { ...raw.grandDetail }
    : { ...EMPTY_SCENARIO_PHASE_DETAIL };
  if (!raw.grandDetail && Object.keys(detailByPhase).length > 0) {
    grandDetail = { ...EMPTY_SCENARIO_PHASE_DETAIL };
    for (const d of Object.values(detailByPhase)) {
      grandDetail = addScenarioPhaseDetails(grandDetail, d);
    }
  } else if (!raw.grandDetail && raw.byPhase) {
    grandDetail = {
      ...EMPTY_SCENARIO_PHASE_DETAIL,
      total: raw.grandTotal ?? 0,
      weeks: raw.grandTotalWeeks ?? 0,
    };
  }
  return {
    byPhase: raw.byPhase ?? {},
    grandTotal: raw.grandTotal ?? 0,
    weeksByPhase: raw.weeksByPhase ?? {},
    grandTotalWeeks: raw.grandTotalWeeks ?? 0,
    detailByPhase,
    grandDetail,
  };
}

export function newScenarioId(): string {
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createAssessmentScenario(name: string): AssessmentScenario {
  const now = new Date().toISOString();
  return {
    id: newScenarioId(),
    name,
    created_at: now,
    updated_at: now,
  };
}

export function getBasePhaseEnabled(
  assessment: BriefingAssessment,
  queue: FsQueueKey,
  lineId: string,
): boolean {
  const def = assessment.phase_calc_defs?.find(d => d.id === lineId);
  return assessment.phase_calc?.queues?.[queue]?.[lineId] ?? def?.default_enabled ?? false;
}

export function getScenarioPhaseEnabled(
  base: BriefingAssessment,
  scenario: AssessmentScenario | null | undefined,
  queue: FsQueueKey,
  lineId: string,
): boolean {
  const delta = scenario?.phase_enabled?.[queue]?.[lineId];
  if (delta !== undefined) return delta;
  return getBasePhaseEnabled(base, queue, lineId);
}

/** Merge scenario deltas onto base assessment; null scenario = base unchanged. */
export function resolveScenarioAssessment(
  base: BriefingAssessment,
  scenario: AssessmentScenario | null | undefined,
  nsi?: AssessmentNsiCache,
): BriefingAssessment {
  if (!scenario) return base;

  const hasPhase = scenario.phase_enabled && Object.keys(scenario.phase_enabled).length > 0;
  const hasTech = scenario.queue_technology && Object.keys(scenario.queue_technology).length > 0;
  if (!hasPhase && !hasTech) return base;

  let result: BriefingAssessment = { ...base };

  if (hasPhase) {
    const mergedQueues = { ...base.phase_calc.queues };
    for (const q of FS_QUEUE_KEYS) {
      const deltaQ = scenario.phase_enabled![q];
      if (!deltaQ) continue;
      mergedQueues[q] = { ...(mergedQueues[q] ?? {}), ...deltaQ };
    }
    result = { ...result, phase_calc: {
      queues: mergedQueues,
      ...(base.phase_calc.team_fte ? { team_fte: base.phase_calc.team_fte } : {}),
    } };
  }

  if (hasTech) {
    const queue_calcs = base.queue_calcs.map(qc => {
      const q = qc.queue as FsQueueKey;
      const override = scenario.queue_technology![q];
      if (!override) return qc;

      const technology = normalizeQueueTechnologyLabel(override.technology);
      const nsiRate = nsi
        ? getHourlyRateForTechnologyLabel(nsi, technology, base.project_types)
        : qc.nsi_rate;
      const rate = override.rate ?? nsiRate;

      return {
        ...qc,
        technology,
        technology_manual: 1,
        nsi_rate: nsiRate,
        rate,
        rate_manual: override.rate != null ? 1 : 0,
      };
    });
    result = { ...result, queue_calcs };
  }

  return result;
}

/** Keep base partner/geo fields; take FS-derived SP/active from auto org (scenario ФС). */
function mergeOrgVolumeFsDerived(baseOrg: OrgVolumeData, autoOrg: OrgVolumeData): OrgVolumeData {
  const queues = {} as Record<FsQueueKey, QueueOrgVolume>;
  for (const q of FS_QUEUE_KEYS) {
    const autoQ = autoOrg.queues[q];
    const baseQ = baseOrg.queues[q] ?? autoQ;
    queues[q] = {
      ...autoQ,
      users: baseQ.users,
      rp_rpo: baseQ.rp_rpo,
      executors: baseQ.executors,
      rg: baseQ.rg,
      rg_regions: baseQ.rg_regions,
      region: baseQ.region,
      breakdown: baseQ.breakdown,
      evaluated: baseQ.evaluated !== undefined ? baseQ.evaluated : autoQ.evaluated,
    };
  }
  return {
    ...autoOrg,
    queues,
    headcount_category: baseOrg.headcount_category ?? autoOrg.headcount_category,
  };
}

function nsiCacheFromAssessment(
  base: BriefingAssessment,
  nsi?: AssessmentNsiCache,
): AssessmentNsiCache {
  if (nsi && nsi.projectTypes.length > 0) return nsi;
  return {
    projectTypes: base.project_types ?? [],
    ratesByTypeId: nsi?.ratesByTypeId ?? new Map(),
    coeffsByTypeId: nsi?.coeffsByTypeId ?? new Map(),
  };
}

function headcountHintFromAssessment(base: BriefingAssessment): number | null {
  const users = FS_QUEUE_KEYS.map(q => base.org_volume?.queues?.[q]?.users ?? 0);
  const maxUsers = Math.max(0, ...users);
  return maxUsers > 0 ? maxUsers : null;
}

/**
 * Effective assessment + ФС for scenario totals.
 * При −ФС / перераспределении — полный пересчёт (SP, тип, риски, орг. от ФС), затем дельты фаз/технологии.
 */
export function resolveScenarioForCalc(
  base: BriefingAssessment,
  scenario: AssessmentScenario | null | undefined,
  fsItems: BriefingFsSel[],
  nsi?: AssessmentNsiCache,
  headcount?: number | null,
): { assessment: BriefingAssessment; fsItems: BriefingFsSel[] } {
  const scenarioFs = resolveScenarioFsItems(fsItems, scenario);
  if (!scenario) {
    return { assessment: base, fsItems: scenarioFs };
  }

  const nsiCache = nsiCacheFromAssessment(base, nsi);
  let assessment = base;

  if (hasScenarioFsChanges(scenario)) {
    const recomputed = recomputeAssessmentDerived(
      {
        ...base,
        project_type_manual: false,
        org_volume_manual: false,
      },
      {
        headcount: headcount !== undefined ? headcount : headcountHintFromAssessment(base),
        fs_items: scenarioFs,
      },
      nsiCache,
    );

    if (base.org_volume_manual && base.org_volume?.queues) {
      assessment = {
        ...recomputed,
        org_volume: mergeOrgVolumeFsDerived(base.org_volume, recomputed.org_volume),
        auto_org_volume: recomputed.auto_org_volume,
      };
    } else {
      assessment = recomputed;
    }

    if (base.headcount_manual) {
      assessment = {
        ...assessment,
        headcount_manual: true,
        headcount_category: base.headcount_category,
        headcount_coeffs: {
          ...assessment.headcount_coeffs,
          ...base.headcount_coeffs,
          c62: base.headcount_category,
        },
      };
    }
  }

  assessment = resolveScenarioAssessment(assessment, scenario, nsiCache);
  return { assessment, fsItems: scenarioFs };
}

export function getBaseQueueTechnologyLabel(
  assessment: BriefingAssessment,
  queue: FsQueueKey,
): string {
  const qc = assessment.queue_calcs.find(r => r.queue === queue);
  if (!qc) return QUEUE_TECHNOLOGY_OPTIONS[0];
  return normalizeQueueTechnologyLabel(
    resolveQueueTechnology(qc, QUEUE_TECHNOLOGY_OPTIONS[0]),
  );
}

export function getScenarioQueueTechnologyLabel(
  base: BriefingAssessment,
  scenario: AssessmentScenario | null | undefined,
  queue: FsQueueKey,
): string {
  const override = scenario?.queue_technology?.[queue];
  if (override) return normalizeQueueTechnologyLabel(override.technology);
  return getBaseQueueTechnologyLabel(base, queue);
}

export function getBaseQueueRate(
  assessment: BriefingAssessment,
  queue: FsQueueKey,
): number {
  const qc = assessment.queue_calcs.find(r => r.queue === queue);
  if (!qc) return 0;
  return getEffectiveQueueRate(qc, assessment.unified_rate_enabled, assessment.unified_rate);
}

export function getScenarioQueueRate(
  base: BriefingAssessment,
  scenario: AssessmentScenario | null | undefined,
  queue: FsQueueKey,
  nsi?: AssessmentNsiCache,
  fsItems: BriefingFsSel[] = [],
): number {
  const { assessment: effective } = resolveScenarioForCalc(base, scenario, fsItems, nsi);
  const qc = effective.queue_calcs.find(r => r.queue === queue);
  if (!qc) return 0;
  return getEffectiveQueueRate(qc, effective.unified_rate_enabled, effective.unified_rate);
}

export function setScenarioQueueTechnology(
  scenario: AssessmentScenario,
  base: BriefingAssessment,
  queue: FsQueueKey,
  technology: string,
): AssessmentScenario {
  const baseTech = getBaseQueueTechnologyLabel(base, queue);
  const normalized = normalizeQueueTechnologyLabel(technology);
  const next = { ...(scenario.queue_technology ?? {}) };

  if (normalized === baseTech) {
    delete next[queue];
  } else {
    next[queue] = { technology: normalized };
  }

  return {
    ...scenario,
    queue_technology: Object.keys(next).length > 0 ? next : undefined,
    updated_at: new Date().toISOString(),
  };
}

/** Effective ФС for scenario: exclusions + queue overrides (base catalog unchanged). */
export function resolveScenarioFsItems(
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null | undefined,
): BriefingFsSel[] {
  const excluded = new Set(scenario?.fs_excluded ?? []);
  const overrides = scenario?.fs_queue_overrides ?? {};
  const hasOverrides = Object.keys(overrides).length > 0;
  if (excluded.size === 0 && !hasOverrides) return fsItems;

  const offQueues = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as FsQueuesMap;
  return fsItems.map(item => {
    if (excluded.has(item.fs_item_id)) {
      return { ...item, enabled: 0, queues_json: offQueues };
    }

    const itemOverride = overrides[item.fs_item_id];
    if (!itemOverride) return item;

    const baseQueues = itemQueues(item);
    const merged: FsQueuesMap = { ...baseQueues };
    for (const q of FS_QUEUE_KEYS) {
      if (itemOverride[q] !== undefined) merged[q] = itemOverride[q]!;
    }
    return {
      ...item,
      queues_json: merged,
      enabled: anyQueueEnabled(merged) ? 1 : 0,
    };
  });
}

export function baseEnabledFsItems(fsItems: BriefingFsSel[]): BriefingFsSel[] {
  return fsItems.filter(item => {
    if (item.item_type === 'detail') return false;
    return anyQueueEnabled(itemQueues(item));
  });
}

export function isFsExcludedInScenario(
  scenario: AssessmentScenario | null | undefined,
  fsItemId: number,
): boolean {
  return scenario?.fs_excluded?.includes(fsItemId) ?? false;
}

export function toggleScenarioFsExcluded(
  scenario: AssessmentScenario,
  fsItemId: number,
  excluded: boolean,
): AssessmentScenario {
  const next = new Set(scenario.fs_excluded ?? []);
  if (excluded) next.add(fsItemId);
  else next.delete(fsItemId);
  const fs_excluded = [...next];

  const nextOverrides = { ...(scenario.fs_queue_overrides ?? {}) };
  if (excluded) delete nextOverrides[fsItemId];

  const hasOverrides = Object.keys(nextOverrides).length > 0;
  return {
    ...scenario,
    fs_excluded: fs_excluded.length > 0 ? fs_excluded : undefined,
    fs_queue_overrides: hasOverrides ? nextOverrides : undefined,
    updated_at: new Date().toISOString(),
  };
}

export function getScenarioItemQueueEnabled(
  item: BriefingFsSel,
  scenario: AssessmentScenario | null | undefined,
  queue: FsQueueKey,
): boolean {
  if (isFsExcludedInScenario(scenario, item.fs_item_id)) return false;
  const override = scenario?.fs_queue_overrides?.[item.fs_item_id]?.[queue];
  if (override !== undefined) return override === 1;
  return itemQueues(item)[queue] === 1;
}

export function hasScenarioItemQueueDiff(
  item: BriefingFsSel,
  scenario: AssessmentScenario | null | undefined,
): boolean {
  if (isFsExcludedInScenario(scenario, item.fs_item_id)) return true;
  const itemOverride = scenario?.fs_queue_overrides?.[item.fs_item_id];
  if (!itemOverride) return false;
  const base = itemQueues(item);
  return FS_QUEUE_KEYS.some(q => itemOverride[q] !== undefined && itemOverride[q] !== base[q]);
}

export function countScenarioFsQueueOverrides(
  scenario: AssessmentScenario | null | undefined,
): number {
  return Object.keys(scenario?.fs_queue_overrides ?? {}).length;
}

/** Persist full queue map as diffs vs base queues_json. */
export function setScenarioItemQueues(
  scenario: AssessmentScenario,
  item: BriefingFsSel,
  nextQueues: FsQueuesMap,
): AssessmentScenario {
  const base = itemQueues(item);
  const nextOverrides = { ...(scenario.fs_queue_overrides ?? {}) };
  const itemId = item.fs_item_id;
  const itemOverride: Partial<FsQueuesMap> = {};

  for (const q of FS_QUEUE_KEYS) {
    const nextOn = nextQueues[q] === 1;
    const baseOn = base[q] === 1;
    if (nextOn !== baseOn) itemOverride[q] = nextOn ? 1 : 0;
  }

  if (Object.keys(itemOverride).length === 0) {
    delete nextOverrides[itemId];
  } else {
    nextOverrides[itemId] = itemOverride;
  }

  const hasDiffs = Object.keys(nextOverrides).length > 0;
  return {
    ...scenario,
    fs_queue_overrides: hasDiffs ? nextOverrides : undefined,
    updated_at: new Date().toISOString(),
  };
}

export function setScenarioItemQueue(
  scenario: AssessmentScenario,
  item: BriefingFsSel,
  queue: FsQueueKey,
  enabled: boolean,
): AssessmentScenario {
  const current = Object.fromEntries(
    FS_QUEUE_KEYS.map(q => [q, getScenarioItemQueueEnabled(item, scenario, q) ? 1 : 0]),
  ) as FsQueuesMap;
  current[queue] = enabled ? 1 : 0;
  return setScenarioItemQueues(scenario, item, current);
}

/** Move item to a single queue (как D&D в брифе): только target = Да. */
export function moveScenarioItemToQueue(
  scenario: AssessmentScenario,
  item: BriefingFsSel,
  targetQueue: FsQueueKey,
): AssessmentScenario {
  const nextQueues = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as FsQueuesMap;
  nextQueues[targetQueue] = 1;
  return setScenarioItemQueues(scenario, item, nextQueues);
}

export type ScenarioSpDelta = QueueSpTotals;

export function computeScenarioSpDelta(
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null | undefined,
): { base: ScenarioSpDelta; scenario: ScenarioSpDelta } {
  return {
    base: computeQueueSpFromFs(fsItems),
    scenario: computeQueueSpFromFs(resolveScenarioFsItems(fsItems, scenario)),
  };
}

const FS_DEPENDENT_PHASE_IDS = ['r76', 'r77', 'r78', 'r80', 'r81', 'r82'];

export function scenarioFsExclusionWarnings(
  scenario: AssessmentScenario | null | undefined,
): string[] {
  const warnings: string[] = [];
  const excluded = scenario?.fs_excluded?.length ?? 0;
  const redistributed = countScenarioFsQueueOverrides(scenario);

  if (excluded > 0) {
    warnings.push(
      `Исключено пунктов ФС: ${excluded}. Пересчитываются SP (C20/C21/D20) и фазы, зависящие от объёма.`,
    );
    warnings.push(
      `Затронуты в том числе: ${FS_DEPENDENT_PHASE_IDS.join(', ')} (и др. при наличии SP).`,
    );
  }
  if (redistributed > 0) {
    warnings.push(
      `Перераспределено между очередями: ${redistributed} пункт(ов). SP по очередям и зависимые фазы пересчитываются; база на «ФС + очереди» не меняется.`,
    );
  }
  return warnings;
}

export function hasScenarioFsChanges(
  scenario: AssessmentScenario | null | undefined,
): boolean {
  return (scenario?.fs_excluded?.length ?? 0) > 0
    || countScenarioFsQueueOverrides(scenario) > 0;
}

export function setScenarioPhaseEnabled(
  scenario: AssessmentScenario,
  base: BriefingAssessment,
  queue: FsQueueKey,
  lineId: string,
  enabled: boolean,
): AssessmentScenario {
  const baseVal = getBasePhaseEnabled(base, queue, lineId);
  const nextPhaseEnabled: NonNullable<AssessmentScenario['phase_enabled']> = {
    ...(scenario.phase_enabled ?? {}),
  };
  const nextQueue = { ...(nextPhaseEnabled[queue] ?? {}) };

  if (enabled === baseVal) {
    delete nextQueue[lineId];
    if (Object.keys(nextQueue).length === 0) {
      delete nextPhaseEnabled[queue];
    } else {
      nextPhaseEnabled[queue] = nextQueue;
    }
  } else {
    nextPhaseEnabled[queue] = { ...nextQueue, [lineId]: enabled };
  }

  const hasDiffs = Object.keys(nextPhaseEnabled).length > 0;
  return {
    ...scenario,
    phase_enabled: hasDiffs ? nextPhaseEnabled : undefined,
    updated_at: new Date().toISOString(),
  };
}

export interface ScenarioOtTotals {
  byPhase: Record<string, number>;
  grandTotal: number;
  weeksByPhase: Record<string, number>;
  grandTotalWeeks: number;
  detailByPhase: Record<string, ScenarioPhaseDetail>;
  grandDetail: ScenarioPhaseDetail;
}

export function computeScenarioOtTotals(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
): ScenarioOtTotals {
  const activeQueues = getEvaluatedQueueKeys(assessment.org_volume);
  const otRisks = assessment.effective_risks_ot;
  const doRisks = assessment.effective_risks_do;
  const byPhase: Record<string, number> = {};
  const weeksByPhase: Record<string, number> = {};
  const detailByPhase: Record<string, ScenarioPhaseDetail> = {};
  let grandTotal = 0;
  let grandTotalWeeks = 0;
  let grandDetail = { ...EMPTY_SCENARIO_PHASE_DETAIL };

  for (const q of activeQueues) {
    const queueLines = assessment.phase_calc?.queues?.[q] ?? {};
    const bases = computeAllPhaseBases(q, assessment, fsItems);
    const prods = computeAllPhaseProds(
      q, assessment, fsItems, otRisks, doRisks,
      accuracyPct, defaultTeam, queueLines, bases,
    );
    for (const def of assessment.phase_calc_defs ?? []) {
      const enabled = queueLines[def.id] ?? def.default_enabled;
      const doSide = prods[def.id]?.do;
      if (!enabled || !doSide) continue;

      const piece = detailFromProdSide(doSide, doRisks);
      detailByPhase[def.id] = addScenarioPhaseDetails(
        detailByPhase[def.id] ?? { ...EMPTY_SCENARIO_PHASE_DETAIL },
        piece,
      );
      byPhase[def.id] = (byPhase[def.id] ?? 0) + doSide.total;
      grandTotal += doSide.total;

      if (doSide.weeks > 0) {
        weeksByPhase[def.id] = (weeksByPhase[def.id] ?? 0) + doSide.weeks;
        grandTotalWeeks += doSide.weeks;
      }
      grandDetail = addScenarioPhaseDetails(grandDetail, piece);
    }
  }

  return { byPhase, grandTotal, weeksByPhase, grandTotalWeeks, detailByPhase, grandDetail };
}

export interface ScenarioComparison {
  base: ScenarioOtTotals;
  scenario: ScenarioOtTotals;
}

export function computeScenarioComparison(
  baseAssessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null | undefined,
  accuracyPct: number,
  defaultTeam: TeamProportions,
  nsi?: AssessmentNsiCache,
  headcount?: number | null,
): ScenarioComparison {
  const base = computeScenarioOtTotals(baseAssessment, fsItems, accuracyPct, defaultTeam);
  const { assessment: effective, fsItems: scenarioFs } = resolveScenarioForCalc(
    baseAssessment, scenario, fsItems, nsi, headcount,
  );
  const scenarioTotals = computeScenarioOtTotals(effective, scenarioFs, accuracyPct, defaultTeam);
  return {
    base: normalizeScenarioOtTotals(base),
    scenario: normalizeScenarioOtTotals(scenarioTotals),
  };
}

export function phaseRowsForComparison(defs: PhaseCalcLineDef[]): PhaseCalcLineDef[] {
  return defs.filter(d => d.is_phase);
}

export interface CreateSnapshotPayload {
  scenario_id: string | null;
  name: string;
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
  /** Self-contained HTML коммерческого предложения */
  kp_html?: string;
}

export function buildScenarioSnapshotPayload(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null,
  accuracyPct: number,
  defaultTeam: TeamProportions,
  options: {
    name: string;
    sent_to_client: boolean;
    extended: boolean;
    base_revision?: string;
  },
  nsi?: AssessmentNsiCache,
): CreateSnapshotPayload {
  const comparison = computeScenarioComparison(
    assessment, fsItems, scenario, accuracyPct, defaultTeam, nsi,
  );
  const sp = computeScenarioSpDelta(fsItems, scenario);

  const payload: CreateSnapshotPayload = {
    scenario_id: scenario?.id ?? null,
    name: options.name,
    sent_to_client: options.sent_to_client,
    extended: options.extended,
    scenario_overrides: scenario ? { ...scenario } : null,
    results: {
      comparison,
      sp_functional_all_queues: sp.base.all_queues,
      scenario_sp_functional_all_queues: sp.scenario.all_queues,
    },
    base_revision: options.base_revision,
  };

  if (options.extended) {
    payload.extended_dump = {
      assessment: JSON.parse(JSON.stringify(assessment)),
      fs_items: JSON.parse(JSON.stringify(fsItems)),
      accuracy_pct: accuracyPct,
      team_fte_sum: sumTeamFte(defaultTeam),
    };
  }

  return payload;
}
