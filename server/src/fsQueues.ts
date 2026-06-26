export const FS_QUEUE_KEYS = ['1', '2', '3', '4'] as const;
export type FsQueueKey = typeof FS_QUEUE_KEYS[number];

export const FS_QUEUE_LABELS: Record<FsQueueKey, string> = {
  '1': '1 очередь',
  '2': '2 очередь',
  '3': '3 очередь',
  '4': 'Развитие',
};

export type FsQueuesMap = Record<FsQueueKey, number>;

export const EMPTY_QUEUES: FsQueuesMap = { '1': 0, '2': 0, '3': 0, '4': 0 };

export function parseQueuesJson(raw: string | FsQueuesMap | null | undefined): FsQueuesMap {
  if (!raw) return { ...EMPTY_QUEUES };
  if (typeof raw === 'object') return { ...EMPTY_QUEUES, ...raw };
  try {
    const parsed = JSON.parse(raw) as Partial<FsQueuesMap>;
    return { ...EMPTY_QUEUES, ...parsed };
  } catch {
    return { ...EMPTY_QUEUES };
  }
}

export function queuesFromLegacy(queue: string | null | undefined, enabled = 1): FsQueuesMap {
  const q = parseQueuesJson(null);
  const key = (queue && FS_QUEUE_KEYS.includes(queue as FsQueueKey) ? queue : '1') as FsQueueKey;
  if (enabled) q[key] = 1;
  return q;
}

export function anyQueueEnabled(queues: FsQueuesMap): boolean {
  return FS_QUEUE_KEYS.some(k => queues[k] === 1);
}

export function enabledFromQueues(queues: FsQueuesMap): number {
  return anyQueueEnabled(queues) ? 1 : 0;
}

export function primaryQueue(queues: FsQueuesMap): FsQueueKey {
  return FS_QUEUE_KEYS.find(k => queues[k] === 1) ?? '1';
}
