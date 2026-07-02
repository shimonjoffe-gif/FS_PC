import React, { useMemo, useState } from 'react';
import type { FsCatalogGroup, FsCatalogItem } from '../types';
import { buildFsDisplayGroups, filterFsCatalogItems } from '../utils/fsDisplayGroups';
import { yesNoClass, yesNoLabel } from '../utils/yesNoBadge';
import FsCatalogReadonlyModal from './FsCatalogReadonlyModal';

function groupAnySelected(items: FsCatalogItem[], selectedIds: Set<number>): boolean {
  return items.some(item => selectedIds.has(item.id));
}

function YesNoBadge({
  value,
  editing,
  onToggle,
}: {
  value: boolean;
  editing: boolean;
  onToggle?: () => void;
}) {
  const className = `inline-block px-2 py-0.5 rounded min-w-[36px] text-[10px] ${yesNoClass(value)}`;
  if (!editing) {
    return <span className={className}>{yesNoLabel(value)}</span>;
  }
  return (
    <button
      type="button"
      className={`${className} cursor-pointer`}
      title="Клик — переключить Да/Нет"
      onClick={e => {
        e.stopPropagation();
        onToggle?.();
      }}
    >
      {yesNoLabel(value)}
    </button>
  );
}

export default function SolutionFsPanel({
  groups,
  items,
  selectedIds,
  editing,
  onChange,
}: {
  groups: FsCatalogGroup[];
  items: FsCatalogItem[];
  selectedIds: Set<number>;
  editing: boolean;
  onChange: (ids: Set<number>) => void;
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

  function toggleItem(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleGroupItems(groupItems: FsCatalogItem[]) {
    const next = new Set(selectedIds);
    const any = groupAnySelected(groupItems, selectedIds);
    for (const item of groupItems) {
      if (any) next.delete(item.id);
      else next.add(item.id);
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

  function collapseAllSections() {
    setExpanded(new Set());
  }

  const visibleGroups = useMemo(() => {
    return displayGroups
      .map(group => ({
        group,
        visibleItems: group.items.filter(item => {
          if (onlyYes && !selectedIds.has(item.id)) return false;
          if (!q) return true;
          const hay = `${item.prefix ?? ''} ${item.name} ${group.group_name}`.toLowerCase();
          return hay.includes(q);
        }),
      }))
      .filter(({ visibleItems }) => visibleItems.length > 0 || (!q && !onlyYes));
  }, [displayGroups, onlyYes, q, selectedIds]);

  const selectedCount = selectedIds.size;

  return (
    <div className="flex flex-col min-h-0 h-full">
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
        <button
          type="button"
          className={`text-[10px] px-2 py-1 rounded border ${onlyYes ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-slate-200 text-slate-500'}`}
          onClick={() => setOnlyYes(v => !v)}
        >
          Только «Да» ({selectedCount})
        </button>
        <button
          type="button"
          onClick={collapseAllSections}
          className="text-[10px] text-slate-600 border border-slate-200 px-2 py-1 rounded hover:bg-slate-50"
        >
          Свернуть разделы
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-slate-200 rounded-lg min-h-[240px]">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left p-2 border w-20">Префикс</th>
              <th className="text-left p-2 border min-w-[160px]">Пункт ФС / Расшифровка</th>
              <th className="text-center p-2 border w-20">Да/Нет</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-3 text-slate-400 text-center">Ничего не найдено</td>
              </tr>
            ) : (
              visibleGroups.map(({ group, visibleItems }) => {
                const isExpanded = expanded.has(group.group_name);
                const groupSelected = groupAnySelected(group.items, selectedIds);
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
                        <span className="ml-2 text-[10px] font-normal text-slate-500">({group.items.length})</span>
                      </td>
                      <td className="p-2 border text-center align-top">
                        <YesNoBadge
                          value={groupSelected}
                          editing={editing}
                          onToggle={() => toggleGroupItems(group.items)}
                        />
                      </td>
                    </tr>
                    {isExpanded && visibleItems.map(item => (
                      <tr key={item.id} className={`hover:bg-slate-50 ${selectedIds.has(item.id) ? 'bg-emerald-50/30' : ''}`}>
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
                          <YesNoBadge
                            value={selectedIds.has(item.id)}
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
