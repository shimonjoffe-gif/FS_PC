import React, { useEffect, useMemo, useState } from 'react';
import type { BriefingCustomerWidgetSel, Solution, Widget } from '../types';
import { buildSolutionDisplayUnits } from '../utils/solutionDisplayGroups';
import { yesNoClass, yesNoLabel } from '../utils/yesNoBadge';
import { matchesWidgetSearch } from '../utils/widgetDisplayGroups';
import { WidgetGroupedTableBody, WidgetGroupCollapseAllButton, useWidgetGroupCollapse } from './WidgetGroupedList';
import { WidgetImageThumbnail } from './WidgetImagePreview';

function matchesSolutionSearch(s: Solution, q: string): boolean {
  if (!q) return true;
  return (
    s.name.toLowerCase().includes(q)
    || (s.catalog_code?.toLowerCase().includes(q) ?? false)
    || (s.lcm_code?.toLowerCase().includes(q) ?? false)
    || (s.description?.toLowerCase().includes(q) ?? false)
  );
}

export function WidgetSolutionsPickModal({
  widgetName,
  solutions,
  initialSelectedIds,
  onConfirm,
  onClose,
}: {
  widgetName: string;
  solutions: Solution[];
  initialSelectedIds: Set<number>;
  onConfirm: (solutionIds: number[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initialSelectedIds));
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

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderRow(
    sol: Solution,
    opts: { indent?: number; variant: 'parent' | 'child' | 'standalone'; groupParentId?: number },
  ) {
    const indent = opts.indent ?? 0;
    const isYes = selected.has(sol.id);
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
            onClick={() => toggle(sol.id)}
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
          <div className="text-[10px] text-slate-400 mb-1">Виджет → решения</div>
          <div className="text-sm font-semibold text-slate-800">{widgetName}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Выберите одно или несколько решений для дополнения списка. ФС по виджету добавится и без решений.
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
            <div className="px-2 py-3 text-sm text-slate-400">Нет связанных решений</div>
          )}
          {units.map(unit => {
            if (unit.kind === 'group') {
              return (
                <div key={`g-${unit.parent.id}`}>
                  {renderRow(unit.parent, { variant: 'parent', groupParentId: unit.parent.id })}
                  {!collapsed.has(unit.parent.id) && unit.children.map(child =>
                    renderRow(child, { variant: 'child', indent: 12 }),
                  )}
                </div>
              );
            }
            return renderRow(unit.item, { variant: 'standalone' });
          })}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Выбрано: <span className="font-medium">{selected.size}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
              onClick={() => onConfirm([...selected])}
            >
              Добавить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CustomerWidgetsPanel({
  catalog,
  selected,
  solutionsByWidgetId,
  onRequestToggle,
}: {
  catalog: Widget[];
  selected: BriefingCustomerWidgetSel[];
  solutionsByWidgetId: Map<number, Solution[]>;
  onRequestToggle: (widget: Widget, enable: boolean) => void;
}) {
  const [search, setSearch] = useState('');
  const groupCollapse = useWidgetGroupCollapse();
  const selectedIds = useMemo(
    () => new Set(selected.map(s => s.widget_id)),
    [selected],
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? catalog.filter(w => matchesWidgetSearch(w, q)) : catalog;
    return filtered;
  }, [catalog, search]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Показаны только виджеты со связью на решение и/или пункт ФС в НСИ. При одном связанном
        решении оно добавится автоматически; при нескольких — откроется выбор. При снятии виджета
        решение убирается только если оно было добавлено исключительно этим виджетом. ФС также
        берётся напрямую из связей виджета.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-full max-w-md text-sm border rounded px-2 py-1.5"
          placeholder="Поиск виджета, разреза…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <WidgetGroupCollapseAllButton widgets={list} collapse={groupCollapse} />
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">
          Нет виджетов со связями на решения или ФС. Настройте связи в справочниках (Виджет→решение / Виджет→ФС).
        </p>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="p-2 border-b text-left w-20">Превью</th>
                <th className="p-2 border-b text-left">Виджет</th>
                <th className="p-2 border-b text-left w-28">Связи</th>
                <th className="p-2 border-b text-center w-16">Нужен</th>
              </tr>
            </thead>
            <tbody>
              <WidgetGroupedTableBody
                widgets={list}
                colSpan={4}
                collapse={groupCollapse}
                renderRow={w => {
                  const on = selectedIds.has(w.id);
                  const linked = solutionsByWidgetId.get(w.id) ?? [];
                  return (
                    <tr key={w.id} className={on ? 'bg-blue-50/30' : 'hover:bg-slate-50/80'}>
                      <td className="p-2 border-b align-middle">
                        <WidgetImageThumbnail
                          imagePath={w.image_path}
                          name={w.name}
                          className="w-14 h-10 object-contain bg-white border border-slate-100 rounded cursor-pointer hover:border-slate-400"
                        />
                      </td>
                      <td className="p-2 border-b align-top">
                        <div className="text-sm font-medium text-slate-800">{w.name}</div>
                        {w.description ? (
                          <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{w.description}</div>
                        ) : null}
                        {w.type ? (
                          <div className="text-[10px] text-slate-400 mt-0.5">{w.type}</div>
                        ) : null}
                      </td>
                      <td className="p-2 border-b align-middle text-slate-500">
                        {linked.length === 0
                          ? 'нет решений'
                          : linked.length === 1
                            ? '→ 1 решение'
                            : `→ ${linked.length} решений`}
                      </td>
                      <td className="p-2 border-b align-middle text-center">
                        <button
                          type="button"
                          className={`px-2 py-0.5 rounded min-w-[36px] text-xs cursor-pointer ${yesNoClass(on)}`}
                          title={on ? 'Клик — снять' : 'Клик — выбрать'}
                          onClick={() => onRequestToggle(w, !on)}
                        >
                          {yesNoLabel(on)}
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
