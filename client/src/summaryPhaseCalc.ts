import type {
  BriefingAssessment, BriefingFsSel, FsQueueKey, TeamProportions,
} from './types';
import { getEvaluatedQueueKeys } from './assessmentCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { computeAllPhaseProds } from './phaseCalcProd';

export interface SummaryPhaseDoRow {
  lineId: string;
  label: string;
  byQueue: Partial<Record<FsQueueKey, number>>;
  total: number;
}

export interface SummaryPhaseDoTable {
  activeQueues: FsQueueKey[];
  rows: SummaryPhaseDoRow[];
  queueTotals: Partial<Record<FsQueueKey, number>>;
  grandTotal: number;
}

export function computeSummaryPhaseDoTable(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
): SummaryPhaseDoTable {
  const activeQueues = getEvaluatedQueueKeys(assessment.org_volume);
  const defs = (assessment.phase_calc_defs ?? []).filter(d => d.is_phase);
  const otRisks = assessment.effective_risks_ot;
  const doRisks = assessment.effective_risks_do;

  const rowMap = new Map<string, SummaryPhaseDoRow>();
  for (const def of defs) {
    rowMap.set(def.id, { lineId: def.id, label: def.label, byQueue: {}, total: 0 });
  }

  const queueTotals: Partial<Record<FsQueueKey, number>> = {};
  let grandTotal = 0;

  for (const q of activeQueues) {
    const queueLines = assessment.phase_calc?.queues?.[q] ?? {};
    const bases = computeAllPhaseBases(q, assessment, fsItems);
    const prods = computeAllPhaseProds(
      q, assessment, fsItems, otRisks, doRisks,
      accuracyPct, defaultTeam, queueLines, bases,
    );

    for (const def of defs) {
      const enabled = queueLines[def.id] ?? def.default_enabled;
      if (!enabled) continue;

      const doTotal = prods[def.id]?.do?.total;
      if (doTotal == null || !Number.isFinite(doTotal) || doTotal <= 0) continue;

      const row = rowMap.get(def.id)!;
      row.byQueue[q] = doTotal;
      row.total += doTotal;
      queueTotals[q] = (queueTotals[q] ?? 0) + doTotal;
      grandTotal += doTotal;
    }
  }

  const rows = defs
    .map(def => rowMap.get(def.id)!)
    .filter(row => row.total > 0);

  return { activeQueues, rows, queueTotals, grandTotal };
}
