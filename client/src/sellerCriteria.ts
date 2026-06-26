export type ProjectTypeImpact = 'PROF' | 'KORP';
export type CriteriaGroup = 'type' | 'contract';

export interface ContentFieldDef {
  key: string;
  label: string;
  excelRef: string;
}

export interface SellerCriteriaDef {
  key: string;
  label: string;
  group: CriteriaGroup;
  typeImpact?: ProjectTypeImpact;
  excelRow?: number;
  hasFormula: boolean;
  childFields?: ContentFieldDef[];
  allowsCustomRows?: boolean;
}

export const TYPE_CRITERIA_DEFS: SellerCriteriaDef[] = [
  {
    key: 'non_standard_docs',
    label: 'Заказчиком заявлены нестандартные документы и/или шаблоны Заказчика без изменения состава работ по технологии ПРОФ',
    group: 'type',
    typeImpact: 'PROF',
    excelRow: 10,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [
      { key: 'doc_extended_charter', label: 'Расширенный Устав', excelRef: 'C102' },
      { key: 'doc_implementation_concept', label: 'Концепция реализации системы', excelRef: 'C107' },
      { key: 'doc_test_program', label: 'Программа и методика испытаний', excelRef: 'C111' },
      { key: 'doc_admin_manual', label: 'Инструкция Администратора', excelRef: 'C113' },
    ],
  },
  {
    key: 'gost_customer_tech',
    label: 'Заказчиком заявлена документация по ГОСТ и/или работа по технилогии и шаблонам Заказчика',
    group: 'type',
    typeImpact: 'KORP',
    excelRow: 11,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [
      { key: 'doc_gost', label: 'Оформление документации по ГОСТ или внутренним регламентам Заказчика', excelRef: 'D101' },
    ],
  },
  {
    key: 'bp_description',
    label: 'Заказчиком заявлено описание Бизнес-процессов',
    group: 'type',
    typeImpact: 'PROF',
    excelRow: 12,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [
      { key: 'doc_bp_asis', label: 'Описание бизнес-процессов "As-Is"', excelRef: 'C103' },
      { key: 'doc_bp_tobe', label: 'Описание бизнес-процессов "To-Be"', excelRef: 'C104' },
    ],
  },
  {
    key: 'bp_optimization',
    label: 'Заказчиком заявлена оптимизация Бизнес-процессов',
    group: 'type',
    typeImpact: 'KORP',
    excelRow: 13,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [
      { key: 'doc_bp_optimize', label: 'Оптимизация бизнес-процессов "To-Be"', excelRef: 'C105' },
    ],
  },
  {
    key: 'methodology',
    label: 'Заказчиком заявлена методическая проработка',
    group: 'type',
    typeImpact: 'KORP',
    excelRow: 14,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [],
  },
  {
    key: 'load_testing',
    label: 'Заказчиком заявлено Нагрузочное тестирвоание',
    group: 'type',
    typeImpact: 'PROF',
    excelRow: 15,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [
      { key: 'doc_load_testing', label: 'Документация по нагрузочному тестированию', excelRef: 'C115' },
    ],
  },
  {
    key: 'ib_requirements',
    label: 'Заказчиком заявлены требвоания по ИБ',
    group: 'type',
    typeImpact: 'KORP',
    excelRow: 16,
    hasFormula: true,
    allowsCustomRows: true,
    childFields: [
      { key: 'doc_ib', label: 'Документация по Информационной безопасности', excelRef: 'C116' },
      { key: 'ib_attestation', label: 'Аттестация по требованиям ИБ', excelRef: 'B170' },
    ],
  },
];

export const CONTRACT_CRITERIA_DEFS: SellerCriteriaDef[] = [
  {
    key: 'rid_holder_executor',
    label: 'Правообладатель РИД - Исполнитель',
    group: 'contract',
    excelRow: 174,
    hasFormula: false,
  },
  {
    key: 'review_signoff',
    label: 'Предполагается подписание отзыва по завершению проекта',
    group: 'contract',
    excelRow: 175,
    hasFormula: false,
  },
  {
    key: 'confidential_stamped_only',
    label: 'Конфиденциальная информация передается только с Грифом.',
    group: 'contract',
    excelRow: 176,
    hasFormula: false,
  },
  {
    key: 'sok_liability_cap_10pct',
    label: 'В договоре  (СОК) ограничение по возмещению убытков  Конф данных не более 10 % от стоимости договора',
    group: 'contract',
    excelRow: 177,
    hasFormula: false,
  },
  {
    key: 'liability_cap_10pct',
    label: 'В договоре ограничение по возмещению убытков не более 10 % от стоимости договора',
    group: 'contract',
    excelRow: 178,
    hasFormula: false,
  },
];

export const CONTRACT_FORMULA_ROW = {
  key: 'advance_deferral_ok',
  label: 'Аванс, и отсрочка платежа не более 10 р. Дней',
  excelRow: 179,
} as const;

export interface ContractParams {
  pm_version: string;
  advance_pct: number;
  payment_deferral_days: number;
  max_stage_duration_days: number | null;
}

export const DEFAULT_CONTRACT_PARAMS: ContractParams = {
  pm_version: 'PM4',
  advance_pct: 0.5,
  payment_deferral_days: 10,
  max_stage_duration_days: null,
};

function sanitizeContractFraction(n: unknown, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function sanitizeContractDays(n: unknown, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

export function formatAdvancePctDisplay(fraction: number): string {
  if (!Number.isFinite(fraction)) return '';
  return String(Math.round(fraction * 1000) / 10);
}

export function parseAdvancePctInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const pct = Number(trimmed);
  if (!Number.isFinite(pct)) return null;
  return Math.min(1, Math.max(0, pct / 100));
}

export function ensureContractParams(raw?: Partial<ContractParams>): ContractParams {
  const maxStage = raw?.max_stage_duration_days;
  return {
    pm_version: raw?.pm_version?.trim() || DEFAULT_CONTRACT_PARAMS.pm_version,
    advance_pct: sanitizeContractFraction(raw?.advance_pct, DEFAULT_CONTRACT_PARAMS.advance_pct),
    payment_deferral_days: sanitizeContractDays(
      raw?.payment_deferral_days,
      DEFAULT_CONTRACT_PARAMS.payment_deferral_days,
    ),
    max_stage_duration_days: maxStage == null || !Number.isFinite(maxStage)
      ? null
      : Math.max(0, Math.round(maxStage)),
  };
}

export function computeAdvanceDeferralOk(params: ContractParams): boolean {
  return params.advance_pct >= 0.30 && params.payment_deferral_days <= 10;
}

export function contractCriteriaValue(criteria: SellerCriteria, key: string): boolean {
  return criteria[key] !== false;
}

export const SELLER_CRITERIA_DEFS: SellerCriteriaDef[] = [
  ...TYPE_CRITERIA_DEFS,
  ...CONTRACT_CRITERIA_DEFS,
];

export type SellerCriteriaKey = typeof SELLER_CRITERIA_DEFS[number]['key'];
export type ContentSelections = Partial<Record<string, boolean | string>>;

export interface CriteriaChildState {
  rp_value?: boolean;
  op_value?: boolean;
}

export interface CriteriaCustomRow {
  id: string;
  label: string;
  rp_value?: boolean;
  op_value?: boolean;
}

export interface CriteriaGroupState {
  children: Record<string, CriteriaChildState>;
  custom_rows: CriteriaCustomRow[];
  group_rp_override?: boolean | null;
  group_op_override?: boolean | null;
}

export type CriteriaGroups = Partial<Record<string, CriteriaGroupState>>;

export type SellerCriteria = Partial<Record<SellerCriteriaKey, boolean>> & {
  content_selections?: ContentSelections;
  groups?: CriteriaGroups;
  contract_params?: Partial<ContractParams>;
};

const NO_METHODOLOGY = 'Не ожидается методической работы и результатов';

function isDa(value: boolean | string | undefined): boolean {
  if (value === true) return true;
  if (typeof value === 'string') {
    const u = value.trim().toUpperCase();
    return u === 'ДА' || u === 'YES';
  }
  return false;
}

function methodologyActive(content: ContentSelections, key: string): boolean {
  const v = content[key];
  if (v === undefined || v === '' || v === false) return false;
  if (typeof v === 'string' && (v === NO_METHODOLOGY || v.trim() === '')) return false;
  return true;
}

export function emptyGroupState(def?: SellerCriteriaDef): CriteriaGroupState {
  const children: Record<string, CriteriaChildState> = {};
  for (const child of def?.childFields ?? []) {
    children[child.key] = { rp_value: false, op_value: false };
  }
  return { children, custom_rows: [], group_rp_override: null, group_op_override: null };
}

export function ensureCriteriaGroups(criteria: SellerCriteria): CriteriaGroups {
  const groups: CriteriaGroups = { ...(criteria.groups ?? {}) };
  for (const def of TYPE_CRITERIA_DEFS) {
    const existing = groups[def.key];
    if (!existing) {
      groups[def.key] = emptyGroupState(def);
      continue;
    }
    const children = { ...existing.children };
    for (const child of def.childFields ?? []) {
      if (!children[child.key]) {
        children[child.key] = { rp_value: false, op_value: false };
      }
    }
    groups[def.key] = {
      ...emptyGroupState(def),
      ...existing,
      children,
      custom_rows: existing.custom_rows ?? [],
      group_rp_override: existing.group_rp_override ?? null,
      group_op_override: existing.group_op_override ?? null,
    };
  }
  return groups;
}

function childRollupRp(group: CriteriaGroupState): boolean {
  const fromChildren = Object.values(group.children).some(c => c.rp_value === true);
  const fromCustom = group.custom_rows.some(r => r.rp_value === true);
  return fromChildren || fromCustom;
}

function childRollupOp(group: CriteriaGroupState): boolean {
  const fromChildren = Object.values(group.children).some(c => c.op_value === true);
  const fromCustom = group.custom_rows.some(r => r.op_value === true);
  return fromChildren || fromCustom;
}

export function rollupGroupRp(group: CriteriaGroupState): boolean {
  return childRollupRp(group);
}

export function rollupGroupOp(group: CriteriaGroupState): boolean {
  return childRollupOp(group);
}

export function resolveGroupRp(group: CriteriaGroupState): boolean {
  if (group.group_rp_override !== null && group.group_rp_override !== undefined) {
    return group.group_rp_override;
  }
  return childRollupRp(group);
}

export function resolveGroupOp(group: CriteriaGroupState): boolean {
  if (group.group_op_override !== null && group.group_op_override !== undefined) {
    return group.group_op_override;
  }
  return childRollupOp(group);
}

export function isGroupRpOverridden(group: CriteriaGroupState): boolean {
  return group.group_rp_override !== null && group.group_rp_override !== undefined;
}

export function isGroupOpOverridden(group: CriteriaGroupState): boolean {
  return group.group_op_override !== null && group.group_op_override !== undefined;
}

export function hierarchyToContentSelections(groups: CriteriaGroups): ContentSelections {
  const content: ContentSelections = {};
  for (const def of TYPE_CRITERIA_DEFS) {
    const group = groups[def.key];
    if (!group) continue;
    for (const [key, child] of Object.entries(group.children)) {
      if (child.rp_value) content[key] = true;
    }
    group.custom_rows.forEach((row, i) => {
      if (row.rp_value && row.label.trim()) {
        const customKey = `custom_row_${def.key}_${row.id}`;
        content[customKey] = row.label.trim();
        if (def.key === 'gost_customer_tech') {
          content[`custom_methodology_extra_${i + 1}`] = row.label.trim();
        }
        if (def.key === 'methodology') {
          content[`methodology_custom_${row.id}`] = row.label.trim();
        }
      }
    });
  }
  return content;
}

export function computeCriteriaSpAuto(
  content: ContentSelections = {},
  groups?: CriteriaGroups,
): Record<string, boolean> {
  const c = groups ? { ...content, ...hierarchyToContentSelections(groups) } : content;

  const nonStandard =
    isDa(c.doc_extended_charter)
    || isDa(c.doc_implementation_concept)
    || isDa(c.doc_test_program)
    || isDa(c.doc_admin_manual);

  const customMethodologyFromExtras = Object.keys(c).some(k =>
    k.startsWith('custom_methodology_extra_') && methodologyActive(c, k),
  );
  const customMethodologyFromRows = groups?.gost_customer_tech?.custom_rows.some(r =>
    r.rp_value && r.label.trim(),
  ) ?? false;

  const gostCustomer =
    isDa(c.doc_gost) || customMethodologyFromExtras || customMethodologyFromRows;

  const bpDescription = isDa(c.doc_bp_asis) || isDa(c.doc_bp_tobe);
  const bpOptimization = isDa(c.doc_bp_optimize);

  const methodologyFromCustom = Object.keys(c).some(k =>
    k.startsWith('methodology_custom_') && methodologyActive(c, k),
  );
  const methodologyFromRows = groups?.methodology?.custom_rows.some(r =>
    r.rp_value && r.label.trim(),
  ) ?? false;
  const methodologySum = methodologyFromCustom || methodologyFromRows;

  const loadTesting = isDa(c.doc_load_testing);
  const ibRequirements = isDa(c.doc_ib) || isDa(c.ib_attestation);

  return {
    non_standard_docs: nonStandard,
    gost_customer_tech: gostCustomer,
    bp_description: bpDescription,
    bp_optimization: bpOptimization,
    methodology: methodologySum,
    load_testing: loadTesting,
    ib_requirements: ibRequirements,
  };
}

function migrateLegacyToGroups(obj: Record<string, unknown>): CriteriaGroups {
  const groups: CriteriaGroups = {};
  const content = (obj.content_selections ?? {}) as ContentSelections;

  for (const def of TYPE_CRITERIA_DEFS) {
    const group = emptyGroupState(def);
    const legacyGroup = typeof obj[def.key] === 'boolean' ? (obj[def.key] as boolean) : undefined;

    for (const child of def.childFields ?? []) {
      const legacyChild = content[child.key];
      const rp = legacyChild === true || isDa(legacyChild);
      group.children[child.key] = { rp_value: rp, op_value: rp };
    }

    if (legacyGroup !== undefined) {
      const rollup = childRollupRp(group);
      if (legacyGroup !== rollup) {
        group.group_rp_override = legacyGroup;
        group.group_op_override = legacyGroup;
      }
    }

    groups[def.key] = group;
  }

  return groups;
}

export function parseSellerCriteria(raw: unknown): SellerCriteria {
  if (!raw || typeof raw !== 'object') {
    return { groups: ensureCriteriaGroups({}), contract_params: { ...DEFAULT_CONTRACT_PARAMS } };
  }
  const obj = raw as Record<string, unknown>;
  const { content_selections, groups: rawGroups, contract_params: rawContractParams, ...rest } = obj;

  const criteria: SellerCriteria = {};

  for (const def of CONTRACT_CRITERIA_DEFS) {
    if (typeof rest[def.key] === 'boolean') {
      criteria[def.key] = rest[def.key] as boolean;
    }
  }

  if (rawGroups && typeof rawGroups === 'object') {
    criteria.groups = ensureCriteriaGroups({ groups: rawGroups as CriteriaGroups });
  } else {
    criteria.groups = migrateLegacyToGroups({ ...rest, content_selections });
  }

  if (content_selections && typeof content_selections === 'object') {
    criteria.content_selections = content_selections as ContentSelections;
  }

  if (rawContractParams && typeof rawContractParams === 'object') {
    criteria.contract_params = ensureContractParams(rawContractParams as Partial<ContractParams>);
  }

  return criteria;
}

export function serializeSellerCriteria(criteria: SellerCriteria): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of CONTRACT_CRITERIA_DEFS) {
    if (criteria[def.key] !== undefined) {
      out[def.key] = criteria[def.key];
    }
  }
  const groups = ensureCriteriaGroups(criteria);
  if (Object.keys(groups).length > 0) {
    out.groups = groups;
  }
  if (criteria.contract_params) {
    out.contract_params = ensureContractParams(criteria.contract_params);
  }
  return out;
}

export function criteriaFlag(criteria: SellerCriteria, key: SellerCriteriaKey): boolean {
  const typeDef = TYPE_CRITERIA_DEFS.find(d => d.key === key);
  if (typeDef) {
    const groups = ensureCriteriaGroups(criteria);
    const group = groups[key];
    if (group) return resolveGroupRp(group);
  }
  if (CONTRACT_CRITERIA_DEFS.some(d => d.key === key)) {
    return contractCriteriaValue(criteria, key);
  }
  return criteria[key] === true;
}

export function daLabel(value: boolean): string {
  return value ? 'ДА' : 'НЕТ';
}

const TYPE_IMPACT_LABELS: Record<ProjectTypeImpact, string> = {
  PROF: 'ПРОФ',
  KORP: 'КОРП',
};

export function typeImpactLabel(impact?: ProjectTypeImpact): string {
  if (!impact) return '—';
  return TYPE_IMPACT_LABELS[impact];
}

export function newCustomRowId(): string {
  return `cr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
