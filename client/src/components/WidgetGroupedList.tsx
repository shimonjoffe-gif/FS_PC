import React, { useState } from 'react';
import type { Widget } from '../types';
import { buildWidgetDisplayGroups } from '../utils/widgetDisplayGroups';

export type WidgetGroupCollapseControl = {
  collapsed: Set<string>;
  toggle: (key: string) => void;
  collapseAll: (keys: string[]) => void;
  expandAll: () => void;
  allCollapsed: (keys: string[]) => boolean;
};

export function useWidgetGroupCollapse(): WidgetGroupCollapseControl {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function collapseAll(keys: string[]) {
    setCollapsed(new Set(keys));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  function allCollapsed(keys: string[]) {
    return keys.length > 0 && keys.every(key => collapsed.has(key));
  }

  return { collapsed, toggle, collapseAll, expandAll, allCollapsed };
}

export function WidgetGroupCollapseAllButton({
  widgets,
  collapse,
  className = '',
}: {
  widgets: Widget[];
  collapse: WidgetGroupCollapseControl;
  className?: string;
}) {
  const groupKeys = buildWidgetDisplayGroups(widgets).map(group => group.key);
  if (groupKeys.length <= 1) return null;

  const allCollapsed = collapse.allCollapsed(groupKeys);
  return (
    <button
      type="button"
      className={`text-[11px] px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 whitespace-nowrap ${className}`}
      onClick={() => (allCollapsed ? collapse.expandAll() : collapse.collapseAll(groupKeys))}
    >
      {allCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
    </button>
  );
}

export function WidgetGroupHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  if (!onToggle) {
    return (
      <div className="px-2 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-50 border-b border-slate-100">
        {label}
        <span className="font-normal text-slate-400 ml-1">({count})</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 bg-slate-50 border-b border-slate-100 hover:bg-slate-100"
      title={collapsed ? 'Развернуть группу' : 'Свернуть группу'}
      onClick={onToggle}
    >
      <span className="w-4 text-center text-slate-500 shrink-0">{collapsed ? '▶' : '▼'}</span>
      <span className="min-w-0">
        {label}
        <span className="font-normal text-slate-400 ml-1">({count})</span>
      </span>
    </button>
  );
}

export function WidgetGroupedSections({
  widgets,
  renderWidget,
  className = '',
  collapse: externalCollapse,
}: {
  widgets: Widget[];
  renderWidget: (widget: Widget) => React.ReactNode;
  className?: string;
  collapse?: WidgetGroupCollapseControl;
}) {
  const groups = buildWidgetDisplayGroups(widgets);
  const internalCollapse = useWidgetGroupCollapse();
  const collapse = externalCollapse ?? internalCollapse;
  if (groups.length === 0) return null;

  return (
    <div className={className}>
      {groups.map(group => {
        const isCollapsed = collapse.collapsed.has(group.key);
        return (
          <section key={group.key}>
            <WidgetGroupHeader
              label={group.label}
              count={group.widgets.length}
              collapsed={isCollapsed}
              onToggle={() => collapse.toggle(group.key)}
            />
            {!isCollapsed && group.widgets.map(widget => (
              <React.Fragment key={widget.id}>{renderWidget(widget)}</React.Fragment>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export function WidgetGroupedTableBody({
  widgets,
  colSpan,
  renderRow,
  collapse: externalCollapse,
}: {
  widgets: Widget[];
  colSpan: number;
  renderRow: (widget: Widget) => React.ReactNode;
  collapse?: WidgetGroupCollapseControl;
}) {
  const groups = buildWidgetDisplayGroups(widgets);
  const internalCollapse = useWidgetGroupCollapse();
  const collapse = externalCollapse ?? internalCollapse;
  if (groups.length === 0) return null;

  return (
    <>
      {groups.map(group => {
        const isCollapsed = collapse.collapsed.has(group.key);
        return (
          <React.Fragment key={group.key}>
            <tr className="bg-slate-50">
              <td colSpan={colSpan} className="p-0 border-b">
                <button
                  type="button"
                  className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                  title={isCollapsed ? 'Развернуть группу' : 'Свернуть группу'}
                  onClick={() => collapse.toggle(group.key)}
                >
                  <span className="w-4 text-center text-slate-500 shrink-0">{isCollapsed ? '▶' : '▼'}</span>
                  <span>
                    {group.label}
                    <span className="font-normal text-slate-400 ml-1">({group.widgets.length})</span>
                  </span>
                </button>
              </td>
            </tr>
            {!isCollapsed && group.widgets.map(widget => (
              <React.Fragment key={widget.id}>{renderRow(widget)}</React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
    </>
  );
}
