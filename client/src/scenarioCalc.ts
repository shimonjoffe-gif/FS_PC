import type {
  AssessmentScenario, BriefingAssessment, BriefingFsSel, FsQueueKey, PhaseCalcLineDef,
  ScenarioSnapshotResults,
} from './types';
import { FS_QUEUE_KEYS, anyQueueEnabled, itemQueues } from './types';
import type { FsQueuesMap } from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import {
  getActiveQueueKeys, computeQueueSpFromFs, getEffectiveQueueRate,
  getHourlyRateForTechnologyLabel, resolveQueueTechnology,
  normalizeQueueTechnologyLabel, QUEUE_TECHNOLOGY_OPTIONS,
} from './assessmentCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { computeAllPhaseProds } from './phaseCalcProd';

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
    result = { ...result, phase_calc: { queues: mergedQueues } };
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
): number {
  const effective = resolveScenarioAssessment(base, scenario, nsi);
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

/** Effective ФС for scenario: excluded items treated as off all queues (base catalog unchanged). */
export function resolveScenarioFsItems(
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null | undefined,
): BriefingFsSel[] {
  const excluded = new Set(scenario?.fs_excluded ?? []);
  if (excluded.size === 0) return fsItems;

  const offQueues = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as FsQueuesMap;
  return fsItems.map(item => {
    if (!excluded.has(item.fs_item_id)) return item;
    return { ...item, enabled: 0, queues_json: offQueues };
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
  return {
    ...scenario,
    fs_excluded: fs_excluded.length > 0 ? fs_excluded : undefined,
    updated_at: new Date().toISOString(),
  };
}

export interface ScenarioSpDelta {
  functional_sp: Record<FsQueueKey, number>;
  all_queues: number;
}

export function computeScenarioSpDelta(
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null | undefined,
): { base: ScenarioSpDelta; scenario: ScenarioSpDelta } {
  const base = computeQueueSpFromFs(fsItems);
  const sc = computeQueueSpFromFs(resolveScenarioFsItems(fsItems, scenario));
  return {
    base: { functional_sp: base.functional_sp, all_queues: base.all_queues },
    scenario: { functional_sp: sc.functional_sp, all_queues: sc.all_queues },
  };
}

const FS_DEPENDENT_PHASE_IDS = ['r76', 'r77', 'r78', 'r80', 'r81', 'r82'];

export function scenarioFsExclusionWarnings(
  scenario: AssessmentScenario | null | undefined,
): string[] {
  if (!scenario?.fs_excluded?.length) return [];
  return [
    `Исключено пунктов ФС: ${scenario.fs_excluded.length}. Пересчитываются SP (C20/C21/D20) и фазы, зависящие от объёма.`,
    `Затронуты в том числе: ${FS_DEPENDENT_PHASE_IDS.join(', ')} (и др. при наличии SP).`,
  ];
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
}

export function computeScenarioOtTotals(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  accuracyPct: number,
  teamFteSum: number,
): ScenarioOtTotals {
  const activeQueues = getActiveQueueKeys(assessment.org_volume);
  const otRisks = assessment.effective_risks_ot;
  const doRisks = assessment.effective_risks_do;
  const byPhase: Record<string, number> = {};
  let grandTotal = 0;

  for (const q of activeQueues) {
    const queueLines = assessment.phase_calc?.queues?.[q] ?? {};
    const bases = computeAllPhaseBases(q, assessment, fsItems);
    const prods = computeAllPhaseProds(
      q, assessment, fsItems, otRisks, doRisks,
      accuracyPct, teamFteSum, queueLines, bases,
    );
    for (const def of assessment.phase_calc_defs ?? []) {
      const enabled = queueLines[def.id] ?? def.default_enabled;
      const ot = prods[def.id]?.ot?.total;
      if (!enabled || ot == null || !Number.isFinite(ot)) continue;
      byPhase[def.id] = (byPhase[def.id] ?? 0) + ot;
      grandTotal += ot;
    }
  }

  return { byPhase, grandTotal };
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
  teamFteSum: number,
  nsi?: AssessmentNsiCache,
): ScenarioComparison {
  const base = computeScenarioOtTotals(baseAssessment, fsItems, accuracyPct, teamFteSum);
  const effective = resolveScenarioAssessment(baseAssessment, scenario, nsi);
  const scenarioFs = resolveScenarioFsItems(fsItems, scenario);
  const scenarioTotals = computeScenarioOtTotals(effective, scenarioFs, accuracyPct, teamFteSum);
  return { base, scenario: scenarioTotals };
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
}

export function buildScenarioSnapshotPayload(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  scenario: AssessmentScenario | null,
  accuracyPct: number,
  teamFteSum: number,
  options: {
    name: string;
    sent_to_client: boolean;
    extended: boolean;
    base_revision?: string;
  },
  nsi?: AssessmentNsiCache,
): CreateSnapshotPayload {
  const comparison = computeScenarioComparison(
    assessment, fsItems, scenario, accuracyPct, teamFteSum, nsi,
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
      team_fte_sum: teamFteSum,
    };
  }

  return payload;
}
