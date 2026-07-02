import React, { useMemo, useState } from 'react';
import type { Solution, SolutionDetail, FsCatalogGroup, FsCatalogItem } from '../types';
import { YES_NO_BADGE_CLASS, yesNoClass, yesNoLabel } from '../utils/yesNoBadge';
import SolutionCardModal, { emptySolutionDraft, type SolutionDraft } from './SolutionCardModal';

type SolutionDisplayUnit =
  | { kind: 'group'; parent: Solution; children: Solution[] }
  | { kind: 'standalone'; item: Solution };

type CardState =
  | { mode: 'view'; solution: SolutionDetail }
  | { mode: 'create' }
  | null;

function buildDisplayUnits(items: Solution[]): SolutionDisplayUnit[] {
  const byId = new Map(items.map(s => [s.id, s]));
  const units: SolutionDisplayUnit[] = [];
  const consumed = new Set<number>();

  const roots = items
    .filter(s => !s.parent_id || !byId.has(s.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

  for (const root of roots) {
    const children = items
      .filter(c => c.parent_id === root.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    if (children.length > 0) {
      units.push({ kind: 'group', parent: root, children });
      consumed.add(root.id);
      for (const child of children) consumed.add(child.id);
    }
  }

  for (const item of items) {
    if (!consumed.has(item.id)) {
      units.push({ kind: 'standalone', item });
    }
  }

  units.sort((a, b) => {
    const orderA = a.kind === 'group' ? (a.parent.sort_order ?? 0) : (a.item.sort_order ?? 0);
    const orderB = b.kind === 'group' ? (b.parent.sort_order ?? 0) : (b.item.sort_order ?? 0);
    return orderA - orderB || (a.kind === 'group' ? a.parent.id : a.item.id) - (b.kind === 'group' ? b.parent.id : b.item.id);
  });

  return units;
}

function collectWithAncestors(items: Solution[], matchIds: Set<number>): Set<number> {
  const byId = new Map(items.map(s => [s.id, s]));
  const result = new Set<number>();
  for (const id of matchIds) {
    let cursor: number | null = id;
    while (cursor) {
      if (result.has(cursor)) break;
      result.add(cursor);
      const row = byId.get(cursor);
      cursor = row?.parent_id ?? null;
    }
  }
  return result;
}

function draftToPayload(draft: SolutionDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    hypothesis: draft.hypothesis.trim() || null,
    parent_id: draft.parent_id === '' ? null : draft.parent_id,
    lcm_code: draft.lcm_code.trim() || null,
    fs_mapped: draft.fs_mapped,
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

function displaySolutionCode(solution: Solution, hypothesisFilter: string): string | null {
  if (hypothesisFilter) {
    return solution.hypothesis_codes?.[hypothesisFilter] ?? null;
  }
  return solution.catalog_code ?? null;
}

function SolutionRow({
  solution,
  indent = 0,
  variant,
  childCount = 0,
  hypothesisFilter = '',
  onOpen,
  onDelete,
}: {
  solution: Solution;
  indent?: number;
  variant: 'parent' | 'child' | 'standalone';
  childCount?: number;
  hypothesisFilter?: string;
  onOpen: (id: number) => void;
  onDelete: (solution: Solution, childCount: number) => void;
}) {
  const titleClass = variant === 'parent' ? 'font-semibold text-slate-800' : 'font-medium text-slate-700';
  const deleteLabel = childCount > 0 ? `✕ (${childCount + 1})` : '✕';
  const code = displaySolutionCode(solution, hypothesisFilter);

  return (
    <div className="flex items-start gap-1 px-2 hover:bg-blue-50 rounded group" style={{ paddingLeft: `${8 + indent}px` }}>
      <button type="button" className="flex-1 text-left py-1.5 min-w-0" onClick={() => onOpen(solution.id)}>
        <div className={`text-xs ${titleClass} line-clamp-2`}>
          {code ? <span className="text-slate-400 font-normal mr-1 font-mono">{code}</span> : null}
          {solution.name}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={`${YES_NO_BADGE_CLASS} text-[9px] min-w-[28px] shrink-0 ${yesNoClass(Boolean(solution.fs_mapped))}`}
            title="Сопоставлено с ФС"
          >
            {yesNoLabel(Boolean(solution.fs_mapped))}
          </span>
          <HypothesisBadges names={solution.used_in_hypotheses ?? []} />
        </div>
      </button>
      <DeleteButton
        title={childCount > 0 ? `Удалить группу «${solution.name}»` : `Удалить «${solution.name}»`}
        label={deleteLabel}
        onClick={() => onDelete(solution, childCount)}
      />
    </div>
  );
}

export default function SolutionsNsi({
  items,
  hypothesisOptions,
  fsGroups,
  fsItems,
  onLoadFsLinks,
  onSaveFsLinks,
  onOpen,
  onCreate,
  onSave,
  onDelete,
  onDeleteExclusiveForHypothesis,
}: {
  items: Solution[];
  hypothesisOptions: string[];
  fsGroups: FsCatalogGroup[];
  fsItems: FsCatalogItem[];
  onLoadFsLinks: (solutionId: number) => Promise<number[]>;
  onSaveFsLinks: (solutionId: number, fsItemIds: number[]) => Promise<number[]>;
  onOpen: (id: number) => Promise<SolutionDetail>;
  onCreate: (data: ReturnType<typeof draftToPayload>) => Promise<SolutionDetail>;
  onSave: (id: number, data: ReturnType<typeof draftToPayload>) => Promise<SolutionDetail>;
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
        items.filter(s => s.used_in_hypotheses?.includes(hypothesisFilter)).map(s => s.id),
      );
      const visibleIds = collectWithAncestors(items, matchIds);
      base = items.filter(s => visibleIds.has(s.id));
    }
    if (!q) return base;
    const textMatch = new Set(
      items.filter(s =>
        s.name.toLowerCase().includes(q)
        || s.catalog_code?.toLowerCase().includes(q)
        || Object.values(s.hypothesis_codes ?? {}).some(c => c.toLowerCase().includes(q))
        || s.lcm_code?.toLowerCase().includes(q)
        || s.used_in_hypotheses?.some(h => h.toLowerCase().includes(q)),
      ).map(s => s.id),
    );
    const visibleIds = collectWithAncestors(items, textMatch);
    return base.filter(s => visibleIds.has(s.id));
  }, [items, search, hypothesisFilter]);

  const units = useMemo(() => buildDisplayUnits(filteredItems), [filteredItems]);

  async function openCard(id: number) {
    setBusy(true);
    try {
      setCard({ mode: 'view', solution: await onOpen(id) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveExisting(draft: SolutionDraft) {
    if (card?.mode !== 'view') return;
    const updated = await onSave(card.solution.id, draftToPayload(draft));
    setCard({ mode: 'view', solution: updated });
  }

  async function handleDeleteSolution(solution: Solution, childCount: number) {
    const msg = childCount > 0
      ? `Удалить «${solution.name}» и ${childCount} подпункт(ов)?`
      : `Удалить решение «${solution.name}»?`;
    if (!confirm(msg)) return;
    await onDelete(solution.id);
    if (card?.mode === 'view' && card.solution.id === solution.id) setCard(null);
  }

  async function handleDeleteExclusive() {
    if (!hypothesisFilter) return;
    if (!confirm(
      `Удалить решения, которые используются ТОЛЬКО в гипотезе «${hypothesisFilter}»?\n\nОбщие решения (в нескольких гипотезах) останутся.`,
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
        Показано {filteredItems.length} из {items.length} · одно решение может быть в нескольких гипотезах
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
                  <SolutionRow solution={unit.parent} variant="parent" childCount={unit.children.length} hypothesisFilter={hypothesisFilter} onOpen={openCard} onDelete={handleDeleteSolution} />
                  {unit.children.map(child => (
                    <SolutionRow key={child.id} solution={child} variant="child" indent={12} hypothesisFilter={hypothesisFilter} onOpen={openCard} onDelete={handleDeleteSolution} />
                  ))}
                </div>
              );
            }
            return (
              <SolutionRow key={unit.item.id} solution={unit.item} variant="standalone" hypothesisFilter={hypothesisFilter} onOpen={openCard} onDelete={handleDeleteSolution} />
            );
          })}
        </div>
      )}

      {busy && !card ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 text-sm text-white">Загрузка…</div>
      ) : null}

      {card?.mode === 'view' ? (
        <SolutionCardModal
          mode="view"
          solution={card.solution}
          allSolutions={items}
          hypothesisOptions={hypothesisOptions}
          fsGroups={fsGroups}
          fsItems={fsItems}
          onLoadFsLinks={onLoadFsLinks}
          onSaveFsLinks={onSaveFsLinks}
          onClose={() => setCard(null)}
          onSave={handleSaveExisting}
          onDelete={() => onDelete(card.solution.id)}
        />
      ) : null}

      {card?.mode === 'create' ? (
        <SolutionCardModal
          mode="create"
          draft={emptySolutionDraft(hypothesisFilter)}
          allSolutions={items}
          hypothesisOptions={hypothesisOptions}
          fsGroups={fsGroups}
          fsItems={fsItems}
          onLoadFsLinks={onLoadFsLinks}
          onSaveFsLinks={onSaveFsLinks}
          onClose={() => setCard(null)}
          onSave={async draft => { await onCreate(draftToPayload(draft)); }}
        />
      ) : null}
    </>
  );
}
