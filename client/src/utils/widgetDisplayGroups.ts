import type { Widget } from '../types';

export const WIDGET_NO_DATA_SLICE_LABEL = 'Без разреза';

export type WidgetDisplayGroup = {
  key: string;
  label: string;
  widgets: Widget[];
};

export function widgetDataSliceLabel(widget: Widget): string {
  return widget.data_slice_name?.trim() || WIDGET_NO_DATA_SLICE_LABEL;
}

export function buildWidgetDisplayGroups(widgets: Widget[]): WidgetDisplayGroup[] {
  const groups = new Map<string, WidgetDisplayGroup>();

  for (const widget of widgets) {
    const key = widget.data_slice_id != null ? String(widget.data_slice_id) : 'none';
    const label = widgetDataSliceLabel(widget);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, widgets: [] };
      groups.set(key, group);
    }
    group.widgets.push(widget);
  }

  for (const group of groups.values()) {
    group.widgets.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === 'none') return 1;
    if (b.key === 'none') return -1;
    return a.label.localeCompare(b.label, 'ru');
  });
}

export function matchesWidgetSearch(widget: Widget, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    widget.name.toLowerCase().includes(q)
    || (widget.description?.toLowerCase().includes(q) ?? false)
    || (widget.type?.toLowerCase().includes(q) ?? false)
    || widgetDataSliceLabel(widget).toLowerCase().includes(q)
  );
}
