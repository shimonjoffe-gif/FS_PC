import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  FsCatalogGroup,
  FsCatalogItem,
  Problem,
  SolutionDetail,
  SolutionFsLinkType,
  SolutionHypothesisUsage,
  Widget,
} from '../types';
import { getFsCatalogItems, getSolution, getSolutionFsLinks, getWidgetsBySolution } from '../api';
import { fsLinksToMap } from '../utils/fsLinkBadge';
import SolutionFsPanel from './SolutionFsPanel';
import { WidgetGroupedSections } from './WidgetGroupedList';
import { WidgetImageThumbnail } from './WidgetImagePreview';

function filterHypothesisUsagesForBriefing(
  usages: SolutionHypothesisUsage[],
  selectedProblemIds: Set<number>,
  problemsById: Map<number, Problem>,
): SolutionHypothesisUsage[] {
  return usages
    .map(usage => ({
      ...usage,
      problems: usage.problems
        .filter(p => selectedProblemIds.has(p.id))
        .map(p => {
          const catalog = problemsById.get(p.id);
          return {
            ...p,
            catalog_code: catalog?.catalog_code ?? null,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    }))
    .filter(usage => usage.problems.length > 0);
}

function BriefingHypothesisPanel({
  usages,
}: {
  usages: SolutionHypothesisUsage[];
}) {
  if (usages.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Нет выбранных заказчиком проблематик, связанных с этим решением
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {usages.map(usage => (
        <section key={usage.hypothesis_id} className="border border-slate-100 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
            <span>{usage.hypothesis_name}</span>
            {usage.code ? (
              <span className="text-[10px] font-mono font-normal text-slate-400">№ {usage.code}</span>
            ) : null}
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-3 py-1.5 font-medium w-16">Код</th>
                <th className="px-3 py-1.5 font-medium">Проблематика</th>
              </tr>
            </thead>
            <tbody>
              {usage.problems.map(problem => (
                <tr key={problem.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-3 py-1.5 text-slate-400 font-mono align-top">
                    {(problem as { catalog_code?: string | null }).catalog_code
                      ?? problem.lcm_code
                      ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 whitespace-pre-wrap align-top">
                    {problem.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function BriefingWidgetsList({
  widgets,
  onOpenWidgetCard,
}: {
  widgets: Widget[];
  onOpenWidgetCard?: (widgetId: number) => void;
}) {
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
            widgetId={w.id}
            onOpenWidgetCard={onOpenWidgetCard}
            imagePath={w.image_path}
            name={w.name}
            className="w-10 h-7 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
          />
          <div className="min-w-0">
            <div className="font-medium text-slate-800">{w.name}</div>
            {w.description ? (
              <div className="text-[10px] text-slate-500 line-clamp-3">{w.description}</div>
            ) : null}
          </div>
        </div>
      )}
    />
  );
}

export default function BriefingSolutionCardModal({
  solutionId,
  selectedProblemIds,
  problemsCatalog,
  onOpenWidgetCard,
  onClose,
}: {
  solutionId: number;
  selectedProblemIds: Set<number>;
  problemsCatalog: Problem[];
  onOpenWidgetCard?: (widgetId: number) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solution, setSolution] = useState<SolutionDetail | null>(null);
  const [fsGroups, setFsGroups] = useState<FsCatalogGroup[]>([]);
  const [fsItems, setFsItems] = useState<FsCatalogItem[]>([]);
  const [fsLinks, setFsLinks] = useState<Map<number, SolutionFsLinkType>>(new Map());
  const [widgets, setWidgets] = useState<Widget[]>([]);

  const problemsById = useMemo(
    () => new Map(problemsCatalog.map(p => [p.id, p])),
    [problemsCatalog],
  );

  const filteredUsages = useMemo(() => {
    if (!solution) return [];
    return filterHypothesisUsagesForBriefing(
      solution.hypothesis_usages,
      selectedProblemIds,
      problemsById,
    );
  }, [solution, selectedProblemIds, problemsById]);

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
      getSolution(solutionId),
      getSolutionFsLinks(solutionId),
      getFsCatalogItems(),
      getWidgetsBySolution(solutionId),
    ])
      .then(([sol, links, fsCatalog, widgetList]) => {
        if (cancelled) return;
        setSolution(sol);
        setFsGroups(fsCatalog.groups);
        setFsItems(fsCatalog.items);
        setFsLinks(fsLinksToMap(links.fs_links));
        setWidgets(widgetList);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [solutionId]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            {loading ? (
              <div className="text-sm text-slate-400">Загрузка…</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : solution ? (
              <>
                <div className="text-sm font-semibold text-slate-800 whitespace-pre-wrap">
                  {solution.catalog_code ? (
                    <span className="text-slate-400 font-normal mr-1 font-mono">{solution.catalog_code}</span>
                  ) : null}
                  {solution.name}
                </div>
                {solution.description ? (
                  <div className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{solution.description}</div>
                ) : null}
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

        {!loading && !error && solution ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
            <div className="overflow-y-auto px-4 py-3 border-b lg:border-b-0 lg:border-r border-slate-100">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Гипотезы и проблематики заказчика
              </div>
              <BriefingHypothesisPanel usages={filteredUsages} />
            </div>
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              <section>
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Виджеты
                  <span className="ml-1.5 font-normal text-slate-400 normal-case">({widgets.length})</span>
                </div>
                <BriefingWidgetsList widgets={widgets} onOpenWidgetCard={onOpenWidgetCard} />
              </section>
              <section className="border-t border-slate-100 pt-4">
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
              </section>
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
