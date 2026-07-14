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
  const { activeQueues, columns, rows, queueTotals, grandTotals } = data;
  const subColsPerColumn = activeQueues.length + 1;

  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Сводка ДО: база и варианты по очередям</h3>
        <p className="text-xs text-slate-500 mt-1">
          Колонки — база и сценарии; подколонки — оцениваемые очереди и сумма Σ.
          Каждый сценарий считается поверх базы (дельта сценария + неизменённые очереди).
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
              {columns.map(col => (
                <th
                  key={col.id}
                  colSpan={subColsPerColumn}
                  className={`p-2 border text-center ${col.isBase ? 'bg-slate-100' : 'bg-blue-50/70'}`}
                >
                  {col.name}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50 text-slate-500">
              {columns.flatMap(col => (
                [
                  ...activeQueues.map(q => (
                    <th key={`${col.id}-${q}`} className="p-1 border text-center whitespace-nowrap min-w-[5.5rem]">
                      {queueLabel(queueLabels, q)}
                    </th>
                  )),
                  <th
                    key={`${col.id}-sum`}
                    className={`p-1 border text-center whitespace-nowrap min-w-[5.5rem] font-medium ${
                      col.isBase ? 'bg-slate-100/80' : 'bg-blue-50/50'
                    }`}
                  >
                    Σ
                  </th>,
                ]
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={1 + columns.length * subColsPerColumn} className="p-3 border text-center text-slate-400">
                  Нет сумм ДО по фазам — проверьте включение фаз и расчёт на вкладке «Оценка РП».
                </td>
              </tr>
            )}
            {rows.map(row => (
              <tr key={row.lineId}>
                <td className="p-2 border text-left sticky left-0 z-10 bg-white">
                  {row.label}
                </td>
                {columns.flatMap(col => (
                  [
                    ...activeQueues.map(q => (
                      <td
                        key={`${row.lineId}-${col.id}-${q}`}
                        className="p-2 border text-right tabular-nums whitespace-nowrap"
                      >
                        {formatDo(row.byColumnByQueue[col.id]?.[q])}
                      </td>
                    )),
                    <td
                      key={`${row.lineId}-${col.id}-sum`}
                      className={`p-2 border text-right tabular-nums whitespace-nowrap font-medium ${
                        col.isBase ? 'bg-slate-50/40' : 'bg-blue-50/30'
                      }`}
                    >
                      {formatDo(row.byColumnTotal[col.id])}
                    </td>,
                  ]
                ))}
              </tr>
            ))}
            <tr className="font-semibold bg-blue-50/60">
              <td className="p-2 border sticky left-0 z-10 bg-blue-50/60">Итого ДО</td>
              {columns.flatMap(col => (
                [
                  ...activeQueues.map(q => (
                    <td
                      key={`total-${col.id}-${q}`}
                      className="p-2 border text-right tabular-nums whitespace-nowrap"
                    >
                      {formatDo(queueTotals[col.id]?.[q])}
                    </td>
                  )),
                  <td
                    key={`total-${col.id}-sum`}
                    className={`p-2 border text-right tabular-nums whitespace-nowrap ${
                      col.isBase ? 'bg-slate-100/80' : 'bg-blue-100/70'
                    }`}
                  >
                    {formatDo(grandTotals[col.id])}
                  </td>,
                ]
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
