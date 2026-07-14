import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Widget, WidgetDetail, FsCatalogGroup, FsCatalogItem } from '../types';
import { updateWidget } from '../api';
import WidgetCardModal, { emptyWidgetDraft, type WidgetDraft } from './WidgetCardModal';
import DataSlicePickModal from './DataSlicePickModal';
import { WidgetImageThumbnail } from './WidgetImagePreview';
import { WidgetGroupedSections, WidgetGroupCollapseAllButton, useWidgetGroupCollapse } from './WidgetGroupedList';
import { matchesWidgetSearch, widgetDataSliceLabel } from '../utils/widgetDisplayGroups';

type CardState =
  | { mode: 'view'; widget: WidgetDetail }
  | { mode: 'create' }
  | null;

function draftToPayload(draft: WidgetDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    type: draft.type,
    data_slice_id: draft.data_slice_id,
  };
}

function WidgetRow({
  widget,
  selected,
  onToggleSelect,
  onOpen,
  onDelete,
}: {
  widget: Widget;
  selected: boolean;
  onToggleSelect: (widgetId: number, checked: boolean) => void;
  onOpen: (id: number) => void;
  onDelete: (widget: Widget) => void;
}) {
  return (
    <div className={`flex items-start gap-2 px-2 rounded group ${selected ? 'bg-blue-50/60' : 'hover:bg-blue-50'}`}>
      <input
        type="checkbox"
        className="mt-3 shrink-0"
        checked={selected}
        onChange={e => onToggleSelect(widget.id, e.target.checked)}
        onClick={e => e.stopPropagation()}
        title="Выбрать для массового действия"
      />
      <button type="button" className="flex-1 text-left py-2 min-w-0 flex gap-2" onClick={() => onOpen(widget.id)}>
        <WidgetImageThumbnail
          imagePath={widget.image_path}
          name={widget.name}
          className="w-12 h-9 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
          placeholderClassName="w-12 h-9 shrink-0 text-slate-300 text-center leading-9 border border-slate-100 rounded bg-slate-50"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800 truncate">{widget.name}</div>
          <div className="text-[10px] text-slate-400">{widget.type} · {widgetDataSliceLabel(widget)}</div>
          {widget.description ? (
            <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{widget.description}</div>
          ) : null}
          <div className="text-[10px] text-slate-400 mt-1">
            Решений: {widget.linked_solution_count ?? 0} · ФС: {widget.linked_fs_count ?? 0}
          </div>
        </div>
      </button>
      <button
        type="button"
        className="text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 shrink-0 opacity-0 group-hover:opacity-100"
        title="Удалить"
        onClick={e => { e.stopPropagation(); onDelete(widget); }}
      >
        ✕
      </button>
    </div>
  );
}

export default function WidgetsNsi({
  items,
  fsGroups,
  fsItems,
  onLoadFsLinks,
  onSaveFsLinks,
  onOpen,
  onCreate,
  onSave,
  onDelete,
  onUploadImage,
  onRemoveImage,
  onReload,
}: {
  items: Widget[];
  fsGroups: FsCatalogGroup[];
  fsItems: FsCatalogItem[];
  onLoadFsLinks: (widgetId: number) => Promise<number[]>;
  onSaveFsLinks: (widgetId: number, fsItemIds: number[]) => Promise<number[]>;
  onOpen: (id: number) => Promise<WidgetDetail>;
  onCreate: (data: ReturnType<typeof draftToPayload>) => Promise<WidgetDetail>;
  onSave: (id: number, data: ReturnType<typeof draftToPayload>) => Promise<WidgetDetail>;
  onDelete: (id: number) => Promise<void>;
  onUploadImage: (id: number, file: File) => Promise<WidgetDetail>;
  onRemoveImage: (id: number) => Promise<WidgetDetail>;
  onReload: () => Promise<void>;
}) {
  const [card, setCard] = useState<CardState>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkSliceOpen, setBulkSliceOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const groupCollapse = useWidgetGroupCollapse();

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(w => matchesWidgetSearch(w, q));
  }, [items, search]);

  const filteredIds = useMemo(() => new Set(filteredItems.map(w => w.id)), [filteredItems]);
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(w => selectedIds.has(w.id));
  const someFilteredSelected = filteredItems.some(w => selectedIds.has(w.id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allFilteredSelected && someFilteredSelected;
    }
  }, [allFilteredSelected, someFilteredSelected]);

  function toggleSelect(widgetId: number, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(widgetId);
      else next.delete(widgetId);
      return next;
    });
  }

  function toggleSelectAllFiltered(checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of filteredIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function openCard(id: number) {
    setBusy(true);
    try {
      setCard({ mode: 'view', widget: await onOpen(id) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveExisting(draft: WidgetDraft) {
    if (card?.mode !== 'view') return;
    const updated = await onSave(card.widget.id, draftToPayload(draft));
    setCard({ mode: 'view', widget: updated });
  }

  async function handleDeleteWidget(widget: Widget) {
    if (!confirm(`Удалить виджет «${widget.name}»?`)) return;
    await onDelete(widget.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(widget.id);
      return next;
    });
    if (card?.mode === 'view' && card.widget.id === widget.id) setCard(null);
  }

  async function handleBulkAssignDataSlice(dataSliceId: number | null) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      await Promise.all(ids.map(id => updateWidget(id, { data_slice_id: dataSliceId })));
      await onReload();
      setBulkSliceOpen(false);
      setSelectedIds(new Set());
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleUploadImage(id: number, file: File) {
    const updated = await onUploadImage(id, file);
    setCard(prev => prev?.mode === 'view' && prev.widget.id === id ? { mode: 'view', widget: updated } : prev);
    return updated;
  }

  async function handleRemoveImage(id: number) {
    const updated = await onRemoveImage(id);
    setCard(prev => prev?.mode === 'view' && prev.widget.id === id ? { mode: 'view', widget: updated } : prev);
    return updated;
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-slate-400">Поиск</label>
          <input
            className="w-full text-sm border rounded px-2 py-1"
            placeholder="Название, описание, тип, разрез…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
          onClick={() => setCard({ mode: 'create' })}
        >
          + Добавить
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2 px-2 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs">
          <span className="text-slate-700">
            Выбрано: <span className="font-medium">{selectedIds.size}</span>
          </span>
          <button
            type="button"
            className="px-2.5 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
            onClick={() => setBulkSliceOpen(true)}
          >
            Назначить разрез…
          </button>
          <button
            type="button"
            className="px-2.5 py-1 rounded border border-slate-200 text-slate-600 hover:bg-white"
            onClick={() => setSelectedIds(new Set())}
          >
            Снять выбор
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-2 px-1">
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            ref={selectAllRef}
            checked={allFilteredSelected}
            onChange={e => toggleSelectAllFiltered(e.target.checked)}
            disabled={filteredItems.length === 0}
          />
          Выбрать все на экране
        </label>
        <WidgetGroupCollapseAllButton widgets={filteredItems} collapse={groupCollapse} />
        <span className="text-[10px] text-slate-400">
          Показано {filteredItems.length} из {items.length}
        </span>
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-slate-400">Ничего не найдено</p>
      ) : (
        <div className="border border-slate-200 rounded-lg py-1">
          <WidgetGroupedSections
            widgets={filteredItems}
            collapse={groupCollapse}
            renderWidget={widget => (
              <WidgetRow
                key={widget.id}
                widget={widget}
                selected={selectedIds.has(widget.id)}
                onToggleSelect={toggleSelect}
                onOpen={openCard}
                onDelete={handleDeleteWidget}
              />
            )}
          />
        </div>
      )}

      {busy && !card ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 text-sm text-white">Загрузка…</div>
      ) : null}

      {bulkSliceOpen ? (
        <DataSlicePickModal
          title="Назначить разрез данных"
          subtitle={`Выбрано виджетов: ${selectedIds.size}`}
          saving={bulkSaving}
          onClose={() => !bulkSaving && setBulkSliceOpen(false)}
          onConfirm={handleBulkAssignDataSlice}
        />
      ) : null}

      {card?.mode === 'view' ? (
        <WidgetCardModal
          mode="view"
          widget={card.widget}
          fsGroups={fsGroups}
          fsItems={fsItems}
          onLoadFsLinks={onLoadFsLinks}
          onSaveFsLinks={onSaveFsLinks}
          onUploadImage={handleUploadImage}
          onRemoveImage={handleRemoveImage}
          onClose={() => setCard(null)}
          onSave={handleSaveExisting}
          onDelete={() => onDelete(card.widget.id)}
        />
      ) : null}

      {card?.mode === 'create' ? (
        <WidgetCardModal
          mode="create"
          draft={emptyWidgetDraft()}
          fsGroups={fsGroups}
          fsItems={fsItems}
          onLoadFsLinks={onLoadFsLinks}
          onSaveFsLinks={onSaveFsLinks}
          onClose={() => setCard(null)}
          onSave={async draft => { await onCreate(draftToPayload(draft)); }}
        />
      ) : null}
    </>
  );
}
