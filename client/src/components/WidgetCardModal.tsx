import React, { useEffect, useRef, useState } from 'react';
import type { DataSlice, FsCatalogGroup, FsCatalogItem, SolutionFsLinkType, WidgetDetail } from '../types';
import { createDataSlice, getDataSlices } from '../api';
import { widgetDataSliceLabel } from '../utils/widgetDisplayGroups';
import SolutionFsPanel from './SolutionFsPanel';
import { WidgetImageThumbnail } from './WidgetImagePreview';

function fsIdsToLinks(ids: Set<number>): Map<number, SolutionFsLinkType> {
  return new Map([...ids].map(id => [id, 'required' as const]));
}

export type WidgetDraft = {
  name: string;
  description: string;
  type: string;
  data_slice_id: number | null;
};

export function widgetToDraft(widget: WidgetDetail): WidgetDraft {
  return {
    name: widget.name,
    description: widget.description ?? '',
    type: widget.type ?? 'dashboard',
    data_slice_id: widget.data_slice_id ?? null,
  };
}

export function emptyWidgetDraft(): WidgetDraft {
  return { name: '', description: '', type: 'dashboard', data_slice_id: null };
}

const MAX_WIDGET_IMAGE_BYTES = 5 * 1024 * 1024;

function WidgetImageField({
  widget,
  busy,
  onPickFile,
  onRemoveImage,
  compact = false,
}: {
  widget: Pick<WidgetDetail, 'name' | 'image_path'>;
  busy: boolean;
  onPickFile: (file: File) => void;
  onRemoveImage: () => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Выберите файл изображения (PNG, JPG, WebP или GIF)');
      return;
    }
    if (file.size > MAX_WIDGET_IMAGE_BYTES) {
      alert('Файл больше 5 МБ');
      return;
    }
    onPickFile(file);
  }

  const buttons = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="text-[10px] px-2 py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? 'Загрузка…' : widget.image_path ? 'Заменить' : 'Добавить'}
      </button>
      {widget.image_path ? (
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
          disabled={busy}
          onClick={onRemoveImage}
        >
          Удалить
        </button>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );

  if (compact) return buttons;

  return (
    <div className="shrink-0 space-y-1">
      {widget.image_path ? (
        <WidgetImageThumbnail
          imagePath={widget.image_path}
          name={widget.name}
          className="w-20 h-14 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
        />
      ) : (
        <div className="w-20 h-14 border border-dashed border-slate-200 rounded flex items-center justify-center text-[10px] text-slate-400 bg-slate-50">
          Нет
        </div>
      )}
      {buttons}
    </div>
  );
}

function SolutionContextPanel({ widget }: { widget: WidgetDetail }) {
  const hasContext = widget.hypothesis_usages.length > 0 || widget.orphan_solutions.length > 0;
  if (!hasContext) {
    return <p className="text-sm text-slate-400">Нет связей с решениями в гипотезах</p>;
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
                {problem.lcm_code ? (
                  <span className="font-mono text-slate-400 shrink-0">{problem.lcm_code}</span>
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

function MappingPickModal({
  title,
  subtitle,
  saving,
  onClose,
  onSave,
  children,
}: {
  title: string;
  subtitle?: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {subtitle ? <div className="text-[11px] text-slate-500 mt-0.5">{subtitle}</div> : null}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden px-4 py-3">
          {children}
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WidgetCardModal({
  mode,
  widget,
  draft: initialDraft,
  fsGroups,
  fsItems,
  onLoadFsLinks,
  onSaveFsLinks,
  onUploadImage,
  onRemoveImage,
  onClose,
  onSave,
  onDelete,
}: {
  mode: 'view' | 'edit' | 'create';
  widget?: WidgetDetail;
  draft?: WidgetDraft;
  fsGroups: FsCatalogGroup[];
  fsItems: FsCatalogItem[];
  onLoadFsLinks: (widgetId: number) => Promise<number[]>;
  onSaveFsLinks: (widgetId: number, fsItemIds: number[]) => Promise<number[]>;
  onUploadImage?: (widgetId: number, file: File) => Promise<WidgetDetail>;
  onRemoveImage?: (widgetId: number) => Promise<WidgetDetail>;
  onClose: () => void;
  onSave: (draft: WidgetDraft) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(mode !== 'view');
  const [pickFsOpen, setPickFsOpen] = useState(false);
  const [draft, setDraft] = useState<WidgetDraft>(
    () => initialDraft ?? (widget ? widgetToDraft(widget) : emptyWidgetDraft()),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fsSaving, setFsSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [fsIds, setFsIds] = useState<Set<number>>(() => new Set());
  const [fsDraft, setFsDraft] = useState<Set<number>>(() => new Set());
  const [dataSlices, setDataSlices] = useState<DataSlice[]>([]);
  const [extraDataSlices, setExtraDataSlices] = useState<DataSlice[]>([]);
  const [newDataSliceName, setNewDataSliceName] = useState('');

  useEffect(() => {
    getDataSlices().then(setDataSlices).catch(() => setDataSlices([]));
  }, []);

  const dataSlicesList = React.useMemo(() => {
    const map = new Map<number, DataSlice>();
    for (const item of [...dataSlices, ...extraDataSlices]) map.set(item.id, item);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [dataSlices, extraDataSlices]);

  async function addDataSlice() {
    const trimmed = newDataSliceName.trim();
    if (!trimmed) return;
    try {
      const created = await createDataSlice(trimmed);
      setExtraDataSlices(prev => [...prev, created]);
      setDraft(d => ({ ...d, data_slice_id: created.id }));
      setNewDataSliceName('');
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (pickFsOpen) return;
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pickFsOpen]);

  useEffect(() => {
    if (!widget || mode === 'create') return;
    let cancelled = false;
    onLoadFsLinks(widget.id).then(ids => {
      if (cancelled) return;
      const set = new Set(ids);
      setFsIds(set);
      setFsDraft(set);
    });
    return () => { cancelled = true; };
  }, [widget?.id, mode, onLoadFsLinks]);

  async function handleSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      if (mode === 'create') onClose();
      else setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFs() {
    if (!widget) return;
    setFsSaving(true);
    try {
      const saved = await onSaveFsLinks(widget.id, [...fsDraft]);
      setFsIds(new Set(saved));
      setFsDraft(new Set(saved));
      setPickFsOpen(false);
    } finally {
      setFsSaving(false);
    }
  }

  function handleCancelFs() {
    setFsDraft(new Set(fsIds));
    setPickFsOpen(false);
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm('Удалить виджет?')) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  async function handlePickImage(file: File) {
    if (!widget || !onUploadImage) return;
    setImageBusy(true);
    try {
      await onUploadImage(widget.id, file);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось загрузить изображение');
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage() {
    if (!widget || !onRemoveImage) return;
    if (!confirm('Удалить картинку виджета?')) return;
    setImageBusy(true);
    try {
      await onRemoveImage(widget.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Не удалось удалить изображение');
    } finally {
      setImageBusy(false);
    }
  }

  const canManageImage = Boolean(widget && mode !== 'create' && onUploadImage && onRemoveImage);

  const title = mode === 'create' ? 'Новый виджет' : editing ? 'Редактирование виджета' : 'Справочник · виджет';
  const showSplitView = !editing && widget && mode !== 'create';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`relative bg-white rounded-xl shadow-2xl w-full ${showSplitView ? 'max-w-6xl' : 'max-w-3xl'} max-h-[90vh] flex flex-col overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">{title}</div>
            {editing ? (
              <div className="space-y-2">
                {canManageImage ? (
                  <WidgetImageField
                    widget={widget!}
                    busy={imageBusy}
                    onPickFile={file => void handlePickImage(file)}
                    onRemoveImage={() => void handleRemoveImage()}
                  />
                ) : null}
                <div>
                  <label className="text-[10px] text-slate-400">Название</label>
                  <input
                    className="w-full text-sm border rounded px-2 py-1.5"
                    placeholder="Название виджета"
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Тип</label>
                  <select
                    className="w-full text-xs border rounded px-2 py-1"
                    value={draft.type}
                    onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
                  >
                    <option value="dashboard">dashboard</option>
                    <option value="screen">screen</option>
                    <option value="report">report</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Разрез данных</label>
                  <select
                    className="w-full text-xs border rounded px-2 py-1 mb-2"
                    value={draft.data_slice_id ?? ''}
                    onChange={e => setDraft(d => ({
                      ...d,
                      data_slice_id: e.target.value ? Number(e.target.value) : null,
                    }))}
                  >
                    <option value="">— не выбран —</option>
                    {dataSlicesList.map(slice => (
                      <option key={slice.id} value={slice.id}>{slice.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-xs border rounded px-2 py-1"
                      placeholder="Новый разрез данных"
                      value={newDataSliceName}
                      onChange={e => setNewDataSliceName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addDataSlice(); } }}
                    />
                    <button
                      type="button"
                      className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-100"
                      onClick={() => void addDataSlice()}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Описание</label>
                  <textarea
                    className="w-full text-xs border rounded px-2 py-1 min-h-[80px]"
                    value={draft.description}
                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                  />
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{widget?.name}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {widget?.type}
                  {widget ? ` · ${widgetDataSliceLabel(widget)}` : ''}
                </div>
              </div>
            )}
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

        {showSplitView ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-0 overflow-hidden">
            <div className="overflow-hidden px-4 py-3 border-b lg:border-b lg:border-r border-slate-100 flex flex-col items-center justify-center gap-2 bg-slate-50/50 min-h-0">
              {widget.image_path ? (
                <WidgetImageThumbnail
                  imagePath={widget.image_path}
                  name={widget.name}
                  className="max-w-full max-h-full w-auto h-auto max-h-[calc(100%-2rem)] object-contain bg-white border border-slate-100 rounded cursor-pointer hover:border-slate-400"
                />
              ) : (
                <span className="text-xs text-slate-400">Нет изображения</span>
              )}
              {canManageImage ? (
                <div className="flex flex-wrap gap-2 justify-center shrink-0">
                  <WidgetImageField
                    widget={widget}
                    busy={imageBusy}
                    onPickFile={file => void handlePickImage(file)}
                    onRemoveImage={() => void handleRemoveImage()}
                    compact
                  />
                </div>
              ) : null}
            </div>
            <div className="overflow-y-auto px-4 py-3 border-b border-slate-100 min-h-0">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Описание
              </div>
              {widget.description ? (
                <div className="text-xs text-slate-700 whitespace-pre-wrap">{widget.description}</div>
              ) : (
                <p className="text-sm text-slate-400">Описание не указано</p>
              )}
            </div>
            <div className="overflow-y-auto px-4 py-3 border-b lg:border-b-0 lg:border-r border-slate-100 min-h-0">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Гипотезы, проблематики и решения
              </div>
              <SolutionContextPanel widget={widget} />
              <p className="text-[10px] text-slate-400 mt-3">
                Связи виджет → решение настраиваются в карточке решения
              </p>
            </div>
            <div className="overflow-y-auto px-4 py-3 min-h-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Пункты ФС
                  <span className="ml-1.5 font-normal text-slate-400 normal-case">({fsIds.size})</span>
                </div>
                <button
                  type="button"
                  className="text-[10px] px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                  onClick={() => {
                    setFsDraft(new Set(fsIds));
                    setPickFsOpen(true);
                  }}
                >
                  Редактировать
                </button>
              </div>
              <SolutionFsPanel
                groups={fsGroups}
                items={fsItems}
                fsLinks={fsIdsToLinks(fsIds)}
                editing={false}
                onChange={() => {}}
                onlySelected
                compact
              />
            </div>
          </div>
        ) : null}

        <div className="px-4 py-3 border-t border-slate-100 flex justify-between gap-2 shrink-0">
          <div>
            {mode !== 'create' && onDelete && !editing ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              Отмена
            </button>
            {editing ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                onClick={handleSave}
                disabled={saving || !draft.name.trim()}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            ) : mode !== 'create' ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
                onClick={() => {
                  if (widget) setDraft(widgetToDraft(widget));
                  setPickFsOpen(false);
                  setEditing(true);
                }}
              >
                Редактировать
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {pickFsOpen && widget ? (
        <MappingPickModal
          title="Сопоставление с пунктами ФС"
          subtitle={widget.name}
          saving={fsSaving}
          onClose={handleCancelFs}
          onSave={() => void handleSaveFs()}
        >
          <SolutionFsPanel
            groups={fsGroups}
            items={fsItems}
            fsLinks={fsIdsToLinks(fsDraft)}
            editing
            onChange={links => setFsDraft(new Set(links.keys()))}
          />
        </MappingPickModal>
      ) : null}
    </div>
  );
}
