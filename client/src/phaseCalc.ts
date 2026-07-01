import type { BriefingAssessment, BriefingFsSel, FsQueueKey, OrgVolumeBreakdownRow, QueueOrgVolume } from './types';
import {
  computeQueueSpFromFs,
  effectiveFunctionalSp,
  effectiveIntegrationsSp,
  effectiveNmdSp,
  effectiveLoadTestScenarios,
  effectiveTrainingEValues,
  effectiveBreakdownField,
  rebalanceOrgQueuePartners,
  typeCodeForTechnologyLabel,
  isCaseProjectType,
  getEffectiveQueueRate,
} from './assessmentCalc';
import {
  effectivePhaseCalcParamsForQueue,
  effectiveHeadcountOpeForQueue,
  isPhaseCalcParamOverAuto,
  autoC90DbSupportAmount,
  computeC40,
  effectiveFeNormsForTechnology,
  effectiveC89ForQueue,
  effectiveTrainingRowDelivery,
  webinarRowCost,
  WEBINAR_HOURS_PER_SESSION,
  computeC36FromNorms,
  travelDaysFromTrainingGroup,
  type EffectiveTrainingRowDelivery,
  type PhaseCalcParams,
  type RdDeliveryMode,
  type TrainingManualByQueue,
  type TrainingRowKey,
} from './phaseCalcParams';

export interface PhaseBaseStep {
  label: string;
  expression: string;
  value: number;
  /** Заголовок группы в модале расчёта (без значения в столбцах). */
  kind?: 'header' | 'step';
}

export interface PhaseBaseResult {
  total: number | null;
  /** Часть базовой оценки C без командировок. */
  core?: number | null;
  /** Командировочные в базовой оценке C. */
  travel?: number | null;
  steps: PhaseBaseStep[];
  formula: string;
}

function finishBase(
  total: number,
  steps: PhaseBaseStep[],
  formula: string,
  core = total,
  travel = 0,
): PhaseBaseResult {
  return { total, core, travel, steps, formula };
}

export interface PhaseCalcInputs {
  c20: number;
  c21: number;
  d20: number;
  c35: number;
  c37: number;
  c38: number;
  c39: number;
  c36: number;
  c32: number;
  c63: number;
  c64: number;
  e20: number;
  e7: number;
  c50: number;
  c88: number;
  c89: number;
  c90: number;
  c40: number;
  c41: number;
  c42: number;
  c43: number;
  c44: number;
  c45: number;
  rd_delivery_mode: RdDeliveryMode;
  rd_video_hours: number;
  c46: number;
  c5: number;
  c6: number;
  c7: number;
  e5: number;
  e6: number;
  c47: number;
  c48: number;
  c49: number;
  f47: number;
  f48: number;
  f49: number;
  g47: number;
  g48: number;
  g49: number;
  h47: number;
  h48: number;
  h49: number;
  d47: number;
  d48: number;
  d49: number;
  /** F49×D49 — из блока «Обучение» (стр. 49) */
  r84_row49_fd: number;
  /** F47×D47 + F48×D48 — часы из блока «Обучение» (стр. 47–48) */
  r85_training_hours: number;
  /** H47 + H48 — дни из блока «Обучение» */
  r85_travel_days: number;
  /** F47×D47, F48×D48 — по строкам параметров */
  r85_row47_fd: number;
  r85_row48_fd: number;
  training_row47: EffectiveTrainingRowDelivery;
  training_row48: EffectiveTrainingRowDelivery;
  training_row49: EffectiveTrainingRowDelivery;
  c65: number;
  c66: number;
  c67: number;
  c68: number;
  projectTypeCode: string;
}

const CASE_OPE_INTRO_AMOUNT = 700_000;
const CASE_OPE_SUPPORT_AMOUNT = 200_000;

const EMPTY_QUEUE_ROW: QueueOrgVolume = {
  users: 0,
  rp_rpo: 0,
  executors: 0,
  rg: 0,
  rg_regions: 0,
  functional_sp: 0,
  integrations_sp: 0,
  nmd_sp: 0,
  load_test_scenarios: 0,
  region: '',
  active: false,
};

export function buildPhaseCalcInputs(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
): PhaseCalcInputs {
  const fsAuto = computeQueueSpFromFs(fsItems);
  const queueRow = assessment.org_volume?.queues?.[queue] ?? EMPTY_QUEUE_ROW;
  const qc = assessment.queue_calcs.find(r => r.queue === queue);

  const params = effectivePhaseCalcParamsForQueue(queue, assessment.phase_calc_params);
  const storedParams = assessment.phase_calc_params;
  const c20 = effectiveFunctionalSp(queue, queueRow.functional_sp, fsAuto.functional_sp[queue]);
  const projectTypeCode = qc?.technology
    ? typeCodeForTechnologyLabel(qc.technology)
    : 'CASE';
  const feNorms = effectiveFeNormsForTechnology(projectTypeCode, params);
  const c32 = qc
    ? getEffectiveQueueRate(qc, assessment.unified_rate_enabled, assessment.unified_rate)
    : 0;
  const isCase = isCaseProjectType(projectTypeCode);
  const partners = rebalanceOrgQueuePartners(queueRow.users, queueRow.rp_rpo, queueRow.executors);
  const c5 = partners.rp_rpo ?? 0;
  const c6 = partners.executors ?? 0;
  const c7 = queueRow.rg ?? 0;
  const e5 = sumRegionalOrgField(queueRow, 'rp_rpo');
  const e6 = sumRegionalOrgField(queueRow, 'executors');
  const training = computeTrainingGroups(queueRow, params, queue);
  const trainingE = effectiveTrainingEValues(queueRow);
  const training_row47 = effectiveTrainingRowDelivery(queue, 'row47', trainingE.e47, storedParams);
  const training_row48 = effectiveTrainingRowDelivery(queue, 'row48', trainingE.e48, storedParams);
  const training_row49 = effectiveTrainingRowDelivery(queue, 'row49', trainingE.e49, storedParams);
  const c65 = isCase && c32 > 0 ? CASE_OPE_INTRO_AMOUNT / c32 : params.c65_ope_intro_hours;
  const c66 = isCase && c32 > 0 ? CASE_OPE_SUPPORT_AMOUNT / c32 : params.c66_ope_hours;

  const core: Omit<PhaseCalcInputs, 'c89'> = {
    c20,
    c21: effectiveIntegrationsSp(queue, queueRow.integrations_sp, fsAuto.integrations_sp_auto[queue]),
    d20: effectiveNmdSp(queue, queueRow.nmd_sp, fsAuto.nmd_sp_auto[queue]),
    c35: params.c35_methodical_hours_per_fe,
    c37: feNorms.c37_requirements_hours_per_fe,
    c38: feNorms.c38_design_hours_per_fe,
    c39: feNorms.c39_implementation_hours_per_fe,
    c36: computeC36FromNorms(feNorms),
    c32,
    c63: assessment.headcount_coeffs.c63,
    c64: assessment.headcount_coeffs.c64,
    e20: effectiveLoadTestScenarios(queueRow.active, queueRow.load_test_scenarios, c20),
    e7: effectiveE7RegionalRg(queueRow),
    c50: params.c50_business_trip_day_cost,
    c88: params.c88_ib_doc_amount,
    c90: isPhaseCalcParamOverAuto(queue, 'c90_db_support_amount', storedParams, assessment)
      ? params.c90_db_support_amount
      : autoC90DbSupportAmount(projectTypeCode),
    c40: computeC40(params),
    c41: params.c41_db_install_hours,
    c42: params.c42_db_nsi_hours,
    c43: params.c43_db_access_hours,
    c44: params.c44_db_workplaces_hours,
    c45: params.c45_rd_hours,
    rd_delivery_mode: params.rd_delivery_mode,
    rd_video_hours: params.rd_video_hours,
    c46: params.c46_training_prep_hours,
    c5,
    c6,
    c7,
    e5,
    e6,
    c47: params.c47_users_per_group,
    c48: params.c48_executors_per_group,
    c49: params.c49_admins_per_group,
    f47: training.row47.f,
    f48: training.row48.f,
    f49: training.row49.f,
    g47: training.row47.g,
    g48: training.row48.g,
    g49: training.row49.g,
    h47: training.row47.h,
    h48: training.row48.h,
    h49: training.row49.h,
    r84_row49_fd: training.row49.fd,
    r85_row47_fd: training.row47.fd,
    r85_row48_fd: training.row48.fd,
    r85_training_hours: training.row47.fd + training.row48.fd,
    r85_travel_days: training.row47.h + training.row48.h,
    training_row47,
    training_row48,
    training_row49,
    d47: params.d47_users_hours_per_group,
    d48: params.d48_executors_hours_per_group,
    d49: params.d49_admins_hours_per_group,
    c65,
    c66,
    c67: effectiveHeadcountOpeForQueue(queue, assessment, storedParams, 'c67'),
    c68: effectiveHeadcountOpeForQueue(queue, assessment, storedParams, 'c68'),
    projectTypeCode,
  };

  const autoC89 = computeR81({ ...core, c89: 0 }).total ?? 0;
  const c89 = effectiveC89ForQueue(queue, assessment.phase_calc_params, autoC89);

  return { ...core, c89 };
}

function roundUp0(x: number): number {
  if (x <= 0) return 0;
  return Math.ceil(x);
}

export interface TrainingGroupRowCalc {
  e: number;
  eRegional: number;
  c: number;
  d: number;
  f: number;
  g: number;
  h: number;
  /** F×D — часы обучения по строке (готово из параметров) */
  fd: number;
}

export interface TrainingGroupsCalc {
  row47: TrainingGroupRowCalc;
  row48: TrainingGroupRowCalc;
  row49: TrainingGroupRowCalc;
}

interface TrainingGroupCalc {
  f: number;
  g: number;
  h: number;
}

/** F/G/H для строк 47–49 листа очереди (из орг. объёма и параметров C47–D49). */
export function computeTrainingGroupsAuto(
  queueRow: QueueOrgVolume,
  params: PhaseCalcParams,
): TrainingGroupsCalc {
  const { e47, e48, e49 } = effectiveTrainingEValues(queueRow);

  const mk = (
    e: number,
    eRegional: number,
    c: number,
    d: number,
  ): TrainingGroupRowCalc => {
    const { f, g, h } = computeTrainingGroup(e, c, eRegional, d);
    return { e, eRegional, c, d, f, g, h, fd: f * d };
  };

  const regionalRg = effectiveE7RegionalRg(queueRow);

  return {
    row47: mk(e47, sumRegionalOrgField(queueRow, 'users'), params.c47_users_per_group, params.d47_users_hours_per_group),
    row48: mk(e48, sumRegionalOrgField(queueRow, 'executors'), params.c48_executors_per_group, params.d48_executors_hours_per_group),
    row49: mk(e49, regionalRg, params.c49_admins_per_group, params.d49_admins_hours_per_group),
  };
}

export function applyTrainingManualOverrides(
  auto: TrainingGroupsCalc,
  manual: TrainingManualByQueue | undefined,
): TrainingGroupsCalc {
  const applyRow = (key: TrainingRowKey, autoRow: TrainingGroupRowCalc): TrainingGroupRowCalc => {
    const o = manual?.[key];
    if (!o?.g_manual && !o?.h_manual) return autoRow;

    const g = o.g_manual && o.g !== undefined ? o.g : autoRow.g;
    const h = o.h_manual && o.h !== undefined
      ? o.h
      : travelDaysFromTrainingGroup(g, autoRow.d);

    return { ...autoRow, g, h };
  };

  return {
    row47: applyRow('row47', auto.row47),
    row48: applyRow('row48', auto.row48),
    row49: applyRow('row49', auto.row49),
  };
}

export function computeTrainingGroups(
  queueRow: QueueOrgVolume,
  params: PhaseCalcParams,
  queueKey?: FsQueueKey,
): TrainingGroupsCalc {
  const auto = computeTrainingGroupsAuto(queueRow, params);
  if (!queueKey) return auto;
  const manual = params.training_manual?.queues?.[queueKey];
  return applyTrainingManualOverrides(auto, manual);
}

function computeTrainingGroup(
  e: number,
  c: number,
  gRegional: number,
  d: number,
): TrainingGroupCalc {
  const f = c > 0 ? roundUp0(e / c) : 0;
  const g = c > 0 ? roundUp0(gRegional / c) : 0;
  const h = travelDaysFromTrainingGroup(g, d);
  return { f, g, h };
}

function isOrgVolumePlaceholder(row: OrgVolumeBreakdownRow, queueRegion: string): boolean {
  if ((row.branches?.length ?? 0) > 0) return false;
  const valuesEmpty = [row.users, row.rp_rpo, row.executors, row.rg].every(v => v == null);
  const labelEmptyOrDefault = row.label === '' || row.label === queueRegion;
  return valuesEmpty && labelEmptyOrDefault;
}

/**
 * Сумма по всем строкам breakdown очереди.
 * Всё, что подчинено очереди (регионы и филиалы), — «в регионах» для G/H обучения.
 */
export function sumRegionalOrgField(
  queueRow: QueueOrgVolume,
  field: 'users' | 'rp_rpo' | 'executors' | 'rg',
): number {
  const breakdown = queueRow.breakdown ?? [];
  if (breakdown.length === 0) return 0;

  const queueRegion = queueRow.region ?? '';
  let sum = 0;
  for (const row of breakdown) {
    if (isOrgVolumePlaceholder(row, queueRegion)) continue;
    sum += effectiveBreakdownField(row, field) ?? 0;
  }
  return sum;
}

/** Excel E7 — РГ в регионах: сумма РГ по breakdown или rg_regions без детализации. */
export function effectiveE7RegionalRg(queueRow: QueueOrgVolume): number {
  return (queueRow.breakdown?.length ?? 0) > 0
    ? sumRegionalOrgField(queueRow, 'rg')
    : (queueRow.rg_regions ?? 0);
}

const R74_FORMULA = 'D20 × C35 × C32 × C63 + IF(E7 > 0, E7 × C50, 0)';
const R75_FORMULA = '(C20 + C21) × C37 × C32 × C63 + IF(E7 > 0, E7 × C50, 0)';
const R76_FORMULA = 'C20 × C38 × C32 × C63';
const R77_FORMULA = 'C20 × C39 × C32 × C63';
const R78_FORMULA = 'C21 × C36 × C32 × C64';
const R79_FORMULA = 'E20 × 250 000';
const R80_FORMULA_PROF = 'SUM(C75:C78) × 0.1 + C40 × C32';
const R80_FORMULA_CASE = 'C40 × C32 × C64';
const R81_FORMULA_PROF = 'SUM(C76:C77) × 0.1 + РД (документация и/или видео)';
const R81_FORMULA_CASE = 'MAX(РД (документация и/или видео), SUM(C77:C78) × 0.1)';
const R82_FORMULA_PROF = 'SUM(C76:C77) × 0.1';
const R82_FORMULA_CASE = 'SUM(C77:C78) × 0.1';
const R83_FORMULA = '192 000 + 96 000 × 5';
const R84_FORMULA = '(C46 + F49×D49) × C32 + H49×C50';
const R84_FORMULA_WEBINAR = 'N × 4 × C32 × (1 + резерв)';
const R85_FORMULA = '(F47×D47 + F48×D48) × C32 + SUM(H47:H48)×C50';
const R85_FORMULA_MIXED = 'сумма строк 47–48 (группы / вебинары)';
const R86_FORMULA_PROF = '((C5×C67 + C6×C68)×0.5 + C65) × C32 + E5×C50';
const R86_FORMULA_CASE = 'C65×C32 + E7×C50';
const R87_FORMULA_PROF = '((C5×C67 + C6×C68)×0.5 + C66) × C32 + E5×C50';
const R87_FORMULA_CASE = 'C66 × C32';
const R88_FORMULA = 'C88';
const R89_FORMULA = 'C81';
const R90_FORMULA = 'C90';
const OUTSOURCING_BASE = 192_000;
const OUTSOURCING_MONTHLY = 96_000;
const OUTSOURCING_MONTHS = 5;
const LOAD_TEST_COST_PER_SCENARIO = 250_000;

function computeR74(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { d20, c35, c32, c63, e7, c50 } = inputs;
  const core = d20 * c35 * c32 * c63;
  const travel = e7 > 0 ? e7 * c50 : 0;
  const total = core + travel;

  const steps: PhaseBaseStep[] = [
    { label: 'D20 — SP НМД', expression: String(d20), value: d20 },
    { label: 'C35 — часов методической проработки на ФЕ', expression: String(c35), value: c35 },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    { label: 'C63 — коэфф. численности', expression: String(c63), value: c63 },
    {
      label: 'D20 × C35 × C32 × C63',
      expression: `${d20} × ${c35} × ${c32} × ${c63}`,
      value: core,
    },
  ];

  if (e7 > 0) {
    steps.push(
      { label: 'E7 — РГ в регионах', expression: String(e7), value: e7 },
      { label: 'C50 — стоимость дня командировки, ₽', expression: String(c50), value: c50 },
      { label: 'E7 × C50', expression: `${e7} × ${c50}`, value: travel },
    );
  }

  steps.push({
    label: 'Итого',
    expression: e7 > 0 ? `${core} + ${travel}` : String(core),
    value: total,
  });

  return finishBase(total, steps, R74_FORMULA, core, travel);
}

function computeR75(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c20, c21, c37, c32, c63, e7, c50 } = inputs;
  const spSum = c20 + c21;
  const core = spSum * c37 * c32 * c63;
  const travel = e7 > 0 ? e7 * c50 : 0;
  const total = core + travel;

  const steps: PhaseBaseStep[] = [
    { label: 'C20 — SP функционала', expression: String(c20), value: c20 },
    { label: 'C21 — SP интеграций', expression: String(c21), value: c21 },
    { label: 'C20 + C21', expression: `${c20} + ${c21}`, value: spSum },
    { label: 'C37 — часов на FE (требования)', expression: String(c37), value: c37 },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    { label: 'C63 — коэфф. численности', expression: String(c63), value: c63 },
    {
      label: '(C20+C21) × C37 × C32 × C63',
      expression: `${spSum} × ${c37} × ${c32} × ${c63}`,
      value: core,
    },
  ];

  if (e7 > 0) {
    steps.push(
      { label: 'E7 — РГ в регионах', expression: String(e7), value: e7 },
      { label: 'C50 — стоимость дня командировки, ₽', expression: String(c50), value: c50 },
      { label: 'E7 × C50', expression: `${e7} × ${c50}`, value: travel },
    );
  }

  steps.push({
    label: 'Итого',
    expression: e7 > 0 ? `${core} + ${travel}` : String(core),
    value: total,
  });

  return finishBase(total, steps, R75_FORMULA, core, travel);
}

function computeR76(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c20, c38, c32, c63 } = inputs;
  const total = c20 * c38 * c32 * c63;

  const steps: PhaseBaseStep[] = [
    { label: 'C20 — SP функционала', expression: String(c20), value: c20 },
    { label: 'C38 — часов на FE (проектирование)', expression: String(c38), value: c38 },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    { label: 'C63 — коэфф. численности', expression: String(c63), value: c63 },
    {
      label: 'C20 × C38 × C32 × C63',
      expression: `${c20} × ${c38} × ${c32} × ${c63}`,
      value: total,
    },
    { label: 'Итого', expression: `${c20} × ${c38} × ${c32} × ${c63}`, value: total },
  ];

  return finishBase(total, steps, R76_FORMULA);
}

function computeR77(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c20, c39, c32, c63, projectTypeCode } = inputs;
  const total = c20 * c39 * c32 * c63;
  const c39Expr = c39 === 0 && isCaseProjectType(projectTypeCode)
    ? '0 (разработка не применяется для Кейс/БЗ)'
    : String(c39);

  const steps: PhaseBaseStep[] = [
    { label: 'C20 — SP функционала', expression: String(c20), value: c20 },
    { label: 'C39 — часов на FE (разработка)', expression: c39Expr, value: c39 },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    { label: 'C63 — коэфф. численности', expression: String(c63), value: c63 },
    {
      label: 'C20 × C39 × C32 × C63',
      expression: `${c20} × ${c39} × ${c32} × ${c63}`,
      value: total,
    },
    { label: 'Итого', expression: `${c20} × ${c39} × ${c32} × ${c63}`, value: total },
  ];

  return { total, steps, formula: R77_FORMULA };
}

function computeR78(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c21, c36, c37, c38, c39, c32, c64 } = inputs;
  const total = c21 * c36 * c32 * c64;

  const steps: PhaseBaseStep[] = [
    { label: 'C21 — SP интеграций', expression: String(c21), value: c21 },
    { label: 'C37 — часов на FE (требования)', expression: String(c37), value: c37 },
    { label: 'C38 — часов на FE (проектирование)', expression: String(c38), value: c38 },
    { label: 'C39 — часов на FE (разработка)', expression: String(c39), value: c39 },
    {
      label: 'C36 — базовый объём ПП на ФЕ',
      expression: `C37 (требования, ${c37}) + C38 (проектирование, ${c38}) + C39 (разработка, ${c39})`,
      value: c36,
    },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    { label: 'C64 — коэфф. численности (интеграции)', expression: String(c64), value: c64 },
    {
      label: 'C21 × C36 × C32 × C64',
      expression: `${c21} × ${c36} × ${c32} × ${c64}`,
      value: total,
    },
    { label: 'Итого', expression: `${c21} × ${c36} × ${c32} × ${c64}`, value: total },
  ];

  return { total, steps, formula: R78_FORMULA };
}

function computeR79(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { e20 } = inputs;
  const total = e20 * LOAD_TEST_COST_PER_SCENARIO;

  const steps: PhaseBaseStep[] = [
    { label: 'E20 — сценариев нагрузочного тестирования', expression: String(e20), value: e20 },
    { label: 'Стоимость 1 сценария, ₽', expression: '250 000', value: LOAD_TEST_COST_PER_SCENARIO },
    {
      label: 'E20 × 250 000',
      expression: `${e20} × 250 000`,
      value: total,
    },
    { label: 'Итого', expression: `${e20} × 250 000`, value: total },
  ];

  return { total, steps, formula: R79_FORMULA };
}

function sumPhaseBases(inputs: PhaseCalcInputs): {
  c75: number;
  c76: number;
  c77: number;
  c78: number;
  sum: number;
} {
  const c75 = computeR75(inputs).total ?? 0;
  const c76 = computeR76(inputs).total ?? 0;
  const c77 = computeR77(inputs).total ?? 0;
  const c78 = computeR78(inputs).total ?? 0;
  return { c75, c76, c77, c78, sum: c75 + c76 + c77 + c78 };
}

function computeR80(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c40, c41, c42, c43, c44, c32, c64, projectTypeCode } = inputs;
  const isCase = isCaseProjectType(projectTypeCode);

  if (isCase) {
    const total = c40 * c32 * c64;
    const steps: PhaseBaseStep[] = [
      { label: 'C41 — установка БД, ч', expression: String(c41), value: c41 },
      { label: 'C42 — НСИ, ч', expression: String(c42), value: c42 },
      { label: 'C43 — доступы, ч', expression: String(c43), value: c43 },
      { label: 'C44 — рабочие места, ч', expression: String(c44), value: c44 },
      {
        label: 'C40 — настройка БД, ч',
        expression: `C41 (установка, ${c41}) + C42 (НСИ, ${c42}) + C43 (доступы, ${c43}) + C44 (РМ, ${c44})`,
        value: c40,
      },
      { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
      { label: 'C64 — коэфф. численности (интеграции)', expression: String(c64), value: c64 },
      {
        label: 'C40 × C32 × C64',
        expression: `${c40} × ${c32} × ${c64}`,
        value: total,
      },
      { label: 'Итого', expression: `${c40} × ${c32} × ${c64}`, value: total },
    ];
    return { total, steps, formula: R80_FORMULA_CASE };
  }

  const phases = sumPhaseBases(inputs);
  const reserve10 = phases.sum * 0.1;
  const dbPart = c40 * c32;
  const total = reserve10 + dbPart;

  const steps: PhaseBaseStep[] = [
    { label: 'C75 — фазы 1–2', expression: String(phases.c75), value: phases.c75 },
    { label: 'C76 — фаза 3', expression: String(phases.c76), value: phases.c76 },
    { label: 'C77 — фаза 4.1', expression: String(phases.c77), value: phases.c77 },
    { label: 'C78 — фаза 4.2', expression: String(phases.c78), value: phases.c78 },
    {
      label: 'SUM(C75:C78)',
      expression: `${phases.c75} + ${phases.c76} + ${phases.c77} + ${phases.c78}`,
      value: phases.sum,
    },
    {
      label: '10% от SUM(C75:C78)',
      expression: `${phases.sum} × 0.1`,
      value: reserve10,
    },
    { label: 'C41 — установка БД, ч', expression: String(c41), value: c41 },
    { label: 'C42 — НСИ, ч', expression: String(c42), value: c42 },
    { label: 'C43 — доступы, ч', expression: String(c43), value: c43 },
    { label: 'C44 — рабочие места, ч', expression: String(c44), value: c44 },
    {
      label: 'C40 — настройка БД, ч',
      expression: `C41 (установка, ${c41}) + C42 (НСИ, ${c42}) + C43 (доступы, ${c43}) + C44 (РМ, ${c44})`,
      value: c40,
    },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    {
      label: 'C40 × C32',
      expression: `${c40} × ${c32}`,
      value: dbPart,
    },
    {
      label: 'Итого',
      expression: `${reserve10} + ${dbPart}`,
      value: total,
    },
  ];

  return { total, steps, formula: R80_FORMULA_PROF };
}

function rdContentParts(
  mode: RdDeliveryMode,
  c45: number,
  rdVideoHours: number,
  c32: number,
  c63: number,
): { docPart: number; videoPart: number; contentPart: number } {
  const docPart = (mode === 'doc' || mode === 'doc_video') ? c45 * c32 * c63 : 0;
  const videoPart = (mode === 'video' || mode === 'doc_video') ? rdVideoHours * c32 * c63 : 0;
  return { docPart, videoPart, contentPart: docPart + videoPart };
}

function rdContentSteps(
  mode: RdDeliveryMode,
  c45: number,
  rdVideoHours: number,
  c32: number,
  c63: number,
  parts: ReturnType<typeof rdContentParts>,
): PhaseBaseStep[] {
  const steps: PhaseBaseStep[] = [
    {
      label: 'Состав РД',
      expression: mode === 'doc' ? 'документация'
        : mode === 'video' ? 'видео-ролики'
          : 'документация + видео',
      value: 0,
      kind: 'header',
    },
  ];
  if (mode === 'doc' || mode === 'doc_video') {
    steps.push(
      { label: 'C45 — часы РД', expression: String(c45), value: c45 },
      { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
      { label: 'C63 — коэфф. численности', expression: String(c63), value: c63 },
      {
        label: 'C45 × C32 × C63',
        expression: `${c45} × ${c32} × ${c63}`,
        value: parts.docPart,
      },
    );
  }
  if (mode === 'video' || mode === 'doc_video') {
    steps.push(
      { label: 'Часы видео-роликов', expression: String(rdVideoHours), value: rdVideoHours },
      { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
      { label: 'C63 — коэфф. численности', expression: String(c63), value: c63 },
      {
        label: 'часы видео × C32 × C63',
        expression: `${rdVideoHours} × ${c32} × ${c63}`,
        value: parts.videoPart,
      },
    );
  }
  if (mode === 'doc_video') {
    steps.push({
      label: 'Сумма документация + видео',
      expression: `${parts.docPart} + ${parts.videoPart}`,
      value: parts.contentPart,
    });
  }
  return steps;
}

function computeR81(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c45, rd_delivery_mode, rd_video_hours, c32, c63, projectTypeCode } = inputs;
  const phases = sumPhaseBases(inputs);
  const parts = rdContentParts(rd_delivery_mode, c45, rd_video_hours, c32, c63);
  const isCase = isCaseProjectType(projectTypeCode);

  if (isCase) {
    const reserve77_78 = (phases.c77 + phases.c78) * 0.1;
    const total = Math.max(parts.contentPart, reserve77_78);
    const steps: PhaseBaseStep[] = [
      { label: 'C76 — фаза 3', expression: String(phases.c76), value: phases.c76 },
      { label: 'C77 — фаза 4.1', expression: String(phases.c77), value: phases.c77 },
      { label: 'C78 — фаза 4.2', expression: String(phases.c78), value: phases.c78 },
      {
        label: 'SUM(C77:C78) × 0.1',
        expression: `(${phases.c77} + ${phases.c78}) × 0.1`,
        value: reserve77_78,
      },
      ...rdContentSteps(rd_delivery_mode, c45, rd_video_hours, c32, c63, parts),
      {
        label: 'MAX(…)',
        expression: `MAX(${parts.contentPart}, ${reserve77_78})`,
        value: total,
      },
      { label: 'Итого', expression: String(total), value: total },
    ];
    return { total, steps, formula: R81_FORMULA_CASE };
  }

  const reserve76_77 = (phases.c76 + phases.c77) * 0.1;
  const total = reserve76_77 + parts.contentPart;
  const steps: PhaseBaseStep[] = [
    { label: 'C76 — фаза 3', expression: String(phases.c76), value: phases.c76 },
    { label: 'C77 — фаза 4.1', expression: String(phases.c77), value: phases.c77 },
    {
      label: 'SUM(C76:C77) × 0.1',
      expression: `(${phases.c76} + ${phases.c77}) × 0.1`,
      value: reserve76_77,
    },
    ...rdContentSteps(rd_delivery_mode, c45, rd_video_hours, c32, c63, parts),
    {
      label: 'Итого',
      expression: `${reserve76_77} + ${parts.contentPart}`,
      value: total,
    },
  ];
  return { total, steps, formula: R81_FORMULA_PROF };
}

function computeR82(inputs: PhaseCalcInputs): PhaseBaseResult {
  const phases = sumPhaseBases(inputs);
  const isCase = isCaseProjectType(inputs.projectTypeCode);

  if (isCase) {
    const total = (phases.c77 + phases.c78) * 0.1;
    const steps: PhaseBaseStep[] = [
      { label: 'C77 — фаза 4.1', expression: String(phases.c77), value: phases.c77 },
      { label: 'C78 — фаза 4.2', expression: String(phases.c78), value: phases.c78 },
      {
        label: 'SUM(C77:C78) × 0.1',
        expression: `(${phases.c77} + ${phases.c78}) × 0.1`,
        value: total,
      },
      { label: 'Итого', expression: String(total), value: total },
    ];
    return { total, steps, formula: R82_FORMULA_CASE };
  }

  const total = (phases.c76 + phases.c77) * 0.1;
  const steps: PhaseBaseStep[] = [
    { label: 'C76 — фаза 3', expression: String(phases.c76), value: phases.c76 },
    { label: 'C77 — фаза 4.1', expression: String(phases.c77), value: phases.c77 },
    {
      label: 'SUM(C76:C77) × 0.1',
      expression: `(${phases.c76} + ${phases.c77}) × 0.1`,
      value: total,
    },
    { label: 'Итого', expression: String(total), value: total },
  ];
  return { total, steps, formula: R82_FORMULA_PROF };
}

function computeR83(inputs: PhaseCalcInputs): PhaseBaseResult {
  if (isCaseProjectType(inputs.projectTypeCode)) {
    return {
      total: 0,
      steps: [
        {
          label: 'Итого',
          expression: '0 (только ПРОФ/КОРП)',
          value: 0,
        },
      ],
      formula: R83_FORMULA,
    };
  }

  const monthlyPart = OUTSOURCING_MONTHLY * OUTSOURCING_MONTHS;
  const total = OUTSOURCING_BASE + monthlyPart;
  const steps: PhaseBaseStep[] = [
    { label: 'Базовая часть', expression: '192 000', value: OUTSOURCING_BASE },
    { label: '96 000 × 5 мес.', expression: `${OUTSOURCING_MONTHLY} × ${OUTSOURCING_MONTHS}`, value: monthlyPart },
    { label: 'Итого', expression: `${OUTSOURCING_BASE} + ${monthlyPart}`, value: total },
  ];
  return { total, steps, formula: R83_FORMULA };
}

function trainingFormatHeader(format: 'groups' | 'webinar'): PhaseBaseStep {
  return {
    kind: 'header',
    label: format === 'webinar' ? 'Вид обучения: вебинары' : 'Вид обучения: группы',
    expression: '',
    value: 0,
  };
}

function webinarCostSteps(
  label: string,
  count: number,
  reserve: number,
  c32: number,
): { core: number; steps: PhaseBaseStep[] } {
  const core = webinarRowCost(count, c32, reserve);
  const reservePct = reserve * 100;
  const steps: PhaseBaseStep[] = [
    { label: `${label} — кол-во вебинаров`, expression: String(count), value: count },
    { label: 'Часов на вебинар (подготовка + проведение)', expression: String(WEBINAR_HOURS_PER_SESSION), value: WEBINAR_HOURS_PER_SESSION },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    { label: 'Резерв на разбор вопросов, %', expression: `${reservePct}%`, value: reservePct },
    {
      label: 'N × 4 × C32 × (1 + резерв)',
      expression: `${count} × ${WEBINAR_HOURS_PER_SESSION} × ${c32} × (1 + ${reservePct}%)`,
      value: core,
    },
  ];
  return { core, steps };
}

function computeR84(inputs: PhaseCalcInputs): PhaseBaseResult {
  const {
    c46, f49, g49, d49, c32, h49, c50, r84_row49_fd, training_row49,
  } = inputs;

  if (training_row49.format === 'webinar') {
    const { core, steps: wSteps } = webinarCostSteps(
      'Строка 49 (админы)',
      training_row49.webinarCount,
      training_row49.webinarReserve,
      c32,
    );
    const steps: PhaseBaseStep[] = [
      trainingFormatHeader('webinar'),
      ...wSteps,
      { label: 'Итого', expression: String(core), value: core },
    ];
    return finishBase(core, steps, R84_FORMULA_WEBINAR, core, 0);
  }

  const trainingHours = c46 + r84_row49_fd;
  const core = trainingHours * c32;
  const travel = h49 * c50;
  const total = core + travel;

  const steps: PhaseBaseStep[] = [
    trainingFormatHeader('groups'),
    { label: 'C46 — подготовка к обучению, ч', expression: String(c46), value: c46 },
    { label: 'F49 — групп обучения (всего)', expression: String(f49), value: f49 },
    { label: 'G49 — в т.ч. групп в регионах', expression: String(g49), value: g49 },
    { label: 'D49 — часов на группу админов', expression: String(d49), value: d49 },
    { label: 'F49×D49 — из параметров (стр. 49)', expression: `${f49}×${d49}`, value: r84_row49_fd },
    {
      label: 'C46 + F49×D49',
      expression: `${c46} + ${f49} × ${d49}`,
      value: trainingHours,
    },
    { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
    {
      label: '(C46 + F49×D49) × C32',
      expression: `${trainingHours} × ${c32}`,
      value: core,
    },
    {
      label: 'H49 — дней командировок (из параметров)',
      expression: String(h49),
      value: h49,
    },
    { label: 'C50 — стоимость дня командировки, ₽', expression: String(c50), value: c50 },
    { label: 'H49 × C50', expression: `${h49} × ${c50}`, value: travel },
    { label: 'Итого', expression: `${core} + ${travel}`, value: total },
  ];

  return finishBase(total, steps, R84_FORMULA, core, travel);
}

function computeR85(inputs: PhaseCalcInputs): PhaseBaseResult {
  const {
    f47, f48, h47, h48, d47, d48, c32, c50,
    r85_row47_fd, r85_row48_fd, training_row47, training_row48,
  } = inputs;

  let core = 0;
  let travel = 0;
  const steps: PhaseBaseStep[] = [];
  const bothGroups = training_row47.format === 'groups' && training_row48.format === 'groups';
  const formula = bothGroups ? R85_FORMULA : R85_FORMULA_MIXED;

  function addRow47() {
    steps.push({ kind: 'header', label: 'Строка 47 — пользователи', expression: '', value: 0 });
    steps.push(trainingFormatHeader(training_row47.format));
    if (training_row47.format === 'webinar') {
      const { core: rowCore, steps: wSteps } = webinarCostSteps(
        'Строка 47',
        training_row47.webinarCount,
        training_row47.webinarReserve,
        c32,
      );
      core += rowCore;
      steps.push(...wSteps);
      return;
    }
    steps.push(
      { label: 'F47 — групп обучения', expression: String(f47), value: f47 },
      { label: 'D47 — часов на группу', expression: String(d47), value: d47 },
      { label: 'F47×D47', expression: `${f47}×${d47}`, value: r85_row47_fd },
      { label: 'F47×D47 × C32', expression: `${r85_row47_fd} × ${c32}`, value: r85_row47_fd * c32 },
      { label: 'H47 — дней командировок', expression: String(h47), value: h47 },
      { label: 'H47 × C50', expression: `${h47} × ${c50}`, value: h47 * c50 },
    );
    core += r85_row47_fd * c32;
    travel += h47 * c50;
  }

  function addRow48() {
    steps.push({ kind: 'header', label: 'Строка 48 — исполнители', expression: '', value: 0 });
    steps.push(trainingFormatHeader(training_row48.format));
    if (training_row48.format === 'webinar') {
      const { core: rowCore, steps: wSteps } = webinarCostSteps(
        'Строка 48',
        training_row48.webinarCount,
        training_row48.webinarReserve,
        c32,
      );
      core += rowCore;
      steps.push(...wSteps);
      return;
    }
    steps.push(
      { label: 'F48 — групп обучения', expression: String(f48), value: f48 },
      { label: 'D48 — часов на группу', expression: String(d48), value: d48 },
      { label: 'F48×D48', expression: `${f48}×${d48}`, value: r85_row48_fd },
      { label: 'F48×D48 × C32', expression: `${r85_row48_fd} × ${c32}`, value: r85_row48_fd * c32 },
      { label: 'H48 — дней командировок', expression: String(h48), value: h48 },
      { label: 'H48 × C50', expression: `${h48} × ${c50}`, value: h48 * c50 },
    );
    core += r85_row48_fd * c32;
    travel += h48 * c50;
  }

  addRow47();
  addRow48();
  const total = core + travel;
  steps.push(
    { kind: 'header', label: 'Итого', expression: '', value: 0 },
    { label: 'Стоимость обучения', expression: String(core), value: core },
    { label: 'Командировки', expression: String(travel), value: travel },
    { label: 'Итого', expression: `${core} + ${travel}`, value: total },
  );

  return finishBase(total, steps, formula, core, travel);
}

function computeR86(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c5, c6, c67, c68, c65, c32, e5, e7, c50, projectTypeCode } = inputs;
  const isCase = isCaseProjectType(projectTypeCode);

  if (isCase) {
    const fixedPart = c65 * c32;
    const travel = e7 * c50;
    const total = fixedPart + travel;
    const c65Expr = `700 000 / ${c32}`;

    const steps: PhaseBaseStep[] = [
      { label: 'C65 — экв. часов ввода в ОЭ (Кейс)', expression: c65Expr, value: c65 },
      { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
      { label: 'C65 × C32', expression: `${c65} × ${c32} = 700 000`, value: fixedPart },
      { label: 'E7 — РГ в регионах', expression: String(e7), value: e7 },
      { label: 'C50 — стоимость дня командировки, ₽', expression: String(c50), value: c50 },
      { label: 'E7 × C50', expression: `${e7} × ${c50}`, value: travel },
      { label: 'Итого', expression: `${fixedPart} + ${travel}`, value: total },
    ];
    return finishBase(total, steps, R86_FORMULA_CASE, fixedPart, travel);
  }

  const headcountPart = (c5 * c67 + c6 * c68) * 0.5;
  const core = (headcountPart + c65) * c32;
  const travel = e5 * c50;
  const total = core + travel;

  const steps: PhaseBaseStep[] = [
    { label: 'C5 — РП/РПО', expression: String(c5), value: c5 },
    { label: 'C67 — коэфф. ОПЭ РП/РПО', expression: String(c67), value: c67 },
    { label: 'C6 — исполнители', expression: String(c6), value: c6 },
    { label: 'C68 — коэфф. ОПЭ исполнитель', expression: String(c68), value: c68 },
    {
      label: '(C5×C67 + C6×C68) × 0.5',
      expression: `(${c5}×${c67} + ${c6}×${c68}) × 0.5`,
      value: headcountPart,
    },
    { label: 'C65 — часы ввода в ОЭ', expression: String(c65), value: c65 },
    {
      label: '(… + C65) × C32',
      expression: `(${headcountPart} + ${c65}) × ${c32}`,
      value: core,
    },
    { label: 'E5 — РП/РПО в регионах', expression: String(e5), value: e5 },
    { label: 'C50 — стоимость дня командировки, ₽', expression: String(c50), value: c50 },
    { label: 'E5 × C50', expression: `${e5} × ${c50}`, value: travel },
    { label: 'Итого', expression: `${core} + ${travel}`, value: total },
  ];

  return finishBase(total, steps, R86_FORMULA_PROF, core, travel);
}

function computeR87(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c5, c6, c67, c68, c66, c32, e5, c50, projectTypeCode } = inputs;
  const isCase = isCaseProjectType(projectTypeCode);

  if (isCase) {
    const total = c66 * c32;
    const c66Expr = `200 000 / ${c32}`;
    const steps: PhaseBaseStep[] = [
      { label: 'C66 — экв. часов поддержки ОЭ (Кейс)', expression: c66Expr, value: c66 },
      { label: 'C32 — ставка очереди, ₽/ч', expression: String(c32), value: c32 },
      { label: 'C66 × C32', expression: `${c66} × ${c32} = 200 000`, value: total },
      { label: 'Итого', expression: '200 000', value: total },
    ];
    return { total, steps, formula: R87_FORMULA_CASE };
  }

  const headcountPart = (c5 * c67 + c6 * c68) * 0.5;
  const core = (headcountPart + c66) * c32;
  const travel = e5 * c50;
  const total = core + travel;

  const steps: PhaseBaseStep[] = [
    { label: 'C5 — РП/РПО', expression: String(c5), value: c5 },
    { label: 'C67 — коэфф. ОПЭ РП/РПО', expression: String(c67), value: c67 },
    { label: 'C6 — исполнители', expression: String(c6), value: c6 },
    { label: 'C68 — коэфф. ОПЭ исполнитель', expression: String(c68), value: c68 },
    {
      label: '(C5×C67 + C6×C68) × 0.5',
      expression: `(${c5}×${c67} + ${c6}×${c68}) × 0.5`,
      value: headcountPart,
    },
    { label: 'C66 — часы поддержки ОЭ', expression: String(c66), value: c66 },
    {
      label: '(… + C66) × C32',
      expression: `(${headcountPart} + ${c66}) × ${c32}`,
      value: core,
    },
    { label: 'E5 — РП/РПО в регионах', expression: String(e5), value: e5 },
    { label: 'C50 — стоимость дня командировки, ₽', expression: String(c50), value: c50 },
    { label: 'E5 × C50', expression: `${e5} × ${c50}`, value: travel },
    { label: 'Итого', expression: `${core} + ${travel}`, value: total },
  ];

  return finishBase(total, steps, R87_FORMULA_PROF, core, travel);
}

function computeR88(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c88 } = inputs;
  const steps: PhaseBaseStep[] = [
    { label: 'C88 — документация ИБ, ₽', expression: String(c88), value: c88 },
    { label: 'Итого', expression: String(c88), value: c88 },
  ];
  return { total: c88, steps, formula: R88_FORMULA };
}

function computeR89(inputs: PhaseCalcInputs): PhaseBaseResult {
  const r81 = computeR81(inputs);
  const autoC81 = r81.total ?? 0;
  const total = inputs.c89;
  const isManual = total !== autoC81;

  const steps: PhaseBaseStep[] = isManual
    ? [
      {
        label: 'C81 — стоимость РД (фаза 5.1), авто',
        expression: `${r81.formula} = ${autoC81}`,
        value: autoC81,
      },
      {
        label: 'C89 — передача на сервис (ручная корректировка)',
        expression: String(total),
        value: total,
      },
    ]
    : [
      {
        label: 'C81 — стоимость РД (фаза 5.1)',
        expression: `${r81.formula} = ${total}`,
        value: total,
      },
    ];

  if (!isManual) {
    const r81Detail = [...r81.steps].reverse().find(s => s.label !== 'Итого' && s.kind !== 'header');
    if (r81Detail) {
      steps.push({
        label: `r81: ${r81Detail.label}`,
        expression: r81Detail.expression,
        value: r81Detail.value,
      });
    }
  }

  steps.push({ label: 'Итого', expression: String(total), value: total });
  return { total, steps, formula: isManual ? 'C89 (ручная)' : R89_FORMULA };
}

function computeR90(inputs: PhaseCalcInputs): PhaseBaseResult {
  const { c90 } = inputs;
  const steps: PhaseBaseStep[] = [
    { label: 'C90 — сопровождение БД (1 год), ₽', expression: String(c90), value: c90 },
    { label: 'Итого', expression: String(c90), value: c90 },
  ];
  return { total: c90, steps, formula: R90_FORMULA };
}

export function computePhaseBase(
  lineId: string,
  inputs: PhaseCalcInputs,
  formulaStub?: string,
): PhaseBaseResult {
  if (lineId === 'r74') return computeR74(inputs);
  if (lineId === 'r75') return computeR75(inputs);
  if (lineId === 'r76') return computeR76(inputs);
  if (lineId === 'r77') return computeR77(inputs);
  if (lineId === 'r78') return computeR78(inputs);
  if (lineId === 'r79') return computeR79(inputs);
  if (lineId === 'r80') return computeR80(inputs);
  if (lineId === 'r81') return computeR81(inputs);
  if (lineId === 'r82') return computeR82(inputs);
  if (lineId === 'r83') return computeR83(inputs);
  if (lineId === 'r84') return computeR84(inputs);
  if (lineId === 'r85') return computeR85(inputs);
  if (lineId === 'r86') return computeR86(inputs);
  if (lineId === 'r87') return computeR87(inputs);
  if (lineId === 'r88') return computeR88(inputs);
  if (lineId === 'r89') return computeR89(inputs);
  if (lineId === 'r90') return computeR90(inputs);
  return {
    total: null,
    steps: [],
    formula: formulaStub ?? '—',
  };
}

export function computeAllPhaseBases(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
): Record<string, PhaseBaseResult> {
  const inputs = buildPhaseCalcInputs(queue, assessment, fsItems);
  const result: Record<string, PhaseBaseResult> = {};
  for (const def of assessment.phase_calc_defs ?? []) {
    result[def.id] = computePhaseBase(def.id, inputs, def.c_formula_stub);
  }
  return result;
}

export function computeAutoC89FromR81(
  queue: FsQueueKey,
  assessment: BriefingAssessment,
  fsItems: BriefingFsSel[],
): number {
  const inputs = buildPhaseCalcInputs(queue, assessment, fsItems);
  return computeR81(inputs).total ?? 0;
}
