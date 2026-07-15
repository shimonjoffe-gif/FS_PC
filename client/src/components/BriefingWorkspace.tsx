import React, { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import type {
  BriefingFull, Industry, Segment, MaturityLevel, Problem, Solution, Widget,
  BriefingFsSel, BriefingSolutionSel, BriefingProblemSel, BriefingCustomerWidgetSel, BriefingParams,
  TeamProportions, BriefingFsDetailLine,
  FsQueueKey, FsQueuesMap, BriefingAssessment, QueueLabelsMap, FsNmdValue, FsCatalogItem,
  ActivityType, HypothesisListItem, CatalogLink, ProblemSolutionUsage, StakeholderRole,
} from '../types';
import {
  FS_QUEUE_KEYS, FS_QUEUE_LABELS, FS_NMD_VALUES, FS_FUNC_TYPE_VALUES,
  parseQueuesJson, parseQueueLabels, queueLabel,
  anyQueueEnabled, itemQueues,
} from '../types';
import { groupFsItemsSorted } from '../utils/fsDisplayGroups';
import {
  getBriefing, updateBriefing, saveBriefingProblems, saveBriefingSolutions,
  saveBriefingWidgets, saveBriefingCustomerWidgets, saveBriefingFs, saveBriefingParams, deriveBriefingFs,
  generateProjectFromBriefing, patchBriefingAssessment,
  getBriefingAvailableFsCatalogItems, addBriefingFsCatalogItems,
  getIndustries, getSegments, getSegmentsByIndustry, getMaturityLevels, getProblems, getSolutions,
  getProblemSolutionLinks,
  getWidgets, getWidgetsBySolution, getSolutionWidgetLinks, getWidgetFsLinks,
  getActivityTypes, getHypotheses, getSolutionFsLinksAll, getStakeholderRoles,
} from '../api';
import {
  applyAssessmentPatch, recomputeAssessmentDerived, computeAutoUnifiedRate, isUnifiedRateAutoMode,
  getEvaluatedQueueKeys, isQueueEvaluated,
  computeQueueSpFromFs,
  catalogSpForItem,
  catalogNmdLabel,
  effectiveFsItemSpForQueue,
  isFsItemSpManualForQueue,
  patchFsItemQueueSp,
  resetFsItemQueueSp,
  autoFsItemNmdValueForQueue,
  effectiveFsItemNmdValueForQueue,
  isFsItemNmdManualForQueue,
  patchFsItemQueueNmd,
  resetFsItemQueueNmd,
  effectiveFsItemCommentForQueue,
  patchFsItemQueueComment,
  appendFsItemQueueComment,
  relocateFsItemQueueOverrides,
  applyOrgQueueFieldPatch,
  resetTrainingEField,
  trainingEOrgField,
  type TrainingEField,
  isQueueSpUnset,
  effectiveFunctionalSp, autoLoadTestScenarios,
  QUEUE_TECHNOLOGY_OPTIONS, normalizeQueueTechnologyLabel,
} from '../assessmentCalc';
import { loadAssessmentNsi, type AssessmentNsiCache } from '../assessmentNsi';
import AssessmentTab from './AssessmentTab';
import PhaseCalcTable from './PhaseCalcTable';
import PhaseCalcParamsPanel from './PhaseCalcParamsPanel';
import FsItemCardModal from './FsItemCardModal';
import BriefingSolutionCardModal from './BriefingSolutionCardModal';
import BriefingWidgetCardModal from './BriefingWidgetCardModal';
import {
  CustomProblemCards,
  CustomProblemLinkModal,
  CustomProblemSolutionsModal,
  type FsItemTrace,
} from './CustomProblemPanels';
import {
  CustomerWidgetsPanel,
  WidgetSolutionsPickModal,
} from './CustomerWidgetsPanel';
import { WidgetImageThumbnail } from './WidgetImagePreview';
import { WidgetGroupedSections } from './WidgetGroupedList';
import { countGroupUserItems, fsDetailLineFlags } from '../fsDetailLines';
import {
  buildFsItemOptions,
  countCustomerDetailLines,
  moveCommentBetweenItems,
  moveCustomerDetailLine,
  patchAllQueuesNo,
} from '../fsRelocation';
import {
  effectiveSolutionCommentForQueue,
  hasSolutionQueueComment,
  makeSolutionSelection,
  moveSolutionCommentBetween,
  patchSolutionQueueComment,
  serializeSolutionQueueCommentForSave,
  withSolutionGroupParentOnQueue,
} from '../solutionCommentRelocation';
import {
  createCustomerFsItem,
  isCustomerFsGroupPrefix,
  isCustomerFsItem,
  patchCustomerFuncType,
  type CustomerFsGroupPrefix,
} from '../fsCustomerItems';
import CollapsibleSection from './CollapsibleSection';
import QueueSwitcher from './QueueSwitcher';
import AssessmentScenariosTab from './AssessmentScenariosTab';
import BriefingVersionBar from './BriefingVersionBar';
import {
  BriefingReadOnlyContext,
  BriefingReadOnlyLayer,
  YesNoButton,
  useBriefingReadOnly,
} from '../briefingReadOnly';
import { computeSummaryScenarioMatrix } from '../summaryScenarioMatrix';
import {
  mergePhaseCalcParams,
  resetQueuePhaseParamToAuto,
  resetQueuePhaseParamToBaseQueue,
  resetQueueRdModeToAuto,
  resetQueueRdModeToBaseQueue,
  resetHeadcountOpeToAuto,
  resetHeadcountOpeToBaseQueue,
  patchTrainingManualGh,
  resetTrainingManualGh,
  patchTrainingEManual,
  resetTrainingEManual,
  patchC89Manual,
  resetC89Manual,
  type TrainingRowKey,
  type PhaseCalcNumericKey,
} from '../phaseCalcParams';
import { computeAutoC89FromR81 } from '../phaseCalc';
import { DEFAULT_TEAM } from '../teamLabels';
import { yesNoLabel, yesNoClass } from '../utils/yesNoBadge';
import {
  buildSolutionDisplayUnits,
  collectSolutionWithAncestors,
  type SolutionDisplayUnit,
} from '../utils/solutionDisplayGroups';
import {
  aggregateProblemGroupSelected,
  buildProblemDisplayUnits,
  collectProblemWithAncestors,
  type ProblemDisplayUnit,
} from '../utils/problemDisplayGroups';
import { numericInputHandlers } from '../utils/numericInputHandlers';
import { OverridableNumberInput } from './OverridableNumberInput';

type Tab = 'customer' | 'widgets' | 'solutions' | 'fs' | 'assessment' | 'params' | 'scenarios';

const TABS: { id: Tab; label: string }[] = [
  { id: 'customer', label: 'Заказчик' },
  { id: 'widgets', label: 'Виджеты' },
  { id: 'solutions', label: 'Решения + виджеты' },
  { id: 'fs', label: 'ФС + очереди' },
  { id: 'assessment', label: 'Параметры оценки' },
  { id: 'params', label: 'Оценка РП' },
  { id: 'scenarios', label: 'Варианты оценки' },
];

const SCENARIOS = ['Кейс', 'ПРОФ', 'Совм.запуск'];

const HEADCOUNT_CATEGORIES = ['до 200', '201-500', '501-1000', '1001+'] as const;

function categoryToHeadcount(cat: string): number {
  const map: Record<string, number> = { 'до 200': 200, '201-500': 350, '501-1000': 750, '1001+': 1500 };
  return map[cat] ?? 200;
}

const OVERRIDE_INPUT_CLASS = 'bg-amber-50 border-amber-300';
const CALCULATED_SP_CLASS = 'bg-sky-50 border-sky-300';

const SAVE_BTN_CLASS =
  'text-sm bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50';

type FsYesFilter = null | 'all' | FsQueueKey;

function itemMatchesYesFilter(item: BriefingFsSel, filter: FsYesFilter): boolean {
  if (!filter) return true;
  const queues = itemQueues(item);
  if (filter === 'all') return anyQueueEnabled(queues);
  return queues[filter] === 1;
}

function FsFilterableTh({
  active,
  onToggle,
  title,
  className = '',
  rowSpan,
  colSpan,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  title: string;
  className?: string;
  rowSpan?: number;
  colSpan?: number;
  children: React.ReactNode;
}) {
  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`border bg-slate-50 cursor-pointer select-none transition-colors ${
        active ? 'bg-blue-100 ring-2 ring-inset ring-blue-400 text-blue-900' : 'hover:bg-slate-100'
      } ${className}`}
      title={title}
      onClick={onToggle}
    >
      {children}
      {active && <div className="text-[9px] font-normal text-blue-600 mt-0.5">только «Да»</div>}
    </th>
  );
}

function queueTotals(items: BriefingFsSel[]) {
  return computeQueueSpFromFs(items);
}

const QUEUE_SUBCOLS = 3;

function hasFsItemQueueComment(item: BriefingFsSel, q: FsQueueKey): boolean {
  return effectiveFsItemCommentForQueue(item, q).trim().length > 0;
}

function QueueCommentModal({
  title,
  subtitle,
  initialText,
  onClose,
  onSave,
}: {
  title: string;
  subtitle: string;
  initialText: string;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initialText);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800">{title}</div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate" title={subtitle}>
              {subtitle}
            </div>
          </div>
          <button
            type="button"
            data-readonly-allow
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <textarea
            className="w-full min-h-[120px] text-sm border border-slate-200 rounded-lg px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={draft}
            placeholder="Комментарий по очереди…"
            autoFocus
            onChange={e => setDraft(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            data-readonly-allow
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            onClick={() => onSave(draft)}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function FsQueueCommentModal({
  item,
  queueKey,
  queueLabels,
  onClose,
  onSave,
}: {
  item: BriefingFsSel;
  queueKey: FsQueueKey;
  queueLabels: QueueLabelsMap;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const qLabel = queueLabel(queueLabels, queueKey);
  return (
    <QueueCommentModal
      title={`Комментарий — ${qLabel}`}
      subtitle={`${item.prefix ? `${item.prefix} · ` : ''}${item.name}`}
      initialText={effectiveFsItemCommentForQueue(item, queueKey)}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function parseJsonRecord<T extends Record<string, unknown>>(raw: string | T | null | undefined): T | null {
  if (!raw) return null;
  if (typeof raw === 'object') return Object.keys(raw).length > 0 ? raw : null;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function serializeQueueSpForSave(
  item: BriefingFsSel,
): Record<string, number> | null {
  return parseJsonRecord<Record<string, number>>(item.queue_sp_json);
}

function serializeQueueNmdForSave(item: BriefingFsSel): Record<string, FsNmdValue> | null {
  const overrides: Partial<Record<FsQueueKey, FsNmdValue>> = {};
  for (const q of FS_QUEUE_KEYS) {
    if (isFsItemNmdManualForQueue(item, q)) {
      overrides[q] = effectiveFsItemNmdValueForQueue(item, q);
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}

function serializeQueueCommentForSave(item: BriefingFsSel): Record<string, string> | null {
  return parseJsonRecord<Record<string, string>>(item.queue_comment_json);
}

function serializeDetailLines(item: BriefingFsSel) {
  const lines = item.detail_lines ?? [];
  return lines
    .filter(l => l.name?.trim())
    .map((l, i) => ({
      catalog_detail_id: l.catalog_detail_id ?? null,
      source: l.source,
      name: l.name.trim(),
      description: l.description?.trim() || null,
      inactive: l.inactive ?? false,
      nsi_name: l.nsi_name ?? null,
      nsi_description: l.nsi_description ?? null,
      sort_order: l.sort_order ?? i,
    }));
}

function briefingFsItemPayload(item: BriefingFsSel, opts?: { forceManual?: boolean }) {
  const queues = itemQueues(item);
  return {
    fs_item_id: item.fs_item_id,
    enabled: anyQueueEnabled(queues) ? 1 : 0,
    queue: FS_QUEUE_KEYS.find(k => queues[k] === 1) ?? item.queue ?? '1',
    queues_json: JSON.stringify(queues),
    source: opts?.forceManual ? 'manual' : (item.source ?? undefined),
    queue_sp_json: serializeQueueSpForSave(item),
    queue_nmd_json: serializeQueueNmdForSave(item),
    queue_comment_json: serializeQueueCommentForSave(item),
    inactive_for_customer: item.inactive_for_customer ?? false,
    detail_lines: serializeDetailLines(item),
  };
}

function briefingCustomerFsItemPayload(item: BriefingFsSel) {
  const queues = itemQueues(item);
  return {
    id: item.customer_item_id,
    group_prefix: item.group_prefix ?? '10',
    name: item.name ?? '',
    description: item.description ?? null,
    func_type: item.func_type ?? 'ПРОФ',
    story_points: catalogSpForItem(item),
    queues_json: JSON.stringify(queues),
    queue_sp_json: serializeQueueSpForSave(item),
    queue_nmd_json: serializeQueueNmdForSave(item),
    queue_comment_json: serializeQueueCommentForSave(item),
    detail_lines: serializeDetailLines(item),
    inactive_for_customer: item.inactive_for_customer ?? false,
  };
}

function buildFsSavePayload(allItems: BriefingFsSel[]) {
  return {
    items: allItems
      .filter(i => !isCustomerFsItem(i))
      .map(i => briefingFsItemPayload(i)),
    customer_items: allItems
      .filter(i => isCustomerFsItem(i) && i.name?.trim())
      .map(briefingCustomerFsItemPayload),
  };
}

function groupFsItems(items: BriefingFsSel[]): { group: string; groupPrefix: string | null; items: BriefingFsSel[] }[] {
  return groupFsItemsSorted(items);
}

function itemQueueFlags(item: BriefingFsSel): { allOn: boolean; byQueue: Record<FsQueueKey, boolean> } {
  const queues = itemQueues(item);
  return {
    allOn: anyQueueEnabled(queues),
    byQueue: Object.fromEntries(
      FS_QUEUE_KEYS.map(q => [q, queues[q] === 1]),
    ) as Record<FsQueueKey, boolean>,
  };
}

function aggregateGroupQueues(groupItems: BriefingFsSel[]): { allOn: boolean; byQueue: Record<FsQueueKey, boolean> } {
  const byQueue = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, false])) as Record<FsQueueKey, boolean>;
  let allOn = false;
  for (const item of groupItems) {
    const flags = itemQueueFlags(item);
    if (flags.allOn) allOn = true;
    for (const q of FS_QUEUE_KEYS) {
      if (flags.byQueue[q]) byQueue[q] = true;
    }
  }
  return { allOn, byQueue };
}

function solutionSelectionQueue(sel: BriefingSolutionSel): FsQueueKey {
  const q = String(sel.queue ?? '1') as FsQueueKey;
  return FS_QUEUE_KEYS.includes(q) ? q : '1';
}

function aggregateSolutionGroupQueues(
  members: Solution[],
  selected: BriefingSolutionSel[],
): { allOn: boolean; byQueue: Record<FsQueueKey, boolean> } {
  const byQueue = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, false])) as Record<FsQueueKey, boolean>;
  let allOn = false;
  for (const member of members) {
    const sel = selected.find(s => s.id === member.id);
    if (!sel) continue;
    allOn = true;
    byQueue[solutionSelectionQueue(sel)] = true;
  }
  return { allOn, byQueue };
}

type FsDragPayload =
  | { kind: 'queue'; fsItemId: number; fromQueue: FsQueueKey }
  | { kind: 'comment'; fsItemId: number; fromQueue: FsQueueKey };

type SolutionDragPayload = { kind: 'comment'; solutionId: number; fromQueue: FsQueueKey };

function FsCatalogAddModal({
  items,
  loading,
  onClose,
  onConfirm,
}: {
  items: FsCatalogItem[];
  loading: boolean;
  onClose: () => void;
  onConfirm: (ids: number[]) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const grouped = useMemo(() => groupFsItemsSorted(items), [items]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-800">Добавить пункты из НСИ</div>
          <p className="text-xs text-slate-500 mt-1">Опубликованные пункты каталога, которых ещё нет в этой оценке</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {loading ? (
            <p className="text-slate-400">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="text-slate-400">Нет доступных пунктов для добавления</p>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ group, items: groupItems }) => (
                <div key={group}>
                  <div className="font-semibold text-slate-700 mb-1">{group}</div>
                  <div className="space-y-1">
                    {groupItems.map(item => (
                      <label key={item.id} className="flex items-start gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0"
                          checked={selected.has(item.id)}
                          onChange={() => toggle(item.id)}
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800">
                            <span className="text-slate-400 font-normal mr-1">{item.prefix || '—'}</span>
                            {item.name}
                          </div>
                          {item.func_type && (
                            <div className="text-[10px] text-slate-400">{item.func_type} · SP {item.story_points}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-100">
          <button type="button" className="text-sm px-3 py-1.5 rounded text-slate-500 hover:bg-slate-50" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            disabled={selected.size === 0 || loading}
            onClick={() => onConfirm([...selected])}
          >
            Добавить ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

function FsChoiceModal({
  title,
  message,
  options,
  onClose,
}: {
  title: string;
  message: string;
  options: { id: string; label: string }[];
  onClose: (id: string | null) => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => onClose(null)}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-4" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <p className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{message}</p>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          {options.map(opt => (
            <button
              key={opt.id}
              type="button"
              className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={() => onClose(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded text-slate-500 hover:bg-slate-50"
            onClick={() => onClose(null)}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableQueueHeader({
  label,
  onChange,
}: {
  label: string;
  onChange: (next: string) => void;
}) {
  const readOnly = useBriefingReadOnly();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    setDraft(label);
  }, [label]);

  if (readOnly) {
    return <span className="w-full text-center truncate">{label}</span>;
  }

  if (editing) {
    return (
      <input
        type="text"
        className="w-full min-w-[4.5rem] text-center text-[10px] border border-blue-300 rounded px-1 py-0.5 bg-white"
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          onChange(draft);
          setEditing(false);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            onChange(draft);
            setEditing(false);
          }
          if (e.key === 'Escape') {
            setDraft(label);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="w-full text-center hover:text-blue-600 truncate"
      title="Клик — переименовать очередь"
      onClick={() => setEditing(true)}
    >
      {label}
    </button>
  );
}

function briefingActivityTypeIds(data: Pick<BriefingFull, 'activity_type_ids' | 'industry_ids' | 'industry_id'>): number[] {
  if (data.activity_type_ids?.length) return data.activity_type_ids;
  return [];
}

function hypothesisMatchesCustomerFilter(h: HypothesisListItem, data: BriefingFull): boolean {
  const activityIds = briefingActivityTypeIds(data);
  if (activityIds.length > 0) {
    const hypActs = h.activity_type_ids ?? [];
    if (!activityIds.some(id => hypActs.includes(id))) return false;
  }
  if (data.segment_id != null) {
    const segs = h.segment_ids ?? [];
    if (!segs.includes(data.segment_id)) return false;
  }
  const roleIds = data.stakeholder_role_ids ?? [];
  if (roleIds.length > 0) {
    const hypRoles = h.stakeholder_role_ids ?? [];
    if (!roleIds.some(id => hypRoles.includes(id))) return false;
  }
  return true;
}

function ChipMultiSelect({
  items,
  selectedIds,
  onChange,
  emptyLabel = 'Справочник пуст',
  navigationOnly = false,
}: {
  items: { id: number; name: string }[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  emptyLabel?: string;
  /** Фильтр просмотра — доступен и в замороженной версии. */
  navigationOnly?: boolean;
}) {
  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  }

  if (items.length === 0) {
    return <p className="text-xs text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => {
        const on = selectedIds.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            {...(navigationOnly ? { 'data-readonly-allow': true } : {})}
            className={`text-[11px] leading-tight px-1.5 py-0.5 rounded border whitespace-nowrap ${
              on ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => toggle(item.id)}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

function ProblemsSelectTable({
  units,
  selectedIds,
  getFilterMismatchHint,
  solutionsByProblemId,
  onProblemsChange,
}: {
  units: ProblemDisplayUnit[];
  selectedIds: Set<number>;
  getFilterMismatchHint: (problemId: number) => string | null;
  solutionsByProblemId: Map<number, ProblemSolutionUsage[]>;
  onProblemsChange: (changes: { problemId: number; selected: boolean }[]) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(() => new Set());
  const [expandedSolutions, setExpandedSolutions] = useState<Set<number>>(() => new Set());

  function toggleGroup(parentId: number) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  function toggleSolutionsExpand(problemId: number) {
    setExpandedSolutions(prev => {
      const next = new Set(prev);
      if (next.has(problemId)) next.delete(problemId);
      else next.add(problemId);
      return next;
    });
  }

  function toggleProblem(
    problem: Problem,
    group?: { parentId: number; siblings: Problem[] },
  ) {
    const isYes = selectedIds.has(problem.id);
    const changes: { problemId: number; selected: boolean }[] = [];

    if (isYes) {
      changes.push({ problemId: problem.id, selected: false });
      if (group) {
        const anySibling = group.siblings
          .some(s => s.id !== problem.id && selectedIds.has(s.id));
        if (!anySibling) {
          changes.push({ problemId: group.parentId, selected: false });
        }
      }
    } else {
      changes.push({ problemId: problem.id, selected: true });
      if (group) {
        changes.push({ problemId: group.parentId, selected: true });
      }
    }

    onProblemsChange(changes);
  }

  function renderProblemMeta(problem: Problem) {
    const meta = [problem.segment_name, problem.maturity_name].filter(Boolean).join(' · ');
    if (!meta) return null;
    return <div className="text-[10px] text-slate-400 mt-0.5">{meta}</div>;
  }

  function renderRow(
    problem: Problem,
    opts: {
      indent?: number;
      variant: 'parent' | 'child' | 'standalone';
      groupParentId?: number;
      groupChildren?: Problem[];
      groupSiblings?: Problem[];
    },
  ) {
    const isGroupParent = opts.variant === 'parent' && (opts.groupChildren?.length ?? 0) > 0;
    const groupMembers = isGroupParent ? [problem, ...(opts.groupChildren ?? [])] : [problem];
    const groupSelected = isGroupParent
      ? aggregateProblemGroupSelected(groupMembers, selectedIds)
      : selectedIds.has(problem.id);
    const isYes = groupSelected;
    const mismatchHint = getFilterMismatchHint(problem.id);
    const unmatched = mismatchHint != null;
    const titleClass = opts.variant === 'parent'
      ? 'text-sm font-semibold text-slate-800'
      : opts.variant === 'child'
        ? 'text-sm font-medium text-slate-700'
        : 'text-sm font-medium text-slate-800';
    const groupCtx = opts.variant === 'child' && opts.groupParentId != null && opts.groupSiblings
      ? { parentId: opts.groupParentId, siblings: opts.groupSiblings }
      : undefined;
    const solutions = solutionsByProblemId.get(problem.id) ?? [];
    const solutionsExpanded = expandedSolutions.has(problem.id);

    return (
      <tr
        key={problem.id}
        className={`${isYes ? 'bg-blue-50/20' : ''} ${opts.variant === 'parent' ? 'bg-amber-50/40' : ''}`}
      >
        <td className="p-2 border align-top" style={{ paddingLeft: `${8 + (opts.indent ?? 0)}px` }}>
          <div className="flex items-start gap-1">
            {opts.variant === 'parent' && opts.groupParentId != null ? (
              <button
                type="button"
                data-readonly-allow
                className="text-slate-500 hover:text-slate-800 w-5 h-5 leading-none shrink-0 mt-0.5"
                title={collapsedGroups.has(opts.groupParentId) ? 'Развернуть группу' : 'Свернуть группу'}
                onClick={() => toggleGroup(opts.groupParentId!)}
              >
                {collapsedGroups.has(opts.groupParentId) ? '▶' : '▼'}
              </button>
            ) : (
              <span className="w-5 shrink-0" aria-hidden />
            )}
            {solutions.length > 0 ? (
              <button
                type="button"
                data-readonly-allow
                className="text-slate-400 hover:text-slate-700 shrink-0 mt-0.5 text-[10px] leading-none px-0.5"
                title="Показать/скрыть решения"
                onClick={() => toggleSolutionsExpand(problem.id)}
              >
                {solutionsExpanded ? '▾' : '▸'} реш. ({solutions.length})
              </button>
            ) : null}
            <div className="min-w-0">
              <div className={`${titleClass} ${unmatched ? 'italic text-slate-500' : ''}`}>
                {problem.catalog_code ? (
                  <span className="text-slate-400 font-normal mr-1 font-mono text-[11px]">{problem.catalog_code}</span>
                ) : null}
                {problem.name}
              </div>
              {renderProblemMeta(problem)}
              {mismatchHint && (
                <div className="text-[10px] text-slate-400 italic mt-0.5">
                  {mismatchHint}
                </div>
              )}
              {solutionsExpanded && solutions.length > 0 && (
                <ul className="mt-1.5 pl-2 border-l-2 border-slate-200 space-y-0.5">
                  {solutions.map(solution => (
                    <li key={solution.id} className="text-[11px] text-slate-600">
                      <span className="text-slate-400 font-mono mr-1">
                        {solution.catalog_code ?? solution.lcm_code ?? '—'}
                      </span>
                      {solution.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </td>
        <td className="p-1 border text-center align-top w-24">
          {isGroupParent ? (
            <span className={`inline-block px-2 py-0.5 rounded min-w-[36px] ${yesNoClass(isYes)}`}>
              {yesNoLabel(isYes)}
            </span>
          ) : (
            <YesNoButton
              isYes={isYes}
              unmatched={!isYes && unmatched}
              title={isYes ? 'Клик — снять выбор' : 'Клик — выбрать проблематику'}
              onClick={() => toggleProblem(problem, groupCtx)}
            />
          )}
        </td>
      </tr>
    );
  }

  const totalRows = units.reduce((n, u) => {
    if (u.kind === 'group') return n + 1 + (collapsedGroups.has(u.parent.id) ? 0 : u.children.length);
    return n + 1;
  }, 0);

  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-xs border-collapse min-w-[480px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 text-slate-600">
            <th className="text-left p-2 border min-w-[280px] bg-slate-50">Проблематика</th>
            <th className="text-center p-2 border w-24 bg-slate-50">Да/Нет</th>
          </tr>
        </thead>
        <tbody>
          {totalRows === 0 && (
            <tr>
              <td colSpan={2} className="p-4 text-center text-slate-400">
                Нет проблематик для отображения. Укажите виды деятельности/сегмент или нажмите «Показать все».
              </td>
            </tr>
          )}
          {units.map(unit => {
            if (unit.kind === 'group') {
              const rows = [
                renderRow(unit.parent, {
                  variant: 'parent',
                  groupParentId: unit.parent.id,
                  groupChildren: unit.children,
                }),
              ];
              if (!collapsedGroups.has(unit.parent.id)) {
                for (const child of unit.children) {
                  rows.push(renderRow(child, {
                    variant: 'child',
                    indent: 12,
                    groupParentId: unit.parent.id,
                    groupSiblings: unit.children,
                  }));
                }
              }
              return <React.Fragment key={`g-${unit.parent.id}`}>{rows}</React.Fragment>;
            }
            return renderRow(unit.item, { variant: 'standalone' });
          })}
        </tbody>
      </table>
    </div>
  );
}

function SolutionsQueueTable({
  units,
  isUnmatched,
  selected,
  solutionWidgets,
  widgetSelections,
  queueLabels,
  onQueueLabelChange,
  onSolutionsChange,
  onToggleWidget,
  onOpenSolution,
  onOpenWidgetCard,
}: {
  units: SolutionDisplayUnit[];
  isUnmatched: (solutionId: number) => boolean;
  selected: BriefingSolutionSel[];
  solutionWidgets: Record<number, Widget[]>;
  widgetSelections: { solution_id: number; widget_id: number }[];
  queueLabels: QueueLabelsMap;
  onQueueLabelChange: (q: FsQueueKey, label: string) => void;
  onSolutionsChange: (changes: { solutionId: number; next: BriefingSolutionSel | null }[]) => void;
  onToggleWidget: (solutionId: number, widgetId: number) => void;
  onOpenSolution: (sol: Solution) => void;
  onOpenWidgetCard: (widgetId: number) => void;
}) {
  const [commentModal, setCommentModal] = useState<{ sol: BriefingSolutionSel; q: FsQueueKey } | null>(null);
  const [dragPayload, setDragPayload] = useState<SolutionDragPayload | null>(null);
  const [commentMergePrompt, setCommentMergePrompt] = useState<{
    source: BriefingSolutionSel;
    target: Solution;
    fromQueue: FsQueueKey;
    toQueue: FsQueueKey;
  } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(() => new Set());

  const solutionById = useMemo(() => {
    const map = new Map<number, Solution>();
    for (const unit of units) {
      if (unit.kind === 'group') {
        map.set(unit.parent.id, unit.parent);
        for (const child of unit.children) map.set(child.id, child);
      } else {
        map.set(unit.item.id, unit.item);
      }
    }
    return map;
  }, [units]);

  function findSelected(solutionId: number): BriefingSolutionSel | undefined {
    return selected.find(s => s.id === solutionId);
  }

  function toggleSolutionQueue(
    sol: Solution,
    q: FsQueueKey,
    group?: { parentId: number; siblings: Solution[] },
  ) {
    const cur = findSelected(sol.id);
    const changes: { solutionId: number; next: BriefingSolutionSel | null }[] = [];

    if (cur && solutionSelectionQueue(cur) === q) {
      changes.push({ solutionId: sol.id, next: null });
      if (group) {
        const anySiblingSelected = group.siblings
          .some(s => s.id !== sol.id && findSelected(s.id));
        if (!anySiblingSelected) {
          changes.push({ solutionId: group.parentId, next: null });
        }
      }
    } else {
      changes.push({ solutionId: sol.id, next: makeSolutionSelection(sol, q, cur) });
      if (group) {
        const parent = solutionById.get(group.parentId);
        if (parent) {
          changes.push({
            solutionId: group.parentId,
            next: makeSolutionSelection(parent, q, findSelected(group.parentId)),
          });
        }
      }
    }

    onSolutionsChange(changes);
  }

  function openCommentModal(sol: Solution, q: FsQueueKey) {
    const sel = findSelected(sol.id);
    if (!sel || solutionSelectionQueue(sel) !== q) return;
    setCommentModal({ sol: sel, q });
  }

  function endCommentDrag() {
    setDragPayload(null);
  }

  function startCommentDrag(e: React.DragEvent, sol: Solution, fromQueue: FsQueueKey) {
    e.stopPropagation();
    const payload: SolutionDragPayload = { kind: 'comment', solutionId: sol.id, fromQueue };
    setDragPayload(payload);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-solution-comment', JSON.stringify(payload));
  }

  function applyCommentMove(
    sourceSel: BriefingSolutionSel,
    targetSol: Solution,
    fromQueue: FsQueueKey,
    toQueue: FsQueueKey,
    mode: 'merge' | 'replace',
  ) {
    const targetSel = findSelected(targetSol.id);
    let changes = moveSolutionCommentBetween(sourceSel, targetSol, targetSel, fromQueue, toQueue, mode);
    changes = withSolutionGroupParentOnQueue(
      changes,
      targetSol,
      toQueue,
      [...solutionById.values()],
      findSelected,
    );
    if (changes.length) onSolutionsChange(changes);
  }

  function handleCommentDrop(e: React.DragEvent, targetSol: Solution, targetQueue: FsQueueKey) {
    e.preventDefault();
    e.stopPropagation();
    let payload = dragPayload?.kind === 'comment' ? dragPayload : null;
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/x-solution-comment')) as SolutionDragPayload;
        if (payload.kind !== 'comment') return;
      } catch {
        return;
      }
    }
    setDragPayload(null);
    if (payload.solutionId === targetSol.id && payload.fromQueue === targetQueue) return;

    const sourceSel = findSelected(payload.solutionId);
    if (!sourceSel) return;
    const targetSel = findSelected(targetSol.id);
    const existing = targetSel ? effectiveSolutionCommentForQueue(targetSel, targetQueue).trim() : '';
    if (existing) {
      setCommentMergePrompt({
        source: sourceSel,
        target: targetSol,
        fromQueue: payload.fromQueue,
        toQueue: targetQueue,
      });
      return;
    }
    applyCommentMove(sourceSel, targetSol, payload.fromQueue, targetQueue, 'replace');
  }

  function renderCommentCell(sol: Solution, q: FsQueueKey, readOnly = false) {
    if (readOnly) {
      return <td key={`${sol.id}-${q}-comment`} className="p-1 border text-center align-middle w-9 min-h-[2rem]" />;
    }
    const sel = findSelected(sol.id);
    const canComment = !!sel && solutionSelectionQueue(sel) === q;
    const hasComment = canComment && hasSolutionQueueComment(sel, q);
    const isCommentDropTarget = dragPayload?.kind === 'comment'
      && (dragPayload.solutionId !== sol.id || dragPayload.fromQueue !== q);
    const cellClass = `p-1 border text-center align-middle w-9 min-h-[2rem] ${
      isCommentDropTarget ? 'bg-amber-50 ring-2 ring-inset ring-amber-300' : ''
    } ${canComment || isCommentDropTarget ? 'cursor-pointer hover:bg-slate-50' : ''}`;

    if (!hasComment) {
      return (
        <td
          key={`${sol.id}-${q}-comment`}
          className={cellClass}
          onClick={() => openCommentModal(sol, q)}
          onDragOver={e => {
            if (dragPayload?.kind === 'comment') e.preventDefault();
          }}
          onDrop={e => handleCommentDrop(e, sol, q)}
          title={canComment ? 'Добавить комментарий' : 'Перетащите комментарий сюда'}
          aria-label={canComment ? 'Добавить комментарий' : 'Принять комментарий'}
        />
      );
    }

    return (
      <td
        key={`${sol.id}-${q}-comment`}
        className={cellClass}
        onDragOver={e => {
          if (dragPayload?.kind === 'comment') e.preventDefault();
        }}
        onDrop={e => handleCommentDrop(e, sol, q)}
      >
        <button
          type="button"
          draggable
          onDragStart={e => startCommentDrag(e, sol, q)}
          onDragEnd={endCommentDrag}
          onClick={() => openCommentModal(sol, q)}
          className="w-7 h-7 mx-auto rounded inline-flex items-center justify-center text-amber-700 bg-amber-100 hover:bg-amber-200 ring-1 ring-amber-300/60 cursor-grab active:cursor-grabbing"
          title="Перетащите на комментарий другого решения или клик — открыть"
          aria-label="Есть комментарий"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden>
            <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v5A1.5 1.5 0 0 1 12.5 10H9l-2.5 2.5V10H3.5A1.5 1.5 0 0 1 2 8.5v-5Z" />
          </svg>
        </button>
      </td>
    );
  }

  function toggleGroup(parentId: number) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  function renderSolutionRow(
    sol: Solution,
    opts: {
      indent?: number;
      variant: 'parent' | 'child' | 'standalone';
      groupParentId?: number;
      groupChildren?: Solution[];
      groupSiblings?: Solution[];
    },
  ) {
    const sel = findSelected(sol.id);
    const isGroupParent = opts.variant === 'parent' && (opts.groupChildren?.length ?? 0) > 0;
    const groupMembers = isGroupParent ? [sol, ...(opts.groupChildren ?? [])] : [];
    const groupQueues = isGroupParent
      ? aggregateSolutionGroupQueues(groupMembers, selected)
      : null;
    const isSelected = isGroupParent ? groupQueues!.allOn : !!sel;
    const widgets = solutionWidgets[sol.id] ?? [];
    const unmatchedProblem = isUnmatched(sol.id);
    const titleClass = opts.variant === 'parent'
      ? 'text-sm font-semibold text-slate-800'
      : opts.variant === 'child'
        ? 'text-sm font-medium text-slate-700'
        : 'text-sm font-medium text-slate-800';

    return (
      <tr
        key={sol.id}
        className={`${isSelected ? 'bg-blue-50/20' : ''} ${opts.variant === 'parent' ? 'bg-amber-50/40' : ''}`}
      >
        <td className="p-2 border align-top" style={{ paddingLeft: `${8 + (opts.indent ?? 0)}px` }}>
          <div className="flex items-start gap-1">
            {opts.variant === 'parent' && opts.groupParentId != null ? (
              <button
                type="button"
                data-readonly-allow
                className="text-slate-500 hover:text-slate-800 w-5 h-5 leading-none shrink-0 mt-0.5"
                title={collapsedGroups.has(opts.groupParentId) ? 'Развернуть группу' : 'Свернуть группу'}
                onClick={() => toggleGroup(opts.groupParentId!)}
              >
                {collapsedGroups.has(opts.groupParentId) ? '▶' : '▼'}
              </button>
            ) : (
              <span className="w-5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0">
              <button
                type="button"
                data-readonly-allow
                className={`text-left w-full hover:text-blue-700 ${titleClass} ${unmatchedProblem ? 'italic text-slate-500' : ''}`}
                onClick={() => onOpenSolution(sol)}
                title="Открыть карточку решения"
              >
                {sol.catalog_code ? (
                  <span className="text-slate-400 font-normal mr-1 font-mono text-[11px]">{sol.catalog_code}</span>
                ) : null}
                {sol.name}
              </button>
              {sol.description && (
                <div className={`text-[10px] text-slate-500 mt-0.5 line-clamp-3 ${unmatchedProblem ? 'italic' : ''}`}>
                  {sol.description}
                </div>
              )}
              {unmatchedProblem && (
                <div className="text-[10px] text-slate-400 italic mt-0.5">не связано с выбранными проблематиками</div>
              )}
            </div>
          </div>
        </td>
        <td className="p-2 border align-top">
          {!isSelected && <span className="text-slate-300">—</span>}
          {isSelected && widgets.length === 0 && (
            <span className="text-[10px] text-slate-400">Нет виджетов</span>
          )}
          {isSelected && widgets.length > 0 && (
            <WidgetGroupedSections
              widgets={widgets}
              className="space-y-1"
              renderWidget={w => (
                <label key={w.id} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={widgetSelections.some(
                      bw => bw.solution_id === sol.id && bw.widget_id === w.id,
                    )}
                    onChange={() => onToggleWidget(sol.id, w.id)}
                  />
                  <WidgetImageThumbnail
                    key={w.id}
                    widgetId={w.id}
                    onOpenWidgetCard={onOpenWidgetCard}
                    imagePath={w.image_path}
                    name={w.name}
                    className="w-12 h-8 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
                  />
                  <div className="min-w-0">
                    <div className="text-xs">{w.name}</div>
                  </div>
                </label>
              )}
            />
          )}
        </td>
        {FS_QUEUE_KEYS.flatMap(q => {
          const isYes = isGroupParent
            ? groupQueues!.byQueue[q]
            : sel ? solutionSelectionQueue(sel) === q : false;
          const unmatched = !isSelected;
          const groupCtx = opts.variant === 'child' && opts.groupParentId != null && opts.groupSiblings
            ? { parentId: opts.groupParentId, siblings: opts.groupSiblings }
            : undefined;
          return [
            <td key={`${sol.id}-${q}-yes`} className="p-1 border text-center align-top">
              {isGroupParent ? (
                <span className={`inline-block px-2 py-0.5 rounded min-w-[36px] ${yesNoClass(isYes)}`}>
                  {yesNoLabel(isYes)}
                </span>
              ) : (
                <YesNoButton
                  isYes={isYes}
                  unmatched={unmatched && !isYes}
                  title={isYes ? 'Клик — снять решение с очереди' : 'Клик — назначить решение в очередь'}
                  onClick={() => toggleSolutionQueue(sol, q, groupCtx)}
                />
              )}
            </td>,
            renderCommentCell(sol, q, isGroupParent),
          ];
        })}
      </tr>
    );
  }

  const totalRows = units.reduce((n, u) => {
    if (u.kind === 'group') return n + 1 + (collapsedGroups.has(u.parent.id) ? 0 : u.children.length);
    return n + 1;
  }, 0);

  return (
    <>
      {commentModal && (
        <QueueCommentModal
          key={`${commentModal.sol.id}-${commentModal.q}`}
          title={`Комментарий — ${queueLabel(queueLabels, commentModal.q)}`}
          subtitle={commentModal.sol.name}
          initialText={effectiveSolutionCommentForQueue(commentModal.sol, commentModal.q)}
          onClose={() => setCommentModal(null)}
          onSave={text => {
            const cur = findSelected(commentModal.sol.id);
            if (!cur) {
              setCommentModal(null);
              return;
            }
            onSolutionsChange([{
              solutionId: commentModal.sol.id,
              next: { ...cur, ...patchSolutionQueueComment(cur, commentModal.q, text) },
            }]);
            setCommentModal(null);
          }}
        />
      )}
      {commentMergePrompt && (
        <FsChoiceModal
          title="Комментарий у решения-цели"
          message="У выбранного решения в этой очереди уже есть комментарий. Как перенести?"
          options={[
            { id: 'merge', label: 'Дописать' },
            { id: 'replace', label: 'Заменить' },
          ]}
          onClose={choice => {
            const pending = commentMergePrompt;
            setCommentMergePrompt(null);
            if (!choice || !pending) return;
            applyCommentMove(
              pending.source,
              pending.target,
              pending.fromQueue,
              pending.toQueue,
              choice === 'merge' ? 'merge' : 'replace',
            );
          }}
        />
      )}
      <div className="overflow-x-auto border rounded">
      <table className="w-full text-xs border-collapse min-w-[720px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 text-slate-600">
            <th rowSpan={2} className="text-left p-2 border min-w-[220px] bg-slate-50">Решение</th>
            <th rowSpan={2} className="text-left p-2 border min-w-[180px] bg-slate-50">Виджеты</th>
            {FS_QUEUE_KEYS.flatMap(q => [
              <th key={`${q}-main`} className="text-center p-2 border bg-slate-50">
                <EditableQueueHeader
                  label={queueLabel(queueLabels, q)}
                  onChange={next => onQueueLabelChange(q, next)}
                />
              </th>,
              <th
                key={`${q}-cmt`}
                rowSpan={2}
                className="text-center p-2 border w-10 bg-slate-50"
                title={`Комментарий — ${queueLabel(queueLabels, q)}`}
              >
                Коммент.
              </th>,
            ])}
          </tr>
          <tr className="bg-slate-50/80 text-[10px] text-slate-500">
            {FS_QUEUE_KEYS.map(q => (
              <th key={`${q}-yn`} className="p-1 text-center font-normal border">
                Да/Нет
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {totalRows === 0 && (
            <tr>
              <td colSpan={2 + FS_QUEUE_KEYS.length * 2} className="p-4 text-center text-slate-400">
                Нет решений для отображения. Выберите проблематики на предыдущей вкладке или нажмите «Показать все решения».
              </td>
            </tr>
          )}
          {units.map(unit => {
            if (unit.kind === 'group') {
              const rows = [
                renderSolutionRow(unit.parent, {
                  variant: 'parent',
                  groupParentId: unit.parent.id,
                  groupChildren: unit.children,
                }),
              ];
              if (!collapsedGroups.has(unit.parent.id)) {
                for (const child of unit.children) {
                  rows.push(renderSolutionRow(child, {
                    variant: 'child',
                    indent: 12,
                    groupParentId: unit.parent.id,
                    groupSiblings: unit.children,
                  }));
                }
              }
              return <React.Fragment key={`g-${unit.parent.id}`}>{rows}</React.Fragment>;
            }
            return renderSolutionRow(unit.item, { variant: 'standalone' });
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

function FsQueueTable({
  items,
  onChange,
  onChangeMany,
  queueLabels,
  onQueueLabelChange,
  onAddCustomerItem,
  onDeleteCustomerItem,
  fsTraceByItemId,
  requiredSolutionsByFsItemId,
  onOpenWidgetCard,
}: {
  items: BriefingFsSel[];
  onChange: (item: BriefingFsSel, patch: Partial<BriefingFsSel>) => void;
  onChangeMany: (updates: { item: BriefingFsSel; patch: Partial<BriefingFsSel> }[]) => void | Promise<void>;
  queueLabels: QueueLabelsMap;
  onQueueLabelChange: (q: FsQueueKey, label: string) => void;
  onAddCustomerItem?: (groupPrefix: CustomerFsGroupPrefix, groupName: string) => void;
  onDeleteCustomerItem?: (item: BriefingFsSel) => void;
  fsTraceByItemId?: Map<number, FsItemTrace>;
  requiredSolutionsByFsItemId?: Map<number, { id: number; name: string }[]>;
  onOpenWidgetCard: (widgetId: number) => void;
}) {
  const readOnly = useBriefingReadOnly();
  const [dragPayload, setDragPayload] = useState<FsDragPayload | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [expandedQueues, setExpandedQueues] = useState<Set<FsQueueKey>>(() => new Set());
  const [yesFilter, setYesFilter] = useState<FsYesFilter>(null);
  const [showNsiColumns, setShowNsiColumns] = useState(false);
  const [cardModalItem, setCardModalItem] = useState<BriefingFsSel | null>(null);
  const [commentModal, setCommentModal] = useState<{ item: BriefingFsSel; q: FsQueueKey } | null>(null);
  const [commentMergePrompt, setCommentMergePrompt] = useState<{
    source: BriefingFsSel;
    target: BriefingFsSel;
    fromQueue: FsQueueKey;
    toQueue: FsQueueKey;
  } | null>(null);
  const [lastCustomerMovePrompt, setLastCustomerMovePrompt] = useState<{
    source: BriefingFsSel;
    sourcePatch: Partial<BriefingFsSel>;
    target: BriefingFsSel;
    targetPatch: Partial<BriefingFsSel>;
  } | null>(null);
  const fsScrollRef = useRef<HTMLDivElement>(null);
  const fsScrollAnchorRef = useRef<{ group: string; offsetInView: number } | null>(null);
  const moveTargets = useMemo(() => buildFsItemOptions(items), [items]);
  const groups = groupFsItems(items);
  const displayGroups = useMemo(() => {
    return groups
      .map(({ group, groupPrefix, items: groupItems }) => {
        const visibleItems = yesFilter
          ? groupItems.filter(i => itemMatchesYesFilter(i, yesFilter))
          : groupItems;
        return { group, groupPrefix, groupItems, visibleItems };
      })
      .filter(g => !yesFilter || g.visibleItems.length > 0);
  }, [groups, yesFilter]);
  const totals = queueTotals(items);

  function fixedColsBeforeAllQueues(): number {
    return showNsiColumns ? 6 : 4;
  }

  function queueSpan(q: FsQueueKey): number {
    return expandedQueues.has(q) ? QUEUE_SUBCOLS : 1;
  }

  function colsPerQueueBlock(q: FsQueueKey): number {
    return queueSpan(q) + 1;
  }

  function totalQueueTableCols(): number {
    return FS_QUEUE_KEYS.reduce((sum, q) => sum + colsPerQueueBlock(q), 0);
  }

  function latestItem(item: BriefingFsSel): BriefingFsSel {
    return items.find(i => i.fs_item_id === item.fs_item_id) ?? item;
  }

  function toggleQueueExpand(q: FsQueueKey) {
    setExpandedQueues(prev => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  }

  function renderQueueYesNoCell(
    item: BriefingFsSel,
    queues: FsQueuesMap,
    q: FsQueueKey,
    unmatched: boolean,
    isDropTarget: boolean,
  ) {
    const isYes = queues[q] === 1;
    const row = latestItem(item);
    const spManual = isFsItemSpManualForQueue(row, q);
    const nmdManual = isFsItemNmdManualForQueue(row, q);
    const catalogSp = catalogSpForItem(item);
    if (readOnly) {
      return (
        <td
          key={`${item.fs_item_id}-${q}-yes`}
          className="p-1 border text-center align-top"
        >
          <span className={`inline-block px-2 py-0.5 rounded min-w-[36px] ${yesNoClass(isYes, unmatched && !isYes)}`}>
            {yesNoLabel(isYes)}
          </span>
        </td>
      );
    }
    return (
      <td
        key={`${item.fs_item_id}-${q}-yes`}
        className={`p-1 border text-center align-top ${
          isDropTarget ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : ''
        }`}
        onDragOver={e => {
          if (dragPayload?.kind === 'queue' && dragPayload.fsItemId === item.fs_item_id) e.preventDefault();
        }}
        onDrop={e => handleQueueDrop(e, item, q)}
      >
        <div className="inline-flex items-center justify-center gap-0.5 whitespace-nowrap">
          <button
            type="button"
            draggable={isYes}
            className={`px-2 py-0.5 rounded min-w-[36px] ${
              yesNoClass(isYes, unmatched && !isYes)
            } ${isYes ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
            title={isYes ? 'Перетащите в другую очередь' : 'Клик — переключить Да/Нет'}
            onDragStart={isYes ? e => startQueueDrag(e, item, q) : undefined}
            onDragEnd={endQueueDrag}
            onClick={() => toggleQueue(item, q)}
          >
            {yesNoLabel(isYes)}
          </button>
          {spManual && (
            <button
              type="button"
              className="text-[10px] text-blue-600 hover:underline leading-none px-0.5 shrink-0"
              title={`Сбросить SP к НСИ (${catalogSp})`}
              onClick={e => {
                e.stopPropagation();
                onChange(row, resetFsItemQueueSp(row, q));
              }}
            >
              ↺
            </button>
          )}
          {nmdManual && (
            <button
              type="button"
              className="text-[10px] text-blue-600 hover:underline leading-none px-0.5 shrink-0"
              title={`Сбросить НМД к НСИ (${catalogNmdLabel(row)})`}
              onClick={e => {
                e.stopPropagation();
                onChange(row, resetFsItemQueueNmd(row, q));
              }}
            >
              ↺
            </button>
          )}
        </div>
      </td>
    );
  }

  function renderQueueDetailCells(item: BriefingFsSel, queues: FsQueuesMap, q: FsQueueKey, unmatched: boolean) {
    const isYes = queues[q] === 1;
    const isDropTarget = dragPayload?.kind === 'queue'
      && dragPayload.fsItemId === item.fs_item_id
      && dragPayload.fromQueue !== q;
    const cells: React.ReactNode[] = [renderQueueYesNoCell(item, queues, q, unmatched, isDropTarget)];

    if (!expandedQueues.has(q)) return cells;

    const row = latestItem(item);
    const catalogSp = catalogSpForItem(row);
    const effectiveSp = effectiveFsItemSpForQueue(row, q);
    const spManual = isFsItemSpManualForQueue(row, q);
    const nmdAuto = autoFsItemNmdValueForQueue(row);
    const nmdEffective = effectiveFsItemNmdValueForQueue(row, q);
    const nmdManual = isFsItemNmdManualForQueue(row, q);
    const nmdNsiLabel = catalogNmdLabel(row);
    const nmdTitle = nmdManual
      ? `НСИ: ${nmdNsiLabel} · Авто: ${nmdAuto}`
      : `НСИ: ${nmdNsiLabel}`;

    cells.push(
      <td key={`${item.fs_item_id}-${q}-sp`} className="p-1 border align-top min-w-[3.5rem]">
        {isYes ? (
          <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            <OverridableNumberInput
              value={effectiveSp}
              autoValue={catalogSp}
              step={1}
              calculated
              compact
              overridden={spManual}
              overrideClass={OVERRIDE_INPUT_CLASS}
              calculatedClass={CALCULATED_SP_CLASS}
              title={`НСИ: ${catalogSp}`}
              onChange={v => onChange(row, patchFsItemQueueSp(row, q, v))}
              onResetToAuto={() => onChange(row, resetFsItemQueueSp(row, q))}
            />
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>,
      <td key={`${item.fs_item_id}-${q}-nmd`} className="p-1 border text-center align-top min-w-[8rem]">
        {isYes ? (
          <div className="flex flex-col items-center gap-0.5">
            <select
              className={`text-[10px] border rounded px-0.5 py-0.5 min-w-[8rem] max-w-full ${
                nmdManual ? OVERRIDE_INPUT_CLASS : CALCULATED_SP_CLASS
              }`}
              title={nmdTitle}
              value={nmdEffective}
              onChange={e => onChange(row, patchFsItemQueueNmd(row, q, e.target.value as FsNmdValue))}
            >
              {FS_NMD_VALUES.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            {nmdManual && (
              <button
                type="button"
                className="text-[10px] text-blue-600 hover:underline"
                title={`Авто: ${nmdAuto}`}
                onClick={() => onChange(row, resetFsItemQueueNmd(row, q))}
              >
                ↺
              </button>
            )}
          </div>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>,
    );
    return cells;
  }

  function renderQueueCommentCell(item: BriefingFsSel, _queues: FsQueuesMap, q: FsQueueKey) {
    const row = latestItem(item);
    const hasComment = hasFsItemQueueComment(row, q);
    const isCommentDropTarget = dragPayload?.kind === 'comment'
      && (dragPayload.fsItemId !== item.fs_item_id || dragPayload.fromQueue !== q);
    const cellClass = `p-1 border text-center align-middle w-9 ${
      isCommentDropTarget ? 'bg-amber-50 ring-2 ring-inset ring-amber-300' : ''
    }`;
    if (!hasComment) {
      return (
        <td
          key={`${item.fs_item_id}-${q}-comment`}
          className={`${cellClass} cursor-pointer`}
          onClick={() => setCommentModal({ item: row, q })}
          onDragOver={e => {
            if (dragPayload?.kind === 'comment') e.preventDefault();
          }}
          onDrop={e => handleCommentDrop(e, item, q)}
          title="Добавить комментарий"
          aria-label="Добавить комментарий"
        />
      );
    }
    return (
      <td
        key={`${item.fs_item_id}-${q}-comment`}
        className={cellClass}
        onDragOver={e => {
          if (dragPayload?.kind === 'comment') e.preventDefault();
        }}
        onDrop={e => handleCommentDrop(e, item, q)}
      >
        <button
          type="button"
          draggable
          onDragStart={e => startCommentDrag(e, row, q)}
          onDragEnd={endQueueDrag}
          onClick={() => setCommentModal({ item: row, q })}
          className="w-7 h-7 mx-auto rounded inline-flex items-center justify-center text-amber-700 bg-amber-100 hover:bg-amber-200 ring-1 ring-amber-300/60 cursor-grab active:cursor-grabbing"
          title="Перетащите на комментарий другого пункта или клик — открыть"
          aria-label="Есть комментарий"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden>
            <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v5A1.5 1.5 0 0 1 12.5 10H9l-2.5 2.5V10H3.5A1.5 1.5 0 0 1 2 8.5v-5Z" />
          </svg>
        </button>
      </td>
    );
  }

  function renderQueueBlockCells(item: BriefingFsSel, queues: FsQueuesMap, q: FsQueueKey, unmatched: boolean) {
    return [...renderQueueDetailCells(item, queues, q, unmatched), renderQueueCommentCell(item, queues, q)];
  }

  function toggleYesFilter(filter: 'all' | FsQueueKey) {
    setYesFilter(prev => {
      const next = prev === filter ? null : filter;
      if (next) {
        const toExpand = new Set<string>();
        for (const { group, items: groupItems } of groups) {
          if (groupItems.some(i => itemMatchesYesFilter(i, next))) toExpand.add(group);
        }
        setExpandedGroups(toExpand);
      }
      return next;
    });
  }

  function collapseAllSections() {
    setExpandedGroups(new Set());
  }

  function expandAllSections() {
    setExpandedGroups(new Set(displayGroups.map(g => g.group)));
  }

  const allFsGroupsCollapsed =
    displayGroups.length > 0
    && displayGroups.every(({ group }) => !expandedGroups.has(group));

  function captureFsScrollAnchor(group: string, row: HTMLElement | null) {
    const container = fsScrollRef.current;
    if (!container || !row) return;
    fsScrollAnchorRef.current = {
      group,
      offsetInView: row.getBoundingClientRect().top - container.getBoundingClientRect().top,
    };
  }

  function toggleGroup(group: string, row: HTMLElement | null) {
    captureFsScrollAnchor(group, row);
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  useLayoutEffect(() => {
    const anchor = fsScrollAnchorRef.current;
    const container = fsScrollRef.current;
    if (!anchor || !container) return;
    fsScrollAnchorRef.current = null;
    const row = Array.from(container.querySelectorAll<HTMLElement>('tr[data-fs-group]'))
      .find(r => r.getAttribute('data-fs-group') === anchor.group);
    if (!row) return;
    const delta = row.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.offsetInView;
    container.scrollTop += delta;
  }, [expandedGroups]);

  function patchQueues(item: BriefingFsSel, queues: FsQueuesMap, extra: Partial<BriefingFsSel> = {}) {
    const primary = FS_QUEUE_KEYS.find(k => queues[k] === 1) ?? item.queue ?? '1';
    const enabled = anyQueueEnabled(queues) ? 1 : 0;
    const patch: Partial<BriefingFsSel> = {
      queues_json: queues,
      queue: primary,
      enabled,
      source: 'manual',
      ...extra,
    };
    if (item.matched === false) patch.matched = true;
    onChange(item, patch);
  }

  function toggleQueue(item: BriefingFsSel, q: FsQueueKey) {
    const row = latestItem(item);
    const queues = { ...itemQueues(row) };
    if (!queues[q]) {
      queues[q] = 1;
      patchQueues(row, queues);
      return;
    }
    const nextQueues: FsQueuesMap = { ...queues, [q]: 0 };
    const willDisable = !anyQueueEnabled(nextQueues);
    const requiredSolutions = requiredSolutionsByFsItemId?.get(row.fs_item_id) ?? [];
    if (willDisable && requiredSolutions.length > 0) {
      const names = requiredSolutions.map(s => `• ${s.name}`).join('\n');
      const label = row.name?.trim() || `пункт ${row.prefix ?? row.fs_item_id}`;
      const ok = confirm(
        `Пункт ФС «${label}» обязателен для решений:\n\n${names}\n\nЕсли снять «Да», эти решения не будут считаться выполненными.\n\nСнять пункт ФС?`,
      );
      if (!ok) return;
      const dateStr = new Date().toLocaleDateString('ru-RU');
      const noteLines = requiredSolutions.map(
        s => `пункт снят ${dateStr}, решение «${s.name}» не выполняется`,
      );
      const commentPatch = appendFsItemQueueComment(row, q, noteLines);
      patchQueues(row, nextQueues, commentPatch);
      return;
    }
    patchQueues(row, nextQueues);
  }

  function moveToQueue(item: BriefingFsSel, fromQueue: FsQueueKey, targetQueue: FsQueueKey) {
    const row = latestItem(item);
    const relocated = relocateFsItemQueueOverrides(row, fromQueue, targetQueue);
    const queues: FsQueuesMap = { '1': 0, '2': 0, '3': 0, '4': 0 };
    queues[targetQueue] = 1;
    const patch: Partial<BriefingFsSel> = {
      ...relocated,
      queues_json: queues,
      queue: targetQueue,
      enabled: 1,
      source: 'manual',
    };
    if (row.matched === false) patch.matched = true;
    onChange(row, patch);
  }

  function startQueueDrag(e: React.DragEvent, item: BriefingFsSel, fromQueue: FsQueueKey) {
    e.stopPropagation();
    const payload: FsDragPayload = { kind: 'queue', fsItemId: item.fs_item_id, fromQueue };
    setDragPayload(payload);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-fs-queue', JSON.stringify(payload));
  }

  function startCommentDrag(e: React.DragEvent, item: BriefingFsSel, fromQueue: FsQueueKey) {
    e.stopPropagation();
    const payload: FsDragPayload = { kind: 'comment', fsItemId: item.fs_item_id, fromQueue };
    setDragPayload(payload);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-fs-comment', JSON.stringify(payload));
  }

  function endQueueDrag() {
    setDragPayload(null);
  }

  function applyCommentMove(
    source: BriefingFsSel,
    target: BriefingFsSel,
    fromQueue: FsQueueKey,
    toQueue: FsQueueKey,
    mode: 'merge' | 'replace',
  ) {
    const updates = moveCommentBetweenItems(source, target, fromQueue, toQueue, mode);
    if (!updates?.length) return;
    void onChangeMany(updates);
  }

  function handleCommentDrop(e: React.DragEvent, item: BriefingFsSel, targetQueue: FsQueueKey) {
    e.preventDefault();
    e.stopPropagation();
    let payload = dragPayload?.kind === 'comment' ? dragPayload : null;
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/x-fs-comment')) as FsDragPayload;
        if (payload.kind !== 'comment') return;
      } catch {
        return;
      }
    }
    setDragPayload(null);
    if (payload.fsItemId === item.fs_item_id && payload.fromQueue === targetQueue) return;

    const source = latestItem(items.find(i => i.fs_item_id === payload.fsItemId) ?? item);
    const target = latestItem(item);
    const existing = effectiveFsItemCommentForQueue(target, targetQueue).trim();
    if (existing) {
      setCommentMergePrompt({ source, target, fromQueue: payload.fromQueue, toQueue: targetQueue });
      return;
    }
    applyCommentMove(source, target, payload.fromQueue, targetQueue, 'replace');
  }

  function handleMoveCustomerLine(
    sourceItem: BriefingFsSel,
    line: BriefingFsDetailLine,
    remainingSourceLines: BriefingFsDetailLine[],
    targetFsItemId: number,
  ) {
    if (targetFsItemId === sourceItem.fs_item_id) return;
    const source = latestItem(sourceItem);
    const target = latestItem(items.find(i => i.fs_item_id === targetFsItemId) ?? sourceItem);
    const { sourcePatch, targetPatch } = moveCustomerDetailLine(source, line, remainingSourceLines, target);
    const hadCustomerLines = countCustomerDetailLines(source.detail_lines) > 0;
    const willHaveCustomerLines = countCustomerDetailLines(remainingSourceLines) > 0;

    if (hadCustomerLines && !willHaveCustomerLines) {
      setLastCustomerMovePrompt({ source, sourcePatch, target, targetPatch });
      setCardModalItem(null);
      return;
    }
    void onChangeMany([
      { item: source, patch: sourcePatch },
      { item: target, patch: targetPatch },
    ]);
    setCardModalItem(null);
  }

  function handleQueueDrop(e: React.DragEvent, item: BriefingFsSel, targetQueue: FsQueueKey) {
    e.preventDefault();
    e.stopPropagation();
    let payload = dragPayload?.kind === 'queue' ? dragPayload : null;
    if (!payload) {
      try {
        const parsed = JSON.parse(e.dataTransfer.getData('application/x-fs-queue')) as FsDragPayload;
        if (parsed.kind !== 'queue') return;
        payload = parsed;
      } catch {
        return;
      }
    }
    if (payload.fsItemId !== item.fs_item_id || payload.fromQueue === targetQueue) {
      setDragPayload(null);
      return;
    }
    moveToQueue(item, payload.fromQueue, targetQueue);
    setDragPayload(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-readonly-allow
          onClick={() => (allFsGroupsCollapsed ? expandAllSections() : collapseAllSections())}
          className="text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
          disabled={displayGroups.length === 0}
        >
          {allFsGroupsCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
        </button>
        {yesFilter && (
          <button
            type="button"
            data-readonly-allow
            onClick={() => setYesFilter(null)}
            className="text-xs text-blue-700 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100"
          >
            Сбросить фильтр «Да»
          </button>
        )}
        <button
          type="button"
          data-readonly-allow
          onClick={() => setShowNsiColumns(v => !v)}
          className="text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
        >
          {showNsiColumns ? 'Скрыть НСИ' : 'Показать НСИ'}
        </button>
      </div>
      <div ref={fsScrollRef} className="overflow-auto max-h-[calc(100vh-220px)] border border-slate-200 rounded">
      {commentModal && (
        <FsQueueCommentModal
          item={commentModal.item}
          queueKey={commentModal.q}
          queueLabels={queueLabels}
          onClose={() => setCommentModal(null)}
          onSave={text => {
            const row = items.find(i => i.fs_item_id === commentModal.item.fs_item_id) ?? commentModal.item;
            onChange(row, patchFsItemQueueComment(row, commentModal.q, text));
            setCommentModal(null);
          }}
        />
      )}
      {cardModalItem && (
        <FsItemCardModal
          item={latestItem(cardModalItem)}
          moveTargets={moveTargets.filter(t => t.fs_item_id !== cardModalItem.fs_item_id)}
          fsTrace={fsTraceByItemId?.get(cardModalItem.fs_item_id)}
          onOpenWidgetCard={onOpenWidgetCard}
          onClose={() => setCardModalItem(null)}
          onSave={patch => {
            const row = items.find(i => i.fs_item_id === cardModalItem.fs_item_id) ?? cardModalItem;
            onChange(row, {
              ...patch,
              source: isCustomerFsItem(row) ? 'customer' : 'manual',
            });
          }}
          onMoveCustomerLine={(line, remainingSourceLines, targetFsItemId) => {
            handleMoveCustomerLine(cardModalItem, line, remainingSourceLines, targetFsItemId);
          }}
        />
      )}
      {commentMergePrompt && (
        <FsChoiceModal
          title="Комментарий у пункта-цели"
          message="У выбранного пункта в этой очереди уже есть комментарий. Как перенести?"
          options={[
            { id: 'merge', label: 'Дописать' },
            { id: 'replace', label: 'Заменить' },
          ]}
          onClose={choice => {
            const pending = commentMergePrompt;
            setCommentMergePrompt(null);
            if (!choice || !pending) return;
            applyCommentMove(
              pending.source,
              pending.target,
              pending.fromQueue,
              pending.toQueue,
              choice === 'merge' ? 'merge' : 'replace',
            );
          }}
        />
      )}
      {lastCustomerMovePrompt && (
        <FsChoiceModal
          title="Подпункты заказчика перенесены"
          message="На пункте-источнике не осталось подпунктов заказчика. Оставить «Да» в очередях или установить «Нет» во всех очередях?"
          options={[
            { id: 'keep_yes', label: 'Оставить Да' },
            { id: 'set_no', label: 'Установить Нет' },
          ]}
          onClose={choice => {
            const pending = lastCustomerMovePrompt;
            setLastCustomerMovePrompt(null);
            if (!choice || !pending) return;
            const sourcePatch = choice === 'set_no'
              ? { ...pending.sourcePatch, ...patchAllQueuesNo(pending.source) }
              : pending.sourcePatch;
            void onChangeMany([
              { item: pending.source, patch: sourcePatch },
              { item: pending.target, patch: pending.targetPatch },
            ]);
          }}
        />
      )}
      <table className={`w-full text-xs border-collapse ${showNsiColumns ? 'min-w-[1100px]' : 'min-w-[900px]'}`}>
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-50 text-slate-600">
            <th rowSpan={2} className="text-left p-2 border min-w-[5rem] bg-slate-50">№</th>
            <th rowSpan={2} className="text-left p-2 border min-w-[200px] bg-slate-50">Пункт ФС / Расшифровка</th>
            <th rowSpan={2} className="text-left p-2 border w-28 bg-slate-50">Тип функционала</th>
            {showNsiColumns && (
              <>
                <th rowSpan={2} className="text-right p-2 border w-14 bg-slate-50" title="Нормативный SP из НСИ каталога">НСИ</th>
                <th rowSpan={2} className="text-left p-2 border min-w-[100px] bg-slate-50" title="Требование НМД из НСИ (колонка CR Excel)">НМД НСИ</th>
              </>
            )}
            <th rowSpan={2} className="text-left p-2 border min-w-[140px] bg-slate-50">Виджеты</th>
            <th className="text-center p-2 border w-24 bg-slate-50">Все очереди</th>
            {FS_QUEUE_KEYS.flatMap(q => [
              <th key={`${q}-main`} colSpan={queueSpan(q)} className="text-center p-2 border bg-slate-50">
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    data-readonly-allow
                    onClick={() => toggleQueueExpand(q)}
                    className="text-slate-500 hover:text-slate-800 w-5 h-5 leading-none shrink-0"
                    title={expandedQueues.has(q) ? 'Свернуть колонки очереди' : 'Развернуть: Да/Нет, SP, НМД'}
                  >
                    {expandedQueues.has(q) ? '▼' : '▶'}
                  </button>
                  <EditableQueueHeader
                    label={queueLabel(queueLabels, q)}
                    onChange={next => onQueueLabelChange(q, next)}
                  />
                </div>
              </th>,
              <th
                key={`${q}-cmt`}
                rowSpan={2}
                className="text-center p-2 border w-10 bg-slate-50"
                title={`Комментарий — ${queueLabel(queueLabels, q)}`}
              >
                Коммент.
              </th>,
            ])}
          </tr>
          <tr className="bg-slate-50/80 text-[10px] text-slate-500">
            <FsFilterableTh
              key="all-yn"
              active={yesFilter === 'all'}
              onToggle={() => toggleYesFilter('all')}
              title="Показать только пункты с «Да» хотя бы в одной очереди (повторный клик — сброс)"
              className="p-1 text-center font-normal"
            >
              Да/Нет
            </FsFilterableTh>
            {FS_QUEUE_KEYS.flatMap(q => {
              if (!expandedQueues.has(q)) {
                return [
                  <FsFilterableTh
                    key={`${q}-yn`}
                    active={yesFilter === q}
                    onToggle={() => toggleYesFilter(q)}
                    title={`Показать только пункты с «Да» в ${queueLabel(queueLabels, q)} (повторный клик — сброс)`}
                    className="p-1 text-center font-normal"
                  >
                    Да/Нет
                  </FsFilterableTh>,
                ];
              }
              return [
                <FsFilterableTh
                  key={`${q}-yn`}
                  active={yesFilter === q}
                  onToggle={() => toggleYesFilter(q)}
                  title={`Показать только пункты с «Да» в ${queueLabel(queueLabels, q)} (повторный клик — сброс)`}
                  className="p-1 text-center font-normal"
                >
                  Да/Нет
                </FsFilterableTh>,
                <th key={`${q}-sp`} className="p-1 border text-center font-normal">
                  SP
                  <div className="font-normal text-[9px] text-slate-400 mt-0.5">
                    <span className={`inline-block w-2 h-2 rounded-sm border ${CALCULATED_SP_CLASS} align-middle mr-0.5`} />
                    норма
                    <span className={`inline-block w-2 h-2 rounded-sm border ${OVERRIDE_INPUT_CLASS} align-middle mx-0.5`} />
                    правка
                  </div>
                </th>,
                <th key={`${q}-nmd`} className="p-1 border text-center font-normal">НМД</th>,
              ];
            })}
          </tr>
        </thead>
        <tbody>
          {displayGroups.map(({ group, groupPrefix, groupItems, visibleItems }) => {
            const isExpanded = expandedGroups.has(group);
            const rowItems = yesFilter ? visibleItems : groupItems;
            const groupQueues = aggregateGroupQueues(rowItems);
            const userItemsCount = countGroupUserItems(groupItems);
            return (
            <React.Fragment key={group}>
              <tr className="bg-amber-50 font-semibold" data-fs-group={group}>
                <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top min-w-[5rem]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-readonly-allow
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => toggleGroup(group, e.currentTarget.closest('tr'))}
                      className="text-slate-600 hover:text-slate-900 w-6 h-6 leading-none shrink-0"
                      title={isExpanded ? 'Свернуть группу' : 'Развернуть группу'}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <span>{groupPrefix || '—'}</span>
                  </div>
                </td>
                <td className="p-2 border">
                  {group}
                  <span className="ml-2 text-[10px] font-normal text-slate-500">
                    ({rowItems.length}{yesFilter && rowItems.length !== groupItems.length ? ` / ${groupItems.length}` : ''})
                  </span>
                  {userItemsCount > 0 && (
                    <span
                      className="ml-2 inline-flex items-center rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                      title={`Добавлены пользовательские пункты (${userItemsCount})`}
                    >
                      +{userItemsCount} пользовательских
                    </span>
                  )}
                  {isCustomerFsGroupPrefix(groupPrefix) && onAddCustomerItem && (
                    <button
                      type="button"
                      className="ml-2 text-[10px] font-normal text-emerald-700 hover:underline"
                      onClick={() => {
                        onAddCustomerItem(groupPrefix, group);
                        setExpandedGroups(prev => new Set(prev).add(group));
                      }}
                    >
                      + Функция заказчика
                    </button>
                  )}
                </td>
                <td className="p-2 border" />
                {showNsiColumns && (
                  <>
                    <td className="p-2 border" />
                    <td className="p-2 border" />
                  </>
                )}
                <td className="p-2 border" />
                <td className="p-2 border text-center">
                  <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupQueues.allOn)}`}>
                    {yesNoLabel(groupQueues.allOn)}
                  </span>
                </td>
                {FS_QUEUE_KEYS.flatMap(q => {
                  const mainCells = !expandedQueues.has(q)
                    ? [
                        <td key={q} className="p-2 border text-center">
                          <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupQueues.byQueue[q])}`}>
                            {yesNoLabel(groupQueues.byQueue[q])}
                          </span>
                        </td>,
                      ]
                    : [
                        <td key={`${q}-yn`} className="p-2 border text-center">
                          <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupQueues.byQueue[q])}`}>
                            {yesNoLabel(groupQueues.byQueue[q])}
                          </span>
                        </td>,
                        <td key={`${q}-sp`} className="p-2 border" />,
                        <td key={`${q}-nmd`} className="p-2 border" />,
                      ];
                  return [...mainCells, <td key={`${q}-cmt`} className="p-2 border" />];
                })}
              </tr>
              {isExpanded && rowItems
                .map(item => {
                const queues = itemQueues(item);
                const allOn = anyQueueEnabled(queues);
                const customerItem = isCustomerFsItem(item);
                const unmatched = !customerItem && item.matched === false;
                const detailFlags = customerItem
                  ? {
                    modified: false,
                    customerAdded: Boolean(
                      item.description?.trim()
                      || (item.detail_lines ?? []).some(l => l.name.trim() || l.description?.trim()),
                    ),
                  }
                  : fsDetailLineFlags(item);
                return (
                    <tr
                      key={item.fs_item_id}
                      className={`hover:bg-slate-50 ${customerItem ? 'bg-emerald-50/40' : ''} ${unmatched ? 'bg-red-50/30' : ''}`}
                    >
                      <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top min-w-[5rem]">
                        <div className="flex items-start gap-1">
                          <span className="shrink-0">{item.prefix || '—'}</span>
                          {customerItem && onDeleteCustomerItem && (
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 text-xs leading-none shrink-0"
                              title="Удалить функцию заказчика"
                              onClick={() => onDeleteCustomerItem(item)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-2 border">
                        <button
                          type="button"
                          data-readonly-allow
                          className="text-left w-full min-w-0 group"
                          onClick={() => setCardModalItem(item)}
                          title="Открыть карточку пункта ФС"
                        >
                          <div className={`font-medium group-hover:text-blue-700 underline-offset-2 group-hover:underline ${
                            customerItem ? 'text-emerald-800' : 'text-slate-800'
                          }`}>
                            {item.name?.trim() || (
                              <span className="text-slate-400 font-normal italic">Новая функция заказчика…</span>
                            )}
                            {(detailFlags.modified || detailFlags.customerAdded || customerItem) && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle">
                                {customerItem && (
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700"
                                    title="Функция заказчика"
                                    aria-label="Функция заказчика"
                                  >
                                    З
                                  </span>
                                )}
                                {detailFlags.modified && (
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-100 text-[10px] text-amber-700"
                                    title="Расшифровка изменена относительно НСИ"
                                    aria-label="Расшифровка изменена"
                                  >
                                    ✎
                                  </span>
                                )}
                                {detailFlags.customerAdded && (
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700"
                                    title="Добавлены пользовательские подпункты"
                                    aria-label="Добавлены пользовательские подпункты"
                                  >
                                    +
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="p-2 border text-[11px] text-slate-600 whitespace-nowrap">
                        {customerItem ? (
                          <select
                            className="text-[11px] border border-emerald-200 rounded px-1 py-0.5 max-w-full bg-white"
                            value={item.func_type ?? 'ПРОФ'}
                            onChange={e => onChange(latestItem(item), patchCustomerFuncType(latestItem(item), e.target.value))}
                          >
                            {FS_FUNC_TYPE_VALUES.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          item.func_type || '—'
                        )}
                      </td>
                      {showNsiColumns && (
                        <>
                          <td className="p-2 border text-right tabular-nums text-slate-700">
                            {catalogSpForItem(item) > 0 ? catalogSpForItem(item) : '—'}
                          </td>
                          <td
                            className="p-2 border text-[10px] text-slate-600"
                            title="Требование НМД из НСИ (колонка CR Excel)"
                          >
                            {catalogNmdLabel(item)}
                          </td>
                        </>
                      )}
                      <td className="p-2 border text-[10px] text-slate-400">
                        {(item.matched_widgets ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1 items-center">
                            {item.matched_widgets!.map(w => (
                              <WidgetImageThumbnail
                                key={w.id}
                                widgetId={w.id}
                                onOpenWidgetCard={onOpenWidgetCard}
                                imagePath={w.image_path}
                                name={w.name}
                                className="w-10 h-7 object-contain bg-white border border-slate-100 rounded cursor-pointer hover:border-slate-400"
                                showPlaceholder={false}
                              />
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2 border text-center">
                        <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(allOn, unmatched && !allOn)}`}>
                          {yesNoLabel(allOn)}
                        </span>
                      </td>
                      {FS_QUEUE_KEYS.flatMap(q => renderQueueBlockCells(item, queues, q, unmatched))}
                    </tr>
                );
              })}
            </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-semibold text-slate-700">
            <td className="p-2 border" colSpan={fixedColsBeforeAllQueues()}
              title="Сумма SP функциональных пунктов (C20), без интеграций и НМД">
              Итого SP функционала (C20)
            </td>
            <td className="p-2 border text-center" title="Сумма C20 по включённым пунктам">
              {totals.all_queues || '—'}
            </td>
            {FS_QUEUE_KEYS.flatMap(q => {
              const value = totals.functional_sp[q] || '—';
              const mainCells = !expandedQueues.has(q)
                ? [<td key={q} className="p-2 border text-center">{value}</td>]
                : [
                    <td key={`${q}-yn`} className="p-2 border" />,
                    <td key={`${q}-sp`} className="p-2 border text-center">{value}</td>,
                    <td key={`${q}-nmd`} className="p-2 border" />,
                  ];
              return [...mainCells, <td key={`${q}-cmt`} className="p-2 border" />];
            })}
          </tr>
          <tr className="bg-slate-100 font-semibold text-slate-700">
            <td className="p-2 border" colSpan={fixedColsBeforeAllQueues()}
              title="Сумма SP пунктов раздела 11 / «ФС интеграции» (C21)">
              Итого SP интеграций (C21)
            </td>
            <td className="p-2 border text-center">
              {totals.all_integrations || '—'}
            </td>
            {FS_QUEUE_KEYS.flatMap(q => {
              const value = totals.integrations_sp_auto[q] || '—';
              const mainCells = !expandedQueues.has(q)
                ? [<td key={q} className="p-2 border text-center">{value}</td>]
                : [
                    <td key={`${q}-yn`} className="p-2 border" />,
                    <td key={`${q}-sp`} className="p-2 border text-center">{value}</td>,
                    <td key={`${q}-nmd`} className="p-2 border" />,
                  ];
              return [...mainCells, <td key={`${q}-cmt`} className="p-2 border" />];
            })}
          </tr>
          <tr className="bg-slate-100 font-semibold text-slate-700">
            <td className="p-2 border" colSpan={fixedColsBeforeAllQueues()}
              title="Сумма SP пунктов с требованием НМД (D20)">
              Итого SP НМД (D20)
            </td>
            <td className="p-2 border text-center" title="Сумма D20 по включённым пунктам">
              {totals.all_nmd || '—'}
            </td>
            {FS_QUEUE_KEYS.flatMap(q => {
              const value = totals.nmd_sp_auto[q] || '—';
              const mainCells = !expandedQueues.has(q)
                ? [<td key={q} className="p-2 border text-center">{value}</td>]
                : [
                    <td key={`${q}-yn`} className="p-2 border" />,
                    <td key={`${q}-sp`} className="p-2 border" />,
                    <td key={`${q}-nmd`} className="p-2 border text-center">{value}</td>,
                  ];
              return [...mainCells, <td key={`${q}-cmt`} className="p-2 border" />];
            })}
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

type SaveFeedback = { tab: Tab; type: 'success' | 'error'; message: string };

function TabSaveBar({
  tabId, onSave, savingTab, feedback, disabled,
}: {
  tabId: Tab;
  onSave: () => void;
  savingTab: Tab | null;
  feedback: SaveFeedback | null;
  disabled?: boolean;
}) {
  const saving = savingTab === tabId;
  const fb = feedback?.tab === tabId ? feedback : null;
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={saving || disabled}
        data-readonly-skip
        className={SAVE_BTN_CLASS}
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
      {fb && (
        <span className={`text-sm ${fb.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {fb.message}
        </span>
      )}
    </div>
  );
}

interface Props {
  briefingId: number;
  reloadToken?: number;
  currentUserId: number | null;
  onProjectGenerated: (projectId: number) => void;
}

function parseJson<T>(val: string | T | null | undefined, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

export default function BriefingWorkspace({ briefingId, reloadToken = 0, currentUserId, onProjectGenerated }: Props) {
  const [tab, setTab] = useState<Tab>('customer');
  const [data, setData] = useState<BriefingFull | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [stakeholderRoles, setStakeholderRoles] = useState<StakeholderRole[]>([]);
  const [hypothesesCatalog, setHypothesesCatalog] = useState<HypothesisListItem[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [allProblemsCatalog, setAllProblemsCatalog] = useState<Problem[]>([]);
  const [filteredProblemIds, setFilteredProblemIds] = useState<Set<number>>(() => new Set());
  const [showAllProblems, setShowAllProblems] = useState(false);
  const [hypothesisFilterIds, setHypothesisFilterIds] = useState<number[]>([]);
  const [allSolutionsCatalog, setAllSolutionsCatalog] = useState<Solution[]>([]);
  const [problemSolutionLinks, setProblemSolutionLinks] = useState<CatalogLink[]>([]);
  const [matchedSolutionIds, setMatchedSolutionIds] = useState<Set<number>>(() => new Set());
  const [showAllSolutions, setShowAllSolutions] = useState(false);
  const [solutionCardId, setSolutionCardId] = useState<number | null>(null);
  const [widgetCardId, setWidgetCardId] = useState<number | null>(null);
  const [solutionWidgets, setSolutionWidgets] = useState<Record<number, Widget[]>>({});
  const [savingTab, setSavingTab] = useState<Tab | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [customProblem, setCustomProblem] = useState('');
  const [assessmentNsi, setAssessmentNsi] = useState<AssessmentNsiCache | null>(null);
  const [assessmentRecalcFlash, setAssessmentRecalcFlash] = useState(0);
  const [phaseQueue, setPhaseQueue] = useState<FsQueueKey>('1');
  const activePhaseQueues = useMemo(
    () => (data?.assessment ? getEvaluatedQueueKeys(data.assessment.org_volume) : []),
    [data?.assessment?.org_volume],
  );
  useEffect(() => {
    if (activePhaseQueues.length > 0 && !activePhaseQueues.includes(phaseQueue)) {
      setPhaseQueue(activePhaseQueues[0]);
    }
  }, [activePhaseQueues, phaseQueue]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fsTableVisitKey, setFsTableVisitKey] = useState(0);
  const [catalogAddOpen, setCatalogAddOpen] = useState(false);
  const [catalogAddItems, setCatalogAddItems] = useState<FsCatalogItem[]>([]);
  const [catalogAddLoading, setCatalogAddLoading] = useState(false);
  const [linkModalSelId, setLinkModalSelId] = useState<number | null>(null);
  const [customSolutionsSelId, setCustomSolutionsSelId] = useState<number | null>(null);
  const [widgetsCatalog, setWidgetsCatalog] = useState<Widget[]>([]);
  const [solutionWidgetLinks, setSolutionWidgetLinks] = useState<CatalogLink[]>([]);
  const [widgetFsLinks, setWidgetFsLinks] = useState<CatalogLink[]>([]);
  const [widgetSolutionsModal, setWidgetSolutionsModal] = useState<{
    widget: Widget;
    candidates: Solution[];
  } | null>(null);
  /** Решения, добавленные вкладкой «Виджеты» (widgetId → solutionIds). */
  const customerWidgetSolutionIdsRef = useRef<Map<number, Set<number>>>(new Map());
  /** Решения, явно отмеченные «Да» на вкладке «Решения» (не только от виджета). */
  const manualSolutionIdsRef = useRef<Set<number>>(new Set());
  const [solutionFsLinksAll, setSolutionFsLinksAll] = useState<
    { solution_id: number; fs_item_id: number; link_type?: 'required' | 'optional'; solution_name?: string }[]
  >([]);

  useEffect(() => {
    if (tab === 'fs') setFsTableVisitKey(k => k + 1);
  }, [tab]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const b = await getBriefing(briefingId);
      if (b.assessment?.phase_calc_params) {
        b.assessment.phase_calc_params = mergePhaseCalcParams(b.assessment.phase_calc_params);
      }
      const activity_type_ids = b.activity_type_ids?.length
        ? b.activity_type_ids
        : [];
      setData({ ...b, activity_type_ids, customer_widgets: b.customer_widgets ?? [] });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка загрузки';
      setLoadError(message);
    }
  }, [briefingId]);

  useEffect(() => { load(); }, [load, reloadToken]);

  useEffect(() => {
    customerWidgetSolutionIdsRef.current = new Map();
    manualSolutionIdsRef.current = new Set();
  }, [briefingId]);

  useEffect(() => {
    let cancelled = false;
    setAssessmentNsi(null);
    void loadAssessmentNsi().then(cache => {
      if (!cancelled) setAssessmentNsi(cache);
    });
    return () => { cancelled = true; };
  }, [briefingId]);

  useEffect(() => {
    if (!assessmentNsi || !data?.assessment) return;
    setData(d => {
      if (!d?.assessment) return d;
      const assessment = recomputeAssessmentDerived(
        d.assessment,
        { headcount: d.headcount, fs_items: d.fs_items },
        assessmentNsi,
      );
      return { ...d, assessment };
    });
  }, [assessmentNsi, data?.id, data?.updated_at, assessmentRecalcFlash]);

  useEffect(() => {
    getIndustries().then(setIndustries);
    getActivityTypes().then(setActivityTypes);
    getStakeholderRoles().then(setStakeholderRoles);
    getHypotheses().then(setHypothesesCatalog);
    getMaturityLevels().then(setMaturityLevels);
  }, []);

  useEffect(() => {
    const ids = data?.activity_type_ids ?? [];
    if (ids.length === 0) {
      void getSegments().then(setSegments);
      return;
    }
    const industryIds = [...new Set(
      ids.map(atId => {
        const atName = activityTypes.find(a => a.id === atId)?.name;
        return industries.find(i => i.name === atName)?.id;
      }).filter((x): x is number => x != null),
    )];
    if (industryIds.length === 0) {
      void getSegments().then(setSegments);
      return;
    }
    void Promise.all(industryIds.map(id => getSegmentsByIndustry(id))).then(results => {
      const merged = new Map<number, Segment>();
      for (const list of results) {
        for (const s of list) merged.set(s.id, s);
      }
      setSegments([...merged.values()]);
      if (data?.segment_id && !merged.has(data.segment_id)) {
        setData(d => (d ? { ...d, segment_id: null } : d));
      }
    });
  }, [data?.activity_type_ids, industries, activityTypes]);

  useEffect(() => {
    getProblems().then(setAllProblemsCatalog);
  }, []);

  useEffect(() => {
    if (!data) return;
    const ids = briefingActivityTypeIds(data);
    const segmentId = data.segment_id ?? undefined;
    if (ids.length === 0 && !segmentId) {
      setFilteredProblemIds(new Set());
      return;
    }
    getProblems({
      activity_type_ids: ids.length ? ids : undefined,
      segment_id: segmentId,
    }).then(list => {
      setFilteredProblemIds(new Set(list.map(p => p.id)));
    });
  }, [data?.activity_type_ids, data?.segment_id]);

  useEffect(() => {
    setShowAllProblems(false);
    setHypothesisFilterIds([]);
  }, [data?.activity_type_ids, data?.segment_id, data?.stakeholder_role_ids]);

  const hasActivityOrSegmentFilter =
    (data?.activity_type_ids?.length ?? 0) > 0 || data?.segment_id != null;
  const hasStakeholderFilter = (data?.stakeholder_role_ids?.length ?? 0) > 0;

  const customerProblemFilterActive = hasActivityOrSegmentFilter || hasStakeholderFilter;

  const stakeholderOnlyProblemIds = useMemo(() => {
    if (!data || hasActivityOrSegmentFilter || !hasStakeholderFilter) return new Set<number>();
    const matchingNames = new Set(
      hypothesesCatalog
        .filter(h => hypothesisMatchesCustomerFilter(h, data))
        .map(h => h.name),
    );
    const ids = new Set<number>();
    for (const p of allProblemsCatalog) {
      if ((p.used_in_hypotheses ?? []).some(name => matchingNames.has(name))) ids.add(p.id);
    }
    return ids;
  }, [allProblemsCatalog, data, hasActivityOrSegmentFilter, hasStakeholderFilter, hypothesesCatalog]);

  const baseProblemFilterIds = hasActivityOrSegmentFilter ? filteredProblemIds : stakeholderOnlyProblemIds;

  const strictFilterPoolIds = useMemo(() => {
    if (!customerProblemFilterActive) return new Set<number>();
    return collectProblemWithAncestors(allProblemsCatalog, baseProblemFilterIds);
  }, [allProblemsCatalog, baseProblemFilterIds, customerProblemFilterActive]);

  const selectedProblemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const p of data?.problems ?? []) {
      if (p.problem_id) ids.add(p.problem_id);
    }
    return ids;
  }, [data?.problems]);

  const availableHypothesesForFilter = useMemo(() => {
    if (!customerProblemFilterActive || !data) return [];
    const namesInPool = new Set<string>();
    for (const p of allProblemsCatalog) {
      if (!strictFilterPoolIds.has(p.id)) continue;
      for (const name of p.used_in_hypotheses ?? []) namesInPool.add(name);
    }
    return hypothesesCatalog
      .filter(h => namesInPool.has(h.name) && hypothesisMatchesCustomerFilter(h, data))
      .map(h => ({ id: h.id, name: h.name }));
  }, [allProblemsCatalog, strictFilterPoolIds, hypothesesCatalog, customerProblemFilterActive, data]);

  useEffect(() => {
    const available = new Set(availableHypothesesForFilter.map(h => h.id));
    setHypothesisFilterIds(prev => prev.filter(id => available.has(id)));
  }, [availableHypothesesForFilter]);

  const problemCustomerFilter = useMemo(() => {
    const hypByName = new Map(hypothesesCatalog.map(h => [h.name, h.id]));
    const selectedHyp = new Set(hypothesisFilterIds);
    const activityFilterActive = customerProblemFilterActive;
    const hypothesisFilterActive = hypothesisFilterIds.length > 0;
    const anyFilterActive = activityFilterActive || hypothesisFilterActive;

    function matchesActivity(problemId: number): boolean {
      if (!activityFilterActive) return true;
      return baseProblemFilterIds.has(problemId);
    }

    function matchesHypothesis(problem: Problem): boolean {
      if (!hypothesisFilterActive) return true;
      const linked = problem.used_in_hypotheses ?? [];
      return linked.some(name => {
        const hid = hypByName.get(name);
        return hid != null && selectedHyp.has(hid);
      });
    }

    function matchesAllFilters(problem: Problem): boolean {
      return matchesActivity(problem.id) && matchesHypothesis(problem);
    }

    const matchingIds = new Set<number>();
    for (const p of allProblemsCatalog) {
      if (matchesAllFilters(p)) matchingIds.add(p.id);
    }

    let visibleIds: Set<number>;
    if (!anyFilterActive || showAllProblems) {
      visibleIds = new Set(allProblemsCatalog.map(p => p.id));
    } else {
      visibleIds = collectProblemWithAncestors(allProblemsCatalog, matchingIds);
      for (const id of selectedProblemIds) visibleIds.add(id);
      visibleIds = collectProblemWithAncestors(allProblemsCatalog, visibleIds);
    }

    function getFilterMismatchHint(problemId: number): string | null {
      if (!anyFilterActive) return null;
      const problem = allProblemsCatalog.find(p => p.id === problemId);
      if (!problem) return null;
      const activityFail = activityFilterActive && !matchesActivity(problemId);
      const hypothesisFail = hypothesisFilterActive && !matchesHypothesis(problem);
      if (!activityFail && !hypothesisFail) return null;
      if (activityFail && hypothesisFail) {
        return 'не подходит под виды деятельности/сегмент/роли и гипотезы';
      }
      if (activityFail) return 'не подходит под виды деятельности, сегмент или роли заказчика';
      return 'не подходит под выбранные гипотезы';
    }

    return { visibleIds, getFilterMismatchHint };
  }, [
    allProblemsCatalog,
    customerProblemFilterActive,
    baseProblemFilterIds,
    hypothesisFilterIds,
    hypothesesCatalog,
    selectedProblemIds,
    showAllProblems,
  ]);

  const problemDisplayUnits = useMemo(() => {
    const visible = allProblemsCatalog.filter(p => problemCustomerFilter.visibleIds.has(p.id));
    return buildProblemDisplayUnits(visible);
  }, [allProblemsCatalog, problemCustomerFilter.visibleIds]);

  const getProblemFilterMismatchHint = useCallback(
    (problemId: number) => problemCustomerFilter.getFilterMismatchHint(problemId),
    [problemCustomerFilter],
  );

  useEffect(() => {
    getSolutions().then(setAllSolutionsCatalog);
  }, []);

  useEffect(() => {
    getWidgets().then(setWidgetsCatalog);
    getSolutionWidgetLinks().then(setSolutionWidgetLinks);
    getWidgetFsLinks().then(setWidgetFsLinks);
  }, []);

  useEffect(() => {
    getProblemSolutionLinks().then(setProblemSolutionLinks);
    getSolutionFsLinksAll().then(setSolutionFsLinksAll);
  }, []);

  const solutionsByProblemId = useMemo(() => {
    const solutionById = new Map(allSolutionsCatalog.map(s => [s.id, s]));
    const map = new Map<number, ProblemSolutionUsage[]>();

    for (const link of problemSolutionLinks) {
      if (link.problem_id == null || link.solution_id == null) continue;
      const sol = solutionById.get(link.solution_id);
      const usage: ProblemSolutionUsage = {
        id: link.solution_id,
        name: sol?.name ?? link.solution_name ?? '',
        lcm_code: sol?.lcm_code ?? null,
        catalog_code: sol?.catalog_code ?? null,
        sort_order: sol?.sort_order ?? 0,
      };

      const list = map.get(link.problem_id) ?? [];
      if (!list.some(x => x.id === usage.id)) {
        list.push(usage);
        map.set(link.problem_id, list);
      }
    }

    for (const [problemId, list] of map) {
      list.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name, 'ru');
      });
      map.set(problemId, list);
    }

    return map;
  }, [problemSolutionLinks, allSolutionsCatalog]);

  const requiredSolutionsByFsItemId = useMemo(() => {
    const map = new Map<number, { id: number; name: string }[]>();
    if (!data) return map;
    const selectedById = new Map(data.solutions.map(s => [s.id, s.name]));
    for (const link of solutionFsLinksAll) {
      const linkType = link.link_type === 'optional' ? 'optional' : 'required';
      if (linkType !== 'required') continue;
      const solutionName = selectedById.get(link.solution_id);
      if (!solutionName) continue;
      const list = map.get(link.fs_item_id) ?? [];
      if (!list.some(s => s.id === link.solution_id)) {
        list.push({ id: link.solution_id, name: solutionName });
      }
      map.set(link.fs_item_id, list);
    }
    return map;
  }, [data, solutionFsLinksAll]);

  const fsTraceByItemId = useMemo(() => {
    const map = new Map<number, FsItemTrace>();
    if (!data || solutionFsLinksAll.length === 0) return map;
    const probBySelId = new Map(
      data.problems.filter(p => p.id != null).map(p => [p.id!, p]),
    );
    const fsIdsBySolution = new Map<number, number[]>();
    for (const link of solutionFsLinksAll) {
      const list = fsIdsBySolution.get(link.solution_id) ?? [];
      list.push(link.fs_item_id);
      fsIdsBySolution.set(link.solution_id, list);
    }
    for (const sol of data.solutions) {
      const customText = sol.source_problem_sel_id
        ? probBySelId.get(sol.source_problem_sel_id)?.custom_text
        : null;
      if (!customText) continue;
      for (const fsId of fsIdsBySolution.get(sol.id) ?? []) {
        const cur = map.get(fsId) ?? { customTexts: [], solutionNames: [] };
        if (!cur.customTexts.includes(customText)) cur.customTexts.push(customText);
        if (!cur.solutionNames.includes(sol.name)) cur.solutionNames.push(sol.name);
        map.set(fsId, cur);
      }
    }
    return map;
  }, [data, solutionFsLinksAll]);

  useEffect(() => {
    if (!data) return;
    const probIds = data.problems.filter(p => p.problem_id).map(p => p.problem_id!);
    if (probIds.length === 0) {
      setMatchedSolutionIds(new Set());
      return;
    }
    getSolutions(probIds).then(list => {
      setMatchedSolutionIds(new Set(list.map(s => s.id)));
    });
  }, [data?.problems]);

  const solutionDisplayUnits = useMemo(() => {
    let visibleIds: Set<number>;
    if (showAllSolutions) {
      visibleIds = new Set(allSolutionsCatalog.map(s => s.id));
    } else {
      const seed = new Set<number>(matchedSolutionIds);
      for (const s of data?.solutions ?? []) seed.add(s.id);
      // Пункт 2-го уровня (4.1.) всегда тянет верхний (4.) по иерархии.
      visibleIds = collectSolutionWithAncestors(allSolutionsCatalog, seed);
    }
    const visible = allSolutionsCatalog.filter(s => visibleIds.has(s.id));
    return buildSolutionDisplayUnits(visible);
  }, [allSolutionsCatalog, matchedSolutionIds, showAllSolutions, data?.problems, data?.solutions]);

  const isSolutionUnmatched = useCallback((solutionId: number) => {
    return showAllSolutions && !matchedSolutionIds.has(solutionId);
  }, [showAllSolutions, matchedSolutionIds]);

  useEffect(() => {
    if (!data) return;
    for (const sol of data.solutions) {
      if (!solutionWidgets[sol.id]) {
        getWidgetsBySolution(sol.id).then(ws => {
          setSolutionWidgets(prev => ({ ...prev, [sol.id]: ws }));
        });
      }
    }
  }, [data?.solutions]);

  const summaryScenarioMatrix = useMemo(() => {
    if (!data?.assessment) return null;
    try {
      const p = data.params;
      const t = parseJson<TeamProportions>(p.team_json, DEFAULT_TEAM);
      const nsi: AssessmentNsiCache = assessmentNsi ?? {
        projectTypes: data.assessment.project_types ?? [],
        ratesByTypeId: new Map(),
        coeffsByTypeId: new Map(),
      };
      const assessment = recomputeAssessmentDerived(
        data.assessment,
        { headcount: data.headcount, fs_items: data.fs_items },
        nsi,
      );
      return computeSummaryScenarioMatrix(
        assessment,
        data.fs_items,
        assessment.assessment_scenarios ?? [],
        p.accuracy ?? 0,
        t,
        assessmentNsi ?? undefined,
      );
    } catch (err) {
      console.error('computeSummaryScenarioMatrix failed', err);
      return null;
    }
  }, [data, assessmentRecalcFlash, assessmentNsi]);

  async function runTabSave(tabId: Tab, fn: () => Promise<void>) {
    if (data?.read_only) {
      setSaveFeedback({
        tab: tabId,
        type: 'error',
        message: 'Замороженная версия — только просмотр',
      });
      return;
    }
    setSavingTab(tabId);
    setSaveFeedback(null);
    try {
      await fn();
      setSaveFeedback({ tab: tabId, type: 'success', message: 'Сохранено' });
      setTimeout(() => setSaveFeedback(prev => (prev?.tab === tabId ? null : prev)), 3000);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка сохранения';
      setSaveFeedback({ tab: tabId, type: 'error', message });
    } finally {
      setSavingTab(null);
    }
  }

  function setBriefingActivityTypeIds(ids: number[]) {
    if (!data || data.read_only) return;
    setData({
      ...data,
      activity_type_ids: ids,
      segment_id: ids.length === 0 ? null : data.segment_id,
    });
  }

  function setBriefingStakeholderRoleIds(ids: number[]) {
    if (!data || data.read_only) return;
    setData({ ...data, stakeholder_role_ids: ids });
  }

  function saveCustomerTab() {
    if (!data) return;
    void runTabSave('customer', async () => {
      const activity_type_ids = briefingActivityTypeIds(data);
      await updateBriefing(briefingId, {
        name: data.name,
        activity_type_ids,
        segment_id: data.segment_id,
        stakeholder_role_ids: data.stakeholder_role_ids ?? [],
        scenario: data.scenario,
        headcount: data.headcount,
      });
      if (data.assessment) {
        await patchBriefingAssessment(briefingId, {
          headcount_category: data.assessment.headcount_category,
          headcount_coeffs: data.assessment.headcount_coeffs,
          headcount_manual: data.assessment.headcount_manual,
        });
      }
      await saveBriefingProblems(briefingId, data.problems.map(s => ({
        id: s.id,
        problem_id: s.problem_id ?? undefined,
        custom_text: s.custom_text ?? undefined,
        linked_problem_id: s.linked_problem_id ?? undefined,
      })));
      await load();
    });
  }

  function saveWidgetsTab() {
    if (!data) return;
    void runTabSave('widgets', async () => {
      await saveBriefingCustomerWidgets(briefingId, (data.customer_widgets ?? []).map(w => ({
        widget_id: w.widget_id,
        queue: w.queue ?? '1',
      })));
      // Дополненные решения/виджеты под решениями тоже сохраняем
      await saveBriefingSolutions(briefingId, data.solutions.map(s => ({
        solution_id: s.id,
        queue: s.queue ?? '1',
        queue_comment_json: serializeSolutionQueueCommentForSave(s),
        source_problem_sel_id: s.source_problem_sel_id ?? undefined,
      })));
      await saveBriefingWidgets(briefingId, data.widgets.map(w => ({
        solution_id: w.solution_id,
        widget_id: w.widget_id,
      })));
      await load();
    });
  }

  function handleHeadcountCategoryChange(cat: string) {
    const headcount = categoryToHeadcount(cat);
    setData(d => (d ? { ...d, headcount } : d));
    updateAssessment({ headcount_category: cat, headcount_manual: true });
  }

  function saveSolutionsTab() {
    if (!data) return;
    void runTabSave('solutions', async () => {
      await saveBriefingSolutions(briefingId, data.solutions.map(s => ({
        solution_id: s.id,
        queue: s.queue ?? '1',
        queue_comment_json: serializeSolutionQueueCommentForSave(s),
        source_problem_sel_id: s.source_problem_sel_id ?? undefined,
      })));
      await saveBriefingWidgets(briefingId, data.widgets.map(w => ({
        solution_id: w.solution_id,
        widget_id: w.widget_id,
      })));
      await load();
    });
  }

  function saveFsTab() {
    if (!data) return;
    void runTabSave('fs', async () => {
      await saveBriefingFs(briefingId, buildFsSavePayload(data.fs_items));
      await saveBriefingParams(briefingId, {
        queue_labels_json: parseQueueLabels(data.params.queue_labels_json),
      });
      await load();
    });
  }

  async function openCatalogAddModal() {
    setCatalogAddOpen(true);
    setCatalogAddLoading(true);
    try {
      setCatalogAddItems(await getBriefingAvailableFsCatalogItems(briefingId));
    } finally {
      setCatalogAddLoading(false);
    }
  }

  async function confirmCatalogAdd(ids: number[]) {
    const result = await addBriefingFsCatalogItems(briefingId, ids);
    setData(d => (d ? { ...d, fs_items: result.fs_items } : d));
    setCatalogAddOpen(false);
    setFsTableVisitKey(k => k + 1);
  }

  function isOrgVolumeOnlyPatch(patch: Record<string, unknown>): boolean {
    const keys = Object.keys(patch);
    return keys.length > 0 && keys.every(k => k === 'org_volume' || k === 'org_volume_manual');
  }

  type AssessmentPatch =
    | Record<string, unknown>
    | ((assessment: BriefingAssessment) => Record<string, unknown>);

  function updateAssessment(patch: AssessmentPatch) {
    if (data?.read_only) return;
    if (typeof patch !== 'function' && !isOrgVolumeOnlyPatch(patch)) {
      setAssessmentRecalcFlash(k => k + 1);
    } else if (typeof patch === 'function') {
      setAssessmentRecalcFlash(k => k + 1);
    }
    setData(d => {
      if (!d?.assessment) return d;
      const resolvedPatch = typeof patch === 'function' ? patch(d.assessment) : patch;
      const patched = applyAssessmentPatch(d.assessment, resolvedPatch);
      const nsi: AssessmentNsiCache = assessmentNsi ?? {
        projectTypes: patched.project_types ?? d.assessment.project_types ?? [],
        ratesByTypeId: new Map(),
        coeffsByTypeId: new Map(),
      };
      const assessment = recomputeAssessmentDerived(
        patched,
        { headcount: d.headcount, fs_items: d.fs_items },
        nsi,
      );
      return { ...d, assessment };
    });
  }

  function applyAssessmentFromServer(assessment: BriefingAssessment) {
    setAssessmentRecalcFlash(k => k + 1);
    setData(d => {
      if (!d) return d;
      const nsi: AssessmentNsiCache = assessmentNsi ?? {
        projectTypes: assessment.project_types ?? [],
        ratesByTypeId: new Map(),
        coeffsByTypeId: new Map(),
      };
      const next = recomputeAssessmentDerived(
        assessment,
        { headcount: d.headcount, fs_items: d.fs_items },
        nsi,
      );
      return { ...d, assessment: next };
    });
  }

  function handleAssessmentChange(patch: Record<string, unknown>) {
    if (data?.read_only) return;
    if (patch.reset_project_type) {
      void patchBriefingAssessment(briefingId, { reset_project_type: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_risks) {
      void patchBriefingAssessment(briefingId, { reset_risks: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_risks_ot) {
      void patchBriefingAssessment(briefingId, { reset_risks_ot: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_risks_do) {
      void patchBriefingAssessment(briefingId, { reset_risks_do: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_org_volume) {
      void patchBriefingAssessment(briefingId, { reset_org_volume: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_headcount) {
      void patchBriefingAssessment(briefingId, { reset_headcount: true })
        .then(applyAssessmentFromServer);
      return;
    }
    updateAssessment(patch);
  }

  function saveAssessmentTab() {
    if (!data?.assessment) return;
    const a = data.assessment;
    void runTabSave('assessment', async () => {
      await patchBriefingAssessment(briefingId, {
        criteria: a.criteria,
        project_type_id: a.project_type_id,
        project_type_manual: a.project_type_manual,
        risks: a.risks,
        risks_manual: a.risks_manual,
        risks_manual_keys: a.risks_manual_keys,
        org_volume: a.org_volume,
        org_volume_manual: a.org_volume_manual,
      });
      await load();
    });
  }

  function saveParamsTab() {
    if (!data) return;
    const p = data.params;
    const tm = parseJson<TeamProportions>(p.team_json, DEFAULT_TEAM);
    void runTabSave('params', async () => {
      await saveBriefingParams(briefingId, {
        accuracy: p.accuracy,
        team_json: tm,
        queue_labels_json: parseQueueLabels(p.queue_labels_json),
      });
      if (data.assessment) {
        const a = data.assessment;
        await patchBriefingAssessment(briefingId, {
          queue_calcs: a.queue_calcs.map(qc => ({
            queue: qc.queue,
            technology: qc.technology,
            technology_manual: qc.technology_manual === 1,
            rate: qc.rate,
            rate_manual: qc.rate_manual === 1,
          })),
          unified_rate_enabled: a.unified_rate_enabled,
          unified_rate: a.unified_rate,
          unified_rate_manual: a.unified_rate_manual,
          headcount_category: a.headcount_category,
          headcount_coeffs: a.headcount_coeffs,
          headcount_manual: a.headcount_manual,
          org_volume: a.org_volume,
          org_volume_manual: a.org_volume_manual,
          phase_calc: a.phase_calc,
          phase_calc_params: a.phase_calc_params,
          risks: a.risks,
          risks_manual: a.risks_manual,
          risks_manual_keys: a.risks_manual_keys,
          risks_ot: a.risks_ot,
          risks_do: a.risks_do,
          risks_manual_ot: a.risks_manual_ot,
          risks_manual_do: a.risks_manual_do,
          risks_manual_keys_ot: a.risks_manual_keys_ot,
          risks_manual_keys_do: a.risks_manual_keys_do,
        });
      }
      await load();
    });
  }

  function saveScenariosTab() {
    if (!data?.assessment) return;
    void runTabSave('scenarios', async () => {
      await patchBriefingAssessment(briefingId, {
        assessment_scenarios: data.assessment!.assessment_scenarios ?? [],
      });
      await load();
    });
  }

  function updateProblemSelections(changes: { problemId: number; selected: boolean }[]) {
    if (!data || data.read_only || changes.length === 0) return;
    setData(d => {
      if (!d) return d;
      const custom = d.problems.filter(p => p.custom_text);
      let catalog = d.problems.filter(p => p.problem_id);
      for (const { problemId, selected } of changes) {
        if (selected) {
          if (!catalog.some(p => p.problem_id === problemId)) {
            const prob = allProblemsCatalog.find(p => p.id === problemId);
            catalog = [...catalog, {
              problem_id: problemId,
              custom_text: null,
              problem_name: prob?.name,
            }];
          }
        } else {
          catalog = catalog.filter(p => p.problem_id !== problemId);
        }
      }
      return { ...d, problems: [...catalog, ...custom] };
    });
  }

  function addCustomProblem() {
    if (!data || data.read_only || !customProblem.trim()) return;
    setData(d => (d ? {
      ...d,
      problems: [...d.problems, { problem_id: null, custom_text: customProblem.trim(), linked_problem_id: null }],
    } : d));
    setCustomProblem('');
  }

  function applyLinkCustomProblem(selId: number, linkedProblemId: number) {
    const linkedProb = allProblemsCatalog.find(p => p.id === linkedProblemId);
    const linkedName = linkedProb?.name;
    const linkedSolutions = solutionsByProblemId.get(linkedProblemId) ?? [];
    setData(d => {
      if (!d) return d;
      let problems = d.problems.map(p =>
        p.id === selId
          ? { ...p, linked_problem_id: linkedProblemId, linked_problem_name: linkedName }
          : p,
      );

      // Отметить сопоставленную проблематику как «Да» в таблице (и родителя, если есть)
      const toSelect = [linkedProblemId];
      if (linkedProb?.parent_id) toSelect.push(linkedProb.parent_id);
      for (const problemId of toSelect) {
        if (!problems.some(p => p.problem_id === problemId)) {
          const prob = allProblemsCatalog.find(p => p.id === problemId);
          problems = [...problems, {
            problem_id: problemId,
            custom_text: null,
            problem_name: prob?.name,
          }];
        }
      }

      // Взаимоисключение: убрать ручные решения этой строки, затем подтянуть из справочника
      let solutions = d.solutions.filter(s => s.source_problem_sel_id !== selId);
      for (const sol of linkedSolutions) {
        const full = allSolutionsCatalog.find(s => s.id === sol.id);
        if (!full) continue;
        const idx = solutions.findIndex(s => s.id === sol.id);
        if (idx < 0) {
          solutions.push({ ...full, queue: '1', source_problem_sel_id: selId });
        } else if (!solutions[idx].source_problem_sel_id) {
          solutions[idx] = { ...solutions[idx], source_problem_sel_id: selId };
        }
      }
      return { ...d, problems, solutions };
    });
    setLinkModalSelId(null);
  }

  function unlinkCustomProblem(selId: number) {
    setData(d => {
      if (!d) return d;
      return {
        ...d,
        problems: d.problems.map(p =>
          p.id === selId
            ? { ...p, linked_problem_id: null, linked_problem_name: undefined }
            : p,
        ),
        // Решения, пришедшие от сопоставления, снимаем вместе с отвязкой
        solutions: d.solutions.filter(s => s.source_problem_sel_id !== selId),
      };
    });
  }

  function removeCustomProblem(selId: number) {
    setData(d => {
      if (!d) return d;
      return {
        ...d,
        problems: d.problems.filter(p => p.id !== selId),
        solutions: d.solutions.filter(s => s.source_problem_sel_id !== selId),
      };
    });
  }

  function toggleCustomProblemSolution(problemSelId: number, solutionId: number, enabled: boolean) {
    setData(d => {
      if (!d) return d;
      // Взаимоисключение: при ручном выборе решений снимаем привязку к справочнику
      const problems = d.problems.map(p =>
        p.id === problemSelId
          ? { ...p, linked_problem_id: null, linked_problem_name: undefined }
          : p,
      );
      let solutions = [...d.solutions];
      if (enabled) {
        const full = allSolutionsCatalog.find(s => s.id === solutionId);
        if (!full) return d;
        const idx = solutions.findIndex(s => s.id === solutionId);
        if (idx < 0) {
          solutions.push({ ...full, queue: '1', source_problem_sel_id: problemSelId });
        } else {
          solutions[idx] = { ...solutions[idx], source_problem_sel_id: problemSelId };
        }
      } else {
        solutions = solutions.filter(
          s => !(s.id === solutionId && s.source_problem_sel_id === problemSelId),
        );
      }
      return { ...d, problems, solutions };
    });
  }

  const customProblemBySelId = useMemo(() => {
    if (!data) return new Map<number, BriefingProblemSel>();
    return new Map(data.problems.filter(p => p.id != null).map(p => [p.id!, p]));
  }, [data]);

  function trackCustomerWidgetSolutions(widgetId: number, solutionIds: number[]) {
    const map = customerWidgetSolutionIdsRef.current;
    let set = map.get(widgetId);
    if (!set) {
      set = new Set();
      map.set(widgetId, set);
    }
    for (const id of solutionIds) set.add(id);
  }

  /** Решение имеет источник кроме снимаемого виджета заказчика. */
  function solutionHasOtherSource(
    solId: number,
    solutions: BriefingSolutionSel[],
    remainingCustomerWidgetIds: Set<number>,
    widgets: { solution_id: number; widget_id: number }[],
  ): boolean {
    const sel = solutions.find(s => s.id === solId);
    if (sel?.source_problem_sel_id) return true;
    if (manualSolutionIdsRef.current.has(solId)) return true;
    for (const w of widgets) {
      if (w.solution_id !== solId) continue;
      if (remainingCustomerWidgetIds.has(w.widget_id)) return true;
    }
    for (const [otherWidgetId, set] of customerWidgetSolutionIdsRef.current) {
      if (!remainingCustomerWidgetIds.has(otherWidgetId)) continue;
      if (set.has(solId)) return true;
    }
    return false;
  }

  function solutionsToRemoveOnCustomerWidgetUncheck(
    widgetId: number,
    solutions: BriefingSolutionSel[],
    customerWidgets: BriefingCustomerWidgetSel[],
    widgets: { solution_id: number; widget_id: number }[],
  ): Set<number> {
    const remainingCustomerWidgetIds = new Set(
      customerWidgets.filter(w => w.widget_id !== widgetId).map(w => w.widget_id),
    );

    const fromWidget = new Set<number>(customerWidgetSolutionIdsRef.current.get(widgetId) ?? []);
    for (const w of widgets) {
      if (w.widget_id === widgetId) fromWidget.add(w.solution_id);
    }
    for (const sol of solutionsByWidgetId.get(widgetId) ?? []) {
      if (solutions.some(s => s.id === sol.id)) fromWidget.add(sol.id);
    }
    customerWidgetSolutionIdsRef.current.delete(widgetId);

    const toRemove = new Set<number>();
    for (const solId of fromWidget) {
      if (solutionHasOtherSource(solId, solutions, remainingCustomerWidgetIds, widgets)) continue;
      toRemove.add(solId);
    }
    return toRemove;
  }

  function updateSolutionSelections(changes: { solutionId: number; next: BriefingSolutionSel | null }[]) {
    if (!data || data.read_only || changes.length === 0) return;
    for (const { solutionId, next } of changes) {
      if (next) manualSolutionIdsRef.current.add(solutionId);
      else manualSolutionIdsRef.current.delete(solutionId);
    }
    setData(d => {
      if (!d) return d;
      let solutions = [...d.solutions];
      let widgets = [...d.widgets];
      for (const { solutionId, next } of changes) {
        solutions = next
          ? [...solutions.filter(s => s.id !== solutionId), next]
          : solutions.filter(s => s.id !== solutionId);
        if (!next) widgets = widgets.filter(w => w.solution_id !== solutionId);
      }
      return { ...d, solutions, widgets };
    });
  }

  function updateSolutionSelection(solutionId: number, next: BriefingSolutionSel | null) {
    updateSolutionSelections([{ solutionId, next }]);
  }

  function toggleWidget(solutionId: number, widgetId: number) {
    if (!data) return;
    const exists = data.widgets.some(w => w.solution_id === solutionId && w.widget_id === widgetId);
    const widgets = exists
      ? data.widgets.filter(w => !(w.solution_id === solutionId && w.widget_id === widgetId))
      : [...data.widgets, { solution_id: solutionId, widget_id: widgetId }];
    setData(d => (d ? { ...d, widgets } : d));
  }

  const solutionsByWidgetId = useMemo(() => {
    const solutionById = new Map(allSolutionsCatalog.map(s => [s.id, s]));
    const map = new Map<number, Solution[]>();
    for (const link of solutionWidgetLinks) {
      if (link.widget_id == null || link.solution_id == null) continue;
      const sol = solutionById.get(link.solution_id);
      if (!sol) continue;
      const list = map.get(link.widget_id) ?? [];
      if (!list.some(s => s.id === sol.id)) list.push(sol);
      map.set(link.widget_id, list);
    }
    return map;
  }, [solutionWidgetLinks, allSolutionsCatalog]);

  /** Виджеты с хотя бы одной связью на решение или пункт ФС (+ уже выбранные, чтобы можно было снять). */
  const customerWidgetsCatalog = useMemo(() => {
    const usable = new Set<number>();
    for (const wid of solutionsByWidgetId.keys()) usable.add(wid);
    for (const link of widgetFsLinks) {
      if (link.widget_id != null) usable.add(link.widget_id);
    }
    const selectedIds = new Set((data?.customer_widgets ?? []).map(w => w.widget_id));
    return widgetsCatalog.filter(w => usable.has(w.id) || selectedIds.has(w.id));
  }, [widgetsCatalog, solutionsByWidgetId, widgetFsLinks, data?.customer_widgets]);

  function supplementSolutionsFromWidget(widgetId: number, solutionIds: number[]) {
    trackCustomerWidgetSolutions(widgetId, solutionIds);
    setData(d => {
      if (!d) return d;
      let solutions = [...d.solutions];
      let widgets = [...d.widgets];
      const customer_widgets = d.customer_widgets.some(w => w.widget_id === widgetId)
        ? d.customer_widgets
        : [...d.customer_widgets, {
          widget_id: widgetId,
          queue: '1',
          name: widgetsCatalog.find(w => w.id === widgetId)?.name,
        } satisfies BriefingCustomerWidgetSel];

      for (const solId of solutionIds) {
        const full = allSolutionsCatalog.find(s => s.id === solId);
        if (!full) continue;
        if (!solutions.some(s => s.id === solId)) {
          solutions.push({ ...full, queue: '1' });
        }
        if (!widgets.some(w => w.solution_id === solId && w.widget_id === widgetId)) {
          widgets.push({ solution_id: solId, widget_id: widgetId });
        }
      }
      return { ...d, solutions, widgets, customer_widgets };
    });
  }

  function requestToggleCustomerWidget(widget: Widget, enable: boolean) {
    if (!enable) {
      setData(d => {
        if (!d) return d;
        const removeSolutionIds = solutionsToRemoveOnCustomerWidgetUncheck(
          widget.id,
          d.solutions,
          d.customer_widgets ?? [],
          d.widgets,
        );
        return {
          ...d,
          customer_widgets: d.customer_widgets.filter(w => w.widget_id !== widget.id),
          solutions: d.solutions.filter(s => !removeSolutionIds.has(s.id)),
          widgets: d.widgets.filter(w => {
            if (w.widget_id === widget.id) return false;
            if (removeSolutionIds.has(w.solution_id)) return false;
            return true;
          }),
        };
      });
      return;
    }

    const linked = solutionsByWidgetId.get(widget.id) ?? [];
    if (linked.length > 1) {
      setWidgetSolutionsModal({ widget, candidates: linked });
      return;
    }

    const autoSolutionIds = linked.length === 1 ? [linked[0].id] : [];
    trackCustomerWidgetSolutions(widget.id, autoSolutionIds);

    setData(d => {
      if (!d) return d;
      const customer_widgets = d.customer_widgets.some(w => w.widget_id === widget.id)
        ? d.customer_widgets
        : [...d.customer_widgets, {
          widget_id: widget.id,
          queue: '1',
          name: widget.name,
          description: widget.description,
          image_path: widget.image_path,
          type: widget.type,
        }];
      let solutions = [...d.solutions];
      let widgets = [...d.widgets];
      if (linked.length === 1) {
        const sol = linked[0];
        if (!solutions.some(s => s.id === sol.id)) {
          solutions.push({ ...sol, queue: '1' });
        }
        if (!widgets.some(w => w.solution_id === sol.id && w.widget_id === widget.id)) {
          widgets.push({ solution_id: sol.id, widget_id: widget.id });
        }
      }
      return { ...d, customer_widgets, solutions, widgets };
    });
  }

  function confirmWidgetSolutionsPick(solutionIds: number[]) {
    if (!widgetSolutionsModal) return;
    const widgetId = widgetSolutionsModal.widget.id;
    supplementSolutionsFromWidget(widgetId, solutionIds);
    setWidgetSolutionsModal(null);
  }

  async function handleDeriveFs(goToFsTab = true) {
    if (data) {
      await saveBriefingCustomerWidgets(briefingId, (data.customer_widgets ?? []).map(w => ({
        widget_id: w.widget_id,
        queue: w.queue ?? '1',
      })));
      await saveBriefingSolutions(briefingId, data.solutions.map(s => ({
        solution_id: s.id,
        queue: s.queue ?? '1',
        queue_comment_json: serializeSolutionQueueCommentForSave(s),
        source_problem_sel_id: s.source_problem_sel_id ?? undefined,
      })));
      await saveBriefingWidgets(briefingId, data.widgets.map(w => ({
        solution_id: w.solution_id,
        widget_id: w.widget_id,
      })));
    }
    await deriveBriefingFs(briefingId);
    await load();
    if (goToFsTab) setTab('fs');
  }

  async function updateFsItem(item: BriefingFsSel, patch: Partial<BriefingFsSel>) {
    if (!data || data.read_only) return;
    const current = data.fs_items.find(i => i.fs_item_id === item.fs_item_id) ?? item;
    const merged: BriefingFsSel = {
      ...current,
      ...patch,
      source: patch.source ?? current.source ?? (isCustomerFsItem(current) ? 'customer' : 'manual'),
    };
    if (patch.queues_json !== undefined) {
      merged.queues_json = typeof patch.queues_json === 'string'
        ? parseQueuesJson(patch.queues_json)
        : patch.queues_json;
    }
    const queues = itemQueues(merged);
    merged.enabled = anyQueueEnabled(queues) ? 1 : 0;
    merged.queue = FS_QUEUE_KEYS.find(k => queues[k] === 1) ?? current.queue ?? '1';
    if (current.matched === false) merged.matched = true;

    const items = data.fs_items.map(i => (i.fs_item_id === item.fs_item_id ? merged : i));
    setAssessmentRecalcFlash(k => k + 1);
    setData({ ...data, fs_items: items });

    try {
      await saveBriefingFs(briefingId, buildFsSavePayload(items));
    } catch (e) {
      await load();
      throw e;
    }
  }

  function addCustomerFsItem(groupPrefix: CustomerFsGroupPrefix, groupName: string) {
    if (!data) return;
    const newItem = createCustomerFsItem(groupPrefix, groupName, data.fs_items);
    setAssessmentRecalcFlash(k => k + 1);
    setData({ ...data, fs_items: [...data.fs_items, newItem] });
  }

  async function deleteCustomerFsItem(item: BriefingFsSel) {
    if (!data) return;
    const items = data.fs_items.filter(i => i.fs_item_id !== item.fs_item_id);
    setAssessmentRecalcFlash(k => k + 1);
    setData({ ...data, fs_items: items });
    try {
      await saveBriefingFs(briefingId, buildFsSavePayload(items));
      await load();
    } catch (e) {
      await load();
      throw e;
    }
  }

  function mergeFsItemPatch(item: BriefingFsSel, patch: Partial<BriefingFsSel>): BriefingFsSel {
    const merged: BriefingFsSel = {
      ...item,
      ...patch,
      source: patch.source ?? item.source ?? 'manual',
    };
    if (patch.queues_json !== undefined) {
      merged.queues_json = typeof patch.queues_json === 'string'
        ? parseQueuesJson(patch.queues_json)
        : patch.queues_json;
    }
    const queues = itemQueues(merged);
    merged.enabled = anyQueueEnabled(queues) ? 1 : 0;
    merged.queue = FS_QUEUE_KEYS.find(k => queues[k] === 1) ?? item.queue ?? '1';
    if (item.matched === false && patch.matched !== false) merged.matched = true;
    return merged;
  }

  async function updateFsItems(updates: { item: BriefingFsSel; patch: Partial<BriefingFsSel> }[]) {
    if (!data || data.read_only || updates.length === 0) return;
    const byId = new Map<number, BriefingFsSel>();
    for (const { item, patch } of updates) {
      const current = byId.get(item.fs_item_id) ?? data.fs_items.find(i => i.fs_item_id === item.fs_item_id) ?? item;
      byId.set(item.fs_item_id, mergeFsItemPatch(current, patch));
    }
    const items = data.fs_items.map(i => byId.get(i.fs_item_id) ?? i);
    setAssessmentRecalcFlash(k => k + 1);
    setData({ ...data, fs_items: items });

    try {
      await saveBriefingFs(briefingId, buildFsSavePayload(items));
    } catch (e) {
      await load();
      throw e;
    }
  }

  async function saveParams(params: Partial<BriefingParams>) {
    await saveBriefingParams(briefingId, params);
    await load();
  }

  async function handleGenerateProject() {
    const name = prompt('Название проекта:', data?.name ? `Проект — ${data.name}` : undefined);
    if (!name) return;
    const { project_id } = await generateProjectFromBriefing(briefingId, {
      name, created_by: currentUserId ?? undefined,
    });
    onProjectGenerated(project_id);
  }

  function updateOrgSpQueues(queues: NonNullable<BriefingFull['assessment']>['org_volume']['queues']) {
    if (!data?.assessment) return;
    updateAssessment({
      org_volume: { ...data.assessment.org_volume, queues },
      org_volume_manual: true,
    });
  }

  function patchOrgSpRow(
    q: FsQueueKey,
    field: 'functional_sp' | 'integrations_sp' | 'nmd_sp' | 'load_test_scenarios',
    value: string | number,
  ): NonNullable<BriefingFull['assessment']>['org_volume']['queues'] {
    const assessment = data!.assessment!;
    const current = assessment.org_volume.queues[q];
    const nextRow = applyOrgQueueFieldPatch(current, field, value);
    return { ...assessment.org_volume.queues, [q]: nextRow };
  }

  function toggleQueueEvaluated(q: FsQueueKey, evaluated: boolean) {
    if (!data?.assessment) return;
    const current = data.assessment.org_volume.queues[q];
    updateOrgSpQueues({
      ...data.assessment.org_volume.queues,
      [q]: { ...current, evaluated },
    });
  }

  function setOrgSpField(q: FsQueueKey, field: 'functional_sp' | 'integrations_sp' | 'nmd_sp' | 'load_test_scenarios', value: string | number) {
    updateOrgSpQueues(patchOrgSpRow(q, field, value));
  }

  function commitOrgSpField(q: FsQueueKey, field: 'functional_sp' | 'integrations_sp' | 'nmd_sp' | 'load_test_scenarios', rawValue: string) {
    updateOrgSpQueues(patchOrgSpRow(q, field, rawValue));
  }

  function patchTrainingE(q: FsQueueKey, trainingField: TrainingEField, value: string | number) {
    if (!data?.assessment) return;
    const orgField = trainingEOrgField(trainingField);
    const current = data.assessment.org_volume.queues[q];
    const nextRow = applyOrgQueueFieldPatch(current, orgField, value);
    const params = mergePhaseCalcParams(data.assessment.phase_calc_params);
    updateAssessment({
      org_volume: {
        ...data.assessment.org_volume,
        queues: { ...data.assessment.org_volume.queues, [q]: nextRow },
      },
      org_volume_manual: true,
      phase_calc_params: patchTrainingEManual(params, q, trainingField),
    });
  }

  function resetTrainingE(q: FsQueueKey, trainingField: TrainingEField) {
    if (!data?.assessment) return;
    const current = data.assessment.org_volume.queues[q];
    const autoRow = data.assessment.auto_org_volume?.queues[q];
    const nextRow = resetTrainingEField(current, trainingField, autoRow);
    const params = mergePhaseCalcParams(data.assessment.phase_calc_params);
    updateAssessment({
      org_volume: {
        ...data.assessment.org_volume,
        queues: { ...data.assessment.org_volume.queues, [q]: nextRow },
      },
      phase_calc_params: resetTrainingEManual(params, q, trainingField),
    });
  }

  function patchTrainingGh(rowKey: TrainingRowKey, field: 'g' | 'h', value: string | number) {
    if (!data?.assessment) return;
    const params = mergePhaseCalcParams(data.assessment.phase_calc_params);
    const num = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(num) || num < 0) return;
    updateAssessment({
      phase_calc_params: patchTrainingManualGh(params, phaseQueue, rowKey, field, Math.round(num)),
    });
  }

  function resetTrainingGh(rowKey: TrainingRowKey, field: 'g' | 'h') {
    if (!data?.assessment) return;
    const params = mergePhaseCalcParams(data.assessment.phase_calc_params);
    updateAssessment({
      phase_calc_params: resetTrainingManualGh(params, phaseQueue, rowKey, field),
    });
  }

  function resetPhaseCalcParamToAuto(key: PhaseCalcNumericKey) {
    if (!data?.assessment) return;
    const result = resetQueuePhaseParamToAuto(
      data.assessment.phase_calc_params,
      phaseQueue,
      key,
      data.assessment,
    );
    updateAssessment({
      phase_calc_params: result.phase_calc_params,
      ...(result.phase_calc_params_omit
        ? { phase_calc_params_omit: result.phase_calc_params_omit }
        : {}),
    });
  }

  function resetPhaseCalcParamToQueue1(key: PhaseCalcNumericKey) {
    if (!data?.assessment) return;
    updateAssessment({
      phase_calc_params: resetQueuePhaseParamToBaseQueue(
        data.assessment.phase_calc_params,
        phaseQueue,
        key,
      ),
    });
  }

  function resetRdModeToAuto() {
    if (!data?.assessment) return;
    const result = resetQueueRdModeToAuto(data.assessment.phase_calc_params, phaseQueue);
    updateAssessment({
      phase_calc_params: result.phase_calc_params,
      ...(result.phase_calc_params_omit
        ? { phase_calc_params_omit: result.phase_calc_params_omit }
        : {}),
    });
  }

  function resetRdModeToQueue1() {
    if (!data?.assessment) return;
    updateAssessment({
      phase_calc_params: resetQueueRdModeToBaseQueue(
        data.assessment.phase_calc_params,
        phaseQueue,
      ),
    });
  }

  function resetHeadcountOpeParamToAuto(field: 'c67' | 'c68') {
    if (!data?.assessment) return;
    updateAssessment({
      phase_calc_params: resetHeadcountOpeToAuto(
        data.assessment.phase_calc_params,
        phaseQueue,
        field,
        data.assessment,
      ),
    });
  }

  function resetHeadcountOpeParamToQueue1(field: 'c67' | 'c68') {
    if (!data?.assessment) return;
    updateAssessment({
      phase_calc_params: resetHeadcountOpeToBaseQueue(
        data.assessment.phase_calc_params,
        phaseQueue,
        field,
      ),
    });
  }

  function patchC89(value: string | number) {
    if (!data?.assessment) return;
    const num = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(num) || num < 0) return;
    const auto = computeAutoC89FromR81(phaseQueue, data.assessment, data.fs_items);
    if (Math.round(num) === Math.round(auto)) {
      resetC89();
      return;
    }
    updateAssessment({
      phase_calc_params: patchC89Manual(
        data.assessment.phase_calc_params,
        phaseQueue,
        Math.round(num),
      ),
    });
  }

  function resetC89() {
    if (!data?.assessment) return;
    updateAssessment({
      phase_calc_params: resetC89Manual(
        data.assessment.phase_calc_params,
        phaseQueue,
      ),
    });
  }

  if (loadError) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 text-red-600 p-4">
        <div className="text-sm font-medium">Не удалось загрузить предоценку</div>
        <div className="text-xs text-red-500 max-w-md text-center">{loadError}</div>
        <button onClick={() => void load()} className="text-xs text-blue-600 hover:underline">Повторить</button>
      </div>
    );
  }

  if (!data) {
    return <div className="flex-1 min-h-0 flex items-center justify-center text-slate-400">Загрузка...</div>;
  }

  const params = data.params;
  const team = parseJson<TeamProportions>(params.team_json, DEFAULT_TEAM);
  const queueLabels = parseQueueLabels(params.queue_labels_json);
  const readOnly = !!data.read_only;

  function updateQueueLabel(q: FsQueueKey, name: string) {
    if (data?.read_only) return;
    setData(d => {
      if (!d) return d;
      const labels = parseQueueLabels(d.params.queue_labels_json);
      const trimmed = name.trim();
      labels[q] = trimmed || FS_QUEUE_LABELS[q];
      return { ...d, params: { ...d.params, queue_labels_json: labels } };
    });
  }

  const tabSaveHandlers: Record<Tab, () => void> = {
    customer: saveCustomerTab,
    widgets: saveWidgetsTab,
    solutions: saveSolutionsTab,
    fs: saveFsTab,
    assessment: saveAssessmentTab,
    params: saveParamsTab,
    scenarios: saveScenariosTab,
  };

  function renderGenerateProjectButton() {
    if (!data) return null;
    if (data.project_id) {
      return (
        <span className="text-sm text-green-600">
          Проект уже создан (ID: {data.project_id})
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => void handleGenerateProject()}
        className="text-sm bg-emerald-600 text-white px-4 py-2 rounded hover:bg-emerald-700"
      >
        Сформировать калькулятор
      </button>
    );
  }

  return (
    <BriefingReadOnlyContext.Provider value={readOnly}>
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-4 flex gap-0 shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs px-3 py-2.5 border-b-2 whitespace-nowrap transition-colors font-medium
              ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {data && (
        <BriefingVersionBar
          briefingId={briefingId}
          data={data}
          onViewVersion={viewed => {
            if (viewed.assessment?.phase_calc_params) {
              viewed.assessment.phase_calc_params = mergePhaseCalcParams(viewed.assessment.phase_calc_params);
            }
            setData({
              ...viewed,
              activity_type_ids: viewed.activity_type_ids ?? [],
              customer_widgets: viewed.customer_widgets ?? [],
            });
          }}
          onReloadDraft={() => { void load(); }}
        />
      )}

      <BriefingReadOnlyLayer className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-4 py-2 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <TabSaveBar
            tabId={tab}
            onSave={tabSaveHandlers[tab]}
            savingTab={savingTab}
            feedback={saveFeedback}
            disabled={!!data?.read_only}
          />
          {tab === 'customer' && (
            <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-slate-500 block mb-1">Название оценки</label>
                <input className="w-full text-sm border rounded px-3 py-1.5" value={data.name}
                  onChange={e => setData({ ...data, name: e.target.value })} />
              </div>
              <div className="w-32 shrink-0">
                <label className="text-xs text-slate-500 block mb-1">Сценарий</label>
                <select className="w-full text-sm border rounded px-3 py-1.5"
                  value={data.scenario ?? ''}
                  onChange={e => setData({ ...data, scenario: e.target.value || null })}>
                  <option value="">— выберите —</option>
                  {SCENARIOS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="w-40 shrink-0">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <label className="text-xs text-slate-500 whitespace-nowrap">Численность (C62)</label>
                  {data.assessment?.headcount_manual && (
                    <button type="button" className="text-[10px] text-blue-600 hover:underline whitespace-nowrap"
                      onClick={() => updateAssessment({ reset_headcount: true })}>
                      Сбросить
                    </button>
                  )}
                </div>
                <select
                  className={`w-full text-sm border rounded px-3 py-1.5 ${data.assessment?.headcount_manual ? OVERRIDE_INPUT_CLASS : ''}`}
                  value={data.assessment?.headcount_category ?? 'до 200'}
                  onChange={e => handleHeadcountCategoryChange(e.target.value)}
                >
                  {HEADCOUNT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {tab === 'solutions' && (
            <button
              type="button"
              onClick={() => void handleDeriveFs(true)}
              className="text-sm bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Сформировать ФС →
            </button>
          )}
          {tab === 'fs' && (
            <button
              type="button"
              onClick={() => void handleDeriveFs(false)}
              className="text-sm text-blue-600 border border-blue-200 px-3 py-1.5 rounded hover:bg-blue-50"
            >
              Обновить из выборов
            </button>
          )}
          {(tab === 'params' || tab === 'scenarios') && renderGenerateProjectButton()}
        </div>
      </div>

      <div className={`flex-1 min-h-0 p-4 ${tab === 'customer' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {tab === 'customer' && (
          <div className="flex flex-col gap-2 flex-1 min-h-0">
            <div
              className="grid w-full items-center gap-2 shrink-0"
              style={{
                gridTemplateColumns: customerProblemFilterActive
                  ? 'minmax(0, 1fr) minmax(3rem, 10%) auto'
                  : 'minmax(0, 1fr) minmax(3rem, 10%)',
              }}
            >
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-slate-500 shrink-0">Виды деятельности</span>
                <ChipMultiSelect
                  items={activityTypes}
                  selectedIds={briefingActivityTypeIds(data)}
                  onChange={setBriefingActivityTypeIds}
                  emptyLabel="Справочник видов деятельности пуст"
                />
              </div>
              <select
                className="text-[11px] border rounded px-1 py-0.5 bg-white w-full min-w-0 truncate justify-self-end"
                value={data.segment_id ?? ''}
                title={`Сегмент: ${segments.find(s => s.id === data.segment_id)?.name ?? 'все'}`}
                onChange={e => setData({ ...data, segment_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Сегм.</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {customerProblemFilterActive && (
                <button
                  type="button"
                  data-readonly-allow
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0 justify-self-end"
                  onClick={() => setShowAllProblems(v => !v)}
                >
                  {showAllProblems ? 'Только по фильтру' : 'Показать все'}
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-slate-500 shrink-0">Заказчик (роли)</span>
              <ChipMultiSelect
                items={stakeholderRoles}
                selectedIds={data.stakeholder_role_ids ?? []}
                onChange={setBriefingStakeholderRoleIds}
                emptyLabel="Справочник ролей пуст"
              />
            </div>
            {customerProblemFilterActive && (
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-slate-500 shrink-0">Гипотезы</span>
                {availableHypothesesForFilter.length > 0 ? (
                  <ChipMultiSelect
                    items={availableHypothesesForFilter}
                    selectedIds={hypothesisFilterIds}
                    onChange={setHypothesisFilterIds}
                    emptyLabel=""
                    navigationOnly
                  />
                ) : (
                  <span className="text-[11px] text-slate-400">нет по текущему фильтру</span>
                )}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
              <ProblemsSelectTable
                units={problemDisplayUnits}
                selectedIds={selectedProblemIds}
                getFilterMismatchHint={getProblemFilterMismatchHint}
                onProblemsChange={updateProblemSelections}
                solutionsByProblemId={solutionsByProblemId}
              />
              <CustomProblemCards
                items={data.problems.filter(p => p.custom_text)}
                selectedSolutions={data.solutions}
                solutionsByLinkedProblemId={solutionsByProblemId}
                onLink={setLinkModalSelId}
                onEditSolutions={setCustomSolutionsSelId}
                onUnlink={unlinkCustomProblem}
                onRemove={removeCustomProblem}
              />
              {linkModalSelId != null && (
                <CustomProblemLinkModal
                  problems={allProblemsCatalog}
                  onClose={() => setLinkModalSelId(null)}
                  onSelect={linkedId => applyLinkCustomProblem(linkModalSelId, linkedId)}
                />
              )}
              {customSolutionsSelId != null && (() => {
                const p = customProblemBySelId.get(customSolutionsSelId);
                if (!p?.custom_text) return null;
                const selectedIds = new Set(
                  data.solutions
                    .filter(s => s.source_problem_sel_id === customSolutionsSelId)
                    .map(s => s.id),
                );
                return (
                  <CustomProblemSolutionsModal
                    customText={p.custom_text}
                    solutions={allSolutionsCatalog}
                    selectedIds={selectedIds}
                    onToggle={(solutionId, enabled) =>
                      toggleCustomProblemSolution(customSolutionsSelId, solutionId, enabled)
                    }
                    onClose={() => setCustomSolutionsSelId(null)}
                  />
                );
              })()}
              <div className="flex gap-2 shrink-0">
                <input className="flex-1 text-sm border rounded px-2 py-1" placeholder="Свободный ввод проблематики"
                  value={customProblem} onChange={e => setCustomProblem(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomProblem(); }} />
                <button onClick={addCustomProblem} className="text-sm bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">+</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'widgets' && (
          <div className="space-y-3">
            <CustomerWidgetsPanel
              catalog={customerWidgetsCatalog}
              selected={data.customer_widgets ?? []}
              solutionsByWidgetId={solutionsByWidgetId}
              onRequestToggle={requestToggleCustomerWidget}
              onOpenWidgetCard={setWidgetCardId}
            />
            {widgetSolutionsModal && (
              <WidgetSolutionsPickModal
                widgetName={widgetSolutionsModal.widget.name}
                solutions={widgetSolutionsModal.candidates}
                initialSelectedIds={new Set()}
                onClose={() => setWidgetSolutionsModal(null)}
                onConfirm={confirmWidgetSolutionsPick}
              />
            )}
          </div>
        )}

        {tab === 'solutions' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500 flex-1 min-w-[240px]">
                {showAllSolutions
                  ? 'Все решения справочника. Курсивом — не связаны с выбранными проблематиками.'
                  : 'Решения, сопоставленные с выбранными проблематиками (и группы из НСИ).'}
                {' '}Назначьте очередь («Да»), комментарий — в колонке «Коммент.» той же очереди.
              </p>
              <button
                type="button"
                data-readonly-allow
                className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
                onClick={() => setShowAllSolutions(v => !v)}
              >
                {showAllSolutions ? 'Только по проблематикам' : 'Показать все решения'}
              </button>
            </div>
            <SolutionsQueueTable
              units={solutionDisplayUnits}
              isUnmatched={isSolutionUnmatched}
              selected={data.solutions}
              solutionWidgets={solutionWidgets}
              widgetSelections={data.widgets}
              queueLabels={parseQueueLabels(data.params.queue_labels_json)}
              onQueueLabelChange={updateQueueLabel}
              onSolutionsChange={updateSolutionSelections}
              onToggleWidget={toggleWidget}
              onOpenSolution={sol => setSolutionCardId(sol.id)}
              onOpenWidgetCard={setWidgetCardId}
            />
            {solutionCardId != null && (
              <BriefingSolutionCardModal
                solutionId={solutionCardId}
                selectedProblemIds={selectedProblemIds}
                problemsCatalog={allProblemsCatalog}
                onOpenWidgetCard={setWidgetCardId}
                onClose={() => setSolutionCardId(null)}
              />
            )}
          </div>
        )}

        {tab === 'fs' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-slate-500 flex-1">
                Полный каталог ФС. При переходе на вкладку разделы свёрнуты. Клик по «Да/Нет» в заголовке — фильтр пунктов с «Да» (колонка «Все очереди» или очередь).
                Клик по названию очереди — переименование (сохраняется с «Сохранить»).
              </p>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 whitespace-nowrap shrink-0"
                onClick={() => void openCatalogAddModal()}
              >
                + Добавить из НСИ
              </button>
            </div>
            {catalogAddOpen && (
              <FsCatalogAddModal
                items={catalogAddItems}
                loading={catalogAddLoading}
                onClose={() => setCatalogAddOpen(false)}
                onConfirm={ids => void confirmCatalogAdd(ids)}
              />
            )}
            {data.fs_items.length === 0 ? (
              <p className="text-sm text-slate-400">Каталог ФС пуст. Запустите импорт: npm run import:briefing-data --workspace=server</p>
            ) : (
              <FsQueueTable
                key={fsTableVisitKey}
                items={data.fs_items}
                onChange={updateFsItem}
                onChangeMany={updateFsItems}
                queueLabels={queueLabels}
                onQueueLabelChange={updateQueueLabel}
                onAddCustomerItem={addCustomerFsItem}
                onDeleteCustomerItem={deleteCustomerFsItem}
                fsTraceByItemId={fsTraceByItemId}
                requiredSolutionsByFsItemId={requiredSolutionsByFsItemId}
                onOpenWidgetCard={setWidgetCardId}
              />
            )}
          </div>
        )}

        {tab === 'assessment' && data.assessment && (
          <div className="space-y-3">
            <AssessmentTab
              assessment={data.assessment}
              recalcFlash={assessmentRecalcFlash}
              onChange={handleAssessmentChange}
            />
          </div>
        )}

        {tab === 'params' && (
          <div className="w-full space-y-4">
            {data.assessment && (() => {
              const fsSp = computeQueueSpFromFs(data.fs_items ?? []);
              const activeQueues = getEvaluatedQueueKeys(data.assessment!.org_volume);
              const unifiedRateActive = activeQueues.length > 0 ? activeQueues : undefined;
              const unifiedRateExtra = (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.assessment!.unified_rate_enabled}
                    onChange={e => {
                      const enabled = e.target.checked;
                      if (enabled) {
                        const maxRate = computeAutoUnifiedRate(data.assessment!.queue_calcs, unifiedRateActive);
                        updateAssessment({
                          unified_rate_enabled: true,
                          unified_rate: maxRate,
                          unified_rate_manual: false,
                        });
                      } else {
                        updateAssessment({ unified_rate_enabled: false });
                      }
                    }}
                  />
                  Единая ставка по очередям
                </label>
              );
              return (
                <CollapsibleSection
                  title="SP, технология и ставки"
                  subtitle="C20, C21, D20, E20, C33, C32 — по очередям"
                  headerExtra={unifiedRateExtra}
                >
                  {data.assessment!.unified_rate_enabled && (
                    <div className="mb-3 flex items-end gap-3 flex-wrap">
                      <div>
                        <label className="text-xs text-slate-500 block mb-1">Единая ставка, руб/ч</label>
                        <input
                          type="number"
                          min="0"
                          className={`w-40 text-sm border rounded px-3 py-2 text-right ${
                            data.assessment!.unified_rate_manual ? 'bg-amber-50 border-amber-300' : ''
                          }`}
                          value={
                            isUnifiedRateAutoMode(data.assessment!)
                              ? computeAutoUnifiedRate(data.assessment!.queue_calcs, unifiedRateActive)
                              : data.assessment!.unified_rate
                          }
                          onChange={e => {
                            updateAssessment({
                              unified_rate: Number(e.target.value),
                              unified_rate_manual: true,
                            });
                          }}
                        />
                      </div>
                      {data.assessment!.unified_rate_manual && (
                        <button
                          type="button"
                          className="text-xs text-blue-600 hover:underline pb-2"
                          onClick={() => {
                            const maxRate = computeAutoUnifiedRate(data.assessment!.queue_calcs, unifiedRateActive);
                            updateAssessment({
                              unified_rate: maxRate,
                              unified_rate_manual: false,
                            });
                          }}
                        >
                          Сбросить к max
                        </button>
                      )}
                    </div>
                  )}
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="p-2 border text-left">Очередь</th>
                        <th className="p-2 border text-center w-16" title="Есть пункты ФС в этой очереди">ФС</th>
                        <th className="p-2 border text-center w-20" title="Включить очередь в оценку РП">Оценивать</th>
                        <th className="p-2 border text-right w-24" title="Функциональный объём — без интеграций и НМД">SP</th>
                        <th className="p-2 border text-right w-28">SP Интегр.</th>
                        <th className="p-2 border text-right w-24">SP НМД</th>
                        <th className="p-2 border text-right w-28" title="Сценарии нагрузочного тестирования — авто ROUNDUP(C20/5, 0)">Сцен. НТ</th>
                        <th className="p-2 border text-left min-w-[140px]">Технология (C33)</th>
                        <th className="p-2 border text-right w-24" title="Авто из технологии и НСИ">Ставка (C32)</th>
                        <th className="p-2 border text-right w-28">Ручная ставка</th>
                        <th className="p-2 border w-28" />
                      </tr>
                      <tr className="bg-slate-50 text-slate-400 text-[10px]">
                        <th className="p-1 border" />
                        <th className="p-1 border text-center">ФС</th>
                        <th className="p-1 border text-center">оценка</th>
                        <th className="p-1 border text-center">C20</th>
                        <th className="p-1 border text-center">C21</th>
                        <th className="p-1 border text-center">D20</th>
                        <th className="p-1 border text-center">E20</th>
                        <th className="p-1 border text-center">по очереди</th>
                        <th className="p-1 border text-center">₽/ч</th>
                        <th className="p-1 border text-center">₽/ч</th>
                        <th className="p-1 border" />
                      </tr>
                    </thead>
                    <tbody>
                      {FS_QUEUE_KEYS.map(q => {
                        const row = data.assessment!.org_volume.queues[q];
                        const qc = data.assessment!.queue_calcs.find(r => r.queue === q);
                        const functionalPlaceholder = fsSp.functional_sp[q] > 0
                          ? String(fsSp.functional_sp[q]) : '';
                        const integrationsPlaceholder = fsSp.integrations_sp_auto[q] > 0
                          ? String(fsSp.integrations_sp_auto[q]) : '';
                        const nmdPlaceholder = fsSp.nmd_sp_auto[q] > 0
                          ? String(fsSp.nmd_sp_auto[q]) : '';
                        const c20Effective = effectiveFunctionalSp(q, row.functional_sp, fsSp.functional_sp[q]);
                        const evaluated = isQueueEvaluated(row);
                        const loadTestPlaceholder = String(autoLoadTestScenarios(evaluated, c20Effective));
                        return (
                          <tr key={q} className={evaluated ? undefined : 'text-slate-400 bg-slate-50/60'}>
                            <td className="p-2 border font-medium">{queueLabel(queueLabels, q)}</td>
                            <td className="p-2 border text-center">
                              <input type="checkbox" checked={row.active} disabled
                                className="opacity-60" title="Из ФС (есть пункты в очереди)" />
                            </td>
                            <td className="p-2 border text-center">
                              <input
                                type="checkbox"
                                checked={evaluated}
                                title={row.active
                                  ? 'Оценка очереди'
                                  : 'Можно включить без ФС, напр. тиражирование'}
                                onChange={e => toggleQueueEvaluated(q, e.target.checked)}
                              />
                            </td>
                            <td className="p-2 border text-right" title="SP функционала (C20)">
                              <input type="number" min="0" step="1"
                                disabled={!evaluated}
                                className="w-full text-right border rounded px-1 py-0.5 tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
                                value={isQueueSpUnset(row.functional_sp) ? '' : row.functional_sp}
                                placeholder={functionalPlaceholder}
                                onChange={e => setOrgSpField(q, 'functional_sp', e.target.value)}
                                onBlur={e => commitOrgSpField(q, 'functional_sp', e.target.value)}
                                {...numericInputHandlers} />
                            </td>
                            <td className="p-2 border text-right" title="SP интеграций (C21)">
                              <input type="number" min="0" step="1"
                                disabled={!evaluated}
                                className="w-full text-right border rounded px-1 py-0.5 tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
                                value={isQueueSpUnset(row.integrations_sp) ? '' : row.integrations_sp}
                                placeholder={integrationsPlaceholder}
                                onChange={e => setOrgSpField(q, 'integrations_sp', e.target.value)}
                                onBlur={e => commitOrgSpField(q, 'integrations_sp', e.target.value)}
                                {...numericInputHandlers} />
                            </td>
                            <td className="p-2 border text-right" title="SP НМД (D20)">
                              <input type="number" min="0" step="1"
                                disabled={!evaluated}
                                className="w-full text-right border rounded px-1 py-0.5 tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
                                value={isQueueSpUnset(row.nmd_sp) ? '' : row.nmd_sp}
                                placeholder={nmdPlaceholder}
                                onChange={e => setOrgSpField(q, 'nmd_sp', e.target.value)}
                                onBlur={e => commitOrgSpField(q, 'nmd_sp', e.target.value)}
                                {...numericInputHandlers} />
                            </td>
                            <td className="p-2 border text-right" title="Сценариев нагрузочного тестирования (E20)">
                              <input type="number" min="0" step="1"
                                disabled={!evaluated}
                                className="w-full text-right border rounded px-1 py-0.5 tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
                                value={isQueueSpUnset(row.load_test_scenarios) ? '' : row.load_test_scenarios}
                                placeholder={loadTestPlaceholder}
                                onChange={e => setOrgSpField(q, 'load_test_scenarios', e.target.value)}
                                onBlur={e => commitOrgSpField(q, 'load_test_scenarios', e.target.value)}
                                {...numericInputHandlers} />
                            </td>
                            {qc && evaluated ? (
                              <>
                                <td className="p-2 border">
                                  <select
                                    className={`w-full text-xs border rounded px-1 py-1 ${
                                      qc.technology_manual ? 'bg-amber-50 border-amber-300' : ''
                                    }`}
                                    value={normalizeQueueTechnologyLabel(
                                      qc.technology ?? qc.auto_technology ?? QUEUE_TECHNOLOGY_OPTIONS[0],
                                    )}
                                    onChange={e => {
                                      updateAssessment(a => ({
                                        queue_calcs: a.queue_calcs.map(r =>
                                          r.queue === q
                                            ? {
                                                ...r,
                                                technology: e.target.value,
                                                technology_manual: 1,
                                                rate_manual: 0,
                                              }
                                            : r,
                                        ),
                                      }));
                                    }}
                                  >
                                    {QUEUE_TECHNOLOGY_OPTIONS.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                  {!qc.technology_manual && (
                                    <div className="text-[10px] text-slate-400 mt-0.5">авто</div>
                                  )}
                                </td>
                                <td className="p-2 border text-right tabular-nums font-medium">
                                  {(qc.nsi_rate ?? 0).toLocaleString('ru')}
                                </td>
                                <td className="p-2 border">
                                  <input type="number" min="0"
                                    className={`w-full text-right border rounded px-2 py-1 ${qc.rate_manual ? 'bg-amber-50 border-amber-300' : ''}`}
                                    value={qc.rate}
                                    onChange={e => {
                                      const rate = Number(e.target.value);
                                      updateAssessment(a => ({
                                        queue_calcs: a.queue_calcs.map(r =>
                                          r.queue === q ? { ...r, rate, rate_manual: 1 } : r
                                        ),
                                      }));
                                    }} />
                                </td>
                                <td className="p-2 border text-center text-[10px]">
                                  {qc.rate_manual ? (
                                    <button type="button" className="text-blue-600 hover:underline"
                                      onClick={() => {
                                        updateAssessment(a => ({
                                          queue_calcs: a.queue_calcs.map(r =>
                                            r.queue === q ? { ...r, rate: r.nsi_rate, rate_manual: 0 } : r
                                          ),
                                        }));
                                      }}>
                                      Сбросить ставку
                                    </button>
                                  ) : null}
                                  {qc.technology_manual ? (
                                    <button type="button" className="text-blue-600 hover:underline block mt-0.5"
                                      onClick={() => {
                                        updateAssessment(a => ({
                                          queue_calcs: a.queue_calcs.map(r =>
                                            r.queue === q
                                              ? { ...r, technology_manual: 0, rate_manual: 0 }
                                              : r,
                                          ),
                                        }));
                                      }}>
                                      Сбросить технологию
                                    </button>
                                  ) : null}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="p-2 border text-slate-400">—</td>
                                <td className="p-2 border text-slate-400">—</td>
                                <td className="p-2 border text-slate-400">—</td>
                                <td className="p-2 border" />
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={11} className="p-2 border text-[10px] text-slate-400">
                          C20/C21/D20 заполняются автоматически из ФС; C21 — только раздел 11 («ФС интеграции»). Пустое поле = авто.
                          «Оценивать» — включение очереди в расчёт (можно без ФС, напр. тиражирование).
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </CollapsibleSection>
              );
            })()}
            {data.assessment?.phase_calc_params && (
              <CollapsibleSection
                title="Параметры расчёта фаз"
                headerExtra={(
                  <QueueSwitcher
                    showLabel
                    value={phaseQueue}
                    onChange={setPhaseQueue}
                    labels={queueLabels}
                    queues={activePhaseQueues}
                  />
                )}
              >
                <PhaseCalcParamsPanel
                  bare
                  params={data.assessment.phase_calc_params}
                assessment={data.assessment}
                fsItems={data.fs_items}
                queue={phaseQueue}
                onQueueChange={setPhaseQueue}
                onChange={(patch, omit) => updateAssessment({
                  phase_calc_params: patch,
                  ...(omit?.length ? { phase_calc_params_omit: omit } : {}),
                })}
                onParamResetToAuto={resetPhaseCalcParamToAuto}
                onParamResetToQueue1={resetPhaseCalcParamToQueue1}
                onRdModeResetToAuto={resetRdModeToAuto}
                onRdModeResetToQueue1={resetRdModeToQueue1}
                onHeadcountOpeResetToAuto={resetHeadcountOpeParamToAuto}
                onHeadcountOpeResetToQueue1={resetHeadcountOpeParamToQueue1}
                onC89Change={patchC89}
                onC89Reset={resetC89}
                onTrainingEChange={(field, value) => patchTrainingE(phaseQueue, field, value)}
                onTrainingEReset={field => resetTrainingE(phaseQueue, field)}
                onTrainingGhChange={patchTrainingGh}
                onTrainingGhReset={resetTrainingGh}
                recalcFlash={assessmentRecalcFlash}
                onAssessmentChange={handleAssessmentChange}
                accuracyPct={params.accuracy ?? 0}
                onAccuracyChange={v => saveParams({ accuracy: v })}
                queueLabels={queueLabels}
                activeQueues={activePhaseQueues}
              />
              </CollapsibleSection>
            )}
            {data.assessment?.phase_calc_defs && data.assessment.phase_calc && (
              <PhaseCalcTable
                defs={data.assessment.phase_calc_defs}
                phaseCalc={data.assessment.phase_calc}
                assessment={data.assessment}
                fsItems={data.fs_items}
                activeQueue={phaseQueue}
                onActiveQueueChange={setPhaseQueue}
                autoRisks={data.assessment.auto_risks}
                ot={{
                  risks: data.assessment.effective_risks_ot,
                  storedRisks: data.assessment.risks_ot ?? {},
                  autoRisks: data.assessment.auto_risks,
                  risksManualKeys: data.assessment.risks_manual_keys_ot ?? {},
                  risksManual: data.assessment.risks_manual_ot,
                }}
                doSide={{
                  risks: data.assessment.effective_risks_do,
                  storedRisks: data.assessment.risks_do ?? {},
                  autoRisks: data.assessment.auto_risks,
                  risksManualKeys: data.assessment.risks_manual_keys_do ?? {},
                  risksManual: data.assessment.risks_manual_do,
                }}
                accuracyPct={params.accuracy ?? 0}
                defaultTeam={team}
                queueLabels={queueLabels}
                activeQueues={activePhaseQueues}
                onChange={patch => updateAssessment({ phase_calc: patch })}
                onRisksChange={patch => handleAssessmentChange(patch)}
              />
            )}
          </div>
        )}

        {tab === 'scenarios' && data.assessment && (
          <div className="space-y-4">
            <AssessmentScenariosTab
              briefingId={briefingId}
              briefingUpdatedAt={data.updated_at}
              assessment={data.assessment}
              fsItems={data.fs_items}
              accuracyPct={params.accuracy ?? 0}
              defaultTeam={team}
              nsi={assessmentNsi ?? undefined}
              snapshots={data.assessment_snapshots ?? []}
              queueLabels={queueLabels}
              summaryMatrix={summaryScenarioMatrix}
              onChange={scenarios => updateAssessment({ assessment_scenarios: scenarios })}
              onSnapshotsChange={snaps => {
                if (data.read_only) return;
                setData(d => d ? { ...d, assessment_snapshots: snaps } : d);
              }}
            />
          </div>
        )}
      </div>
      </BriefingReadOnlyLayer>

      {widgetCardId != null && (
        <BriefingWidgetCardModal
          widgetId={widgetCardId}
          selectedProblemIds={selectedProblemIds}
          problemsCatalog={allProblemsCatalog}
          onClose={() => setWidgetCardId(null)}
        />
      )}
    </div>
    </BriefingReadOnlyContext.Provider>
  );
}
