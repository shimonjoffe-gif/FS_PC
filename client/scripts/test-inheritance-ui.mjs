import {
  mergePhaseCalcParams,
  mergeIncomingPhaseCalcParams,
  patchQueuePhaseParam,
  effectivePhaseCalcParamsForQueue,
  isPhaseCalcParamQueueSpecific,
} from '../src/phaseCalcParams.ts';

function applyPatch(assessment, patch, omit) {
  const base = { ...(assessment.phase_calc_params ?? {}) };
  if (omit) for (const k of omit) delete base[k];
  const merged = mergeIncomingPhaseCalcParams(base, patch);
  for (const key of Object.keys(base)) if (!(key in merged)) delete base[key];
  Object.assign(base, merged);
  return { phase_calc_params: mergePhaseCalcParams(base) };
}

// Simulate UI: params is full merged PhaseCalcParams
let assessment = { phase_calc_params: mergePhaseCalcParams({}) };
const params = assessment.phase_calc_params;

const p1 = patchQueuePhaseParam(params, '1', 'c41_db_install_hours', 99);
assessment = applyPatch(assessment, p1);
console.log('Q2 after Q1 edit:', effectivePhaseCalcParamsForQueue('2', assessment.phase_calc_params).c41_db_install_hours);

// Simulate loaded DB with stale per-queue snapshots (no explicit flags)
assessment = {
  phase_calc_params: mergePhaseCalcParams({
    queue_values: {
      queues: {
        '1': { c41_db_install_hours: 32 },
        '2': { c41_db_install_hours: 32 },
        '3': { c41_db_install_hours: 32 },
        '4': { c41_db_install_hours: 32 },
      },
    },
  }),
};
const p1b = patchQueuePhaseParam(assessment.phase_calc_params, '1', 'c41_db_install_hours', 99);
assessment = applyPatch(assessment, p1b);
console.log('Q2 after stale DB + Q1=99:', effectivePhaseCalcParamsForQueue('2', assessment.phase_calc_params).c41_db_install_hours);
console.log('qv:', JSON.stringify(assessment.phase_calc_params.queue_values));

// Simulate Q2 with auto override blocking
assessment = {
  phase_calc_params: mergePhaseCalcParams({
    queue_values: {
      queues: {
        '2': { c37_requirements_hours_per_fe: 2.5 },
      },
    },
    queue_auto_overrides: {
      queues: { '2': { params: { c37_requirements_hours_per_fe: true } } },
    },
  }),
};
const p1c = patchQueuePhaseParam(assessment.phase_calc_params, '1', 'c37_requirements_hours_per_fe', 6);
assessment = applyPatch(assessment, p1c);
console.log('Q2 c37 with auto override on Q2:', effectivePhaseCalcParamsForQueue('2', assessment.phase_calc_params).c37_requirements_hours_per_fe);
