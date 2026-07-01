/** Excel C35–C49, C65–C66 on queue sheets («Прочие параметры расчёта»). Defaults from «Очередь 1 ПРОФ_КОРП». */

export type RdDeliveryMode = 'doc' | 'video' | 'doc_video';

export interface TrainingManualState {
  queues: Partial<Record<string, Record<string, { g?: number; h?: number; g_manual?: boolean; h_manual?: boolean }>>>;
}

export interface TrainingEManualState {
  queues: Partial<Record<string, Partial<Record<string, boolean>>>>;
}

export interface C89ManualState {
  queues: Partial<Record<string, number>>;
}

export type TrainingDeliveryFormat = 'groups' | 'webinar';

export interface TrainingRowDeliveryOverride {
  format?: TrainingDeliveryFormat;
  format_manual?: boolean;
  webinar_count?: number;
  webinar_qa_reserve?: number;
}

export interface TrainingDeliveryState {
  queues?: Partial<Record<string, Partial<Record<string, TrainingRowDeliveryOverride>>>>;
}

export interface QueuePhaseValues {
  queues: Partial<
    Record<string, Partial<Record<string, number>> & { rd_delivery_mode?: RdDeliveryMode }>
  >;
}

export interface HeadcountOpeHours {
  queues: Partial<Record<string, { c67?: number; c68?: number }>>;
}

export interface QueueAutoOverrides {
  queues?: Partial<Record<string, {
    params?: Partial<Record<string, true>>;
    rd_delivery_mode?: true;
  }>>;
}

export interface QueueExplicitOverrides {
  queues?: Partial<Record<string, {
    params?: Partial<Record<string, true>>;
    rd_delivery_mode?: true;
  }>>;
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
  rd_delivery_mode: RdDeliveryMode;
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
  training_manual?: TrainingManualState;
  training_e_manual?: TrainingEManualState;
  c89_manual?: C89ManualState;
  training_delivery?: TrainingDeliveryState;
  queue_values?: QueuePhaseValues;
  headcount_ope_hours?: HeadcountOpeHours;
  queue_auto_overrides?: QueueAutoOverrides;
  queue_explicit_overrides?: QueueExplicitOverrides;
}

export const DEFAULT_PHASE_CALC_PARAMS: PhaseCalcParams = {
  c35_methodical_hours_per_fe: 16,
  c37_requirements_hours_per_fe: 4.5,
  c38_design_hours_per_fe: 8,
  c39_implementation_hours_per_fe: 12,
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

export function computeC36(params: PhaseCalcParams): number {
  return params.c37_requirements_hours_per_fe
    + params.c38_design_hours_per_fe
    + params.c39_implementation_hours_per_fe;
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
  return {
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
