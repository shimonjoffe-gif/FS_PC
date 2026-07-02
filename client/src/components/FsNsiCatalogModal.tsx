import React, { useEffect, useState } from 'react';
import type { FsCatalogItem } from '../types';

export type FsCatalogDetailLine = { name: string; description: string | null };

export default function FsNsiCatalogModal({
  item,
  isNew = false,
  onClose,
  onSave,
  onOpenUsage,
}: {
  item: FsCatalogItem;
  isNew?: boolean;
  onClose: () => void;
  onSave: (patch: {
    prefix: string | null;
    name: string;
    details: FsCatalogDetailLine[];
  }) => void | Promise<void>;
  onOpenUsage?: () => void;
}) {
  const [prefix, setPrefix] = useState(item.prefix ?? '');
  const [name, setName] = useState(item.name);
  const [details, setDetails] = useState<FsCatalogDetailLine[]>(
    () => (item.details ?? []).map(d => ({ name: d.name, description: d.description })),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function addDetail() {
    setDetails(prev => [...prev, { name: '', description: null }]);
  }

  function updateDetail(idx: number, patch: Partial<FsCatalogDetailLine>) {
    setDetails(prev => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function removeDetail(idx: number) {
    setDetails(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        prefix: prefix.trim() || null,
        name: name.trim(),
        details: details
          .filter(d => d.name.trim())
          .map(d => ({ name: d.name.trim(), description: d.description?.trim() || null })),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">{isNew ? 'Новый пункт ФС' : 'НСИ · пункт ФС'}</div>
            <div className="flex gap-2 items-center">
              <input
                className="w-16 text-sm border rounded px-2 py-1 font-mono text-slate-600"
                value={prefix}
                placeholder={isNew ? 'авто' : '№'}
                onChange={e => setPrefix(e.target.value)}
              />
              <input
                className="flex-1 min-w-0 text-sm font-semibold border rounded px-2 py-1 text-slate-800"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {item.group_name || item.phase || '—'}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Расшифровка</h3>
              <button type="button" onClick={addDetail} className="text-xs text-blue-600 hover:underline">+ Добавить подпункт</button>
            </div>
            {details.length === 0 ? (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded p-3 border border-slate-100">Нет подпунктов расшифровки</p>
            ) : (
              <div className="space-y-2">
                {details.map((line, idx) => (
                  <div key={idx} className="border rounded p-2 space-y-1.5 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 text-xs border rounded px-2 py-1 bg-white"
                        placeholder="Название подпункта"
                        value={line.name}
                        onChange={e => updateDetail(idx, { name: e.target.value })}
                      />
                      <button type="button" onClick={() => removeDetail(idx)} className="text-[10px] text-red-500 hover:underline shrink-0">Удалить</button>
                    </div>
                    <textarea
                      className="w-full text-xs border rounded px-2 py-1 min-h-[3rem] bg-white"
                      placeholder="Описание"
                      value={line.description ?? ''}
                      onChange={e => updateDetail(idx, { description: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {!isNew && onOpenUsage && (
            <button
              type="button"
              onClick={onOpenUsage}
              className="text-xs text-blue-600 hover:underline"
            >
              Где используется в проектах
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600">Отмена</button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : isNew ? 'Создать' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
