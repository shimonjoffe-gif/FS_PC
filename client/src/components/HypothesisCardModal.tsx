import React, { useEffect, useMemo, useState } from 'react';
import { createActivityType, createSolution, getSolutions } from '../api';
import type {
  ActivityType, HypothesisDetail, HypothesisProblemDraft, MaturityLevel, Problem, Solution,
} from '../types';

function detailToDrafts(detail: HypothesisDetail): HypothesisProblemDraft[] {
  return [...detail.problems]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(p => ({
      problem_id: p.id,
      name: p.name,
      parent_id: p.parent_id ?? null,
      depth: p.depth ?? 0,
      lcm_code: p.lcm_code ?? null,
      sort_order: p.sort_order ?? 0,
      solution_ids: p.solutions.map(s => s.id),
      new_solution_name: '',
    }));
}


interface IndexedProblem extends HypothesisProblemDraft {
  idx: number;
}

type ProblemDisplayUnit =
  | { kind: 'group'; parent: IndexedProblem; children: IndexedProblem[] }
  | { kind: 'standalone'; item: IndexedProblem };

function buildDisplayUnits(problems: HypothesisProblemDraft[]): ProblemDisplayUnit[] {
  const indexed: IndexedProblem[] = problems.map((p, idx) => ({ ...p, idx }));
  const byId = new Map(
    indexed.filter(p => p.problem_id).map(p => [p.problem_id!, p]),
  );

  const units: ProblemDisplayUnit[] = [];
  const consumed = new Set<number>();

  const roots = indexed
    .filter(p => !p.parent_id || !byId.has(p.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  for (const root of roots) {
    const children = indexed
      .filter(c => c.parent_id && c.parent_id === root.problem_id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (children.length > 0) {
      units.push({ kind: 'group', parent: root, children });
      consumed.add(root.idx);
      for (const c of children) consumed.add(c.idx);
    }
  }

  for (const p of indexed) {
    if (!consumed.has(p.idx)) {
      units.push({ kind: 'standalone', item: p });
    }
  }

  units.sort((a, b) => {
    const orderA = a.kind === 'group' ? (a.parent.sort_order ?? 0) : (a.item.sort_order ?? 0);
    const orderB = b.kind === 'group' ? (b.parent.sort_order ?? 0) : (b.item.sort_order ?? 0);
    return orderA - orderB;
  });

  return units;
}

function ProblemFormulation({
  prob,
  variant,
  onRemove,
}: {
  prob: IndexedProblem;
  variant: 'parent' | 'child' | 'standalone';
  onRemove: () => void;
}) {
  const titleClass = variant === 'parent'
    ? 'font-semibold text-slate-800'
    : variant === 'child'
      ? 'font-medium text-slate-800'
      : 'font-medium text-slate-800';

  return (
    <div className="flex items-start justify-between gap-2">
      <div className={`min-w-0 ${titleClass}`} style={{ paddingLeft: variant === 'child' ? '12px' : undefined }}>
        {prob.lcm_code ? (
          <span className="text-slate-400 font-normal mr-1">{prob.lcm_code}</span>
        ) : null}
        {prob.name}
      </div>
      <button
        type="button"
        className="text-[10px] text-red-500 hover:underline shrink-0"
        onClick={onRemove}
      >
        Убрать
      </button>
    </div>
  );
}

export default function HypothesisCardModal({
  hypothesis,
  allProblems,
  allSolutions,
  maturityLevels,
  activityTypes,
  onClose,
  onSave,
  onSolutionCreated,
  onActivityTypeCreated,
}: {
  hypothesis: HypothesisDetail;
  allProblems: Problem[];
  allSolutions: Solution[];
  maturityLevels: MaturityLevel[];
  activityTypes: ActivityType[];
  onClose: () => void;
  onSave: (data: {
    name: string;
    target_audience: string | null;
    maturity_id: number | null;
    activity_type_ids: number[];
    problems: HypothesisProblemDraft[];
  }) => void | Promise<void>;
  onSolutionCreated?: (solution: Solution) => void;
  onActivityTypeCreated?: (type: ActivityType) => void;
}) {
  const [name, setName] = useState(hypothesis.name);
  const [targetAudience, setTargetAudience] = useState(hypothesis.target_audience ?? '');
  const [maturityId, setMaturityId] = useState<number | ''>(hypothesis.maturity_id ?? '');
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<number>>(
    () => new Set(hypothesis.activity_types.map(a => a.id)),
  );
  const [extraActivityTypes, setExtraActivityTypes] = useState<ActivityType[]>([]);
  const [newActivityTypeName, setNewActivityTypeName] = useState('');
  const [problems, setProblems] = useState<HypothesisProblemDraft[]>(() => detailToDrafts(hypothesis));
  const [extraSolutions, setExtraSolutions] = useState<Solution[]>([]);
  const [saving, setSaving] = useState(false);
  const [addProblemMode, setAddProblemMode] = useState<'pick' | 'new'>('pick');
  const [pickProblemId, setPickProblemId] = useState('');
  const [newProblemName, setNewProblemName] = useState('');

  const solutionsList = useMemo(() => {
    const map = new Map(allSolutions.map(s => [s.id, s]));
    for (const s of extraSolutions) map.set(s.id, s);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [allSolutions, extraSolutions]);

  const activityTypesList = useMemo(() => {
    const map = new Map(activityTypes.map(a => [a.id, a]));
    for (const a of extraActivityTypes) map.set(a.id, a);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [activityTypes, extraActivityTypes]);

  const displayUnits = useMemo(() => buildDisplayUnits(problems), [problems]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const usedProblemIds = new Set(problems.map(p => p.problem_id).filter(Boolean) as number[]);

  async function addProblem() {
    if (addProblemMode === 'pick') {
      const id = Number(pickProblemId);
      if (!id) return;
      const prob = allProblems.find(p => p.id === id);
      if (!prob || usedProblemIds.has(id)) return;
      const linked = await getSolutions([id]);
      setProblems(prev => [...prev, {
        problem_id: id,
        name: prob.name,
        solution_ids: linked.map(s => s.id),
        new_solution_name: '',
      }]);
      setPickProblemId('');
    } else {
      const trimmed = newProblemName.trim();
      if (!trimmed) return;
      const existing = allProblems.find(p => p.name === trimmed);
      if (existing && usedProblemIds.has(existing.id)) return;
      setProblems(prev => [...prev, {
        problem_id: existing?.id,
        name: trimmed,
        solution_ids: [],
        new_solution_name: '',
      }]);
      setNewProblemName('');
    }
  }

  function removeProblem(idx: number) {
    setProblems(prev => prev.filter((_, i) => i !== idx));
  }

  function removeSolution(problemIdx: number, solutionId: number) {
    setProblems(prev => prev.map((p, i) => {
      if (i !== problemIdx) return p;
      return { ...p, solution_ids: p.solution_ids.filter(id => id !== solutionId) };
    }));
  }

  function addExistingSolution(problemIdx: number, solutionId: number) {
    if (!solutionId) return;
    setProblems(prev => prev.map((p, i) => {
      if (i !== problemIdx) return p;
      if (p.solution_ids.includes(solutionId)) return p;
      return { ...p, solution_ids: [...p.solution_ids, solutionId] };
    }));
  }

  function solutionById(id: number): Solution | undefined {
    return solutionsList.find(s => s.id === id);
  }

  async function addNewSolution(problemIdx: number) {
    const trimmed = problems[problemIdx]?.new_solution_name.trim();
    if (!trimmed) return;
    try {
      const created = await createSolution(trimmed);
      const sol: Solution = { id: created.id, name: created.name };
      setExtraSolutions(prev => [...prev, sol]);
      onSolutionCreated?.(sol);
      setProblems(prev => prev.map((p, i) => {
        if (i !== problemIdx) return p;
        const ids = new Set(p.solution_ids);
        ids.add(created.id);
        return { ...p, solution_ids: [...ids], new_solution_name: '' };
      }));
    } catch {
      // keep name in field on error
    }
  }

  function toggleActivityType(id: number) {
    setSelectedActivityIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addActivityType() {
    const trimmed = newActivityTypeName.trim();
    if (!trimmed) return;
    try {
      const created = await createActivityType(trimmed);
      setExtraActivityTypes(prev => [...prev, created]);
      onActivityTypeCreated?.(created);
      setSelectedActivityIds(prev => new Set(prev).add(created.id));
      setNewActivityTypeName('');
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        target_audience: targetAudience.trim() || null,
        maturity_id: maturityId === '' ? null : maturityId,
        activity_type_ids: [...selectedActivityIds],
        problems,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function renderSolutionsBlock(prob: IndexedProblem) {
    const idx = prob.idx;
    return (
      <div className="mt-1.5">
        {prob.solution_ids.length === 0 ? (
          <p className="text-xs text-slate-400 italic pl-3">Нет решений</p>
        ) : (
          <ul className="space-y-1">
            {prob.solution_ids.map(sid => {
              const sol = solutionById(sid);
              const code = sol?.hypothesis_codes?.[hypothesis.name] ?? sol?.catalog_code;
              return (
                <li
                  key={sid}
                  className="flex items-start justify-between gap-2 text-xs bg-white border border-slate-100 rounded px-2 py-1.5 ml-3"
                >
                  <span className="text-slate-700 min-w-0">
                    <span className="text-[10px] uppercase text-slate-400 mr-1.5">Решение</span>
                    {code ? <span className="text-slate-400 font-mono mr-1">{code}</span> : null}
                    {sol?.name ?? `ID ${sid}`}
                  </span>
                  <button
                    type="button"
                    className="text-red-400 hover:text-red-600 shrink-0"
                    title="Убрать"
                    onClick={() => removeSolution(idx, sid)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex gap-2 mt-2 ml-3">
          <select
            className="flex-1 text-xs border rounded px-2 py-1 bg-white"
            defaultValue=""
            onChange={e => {
              const id = Number(e.target.value);
              if (id) {
                addExistingSolution(idx, id);
                e.target.value = '';
              }
            }}
          >
            <option value="">+ Добавить из справочника…</option>
            {solutionsList
              .filter(s => !prob.solution_ids.includes(s.id))
              .map(sol => (
                <option key={sol.id} value={sol.id}>
                  {sol.catalog_code ? `${sol.catalog_code} ` : ''}{sol.name}
                </option>
              ))}
          </select>
        </div>
        <div className="flex gap-2 mt-1 ml-3">
          <input
            className="flex-1 text-xs border rounded px-2 py-1"
            placeholder="Новое решение"
            value={prob.new_solution_name}
            onChange={e => setProblems(prev => prev.map((p, i) =>
              i === idx ? { ...p, new_solution_name: e.target.value } : p,
            ))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addNewSolution(idx); } }}
          />
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-100"
            onClick={() => void addNewSolution(idx)}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">Lean Canvas · гипотеза</div>
            <input
              className="w-full text-sm font-semibold border rounded px-2 py-1 text-slate-800"
              value={name}
              placeholder="Название гипотезы"
              onChange={e => setName(e.target.value)}
            />
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          <section>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Целевая аудитория
            </label>
            <textarea
              className="w-full text-sm border rounded px-2 py-1.5 min-h-[4rem]"
              value={targetAudience}
              placeholder="Описание целевой аудитории"
              onChange={e => setTargetAudience(e.target.value)}
            />
          </section>

          <section>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Уровень зрелости
            </label>
            <select
              className="w-full text-sm border rounded px-2 py-1"
              value={maturityId}
              onChange={e => setMaturityId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— не выбран —</option>
              {maturityLevels.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </section>

          <section>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
              Виды деятельности
            </label>
            <div className="max-h-32 overflow-y-auto space-y-1 border rounded bg-white p-2 mb-2">
              {activityTypesList.length === 0 ? (
                <p className="text-xs text-slate-400">Справочник пуст — добавьте ниже</p>
              ) : (
                activityTypesList.map(at => (
                  <label key={at.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedActivityIds.has(at.id)}
                      onChange={() => toggleActivityType(at.id)}
                    />
                    <span>{at.name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 text-xs border rounded px-2 py-1"
                placeholder="Новый вид деятельности"
                value={newActivityTypeName}
                onChange={e => setNewActivityTypeName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addActivityType(); } }}
              />
              <button
                type="button"
                className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-100"
                onClick={() => void addActivityType()}
              >
                +
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Проблематики и решения
            </h3>

            {problems.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 rounded p-3 border border-slate-100">
                Нет проблематик — добавьте ниже
              </p>
            ) : (
              <div className="space-y-3">
                {displayUnits.map(unit => {
                  if (unit.kind === 'group') {
                    return (
                      <div
                        key={`group-${unit.parent.problem_id ?? unit.parent.idx}`}
                        className="border rounded-lg p-3 bg-slate-50/50 space-y-3"
                      >
                        <ProblemFormulation
                          prob={unit.parent}
                          variant="parent"
                          onRemove={() => removeProblem(unit.parent.idx)}
                        />
                        <div className="space-y-3 border-t border-slate-200 pt-3">
                          {unit.children.map(child => (
                            <div
                              key={`child-${child.problem_id ?? child.idx}`}
                              className="border-l-2 border-slate-200 pl-2"
                            >
                              <ProblemFormulation
                                prob={child}
                                variant="child"
                                onRemove={() => removeProblem(child.idx)}
                              />
                              {renderSolutionsBlock(child)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`standalone-${unit.item.problem_id ?? unit.item.idx}`}
                      className="border rounded-lg p-3 bg-slate-50/50 space-y-2"
                    >
                      <ProblemFormulation
                        prob={unit.item}
                        variant="standalone"
                        onRemove={() => removeProblem(unit.item.idx)}
                      />
                      {renderSolutionsBlock(unit.item)}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 p-3 border border-dashed border-slate-200 rounded-lg space-y-2">
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className={`px-2 py-1 rounded ${addProblemMode === 'pick' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}
                  onClick={() => setAddProblemMode('pick')}
                >
                  Из справочника
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 rounded ${addProblemMode === 'new' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}
                  onClick={() => setAddProblemMode('new')}
                >
                  Новая
                </button>
              </div>
              {addProblemMode === 'pick' ? (
                <div className="flex gap-2">
                  <select
                    className="flex-1 text-xs border rounded px-2 py-1"
                    value={pickProblemId}
                    onChange={e => setPickProblemId(e.target.value)}
                  >
                    <option value="">— выберите проблематику —</option>
                    {allProblems
                      .filter(p => !usedProblemIds.has(p.id))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                  <button type="button" className="text-xs px-3 py-1 rounded bg-blue-500 text-white" onClick={() => void addProblem()}>
                    Добавить
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="flex-1 text-xs border rounded px-2 py-1"
                    placeholder="Название новой проблематики"
                    value={newProblemName}
                    onChange={e => setNewProblemName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProblem(); } }}
                  />
                  <button type="button" className="text-xs px-3 py-1 rounded bg-blue-500 text-white" onClick={() => void addProblem()}>
                    Добавить
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600">
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !name.trim()}
            className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}
