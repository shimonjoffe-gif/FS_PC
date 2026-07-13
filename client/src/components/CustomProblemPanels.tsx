import React, { useEffect, useMemo, useState } from 'react';
import type { BriefingProblemSel, BriefingSolutionSel, Problem, Solution } from '../types';
import { buildProblemDisplayUnits } from '../utils/problemDisplayGroups';
import { buildSolutionDisplayUnits } from '../utils/solutionDisplayGroups';
import { yesNoClass, yesNoLabel } from '../utils/yesNoBadge';

function matchesProblemSearch(p: Problem, q: string): boolean {
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q)
    || (p.catalog_code?.toLowerCase().includes(q) ?? false)
    || (p.lcm_code?.toLowerCase().includes(q) ?? false)
  );
}

function matchesSolutionSearch(s: Solution, q: string): boolean {
  if (!q) return true;
  return (
    s.name.toLowerCase().includes(q)
    || (s.catalog_code?.toLowerCase().includes(q) ?? false)
    || (s.lcm_code?.toLowerCase().includes(q) ?? false)
    || (s.description?.toLowerCase().includes(q) ?? false)
  );
}

export function CustomProblemLinkModal({
  problems,
  onClose,
  onSelect,
}: {
  problems: Problem[];
  onClose: () => void;
  onSelect: (problemId: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const units = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? problems.filter(p => matchesProblemSearch(p, q)) : problems;
    return buildProblemDisplayUnits(filtered);
  }, [problems, search]);

  function toggleCollapse(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderProblemRow(
    problem: Problem,
    opts: { indent?: number; variant: 'parent' | 'child' | 'standalone'; groupParentId?: number },
  ) {
    const indent = opts.indent ?? 0;
    const titleClass = opts.variant === 'parent'
      ? 'text-sm font-semibold text-slate-800'
      : 'text-sm font-medium text-slate-700';

    return (
      <div
        key={problem.id}
        className={`flex items-start gap-1 px-2 py-1.5 hover:bg-blue-50 rounded ${opts.variant === 'parent' ? 'bg-amber-50/40' : ''}`}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {opts.variant === 'parent' && opts.groupParentId != null ? (
          <button
            type="button"
            className="text-slate-500 hover:text-slate-800 w-5 h-5 leading-none shrink-0 mt-0.5"
            title={collapsed.has(opts.groupParentId) ? 'Развернуть' : 'Свернуть'}
            onClick={() => toggleCollapse(opts.groupParentId!)}
          >
            {collapsed.has(opts.groupParentId) ? '▶' : '▼'}
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          className="flex-1 text-left min-w-0"
          onClick={() => onSelect(problem.id)}
        >
          <div className={titleClass}>
            {problem.catalog_code ? (
              <span className="text-slate-400 font-normal mr-1 font-mono text-[11px]">{problem.catalog_code}</span>
            ) : null}
            {problem.name}
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-800">Сопоставить со справочником</div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Иерархия как в НСИ. После сопоставления ручной выбор решений для этой строки будет недоступен.
          </p>
          <input
            className="mt-2 w-full text-sm border rounded px-2 py-1.5"
            placeholder="Поиск проблематики…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {units.length === 0 && (
            <div className="px-4 py-3 text-sm text-slate-400">Ничего не найдено</div>
          )}
          {units.map(unit => {
            if (unit.kind === 'group') {
              return (
                <div key={`g-${unit.parent.id}`}>
                  {renderProblemRow(unit.parent, {
                    variant: 'parent',
                    groupParentId: unit.parent.id,
                  })}
                  {!collapsed.has(unit.parent.id) && unit.children.map(child =>
                    renderProblemRow(child, { variant: 'child', indent: 12 }),
                  )}
                </div>
              );
            }
            return renderProblemRow(unit.item, { variant: 'standalone' });
          })}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 text-right">
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomProblemSolutionsModal({
  customText,
  solutions,
  selectedIds,
  onToggle,
  onClose,
}: {
  customText: string;
  solutions: Solution[];
  selectedIds: Set<number>;
  onToggle: (solutionId: number, enabled: boolean) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const units = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? solutions.filter(s => matchesSolutionSearch(s, q)) : solutions;
    return buildSolutionDisplayUnits(filtered);
  }, [solutions, search]);

  function toggleCollapse(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderSolutionRow(
    sol: Solution,
    opts: { indent?: number; variant: 'parent' | 'child' | 'standalone'; groupParentId?: number },
  ) {
    const indent = opts.indent ?? 0;
    const isYes = selectedIds.has(sol.id);
    const titleClass = opts.variant === 'parent'
      ? 'text-sm font-semibold text-slate-800'
      : 'text-sm font-medium text-slate-700';
    const isGroupParent = opts.variant === 'parent';

    return (
      <div
        key={sol.id}
        className={`flex items-start gap-2 px-2 py-1.5 rounded ${isYes ? 'bg-blue-50/40' : ''} ${isGroupParent ? 'bg-amber-50/40' : 'hover:bg-slate-50'}`}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {isGroupParent && opts.groupParentId != null ? (
          <button
            type="button"
            className="text-slate-500 hover:text-slate-800 w-5 h-5 leading-none shrink-0 mt-0.5"
            title={collapsed.has(opts.groupParentId) ? 'Развернуть' : 'Свернуть'}
            onClick={() => toggleCollapse(opts.groupParentId!)}
          >
            {collapsed.has(opts.groupParentId) ? '▶' : '▼'}
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className={titleClass}>
            {sol.catalog_code ? (
              <span className="text-slate-400 font-normal mr-1 font-mono text-[11px]">{sol.catalog_code}</span>
            ) : null}
            {sol.name}
          </div>
          {sol.description ? (
            <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{sol.description}</div>
          ) : null}
        </div>
        {isGroupParent ? (
          <span className={`inline-block px-2 py-0.5 rounded min-w-[36px] text-center text-xs ${yesNoClass(isYes)}`}>
            {yesNoLabel(isYes)}
          </span>
        ) : (
          <button
            type="button"
            className={`px-2 py-0.5 rounded min-w-[36px] text-xs cursor-pointer ${yesNoClass(isYes)}`}
            title={isYes ? 'Клик — снять' : 'Клик — выбрать'}
            onClick={() => onToggle(sol.id, !isYes)}
          >
            {yesNoLabel(isYes)}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-[10px] text-slate-400 mb-1">Свободная проблематика</div>
          <div className="text-sm font-semibold text-slate-800">{customText}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Иерархия как в НСИ · Да/Нет. После выбора ручных решений сопоставление со справочником недоступно.
          </div>
          <input
            className="mt-2 w-full text-sm border rounded px-2 py-1.5"
            placeholder="Поиск решения…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {units.length === 0 && (
            <div className="px-2 py-3 text-sm text-slate-400">Ничего не найдено</div>
          )}
          {units.map(unit => {
            if (unit.kind === 'group') {
              return (
                <div key={`g-${unit.parent.id}`}>
                  {renderSolutionRow(unit.parent, {
                    variant: 'parent',
                    groupParentId: unit.parent.id,
                  })}
                  {!collapsed.has(unit.parent.id) && unit.children.map(child =>
                    renderSolutionRow(child, { variant: 'child', indent: 12 }),
                  )}
                </div>
              );
            }
            return renderSolutionRow(unit.item, { variant: 'standalone' });
          })}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Выбрано: <span className="font-medium">{selectedIds.size}</span>
          </div>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

export function CustomProblemCards({
  items,
  selectedSolutions,
  solutionsByLinkedProblemId,
  onLink,
  onEditSolutions,
  onUnlink,
  onRemove,
}: {
  items: BriefingProblemSel[];
  selectedSolutions: BriefingSolutionSel[];
  solutionsByLinkedProblemId?: Map<number, { id: number; name: string; catalog_code?: string | null; lcm_code?: string | null }[]>;
  onLink: (selId: number) => void;
  onEditSolutions: (selId: number) => void;
  onUnlink: (selId: number) => void;
  onRemove: (selId: number) => void;
}) {
  const [expandedSolutions, setExpandedSolutions] = useState<Set<number>>(() => new Set());

  if (items.length === 0) return null;

  function toggleExpanded(selId: number) {
    setExpandedSolutions(prev => {
      const next = new Set(prev);
      if (next.has(selId)) next.delete(selId);
      else next.add(selId);
      return next;
    });
  }

  return (
    <div className="space-y-1.5 shrink-0">
      <div className="text-[11px] text-slate-500 font-medium">Свободный ввод заказчика</div>
      {items.map((p, i) => {
        const manualSolutions = p.id
          ? selectedSolutions.filter(s => s.source_problem_sel_id === p.id)
          : [];
        const linkedCatalogSolutions = p.linked_problem_id
          ? (solutionsByLinkedProblemId?.get(p.linked_problem_id) ?? [])
          : [];
        const mode: 'link' | 'manual' | 'empty' = p.linked_problem_id
          ? 'link'
          : manualSolutions.length > 0
            ? 'manual'
            : 'empty';
        const previewSolutions = mode === 'manual'
          ? manualSolutions.map(s => ({
            id: s.id,
            name: s.name,
            catalog_code: s.catalog_code,
            lcm_code: s.lcm_code,
          }))
          : linkedCatalogSolutions;
        const expanded = p.id != null && expandedSolutions.has(p.id);

        return (
          <div
            key={p.id ?? `custom-${i}`}
            className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex flex-wrap items-start gap-2"
          >
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-start gap-1">
                {previewSolutions.length > 0 ? (
                  <button
                    type="button"
                    className="text-slate-400 hover:text-slate-700 shrink-0 mt-0.5 text-[10px] leading-none px-0.5"
                    title="Показать/скрыть решения"
                    onClick={() => p.id != null && toggleExpanded(p.id)}
                  >
                    {expanded ? '▾' : '▸'} реш. ({previewSolutions.length})
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-slate-800">{p.custom_text}</div>
                  {mode === 'link' ? (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      ↔ справочник:{' '}
                      <span className="font-medium text-slate-700">
                        {p.linked_problem_name ?? `#${p.linked_problem_id}`}
                      </span>
                    </div>
                  ) : mode === 'empty' ? (
                    <div className="text-[10px] text-amber-600 mt-0.5">
                      не сопоставлено · решения не выбраны
                    </div>
                  ) : null}
                  {expanded && previewSolutions.length > 0 && (
                    <ul className="mt-1.5 pl-2 border-l-2 border-slate-200 space-y-0.5">
                      {previewSolutions.map(solution => (
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
            </div>
            <div className="flex flex-wrap gap-1 shrink-0">
              {p.id ? (
                <>
                  {mode !== 'manual' && (
                    <button
                      type="button"
                      className="text-[10px] px-2 py-0.5 rounded border border-amber-300 text-amber-800 hover:bg-amber-100"
                      onClick={() => onLink(p.id!)}
                    >
                      {p.linked_problem_id ? 'Сменить' : 'Сопоставить'}
                    </button>
                  )}
                  {mode !== 'link' && (
                    <button
                      type="button"
                      className="text-[10px] px-2 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      onClick={() => onEditSolutions(p.id!)}
                    >
                      Решения…
                    </button>
                  )}
                  {p.linked_problem_id ? (
                    <button
                      type="button"
                      className="text-[10px] px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                      onClick={() => onUnlink(p.id!)}
                    >
                      Отвязать
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-[10px] px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => onRemove(p.id!)}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-slate-400 italic">сохраните, чтобы сопоставить</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type FsItemTrace = { customTexts: string[]; solutionNames: string[] };
