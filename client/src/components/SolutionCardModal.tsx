import React, { useEffect, useMemo, useState } from 'react';
import type { FsCatalogGroup, FsCatalogItem, Solution, SolutionDetail, SolutionFsLink, SolutionFsLinkType, Widget } from '../types';
import { YES_NO_BADGE_CLASS, yesNoClass, yesNoLabel } from '../utils/yesNoBadge';
import { fsLinksFromMap, fsLinksToMap } from '../utils/fsLinkBadge';
import {
  buildSolutionHierarchyRows,
  type SolutionHierarchyInput,
  type SolutionHierarchySortBy,
} from '../utils/solutionHierarchyRows';
import SolutionFsPanel from './SolutionFsPanel';
import SolutionWidgetsPanel from './SolutionWidgetsPanel';
import { WidgetGroupedSections } from './WidgetGroupedList';
import { WidgetImageThumbnail } from './WidgetImagePreview';

export type SolutionDraft = {
  name: string;
  description: string;
  hypothesis: string;
  parent_id: number | '';
  lcm_code: string;
  fs_mapped: boolean;
};

export function solutionToDraft(solution: Solution): SolutionDraft {
  return {
    name: solution.name,
    description: solution.description ?? '',
    hypothesis: solution.hypothesis ?? '',
    parent_id: solution.parent_id ?? '',
    lcm_code: solution.lcm_code ?? '',
    fs_mapped: Boolean(solution.fs_mapped),
  };
}

export function emptySolutionDraft(hypothesis = ''): SolutionDraft {
  return { name: '', description: '', hypothesis, parent_id: '', lcm_code: '', fs_mapped: false };
}

export type LcmProblemOption = {
  id: number;
  name: string;
  parent_id?: number | null;
  catalog_code?: string | null;
  hypothesis_code?: string | null;
  lcm_code?: string | null;
  sort_order?: number;
};

function ProblemsHierarchyTable({
  problems,
  sortBy,
  catalog,
  linkedIds,
  onUnlink,
}: {
  problems: SolutionHierarchyInput[];
  sortBy: SolutionHierarchySortBy;
  catalog?: SolutionHierarchyInput[];
  linkedIds?: Set<number>;
  onUnlink?: (id: number) => void;
}) {
  const rows = useMemo(
    () => buildSolutionHierarchyRows(problems, sortBy, catalog),
    [problems, sortBy, catalog],
  );

  if (rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-slate-400">Нет привязанных проблематик</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-100">
          <th className="px-3 py-1.5 font-medium w-16">Сквозной</th>
          <th className="px-3 py-1.5 font-medium w-16">LCM</th>
          <th className="px-3 py-1.5 font-medium">Проблематика</th>
          {onUnlink ? <th className="px-2 py-1.5 w-8" /> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const isLinked = linkedIds ? linkedIds.has(row.id) : row.linked;
          const muted = !isLinked;
          return (
            <tr
              key={row.id}
              className={`border-b border-slate-50 last:border-0 ${muted ? 'bg-slate-50/80' : ''}`}
            >
              <td className={`px-3 py-1.5 font-mono align-top ${muted ? 'text-slate-300' : 'text-slate-400'}`}>
                {row.catalogCode}
              </td>
              <td className={`px-3 py-1.5 font-mono align-top ${muted ? 'text-slate-300' : 'text-slate-400'}`}>
                {row.lcmCode}
              </td>
              <td
                className={`px-3 py-1.5 whitespace-pre-wrap align-top ${muted ? 'text-slate-400 italic' : 'text-slate-700'}`}
                style={{ paddingLeft: `${12 + row.depth * 12}px` }}
              >
                {row.name}
                {muted ? <span className="ml-1 text-[9px] not-italic text-slate-300">(предок)</span> : null}
              </td>
              {onUnlink ? (
                <td className="px-2 py-1.5 align-top">
                  {isLinked ? (
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-600 text-[10px]"
                      onClick={() => onUnlink(row.id)}
                      title="Отвязать"
                    >
                      ✕
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function usageProblemsToInputs(
  problems: SolutionDetail['hypothesis_usages'][number]['problems'],
): SolutionHierarchyInput[] {
  return problems.map(p => ({
    id: p.id,
    name: p.name,
    parent_id: p.parent_id ?? null,
    catalog_code: p.catalog_code ?? null,
    hypothesis_code: p.hypothesis_code ?? null,
    lcm_code: p.lcm_code ?? null,
    sort_order: p.sort_order,
    linked: p.linked !== false,
  }));
}

function HypothesisUsagesPanel({
  solution,
  sortBy,
  focusHypothesisId,
  compactOthersAsLinks,
}: {
  solution: SolutionDetail;
  sortBy: SolutionHierarchySortBy;
  focusHypothesisId?: number;
  /** Из LCM: другие гипотезы — гиперссылки с inline-раскрытием */
  compactOthersAsLinks?: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  if (solution.hypothesis_usages.length === 0) {
    return <p className="text-sm text-slate-400">Нет связей с проблематиками в гипотезах</p>;
  }

  const primary = focusHypothesisId != null
    ? solution.hypothesis_usages.find(u => u.hypothesis_id === focusHypothesisId)
    : null;
  const others = focusHypothesisId != null
    ? solution.hypothesis_usages.filter(u => u.hypothesis_id !== focusHypothesisId)
    : solution.hypothesis_usages;

  function toggle(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {primary && !compactOthersAsLinks ? (
        <section className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
            <span>{primary.hypothesis_name}</span>
            {primary.code ? (
              <span className="text-[10px] font-mono font-normal text-slate-400">№ {primary.code}</span>
            ) : null}
          </div>
          <ProblemsHierarchyTable
            problems={usageProblemsToInputs(primary.problems)}
            sortBy={sortBy}
          />
        </section>
      ) : null}

      {compactOthersAsLinks ? (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Другие гипотезы</div>
          {others.length === 0 ? (
            <p className="text-xs text-slate-400">Нет других гипотез</p>
          ) : (
            others.map(usage => {
              const open = expandedIds.has(usage.hypothesis_id);
              return (
                <div key={usage.hypothesis_id} className="border border-slate-100 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs text-blue-600 hover:bg-blue-50 flex items-center justify-between gap-2"
                    onClick={() => toggle(usage.hypothesis_id)}
                  >
                    <span className="underline-offset-2 hover:underline font-medium">{usage.hypothesis_name}</span>
                    <span className="flex items-center gap-2 shrink-0 text-slate-400 no-underline">
                      {usage.code ? <span className="font-mono text-[10px]">№ {usage.code}</span> : null}
                      <span className="text-[10px]">{open ? '▾' : '▸'}</span>
                    </span>
                  </button>
                  {open ? (
                    <ProblemsHierarchyTable
                      problems={usageProblemsToInputs(usage.problems)}
                      sortBy={sortBy}
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : (
        others.map(usage => (
          <section key={usage.hypothesis_id} className="border border-slate-100 rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
              <span>{usage.hypothesis_name}</span>
              <span className="flex items-center gap-2">
                {usage.code ? (
                  <span className="text-[10px] font-mono font-normal text-slate-400">№ {usage.code}</span>
                ) : null}
                <span className="text-[9px] font-normal text-slate-400">
                  {sortBy === 'lcm' ? 'по LCM' : 'по сквозному'}
                </span>
              </span>
            </div>
            <ProblemsHierarchyTable
              problems={usageProblemsToInputs(usage.problems)}
              sortBy={sortBy}
            />
          </section>
        ))
      )}
    </div>
  );
}

function SelectedWidgetsList({ widgets }: { widgets: Widget[] }) {
  if (widgets.length === 0) {
    return <p className="text-xs text-slate-400">Нет сопоставленных виджетов</p>;
  }
  return (
    <WidgetGroupedSections
      widgets={widgets}
      className="space-y-2"
      renderWidget={w => (
        <div key={w.id} className="flex items-start gap-2 text-xs px-1">
          <WidgetImageThumbnail
            imagePath={w.image_path}
            name={w.name}
            className="w-10 h-7 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
          />
          <div className="min-w-0">
            <div className="font-medium text-slate-800">{w.name}</div>
            {w.description ? (
              <div className="text-[10px] text-slate-500 line-clamp-2">{w.description}</div>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}

function MappingPickModal({
  title,
  subtitle,
  saving,
  onClose,
  onSave,
  children,
}: {
  title: string;
  subtitle?: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {subtitle ? <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div> : null}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden px-4 py-3">
          {children}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SolutionCardModal({
  mode,
  solution,
  draft: initialDraft,
  allSolutions,
  hypothesisOptions,
  fsGroups,
  fsItems,
  widgets,
  onLoadFsLinks,
  onSaveFsLinks,
  onLoadWidgetLinks,
  onSaveWidgetLinks,
  onClose,
  onSave,
  onDelete,
  lcmLinks,
  sortCodesBy,
}: {
  mode: 'view' | 'edit' | 'create';
  solution?: SolutionDetail;
  draft?: SolutionDraft;
  allSolutions: Solution[];
  hypothesisOptions: string[];
  fsGroups: FsCatalogGroup[];
  fsItems: FsCatalogItem[];
  widgets: Widget[];
  onLoadFsLinks: (solutionId: number) => Promise<SolutionFsLink[]>;
  onSaveFsLinks: (solutionId: number, links: SolutionFsLink[]) => Promise<SolutionFsLink[]>;
  onLoadWidgetLinks: (solutionId: number) => Promise<number[]>;
  onSaveWidgetLinks: (solutionId: number, widgetIds: number[]) => Promise<number[]>;
  onClose: () => void;
  onSave: (draft: SolutionDraft) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  lcmLinks?: {
    hypothesisId: number;
    hypothesisName: string;
    linkedProblemIds: number[];
    availableProblems: LcmProblemOption[];
    problemCatalog?: LcmProblemOption[];
    onChange: (ids: number[]) => void;
  };
  /** Из LCM — по коду гипотезы; из НСИ/брифа — по сквозному */
  sortCodesBy?: SolutionHierarchySortBy;
}) {
  const [editing, setEditing] = useState(mode !== 'view');
  const [pickFsOpen, setPickFsOpen] = useState(false);
  const [pickWidgetsOpen, setPickWidgetsOpen] = useState(false);
  const [draft, setDraft] = useState<SolutionDraft>(
    () => initialDraft ?? (solution ? solutionToDraft(solution) : emptySolutionDraft()),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fsSaving, setFsSaving] = useState(false);
  const [widgetsSaving, setWidgetsSaving] = useState(false);
  const [fsLinks, setFsLinks] = useState<Map<number, SolutionFsLinkType>>(() => new Map());
  const [fsDraft, setFsDraft] = useState<Map<number, SolutionFsLinkType>>(() => new Map());
  const [widgetIds, setWidgetIds] = useState<Set<number>>(() => new Set());
  const [widgetDraft, setWidgetDraft] = useState<Set<number>>(() => new Set());

  const effectiveSort: SolutionHierarchySortBy = sortCodesBy ?? (lcmLinks ? 'lcm' : 'catalog');

  const lcmLinkedSet = useMemo(
    () => new Set(lcmLinks?.linkedProblemIds ?? []),
    [lcmLinks?.linkedProblemIds],
  );

  const lcmProblemInputs = useMemo((): SolutionHierarchyInput[] => {
    if (!lcmLinks) return [];
    return lcmLinks.linkedProblemIds.map(pid => {
      const prob = lcmLinks.availableProblems.find(p => p.id === pid)
        ?? lcmLinks.problemCatalog?.find(p => p.id === pid);
      return {
        id: pid,
        name: prob?.name ?? `ID ${pid}`,
        parent_id: prob?.parent_id ?? null,
        catalog_code: prob?.catalog_code ?? null,
        hypothesis_code: prob?.hypothesis_code ?? null,
        lcm_code: prob?.lcm_code ?? null,
        sort_order: prob?.sort_order ?? 0,
        linked: true,
      };
    });
  }, [lcmLinks]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (pickFsOpen || pickWidgetsOpen) return;
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pickFsOpen, pickWidgetsOpen]);

  useEffect(() => {
    if (!solution || mode === 'create') return;
    let cancelled = false;
    onLoadFsLinks(solution.id).then(links => {
      if (cancelled) return;
      const map = fsLinksToMap(links);
      setFsLinks(map);
      setFsDraft(map);
    });
    onLoadWidgetLinks(solution.id).then(ids => {
      if (cancelled) return;
      const set = new Set(ids);
      setWidgetIds(set);
      setWidgetDraft(set);
    });
    return () => { cancelled = true; };
  }, [solution?.id, mode, onLoadFsLinks, onLoadWidgetLinks]);

  const parentOptions = useMemo(() => {
    const hyp = draft.hypothesis.trim();
    return allSolutions.filter(s => {
      if (solution && s.id === solution.id) return false;
      if (hyp && (s.hypothesis ?? '') !== hyp) return false;
      return true;
    });
  }, [allSolutions, draft.hypothesis, solution]);

  const selectedWidgets = useMemo(() => {
    const byId = new Map(widgets.map(w => [w.id, w]));
    return [...widgetIds]
      .map(id => byId.get(id))
      .filter((w): w is Widget => w != null)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [widgets, widgetIds]);

  async function handleSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      if (mode === 'create') onClose();
      else setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFs() {
    if (!solution) return;
    setFsSaving(true);
    try {
      const saved = await onSaveFsLinks(solution.id, fsLinksFromMap(fsDraft));
      const map = fsLinksToMap(saved);
      setFsLinks(map);
      setFsDraft(map);
      setPickFsOpen(false);
    } finally {
      setFsSaving(false);
    }
  }

  function handleCancelFs() {
    setFsDraft(new Map(fsLinks));
    setPickFsOpen(false);
  }

  async function handleSaveWidgets() {
    if (!solution) return;
    setWidgetsSaving(true);
    try {
      const saved = await onSaveWidgetLinks(solution.id, [...widgetDraft]);
      setWidgetIds(new Set(saved));
      setWidgetDraft(new Set(saved));
      setPickWidgetsOpen(false);
    } finally {
      setWidgetsSaving(false);
    }
  }

  function handleCancelWidgets() {
    setWidgetDraft(new Set(widgetIds));
    setPickWidgetsOpen(false);
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm('Удалить решение? Дочерние пункты также будут удалены.')) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  const title = mode === 'create' ? 'Новое решение' : editing ? 'Редактирование решения' : 'Справочник · решение';
  const showSplitView = !editing && solution && mode !== 'create';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full ${showSplitView ? 'max-w-6xl' : 'max-w-3xl'} max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">{title}</div>
            {editing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-400">Формулировка решения</label>
                  <textarea
                    className="w-full text-sm border rounded px-2 py-1.5 min-h-[120px] max-h-[40vh] resize-y whitespace-pre-wrap"
                    placeholder="Название / формулировка решения"
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400">Источник LCM / гипотеза</label>
                    <input
                      className="w-full text-xs border rounded px-2 py-1"
                      list="solution-hypothesis-options"
                      value={draft.hypothesis}
                      onChange={e => setDraft(d => ({ ...d, hypothesis: e.target.value, parent_id: '' }))}
                    />
                    <datalist id="solution-hypothesis-options">
                      {hypothesisOptions.map(h => <option key={h} value={h} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400">Код LCM</label>
                    <input
                      className="w-full text-xs border rounded px-2 py-1 font-mono"
                      value={draft.lcm_code}
                      onChange={e => setDraft(d => ({ ...d, lcm_code: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Родительский пункт</label>
                  <select
                    className="w-full text-xs border rounded px-2 py-1"
                    value={draft.parent_id === '' ? '' : String(draft.parent_id)}
                    onChange={e => setDraft(d => ({
                      ...d,
                      parent_id: e.target.value ? Number(e.target.value) : '',
                    }))}
                  >
                    <option value="">— корневой уровень —</option>
                    {parentOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.catalog_code ? `${p.catalog_code} ` : ''}{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Описание</label>
                  <textarea
                    className="w-full text-xs border rounded px-2 py-1 min-h-[60px]"
                    value={draft.description}
                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Сопоставлено с ФС</label>
                  <div className="mt-0.5">
                    <button
                      type="button"
                      className={`${YES_NO_BADGE_CLASS} min-w-[36px] text-xs cursor-pointer ${yesNoClass(draft.fs_mapped)}`}
                      title="Клик — переключить Да/Нет"
                      onClick={() => setDraft(d => ({ ...d, fs_mapped: !d.fs_mapped }))}
                    >
                      {yesNoLabel(draft.fs_mapped)}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-800 whitespace-pre-wrap">
                  {solution?.catalog_code ? (
                    <span className="text-slate-400 font-normal mr-1 font-mono">{solution.catalog_code}</span>
                  ) : null}
                  {solution?.name}
                </div>
                {solution?.lcm_code && solution.lcm_code !== solution.catalog_code ? (
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">LCM: {solution.lcm_code}</div>
                ) : null}
                {solution?.description ? (
                  <div className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{solution.description}</div>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">Сопоставлено с ФС</span>
                  <span className={`${YES_NO_BADGE_CLASS} text-[10px] min-w-[36px] ${yesNoClass(Boolean(solution?.fs_mapped))}`}>
                    {yesNoLabel(Boolean(solution?.fs_mapped))}
                  </span>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {showSplitView ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
            <div className="overflow-y-auto px-4 py-3 border-b lg:border-b-0 lg:border-r border-slate-100 space-y-4">
              {lcmLinks ? (
                <>
                  <section className="border border-blue-100 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-blue-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
                      <span>{lcmLinks.hypothesisName}</span>
                      <span className="text-[10px] font-normal text-blue-600">связи в LCM · по LCM</span>
                    </div>
                    <ProblemsHierarchyTable
                      problems={lcmProblemInputs}
                      sortBy={effectiveSort}
                      catalog={[...(lcmLinks.availableProblems), ...(lcmLinks.problemCatalog ?? [])]}
                      linkedIds={lcmLinkedSet}
                      onUnlink={id => lcmLinks.onChange(lcmLinks.linkedProblemIds.filter(x => x !== id))}
                    />
                    <div className="flex gap-1 px-3 py-2 border-t border-slate-100">
                      <select
                        className="flex-1 text-[11px] border rounded px-1.5 py-1 min-w-0"
                        defaultValue=""
                        onChange={e => {
                          const id = Number(e.target.value);
                          if (!id) return;
                          if (!lcmLinks.linkedProblemIds.includes(id)) {
                            lcmLinks.onChange([...lcmLinks.linkedProblemIds, id]);
                          }
                          e.target.value = '';
                        }}
                      >
                        <option value="">+ связать проблематику…</option>
                        {lcmLinks.availableProblems
                          .filter(p => !lcmLinks.linkedProblemIds.includes(p.id))
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </select>
                    </div>
                  </section>
                  {solution ? (
                    <HypothesisUsagesPanel
                      solution={solution}
                      sortBy={effectiveSort}
                      focusHypothesisId={lcmLinks.hypothesisId}
                      compactOthersAsLinks
                    />
                  ) : null}
                </>
              ) : solution ? (
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Гипотезы и проблематики
                    <span className="ml-1.5 font-normal text-slate-400 normal-case">
                      ({effectiveSort === 'lcm' ? 'сорт. по LCM' : 'сорт. по сквозному'})
                    </span>
                  </div>
                  <HypothesisUsagesPanel solution={solution} sortBy={effectiveSort} />
                </div>
              ) : null}
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    Виджеты
                    <span className="ml-1.5 font-normal text-slate-400 normal-case">({selectedWidgets.length})</span>
                  </div>
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      setWidgetDraft(new Set(widgetIds));
                      setPickWidgetsOpen(true);
                    }}
                  >
                    Редактировать
                  </button>
                </div>
                <SelectedWidgetsList widgets={selectedWidgets} />
              </section>
              <section className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                    Пункты ФС
                    <span className="ml-1.5 font-normal text-slate-400 normal-case">({fsLinks.size})</span>
                  </div>
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      setFsDraft(new Map(fsLinks));
                      setPickFsOpen(true);
                    }}
                  >
                    Редактировать
                  </button>
                </div>
                <SolutionFsPanel
                  groups={fsGroups}
                  items={fsItems}
                  fsLinks={fsLinks}
                  editing={false}
                  onChange={() => {}}
                  onlySelected
                  compact
                />
              </section>
            </div>
          </div>
        ) : null}

        <div className="px-4 py-3 border-t border-slate-100 flex justify-between gap-2 shrink-0">
          <div>
            {mode !== 'create' && onDelete && !editing ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              Отмена
            </button>
            {editing ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                onClick={handleSave}
                disabled={saving || !draft.name.trim()}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            ) : mode !== 'create' ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
                onClick={() => {
                  if (solution) setDraft(solutionToDraft(solution));
                  setPickFsOpen(false);
                  setPickWidgetsOpen(false);
                  setEditing(true);
                }}
              >
                Редактировать
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {pickWidgetsOpen && solution ? (
        <MappingPickModal
          title="Сопоставление с виджетами"
          subtitle={solution.name}
          saving={widgetsSaving}
          onClose={handleCancelWidgets}
          onSave={() => void handleSaveWidgets()}
        >
          <SolutionWidgetsPanel
            widgets={widgets}
            selectedIds={widgetDraft}
            editing
            onChange={setWidgetDraft}
          />
        </MappingPickModal>
      ) : null}

      {pickFsOpen && solution ? (
        <MappingPickModal
          title="Сопоставление с пунктами ФС"
          subtitle={solution.name}
          saving={fsSaving}
          onClose={handleCancelFs}
          onSave={() => void handleSaveFs()}
        >
          <SolutionFsPanel
            groups={fsGroups}
            items={fsItems}
            fsLinks={fsDraft}
            editing
            onChange={setFsDraft}
          />
        </MappingPickModal>
      ) : null}
    </div>
  );
}
