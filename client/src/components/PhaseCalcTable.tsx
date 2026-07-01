import { useEffect, useMemo, useState } from 'react';
import type {
  PhaseCalcLineDef, PhaseCalcState, FsQueueKey, RisksC51C57, RisksManualKeys,
  BriefingAssessment, BriefingFsSel, TeamProportions, QueueLabelsMap,
} from '../types';
import type { PhaseBaseResult } from '../phaseCalc';
import { computeAllPhaseBases } from '../phaseCalc';
import { computeAllPhaseProds, type PhaseProdSide } from '../phaseCalcProd';
import {
  formatRiskPct,
  parseRiskPctInput,
  isRiskKeyManual,
  hasAnyManualRiskKeys,
  computeReserveAmount,
  buildManualRiskPatchForSide,
  type RiskSide,
} from '../assessmentCalc';
import QueueSwitcher from './QueueSwitcher';
import { yesNoLabel, yesNoClass, YES_NO_BADGE_CLASS } from '../utils/yesNoBadge';
import { numericInputHandlers } from '../utils/numericInputHandlers';
import { formatMoneyRub, formatStepNumber, formatGroupedInteger } from '../utils/formatNumber';
import { TEAM_LABELS, sumTeamFte, effectiveTeamForPhaseLine } from '../teamLabels';

const PLACEHOLDER = '—';
const OVERRIDE_CLASS = 'bg-amber-50 border-amber-300';

type BreakdownLine = {
  id: string;
  label: string;
  riskKey: keyof RisksC51C57;
};

const ITogo_BREAKDOWN_LINES: BreakdownLine[] = [
  { id: 'rpo', label: 'Резерв РПО', riskKey: 'c52_rpo' },
  { id: 'company', label: 'Резерв компании', riskKey: 'c57_rk' },
  { id: 'sales', label: 'Компенсация продаж', riskKey: 'c56_sales_comp' },
  { id: 'fund', label: 'Фонд компании', riskKey: 'c53_company_fund' },
  { id: 'rpo_risks', label: 'Риски РПО', riskKey: 'c54_contract_rpo' },
  { id: 'fund_risks', label: 'Риски ФК', riskKey: 'c55_contract_fund' },
];

const BREAKDOWN_COLS = ITogo_BREAKDOWN_LINES.length;
const ITOGO_TOTAL_COLS = 1;
const FIXED_COL_COUNT = 3;
const PROD_COLS = 5;
const TEAM_ROLE_COLS = TEAM_LABELS.length;
const TEAM_EXPANDED_COLS = 1 + TEAM_ROLE_COLS;

export type PhaseCalcRiskPatch = {
  risks_ot?: Partial<RisksC51C57>;
  risks_do?: Partial<RisksC51C57>;
  risks_manual_ot?: boolean;
  risks_manual_do?: boolean;
  risks_manual_keys_ot?: RisksManualKeys;
  risks_manual_keys_do?: RisksManualKeys;
  reset_risks_ot?: boolean;
  reset_risks_do?: boolean;
  reset_risk_keys_ot?: (keyof RisksC51C57)[];
  reset_risk_keys_do?: (keyof RisksC51C57)[];
};

type SideRisksProps = {
  risks: RisksC51C57;
  storedRisks: Partial<RisksC51C57>;
  autoRisks: RisksC51C57;
  risksManualKeys: RisksManualKeys;
  risksManual: boolean;
};

type Props = {
  defs: PhaseCalcLineDef[];
  phaseCalc: PhaseCalcState;
  assessment: BriefingAssessment;
  fsItems: BriefingFsSel[];
  autoRisks: RisksC51C57;
  ot: SideRisksProps;
  doSide: SideRisksProps;
  /** Точность оценки C58, % */
  accuracyPct: number;
  /** Шаблон долей FTE (team_json) — для фаз без переопределения */
  defaultTeam: TeamProportions;
  onChange: (patch: Partial<PhaseCalcState>) => void;
  onRisksChange: (patch: PhaseCalcRiskPatch) => void;
  activeQueue?: FsQueueKey;
  onActiveQueueChange?: (q: FsQueueKey) => void;
  queueLabels?: QueueLabelsMap;
};

function formatSum(n: number | null): string {
  return formatMoneyRub(n, PLACEHOLDER);
}

function formatStepValue(n: number): string {
  return formatStepNumber(n, PLACEHOLDER);
}

function PhaseBaseExplainModal({
  lineLabel,
  result,
  onClose,
}: {
  lineLabel: string;
  result: PhaseBaseResult;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="min-w-0 pr-4">
            <div className="text-sm font-medium text-slate-800 truncate">{lineLabel}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Базовая стоимость (столбец C)</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto space-y-4 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Формула</div>
            <code className="block bg-slate-50 border rounded px-3 py-2 text-slate-700 font-mono text-[11px]">
              {result.formula}
            </code>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">Шаги расчёта</div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-[10px] text-slate-400">
                  <th className="p-1.5 border text-left font-normal">Параметр</th>
                  <th className="p-1.5 border text-left font-normal">Выражение</th>
                  <th className="p-1.5 border text-right font-normal w-28">Значение</th>
                </tr>
              </thead>
              <tbody>
                {result.steps.map((step, i) => {
                  if (step.kind === 'header') {
                    return (
                      <tr key={i} className="bg-slate-100">
                        <td
                          colSpan={3}
                          className="p-1.5 border text-slate-700 font-semibold text-[11px]"
                        >
                          {step.label}
                        </td>
                      </tr>
                    );
                  }
                  return (
                  <tr
                    key={i}
                    className={step.label === 'Итого' ? 'bg-blue-50 font-medium' : ''}
                  >
                    <td className="p-1.5 border text-slate-700">{step.label}</td>
                    <td className="p-1.5 border text-slate-500 font-mono text-[10px]">{step.expression}</td>
                    <td className="p-1.5 border text-right tabular-nums whitespace-nowrap">
                      {step.label === 'Итого' ? formatSum(step.value) : formatStepValue(step.value)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-100">
            <span className="text-slate-500">Итого базовая стоимость</span>
            <span className="text-base font-semibold tabular-nums">{formatSum(result.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProdCells({
  expanded,
  side,
  hoursTitle,
  daysTitle,
}: {
  expanded: boolean;
  side: PhaseProdSide | null | undefined;
  hoursTitle?: string;
  daysTitle?: string;
}) {
  if (expanded) {
    return (
      <>
        <td className="p-2 border text-right tabular-nums whitespace-nowrap">
          {side ? formatSum(side.budgetWithRisks) : PLACEHOLDER}
        </td>
        <td className="p-2 border text-right tabular-nums whitespace-nowrap">
          {side ? formatSum(side.travel) : PLACEHOLDER}
        </td>
        <td className="p-2 border text-right tabular-nums whitespace-nowrap">
          {side ? formatSum(side.productionCore) : PLACEHOLDER}
        </td>
        <td
          className="p-2 border text-right tabular-nums whitespace-nowrap"
          title={hoursTitle}
        >
          {side ? formatStepValue(side.hours) : PLACEHOLDER}
        </td>
        <td
          className="p-2 border text-right tabular-nums whitespace-nowrap"
          title={daysTitle}
        >
          {side ? formatStepValue(side.weeks) : PLACEHOLDER}
        </td>
      </>
    );
  }
  return (
    <td className="p-2 border text-right tabular-nums whitespace-nowrap">
      {side ? formatSum(side.production) : PLACEHOLDER}
    </td>
  );
}

function TeamSubHeaders() {
  return (
    <>
      <th className="p-1 border text-right font-semibold text-slate-600 whitespace-nowrap bg-slate-100/80">
        Итого FTE
      </th>
      {TEAM_LABELS.map(({ key, label }) => (
        <th
          key={key}
          className="p-1 border text-right font-normal whitespace-nowrap min-w-[4.5rem]"
          title={label}
        >
          {label}
        </th>
      ))}
    </>
  );
}

function TeamCells({
  expanded,
  enabled,
  team,
  teamFteSum,
  onTeamRoleChange,
}: {
  expanded: boolean;
  enabled: boolean;
  team: TeamProportions;
  teamFteSum: number;
  onTeamRoleChange?: (key: keyof TeamProportions, value: number) => void;
}) {
  if (!enabled) {
    if (expanded) {
      return (
        <>
          <td className="p-2 border text-right tabular-nums text-slate-400">{PLACEHOLDER}</td>
          {TEAM_LABELS.map(({ key }) => (
            <td key={key} className="p-2 border text-right tabular-nums text-slate-400">{PLACEHOLDER}</td>
          ))}
        </>
      );
    }
    return (
      <td className="p-2 border text-right tabular-nums text-slate-400">{PLACEHOLDER}</td>
    );
  }
  if (expanded) {
    return (
      <>
        <td className="p-2 border text-right tabular-nums font-medium bg-slate-50/80">
          {formatStepValue(teamFteSum)}
        </td>
        {TEAM_LABELS.map(({ key, label }) => (
          <td key={key} className="p-1 border text-right tabular-nums">
            {onTeamRoleChange ? (
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="w-full text-right border rounded px-1 py-0.5 tabular-nums text-[11px]"
                value={team[key]}
                title={label}
                onChange={e => onTeamRoleChange(key, Number(e.target.value))}
                {...numericInputHandlers}
              />
            ) : (
              formatStepValue(team[key])
            )}
          </td>
        ))}
      </>
    );
  }
  return (
    <td className="p-2 border text-right tabular-nums font-medium" title="Σ FTE команды">
      {formatStepValue(teamFteSum)}
    </td>
  );
}

function ProdSubHeaders() {
  return (
    <>
      <th className="p-1 border text-right font-normal min-w-[8rem] whitespace-nowrap" title="Произв. ядро × (1 + Σ% резервов)">
        Бюджет с учётом рисков
      </th>
      <th className="p-1 border text-right font-normal min-w-[7rem] whitespace-nowrap">
        Командировочные
      </th>
      <th className="p-1 border text-right font-normal min-w-[8rem] whitespace-nowrap">
        Производственная оценка
      </th>
      <th className="p-1 border text-right font-normal w-20">Часы</th>
      <th className="p-1 border text-right font-normal w-20">Недели</th>
    </>
  );
}

function BreakdownCells({
  lineId,
  risks,
  prodAmount,
}: {
  lineId: string;
  risks: RisksC51C57;
  prodAmount?: number | null;
}) {
  const line = ITogo_BREAKDOWN_LINES.find(l => l.id === lineId);
  if (!line) return null;
  const pct = risks[line.riskKey];
  const sum = computeReserveAmount(prodAmount, pct);
  return (
    <td
      className="p-1.5 border text-right whitespace-nowrap tabular-nums"
      title={`${line.label}: ${formatRiskPct(pct)} × ${prodAmount != null ? formatGroupedInteger(prodAmount) : '—'}`}
    >
      <div className="text-[10px] text-slate-400 leading-tight">{formatRiskPct(pct)}</div>
      <div>{sum != null ? formatSum(sum) : PLACEHOLDER}</div>
    </td>
  );
}

function ItogoTotalHeader() {
  return (
    <th className="p-1 border text-right font-semibold text-slate-600 whitespace-nowrap bg-slate-100/80">
      Итого ₽
    </th>
  );
}

function ItogoTotalCell({ total }: { total: number | null | undefined }) {
  return (
    <td className="p-1.5 border text-right tabular-nums whitespace-nowrap font-medium bg-slate-50/80">
      {total != null && Number.isFinite(total) ? formatSum(total) : PLACEHOLDER}
    </td>
  );
}

function PctCell({
  riskKey,
  risks,
  storedRisks,
  autoRisks,
  risksManualKeys,
  risksManual,
  draft,
  onDraft,
  onCommit,
  onReset,
}: {
  riskKey: keyof RisksC51C57;
  risks: RisksC51C57;
  storedRisks: Partial<RisksC51C57>;
  autoRisks: RisksC51C57;
  risksManualKeys: RisksManualKeys;
  risksManual: boolean;
  draft?: string;
  onDraft: (raw: string | undefined) => void;
  onCommit: (value: number) => void;
  onReset: () => void;
}) {
  const manual = isRiskKeyManual(riskKey, risksManualKeys, risksManual, storedRisks);
  const overridden = manual && risks[riskKey] !== autoRisks[riskKey];

  return (
    <th className="p-0.5 border font-normal align-top">
      <div className="flex flex-col items-stretch gap-0.5 min-w-[72px]">
        <input
          type="text"
          inputMode="decimal"
          className={`w-full text-right border rounded px-1 py-0.5 text-[10px] ${overridden ? OVERRIDE_CLASS : ''}`}
          value={draft !== undefined ? draft : formatRiskPct(risks[riskKey])}
          onChange={e => {
            const raw = e.target.value;
            onDraft(raw);
            const parsed = parseRiskPctInput(raw);
            if (parsed != null) onCommit(parsed);
          }}
          onBlur={e => {
            const parsed = parseRiskPctInput(e.target.value);
            onDraft(undefined);
            if (parsed != null) onCommit(parsed);
          }}
          title={overridden ? `Авто: ${formatRiskPct(autoRisks[riskKey])}` : undefined}
          {...numericInputHandlers}
        />
        {overridden && (
          <button
            type="button"
            className="text-[9px] text-blue-600 hover:underline self-end leading-none"
            onClick={onReset}
          >
            Сбросить
          </button>
        )}
      </div>
    </th>
  );
}

export default function PhaseCalcTable({
  defs,
  phaseCalc,
  assessment,
  fsItems,
  autoRisks,
  ot,
  doSide,
  accuracyPct,
  defaultTeam,
  onChange,
  onRisksChange,
  activeQueue: activeQueueProp,
  onActiveQueueChange,
  queueLabels,
}: Props) {
  const [internalQueue, setInternalQueue] = useState<FsQueueKey>('1');
  const activeQueue = activeQueueProp ?? internalQueue;
  const setActiveQueue = (q: FsQueueKey) => {
    if (onActiveQueueChange) onActiveQueueChange(q);
    else setInternalQueue(q);
  };
  const [prodOtExpanded, setProdOtExpanded] = useState(false);
  const [prodDoExpanded, setProdDoExpanded] = useState(false);
  const [teamExpanded, setTeamExpanded] = useState(false);
  const [otExpanded, setOtExpanded] = useState(false);
  const [doExpanded, setDoExpanded] = useState(false);
  const [pctDrafts, setPctDrafts] = useState<Partial<Record<RiskSide, Partial<Record<keyof RisksC51C57, string>>>>>({});
  const [explainLineId, setExplainLineId] = useState<string | null>(null);

  const queueLines = phaseCalc?.queues?.[activeQueue] ?? {};

  const baseByLine = useMemo(
    () => computeAllPhaseBases(activeQueue, assessment, fsItems),
    [activeQueue, assessment, fsItems],
  );

  const prodByLine = useMemo(
    () => computeAllPhaseProds(
      activeQueue,
      assessment,
      fsItems,
      ot.risks,
      doSide.risks,
      accuracyPct,
      defaultTeam,
      queueLines,
      baseByLine,
    ),
    [activeQueue, assessment, fsItems, ot.risks, doSide.risks, accuracyPct, defaultTeam, queueLines, baseByLine],
  );

  const explainDef = explainLineId ? defs.find(d => d.id === explainLineId) : null;
  const explainResult = explainLineId ? baseByLine[explainLineId] : null;

  const prodOtColSpan = prodOtExpanded ? PROD_COLS : 1;
  const prodDoColSpan = prodDoExpanded ? PROD_COLS : 1;
  const teamColSpan = teamExpanded ? TEAM_EXPANDED_COLS : 1;
  const otColSpan = otExpanded ? BREAKDOWN_COLS + ITOGO_TOTAL_COLS : 1;
  const doColSpan = doExpanded ? BREAKDOWN_COLS + ITOGO_TOTAL_COLS : 1;
  const showSubHeader = prodOtExpanded || prodDoExpanded || teamExpanded || otExpanded || doExpanded;
  const showPctRow = otExpanded || doExpanded;
  const hasManualOt = hasAnyManualRiskKeys(ot.risksManualKeys, ot.risksManual);
  const hasManualDo = hasAnyManualRiskKeys(doSide.risksManualKeys, doSide.risksManual);

  function setPhaseTeam(lineId: string, next: TeamProportions) {
    onChange({
      team_fte: {
        ...(phaseCalc?.team_fte ?? {}),
        [activeQueue]: {
          ...(phaseCalc?.team_fte?.[activeQueue] ?? {}),
          [lineId]: next,
        },
      },
    });
  }

  function toggleLine(lineId: string) {
    const current = queueLines[lineId] ?? false;
    onChange({
      queues: {
        ...(phaseCalc?.queues ?? {}),
        [activeQueue]: {
          ...queueLines,
          [lineId]: !current,
        },
      },
    });
  }

  function sideContext(side: RiskSide) {
    return {
      auto_risks: autoRisks,
      risks_ot: ot.storedRisks,
      risks_do: doSide.storedRisks,
      risks_manual_keys_ot: ot.risksManualKeys,
      risks_manual_keys_do: doSide.risksManualKeys,
      risks_manual_ot: ot.risksManual,
      risks_manual_do: doSide.risksManual,
    };
  }

  function setRiskPct(side: RiskSide, key: keyof RisksC51C57, value: number) {
    onRisksChange(buildManualRiskPatchForSide(side, key, value, sideContext(side)) as PhaseCalcRiskPatch);
  }

  function resetRiskKey(side: RiskSide, key: keyof RisksC51C57) {
    setPctDrafts(prev => {
      const next = { ...prev };
      if (next[side]) {
        const sideDrafts = { ...next[side] };
        delete sideDrafts[key];
        next[side] = sideDrafts;
      }
      return next;
    });
    onRisksChange(side === 'ot' ? { reset_risk_keys_ot: [key] } : { reset_risk_keys_do: [key] });
  }

  function resetAllRisks(side: RiskSide) {
    setPctDrafts(prev => {
      const next = { ...prev };
      delete next[side];
      return next;
    });
    onRisksChange(side === 'ot' ? { reset_risks_ot: true } : { reset_risks_do: true });
  }

  function renderYesNo(enabled: boolean, lineId: string) {
    return (
      <button
        type="button"
        className={`${YES_NO_BADGE_CLASS} min-w-[36px] cursor-pointer ${yesNoClass(enabled)}`}
        onClick={() => toggleLine(lineId)}
      >
        {yesNoLabel(enabled)}
      </button>
    );
  }

  function renderExpandButton(expanded: boolean, onToggle: () => void, title: string) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700"
        onClick={onToggle}
        title={title}
      >
        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
      </button>
    );
  }

  function renderPctCells(side: RiskSide, sideProps: SideRisksProps) {
    return ITogo_BREAKDOWN_LINES.map(line => (
      <PctCell
        key={`${side}-pct-${line.id}`}
        riskKey={line.riskKey}
        risks={sideProps.risks}
        storedRisks={sideProps.storedRisks}
        autoRisks={autoRisks}
        risksManualKeys={sideProps.risksManualKeys}
        risksManual={sideProps.risksManual}
        draft={pctDrafts[side]?.[line.riskKey]}
        onDraft={raw => setPctDrafts(prev => ({
          ...prev,
          [side]: { ...prev[side], [line.riskKey]: raw },
        }))}
        onCommit={value => setRiskPct(side, line.riskKey, value)}
        onReset={() => resetRiskKey(side, line.riskKey)}
      />
    ));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-slate-500">Расчёт фаз по очереди</div>
        <QueueSwitcher showLabel value={activeQueue} onChange={setActiveQueue} labels={queueLabels} />
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="p-2 border text-left min-w-[200px] sticky left-0 z-20 bg-slate-50">
                Название
              </th>
              <th className="p-2 border text-right min-w-[9.5rem] w-36 whitespace-nowrap">Базовая стоимость</th>
              <th className="p-2 border text-center w-20">Да/Нет</th>
              <th className="p-2 border text-center" colSpan={teamColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    teamExpanded,
                    () => setTeamExpanded(v => !v),
                    'Команда — итого FTE и доли по ролям',
                  )}
                  Команда
                </span>
              </th>
              <th className="p-2 border text-center" colSpan={prodOtColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    prodOtExpanded,
                    () => setProdOtExpanded(v => !v),
                    'Производственная ОТ — сумма, часы, недели',
                  )}
                  Производственная ОТ
                </span>
              </th>
              <th className="p-2 border text-center" colSpan={otColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    otExpanded,
                    () => setOtExpanded(v => !v),
                    'Итого ОТ — детализация резервов',
                  )}
                  Итого ОТ
                </span>
              </th>
              <th className="p-2 border text-center" colSpan={prodDoColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    prodDoExpanded,
                    () => setProdDoExpanded(v => !v),
                    'Производственная ДО — сумма, часы, недели',
                  )}
                  Производственная ДО
                </span>
              </th>
              <th className="p-2 border text-center" colSpan={doColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    doExpanded,
                    () => setDoExpanded(v => !v),
                    'Итого ДО — детализация резервов',
                  )}
                  Итого ДО
                </span>
              </th>
            </tr>
            {showSubHeader && (
              <tr className="bg-slate-50/80 text-[10px] text-slate-400">
                <th
                  className="p-1 border sticky left-0 z-20 bg-slate-50/80"
                  colSpan={FIXED_COL_COUNT}
                />
                {teamExpanded ? (
                  <TeamSubHeaders />
                ) : (
                  <th className="p-1 border" />
                )}
                {prodOtExpanded ? (
                  <ProdSubHeaders />
                ) : (
                  <th className="p-1 border" />
                )}
                {otExpanded ? (
                  <>
                    {ITogo_BREAKDOWN_LINES.map(line => (
                      <th
                        key={`ot-${line.id}`}
                        className="p-1 border text-right font-normal whitespace-nowrap"
                        title={line.label}
                      >
                        {line.label} ₽
                      </th>
                    ))}
                    <ItogoTotalHeader />
                  </>
                ) : (
                  <th className="p-1 border" />
                )}
                {prodDoExpanded ? (
                  <ProdSubHeaders />
                ) : (
                  <th className="p-1 border" />
                )}
                {doExpanded ? (
                  <>
                    {ITogo_BREAKDOWN_LINES.map(line => (
                      <th
                        key={`do-${line.id}`}
                        className="p-1 border text-right font-normal whitespace-nowrap"
                        title={line.label}
                      >
                        {line.label} ₽
                      </th>
                    ))}
                    <ItogoTotalHeader />
                  </>
                ) : (
                  <th className="p-1 border" />
                )}
              </tr>
            )}
            {showPctRow && (
              <tr className="bg-amber-50/30 text-[10px] text-slate-500">
                <th
                  className="p-1 border sticky left-0 z-20 bg-amber-50/30 text-left font-normal"
                  colSpan={FIXED_COL_COUNT}
                >
                  <span className="inline-flex flex-col gap-0.5">
                    <span>%</span>
                    {otExpanded && hasManualOt && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline text-left"
                        onClick={() => resetAllRisks('ot')}
                      >
                        Сбросить все ОТ
                      </button>
                    )}
                    {doExpanded && hasManualDo && (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline text-left"
                        onClick={() => resetAllRisks('do')}
                      >
                        Сбросить все ДО
                      </button>
                    )}
                  </span>
                </th>
                {teamExpanded ? (
                  <th className="p-1 border" colSpan={TEAM_EXPANDED_COLS} />
                ) : (
                  <th className="p-1 border" />
                )}
                {prodOtExpanded ? (
                  <th className="p-1 border" colSpan={PROD_COLS} />
                ) : (
                  <th className="p-1 border" />
                )}
                {otExpanded ? (
                  <>
                    {renderPctCells('ot', ot)}
                    <th className="p-1 border bg-amber-50/30" />
                  </>
                ) : (
                  <th className="p-1 border" />
                )}
                {prodDoExpanded ? (
                  <th className="p-1 border" colSpan={PROD_COLS} />
                ) : (
                  <th className="p-1 border" />
                )}
                {doExpanded ? (
                  <>
                    {renderPctCells('do', doSide)}
                    <th className="p-1 border bg-amber-50/30" />
                  </>
                ) : (
                  <th className="p-1 border" />
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {defs.map(def => {
              const enabled = queueLines[def.id] ?? def.default_enabled;
              const rowBg = def.is_phase ? 'bg-white' : 'bg-amber-50/40';
              const prod = prodByLine[def.id];
              const base = baseByLine[def.id];
              const baseImplemented = base?.total != null && Number.isFinite(base.total);
              const lineTeam = effectiveTeamForPhaseLine(activeQueue, def.id, phaseCalc, defaultTeam);
              const lineTeamFteSum = sumTeamFte(lineTeam);

              return (
                <tr key={def.id} className={def.is_phase ? '' : 'bg-amber-50/40'}>
                  <td className={`p-2 border text-left sticky left-0 z-10 ${rowBg}`}>
                    <span className="inline-flex items-center gap-1">
                      <span className={def.is_phase ? '' : 'font-medium'}>{def.label}</span>
                      {!def.is_phase && (
                        <span className="text-[10px] text-amber-600">(не фаза)</span>
                      )}
                    </span>
                  </td>
                  <td className="p-2 border text-right tabular-nums whitespace-nowrap">
                    {baseImplemented ? (
                      <button
                        type="button"
                        className="text-blue-600 hover:underline cursor-pointer tabular-nums"
                        onClick={() => setExplainLineId(def.id)}
                        title="Показать расчёт базовой стоимости"
                      >
                        {formatSum(base.total)}
                      </button>
                    ) : (
                      <span className="text-slate-400">{PLACEHOLDER}</span>
                    )}
                  </td>
                  <td className="p-2 border text-center">{renderYesNo(enabled, def.id)}</td>
                  <TeamCells
                    expanded={teamExpanded}
                    enabled={enabled}
                    team={lineTeam}
                    teamFteSum={lineTeamFteSum}
                    onTeamRoleChange={teamExpanded
                      ? (key, value) => setPhaseTeam(def.id, { ...lineTeam, [key]: value })
                      : undefined}
                  />
                  <ProdCells
                    expanded={prodOtExpanded}
                    side={prod?.ot}
                    hoursTitle={def.hours_formula_stub}
                    daysTitle={def.days_formula_stub}
                  />
                  {otExpanded ? (
                    <>
                      {ITogo_BREAKDOWN_LINES.map(line => (
                        <BreakdownCells
                          key={`ot-${def.id}-${line.id}`}
                          lineId={line.id}
                          risks={ot.risks}
                          prodAmount={prod?.ot?.production}
                        />
                      ))}
                      <ItogoTotalCell total={prod?.ot?.total} />
                    </>
                  ) : (
                    <td className="p-2 border text-right tabular-nums whitespace-nowrap">
                      {prod?.ot ? formatSum(prod.ot.total) : PLACEHOLDER}
                    </td>
                  )}
                  <ProdCells expanded={prodDoExpanded} side={prod?.do} />
                  {doExpanded ? (
                    <>
                      {ITogo_BREAKDOWN_LINES.map(line => (
                        <BreakdownCells
                          key={`do-${def.id}-${line.id}`}
                          lineId={line.id}
                          risks={doSide.risks}
                          prodAmount={prod?.do?.production}
                        />
                      ))}
                      <ItogoTotalCell total={prod?.do?.total} />
                    </>
                  ) : (
                    <td className="p-2 border text-right tabular-nums whitespace-nowrap">
                      {prod?.do ? formatSum(prod.do.total) : PLACEHOLDER}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">
        Команда: свёрнуто — Σ FTE на фазу; ▶ — итого и доли по ролям (редактирование в ячейках каждой фазы).
        Производственная ОТ: свёрнуто — полная сумма; ▶ — бюджет с рисками, командировочные, произв. ядро, часы, недели.
      </p>
      {explainDef && explainResult && explainResult.total != null && (
        <PhaseBaseExplainModal
          lineLabel={explainDef.label}
          result={explainResult}
          onClose={() => setExplainLineId(null)}
        />
      )}
    </div>
  );
}
