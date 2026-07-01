import type { BriefingAssessment, BriefingFsSel, FsQueueKey, RisksC51C57, TeamProportions } from './types';
import type { PhaseBaseResult } from './phaseCalc';
import { getEffectiveQueueRate } from './assessmentCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { effectiveTeamForPhaseLine, sumTeamFte } from './teamLabels';

export interface PhaseProdSide {
  /** L / V — полная производственная (свёрнутый столбец). */
  production: number;
  /** Производственная оценка без командировок. */
  productionCore: number;
  /** Командировочные. */
  travel: number;
  /** Бюджет с учётом рисков (произв. ядро × (1 + Σ% резервов)). */
  budgetWithRisks: number;
  /** F / P — итого с резервами. */
  total: number;
  hours: number;
  weeks: number;
}

export interface PhaseProdRow {
  ot: PhaseProdSide | null;
  do: PhaseProdSide | null;
}

export function sumRiskRates(risks: RisksC51C57): number {
  return risks.c52_rpo
    + risks.c53_company_fund
    + risks.c54_contract_rpo
    + risks.c55_contract_fund
    + risks.c56_sales_comp
    + risks.c57_rk;
}

function effectiveBaseSplit(base: PhaseBaseResult | null | undefined) {
  const total = base?.total ?? 0;
  const travel = base?.travel ?? 0;
  const core = base?.core ?? (total - travel);
  return { total, core, travel };
}

function buildProdSide(
  productionCore: number,
  travel: number,
  c32: number,
  risks: RisksC51C57,
  teamFteSum: number,
): PhaseProdSide {
  const production = productionCore + travel;
  const budgetWithRisks = productionCore * (1 + sumRiskRates(risks));
  const sales = production * risks.c56_sales_comp;
  const rk = production * risks.c57_rk;
  const fund = production * risks.c53_company_fund;
  const contractRisks = production * (risks.c54_contract_rpo + risks.c55_contract_fund);
  const rpo = production * risks.c52_rpo;
  const total = production + sales + rk + fund + contractRisks + rpo;
  const hours = c32 > 0 ? total / c32 : 0;
  const weeks = c32 > 0 && teamFteSum > 0
    ? Math.ceil(((production / c32) / 40) * 1.2 / teamFteSum)
    : 0;

  return {
    production,
    productionCore,
    travel,
    budgetWithRisks,
    total,
    hours,
    weeks,
  };
}

export function computePhaseProdRow(
  base: PhaseBaseResult | null | undefined,
  enabled: boolean,
  c32: number,
  accuracyPct: number,
  risksOt: RisksC51C57,
  risksDo: RisksC51C57,
  teamFteSum: number,
): PhaseProdRow {
  if (!enabled || base?.total == null || !Number.isFinite(base.total) || base.total <= 0 || c32 <= 0) {
    return { ot: null, do: null };
  }

  const { core, travel } = effectiveBaseSplit(base);
  const c58 = accuracyPct / 100;
  const doMult = 1 + c58;

  return {
    ot: buildProdSide(core, travel, c32, risksOt, teamFteSum),
    do: buildProdSide(core * doMult, travel * doMult, c32, risksDo, teamFteSum),
  };
}

export function computeAllPhaseProds(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  risksOt: RisksC51C57,
  risksDo: RisksC51C57,
  accuracyPct: number,
  defaultTeam: TeamProportions,
  enabledByLine: Record<string, boolean>,
  bases?: Record<string, PhaseBaseResult>,
): Record<string, PhaseProdRow> {
  const resolvedBases = bases ?? computeAllPhaseBases(queue, assessment, fsItems);
  const phaseCalc = assessment.phase_calc;
  const qc = assessment.queue_calcs.find(r => r.queue === queue);
  const c32 = qc
    ? getEffectiveQueueRate(qc, assessment.unified_rate_enabled, assessment.unified_rate)
    : 0;

  const result: Record<string, PhaseProdRow> = {};
  for (const def of assessment.phase_calc_defs ?? []) {
    const enabled = enabledByLine[def.id] ?? def.default_enabled;
    const teamFteSum = sumTeamFte(
      effectiveTeamForPhaseLine(queue, def.id, phaseCalc, defaultTeam),
    );
    result[def.id] = computePhaseProdRow(
      resolvedBases[def.id],
      enabled,
      c32,
      accuracyPct,
      risksOt,
      risksDo,
      teamFteSum,
    );
  }
  return result;
}
