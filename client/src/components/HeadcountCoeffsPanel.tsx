import React, { useEffect, useState } from 'react';
import type { BriefingAssessment, HeadcountCoeffs } from '../types';

const OVERRIDE_CLASS = 'bg-amber-50 border-amber-300';
const RECALC_FLASH_CLASS = 'ring-2 ring-inset ring-emerald-300/70';

function useRecalcFlash(flashKey: number): boolean {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (flashKey === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(t);
  }, [flashKey]);
  return flash;
}

interface Props {
  assessment: BriefingAssessment;
  recalcFlash?: number;
  onChange: (patch: Record<string, unknown>) => void;
}

export default function HeadcountCoeffsPanel({ assessment: a, recalcFlash = 0, onChange }: Props) {
  const flash = useRecalcFlash(recalcFlash);

  function setCoeff(key: keyof HeadcountCoeffs, value: string | number) {
    onChange({
      headcount_coeffs: { ...a.headcount_coeffs, [key]: value },
      headcount_manual: true,
    });
  }

  return (
    <section className={flash && !a.headcount_manual ? `rounded-lg ${RECALC_FLASH_CLASS}` : ''}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">Коэффициенты (C63–C68)</h3>
        {a.headcount_manual && (
          <button type="button" className="text-xs text-blue-600 hover:underline"
            onClick={() => onChange({ reset_headcount: true })}>
            Сбросить к авто
          </button>
        )}
      </div>
      <table className="w-full text-xs border-collapse max-w-lg">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            <th className="p-2 border text-left">Коэфф.</th>
            <th className="p-2 border text-right w-24">Авто</th>
            <th className="p-2 border text-right w-32">Значение</th>
          </tr>
        </thead>
        <tbody>
          {([
            ['c63', 'Реализация функционала (C63)'],
            ['c64', 'Интеграции/БД (C64)'],
            ['c67', 'ОПЭ РП/РПО (C67)'],
            ['c68', 'ОПЭ исполнитель (C68)'],
          ] as [keyof HeadcountCoeffs, string][]).map(([key, label]) => (
            <tr key={key}>
              <td className="p-2 border">{label}</td>
              <td className="p-2 border text-right text-slate-400">
                {a.auto_headcount_coeffs[key]}
              </td>
              <td className="p-2 border">
                <input type="number" step="0.1" min="0"
                  className={`w-full text-right border rounded px-2 py-1 ${a.headcount_manual ? OVERRIDE_CLASS : ''}`}
                  value={a.headcount_coeffs[key] as number}
                  onChange={e => setCoeff(key, Number(e.target.value))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
