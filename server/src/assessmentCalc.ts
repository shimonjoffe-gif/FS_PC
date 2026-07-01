import { db } from './db';
import { FS_QUEUE_KEYS, FsQueueKey, parseQueuesJson, anyQueueEnabled } from './fsQueues';
import { loadFsSelections } from './briefingCalc';
import {
  SELLER_CRITERIA_DEFS,
  criteriaFlag,
  computeCriteriaSpAuto,
  ensureContractParams,
  computeAdvanceDeferralOk,
  type SellerCriteria,
  type SellerCriteriaKey,
} from './sellerCriteria';

export interface ComputeRisksContext {
  projectTypeCode?: string | null;
  phaseRiskRatio?: number;
}

export { SELLER_CRITERIA_DEFS, computeCriteriaSpAuto };
export type { SellerCriteria, SellerCriteriaKey };

export const HEADCOUNT_CATEGORIES = ['до 200', '201-500', '501-1000', '1001+'] as const;
export type HeadcountCategory = typeof HEADCOUNT_CATEGORIES[number];

export interface RisksC51C57 {
  c52_rpo: number;
  c53_company_fund: number;
  c54_contract_rpo: number;
  c55_contract_fund: number;
  c56_sales_comp: number;
  c57_rk: number;
}

export interface OrgVolumeBreakdownRow {
  id: string;
  label: string;
  users: number | null;
  rp_rpo?: number | null;
  executors?: number | null;
  rg?: number | null;
  rg_regions?: number | null;
  branches?: OrgVolumeBreakdownRow[];
}

export interface QueueOrgVolume {
  users: number;
  rp_rpo: number | null;
  executors: number | null;
  rg: number;
  rg_regions: number;
  functional_sp: number;
  integrations_sp: number;
  nmd_sp: number;
  load_test_scenarios: number;
  region: string;
  active: boolean;
  breakdown?: OrgVolumeBreakdownRow[];
}

export interface OrgVolumeData {
  queues: Record<FsQueueKey, QueueOrgVolume>;
  headcount_category: HeadcountCategory;
}

export interface HeadcountCoeffs {
  c62: string;
  c63: number;
  c64: number;
  c67: number;
  c68: number;
}

export interface ProjectTypeRow {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  is_active: number;
  base_type_id: number | null;
}

const FUNC_TYPE_MAP: Record<string, string> = {
  'Кейс-проект': 'CASE',
  'Проф/мини': 'PROF_MINI',
  'ПРОФ-проект': 'PROF',
  'КОРП-проект': 'KORP',
  'Базовый': 'CASE',
  'Проф': 'PROF_MINI',
  'Экспертный': 'PROF',
};

export function headcountToCategory(n: number): HeadcountCategory {
  if (n <= 200) return 'до 200';
  if (n <= 500) return '201-500';
  if (n <= 1000) return '501-1000';
  return '1001+';
}

function spByFuncType(briefingId: number): Record<string, number> {
  const items = loadFsSelections(briefingId);
  const totals: Record<string, number> = { CASE: 0, PROF_MINI: 0, PROF: 0, KORP: 0, NMD: 0 };
  for (const item of items) {
    const queues = parseQueuesJson(item.queues_json);
    if (!anyQueueEnabled(queues)) continue;
    const sp = item.story_points ?? 0;
    const code = FUNC_TYPE_MAP[item.func_type ?? ''] ?? 'CASE';
    totals[code] = (totals[code] ?? 0) + sp;
    if (item.name?.toLowerCase().includes('нмд') || item.func_type?.includes('НМД')) {
      totals.NMD += sp;
    }
  }
  return totals;
}

export function computeAutoProjectType(briefingId: number, criteria: SellerCriteria): ProjectTypeRow | null {
  const briefing = db.prepare(`SELECT headcount FROM briefings WHERE id=?`).get(briefingId) as {
    headcount: number | null;
  } | undefined;
  const headcount = briefing?.headcount ?? 0;
  const sp = spByFuncType(briefingId);

  const orgAuto = computeOrgVolume(briefingId, {});
  const users = Math.max(
    headcount,
    ...FS_QUEUE_KEYS.map(q => orgAuto.queues[q].users),
  );
  const rpRpo = Math.max(...FS_QUEUE_KEYS.map(q => orgAuto.queues[q].rp_rpo ?? 0));

  const isKorp =
    sp.KORP > 0
    || headcount >= 1001
    || criteriaFlag(criteria, 'gost_customer_tech')
    || users > 500
    || criteriaFlag(criteria, 'methodology')
    || sp.NMD > 0
    || criteriaFlag(criteria, 'bp_optimization')
    || criteriaFlag(criteria, 'ib_requirements');

  const isProf =
    sp.PROF > 0
    || criteriaFlag(criteria, 'non_standard_docs')
    || criteriaFlag(criteria, 'bp_description')
    || users > 200
    || rpRpo > 20
    || criteriaFlag(criteria, 'load_testing');

  let code = 'CASE';
  if (isKorp) code = 'KORP';
  else if (isProf) code = 'PROF';
  else if (sp.PROF_MINI > 0) code = 'PROF_MINI';

  return db.prepare(`SELECT * FROM project_types WHERE code=? AND is_active=1`).get(code) as ProjectTypeRow | null;
}

export function computeRisks(criteria: SellerCriteria, ctx: ComputeRisksContext = {}): RisksC51C57 {
  const params = ensureContractParams(criteria.contract_params);
  const phaseRatio = ctx.phaseRiskRatio ?? 1;

  const c52 = 0.2;
  const c56 = 0.01;
  const c57 = 0.2;

  let c54 = 0;
  if (!criteriaFlag(criteria, 'confidential_stamped_only')) c54 += 0.10;
  if (!criteriaFlag(criteria, 'liability_cap_10pct')) c54 += 0.05;
  if (!criteriaFlag(criteria, 'sok_liability_cap_10pct')) c54 += 0.20;

  let c55 = 0;
  if (!criteriaFlag(criteria, 'rid_holder_executor')) {
    const base = params.pm_version === 'PM5' ? 0.50 : 0.15;
    c55 += base * phaseRatio;
  }
  if (!criteriaFlag(criteria, 'review_signoff')) c55 += 0.10;

  if (!computeAdvanceDeferralOk(params)) {
    const code = ctx.projectTypeCode ?? '';
    const isProfOrKorp = code === 'PROF' || code === 'KORP';
    if (isProfOrKorp && params.advance_pct < 0.30 && params.payment_deferral_days <= 10) {
      const e55 = params.max_stage_duration_days ?? 100;
      c55 += 0.02 * (e55 / 20);
    } else {
      c55 += 0.10;
    }
  }

  const c53 = computeCompanyFundC53(c52, c54, c57, c56);

  return { c52_rpo: c52, c53_company_fund: c53, c54_contract_rpo: c54, c55_contract_fund: c55, c56_sales_comp: c56, c57_rk: c57 };
}

/** C51 = SUM(C52:C57) — итог резервов и рисков (C53 уже MAX-подитог). */
export function computeRisksTotalC51(risks: RisksC51C57): number {
  return risks.c52_rpo
    + risks.c53_company_fund
    + risks.c54_contract_rpo
    + risks.c55_contract_fund
    + risks.c56_sales_comp
    + risks.c57_rk;
}

export type RisksManualKeys = Partial<Record<keyof RisksC51C57, boolean>>;

export const LEGACY_MANUAL_RISK_KEYS: (keyof RisksC51C57)[] = [
  'c52_rpo', 'c56_sales_comp', 'c57_rk',
];

export const C53_DRIVER_KEYS: (keyof RisksC51C57)[] = [
  'c52_rpo', 'c54_contract_rpo', 'c56_sales_comp', 'c57_rk',
];

export function computeCompanyFundC53(
  rpoReserve: number,
  rpoRisks: number,
  companyReserve: number,
  salesComp: number,
): number {
  return Math.max(rpoReserve + rpoRisks, companyReserve + salesComp);
}

export function isRiskKeyManual(
  key: keyof RisksC51C57,
  manualKeys: RisksManualKeys,
  legacyManual: boolean,
  storedRisks: Partial<RisksC51C57>,
): boolean {
  if (manualKeys[key]) return true;
  if (legacyManual && LEGACY_MANUAL_RISK_KEYS.includes(key) && storedRisks[key] != null) return true;
  return false;
}

export function hasAnyManualRiskKeys(
  manualKeys: RisksManualKeys,
  legacyManual: boolean,
): boolean {
  if (legacyManual) return true;
  return Object.values(manualKeys).some(Boolean);
}

export function migrateLegacyRisksToSides(
  legacyRisks: Partial<RisksC51C57>,
  legacyManualKeys: RisksManualKeys,
  legacyManual: boolean,
  storedOt: Partial<RisksC51C57>,
  storedDo: Partial<RisksC51C57>,
  manualKeysOt: RisksManualKeys,
  manualKeysDo: RisksManualKeys,
  manualOt: boolean,
  manualDo: boolean,
): {
  storedOt: Partial<RisksC51C57>;
  storedDo: Partial<RisksC51C57>;
  manualKeysOt: RisksManualKeys;
  manualKeysDo: RisksManualKeys;
  manualOt: boolean;
  manualDo: boolean;
} {
  const legacyHasData =
    Object.keys(legacyRisks).length > 0
    || legacyManual
    || Object.values(legacyManualKeys).some(Boolean);

  let ot = storedOt;
  let doSide = storedDo;
  let mkOt = manualKeysOt;
  let mkDo = manualKeysDo;
  let mOt = manualOt;
  let mDo = manualDo;

  if (Object.keys(ot).length === 0 && Object.keys(doSide).length === 0 && legacyHasData) {
    ot = { ...legacyRisks };
    doSide = { ...legacyRisks };
  }
  if (
    Object.keys(mkOt).length === 0
    && Object.keys(mkDo).length === 0
    && legacyHasData
  ) {
    mkOt = { ...legacyManualKeys };
    mkDo = { ...legacyManualKeys };
  }
  if (!mOt && !mDo && legacyManual) {
    mOt = true;
    mDo = true;
  }

  return {
    storedOt: ot,
    storedDo: doSide,
    manualKeysOt: mkOt,
    manualKeysDo: mkDo,
    manualOt: mOt || hasAnyManualRiskKeys(mkOt, false),
    manualDo: mDo || hasAnyManualRiskKeys(mkDo, false),
  };
}

export function mergeEffectiveRisks(
  autoRisks: RisksC51C57,
  storedRisks: Partial<RisksC51C57>,
  manualKeys: RisksManualKeys,
  legacyManual = false,
): RisksC51C57 {
  const pick = (key: keyof RisksC51C57): number => {
    if (isRiskKeyManual(key, manualKeys, legacyManual, storedRisks) && storedRisks[key] != null) {
      return storedRisks[key] as number;
    }
    return autoRisks[key];
  };

  const c52 = pick('c52_rpo');
  const c54 = pick('c54_contract_rpo');
  const c55 = pick('c55_contract_fund');
  const c56 = pick('c56_sales_comp');
  const c57 = pick('c57_rk');
  const c53 = isRiskKeyManual('c53_company_fund', manualKeys, legacyManual, storedRisks)
    && storedRisks.c53_company_fund != null
    ? storedRisks.c53_company_fund
    : computeCompanyFundC53(c52, c54, c57, c56);

  return {
    c52_rpo: c52,
    c53_company_fund: c53,
    c54_contract_rpo: c54,
    c55_contract_fund: c55,
    c56_sales_comp: c56,
    c57_rk: c57,
  };
}

function defaultQueueVolume(headcount: number, active: boolean, q: FsQueueKey): QueueOrgVolume {
  const users = headcount > 0 ? headcount : 30;
  // TODO: from FS import — dev defaults for C21/D20 until FS fills these columns
  const DEV_TEST_INTEGRATIONS_SP: Record<FsQueueKey, number> = { '1': 3, '2': 2, '3': 1, '4': 0 };
  const DEV_TEST_NMD_SP: Record<FsQueueKey, number> = { '1': 2, '2': 1, '3': 0, '4': 0 };
  return {
    users,
    rp_rpo: null,
    executors: null,
    rg: Math.max(1, Math.ceil(users * 0.05)),
    rg_regions: 0,
    functional_sp: 0,
    integrations_sp: 0,
    nmd_sp: 0,
    load_test_scenarios: 0,
    region: 'СПб/МСК',
    active,
  };
}

export function computeOrgVolume(briefingId: number, stored: Partial<OrgVolumeData>): OrgVolumeData {
  const briefing = db.prepare(`SELECT headcount FROM briefings WHERE id=?`).get(briefingId) as {
    headcount: number | null;
  } | undefined;
  const headcount = briefing?.headcount ?? 30;
  const fsItems = loadFsSelections(briefingId);

  const activeQueues = new Set<FsQueueKey>();
  for (const item of fsItems) {
    const queues = parseQueuesJson(item.queues_json);
    for (const q of FS_QUEUE_KEYS) {
      if (queues[q] === 1) activeQueues.add(q);
    }
  }
  if (activeQueues.size === 0) activeQueues.add('1');

  const queues = {} as Record<FsQueueKey, QueueOrgVolume>;
  for (const q of FS_QUEUE_KEYS) {
    const active = activeQueues.has(q);
    const storedQ = stored.queues?.[q];
    const base = defaultQueueVolume(headcount, active, q);
    queues[q] = storedQ ? { ...base, ...storedQ, active } : base;
  }

  const maxUsers = Math.max(headcount, ...FS_QUEUE_KEYS.map(q => queues[q].users));
  const category = headcountToCategory(maxUsers);

  return { queues, headcount_category: category };
}

export function resolveProjectTypeId(typeId: number | null): number | null {
  if (!typeId) return null;
  const row = db.prepare(`SELECT id, base_type_id FROM project_types WHERE id=?`).get(typeId) as {
    id: number; base_type_id: number | null;
  } | undefined;
  if (!row) return null;
  return row.base_type_id ?? row.id;
}

export function getHourlyRateForType(typeId: number | null): number {
  const resolved = resolveProjectTypeId(typeId);
  if (!resolved) return 5000;
  const rate = db.prepare(`
    SELECT hourly_rate FROM project_type_rates
    WHERE project_type_id=?
    ORDER BY valid_from DESC LIMIT 1
  `).get(resolved) as { hourly_rate: number } | undefined;
  return rate?.hourly_rate ?? 5000;
}

export function getHeadcountCoeffs(typeId: number | null, category: string): HeadcountCoeffs {
  const resolved = resolveProjectTypeId(typeId);
  const defaults: HeadcountCoeffs = { c62: category, c63: 1, c64: 1, c67: 6, c68: 1 };
  if (!resolved) return defaults;

  const row = db.prepare(`
    SELECT category, c63, c64, c67, c68 FROM headcount_coefficients
    WHERE project_type_id=? AND category=?
  `).get(resolved, category) as { category: string; c63: number; c64: number; c67: number; c68: number } | undefined;

  if (!row) return defaults;
  return { c62: row.category, c63: row.c63, c64: row.c64, c67: row.c67, c68: row.c68 };
}

export interface QueueRateRow {
  queue: string;
  rate: number;
  nsi_rate: number;
}

export function getQueueRateValue(qc: Pick<QueueRateRow, 'rate' | 'nsi_rate'>): number {
  return qc.rate ?? qc.nsi_rate;
}

export function computeMaxQueueRate(
  queueCalcs: QueueRateRow[],
  activeQueues?: Iterable<string>,
): number {
  let rows = queueCalcs;
  if (activeQueues) {
    const active = new Set(activeQueues);
    const filtered = queueCalcs.filter(q => active.has(q.queue));
    if (filtered.length > 0) rows = filtered;
  }
  if (rows.length === 0) return 0;
  return Math.max(...rows.map(getQueueRateValue));
}

export function computeAutoUnifiedRate(queueCalcs: QueueRateRow[]): number {
  return computeMaxQueueRate(queueCalcs);
}

export function getEffectiveQueueRate(
  qc: Pick<QueueRateRow, 'rate' | 'nsi_rate'>,
  unifiedEnabled: boolean,
  unifiedRate: number | null | undefined,
): number {
  if (unifiedEnabled && unifiedRate != null) return unifiedRate;
  return getQueueRateValue(qc);
}

export function technologyForType(typeCode: string | null): string {
  switch (typeCode) {
    case 'KORP': return 'КОРП-проект';
    case 'PROF': return 'ПРОФ-проект';
    case 'PROF_MINI': return 'Проф/мини';
    case 'BZ': return 'Быстрый запуск';
    default: return 'Кейс-проект';
  }
}

function normalizeQueueTechnologyLabel(label: string): string {
  if (label === 'БЗ') return 'Быстрый запуск';
  return label;
}

export function typeCodeForTechnologyLabel(label: string): string {
  switch (normalizeQueueTechnologyLabel(label)) {
    case 'КОРП-проект': return 'KORP';
    case 'ПРОФ-проект': return 'PROF';
    case 'Проф/мини': return 'PROF_MINI';
    case 'Быстрый запуск': return 'BZ';
    default: return 'CASE';
  }
}

export function getHourlyRateForTechnologyLabel(technology: string): number {
  const code = typeCodeForTechnologyLabel(technology);
  const row = db.prepare(`
    SELECT ptr.hourly_rate FROM project_types pt
    JOIN project_type_rates ptr ON ptr.project_type_id = pt.id
    WHERE pt.code = ? AND pt.is_active = 1
    ORDER BY ptr.valid_from DESC LIMIT 1
  `).get(code) as { hourly_rate: number } | undefined;
  return row?.hourly_rate ?? 5000;
}

export function seedProjectTypesNsi() {
  const count = (db.prepare(`SELECT COUNT(*) as cnt FROM project_types`).get() as { cnt: number }).cnt;
  if (count > 0) return;

  const insType = db.prepare(`
    INSERT INTO project_types(code, name, sort_order, is_active, base_type_id) VALUES (?,?,?,1,NULL)
  `);
  const insRate = db.prepare(`INSERT INTO project_type_rates(project_type_id, hourly_rate, valid_from) VALUES (?,?,?)`);
  const insCoeff = db.prepare(`
    INSERT INTO headcount_coefficients(project_type_id, category, c63, c64, c67, c68) VALUES (?,?,?,?,?,?)
  `);

  const coeffs: [string, number, number, number, number][] = [
    ['до 200', 1, 1, 6, 1],
    ['201-500', 1.5, 1, 6, 1],
    ['501-1000', 2, 1.5, 8, 1],
    ['1001+', 3, 2, 8, 1],
  ];

  const types: [string, string, number, number][] = [
    ['CASE', 'Кейс', 1, 5000],
    ['PROF_MINI', 'Проф-мини', 2, 5000],
    ['PROF', 'ПРОФ', 3, 5500],
    ['KORP', 'КОРП', 4, 6500],
  ];

  const typeIds: Record<string, number> = {};
  for (const [code, name, sort, rate] of types) {
    const id = Number(insType.run(code, name, sort).lastInsertRowid);
    typeIds[code] = id;
    insRate.run(id, rate, '2020-01-01');
    for (const [cat, c63, c64, c67, c68] of coeffs) {
      insCoeff.run(id, cat, c63, c64, c67, c68);
    }
  }

  const bzId = Number(insType.run('BZ', 'БЗ', 5).lastInsertRowid);
  db.prepare(`UPDATE project_types SET base_type_id=? WHERE id=?`).run(typeIds.CASE, bzId);
  insRate.run(bzId, 5000, '2020-01-01');
  for (const [cat, c63, c64, c67, c68] of coeffs) {
    insCoeff.run(bzId, cat, c63, c64, c67, c68);
  }

  console.log('✓ Project types NSI seeded');
}
