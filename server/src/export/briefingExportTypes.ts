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
  'fs',
  'assessment_criteria',
  'assessment_contract',
  'assessment_org_volume',
  'assessment_headcount',
  'problems',
  'solutions',
  'widgets',
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
  customer: 'Заказчик (численность и орг. объём)',
  fs: 'ФС + очереди',
  assessment_criteria: 'Параметры оценки (критерии)',
  assessment_contract: 'Параметры договора',
  assessment_org_volume: 'Орг. объём',
  assessment_headcount: 'Численность',
  problems: 'Проблематики',
  solutions: 'Решения',
  widgets: 'Виджеты',
};
