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
const p1 = patchQueuePhaseParam(stored, '1', 'c41_db_install_hours', 99);
console.log('p1 keys:', Object.keys(p1));
console.log('p1 queue_values:', JSON.stringify(p1.queue_values));
stored = applyPatch(stored, p1);
console.log('stored queue_values:', JSON.stringify(stored.queue_values));
console.log('Q2:', effectivePhaseCalcParamsForQueue('2', stored).c41_db_install_hours);

const p2 = patchQueuePhaseParam(stored, '2', 'c41_db_install_hours', 77);
console.log('p2 explicit:', JSON.stringify(p2.queue_explicit_overrides));
stored = applyPatch(stored, p2);
console.log('Q2 specific:', isPhaseCalcParamQueueSpecific('2', 'c41_db_install_hours', stored));
