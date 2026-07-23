import type {
  AssessmentScenario, BriefingAssessment, BriefingFsSel, FsQueueKey, ScenarioPhaseDetail,
  TeamProportions,
} from './types';
import { FS_QUEUE_KEYS, itemQueues } from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import { getEvaluatedQueueKeys } from './assessmentCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { computeAllPhaseProds } from './phaseCalcProd';
import {
  EMPTY_SCENARIO_PHASE_DETAIL,
  addScenarioPhaseDetails,
  detailFromProdSide,
  resolveScenarioForCalc,
} from './scenarioCalc';

export const SUMMARY_BASE_COLUMN_ID = 'base';
export const SUMMARY_TOTAL_GROUP_ID = 'total';

export interface SummaryScenarioColumn {
  id: string;
  name: string;
  isBase: boolean;
}

/** Header group: one queue or the final «Итого» block. */
export interface SummaryMatrixGroup {
  id: string;
  kind: 'queue' | 'total';
  queue?: FsQueueKey;
  /** Variants shown under this group (always База first, then scenarios with relevant deltas). */
  variants: SummaryScenarioColumn[];
}

export interface SummaryScenarioMatrixRow {
  lineId: string;
  label: string;
  /** columnId → queue → detail ДО */
  byColumnByQueue: Record<string, Partial<Record<FsQueueKey, ScenarioPhaseDetail>>>;
  /** columnId → sum across queues */
  byColumnTotal: Record<string, ScenarioPhaseDetail>;
}

export interface SummaryScenarioMatrix {
  activeQueues: FsQueueKey[];
  columns: SummaryScenarioColumn[];
  groups: SummaryMatrixGroup[];
  rows: SummaryScenarioMatrixRow[];
  /** columnId → queue → detail */
  queueTotals: Record<string, Partial<Record<FsQueueKey, ScenarioPhaseDetail>>>;
  /** columnId → grand detail */
  grandTotals: Record<string, ScenarioPhaseDetail>;
}

/**
 * Whether scenario delta affects this queue (by intent, not by DO numbers):
 * phases, technology, FS exclusion or FS queue overrides.
 */
export function scenarioAffectsQueue(
  scenario: AssessmentScenario,
  fsItems: BriefingFsSel[],
  queue: FsQueueKey,
): boolean {
  const phaseDelta = scenario.phase_enabled?.[queue];
  if (phaseDelta && Object.keys(phaseDelta).length > 0) return true;

  if (scenario.queue_technology?.[queue]) return true;

  const overrides = scenario.fs_queue_overrides;
  if (overrides) {
    for (const itemOverride of Object.values(overrides)) {
      if (!itemOverride) continue;
      if (itemOverride[queue] !== undefined) return true;
    }
  }

  const excluded = scenario.fs_excluded;
  if (excluded?.length) {
    const excludedSet = new Set(excluded);
    for (const item of fsItems) {
      if (!excludedSet.has(item.fs_item_id)) continue;
      if (itemQueues(item)[queue] === 1) return true;
    }
  }

  return false;
}

export function scenarioHasAnyChanges(
  scenario: AssessmentScenario,
): boolean {
  if (scenario.phase_enabled) {
    for (const q of FS_QUEUE_KEYS) {
      const delta = scenario.phase_enabled[q];
      if (delta && Object.keys(delta).length > 0) return true;
    }
  }
  if (scenario.queue_technology && Object.keys(scenario.queue_technology).length > 0) {
    return true;
  }
  if (scenario.fs_excluded && scenario.fs_excluded.length > 0) return true;
  if (scenario.fs_queue_overrides && Object.keys(scenario.fs_queue_overrides).length > 0) {
    return true;
  }
  return false;
}

function computeQueueDoByPhase(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
): { byPhase: Record<string, ScenarioPhaseDetail>; totalDetail: ScenarioPhaseDetail } {
  const empty = { byPhase: {}, totalDetail: { ...EMPTY_SCENARIO_PHASE_DETAIL } };
  const otRisks = assessment.effective_risks_ot ?? assessment.auto_risks;
  const doRisks = assessment.effective_risks_do ?? assessment.auto_risks;
  if (!otRisks || !doRisks) return empty;

  const queueLines = assessment.phase_calc?.queues?.[queue] ?? {};
  const bases = computeAllPhaseBases(queue, assessment, fsItems);
  const prods = computeAllPhaseProds(
    queue, assessment, fsItems, otRisks, doRisks,
    accuracyPct, defaultTeam, queueLines, bases,
  );

  const byPhase: Record<string, ScenarioPhaseDetail> = {};
  let totalDetail = { ...EMPTY_SCENARIO_PHASE_DETAIL };

  for (const def of assessment.phase_calc_defs ?? []) {
    if (!def.is_phase) continue;
    const enabled = queueLines[def.id] ?? def.default_enabled;
    const doSide = prods[def.id]?.do;
    if (!enabled || !doSide || !(doSide.total > 0)) continue;
    const piece = detailFromProdSide(doSide, doRisks);
    byPhase[def.id] = piece;
    totalDetail = addScenarioPhaseDetails(totalDetail, piece);
  }

  return { byPhase, totalDetail };
}

function computeColumnQueueDo(
  columnId: string,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  activeQueues: FsQueueKey[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
  target: {
    queueTotals: Record<string, Partial<Record<FsQueueKey, ScenarioPhaseDetail>>>;
    grandTotals: Record<string, ScenarioPhaseDetail>;
    rowByPhase: Map<string, SummaryScenarioMatrixRow>;
  },
): void {
  target.grandTotals[columnId] = { ...EMPTY_SCENARIO_PHASE_DETAIL };
  target.queueTotals[columnId] = {};

  for (const q of activeQueues) {
    const { byPhase, totalDetail } = computeQueueDoByPhase(
      q, assessment, fsItems, accuracyPct, defaultTeam,
    );
    if (totalDetail.total > 0) {
      target.queueTotals[columnId]![q] = totalDetail;
      target.grandTotals[columnId] = addScenarioPhaseDetails(
        target.grandTotals[columnId],
        totalDetail,
      );
    }

    for (const [lineId, detail] of Object.entries(byPhase)) {
      const row = target.rowByPhase.get(lineId);
      if (!row) continue;
      if (!row.byColumnByQueue[columnId]) row.byColumnByQueue[columnId] = {};
      row.byColumnByQueue[columnId]![q] = detail;
      row.byColumnTotal[columnId] = addScenarioPhaseDetails(
        row.byColumnTotal[columnId] ?? { ...EMPTY_SCENARIO_PHASE_DETAIL },
        detail,
      );
    }
  }
}

export function computeSummaryScenarioMatrix(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  scenarios: AssessmentScenario[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
  nsi?: AssessmentNsiCache,
): SummaryScenarioMatrix | null {
  const orgVolume = assessment.org_volume?.queues
    ? assessment.org_volume
    : assessment.auto_org_volume;
  const activeQueues = getEvaluatedQueueKeys(orgVolume);
  if (activeQueues.length === 0) return null;

  const phaseDefs = (assessment.phase_calc_defs ?? []).filter(d => d.is_phase);
  if (phaseDefs.length === 0) return null;

  const baseCol: SummaryScenarioColumn = {
    id: SUMMARY_BASE_COLUMN_ID,
    name: 'База',
    isBase: true,
  };
  const scenarioCols = scenarios.map(s => ({
    id: s.id,
    name: s.name,
    isBase: false,
  }));
  const columns: SummaryScenarioColumn[] = [baseCol, ...scenarioCols];

  const groups: SummaryMatrixGroup[] = activeQueues.map(q => ({
    id: `queue-${q}`,
    kind: 'queue' as const,
    queue: q,
    variants: [
      baseCol,
      ...scenarios
        .filter(s => scenarioAffectsQueue(s, fsItems, q))
        .map(s => scenarioCols.find(c => c.id === s.id)!),
    ],
  }));

  const totalVariants = [
    baseCol,
    ...scenarios
      .filter(s => scenarioHasAnyChanges(s))
      .map(s => scenarioCols.find(c => c.id === s.id)!),
  ];
  groups.push({
    id: SUMMARY_TOTAL_GROUP_ID,
    kind: 'total',
    variants: totalVariants,
  });

  const rowByPhase = new Map<string, SummaryScenarioMatrixRow>();
  for (const def of phaseDefs) {
    rowByPhase.set(def.id, {
      lineId: def.id,
      label: def.label,
      byColumnByQueue: {},
      byColumnTotal: {},
    });
  }

  const target = {
    queueTotals: {} as Record<string, Partial<Record<FsQueueKey, ScenarioPhaseDetail>>>,
    grandTotals: {} as Record<string, ScenarioPhaseDetail>,
    rowByPhase,
  };

  computeColumnQueueDo(
    SUMMARY_BASE_COLUMN_ID,
    assessment,
    fsItems,
    activeQueues,
    accuracyPct,
    defaultTeam,
    target,
  );

  for (const scenario of scenarios) {
    const { assessment: effective, fsItems: scenarioFs } = resolveScenarioForCalc(
      assessment, scenario, fsItems, nsi,
    );
    computeColumnQueueDo(
      scenario.id,
      effective,
      scenarioFs,
      activeQueues,
      accuracyPct,
      defaultTeam,
      target,
    );
  }

  const rows = phaseDefs
    .map(def => rowByPhase.get(def.id)!)
    .filter(row => columns.some(col => (row.byColumnTotal[col.id]?.total ?? 0) > 0));

  return {
    activeQueues,
    columns,
    groups,
    rows,
    queueTotals: target.queueTotals,
    grandTotals: target.grandTotals,
  };
}
