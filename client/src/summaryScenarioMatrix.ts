import type {
  AssessmentScenario, BriefingAssessment, BriefingFsSel, FsQueueKey, TeamProportions,
} from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import { getEvaluatedQueueKeys } from './assessmentCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { computeAllPhaseProds } from './phaseCalcProd';
import { resolveScenarioAssessment, resolveScenarioFsItems } from './scenarioCalc';

export const SUMMARY_BASE_COLUMN_ID = 'base';

export interface SummaryScenarioColumn {
  id: string;
  name: string;
  isBase: boolean;
}

export interface SummaryScenarioMatrixRow {
  lineId: string;
  label: string;
  /** columnId → queue → ДО */
  byColumnByQueue: Record<string, Partial<Record<FsQueueKey, number>>>;
  /** columnId → sum across queues */
  byColumnTotal: Record<string, number>;
}

export interface SummaryScenarioMatrix {
  activeQueues: FsQueueKey[];
  columns: SummaryScenarioColumn[];
  rows: SummaryScenarioMatrixRow[];
  /** columnId → queue → ДО total */
  queueTotals: Record<string, Partial<Record<FsQueueKey, number>>>;
  /** columnId → grand ДО total */
  grandTotals: Record<string, number>;
}

function computeQueueDoByPhase(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
): { byPhase: Record<string, number>; total: number } {
  const otRisks = assessment.effective_risks_ot ?? assessment.auto_risks;
  const doRisks = assessment.effective_risks_do ?? assessment.auto_risks;
  if (!otRisks || !doRisks) {
    return { byPhase: {}, total: 0 };
  }
  const queueLines = assessment.phase_calc?.queues?.[queue] ?? {};
  const bases = computeAllPhaseBases(queue, assessment, fsItems);
  const prods = computeAllPhaseProds(
    queue, assessment, fsItems, otRisks, doRisks,
    accuracyPct, defaultTeam, queueLines, bases,
  );

  const byPhase: Record<string, number> = {};
  let total = 0;

  for (const def of assessment.phase_calc_defs ?? []) {
    if (!def.is_phase) continue;
    const enabled = queueLines[def.id] ?? def.default_enabled;
    const doTotal = prods[def.id]?.do?.total;
    if (!enabled || doTotal == null || !Number.isFinite(doTotal) || doTotal <= 0) continue;
    byPhase[def.id] = doTotal;
    total += doTotal;
  }

  return { byPhase, total };
}

function computeColumnQueueDo(
  columnId: string,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  activeQueues: FsQueueKey[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
  target: {
    byColumnByQueue: Record<string, Partial<Record<FsQueueKey, number>>>;
    byColumnTotal: Record<string, number>;
    queueTotals: Record<string, Partial<Record<FsQueueKey, number>>>;
    grandTotals: Record<string, number>;
    rowByPhase: Map<string, SummaryScenarioMatrixRow>;
  },
): void {
  target.byColumnTotal[columnId] = 0;
  target.grandTotals[columnId] = 0;
  target.queueTotals[columnId] = {};

  for (const q of activeQueues) {
    const { byPhase, total } = computeQueueDoByPhase(q, assessment, fsItems, accuracyPct, defaultTeam);
    target.queueTotals[columnId]![q] = total > 0 ? total : undefined;
    target.byColumnTotal[columnId] += total;
    target.grandTotals[columnId] += total;

    for (const [lineId, amount] of Object.entries(byPhase)) {
      const row = target.rowByPhase.get(lineId);
      if (!row) continue;
      if (!row.byColumnByQueue[columnId]) row.byColumnByQueue[columnId] = {};
      row.byColumnByQueue[columnId]![q] = amount;
      row.byColumnTotal[columnId] = (row.byColumnTotal[columnId] ?? 0) + amount;
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

  const columns: SummaryScenarioColumn[] = [
    { id: SUMMARY_BASE_COLUMN_ID, name: 'База', isBase: true },
    ...scenarios.map(s => ({ id: s.id, name: s.name, isBase: false })),
  ];

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
    byColumnByQueue: {} as Record<string, Partial<Record<FsQueueKey, number>>>,
    byColumnTotal: {} as Record<string, number>,
    queueTotals: {} as Record<string, Partial<Record<FsQueueKey, number>>>,
    grandTotals: {} as Record<string, number>,
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
    const effective = resolveScenarioAssessment(assessment, scenario, nsi);
    const scenarioFs = resolveScenarioFsItems(fsItems, scenario);
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
    .filter(row => columns.some(col => (row.byColumnTotal[col.id] ?? 0) > 0));

  return {
    activeQueues,
    columns,
    rows,
    queueTotals: target.queueTotals,
    grandTotals: target.grandTotals,
  };
}
