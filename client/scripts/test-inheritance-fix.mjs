import {
  mergePhaseCalcParams,
  mergeIncomingPhaseCalcParams,
  patchQueuePhaseParam,
  effectivePhaseCalcParamsForQueue,
  isPhaseCalcParamQueueSpecific,
} from '../src/phaseCalcParams.ts';

function applyPatch(base, patch, omit) {
  const b = { ...base };
  if (omit) for (const k of omit) delete b[k];
  const merged = mergeIncomingPhaseCalcParams(b, patch);
  for (const key of Object.keys(b)) if (!(key in merged)) delete b[key];
  Object.assign(b, merged);
  return mergePhaseCalcParams(b);
}

let stored = mergePhaseCalcParams({});
stored = applyPatch(stored, patchQueuePhaseParam(stored, '1', 'c41_db_install_hours', 99));
console.log('Q2 after Q1=99:', effectivePhaseCalcParamsForQueue('2', stored).c41_db_install_hours);

stored = mergePhaseCalcParams({
  queue_values: {
    queues: {
      '2': { c37_requirements_hours_per_fe: 2.5 },
    },
  },
  queue_auto_overrides: {
    queues: { '2': { params: { c37_requirements_hours_per_fe: true } } },
  },
});
console.log('Before Q1 edit with stale auto:', effectivePhaseCalcParamsForQueue('2', stored).c37_requirements_hours_per_fe);
stored = applyPatch(stored, patchQueuePhaseParam(stored, '1', 'c37_requirements_hours_per_fe', 6));
console.log('After Q1=6 with stale auto:', effectivePhaseCalcParamsForQueue('2', stored).c37_requirements_hours_per_fe);

stored = applyPatch(stored, patchQueuePhaseParam(stored, '2', 'c41_db_install_hours', 77));
console.log('Q2 specific:', isPhaseCalcParamQueueSpecific('2', 'c41_db_install_hours', stored));
console.log('Q2 value:', effectivePhaseCalcParamsForQueue('2', stored).c41_db_install_hours);
