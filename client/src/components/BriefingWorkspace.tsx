import React, { useEffect, useState, useCallback } from 'react';
import type {
  BriefingFull, Industry, Segment, MaturityLevel, Problem, Solution, Widget,
  BriefingFsSel, BriefingParams, PhaseConfig, TeamProportions, BriefingCalcResult,
  FsQueueKey, FsQueuesMap, BriefingAssessment,
} from '../types';
import {
  FS_QUEUE_KEYS, FS_QUEUE_LABELS, parseQueuesJson, anyQueueEnabled, itemQueues,
} from '../types';
import { compareFsByGroupPrefix, compareFsPrefix } from '../utils/fsPrefixSort';
import {
  getBriefing, updateBriefing, saveBriefingProblems, saveBriefingSolutions,
  saveBriefingWidgets, saveBriefingFs, saveBriefingParams, deriveBriefingFs,
  calculateBriefing, generateProjectFromBriefing, patchBriefingAssessment,
  getIndustries, getSegmentsByIndustry, getMaturityLevels, getProblems, getSolutions,
  getWidgetsBySolution,
} from '../api';
import { applyAssessmentPatch, recomputeAssessmentDerived } from '../assessmentCalc';
import { loadAssessmentNsi, type AssessmentNsiCache } from '../assessmentNsi';
import AssessmentTab from './AssessmentTab';
import HeadcountCoeffsPanel from './HeadcountCoeffsPanel';

type Tab = 'customer' | 'problems' | 'solutions' | 'fs' | 'assessment' | 'params' | 'summary';

const TABS: { id: Tab; label: string }[] = [
  { id: 'customer', label: 'Заказчик' },
  { id: 'problems', label: 'Проблематики' },
  { id: 'solutions', label: 'Решения + виджеты' },
  { id: 'fs', label: 'ФС + очереди' },
  { id: 'assessment', label: 'Параметры оценки' },
  { id: 'params', label: 'Параметры РП' },
  { id: 'summary', label: 'Итоги' },
];

const SCENARIOS = ['Кейс', 'ПРОФ', 'Совм.запуск'];

const HEADCOUNT_CATEGORIES = ['до 200', '201-500', '501-1000', '1001+'] as const;

function categoryToHeadcount(cat: string): number {
  const map: Record<string, number> = { 'до 200': 200, '201-500': 350, '501-1000': 750, '1001+': 1500 };
  return map[cat] ?? 200;
}

const OVERRIDE_INPUT_CLASS = 'bg-amber-50 border-amber-300';

const TEAM_LABELS: { key: keyof TeamProportions; label: string }[] = [
  { key: 'рп', label: 'РП' },
  { key: 'аналит_конс', label: 'Аналитик-консультант' },
  { key: 'аналит_эксп', label: 'Аналитик-эксперт' },
  { key: 'архит', label: 'Архитектор' },
  { key: 'програм1', label: 'Программист 1' },
  { key: 'програм2', label: 'Программист 2' },
  { key: 'куратор', label: 'Куратор' },
];

const SAVE_BTN_CLASS =
  'text-sm bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50';

import { yesNoLabel, yesNoClass } from '../utils/yesNoBadge';

function defaultExpandedGroups(items: BriefingFsSel[]): Set<string> {
  const groups = groupFsItems(items);
  const expanded = new Set<string>();
  for (const { group, items: groupItems } of groups) {
    if (groupItems.some(i => i.matched)) expanded.add(group);
  }
  return expanded;
}

function queueTotals(items: BriefingFsSel[]): { allQueues: number; byQueue: Record<FsQueueKey, number> } {
  const byQueue = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, 0])) as Record<FsQueueKey, number>;
  let allQueues = 0;
  for (const item of items) {
    const queues = itemQueues(item);
    const sp = item.story_points ?? 0;
    const anyOn = anyQueueEnabled(queues);
    if (anyOn) allQueues += sp;
    for (const q of FS_QUEUE_KEYS) {
      if (queues[q] === 1) byQueue[q] += sp;
    }
  }
  return { allQueues, byQueue };
}

function groupFsItems(items: BriefingFsSel[]): { group: string; groupPrefix: string | null; items: BriefingFsSel[] }[] {
  const map = new Map<string, BriefingFsSel[]>();
  for (const item of items) {
    const g = item.group_name || item.phase || 'Прочее';
    const list = map.get(g) ?? [];
    list.push(item);
    map.set(g, list);
  }
  return [...map.entries()]
    .map(([group, groupItems]) => ({
      group,
      groupPrefix: groupItems.find(i => i.group_prefix)?.group_prefix ?? null,
      items: [...groupItems].sort(compareFsPrefix),
    }))
    .sort((a, b) => compareFsByGroupPrefix(
      { group_prefix: a.groupPrefix },
      { group_prefix: b.groupPrefix },
    ));
}

function itemQueueFlags(item: BriefingFsSel): { allOn: boolean; byQueue: Record<FsQueueKey, boolean> } {
  const queues = itemQueues(item);
  return {
    allOn: anyQueueEnabled(queues),
    byQueue: Object.fromEntries(
      FS_QUEUE_KEYS.map(q => [q, queues[q] === 1]),
    ) as Record<FsQueueKey, boolean>,
  };
}

function aggregateGroupQueues(groupItems: BriefingFsSel[]): { allOn: boolean; byQueue: Record<FsQueueKey, boolean> } {
  const byQueue = Object.fromEntries(FS_QUEUE_KEYS.map(q => [q, false])) as Record<FsQueueKey, boolean>;
  let allOn = false;
  for (const item of groupItems) {
    const flags = itemQueueFlags(item);
    if (flags.allOn) allOn = true;
    for (const q of FS_QUEUE_KEYS) {
      if (flags.byQueue[q]) byQueue[q] = true;
    }
  }
  return { allOn, byQueue };
}

type QueueDragPayload = { fsItemId: number; fromQueue: FsQueueKey };

function FsQueueTable({
  items, onChange,
}: {
  items: BriefingFsSel[];
  onChange: (item: BriefingFsSel, patch: Partial<BriefingFsSel>) => void;
}) {
  const [dragPayload, setDragPayload] = useState<QueueDragPayload | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => defaultExpandedGroups(items));
  const [expandedItems, setExpandedItems] = useState<Set<number>>(() => new Set());
  const groups = groupFsItems(items);
  const totals = queueTotals(items);

  useEffect(() => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      for (const { group, items: groupItems } of groupFsItems(items)) {
        if (!prev.has(group) && groupItems.some(i => i.matched)) next.add(group);
      }
      return next;
    });
  }, [items]);

  function toggleGroup(group: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleItem(fsItemId: number) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(fsItemId)) next.delete(fsItemId);
      else next.add(fsItemId);
      return next;
    });
  }

  function patchQueues(item: BriefingFsSel, queues: FsQueuesMap) {
    const primary = FS_QUEUE_KEYS.find(k => queues[k] === 1) ?? '1';
    const enabled = anyQueueEnabled(queues) ? 1 : 0;
    const patch: Partial<BriefingFsSel> = {
      queues_json: queues,
      queue: primary,
      enabled,
      source: 'manual',
    };
    if (item.matched === false) patch.matched = true;
    onChange(item, patch);
  }

  function toggleQueue(item: BriefingFsSel, q: FsQueueKey) {
    const queues = parseQueuesJson(item.queues_json);
    queues[q] = queues[q] ? 0 : 1;
    patchQueues(item, queues);
  }

  function moveToQueue(item: BriefingFsSel, q: FsQueueKey) {
    const queues: FsQueuesMap = { '1': 0, '2': 0, '3': 0, '4': 0 };
    queues[q] = 1;
    patchQueues(item, queues);
  }

  function startQueueDrag(e: React.DragEvent, item: BriefingFsSel, fromQueue: FsQueueKey) {
    e.stopPropagation();
    const payload = { fsItemId: item.fs_item_id, fromQueue };
    setDragPayload(payload);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-fs-queue', JSON.stringify(payload));
  }

  function endQueueDrag() {
    setDragPayload(null);
  }

  function handleQueueDrop(e: React.DragEvent, item: BriefingFsSel, targetQueue: FsQueueKey) {
    e.preventDefault();
    e.stopPropagation();
    let payload = dragPayload;
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/x-fs-queue')) as QueueDragPayload;
      } catch {
        return;
      }
    }
    if (payload.fsItemId !== item.fs_item_id || payload.fromQueue === targetQueue) {
      setDragPayload(null);
      return;
    }
    moveToQueue(item, targetQueue);
    setDragPayload(null);
  }

  return (
    <div className="overflow-auto max-h-[calc(100vh-220px)] border border-slate-200 rounded">
      <table className="w-full text-xs border-collapse min-w-[900px]">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-50 text-slate-600">
            <th className="text-left p-2 border w-14 bg-slate-50">№</th>
            <th className="text-left p-2 border min-w-[200px] bg-slate-50">Пункт ФС / Расшифровка</th>
            <th className="text-left p-2 border w-28 bg-slate-50">Тип функционала</th>
            <th className="text-left p-2 border min-w-[140px] bg-slate-50">Виджеты</th>
            <th className="text-center p-2 border w-24 bg-slate-50">Все очереди</th>
            {FS_QUEUE_KEYS.map(q => (
              <th key={q} className="text-center p-2 border w-20 bg-slate-50">{FS_QUEUE_LABELS[q]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ group, groupPrefix, items: groupItems }) => {
            const isExpanded = expandedGroups.has(group);
            const groupQueues = aggregateGroupQueues(groupItems);
            return (
            <React.Fragment key={group}>
              <tr className="bg-amber-50 font-semibold">
                <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="text-slate-600 hover:text-slate-900 w-6 h-6 leading-none shrink-0"
                      title={isExpanded ? 'Свернуть группу' : 'Развернуть группу'}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <span>{groupPrefix || '—'}</span>
                  </div>
                </td>
                <td className="p-2 border">
                  {group}
                  <span className="ml-2 text-[10px] font-normal text-slate-500">
                    ({groupItems.length})
                  </span>
                </td>
                <td className="p-2 border" />
                <td className="p-2 border" />
                <td className="p-2 border text-center">
                  <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupQueues.allOn)}`}>
                    {yesNoLabel(groupQueues.allOn)}
                  </span>
                </td>
                {FS_QUEUE_KEYS.map(q => (
                  <td key={q} className="p-2 border text-center">
                    <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupQueues.byQueue[q])}`}>
                      {yesNoLabel(groupQueues.byQueue[q])}
                    </span>
                  </td>
                ))}
              </tr>
              {isExpanded && groupItems.map(item => {
                const queues = itemQueues(item);
                const allOn = anyQueueEnabled(queues);
                const unmatched = item.matched === false;
                const isItemExpanded = expandedItems.has(item.fs_item_id);
                const hasChildren = (item.details ?? []).length > 0 || (item.matched_widgets ?? []).length > 0;
                return (
                  <React.Fragment key={item.fs_item_id}>
                    <tr className={`hover:bg-slate-50 ${unmatched ? 'bg-red-50/30' : ''}`}>
                      <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top">
                        {item.prefix || '—'}
                      </td>
                      <td className="p-2 border">
                        <div className="flex items-start gap-1">
                          {hasChildren ? (
                            <button
                              type="button"
                              onClick={() => toggleItem(item.fs_item_id)}
                              className="text-slate-500 hover:text-slate-800 w-5 h-5 leading-none shrink-0 mt-0.5"
                              title={isItemExpanded ? 'Свернуть пункт' : 'Развернуть пункт'}
                            >
                              {isItemExpanded ? '▼' : '▶'}
                            </button>
                          ) : (
                            <span className="w-5 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium">{item.name}</div>
                            {item.description && <div className="text-[10px] text-slate-400 mt-0.5">{item.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 border text-[11px] text-slate-600 whitespace-nowrap">
                        {item.func_type || '—'}
                      </td>
                      <td className="p-2 border text-[10px] text-slate-400">
                        {(item.matched_widgets ?? []).length > 0
                          ? `${item.matched_widgets!.length} выбрано`
                          : '—'}
                      </td>
                      <td className="p-2 border text-center">
                        <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(allOn, unmatched && !allOn)}`}>
                          {yesNoLabel(allOn)}
                        </span>
                      </td>
                      {FS_QUEUE_KEYS.map(q => {
                        const isYes = queues[q] === 1;
                        const isDropTarget = dragPayload?.fsItemId === item.fs_item_id
                          && dragPayload.fromQueue !== q;
                        return (
                          <td
                            key={q}
                            className={`p-2 border text-center ${
                              isDropTarget ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : ''
                            }`}
                            onDragOver={e => {
                              if (dragPayload?.fsItemId === item.fs_item_id) e.preventDefault();
                            }}
                            onDrop={e => handleQueueDrop(e, item, q)}
                          >
                            <button
                              type="button"
                              draggable={isYes}
                              className={`px-2 py-0.5 rounded min-w-[36px] ${
                                yesNoClass(isYes, unmatched && !isYes)
                              } ${isYes ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                              title={isYes ? 'Перетащите в другую очередь' : 'Клик — переключить Да/Нет'}
                              onDragStart={isYes ? e => startQueueDrag(e, item, q) : undefined}
                              onDragEnd={endQueueDrag}
                              onClick={() => toggleQueue(item, q)}
                            >
                              {yesNoLabel(isYes)}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                    {isItemExpanded && (item.details ?? []).map((d, i) => (
                      <tr key={`${item.fs_item_id}-d-${i}`} className="text-slate-500">
                        <td className="p-2 border" />
                        <td className="p-2 border pl-6" colSpan={4 + FS_QUEUE_KEYS.length}>
                          <span className="text-[10px]">↳ {d.name}</span>
                          {d.description && <span className="text-[10px] text-slate-400"> — {d.description}</span>}
                        </td>
                      </tr>
                    ))}
                    {isItemExpanded && (item.matched_widgets ?? []).map(w => (
                      <tr key={`${item.fs_item_id}-w-${w.id}`} className="text-slate-600 bg-slate-50/40">
                        <td className="p-2 border" />
                        <td className="p-2 border pl-8">
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-400 shrink-0">↳</span>
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium">{w.name}</div>
                              {w.description && (
                                <div className="text-[10px] text-slate-400 mt-0.5">{w.description}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-2 border text-[10px] text-slate-400">
                          {item.func_type || '—'}
                        </td>
                        <td className="p-2 border">
                          {widgetImageUrl(w.image_path) ? (
                            <WidgetImageThumbnail imagePath={w.image_path} name={w.name} />
                          ) : (
                            <span className="text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                        <td className="p-2 border" />
                        {FS_QUEUE_KEYS.map(q => (
                          <td key={q} className="p-2 border" />
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 font-semibold text-slate-700">
            <td className="p-2 border" colSpan={4}>Итого SP (только «Да»)</td>
            <td className="p-2 border text-center">{totals.allQueues || '—'}</td>
            {FS_QUEUE_KEYS.map(q => (
              <td key={q} className="p-2 border text-center">
                {totals.byQueue[q] || '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function widgetImageUrl(imagePath?: string | null): string | null {
  return imagePath ? `/api/uploads/${imagePath}` : null;
}

function ImagePreviewModal({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-700 truncate pr-4">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className="p-4 overflow-auto">
          <img src={src} alt={title} className="max-w-full max-h-[calc(90vh-4rem)] object-contain mx-auto" />
        </div>
      </div>
    </div>
  );
}

function WidgetImageThumbnail({ imagePath, name }: { imagePath?: string | null; name: string }) {
  const [open, setOpen] = useState(false);
  const url = widgetImageUrl(imagePath);
  if (!url) return null;

  return (
    <>
      <img
        src={url}
        alt={name}
        title={name}
        className="w-16 h-12 object-contain border border-slate-200 rounded bg-white shrink-0 cursor-pointer hover:border-slate-400"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      />
      {open && <ImagePreviewModal src={url} title={name} onClose={() => setOpen(false)} />}
    </>
  );
}

type SaveFeedback = { tab: Tab; type: 'success' | 'error'; message: string };

function TabSaveBar({
  tabId, onSave, savingTab, feedback,
}: {
  tabId: Tab;
  onSave: () => void;
  savingTab: Tab | null;
  feedback: SaveFeedback | null;
}) {
  const saving = savingTab === tabId;
  const fb = feedback?.tab === tabId ? feedback : null;
  return (
    <div className="flex items-center gap-3 pt-4 mt-4 border-t border-slate-100">
      <button onClick={onSave} disabled={saving} className={SAVE_BTN_CLASS}>
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
      {fb && (
        <span className={`text-sm ${fb.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
          {fb.message}
        </span>
      )}
    </div>
  );
}

interface Props {
  briefingId: number;
  currentUserId: number | null;
  onProjectGenerated: (projectId: number) => void;
}

function parseJson<T>(val: string | T, fallback: T): T {
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

export default function BriefingWorkspace({ briefingId, currentUserId, onProjectGenerated }: Props) {
  const [tab, setTab] = useState<Tab>('customer');
  const [data, setData] = useState<BriefingFull | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [maturityLevels, setMaturityLevels] = useState<MaturityLevel[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [availableSolutions, setAvailableSolutions] = useState<Solution[]>([]);
  const [solutionWidgets, setSolutionWidgets] = useState<Record<number, Widget[]>>({});
  const [calc, setCalc] = useState<BriefingCalcResult | null>(null);
  const [savingTab, setSavingTab] = useState<Tab | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [customProblem, setCustomProblem] = useState('');
  const [assessmentNsi, setAssessmentNsi] = useState<AssessmentNsiCache | null>(null);
  const [assessmentRecalcFlash, setAssessmentRecalcFlash] = useState(0);

  const load = useCallback(async () => {
    const b = await getBriefing(briefingId);
    setData(b);
  }, [briefingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    setAssessmentNsi(null);
    void loadAssessmentNsi().then(cache => {
      if (!cancelled) setAssessmentNsi(cache);
    });
    return () => { cancelled = true; };
  }, [briefingId]);

  useEffect(() => {
    if (!assessmentNsi || !data?.assessment) return;
    setData(d => {
      if (!d?.assessment) return d;
      const assessment = recomputeAssessmentDerived(
        d.assessment,
        { headcount: d.headcount, fs_items: d.fs_items },
        assessmentNsi,
      );
      return { ...d, assessment };
    });
  }, [assessmentNsi]);

  useEffect(() => {
    getIndustries().then(setIndustries);
    getMaturityLevels().then(setMaturityLevels);
  }, []);

  useEffect(() => {
    if (!data?.industry_id) { setSegments([]); return; }
    getSegmentsByIndustry(data.industry_id).then(setSegments);
  }, [data?.industry_id]);

  useEffect(() => {
    if (!data) return;
    getProblems({
      industry_id: data.industry_id ?? undefined,
      segment_id: data.segment_id ?? undefined,
    }).then(setProblems);
  }, [data?.industry_id, data?.segment_id]);

  useEffect(() => {
    if (!data) return;
    const probIds = data.problems.filter(p => p.problem_id).map(p => p.problem_id!);
    getSolutions(probIds.length > 0 ? probIds : undefined).then(setAvailableSolutions);
  }, [data?.problems]);

  useEffect(() => {
    if (!data) return;
    for (const sol of data.solutions) {
      if (!solutionWidgets[sol.id]) {
        getWidgetsBySolution(sol.id).then(ws => {
          setSolutionWidgets(prev => ({ ...prev, [sol.id]: ws }));
        });
      }
    }
  }, [data?.solutions]);

  useEffect(() => {
    if (tab === 'summary' && data) {
      calculateBriefing(briefingId).then(setCalc);
    }
  }, [tab, briefingId, data?.fs_items]);

  async function runTabSave(tabId: Tab, fn: () => Promise<void>) {
    setSavingTab(tabId);
    setSaveFeedback(null);
    try {
      await fn();
      setSaveFeedback({ tab: tabId, type: 'success', message: 'Сохранено' });
      setTimeout(() => setSaveFeedback(prev => (prev?.tab === tabId ? null : prev)), 3000);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка сохранения';
      setSaveFeedback({ tab: tabId, type: 'error', message });
    } finally {
      setSavingTab(null);
    }
  }

  function saveCustomerTab() {
    if (!data) return;
    void runTabSave('customer', async () => {
      await updateBriefing(briefingId, {
        name: data.name, industry_id: data.industry_id, segment_id: data.segment_id,
        scenario: data.scenario, headcount: data.headcount,
      });
      if (data.assessment) {
        await patchBriefingAssessment(briefingId, {
          headcount_category: data.assessment.headcount_category,
          headcount_coeffs: data.assessment.headcount_coeffs,
          headcount_manual: data.assessment.headcount_manual,
        });
      }
    });
  }

  function handleHeadcountCategoryChange(cat: string) {
    const headcount = categoryToHeadcount(cat);
    setData(d => (d ? { ...d, headcount } : d));
    updateAssessment({ headcount_category: cat, headcount_manual: true });
  }

  function saveProblemsTab() {
    if (!data) return;
    void runTabSave('problems', async () => {
      await saveBriefingProblems(briefingId, data.problems.map(s => ({
        problem_id: s.problem_id ?? undefined,
        custom_text: s.custom_text ?? undefined,
      })));
      await load();
    });
  }

  function saveSolutionsTab() {
    if (!data) return;
    void runTabSave('solutions', async () => {
      await saveBriefingSolutions(briefingId, data.solutions.map(s => s.id));
      await saveBriefingWidgets(briefingId, data.widgets.map(w => ({
        solution_id: w.solution_id,
        widget_id: w.widget_id,
      })));
      await load();
    });
  }

  function saveFsTab() {
    if (!data) return;
    void runTabSave('fs', async () => {
      await saveBriefingFs(briefingId, data.fs_items.map(i => {
        const q = itemQueues(i);
        return {
          fs_item_id: i.fs_item_id,
          enabled: anyQueueEnabled(q) ? 1 : 0,
          queue: i.queue,
          queues_json: typeof i.queues_json === 'string' ? i.queues_json : JSON.stringify(i.queues_json ?? parseQueuesJson(null)),
          source: i.source ?? undefined,
          story_points: i.story_points ?? undefined,
        };
      }));
      await load();
    });
  }

  function isOrgVolumeOnlyPatch(patch: Record<string, unknown>): boolean {
    const keys = Object.keys(patch);
    return keys.length > 0 && keys.every(k => k === 'org_volume' || k === 'org_volume_manual');
  }

  function updateAssessment(patch: Record<string, unknown>) {
    if (!isOrgVolumeOnlyPatch(patch)) {
      setAssessmentRecalcFlash(k => k + 1);
    }
    setData(d => {
      if (!d?.assessment) return d;
      const patched = applyAssessmentPatch(d.assessment, patch);
      const nsi: AssessmentNsiCache = assessmentNsi ?? {
        projectTypes: patched.project_types ?? d.assessment.project_types ?? [],
        ratesByTypeId: new Map(),
        coeffsByTypeId: new Map(),
      };
      const assessment = recomputeAssessmentDerived(
        patched,
        { headcount: d.headcount, fs_items: d.fs_items },
        nsi,
      );
      return { ...d, assessment };
    });
  }

  function applyAssessmentFromServer(assessment: BriefingAssessment) {
    setAssessmentRecalcFlash(k => k + 1);
    setData(d => {
      if (!d) return d;
      const nsi: AssessmentNsiCache = assessmentNsi ?? {
        projectTypes: assessment.project_types ?? [],
        ratesByTypeId: new Map(),
        coeffsByTypeId: new Map(),
      };
      const next = recomputeAssessmentDerived(
        assessment,
        { headcount: d.headcount, fs_items: d.fs_items },
        nsi,
      );
      return { ...d, assessment: next };
    });
  }

  function handleAssessmentChange(patch: Record<string, unknown>) {
    if (patch.reset_project_type) {
      void patchBriefingAssessment(briefingId, { reset_project_type: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_risks) {
      void patchBriefingAssessment(briefingId, { reset_risks: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_org_volume) {
      void patchBriefingAssessment(briefingId, { reset_org_volume: true })
        .then(applyAssessmentFromServer);
      return;
    }
    if (patch.reset_headcount) {
      void patchBriefingAssessment(briefingId, { reset_headcount: true })
        .then(applyAssessmentFromServer);
      return;
    }
    updateAssessment(patch);
  }

  function saveAssessmentTab() {
    if (!data?.assessment) return;
    const a = data.assessment;
    void runTabSave('assessment', async () => {
      await patchBriefingAssessment(briefingId, {
        criteria: a.criteria,
        project_type_id: a.project_type_id,
        project_type_manual: a.project_type_manual,
        risks: a.risks,
        risks_manual: a.risks_manual,
        org_volume: a.org_volume,
        org_volume_manual: a.org_volume_manual,
      });
      await load();
    });
  }

  function saveParamsTab() {
    if (!data) return;
    const p = data.params;
    const ph = parseJson<PhaseConfig[]>(p.phases_json, []);
    const tm = parseJson<TeamProportions>(p.team_json, {
      рп: 0.15, аналит_конс: 0.25, аналит_эксп: 0.1,
      архит: 0.15, програм1: 0.2, програм2: 0.1, куратор: 0.05,
    });
    void runTabSave('params', async () => {
      await saveBriefingParams(briefingId, {
        hourly_rate: p.hourly_rate,
        accuracy: p.accuracy,
        sp_cost_rub: p.sp_cost_rub,
        phases_json: ph,
        team_json: tm,
      });
      if (data.assessment) {
        const a = data.assessment;
        await patchBriefingAssessment(briefingId, {
          queue_calcs: a.queue_calcs.map(qc => ({
            queue: qc.queue,
            technology: qc.technology,
            rate: qc.rate,
            rate_manual: qc.rate_manual === 1,
          })),
          headcount_category: a.headcount_category,
          headcount_coeffs: a.headcount_coeffs,
          headcount_manual: a.headcount_manual,
        });
      }
      await load();
    });
  }

  function saveSummaryTab() {
    void runTabSave('summary', async () => {
      const result = await calculateBriefing(briefingId);
      setCalc(result);
    });
  }

  async function toggleProblem(problemId: number) {
    if (!data) return;
    const selected = data.problems.some(p => p.problem_id === problemId);
    const selections = selected
      ? data.problems.filter(p => p.problem_id !== problemId)
      : [...data.problems, { problem_id: problemId, custom_text: null }];
    await saveBriefingProblems(briefingId, selections.map(s => ({
      problem_id: s.problem_id ?? undefined,
      custom_text: s.custom_text ?? undefined,
    })));
    await load();
  }

  async function addCustomProblem() {
    if (!data || !customProblem.trim()) return;
    await saveBriefingProblems(briefingId, [
      ...data.problems.map(s => ({ problem_id: s.problem_id ?? undefined, custom_text: s.custom_text ?? undefined })),
      { custom_text: customProblem.trim() },
    ]);
    setCustomProblem('');
    await load();
  }

  async function toggleSolution(solutionId: number) {
    if (!data) return;
    const ids = data.solutions.map(s => s.id);
    const newIds = ids.includes(solutionId) ? ids.filter(id => id !== solutionId) : [...ids, solutionId];
    await saveBriefingSolutions(briefingId, newIds);
    await load();
  }

  async function toggleWidget(solutionId: number, widgetId: number) {
    if (!data) return;
    const key = `${solutionId}-${widgetId}`;
    const exists = data.widgets.some(w => w.solution_id === solutionId && w.widget_id === widgetId);
    const selections = exists
      ? data.widgets.filter(w => !(w.solution_id === solutionId && w.widget_id === widgetId))
      : [...data.widgets, { solution_id: solutionId, widget_id: widgetId }];
    await saveBriefingWidgets(briefingId, selections);
    await load();
  }

  async function handleDeriveFs() {
    await deriveBriefingFs(briefingId);
    await load();
    setTab('fs');
  }

  async function updateFsItem(item: BriefingFsSel, patch: Partial<BriefingFsSel>) {
    if (!data) return;
    const merged = { ...item, ...patch, source: patch.source ?? item.source ?? 'manual' };
    const queues = itemQueues(merged);
    merged.enabled = anyQueueEnabled(queues) ? 1 : 0;
    const items = data.fs_items.map(i =>
      i.fs_item_id === item.fs_item_id ? merged : i
    );
    setData({ ...data, fs_items: items });
    await saveBriefingFs(briefingId, items.map(i => {
      const q = itemQueues(i);
      return {
        fs_item_id: i.fs_item_id,
        enabled: anyQueueEnabled(q) ? 1 : 0,
        queue: i.queue,
        queues_json: typeof i.queues_json === 'string' ? i.queues_json : JSON.stringify(i.queues_json ?? parseQueuesJson(null)),
        source: i.source ?? undefined,
        story_points: i.story_points ?? undefined,
      };
    }));
    await load();
  }

  async function saveParams(params: Partial<BriefingParams>) {
    await saveBriefingParams(briefingId, params);
    await load();
  }

  async function handleGenerateProject() {
    const name = prompt('Название проекта:', data?.name ? `Проект — ${data.name}` : undefined);
    if (!name) return;
    const { project_id } = await generateProjectFromBriefing(briefingId, {
      name, created_by: currentUserId ?? undefined,
    });
    onProjectGenerated(project_id);
  }

  if (!data) {
    return <div className="flex-1 flex items-center justify-center text-slate-400">Загрузка...</div>;
  }

  const params = data.params;
  const phases = parseJson<PhaseConfig[]>(params.phases_json, []);
  const team = parseJson<TeamProportions>(params.team_json, {
    рп: 0.15, аналит_конс: 0.25, аналит_эксп: 0.1,
    архит: 0.15, програм1: 0.2, програм2: 0.1, куратор: 0.05,
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-4 flex gap-0 shrink-0 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-xs px-3 py-2.5 border-b-2 whitespace-nowrap transition-colors font-medium
              ${tab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'customer' && (
          <div className="max-w-lg space-y-4">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Название оценки</label>
              <input className="w-full text-sm border rounded px-3 py-2" value={data.name}
                onChange={e => setData({ ...data, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Отрасль</label>
              <select className="w-full text-sm border rounded px-3 py-2"
                value={data.industry_id ?? ''}
                onChange={e => setData({ ...data, industry_id: e.target.value ? Number(e.target.value) : null, segment_id: null })}>
                <option value="">— выберите —</option>
                {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Сегмент</label>
              <select className="w-full text-sm border rounded px-3 py-2"
                value={data.segment_id ?? ''}
                onChange={e => setData({ ...data, segment_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— выберите —</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {segments.length === 0 && data.industry_id && (
                <p className="text-[10px] text-amber-600 mt-1">Нет привязанных сегментов для отрасли</p>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Сценарий</label>
              <select className="w-full text-sm border rounded px-3 py-2"
                value={data.scenario ?? ''}
                onChange={e => setData({ ...data, scenario: e.target.value || null })}>
                <option value="">— выберите —</option>
                {SCENARIOS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">Численность (категория C62)</label>
                {data.assessment?.headcount_manual && (
                  <button type="button" className="text-[10px] text-blue-600 hover:underline"
                    onClick={() => updateAssessment({ reset_headcount: true })}>
                    Сбросить к авто
                  </button>
                )}
              </div>
              <select
                className={`w-full text-sm border rounded px-3 py-2 ${data.assessment?.headcount_manual ? OVERRIDE_INPUT_CLASS : ''}`}
                value={data.assessment?.headcount_category ?? 'до 200'}
                onChange={e => handleHeadcountCategoryChange(e.target.value)}
              >
                {HEADCOUNT_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <TabSaveBar tabId="customer" onSave={saveCustomerTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}

        {tab === 'problems' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Выберите проблематики заказчика (фильтр по отрасли/сегменту)</p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {problems.map(p => (
                <label key={p.id} className="flex items-start gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" className="mt-0.5"
                    checked={data.problems.some(bp => bp.problem_id === p.id)}
                    onChange={() => toggleProblem(p.id)} />
                  <div>
                    <div className="text-sm">{p.name}</div>
                    {(p.segment_name || p.maturity_name) && (
                      <div className="text-[10px] text-slate-400">{[p.segment_name, p.maturity_name].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                </label>
              ))}
              {problems.length === 0 && (
                <p className="text-sm text-amber-600">
                  {data.industry_id
                    ? 'Нет проблематик для выбранной отрасли/сегмента. Проверьте вкладку «Заказчик» или запустите импорт справочника.'
                    : 'Справочник не загружен. Запустите: npm run import:briefing-data --workspace=server'}
                </p>
              )}
            </div>
            {data.problems.filter(p => p.custom_text).map((p, i) => (
              <div key={`custom-${i}`} className="text-sm bg-amber-50 border border-amber-200 rounded px-3 py-2">
                {p.custom_text} <span className="text-[10px] text-amber-600">(свободный ввод)</span>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="flex-1 text-sm border rounded px-3 py-2" placeholder="Свободный ввод проблематики"
                value={customProblem} onChange={e => setCustomProblem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomProblem(); }} />
              <button onClick={addCustomProblem} className="text-sm bg-slate-100 px-3 py-2 rounded hover:bg-slate-200">+</button>
            </div>
            <TabSaveBar tabId="problems" onSave={saveProblemsTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}

        {tab === 'solutions' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Выберите решения и виджеты в контексте каждого решения</p>
            {availableSolutions.length === 0 && (
              <p className="text-sm text-amber-600">Нет решений. Выберите проблематики или заполните связи в админке.</p>
            )}
            {availableSolutions.map(sol => {
              const selected = data.solutions.some(s => s.id === sol.id);
              const widgets = solutionWidgets[sol.id] ?? [];
              return (
                <div key={sol.id} className={`border rounded p-3 ${selected ? 'border-blue-300 bg-blue-50/30' : 'border-slate-200'}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={selected} onChange={() => toggleSolution(sol.id)} />
                    <span className="text-sm font-medium">{sol.name}</span>
                  </label>
                  {sol.description && <p className="text-xs text-slate-500 ml-6 mt-1">{sol.description}</p>}
                  {selected && widgets.length > 0 && (
                    <div className="ml-6 mt-2 space-y-1 border-l-2 border-blue-200 pl-3">
                      <div className="text-[10px] text-slate-400 uppercase">Виджеты</div>
                      {widgets.map(w => (
                        <label key={w.id} className="flex items-start gap-2 cursor-pointer">
                          <input type="checkbox" className="mt-0.5 shrink-0"
                            checked={data.widgets.some(bw => bw.solution_id === sol.id && bw.widget_id === w.id)}
                            onChange={() => toggleWidget(sol.id, w.id)} />
                          {widgetImageUrl(w.image_path) && (
                            <WidgetImageThumbnail imagePath={w.image_path} name={w.name} />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-medium">{w.name}</div>
                            {w.description && <div className="text-[10px] text-slate-400 line-clamp-3">{w.description}</div>}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  {selected && widgets.length === 0 && (
                    <p className="text-[10px] text-slate-400 ml-6 mt-1">Нет виджетов (настройте в админке)</p>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={handleDeriveFs}
                className="text-sm bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                Сформировать ФС →
              </button>
            </div>
            <TabSaveBar tabId="solutions" onSave={saveSolutionsTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}

        {tab === 'fs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Полный каталог ФС. Группы с сопоставлениями развёрнуты; пункты ФС и детали — свёрнуты по умолчанию. На строке группы — сводные Да/Нет по дочерним пунктам. Перетащите «Да» между очередями.
              </p>
              <button onClick={handleDeriveFs} className="text-xs text-blue-500 hover:text-blue-700">Обновить из выборов</button>
            </div>
            {data.fs_items.length === 0 ? (
              <p className="text-sm text-slate-400">Каталог ФС пуст. Запустите импорт: npm run import:briefing-data --workspace=server</p>
            ) : (
              <FsQueueTable items={data.fs_items} onChange={updateFsItem} />
            )}
            <TabSaveBar tabId="fs" onSave={saveFsTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}

        {tab === 'assessment' && data.assessment && (
          <div className="space-y-3">
            <AssessmentTab
              assessment={data.assessment}
              recalcFlash={assessmentRecalcFlash}
              onChange={handleAssessmentChange}
            />
            <TabSaveBar tabId="assessment" onSave={saveAssessmentTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}

        {tab === 'params' && (
          <div className="max-w-3xl space-y-4">
            {data.assessment && (
              <>
                <HeadcountCoeffsPanel
                  assessment={data.assessment}
                  recalcFlash={assessmentRecalcFlash}
                  onChange={handleAssessmentChange}
                />
                <div>
                  <div className="text-xs text-slate-500 mb-2">Ставки по очередям (из НСИ типа проекта)</div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="p-2 border text-left">Очередь</th>
                        <th className="p-2 border text-left">Технология</th>
                        <th className="p-2 border text-right">НСИ</th>
                        <th className="p-2 border text-right">Ставка</th>
                        <th className="p-2 border w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.assessment.queue_calcs.map(qc => (
                        <tr key={qc.queue}>
                          <td className="p-2 border">{FS_QUEUE_LABELS[qc.queue as FsQueueKey] ?? qc.queue}</td>
                          <td className="p-2 border text-slate-500">{qc.technology}</td>
                          <td className="p-2 border text-right text-slate-400">{qc.nsi_rate.toLocaleString('ru')}</td>
                          <td className="p-2 border">
                            <input type="number" min="0"
                              className={`w-full text-right border rounded px-2 py-1 ${qc.rate_manual ? 'bg-amber-50 border-amber-300' : ''}`}
                              value={qc.rate}
                              onChange={e => {
                                const rate = Number(e.target.value);
                                const queue_calcs = data.assessment!.queue_calcs.map(r =>
                                  r.queue === qc.queue ? { ...r, rate, rate_manual: 1 } : r
                                );
                                updateAssessment({ queue_calcs });
                              }} />
                          </td>
                          <td className="p-2 border text-center">
                            {qc.rate_manual ? (
                              <button type="button" className="text-[10px] text-blue-600 hover:underline"
                                onClick={() => {
                                  const queue_calcs = data.assessment!.queue_calcs.map(r =>
                                    r.queue === qc.queue ? { ...r, rate: r.nsi_rate, rate_manual: 0 } : r
                                  );
                                  updateAssessment({ queue_calcs });
                                }}>
                                Сбросить к НСИ
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-2">Риски (справочно, с вкладки «Параметры оценки»)</div>
                  <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 border rounded p-3">
                    <div>РПО: {(data.assessment.risks.c52_rpo * 100).toFixed(0)}%</div>
                    <div>Фонд: {(data.assessment.risks.c53_company_fund * 100).toFixed(1)}%</div>
                    <div>РК: {(data.assessment.risks.c57_rk * 100).toFixed(0)}%</div>
                    <div>Риски дог.: {(data.assessment.risks.c54_contract_rpo * 100).toFixed(0)}%</div>
                    <div>Комп. продаж: {(data.assessment.risks.c56_sales_comp * 100).toFixed(0)}%</div>
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-slate-500 block mb-1">Базовая ставка (legacy расчёт), руб/ч</label>
              <input type="number" className="w-full text-sm border rounded px-3 py-2 max-w-xs"
                value={params.hourly_rate}
                onChange={e => saveParams({ hourly_rate: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Точность оценки (C58)</label>
              <select className="w-full text-sm border rounded px-3 py-2" value={params.accuracy}
                onChange={e => saveParams({ accuracy: e.target.value })}>
                <option value="low">Низкая (−15%)</option>
                <option value="medium">Средняя</option>
                <option value="high">Высокая (+20%)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Стоимость 1 SP, руб</label>
              <input type="number" className="w-full text-sm border rounded px-3 py-2"
                value={params.sp_cost_rub}
                onChange={e => saveParams({ sp_cost_rub: Number(e.target.value) })} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">Фазы (вкл/выкл)</div>
              <div className="space-y-1">
                {phases.map((ph, i) => (
                  <label key={ph.phase_id ?? i} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={ph.enabled}
                      onChange={e => {
                        const updated = phases.map((p, j) => j === i ? { ...p, enabled: e.target.checked } : p);
                        saveParams({ phases_json: updated });
                      }} />
                    {ph.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-2">Состав команды (доли FTE, для расчёта длительности)</div>
              <div className="grid grid-cols-2 gap-2">
                {TEAM_LABELS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-slate-400">{label}</label>
                    <input type="number" step="0.05" min="0" max="1"
                      className="w-full text-sm border rounded px-2 py-1"
                      value={team[key]}
                      onChange={e => saveParams({ team_json: { ...team, [key]: Number(e.target.value) } })} />
                  </div>
                ))}
              </div>
            </div>
            <TabSaveBar tabId="params" onSave={saveParamsTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-4">
            {calc ? (
              <>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs">
                      <th className="text-left p-2 border">Очередь</th>
                      <th className="text-left p-2 border">Фаза</th>
                      <th className="text-right p-2 border">SP</th>
                      <th className="text-right p-2 border">Бюджет</th>
                      <th className="text-right p-2 border">Часы</th>
                      <th className="text-right p-2 border">Дней</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calc.by_queue.map(q => (
                      <tr key={q.queue}>
                        <td className="p-2 border">{q.queue}</td>
                        <td className="p-2 border text-slate-500">{q.phase}</td>
                        <td className="p-2 border text-right">{q.story_points}</td>
                        <td className="p-2 border text-right">{q.budget.toLocaleString('ru')} ₽</td>
                        <td className="p-2 border text-right">{q.hours}</td>
                        <td className="p-2 border text-right">{q.duration_days}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-blue-50">
                      <td className="p-2 border" colSpan={2}>Итого</td>
                      <td className="p-2 border text-right">{calc.totals.story_points}</td>
                      <td className="p-2 border text-right">{calc.totals.budget.toLocaleString('ru')} ₽</td>
                      <td className="p-2 border text-right">{calc.totals.hours}</td>
                      <td className="p-2 border text-right">{calc.totals.duration_days}</td>
                    </tr>
                  </tbody>
                </table>
                {data.project_id ? (
                  <p className="text-sm text-green-600">Проект уже создан (ID: {data.project_id})</p>
                ) : (
                  <button onClick={handleGenerateProject}
                    className="text-sm bg-blue-600 text-white px-6 py-2.5 rounded hover:bg-blue-700">
                    Сформировать калькулятор
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">Расчёт...</p>
            )}
            <TabSaveBar tabId="summary" onSave={saveSummaryTab} savingTab={savingTab} feedback={saveFeedback} />
          </div>
        )}
      </div>
    </div>
  );
}
