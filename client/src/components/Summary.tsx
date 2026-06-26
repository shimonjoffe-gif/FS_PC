import React from 'react';
import type { ProjectRow } from '../types';
import { fmt } from '../utils/calc';

interface Props {
  rows: ProjectRow[];
}

interface EtapTotal {
  этап: string;
  часы: number;
  фонд: number;
  усн: number;
  кп: number;
  сриск: number;
  дней: number;
}

const ROLES = [
  { key: 'загрузка_рп'          as keyof ProjectRow, label: 'РП' },
  { key: 'загрузка_аналит_конс' as keyof ProjectRow, label: 'Аналитик-консультант' },
  { key: 'загрузка_аналит_эксп' as keyof ProjectRow, label: 'Аналитик-эксперт' },
  { key: 'загрузка_архит'       as keyof ProjectRow, label: 'Архитектор' },
  { key: 'загрузка_програм1'    as keyof ProjectRow, label: 'Программист 1' },
  { key: 'загрузка_програм2'    as keyof ProjectRow, label: 'Программист 2' },
  { key: 'загрузка_куратор'     as keyof ProjectRow, label: 'Куратор' },
];

export default function Summary({ rows }: Props) {
  // Итоги по этапам
  const etapMap = new Map<string, EtapTotal>();
  rows.forEach(r => {
    const key = r.этап;
    if (!etapMap.has(key)) etapMap.set(key, { этап: key, часы: 0, фонд: 0, усн: 0, кп: 0, сриск: 0, дней: 0 });
    const e = etapMap.get(key)!;
    e.часы  += r.трудозатраты_итог;
    e.фонд  += r.фонд_компании;
    e.усн   += r.бюджет_усн;
    e.кп    += r.бюджет_кп;
    e.сриск += r.бюджет_с_рисками;
    e.дней  += r.длит_трудоемк;
  });
  const etapTotals = Array.from(etapMap.values());

  // Итоги по ролям (сколько часов у каждой)
  const roleHours = ROLES.map(role => {
    const hours = rows.reduce((sum, r) => {
      const load = (r[role.key] as number) / 100;
      return sum + r.длит_трудоемк * 8 * load;
    }, 0);
    return { ...role, hours: Math.round(hours) };
  }).filter(r => r.hours > 0);

  const grand = {
    часы:  rows.reduce((s, r) => s + r.трудозатраты_итог, 0),
    фонд:  rows.reduce((s, r) => s + r.фонд_компании, 0),
    усн:   rows.reduce((s, r) => s + r.бюджет_усн, 0),
    кп:    rows.reduce((s, r) => s + r.бюджет_кп, 0),
    сриск: rows.reduce((s, r) => s + r.бюджет_с_рисками, 0),
    дней:  rows.reduce((s, r) => s + r.длит_трудоемк, 0),
  };

  return (
    <div className="p-6 space-y-8 overflow-y-auto">
      {/* Итоговые карточки */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Всего часов',   value: fmt(grand.часы),  unit: 'ч',  color: 'blue' },
          { label: 'Бюджет УСН',    value: fmt(grand.усн),   unit: '₽',  color: 'slate' },
          { label: 'Бюджет КП',     value: fmt(grand.кп),    unit: '₽',  color: 'indigo' },
          { label: 'С рисками',     value: fmt(grand.сриск), unit: '₽',  color: 'emerald' },
        ].map(c => (
          <div key={c.label} className={`bg-white rounded-xl border border-slate-100 p-4 shadow-sm`}>
            <div className="text-xs text-slate-400 mb-1">{c.label}</div>
            <div className={`text-2xl font-bold text-${c.color}-600`}>{c.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{c.unit}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* По этапам */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-700 text-sm">По этапам</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-slate-500 font-semibold">Этап</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Дней</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Часов</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">УСН ₽</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">С рисками ₽</th>
              </tr>
            </thead>
            <tbody>
              {etapTotals.map(e => (
                <tr key={e.этап} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700 max-w-40 truncate" title={e.этап}>{e.этап}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{e.дней}</td>
                  <td className="px-3 py-2 text-right text-blue-600 font-medium">{fmt(e.часы)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{fmt(e.усн)}</td>
                  <td className="px-3 py-2 text-right text-emerald-600 font-medium">{fmt(e.сриск)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-2 text-slate-600">ИТОГО</td>
                <td className="px-3 py-2 text-right text-slate-600">{grand.дней}</td>
                <td className="px-3 py-2 text-right text-blue-700">{fmt(grand.часы)}</td>
                <td className="px-3 py-2 text-right text-slate-700">{fmt(grand.усн)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{fmt(grand.сриск)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* По ролям */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-700 text-sm">Загрузка по ролям</div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-slate-500 font-semibold">Роль</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Часов</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Дней</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {roleHours.map(r => (
                <tr key={r.key} className="border-t border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700">{r.label}</td>
                  <td className="px-3 py-2 text-right text-blue-600 font-medium">{fmt(r.hours)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{(r.hours / 8).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">
                    {grand.часы > 0 ? Math.round(r.hours / grand.часы * 100) + '%' : '—'}
                  </td>
                </tr>
              ))}
              {roleHours.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-300">Нет данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Три варианта бюджета */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-700 text-sm">Варианты бюджета по этапам</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-slate-500 font-semibold">Этап</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Фонд ₽</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">Резерв ₽</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">УСН ₽</th>
                <th className="px-3 py-2 text-right text-slate-500 font-semibold">КП ₽</th>
                <th className="px-3 py-2 text-right text-emerald-600 font-semibold">С рисками ₽</th>
              </tr>
            </thead>
            <tbody>
              {etapTotals.map(e => {
                const etapRows = rows.filter(r => r.этап === e.этап);
                const фондE  = etapRows.reduce((s, r) => s + r.фонд_компании, 0);
                const резервE = etapRows.reduce((s, r) => s + r.резерв_компании, 0);
                return (
                  <tr key={e.этап} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-700 max-w-40 truncate" title={e.этап}>{e.этап}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmt(фондE)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{fmt(резервE)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmt(e.усн)}</td>
                    <td className="px-3 py-2 text-right text-indigo-600">{fmt(e.кп)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600 font-medium">{fmt(e.сриск)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-2 text-slate-600">ИТОГО</td>
                <td className="px-3 py-2 text-right">{fmt(grand.фонд)}</td>
                <td className="px-3 py-2 text-right text-slate-400">{fmt(rows.reduce((s,r)=>s+r.резерв_компании,0))}</td>
                <td className="px-3 py-2 text-right text-slate-700">{fmt(grand.усн)}</td>
                <td className="px-3 py-2 text-right text-indigo-700">{fmt(grand.кп)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{fmt(grand.сриск)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
