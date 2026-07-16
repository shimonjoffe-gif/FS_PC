import React, { useEffect, useMemo, useState } from 'react';
import type { Problem, ProblemDetail, ProblemSolutionUsage } from '../types';
import {
  buildSolutionHierarchyRows,
  type SolutionHierarchyInput,
  type SolutionHierarchySortBy,
} from '../utils/solutionHierarchyRows';

export type ProblemDraft = {
  name: string;
  parent_id: number | '';
  lcm_code: string;
};

export function problemToDraft(problem: Problem): ProblemDraft {
  return {
    name: problem.name,
    parent_id: problem.parent_id ?? '',
    lcm_code: problem.lcm_code ?? '',
  };
}

export function emptyProblemDraft(): ProblemDraft {
  return { name: '', parent_id: '', lcm_code: '' };
}

export type LcmSolutionOption = {
  id: number;
  name: string;
  parent_id?: number | null;
  catalog_code?: string | null;
  hypothesis_code?: string | null;
  lcm_code?: string | null;
  sort_order?: number;
};

function SolutionsHierarchyTable({
  solutions,
  sortBy,
  catalog,
  linkedIds,
  onUnlink,
}: {
  solutions: SolutionHierarchyInput[];
  sortBy: SolutionHierarchySortBy;
  catalog?: SolutionHierarchyInput[];
  linkedIds?: Set<number>;
  onUnlink?: (id: number) => void;
}) {
  const rows = useMemo(
    () => buildSolutionHierarchyRows(solutions, sortBy, catalog),
    [solutions, sortBy, catalog],
  );

  if (rows.length === 0) {
    return <p className="px-3 py-2 text-xs text-slate-400">Нет привязанных решений</p>;
  }

  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-left text-slate-400 border-b border-slate-100">
          <th className="px-3 py-1.5 font-medium w-16">Сквозной</th>
          <th className="px-3 py-1.5 font-medium w-16">LCM</th>
          <th className="px-3 py-1.5 font-medium">Решение</th>
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

function usageToInputs(solutions: ProblemSolutionUsage[]): SolutionHierarchyInput[] {
  return solutions.map(s => ({
    id: s.id,
    name: s.name,
    parent_id: s.parent_id ?? null,
    catalog_code: s.catalog_code ?? null,
    hypothesis_code: s.hypothesis_code ?? null,
    lcm_code: s.lcm_code ?? null,
    sort_order: s.sort_order,
    linked: s.linked !== false,
  }));
}

export default function ProblemCardModal({
  mode,
  problem,
  draft: initialDraft,
  allProblems,
  onClose,
  onSave,
  onDelete,
  lcmLinks,
  sortCodesBy,
}: {
  mode: 'view' | 'edit' | 'create';
  problem?: ProblemDetail;
  draft?: ProblemDraft;
  allProblems: Problem[];
  onClose: () => void;
  onSave: (draft: ProblemDraft) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  lcmLinks?: {
    hypothesisId: number;
    hypothesisName: string;
    linkedSolutionIds: number[];
    availableSolutions: LcmSolutionOption[];
    solutionCatalog?: LcmSolutionOption[];
    onChange: (ids: number[]) => void;
  };
  /** Из LCM — по коду гипотезы; из НСИ/брифа — по сквозному */
  sortCodesBy?: SolutionHierarchySortBy;
}) {
  const [editing, setEditing] = useState(mode !== 'view');
  const [draft, setDraft] = useState<ProblemDraft>(
    () => initialDraft ?? (problem ? problemToDraft(problem) : emptyProblemDraft()),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const effectiveSort: SolutionHierarchySortBy = sortCodesBy ?? (lcmLinks ? 'lcm' : 'catalog');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parentOptions = useMemo(() => {
    return allProblems.filter(p => !problem || p.id !== problem.id);
  }, [allProblems, problem]);

  const lcmLinkedSet = useMemo(
    () => new Set(lcmLinks?.linkedSolutionIds ?? []),
    [lcmLinks?.linkedSolutionIds],
  );

  const lcmSolutionInputs = useMemo((): SolutionHierarchyInput[] => {
    if (!lcmLinks) return [];
    return lcmLinks.linkedSolutionIds.map(sid => {
      const sol = lcmLinks.availableSolutions.find(s => s.id === sid)
        ?? lcmLinks.solutionCatalog?.find(s => s.id === sid);
      return {
        id: sid,
        name: sol?.name ?? `ID ${sid}`,
        parent_id: sol?.parent_id ?? null,
        catalog_code: sol?.catalog_code ?? null,
        hypothesis_code: sol?.hypothesis_code ?? null,
        lcm_code: sol?.lcm_code ?? null,
        sort_order: sol?.sort_order ?? 0,
        linked: true,
      };
    });
  }, [lcmLinks]);

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

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm('Удалить проблематику? Дочерние пункты также будут удалены.')) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  const title = mode === 'create' ? 'Новая проблематика' : editing ? 'Редактирование проблематики' : 'Справочник · проблематика';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">{title}</div>
            {editing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-400">Формулировка проблематики</label>
                  <textarea
                    className="w-full text-sm border rounded px-2 py-1.5 min-h-[120px] max-h-[40vh] resize-y whitespace-pre-wrap"
                    placeholder="Название / формулировка проблематики"
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Код LCM</label>
                  <input
                    className="w-full text-xs border rounded px-2 py-1 font-mono"
                    value={draft.lcm_code}
                    onChange={e => setDraft(d => ({ ...d, lcm_code: e.target.value }))}
                  />
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
              </div>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-800 whitespace-pre-wrap">
                  {problem?.catalog_code ? (
                    <span className="text-slate-400 font-normal mr-1 font-mono">{problem.catalog_code}</span>
                  ) : null}
                  {problem?.name}
                </div>
                {problem?.lcm_code && problem.lcm_code !== problem.catalog_code ? (
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">LCM: {problem.lcm_code}</div>
                ) : null}
                {problem?.hypothesis_usages && problem.hypothesis_usages.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {problem.hypothesis_usages.map(u => (
                      <span key={u.hypothesis_id} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {u.hypothesis_name}
                      </span>
                    ))}
                  </div>
                ) : null}
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

        {!editing && problem ? (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {lcmLinks ? (
              <section className="border border-blue-100 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-blue-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
                  <span>{lcmLinks.hypothesisName}</span>
                  <span className="text-[10px] font-normal text-blue-600">связи в LCM · сортировка по LCM</span>
                </div>
                <SolutionsHierarchyTable
                  solutions={lcmSolutionInputs}
                  sortBy={effectiveSort}
                  catalog={[...(lcmLinks.availableSolutions), ...(lcmLinks.solutionCatalog ?? [])]}
                  linkedIds={lcmLinkedSet}
                  onUnlink={id => lcmLinks.onChange(lcmLinks.linkedSolutionIds.filter(x => x !== id))}
                />
                <div className="flex gap-1 px-3 py-2 border-t border-slate-100">
                  <select
                    className="flex-1 text-[11px] border rounded px-1.5 py-1 min-w-0"
                    defaultValue=""
                    onChange={e => {
                      const id = Number(e.target.value);
                      if (!id) return;
                      if (!lcmLinks.linkedSolutionIds.includes(id)) {
                        lcmLinks.onChange([...lcmLinks.linkedSolutionIds, id]);
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="">+ связать решение…</option>
                    {lcmLinks.availableSolutions
                      .filter(s => !lcmLinks.linkedSolutionIds.includes(s.id))
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                </div>
              </section>
            ) : null}

            {problem.hypothesis_usages.filter(u => !lcmLinks || u.hypothesis_id !== lcmLinks.hypothesisId).length === 0
              && !lcmLinks ? (
              <p className="text-sm text-slate-400">Нет связей с гипотезами</p>
            ) : (
              problem.hypothesis_usages
                .filter(u => !lcmLinks || u.hypothesis_id !== lcmLinks.hypothesisId)
                .map(usage => (
                <section key={usage.hypothesis_id} className="border border-slate-100 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
                    <span>{usage.hypothesis_name}</span>
                    <span className="flex items-center gap-2">
                      {usage.code ? (
                        <span className="text-[10px] font-mono font-normal text-slate-400">№ {usage.code}</span>
                      ) : null}
                      <span className="text-[9px] font-normal text-slate-400">
                        {effectiveSort === 'lcm' ? 'по LCM' : 'по сквозному'}
                      </span>
                    </span>
                  </div>
                  <SolutionsHierarchyTable
                    solutions={usageToInputs(usage.solutions)}
                    sortBy={effectiveSort}
                  />
                </section>
              ))
            )}
          </div>
        ) : null}

        <div className="px-4 py-3 border-t border-slate-100 flex justify-between gap-2">
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
                  if (problem) setDraft(problemToDraft(problem));
                  setEditing(true);
                }}
              >
                Редактировать
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
