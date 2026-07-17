import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  FsCatalogGroup,
  FsCatalogItem,
  Problem,
  SolutionFsLinkType,
  WidgetDetail,
  WidgetHypothesisUsage,
} from '../types';
import { getFsCatalogItems, getWidget, getWidgetFsLinksForWidget } from '../api';
import SolutionFsPanel from './SolutionFsPanel';
import { widgetDataSliceLabel } from '../utils/widgetDisplayGroups';
import { widgetImageUrl } from './WidgetImagePreview';

function filterWidgetHypothesisForBriefing(
  usages: WidgetHypothesisUsage[],
  selectedProblemIds: Set<number>,
  problemsById: Map<number, Problem>,
): WidgetHypothesisUsage[] {
  return usages
    .map(usage => ({
      ...usage,
      problems: usage.problems
        .filter(p => selectedProblemIds.has(p.id))
        .map(p => ({
          ...p,
          catalog_code: problemsById.get(p.id)?.catalog_code ?? null,
        }))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    }))
    .filter(usage => usage.problems.length > 0);
}

function BriefingWidgetContextPanel({ widget }: { widget: WidgetDetail }) {
  const hasContext = widget.hypothesis_usages.length > 0 || widget.orphan_solutions.length > 0;
  if (!hasContext) {
    return (
      <p className="text-sm text-slate-400">
        Нет выбранных заказчиком проблематик, связанных с этим виджетом
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {widget.hypothesis_usages.map(usage => (
        <section key={usage.hypothesis_id} className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">
            {usage.hypothesis_name}
          </div>
          {usage.problems.map(problem => (
            <div key={problem.id} className="border-t border-slate-100 first:border-t-0">
              <div className="px-3 py-1.5 bg-white text-[11px] text-slate-600 flex gap-2">
                {(problem as { catalog_code?: string | null }).catalog_code ?? problem.lcm_code ? (
                  <span className="font-mono text-slate-400 shrink-0">
                    {(problem as { catalog_code?: string | null }).catalog_code ?? problem.lcm_code}
                  </span>
                ) : null}
                <span className="min-w-0 whitespace-pre-wrap">{problem.name}</span>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-slate-400 border-t border-slate-50 bg-slate-50/50">
                    <th className="px-3 py-1 font-medium w-16">Код</th>
                    <th className="px-3 py-1 font-medium">Решение</th>
                  </tr>
                </thead>
                <tbody>
                  {problem.solutions.map(solution => (
                    <tr key={solution.id} className="border-t border-slate-50">
                      <td className="px-3 py-1.5 text-slate-400 font-mono align-top">
                        {solution.catalog_code ?? solution.lcm_code ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 whitespace-pre-wrap align-top">
                        {solution.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ))}

      {widget.orphan_solutions.length > 0 ? (
        <section className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700">
            Решения без контекста гипотез
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-3 py-1.5 font-medium w-16">Код</th>
                <th className="px-3 py-1.5 font-medium">Решение</th>
              </tr>
            </thead>
            <tbody>
              {widget.orphan_solutions.map(solution => (
                <tr key={solution.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5 text-slate-400 font-mono align-top">
                    {solution.catalog_code ?? solution.lcm_code ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 whitespace-pre-wrap align-top">
                    {solution.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

export default function BriefingWidgetCardModal({
  widgetId,
  selectedProblemIds,
  problemsCatalog,
  onClose,
}: {
  widgetId: number;
  selectedProblemIds: Set<number>;
  problemsCatalog: Problem[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widget, setWidget] = useState<WidgetDetail | null>(null);
  const [fsGroups, setFsGroups] = useState<FsCatalogGroup[]>([]);
  const [fsItems, setFsItems] = useState<FsCatalogItem[]>([]);
  const [fsLinks, setFsLinks] = useState<Map<number, SolutionFsLinkType>>(new Map());

  const problemsById = useMemo(
    () => new Map(problemsCatalog.map(p => [p.id, p])),
    [problemsCatalog],
  );

  const filteredWidget = useMemo(() => {
    if (!widget) return null;
    return {
      ...widget,
      hypothesis_usages: filterWidgetHypothesisForBriefing(
        widget.hypothesis_usages,
        selectedProblemIds,
        problemsById,
      ),
    };
  }, [widget, selectedProblemIds, problemsById]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getWidget(widgetId),
      getWidgetFsLinksForWidget(widgetId),
      getFsCatalogItems(),
    ])
      .then(([detail, links, fsCatalog]) => {
        if (cancelled) return;
        setWidget(detail);
        setFsGroups(fsCatalog.groups);
        setFsItems(fsCatalog.items);
        setFsLinks(new Map(links.fs_item_ids.map(id => [id, 'required' as SolutionFsLinkType])));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [widgetId]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="text-sm text-slate-400">Загрузка…</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : widget ? (
              <>
                <div className="text-sm font-semibold text-slate-800">{widget.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {widget.type}
                  {' · '}
                  {widgetDataSliceLabel(widget)}
                </div>
              </>
            ) : null}
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

        {!loading && !error && filteredWidget && widget ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-0 overflow-hidden">
            <div className="overflow-hidden px-4 py-3 border-b lg:border-b lg:border-r border-slate-100 flex items-center justify-center bg-slate-50/50">
              {widget.image_path ? (
                <img
                  src={widgetImageUrl(widget.image_path) ?? ''}
                  alt={widget.name}
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-400">Нет изображения</span>
              )}
            </div>
            <div className="overflow-y-auto px-4 py-3 border-b border-slate-100">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Описание
              </div>
              {widget.description ? (
                <div className="text-xs text-slate-700 whitespace-pre-wrap">{widget.description}</div>
              ) : (
                <p className="text-sm text-slate-400">Описание не указано</p>
              )}
            </div>
            <div className="overflow-y-auto px-4 py-3 border-b lg:border-b-0 lg:border-r border-slate-100">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Гипотезы, проблематики и решения
              </div>
              <BriefingWidgetContextPanel widget={filteredWidget} />
            </div>
            <div className="overflow-y-auto px-4 py-3">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Пункты ФС
                <span className="ml-1.5 font-normal text-slate-400 normal-case">({fsLinks.size})</span>
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
            </div>
          </div>
        ) : null}

        <div className="px-4 py-3 border-t border-slate-100 flex justify-end shrink-0">
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
