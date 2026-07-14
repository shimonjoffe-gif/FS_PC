import React, { useEffect, useMemo, useState } from 'react';
import type { FsCatalogGroup, FsCatalogItem, SolutionFsLinkType } from '../types';
import { buildFsDisplayGroups, filterFsCatalogItems } from '../utils/fsDisplayGroups';
import {
  cycleFsLinkType,
  fsLinkBadgeClass,
  fsLinkBadgeLabel,
} from '../utils/fsLinkBadge';
import FsCatalogReadonlyModal from './FsCatalogReadonlyModal';

function groupAnyLinked(items: FsCatalogItem[], fsLinks: Map<number, SolutionFsLinkType>): boolean {
  return items.some(item => fsLinks.has(item.id));
}

function FsLinkBadge({
  type,
  editing,
  onToggle,
}: {
  type: SolutionFsLinkType | null;
  editing: boolean;
  onToggle?: () => void;
}) {
  const className = `inline-block px-2 py-0.5 rounded min-w-[40px] text-[10px] ${fsLinkBadgeClass(type)}`;
  if (!editing) {
    return <span className={className}>{fsLinkBadgeLabel(type)}</span>;
  }
  return (
    <button
      type="button"
      className={`${className} cursor-pointer`}
      title="Клик: Нет → Да (обяз.) → Опц. → Нет"
      onClick={e => {
        e.stopPropagation();
        onToggle?.();
      }}
    >
      {fsLinkBadgeLabel(type)}
    </button>
  );
}

export default function SolutionFsPanel({
  groups,
  items,
  fsLinks,
  editing,
  onChange,
  onlySelected = false,
  compact = false,
}: {
  groups: FsCatalogGroup[];
  items: FsCatalogItem[];
  fsLinks: Map<number, SolutionFsLinkType>;
  editing: boolean;
  onChange: (links: Map<number, SolutionFsLinkType>) => void;
  /** Показать только пункты с «Да» / «Опц.» (для компактного просмотра в карточке). */
  onlySelected?: boolean;
  /** Компактный режим: без поиска и переключателя «Только Да». */
  compact?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [onlyYes, setOnlyYes] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [viewItem, setViewItem] = useState<FsCatalogItem | null>(null);

  const catalogItems = useMemo(() => filterFsCatalogItems(items), [items]);

  const displayGroups = useMemo(
    () => buildFsDisplayGroups(groups, catalogItems),
    [groups, catalogItems],
  );

  const q = search.trim().toLowerCase();
  const filterOnlyYes = onlySelected || onlyYes;

  function toggleItem(id: number) {
    const next = new Map(fsLinks);
    const cycled = cycleFsLinkType(next.get(id));
    if (cycled) next.set(id, cycled);
    else next.delete(id);
    onChange(next);
  }

  function toggleGroupItems(groupItems: FsCatalogItem[]) {
    const next = new Map(fsLinks);
    const any = groupAnyLinked(groupItems, fsLinks);
    for (const item of groupItems) {
      if (any) next.delete(item.id);
      else next.set(item.id, 'required');
    }
    onChange(next);
  }

  function toggleGroupExpand(group: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  const visibleGroups = useMemo(() => {
    return displayGroups
      .map(group => ({
        group,
        visibleItems: group.items.filter(item => {
          if (filterOnlyYes && !fsLinks.has(item.id)) return false;
          if (!q) return true;
          const hay = `${item.prefix ?? ''} ${item.name} ${group.group_name}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter(({ visibleItems }) => visibleItems.length > 0 || (!q && !filterOnlyYes));
  }, [displayGroups, filterOnlyYes, q, fsLinks]);

  function collapseAllSections() {
    setExpanded(new Set());
  }

  function expandAllSections() {
    setExpanded(new Set(visibleGroups.map(({ group }) => group.group_name)));
  }

  const allFsGroupsCollapsed =
    visibleGroups.length > 0
    && visibleGroups.every(({ group }) => !expanded.has(group.group_name));

  const selectedCount = fsLinks.size;

  useEffect(() => {
    if (!onlySelected || !compact) return;
    setExpanded(new Set(
      displayGroups
        .filter(g => g.items.some(i => fsLinks.has(i.id)))
        .map(g => g.group_name),
    ));
  }, [onlySelected, compact, displayGroups, fsLinks]);

  return (
    <div className={`flex flex-col min-h-0 ${compact ? '' : 'h-full'}`}>
      {compact ? (
        <div className="flex justify-end mb-1.5">
          <button
            type="button"
            onClick={() => (allFsGroupsCollapsed ? expandAllSections() : collapseAllSections())}
            className="text-[10px] text-slate-600 border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-50"
            disabled={visibleGroups.length === 0}
          >
            {allFsGroupsCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2 mb-2">
          <div className="flex-1 min-w-[140px]">
            <label className="text-[10px] text-slate-400">Поиск по ФС</label>
            <input
              className="w-full text-xs border rounded px-2 py-1"
              placeholder="Префикс, название…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {!onlySelected && (
            <button
              type="button"
              className={`text-[10px] px-2 py-1 rounded border ${onlyYes ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500'}`}
              onClick={() => setOnlyYes(v => !v)}
            >
              Только связанные ({selectedCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => (allFsGroupsCollapsed ? expandAllSections() : collapseAllSections())}
            className="text-[10px] text-slate-600 border border-slate-200 px-2 py-1 rounded hover:bg-slate-50"
            disabled={visibleGroups.length === 0}
          >
            {allFsGroupsCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
          </button>
        </div>
      )}

      <div className={`overflow-auto border border-slate-200 rounded-lg ${compact ? 'max-h-[320px]' : 'flex-1 min-h-[240px]'}`}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left p-2 border w-20">Префикс</th>
              <th className="text-left p-2 border min-w-[160px]">Пункт ФС / Расшифровка</th>
              <th className="text-center p-2 border w-24">Связь</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-3 text-slate-400 text-center">
                  {onlySelected ? 'Нет сопоставленных пунктов ФС' : 'Ничего не найдено'}
                </td>
              </tr>
            ) : (
              visibleGroups.map(({ group, visibleItems }) => {
                const isExpanded = expanded.has(group.group_name);
                const groupSelected = groupAnyLinked(
                  onlySelected ? visibleItems : group.items,
                  fsLinks,
                );
                const groupCount = onlySelected ? visibleItems.length : group.items.length;
                return (
                  <React.Fragment key={group.group_prefix}>
                    <tr className="bg-amber-50 font-semibold">
                      <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleGroupExpand(group.group_name)}
                            className="text-slate-600 hover:text-slate-900 w-6 h-6 leading-none shrink-0"
                            title={isExpanded ? 'Свернуть группу' : 'Развернуть группу'}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          <span>{group.group_prefix || '—'}</span>
                        </div>
                      </td>
                      <td className="p-2 border text-slate-800">
                        {group.group_name}
                        <span className="ml-2 text-[10px] font-normal text-slate-500">({groupCount})</span>
                      </td>
                      <td className="p-2 border text-center align-top">
                        <FsLinkBadge
                          type={groupSelected ? 'required' : null}
                          editing={editing}
                          onToggle={() => toggleGroupItems(group.items)}
                        />
                      </td>
                    </tr>
                    {isExpanded && visibleItems.map(item => (
                      <tr key={item.id} className={`hover:bg-slate-50 ${fsLinks.has(item.id) ? 'bg-emerald-50/30' : ''}`}>
                        <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top">
                          {item.prefix || '—'}
                        </td>
                        <td className="p-2 border">
                          <button
                            type="button"
                            className="text-left w-full min-w-0 group"
                            onClick={() => setViewItem(item)}
                            title="Открыть расшифровку пункта ФС"
                          >
                            <span className="font-medium text-slate-800 group-hover:text-blue-700 underline-offset-2 group-hover:underline">
                              {item.name}
                            </span>
                          </button>
                        </td>
                        <td className="p-2 border text-center align-top">
                          <FsLinkBadge
                            type={fsLinks.get(item.id) ?? null}
                            editing={editing}
                            onToggle={() => toggleItem(item.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {viewItem ? (
        <FsCatalogReadonlyModal item={viewItem} onClose={() => setViewItem(null)} />
      ) : null}
    </div>
  );
}
