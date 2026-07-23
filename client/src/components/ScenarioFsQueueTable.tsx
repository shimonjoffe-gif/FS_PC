import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AssessmentScenario, BriefingFsSel, FsQueueKey, FsQueuesMap } from '../types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS, anyQueueEnabled, itemQueues } from '../types';
import type { QueueSpTotals } from '../fsSpCalc';
import { groupFsItemsSorted } from '../utils/fsDisplayGroups';
import {
  baseEnabledFsItems,
  getScenarioItemQueueEnabled,
  hasScenarioItemQueueDiff,
  isFsExcludedInScenario,
} from '../scenarioCalc';

type DragPayload = { fsItemId: number; fromQueue: FsQueueKey };

type Props = {
  items: BriefingFsSel[];
  scenario: AssessmentScenario;
  queueKeys?: FsQueueKey[];
  spBase: QueueSpTotals;
  spScenario: QueueSpTotals;
  onToggleQueue: (item: BriefingFsSel, queue: FsQueueKey) => void;
  onMoveToQueue: (item: BriefingFsSel, fromQueue: FsQueueKey, targetQueue: FsQueueKey) => void;
  onToggleExcluded: (fsItemId: number) => void;
};

function yesNoLabel(on: boolean): string {
  return on ? 'Да' : 'Нет';
}

function yesNoClass(on: boolean, differs = false): string {
  if (differs) return 'bg-amber-100 text-amber-900 border-amber-300';
  return on
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-slate-100 text-slate-500';
}

function formatSpBaseToScenario(base: number, scenario: number): ReactNode {
  const b = base || 0;
  const s = scenario || 0;
  if (b === 0 && s === 0) return '—';
  if (b === s) return b;
  return (
    <>
      {b}
      <span className="text-slate-400 mx-0.5">→</span>
      <span className="font-medium">{s}</span>
    </>
  );
}

function scenarioItemQueues(
  item: BriefingFsSel,
  scenario: AssessmentScenario,
): Record<FsQueueKey, boolean> {
  return Object.fromEntries(
    FS_QUEUE_KEYS.map(q => [q, getScenarioItemQueueEnabled(item, scenario, q)]),
  ) as Record<FsQueueKey, boolean>;
}

function scenarioAnyQueueOn(item: BriefingFsSel, scenario: AssessmentScenario): boolean {
  return FS_QUEUE_KEYS.some(q => getScenarioItemQueueEnabled(item, scenario, q));
}

export default function ScenarioFsQueueTable({
  items,
  scenario,
  queueKeys = [...FS_QUEUE_KEYS],
  spBase,
  spScenario,
  onToggleQueue,
  onMoveToQueue,
  onToggleExcluded,
}: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [didInitExpand, setDidInitExpand] = useState(false);
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);

  /** Только пункты с «Да» в базе; исключённые из сценария остаются в списке. */
  const baseYesItems = useMemo(() => baseEnabledFsItems(items), [items]);
  const groups = useMemo(() => groupFsItemsSorted(baseYesItems), [baseYesItems]);

  useEffect(() => {
    if (didInitExpand || groups.length === 0) return;
    setExpandedGroups(new Set(groups.map(g => g.group)));
    setDidInitExpand(true);
  }, [didInitExpand, groups]);

  const allCollapsed = groups.length > 0
    && groups.every(g => !expandedGroups.has(g.group));

  function toggleGroup(group: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function startDrag(e: React.DragEvent, item: BriefingFsSel, fromQueue: FsQueueKey) {
    e.stopPropagation();
    const payload: DragPayload = { fsItemId: item.fs_item_id, fromQueue };
    setDragPayload(payload);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-scenario-fs-queue', JSON.stringify(payload));
  }

  function endDrag() {
    setDragPayload(null);
  }

  function handleDrop(e: React.DragEvent, item: BriefingFsSel, targetQueue: FsQueueKey) {
    e.preventDefault();
    e.stopPropagation();
    let payload = dragPayload;
    if (!payload) {
      try {
        payload = JSON.parse(
          e.dataTransfer.getData('application/x-scenario-fs-queue'),
        ) as DragPayload;
      } catch {
        return;
      }
    }
    setDragPayload(null);
    if (!payload || payload.fsItemId !== item.fs_item_id || payload.fromQueue === targetQueue) {
      return;
    }
    onMoveToQueue(item, payload.fromQueue, targetQueue);
  }

  const colCount = 3 + 1 + queueKeys.length + 1;

  const totalRows: {
    label: string;
    title: string;
    allBase: number;
    allSc: number;
    byQueue: (q: FsQueueKey) => { base: number; sc: number };
  }[] = [
    {
      label: 'Итого SP функционала (C20)',
      title: 'Сумма SP функциональных пунктов (C20), без интеграций и НМД',
      allBase: spBase.all_queues,
      allSc: spScenario.all_queues,
      byQueue: q => ({ base: spBase.functional_sp[q], sc: spScenario.functional_sp[q] }),
    },
    {
      label: 'Итого SP интеграций (C21)',
      title: 'Сумма SP пунктов раздела 11 / «ФС интеграции» (C21)',
      allBase: spBase.all_integrations,
      allSc: spScenario.all_integrations,
      byQueue: q => ({
        base: spBase.integrations_sp_auto[q],
        sc: spScenario.integrations_sp_auto[q],
      }),
    },
    {
      label: 'Итого SP НМД (D20)',
      title: 'Сумма SP пунктов с требованием НМД (D20)',
      allBase: spBase.all_nmd,
      allSc: spScenario.all_nmd,
      byQueue: q => ({ base: spBase.nmd_sp_auto[q], sc: spScenario.nmd_sp_auto[q] }),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-readonly-allow
          onClick={() => setExpandedGroups(
            allCollapsed ? new Set(groups.map(g => g.group)) : new Set(),
          )}
          className="text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50"
          disabled={groups.length === 0}
        >
          {allCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Показаны пункты с «Да» в базе. Перетащите «Да» в другую очередь (как на «ФС + очереди»).
        Колонка «Исключить» убирает пункт из расчёта варианта. В итогах: база → сценарий.
      </p>
      <div className="border rounded overflow-auto max-h-[480px]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left p-2 border w-12">№</th>
              <th className="text-left p-2 border min-w-[12rem]">Пункт ФС</th>
              <th className="text-right p-2 border w-14">SP</th>
              <th className="text-center p-2 border">Все очереди</th>
              {queueKeys.map(q => (
                <th key={q} className="text-center p-2 border min-w-[5rem]">
                  {FS_QUEUE_LABELS[q]}
                  <div className="text-[9px] font-normal text-slate-400 mt-0.5">Да/Нет</div>
                </th>
              ))}
              <th className="text-center p-2 border w-24">Исключить</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-3 text-slate-400 text-center">
                  Нет пунктов с «Да» в базе
                </td>
              </tr>
            ) : groups.map(({ group, groupPrefix, items: groupItems }) => {
              const isExpanded = expandedGroups.has(group);
              const activeItems = groupItems.filter(
                i => !isFsExcludedInScenario(scenario, i.fs_item_id),
              );
              const groupAllOn = activeItems.some(i => scenarioAnyQueueOn(i, scenario));
              const groupByQueue = Object.fromEntries(
                queueKeys.map(q => [
                  q,
                  activeItems.some(i => getScenarioItemQueueEnabled(i, scenario, q)),
                ]),
              ) as Record<FsQueueKey, boolean>;

              return (
                <GroupRows
                  key={group}
                  group={group}
                  groupPrefix={groupPrefix}
                  isExpanded={isExpanded}
                  groupItems={groupItems}
                  groupAllOn={groupAllOn}
                  groupByQueue={groupByQueue}
                  queueKeys={queueKeys}
                  scenario={scenario}
                  dragPayload={dragPayload}
                  onToggleGroup={() => toggleGroup(group)}
                  onToggleQueue={onToggleQueue}
                  onToggleExcluded={onToggleExcluded}
                  onDragStart={startDrag}
                  onDragEnd={endDrag}
                  onDrop={handleDrop}
                  onDragOver={(e, item) => {
                    if (
                      dragPayload
                      && dragPayload.fsItemId === item.fs_item_id
                      && !isFsExcludedInScenario(scenario, item.fs_item_id)
                    ) {
                      e.preventDefault();
                    }
                  }}
                />
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            {totalRows.map(row => (
              <tr key={row.label} className="bg-slate-100 font-semibold text-slate-700">
                <td className="p-2 border" colSpan={3} title={row.title}>
                  {row.label}
                </td>
                <td className="p-2 border text-center tabular-nums" title="База → сценарий">
                  {formatSpBaseToScenario(row.allBase, row.allSc)}
                </td>
                {queueKeys.map(q => {
                  const { base, sc } = row.byQueue(q);
                  return (
                    <td key={q} className="p-2 border text-center tabular-nums">
                      {formatSpBaseToScenario(base, sc)}
                    </td>
                  );
                })}
                <td className="p-2 border" />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  groupPrefix,
  isExpanded,
  groupItems,
  groupAllOn,
  groupByQueue,
  queueKeys,
  scenario,
  dragPayload,
  onToggleGroup,
  onToggleQueue,
  onToggleExcluded,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
}: {
  group: string;
  groupPrefix: string | null;
  isExpanded: boolean;
  groupItems: BriefingFsSel[];
  groupAllOn: boolean;
  groupByQueue: Record<FsQueueKey, boolean>;
  queueKeys: FsQueueKey[];
  scenario: AssessmentScenario;
  dragPayload: DragPayload | null;
  onToggleGroup: () => void;
  onToggleQueue: (item: BriefingFsSel, queue: FsQueueKey) => void;
  onToggleExcluded: (fsItemId: number) => void;
  onDragStart: (e: React.DragEvent, item: BriefingFsSel, q: FsQueueKey) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, item: BriefingFsSel, q: FsQueueKey) => void;
  onDragOver: (e: React.DragEvent, item: BriefingFsSel) => void;
}) {
  return (
    <>
      <tr className="bg-amber-50 font-semibold">
        <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-readonly-allow
              onClick={onToggleGroup}
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
        <td className="p-2 border text-center">
          <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupAllOn)}`}>
            {yesNoLabel(groupAllOn)}
          </span>
        </td>
        {queueKeys.map(q => (
          <td key={q} className="p-2 border text-center">
            <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(groupByQueue[q])}`}>
              {yesNoLabel(groupByQueue[q])}
            </span>
          </td>
        ))}
        <td className="p-2 border" />
      </tr>
      {isExpanded && groupItems.map(item => {
        const excluded = isFsExcludedInScenario(scenario, item.fs_item_id);
        const baseQueues = itemQueues(item);
        const scQueues = scenarioItemQueues(item, scenario);
        const scMap = Object.fromEntries(
          FS_QUEUE_KEYS.map(q => [q, !excluded && scQueues[q] ? 1 : 0]),
        ) as FsQueuesMap;
        const allOn = !excluded && anyQueueEnabled(scMap);
        const differs = excluded || hasScenarioItemQueueDiff(item, scenario);
        const prefix = item.prefix ?? item.code ?? '';
        return (
          <tr
            key={item.fs_item_id}
            className={
              excluded
                ? 'bg-slate-100/80 opacity-70'
                : differs
                  ? 'bg-amber-50/40'
                  : 'hover:bg-slate-50'
            }
          >
            <td className="p-2 border text-slate-500">{prefix}</td>
            <td className={`p-2 border ${excluded ? 'line-through text-slate-500' : 'text-slate-700'}`}>
              {item.name}
            </td>
            <td className="p-2 border text-right tabular-nums">{item.story_points ?? 0}</td>
            <td className="p-2 border text-center">
              <span className={`inline-block px-2 py-0.5 rounded ${yesNoClass(allOn)}`}>
                {yesNoLabel(allOn)}
              </span>
            </td>
            {queueKeys.map(q => {
              const baseOn = baseQueues[q] === 1;
              const scOn = !excluded && scQueues[q];
              const cellDiff = !excluded && baseOn !== scOn;
              const isDropTarget = !excluded
                && dragPayload?.fsItemId === item.fs_item_id
                && dragPayload.fromQueue !== q;
              return (
                <td
                  key={q}
                  className={`p-1 border text-center align-middle ${
                    isDropTarget ? 'bg-blue-100 ring-2 ring-inset ring-blue-300' : ''
                  }`}
                  onDragOver={e => onDragOver(e, item)}
                  onDrop={e => {
                    if (excluded) return;
                    onDrop(e, item, q);
                  }}
                >
                  <button
                    type="button"
                    draggable={!excluded && scOn}
                    disabled={excluded}
                    className={`inline-block px-2 py-0.5 rounded border min-w-[36px] ${
                      yesNoClass(scOn, cellDiff)
                    } ${
                      !excluded && scOn
                        ? 'cursor-grab active:cursor-grabbing'
                        : excluded
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer'
                    }`}
                    title={
                      excluded
                        ? 'Пункт исключён из варианта'
                        : scOn
                          ? 'Перетащите в другую очередь'
                          : 'Клик — переключить Да/Нет'
                    }
                    onDragStart={
                      !excluded && scOn
                        ? e => onDragStart(e, item, q)
                        : undefined
                    }
                    onDragEnd={onDragEnd}
                    onClick={() => {
                      if (excluded) return;
                      onToggleQueue(item, q);
                    }}
                  >
                    {yesNoLabel(scOn)}
                  </button>
                </td>
              );
            })}
            <td className="p-2 border text-center">
              <input
                type="checkbox"
                checked={excluded}
                onChange={() => onToggleExcluded(item.fs_item_id)}
                title="Исключить из расчёта варианта"
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}
