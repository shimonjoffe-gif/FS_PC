import React, { useMemo, useState } from 'react';
import type { Widget, WidgetDetail, FsCatalogGroup, FsCatalogItem } from '../types';
import WidgetCardModal, { emptyWidgetDraft, type WidgetDraft } from './WidgetCardModal';
import { WidgetImageThumbnail } from './WidgetImagePreview';

type CardState =
  | { mode: 'view'; widget: WidgetDetail }
  | { mode: 'create' }
  | null;

function draftToPayload(draft: WidgetDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    type: draft.type,
  };
}

function WidgetRow({
  widget,
  onOpen,
  onDelete,
}: {
  widget: Widget;
  onOpen: (id: number) => void;
  onDelete: (widget: Widget) => void;
}) {
  return (
    <div className="flex items-start gap-2 px-2 hover:bg-blue-50 rounded group">
      <button type="button" className="flex-1 text-left py-2 min-w-0 flex gap-2" onClick={() => onOpen(widget.id)}>
        <WidgetImageThumbnail
          imagePath={widget.image_path}
          name={widget.name}
          className="w-12 h-9 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
          placeholderClassName="w-12 h-9 shrink-0 text-slate-300 text-center leading-9 border border-slate-100 rounded bg-slate-50"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800 truncate">{widget.name}</div>
          <div className="text-[10px] text-slate-400">{widget.type}</div>
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
}) {
  const [card, setCard] = useState<CardState>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(w =>
      w.name.toLowerCase().includes(q)
      || w.description?.toLowerCase().includes(q)
      || w.type?.toLowerCase().includes(q),
    );
  }, [items, search]);

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
    if (card?.mode === 'view' && card.widget.id === widget.id) setCard(null);
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
            placeholder="Название, описание, тип…"
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

      <p className="text-[10px] text-slate-400 mb-2">
        Показано {filteredItems.length} из {items.length} · связи с решениями — в карточке решения; ФС — в карточке виджета
      </p>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-slate-400">Ничего не найдено</p>
      ) : (
        <div className="border border-slate-200 rounded-lg py-1">
          {filteredItems.map(widget => (
            <WidgetRow key={widget.id} widget={widget} onOpen={openCard} onDelete={handleDeleteWidget} />
          ))}
        </div>
      )}

      {busy && !card ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 text-sm text-white">Загрузка…</div>
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
