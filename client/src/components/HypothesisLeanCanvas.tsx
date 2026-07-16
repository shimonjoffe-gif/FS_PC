import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createSolution,
  getFsCatalogItems,
  getProblem,
  getSegments,
  getSolution,
  getSolutions,
  getSolutionFsLinks,
  getSolutionWidgetLinksForSolution,
  getWidgets,
  saveProblem,
  saveSolution,
  saveSolutionFsLinks,
  saveSolutionWidgetLinksForSolution,
} from '../api';
import HypothesisConsumerSegments from './HypothesisConsumerSegments';
import ProblemCardModal, { type ProblemDraft } from './ProblemCardModal';
import SolutionCardModal, { type SolutionDraft } from './SolutionCardModal';
import {
  detailToDrafts,
  detailToSolutionDrafts,
} from '../hypothesisFormUtils';
import {
  defaultLcmPrefs,
  isBlockVisible,
  LCM_ALL_BLOCKS,
  LCM_BLOCK_LABELS,
  LCM_EXTRA_BLOCKS,
  LCM_PRIORITY1,
  LCM_PRIORITY2,
  loadLcmPrefs,
  saveLcmPrefs,
  setBlockVisible,
  type LcmBlockId,
  type LcmCanvasPrefs,
} from '../lcmCanvasLayout';
import { assignTreeCodes, formatTreeCode } from '../utils/treeNumbering';
import type {
  ActivityType,
  FsCatalogGroup,
  FsCatalogItem,
  HypothesisDetail,
  HypothesisProblemDraft,
  HypothesisSolutionDraft,
  HypothesisStakeholderRoleRow,
  MaturityLevel,
  Problem,
  ProblemDetail,
  Segment,
  Solution,
  SolutionDetail,
  StakeholderRole,
  Widget,
} from '../types';

export type HypothesisSavePayload = {
  name: string;
  target_audience: string | null;
  maturity_id: number | null;
  activity_type_ids: number[];
  problems: HypothesisProblemDraft[];
  solution_ids?: number[];
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
  segments_description: string | null;
  segment_ids: number[];
  stakeholder_roles: { stakeholder_role_id: number; description: string | null }[];
};

type TreeRow = {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  code: string;
  depth: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

function buildTreeRows(
  items: { id: number; name: string; parent_id: number | null; sort_order: number }[],
): TreeRow[] {
  const codes = assignTreeCodes(items.map(i => ({
    id: i.id,
    parent_id: i.parent_id,
    sort_order: i.sort_order,
  })));
  const idSet = new Set(items.map(i => i.id));
  const byParent = new Map<number | null, typeof items>();
  for (const item of items) {
    const key = item.parent_id != null && idSet.has(item.parent_id) ? item.parent_id : null;
    const list = byParent.get(key) ?? [];
    list.push(item);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  }

  const rows: TreeRow[] = [];
  function walk(parentId: number | null, depth: number) {
    const siblings = byParent.get(parentId) ?? [];
    siblings.forEach((item, idx) => {
      rows.push({
        id: item.id,
        name: item.name,
        parent_id: parentId,
        sort_order: item.sort_order,
        code: formatTreeCode(codes.get(item.id) ?? ''),
        depth,
        canMoveUp: idx > 0,
        canMoveDown: idx < siblings.length - 1,
      });
      walk(item.id, depth + 1);
    });
  }
  walk(null, 0);
  return rows;
}

function reorderSiblings<T extends { id: number; parent_id?: number | null; sort_order: number }>(
  items: T[],
  id: number,
  direction: 'up' | 'down' | number,
): T[] {
  const target = items.find(i => i.id === id);
  if (!target) return items;
  const parentKey = target.parent_id ?? null;
  const idSet = new Set(items.map(i => i.id));
  const siblings = items
    .filter(i => {
      const p = i.parent_id != null && idSet.has(i.parent_id) ? i.parent_id : null;
      return p === parentKey;
    })
    .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const idx = siblings.findIndex(s => s.id === id);
  if (idx < 0) return items;

  let newIdx: number;
  if (direction === 'up') newIdx = idx - 1;
  else if (direction === 'down') newIdx = idx + 1;
  else newIdx = direction;

  if (newIdx < 0 || newIdx >= siblings.length || newIdx === idx) return items;

  const reordered = [...siblings];
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(newIdx, 0, moved);

  const orderMap = new Map(reordered.map((s, i) => [s.id, i]));
  return items.map(item => {
    const next = orderMap.get(item.id);
    return next === undefined ? item : { ...item, sort_order: next };
  });
}

function AutoGrowTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
  }, [value]);

  useEffect(() => {
    const onResize = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = '0px';
      el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={3}
    />
  );
}

function TreeList({
  rows,
  onOpen,
  onRemove,
  onMove,
  onDropReorder,
  itemDragEnabled = true,
}: {
  rows: TreeRow[];
  onOpen: (id: number) => void;
  onRemove: (id: number) => void;
  onMove: (id: number, dir: 'up' | 'down') => void;
  onDropReorder: (dragId: number, dropId: number) => void;
  itemDragEnabled?: boolean;
}) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  if (rows.length === 0) {
    return <p className="text-[11px] text-slate-400">Пусто</p>;
  }

  return (
    <ul className="lcm-tree-list">
      {rows.map(row => (
        <li
          key={row.id}
          className={`lcm-tree-item${dragId === row.id ? ' lcm-tree-item--dragging' : ''}${overId === row.id ? ' lcm-tree-item--drop' : ''}`}
          style={{ paddingLeft: `${4 + row.depth * 12}px` }}
          draggable={itemDragEnabled}
          onDragStart={e => {
            if (!itemDragEnabled) return;
            setDragId(row.id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(row.id));
          }}
          onDragEnd={() => { setDragId(null); setOverId(null); }}
          onDragOver={e => {
            if (!itemDragEnabled) return;
            e.preventDefault();
            if (dragId != null && dragId !== row.id) setOverId(row.id);
          }}
          onDragLeave={() => { if (overId === row.id) setOverId(null); }}
          onDrop={e => {
            if (!itemDragEnabled) return;
            e.preventDefault();
            const from = Number(e.dataTransfer.getData('text/plain') || dragId);
            if (from && from !== row.id) onDropReorder(from, row.id);
            setDragId(null);
            setOverId(null);
          }}
        >
          <span className="lcm-tree-code">{row.code}</span>
          <button type="button" className="lcm-tree-name" onClick={() => onOpen(row.id)}>
            {row.name}
          </button>
          <span className="lcm-tree-actions">
            <button type="button" disabled={!row.canMoveUp} onClick={() => onMove(row.id, 'up')} title="Выше">↑</button>
            <button type="button" disabled={!row.canMoveDown} onClick={() => onMove(row.id, 'down')} title="Ниже">↓</button>
            <button type="button" onClick={() => onRemove(row.id)} title="Убрать">✕</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

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
  onProblemsChanged,
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
  onProblemsChanged?: () => void | Promise<void>;
}) {
  const [name, setName] = useState(hypothesis.name);
  const [product, setProduct] = useState(hypothesis.product ?? '');
  const [market, setMarket] = useState(hypothesis.market ?? '');
  const [triggers, setTriggers] = useState(hypothesis.triggers ?? hypothesis.target_audience ?? '');
  const [segmentsDescription, setSegmentsDescription] = useState(hypothesis.segments_description ?? '');
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
  const [solutions, setSolutions] = useState<HypothesisSolutionDraft[]>(() => detailToSolutionDrafts(hypothesis));
  const [extraSolutions, setExtraSolutions] = useState<Solution[]>([]);
  const [saving, setSaving] = useState(false);
  const [addProblemMode, setAddProblemMode] = useState<'pick' | 'new'>('pick');
  const [pickProblemId, setPickProblemId] = useState('');
  const [newProblemName, setNewProblemName] = useState('');
  const [addSolutionMode, setAddSolutionMode] = useState<'pick' | 'new'>('pick');
  const [pickSolutionId, setPickSolutionId] = useState('');
  const [newSolutionName, setNewSolutionName] = useState('');

  const [problemCard, setProblemCard] = useState<ProblemDetail | null>(null);
  const [solutionCard, setSolutionCard] = useState<SolutionDetail | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [fsGroups, setFsGroups] = useState<FsCatalogGroup[]>([]);
  const [fsItems, setFsItems] = useState<FsCatalogItem[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [canvasPrefs, setCanvasPrefs] = useState<LcmCanvasPrefs>(() => loadLcmPrefs());

  function updatePrefs(next: LcmCanvasPrefs) {
    setCanvasPrefs(next);
    saveLcmPrefs(next);
  }

  const visiblePrimary = LCM_PRIORITY1.filter(id => isBlockVisible(canvasPrefs, id));
  const visibleSecondary = LCM_PRIORITY2.filter(id => isBlockVisible(canvasPrefs, id));
  const visibleExtra = LCM_EXTRA_BLOCKS.filter(id => isBlockVisible(canvasPrefs, id));

  useEffect(() => {
    void getSegments().then(setSegmentsCatalog);
  }, []);

  useEffect(() => {
    setName(hypothesis.name);
    setProduct(hypothesis.product ?? '');
    setMarket(hypothesis.market ?? '');
    setTriggers(hypothesis.triggers ?? hypothesis.target_audience ?? '');
    setSegmentsDescription(hypothesis.segments_description ?? '');
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
    setSolutions(detailToSolutionDrafts(hypothesis));
  }, [hypothesis]);

  const solutionsList = useMemo(() => {
    const map = new Map(allSolutions.map(s => [s.id, s]));
    for (const s of extraSolutions) map.set(s.id, s);
    return [...map.values()];
  }, [allSolutions, extraSolutions]);

  const usedProblemIds = new Set(problems.map(p => p.problem_id).filter(Boolean) as number[]);
  const usedSolutionIds = new Set(solutions.map(s => s.solution_id));

  const problemTreeItems = useMemo(() => problems
    .filter(p => p.problem_id)
    .map((p, idx) => ({
      id: p.problem_id!,
      name: p.name,
      parent_id: p.parent_id ?? null,
      sort_order: p.sort_order ?? idx,
    })), [problems]);

  const solutionTreeItems = useMemo(() => solutions.map((s, idx) => ({
    id: s.solution_id,
    name: s.name,
    parent_id: s.parent_id ?? null,
    sort_order: s.sort_order ?? idx,
  })), [solutions]);

  const problemRows = useMemo(() => buildTreeRows(problemTreeItems), [problemTreeItems]);
  const solutionRows = useMemo(() => buildTreeRows(solutionTreeItems), [solutionTreeItems]);
  const solutionLcmCodes = useMemo(() => assignTreeCodes(solutionTreeItems), [solutionTreeItems]);
  const problemLcmCodes = useMemo(() => assignTreeCodes(problemTreeItems), [problemTreeItems]);

  function ensureSolutionInList(sol: { id: number; name: string; parent_id?: number | null }) {
    setSolutions(prev => {
      if (prev.some(s => s.solution_id === sol.id)) return prev;
      return [...prev, {
        solution_id: sol.id,
        name: sol.name,
        parent_id: sol.parent_id ?? null,
        sort_order: prev.length,
      }];
    });
  }

  async function addProblem() {
    if (addProblemMode === 'pick') {
      const id = Number(pickProblemId);
      if (!id) return;
      const prob = allProblems.find(p => p.id === id);
      if (!prob || usedProblemIds.has(id)) return;
      const linkedSols = await getSolutions([id]);
      setProblems(prev => [...prev, {
        problem_id: id,
        name: prob.name,
        parent_id: prob.parent_id ?? null,
        sort_order: prev.length,
        solution_ids: linkedSols.map(s => s.id),
        new_solution_name: '',
      }]);
      for (const s of linkedSols) {
        ensureSolutionInList(s);
        setExtraSolutions(prev => (prev.some(x => x.id === s.id) ? prev : [...prev, s]));
      }
      setPickProblemId('');
    } else {
      const trimmed = newProblemName.trim();
      if (!trimmed) return;
      const existing = allProblems.find(p => p.name === trimmed);
      if (existing && usedProblemIds.has(existing.id)) return;
      setProblems(prev => [...prev, {
        problem_id: existing?.id,
        name: trimmed,
        parent_id: existing?.parent_id ?? null,
        sort_order: prev.length,
        solution_ids: [],
        new_solution_name: '',
      }]);
      setNewProblemName('');
    }
  }

  async function addSolutionToCanvas() {
    if (addSolutionMode === 'pick') {
      const id = Number(pickSolutionId);
      if (!id || usedSolutionIds.has(id)) return;
      const sol = solutionsList.find(s => s.id === id) ?? allSolutions.find(s => s.id === id);
      if (!sol) return;
      ensureSolutionInList(sol);
      setPickSolutionId('');
    } else {
      const trimmed = newSolutionName.trim();
      if (!trimmed) return;
      try {
        const created = await createSolution(trimmed);
        const sol: Solution = { id: created.id, name: created.name };
        setExtraSolutions(prev => [...prev, sol]);
        onSolutionCreated?.(sol);
        ensureSolutionInList(sol);
        setNewSolutionName('');
      } catch {
        // keep field
      }
    }
  }

  function removeProblem(id: number) {
    setProblems(prev => prev.filter(p => p.problem_id !== id).map((p, i) => ({ ...p, sort_order: i })));
  }

  function removeSolution(id: number) {
    setSolutions(prev => prev.filter(s => s.solution_id !== id).map((s, i) => ({ ...s, sort_order: i })));
    setProblems(prev => prev.map(p => ({
      ...p,
      solution_ids: p.solution_ids.filter(sid => sid !== id),
    })));
  }

  function moveProblem(id: number, dir: 'up' | 'down') {
    setProblems(prev => {
      const items = prev.filter(p => p.problem_id).map(p => ({
        ...p,
        id: p.problem_id!,
        parent_id: p.parent_id ?? null,
        sort_order: p.sort_order ?? 0,
      }));
      const reordered = reorderSiblings(items, id, dir);
      const orderMap = new Map(reordered.map(r => [r.id, r.sort_order]));
      return prev.map(p => {
        if (!p.problem_id || !orderMap.has(p.problem_id)) return p;
        return { ...p, sort_order: orderMap.get(p.problem_id)! };
      });
    });
  }

  function moveSolution(id: number, dir: 'up' | 'down') {
    setSolutions(prev => {
      const items = prev.map(s => ({
        ...s,
        id: s.solution_id,
        parent_id: s.parent_id ?? null,
      }));
      const reordered = reorderSiblings(items, id, dir);
      return reordered.map(r => ({
        solution_id: r.id,
        name: r.name,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
      }));
    });
  }

  function dropProblem(dragId: number, dropId: number) {
    setProblems(prev => {
      const items = prev.filter(p => p.problem_id).map(p => ({
        ...p,
        id: p.problem_id!,
        parent_id: p.parent_id ?? null,
        sort_order: p.sort_order ?? 0,
      }));
      const drag = items.find(i => i.id === dragId);
      const drop = items.find(i => i.id === dropId);
      if (!drag || !drop) return prev;
      const dragParent = drag.parent_id != null && items.some(i => i.id === drag.parent_id) ? drag.parent_id : null;
      const dropParent = drop.parent_id != null && items.some(i => i.id === drop.parent_id) ? drop.parent_id : null;
      if (dragParent !== dropParent) return prev;
      const siblings = items
        .filter(i => {
          const p = i.parent_id != null && items.some(x => x.id === i.parent_id) ? i.parent_id : null;
          return p === dragParent;
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const dropIdx = siblings.findIndex(s => s.id === dropId);
      const reordered = reorderSiblings(items, dragId, dropIdx);
      const orderMap = new Map(reordered.map(r => [r.id, r.sort_order]));
      return prev.map(p => {
        if (!p.problem_id || !orderMap.has(p.problem_id)) return p;
        return { ...p, sort_order: orderMap.get(p.problem_id)! };
      });
    });
  }

  function dropSolution(dragId: number, dropId: number) {
    setSolutions(prev => {
      const items = prev.map(s => ({
        ...s,
        id: s.solution_id,
        parent_id: s.parent_id ?? null,
      }));
      const drag = items.find(i => i.id === dragId);
      const drop = items.find(i => i.id === dropId);
      if (!drag || !drop) return prev;
      const dragParent = drag.parent_id != null && items.some(i => i.id === drag.parent_id) ? drag.parent_id : null;
      const dropParent = drop.parent_id != null && items.some(i => i.id === drop.parent_id) ? drop.parent_id : null;
      if (dragParent !== dropParent) return prev;
      const siblings = items
        .filter(i => {
          const p = i.parent_id != null && items.some(x => x.id === i.parent_id) ? i.parent_id : null;
          return p === dragParent;
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const dropIdx = siblings.findIndex(s => s.id === dropId);
      const reordered = reorderSiblings(items, dragId, dropIdx);
      return reordered.map(r => ({
        solution_id: r.id,
        name: r.name,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
      }));
    });
  }

  async function openProblemCard(id: number) {
    setCardBusy(true);
    try {
      setProblemCard(await getProblem(id));
    } finally {
      setCardBusy(false);
    }
  }

  async function openSolutionCard(id: number) {
    setCardBusy(true);
    try {
      if (fsItems.length === 0) {
        const [itemsResp, w] = await Promise.all([getFsCatalogItems(), getWidgets()]);
        setFsGroups(itemsResp.groups ?? []);
        setFsItems(itemsResp.items ?? []);
        setWidgets(w);
      }
      setSolutionCard(await getSolution(id));
    } finally {
      setCardBusy(false);
    }
  }

  function setProblemSolutionLinks(problemId: number, solutionIds: number[]) {
    setProblems(prev => prev.map(p => (
      p.problem_id === problemId ? { ...p, solution_ids: solutionIds } : p
    )));
    for (const sid of solutionIds) {
      const sol = solutionsList.find(s => s.id === sid) ?? allSolutions.find(s => s.id === sid);
      if (sol) ensureSolutionInList(sol);
    }
  }

  function setSolutionProblemLinks(solutionId: number, problemIds: number[]) {
    const problemIdSet = new Set(problemIds);
    setProblems(prev => prev.map(p => {
      if (!p.problem_id) return p;
      const has = p.solution_ids.includes(solutionId);
      const should = problemIdSet.has(p.problem_id);
      if (has === should) return p;
      if (should) return { ...p, solution_ids: [...p.solution_ids, solutionId] };
      return { ...p, solution_ids: p.solution_ids.filter(id => id !== solutionId) };
    }));
  }

  async function handleSaveProblem(draft: ProblemDraft) {
    if (!problemCard) return;
    await saveProblem(problemCard.id, {
      name: draft.name.trim(),
      parent_id: draft.parent_id === '' ? null : draft.parent_id,
      lcm_code: draft.lcm_code.trim() || null,
    });
    setProblems(prev => prev.map(p => {
      if (p.problem_id !== problemCard.id) return p;
      return {
        ...p,
        name: draft.name.trim(),
        parent_id: draft.parent_id === '' ? null : draft.parent_id,
      };
    }));
    setProblemCard(await getProblem(problemCard.id));
    await onProblemsChanged?.();
  }

  async function handleSaveSolution(draft: SolutionDraft) {
    if (!solutionCard) return;
    await saveSolution(solutionCard.id, {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      hypothesis: draft.hypothesis.trim() || null,
      parent_id: draft.parent_id === '' ? null : draft.parent_id,
      lcm_code: draft.lcm_code.trim() || null,
      fs_mapped: draft.fs_mapped,
    });
    setSolutions(prev => prev.map(s => {
      if (s.solution_id !== solutionCard.id) return s;
      return {
        ...s,
        name: draft.name.trim(),
        parent_id: draft.parent_id === '' ? null : draft.parent_id,
      };
    }));
    setSolutionCard(await getSolution(solutionCard.id));
    onSolutionCreated?.({ id: solutionCard.id, name: draft.name.trim() });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const orderedProblems = [...problems].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const orderedSolutions = [...solutions].sort((a, b) => a.sort_order - b.sort_order);
      await onSave({
        name: name.trim(),
        target_audience: null,
        maturity_id: maturityId === '' ? null : maturityId,
        activity_type_ids: activityTypeIds,
        problems: orderedProblems,
        solution_ids: orderedSolutions.map(s => s.solution_id),
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
        segments_description: segmentsDescription.trim() || null,
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

  function renderBlockBody(id: LcmBlockId) {
    if (id === 'problems') {
      return (
        <>
          <TreeList
            rows={problemRows}
            onOpen={pid => void openProblemCard(pid)}
            onRemove={removeProblem}
            onMove={moveProblem}
            onDropReorder={dropProblem}
          />
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
    if (id === 'solutions') {
      return (
        <>
          <TreeList
            rows={solutionRows}
            onOpen={sid => void openSolutionCard(sid)}
            onRemove={removeSolution}
            onMove={moveSolution}
            onDropReorder={dropSolution}
          />
          <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
            <div className="flex gap-1 text-[10px]">
              <button type="button" className={`px-2 py-0.5 rounded ${addSolutionMode === 'pick' ? 'bg-slate-200' : 'border'}`} onClick={() => setAddSolutionMode('pick')}>Из справочника</button>
              <button type="button" className={`px-2 py-0.5 rounded ${addSolutionMode === 'new' ? 'bg-slate-200' : 'border'}`} onClick={() => setAddSolutionMode('new')}>Новое</button>
            </div>
            {addSolutionMode === 'pick' ? (
              <div className="flex gap-1">
                <select className="flex-1 text-[10px] border rounded px-1 py-0.5 min-w-0" value={pickSolutionId} onChange={e => setPickSolutionId(e.target.value)}>
                  <option value="">Выберите…</option>
                  {solutionsList.filter(s => !usedSolutionIds.has(s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addSolutionToCanvas()}>+</button>
              </div>
            ) : (
              <div className="flex gap-1">
                <input className="flex-1 text-[10px] border rounded px-1 py-0.5" placeholder="Название" value={newSolutionName} onChange={e => setNewSolutionName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void addSolutionToCanvas(); } }} />
                <button type="button" className="text-[10px] px-2 border rounded" onClick={() => void addSolutionToCanvas()}>+</button>
              </div>
            )}
          </div>
        </>
      );
    }
    if (id === 'uvp') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={uvp} onChange={setUvp} />;
    }
    if (id === 'unfair') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={unfairAdvantage} onChange={setUnfairAdvantage} />;
    }
    if (id === 'segments') {
      return (
        <HypothesisConsumerSegments
          segments={segmentsCatalog}
          segmentsDescription={segmentsDescription}
          onSegmentsDescriptionChange={setSegmentsDescription}
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
          onSegmentCreated={seg => setSegmentsCatalog(prev => {
            if (prev.some(s => s.id === seg.id)) return prev;
            return [...prev, seg].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
          })}
        />
      );
    }
    if (id === 'alternatives') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={alternatives} onChange={setAlternatives} />;
    }
    if (id === 'metrics') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={keyMetrics} onChange={setKeyMetrics} />;
    }
    if (id === 'channels') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={channels} onChange={setChannels} />;
    }
    if (id === 'early') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={earlyAdopters} onChange={setEarlyAdopters} />;
    }
    if (id === 'costs') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={costStructure} onChange={setCostStructure} />;
    }
    if (id === 'revenue') {
      return <AutoGrowTextarea className="lean-canvas-textarea lcm-cell-textarea" value={revenueStreams} onChange={setRevenueStreams} />;
    }
    return null;
  }

  function renderCell(id: LcmBlockId) {
    return (
      <div key={id} className="lcm-cell">
        <div className="lcm-cell-head">
          <span className="lcm-cell-title">{LCM_BLOCK_LABELS[id]}</span>
        </div>
        <div className="lcm-cell-body">{renderBlockBody(id)}</div>
      </div>
    );
  }

  return (
    <div className="lcm-sheet space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-white"
            onClick={() => {
              if (!confirm('Сбросить видимость блоков к виду по умолчанию?')) return;
              updatePrefs(defaultLcmPrefs());
            }}
          >
            Сбросить блоки
          </button>
          <span className="text-[10px] text-slate-400">Включайте нужные блоки · сохраняется в этом браузере</span>
        </div>
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

      <div className="lcm-maturity-field">
        <label htmlFor="lcm-maturity">Уровень зрелости</label>
        <select
          id="lcm-maturity"
          className="lcm-maturity-select"
          value={maturityId}
          onChange={e => setMaturityId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">—</option>
          {maturityLevels.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 p-2 border border-slate-200 rounded bg-white text-[11px]">
        <span className="text-slate-400 shrink-0 self-center">Блоки:</span>
        {LCM_ALL_BLOCKS.map(id => {
          const on = isBlockVisible(canvasPrefs, id);
          return (
            <label key={id} className="inline-flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={on}
                onChange={() => updatePrefs(setBlockVisible(canvasPrefs, id, !on))}
              />
              <span className={on ? 'text-slate-700' : 'text-slate-400'}>{LCM_BLOCK_LABELS[id]}</span>
            </label>
          );
        })}
      </div>

      <div className="lcm-priority-grid">
        {visiblePrimary.length > 0 ? (
          <div className="lcm-priority-row lcm-priority-row--primary">
            {visiblePrimary.map(renderCell)}
          </div>
        ) : null}
        {visibleSecondary.length > 0 ? (
          <div className="lcm-priority-row lcm-priority-row--secondary">
            {visibleSecondary.map(renderCell)}
          </div>
        ) : null}
        {visibleExtra.length > 0 ? (
          <div className="lcm-priority-row lcm-priority-row--extra">
            {visibleExtra.map(renderCell)}
          </div>
        ) : null}
        {visiblePrimary.length === 0 && visibleSecondary.length === 0 && visibleExtra.length === 0 ? (
          <p className="text-xs text-slate-400 p-4">Включите хотя бы один блок выше.</p>
        ) : null}
      </div>

      {cardBusy ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 text-sm text-white">Загрузка…</div>
      ) : null}

      {problemCard ? (
        <ProblemCardModal
          mode="view"
          problem={problemCard}
          allProblems={allProblems}
          onClose={() => setProblemCard(null)}
          onSave={handleSaveProblem}
          sortCodesBy="lcm"
          lcmLinks={{
            hypothesisId: hypothesis.id,
            hypothesisName: name || hypothesis.name,
            linkedSolutionIds: problems.find(p => p.problem_id === problemCard.id)?.solution_ids ?? [],
            availableSolutions: solutions.map(s => {
              const catalog = solutionsList.find(x => x.id === s.solution_id);
              const fromHyp = (hypothesis.solutions ?? []).find(x => x.id === s.solution_id);
              return {
                id: s.solution_id,
                name: s.name,
                parent_id: s.parent_id ?? catalog?.parent_id ?? null,
                catalog_code: catalog?.catalog_code ?? fromHyp?.catalog_code ?? null,
                hypothesis_code:
                  solutionLcmCodes.get(s.solution_id)
                  ?? fromHyp?.hypothesis_code
                  ?? catalog?.hypothesis_codes?.[hypothesis.name]
                  ?? null,
                lcm_code: catalog?.lcm_code ?? fromHyp?.lcm_code ?? null,
                sort_order: s.sort_order,
              };
            }),
            solutionCatalog: solutionsList.map(s => ({
              id: s.id,
              name: s.name,
              parent_id: s.parent_id ?? null,
              catalog_code: s.catalog_code ?? null,
              hypothesis_code: s.hypothesis_codes?.[hypothesis.name] ?? s.hypothesis_code ?? null,
              lcm_code: s.lcm_code ?? null,
              sort_order: s.sort_order ?? 0,
            })),
            onChange: ids => setProblemSolutionLinks(problemCard.id, ids),
          }}
        />
      ) : null}

      {solutionCard ? (
        <SolutionCardModal
          mode="view"
          solution={solutionCard}
          allSolutions={solutionsList}
          hypothesisOptions={[name || hypothesis.name]}
          fsGroups={fsGroups}
          fsItems={fsItems}
          widgets={widgets}
          onLoadFsLinks={async id => (await getSolutionFsLinks(id)).fs_links}
          onSaveFsLinks={async (id, links) => (await saveSolutionFsLinks(id, links)).fs_links}
          onLoadWidgetLinks={async id => (await getSolutionWidgetLinksForSolution(id)).widget_ids}
          onSaveWidgetLinks={async (id, ids) => (await saveSolutionWidgetLinksForSolution(id, ids)).widget_ids}
          onClose={() => setSolutionCard(null)}
          onSave={handleSaveSolution}
          sortCodesBy="lcm"
          lcmLinks={{
            hypothesisId: hypothesis.id,
            hypothesisName: name || hypothesis.name,
            linkedProblemIds: problems
              .filter(p => p.problem_id && p.solution_ids.includes(solutionCard.id))
              .map(p => p.problem_id!),
            availableProblems: problems
              .filter(p => p.problem_id)
              .map(p => {
                const catalog = allProblems.find(x => x.id === p.problem_id);
                return {
                  id: p.problem_id!,
                  name: p.name,
                  parent_id: p.parent_id ?? catalog?.parent_id ?? null,
                  catalog_code: catalog?.catalog_code ?? null,
                  hypothesis_code: problemLcmCodes.get(p.problem_id!) ?? catalog?.hypothesis_codes?.[hypothesis.name] ?? null,
                  lcm_code: catalog?.lcm_code ?? p.lcm_code ?? null,
                  sort_order: p.sort_order ?? 0,
                };
              }),
            problemCatalog: allProblems.map(p => ({
              id: p.id,
              name: p.name,
              parent_id: p.parent_id ?? null,
              catalog_code: p.catalog_code ?? null,
              hypothesis_code: p.hypothesis_codes?.[hypothesis.name] ?? null,
              lcm_code: p.lcm_code ?? null,
              sort_order: p.sort_order ?? 0,
            })),
            onChange: ids => setSolutionProblemLinks(solutionCard.id, ids),
          }}
        />
      ) : null}
    </div>
  );
}
