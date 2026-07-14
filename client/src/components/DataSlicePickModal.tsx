import React, { useEffect, useMemo, useState } from 'react';
import type { DataSlice } from '../types';
import { createDataSlice, getDataSlices } from '../api';

export default function DataSlicePickModal({
  title,
  subtitle,
  initialDataSliceId = null,
  saving = false,
  onClose,
  onConfirm,
}: {
  title: string;
  subtitle?: string;
  initialDataSliceId?: number | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (dataSliceId: number | null) => void | Promise<void>;
}) {
  const [dataSlices, setDataSlices] = useState<DataSlice[]>([]);
  const [extraDataSlices, setExtraDataSlices] = useState<DataSlice[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>(initialDataSliceId ?? '');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    getDataSlices().then(setDataSlices).catch(() => setDataSlices([]));
  }, []);

  const dataSlicesList = useMemo(() => {
    const map = new Map<number, DataSlice>();
    for (const item of [...dataSlices, ...extraDataSlices]) map.set(item.id, item);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [dataSlices, extraDataSlices]);

  async function addDataSlice() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      const created = await createDataSlice(trimmed);
      setExtraDataSlices(prev => [...prev, created]);
      setSelectedId(created.id);
      setNewName('');
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-800">{title}</div>
          {subtitle ? <div className="text-[11px] text-slate-500 mt-1">{subtitle}</div> : null}
        </div>
        <div className="px-4 py-3 space-y-3">
          <div>
            <label className="text-[10px] text-slate-400">Разрез данных</label>
            <select
              className="w-full text-sm border rounded px-2 py-1.5 mt-0.5"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— не выбран —</option>
              {dataSlicesList.map(slice => (
                <option key={slice.id} value={slice.id}>{slice.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Новый разрез</label>
            <div className="flex gap-2 mt-0.5">
              <input
                className="flex-1 text-sm border rounded px-2 py-1.5"
                placeholder="Название разреза"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addDataSlice(); } }}
              />
              <button
                type="button"
                className="text-sm px-2.5 py-1.5 rounded border border-slate-200 hover:bg-slate-50"
                onClick={() => void addDataSlice()}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
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
            disabled={saving}
            onClick={() => void onConfirm(selectedId === '' ? null : selectedId)}
          >
            {saving ? 'Сохранение…' : 'Применить'}
          </button>
        </div>
      </div>
    </div>
  );
}
