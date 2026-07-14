import React, { useMemo, useState } from 'react';
import type { FsCatalogGroup, FsCatalogItem } from '../types';
import { FS_NMD_VALUES, FS_FUNC_TYPE_VALUES } from '../types';
import { compareFsPrefix } from '../utils/fsPrefixSort';
import { buildFsDisplayGroups } from '../utils/fsDisplayGroups';
import { catalogNmdLabel } from '../fsSpCalc';
import FsNsiCatalogModal, { type FsCatalogDetailLine } from './FsNsiCatalogModal';

type NsiCardState =
  | { kind: 'edit'; item: FsCatalogItem }
  | { kind: 'new'; groupPrefix: string; groupName: string };

type DragKind = 'group' | 'item';

type DragPayload =
  | { kind: 'group'; groupId: number }
  | { kind: 'item'; itemId: number; fromGroupPrefix: string };

function draftFsCatalogItem(groupPrefix: string, groupName: string): FsCatalogItem {
  return {
    id: 0,
    code: null,
    prefix: null,
    name: '',
    group_name: groupName,
    group_prefix: groupPrefix,
    phase: groupName,
    queue: '1',
    story_points: 5,
    base_work_id: null,
    details: [],
  };
}

function nmdSelectValue(item: FsCatalogItem): string {
  return catalogNmdLabel(item);
}

function buildReorderPayload(displayGroups: ReturnType<typeof buildFsDisplayGroups>) {
  return displayGroups.map((g, gi) => ({
    groupKey: g.id > 0 ? g.id : g.group_prefix,
    sort_order: gi,
    items: g.items.map((item, ii) => ({ id: item.id, sort_order: ii })),
  }));
}

export default function FsNsiTable({
  groups,
  items,
  onPatchField,
  onSaveCard,
  onCreateCard,
  onOpenUsage,
  onSetPublished,
  onCreateGroup,
  onCopyItem,
  onCopyGroup,
  onReorder,
  onMoveItemToGroup,
  onDeleteItem,
  onDeleteGroup,
}: {
  groups: FsCatalogGroup[];
  items: FsCatalogItem[];
  onPatchField: (
    id: number,
    patch: Partial<Pick<FsCatalogItem, 'func_type' | 'story_points' | 'requires_nmd'>>,
  ) => void | Promise<void>;
  onSaveCard: (
    id: number,
    patch: { prefix: string | null; name: string; details: FsCatalogDetailLine[] },
  ) => void | Promise<void>;
  onCreateCard: (
    groupPrefix: string,
    groupName: string,
    patch: { prefix: string | null; name: string; details: FsCatalogDetailLine[] },
  ) => void | Promise<void>;
  onOpenUsage: (item: FsCatalogItem) => void;
  onSetPublished: (id: number, published: boolean) => void | Promise<void>;
  onCreateGroup: (name: string) => void | Promise<void>;
  onCopyItem: (id: number) => void | Promise<void>;
  onCopyGroup: (groupKey: string | number) => void | Promise<void>;
  onReorder: (payload: ReturnType<typeof buildReorderPayload>) => void | Promise<void>;
  onMoveItemToGroup: (
    itemId: number,
    target: { target_group_id?: number; target_group_prefix?: string },
  ) => void | Promise<void>;
  onDeleteItem: (id: number, name: string) => void | Promise<void>;
  onDeleteGroup: (group: FsCatalogGroup, itemCount: number) => void | Promise<void>;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [card, setCard] = useState<NsiCardState | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [dragPayload, setDragPayload] = useState<DragPayload | null>(null);
  const [dragOver, setDragOver] = useState<{ kind: DragKind; key: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const displayGroups = useMemo(() => buildFsDisplayGroups(groups, items), [groups, items]);

  function toggleGroup(groupKey: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  const groupKeys = useMemo(
    () => displayGroups.map(g => g.group_prefix || String(g.id)),
    [displayGroups],
  );

  const allFsGroupsCollapsed =
    groupKeys.length > 0 && groupKeys.every(key => !expandedGroups.has(key));

  function collapseAllGroups() {
    setExpandedGroups(new Set());
  }

  function expandAllGroups() {
    setExpandedGroups(new Set(groupKeys));
  }

  const latestItem = (item: FsCatalogItem) =>
    items.find(i => i.id === item.id) ?? item;

  async function runReorder(nextGroups: ReturnType<typeof buildFsDisplayGroups>) {
    setBusy(true);
    try {
      await onReorder(buildReorderPayload(nextGroups));
    } finally {
      setBusy(false);
    }
  }

  function moveGroup(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= displayGroups.length || toIdx >= displayGroups.length) {
      return;
    }
    const next = [...displayGroups];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    void runReorder(next);
  }

  function moveItem(groupIdx: number, fromIdx: number, toIdx: number) {
    const next = displayGroups.map(g => ({ ...g, items: [...g.items] }));
    const itemsInGroup = next[groupIdx].items;
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= itemsInGroup.length || toIdx >= itemsInGroup.length) {
      return;
    }
    const [moved] = itemsInGroup.splice(fromIdx, 1);
    itemsInGroup.splice(toIdx, 0, moved);
    void runReorder(next);
  }

  async function handleDropOnGroup(targetGroupIdx: number) {
    if (!dragPayload) return;
    if (dragPayload.kind === 'group') {
      const fromIdx = displayGroups.findIndex(g => g.id === dragPayload.groupId);
      if (fromIdx >= 0 && fromIdx !== targetGroupIdx) moveGroup(fromIdx, targetGroupIdx);
    } else if (dragPayload.kind === 'item') {
      const target = displayGroups[targetGroupIdx];
      if (target && dragPayload.fromGroupPrefix !== target.group_prefix) {
        setBusy(true);
        try {
          await onMoveItemToGroup(dragPayload.itemId, target.id > 0
            ? { target_group_id: target.id }
            : { target_group_prefix: target.group_prefix });
        } finally {
          setBusy(false);
        }
      }
    }
    setDragPayload(null);
    setDragOver(null);
  }

  async function handleDropOnItem(targetGroupIdx: number, targetItemIdx: number) {
    if (!dragPayload) return;
    if (dragPayload.kind === 'item') {
      const fromGroupIdx = displayGroups.findIndex(g => g.group_prefix === dragPayload.fromGroupPrefix);
      const fromItemIdx = displayGroups[fromGroupIdx]?.items.findIndex(i => i.id === dragPayload.itemId) ?? -1;
      if (fromGroupIdx === targetGroupIdx && fromItemIdx >= 0) {
        moveItem(targetGroupIdx, fromItemIdx, targetItemIdx);
      } else if (fromGroupIdx >= 0 && fromGroupIdx !== targetGroupIdx) {
        const target = displayGroups[targetGroupIdx];
        setBusy(true);
        try {
          await onMoveItemToGroup(dragPayload.itemId, target.id > 0
            ? { target_group_id: target.id }
            : { target_group_prefix: target.group_prefix });
        } finally {
          setBusy(false);
        }
      }
    }
    setDragPayload(null);
    setDragOver(null);
  }

  const actionBtn = 'text-[10px] px-1 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40';
  const deleteBtn = 'text-[10px] px-1 py-0.5 rounded border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40';

  return (
    <div className="space-y-2">
      {card && (
        <FsNsiCatalogModal
          item={card.kind === 'edit' ? latestItem(card.item) : draftFsCatalogItem(card.groupPrefix, card.groupName)}
          isNew={card.kind === 'new'}
          onClose={() => setCard(null)}
          onSave={async patch => {
            if (card.kind === 'new') {
              await onCreateCard(card.groupPrefix, card.groupName, patch);
            } else {
              await onSaveCard(card.item.id, patch);
            }
            setCard(null);
          }}
          onOpenUsage={card.kind === 'edit' ? () => {
            onOpenUsage(latestItem(card.item));
            setCard(null);
          } : undefined}
        />
      )}

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 max-w-xs">
          <label className="text-[10px] text-slate-400">Новая группа</label>
          <input
            className="w-full text-sm border rounded px-2 py-1"
            value={newGroupName}
            placeholder="Название группы"
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newGroupName.trim()) {
                void (async () => {
                  await onCreateGroup(newGroupName.trim());
                  setNewGroupName('');
                })();
              }
            }}
          />
        </div>
        <button
          type="button"
          disabled={!newGroupName.trim() || busy}
          className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded hover:bg-blue-600 disabled:opacity-50"
          onClick={() => {
            if (!newGroupName.trim()) return;
            void (async () => {
              await onCreateGroup(newGroupName.trim());
              setNewGroupName('');
            })();
          }}
        >
          + Добавить группу
        </button>
        <button
          type="button"
          disabled={groupKeys.length === 0}
          className="text-xs text-slate-600 border border-slate-200 px-3 py-1.5 rounded hover:bg-slate-50 disabled:opacity-50"
          onClick={() => (allFsGroupsCollapsed ? expandAllGroups() : collapseAllGroups())}
        >
          {allFsGroupsCollapsed ? 'Развернуть все группы' : 'Свернуть все группы'}
        </button>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-260px)] border border-slate-200 rounded">
        <table className="w-full text-xs border-collapse min-w-[820px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-slate-50 text-slate-600">
              <th className="text-left p-2 border w-24 bg-slate-50">№</th>
              <th className="text-left p-2 border min-w-[200px] bg-slate-50">Пункт ФС / Расшифровка</th>
              <th className="text-left p-2 border w-28 bg-slate-50">Тип функционала</th>
              <th className="text-right p-2 border w-14 bg-slate-50" title="Нормативный SP из НСИ">НСИ</th>
              <th className="text-left p-2 border min-w-[100px] bg-slate-50" title="Требование НМД из НСИ">НМД НСИ</th>
              <th className="text-center p-2 border w-24 bg-slate-50" title="Черновики не попадают в бриф и недоступны для связей с решениями и виджетами">Черновик</th>
              <th className="text-left p-2 border w-28 bg-slate-50">Действия</th>
            </tr>
          </thead>
          <tbody>
            {displayGroups.map((group, groupIdx) => {
              const groupKey = group.group_prefix || String(group.id);
              const isExpanded = expandedGroups.has(groupKey);
              const isGroupDrop = dragOver?.kind === 'group' && dragOver.key === groupKey;
              const isGroupDraft = group.published === 0;

              return (
                <React.Fragment key={groupKey}>
                  <tr
                    className={`bg-amber-50 font-semibold ${isGroupDrop ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                    onDragOver={e => {
                      if (dragPayload) {
                        e.preventDefault();
                        setDragOver({ kind: 'group', key: groupKey });
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOver?.key === groupKey) setDragOver(null);
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      void handleDropOnGroup(groupIdx);
                    }}
                  >
                    <td className="p-2 border text-[11px] text-slate-500 whitespace-nowrap align-top">
                      <div className="flex items-center gap-0.5">
                        <span
                          className="cursor-grab text-slate-400 hover:text-slate-600 px-0.5"
                          draggable={group.id > 0 && !busy}
                          title="Перетащить группу"
                          onDragStart={() => setDragPayload({ kind: 'group', groupId: group.id })}
                          onDragEnd={() => { setDragPayload(null); setDragOver(null); }}
                        >
                          ⠿
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupKey)}
                          className="text-slate-600 hover:text-slate-900 w-5 h-5 leading-none shrink-0"
                          title={isExpanded ? 'Свернуть группу' : 'Развернуть группу'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                        <span>{group.group_prefix || '—'}</span>
                      </div>
                    </td>
                    <td className="p-2 border">
                      {group.group_name}
                      {isGroupDraft && (
                        <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">
                          Черновик
                        </span>
                      )}
                      <span className="ml-2 text-[10px] font-normal text-slate-500">({group.items.length})</span>
                      <button
                        type="button"
                        className="ml-2 text-[10px] font-normal text-blue-700 hover:underline"
                        onClick={() => {
                          setCard({ kind: 'new', groupPrefix: group.group_prefix, groupName: group.group_name });
                          setExpandedGroups(prev => new Set(prev).add(groupKey));
                        }}
                      >
                        + Добавить пункт
                      </button>
                    </td>
                    <td className="p-2 border" colSpan={4} />
                    <td className="p-2 border align-top">
                      <div className="flex flex-wrap gap-0.5">
                        {group.id > 0 && (
                          <button
                            type="button"
                            className={actionBtn}
                            disabled={busy}
                            title="Копировать группу"
                            onClick={() => void onCopyGroup(group.id)}
                          >
                            ⧉
                          </button>
                        )}
                        <button
                          type="button"
                          className={actionBtn}
                          disabled={busy || groupIdx === 0}
                          title="Вверх"
                          onClick={() => moveGroup(groupIdx, groupIdx - 1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={actionBtn}
                          disabled={busy || groupIdx >= displayGroups.length - 1}
                          title="Вниз"
                          onClick={() => moveGroup(groupIdx, groupIdx + 1)}
                        >
                          ↓
                        </button>
                        {group.id > 0 && (
                          <button
                            type="button"
                            className={deleteBtn}
                            disabled={busy}
                            title="Удалить группу"
                            onClick={() => void onDeleteGroup(group, group.items.length)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && group.items.map((item, itemIdx) => {
                    const isDraft = !item.published;
                    const itemDropKey = `${groupKey}-${item.id}`;
                    const isItemDrop = dragOver?.kind === 'item' && dragOver.key === itemDropKey;

                    return (
                      <tr
                        key={item.id}
                        className={`${isDraft ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50'} ${isItemDrop ? 'ring-2 ring-inset ring-blue-300' : ''}`}
                        onDragOver={e => {
                          if (dragPayload?.kind === 'item') {
                            e.preventDefault();
                            setDragOver({ kind: 'item', key: itemDropKey });
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOver?.key === itemDropKey) setDragOver(null);
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          void handleDropOnItem(groupIdx, itemIdx);
                        }}
                      >
                        <td className="p-2 border text-[11px] whitespace-nowrap align-top">
                          <div className="flex items-center gap-1">
                            <span
                              className="cursor-grab text-slate-400 hover:text-slate-600"
                              draggable={!busy}
                              title="Перетащить пункт"
                              onDragStart={() => setDragPayload({
                                kind: 'item',
                                itemId: item.id,
                                fromGroupPrefix: group.group_prefix,
                              })}
                              onDragEnd={() => { setDragPayload(null); setDragOver(null); }}
                            >
                              ⠿
                            </span>
                            <span>{item.prefix || '—'}</span>
                          </div>
                        </td>
                        <td className="p-2 border">
                          <button
                            type="button"
                            className="text-left w-full min-w-0 group"
                            onClick={() => setCard({ kind: 'edit', item })}
                            title="Открыть карточку пункта НСИ"
                          >
                            <div className={`font-medium underline-offset-2 group-hover:underline ${isDraft ? 'text-slate-500 group-hover:text-slate-600' : 'text-slate-800 group-hover:text-blue-700'}`}>
                              {item.name}
                              {isDraft && (
                                <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">
                                  Черновик
                                </span>
                              )}
                            </div>
                          </button>
                        </td>
                        <td className="p-2 border align-top" onClick={e => e.stopPropagation()}>
                          <select
                            key={`${item.id}-ft-${item.func_type ?? ''}`}
                            className={`w-full min-w-[6rem] text-[10px] border-0 bg-transparent ${isDraft ? 'text-slate-400' : 'text-slate-600'}`}
                            defaultValue={item.func_type ?? ''}
                            onChange={e => {
                              const v = e.target.value.trim() || null;
                              if (v !== (item.func_type ?? null)) void onPatchField(item.id, { func_type: v });
                            }}
                          >
                            <option value="">—</option>
                            {FS_FUNC_TYPE_VALUES.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 border align-top text-right" onClick={e => e.stopPropagation()}>
                          <input
                            key={`${item.id}-sp-${item.story_points}`}
                            type="number"
                            step={1}
                            className={`w-full min-w-[2.5rem] border-0 bg-transparent text-right tabular-nums ${isDraft ? 'text-slate-400' : 'text-slate-700'}`}
                            defaultValue={item.story_points}
                            onBlur={e => {
                              const v = Number(e.target.value);
                              if (!Number.isNaN(v) && v !== item.story_points) void onPatchField(item.id, { story_points: v });
                            }}
                          />
                        </td>
                        <td className="p-2 border align-top" onClick={e => e.stopPropagation()}>
                          <select
                            key={`${item.id}-nmd-${nmdSelectValue(item)}`}
                            className={`w-full min-w-[8rem] text-[10px] border-0 bg-transparent ${isDraft ? 'text-slate-400' : 'text-slate-600'}`}
                            defaultValue={nmdSelectValue(item)}
                            onChange={e => {
                              const v = e.target.value;
                              if (v !== nmdSelectValue(item)) void onPatchField(item.id, { requires_nmd: v });
                            }}
                          >
                            {FS_NMD_VALUES.map(v => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 border align-top text-center" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`inline-block px-2 py-0.5 rounded min-w-[36px] text-[10px] cursor-pointer ${
                              isDraft
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                            title={isDraft
                              ? 'Черновик: не в брифе, нельзя связать. Клик — опубликовать'
                              : 'Опубликован. Клик — вернуть в черновик'}
                            disabled={busy}
                            onClick={() => void onSetPublished(item.id, isDraft)}
                          >
                            {isDraft ? 'Да' : 'Нет'}
                          </button>
                        </td>
                        <td className="p-2 border align-top" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap gap-0.5">
                              <button
                                type="button"
                                className={actionBtn}
                                disabled={busy}
                                title="Копировать пункт"
                                onClick={() => void onCopyItem(item.id)}
                              >
                                ⧉
                              </button>
                              <button
                                type="button"
                                className={actionBtn}
                                disabled={busy || itemIdx === 0}
                                title="Вверх"
                                onClick={() => moveItem(groupIdx, itemIdx, itemIdx - 1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className={actionBtn}
                                disabled={busy || itemIdx >= group.items.length - 1}
                                title="Вниз"
                                onClick={() => moveItem(groupIdx, itemIdx, itemIdx + 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className={deleteBtn}
                                disabled={busy}
                                title="Удалить пункт"
                                onClick={() => void onDeleteItem(item.id, item.name)}
                              >
                                ✕
                              </button>
                            </div>
                            <select
                              className="text-[10px] border border-slate-200 rounded px-1 py-0.5 max-w-[6.5rem]"
                              defaultValue=""
                              disabled={busy}
                              onChange={e => {
                                const targetId = Number(e.target.value);
                                if (!targetId) return;
                                e.target.value = '';
                                void onMoveItemToGroup(item.id, { target_group_id: targetId });
                              }}
                            >
                              <option value="">Переместить…</option>
                              {displayGroups
                                .filter(g => g.id > 0 && g.group_prefix !== group.group_prefix)
                                .map(g => (
                                  <option key={g.id} value={g.id}>{g.group_name}</option>
                                ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
