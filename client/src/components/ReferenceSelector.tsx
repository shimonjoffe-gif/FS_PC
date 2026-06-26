import React, { useEffect, useState } from 'react';
import type { WorkReference, RefAuthor, RefType } from '../types';
import { getReferences, getRefAuthors, addReference, useReference, deleteReference } from '../api';

interface Props {
  refType: RefType;
  workName: string;
  currentUserId: number | null;
  onSelect: (content: string) => void;
  onClose: () => void;
}

export default function ReferenceSelector({ refType, workName, currentUserId, onSelect, onClose }: Props) {
  const [refs, setRefs] = useState<WorkReference[]>([]);
  const [authors, setAuthors] = useState<RefAuthor[]>([]);
  const [filterAuthor, setFilterAuthor] = useState<number | null | undefined>(undefined); // undefined = все
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);

  const typeLabel: Record<RefType, string> = {
    рамки: 'Рамки',
    результаты: 'Результаты',
    документ: 'Документ',
  };

  async function load() {
    const [r, a] = await Promise.all([
      getReferences(refType, workName, filterAuthor),
      getRefAuthors(refType, workName),
    ]);
    setRefs(r);
    setAuthors(a);
  }

  useEffect(() => { load(); }, [refType, workName, filterAuthor]);

  async function handleSelect(ref: WorkReference) {
    await useReference(ref.id);
    onSelect(ref.content);
    onClose();
  }

  async function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    await addReference({ ref_type: refType, work_name: workName, content: text, author_id: currentUserId ?? undefined });
    setNewText('');
    setAdding(false);
    load();
  }

  async function handleDelete(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Удалить этот вариант?')) return;
    await deleteReference(id);
    load();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <div className="font-semibold text-slate-800">{typeLabel[refType]}</div>
            <div className="text-xs text-slate-400 truncate max-w-xs">{workName}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>

        {/* Фильтр по автору */}
        <div className="px-5 py-2 border-b border-slate-50 flex items-center gap-2">
          <span className="text-xs text-slate-400">Автор:</span>
          <button
            className={`text-xs px-2 py-0.5 rounded ${filterAuthor === undefined ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
            onClick={() => setFilterAuthor(undefined)}
          >
            Все
          </button>
          {authors.map(a => (
            <button
              key={a.author_id}
              className={`text-xs px-2 py-0.5 rounded ${
                filterAuthor === (a.author_id === -1 ? null : a.author_id)
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
              onClick={() => setFilterAuthor(a.author_id === -1 ? null : a.author_id)}
            >
              {a.author_name}
            </button>
          ))}
        </div>

        {/* Список вариантов */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {refs.length === 0 && (
            <div className="text-sm text-slate-300 text-center py-8">Вариантов нет</div>
          )}
          {refs.map(ref => (
            <div
              key={ref.id}
              className="group border border-slate-100 rounded-lg p-3 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
              onClick={() => handleSelect(ref)}
            >
              <div className="flex items-start justify-between gap-2">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap flex-1 font-sans leading-relaxed">
                  {ref.content}
                </pre>
                <button
                  className="hidden group-hover:block text-slate-300 hover:text-red-400 text-xs shrink-0 mt-0.5"
                  onClick={(e) => handleDelete(ref.id, e)}
                  title="Удалить вариант"
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                <span>👤 {ref.author_name}</span>
                <span>использований: {ref.usage_count}</span>
                <span>{new Date(ref.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Добавить новый вариант */}
        <div className="p-3 border-t border-slate-100">
          {adding ? (
            <div>
              <textarea
                autoFocus
                className="w-full text-xs border border-slate-200 rounded-lg p-2 outline-none focus:border-blue-400 resize-none h-24"
                placeholder="Введите текст варианта..."
                value={newText}
                onChange={e => setNewText(e.target.value)}
              />
              <div className="flex gap-2 mt-2 justify-end">
                <button onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1">Отмена</button>
                <button
                  onClick={handleAdd}
                  className="text-xs bg-blue-500 text-white px-4 py-1.5 rounded-lg hover:bg-blue-600"
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full text-xs text-slate-400 hover:text-blue-500 py-2 border border-dashed border-slate-200 rounded-lg hover:border-blue-300"
            >
              + Добавить новый вариант
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
