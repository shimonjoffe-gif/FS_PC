import { useMemo } from 'react';
import type { FsQueueKey } from '../types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../types';
import {
  mergePhaseCalcParams,
  patchTrainingManualGh,
  resetTrainingManualGh,
  isPhaseCalcParamStored,
  autoPhaseCalcParam,
  autoC90DbSupportAmount,
  effectiveC90DbSupportAmount,
  effectiveC89ForQueue,
  isC89ManualForQueue,
  isTrainingEManual,
  type PhaseCalcParams,
  type PhaseCalcNumericKey,
  type TrainingRowKey,
} from '../phaseCalcParams';
import {
  effectiveTrainingEValues,
  resolveQueueTechnology,
  typeCodeForTechnologyLabel,
  QUEUE_TECHNOLOGY_OPTIONS,
  type TrainingEField,
} from '../assessmentCalc';
import { computeTrainingGroups, computeAutoC89FromR81 } from '../phaseCalc';
import type { TrainingGroupRowCalc, TrainingGroupsCalc } from '../phaseCalc';
import type { BriefingAssessment, BriefingFsSel } from '../types';
import { numericInputHandlers } from '../utils/numericInputHandlers';
import { OverridableNumberInput } from './OverridableNumberInput';

const OVERRIDE_CLASS = 'bg-amber-50 border-amber-300';

type Props = {
  params: Partial<PhaseCalcParams> | PhaseCalcParams;
  onChange: (patch: Partial<PhaseCalcParams>) => void;
  onParamReset: (key: PhaseCalcNumericKey) => void;
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
};

function ReadonlyCell({ value, title }: { value: number | string; title?: string }) {
  return (
    <div
      className="w-full text-right px-2 py-1 bg-slate-50 text-slate-700 rounded border border-slate-200"
      title={title}
    >
      {value}
    </div>
  );
}

const FE_ROWS: {
  label: string;
  excel: string;
  key: keyof PhaseCalcParams;
}[] = [
  { label: 'Объём методической проработки на ФЕ', excel: 'C35', key: 'c35_methodical_hours_per_fe' },
  { label: 'Объём сбора требований на ФЕ', excel: 'C37', key: 'c37_requirements_hours_per_fe' },
  { label: 'Объём проектирования на ФЕ', excel: 'C38', key: 'c38_design_hours_per_fe' },
  { label: 'Базовый объём на реализацию ФЕ', excel: 'C39', key: 'c39_implementation_hours_per_fe' },
];

const DB_ROWS: {
  label: string;
  excel: string;
  key: keyof PhaseCalcParams;
}[] = [
  { label: 'Инсталяция', excel: 'C41', key: 'c41_db_install_hours' },
  { label: 'Загрузка НСИ', excel: 'C42', key: 'c42_db_nsi_hours' },
  { label: 'Настройка прав доступа', excel: 'C43', key: 'c43_db_access_hours' },
  { label: 'Настройка рабочих мест', excel: 'C44', key: 'c44_db_workplaces_hours' },
  { label: 'Подготовка РД', excel: 'C45', key: 'c45_rd_hours' },
  { label: 'Подготовка к обучению', excel: 'C46', key: 'c46_training_prep_hours' },
];

/** Excel rows 47–49 (лист очереди, блок обучения). */
const TRAINING_ROWS: {
  label: string;
  peopleKey: keyof PhaseCalcParams;
  hoursKey: keyof PhaseCalcParams;
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

const OPE_ROWS: {
  label: string;
  excel: string;
  key: keyof PhaseCalcParams;
}[] = [
  { label: 'Ввод в ОПЭ Часов', excel: 'C65', key: 'c65_ope_intro_hours' },
  { label: 'ОПЭ Часов', excel: 'C66', key: 'c66_ope_hours' },
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
  onParamReset,
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
}: Props) {
  const mergedParams = useMemo(() => mergePhaseCalcParams(params), [params]);
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
  const queueProjectTypeCode = useMemo(() => {
    const qc = assessment.queue_calcs.find(r => r.queue === queue);
    const tech = qc
      ? resolveQueueTechnology(qc, QUEUE_TECHNOLOGY_OPTIONS[0])
      : QUEUE_TECHNOLOGY_OPTIONS[0];
    return typeCodeForTechnologyLabel(tech);
  }, [assessment.queue_calcs, queue]);
  const autoC89 = useMemo(
    () => computeAutoC89FromR81(queue, assessment, fsItems),
    [queue, assessment, fsItems],
  );

  function renderParamCell(key: PhaseCalcNumericKey, step = 0.5) {
    return (
      <OverridableNumberInput
        value={mergedParams[key] as number}
        autoValue={autoPhaseCalcParam(key)}
        step={step}
        overridden={isPhaseCalcParamStored(storedParams, key)}
        onChange={v => onChange({ [key]: v })}
        onReset={() => onParamReset(key)}
        overrideClass={OVERRIDE_CLASS}
      />
    );
  }

  function renderMiscParamCell(row: (typeof MISC_ROWS)[number]) {
    const grouped = true;
    const common = {
      step: row.step ?? 0.5,
      grouped,
      overrideClass: OVERRIDE_CLASS,
    };
    if (row.key === 'c89') {
      const value = effectiveC89ForQueue(queue, storedParams, autoC89);
      return (
        <OverridableNumberInput
          value={value}
          autoValue={autoC89}
          overridden={isC89ManualForQueue(storedParams, queue)}
          onChange={onC89Change}
          onReset={onC89Reset}
          {...common}
        />
      );
    }
    if (row.key === 'c90_db_support_amount') {
      const value = effectiveC90DbSupportAmount(queueProjectTypeCode, mergedParams, storedParams);
      const autoValue = autoC90DbSupportAmount(queueProjectTypeCode);
      return (
        <OverridableNumberInput
          value={value}
          autoValue={autoValue}
          overridden={isPhaseCalcParamStored(storedParams, row.key)}
          onChange={v => onChange({ [row.key]: v })}
          onReset={() => onParamReset(row.key)}
          {...common}
        />
      );
    }
    return (
      <OverridableNumberInput
        value={mergedParams[row.key] as number}
        autoValue={autoPhaseCalcParam(row.key)}
        overridden={isPhaseCalcParamStored(storedParams, row.key)}
        onChange={v => onChange({ [row.key]: v })}
        onReset={() => onParamReset(row.key)}
        {...common}
      />
    );
  }

  return (
    <div className="border rounded-lg p-3 bg-white space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Параметры расчёта фаз</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">Нормы на ФЕ, часы</div>
          <p className="text-[10px] text-slate-400 mb-1">
            C37–C39 — для ПРОФ/КОРП/Проф-мини. Для Кейс и Быстрого запуска: 2,5 / 5,5 / 0 (авто).
          </p>
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

        <div>
          <div className="text-xs font-medium text-slate-600 mb-1">БД и документация, часы</div>
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

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <div className="text-xs font-medium text-slate-600">Обучение</div>
          <div className="flex gap-1">
            {FS_QUEUE_KEYS.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => onQueueChange(q)}
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                  queue === q
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {FS_QUEUE_LABELS[q]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mb-1">
          Строка 46 (C46) — в блоке «БД и документация». Редактируемые ячейки: ↺ — вернуть авто. H = ROUNDUP(G×часов/8, 0).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="p-2 border text-left min-w-[200px]" />
                <th className="p-2 border text-right w-20">чел./группа</th>
                <th className="p-2 border text-right w-20">Часов на группу</th>
                <th className="p-2 border text-right w-24">
                  Обучение силами исполнителя пользователей
                </th>
                <th className="p-2 border text-right w-20">Групп обучения</th>
                <th className="p-2 border text-right w-24">Групп к обучению в регионах</th>
                <th className="p-2 border text-right w-24">Количество дней в командировке</th>
              </tr>
            </thead>
            <tbody>
              {TRAINING_ROWS.map(row => {
                const calc = training[row.calcKey];
                const autoRow = autoTraining[row.calcKey];
                const manualRow = mergedParams.training_manual?.queues?.[queue]?.[row.calcKey];
                return (
                  <tr key={row.label}>
                    <td className="p-2 border">{row.label}</td>
                    <td className="p-2 border">{renderParamCell(row.peopleKey, 1)}</td>
                    <td className="p-2 border">{renderParamCell(row.hoursKey)}</td>
                    <td className="p-2 border">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={`w-full text-right border rounded px-2 py-1 ${
                            isTrainingEManual(storedParams, queue, row.eField)
                              ? OVERRIDE_CLASS
                              : ''
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
                      <ReadonlyCell
                        value={calc.f}
                        title={trainingFormulaHint(calc, row.eSource, row.eRegionalSource)}
                      />
                    </td>
                    <td className="p-2 border">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={`w-full text-right border rounded px-2 py-1 ${manualRow?.g_manual ? OVERRIDE_CLASS : ''}`}
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
                    </td>
                    <td className="p-2 border">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={`w-full text-right border rounded px-2 py-1 ${manualRow?.h_manual ? OVERRIDE_CLASS : ''}`}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-600 mb-1">Прочие параметры</div>
        <p className="text-[10px] text-slate-400 mb-1">
          C89 — для выбранной очереди (переключатель в блоке «Обучение»); авто = C81 (фаза 5.1).
        </p>
        <table className="w-full text-xs border-collapse min-w-[28rem]">
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

      <div>
        <div className="text-xs font-medium text-slate-600 mb-1">ОПЭ</div>
        <table className="w-full text-xs border-collapse max-w-md">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="p-2 border text-left">Параметр</th>
              <th className="p-2 border text-center w-16">Яч.</th>
              <th className="p-2 border text-right w-24">Значение</th>
            </tr>
          </thead>
          <tbody>
            {OPE_ROWS.map(row => (
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
  );
}
