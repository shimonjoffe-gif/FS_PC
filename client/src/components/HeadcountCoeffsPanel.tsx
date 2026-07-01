import React, { useEffect, useMemo, useState } from 'react';
import type { BriefingAssessment, FsQueueKey, HeadcountCoeffs } from '../types';
import {
  effectivePhaseCalcParamsForQueue,
  effectiveHeadcountOpeForQueue,
  patchHeadcountOpeHours,
  resetHeadcountOpeHours,
  resetHeadcountOpeToBaseQueue,
  isPhaseCalcParamOverAuto,
  isPhaseCalcParamQueueSpecific,
  isHeadcountOpeUserOverride,
  isHeadcountOpeQueueSpecific,
  autoPhaseCalcParamForQueue,
  patchQueuePhaseParam,
  type HeadcountOpeField,
  type PhaseCalcNumericKey,
  type PhaseCalcParams,
} from '../phaseCalcParams';
import { OverridableNumberInput } from './OverridableNumberInput';
import { numericInputHandlers } from '../utils/numericInputHandlers';

const OVERRIDE_CLASS = 'bg-amber-50 border-amber-300';
const QUEUE_SPECIFIC_CLASS = 'bg-sky-50 border-sky-300';
const CALCULATED_CLASS = 'bg-sky-50 border-sky-300';
const RECALC_FLASH_CLASS = 'ring-2 ring-inset ring-emerald-300/70';

const COMPLEXITY_COEFFS: [keyof HeadcountCoeffs, string][] = [
  ['c63', 'Реализация функционала (C63)'],
  ['c64', 'Интеграции/БД (C64)'],
];

const OPE_USER_HOURS: [HeadcountOpeField, string, string][] = [
  ['c67', 'C67', 'Часов на пользователя в ОПЭ, РП/РПО'],
  ['c68', 'C68', 'Часов на пользователя в ОПЭ, исполнитель'],
];

const OPE_PHASE_ROWS: { label: string; excel: string; key: PhaseCalcNumericKey }[] = [
  { label: 'Ввод в ОПЭ, часов', excel: 'C65', key: 'c65_ope_intro_hours' },
  { label: 'ОПЭ, часов', excel: 'C66', key: 'c66_ope_hours' },
];

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
  queue: FsQueueKey;
  assessment: BriefingAssessment;
  recalcFlash?: number;
  onChange: (patch: Record<string, unknown>) => void;
  phaseCalcParams?: Partial<PhaseCalcParams> | PhaseCalcParams;
  onPhaseCalcChange: (patch: Partial<PhaseCalcParams>) => void;
  onPhaseParamResetToAuto: (key: PhaseCalcNumericKey) => void;
  onPhaseParamResetToQueue1: (key: PhaseCalcNumericKey) => void;
  onHeadcountOpeResetToAuto: (field: HeadcountOpeField) => void;
  onHeadcountOpeResetToQueue1: (field: HeadcountOpeField) => void;
  embedded?: boolean;
  embeddedColumn?: boolean;
  /** Заголовок колонки вынесен в родителя (выравнивание таблиц). */
  suppressColumnPreface?: boolean;
  /** Скрыть блок коэффициентов (только ОПЭ в grid-колонке). */
  suppressCoeffs?: boolean;
  /** Скрыть блок ОПЭ (только коэффициенты в grid-колонке). */
  suppressOpe?: boolean;
  gridCoeffsClass?: string;
  gridOpeTitleClass?: string;
  gridOpeBodyClass?: string;
  accuracyPct?: number;
  onAccuracyChange?: (value: number) => void;
}

function CoeffTable({
  rows,
  assessment: a,
  onSetCoeff,
  onResetCoeff,
}: {
  rows: [keyof HeadcountCoeffs, string][];
  assessment: BriefingAssessment;
  onSetCoeff: (key: keyof HeadcountCoeffs, value: number) => void;
  onResetCoeff: (key: keyof HeadcountCoeffs) => void;
}) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="bg-slate-50 text-slate-500">
          <th className="p-2 border text-left">Параметр</th>
          <th className="p-2 border text-right w-20">Авто</th>
          <th className="p-2 border text-right w-28">Значение</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, label]) => {
          const manual = (a.headcount_coeffs[key] as number) !== a.auto_headcount_coeffs[key];
          return (
          <tr key={key}>
            <td className="p-2 border">{label}</td>
            <td className="p-2 border text-right text-slate-400 tabular-nums">
              {a.auto_headcount_coeffs[key]}
            </td>
            <td className="p-2 border">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  className={`w-full text-right border rounded px-2 py-1 tabular-nums ${
                    manual ? OVERRIDE_CLASS : CALCULATED_CLASS
                  }`}
                  value={a.headcount_coeffs[key] as number}
                  title={manual ? `Авто: ${a.auto_headcount_coeffs[key]}` : undefined}
                  onChange={e => onSetCoeff(key, Number(e.target.value))}
                />
                {manual && (
                  <button
                    type="button"
                    className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
                    title={`Авто (${a.auto_headcount_coeffs[key]})`}
                    onClick={() => onResetCoeff(key)}
                  >
                    ↺
                  </button>
                )}
              </div>
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function HeadcountCoeffsPanel({
  queue,
  assessment: a,
  recalcFlash = 0,
  onChange,
  phaseCalcParams,
  onPhaseCalcChange,
  onPhaseParamResetToAuto,
  onPhaseParamResetToQueue1,
  onHeadcountOpeResetToAuto,
  onHeadcountOpeResetToQueue1,
  embedded = false,
  embeddedColumn = false,
  suppressColumnPreface = false,
  suppressCoeffs = false,
  suppressOpe = false,
  gridCoeffsClass,
  gridOpeTitleClass,
  gridOpeBodyClass,
  accuracyPct,
  onAccuracyChange,
}: Props) {
  const flash = useRecalcFlash(recalcFlash);
  const mergedParams = useMemo(
    () => effectivePhaseCalcParamsForQueue(queue, phaseCalcParams),
    [phaseCalcParams, queue],
  );
  const storedParams = phaseCalcParams;

  function setCoeff(key: keyof HeadcountCoeffs, value: number) {
    const auto = a.auto_headcount_coeffs[key];
    if (value === auto) {
      resetCoeff(key);
      return;
    }
    onChange({
      headcount_coeffs: { ...a.headcount_coeffs, [key]: value },
      headcount_manual: true,
    });
  }

  function applyPhaseParamPatch(key: PhaseCalcNumericKey, value: number) {
    const autoVal = autoPhaseCalcParamForQueue(queue, key, a);
    const q1Val = effectivePhaseCalcParamsForQueue('1', phaseCalcParams ?? {})[key] as number;
    if (queue === '1' && value === autoVal) {
      onPhaseParamResetToAuto(key);
      return;
    }
    if (queue !== '1' && value === q1Val) {
      onPhaseParamResetToQueue1(key);
      return;
    }
    onPhaseCalcChange(patchQueuePhaseParam(phaseCalcParams ?? {}, queue, key, value));
  }

  function applyHeadcountOpePatch(field: HeadcountOpeField, value: number) {
    const auto = a.auto_headcount_coeffs[field];
    const q1 = effectiveHeadcountOpeForQueue('1', a, storedParams, field);
    if (queue === '1' && value === auto) {
      onPhaseCalcChange(resetHeadcountOpeHours(storedParams ?? {}, queue, field));
      return;
    }
    if (queue !== '1' && value === q1) {
      onPhaseCalcChange(resetHeadcountOpeToBaseQueue(storedParams ?? {}, queue, field));
      return;
    }
    onPhaseCalcChange(patchHeadcountOpeHours(storedParams ?? {}, queue, field, value));
  }

  function resetCoeff(key: keyof HeadcountCoeffs) {
    const nextCoeffs = { ...a.headcount_coeffs, [key]: a.auto_headcount_coeffs[key] };
    const allAuto = (Object.keys(nextCoeffs) as (keyof HeadcountCoeffs)[]).every(
      k => nextCoeffs[k] === a.auto_headcount_coeffs[k],
    );
    onChange({
      headcount_coeffs: nextCoeffs,
      headcount_manual: allAuto ? false : true,
    });
  }

  function renderOpeParamCell(key: PhaseCalcNumericKey) {
    const queueSpecific = isPhaseCalcParamQueueSpecific(queue, key, storedParams);
    const overridden = isPhaseCalcParamOverAuto(queue, key, storedParams, a);
    return (
      <OverridableNumberInput
        value={mergedParams[key] as number}
        autoValue={autoPhaseCalcParamForQueue(queue, key, a)}
        step={0.5}
        grouped
        overridden={overridden}
        queueSpecific={queueSpecific}
        onChange={v => applyPhaseParamPatch(key, v)}
        onResetToAuto={() => onPhaseParamResetToAuto(key)}
        onResetToQueue1={queue !== '1' && queueSpecific ? () => onPhaseParamResetToQueue1(key) : undefined}
        overrideClass={OVERRIDE_CLASS}
        queueSpecificClass={QUEUE_SPECIFIC_CLASS}
      />
    );
  }

  function renderHeadcountOpeCell(field: HeadcountOpeField) {
    const autoValue = a.auto_headcount_coeffs[field];
    const queueSpecific = isHeadcountOpeQueueSpecific(queue, field, storedParams, a);
    const overridden = isHeadcountOpeUserOverride(queue, field, a, storedParams);
    const value = overridden
      ? effectiveHeadcountOpeForQueue(queue, a, storedParams, field)
      : autoValue;
    return (
      <OverridableNumberInput
        value={value}
        autoValue={autoValue}
        step={0.1}
        grouped
        calculated
        overridden={overridden}
        queueSpecific={queueSpecific}
        onChange={v => applyHeadcountOpePatch(field, v)}
        onResetToAuto={() => onHeadcountOpeResetToAuto(field)}
        onResetToQueue1={queue !== '1' && queueSpecific ? () => onHeadcountOpeResetToQueue1(field) : undefined}
        overrideClass={OVERRIDE_CLASS}
        calculatedClass={CALCULATED_CLASS}
        queueSpecificClass={QUEUE_SPECIFIC_CLASS}
      />
    );
  }

  const header = (
    <div className={`flex items-center justify-between ${embedded ? 'mb-1' : 'mb-2'}`}>
      {embedded ? (
        <div className="text-xs font-medium text-slate-600">Коэффициенты и параметры ОПЭ</div>
      ) : (
        <h3 className="text-sm font-semibold text-slate-700">Коэффициенты и параметры ОПЭ</h3>
      )}
      {a.headcount_manual && (
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline"
          onClick={() => onChange({ reset_headcount: true })}
        >
          Сбросить коэффициенты к авто
        </button>
      )}
    </div>
  );

  const opeTitleClass = embedded && !suppressColumnPreface
    ? 'text-xs font-medium text-slate-600 mb-1'
    : 'text-xs font-medium text-slate-600 px-3 pt-3 pb-1';

  const gridFlat = embeddedColumn && suppressColumnPreface && (gridCoeffsClass || gridOpeTitleClass);

  const accuracyRow = accuracyPct != null && onAccuracyChange ? (
    <table className="w-full text-xs border-collapse">
      <tbody>
        <tr>
          <td className="p-2 border">Точность оценки (C58)</td>
          <td className="p-2 border text-right text-slate-400 w-20 tabular-nums">—</td>
          <td className="p-2 border">
            <div className="relative">
              <input
                type="number"
                step="1"
                className="w-full text-right border rounded px-2 py-1 pr-6 tabular-nums"
                value={accuracyPct}
                onChange={e => onAccuracyChange(Number(e.target.value))}
                {...numericInputHandlers}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                %
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  ) : null;

  const body = gridFlat ? (
    <>
      {!suppressCoeffs && gridCoeffsClass && (
        <div
          className={`min-w-0 ${gridCoeffsClass} ${
            flash && !a.headcount_manual ? `rounded-lg ${RECALC_FLASH_CLASS}` : ''
          }`}
        >
          <CoeffTable
            rows={COMPLEXITY_COEFFS}
            assessment={a}
            onSetCoeff={setCoeff}
            onResetCoeff={resetCoeff}
          />
          {accuracyRow}
        </div>
      )}
      {!suppressOpe && gridOpeTitleClass && (
        <>
          <div className={gridOpeTitleClass}>Параметры ОПЭ</div>
          <div className={gridOpeBodyClass}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="p-2 border text-left">Параметр</th>
              <th className="p-2 border text-center w-16">Яч.</th>
              <th className="p-2 border text-right w-20">Авто</th>
              <th className="p-2 border text-right w-28">Значение</th>
            </tr>
          </thead>
          <tbody>
            {OPE_USER_HOURS.map(([key, excel, label]) => (
              <tr key={key}>
                <td className="p-2 border">{label}</td>
                <td className="p-2 border text-center text-slate-400">{excel}</td>
                <td className="p-2 border text-right text-slate-400 tabular-nums">
                  {a.auto_headcount_coeffs[key]}
                </td>
                <td className="p-2 border">{renderHeadcountOpeCell(key)}</td>
              </tr>
            ))}
            {OPE_PHASE_ROWS.map(row => (
              <tr key={row.key}>
                <td className="p-2 border">{row.label}</td>
                <td className="p-2 border text-center text-slate-400">{row.excel}</td>
                <td className="p-2 border text-right text-slate-400 tabular-nums">
                  {autoPhaseCalcParamForQueue(queue, row.key, a)}
                </td>
                <td className="p-2 border">{renderOpeParamCell(row.key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </>
      )}
    </>
  ) : (
    <div className={`grid grid-cols-1 ${embeddedColumn ? '' : 'lg:grid-cols-2'} gap-4`}>
      <div className="space-y-3 min-w-0">
        <div className={`${embedded ? '' : 'border rounded-lg '}bg-white overflow-x-auto`}>
          {!embedded && (
            <div className="text-xs font-medium text-slate-600 px-3 pt-3 pb-1">
              Коэффициенты сложности
            </div>
          )}
          {embedded && !suppressColumnPreface && (
            <div className="text-xs font-medium text-slate-600 mb-1">Коэффициенты сложности</div>
          )}
          <CoeffTable
            rows={COMPLEXITY_COEFFS}
            assessment={a}
            onSetCoeff={setCoeff}
            onResetCoeff={resetCoeff}
          />
        </div>
      </div>

      <div className="min-w-0">
        <div className={`${embedded ? '' : 'border rounded-lg '}bg-white overflow-x-auto`}>
          {!embedded && (
            <div className="text-xs font-medium text-slate-600 px-3 pt-3 pb-1">Параметры ОПЭ</div>
          )}
          {embedded && !suppressColumnPreface && (
            <div className={opeTitleClass}>Параметры ОПЭ</div>
          )}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="p-2 border text-left">Параметр</th>
                <th className="p-2 border text-center w-16">Яч.</th>
                <th className="p-2 border text-right w-20">Авто</th>
                <th className="p-2 border text-right w-28">Значение</th>
              </tr>
            </thead>
            <tbody>
              {OPE_USER_HOURS.map(([key, excel, label]) => (
                <tr key={key}>
                  <td className="p-2 border">{label}</td>
                  <td className="p-2 border text-center text-slate-400">{excel}</td>
                  <td className="p-2 border text-right text-slate-400 tabular-nums">
                    {a.auto_headcount_coeffs[key]}
                  </td>
                  <td className="p-2 border">{renderHeadcountOpeCell(key)}</td>
                </tr>
              ))}
              {OPE_PHASE_ROWS.map(row => (
                <tr key={row.key}>
                  <td className="p-2 border">{row.label}</td>
                  <td className="p-2 border text-center text-slate-400">{row.excel}</td>
                  <td className="p-2 border text-right text-slate-400 tabular-nums">
                    {autoPhaseCalcParamForQueue(queue, row.key, a)}
                  </td>
                  <td className="p-2 border">{renderOpeParamCell(row.key)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    if (gridFlat) {
      return <>{body}</>;
    }
    return (
      <div
        className={`min-w-0 ${flash && !a.headcount_manual ? `rounded-lg ${RECALC_FLASH_CLASS}` : ''}`}
      >
        {!suppressColumnPreface && header}
        {body}
      </div>
    );
  }

  return (
    <section className={`w-full min-w-0 ${flash && !a.headcount_manual ? `rounded-lg ${RECALC_FLASH_CLASS}` : ''}`}>
      {header}
      {body}
    </section>
  );
}
