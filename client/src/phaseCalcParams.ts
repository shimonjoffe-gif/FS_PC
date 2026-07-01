/** Excel C35–C49, C65–C66 on queue sheets («Прочие параметры расчёта»). Defaults from «Очередь 1 ПРОФ_КОРП». */
import type { BriefingAssessment, FsQueueKey } from './types';
import { FS_QUEUE_KEYS } from './types';

export type TrainingRowKey = 'row47' | 'row48' | 'row49';
export type TrainingEField = 'e47' | 'e48' | 'e49';
export type TrainingDeliveryFormat = 'groups' | 'webinar';

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

export interface TrainingRowDeliveryOverride {
  format?: TrainingDeliveryFormat;
  format_manual?: boolean;
  webinar_count?: number;
  webinar_qa_reserve?: number;
}

export interface TrainingDeliveryState {
  queues?: Partial<Record<FsQueueKey, Partial<Record<TrainingRowKey, TrainingRowDeliveryOverride>>>>;
}

export interface EffectiveTrainingRowDelivery {
  format: TrainingDeliveryFormat;
  formatManual: boolean;
  autoFormat: TrainingDeliveryFormat;
  webinarCount: number;
  webinarReserve: number;
}

export const WEBINAR_HOURS_PER_SESSION = 4;
export const DEFAULT_WEBINAR_COUNT = 10;
export const DEFAULT_WEBINAR_QA_RESERVE = 0.2;

export function autoTrainingRowFormat(rowKey: TrainingRowKey, e: number): TrainingDeliveryFormat {
  if (rowKey === 'row48') return e <= 300 ? 'groups' : 'webinar';
  return e <= 100 ? 'groups' : 'webinar';
}

export function effectiveTrainingRowDelivery(
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
  e: number,
  stored: Partial<PhaseCalcParams> | null | undefined,
): EffectiveTrainingRowDelivery {
  const rowStored = stored?.training_delivery?.queues?.[queue]?.[rowKey];
  const autoFormat = autoTrainingRowFormat(rowKey, e);
  const formatManual = rowStored?.format_manual === true;
  const format = formatManual && rowStored?.format ? rowStored.format : autoFormat;
  return {
    format,
    formatManual,
    autoFormat,
    webinarCount: rowStored?.webinar_count ?? DEFAULT_WEBINAR_COUNT,
    webinarReserve: rowStored?.webinar_qa_reserve ?? DEFAULT_WEBINAR_QA_RESERVE,
  };
}

export function webinarRowCost(count: number, rate: number, reserve: number): number {
  return count * WEBINAR_HOURS_PER_SESSION * rate * (1 + reserve);
}

export function patchTrainingRowDelivery(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
  patch: Partial<TrainingRowDeliveryOverride>,
): Partial<PhaseCalcParams> {
  const prevQ = params.training_delivery?.queues?.[queue] ?? {};
  const prevRow = prevQ[rowKey] ?? {};
  return {
    training_delivery: {
      queues: {
        ...params.training_delivery?.queues,
        [queue]: { ...prevQ, [rowKey]: { ...prevRow, ...patch } },
      },
    },
  };
}

export function resetTrainingRowFormat(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
): Partial<PhaseCalcParams> {
  const prevQ = { ...(params.training_delivery?.queues?.[queue] ?? {}) };
  const prevRow = { ...(prevQ[rowKey] ?? {}) };
  delete prevRow.format;
  delete prevRow.format_manual;
  const nextQ = { ...prevQ };
  if (Object.keys(prevRow).length === 0) delete nextQ[rowKey];
  else nextQ[rowKey] = prevRow;
  const queues = { ...params.training_delivery?.queues };
  if (Object.keys(nextQ).length === 0) delete queues[queue];
  else queues[queue] = nextQ;
  return {
    training_delivery: Object.keys(queues).length > 0 ? { queues } : undefined,
  };
}

export function resetTrainingRowWebinarField(
  params: PhaseCalcParams,
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
  field: 'webinar_count' | 'webinar_qa_reserve',
): Partial<PhaseCalcParams> {
  const prevQ = { ...(params.training_delivery?.queues?.[queue] ?? {}) };
  const prevRow = { ...(prevQ[rowKey] ?? {}) };
  delete prevRow[field];
  const nextQ = { ...prevQ };
  if (Object.keys(prevRow).length === 0) delete nextQ[rowKey];
  else nextQ[rowKey] = prevRow;
  const queues = { ...params.training_delivery?.queues };
  if (Object.keys(nextQ).length === 0) delete queues[queue];
  else queues[queue] = nextQ;
  return {
    training_delivery: Object.keys(queues).length > 0 ? { queues } : undefined,
  };
}

export function isTrainingRowWebinarFieldStored(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
  rowKey: TrainingRowKey,
  field: 'webinar_count' | 'webinar_qa_reserve',
): boolean {
  const v = stored?.training_delivery?.queues?.[queue]?.[rowKey]?.[field];
  return v !== undefined;
}

export type RdDeliveryMode = 'doc' | 'video' | 'doc_video';

export interface HeadcountOpeHours {
  queues: Partial<Record<FsQueueKey, { c67?: number; c68?: number }>>;
}

export type HeadcountOpeField = 'c67' | 'c68';

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
  /** Фаза 5.1 РД: состав работ (документация / видео / оба). «Ни одного» — выкл. фазу r81. */
  rd_delivery_mode: RdDeliveryMode;
  /** Часы на запись видео-роликов (фаза 5.1 РД). */
  rd_video_hours: number;
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
  /** Формат обучения по строкам 47–49 (группы / вебинары), по очередям. */
  training_delivery?: TrainingDeliveryState;
  /** Переопределения скалярных параметров по очередям. */
  queue_values?: {
    queues: Partial<
      Record<FsQueueKey, Partial<Record<string, number>> & { rd_delivery_mode?: RdDeliveryMode }>
    >;
  };
  /** Часы ОПЭ на пользователя (C67/C68) по очередям. */
  headcount_ope_hours?: HeadcountOpeHours;
  /** Явный сброс к системному авто на очередях 2–4 (не наследовать оч. 1). */
  queue_auto_overrides?: QueueAutoOverrides;
  /** Явная правка на очередях 2–4 (отличие от эталона оч. 1). */
  queue_explicit_overrides?: QueueExplicitOverrides;
}

/** Флаги «↺ авто» для очередей 2–4. */
export interface QueueAutoOverrides {
  queues?: Partial<Record<FsQueueKey, {
    params?: Partial<Record<PhaseCalcNumericKey, true>>;
    rd_delivery_mode?: true;
  }>>;
}

/** Флаги явной правки на очередях 2–4. */
export interface QueueExplicitOverrides {
  queues?: Partial<Record<FsQueueKey, {
    params?: Partial<Record<PhaseCalcNumericKey, true>>;
    rd_delivery_mode?: true;
  }>>;
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
  rd_delivery_mode: 'doc',
  rd_video_hours: 40,
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

export function effectiveRdDeliveryMode(mode: RdDeliveryMode | undefined): RdDeliveryMode {
  if (mode === 'doc' || mode === 'video' || mode === 'doc_video') return mode;
  return 'doc';
}

const PHASE_CALC_META_KEYS = new Set<keyof PhaseCalcParams>([
  'training_manual',
  'training_e_manual',
  'c89_manual',
  'training_delivery',
  'rd_delivery_mode',
  'queue_values',
  'headcount_ope_hours',
  'queue_auto_overrides',
  'queue_explicit_overrides',
]);

export function mergePhaseCalcParams(
  stored: Partial<PhaseCalcParams> | null | undefined,
): PhaseCalcParams {
  const {
    training_manual,
    training_e_manual,
    c89_manual,
    training_delivery,
    rd_delivery_mode,
    queue_values,
    headcount_ope_hours,
    queue_auto_overrides,
    queue_explicit_overrides,
    ...numeric
  } = stored ?? {};
  const merged: PhaseCalcParams = {
    ...DEFAULT_PHASE_CALC_PARAMS,
    ...numeric,
    rd_delivery_mode: effectiveRdDeliveryMode(rd_delivery_mode),
    training_manual,
    training_e_manual,
    c89_manual,
    training_delivery,
    queue_values,
    headcount_ope_hours,
    queue_auto_overrides,
    queue_explicit_overrides,
  };
  return normalizeInheritedQueueScalars(merged);
}

export type PhaseCalcNumericKey = Exclude<
  keyof PhaseCalcParams,
  | 'training_manual'
  | 'training_e_manual'
  | 'c89_manual'
  | 'training_delivery'
  | 'rd_delivery_mode'
  | 'queue_values'
  | 'headcount_ope_hours'
  | 'queue_auto_overrides'
  | 'queue_explicit_overrides'
>;

export type QueuePhaseValues = NonNullable<PhaseCalcParams['queue_values']>;

type QueuePhaseEntry = NonNullable<QueuePhaseValues['queues'][FsQueueKey]>;

function isQueueParamAutoOverride(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
): boolean {
  return stored?.queue_auto_overrides?.queues?.[queue]?.params?.[key] === true;
}

function isQueueRdModeAutoOverride(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
): boolean {
  return stored?.queue_auto_overrides?.queues?.[queue]?.rd_delivery_mode === true;
}

function isQueueParamExplicitOverride(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
): boolean {
  return stored?.queue_explicit_overrides?.queues?.[queue]?.params?.[key] === true;
}

function isQueueRdModeExplicitOverride(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
): boolean {
  return stored?.queue_explicit_overrides?.queues?.[queue]?.rd_delivery_mode === true;
}

function isQueueScalarOverrideMarked(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
): boolean {
  return isQueueParamExplicitOverride(stored, queue, key)
    || isQueueParamAutoOverride(stored, queue, key);
}

function withParamAutoOverride(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  enabled: boolean,
): QueueAutoOverrides | undefined {
  const prev = stored.queue_auto_overrides?.queues?.[queue];
  const prevParams = { ...(prev?.params ?? {}) };
  if (enabled) prevParams[key] = true;
  else delete prevParams[key];

  const queues = { ...(stored.queue_auto_overrides?.queues ?? {}) };
  const nextQ = {
    ...prev,
    ...(Object.keys(prevParams).length > 0 ? { params: prevParams } : {}),
  };
  if (!nextQ.params && !nextQ.rd_delivery_mode) {
    delete queues[queue];
  } else {
    queues[queue] = nextQ;
  }
  return Object.keys(queues).length > 0 ? { queues } : undefined;
}

function withRdModeAutoOverride(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  enabled: boolean,
): QueueAutoOverrides | undefined {
  const prev = stored.queue_auto_overrides?.queues?.[queue];
  const queues = { ...(stored.queue_auto_overrides?.queues ?? {}) };
  const nextQ = { ...prev, ...(enabled ? { rd_delivery_mode: true as const } : {}) };
  if (!enabled) delete nextQ.rd_delivery_mode;
  if (!nextQ.params && !nextQ.rd_delivery_mode) {
    delete queues[queue];
  } else {
    queues[queue] = nextQ;
  }
  return Object.keys(queues).length > 0 ? { queues } : undefined;
}

function withParamExplicitOverride(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  enabled: boolean,
): QueueExplicitOverrides | undefined {
  const prev = stored.queue_explicit_overrides?.queues?.[queue];
  const prevParams = { ...(prev?.params ?? {}) };
  if (enabled) prevParams[key] = true;
  else delete prevParams[key];

  const queues = { ...(stored.queue_explicit_overrides?.queues ?? {}) };
  const nextQ = {
    ...prev,
    ...(Object.keys(prevParams).length > 0 ? { params: prevParams } : {}),
  };
  if (!nextQ.params && !nextQ.rd_delivery_mode) {
    delete queues[queue];
  } else {
    queues[queue] = nextQ;
  }
  return Object.keys(queues).length > 0 ? { queues } : undefined;
}

function withRdModeExplicitOverride(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  enabled: boolean,
): QueueExplicitOverrides | undefined {
  const prev = stored.queue_explicit_overrides?.queues?.[queue];
  const queues = { ...(stored.queue_explicit_overrides?.queues ?? {}) };
  const nextQ = { ...prev, ...(enabled ? { rd_delivery_mode: true as const } : {}) };
  if (!enabled) delete nextQ.rd_delivery_mode;
  if (!nextQ.params && !nextQ.rd_delivery_mode) {
    delete queues[queue];
  } else {
    queues[queue] = nextQ;
  }
  return Object.keys(queues).length > 0 ? { queues } : undefined;
}

function isStaleInheritedScalar(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  qVal: number,
): boolean {
  if (isQueueParamExplicitOverride(stored, queue, key)) return false;
  if (isQueueParamAutoOverride(stored, queue, key)) {
    const baseVal = baseQueueScalarPatch(stored)[key] as number | undefined;
    if (baseVal !== undefined && qVal !== baseVal) return false;
    return true;
  }
  return true;
}

function baseRdModeFromStored(
  stored: Partial<PhaseCalcParams> | null | undefined,
): RdDeliveryMode {
  const q1Mode = stored?.queue_values?.queues?.[PHASE_BASE_QUEUE]?.rd_delivery_mode;
  return effectiveRdDeliveryMode(q1Mode ?? stored?.rd_delivery_mode);
}

function isStaleInheritedRdMode(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  _qMode: RdDeliveryMode,
): boolean {
  return !isQueueRdModeAutoOverride(stored, queue) && !isQueueRdModeExplicitOverride(stored, queue);
}

function pruneQueuePhaseEntry(entry: QueuePhaseEntry | undefined): QueuePhaseEntry | undefined {
  if (!entry) return undefined;
  return Object.keys(entry).length > 0 ? entry : undefined;
}

/** Убирает устаревшие снимки значений на оч. 2–4, оставляя только явные отличия от оч. 1. */
export function normalizeInheritedQueueScalars(stored: PhaseCalcParams): PhaseCalcParams {
  const queues = stored.queue_values?.queues;
  if (!queues) return stored;

  const nextQueues = { ...queues };
  let changed = false;

  for (const q of FS_QUEUE_KEYS) {
    if (q === PHASE_BASE_QUEUE) continue;
    const qEntry = nextQueues[q];
    if (!qEntry) continue;

    const nextEntry = { ...qEntry };
    let entryChanged = false;

    for (const key of Object.keys(qEntry) as (keyof typeof qEntry)[]) {
      if (key === 'rd_delivery_mode') continue;
      const k = key as PhaseCalcNumericKey;
      const qVal = qEntry[k];
      if (typeof qVal !== 'number') continue;
      if (!isStaleInheritedScalar(stored, q, k, qVal)) continue;
      delete nextEntry[k];
      entryChanged = true;
    }

    if (qEntry.rd_delivery_mode !== undefined
      && isStaleInheritedRdMode(stored, q, qEntry.rd_delivery_mode)) {
      delete nextEntry.rd_delivery_mode;
      entryChanged = true;
    }

    if (!entryChanged) continue;
    changed = true;
    const pruned = pruneQueuePhaseEntry(nextEntry);
    if (pruned) nextQueues[q] = pruned;
    else delete nextQueues[q];
  }

  let nextAutoOverrides = stored.queue_auto_overrides;
  let autoChanged = false;
  for (const q of FS_QUEUE_KEYS) {
    if (q === PHASE_BASE_QUEUE) continue;
    const params = nextAutoOverrides?.queues?.[q]?.params;
    if (!params) continue;
    const staleKeys = Object.keys(params).filter(key => {
      const k = key as PhaseCalcNumericKey;
      const qVal = nextQueues[q]?.[k];
      return typeof qVal !== 'number'
        || isStaleInheritedScalar({ ...stored, queue_values: { queues: nextQueues } }, q, k, qVal);
    });
    if (staleKeys.length === 0) continue;
    autoChanged = true;
    const prev = nextAutoOverrides?.queues?.[q];
    const prevParams = { ...(prev?.params ?? {}) };
    for (const key of staleKeys) delete prevParams[key as PhaseCalcNumericKey];
    const queues = { ...(nextAutoOverrides?.queues ?? {}) };
    const nextQ = {
      ...prev,
      ...(Object.keys(prevParams).length > 0 ? { params: prevParams } : {}),
    };
    if (!nextQ.params && !nextQ.rd_delivery_mode) delete queues[q];
    else queues[q] = nextQ;
    nextAutoOverrides = Object.keys(queues).length > 0 ? { queues } : undefined;
  }

  if (!changed && !autoChanged) return stored;
  return {
    ...stored,
    queue_values: Object.keys(nextQueues).length > 0 ? { queues: nextQueues } : undefined,
    ...(autoChanged ? { queue_auto_overrides: nextAutoOverrides } : {}),
  };
}

function clearInheritedQueueScalarsOnBaseChange(
  stored: Partial<PhaseCalcParams>,
  queues: QueuePhaseValues['queues'],
  key: PhaseCalcNumericKey,
  oldBase: number,
): QueueAutoOverrides | undefined {
  let queue_auto_overrides = stored.queue_auto_overrides;
  for (const q of FS_QUEUE_KEYS) {
    if (q === PHASE_BASE_QUEUE) continue;
    const qEntry = queues[q];
    if (!qEntry || qEntry[key] === undefined) continue;
    if (qEntry[key] as number !== oldBase) continue;
    const next = { ...qEntry };
    delete next[key];
    const pruned = pruneQueuePhaseEntry(next);
    if (pruned) queues[q] = pruned;
    else delete queues[q];
    if (isQueueParamAutoOverride(stored, q, key)) {
      queue_auto_overrides = withParamAutoOverride(
        { ...stored, queue_auto_overrides },
        q,
        key,
        false,
      );
    }
  }
  return queue_auto_overrides;
}

function projectTypeCodeForQueue(queue: FsQueueKey, assessment: BriefingAssessment): string {
  const qc = assessment.queue_calcs.find(r => r.queue === queue);
  if (!qc) return 'CASE';
  const tech = qc.technology_manual && qc.technology
    ? qc.technology
    : (qc.auto_technology ?? 'Кейс-проект');
  return typeCodeForTechnologyLabel(tech);
}

function typeCodeForTechnologyLabel(label: string): string {
  const normalized = label === 'БЗ' ? 'Быстрый запуск' : label;
  switch (normalized) {
    case 'КОРП-проект': return 'KORP';
    case 'ПРОФ-проект': return 'PROF';
    case 'Проф/мини': return 'PROF_MINI';
    case 'Быстрый запуск': return 'BZ';
    default: return 'CASE';
  }
}

export function extractLegacyScalarPatch(
  stored: Partial<PhaseCalcParams> | null | undefined,
): Partial<Record<PhaseCalcNumericKey, number>> {
  if (!stored) return {};
  const out: Partial<Record<PhaseCalcNumericKey, number>> = {};
  for (const key of Object.keys(stored) as (keyof PhaseCalcParams)[]) {
    if (PHASE_CALC_META_KEYS.has(key)) continue;
    const value = stored[key];
    if (typeof value !== 'number') continue;
    const defaultVal = DEFAULT_PHASE_CALC_PARAMS[key as PhaseCalcNumericKey];
    if (value !== defaultVal) {
      out[key as PhaseCalcNumericKey] = value;
    }
  }
  return out;
}

export const PHASE_BASE_QUEUE: FsQueueKey = '1';

/** Скаляры эталона (очередь 1): legacy flat + queue_values['1']. */
export function baseQueueScalarPatch(
  stored: Partial<PhaseCalcParams> | null | undefined,
): Partial<Record<PhaseCalcNumericKey, number>> {
  const legacy = extractLegacyScalarPatch(stored);
  const q1 = stored?.queue_values?.queues?.[PHASE_BASE_QUEUE] ?? {};
  const { rd_delivery_mode: _rd, ...q1Numerics } = q1;
  return { ...legacy, ...q1Numerics };
}

/** Явные отличия очереди 2–4 от эталона оч. 1 (не наследование). */
export function queueScalarOverridePatch(
  queue: FsQueueKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): Partial<Record<PhaseCalcNumericKey, number>> {
  if (queue === PHASE_BASE_QUEUE) return {};
  const qEntry = stored?.queue_values?.queues?.[queue];
  if (!qEntry) return {};
  const base = baseQueueScalarPatch(stored);
  const out: Partial<Record<PhaseCalcNumericKey, number>> = {};
  for (const key of Object.keys(qEntry) as (keyof typeof qEntry)[]) {
    if (key === 'rd_delivery_mode') continue;
    const k = key as PhaseCalcNumericKey;
    const value = qEntry[k];
    if (typeof value !== 'number') continue;
    if (!isQueueScalarOverrideMarked(stored, queue, k)) continue;
    if (isQueueParamAutoOverride(stored, queue, k)) {
      const baseVal = base[k] as number | undefined;
      if (baseVal === undefined || value !== baseVal) {
        out[k] = value;
      }
      continue;
    }
    const baseVal = base[k] as number | undefined;
    if (baseVal === undefined || value !== baseVal) {
      out[k] = value;
    }
  }
  return out;
}

export function hasQueueScalarOverride(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): boolean {
  return queueScalarOverridePatch(queue, stored)[key] !== undefined;
}

export function effectiveRdModeForQueue(
  queue: FsQueueKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): RdDeliveryMode {
  const base = baseRdModeFromStored(stored);
  if (queue === PHASE_BASE_QUEUE) return base;
  const raw = stored?.queue_values?.queues?.[queue]?.rd_delivery_mode;
  if (raw === undefined) return base;
  if (!isQueueRdModeAutoOverride(stored, queue) && !isQueueRdModeExplicitOverride(stored, queue)) {
    return base;
  }
  if (isQueueRdModeAutoOverride(stored, queue)) {
    return effectiveRdDeliveryMode(raw);
  }
  if (raw === base) return base;
  return effectiveRdDeliveryMode(raw);
}

export function effectivePhaseCalcParamsForQueue(
  queue: FsQueueKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): PhaseCalcParams {
  const merged = mergePhaseCalcParams(stored);
  const baseNumerics = baseQueueScalarPatch(merged);
  const overrideNumerics = queue === PHASE_BASE_QUEUE
    ? {}
    : queueScalarOverridePatch(queue, merged);

  const numerics = { ...baseNumerics, ...overrideNumerics };

  const mergedOut: PhaseCalcParams = { ...DEFAULT_PHASE_CALC_PARAMS, ...numerics };
  mergedOut.rd_delivery_mode = effectiveRdModeForQueue(queue, merged);
  mergedOut.training_manual = merged.training_manual;
  mergedOut.training_e_manual = merged.training_e_manual;
  mergedOut.c89_manual = merged.c89_manual;
  mergedOut.training_delivery = merged.training_delivery;
  mergedOut.queue_values = merged.queue_values;
  mergedOut.headcount_ope_hours = merged.headcount_ope_hours;
  mergedOut.queue_auto_overrides = merged.queue_auto_overrides;
  mergedOut.queue_explicit_overrides = merged.queue_explicit_overrides;
  return mergedOut;
}

export function patchQueuePhaseParam(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  value: number,
): Partial<PhaseCalcParams> {
  const queues: QueuePhaseValues['queues'] = { ...(stored.queue_values?.queues ?? {}) };
  const prevQ = queues[queue] ?? {};
  queues[queue] = { ...prevQ, [key]: value };

  let queue_auto_overrides = stored.queue_auto_overrides;
  if (queue === PHASE_BASE_QUEUE) {
    const prevBase = (baseQueueScalarPatch(stored)[key] as number | undefined)
      ?? DEFAULT_PHASE_CALC_PARAMS[key];
    queue_auto_overrides = clearInheritedQueueScalarsOnBaseChange(stored, queues, key, prevBase);
  }

  let queue_explicit_overrides = stored.queue_explicit_overrides;
  if (queue !== PHASE_BASE_QUEUE) {
    queue_auto_overrides = withParamAutoOverride(
      { ...stored, queue_auto_overrides },
      queue,
      key,
      false,
    );
    queue_explicit_overrides = withParamExplicitOverride(stored, queue, key, true);
  }

  const patch: Partial<PhaseCalcParams> = {
    queue_values: { queues: { [queue]: queues[queue]! } },
  };
  if (queue_auto_overrides !== stored.queue_auto_overrides) {
    patch.queue_auto_overrides = queue_auto_overrides;
  }
  if (queue_explicit_overrides !== stored.queue_explicit_overrides) {
    patch.queue_explicit_overrides = queue_explicit_overrides;
  }
  return patch;
}

export function patchQueueRdMode(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  mode: RdDeliveryMode,
): Partial<PhaseCalcParams> {
  const prevQ = stored.queue_values?.queues?.[queue] ?? {};
  const patch: Partial<PhaseCalcParams> = {
    queue_values: {
      queues: {
        [queue]: { ...prevQ, rd_delivery_mode: mode },
      },
    },
  };
  if (queue !== PHASE_BASE_QUEUE) {
    patch.queue_auto_overrides = withRdModeAutoOverride(stored, queue, false);
    patch.queue_explicit_overrides = withRdModeExplicitOverride(stored, queue, true);
  }
  return patch;
}

export function resetQueuePhaseParam(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
): Partial<PhaseCalcParams> {
  const prevQ = { ...(stored.queue_values?.queues?.[queue] ?? {}) };
  if (!Object.prototype.hasOwnProperty.call(prevQ, key)) {
    return {};
  }
  delete prevQ[key];
  const pruned = pruneQueuePhaseEntry(prevQ);
  const patch: Partial<PhaseCalcParams> = {
    queue_values: {
      queues: {
        [queue]: pruned ?? {},
      },
    },
  };
  if (queue !== PHASE_BASE_QUEUE) {
    const queue_auto_overrides = withParamAutoOverride(stored, queue, key, false);
    const queue_explicit_overrides = withParamExplicitOverride(stored, queue, key, false);
    if (queue_auto_overrides !== stored.queue_auto_overrides) {
      patch.queue_auto_overrides = queue_auto_overrides;
    }
    if (queue_explicit_overrides !== stored.queue_explicit_overrides) {
      patch.queue_explicit_overrides = queue_explicit_overrides;
    }
  }
  return patch;
}

/** Сброс к эталону очереди 1 — только для очередей 2–4. */
export function resetQueuePhaseParamToBaseQueue(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
): Partial<PhaseCalcParams> {
  if (queue === PHASE_BASE_QUEUE) return {};
  return resetQueuePhaseParam(stored, queue, key);
}

export type ResetPhaseParamToAutoResult = {
  phase_calc_params: Partial<PhaseCalcParams>;
  phase_calc_params_omit?: string[];
};

/** Сброс к системному авто: очередь 1 — эталон; очереди 2–4 — явное значение авто. */
export function resetQueuePhaseParamToAuto(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  assessment: BriefingAssessment,
): ResetPhaseParamToAutoResult {
  if (queue === PHASE_BASE_QUEUE) {
    const patch = resetQueuePhaseParam(stored, queue, key);
    const omit: PhaseCalcNumericKey[] = [];
    if (Object.prototype.hasOwnProperty.call(stored, key)) {
      omit.push(key);
    }
    return {
      phase_calc_params: patch,
      ...(omit.length > 0 ? { phase_calc_params_omit: omit } : {}),
    };
  }
  const autoVal = autoPhaseCalcParamForQueue(queue, key, assessment);
  return {
    phase_calc_params: {
      ...patchQueuePhaseParam(stored, queue, key, autoVal),
      queue_auto_overrides: withParamAutoOverride(stored, queue, key, true),
      queue_explicit_overrides: withParamExplicitOverride(stored, queue, key, false),
    },
  };
}

export function resetQueueRdModeToBaseQueue(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
): Partial<PhaseCalcParams> {
  if (queue === PHASE_BASE_QUEUE) return {};
  const prevQ = { ...(stored.queue_values?.queues?.[queue] ?? {}) };
  if (!Object.prototype.hasOwnProperty.call(prevQ, 'rd_delivery_mode')) return {};
  delete prevQ.rd_delivery_mode;
  const pruned = pruneQueuePhaseEntry(prevQ);
  const patch: Partial<PhaseCalcParams> = {
    queue_values: {
      queues: {
        [queue]: pruned ?? {},
      },
    },
  };
  const queue_auto_overrides = withRdModeAutoOverride(stored, queue, false);
  const queue_explicit_overrides = withRdModeExplicitOverride(stored, queue, false);
  if (queue_auto_overrides !== stored.queue_auto_overrides) {
    patch.queue_auto_overrides = queue_auto_overrides;
  }
  if (queue_explicit_overrides !== stored.queue_explicit_overrides) {
    patch.queue_explicit_overrides = queue_explicit_overrides;
  }
  return patch;
}

export function resetQueueRdModeToAuto(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
): ResetPhaseParamToAutoResult {
  if (queue === PHASE_BASE_QUEUE) {
    const prevQ = { ...(stored.queue_values?.queues?.[queue] ?? {}) };
    const hadQ1 = Object.prototype.hasOwnProperty.call(prevQ, 'rd_delivery_mode');
    if (!hadQ1 && stored.rd_delivery_mode === undefined) {
      return { phase_calc_params: {} };
    }
    if (hadQ1) delete prevQ.rd_delivery_mode;
    const pruned = pruneQueuePhaseEntry(prevQ);
    const patch: Partial<PhaseCalcParams> = {};
    if (hadQ1) {
      patch.queue_values = {
        queues: {
          [queue]: pruned ?? {},
        },
      };
    }
    if (stored.rd_delivery_mode !== undefined) {
      return {
        phase_calc_params: patch,
        phase_calc_params_omit: ['rd_delivery_mode'],
      };
    }
    return { phase_calc_params: patch };
  }
  return {
    phase_calc_params: {
      ...patchQueueRdMode(stored, queue, DEFAULT_PHASE_CALC_PARAMS.rd_delivery_mode),
      queue_auto_overrides: withRdModeAutoOverride(stored, queue, true),
      queue_explicit_overrides: withRdModeExplicitOverride(stored, queue, false),
    },
  };
}

export function isPhaseCalcParamQueueSpecific(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): boolean {
  if (queue === PHASE_BASE_QUEUE) return false;
  const effective = effectivePhaseCalcParamsForQueue(queue, stored)[key] as number;
  const base = effectivePhaseCalcParamsForQueue(PHASE_BASE_QUEUE, stored)[key] as number;
  return effective !== base;
}

export function isRdModeQueueSpecific(
  queue: FsQueueKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): boolean {
  if (queue === PHASE_BASE_QUEUE) return false;
  return effectiveRdModeForQueue(queue, stored) !== effectiveRdModeForQueue(PHASE_BASE_QUEUE, stored);
}

const TECH_AUTO_PHASE_KEYS = new Set<PhaseCalcNumericKey>([
  'c37_requirements_hours_per_fe',
  'c38_design_hours_per_fe',
  'c39_implementation_hours_per_fe',
  'c90_db_support_amount',
]);

export function isTechnologyAutoPhaseParamKey(key: PhaseCalcNumericKey): boolean {
  return TECH_AUTO_PHASE_KEYS.has(key);
}

/** Ручная правка расчётного параметра: значение ≠ базового авто (на оч. 2–4 — только при отличии от оч. 1). */
export function isTechnologyAutoParamUserOverride(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
  assessment: BriefingAssessment,
): boolean {
  if (!isTechnologyAutoPhaseParamKey(key)) {
    return isPhaseCalcParamOverAuto(queue, key, stored, assessment);
  }
  const auto = autoPhaseCalcParamForQueue(queue, key, assessment);
  const effective = effectivePhaseCalcParamsForQueue(queue, stored)[key] as number;
  if (effective === auto) return false;
  if (queue !== PHASE_BASE_QUEUE && !isPhaseCalcParamQueueSpecific(queue, key, stored)) {
    return false;
  }
  return true;
}

export function isPhaseCalcParamOverAuto(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
  assessment: BriefingAssessment,
): boolean {
  const auto = autoPhaseCalcParamForQueue(queue, key, assessment);
  if (queue !== PHASE_BASE_QUEUE && !hasQueueScalarOverride(queue, key, stored)) {
    const baseVal = effectivePhaseCalcParamForQueue(PHASE_BASE_QUEUE, key, stored);
    return baseVal !== auto;
  }
  const effective = effectivePhaseCalcParamsForQueue(queue, stored)[key] as number;
  return effective !== auto;
}

export function effectivePhaseCalcParamForQueue(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): number {
  return effectivePhaseCalcParamsForQueue(queue, stored)[key] as number;
}

export function baseQueuePhaseParamValue(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
): number {
  return effectivePhaseCalcParamForQueue(PHASE_BASE_QUEUE, key, stored);
}

export function isPhaseCalcParamStoredForQueue(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
  assessment: BriefingAssessment,
): boolean {
  return isPhaseCalcParamOverAuto(queue, key, stored, assessment);
}

export function autoPhaseCalcParamForQueue(
  queue: FsQueueKey,
  key: PhaseCalcNumericKey,
  assessment: BriefingAssessment,
): number {
  const projectTypeCode = projectTypeCodeForQueue(queue, assessment);
  if (
    key === 'c37_requirements_hours_per_fe'
    || key === 'c38_design_hours_per_fe'
    || key === 'c39_implementation_hours_per_fe'
  ) {
    if (isCaseLikeTechnologyCode(projectTypeCode)) {
      return CASE_FE_NORMS[key];
    }
    return DEFAULT_PHASE_CALC_PARAMS[key];
  }
  if (key === 'c90_db_support_amount') {
    return autoC90DbSupportAmount(projectTypeCode);
  }
  return DEFAULT_PHASE_CALC_PARAMS[key];
}

export function effectiveHeadcountOpeForQueue(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  stored: Partial<PhaseCalcParams> | null | undefined,
  field: HeadcountOpeField,
): number {
  const q1Val = stored?.headcount_ope_hours?.queues?.[PHASE_BASE_QUEUE]?.[field];
  const base = q1Val ?? assessment.headcount_coeffs[field];
  if (queue === PHASE_BASE_QUEUE) return base;
  const queueVal = stored?.headcount_ope_hours?.queues?.[queue]?.[field];
  return queueVal !== undefined ? queueVal : base;
}

export function baseQueueHeadcountOpeValue(
  field: HeadcountOpeField,
  assessment: BriefingAssessment,
  stored: Partial<PhaseCalcParams> | null | undefined,
): number {
  return effectiveHeadcountOpeForQueue(PHASE_BASE_QUEUE, assessment, stored, field);
}

export function isHeadcountOpeQueueSpecific(
  queue: FsQueueKey,
  field: HeadcountOpeField,
  stored: Partial<PhaseCalcParams> | null | undefined,
  assessment: BriefingAssessment,
): boolean {
  if (queue === PHASE_BASE_QUEUE) return false;
  const effective = effectiveHeadcountOpeForQueue(queue, assessment, stored, field);
  const base = effectiveHeadcountOpeForQueue(PHASE_BASE_QUEUE, assessment, stored, field);
  return effective !== base;
}

export function isHeadcountOpeOverAuto(
  queue: FsQueueKey,
  field: HeadcountOpeField,
  assessment: BriefingAssessment,
  stored: Partial<PhaseCalcParams> | null | undefined,
): boolean {
  const effective = effectiveHeadcountOpeForQueue(queue, assessment, stored, field);
  return effective !== assessment.auto_headcount_coeffs[field];
}

/** Ручная правка C67/C68: значение ≠ базового авто (на оч. 2–4 — только при отличии от оч. 1). */
export function isHeadcountOpeUserOverride(
  queue: FsQueueKey,
  field: HeadcountOpeField,
  assessment: BriefingAssessment,
  stored: Partial<PhaseCalcParams> | null | undefined,
): boolean {
  const auto = assessment.auto_headcount_coeffs[field];
  const effective = effectiveHeadcountOpeForQueue(queue, assessment, stored, field);
  if (effective === auto) return false;
  if (queue !== PHASE_BASE_QUEUE && !isHeadcountOpeQueueSpecific(queue, field, stored, assessment)) {
    return false;
  }
  return true;
}

export function patchHeadcountOpeHours(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  field: HeadcountOpeField,
  value: number,
): Partial<PhaseCalcParams> {
  const prevQ = stored.headcount_ope_hours?.queues?.[queue] ?? {};
  return {
    headcount_ope_hours: {
      queues: {
        ...stored.headcount_ope_hours?.queues,
        [queue]: { ...prevQ, [field]: value },
      },
    },
  };
}

export function resetHeadcountOpeHours(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  field: HeadcountOpeField,
): Partial<PhaseCalcParams> {
  const prevQ = { ...(stored.headcount_ope_hours?.queues?.[queue] ?? {}) };
  if (!Object.prototype.hasOwnProperty.call(prevQ, field)) {
    return {};
  }
  delete prevQ[field];
  const pruned = Object.keys(prevQ).length > 0 ? prevQ : undefined;
  return {
    headcount_ope_hours: {
      queues: {
        [queue]: pruned ?? {},
      },
    },
  };
}

export function resetHeadcountOpeToBaseQueue(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  field: HeadcountOpeField,
): Partial<PhaseCalcParams> {
  if (queue === PHASE_BASE_QUEUE) return {};
  return resetHeadcountOpeHours(stored, queue, field);
}

export function resetHeadcountOpeToAuto(
  stored: Partial<PhaseCalcParams> | PhaseCalcParams,
  queue: FsQueueKey,
  field: HeadcountOpeField,
  assessment: BriefingAssessment,
): Partial<PhaseCalcParams> {
  const autoVal = assessment.auto_headcount_coeffs[field];
  if (queue === PHASE_BASE_QUEUE) {
    return patchHeadcountOpeHours(stored, PHASE_BASE_QUEUE, field, autoVal);
  }
  return patchHeadcountOpeHours(stored, queue, field, autoVal);
}

export function isHeadcountOpeStoredForQueue(
  queue: FsQueueKey,
  field: HeadcountOpeField,
  stored: Partial<PhaseCalcParams> | null | undefined,
  assessment: BriefingAssessment,
): boolean {
  return isHeadcountOpeOverAuto(queue, field, assessment, stored);
}

export function isC89ManualForQueue(
  stored: Partial<PhaseCalcParams> | null | undefined,
  queue: FsQueueKey,
  autoFromR81: number,
): boolean {
  const manual = stored?.c89_manual?.queues?.[queue];
  if (manual === undefined || !Number.isFinite(manual)) return false;
  return Math.round(manual) !== Math.round(autoFromR81);
}

export function effectiveC89ForQueue(
  queue: FsQueueKey,
  stored: Partial<PhaseCalcParams> | null | undefined,
  autoFromR81: number,
): number {
  const manual = stored?.c89_manual?.queues?.[queue];
  if (manual !== undefined && Number.isFinite(manual)) {
    return manual;
  }
  return autoFromR81;
}

export function patchC89Manual(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
  value: number,
): Partial<PhaseCalcParams> {
  return {
    c89_manual: {
      queues: {
        ...stored.c89_manual?.queues,
        [queue]: value,
      },
    },
  };
}

export function resetC89Manual(
  stored: Partial<PhaseCalcParams>,
  queue: FsQueueKey,
): Partial<PhaseCalcParams> {
  const prevQ = stored.c89_manual?.queues;
  if (prevQ?.[queue] === undefined) return {};

  const nextQ = { ...prevQ };
  delete nextQ[queue];

  if (Object.keys(nextQ).length === 0) {
    return { c89_manual: undefined };
  }
  return { c89_manual: { queues: nextQ } };
}

/** Слияние частичного патча phase_calc_params (клиент и сохранение). */
function mergeQueuePhaseValues(
  base: QueuePhaseValues['queues'] | undefined,
  incoming: NonNullable<QueuePhaseValues['queues']>,
): QueuePhaseValues['queues'] {
  const merged = { ...base };
  for (const [q, qv] of Object.entries(incoming)) {
    const queue = q as FsQueueKey;
    if (!qv || Object.keys(qv).length === 0) {
      delete merged[queue];
      continue;
    }
    merged[queue] = { ...qv };
  }
  return merged;
}

type QueueFlagEntry = {
  params?: Partial<Record<PhaseCalcNumericKey, true>>;
  rd_delivery_mode?: true;
};

function mergeQueueFlagMap(
  base: Partial<Record<FsQueueKey, QueueFlagEntry>> | undefined,
  incoming: Partial<Record<FsQueueKey, QueueFlagEntry>>,
): Partial<Record<FsQueueKey, QueueFlagEntry>> {
  const merged: Partial<Record<FsQueueKey, QueueFlagEntry>> = { ...base };
  for (const [q, qv] of Object.entries(incoming)) {
    const queue = q as FsQueueKey;
    if (!qv || Object.keys(qv).length === 0) {
      delete merged[queue];
      continue;
    }
    merged[queue] = { ...qv };
  }
  return merged;
}

function mergeHeadcountOpeQueues(
  base: HeadcountOpeHours['queues'] | undefined,
  incoming: NonNullable<HeadcountOpeHours['queues']>,
): HeadcountOpeHours['queues'] {
  const merged = { ...base };
  for (const [q, qv] of Object.entries(incoming)) {
    const queue = q as FsQueueKey;
    if (!qv || Object.keys(qv).length === 0) {
      delete merged[queue];
      continue;
    }
    merged[queue] = { ...qv };
  }
  return merged;
}

export function mergeIncomingPhaseCalcParams(
  base: Partial<PhaseCalcParams>,
  incoming: Partial<PhaseCalcParams>,
): Partial<PhaseCalcParams> {
  const next: Partial<PhaseCalcParams> = { ...base };
  const {
    queue_values: incomingQueueValues,
    headcount_ope_hours: incomingHeadcountOpe,
    queue_auto_overrides: incomingAutoOverrides,
    queue_explicit_overrides: incomingExplicitOverrides,
    c89_manual: incomingC89Manual,
    training_manual: incomingTrainingManual,
    training_e_manual: incomingTrainingEManual,
    training_delivery: incomingTrainingDelivery,
    ...scalarIncoming
  } = incoming;
  Object.assign(next, scalarIncoming);

  if ('queue_auto_overrides' in incoming) {
    if (incomingAutoOverrides === undefined) {
      delete next.queue_auto_overrides;
    } else if (incomingAutoOverrides.queues) {
      const mergedQueues = mergeQueueFlagMap(
        next.queue_auto_overrides?.queues,
        incomingAutoOverrides.queues,
      );
      next.queue_auto_overrides = Object.keys(mergedQueues).length > 0
        ? { queues: mergedQueues }
        : undefined;
    } else {
      next.queue_auto_overrides = incomingAutoOverrides;
    }
  }
  if ('queue_explicit_overrides' in incoming) {
    if (incomingExplicitOverrides === undefined) {
      delete next.queue_explicit_overrides;
    } else if (incomingExplicitOverrides.queues) {
      const mergedQueues = mergeQueueFlagMap(
        next.queue_explicit_overrides?.queues,
        incomingExplicitOverrides.queues,
      );
      next.queue_explicit_overrides = Object.keys(mergedQueues).length > 0
        ? { queues: mergedQueues }
        : undefined;
    } else {
      next.queue_explicit_overrides = incomingExplicitOverrides;
    }
  }
  if ('queue_values' in incoming) {
    if (incomingQueueValues?.queues) {
      const mergedQueues = mergeQueuePhaseValues(next.queue_values?.queues, incomingQueueValues.queues);
      next.queue_values = Object.keys(mergedQueues).length > 0
        ? { queues: mergedQueues }
        : undefined;
    } else if (incomingQueueValues === undefined) {
      delete next.queue_values;
    } else {
      next.queue_values = incomingQueueValues;
    }
  }
  if ('headcount_ope_hours' in incoming) {
    if (incomingHeadcountOpe?.queues) {
      const mergedQueues = mergeHeadcountOpeQueues(
        next.headcount_ope_hours?.queues,
        incomingHeadcountOpe.queues,
      );
      next.headcount_ope_hours = Object.keys(mergedQueues).length > 0
        ? { queues: mergedQueues }
        : undefined;
    } else if (incomingHeadcountOpe === undefined) {
      delete next.headcount_ope_hours;
    } else {
      next.headcount_ope_hours = incomingHeadcountOpe;
    }
  }
  if ('c89_manual' in incoming) {
    if (incomingC89Manual === undefined) {
      delete next.c89_manual;
    } else {
      next.c89_manual = incomingC89Manual;
    }
  }
  if ('training_manual' in incoming) {
    if (incomingTrainingManual === undefined) delete next.training_manual;
    else next.training_manual = incomingTrainingManual;
  }
  if ('training_e_manual' in incoming) {
    if (incomingTrainingEManual === undefined) delete next.training_e_manual;
    else next.training_e_manual = incomingTrainingEManual;
  }
  if ('training_delivery' in incoming) {
    if (incomingTrainingDelivery === undefined) delete next.training_delivery;
    else next.training_delivery = incomingTrainingDelivery;
  }
  return next;
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
