import React, { useEffect } from 'react';
import type { FsCatalogItem } from '../types';

export default function FsCatalogReadonlyModal({
  item,
  onClose,
}: {
  item: FsCatalogItem;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const details = item.details ?? [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">Пункт ФС · расшифровка</div>
            <div className="flex gap-2 items-baseline flex-wrap">
              <span className="text-sm font-mono text-slate-500">{item.prefix || '—'}</span>
              <span className="text-sm font-semibold text-slate-800">{item.name}</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {item.group_name || item.phase || '—'}
              {item.func_type ? ` · ${item.func_type}` : ''}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {item.description?.trim() ? (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Описание</h3>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{item.description}</p>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Расшифровка</h3>
            {details.length === 0 ? (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded p-3 border border-slate-100">Нет подпунктов расшифровки</p>
            ) : (
              <div className="space-y-2">
                {details.map((line, idx) => (
                  <div key={idx} className="border rounded p-2 bg-slate-50/50">
                    <div className="text-xs font-medium text-slate-800">{line.name}</div>
                    {line.description?.trim() ? (
                      <div className="text-[11px] text-slate-600 mt-1 whitespace-pre-wrap">{line.description}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
