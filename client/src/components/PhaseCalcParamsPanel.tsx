import { useMemo } from 'react';
import type { FsQueueKey } from '../types';
import {
  effectivePhaseCalcParamsForQueue,
  effectivePhaseCalcParamForQueue,
  extractLegacyScalarPatch,
  patchQueuePhaseParam,
  patchQueueRdMode,
  resetQueuePhaseParamToAuto,
  resetQueuePhaseParamToBaseQueue,
  resetQueueRdModeToBaseQueue,
  resetQueueRdModeToAuto,
  patchTrainingManualGh,
  resetTrainingManualGh,
  isPhaseCalcParamOverAuto,
  isTechnologyAutoParamUserOverride,
  isTechnologyAutoPhaseParamKey,
  isPhaseCalcParamQueueSpecific,
  isRdModeQueueSpecific,
  effectiveRdModeForQueue,
  autoPhaseCalcParamForQueue,
  effectiveC89ForQueue,
  isC89ManualForQueue,
  isTrainingEManual,
  effectiveTrainingRowDelivery,
  patchTrainingRowDelivery,
  resetTrainingRowFormat,
  resetTrainingRowWebinarField,
  isTrainingRowWebinarFieldStored,
  DEFAULT_WEBINAR_COUNT,
  DEFAULT_WEBINAR_QA_RESERVE,
  DEFAULT_PHASE_CALC_PARAMS,
  PHASE_BASE_QUEUE,
  type PhaseCalcParams,
  type PhaseCalcNumericKey,
  type RdDeliveryMode,
  type TrainingDeliveryFormat,
  type TrainingRowKey,
} from '../phaseCalcParams';
import {
  effectiveTrainingEValues,
  type TrainingEField,
} from '../assessmentCalc';
import { computeTrainingGroups, computeAutoC89FromR81 } from '../phaseCalc';
import type { TrainingGroupRowCalc, TrainingGroupsCalc } from '../phaseCalc';
import type { BriefingAssessment, BriefingFsSel } from '../types';
import { numericInputHandlers } from '../utils/numericInputHandlers';
import { OverridableNumberInput } from './OverridableNumberInput';
import HeadcountCoeffsPanel from './HeadcountCoeffsPanel';
import QueueSwitcher from './QueueSwitcher';

const OVERRIDE_CLASS = 'bg-amber-50 border-amber-300';
const QUEUE_SPECIFIC_CLASS = 'bg-sky-50 border-sky-300';
/** Одинаковая высота зоны над первой таблицей в каждой из 3 колонок. */
const COLUMN_TABLE_PREFACE = 'min-h-[4.75rem] flex flex-col justify-end gap-1';
/** Заголовок второго блока в колонке (Параметры БД / ОПЭ / Документация). */
const COLUMN_SECOND_BLOCK_TITLE = 'text-xs font-medium text-slate-600 mb-1';
/** Строки subgrid внутри колонки на lg (общие треки родительской сетки). */
const R1 = 'lg:row-start-1';
const R2 = 'lg:row-start-2';
const R3 = 'lg:row-start-3';
const R4 = 'lg:row-start-4';
const COL_WRAPPER_BASE = 'flex flex-col gap-3 min-w-0 lg:row-span-4 lg:grid lg:grid-rows-subgrid';
const COL1_WRAPPER = `${COL_WRAPPER_BASE} lg:col-start-1`;
const COL2_WRAPPER = `${COL_WRAPPER_BASE} lg:col-start-2`;
const COL3_WRAPPER = `${COL_WRAPPER_BASE} lg:col-start-3`;
const CALCULATED_CLASS = 'bg-sky-50 border-sky-300';

type Props = {
  params: Partial<PhaseCalcParams> | PhaseCalcParams;
  onChange: (patch: Partial<PhaseCalcParams>, omit?: PhaseCalcNumericKey[]) => void;
  onParamResetToAuto: (key: PhaseCalcNumericKey) => void;
  onParamResetToQueue1: (key: PhaseCalcNumericKey) => void;
  onRdModeResetToAuto: () => void;
  onRdModeResetToQueue1: () => void;
  onHeadcountOpeResetToAuto: (field: 'c67' | 'c68') => void;
  onHeadcountOpeResetToQueue1: (field: 'c67' | 'c68') => void;
  assessment: BriefingAssessment;
  fsItems: BriefingFsSel[];
  queue: FsQueueKey;
  onQueueChange: (q: FsQueueKey) => void;
  onC89Change: (value: string | number) => void;
  onC89Reset: () => void;
  onTrainingEChange: (field: TrainingEField, value: string | number) => void;
  onTrainingEReset: (field: TrainingEField) => void;
  onTrainingGhChange: (rowKey: TrainingRowKey, field: 'g' | 'h', value: string | number) => void;
  onTrainingGhReset: (rowKey: TrainingRowKey, field: 'g' | 'h') => void;
  recalcFlash?: number;
  onAssessmentChange: (patch: Record<string, unknown>) => void;
  accuracyPct: number;
  onAccuracyChange: (value: number) => void;
};

function ReadonlyCell({ value, title }: { value: number | string; title?: string }) {
  return (
    <div
      className={`w-full text-right px-2 py-1 text-slate-700 rounded border ${CALCULATED_CLASS}`}
      title={title}
    >
      {value}
    </div>
  );
}

const FE_ROWS: {
  label: string;
  excel: string;
  key: PhaseCalcNumericKey;
}[] = [
  { label: 'Объём методической проработки на ФЕ', excel: 'C35', key: 'c35_methodical_hours_per_fe' },
  { label: 'Объём сбора требований на ФЕ', excel: 'C37', key: 'c37_requirements_hours_per_fe' },
  { label: 'Объём проектирования на ФЕ', excel: 'C38', key: 'c38_design_hours_per_fe' },
  { label: 'Базовый объём на реализацию ФЕ', excel: 'C39', key: 'c39_implementation_hours_per_fe' },
];

const DB_ROWS: {
  label: string;
  excel: string;
  key: PhaseCalcNumericKey;
}[] = [
  { label: 'Инсталяция', excel: 'C41', key: 'c41_db_install_hours' },
  { label: 'Загрузка НСИ', excel: 'C42', key: 'c42_db_nsi_hours' },
  { label: 'Настройка прав доступа', excel: 'C43', key: 'c43_db_access_hours' },
  { label: 'Настройка рабочих мест', excel: 'C44', key: 'c44_db_workplaces_hours' },
  { label: 'Подготовка к обучению', excel: 'C46', key: 'c46_training_prep_hours' },
];

const RD_MODE_OPTIONS: { id: RdDeliveryMode; label: string }[] = [
  { id: 'doc', label: 'Документация' },
  { id: 'video', label: 'Видео' },
  { id: 'doc_video', label: 'Документация + видео' },
];

/** Excel rows 47–49 (лист очереди, блок обучения). */
const TRAINING_ROWS: {
  label: string;
  peopleKey: PhaseCalcNumericKey;
  hoursKey: PhaseCalcNumericKey;
  calcKey: 'row47' | 'row48' | 'row49';
  eField: TrainingEField;
  eSource: string;
  eRegionalSource: string;
}[] = [
  {
    label: 'Обучению кроме исполнителей группы по:',
    peopleKey: 'c47_users_per_group',
    hoursKey: 'd47_users_hours_per_group',
    calcKey: 'row47',
    eField: 'e47',
    eSource: 'C5 — РП/РПО (орг. объём)',
    eRegionalSource: 'сумма РП/РПО в breakdown очереди',
  },
  {
    label: 'Часов по Обучению Исполнителей группы по:',
    peopleKey: 'c48_executors_per_group',
    hoursKey: 'd48_executors_hours_per_group',
    calcKey: 'row48',
    eField: 'e48',
    eSource: 'C6 — исполнители (орг. объём)',
    eRegionalSource: 'сумма исполнителей в breakdown очереди',
  },
  {
    label: 'Часов на обучение Администраторов группы по:',
    peopleKey: 'c49_admins_per_group',
    hoursKey: 'd49_admins_hours_per_group',
    calcKey: 'row49',
    eField: 'e49',
    eSource: 'C7 — РГ к обучению (орг. объём)',
    eRegionalSource: 'сумма РГ в breakdown очереди',
  },
];

const MISC_ROWS: {
  label: string;
  excel: string;
  key: PhaseCalcNumericKey | 'c89';
  step?: number;
}[] = [
  { label: 'Стоимость дня командировки, ₽', excel: 'C50', key: 'c50_business_trip_day_cost', step: 100 },
  { label: 'Документация ИБ (фаза 8.1), ₽', excel: 'C88', key: 'c88_ib_doc_amount', step: 100_000 },
  { label: 'Передача на сервис (фаза 8), ₽', excel: 'C89', key: 'c89', step: 100_000 },
  { label: 'Сопровождение БД (1 год), ₽', excel: 'C90', key: 'c90_db_support_amount', step: 100_000 },
];

const EMPTY_TRAINING_ROW: TrainingGroupRowCalc = {
  e: 0, eRegional: 0, c: 0, d: 0, f: 0, g: 0, h: 0, fd: 0,
};

const EMPTY_TRAINING: TrainingGroupsCalc = {
  row47: EMPTY_TRAINING_ROW,
  row48: EMPTY_TRAINING_ROW,
  row49: EMPTY_TRAINING_ROW,
};

function trainingFormulaHint(
  row: TrainingGroupRowCalc,
  eSource: string,
  eRegionalSource: string,
): string {
  return [
    `E: ${eSource} = ${row.e}`,
    `F = ROUNDUP(E / ${row.c}, 0) = ${row.f}`,
    `G: ${eRegionalSource} = ${row.eRegional}; ROUNDUP(${row.eRegional} / ${row.c}, 0) = ${row.g}`,
    `H = ROUNDUP(G × ${row.d} / 8, 0) = ${row.h}`,
  ].join('\n');
}

export default function PhaseCalcParamsPanel({
  params,
  onChange,
  onParamResetToAuto,
  onParamResetToQueue1,
  onRdModeResetToAuto,
  onRdModeResetToQueue1,
  onHeadcountOpeResetToAuto,
  onHeadcountOpeResetToQueue1,
  assessment,
  fsItems,
  queue,
  onQueueChange,
  onC89Change,
  onC89Reset,
  onTrainingEChange,
  onTrainingEReset,
  onTrainingGhChange,
  onTrainingGhReset,
  recalcFlash = 0,
  onAssessmentChange,
  accuracyPct,
  onAccuracyChange,
}: Props) {
  const mergedParams = useMemo(
    () => effectivePhaseCalcParamsForQueue(queue, params),
    [params, queue],
  );
  const storedParams = params;
  const queueRow = assessment.org_volume?.queues?.[queue];
  const autoQueueRow = assessment.auto_org_volume?.queues?.[queue];
  const autoE = useMemo(
    () => (autoQueueRow ? effectiveTrainingEValues(autoQueueRow) : { e47: 0, e48: 0, e49: 0 }),
    [autoQueueRow],
  );
  const autoTraining = useMemo(() => {
    if (!queueRow) return EMPTY_TRAINING;
    const withoutManual: PhaseCalcParams = { ...mergedParams, training_manual: undefined };
    return computeTrainingGroups(queueRow, withoutManual, queue);
  }, [queueRow, mergedParams, queue]);
  const training = useMemo(
    () => (queueRow ? computeTrainingGroups(queueRow, mergedParams, queue) : EMPTY_TRAINING),
    [queueRow, mergedParams, queue],
  );
  const autoC89 = useMemo(
    () => computeAutoC89FromR81(queue, assessment, fsItems),
    [queue, assessment, fsItems],
  );

  function applyParamPatch(key: PhaseCalcNumericKey, value: number) {
    const autoVal = autoPhaseCalcParamForQueue(queue, key, assessment);
    const q1Val = effectivePhaseCalcParamForQueue(PHASE_BASE_QUEUE, key, params);

    if (queue === PHASE_BASE_QUEUE && value === autoVal) {
      const reset = resetQueuePhaseParamToAuto(params, queue, key, assessment);
      onChange(reset.phase_calc_params, reset.phase_calc_params_omit as PhaseCalcNumericKey[] | undefined);
      return;
    }
    if (queue !== PHASE_BASE_QUEUE && value === q1Val) {
      onChange(resetQueuePhaseParamToBaseQueue(params, queue, key));
      return;
    }

    const patch = patchQueuePhaseParam(params, queue, key, value);
    const omit = queue === '1' && extractLegacyScalarPatch(params)[key] !== undefined
      ? [key]
      : undefined;
    onChange(patch, omit);
  }

  function renderParamCell(key: PhaseCalcNumericKey, step = 0.5) {
    const calculated = isTechnologyAutoPhaseParamKey(key);
    const autoValue = autoPhaseCalcParamForQueue(queue, key, assessment);
    const queueSpecific = isPhaseCalcParamQueueSpecific(queue, key, storedParams);
    const overridden = calculated
      ? isTechnologyAutoParamUserOverride(queue, key, storedParams, assessment)
      : isPhaseCalcParamOverAuto(queue, key, storedParams, assessment);
    const value = calculated && !overridden
      ? autoValue
      : (mergedParams[key] as number);
    return (
      <OverridableNumberInput
        value={value}
        autoValue={autoValue}
        step={step}
        calculated={calculated}
        overridden={overridden}
        queueSpecific={queueSpecific}
        onChange={v => applyParamPatch(key, v)}
        onResetToAuto={() => onParamResetToAuto(key)}
        onResetToQueue1={queue !== '1' && queueSpecific ? () => onParamResetToQueue1(key) : undefined}
        overrideClass={OVERRIDE_CLASS}
        calculatedClass={CALCULATED_CLASS}
        queueSpecificClass={QUEUE_SPECIFIC_CLASS}
      />
    );
  }

  function renderMiscParamCell(row: (typeof MISC_ROWS)[number]) {
    const grouped = true;
    const common = {
      step: row.step ?? 0.5,
      grouped,
      overrideClass: OVERRIDE_CLASS,
      queueSpecificClass: QUEUE_SPECIFIC_CLASS,
    };
    if (row.key === 'c89') {
      const value = effectiveC89ForQueue(queue, storedParams, autoC89);
      return (
        <OverridableNumberInput
          value={value}
          autoValue={autoC89}
          calculated
          overridden={isC89ManualForQueue(storedParams, queue, autoC89)}
          onChange={onC89Change}
          onReset={onC89Reset}
          calculatedClass={CALCULATED_CLASS}
          {...common}
        />
      );
    }
    if (row.key === 'c90_db_support_amount') {
      const c90Key = 'c90_db_support_amount' as const;
      const autoValue = autoPhaseCalcParamForQueue(queue, c90Key, assessment);
      const queueSpecific = isPhaseCalcParamQueueSpecific(queue, c90Key, storedParams);
      const overridden = isTechnologyAutoParamUserOverride(queue, c90Key, storedParams, assessment);
      const value = overridden ? mergedParams.c90_db_support_amount : autoValue;
      return (
        <OverridableNumberInput
          value={value}
          autoValue={autoValue}
          calculated
          overridden={overridden}
          queueSpecific={queueSpecific}
          onChange={v => applyParamPatch(c90Key, v)}
          onResetToAuto={() => onParamResetToAuto(c90Key)}
          onResetToQueue1={queue !== '1' && queueSpecific ? () => onParamResetToQueue1(c90Key) : undefined}
          calculatedClass={CALCULATED_CLASS}
          {...common}
        />
      );
    }
    const miscKey = row.key as PhaseCalcNumericKey;
    const queueSpecific = isPhaseCalcParamQueueSpecific(queue, miscKey, storedParams);
    const overridden = isPhaseCalcParamOverAuto(queue, miscKey, storedParams, assessment);
    return (
      <OverridableNumberInput
        value={mergedParams[miscKey] as number}
        autoValue={autoPhaseCalcParamForQueue(queue, miscKey, assessment)}
        overridden={overridden}
        queueSpecific={queueSpecific}
        onChange={v => applyParamPatch(miscKey, v)}
        onResetToAuto={() => onParamResetToAuto(miscKey)}
        onResetToQueue1={queue !== '1' && queueSpecific ? () => onParamResetToQueue1(miscKey) : undefined}
        {...common}
      />
    );
  }

  const rdMode = effectiveRdModeForQueue(queue, storedParams);
  const rdQueueSpecific = isRdModeQueueSpecific(queue, storedParams);
  const rdOverAuto = rdMode !== DEFAULT_PHASE_CALC_PARAMS.rd_delivery_mode;

  function applyRdMode(mode: RdDeliveryMode) {
    const q1Mode = effectiveRdModeForQueue(PHASE_BASE_QUEUE, storedParams);
    if (queue !== PHASE_BASE_QUEUE && mode === q1Mode) {
      onChange(resetQueueRdModeToBaseQueue(params, queue));
      return;
    }
    if (queue === PHASE_BASE_QUEUE && mode === DEFAULT_PHASE_CALC_PARAMS.rd_delivery_mode) {
      const reset = resetQueueRdModeToAuto(params, queue);
      onChange(
        reset.phase_calc_params,
        reset.phase_calc_params_omit as PhaseCalcNumericKey[] | undefined,
      );
      return;
    }
    onChange(patchQueueRdMode(params, queue, mode));
  }

  return (
    <div className="border rounded-lg p-3 bg-white space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700">Параметры расчёта фаз</h3>
        <QueueSwitcher showLabel value={queue} onChange={onQueueChange} />
      </div>
      <p className="text-[10px] text-slate-400">
          <span className={`inline-block w-2 h-2 rounded-sm border ${OVERRIDE_CLASS} align-middle mr-1`} />
          ≠ авто
          <span className={`inline-block w-2 h-2 rounded-sm border ${QUEUE_SPECIFIC_CLASS} align-middle mx-1`} />
          своя очередь
          <span className="text-slate-300 mx-1">·</span>
          ↺1 — как оч. 1, ↺ — авто
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 lg:grid-rows-[repeat(4,auto)] lg:gap-x-3 gap-y-3">
        <div className={COL1_WRAPPER}>
          <div className={`${COLUMN_TABLE_PREFACE} ${R1}`}>
            <div className="text-xs font-medium text-slate-600">Нормы на ФЕ, часы</div>
            <p className="text-[10px] text-slate-400">
              C37–C39 — для ПРОФ/КОРП/Проф-мини. Для Кейс и Быстрого запуска: 2,5 / 5,5 / 0 (авто).
            </p>
          </div>
          <div className={`min-w-0 ${R2}`}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="p-2 border text-left">Параметр</th>
                  <th className="p-2 border text-center w-16">Яч.</th>
                  <th className="p-2 border text-right w-24">Значение</th>
                </tr>
              </thead>
              <tbody>
                {FE_ROWS.map(row => (
                  <tr key={row.key}>
                    <td className="p-2 border">{row.label}</td>
                    <td className="p-2 border text-center text-slate-400">{row.excel}</td>
                    <td className="p-2 border">{renderParamCell(row.key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${COLUMN_SECOND_BLOCK_TITLE} ${R3}`}>
            Параметры подготовки БД, часы
          </div>
          <div className={`min-w-0 ${R4}`}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="p-2 border text-left">Параметр</th>
                  <th className="p-2 border text-center w-16">Яч.</th>
                  <th className="p-2 border text-right w-24">Значение</th>
                </tr>
              </thead>
              <tbody>
                {DB_ROWS.map(row => (
                  <tr key={row.key}>
                    <td className="p-2 border">{row.label}</td>
                    <td className="p-2 border text-center text-slate-400">{row.excel}</td>
                    <td className="p-2 border">{renderParamCell(row.key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={COL2_WRAPPER}>
          <div className={`${COLUMN_TABLE_PREFACE} ${R1}`}>
            <div className="text-xs font-medium text-slate-600">Документация</div>
            <p className="text-[10px] text-slate-400">
              Фаза 5.1 (r81). «Ни одного» — выключите фазу в таблице фаз.
            </p>
          </div>
          <div className={`min-w-0 ${R2}`}>
            <div className={`rounded border p-2 ${
              rdQueueSpecific
                ? 'border-sky-300 bg-sky-50/40'
                : rdOverAuto
                  ? 'border-amber-300 bg-amber-50/40'
                  : 'border-slate-200 bg-slate-50/60'
            }`}>
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="text-[10px] font-medium text-slate-600">
                  Фаза 5.1 — рабочая документация (r81)
                </div>
                <div className="flex gap-1 text-[10px]">
                  {queue !== '1' && rdQueueSpecific && (
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={onRdModeResetToQueue1}
                    >
                      ↺1
                    </button>
                  )}
                  {rdOverAuto && (
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={onRdModeResetToAuto}
                    >
                      ↺ авто
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {RD_MODE_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => applyRdMode(opt.id)}
                    className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                      rdMode === opt.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mb-2">
                Стоимость: часы × C32 × C63.
              </p>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {(rdMode === 'doc' || rdMode === 'doc_video') && (
                    <tr>
                      <td className="p-2 border">Подготовка РД (документация)</td>
                      <td className="p-2 border text-center text-slate-400 w-16">C45</td>
                      <td className="p-2 border w-24">{renderParamCell('c45_rd_hours')}</td>
                    </tr>
                  )}
                  {(rdMode === 'video' || rdMode === 'doc_video') && (
                    <tr>
                      <td className="p-2 border">Запись видео-роликов</td>
                      <td className="p-2 border text-center text-slate-400 w-16">—</td>
                      <td className="p-2 border w-24">{renderParamCell('rd_video_hours')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <HeadcountCoeffsPanel
            embedded
            embeddedColumn
            suppressColumnPreface
            suppressCoeffs
            gridOpeTitleClass={`${COLUMN_SECOND_BLOCK_TITLE} ${R3}`}
            gridOpeBodyClass={`min-w-0 ${R4}`}
            queue={queue}
            assessment={assessment}
            recalcFlash={recalcFlash}
            onChange={onAssessmentChange}
            phaseCalcParams={params}
            onPhaseCalcChange={onChange}
            onPhaseParamResetToAuto={onParamResetToAuto}
            onPhaseParamResetToQueue1={onParamResetToQueue1}
            onHeadcountOpeResetToAuto={onHeadcountOpeResetToAuto}
            onHeadcountOpeResetToQueue1={onHeadcountOpeResetToQueue1}
          />
        </div>

        <div className={COL3_WRAPPER}>
          <div className={`${COLUMN_TABLE_PREFACE} ${R1}`}>
            <div className="text-xs font-medium text-slate-600">Прочие параметры</div>
            <p className="text-[10px] text-slate-400">
              C89 — для выбранной очереди; авто = C81 (фаза 5.1).
            </p>
          </div>
          <div className={`min-w-0 ${R2}`}>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500">
                  <th className="p-2 border text-left">Параметр</th>
                  <th className="p-2 border text-center w-16">Яч.</th>
                  <th className="p-2 border text-right min-w-[10.5rem] w-44">Значение</th>
                </tr>
              </thead>
              <tbody>
                {MISC_ROWS.map(row => (
                  <tr key={row.key}>
                    <td className="p-2 border">{row.label}</td>
                    <td className="p-2 border text-center text-slate-400">{row.excel}</td>
                    <td className="p-2 border text-right">{renderMiscParamCell(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`${R3}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <div className={`${COLUMN_SECOND_BLOCK_TITLE} mb-0`}>Коэффициенты сложности</div>
              {assessment.headcount_manual && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline shrink-0"
                  onClick={() => onAssessmentChange({ reset_headcount: true })}
                >
                  Сбросить к авто
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">C63/C64 — авто из пересчёта ФС.</p>
          </div>
          <HeadcountCoeffsPanel
            embedded
            embeddedColumn
            suppressColumnPreface
            suppressOpe
            gridCoeffsClass={R4}
            accuracyPct={accuracyPct}
            onAccuracyChange={onAccuracyChange}
            queue={queue}
            assessment={assessment}
            recalcFlash={recalcFlash}
            onChange={onAssessmentChange}
            phaseCalcParams={params}
            onPhaseCalcChange={onChange}
            onPhaseParamResetToAuto={onParamResetToAuto}
            onPhaseParamResetToQueue1={onParamResetToQueue1}
            onHeadcountOpeResetToAuto={onHeadcountOpeResetToAuto}
            onHeadcountOpeResetToQueue1={onHeadcountOpeResetToQueue1}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="text-xs font-medium text-slate-600">Обучение</div>
          <QueueSwitcher showLabel value={queue} onChange={onQueueChange} />
        </div>
        <p className="text-[10px] text-slate-400 mb-1">
          Строка 46 (C46) — в блоке «Параметры подготовки БД». Вид обучения: авто по E (стр. 47/49 — ≤100, стр. 48 — ≤300).
          Вебинар: N × 4 × C32 × (1 + резерв). ↺ — вернуть авто.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="p-2 border text-left min-w-[180px]" />
                <th className="p-2 border text-center min-w-[120px]">Вид обучения</th>
                <th className="p-2 border text-right w-20">чел./группа</th>
                <th className="p-2 border text-right w-20">Часов на группу</th>
                <th className="p-2 border text-right w-24">
                  Обучение силами исполнителя пользователей
                </th>
                <th className="p-2 border text-right w-20">Кол-во вебинаров</th>
                <th className="p-2 border text-right w-16">Резерв, %</th>
                <th className="p-2 border text-right w-20">Групп обучения</th>
                <th className="p-2 border text-right w-24">Групп в регионах</th>
                <th className="p-2 border text-right w-24">Дней командировки</th>
              </tr>
            </thead>
            <tbody>
              {TRAINING_ROWS.map(row => {
                const calc = training[row.calcKey];
                const autoRow = autoTraining[row.calcKey];
                const manualRow = mergedParams.training_manual?.queues?.[queue]?.[row.calcKey];
                const rowDelivery = effectiveTrainingRowDelivery(
                  queue, row.calcKey, calc.e, storedParams,
                );
                const isWebinar = rowDelivery.format === 'webinar';
                const isGroups = !isWebinar;

                function setFormat(fmt: TrainingDeliveryFormat) {
                  onChange(patchTrainingRowDelivery(mergedParams, queue, row.calcKey, {
                    format: fmt,
                    format_manual: true,
                  }));
                }

                function renderWebinarNumber(
                  field: 'webinar_count' | 'webinar_qa_reserve',
                  value: number,
                  autoValue: number,
                  step: number,
                ) {
                  const isPercent = field === 'webinar_qa_reserve';
                  const displayValue = isPercent ? value * 100 : value;
                  const displayAuto = isPercent ? autoValue * 100 : autoValue;
                  const stored = isTrainingRowWebinarFieldStored(storedParams, queue, row.calcKey, field);
                  return (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={isPercent ? 1 : step}
                        className={`w-full text-right border rounded px-2 py-1 ${
                          stored ? OVERRIDE_CLASS : CALCULATED_CLASS
                        }`}
                        value={displayValue}
                        title={isPercent ? `Авто: ${displayAuto}%` : `Авто: ${displayAuto}`}
                        onChange={e => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          onChange(patchTrainingRowDelivery(mergedParams, queue, row.calcKey, {
                            [field]: isPercent ? n / 100 : Math.round(n),
                          }));
                        }}
                        {...numericInputHandlers}
                      />
                      {stored && (
                        <button
                          type="button"
                          className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
                          title={isPercent ? `Вернуть авто (${displayAuto}%)` : `Вернуть авто (${displayAuto})`}
                          onClick={() => onChange(
                            resetTrainingRowWebinarField(mergedParams, queue, row.calcKey, field),
                          )}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <tr key={row.label}>
                    <td className="p-2 border">{row.label}</td>
                    <td className={`p-2 border ${rowDelivery.formatManual ? 'bg-amber-50/60' : 'bg-sky-50/60'}`}>
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => setFormat('groups')}
                            className={`flex-1 text-[10px] px-1 py-0.5 rounded border ${
                              isGroups
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            Группы
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormat('webinar')}
                            className={`flex-1 text-[10px] px-1 py-0.5 rounded border ${
                              isWebinar
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            Вебинар
                          </button>
                        </div>
                        {rowDelivery.formatManual ? (
                          <button
                            type="button"
                            className="text-[10px] text-blue-600 hover:underline text-left"
                            onClick={() => onChange(
                              resetTrainingRowFormat(mergedParams, queue, row.calcKey),
                            )}
                          >
                            ↺ авто ({rowDelivery.autoFormat === 'groups' ? 'группы' : 'вебинар'})
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400">авто</span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 border">
                      {isGroups ? renderParamCell(row.peopleKey, 1) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 border">
                      {isGroups ? renderParamCell(row.hoursKey) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 border">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={`w-full text-right border rounded px-2 py-1 ${
                            isTrainingEManual(storedParams, queue, row.eField)
                              ? OVERRIDE_CLASS
                              : CALCULATED_CLASS
                          }`}
                          value={calc.e}
                          title={`${row.eSource}. Авто: ${autoE[row.eField]}`}
                          onChange={e => onTrainingEChange(row.eField, e.target.value)}
                          {...numericInputHandlers}
                        />
                        {isTrainingEManual(storedParams, queue, row.eField) && (
                          <button
                            type="button"
                            className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
                            title={`Вернуть авто (${autoE[row.eField]})`}
                            onClick={() => onTrainingEReset(row.eField)}
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-2 border">
                      {isWebinar
                        ? renderWebinarNumber(
                          'webinar_count',
                          rowDelivery.webinarCount,
                          DEFAULT_WEBINAR_COUNT,
                          1,
                        )
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 border">
                      {isWebinar
                        ? renderWebinarNumber(
                          'webinar_qa_reserve',
                          rowDelivery.webinarReserve,
                          DEFAULT_WEBINAR_QA_RESERVE,
                          1,
                        )
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 border">
                      {isGroups ? (
                        <ReadonlyCell
                          value={calc.f}
                          title={trainingFormulaHint(calc, row.eSource, row.eRegionalSource)}
                        />
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 border">
                      {isGroups ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className={`w-full text-right border rounded px-2 py-1 ${
                              manualRow?.g_manual ? OVERRIDE_CLASS : CALCULATED_CLASS
                            }`}
                            value={calc.g}
                            title={`Авто: ${autoRow.g}. ${trainingFormulaHint(autoRow, row.eSource, row.eRegionalSource)}`}
                            onChange={e => onTrainingGhChange(row.calcKey, 'g', e.target.value)}
                            {...numericInputHandlers}
                          />
                          {manualRow?.g_manual && (
                            <button
                              type="button"
                              className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
                              title={`Вернуть авто (${autoRow.g})`}
                              onClick={() => onTrainingGhReset(row.calcKey, 'g')}
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-2 border">
                      {isGroups ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className={`w-full text-right border rounded px-2 py-1 ${
                              manualRow?.h_manual ? OVERRIDE_CLASS : CALCULATED_CLASS
                            }`}
                            value={calc.h}
                            title={`Авто: ${autoRow.h}`}
                            onChange={e => onTrainingGhChange(row.calcKey, 'h', e.target.value)}
                            {...numericInputHandlers}
                          />
                          {manualRow?.h_manual && (
                            <button
                              type="button"
                              className="shrink-0 text-[10px] text-blue-600 hover:underline px-0.5"
                              title={`Вернуть авто (${autoRow.h})`}
                              onClick={() => onTrainingGhReset(row.calcKey, 'h')}
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
