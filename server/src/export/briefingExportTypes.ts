export type ExportBlockKey =
  | 'customer'
  | 'fs'
  | 'assessment_criteria'
  | 'assessment_contract'
  | 'assessment_org_volume'
  | 'assessment_headcount'
  | 'problems'
  | 'solutions'
  | 'widgets';

export type ExportBlocks = Record<ExportBlockKey, boolean>;

export const EXPORT_BLOCK_KEYS: ExportBlockKey[] = [
  'customer',
  'widgets',
  'solutions',
  'fs',
  'assessment_criteria',
  'assessment_contract',
  'assessment_org_volume',
  'assessment_headcount',
  'problems',
];

/** Порядок разделов в HTML для заполнения заказчиком (как во вкладках брифинга). */
export const EXPORT_FILL_ORDER: ExportBlockKey[] = [
  'customer',
  'widgets',
  'solutions',
  'fs',
  'assessment_org_volume',
  'assessment_criteria',
  'assessment_contract',
];

export const DEFAULT_EXPORT_BLOCKS: ExportBlocks = {
  customer: true,
  fs: true,
  assessment_criteria: true,
  assessment_contract: true,
  assessment_org_volume: false,
  assessment_headcount: false,
  problems: false,
  solutions: false,
  widgets: false,
};

export const EXPORT_VERSION = 1;

export function mergeExportBlocks(partial?: Partial<ExportBlocks>): ExportBlocks {
  return { ...DEFAULT_EXPORT_BLOCKS, ...partial };
}

export type ImportMode = 'replace' | 'merge';

export interface ImportOptions {
  mode: ImportMode;
  blocks?: Partial<ExportBlocks>;
}

export const EXPORT_BLOCK_LABELS: Record<ExportBlockKey, string> = {
  customer: 'Заказчик (данные, отборы, проблематики)',
  fs: 'ФС + очереди',
  assessment_criteria: 'Параметры оценки (критерии)',
  assessment_contract: 'Параметры договора',
  assessment_org_volume: 'Орг. объём',
  assessment_headcount: 'Численность',
  problems: 'Проблематики',
  solutions: 'Решения',
  widgets: 'Виджеты',
};

/** Проблематики и орг. объём включаются вместе с соответствующими блоками. */
export function normalizeExportBlocksForFill(blocks: ExportBlocks): ExportBlocks {
  const includeOrgVolume = blocks.customer || blocks.assessment_criteria || blocks.assessment_org_volume;
  return {
    ...blocks,
    problems: blocks.problems || blocks.customer,
    assessment_org_volume: includeOrgVolume,
  };
}
