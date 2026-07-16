import React, { useState } from 'react';
import type { HypothesisDetail, HypothesisListItem, Problem, Solution } from '../types';
import HypothesisCardModal from './HypothesisCardModal';
import type { HypothesisSavePayload } from './HypothesisLeanCanvas';

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
  allStakeholderRoles,
  onActivityTypeCreated,
  onStakeholderRoleCreated,
}: {
  items: HypothesisListItem[];
  allProblems: Problem[];
  allSolutions: Solution[];
  maturityLevels: import('../types').MaturityLevel[];
  activityTypes: import('../types').ActivityType[];
  allStakeholderRoles: import('../types').StakeholderRole[];
  onCreate: (name: string) => Promise<HypothesisDetail>;
  onSave: (id: number, data: HypothesisSavePayload) => Promise<void>;
  onDelete: (id: number, name: string) => Promise<void>;
  onOpen: (id: number) => Promise<HypothesisDetail>;
  onSolutionCreated?: (solution: Solution) => void;
  onActivityTypeCreated?: (type: import('../types').ActivityType) => void;
  onStakeholderRoleCreated?: (role: import('../types').StakeholderRole) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
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
      setSelectedId(created.id);
      setCard(created);
    } finally {
      setBusy(false);
    }
  }

  async function openCard(id: number) {
    setSelectedId(id);
    setBusy(true);
    try {
      setCard(await onOpen(id));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Справочник гипотез (Lean Canvas). Откройте карточку — переключатель «Таблица / Canvas» в шапке.
        Проблемы и решения — независимые списки с нумерацией в рамках LCM; связи M:N — в карточках.
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

      {card ? (
        <HypothesisCardModal
          hypothesis={card}
          allProblems={allProblems}
          allSolutions={allSolutions}
          maturityLevels={maturityLevels}
          activityTypes={activityTypes}
          allStakeholderRoles={allStakeholderRoles}
          onClose={() => setCard(null)}
          onSave={async data => {
            await onSave(card.id, data);
          }}
          onReload={async () => {
            const detail = await onOpen(card.id);
            setCard(detail);
            return detail;
          }}
          onSolutionCreated={onSolutionCreated}
          onActivityTypeCreated={onActivityTypeCreated}
          onStakeholderRoleCreated={onStakeholderRoleCreated}
        />
      ) : null}

      <div className="overflow-auto border border-slate-200 rounded">
        <table className="w-full text-xs border-collapse min-w-[500px]">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="text-left p-2 border">Гипотеза</th>
              <th className="text-left p-2 border min-w-[160px]">Целевая аудитория</th>
              <th className="text-left p-2 border w-28">Зрелость</th>
              <th className="text-left p-2 border min-w-[180px]">Виды деятельности</th>
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
                <tr
                  key={item.id}
                  className={`hover:bg-slate-50 cursor-pointer ${selectedId === item.id ? 'bg-blue-50' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <td className="p-2 border">
                    <button
                      type="button"
                      className="text-left font-medium text-blue-700 hover:underline"
                      onClick={e => { e.stopPropagation(); void openCard(item.id); }}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="p-2 border text-slate-500 truncate max-w-xs" title={item.target_audience ?? ''}>
                    {item.target_audience || '—'}
                  </td>
                  <td className="p-2 border text-slate-500 text-[11px]">{item.maturity_name || '—'}</td>
                  <td className="p-2 border text-slate-500 text-[11px]">{item.activity_type_names || '—'}</td>
                  <td className="p-2 border text-center tabular-nums">{item.problem_count}</td>
                  <td className="p-2 border text-center">
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-600"
                      title="Удалить"
                      onClick={e => { e.stopPropagation(); void onDelete(item.id, item.name); }}
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
