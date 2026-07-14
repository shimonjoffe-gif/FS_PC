import React, { useEffect, useState } from 'react';
import type { BriefingFsDetailLine, BriefingFsSel } from '../types';
import { isNsiLineModified } from '../fsDetailLines';
import { isCustomerFsItem } from '../fsCustomerItems';
import { WidgetImageThumbnail } from './WidgetImagePreview';

function initialCustomerBreakdown(item: BriefingFsSel): string {
  if (item.description?.trim()) return item.description;
  const lines = (item.detail_lines ?? []).filter(l => !l.inactive);
  if (lines.length === 0) return '';
  if (lines.length === 1 && !lines[0].name.trim()) {
    return lines[0].description?.trim() ?? '';
  }
  return lines.map(l => {
    const n = l.name.trim();
    const d = l.description?.trim();
    if (n && d) return `${n} — ${d}`;
    return n || d || '';
  }).filter(Boolean).join('\n');
}

function buildInitialDetailLines(item: BriefingFsSel): BriefingFsDetailLine[] {
  if (item.detail_lines?.length) {
    const lines = item.detail_lines.map(l => ({ ...l }));
    if (isCustomerFsItem(item)) {
      return lines.filter(l => l.name.trim());
    }
    return lines;
  }
  if (isCustomerFsItem(item)) {
    return [];
  }
  const lines: BriefingFsDetailLine[] = [];
  let order = 0;
  const catalogDetails = item.details?.length
    ? item.details
    : (item.catalog_description ?? item.description ?? '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const sep = line.indexOf(' — ');
          if (sep >= 0) {
            return { name: line.slice(0, sep), description: line.slice(sep + 3) || null };
          }
          return { name: line, description: null };
        });
  for (const d of catalogDetails) {
    lines.push({
      source: 'nsi',
      name: d.name,
      description: d.description,
      inactive: false,
      nsi_name: d.name,
      nsi_description: d.description,
      sort_order: order++,
    });
  }
  for (const c of item.custom_lines ?? []) {
    lines.push({
      source: 'customer',
      name: c.name,
      description: c.description ?? null,
      inactive: false,
      sort_order: order++,
    });
  }
  return lines;
}

export default function FsItemCardModal({
  item,
  moveTargets,
  fsTrace,
  onClose,
  onSave,
  onMoveCustomerLine,
}: {
  item: BriefingFsSel;
  moveTargets: { fs_item_id: number; label: string; group: string }[];
  fsTrace?: { customTexts: string[]; solutionNames: string[] };
  onClose: () => void;
  onSave: (patch: Partial<BriefingFsSel>) => void;
  onMoveCustomerLine: (
    line: BriefingFsDetailLine,
    remainingSourceLines: BriefingFsDetailLine[],
    targetFsItemId: number,
  ) => void;
}) {
  const customerItem = isCustomerFsItem(item);
  const [name, setName] = useState(item.name ?? '');
  const [breakdown, setBreakdown] = useState(() => initialCustomerBreakdown(item));
  const [detailLines, setDetailLines] = useState<BriefingFsDetailLine[]>(
    () => buildInitialDetailLines(item),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function addDetailLine() {
    setDetailLines(prev => [
      ...prev,
      {
        source: 'customer',
        name: '',
        description: null,
        inactive: false,
        sort_order: prev.length,
      },
    ]);
  }

  function updateLine(idx: number, patch: Partial<BriefingFsDetailLine>) {
    setDetailLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLine(idx: number) {
    setDetailLines(prev => prev.filter((_, i) => i !== idx));
  }

  function revertLine(idx: number) {
    setDetailLines(prev => prev.map((l, i) => {
      if (i !== idx || l.source !== 'nsi') return l;
      return {
        ...l,
        name: l.nsi_name ?? l.name,
        description: l.nsi_description ?? null,
        inactive: false,
      };
    }));
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (customerItem && !trimmedName) return;
    onSave({
      ...(customerItem ? { name: trimmedName, description: breakdown.trim() || null } : {}),
      detail_lines: detailLines
        .filter(l => l.name.trim())
        .map((l, i) => ({
          ...l,
          source: customerItem ? 'customer' as const : l.source,
          name: l.name.trim(),
          description: l.description?.trim() || null,
          sort_order: i,
        })),
    });
    onClose();
  }

  function handleMoveLine(idx: number, targetFsItemId: number) {
    const line = detailLines[idx];
    if (!line || line.source !== 'customer' || !line.name.trim()) return;
    const remaining = detailLines
      .filter((_, i) => i !== idx)
      .map((l, i) => ({ ...l, sort_order: i }));
    onMoveCustomerLine(
      { ...line, name: line.name.trim(), description: line.description?.trim() || null },
      remaining,
      targetFsItemId,
    );
  }

  const targetsByGroup = moveTargets.reduce<Map<string, typeof moveTargets>>((acc, t) => {
    const list = acc.get(t.group) ?? [];
    list.push(t);
    acc.set(t.group, list);
    return acc;
  }, new Map());

  const spLabel = item.catalog_story_points ?? item.story_points ?? '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
          <div className="min-w-0 flex-1">
            {customerItem ? (
              <input
                type="text"
                className="w-full text-sm font-semibold text-slate-800 border border-emerald-200 rounded px-2 py-1"
                placeholder="Формулировка функции для заказчика"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            ) : (
              <div className="text-sm font-semibold text-slate-800 truncate">
                {item.prefix ? `${item.prefix} · ` : ''}{item.name}
              </div>
            )}
            <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
              {customerItem && (
                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  Функция заказчика
                </span>
              )}
              <span>
                {item.func_type || '—'} · {customerItem ? 'SP' : 'НСИ SP'} {spLabel}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Расшифровка</h3>
              {!customerItem && (
                <button type="button" onClick={addDetailLine} className="text-xs text-blue-600 hover:underline">+ Добавить подпункт</button>
              )}
              {customerItem && (
                <button type="button" onClick={addDetailLine} className="text-xs text-blue-600 hover:underline">+ Подпункт</button>
              )}
            </div>
            {customerItem ? (
              <>
                <textarea
                  className="w-full text-xs border border-slate-200 rounded px-2 py-2 min-h-[8rem] bg-white"
                  placeholder="Подробное описание функции для заказчика"
                  value={breakdown}
                  onChange={e => setBreakdown(e.target.value)}
                />
                {detailLines.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {detailLines.map((line, idx) => (
                      <div key={idx} className="border rounded p-2 space-y-1.5 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                          <input
                            className="flex-1 text-xs border rounded px-2 py-1 bg-white"
                            placeholder="Название подпункта"
                            value={line.name}
                            onChange={e => updateLine(idx, { name: e.target.value })}
                          />
                          <button type="button" onClick={() => removeLine(idx)} className="text-[10px] text-red-500 hover:underline shrink-0">Удалить</button>
                        </div>
                        <textarea
                          className="w-full text-xs border rounded px-2 py-1 min-h-[3rem] bg-white"
                          placeholder="Описание подпункта"
                          value={line.description ?? ''}
                          onChange={e => updateLine(idx, { description: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : detailLines.length === 0 ? (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded p-3 border border-slate-100">Нет подпунктов расшифровки</p>
            ) : (
              <div className="space-y-2">
                {detailLines.map((line, idx) => (
                  <div key={idx} className="border rounded p-2 space-y-1.5 bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      {line.source === 'customer' && (
                        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                          Заказчик
                        </span>
                      )}
                      <input
                        className="flex-1 text-xs border rounded px-2 py-1 bg-white"
                        placeholder="Название подпункта"
                        value={line.name}
                        onChange={e => updateLine(idx, { name: e.target.value })}
                      />
                      {line.source === 'customer' && (
                        <>
                          <button type="button" onClick={() => removeLine(idx)} className="text-[10px] text-red-500 hover:underline shrink-0">Удалить</button>
                          {!customerItem && moveTargets.length > 0 && (
                            <select
                              className="text-[10px] border rounded px-1 py-0.5 max-w-[7rem] shrink-0"
                              defaultValue=""
                              title="Перенести подпункт в другой пункт ФС"
                              onChange={e => {
                                const targetId = Number(e.target.value);
                                if (!targetId) return;
                                handleMoveLine(idx, targetId);
                                e.currentTarget.value = '';
                              }}
                            >
                              <option value="">Перенести…</option>
                              {[...targetsByGroup.entries()].map(([group, opts]) => (
                                <optgroup key={group} label={group}>
                                  {opts.map(opt => (
                                    <option key={opt.fs_item_id} value={opt.fs_item_id}>{opt.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          )}
                        </>
                      )}
                    </div>
                    <textarea
                      className="w-full text-xs border rounded px-2 py-1 min-h-[3rem] bg-white"
                      placeholder="Описание"
                      value={line.description ?? ''}
                      onChange={e => updateLine(idx, { description: e.target.value })}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={line.inactive}
                          onChange={e => updateLine(idx, { inactive: e.target.checked })}
                        />
                        Не актуален
                      </label>
                      {line.source === 'nsi' && isNsiLineModified(line) && (
                        <button
                          type="button"
                          onClick={() => revertLine(idx)}
                          className="text-[10px] text-blue-600 hover:underline"
                          title="Восстановить значения из снимка НСИ"
                        >
                          Вернуть НСИ
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!customerItem && (
              <p className="text-[10px] text-slate-400 mt-2">«Вернуть НСИ» восстанавливает название и описание из снимка справочника на момент оценки.</p>
            )}
          </section>

          {!customerItem && (item.matched_widgets ?? []).length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Виджеты</h3>
              <ul className="text-xs text-slate-600 space-y-1">
                {item.matched_widgets!.map(w => (
                  <li key={w.id} className="flex items-center gap-2">
                    <WidgetImageThumbnail
                      imagePath={w.image_path}
                      name={w.name}
                      className="w-10 h-7 object-contain bg-white border border-slate-100 rounded shrink-0 cursor-pointer hover:border-slate-400"
                    />
                    <span>{w.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {fsTrace && (fsTrace.customTexts.length > 0 || fsTrace.solutionNames.length > 0) && (
            <section className="border border-slate-100 rounded-lg p-3 bg-slate-50/80">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Источник в брифинге
              </h3>
              {fsTrace.customTexts.map(text => (
                <div key={text} className="text-xs text-slate-700 italic mb-1">
                  Проблематика заказчика: «{text}»
                </div>
              ))}
              {fsTrace.solutionNames.length > 0 && (
                <div className="text-xs text-slate-600">
                  Решения: {fsTrace.solutionNames.join('; ')}
                </div>
              )}
            </section>
          )}

        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600">Отмена</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={customerItem && !name.trim()}
            className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
