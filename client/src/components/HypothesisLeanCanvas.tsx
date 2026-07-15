import React, { useEffect, useMemo, useState } from 'react';
import { createSolution, getSegments, getSolutions } from '../api';
import HypothesisConsumerSegments from './HypothesisConsumerSegments';
import {
  buildDisplayUnits,
  detailToDrafts,
  type IndexedProblem,
} from '../hypothesisFormUtils';
import type {
  ActivityType,
  HypothesisDetail,
  HypothesisProblemDraft,
  HypothesisStakeholderRoleRow,
  MaturityLevel,
  Problem,
  Segment,
  Solution,
  StakeholderRole,
} from '../types';

function ProblemLine({
  prob,
  variant,
  onRemove,
}: {
  prob: IndexedProblem;
  variant: 'parent' | 'child' | 'standalone';
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-1 text-[11px]">
      <div className="min-w-0 font-medium text-slate-800" style={{ paddingLeft: variant === 'child' ? 8 : undefined }}>
        {prob.lcm_code ? <span className="text-slate-400 mr-1">{prob.lcm_code}</span> : null}
        {prob.name}
      </div>
      <button type="button" className="text-red-400 hover:text-red-600 shrink-0 text-[10px]" onClick={onRemove}>✕</button>
    </div>
  );
}

export type HypothesisSavePayload = {
  name: string;
  target_audience: string | null;
  maturity_id: number | null;
  activity_type_ids: number[];
  problems: HypothesisProblemDraft[];
  unique_value_proposition: string | null;
  key_metrics: string | null;
  unfair_advantage: string | null;
  channels: string | null;
  revenue_streams: string | null;
  cost_structure: string | null;
  product: string | null;
  market: string | null;
  alternatives: string | null;
  early_adopters: string | null;
  triggers: string | null;
  segment_ids: number[];
  stakeholder_roles: { stakeholder_role_id: number; description: string | null }[];
};

export default function HypothesisLeanCanvas({
  hypothesis,
  allProblems,
  allSolutions,
  maturityLevels,
  activityTypes,
  allStakeholderRoles,
  onSave,
  onSolutionCreated,
  onActivityTypeCreated,
  onStakeholderRoleCreated,
}: {
  hypothesis: HypothesisDetail;
  allProblems: Problem[];
  allSolutions: Solution[];
  maturityLevels: MaturityLevel[];
  activityTypes: ActivityType[];
  allStakeholderRoles: StakeholderRole[];
  onSave: (data: HypothesisSavePayload) => void | Promise<void>;
  onSolutionCreated?: (solution: Solution) => void;
  onActivityTypeCreated?: (type: ActivityType) => void;
  onStakeholderRoleCreated?: (role: StakeholderRole) => void;
}) {
  const [name, setName] = useState(hypothesis.name);
  const [product, setProduct] = useState(hypothesis.product ?? '');
  const [market, setMarket] = useState(hypothesis.market ?? '');
  const [triggers, setTriggers] = useState(hypothesis.triggers ?? hypothesis.target_audience ?? '');
  const [segmentIds, setSegmentIds] = useState<number[]>(() => hypothesis.segments?.map(s => s.id) ?? []);
  const [stakeholderRoles, setStakeholderRoles] = useState<HypothesisStakeholderRoleRow[]>(
    () => (hypothesis.stakeholder_roles ?? []).map(r => ({ ...r })),
  );
  const [activityTypeIds, setActivityTypeIds] = useState<number[]>(() => hypothesis.activity_types.map(a => a.id));
  const [segmentsCatalog, setSegmentsCatalog] = useState<Segment[]>([]);
  const [maturityId, setMaturityId] = useState<number | ''>(hypothesis.maturity_id ?? '');
  const [uvp, setUvp] = useState(hypothesis.unique_value_proposition ?? '');
  const [keyMetrics, setKeyMetrics] = useState(hypothesis.key_metrics ?? '');
  const [unfairAdvantage, setUnfairAdvantage] = useState(hypothesis.unfair_advantage ?? '');
  const [channels, setChannels] = useState(hypothesis.channels ?? '');
  const [revenueStreams, setRevenueStreams] = useState(hypothesis.revenue_streams ?? '');
  const [costStructure, setCostStructure] = useState(hypothesis.cost_structure ?? '');
  const [alternatives, setAlternatives] = useState(hypothesis.alternatives ?? '');
  const [earlyAdopters, setEarlyAdopters] = useState(hypothesis.early_adopters ?? '');
  const [problems, setProblems] = useState<HypothesisProblemDraft[]>(() => detailToDrafts(hypothesis));
  const [extraSolutions, setExtraSolutions] = useState<Solution[]>([]);
  const [saving, setSaving] = useState(false);
  const [addProblemMode, setAddProblemMode] = useState<'pick' | 'new'>('pick');
  const [pickProblemId, setPickProblemId] = useState('');
  const [newProblemName, setNewProblemName] = useState('');

  useEffect(() => {
    void getSegments().then(setSegmentsCatalog);
  }, []);

  useEffect(() => {
    setName(hypothesis.name);
    setProduct(hypothesis.product ?? '');
    setMarket(hypothesis.market ?? '');
    setTriggers(hypothesis.triggers ?? hypothesis.target_audience ?? '');
    setSegmentIds(hypothesis.segments?.map(s => s.id) ?? []);
    setStakeholderRoles((hypothesis.stakeholder_roles ?? []).map(r => ({ ...r })));
    setActivityTypeIds(hypothesis.activity_types.map(a => a.id));
    setMaturityId(hypothesis.maturity_id ?? '');
    setUvp(hypothesis.unique_value_proposition ?? '');
    setKeyMetrics(hypothesis.key_metrics ?? '');
    setUnfairAdvantage(hypothesis.unfair_advantage ?? '');
    setChannels(hypothesis.channels ?? '');
    setRevenueStreams(hypothesis.revenue_streams ?? '');
    setCostStructure(hypothesis.cost_structure ?? '');
    setAlternatives(hypothesis.alternatives ?? '');
    setEarlyAdopters(hypothesis.early_adopters ?? '');
    setProblems(detailToDrafts(hypothesis));
  }, [hypothesis]);

  const solutionsList = useMemo(() => {
    const map = new Map(allSolutions.map(s => [s.id, s]));
    for (const s of extraSolutions) map.set(s.id, s);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [allSolutions, extraSolutions]);

  const displayUnits = useMemo(() => buildDisplayUnits(problems), [problems]);
  const usedProblemIds = new Set(problems.map(p => p.problem_id).filter(Boolean) as number[]);

  function solutionById(id: number): Solution | undefined {
    return solutionsList.find(s => s.id === id);
  }

  const solutionRows = useMemo(() => {
    const rows: { problemIdx: number; problemLabel: string; solutionId: number; solutionName: string; link: string }[] = [];
    for (const p of problems) {
      const idx = problems.indexOf(p);
      for (const sid of p.solution_ids) {
        const sol = solutionById(sid);
        rows.push({
          problemIdx: idx,
          problemLabel: p.lcm_code ?? p.name.slice(0, 20),
          solutionId: sid,
          solutionName: sol?.name ?? `ID ${sid}`,
          link: p.lcm_code ?? '',
        });
      }
    }
    return rows;
  }, [problems, solutionsList]);

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
      // keep field
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        target_audience: null,
        maturity_id: maturityId === '' ? null : maturityId,
        activity_type_ids: activityTypeIds,
        problems,
        unique_value_proposition: uvp.trim() || null,
        key_metrics: keyMetrics.trim() || null,
        unfair_advantage: unfairAdvantage.trim() || null,
        channels: channels.trim() || null,
        revenue_streams: revenueStreams.trim() || null,
        cost_structure: costStructure.trim() || null,
        product: product.trim() || null,
        market: market.trim() || null,
        alternatives: alternatives.trim() || null,
        early_adopters: earlyAdopters.trim() || null,
        triggers: triggers.trim() || null,
        segment_ids: segmentIds,
        stakeholder_roles: stakeholderRoles.map(r => ({
          stakeholder_role_id: r.id,
          description: r.description?.trim() || null,
        })),
      });
    } finally {
      setSaving(false);
    }
  }

  function renderProblemsColumn() {
    return (
      <>
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {displayUnits.length === 0 ? (
            <p className="text-[11px] text-slate-400">Нет проблематик</p>
          ) : (
            displayUnits.map(unit => {
              if (unit.kind === 'group') {
                return (
                  <div key={`g-${unit.parent.idx}`} className="border border-slate-100 rounded p-2 bg-slate-50/50">
                    <ProblemLine prob={unit.parent} variant="parent" onRemove={() => removeProblem(unit.parent.idx)} />
                    {unit.children.map(child => (
                      <div key={`c-${child.idx}`} className="mt-2 pl-2 border-l border-slate-200">
                        <ProblemLine prob={child} variant="child" onRemove={() => removeProblem(child.idx)} />
                        {renderProblemSolutions(child)}
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div key={`s-${unit.item.idx}`} className="border border-slate-100 rounded p-2">
                  <ProblemLine prob={unit.item} variant="standalone" onRemove={() => removeProblem(unit.item.idx)} />
                  {renderProblemSolutions(unit.item)}
                </div>
              );
            })
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          <div className="flex gap-1 text-[10px]">
            <button type="button" className={`px-2 py-0.5 rounded ${addProblemMode === 'pick' ? 'bg-slate-200' : 'border'}`} onClick={() => setAddProblemMode('pick')}>Из справочника</button>
            <button type="button" className={`px-2 py-0.5 rounded ${addProblemMode === 'new' ? 'bg-slate-200' : 'border'}`} onClick={() => setAddProblemMode('new')}>Новая</button>
          </div>
          {addProblemMode === 'pick' ? (
            <div className="flex gap-1">
              <select className="flex-1 text-[10px] border rounded px-1 py-0.5 min-w-0" value={pickProblemId} onChange={e => setPickProblemId(e.target.value)}>
                <option value="">Выберите…</option>
                {allProblems.filter(p => !usedProblemIds.has(p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addProblem()}>+</button>
            </div>
          ) : (
            <div className="flex gap-1">
              <input className="flex-1 text-[10px] border rounded px-1 py-0.5" placeholder="Название" value={newProblemName} onChange={e => setNewProblemName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addProblem(); } }} />
              <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addProblem()}>+</button>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderProblemSolutions(prob: IndexedProblem) {
    const idx = prob.idx;
    return (
      <div className="mt-1 pl-2 border-l border-slate-200">
        {prob.solution_ids.map(sid => {
          const sol = solutionById(sid);
          return (
            <div key={sid} className="flex items-center justify-between gap-1 text-[10px] text-slate-600">
              <span className="min-w-0 truncate">{sol?.name ?? sid}</span>
              <button type="button" className="text-red-400 shrink-0" onClick={() => removeSolution(idx, sid)}>✕</button>
            </div>
          );
        })}
        <div className="flex gap-1 mt-1">
          <select className="flex-1 text-[10px] border rounded px-1 py-0.5 min-w-0" defaultValue="" onChange={e => { const id = Number(e.target.value); if (id) { addExistingSolution(idx, id); e.target.value = ''; } }}>
            <option value="">+ решение</option>
            {solutionsList.filter(s => !prob.solution_ids.includes(s.id)).map(sol => (
              <option key={sol.id} value={sol.id}>{sol.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 mt-0.5">
          <input className="flex-1 text-[10px] border rounded px-1 py-0.5" placeholder="Новое" value={prob.new_solution_name} onChange={e => setProblems(prev => prev.map((p, i) => i === idx ? { ...p, new_solution_name: e.target.value } : p))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addNewSolution(idx); } }} />
          <button type="button" className="text-[10px] px-1.5 border rounded" onClick={() => void addNewSolution(idx)}>+</button>
        </div>
      </div>
    );
  }

  function renderSolutionsColumn() {
    if (solutionRows.length === 0) {
      return <p className="text-[11px] text-slate-400">Нет решений</p>;
    }
    return (
      <ul className="space-y-1 max-h-[360px] overflow-y-auto">
        {solutionRows.map(row => (
          <li key={`${row.problemIdx}-${row.solutionId}`} className="text-[11px] text-slate-700 leading-snug">
            {row.solutionName}
          </li>
        ))}
      </ul>
    );
  }

  function renderLinksColumn() {
    return (
      <ul className="space-y-1 max-h-[360px] overflow-y-auto text-[10px] text-slate-500 font-mono">
        {problems.filter(p => p.lcm_code).map((p, i) => (
          <li key={i}>{p.lcm_code}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="lcm-sheet space-y-2">
      <div className="flex justify-end p-2 bg-slate-50 border border-slate-200 rounded">
        <button type="button" className="text-sm bg-blue-500 text-white px-4 py-1 rounded disabled:opacity-50" disabled={saving || !name.trim()} onClick={() => void handleSave()}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      <div className="lcm-banner">
        <span className="lcm-banner-prefix">РЕШЕНИЕ:</span>
        <input className="lcm-banner-input" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="lcm-banner">
        <span className="lcm-banner-prefix">ПРОДУКТ:</span>
        <input className="lcm-banner-input" value={product} onChange={e => setProduct(e.target.value)} />
      </div>
      <div className="lcm-banner-row">
        <span className="lcm-banner-label">Продукт</span>
        <span className="lcm-banner-gap" />
        <span className="lcm-banner-label">Рынок</span>
        <input className="lcm-banner-input lcm-banner-input--market" value={market} onChange={e => setMarket(e.target.value)} />
      </div>

      <div className="lcm-excel-grid">
        <div className="lcm-col-head lcm-col-a">2.1 Проблема (утвержденная по смыслу формулировка)</div>
        <div className="lcm-col-head lcm-col-c">4. Решение</div>
        <div className="lcm-col-head lcm-col-d">Связь</div>
        <div className="lcm-col-head lcm-col-e">
          <select className="lcm-maturity-select" value={maturityId} onChange={e => setMaturityId(e.target.value ? Number(e.target.value) : '')} title="Уровень зрелости">
            <option value="">—</option>
            {maturityLevels.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="lcm-col-head lcm-col-f">3. Уникальная ценность (УТП)</div>
        <div className="lcm-col-head lcm-col-g lcm-col-spacer" />
        <div className="lcm-col-head lcm-col-h">9. Скрытое преимущество</div>
        <div className="lcm-col-head lcm-col-i">1.1 Сегменты потребителей</div>

        <div className="lcm-col-body lcm-col-a">{renderProblemsColumn()}</div>
        <div className="lcm-col-body lcm-col-c">{renderSolutionsColumn()}</div>
        <div className="lcm-col-body lcm-col-d">{renderLinksColumn()}</div>
        <div className="lcm-col-body lcm-col-e" />
        <div className="lcm-col-body lcm-col-f">
          <textarea className="lean-canvas-textarea lcm-textarea-tall" value={uvp} onChange={e => setUvp(e.target.value)} />
        </div>
        <div className="lcm-col-body lcm-col-g lcm-col-spacer" />
        <div className="lcm-col-body lcm-col-h">
          <textarea className="lean-canvas-textarea lcm-textarea-tall" value={unfairAdvantage} onChange={e => setUnfairAdvantage(e.target.value)} />
        </div>
        <div className="lcm-col-body lcm-col-i">
          <HypothesisConsumerSegments
            segments={segmentsCatalog}
            segmentIds={segmentIds}
            onSegmentIdsChange={setSegmentIds}
            activityTypeIds={activityTypeIds}
            onActivityTypeIdsChange={setActivityTypeIds}
            activityTypes={activityTypes}
            onActivityTypeCreated={onActivityTypeCreated}
            stakeholderRoles={stakeholderRoles}
            onStakeholderRolesChange={setStakeholderRoles}
            allStakeholderRoles={allStakeholderRoles}
            onStakeholderRoleCreated={onStakeholderRoleCreated}
            triggers={triggers}
            onTriggersChange={setTriggers}
          />
        </div>

        <div className="lcm-col-head lcm-col-a lcm-row-foot">2.2 Альтернативы</div>
        <div className="lcm-col-head lcm-col-c lcm-row-foot lcm-col-span-mid">8. Ключевые метрики</div>
        <div className="lcm-col-head lcm-col-h lcm-row-foot">5. Каналы</div>
        <div className="lcm-col-head lcm-col-i lcm-row-foot">1.2 Ранние последователи</div>

        <div className="lcm-col-body lcm-col-a lcm-row-foot">
          <textarea className="lean-canvas-textarea" value={alternatives} onChange={e => setAlternatives(e.target.value)} />
        </div>
        <div className="lcm-col-body lcm-col-c lcm-row-foot lcm-col-span-mid">
          <textarea className="lean-canvas-textarea" value={keyMetrics} onChange={e => setKeyMetrics(e.target.value)} />
        </div>
        <div className="lcm-col-body lcm-col-h lcm-row-foot">
          <textarea className="lean-canvas-textarea" value={channels} onChange={e => setChannels(e.target.value)} />
        </div>
        <div className="lcm-col-body lcm-col-i lcm-row-foot">
          <textarea className="lean-canvas-textarea" value={earlyAdopters} onChange={e => setEarlyAdopters(e.target.value)} />
        </div>

        <div className="lcm-col-head lcm-col-a lcm-row-foot2 lcm-col-span-left">7. Структура издержек</div>
        <div className="lcm-col-head lcm-col-g lcm-row-foot2 lcm-col-span-right">6. Потоки прибыли</div>

        <div className="lcm-col-body lcm-col-a lcm-row-foot2 lcm-col-span-left">
          <textarea className="lean-canvas-textarea" value={costStructure} onChange={e => setCostStructure(e.target.value)} />
        </div>
        <div className="lcm-col-body lcm-col-g lcm-row-foot2 lcm-col-span-right">
          <textarea className="lean-canvas-textarea" value={revenueStreams} onChange={e => setRevenueStreams(e.target.value)} />
        </div>
      </div>
    </div>
  );
}
