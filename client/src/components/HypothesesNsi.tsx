import React, { useState } from 'react';
import type { HypothesisDetail, HypothesisListItem, HypothesisProblemDraft, Problem, Solution } from '../types';
import HypothesisCardModal from './HypothesisCardModal';

export default function HypothesesNsi({
  items,
  allProblems,
  allSolutions,
  onCreate,
  onSave,
  onDelete,
  onOpen,
  onSolutionCreated,
  maturityLevels,
  activityTypes,
  onActivityTypeCreated,
}: {
  items: HypothesisListItem[];
  allProblems: Problem[];
  allSolutions: Solution[];
  maturityLevels: import('../types').MaturityLevel[];
  activityTypes: import('../types').ActivityType[];
  onCreate: (name: string) => Promise<HypothesisDetail>;
  onSave: (
    id: number,
    data: {
      name: string;
      target_audience: string | null;
      maturity_id: number | null;
      activity_type_ids: number[];
      problems: HypothesisProblemDraft[];
    },
  ) => Promise<void>;
  onDelete: (id: number, name: string) => Promise<void>;
  onOpen: (id: number) => Promise<HypothesisDetail>;
  onSolutionCreated?: (solution: Solution) => void;
  onActivityTypeCreated?: (type: import('../types').ActivityType) => void;
}) {
  const [card, setCard] = useState<HypothesisDetail | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(trimmed);
      setNewName('');
      setCard(created);
    } finally {
      setBusy(false);
    }
  }

  async function openCard(id: number, loader: (id: number) => Promise<HypothesisDetail>) {
    setBusy(true);
    try {
      setCard(await loader(id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Справочник гипотез (Lean Canvas). Решения общие для всех гипотез; связь проблематика ↔ решение задаётся у каждой проблематики.
      </p>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] text-slate-400">Новая гипотеза</label>
          <input
            className="w-full text-sm border rounded px-2 py-1"
            placeholder="Название"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
          />
        </div>
        <button
          type="button"
          className="text-sm bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
          disabled={busy || !newName.trim()}
          onClick={() => void handleCreate()}
        >
          + Создать
        </button>
      </div>

      {card && (
        <HypothesisCardModal
          hypothesis={card}
          allProblems={allProblems}
          allSolutions={allSolutions}
          maturityLevels={maturityLevels}
          activityTypes={activityTypes}
          onClose={() => setCard(null)}
          onSave={async data => {
            await onSave(card.id, data);
            setCard(null);
          }}
          onSolutionCreated={onSolutionCreated}
          onActivityTypeCreated={onActivityTypeCreated}
        />
      )}

      <div className="overflow-auto border border-slate-200 rounded">
        <table className="w-full text-xs border-collapse min-w-[500px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="text-left p-2 border">Название</th>
              <th className="text-left p-2 border min-w-[160px]">Целевая аудитория</th>
              <th className="text-left p-2 border w-28">Зрелость</th>
              <th className="text-center p-2 border w-20">Виды</th>
              <th className="text-center p-2 border w-24">Проблематик</th>
              <th className="p-2 border w-20" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-400">Нет гипотез</td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-2 border">
                    <button
                      type="button"
                      className="text-left font-medium text-blue-700 hover:underline"
                      onClick={() => void openCard(item.id, onOpen)}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="p-2 border text-slate-500 truncate max-w-xs" title={item.target_audience ?? ''}>
                    {item.target_audience || '—'}
                  </td>
                  <td className="p-2 border text-slate-500 text-[11px]">{item.maturity_name || '—'}</td>
                  <td className="p-2 border text-center tabular-nums">{item.activity_type_count}</td>
                  <td className="p-2 border text-center tabular-nums">{item.problem_count}</td>
                  <td className="p-2 border text-center">
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-600"
                      title="Удалить"
                      onClick={() => void onDelete(item.id, item.name)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
