import type { BriefingFsDetailLine, BriefingFsSel, FsQueueKey, FsQueuesMap } from './types';
import { FS_QUEUE_KEYS } from './types';
import { itemQueues } from './types';
import { effectiveFsItemCommentForQueue, patchFsItemQueueComment } from './fsSpCalc';
import { compareFsByGroupThenPrefix } from './utils/fsPrefixSort';

export function countCustomerDetailLines(lines: BriefingFsDetailLine[] | undefined): number {
  return (lines ?? []).filter(l => l.source === 'customer').length;
}

/** Включить на цели те же очереди «Да», что и у источника. */
export function patchQueuesFromSource(
  source: BriefingFsSel,
  target: BriefingFsSel,
): Partial<BriefingFsSel> {
  const sourceQueues = itemQueues(source);
  const targetQueues: FsQueuesMap = { ...itemQueues(target) };
  for (const q of FS_QUEUE_KEYS) {
    if (sourceQueues[q] === 1) targetQueues[q] = 1;
  }
  const enabled = FS_QUEUE_KEYS.some(q => targetQueues[q] === 1) ? 1 : 0;
  const primary = FS_QUEUE_KEYS.find(q => targetQueues[q] === 1) ?? target.queue ?? '1';
  const patch: Partial<BriefingFsSel> = {
    queues_json: targetQueues,
    enabled,
    queue: primary,
    source: 'manual',
  };
  if (target.matched === false) patch.matched = true;
  return patch;
}

export function patchAllQueuesNo(item: BriefingFsSel): Partial<BriefingFsSel> {
  const queues: FsQueuesMap = { '1': 0, '2': 0, '3': 0, '4': 0 };
  return {
    queues_json: queues,
    enabled: 0,
    queue: item.queue ?? '1',
    source: 'manual',
  };
}

export function moveCustomerDetailLine(
  source: BriefingFsSel,
  line: BriefingFsDetailLine,
  remainingSourceLines: BriefingFsDetailLine[],
  target: BriefingFsSel,
): { sourcePatch: Partial<BriefingFsSel>; targetPatch: Partial<BriefingFsSel> } {
  const targetLines = [...(target.detail_lines ?? [])];
  targetLines.push({
    ...line,
    source: 'customer',
    sort_order: targetLines.length,
  });
  return {
    sourcePatch: {
      detail_lines: remainingSourceLines.map((l, i) => ({ ...l, sort_order: i })),
      source: 'manual',
    },
    targetPatch: {
      detail_lines: targetLines.map((l, i) => ({ ...l, sort_order: i })),
      ...patchQueuesFromSource(source, target),
    },
  };
}

export function moveCommentBetweenItems(
  source: BriefingFsSel,
  target: BriefingFsSel,
  fromQueue: FsQueueKey,
  toQueue: FsQueueKey,
  mode: 'merge' | 'replace',
): { item: BriefingFsSel; patch: Partial<BriefingFsSel> }[] | null {
  const movedText = effectiveFsItemCommentForQueue(source, fromQueue).trim();
  if (!movedText) return null;

  const sameItem = source.fs_item_id === target.fs_item_id;
  const existing = effectiveFsItemCommentForQueue(target, toQueue).trim();
  let targetText = movedText;
  if (existing) {
    targetText = mode === 'merge' ? `${existing}\n${movedText}` : movedText;
  }

  if (sameItem) {
    let working = { ...source };
    working = { ...working, ...patchFsItemQueueComment(working, toQueue, targetText) };
    working = { ...working, ...patchFsItemQueueComment(working, fromQueue, '') };
    const targetQueues = { ...itemQueues(working) };
    targetQueues[toQueue] = 1;
    const enabled = FS_QUEUE_KEYS.some(q => targetQueues[q] === 1) ? 1 : 0;
    const primary = FS_QUEUE_KEYS.find(q => targetQueues[q] === 1) ?? source.queue ?? '1';
    return [{
      item: source,
      patch: {
        queue_comment_json: working.queue_comment_json,
        queues_json: targetQueues,
        enabled,
        queue: primary,
        source: 'manual',
        matched: source.matched === false ? true : source.matched,
      },
    }];
  }

  let targetWorking = { ...target, ...patchFsItemQueueComment(target, toQueue, targetText) };
  const targetQueues = { ...itemQueues(targetWorking) };
  targetQueues[toQueue] = 1;
  const enabled = FS_QUEUE_KEYS.some(q => targetQueues[q] === 1) ? 1 : 0;
  const primary = FS_QUEUE_KEYS.find(q => targetQueues[q] === 1) ?? target.queue ?? '1';
  const sourceWorking = { ...source, ...patchFsItemQueueComment(source, fromQueue, '') };

  return [
    { item: source, patch: { queue_comment_json: sourceWorking.queue_comment_json, source: 'manual' } },
    {
      item: target,
      patch: {
        queue_comment_json: targetWorking.queue_comment_json,
        queues_json: targetQueues,
        enabled,
        queue: primary,
        source: 'manual',
        matched: target.matched === false ? true : target.matched,
      },
    },
  ];
}

export type FsItemOption = {
  fs_item_id: number;
  label: string;
  group: string;
};

export function buildFsItemOptions(items: BriefingFsSel[], excludeId?: number): FsItemOption[] {
  return items
    .filter(i => i.fs_item_id !== excludeId)
    .map(i => ({
      fs_item_id: i.fs_item_id,
      group: i.group_name || i.phase || 'Прочее',
      group_prefix: i.group_prefix ?? null,
      prefix: i.prefix ?? null,
      label: `${i.prefix ? `${i.prefix} · ` : ''}${i.name}`,
    }))
    .sort((a, b) => compareFsByGroupThenPrefix(a, b));
}
