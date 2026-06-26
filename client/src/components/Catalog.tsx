import React, { useState, useEffect } from 'react';
import type { BaseWork } from '../types';
import type { Etap } from '../api';
import {
  getEtaps, createEtap, updateEtap, deleteEtap, reorderEtaps,
  getBaseWorks, createBaseWork, updateBaseWork, deleteBaseWork,
} from '../api';

const ROLES: { key: keyof BaseWork; label: string; full: string }[] = [
  { key: 'загрузка_рп',          label: 'РП',  full: 'Рук. проекта' },
  { key: 'загрузка_аналит_конс', label: 'АнК', full: 'Аналитик-консультант' },
  { key: 'загрузка_аналит_эксп', label: 'АнЭ', full: 'Аналитик-эксперт' },
  { key: 'загрузка_архит',       label: 'Арх', full: 'Архитектор' },
  { key: 'загрузка_програм1',    label: 'Пр1', full: 'Программист 1' },
  { key: 'загрузка_програм2',    label: 'Пр2', full: 'Программист 2' },
  { key: 'загрузка_куратор',     label: 'Кур', full: 'Куратор' },
];

// Форма работы (добавление / редактирование)
interface WorkFormProps {
  initial?: Partial<BaseWork>;
  etaps: Etap[];
  defaultEtap?: string;
  onSave: (data: Partial<BaseWork>) => void;
  onCancel: () => void;
}

function WorkForm({ initial, etaps, defaultEtap, onSave, onCancel }: WorkFormProps) {
  const [d, setD] = useState<Partial<BaseWork>>({
    этап: defaultEtap ?? etaps[0]?.name ?? '',
    работа: '',
    рамки: '',
    результат: '',
    отчет_doc: '',
    длит_трудоемк: 0,
    риск_этапа: 0,
    загрузка_рп: 0,
    загрузка_аналит_конс: 0,
    загрузка_аналит_эксп: 0,
    загрузка_архит: 0,
    загрузка_програм1: 0,
    загрузка_програм2: 0,
    загрузка_куратор: 0,
    ...initial,
  });

  const set = (k: keyof BaseWork, v: string | number) => setD(prev => ({ ...prev, [k]: v }));

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/40 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Этап */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Этап *</label>
          <select
            value={d.этап}
            onChange={e => set('этап', e.target.value)}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white"
          >
            {etaps.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
        </div>
        {/* Название */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Название работы *</label>
          <input
            value={d.работа}
            onChange={e => set('работа', e.target.value)}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white"
            placeholder="Например: Анализ требований"
          />
        </div>
      </div>

      {/* Числовые параметры */}
      <div className="grid grid-cols-9 gap-2">
        <div className="col-span-1">
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">Дней</label>
          <input type="number" min="0" step="0.5"
            value={d.длит_трудоемк}
            onChange={e => set('длит_трудоемк', Number(e.target.value))}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white text-right"
          />
        </div>
        <div className="col-span-1">
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">Риск</label>
          <input type="number" min="0" max="1" step="0.05"
            value={d.риск_этапа}
            onChange={e => set('риск_этапа', Number(e.target.value))}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white text-right"
          />
        </div>
        {ROLES.map(r => (
          <div key={r.key} className="col-span-1">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1" title={r.full}>{r.label}%</label>
            <input type="number" min="0" max="200" step="5"
              value={d[r.key] as number ?? 0}
              onChange={e => set(r.key, Number(e.target.value))}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white text-right"
            />
          </div>
        ))}
      </div>

      {/* Текстовые поля */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Рамки</label>
          <textarea
            value={d.рамки}
            onChange={e => set('рамки', e.target.value)}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white resize-none h-20"
            placeholder="Описание рамок..."
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Результат</label>
          <textarea
            value={d.результат}
            onChange={e => set('результат', e.target.value)}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white resize-none h-20"
            placeholder="Ожидаемый результат..."
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1">Документ / Отчёт</label>
          <input
            value={d.отчет_doc}
            onChange={e => set('отчет_doc', e.target.value)}
            className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 bg-white"
            placeholder="Название документа"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5">Отмена</button>
        <button
          onClick={() => { if (d.работа?.trim() && d.этап) onSave(d); }}
          className="text-xs bg-blue-500 text-white px-4 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-40"
          disabled={!d.работа?.trim()}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ── Основной компонент ──────────────────────────────────────────
export default function Catalog() {
  const [etaps, setEtaps]         = useState<Etap[]>([]);
  const [works, setWorks]         = useState<BaseWork[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editWorkId, setEditWorkId] = useState<string | null>(null);
  const [addingWorkInEtap, setAddingWorkInEtap] = useState<string | null>(null);
  const [editEtapId, setEditEtapId] = useState<number | null>(null);
  const [newEtapName, setNewEtapName] = useState('');
  const [addingEtap, setAddingEtap] = useState(false);
  const [dragEtapId, setDragEtapId] = useState<number | null>(null);
  const [dragOverEtapId, setDragOverEtapId] = useState<number | null>(null);

  async function load() {
    const [e, w] = await Promise.all([getEtaps(), getBaseWorks()]);
    setEtaps(e);
    setWorks(w);
  }

  useEffect(() => { load(); }, []);

  function toggleCollapse(etapName: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(etapName) ? next.delete(etapName) : next.add(etapName);
      return next;
    });
  }

  // Drag этапов
  async function handleEtapDrop(targetId: number) {
    if (!dragEtapId || dragEtapId === targetId) { setDragEtapId(null); setDragOverEtapId(null); return; }
    const ids = etaps.map(e => e.id);
    const fromIdx = ids.indexOf(dragEtapId);
    const toIdx   = ids.indexOf(targetId);
    const reordered = [...etaps];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setEtaps(reordered);
    await reorderEtaps(reordered.map(e => e.id));
    setDragEtapId(null);
    setDragOverEtapId(null);
  }

  async function handleSaveWork(data: Partial<BaseWork>, existingId?: string) {
    if (existingId) {
      const updated = await updateBaseWork(existingId, data);
      setWorks(prev => prev.map(w => w.id === existingId ? updated : w));
    } else {
      const created = await createBaseWork(data);
      setWorks(prev => [...prev, created]);
    }
    setEditWorkId(null);
    setAddingWorkInEtap(null);
  }

  async function handleDeleteWork(id: string) {
    if (!confirm('Удалить работу из каталога?')) return;
    await deleteBaseWork(id);
    setWorks(prev => prev.filter(w => w.id !== id));
  }

  async function handleAddEtap() {
    const name = newEtapName.trim();
    if (!name) return;
    const etap = await createEtap(name);
    setEtaps(prev => [...prev, etap]);
    setNewEtapName('');
    setAddingEtap(false);
  }

  async function handleRenameEtap(id: number, name: string) {
    const oldName = etaps.find(e => e.id === id)?.name ?? '';
    await updateEtap(id, { name });
    setEtaps(prev => prev.map(e => e.id === id ? { ...e, name } : e));
    // Обновляем ссылки в работах
    setWorks(prev => prev.map(w => w.этап === oldName ? { ...w, этап: name } : w));
    setEditEtapId(null);
  }

  async function handleDeleteEtap(id: number) {
    try {
      await deleteEtap(id);
      setEtaps(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      alert(err.message || 'Нельзя удалить этап');
    }
  }

  // Группируем работы по этапам
  const worksByEtap = etaps.reduce<Record<string, BaseWork[]>>((acc, e) => {
    acc[e.name] = works.filter(w => w.этап === e.name);
    return acc;
  }, {});

  // Работы без известного этапа (вдруг есть)
  const knownEtapNames = new Set(etaps.map(e => e.name));
  const orphanWorks = works.filter(w => !knownEtapNames.has(w.этап));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Заголовок */}
      <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-slate-700">Каталог работ</h2>
        <span className="text-xs text-slate-400">{works.length} работ · {etaps.length} этапов</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {etaps.map(etap => {
          const etapWorks = worksByEtap[etap.name] ?? [];
          const isCollapsed = collapsed.has(etap.name);

          return (
            <div
              key={etap.id}
              draggable
              onDragStart={() => setDragEtapId(etap.id)}
              onDragOver={e => { e.preventDefault(); setDragOverEtapId(etap.id); }}
              onDrop={() => handleEtapDrop(etap.id)}
              onDragEnd={() => { setDragEtapId(null); setDragOverEtapId(null); }}
              className={`rounded-xl border bg-white shadow-sm transition-all
                ${dragOverEtapId === etap.id && dragEtapId !== etap.id ? 'border-blue-400 ring-1 ring-blue-300' : 'border-slate-100'}
                ${dragEtapId === etap.id ? 'opacity-40' : ''}
              `}
            >
              {/* Заголовок этапа */}
              <div className="flex items-center gap-2 px-3 py-2.5 group">
                <span className="text-slate-300 cursor-grab text-sm select-none">⠿</span>

                <button
                  onClick={() => toggleCollapse(etap.name)}
                  className="text-slate-400 hover:text-slate-600 w-4 text-xs leading-none"
                >
                  {isCollapsed ? '▶' : '▼'}
                </button>

                {editEtapId === etap.id ? (
                  <form className="flex-1 flex gap-2" onSubmit={e => { e.preventDefault(); handleRenameEtap(etap.id, (e.currentTarget.querySelector('input') as HTMLInputElement).value); }}>
                    <input
                      autoFocus
                      defaultValue={etap.name}
                      className="flex-1 text-sm border border-blue-300 rounded px-2 py-0.5 outline-none"
                      onKeyDown={e => { if (e.key === 'Escape') setEditEtapId(null); }}
                    />
                    <button type="submit" className="text-xs text-blue-500 hover:text-blue-700">OK</button>
                    <button type="button" onClick={() => setEditEtapId(null)} className="text-xs text-slate-400">✕</button>
                  </form>
                ) : (
                  <span
                    className="flex-1 text-sm font-semibold text-slate-700 cursor-pointer"
                    onClick={() => toggleCollapse(etap.name)}
                  >
                    {etap.name}
                  </span>
                )}

                <span className="text-xs text-slate-300 group-hover:text-slate-400 mr-1">{etapWorks.length} работ</span>

                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={() => setAddingWorkInEtap(etap.name)}
                    className="text-xs text-blue-400 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50"
                    title="Добавить работу"
                  >
                    + работа
                  </button>
                  <button
                    onClick={() => { setEditEtapId(etap.id); setEditWorkId(null); setAddingWorkInEtap(null); }}
                    className="text-xs text-slate-300 hover:text-slate-500 px-1"
                    title="Переименовать этап"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteEtap(etap.id)}
                    className="text-xs text-slate-200 hover:text-red-400 px-1"
                    title="Удалить этап"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Форма добавления работы */}
              {!isCollapsed && addingWorkInEtap === etap.name && (
                <div className="px-3 pb-3">
                  <WorkForm
                    etaps={etaps}
                    defaultEtap={etap.name}
                    onSave={data => handleSaveWork(data)}
                    onCancel={() => setAddingWorkInEtap(null)}
                  />
                </div>
              )}

              {/* Список работ */}
              {!isCollapsed && etapWorks.length === 0 && addingWorkInEtap !== etap.name && (
                <div className="px-4 pb-3 text-xs text-slate-300 italic">
                  Нет работ —{' '}
                  <button onClick={() => setAddingWorkInEtap(etap.name)} className="text-blue-400 hover:underline">добавить</button>
                </div>
              )}

              {!isCollapsed && etapWorks.map(work => (
                <div key={work.id} className="border-t border-slate-50">
                  {editWorkId === work.id ? (
                    <div className="px-3 py-3">
                      <WorkForm
                        initial={work}
                        etaps={etaps}
                        onSave={data => handleSaveWork(data, work.id)}
                        onCancel={() => setEditWorkId(null)}
                      />
                    </div>
                  ) : (
                    <div className="group flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                      {/* Загрузки ролей */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs text-slate-800 mb-1">{work.работа}</div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                          {work.длит_трудоемк > 0 && (
                            <span className="text-blue-500 font-medium">{work.длит_трудоемк} дн.</span>
                          )}
                          {work.риск_этапа > 0 && (
                            <span className="text-orange-400">риск {Math.round(work.риск_этапа * 100)}%</span>
                          )}
                          {ROLES.filter(r => (work[r.key] as number) > 0).map(r => (
                            <span key={r.key}>{r.label}: {work[r.key] as number}%</span>
                          ))}
                        </div>
                        {work.результат && (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate" title={work.результат}>
                            → {work.результат}
                          </div>
                        )}
                      </div>

                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditWorkId(work.id); setAddingWorkInEtap(null); }}
                          className="text-xs text-slate-300 hover:text-blue-500 px-1.5 py-0.5 rounded hover:bg-blue-50"
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteWork(work.id)}
                          className="text-xs text-slate-200 hover:text-red-400 px-1"
                          title="Удалить"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Работы без этапа */}
        {orphanWorks.length > 0 && (
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-3">
            <div className="text-xs font-semibold text-orange-400 mb-2">⚠ Работы с неизвестным этапом</div>
            {orphanWorks.map(w => (
              <div key={w.id} className="text-xs text-orange-600 py-1 flex justify-between">
                <span>{w.работа} <span className="text-orange-400">({w.этап})</span></span>
                <button onClick={() => handleDeleteWork(w.id)} className="text-orange-300 hover:text-red-400">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Добавить этап */}
        <div className="pt-2">
          {addingEtap ? (
            <div className="flex gap-2">
              <input
                autoFocus
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400 bg-white"
                placeholder="Название нового этапа"
                value={newEtapName}
                onChange={e => setNewEtapName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddEtap(); if (e.key === 'Escape') setAddingEtap(false); }}
              />
              <button onClick={handleAddEtap} className="text-sm bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">OK</button>
              <button onClick={() => setAddingEtap(false)} className="text-sm text-slate-400 hover:text-slate-600 px-2">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingEtap(true)}
              className="w-full text-sm text-slate-400 hover:text-blue-500 py-2.5 border-2 border-dashed border-slate-200 hover:border-blue-300 rounded-xl transition-colors"
            >
              + Добавить этап
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
