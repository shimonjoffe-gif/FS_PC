import React, { useEffect, useState } from 'react';
import type {
  BriefingAssessment, RisksC51C57,
  FsQueueKey, SellerCriteriaDef, CriteriaGroupState, CriteriaGroups,
} from '../types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../types';
import {
  typeImpactLabel, ensureCriteriaGroups, resolveGroupRp, resolveGroupOp,
  isGroupRpOverridden, isGroupOpOverridden, newCustomRowId,
  rollupGroupRp, rollupGroupOp,
  ensureContractParams, computeAdvanceDeferralOk, contractCriteriaValue,
  formatAdvancePctDisplay, parseAdvancePctInput,
  CONTRACT_FORMULA_ROW,
} from '../sellerCriteria';
import {
  applyOrgQueueFieldPatch, applyOrgQueueCascade, buildOrgQueueCascadeConfirmMessage,
  applyOrgBreakdownCascade, buildOrgBreakdownCascadeConfirmMessage,
  cascadeBreakdownRegionAdded, cascadeBreakdownBranchAdded,
  type OrgQueueCascadeTrigger,
  type OrgBreakdownCascadeTrigger,
  type OrgBreakdownField,
  isOrgVolumeFieldEmpty,
  effectiveBreakdownField,
  patchQueueBreakdownRegionField,
  patchQueueBreakdownBranchField,
  addQueueBreakdownRegion,
  removeQueueBreakdownRegion,
  addQueueBreakdownBranch,
  removeQueueBreakdownBranch,
  commitQueueBreakdownRegionField,
  commitQueueBreakdownBranchField,
  computeRisksTotalC51,
  isRiskKeyManual,
  buildManualRiskPatch,
} from '../assessmentCalc';
import type { OrgVolumeBreakdownRow } from '../types';
import { yesNoLabel, yesNoClass, YES_NO_BADGE_CLASS } from '../utils/yesNoBadge';
import { numericInputHandlers } from '../utils/numericInputHandlers';

const OVERRIDE_CLASS = 'bg-amber-50 border-amber-300';
const ORG_EMPTY_CLASS = 'border-red-400 bg-red-50';
const RECALC_FLASH_CLASS = 'ring-2 ring-inset ring-emerald-300/70';

const PROF_CLASS = 'bg-amber-100 text-amber-800';
const KORP_CLASS = 'bg-red-100 text-red-800';
const DISCREPANCY_CLASS = 'ring-2 ring-violet-400';

function useRecalcFlash(flashKey: number): boolean {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (flashKey === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 700);
    return () => window.clearTimeout(t);
  }, [flashKey]);
  return flash;
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const v = Math.round(n * 1000) / 10;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${s}%`;
}

function parseRiskPctInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/%/g, '');
  if (trimmed === '') return null;
  const pctVal = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(pctVal)) return null;
  return Math.min(1, Math.max(0, pctVal / 100));
}

const MANUAL_RISK_KEYS = new Set<keyof RisksC51C57>(['c52_rpo', 'c56_sales_comp', 'c57_rk']);

function typeImpactClass(impact?: 'PROF' | 'KORP'): string {
  if (impact === 'PROF') return PROF_CLASS;
  if (impact === 'KORP') return KORP_CLASS;
  return '';
}

interface Props {
  assessment: BriefingAssessment;
  recalcFlash?: number;
  onChange: (patch: Record<string, unknown>) => void;
}

export default function AssessmentTab({ assessment, recalcFlash = 0, onChange }: Props) {
  const a = assessment;
  const flash = useRecalcFlash(recalcFlash);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [advancePctDraft, setAdvancePctDraft] = useState<string | null>(null);
  const [riskDrafts, setRiskDrafts] = useState<Partial<Record<keyof RisksC51C57, string>>>({});
  const groups = ensureCriteriaGroups(a.criteria);

  function patchGroups(nextGroups: CriteriaGroups) {
    onChange({ criteria: { ...a.criteria, groups: nextGroups } });
  }

  function patchGroup(groupKey: string, patch: Partial<CriteriaGroupState>) {
    const g = groups[groupKey];
    if (!g) return;
    patchGroups({ ...groups, [groupKey]: { ...g, ...patch } });
  }

  function setChildValue(groupKey: string, childKey: string, field: 'rp_value' | 'op_value', value: boolean) {
    const g = groups[groupKey];
    if (!g) return;
    const child = g.children[childKey] ?? { rp_value: false, op_value: false };
    patchGroup(groupKey, {
      children: {
        ...g.children,
        [childKey]: { ...child, [field]: value },
      },
      group_rp_override: null,
      group_op_override: null,
    });
  }

  function setCustomRow(groupKey: string, rowId: string, patch: Partial<{ label: string; rp_value: boolean; op_value: boolean }>) {
    const g = groups[groupKey];
    if (!g) return;
    patchGroup(groupKey, {
      custom_rows: g.custom_rows.map(r => r.id === rowId ? { ...r, ...patch } : r),
      group_rp_override: null,
      group_op_override: null,
    });
  }

  function addCustomRow(groupKey: string) {
    const g = groups[groupKey];
    if (!g) return;
    patchGroup(groupKey, {
      custom_rows: [...g.custom_rows, { id: newCustomRowId(), label: '', rp_value: false, op_value: false }],
    });
    setExpanded(prev => ({ ...prev, [groupKey]: true }));
  }

  function removeCustomRow(groupKey: string, rowId: string) {
    const g = groups[groupKey];
    if (!g) return;
    patchGroup(groupKey, {
      custom_rows: g.custom_rows.filter(r => r.id !== rowId),
      group_rp_override: null,
      group_op_override: null,
    });
  }

  function toggleGroupOverride(groupKey: string, field: 'group_rp_override' | 'group_op_override') {
    const g = groups[groupKey];
    if (!g) return;
    const rollup = field === 'group_rp_override' ? rollupGroupRp(g) : rollupGroupOp(g);
    const current = field === 'group_rp_override' ? resolveGroupRp(g) : resolveGroupOp(g);
    const next = !current;
    patchGroup(groupKey, { [field]: next === rollup ? null : next });
  }

  function resetGroupOverride(groupKey: string, field: 'group_rp_override' | 'group_op_override') {
    patchGroup(groupKey, { [field]: null });
  }

  function setCriteria(key: string, value: boolean) {
    onChange({ criteria: { ...a.criteria, [key]: value } });
  }

  function setContractParam(field: 'pm_version' | 'advance_pct' | 'payment_deferral_days' | 'max_stage_duration_days', value: string | number | null) {
    const current = ensureContractParams(a.criteria.contract_params);
    const next = { ...current };
    if (field === 'pm_version') next.pm_version = String(value);
    else if (field === 'advance_pct') {
      const parsed = typeof value === 'string' ? parseAdvancePctInput(value) : value;
      if (parsed != null) next.advance_pct = parsed;
    } else if (field === 'payment_deferral_days') {
      const n = Number(value);
      if (Number.isFinite(n)) next.payment_deferral_days = n;
    }
    else if (field === 'max_stage_duration_days') {
      next.max_stage_duration_days = value === '' || value === null ? null : Number(value);
    }
    onChange({ criteria: { ...a.criteria, contract_params: next } });
  }

  function orgQueueExpandKey(q: FsQueueKey) {
    return `org-q:${q}`;
  }

  function orgRegionExpandKey(q: FsQueueKey, regionId: string) {
    return `org-r:${q}:${regionId}`;
  }

  function updateOrgQueues(queues: typeof a.org_volume.queues) {
    onChange({ org_volume: { ...a.org_volume, queues }, org_volume_manual: true });
  }

  function patchOrgQueueRow(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg',
    value: string | number,
  ): Record<FsQueueKey, typeof a.org_volume.queues[FsQueueKey]> {
    const current = a.org_volume.queues[q];
    const nextRow = applyOrgQueueFieldPatch(current, field, value);
    return { ...a.org_volume.queues, [q]: nextRow };
  }

  function setOrgQueue(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg',
    value: string | number,
  ) {
    updateOrgQueues(patchOrgQueueRow(q, field, value));
  }

  function commitOrgQueueField(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg',
    rawValue: string,
  ) {
    const trigger: OrgQueueCascadeTrigger = field;
    const queues = patchOrgQueueRow(q, field, rawValue);
    const partial = applyOrgQueueCascade(queues, q, false, trigger);
    if (partial.filledTargets.length === 0) {
      if (!partial.changed) return;
      updateOrgQueues(partial.queues);
      return;
    }
    const msg = buildOrgQueueCascadeConfirmMessage(q, partial.filledTargets, FS_QUEUE_LABELS);
    if (window.confirm(msg)) {
      const full = applyOrgQueueCascade(queues, q, true, trigger);
      if (!full.changed) return;
      updateOrgQueues(full.queues);
    } else if (partial.changed) {
      updateOrgQueues(partial.queues);
    }
  }

  function commitBreakdownField(
    q: FsQueueKey,
    regionId: string,
    branchId: string | null,
    field: OrgBreakdownField | 'label',
    rawValue: string,
  ) {
    const current = a.org_volume.queues[q];
    const result = branchId
      ? commitQueueBreakdownBranchField(current, regionId, branchId, field, rawValue)
      : commitQueueBreakdownRegionField(current, regionId, field, rawValue);

    const queues = { ...a.org_volume.queues, [q]: result.queue };
    const trigger: OrgBreakdownCascadeTrigger = field === 'label' ? 'label' : field;
    const partial = applyOrgBreakdownCascade(queues, q, regionId, branchId, false, trigger);
    if (partial.filledTargets.length === 0) {
      if (!partial.changed) return;
      updateOrgQueues(partial.queues);
      return;
    }

    const sourceQueue = result.queue;
    const sourceRegion = (sourceQueue.breakdown ?? []).find(r => r.id === regionId);
    const rowLabel = branchId
      ? sourceRegion?.branches?.find(b => b.id === branchId)?.label ?? ''
      : sourceRegion?.label ?? '';
    const msg = buildOrgBreakdownCascadeConfirmMessage(
      q, rowLabel, partial.filledTargets, FS_QUEUE_LABELS,
    );
    if (window.confirm(msg)) {
      const full = applyOrgBreakdownCascade(queues, q, regionId, branchId, true, trigger);
      if (!full.changed) return;
      updateOrgQueues(full.queues);
    } else if (partial.changed) {
      updateOrgQueues(partial.queues);
    }
  }

  function addBreakdownRegionWithCascade(q: FsQueueKey) {
    const next = addQueueBreakdownRegion(a.org_volume.queues[q]);
    const regionId = next.breakdown![next.breakdown!.length - 1].id;
    const queues = { ...a.org_volume.queues, [q]: next };
    const cascaded = cascadeBreakdownRegionAdded(queues, q, regionId);
    updateOrgQueues(cascaded.queues);
    setExpanded(prev => ({ ...prev, [orgQueueExpandKey(q)]: true }));
  }

  function addBreakdownBranchWithCascade(q: FsQueueKey, regionId: string) {
    const next = addQueueBreakdownBranch(a.org_volume.queues[q], regionId);
    const region = next.breakdown?.find(r => r.id === regionId);
    const branchId = region?.branches?.[region.branches.length - 1]?.id;
    if (!branchId) {
      updateOrgQueues({ ...a.org_volume.queues, [q]: next });
      return;
    }
    const queues = { ...a.org_volume.queues, [q]: next };
    const cascaded = cascadeBreakdownBranchAdded(queues, q, regionId, branchId);
    updateOrgQueues(cascaded.queues);
    setExpanded(prev => ({ ...prev, [orgRegionExpandKey(q, regionId)]: true }));
  }

  function setBreakdownField(
    q: FsQueueKey,
    regionId: string,
    branchId: string | null,
    field: OrgBreakdownField | 'label',
    value: string | number,
  ) {
    const current = a.org_volume.queues[q];
    const nextQueue = branchId
      ? patchQueueBreakdownBranchField(current, regionId, branchId, field, value)
      : patchQueueBreakdownRegionField(current, regionId, field, value);
    updateOrgQueues({ ...a.org_volume.queues, [q]: nextQueue });
  }

  function isOrgFieldOverridden(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg',
  ): boolean {
    if (!a.org_volume_manual) return false;
    const row = a.org_volume.queues[q];
    const auto = a.auto_org_volume?.queues[q];
    if (!auto) return false;
    return row[field] !== auto[field];
  }

  function renderOrgNumericInput(
    value: number | null | undefined,
    onChangeValue: (v: string) => void,
    onBlurValue: (v: string) => void,
    opts?: { validatable?: boolean; active?: boolean; overridden?: boolean; readOnly?: boolean },
  ) {
    const validatable = opts?.validatable ?? false;
    const active = opts?.active ?? true;
    const isEmpty = validatable && active && isOrgVolumeFieldEmpty(value);
    const cls = [
      'w-full text-right border rounded px-1 py-0.5',
      isEmpty ? ORG_EMPTY_CLASS : '',
      opts?.overridden ? OVERRIDE_CLASS : '',
      opts?.readOnly ? 'bg-slate-100 text-slate-600 cursor-default' : '',
    ].filter(Boolean).join(' ');
    if (opts?.readOnly) {
      return (
        <span className={`block ${cls} border-transparent`}>
          {value ?? '—'}
        </span>
      );
    }
    return (
      <input
        type="number"
        min="0"
        step="1"
        className={cls}
        value={value ?? ''}
        onChange={e => onChangeValue(e.target.value)}
        onBlur={e => onBlurValue(e.target.value)}
        {...numericInputHandlers}
      />
    );
  }

  function renderOrgNumericCell(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg',
    opts?: { validatable?: boolean },
  ) {
    const row = a.org_volume.queues[q];
    return renderOrgNumericInput(
      row[field],
      v => setOrgQueue(q, field, v),
      v => commitOrgQueueField(q, field, v),
      {
        validatable: opts?.validatable,
        active: row.active,
        overridden: isOrgFieldOverridden(q, field),
      },
    );
  }

  function renderBreakdownNumericCell(
    q: FsQueueKey,
    regionId: string,
    branchId: string | null,
    field: OrgBreakdownField,
    value: number | null | undefined,
    opts?: { validatable?: boolean; readOnly?: boolean },
  ) {
    const row = a.org_volume.queues[q];
    return renderOrgNumericInput(
      value,
      v => setBreakdownField(q, regionId, branchId, field, v),
      v => commitBreakdownField(q, regionId, branchId, field, v),
      {
        validatable: opts?.validatable,
        active: row.active,
        readOnly: opts?.readOnly,
      },
    );
  }

  function renderBreakdownLabelCell(
    q: FsQueueKey,
    regionId: string,
    branchId: string | null,
    label: string,
    indent: number,
    opts?: { onRemove?: () => void },
  ) {
    const pad = indent === 0 ? 'pl-8' : indent === 1 ? 'pl-14' : 'pl-20';
    return (
      <td className={`p-2 border text-left ${pad} text-xs text-slate-600`}>
        <div className="flex items-center gap-1">
          {opts?.onRemove && (
            <button
              type="button"
              className="text-[10px] text-red-500 hover:underline shrink-0"
              title="Удалить"
              onClick={opts.onRemove}
            >
              ✕
            </button>
          )}
          <input
            type="text"
            className="flex-1 text-xs border rounded px-1 py-0.5"
            placeholder={branchId ? 'Филиал…' : 'Регион…'}
            value={label}
            onChange={e => setBreakdownField(q, regionId, branchId, 'label', e.target.value)}
            onBlur={e => commitBreakdownField(q, regionId, branchId, 'label', e.target.value)}
          />
        </div>
      </td>
    );
  }

  function renderBreakdownFieldCell(
    q: FsQueueKey,
    regionId: string,
    branchId: string | null,
    field: OrgBreakdownField,
    row: OrgVolumeBreakdownRow,
    hasBranches: boolean,
  ) {
    const value = hasBranches ? effectiveBreakdownField(row, field) : (row[field] ?? null);
    return renderBreakdownNumericCell(
      q, regionId, branchId, field, value,
      { readOnly: hasBranches },
    );
  }

  function renderBreakdownDataRow(
    q: FsQueueKey,
    regionId: string,
    branchId: string | null,
    row: OrgVolumeBreakdownRow,
    indent: number,
    opts: { onRemove?: () => void },
  ) {
    return (
      <tr key={branchId ? `b-${branchId}` : `r-${regionId}`} className="bg-white">
        {renderBreakdownLabelCell(q, regionId, branchId, row.label, indent, {
          onRemove: opts.onRemove,
        })}
        <td className="p-2 border" />
        <td className="p-2 border">
          {renderBreakdownNumericCell(q, regionId, branchId, 'users', row.users)}
        </td>
        <td className="p-2 border">
          {renderBreakdownNumericCell(q, regionId, branchId, 'rp_rpo', row.rp_rpo ?? null)}
        </td>
        <td className="p-2 border">
          {renderBreakdownNumericCell(q, regionId, branchId, 'executors', row.executors ?? null)}
        </td>
        <td className="p-2 border">
          {renderBreakdownNumericCell(q, regionId, branchId, 'rg', row.rg ?? null)}
        </td>
      </tr>
    );
  }

  function renderOrgRegionRows(q: FsQueueKey, region: OrgVolumeBreakdownRow) {
    const hasBranches = (region.branches?.length ?? 0) > 0;
    const regionOpen = expanded[orgRegionExpandKey(q, region.id)] ?? hasBranches;

    return (
      <React.Fragment key={region.id}>
        <tr className="bg-white">
          <td className="p-2 border text-left pl-8 text-xs text-slate-600">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 shrink-0"
                onClick={() => toggleExpand(orgRegionExpandKey(q, region.id))}
                title="Филиалы"
              >
                {regionOpen ? '▼' : '▶'}
              </button>
              <button
                type="button"
                className="text-[10px] text-red-500 hover:underline shrink-0"
                title="Удалить регион"
                onClick={() => {
                  const next = removeQueueBreakdownRegion(a.org_volume.queues[q], region.id);
                  updateOrgQueues({ ...a.org_volume.queues, [q]: next });
                }}
              >
                ✕
              </button>
              <input
                type="text"
                className="flex-1 text-xs border rounded px-1 py-0.5"
                placeholder="Регион…"
                value={region.label}
                onChange={e => setBreakdownField(q, region.id, null, 'label', e.target.value)}
                onBlur={e => commitBreakdownField(q, region.id, null, 'label', e.target.value)}
              />
              <button
                type="button"
                className="text-[10px] text-blue-600 hover:underline shrink-0"
                title="Добавить филиал"
                onClick={() => addBreakdownBranchWithCascade(q, region.id)}
              >
                ++
              </button>
            </div>
          </td>
          <td className="p-2 border" />
          <td className="p-2 border">
            {renderBreakdownFieldCell(q, region.id, null, 'users', region, hasBranches)}
          </td>
          <td className="p-2 border">
            {renderBreakdownFieldCell(q, region.id, null, 'rp_rpo', region, hasBranches)}
          </td>
          <td className="p-2 border">
            {renderBreakdownFieldCell(q, region.id, null, 'executors', region, hasBranches)}
          </td>
          <td className="p-2 border">
            {renderBreakdownFieldCell(q, region.id, null, 'rg', region, hasBranches)}
          </td>
        </tr>

        {regionOpen && (region.branches ?? []).map(branch =>
          renderBreakdownDataRow(q, region.id, branch.id, branch, 1, {
            onRemove: () => {
              const next = removeQueueBreakdownBranch(a.org_volume.queues[q], region.id, branch.id);
              updateOrgQueues({ ...a.org_volume.queues, [q]: next });
            },
          }),
        )}
      </React.Fragment>
    );
  }

  function renderOrgQueueRows(q: FsQueueKey) {
    const row = a.org_volume.queues[q];
    const breakdown = row.breakdown ?? [];
    const hasBreakdown = breakdown.length > 0;
    const queueOpen = expanded[orgQueueExpandKey(q)] ?? hasBreakdown;

    return (
      <React.Fragment key={q}>
        <tr className="bg-slate-50/40">
          <td className="p-2 border font-medium">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 shrink-0"
                onClick={() => toggleExpand(orgQueueExpandKey(q))}
                title="Регионы"
              >
                {queueOpen ? '▼' : '▶'}
              </button>
              <span>{FS_QUEUE_LABELS[q]}</span>
              <button
                type="button"
                className="text-[10px] text-blue-600 hover:underline shrink-0"
                title="Добавить регион"
                onClick={() => addBreakdownRegionWithCascade(q)}
              >
                +
              </button>
            </div>
          </td>
          <td className="p-2 border text-center">
            <input type="checkbox" checked={row.active} disabled
              className="opacity-60" title="Из ФС (активные очереди)" />
          </td>
          <td className="p-2 border">{renderOrgNumericCell(q, 'users')}</td>
          <td className="p-2 border">{renderOrgNumericCell(q, 'rp_rpo', { validatable: true })}</td>
          <td className="p-2 border">{renderOrgNumericCell(q, 'executors', { validatable: true })}</td>
          <td className="p-2 border">{renderOrgNumericCell(q, 'rg')}</td>
        </tr>

        {queueOpen && hasBreakdown && breakdown.map(region => renderOrgRegionRows(q, region))}

        {queueOpen && hasBreakdown && (
          <tr className="bg-slate-50/20">
            <td colSpan={6} className="p-1 border pl-12">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => addBreakdownRegionWithCascade(q)}
              >
                + Добавить регион
              </button>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  }

  function setRisk(key: keyof RisksC51C57, value: number) {
    if (!MANUAL_RISK_KEYS.has(key)) return;
    onChange(buildManualRiskPatch(key, value, {
      risks: a.risks,
      auto_risks: a.auto_risks,
      risks_manual_keys: a.risks_manual_keys ?? {},
      risks_manual: a.risks_manual,
    }));
  }

  const typeCriteria = a.criteria_defs.filter(d => d.group === 'type');
  const contractCriteria = a.criteria_defs.filter(d => d.group === 'contract');
  const contractParams = ensureContractParams(a.criteria.contract_params);
  const advanceDeferralOk = computeAdvanceDeferralOk(contractParams);

  function toggleExpand(key: string) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function renderBoolCell(
    value: boolean,
    onToggle: () => void,
    opts?: { overridden?: boolean; discrepancy?: boolean },
  ) {
    const extra = [
      opts?.overridden ? 'ring-1 ring-amber-400' : '',
      opts?.discrepancy ? DISCREPANCY_CLASS : '',
    ].filter(Boolean).join(' ');
    return (
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input type="checkbox" checked={value} onChange={onToggle} className="sr-only" />
        <span className={`${YES_NO_BADGE_CLASS} min-w-[36px] ${yesNoClass(value)} ${extra}`}>
          {yesNoLabel(value)}
        </span>
      </label>
    );
  }

  function renderGroupOverrideCell(
    groupKey: string,
    field: 'group_rp_override' | 'group_op_override',
    value: boolean,
    overridden: boolean,
    discrepancy: boolean,
  ) {
    return (
      <div className="inline-flex items-center gap-0.5">
        {renderBoolCell(value, () => toggleGroupOverride(groupKey, field), { overridden, discrepancy })}
        {overridden && (
          <button
            type="button"
            className="text-[10px] text-blue-600 hover:underline"
            title="Сбросить к авто (rollup)"
            onClick={() => resetGroupOverride(groupKey, field)}
          >
            ↺
          </button>
        )}
      </div>
    );
  }

  function renderCriteriaGroup(c: SellerCriteriaDef) {
    const group = groups[c.key];
    if (!group) return null;

    const rpValue = resolveGroupRp(group);
    const opValue = resolveGroupOp(group);
    const rpOverridden = isGroupRpOverridden(group);
    const opOverridden = isGroupOpOverridden(group);
    const rpVsOp = rpValue !== opValue;
    const hasChildren = (c.childFields?.length ?? 0) > 0 || c.allowsCustomRows;
    const isOpen = expanded[c.key] ?? false;

    return (
      <React.Fragment key={c.key}>
        <tr className="bg-slate-50/40">
          <td className="p-2 border text-left align-top">
            {hasChildren && (
              <button
                type="button"
                className="mr-1 text-slate-400 hover:text-slate-600"
                onClick={() => toggleExpand(c.key)}
                title="Подстроки"
              >
                {isOpen ? '▼' : '▶'}
              </button>
            )}
            <span className="text-sm font-medium">{c.label}</span>
          </td>
          <td className="p-2 border text-center">
            {renderGroupOverrideCell(c.key, 'group_rp_override', rpValue, rpOverridden, rpVsOp)}
          </td>
          <td className="p-2 border text-center">
            {renderGroupOverrideCell(c.key, 'group_op_override', opValue, opOverridden, rpVsOp)}
          </td>
          <td className={`p-2 border text-center text-xs font-semibold ${typeImpactClass(c.typeImpact)}`}>
            {typeImpactLabel(c.typeImpact)}
          </td>
        </tr>

        {isOpen && c.childFields?.map(child => {
          const state = group.children[child.key] ?? { rp_value: false, op_value: false };
          return (
            <tr key={`${c.key}-${child.key}`} className="bg-white">
              <td className="p-2 border text-left pl-8 text-xs text-slate-600">
                ↳ {child.label}
                <span className="ml-1 text-[10px] text-slate-400">({child.excelRef})</span>
              </td>
              <td className="p-2 border text-center">
                {renderBoolCell(
                  state.rp_value === true,
                  () => setChildValue(c.key, child.key, 'rp_value', !state.rp_value),
                )}
              </td>
              <td className="p-2 border text-center">
                {renderBoolCell(
                  state.op_value === true,
                  () => setChildValue(c.key, child.key, 'op_value', !state.op_value),
                  { discrepancy: state.rp_value !== state.op_value },
                )}
              </td>
              <td className="p-2 border" />
            </tr>
          );
        })}

        {isOpen && group.custom_rows.map(row => (
          <tr key={`${c.key}-custom-${row.id}`} className="bg-amber-50/30">
            <td className="p-2 border text-left pl-8">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-400 shrink-0">+</span>
                <input
                  type="text"
                  className="flex-1 text-xs border rounded px-1 py-0.5"
                  placeholder="Свой вариант…"
                  value={row.label}
                  onChange={e => setCustomRow(c.key, row.id, { label: e.target.value })}
                />
                <button
                  type="button"
                  className="text-[10px] text-red-500 hover:underline shrink-0"
                  onClick={() => removeCustomRow(c.key, row.id)}
                >
                  ✕
                </button>
              </div>
            </td>
            <td className="p-2 border text-center">
              {renderBoolCell(
                row.rp_value === true,
                () => setCustomRow(c.key, row.id, { rp_value: !row.rp_value }),
              )}
            </td>
            <td className="p-2 border text-center">
              {renderBoolCell(
                row.op_value === true,
                () => setCustomRow(c.key, row.id, { op_value: !row.op_value }),
                { discrepancy: row.rp_value !== row.op_value },
              )}
            </td>
            <td className="p-2 border" />
          </tr>
        ))}

        {isOpen && c.allowsCustomRows && (
          <tr className="bg-slate-50/20">
            <td colSpan={4} className="p-1 border pl-8">
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => addCustomRow(c.key)}
              >
                + Добавить свой вариант
              </button>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Требования к работам и результатам</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="p-2 border text-left">Критерий</th>
                <th className="p-2 border text-center w-24">РП</th>
                <th className="p-2 border text-center w-24">ОП</th>
                <th className="p-2 border text-center w-28">Влияние на тип</th>
              </tr>
            </thead>
            <tbody>
              {typeCriteria.map(c => renderCriteriaGroup(c))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Подстроки — ДА/НЕТ для РП и ОП. Группа = rollup (любая подстрока ДА); ↺ сбрасывает ручное значение группы.
          Оценка типа проекта — по РП. Фиолетовая обводка — расхождение РП/ОП.
        </p>
      </section>

      <section className={flash ? `rounded-lg ${RECALC_FLASH_CLASS}` : ''}>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Тип проекта</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-slate-400 block mb-1">Авто (C33)</label>
            <div className={`text-sm text-slate-600 bg-slate-50 border rounded px-3 py-2 transition-colors ${flash && !a.project_type_manual ? 'bg-emerald-50' : ''}`}>
              {a.auto_project_type?.name ?? '—'}
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-slate-400 block mb-1">Выбранный тип</label>
            <select
              className={`w-full text-sm border rounded px-3 py-2 ${a.project_type_manual ? OVERRIDE_CLASS : ''}`}
              value={a.project_type_id ?? ''}
              onChange={e => onChange({
                project_type_id: e.target.value ? Number(e.target.value) : null,
                project_type_manual: true,
              })}
            >
              <option value="">— авто —</option>
              {a.project_types.map(pt => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
          </div>
          {a.project_type_manual && (
            <button type="button" className="text-xs text-blue-600 hover:underline"
              onClick={() => onChange({ reset_project_type: true })}>
              Сбросить к авто
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Ставка НСИ: {a.nsi_hourly_rate.toLocaleString('ru')} ₽/ч
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Орг. объём по очередям</h3>
          {a.org_volume_manual && (
            <button type="button" className="text-xs text-blue-600 hover:underline"
              onClick={() => onChange({ reset_org_volume: true })}>
              Сбросить к авто
            </button>
          )}
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="p-2 border text-left">Очередь</th>
              <th className="p-2 border text-center w-16">Активна</th>
              <th className="p-2 border text-right">Польз.</th>
              <th className="p-2 border text-right">РП/РПО</th>
              <th className="p-2 border text-right">Исполн.</th>
              <th className="p-2 border text-right">РГ (СПб/МСК)</th>
            </tr>
            <tr className="bg-slate-50 text-slate-400 text-[10px]">
              <th className="p-1 border" />
              <th className="p-1 border text-center">Яч.</th>
              <th className="p-1 border text-center">B5</th>
              <th className="p-1 border text-center">C5</th>
              <th className="p-1 border text-center">D5</th>
              <th className="p-1 border text-center">D7</th>
            </tr>
          </thead>
          <tbody>
            {FS_QUEUE_KEYS.map(q => renderOrgQueueRows(q))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-1">
          Строка очереди — итоги (Польз., РП/РПО, Исполн., РГ). Название региона — в колонке «Очередь» у дочерних строк.
          «+» — регион; «++» — филиал внутри региона. При детализации итоги очереди = сумма дочерних строк.
          При blur значения каскадируются на последующие строки/очереди (с подтверждением, если цель уже заполнена).
          Жёлтая подсветка — ручное отличие от авто; красная — пустые РП/РПО или Исполн. у активной очереди.
        </p>
      </section>

      <section className={flash ? `rounded-lg ${RECALC_FLASH_CLASS}` : ''}>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Параметры рисков договора</h3>
        <table className="w-full text-xs border-collapse mb-4">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="p-2 border text-left">Параметр</th>
              <th className="p-2 border text-center w-28">Значение</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border">Версия PM</td>
              <td className="p-2 border text-center">
                <select
                  className="w-full border rounded px-1 py-0.5 text-center"
                  value={contractParams.pm_version}
                  onChange={e => setContractParam('pm_version', e.target.value)}
                >
                  <option value="PM4">PM4</option>
                  <option value="PM5">PM5</option>
                </select>
              </td>
            </tr>
            {contractCriteria.map(c => {
              const value = contractCriteriaValue(a.criteria, c.key);
              return (
                <tr key={c.key}>
                  <td className="p-2 border">{c.label}</td>
                  <td className="p-2 border text-center">
                    {renderBoolCell(value, () => setCriteria(c.key, !value))}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-50/50">
              <td className="p-2 border">
                {CONTRACT_FORMULA_ROW.label}
                <span className="ml-1 text-slate-400">(формула)</span>
              </td>
              <td className="p-2 border text-center">
                <span className={`${YES_NO_BADGE_CLASS} min-w-[36px] ${yesNoClass(advanceDeferralOk)}`}>
                  {yesNoLabel(advanceDeferralOk)}
                </span>
              </td>
            </tr>
            <tr>
              <td className="p-2 border">Аванс (%)</td>
              <td className="p-2 border">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="w-full text-right border rounded px-1 py-0.5"
                  value={advancePctDraft ?? formatAdvancePctDisplay(contractParams.advance_pct)}
                  onChange={e => {
                    const raw = e.target.value;
                    setAdvancePctDraft(raw);
                    const parsed = parseAdvancePctInput(raw);
                    if (parsed != null) setContractParam('advance_pct', parsed);
                  }}
                  onBlur={e => {
                    const parsed = parseAdvancePctInput(e.target.value);
                    setAdvancePctDraft(null);
                    if (parsed != null) setContractParam('advance_pct', parsed);
                  }}
                  {...numericInputHandlers}
                />
              </td>
            </tr>
            <tr>
              <td className="p-2 border">Отсрочка платежа (р. Дней)</td>
              <td className="p-2 border">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full text-right border rounded px-1 py-0.5"
                  value={contractParams.payment_deferral_days}
                  onChange={e => setContractParam('payment_deferral_days', e.target.value)}
                  {...numericInputHandlers}
                />
              </td>
            </tr>
            <tr>
              <td className="p-2 border">Длительность максимального этапа</td>
              <td className="p-2 border">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full text-right border rounded px-1 py-0.5"
                  value={contractParams.max_stage_duration_days ?? ''}
                  onChange={e => setContractParam('max_stage_duration_days', e.target.value)}
                  {...numericInputHandlers}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700">Резервы и риски (C51–C57)</h3>
          {a.risks_manual && (
            <button type="button" className="text-xs text-blue-600 hover:underline"
              onClick={() => onChange({ reset_risks: true })}>
              Сбросить к авто
            </button>
          )}
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="p-2 border text-left">Параметр</th>
              <th className="p-2 border text-right w-24">Авто</th>
              <th className="p-2 border text-right w-32">Значение</th>
            </tr>
          </thead>
          <tbody>
            {([
              ['c52_rpo', 'РПО (C52)', true],
              ['c53_company_fund', 'Фонд компании (C53)', false],
              ['c54_contract_rpo', 'РПО риски договора (C54)', false],
              ['c55_contract_fund', 'Фонд риски договора (C55)', false],
              ['c56_sales_comp', 'Компенсация продаж (C56)', true],
              ['c57_rk', 'РК (C57)', true],
            ] as [keyof RisksC51C57, string, boolean][]).map(([key, label, editable]) => (
              <tr key={key}>
                <td className="p-2 border">{label}</td>
                <td className="p-2 border text-right text-slate-400">{pct(a.auto_risks[key])}</td>
                <td className="p-2 border">
                  {editable ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      className={`w-full text-right border rounded px-2 py-1 ${isRiskKeyManual(key, a.risks_manual_keys ?? {}, a.risks_manual, a.risks) && a.risks[key] !== a.auto_risks[key] ? OVERRIDE_CLASS : ''}`}
                      value={riskDrafts[key] ?? pct(a.risks[key])}
                      onChange={e => {
                        const raw = e.target.value;
                        setRiskDrafts(prev => ({ ...prev, [key]: raw }));
                        const parsed = parseRiskPctInput(raw);
                        if (parsed != null) setRisk(key, parsed);
                      }}
                      onBlur={e => {
                        const parsed = parseRiskPctInput(e.target.value);
                        setRiskDrafts(prev => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                        if (parsed != null) setRisk(key, parsed);
                      }}
                    />
                  ) : (
                    <span className={`block text-right px-2 py-1 ${flash ? 'text-emerald-700 font-medium' : ''}`}>
                      {pct(a.risks[key])}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 text-slate-700">
              <td className="p-2 border border-t-2 border-slate-400 font-bold text-sm">Итоги резервов и рисков (C51)</td>
              <td className="p-2 border border-t-2 border-slate-400 text-right font-bold text-sm">{pct(computeRisksTotalC51(a.auto_risks))}</td>
              <td className={`p-2 border border-t-2 border-slate-400 text-right px-2 py-1 font-bold text-sm ${flash ? 'text-emerald-700' : ''}`}>
                {pct(computeRisksTotalC51(a.risks))}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
