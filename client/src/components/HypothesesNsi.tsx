import React, { useEffect, useState } from 'react';
import type { HypothesisDetail, HypothesisListItem, HypothesisProblemDraft, Problem, Solution } from '../types';
import HypothesisCardModal from './HypothesisCardModal';
import HypothesisLeanCanvas, { type HypothesisSavePayload } from './HypothesisLeanCanvas';

type ViewMode = 'table' | 'canvas';

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
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [card, setCard] = useState<HypothesisDetail | null>(null);
  const [canvasDetail, setCanvasDetail] = useState<HypothesisDetail | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (viewMode !== 'canvas' || !selectedId) {
      setCanvasDetail(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    void onOpen(selectedId)
      .then(detail => { if (!cancelled) setCanvasDetail(detail); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [viewMode, selectedId, onOpen]);

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

  async function handleCanvasSave(data: HypothesisSavePayload) {
    if (!selectedId) return;
    await onSave(selectedId, data);
    setCanvasDetail(await onOpen(selectedId));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Справочник гипотез (Lean Canvas). Решения общие для всех гипотез; связь проблематика ↔ решение задаётся у каждой проблематики.
        </p>
        <div className="flex rounded border border-slate-200 overflow-hidden text-xs shrink-0">
          <button
            type="button"
            className={`px-3 py-1 ${viewMode === 'table' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setViewMode('table')}
          >
            Таблица
          </button>
          <button
            type="button"
            className={`px-3 py-1 ${viewMode === 'canvas' ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            onClick={() => setViewMode('canvas')}
          >
            Canvas
          </button>
        </div>
      </div>

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

      {card && viewMode === 'table' && (
        <HypothesisCardModal
          hypothesis={card}
          allProblems={allProblems}
          allSolutions={allSolutions}
          maturityLevels={maturityLevels}
          activityTypes={activityTypes}
          onClose={() => setCard(null)}
          onSave={async data => {
            await onSave(card.id, {
              ...data,
              unique_value_proposition: card.unique_value_proposition,
              key_metrics: card.key_metrics,
              unfair_advantage: card.unfair_advantage,
              channels: card.channels,
              revenue_streams: card.revenue_streams,
              cost_structure: card.cost_structure,
              product: card.product,
              market: card.market,
              alternatives: card.alternatives,
              early_adopters: card.early_adopters,
              triggers: card.triggers,
              segment_ids: card.segments?.map(s => s.id) ?? [],
              stakeholder_roles: (card.stakeholder_roles ?? []).map(r => ({
                stakeholder_role_id: r.id,
                description: r.description,
              })),
            });
            setCard(null);
          }}
          onSolutionCreated={onSolutionCreated}
          onActivityTypeCreated={onActivityTypeCreated}
        />
      )}

      {viewMode === 'table' ? (
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
      ) : (
        <div className="border border-slate-200 rounded-lg p-3 bg-white min-h-[320px]">
          <div className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <label className="text-[10px] text-slate-400 shrink-0">Гипотеза</label>
            <select
              className="text-sm border rounded px-2 py-1 min-w-[200px] flex-1 max-w-md"
              value={selectedId ?? ''}
              onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— выберите —</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          {!selectedId ? (
            <p className="text-sm text-slate-400 text-center py-12">
              Выберите гипотезу в списке выше или в режиме «Таблица»
            </p>
          ) : busy && !canvasDetail ? (
            <p className="text-sm text-slate-400 text-center py-12">Загрузка…</p>
          ) : canvasDetail ? (
            <HypothesisLeanCanvas
              hypothesis={canvasDetail}
              allProblems={allProblems}
              allSolutions={allSolutions}
              maturityLevels={maturityLevels}
              activityTypes={activityTypes}
              allStakeholderRoles={allStakeholderRoles}
              onSave={handleCanvasSave}
              onSolutionCreated={onSolutionCreated}
              onActivityTypeCreated={onActivityTypeCreated}
              onStakeholderRoleCreated={onStakeholderRoleCreated}
            />
          ) : (
            <p className="text-sm text-red-400 text-center py-12">Не удалось загрузить гипотезу</p>
          )}
        </div>
      )}
    </div>
  );
}
