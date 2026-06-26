import React, { useState, useCallback } from 'react';
import type { ProjectRow, Constants, BaseWork, RefType } from '../types';
import { addRow, updateRow, deleteRow, reorderRows } from '../api';
import { calcRow, fmt } from '../utils/calc';
import ReferenceSelector from './ReferenceSelector';

interface Props {
  projectId: number;
  rows: ProjectRow[];
  consts: Constants;
  baseWorks: BaseWork[];
  etaps: string[];
  currentUserId: number | null;
  onRowsChange: (rows: ProjectRow[]) => void;
}

interface RefModal {
  rowId: number;
  field: 'рамки' | 'результаты' | 'отчет_doc';
  workName: string;
}

const ROLES: { key: keyof ProjectRow; label: string }[] = [
  { key: 'загрузка_рп',          label: 'РП'   },
  { key: 'загрузка_аналит_конс', label: 'АнК'  },
  { key: 'загрузка_аналит_эксп', label: 'АнЭ'  },
  { key: 'загрузка_архит',       label: 'Арх'  },
  { key: 'загрузка_програм1',    label: 'Пр1'  },
  { key: 'загрузка_програм2',    label: 'Пр2'  },
  { key: 'загрузка_куратор',     label: 'Кур'  },
];

export default function WorkTable({ projectId, rows, consts, baseWorks, etaps, currentUserId, onRowsChange }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [refModal, setRefModal] = useState<RefModal | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // Оптимистичное обновление: меняем ячейку немедленно, сохраняем на сервер
  const handleCellChange = useCallback(async (rowId: number, field: keyof ProjectRow, value: number | string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    const patch = { [field]: value };
    const merged = { ...row, ...patch };
    const calc = calcRow(merged, consts);
    const updated = { ...merged, ...calc } as ProjectRow;

    onRowsChange(rows.map(r => r.id === rowId ? updated : r));
    await updateRow(rowId, { ...patch, ...calc, user_id: currentUserId ?? undefined });
  }, [rows, consts, currentUserId, onRowsChange]);

  async function handleAddFromCatalog(bw: BaseWork) {
    const newRow = await addRow(projectId, {
      этап: bw.этап, работа: bw.работа, исполнитель: 'ITLand/Заказчик',
      рамки: bw.рамки, результаты: bw.результат, отчет_doc: bw.отчет_doc,
      длит_трудоемк: bw.длит_трудоемк, риск_этапа: bw.риск_этапа,
      загрузка_рп: bw.загрузка_рп, загрузка_аналит_конс: bw.загрузка_аналит_конс,
      загрузка_аналит_эксп: bw.загрузка_аналит_эксп, загрузка_архит: bw.загрузка_архит,
      загрузка_програм1: bw.загрузка_програм1, загрузка_програм2: bw.загрузка_програм2,
      загрузка_куратор: bw.загрузка_куратор,
      user_id: currentUserId ?? undefined,
    });
    onRowsChange([...rows, newRow]);
    setCatalogOpen(false);
  }

  async function handleAddEmpty() {
    const newRow = await addRow(projectId, { этап: etaps[0] ?? '', user_id: currentUserId ?? undefined });
    onRowsChange([...rows, newRow]);
  }

  async function handleDelete(rowId: number) {
    if (!confirm('Удалить строку?')) return;
    await deleteRow(rowId, currentUserId ?? undefined);
    onRowsChange(rows.filter(r => r.id !== rowId));
    if (expandedId === rowId) setExpandedId(null);
  }

  // Drag & drop для пересортировки
  function handleDragStart(rowId: number) { setDraggingId(rowId); }
  function handleDragOver(e: React.DragEvent, rowId: number) { e.preventDefault(); setDragOverId(rowId); }
  async function handleDrop(targetId: number) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const ids = rows.map(r => r.id);
    const fromIdx = ids.indexOf(draggingId);
    const toIdx   = ids.indexOf(targetId);
    const reordered = [...rows];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    onRowsChange(reordered);
    await reorderRows(projectId, reordered.map(r => r.id));
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleRefSelect(content: string) {
    if (!refModal) return;
    const field = refModal.field as keyof ProjectRow;
    handleCellChange(refModal.rowId, field, content);
    setRefModal(null);
  }

  const totals = rows.reduce((acc, r) => ({
    часы:    acc.часы    + r.трудозатраты_итог,
    фонд:    acc.фонд    + r.фонд_компании,
    усн:     acc.усн     + r.бюджет_усн,
    кп:      acc.кп      + r.бюджет_кп,
    сриск:   acc.сриск   + r.бюджет_с_рисками,
  }), { часы: 0, фонд: 0, усн: 0, кп: 0, сриск: 0 });

  return (
    <div className="flex flex-col h-full">
      {/* Тулбар */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-white">
        <button
          onClick={handleAddEmpty}
          className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600"
        >
          + Добавить строку
        </button>
        <button
          onClick={() => setCatalogOpen(!catalogOpen)}
          className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50"
        >
          📋 Из каталога
        </button>
        <div className="ml-auto flex gap-4 text-xs text-slate-500">
          <span>Часов: <b>{fmt(totals.часы)}</b></span>
          <span>УСН: <b>{fmt(totals.усн)} ₽</b></span>
          <span>КП: <b>{fmt(totals.кп)} ₽</b></span>
          <span>С рисками: <b>{fmt(totals.сриск)} ₽</b></span>
        </div>
      </div>

      {/* Каталог */}
      {catalogOpen && (
        <div className="bg-slate-50 border-b border-slate-200 p-3 max-h-56 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 mb-2">Каталог типовых работ</div>
          <div className="grid grid-cols-2 gap-1">
            {baseWorks.map(bw => (
              <button
                key={bw.id}
                onClick={() => handleAddFromCatalog(bw)}
                className="text-left text-xs border border-slate-200 bg-white rounded px-2 py-1.5 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="text-slate-700 font-medium truncate">{bw.работа}</div>
                <div className="text-slate-400 truncate">{bw.этап} · {bw.длит_трудоемк} дн.</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="flex-1 overflow-auto table-scroll">
        <table className="min-w-full text-xs border-collapse">
          <thead className="bg-slate-100 sticky top-0 z-20">
            <tr>
              <th className="w-6 px-1 py-2 text-slate-400 font-normal">#</th>
              <th className="sticky left-0 z-30 bg-slate-100 w-32 min-w-32 px-2 py-2 text-left text-slate-600 font-semibold border-r border-slate-200">Этап</th>
              <th className="sticky left-32 z-30 bg-slate-100 w-44 min-w-44 px-2 py-2 text-left text-slate-600 font-semibold border-r border-slate-200">Работа</th>
              <th className="w-12 px-1 py-2 text-slate-600 font-semibold text-right">Дн.</th>
              {ROLES.map(r => (
                <th key={r.key} className="w-10 px-1 py-2 text-slate-500 font-semibold text-right" title={r.key}>{r.label}%</th>
              ))}
              <th className="w-14 px-2 py-2 text-right text-slate-600 font-semibold bg-blue-50">Часы</th>
              <th className="w-20 px-2 py-2 text-right text-slate-600 font-semibold">Фонд</th>
              <th className="w-20 px-2 py-2 text-right text-slate-600 font-semibold">УСН</th>
              <th className="w-20 px-2 py-2 text-right text-slate-600 font-semibold">КП</th>
              <th className="w-22 px-2 py-2 text-right text-slate-600 font-semibold">С рисками</th>
              <th className="w-10 px-1 py-2 text-right text-slate-500 font-semibold">Риск%</th>
              <th className="w-8 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <React.Fragment key={row.id}>
                <tr
                  draggable
                  onDragStart={() => handleDragStart(row.id)}
                  onDragOver={e => handleDragOver(e, row.id)}
                  onDrop={() => handleDrop(row.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                  className={`border-b border-slate-100 cursor-pointer
                    ${expandedId === row.id ? 'selected' : ''}
                    ${draggingId === row.id ? 'opacity-40' : ''}
                    ${dragOverId === row.id && draggingId !== row.id ? 'border-t-2 border-t-blue-400' : ''}
                  `}
                  onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                >
                  <td className="px-1 py-1.5 text-center text-slate-300 select-none">{idx + 1}</td>

                  {/* Этап - sticky */}
                  <td className="sticky left-0 z-10 bg-inherit border-r border-slate-100 px-1 py-1">
                    <select
                      value={row.этап}
                      onClick={e => e.stopPropagation()}
                      onChange={e => handleCellChange(row.id, 'этап', e.target.value)}
                      className="w-full text-xs bg-transparent border-0 outline-none cursor-pointer text-slate-700 truncate"
                    >
                      {etaps.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </td>

                  {/* Работа - sticky */}
                  <td className="sticky left-32 z-10 bg-inherit border-r border-slate-100 px-1 py-1">
                    <input
                      value={row.работа}
                      onClick={e => e.stopPropagation()}
                      onChange={e => handleCellChange(row.id, 'работа', e.target.value)}
                      className="w-full text-xs bg-transparent border-0 outline-none text-slate-800 font-medium"
                      placeholder="Название работы"
                    />
                  </td>

                  {/* Длительность */}
                  <td className="px-1 py-1">
                    <input
                      type="number" min="0" step="0.5"
                      value={row.длит_трудоемк}
                      onClick={e => e.stopPropagation()}
                      onChange={e => handleCellChange(row.id, 'длит_трудоемк', Number(e.target.value))}
                      className="cell-input w-12"
                    />
                  </td>

                  {/* Загрузки ролей */}
                  {ROLES.map(role => (
                    <td key={role.key} className="px-0.5 py-1">
                      <input
                        type="number" min="0" max="200" step="5"
                        value={row[role.key] as number}
                        onClick={e => e.stopPropagation()}
                        onChange={e => handleCellChange(row.id, role.key, Number(e.target.value))}
                        className="cell-input w-10"
                      />
                    </td>
                  ))}

                  {/* Расчётные */}
                  <td className="px-2 py-1 text-right font-medium text-blue-700 bg-blue-50/50">{fmt(row.трудозатраты_итог)}</td>
                  <td className="px-2 py-1 text-right text-slate-600">{fmt(row.фонд_компании)}</td>
                  <td className="px-2 py-1 text-right text-slate-700">{fmt(row.бюджет_усн)}</td>
                  <td className="px-2 py-1 text-right text-slate-700">{fmt(row.бюджет_кп)}</td>
                  <td className="px-2 py-1 text-right font-medium text-emerald-700">{fmt(row.бюджет_с_рисками)}</td>

                  {/* Риск */}
                  <td className="px-1 py-1">
                    <input
                      type="number" min="0" max="1" step="0.05"
                      value={row.риск_этапа}
                      onClick={e => e.stopPropagation()}
                      onChange={e => handleCellChange(row.id, 'риск_этапа', Number(e.target.value))}
                      className="cell-input w-10"
                    />
                  </td>

                  {/* Удалить */}
                  <td className="px-1 py-1 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(row.id); }}
                      className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded px-1 leading-none"
                      title="Удалить строку"
                    >
                      ✕
                    </button>
                  </td>
                </tr>

                {/* Развернутая панель */}
                {expandedId === row.id && (
                  <tr className="bg-blue-50/40">
                    <td colSpan={17} className="px-4 py-3">
                      <div className="grid grid-cols-3 gap-4">
                        {/* Рамки */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <label className="text-xs font-semibold text-slate-500">Рамки</label>
                            <button
                              onClick={() => setRefModal({ rowId: row.id, field: 'рамки', workName: row.работа })}
                              className="text-[11px] text-blue-400 hover:text-blue-600"
                            >
                              📚 из справочника
                            </button>
                          </div>
                          <textarea
                            value={row.рамки}
                            onChange={e => handleCellChange(row.id, 'рамки', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded p-2 outline-none focus:border-blue-300 resize-none h-24 bg-white"
                            placeholder="Описание рамок работы..."
                          />
                        </div>

                        {/* Результаты */}
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <label className="text-xs font-semibold text-slate-500">Результаты</label>
                            <button
                              onClick={() => setRefModal({ rowId: row.id, field: 'результаты', workName: row.работа })}
                              className="text-[11px] text-blue-400 hover:text-blue-600"
                            >
                              📚 из справочника
                            </button>
                          </div>
                          <textarea
                            value={row.результаты}
                            onChange={e => handleCellChange(row.id, 'результаты', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded p-2 outline-none focus:border-blue-300 resize-none h-24 bg-white"
                            placeholder="Результаты работы..."
                          />
                        </div>

                        {/* Документ + доп. поля */}
                        <div className="space-y-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <label className="text-xs font-semibold text-slate-500">Документ/Отчёт</label>
                              <button
                                onClick={() => setRefModal({ rowId: row.id, field: 'отчет_doc', workName: row.работа })}
                                className="text-[11px] text-blue-400 hover:text-blue-600"
                              >
                                📚
                              </button>
                            </div>
                            <input
                              value={row.отчет_doc}
                              onChange={e => handleCellChange(row.id, 'отчет_doc', e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-300 bg-white"
                              placeholder="Название документа"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-500">Исполнитель</label>
                            <input
                              value={row.исполнитель}
                              onChange={e => handleCellChange(row.id, 'исполнитель', e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-300 bg-white mt-1"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs font-semibold text-slate-500 block">Согл. заказчика (нед.)</label>
                              <input type="number" min="0"
                                value={row.согл_заказчика}
                                onChange={e => handleCellChange(row.id, 'согл_заказчика', Number(e.target.value))}
                                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-300 bg-white mt-1"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-slate-500 block">Компенс. продаж (₽)</label>
                              <input type="number" min="0"
                                value={row.компенсация_продаж}
                                onChange={e => handleCellChange(row.id, 'компенсация_продаж', Number(e.target.value))}
                                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 outline-none focus:border-blue-300 bg-white mt-1"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}

            {/* Итоговая строка */}
            {rows.length > 0 && (
              <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300 sticky bottom-0">
                <td></td>
                <td colSpan={2} className="sticky left-0 bg-slate-100 px-2 py-2 border-r border-slate-200 text-slate-600">ИТОГО</td>
                <td colSpan={8}></td>
                <td className="px-2 py-2 text-right text-blue-700 bg-blue-50">{fmt(totals.часы)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.фонд)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.усн)}</td>
                <td className="px-2 py-2 text-right">{fmt(totals.кп)}</td>
                <td className="px-2 py-2 text-right text-emerald-700">{fmt(totals.сриск)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-300">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm">Добавьте работы из каталога или вручную</div>
          </div>
        )}
      </div>

      {/* Модал справочника */}
      {refModal && (
        <ReferenceSelector
          refType={refModal.field === 'отчет_doc' ? 'документ' : refModal.field as RefType}
          workName={refModal.workName}
          currentUserId={currentUserId}
          onSelect={handleRefSelect}
          onClose={() => setRefModal(null)}
        />
      )}
    </div>
  );
}
