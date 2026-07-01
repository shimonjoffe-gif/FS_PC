import { db } from './db';
import { FS_QUEUE_KEYS } from './fsQueues';
import {
  computeAutoProjectType,
  computeAutoUnifiedRate,
  getEffectiveQueueRate,
  getHourlyRateForTechnologyLabel,
  technologyForType,
  type QueueRateRow,
} from './assessmentCalc';
import { parseSellerCriteria } from './sellerCriteria';

function parseJson<T>(raw: string | T | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function ensureAssessmentRow(briefingId: number) {
  const exists = db.prepare(`SELECT briefing_id FROM briefing_assessment WHERE briefing_id=?`).get(briefingId);
  if (!exists) {
    db.prepare(`INSERT INTO briefing_assessment(briefing_id) VALUES (?)`).run(briefingId);
  }
}

export interface BriefingQueueRates {
  queueCalcs: QueueRateRow[];
  unifiedRateEnabled: boolean;
  unifiedRate: number;
}

export function loadBriefingQueueRates(briefingId: number): BriefingQueueRates {
  ensureAssessmentRow(briefingId);
  const row = db.prepare(`SELECT * FROM briefing_assessment WHERE briefing_id=?`).get(briefingId) as {
    criteria_json: string;
    project_type_id: number | null;
    project_type_manual: number;
    unified_rate_enabled: number | null;
    unified_rate: number | null;
    unified_rate_manual: number | null;
  };

  const criteria = parseSellerCriteria(parseJson(row.criteria_json, {}));
  const autoType = computeAutoProjectType(briefingId, criteria);

  const effectiveTypeId = row.project_type_manual && row.project_type_id
    ? row.project_type_id
    : autoType?.id ?? row.project_type_id ?? autoType?.id ?? null;

  const autoTechnology = technologyForType(autoType?.code ?? null);

  const queueCalcs: QueueRateRow[] = FS_QUEUE_KEYS.map(q => {
    const stored = db.prepare(`
      SELECT technology, rate, rate_manual, technology_manual FROM briefing_queue_calc WHERE briefing_id=? AND queue=?
    `).get(briefingId, q) as {
      technology: string | null;
      rate: number | null;
      rate_manual: number;
      technology_manual: number | null;
    } | undefined;

    const techManual = stored?.technology_manual === 1;
    const rawTechnology = techManual && stored?.technology
      ? stored.technology
      : autoTechnology;
    const technology = rawTechnology === 'БЗ' ? 'Быстрый запуск' : rawTechnology;
    const nsiRate = getHourlyRateForTechnologyLabel(technology);
    const rate = stored?.rate_manual && stored.rate != null ? stored.rate : nsiRate;

    return {
      queue: q,
      rate,
      nsi_rate: nsiRate,
    };
  });

  const unifiedRateEnabled = row.unified_rate_enabled === 1;
  const maxQueueRate = computeAutoUnifiedRate(queueCalcs);
  const unifiedRate = row.unified_rate_manual === 1 && row.unified_rate != null
    ? row.unified_rate
    : maxQueueRate;

  return { queueCalcs, unifiedRateEnabled, unifiedRate };
}

export function effectiveRateForQueue(
  queue: string,
  rates: BriefingQueueRates,
): number {
  const qc = rates.queueCalcs.find(q => q.queue === queue);
  if (!qc) return rates.unifiedRateEnabled ? rates.unifiedRate : 0;
  return getEffectiveQueueRate(qc, rates.unifiedRateEnabled, rates.unifiedRate);
}
