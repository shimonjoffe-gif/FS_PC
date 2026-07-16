export type LcmBlockId =
  | 'problems'
  | 'solutions'
  | 'uvp'
  | 'unfair'
  | 'segments'
  | 'alternatives'
  | 'metrics'
  | 'channels'
  | 'early'
  | 'costs'
  | 'revenue';

export const LCM_BLOCK_LABELS: Record<LcmBlockId, string> = {
  problems: '2.1 Проблема',
  solutions: '4. Решение',
  uvp: '3. УТП',
  unfair: '9. Скрытое преимущество',
  segments: '1.1 Сегменты',
  alternatives: '2.2 Альтернативы',
  metrics: '8. Ключевые метрики',
  channels: '5. Каналы',
  early: '1.2 Ранние последователи',
  costs: '7. Структура издержек',
  revenue: '6. Потоки прибыли',
};

/** 1-й приоритет площади */
export const LCM_PRIORITY1: LcmBlockId[] = ['problems', 'solutions'];

/** 2-й приоритет площади */
export const LCM_PRIORITY2: LcmBlockId[] = ['uvp', 'segments'];

/** По умолчанию скрыты; при включении — компактная полоса снизу */
export const LCM_EXTRA_BLOCKS: LcmBlockId[] = [
  'unfair',
  'alternatives',
  'metrics',
  'channels',
  'early',
  'costs',
  'revenue',
];

export const LCM_ALL_BLOCKS: LcmBlockId[] = [
  ...LCM_PRIORITY1,
  ...LCM_PRIORITY2,
  ...LCM_EXTRA_BLOCKS,
];

export type LcmCanvasPrefs = {
  version: 2;
  hidden: LcmBlockId[];
};

const STORAGE_KEY = 'fs_pc.lcm_canvas_layout.v2';

function isBlockId(id: string): id is LcmBlockId {
  return (LCM_ALL_BLOCKS as string[]).includes(id);
}

export function defaultLcmPrefs(): LcmCanvasPrefs {
  return {
    version: 2,
    hidden: [...LCM_EXTRA_BLOCKS],
  };
}

export function loadLcmPrefs(): LcmCanvasPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLcmPrefs();
    const parsed = JSON.parse(raw) as Partial<LcmCanvasPrefs>;
    const hidden = (parsed.hidden ?? defaultLcmPrefs().hidden).filter(isBlockId);
    return { version: 2, hidden };
  } catch {
    return defaultLcmPrefs();
  }
}

export function saveLcmPrefs(prefs: LcmCanvasPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      hidden: prefs.hidden.filter(isBlockId),
    } satisfies LcmCanvasPrefs));
  } catch {
    // quota / private mode
  }
}

export function isBlockVisible(prefs: LcmCanvasPrefs, id: LcmBlockId): boolean {
  return !prefs.hidden.includes(id);
}

export function setBlockVisible(prefs: LcmCanvasPrefs, id: LcmBlockId, visible: boolean): LcmCanvasPrefs {
  if (visible) {
    return { version: 2, hidden: prefs.hidden.filter(h => h !== id) };
  }
  if (prefs.hidden.includes(id)) return prefs;
  return { version: 2, hidden: [...prefs.hidden, id] };
}
