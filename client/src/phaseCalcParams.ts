/** Excel C35–C49, C65–C66 on queue sheets («Прочие параметры расчёта»). Defaults from «Очередь 1 ПРОФ_КОРП». */
import type { FsQueueKey } from './types';

export type TrainingRowKey = 'row47' | 'row48' | 'row49';
export type TrainingEField = 'e47' | 'e48' | 'e49';

export interface TrainingRowManualOverride {
  g?: number;
  h?: number;
  g_manual?: boolean;
  h_manual?: boolean;
}

export type TrainingManualByQueue = Partial<Record<TrainingRowKey, TrainingRowManualOverride>>;

export interface TrainingManualState {
  queues: Partial<Record<FsQueueKey, TrainingManualByQueue>>;
}

export interface TrainingEManualState {
  queues: Partial<Record<string, Partial<Record<TrainingEField, boolean>>>>;
}

export type C89ManualByQueue = Partial<Record<FsQueueKey, number>>;

export interface C89ManualState {
  queues: C89ManualByQueue;
}

export interface PhaseCalcParams {
  c35_methodical_hours_per_fe: number;
  c37_requirements_hours_per_fe: number;
  c38_design_hours_per_fe: number;
  c39_implementation_hours_per_fe: number;
  c41_db_install_hours: number;
  c42_db_nsi_hours: number;
  c43_db_access_hours: number;
  c44_db_workplaces_hours: number;
  c45_rd_hours: number;
  c46_training_prep_hours: number;
  c47_users_per_group: number;
  d47_users_hours_per_group: number;
  c48_executors_per_group: number;
  d48_executors_hours_per_group: number;
  c49_admins_per_group: number;
  d49_admins_hours_per_group: number;
  c65_ope_intro_hours: number;
  c66_ope_hours: number;
  /** Excel C50 — стоимость дня командировки, ₽ */
  c50_business_trip_day_cost: number;
  /** Excel C88 — документация ИБ (фаза 8.1), ₽ */
  c88_ib_doc_amount: number;
  /** Excel C90 — сопровождение БД на 1 год, ₽ (ПРОФ/КОРП) */
  c90_db_support_amount: number;
  /** Ручные G/H обучения по очередям (строки 47–49). */
  training_manual?: TrainingManualState;
  /** Ручные E обучения (колонка «Обучение силами исполнителя») по очередям. */
  training_e_manual?: TrainingEManualState;
  /** Ручная корректировка C89 (передача на сервис) по очередям; авто = C81. */
  c89_manual?: C89ManualState;
}

/** Нормы на ФЕ для листа «Кейс-Совм» (C37–C39). */
export const CASE_FE_NORMS = {
  c37_requirements_hours_per_fe: 2.5,
  c38_design_hours_per_fe: 5.5,
  c39_implementation_hours_per_fe: 0,
} as const;

/** Нормы на ФЕ по умолчанию для ПРОФ/КОРП/Проф-мини («Очередь 1 ПРОФ_КОРП»). */
export const PROF_FE_NORMS = {
  c37_requirements_hours_per_fe: 4.5,
  c38_design_hours_per_fe: 8,
  c39_implementation_hours_per_fe: 12,
} as const;

export const DEFAULT_PHASE_CALC_PARAMS: PhaseCalcParams = {
  c35_methodical_hours_per_fe: 16,
  ...PROF_FE_NORMS,
  c41_db_install_hours: 32,
  c42_db_nsi_hours: 80,
  c43_db_access_hours: 32,
  c44_db_workplaces_hours: 32,
  c45_rd_hours: 112,
  c46_training_prep_hours: 40,
  c47_users_per_group: 5,
  d47_users_hours_per_group: 16,
  c48_executors_per_group: 10,
  d48_executors_hours_per_group: 4,
  c49_admins_per_group: 5,
  d49_admins_hours_per_group: 24,
  c65_ope_intro_hours: 140,
  c66_ope_hours: 40,
  c50_business_trip_day_cost: 8200,
  c88_ib_doc_amount: 5_000_000,
  c90_db_support_amount: 2_641_188,
};

/** Excel C91 — сопровождение БД на 1 год, ₽ (Кейс/БЗ). */
export const CASE_DB_SUPPORT_AMOUNT = 1_386_000;

export function autoC90DbSupportAmount(projectTypeCode: string): number {
  if (isCaseLikeTechnologyCode(projectTypeCode)) {
    return CASE_DB_SUPPORT_AMOUNT;
  }
  return DEFAULT_PHASE_CALC_PARAMS.c90_db_support_amount;
}

export function effectiveC90DbSupportAmount(
  projectTypeCode: string,
  mergedParams: PhaseCalcParams,
  storedParams: Partial<PhaseCalcParams> | null | undefined,
): number {
  if (storedParams != null && Object.prototype.hasOwnProperty.call(storedParams, 'c90_db_support_amount')) {
    return mergedParams.c90_db_support_amount;
  }
  return autoC90DbSupportAmount(projectTypeCode);
}

export function isCaseLikeTechnologyCode(code: string): boolean {
  return code === 'CASE' || code === 'BZ';
}

export type FeNorms = Pick<
  PhaseCalcParams,
  'c37_requirements_hours_per_fe' | 'c38_design_hours_per_fe' | 'c39_implementation_hours_per_fe'
>;

/** C37–C39 для расчёта фаз: кейсовая методика или значения из параметров РП (ПРОФ). */
export function effectiveFeNormsForTechnology(
  projectTypeCode: string,
  params: PhaseCalcParams,
): FeNorms {
  if (isCaseLikeTechnologyCode(projectTypeCode)) {
    return { ...CASE_FE_NORMS };
  }
  return {
    c37_requirements_hours_per_fe: params.c37_requirements_hours_per_fe,
    c38_design_hours_per_fe: params.c38_design_hours_per_fe,
    c39_implementation_hours_per_fe: params.c39_implementation_hours_per_fe,
  };
}

export function computeC36FromNorms(norms: FeNorms): number {
  return norms.c37_requirements_hours_per_fe
    + norms.c38_design_hours_per_fe
    + norms.c39_implementation_hours_per_fe;
}

export function computeC36(params: PhaseCalcParams): number {
  return computeC36FromNorms(params);
}

export function computeC40(params: PhaseCalcParams): number {
  return params.c41_db_install_hours
    + params.c42_db_nsi_hours
    + params.c43_db_access_hours
    + params.c44_db_workplaces_hours;
}

export function mergePhaseCalcParams(
  stored: Partial<PhaseCalcParams> | null | undefined,
): PhaseCalcParams {
  const { training_manual, training_e_manual, c89_manual, ...numeric } = stored ?? {};
  return { ...DEFAULT_PHASE_CALC_PARAMS, ...numeric, training_manual, training_e_manual, c89_manual };
}

export type PhaseCalcNumericKey = Exclude<
  keyof PhaseCalcParams,
  'training_manual' | 'training_e_manual' | 'c89_manual'
>;

export function isC89ManualForQueue(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
): boolean {
  const value = stored?.c89_manual?.queues?.[queue];
  return value !== undefined && Number.isFinite(value);
}

export function effectiveC89ForQueue(
  queue: FsQueueKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
  autoFromR81: number,
): number {
  if (isC89ManualForQueue(stored, queue)) {
    return stored!.c89_manual!.queues![queue]!;
  }
  return autoFromR81;
}

export function patchC89Manual(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  value: number,
): PhaseCalcParams {
  return {
    ...params,
    c89_manual: {
      queues: {
        ...params.c89_manual?.queues,
        [queue]: value,
      },
    },
  };
}

export function resetC89Manual(
  params: PhaseCalcParams,
  queue: FsQueueKey,
): PhaseCalcParams {
  const prevQ = params.c89_manual?.queues;
  if (prevQ?.[queue] === undefined) return params;

  const nextQ = { ...prevQ };
  delete nextQ[queue];

  if (Object.keys(nextQ).length === 0) {
    return { ...params, c89_manual: undefined };
  }
  return {
    ...params,
    c89_manual: { queues: nextQ },
  };
}

export function isPhaseCalcParamStored(
  stored: Partial<PhaseCalcParams> | null | undefined,
  key: PhaseCalcNumericKey,
): boolean {
  if (stored == null || !Object.prototype.hasOwnProperty.call(stored, key)) return false;
  const value = stored[key];
  if (value === undefined) return false;
  return value !== DEFAULT_PHASE_CALC_PARAMS[key];
}

export function autoPhaseCalcParam(key: PhaseCalcNumericKey): number {
  return DEFAULT_PHASE_CALC_PARAMS[key];
}

export function isTrainingEManual(
  params: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
  field: TrainingEField,
): boolean {
  return params?.training_e_manual?.queues?.[queue]?.[field] === true;
}

export function patchTrainingEManual(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  field: TrainingEField,
): PhaseCalcParams {
  return {
    ...params,
    training_e_manual: {
      queues: {
        ...params.training_e_manual?.queues,
        [queue]: { ...params.training_e_manual?.queues?.[queue], [field]: true },
      },
    },
  };
}

export function resetTrainingEManual(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  field: TrainingEField,
): PhaseCalcParams {
  const prevQ = params.training_e_manual?.queues?.[queue];
  if (!prevQ?.[field]) return params;

  const nextQ = { ...prevQ };
  delete nextQ[field];
  const nextQueues = { ...params.training_e_manual?.queues };
  if (Object.keys(nextQ).length === 0) {
    delete nextQueues[queue];
  } else {
    nextQueues[queue] = nextQ;
  }

  return {
    ...params,
    training_e_manual: Object.keys(nextQueues).length > 0 ? { queues: nextQueues } : undefined,
  };
}

export function travelDaysFromTrainingGroup(g: number, hoursPerGroup: number): number {
  if (g <= 0) return 0;
  return Math.ceil((g * hoursPerGroup) / 8);
}

export function patchTrainingManualGh(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
  field: 'g' | 'h',
  value: number,
): PhaseCalcParams {
  const prevQ = params.training_manual?.queues?.[queue] ?? {};
  const prevRow = prevQ[rowKey] ?? {};
  const nextRow: TrainingRowManualOverride = { ...prevRow };

  if (field === 'g') {
    nextRow.g = value;
    nextRow.g_manual = true;
    if (!prevRow.h_manual) {
      delete nextRow.h;
    }
  } else {
    nextRow.h = value;
    nextRow.h_manual = true;
  }

  return {
    ...params,
    training_manual: {
      queues: {
        ...params.training_manual?.queues,
        [queue]: { ...prevQ, [rowKey]: nextRow },
      },
    },
  };
}

export function resetTrainingManualGh(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
  field: 'g' | 'h',
): PhaseCalcParams {
  const prevQ = params.training_manual?.queues?.[queue];
  if (!prevQ?.[rowKey]) return params;

  const nextRow = { ...prevQ[rowKey] };
  if (field === 'g') {
    delete nextRow.g;
    delete nextRow.g_manual;
    if (!nextRow.h_manual) {
      delete nextRow.h;
    }
  } else {
    delete nextRow.h;
    delete nextRow.h_manual;
  }

  const nextQ = { ...prevQ };
  if (Object.keys(nextRow).length === 0) {
    delete nextQ[rowKey];
  } else {
    nextQ[rowKey] = nextRow;
  }

  const nextQueues = { ...params.training_manual?.queues };
  if (Object.keys(nextQ).length === 0) {
    delete nextQueues[queue];
  } else {
    nextQueues[queue] = nextQ;
  }

  return {
    ...params,
    training_manual: Object.keys(nextQueues).length > 0 ? { queues: nextQueues } : undefined,
  };
}

export function parsePhaseCalcParamsJson(
  raw: string | PhaseCalcParams | null | undefined,
): PhaseCalcParams {
  if (!raw) return mergePhaseCalcParams(null);
  if (typeof raw === 'object') return mergePhaseCalcParams(raw);
  try {
    return mergePhaseCalcParams(JSON.parse(raw) as Partial<PhaseCalcParams>);
  } catch {
    return mergePhaseCalcParams(null);
  }
}
