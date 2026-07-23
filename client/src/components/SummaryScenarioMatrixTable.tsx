import { useState, type ReactNode } from 'react';
import type { QueueLabelsMap, ScenarioPhaseDetail } from '../types';
import { queueLabel } from '../types';
import { EMPTY_SCENARIO_PHASE_DETAIL } from '../scenarioCalc';
import type { SummaryScenarioMatrix } from '../summaryScenarioMatrix';
import { formatMoneyRub, formatStepNumber } from '../utils/formatNumber';

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

type Props = {
  data: SummaryScenarioMatrix;
  queueLabels: QueueLabelsMap;
};

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return PLACEHOLDER;
  return formatMoneyRub(n);
}

function formatStep(n: number): string {
  if (!Number.isFinite(n) || n === 0) return PLACEHOLDER;
  return formatStepNumber(n);
}

function formatMetric(key: MetricKey, n: number): string {
  return key === 'hours' || key === 'weeks' ? formatStep(n) : formatMoney(n);
}

function productionCollapsed(detail: ScenarioPhaseDetail): number {
  return detail.productionCore + detail.travel;
}

function variantColSpan(prodExpanded: boolean, itogoExpanded: boolean): number {
  return (prodExpanded ? PROD_METRICS.length : 1) + (itogoExpanded ? ITOGO_METRICS.length : 1);
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

function DetailCells({
  detail,
  prodExpanded,
  itogoExpanded,
  className = '',
}: {
  detail: ScenarioPhaseDetail | null | undefined;
  prodExpanded: boolean;
  itogoExpanded: boolean;
  className?: string;
}) {
  const d = detail ?? EMPTY_SCENARIO_PHASE_DETAIL;
  return (
    <>
      {prodExpanded ? (
        PROD_METRICS.map(({ key }) => (
          <td
            key={`prod-${key}`}
            className={`p-1.5 border text-right tabular-nums whitespace-nowrap ${className}`}
          >
            {formatMetric(key, d[key])}
          </td>
        ))
      ) : (
        <td className={`p-1.5 border text-right tabular-nums whitespace-nowrap ${className}`}>
          {formatMoney(productionCollapsed(d))}
        </td>
      )}
      {itogoExpanded ? (
        ITOGO_METRICS.map(({ key }) => (
          <td
            key={`itogo-${key}`}
            className={`p-1.5 border text-right tabular-nums whitespace-nowrap ${
              key === 'total' ? 'font-medium' : ''
            } ${className}`}
          >
            {formatMetric(key, d[key])}
          </td>
        ))
      ) : (
        <td className={`p-1.5 border text-right tabular-nums whitespace-nowrap font-medium ${className}`}>
          {formatMoney(d.total)}
        </td>
      )}
    </>
  );
}

function VariantGroupHeaders({
  prodExpanded,
  itogoExpanded,
  onToggleProd,
  onToggleItogo,
}: {
  prodExpanded: boolean;
  itogoExpanded: boolean;
  onToggleProd: () => void;
  onToggleItogo: () => void;
}): ReactNode {
  return (
    <>
      <th
        className="p-1 border text-center font-normal whitespace-nowrap"
        colSpan={prodExpanded ? PROD_METRICS.length : 1}
      >
        <span className="inline-flex items-center gap-0.5">
          {renderExpandButton(prodExpanded, onToggleProd, 'Производственная ДО')}
          Произв. ДО
        </span>
      </th>
      <th
        className="p-1 border text-center font-normal whitespace-nowrap"
        colSpan={itogoExpanded ? ITOGO_METRICS.length : 1}
      >
        <span className="inline-flex items-center gap-0.5">
          {renderExpandButton(itogoExpanded, onToggleItogo, 'Итого ДО')}
          Итого ДО
        </span>
      </th>
    </>
  );
}

function VariantMetricHeaders({
  prodExpanded,
  itogoExpanded,
}: {
  prodExpanded: boolean;
  itogoExpanded: boolean;
}): ReactNode {
  return (
    <>
      {prodExpanded ? (
        PROD_METRICS.map(({ key, label, money }) => (
          <th
            key={`prod-${key}`}
            className="p-1 border text-right font-normal whitespace-nowrap min-w-[5.5rem]"
          >
            {money ? `${label} ₽` : label}
          </th>
        ))
      ) : (
        <th className="p-1 border text-right font-normal whitespace-nowrap min-w-[5.5rem]">
          Произв. ₽
        </th>
      )}
      {itogoExpanded ? (
        ITOGO_METRICS.map(({ key, label, money }) => (
          <th
            key={`itogo-${key}`}
            className="p-1 border text-right font-normal whitespace-nowrap min-w-[5.5rem]"
          >
            {money ? `${label} ₽` : label}
          </th>
        ))
      ) : (
        <th className="p-1 border text-right font-normal whitespace-nowrap min-w-[5.5rem]">
          Итого ₽
        </th>
      )}
    </>
  );
}

export default function SummaryScenarioMatrixTable({ data, queueLabels }: Props) {
  const { groups, rows, queueTotals, grandTotals } = data;
  const [prodExpanded, setProdExpanded] = useState(false);
  const [itogoExpanded, setItogoExpanded] = useState(false);

  const variantSpan = variantColSpan(prodExpanded, itogoExpanded);
  const metricRow = prodExpanded || itogoExpanded;
  const headerRows = metricRow ? 4 : 3;
  const totalCols = groups.reduce((sum, g) => sum + g.variants.length * variantSpan, 0);

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Сводка ДО: очереди и варианты</h3>
        <p className="text-xs text-slate-500 mt-1">
          Колонки — оцениваемые очереди; подколонки — База и сценарии с изменениями по этой очереди.
          ▶ «Произв. ДО» / «Итого ДО» — как на «Оценка РП».
        </p>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs border-collapse min-w-[960px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th
                rowSpan={headerRows}
                className="p-2 border text-left min-w-[180px] sticky left-0 z-20 bg-slate-50"
              >
                Фаза
              </th>
              {groups.map(group => (
                <th
                  key={group.id}
                  colSpan={group.variants.length * variantSpan}
                  className={`p-2 border text-center ${
                    group.kind === 'total' ? 'bg-blue-50/80' : 'bg-slate-100'
                  }`}
                >
                  {group.kind === 'total'
                    ? 'Итого'
                    : queueLabel(queueLabels, group.queue!)}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50 text-slate-500">
              {groups.flatMap(group =>
                group.variants.map(v => (
                  <th
                    key={`${group.id}-${v.id}`}
                    colSpan={variantSpan}
                    className={`p-1 border text-center whitespace-nowrap ${
                      v.isBase
                        ? 'bg-slate-100/80'
                        : group.kind === 'total'
                          ? 'bg-blue-50/50'
                          : 'bg-amber-50/40'
                    }`}
                  >
                    {v.name}
                  </th>
                )),
              )}
            </tr>
            <tr className="bg-slate-50/80 text-[10px] text-slate-500">
              {groups.flatMap(group =>
                group.variants.map(v => (
                  <VariantGroupHeaders
                    key={`${group.id}-${v.id}-groups`}
                    prodExpanded={prodExpanded}
                    itogoExpanded={itogoExpanded}
                    onToggleProd={() => setProdExpanded(x => !x)}
                    onToggleItogo={() => setItogoExpanded(x => !x)}
                  />
                )),
              )}
            </tr>
            {metricRow && (
              <tr className="bg-slate-50/60 text-[10px] text-slate-400">
                {groups.flatMap(group =>
                  group.variants.map(v => (
                    <VariantMetricHeaders
                      key={`${group.id}-${v.id}-metrics`}
                      prodExpanded={prodExpanded}
                      itogoExpanded={itogoExpanded}
                    />
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + totalCols} className="p-3 border text-center text-slate-400">
                  Нет сумм ДО по фазам — проверьте включение фаз и расчёт на вкладке «Оценка РП».
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.lineId}>
                <td className="p-2 border text-left sticky left-0 z-10 bg-white">
                  {row.label}
                </td>
                {groups.flatMap(group =>
                  group.variants.map(v => {
                    const detail = group.kind === 'total'
                      ? row.byColumnTotal[v.id]
                      : row.byColumnByQueue[v.id]?.[group.queue!];
                    const className = v.isBase
                      ? 'bg-slate-50/40'
                      : group.kind === 'total'
                        ? 'bg-blue-50/30'
                        : '';
                    return (
                      <DetailCells
                        key={`${row.lineId}-${group.id}-${v.id}`}
                        detail={detail}
                        prodExpanded={prodExpanded}
                        itogoExpanded={itogoExpanded}
                        className={className}
                      />
                    );
                  }),
                )}
              </tr>
            ))}
            <tr className="font-semibold bg-blue-50/60">
              <td className="p-2 border sticky left-0 z-10 bg-blue-50/60">Итого ДО</td>
              {groups.flatMap(group =>
                group.variants.map(v => {
                  const detail = group.kind === 'total'
                    ? grandTotals[v.id]
                    : queueTotals[v.id]?.[group.queue!];
                  const className = v.isBase
                    ? 'bg-slate-100/80'
                    : group.kind === 'total'
                      ? 'bg-blue-100/70'
                      : '';
                  return (
                    <DetailCells
                      key={`total-${group.id}-${v.id}`}
                      detail={detail}
                      prodExpanded={prodExpanded}
                      itogoExpanded={itogoExpanded}
                      className={className}
                    />
                  );
                }),
              )}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
