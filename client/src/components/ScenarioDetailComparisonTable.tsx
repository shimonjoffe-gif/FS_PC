import { useState } from 'react';
import type { PhaseCalcLineDef, ScenarioPhaseDetail } from '../types';
import type { ScenarioComparison } from '../scenarioCalc';
import { EMPTY_SCENARIO_PHASE_DETAIL, normalizeScenarioOtTotals } from '../scenarioCalc';
import { formatMoneyRub, formatStepNumber } from '../utils/formatNumber';
import { yesNoLabel, yesNoClass, YES_NO_BADGE_CLASS } from '../utils/yesNoBadge';

const PLACEHOLDER = '—';

type MetricKey = keyof ScenarioPhaseDetail;

const PROD_METRICS: { key: MetricKey; label: string; money?: boolean }[] = [
  { key: 'budgetWithRisks', label: 'Бюджет с учётом рисков', money: true },
  { key: 'travel', label: 'Командировочные', money: true },
  { key: 'productionCore', label: 'Производственная оценка', money: true },
  { key: 'hours', label: 'Часы' },
  { key: 'weeks', label: 'Недели' },
];

const ITOGO_METRICS: { key: MetricKey; label: string; money?: boolean }[] = [
  { key: 'reserveRpo', label: 'Резерв РПО', money: true },
  { key: 'reserveCompany', label: 'Резерв компании', money: true },
  { key: 'salesComp', label: 'Компенсация продаж', money: true },
  { key: 'companyFund', label: 'Фонд компании', money: true },
  { key: 'contractRpoRisks', label: 'Риски РПО', money: true },
  { key: 'contractFundRisks', label: 'Риски ФК', money: true },
  { key: 'total', label: 'Итого', money: true },
];

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

function productionCollapsed(detail: ScenarioPhaseDetail): number {
  return detail.productionCore + detail.travel;
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
    ...EMPTY_SCENARIO_PHASE_DETAIL,
    weeks: side.weeksByPhase[lineId] ?? 0,
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

function sideColSpan(prodExpanded: boolean, itogoExpanded: boolean): number {
  return (prodExpanded ? PROD_METRICS.length : 1) + (itogoExpanded ? ITOGO_METRICS.length : 1);
}

function SideGroupHeaders({
  prodExpanded,
  itogoExpanded,
  onToggleProd,
  onToggleItogo,
}: {
  prodExpanded: boolean;
  itogoExpanded: boolean;
  onToggleProd: () => void;
  onToggleItogo: () => void;
}) {
  return (
    <>
      <th className="p-2 border text-center" colSpan={prodExpanded ? PROD_METRICS.length : 1}>
        <span className="inline-flex items-center gap-1">
          {renderExpandButton(prodExpanded, onToggleProd, 'Производственная ДО — сумма, часы, недели')}
          Производственная ДО
        </span>
      </th>
      <th className="p-2 border text-center" colSpan={itogoExpanded ? ITOGO_METRICS.length : 1}>
        <span className="inline-flex items-center gap-1">
          {renderExpandButton(itogoExpanded, onToggleItogo, 'Итого ДО — детализация резервов')}
          Итого ДО
        </span>
      </th>
    </>
  );
}

function SideSubHeaders({
  prodExpanded,
  itogoExpanded,
}: {
  prodExpanded: boolean;
  itogoExpanded: boolean;
}) {
  return (
    <>
      {prodExpanded ? (
        PROD_METRICS.map(({ key, label, money }) => (
          <th
            key={`prod-${key}`}
            className="p-1 border text-right font-normal whitespace-nowrap min-w-[6.5rem]"
          >
            {money ? `${label} ₽` : label}
          </th>
        ))
      ) : (
        <th className="p-1 border text-right font-normal whitespace-nowrap min-w-[6.5rem]">
          Произв. ₽
        </th>
      )}
      {itogoExpanded ? (
        ITOGO_METRICS.map(({ key, label, money }) => (
          <th
            key={`itogo-${key}`}
            className="p-1 border text-right font-normal whitespace-nowrap min-w-[6.5rem]"
          >
            {money ? `${label} ₽` : label}
          </th>
        ))
      ) : (
        <th className="p-1 border text-right font-normal whitespace-nowrap min-w-[6.5rem]">
          Итого ₽
        </th>
      )}
    </>
  );
}

function SideCells({
  detail,
  prodExpanded,
  itogoExpanded,
}: {
  detail: ScenarioPhaseDetail;
  prodExpanded: boolean;
  itogoExpanded: boolean;
}) {
  return (
    <>
      {prodExpanded ? (
        PROD_METRICS.map(({ key }) => (
          <td key={`prod-${key}`} className="p-1.5 border text-right tabular-nums whitespace-nowrap">
            {formatMetric(key, detail[key])}
          </td>
        ))
      ) : (
        <td className="p-1.5 border text-right tabular-nums whitespace-nowrap">
          {formatMoney(productionCollapsed(detail))}
        </td>
      )}
      {itogoExpanded ? (
        ITOGO_METRICS.map(({ key }) => (
          <td
            key={`itogo-${key}`}
            className={`p-1.5 border text-right tabular-nums whitespace-nowrap ${
              key === 'total' ? 'font-medium' : ''
            }`}
          >
            {formatMetric(key, detail[key])}
          </td>
        ))
      ) : (
        <td className="p-1.5 border text-right tabular-nums whitespace-nowrap font-medium">
          {formatMoney(detail.total)}
        </td>
      )}
    </>
  );
}

function PhaseControlCells({
  lineId,
  phaseControl,
}: {
  lineId: string;
  phaseControl: ScenarioPhaseControlProps;
}) {
  const baseOn = phaseControl.getBaseEnabled(lineId);
  const scOn = phaseControl.getScenarioEnabled(lineId);
  const differs = baseOn !== scOn;
  return (
    <>
      <td className="p-1.5 border text-center">
        <span className={`${YES_NO_BADGE_CLASS} ${yesNoClass(baseOn)}`}>{yesNoLabel(baseOn)}</span>
      </td>
      <td className="p-1.5 border text-center">
        <button
          type="button"
          className={`${YES_NO_BADGE_CLASS} ${yesNoClass(scOn, differs)} cursor-pointer`}
          onClick={() => phaseControl.onToggleScenarioPhase(lineId)}
          title="Переключить фазу в варианте"
        >
          {yesNoLabel(scOn)}
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

  const [prodExpanded, setProdExpanded] = useState(false);
  const [itogoExpanded, setItogoExpanded] = useState(false);

  const sideSpan = sideColSpan(prodExpanded, itogoExpanded);
  const metricRow = prodExpanded || itogoExpanded;
  const headerRowSpan = metricRow ? 3 : 2;

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
              <th className="p-2 border text-center bg-slate-100/80" colSpan={sideSpan}>
                База
              </th>
              {phaseControl && (
                <>
                  <th className="p-2 border text-center w-16" rowSpan={headerRowSpan}>
                    База
                    <div className="text-[9px] font-normal text-slate-400">Да/Нет</div>
                  </th>
                  <th className="p-2 border text-center w-16" rowSpan={headerRowSpan}>
                    Вариант
                    <div className="text-[9px] font-normal text-slate-400">Да/Нет</div>
                  </th>
                </>
              )}
              <th className="p-2 border text-center bg-amber-50/40" colSpan={sideSpan}>
                {scenarioLabel}
              </th>
              <th
                className="p-2 border text-center min-w-[6rem]"
                rowSpan={headerRowSpan}
              >
                Δ
              </th>
            </tr>
            <tr className="bg-slate-50/80 text-[10px] text-slate-500">
              <SideGroupHeaders
                prodExpanded={prodExpanded}
                itogoExpanded={itogoExpanded}
                onToggleProd={() => setProdExpanded(v => !v)}
                onToggleItogo={() => setItogoExpanded(v => !v)}
              />
              <SideGroupHeaders
                prodExpanded={prodExpanded}
                itogoExpanded={itogoExpanded}
                onToggleProd={() => setProdExpanded(v => !v)}
                onToggleItogo={() => setItogoExpanded(v => !v)}
              />
            </tr>
            {metricRow && (
              <tr className="bg-slate-50/60 text-[10px] text-slate-400">
                <SideSubHeaders prodExpanded={prodExpanded} itogoExpanded={itogoExpanded} />
                <SideSubHeaders prodExpanded={prodExpanded} itogoExpanded={itogoExpanded} />
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

              const b = baseD ?? { ...EMPTY_SCENARIO_PHASE_DETAIL, ...scD!, total: 0 };
              const s = scD ?? { ...EMPTY_SCENARIO_PHASE_DETAIL, ...baseD!, total: 0 };

              return (
                <tr key={def.id}>
                  <td className="p-2 border text-left sticky left-0 z-10 bg-white">
                    {def.label}
                  </td>
                  <SideCells detail={b} prodExpanded={prodExpanded} itogoExpanded={itogoExpanded} />
                  {phaseControl && (
                    <PhaseControlCells lineId={def.id} phaseControl={phaseControl} />
                  )}
                  <SideCells detail={s} prodExpanded={prodExpanded} itogoExpanded={itogoExpanded} />
                  <td className="p-1.5 border text-right text-[10px] text-slate-600 tabular-nums whitespace-nowrap">
                    {renderDelta(b.total, s.total)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold bg-blue-50">
              <td className="p-2 border sticky left-0 z-10 bg-blue-50">Итого ДО</td>
              <SideCells
                detail={base.grandDetail}
                prodExpanded={prodExpanded}
                itogoExpanded={itogoExpanded}
              />
              {phaseControl && (
                <>
                  <td className="p-1.5 border" />
                  <td className="p-1.5 border" />
                </>
              )}
              <SideCells
                detail={scenario.grandDetail}
                prodExpanded={prodExpanded}
                itogoExpanded={itogoExpanded}
              />
              <td className="p-1.5 border text-right text-[10px] tabular-nums whitespace-nowrap">
                {renderDelta(base.grandTotal, scenario.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400">
        ▶ Производственная ДО / Итого ДО — как на «Оценка РП»; свёрнуто — произв. сумма и итого ДО.
        {phaseControl && ' Колонки «Да/Нет»: база (только просмотр) и переключение фазы в варианте.'}
      </p>
    </div>
  );
}
