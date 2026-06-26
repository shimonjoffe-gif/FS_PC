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
  type OrgQueueCascadeTrigger,
  isOrgVolumeFieldEmpty,
  computeRisksTotalC51,
} from '../assessmentCalc';
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

  function patchOrgQueueRow(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg' | 'region',
    value: string | number,
  ): Record<FsQueueKey, typeof a.org_volume.queues[FsQueueKey]> {
    const current = a.org_volume.queues[q];
    const nextRow = field === 'region'
      ? { ...current, region: String(value) }
      : applyOrgQueueFieldPatch(current, field, value);
    return { ...a.org_volume.queues, [q]: nextRow };
  }

  function setOrgQueue(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg' | 'region',
    value: string | number,
  ) {
    const queues = patchOrgQueueRow(q, field, value);
    onChange({ org_volume: { ...a.org_volume, queues }, org_volume_manual: true });
  }

  function commitOrgQueueField(
    q: FsQueueKey,
    field: 'users' | 'rp_rpo' | 'executors' | 'rg' | 'region',
    rawValue: string,
  ) {
    const trigger: OrgQueueCascadeTrigger = field === 'region' ? 'region' : field;
    const queues = patchOrgQueueRow(q, field, rawValue);
    const partial = applyOrgQueueCascade(queues, q, false, trigger);
    if (partial.filledTargets.length === 0) {
      if (!partial.changed) return;
      onChange({ org_volume: { ...a.org_volume, queues: partial.queues }, org_volume_manual: true });
      return;
    }
    const msg = buildOrgQueueCascadeConfirmMessage(q, partial.filledTargets, FS_QUEUE_LABELS);
    if (window.confirm(msg)) {
      const full = applyOrgQueueCascade(queues, q, true, trigger);
      if (!full.changed) return;
      onChange({ org_volume: { ...a.org_volume, queues: full.queues }, org_volume_manual: true });
    } else if (partial.changed) {
      onChange({ org_volume: { ...a.org_volume, queues: partial.queues }, org_volume_manual: true });
    }
  }

  function setRisk(key: keyof RisksC51C57, value: number) {
    if (!MANUAL_RISK_KEYS.has(key)) return;
    onChange({ risks: { ...a.risks, [key]: value }, risks_manual: true });
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
              <th className="p-2 border text-right">РГ</th>
              <th className="p-2 border text-left">Регион</th>
            </tr>
          </thead>
          <tbody>
            {FS_QUEUE_KEYS.map(q => {
              const row = a.org_volume.queues[q];
              return (
                <tr key={q}>
                  <td className="p-2 border font-medium">{FS_QUEUE_LABELS[q]}</td>
                  <td className="p-2 border text-center">
                    <input type="checkbox" checked={row.active} disabled
                      className="opacity-60" title="Из ФС (активные очереди)" />
                  </td>
                  {(['users', 'rp_rpo', 'executors', 'rg'] as const).map(field => {
                    const validatable = field === 'rp_rpo' || field === 'executors';
                    const isEmpty = validatable && row.active && isOrgVolumeFieldEmpty(row[field]);
                    return (
                      <td key={field} className="p-2 border">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className={`w-full text-right border rounded px-1 py-0.5 ${isEmpty ? ORG_EMPTY_CLASS : ''}`}
                          value={row[field] ?? ''}
                          onChange={e => setOrgQueue(q, field, e.target.value)}
                          onBlur={e => commitOrgQueueField(q, field, e.target.value)}
                          {...numericInputHandlers}
                        />
                      </td>
                    );
                  })}
                  <td className="p-2 border">
                    <input type="text"
                      className="w-full border rounded px-1 py-0.5"
                      value={row.region}
                      onChange={e => setOrgQueue(q, 'region', e.target.value)}
                      onBlur={e => commitOrgQueueField(q, 'region', e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
                      className={`w-full text-right border rounded px-2 py-1 ${a.risks_manual && a.risks[key] !== a.auto_risks[key] ? OVERRIDE_CLASS : ''}`}
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
