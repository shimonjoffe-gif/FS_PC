import type { BriefingSolutionSel, FsQueueKey, Solution } from './types';

function solutionQueueComments(sel: BriefingSolutionSel): Record<string, string> {
  if (!sel.queue_comment_json) return {};
  if (typeof sel.queue_comment_json === 'object') {
    return sel.queue_comment_json as Record<string, string>;
  }
  try {
    return JSON.parse(String(sel.queue_comment_json)) as Record<string, string>;
  } catch {
    return {};
  }
}

export function effectiveSolutionCommentForQueue(sel: BriefingSolutionSel, q: FsQueueKey): string {
  return solutionQueueComments(sel)[q] ?? '';
}

export function hasSolutionQueueComment(sel: BriefingSolutionSel, q: FsQueueKey): boolean {
  return !!effectiveSolutionCommentForQueue(sel, q).trim();
}

export function patchSolutionQueueComment(
  sel: BriefingSolutionSel,
  q: FsQueueKey,
  text: string,
): Partial<BriefingSolutionSel> {
  const comments = { ...solutionQueueComments(sel) };
  const trimmed = text.trim();
  if (trimmed) comments[q] = trimmed;
  else delete comments[q];
  return { queue_comment_json: Object.keys(comments).length > 0 ? comments : null };
}

export function makeSolutionSelection(
  sol: Solution,
  q: FsQueueKey,
  prev?: BriefingSolutionSel | null,
): BriefingSolutionSel {
  return {
    ...(prev ?? sol),
    id: sol.id,
    name: sol.name,
    description: sol.description,
    queue: q,
    queue_comment_json: prev?.queue_comment_json ?? null,
  };
}

export type SolutionCommentMoveChange = { solutionId: number; next: BriefingSolutionSel | null };

export function moveSolutionCommentBetween(
  sourceSel: BriefingSolutionSel,
  targetSol: Solution,
  targetSel: BriefingSolutionSel | undefined,
  fromQueue: FsQueueKey,
  toQueue: FsQueueKey,
  mode: 'merge' | 'replace',
): SolutionCommentMoveChange[] {
  const movedText = effectiveSolutionCommentForQueue(sourceSel, fromQueue).trim();
  if (!movedText) return [];

  const sameItem = sourceSel.id === targetSol.id;
  const existing = targetSel ? effectiveSolutionCommentForQueue(targetSel, toQueue).trim() : '';
  let targetText = movedText;
  if (existing) {
    targetText = mode === 'merge' ? `${existing}\n${movedText}` : movedText;
  }

  if (sameItem) {
    let working = { ...sourceSel, queue: toQueue };
    working = { ...working, ...patchSolutionQueueComment(working, toQueue, targetText) };
    working = { ...working, ...patchSolutionQueueComment(working, fromQueue, '') };
    return [{ solutionId: sourceSel.id, next: working }];
  }

  const sourceWorking = { ...sourceSel, ...patchSolutionQueueComment(sourceSel, fromQueue, '') };
  let targetWorking = makeSolutionSelection(targetSol, toQueue, targetSel);
  targetWorking = { ...targetWorking, ...patchSolutionQueueComment(targetWorking, toQueue, targetText) };

  return [
    { solutionId: sourceSel.id, next: sourceWorking },
    { solutionId: targetSol.id, next: targetWorking },
  ];
}

export function serializeSolutionQueueCommentForSave(sel: BriefingSolutionSel): Record<string, string> | null {
  const comments = solutionQueueComments(sel);
  return Object.keys(comments).length > 0 ? comments : null;
}

export function withSolutionGroupParentOnQueue(
  changes: SolutionCommentMoveChange[],
  targetSol: Solution,
  toQueue: FsQueueKey,
  catalog: Solution[],
  findSelected: (id: number) => BriefingSolutionSel | undefined,
): SolutionCommentMoveChange[] {
  if (!targetSol.parent_id) return changes;
  if (changes.some(c => c.solutionId === targetSol.parent_id)) return changes;
  const parent = catalog.find(s => s.id === targetSol.parent_id);
  if (!parent) return changes;
  return [
    ...changes,
    {
      solutionId: parent.id,
      next: makeSolutionSelection(parent, toQueue, findSelected(parent.id)),
    },
  ];
}
