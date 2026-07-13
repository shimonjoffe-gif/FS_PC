import React, { useMemo, useState } from 'react';
import type { Problem, ProblemDetail } from '../types';
import { buildProblemDisplayUnits, collectProblemWithAncestors } from '../utils/problemDisplayGroups';
import ProblemCardModal, { emptyProblemDraft, type ProblemDraft } from './ProblemCardModal';

type CardState =
  | { mode: 'view'; problem: ProblemDetail }
  | { mode: 'create' }
  | null;

function draftToPayload(draft: ProblemDraft) {
  return {
    name: draft.name.trim(),
    parent_id: draft.parent_id === '' ? null : draft.parent_id,
    lcm_code: draft.lcm_code.trim() || null,
  };
}

function HypothesisBadges({ names }: { names: string[] }) {
  if (!names.length) return <span className="text-[10px] text-slate-300">не привязано</span>;
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {names.map(name => (
        <span key={name} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 max-w-[140px] truncate" title={name}>
          {name}
        </span>
      ))}
    </span>
  );
}

function DeleteButton({ title, label, onClick }: { title: string; label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 shrink-0"
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      {label ?? '✕'}
    </button>
  );
}

function displayProblemCode(problem: Problem, hypothesisFilter: string): string | null {
  if (hypothesisFilter) {
    return problem.hypothesis_codes?.[hypothesisFilter] ?? null;
  }
  return problem.catalog_code ?? null;
}

function ProblemRow({
  problem,
  indent = 0,
  variant,
  childCount = 0,
  hypothesisFilter = '',
  onOpen,
  onDelete,
}: {
  problem: Problem;
  indent?: number;
  variant: 'parent' | 'child' | 'standalone';
  childCount?: number;
  hypothesisFilter?: string;
  onOpen: (id: number) => void;
  onDelete: (problem: Problem, childCount: number) => void;
}) {
  const titleClass = variant === 'parent' ? 'font-semibold text-slate-800' : 'font-medium text-slate-700';
  const deleteLabel = childCount > 0 ? `✕ (${childCount + 1})` : '✕';
  const code = displayProblemCode(problem, hypothesisFilter);

  return (
    <div className="flex items-start gap-1 px-2 hover:bg-blue-50 rounded group" style={{ paddingLeft: `${8 + indent}px` }}>
      <button type="button" className="flex-1 text-left py-1.5 min-w-0" onClick={() => onOpen(problem.id)}>
        <div className={`text-xs ${titleClass} line-clamp-2`}>
          {code ? <span className="text-slate-400 font-normal mr-1 font-mono">{code}</span> : null}
          {problem.name}
        </div>
        <div className="mt-0.5 flex items-center justify-end gap-2">
          <HypothesisBadges names={problem.used_in_hypotheses ?? []} />
        </div>
      </button>
      <DeleteButton
        title={childCount > 0 ? `Удалить группу «${problem.name}»` : `Удалить «${problem.name}»`}
        label={deleteLabel}
        onClick={() => onDelete(problem, childCount)}
      />
    </div>
  );
}

export default function ProblemsNsi({
  items,
  hypothesisOptions,
  onOpen,
  onCreate,
  onSave,
  onDelete,
  onDeleteExclusiveForHypothesis,
}: {
  items: Problem[];
  hypothesisOptions: string[];
  onOpen: (id: number) => Promise<ProblemDetail>;
  onCreate: (data: ReturnType<typeof draftToPayload>) => Promise<ProblemDetail>;
  onSave: (id: number, data: ReturnType<typeof draftToPayload>) => Promise<ProblemDetail>;
  onDelete: (id: number) => Promise<void>;
  onDeleteExclusiveForHypothesis: (hypothesisName: string) => Promise<{ deleted: number; skipped_shared: number }>;
}) {
  const [card, setCard] = useState<CardState>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [hypothesisFilter, setHypothesisFilter] = useState('');

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = items;
    if (hypothesisFilter) {
      const matchIds = new Set(
        items.filter(p => p.used_in_hypotheses?.includes(hypothesisFilter)).map(p => p.id),
      );
      const visibleIds = collectProblemWithAncestors(items, matchIds);
      base = items.filter(p => visibleIds.has(p.id));
    }
    if (!q) return base;
    const textMatch = new Set(
      items.filter(p =>
        p.name.toLowerCase().includes(q)
        || p.catalog_code?.toLowerCase().includes(q)
        || Object.values(p.hypothesis_codes ?? {}).some(c => c.toLowerCase().includes(q))
        || p.lcm_code?.toLowerCase().includes(q)
        || p.used_in_hypotheses?.some(h => h.toLowerCase().includes(q)),
      ).map(p => p.id),
    );
    const visibleIds = collectProblemWithAncestors(items, textMatch);
    return base.filter(p => visibleIds.has(p.id));
  }, [items, search, hypothesisFilter]);

  const units = useMemo(() => buildProblemDisplayUnits(filteredItems), [filteredItems]);

  async function openCard(id: number) {
    setBusy(true);
    try {
      setCard({ mode: 'view', problem: await onOpen(id) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveExisting(draft: ProblemDraft) {
    if (card?.mode !== 'view') return;
    const updated = await onSave(card.problem.id, draftToPayload(draft));
    setCard({ mode: 'view', problem: updated });
  }

  async function handleDeleteProblem(problem: Problem, childCount: number) {
    const msg = childCount > 0
      ? `Удалить «${problem.name}» и ${childCount} подпункт(ов)?`
      : `Удалить проблематику «${problem.name}»?`;
    if (!confirm(msg)) return;
    await onDelete(problem.id);
    if (card?.mode === 'view' && card.problem.id === problem.id) setCard(null);
  }

  async function handleDeleteExclusive() {
    if (!hypothesisFilter) return;
    if (!confirm(
      `Удалить проблематики, которые используются ТОЛЬКО в гипотезе «${hypothesisFilter}»?\n\nОбщие проблематики (в нескольких гипотезах) останутся.`,
    )) return;
    const result = await onDeleteExclusiveForHypothesis(hypothesisFilter);
    alert(`Удалено: ${result.deleted}. Пропущено общих: ${result.skipped_shared}.`);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] text-slate-400">Поиск</label>
          <input
            className="w-full text-sm border rounded px-2 py-1"
            placeholder="Название, код, гипотеза…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="min-w-[200px]">
          <label className="text-[10px] text-slate-400">Гипотеза</label>
          <select
            className="w-full text-sm border rounded px-2 py-1"
            value={hypothesisFilter}
            onChange={e => setHypothesisFilter(e.target.value)}
          >
            <option value="">Все гипотезы</option>
            {hypothesisOptions.map(h => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
          onClick={() => setCard({ mode: 'create' })}
        >
          + Добавить
        </button>
        {hypothesisFilter ? (
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
            onClick={handleDeleteExclusive}
          >
            Удалить уникальные для гипотезы
          </button>
        ) : null}
      </div>

      <p className="text-[10px] text-slate-400 mb-2">
        Показано {filteredItems.length} из {items.length} · одна проблематика может быть в нескольких гипотезах
        {hypothesisFilter ? ' · нумерация в контексте выбранной гипотезы' : ' · сквозная нумерация справочника'}
      </p>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-slate-400">Ничего не найдено</p>
      ) : (
        <div className="border border-slate-200 rounded-lg py-1">
          {units.map(unit => {
            if (unit.kind === 'group') {
              return (
                <div key={`g-${unit.parent.id}`}>
                  <ProblemRow problem={unit.parent} variant="parent" childCount={unit.children.length} hypothesisFilter={hypothesisFilter} onOpen={openCard} onDelete={handleDeleteProblem} />
                  {unit.children.map(child => (
                    <ProblemRow key={child.id} problem={child} variant="child" indent={12} hypothesisFilter={hypothesisFilter} onOpen={openCard} onDelete={handleDeleteProblem} />
                  ))}
                </div>
              );
            }
            return (
              <ProblemRow key={unit.item.id} problem={unit.item} variant="standalone" hypothesisFilter={hypothesisFilter} onOpen={openCard} onDelete={handleDeleteProblem} />
            );
          })}
        </div>
      )}

      {busy && !card ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 text-sm text-white">Загрузка…</div>
      ) : null}

      {card?.mode === 'view' ? (
        <ProblemCardModal
          mode="view"
          problem={card.problem}
          allProblems={items}
          onClose={() => setCard(null)}
          onSave={handleSaveExisting}
          onDelete={() => onDelete(card.problem.id)}
        />
      ) : null}

      {card?.mode === 'create' ? (
        <ProblemCardModal
          mode="create"
          draft={emptyProblemDraft()}
          allProblems={items}
          onClose={() => setCard(null)}
          onSave={async draft => { await onCreate(draftToPayload(draft)); }}
        />
      ) : null}
    </>
  );
}
