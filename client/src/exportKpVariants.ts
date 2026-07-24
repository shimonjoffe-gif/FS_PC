import type {
  AssessmentScenario, BriefingAssessment, BriefingFsSel, FsQueueKey, TeamProportions,
} from './types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS, anyQueueEnabled, itemQueues } from './types';
import type { AssessmentNsiCache } from './assessmentNsi';
import { getEvaluatedQueueKeys } from './assessmentCalc';
import {
  baseEnabledFsItems,
  getScenarioItemQueueEnabled,
  isFsExcludedInScenario,
  resolveScenarioForCalc,
  resolveScenarioFsItems,
} from './scenarioCalc';
import { computeAllPhaseBases } from './phaseCalc';
import { computeAllPhaseProds } from './phaseCalcProd';

export type KpExportColumn = { id: string; name: string; isBase: boolean };

export type KpExportFsItem = {
  fs_item_id: number;
  prefix: string | null;
  name: string;
  group_name: string;
  group_prefix: string | null;
  story_points: number;
  /** columnId → queue → Да */
  queues: Record<string, Partial<Record<FsQueueKey, boolean>>>;
};

export type KpExportPhaseRow = {
  line_id: string;
  label: string;
  /** columnId → Итого ДО */
  totals: Record<string, number>;
};

export type KpVariantsExportPayload = {
  columns: KpExportColumn[];
  queue_keys: FsQueueKey[];
  queue_labels: Record<string, string>;
  fs_items: KpExportFsItem[];
  phase_rows: KpExportPhaseRow[];
  grand_totals: Record<string, number>;
};

function queuesForColumn(
  item: BriefingFsSel,
  columnId: string,
  scenario: AssessmentScenario | null,
): Partial<Record<FsQueueKey, boolean>> {
  const out: Partial<Record<FsQueueKey, boolean>> = {};
  if (columnId === 'base') {
    const q = itemQueues(item);
    for (const k of FS_QUEUE_KEYS) out[k] = q[k] === 1;
    return out;
  }
  if (isFsExcludedInScenario(scenario, item.fs_item_id)) {
    for (const k of FS_QUEUE_KEYS) out[k] = false;
    return out;
  }
  for (const k of FS_QUEUE_KEYS) {
    out[k] = getScenarioItemQueueEnabled(item, scenario, k);
  }
  return out;
}

function itemVisibleInAnyColumn(
  item: BriefingFsSel,
  columns: { id: string; scenario: AssessmentScenario | null }[],
): boolean {
  return columns.some(({ id, scenario }) => {
    if (id === 'base') return anyQueueEnabled(itemQueues(item));
    if (isFsExcludedInScenario(scenario, item.fs_item_id)) return false;
    return FS_QUEUE_KEYS.some(q => getScenarioItemQueueEnabled(item, scenario, q));
  });
}

function computeDoTotalsByPhase(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
): { byPhase: Record<string, number>; grand: number } {
  const otRisks = assessment.effective_risks_ot ?? assessment.auto_risks;
  const doRisks = assessment.effective_risks_do ?? assessment.auto_risks;
  if (!otRisks || !doRisks) return { byPhase: {}, grand: 0 };

  const activeQueues = getEvaluatedQueueKeys(assessment.org_volume);
  const byPhase: Record<string, number> = {};
  let grand = 0;

  for (const q of activeQueues) {
    const queueLines = assessment.phase_calc?.queues?.[q] ?? {};
    const bases = computeAllPhaseBases(q, assessment, fsItems);
    const prods = computeAllPhaseProds(
      q, assessment, fsItems, otRisks, doRisks,
      accuracyPct, defaultTeam, queueLines, bases,
    );
    for (const def of assessment.phase_calc_defs ?? []) {
      if (!def.is_phase) continue;
      const enabled = queueLines[def.id] ?? def.default_enabled;
      const doTotal = prods[def.id]?.do?.total;
      if (!enabled || doTotal == null || !(doTotal > 0)) continue;
      byPhase[def.id] = (byPhase[def.id] ?? 0) + doTotal;
      grand += doTotal;
    }
  }
  return { byPhase, grand };
}

/** Собрать read-only блок КП: ФС и итоги ДО по базе и выбранным сценариям. */
export function buildKpVariantsExportPayload(
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
  scenarios: AssessmentScenario[],
  selectedScenarioIds: string[],
  accuracyPct: number,
  defaultTeam: TeamProportions,
  queueLabels: Record<string, string>,
  nsi?: AssessmentNsiCache,
): KpVariantsExportPayload {
  const selected = scenarios.filter(s => selectedScenarioIds.includes(s.id));
  const columns: KpExportColumn[] = [
    { id: 'base', name: 'База', isBase: true },
    ...selected.map(s => ({ id: s.id, name: s.name, isBase: false })),
  ];
  const columnScenarios = columns.map(c => ({
    id: c.id,
    scenario: c.isBase ? null : selected.find(s => s.id === c.id) ?? null,
  }));

  const baseYes = baseEnabledFsItems(fsItems);
  const visibleItems = baseYes
    .filter(item => itemVisibleInAnyColumn(item, columnScenarios))
    .sort((a, b) => {
      const ga = a.group_prefix ?? a.group_name ?? '';
      const gb = b.group_prefix ?? b.group_name ?? '';
      if (ga !== gb) return String(ga).localeCompare(String(gb), 'ru', { numeric: true });
      return String(a.prefix ?? '').localeCompare(String(b.prefix ?? ''), 'ru', { numeric: true });
    });

  const fs_items: KpExportFsItem[] = visibleItems.map(item => {
    const queues: Record<string, Partial<Record<FsQueueKey, boolean>>> = {};
    for (const { id, scenario } of columnScenarios) {
      queues[id] = queuesForColumn(item, id, scenario);
    }
    return {
      fs_item_id: item.fs_item_id,
      prefix: item.prefix ?? item.code ?? null,
      name: item.name ?? '',
      group_name: item.group_name ?? item.phase ?? 'Прочее',
      group_prefix: item.group_prefix ?? null,
      story_points: item.story_points ?? item.catalog_story_points ?? 0,
      queues,
    };
  });

  const phaseDefs = (assessment.phase_calc_defs ?? []).filter(d => d.is_phase);
  const phase_rows: KpExportPhaseRow[] = phaseDefs.map(def => ({
    line_id: def.id,
    label: def.label,
    totals: {},
  }));
  const grand_totals: Record<string, number> = {};

  for (const { id, scenario } of columnScenarios) {
    const { assessment: eff, fsItems: effFs } = resolveScenarioForCalc(
      assessment, scenario, fsItems, nsi,
    );
    // For base, use original fs; resolveScenarioFsItems with null returns same
    const fsForCalc = scenario ? resolveScenarioFsItems(fsItems, scenario) : effFs;
    const { byPhase, grand } = computeDoTotalsByPhase(
      id === 'base' ? assessment : eff,
      id === 'base' ? fsItems : fsForCalc,
      accuracyPct,
      defaultTeam,
    );
    grand_totals[id] = grand;
    for (const row of phase_rows) {
      row.totals[id] = byPhase[row.line_id] ?? 0;
    }
  }

  const phase_rows_filtered = phase_rows.filter(row =>
    columns.some(c => (row.totals[c.id] ?? 0) > 0),
  );

  return {
    columns,
    queue_keys: [...FS_QUEUE_KEYS],
    queue_labels: { ...FS_QUEUE_LABELS, ...queueLabels },
    fs_items,
    phase_rows: phase_rows_filtered,
    grand_totals,
  };
}
