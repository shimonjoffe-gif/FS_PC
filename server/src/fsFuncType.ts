import { parseQueuesJson, type FsQueueKey, type FsQueuesMap } from './fsQueues';

/** Сопоставление «Тип функционала» (НСИ ФС) → код технологии / типа проекта. */

export const FS_FUNC_TYPE_TO_CODE: Record<string, string> = {
  'Базовый': 'CASE',
  'Проф-мини': 'PROF_MINI',
  'ПРОФ': 'PROF',
  'Экспертный': 'KORP',
  'Кейс-проект': 'CASE',
  'Проф/мини': 'PROF_MINI',
  'ПРОФ-проект': 'PROF',
  'КОРП-проект': 'KORP',
  'Проф': 'PROF_MINI',
};

/** Старшинство технологий (для выбора максимальной по очереди). */
export const TYPE_CODE_RANK: Record<string, number> = {
  CASE: 1,
  BZ: 1,
  PROF_MINI: 2,
  PROF: 3,
  KORP: 4,
};

/** Допустимые технологии для типа функционала (для справки / UI). */
export const FUNC_TYPE_TECHNOLOGY_LABELS: Record<string, string[]> = {
  'Базовый': ['Кейс-проект', 'Быстрый запуск'],
  'Проф-мини': ['Проф/мини'],
  'ПРОФ': ['ПРОФ-проект'],
  'Экспертный': ['КОРП-проект'],
};

/** Колонка G Excel («Тип проекта») → «Тип функционала» в НСИ ФС. */
export const TECHNOLOGY_LABEL_TO_FUNC_TYPE: Record<string, string> = {
  'Кейс-проект': 'Базовый',
  'Проф/мини': 'Проф-мини',
  'ПРОФ-проект': 'ПРОФ',
  'КОРП-проект': 'Экспертный',
  'Быстрый запуск': 'Базовый',
  'БЗ': 'Базовый',
};

export function technologyLabelToFuncType(label: string | null | undefined): string | null {
  const key = normalizeTechnologyLabel(label?.trim() ?? '');
  if (!key || key.toUpperCase() === 'ГРУППА') return null;
  return TECHNOLOGY_LABEL_TO_FUNC_TYPE[key] ?? null;
}

export function funcTypeToCode(funcType: string | null | undefined): string {
  const key = funcType?.trim();
  if (!key) return 'CASE';
  return FS_FUNC_TYPE_TO_CODE[key] ?? 'CASE';
}

export function normalizeTechnologyLabel(label: string): string {
  if (label === 'БЗ') return 'Быстрый запуск';
  return label;
}

export function technologyLabelForTypeCode(code: string | null | undefined): string {
  switch (code) {
    case 'KORP': return 'КОРП-проект';
    case 'PROF': return 'ПРОФ-проект';
    case 'PROF_MINI': return 'Проф/мини';
    case 'BZ': return 'Быстрый запуск';
    default: return 'Кейс-проект';
  }
}

export function typeCodeForTechnologyLabel(label: string): string {
  switch (normalizeTechnologyLabel(label)) {
    case 'КОРП-проект': return 'KORP';
    case 'ПРОФ-проект': return 'PROF';
    case 'Проф/мини': return 'PROF_MINI';
    case 'Быстрый запуск': return 'BZ';
    default: return 'CASE';
  }
}

export function highestTypeCodeAmongCodes(codes: string[]): string {
  let maxRank = 0;
  let winner = 'CASE';
  for (const raw of codes) {
    const code = raw in TYPE_CODE_RANK ? raw : 'CASE';
    const rank = TYPE_CODE_RANK[code] ?? 1;
    if (rank > maxRank) {
      maxRank = rank;
      winner = code;
    }
  }
  return winner;
}

/**
 * Авто-технология очереди по включённым пунктам ФС (старший тип функционала).
 * Базовый → Кейс или БЗ (если тип проекта BZ); Экспертный → КОРП.
 */
export function computeAutoTechnologyForQueue(
  highestTypeCode: string | null,
  projectTypeCode: string | null | undefined,
): string {
  if (!highestTypeCode) {
    return technologyLabelForTypeCode(projectTypeCode ?? 'CASE');
  }
  if (highestTypeCode === 'CASE') {
    const base = projectTypeCode === 'BZ' ? 'BZ' : 'CASE';
    return technologyLabelForTypeCode(base);
  }
  return technologyLabelForTypeCode(highestTypeCode);
}

export function highestFuncTypeCodeInQueue(
  items: { func_type?: string | null; queues_json?: string | FsQueuesMap | null }[],
  queue: FsQueueKey,
): string | null {
  const codes: string[] = [];
  for (const item of items) {
    const queues = parseQueuesJson(item.queues_json);
    if (queues[queue] !== 1) continue;
    codes.push(funcTypeToCode(item.func_type));
  }
  if (codes.length === 0) return null;
  return highestTypeCodeAmongCodes(codes);
}
