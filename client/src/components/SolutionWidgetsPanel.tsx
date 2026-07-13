import React, { useMemo, useState } from 'react';
import type { Widget } from '../types';
import { yesNoClass, yesNoLabel } from '../utils/yesNoBadge';
import { WidgetImageThumbnail } from './WidgetImagePreview';

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

export default function SolutionWidgetsPanel({
  widgets,
  selectedIds,
  editing,
  onChange,
}: {
  widgets: Widget[];
  selectedIds: Set<number>;
  editing: boolean;
  onChange: (ids: Set<number>) => void;
}) {
  const [search, setSearch] = useState('');
  const [onlyYes, setOnlyYes] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = widgets;
    if (q) {
      filtered = widgets.filter(w =>
        w.name.toLowerCase().includes(q)
        || (w.description?.toLowerCase().includes(q) ?? false)
        || (w.type?.toLowerCase().includes(q) ?? false),
      );
    }
    if (onlyYes) filtered = filtered.filter(w => selectedIds.has(w.id));
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [widgets, search, onlyYes, selectedIds]);

  function toggle(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap items-center gap-2 mb-2 shrink-0">
        <input
          className="flex-1 min-w-[120px] text-xs border rounded px-2 py-1"
          placeholder="Поиск виджета…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1 text-[10px] text-slate-500 whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyYes}
            onChange={e => setOnlyYes(e.target.checked)}
          />
          Только «Да»
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto border border-slate-100 rounded-lg">
        {list.length === 0 ? (
          <p className="text-xs text-slate-400 p-3">Нет виджетов в справочнике</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-slate-500">
                <th className="p-2 border-b text-left w-14">Превью</th>
                <th className="p-2 border-b text-left">Виджет</th>
                <th className="p-2 border-b text-center w-14">Да/Нет</th>
              </tr>
            </thead>
            <tbody>
              {list.map(w => {
                const on = selectedIds.has(w.id);
                return (
                  <tr key={w.id} className={on ? 'bg-blue-50/30' : 'hover:bg-slate-50/80'}>
                    <td className="p-2 border-b align-middle">
                      <WidgetImageThumbnail
                        imagePath={w.image_path}
                        name={w.name}
                        className="w-12 h-8 object-contain bg-white border border-slate-100 rounded cursor-pointer hover:border-slate-400"
                      />
                    </td>
                    <td className="p-2 border-b align-top">
                      <div className="font-medium text-slate-800">{w.name}</div>
                      {w.description ? (
                        <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{w.description}</div>
                      ) : null}
                    </td>
                    <td className="p-2 border-b align-middle text-center">
                      <YesNoBadge
                        value={on}
                        editing={editing}
                        onToggle={() => toggle(w.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
