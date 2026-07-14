import type { CriteriaGroups, SellerCriteria } from './sellerCriteria';
import { ensureCriteriaGroups } from './sellerCriteria';

export type DocumentTech = 'CASE' | 'BZ' | 'PROF_MINI' | 'PROF' | 'KORP';

export interface StandardDocument {
  id: number;
  field_key: string;
  label: string;
  excel_ref: string;
  group_key: string;
  sort_order: number;
  is_active: number;
  tech: DocumentTech;
  can_extra: number;
  std_case: number;
  std_bz: number;
  std_prof_mini: number;
  std_prof: number;
  std_korp: number;
}

export interface StandardDocumentExclusion {
  id: number;
  doc_id_a: number;
  doc_id_b: number;
}

export interface StandardDocumentRowState {
  rp_value: boolean;
  op_value: boolean;
  rp_manual?: boolean;
  op_manual?: boolean;
  extra?: boolean;
}

export type StandardDocumentsState = Record<string, StandardDocumentRowState>;

export interface ExtraCustomDocument {
  id: string;
  label: string;
  rp_value: boolean;
  op_value: boolean;
  tech: DocumentTech;
}

export function newExtraCustomDocId(): string {
  return `ecd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function maxTechFromExtraCustomDocuments(docs: ExtraCustomDocument[]): DocumentTech {
  let max = 0;
  for (const doc of docs) {
    if (!doc.rp_value || !doc.label.trim()) continue;
    max = Math.max(max, techRank(doc.tech));
  }
  return rankToProjectTypeCode(max);
}

const TECH_RANK: Record<DocumentTech, number> = {
  CASE: 0,
  BZ: 1,
  PROF_MINI: 2,
  PROF: 3,
  KORP: 4,
};

const RANK_TO_CODE: DocumentTech[] = ['CASE', 'BZ', 'PROF_MINI', 'PROF', 'KORP'];

export function techRank(tech: DocumentTech | string | null | undefined): number {
  if (!tech) return 0;
  return TECH_RANK[tech as DocumentTech] ?? 0;
}

export function rankToProjectTypeCode(rank: number): DocumentTech {
  const idx = Math.min(Math.max(0, rank), RANK_TO_CODE.length - 1);
  return RANK_TO_CODE[idx];
}

export function techLabel(tech: DocumentTech | string | null | undefined): string {
  switch (tech) {
    case 'CASE': return 'Кейс';
    case 'BZ': return 'БЗ';
    case 'PROF_MINI': return 'Проф-мини';
    case 'PROF': return 'ПРОФ';
    case 'KORP': return 'КОРП';
    default: return '—';
  }
}

export function activeStandardDocuments(catalog: StandardDocument[]): StandardDocument[] {
  return catalog.filter(d => d.is_active !== 0);
}

function matrixFlag(value: number | boolean | null | undefined): boolean {
  return value === 1 || value === true;
}

function stdFlagForType(doc: StandardDocument, typeCode: string | null): boolean {
  switch (typeCode) {
    case 'CASE': return matrixFlag(doc.std_case);
    case 'BZ': return matrixFlag(doc.std_bz);
    case 'PROF_MINI': return matrixFlag(doc.std_prof_mini);
    case 'PROF': return matrixFlag(doc.std_prof);
    case 'KORP': return matrixFlag(doc.std_korp);
    default: return false;
  }
}

export function hasStandardMatrixEntry(doc: StandardDocument): boolean {
  return matrixFlag(doc.std_case) || matrixFlag(doc.std_bz) || matrixFlag(doc.std_prof_mini)
    || matrixFlag(doc.std_prof) || matrixFlag(doc.std_korp);
}

export function isAdditionalCatalogDoc(doc: StandardDocument): boolean {
  return matrixFlag(doc.can_extra);
}

export function normalizeProjectTypeCode(typeCode: string | null | undefined): string | null {
  if (typeCode == null) return null;
  const trimmed = String(typeCode).trim();
  return trimmed || null;
}

export function isStandardBlockDoc(doc: StandardDocument): boolean {
  return hasStandardMatrixEntry(doc);
}

export function isAdditionalBlockDoc(doc: StandardDocument): boolean {
  return isAdditionalCatalogDoc(doc);
}

export function isInStandardMatrixForType(doc: StandardDocument, typeCode: string | null): boolean {
  const code = normalizeProjectTypeCode(typeCode);
  if (!code) return false;
  return stdFlagForType(doc, code);
}

export function defaultStandardEnabled(doc: StandardDocument, typeCode: string | null): boolean {
  return stdFlagForType(doc, typeCode);
}

export function resolveDocumentRow(
  doc: StandardDocument,
  state: StandardDocumentsState,
  typeCode: string | null,
): StandardDocumentRowState {
  const key = String(doc.id);
  const existing = state[key];
  const stdDefault = defaultStandardEnabled(doc, typeCode);
  const extraDefault = false;
  const baseDefault = existing?.extra ? extraDefault : stdDefault;
  return {
    rp_value: existing?.rp_manual ? existing.rp_value === true : (existing?.rp_value ?? baseDefault),
    op_value: existing?.op_manual ? existing.op_value === true : (existing?.op_value ?? baseDefault),
    rp_manual: existing?.rp_manual,
    op_manual: existing?.op_manual,
    extra: existing?.extra,
  };
}

export function isDocumentEnabledRp(
  doc: StandardDocument,
  state: StandardDocumentsState,
  typeCode: string | null,
): boolean {
  return resolveDocumentRow(doc, state, typeCode).rp_value === true;
}

export function maxTechFromEnabledDocuments(
  catalog: StandardDocument[],
  state: StandardDocumentsState,
  typeCode: string | null,
): DocumentTech {
  let max = 0;
  for (const doc of activeStandardDocuments(catalog)) {
    if (!isDocumentEnabledRp(doc, state, typeCode)) continue;
    max = Math.max(max, techRank(doc.tech));
  }
  return rankToProjectTypeCode(max);
}

export function ensureStandardDocumentsState(
  catalog: StandardDocument[],
  criteria: SellerCriteria,
  typeCode: string | null,
): StandardDocumentsState {
  const existing = { ...(criteria.standard_documents ?? {}) };
  const groups = ensureCriteriaGroups(criteria);

  for (const doc of activeStandardDocuments(catalog)) {
    const key = String(doc.id);
    if (existing[key]) continue;
    const child = groups[doc.group_key]?.children?.[doc.field_key];
    const fromChild = child?.rp_value === true;
    existing[key] = {
      rp_value: fromChild || defaultStandardEnabled(doc, typeCode),
      op_value: child?.op_value === true || defaultStandardEnabled(doc, typeCode),
    };
  }

  return existing;
}

export function applyDocumentExclusions(
  catalog: StandardDocument[],
  exclusions: StandardDocumentExclusion[],
  state: StandardDocumentsState,
  toggledDocId: number,
  enabled: boolean,
): StandardDocumentsState {
  if (!enabled) return state;
  const next = { ...state };
  for (const pair of exclusions) {
    const otherId = pair.doc_id_a === toggledDocId ? pair.doc_id_b
      : pair.doc_id_b === toggledDocId ? pair.doc_id_a
        : null;
    if (otherId == null) continue;
    const key = String(otherId);
    const row = next[key];
    if (!row) continue;
    next[key] = {
      ...row,
      rp_value: false,
      op_value: false,
      extra: false,
      rp_manual: false,
      op_manual: false,
    };
  }
  return next;
}

export function syncStandardDocsToType(
  catalog: StandardDocument[],
  state: StandardDocumentsState,
  projectTypeCode: string | null,
): StandardDocumentsState {
  const next: StandardDocumentsState = { ...state };
  for (const doc of activeStandardDocuments(catalog)) {
    if (!hasStandardMatrixEntry(doc)) continue;
    const key = String(doc.id);
    const row = next[key] ?? { rp_value: false, op_value: false };
    if (row.extra) continue;
    const def = defaultStandardEnabled(doc, projectTypeCode);
    next[key] = {
      ...row,
      rp_value: row.rp_manual ? row.rp_value : def,
      op_value: row.op_manual ? row.op_value : def,
    };
  }
  return next;
}

export function syncGroupsFromStandardDocs(
  catalog: StandardDocument[],
  state: StandardDocumentsState,
  groups: CriteriaGroups,
): CriteriaGroups {
  const next: CriteriaGroups = { ...groups };
  for (const doc of catalog) {
    const key = String(doc.id);
    const row = state[key];
    if (!row) continue;
    const groupKey = doc.group_key;
    const group = next[groupKey];
    if (!group) continue;
    next[groupKey] = {
      ...group,
      children: {
        ...group.children,
        [doc.field_key]: { rp_value: row.rp_value, op_value: row.op_value },
      },
      group_rp_override: null,
      group_op_override: null,
    };
  }
  return next;
}

export function mergeStandardDocumentsIntoCriteria(
  catalog: StandardDocument[],
  criteria: SellerCriteria,
  projectTypeCode: string | null,
  syncDefaultsFromType: boolean,
): SellerCriteria {
  let state = ensureStandardDocumentsState(catalog, criteria, projectTypeCode);
  if (syncDefaultsFromType) {
    state = syncStandardDocsToType(catalog, state, projectTypeCode);
  }
  const groups = syncGroupsFromStandardDocs(catalog, state, ensureCriteriaGroups(criteria));
  return { ...criteria, standard_documents: state, groups } as SellerCriteria;
}

export function computeTypeRankFromFs(sp: { KORP: number; PROF: number; PROF_MINI: number; NMD: number }): number {
  if (sp.KORP > 0 || sp.NMD > 0) return TECH_RANK.KORP;
  if (sp.PROF > 0) return TECH_RANK.PROF;
  if (sp.PROF_MINI > 0) return TECH_RANK.PROF_MINI;
  return TECH_RANK.CASE;
}

export function computeTypeRankFromOrg(headcount: number, users: number, rpRpo: number): number {
  if (headcount >= 1001 || users > 500) return TECH_RANK.KORP;
  if (users > 200 || rpRpo > 20) return TECH_RANK.PROF;
  return TECH_RANK.CASE;
}

export function resolveAutoProjectTypeCode(
  sp: { KORP: number; PROF: number; PROF_MINI: number; NMD: number },
  headcount: number,
  users: number,
  rpRpo: number,
  catalog: StandardDocument[],
  docState: StandardDocumentsState | undefined,
  typeCodeForDefaults: string | null,
  extraCustom: ExtraCustomDocument[] = [],
): DocumentTech {
  const fromFs = computeTypeRankFromFs(sp);
  const fromOrg = computeTypeRankFromOrg(headcount, users, rpRpo);
  const fromDocs = techRank(maxTechFromEnabledDocuments(
    catalog,
    docState ?? {},
    typeCodeForDefaults,
  ));
  const fromExtra = techRank(maxTechFromExtraCustomDocuments(extraCustom));
  const maxRank = Math.max(fromFs, fromOrg, fromDocs, fromExtra);
  return rankToProjectTypeCode(maxRank);
}
