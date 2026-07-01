import { useState } from 'react';
import type { FsQueueKey, PhaseCalcLineDef, ScenarioPhaseDetail } from '../types';
import type { ScenarioComparison } from '../scenarioCalc';
import { normalizeScenarioOtTotals } from '../scenarioCalc';
import { formatMoneyRub, formatStepNumber } from '../utils/formatNumber';
import { yesNoLabel, yesNoClass, YES_NO_BADGE_CLASS } from '../utils/yesNoBadge';

const PLACEHOLDER = '—';

type MetricKey = keyof ScenarioPhaseDetail;

/** Порядок как в таблице фаз: произв. → часы/недели → резервы → итого. */
const DETAIL_METRICS: { key: MetricKey; label: string; money?: boolean }[] = [
  { key: 'budgetWithRisks', label: 'Бюджет с учётом рисков', money: true },
  { key: 'travel', label: 'Командировочные', money: true },
  { key: 'productionCore', label: 'Производственная оценка', money: true },
  { key: 'hours', label: 'Часы' },
  { key: 'weeks', label: 'Недели' },
  { key: 'reserveRpo', label: 'Резерв РПО', money: true },
  { key: 'reserveCompany', label: 'Резерв компании', money: true },
  { key: 'salesComp', label: 'Компенсация продаж', money: true },
  { key: 'companyFund', label: 'Фонд компании', money: true },
  { key: 'contractRpoRisks', label: 'Риски РПО', money: true },
  { key: 'contractFundRisks', label: 'Риски ФК', money: true },
  { key: 'total', label: 'Итого', money: true },
];

const PHASE_CTRL_COLS = 2;

export type ScenarioPhaseControlProps = {
  getBaseEnabled: (lineId: string) => boolean;
  getScenarioEnabled: (lineId: string) => boolean;
  onToggleScenarioPhase: (lineId: string) => void;
};

function formatMoney(n: number): string {
  return n !== 0 ? formatMoneyRub(n) : PLACEHOLDER;
}

function formatStep(n: number): string {
  return n !== 0 ? formatStepNumber(n) : PLACEHOLDER;
}

function phaseDetail(
  side: ReturnType<typeof normalizeScenarioOtTotals>,
  lineId: string,
): ScenarioPhaseDetail | null {
  const d = side.detailByPhase[lineId];
  if (d) return d;
  const total = side.byPhase[lineId];
  if (total == null || total === 0) return null;
  return {
    budgetWithRisks: 0,
    travel: 0,
    productionCore: 0,
    hours: 0,
    weeks: side.weeksByPhase[lineId] ?? 0,
    reserveRpo: 0,
    reserveCompany: 0,
    salesComp: 0,
    companyFund: 0,
    contractRpoRisks: 0,
    contractFundRisks: 0,
    total,
  };
}

function rowHasData(
  base: ScenarioPhaseDetail | null,
  scenario: ScenarioPhaseDetail | null,
): boolean {
  if (!base && !scenario) return false;
  const b = base ?? { total: 0 } as ScenarioPhaseDetail;
  const s = scenario ?? { total: 0 } as ScenarioPhaseDetail;
  return b.total !== 0 || s.total !== 0;
}

function shouldShowRow(
  baseD: ScenarioPhaseDetail | null,
  scD: ScenarioPhaseDetail | null,
  baseEnabled: boolean,
  scenarioEnabled: boolean,
  phaseControl?: ScenarioPhaseControlProps,
): boolean {
  if (phaseControl) {
    return rowHasData(baseD, scD) || baseEnabled || scenarioEnabled;
  }
  return rowHasData(baseD, scD);
}

function formatMetric(key: MetricKey, n: number): string {
  return key === 'hours' || key === 'weeks' ? formatStep(n) : formatMoney(n);
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

function SideCells({
  detail,
  expanded,
}: {
  detail: ScenarioPhaseDetail;
  expanded: boolean;
}) {
  if (expanded) {
    return (
      <>
        {DETAIL_METRICS.map(({ key }) => (
          <td key={key} className="p-1.5 border text-right tabular-nums whitespace-nowrap">
            {formatMetric(key, detail[key])}
          </td>
        ))}
      </>
    );
  }
  return (
    <td className="p-1.5 border text-right tabular-nums whitespace-nowrap font-medium">
      {formatMoney(detail.total)}
    </td>
  );
}

function SideSubHeaders({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <>
        {DETAIL_METRICS.map(({ key, label, money }) => (
          <th
            key={key}
            className="p-1 border text-right font-normal whitespace-nowrap min-w-[7rem]"
          >
            {money ? `${label} ₽` : label}
          </th>
        ))}
      </>
    );
  }
  return (
    <th className="p-1 border text-right font-normal whitespace-nowrap min-w-[7rem]">
      Итого ₽
    </th>
  );
}

function PhaseControlCells({
  lineId,
  phaseControl,
}: {
  lineId: string;
  phaseControl: ScenarioPhaseControlProps;
}) {
  const baseEnabled = phaseControl.getBaseEnabled(lineId);
  const scenarioEnabled = phaseControl.getScenarioEnabled(lineId);
  const differs = baseEnabled !== scenarioEnabled;

  return (
    <>
      <td className="p-1.5 border text-center">
        <span className={`${YES_NO_BADGE_CLASS} ${yesNoClass(baseEnabled)}`}>
          {yesNoLabel(baseEnabled)}
        </span>
      </td>
      <td className="p-1.5 border text-center">
        <button
          type="button"
          className={`${YES_NO_BADGE_CLASS} cursor-pointer ${
            differs ? 'ring-2 ring-amber-300 ' : ''
          }${yesNoClass(scenarioEnabled)}`}
          onClick={() => phaseControl.onToggleScenarioPhase(lineId)}
          title="Включить / выключить фазу в варианте"
        >
          {yesNoLabel(scenarioEnabled)}
        </button>
      </td>
    </>
  );
}

type Props = {
  comparison: ScenarioComparison;
  scenarioLabel: string;
  phaseRows: PhaseCalcLineDef[];
  renderDelta: (base: number, scenario: number) => string;
  phaseControl?: ScenarioPhaseControlProps;
};

export default function ScenarioDetailComparisonTable({
  comparison,
  scenarioLabel,
  phaseRows,
  renderDelta,
  phaseControl,
}: Props) {
  const base = normalizeScenarioOtTotals(comparison.base);
  const scenario = normalizeScenarioOtTotals(comparison.scenario);

  const [baseExpanded, setBaseExpanded] = useState(false);
  const [scenarioExpanded, setScenarioExpanded] = useState(false);

  const baseColSpan = baseExpanded ? DETAIL_METRICS.length : 1;
  const scenarioColSpan = scenarioExpanded ? DETAIL_METRICS.length : 1;
  const showSubHeader = baseExpanded || scenarioExpanded || !!phaseControl;
  const headerRowSpan = showSubHeader ? 2 : 1;

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs border-collapse min-w-[480px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th
                className="p-2 border text-left min-w-[180px] sticky left-0 z-20 bg-slate-50"
                rowSpan={headerRowSpan}
              >
                Фаза
              </th>
              <th className="p-2 border text-center" colSpan={baseColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    baseExpanded,
                    () => setBaseExpanded(v => !v),
                    'База — полная структура стоимости ОТ',
                  )}
                  База
                </span>
              </th>
              {phaseControl && (
                <th className="p-2 border text-center" colSpan={PHASE_CTRL_COLS} rowSpan={1}>
                  Да/Нет
                </th>
              )}
              <th className="p-2 border text-center" colSpan={scenarioColSpan}>
                <span className="inline-flex items-center gap-1">
                  {renderExpandButton(
                    scenarioExpanded,
                    () => setScenarioExpanded(v => !v),
                    `${scenarioLabel} — полная структура стоимости ОТ`,
                  )}
                  {scenarioLabel}
                </span>
              </th>
              <th
                className="p-2 border text-center min-w-[6rem]"
                rowSpan={headerRowSpan}
              >
                Δ
              </th>
            </tr>
            {showSubHeader && (
              <tr className="bg-slate-50/80 text-[10px] text-slate-400">
                <SideSubHeaders expanded={baseExpanded} />
                {phaseControl && (
                  <>
                    <th className="p-1 border text-center font-normal w-16">База</th>
                    <th className="p-1 border text-center font-normal w-16">Вариант</th>
                  </>
                )}
                <SideSubHeaders expanded={scenarioExpanded} />
              </tr>
            )}
          </thead>
          <tbody>
            {phaseRows.map(def => {
              const baseD = phaseDetail(base, def.id);
              const scD = phaseDetail(scenario, def.id);
              const baseEnabled = phaseControl?.getBaseEnabled(def.id) ?? false;
              const scenarioEnabled = phaseControl?.getScenarioEnabled(def.id) ?? false;
              if (!shouldShowRow(baseD, scD, baseEnabled, scenarioEnabled, phaseControl)) {
                return null;
              }

              const b = baseD ?? { ...scD!, total: 0 };
              const s = scD ?? { ...baseD!, total: 0 };

              return (
                <tr key={def.id}>
                  <td className="p-2 border text-left sticky left-0 z-10 bg-white">
                    {def.label}
                  </td>
                  <SideCells detail={b} expanded={baseExpanded} />
                  {phaseControl && (
                    <PhaseControlCells lineId={def.id} phaseControl={phaseControl} />
                  )}
                  <SideCells detail={s} expanded={scenarioExpanded} />
                  <td className="p-1.5 border text-right text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
                    {renderDelta(b.total, s.total)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold bg-blue-50">
              <td className="p-2 border sticky left-0 z-10 bg-blue-50">Итого ОТ</td>
              <SideCells detail={base.grandDetail} expanded={baseExpanded} />
              {phaseControl && (
                <>
                  <td className="p-1.5 border" />
                  <td className="p-1.5 border" />
                </>
              )}
              <SideCells detail={scenario.grandDetail} expanded={scenarioExpanded} />
              <td className="p-1.5 border text-right text-[10px] tabular-nums whitespace-nowrap">
                {renderDelta(base.grandTotal, scenario.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">
        ▶ База / {scenarioLabel}: свёрнуто — итого ОТ; развернуть — полная структура стоимости.
        {phaseControl && ' Колонки «Да/Нет»: база (только просмотр) и переключение фазы в варианте.'}
      </p>
    </div>
  );
}
