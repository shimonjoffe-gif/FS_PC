import type { QueueLabelsMap } from '../types';
import { queueLabel } from '../types';
import type { SummaryScenarioMatrix } from '../summaryScenarioMatrix';
import { formatMoneyRub } from '../utils/formatNumber';

const PLACEHOLDER = '—';

type Props = {
  data: SummaryScenarioMatrix;
  queueLabels: QueueLabelsMap;
};

function formatDo(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return PLACEHOLDER;
  return formatMoneyRub(value);
}

export default function SummaryScenarioMatrixTable({ data, queueLabels }: Props) {
  const { groups, rows, queueTotals, grandTotals } = data;
  const totalCols = groups.reduce((sum, g) => sum + g.variants.length, 0);

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Сводка ДО: очереди и варианты</h3>
        <p className="text-xs text-slate-500 mt-1">
          Колонки — оцениваемые очереди; подколонки — База и сценарии с изменениями по этой очереди
          (фазы, технология или ФС). Группа «Итого» — сумма по очередям для Базы и сценариев с любыми отличиями.
        </p>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="w-full text-xs border-collapse min-w-[960px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th
                rowSpan={2}
                className="p-2 border text-left min-w-[180px] sticky left-0 z-20 bg-slate-50"
              >
                Фаза
              </th>
              {groups.map(group => (
                <th
                  key={group.id}
                  colSpan={group.variants.length}
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
                    className={`p-1 border text-center whitespace-nowrap min-w-[5.5rem] ${
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
                    const value = group.kind === 'total'
                      ? row.byColumnTotal[v.id]
                      : row.byColumnByQueue[v.id]?.[group.queue!];
                    return (
                      <td
                        key={`${row.lineId}-${group.id}-${v.id}`}
                        className={`p-2 border text-right tabular-nums whitespace-nowrap ${
                          v.isBase
                            ? 'bg-slate-50/40'
                            : group.kind === 'total'
                              ? 'bg-blue-50/30'
                              : ''
                        }`}
                      >
                        {formatDo(value)}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
            <tr className="font-semibold bg-blue-50/60">
              <td className="p-2 border sticky left-0 z-10 bg-blue-50/60">Итого ДО</td>
              {groups.flatMap(group =>
                group.variants.map(v => {
                  const value = group.kind === 'total'
                    ? grandTotals[v.id]
                    : queueTotals[v.id]?.[group.queue!];
                  return (
                    <td
                      key={`total-${group.id}-${v.id}`}
                      className={`p-2 border text-right tabular-nums whitespace-nowrap ${
                        v.isBase
                          ? 'bg-slate-100/80'
                          : group.kind === 'total'
                            ? 'bg-blue-100/70'
                            : ''
                      }`}
                    >
                      {formatDo(value)}
                    </td>
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
