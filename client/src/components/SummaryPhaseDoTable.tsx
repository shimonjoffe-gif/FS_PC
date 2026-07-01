import type { QueueLabelsMap } from '../types';
import { queueLabel } from '../types';
import type { SummaryPhaseDoTable } from '../summaryPhaseCalc';
import { formatMoneyRub } from '../utils/formatNumber';

const PLACEHOLDER = '—';

type Props = {
  data: SummaryPhaseDoTable;
  queueLabels: QueueLabelsMap;
};

export default function SummaryPhaseDoTable({ data, queueLabels }: Props) {
  const { activeQueues, rows, queueTotals, grandTotal } = data;

  if (activeQueues.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Нет оцененных очередей. Включите очереди на вкладке «Параметры оценки» → организационный объём.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Нет данных по фазам. Проверьте включение фаз на вкладке «Оценка РП».
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-sm border-collapse min-w-[640px]">
        <thead>
          <tr className="bg-slate-50 text-slate-500 text-xs">
            <th className="text-left p-2 border min-w-[200px] sticky left-0 z-10 bg-slate-50">
              Фаза
            </th>
            {activeQueues.map(q => (
              <th key={q} className="text-right p-2 border whitespace-nowrap min-w-[8rem]">
                {queueLabel(queueLabels, q)}
                <div className="text-[10px] font-normal text-slate-400">Итого ДО</div>
              </th>
            ))}
            <th className="text-right p-2 border whitespace-nowrap min-w-[8rem] bg-slate-100/80">
              Итого
              <div className="text-[10px] font-normal text-slate-400">все очереди</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.lineId}>
              <td className="p-2 border text-left sticky left-0 z-10 bg-white">
                {row.label}
              </td>
              {activeQueues.map(q => (
                <td key={q} className="p-2 border text-right tabular-nums whitespace-nowrap">
                  {row.byQueue[q] != null && row.byQueue[q]! > 0
                    ? formatMoneyRub(row.byQueue[q]!)
                    : PLACEHOLDER}
                </td>
              ))}
              <td className="p-2 border text-right tabular-nums whitespace-nowrap font-medium bg-slate-50/50">
                {formatMoneyRub(row.total)}
              </td>
            </tr>
          ))}
          <tr className="font-semibold bg-blue-50">
            <td className="p-2 border sticky left-0 z-10 bg-blue-50">Итого ДО</td>
            {activeQueues.map(q => (
              <td key={q} className="p-2 border text-right tabular-nums whitespace-nowrap">
                {(queueTotals[q] ?? 0) > 0
                  ? formatMoneyRub(queueTotals[q]!)
                  : PLACEHOLDER}
              </td>
            ))}
            <td className="p-2 border text-right tabular-nums whitespace-nowrap">
              {formatMoneyRub(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
