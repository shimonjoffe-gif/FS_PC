import { FS_QUEUE_KEYS, type FsQueueKey } from './fsQueues';

export interface PhaseCalcLineDef {
  id: string;
  excel_row: number;
  label: string;
  is_phase: boolean;
  default_enabled: boolean;
  /** Step 2+: base cost formula stub (column C) */
  c_formula_stub?: string;
  /** Step 2+: hours = M/W, days = N/X */
  hours_formula_stub?: string;
  days_formula_stub?: string;
}

export const PHASE_CALC_LINE_DEFS: PhaseCalcLineDef[] = [
  {
    id: 'r73',
    excel_row: 73,
    label: 'Фаза 0.1. Продажа (Предпроект)',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '0',
  },
  {
    id: 'r74',
    excel_row: 74,
    label: 'Фаза 0.2. Методическая проработка',
    is_phase: true,
    default_enabled: false,
    c_formula_stub: 'D20*C35*C32*C63 + IF(E7>0, C50*E7, 0)',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r75',
    excel_row: 75,
    label: 'Фаза 1. Инициация Фаза 2 Формирование требований к ИС',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '(C20+C21)*C37*C32*C63 + IF(E7>0, E7*C50, 0)',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r76',
    excel_row: 76,
    label: 'Фаза 3. Проектирование ИС',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: 'C20*C38*C32*C63',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r77',
    excel_row: 77,
    label: 'Фаза 4.1 Разработка ИС',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: 'C20*C39*C32*C63',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r78',
    excel_row: 78,
    label: 'Фаза 4.2. Интеграции',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: 'C21*C36*C32*C64',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r79',
    excel_row: 79,
    label: 'Фаза 4.3. Нагрузочное тестирование',
    is_phase: true,
    default_enabled: false,
    c_formula_stub: 'E20*250000',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r80',
    excel_row: 80,
    label: 'Фаза 5.1. Подготовка к Запуску в ОЭ: Настройка БД',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: 'SUM(C75:C78)*0.1 + C40*C32',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r81',
    excel_row: 81,
    label: 'Фаза 5.1. Подготовка к Запуску в ОЭ: Рабочая Документация',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: 'SUM(C76:C77)*0.1 + C45*C32*C63',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r82',
    excel_row: 82,
    label: 'Фаза 5.1. Подготовка к Запуску в ОЭ: Миграция данных',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: 'SUM(C76:C77)*0.1',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r83',
    excel_row: 83,
    label: 'Фаза 5.1. Проектный аутсорсинг (1 роль на 6 месяцев)',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '192000 + 96000*5',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r84',
    excel_row: 84,
    label: 'Фаза 5.2. Обучение Администраторов и Специалистов по внедрению Заказчика',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '(C46+F49*D49)*C32 + H49*C50',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r85',
    excel_row: 85,
    label: 'Фаза 5.3. Обучение Конечных пользователей',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '(F47*D47+F48*D48)*C32 + SUM(H47:H48)*C50',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r86',
    excel_row: 86,
    label: 'Фаза 6. Ввод в ОЭ',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '((C5*C67+C6*C68)*0.5+C65)*C32 + E5*C50',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r87',
    excel_row: 87,
    label: 'Фаза 7 Поддержка в ходе ОЭ',
    is_phase: true,
    default_enabled: true,
    c_formula_stub: '((C5*C67+C6*C68)*0.5+C66)*C32 + E5*C50',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r88',
    excel_row: 88,
    label: 'Фаза 8.1. Завершение проекта: Разработка документации по соответсвию требованиям ИБ',
    is_phase: true,
    default_enabled: false,
    c_formula_stub: '5000000',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r89',
    excel_row: 89,
    label: 'Фаза 8 Завершение проекта: передача на сервис',
    is_phase: true,
    default_enabled: false,
    c_formula_stub: 'C81',
    hours_formula_stub: 'F/C32',
    days_formula_stub: 'ROUNDUP((L/C32)/40*1.2/Y, 0)',
  },
  {
    id: 'r90',
    excel_row: 90,
    label: 'Сопровождение Базы данных на 1 год',
    is_phase: false,
    default_enabled: true,
    c_formula_stub: 'fixed (see Excel C90)',
    hours_formula_stub: 'F/C32',
    days_formula_stub: '—',
  },
];

export type PhaseCalcQueuesState = Record<FsQueueKey, Record<string, boolean>>;

export type PhaseCalcTeamFteState = Partial<Record<FsQueueKey, Record<string, Record<string, number>>>>;

export interface PhaseCalcState {
  queues: PhaseCalcQueuesState;
  team_fte?: PhaseCalcTeamFteState;
}

export function defaultPhaseCalcQueues(): PhaseCalcQueuesState {
  const lineDefaults = Object.fromEntries(
    PHASE_CALC_LINE_DEFS.map(d => [d.id, d.default_enabled]),
  );
  return Object.fromEntries(
    FS_QUEUE_KEYS.map(q => [q, { ...lineDefaults }]),
  ) as PhaseCalcQueuesState;
}

export function mergePhaseCalcState(stored: Partial<PhaseCalcState> | null | undefined): PhaseCalcState {
  const defaults = defaultPhaseCalcQueues();
  if (!stored?.queues && !stored?.team_fte) return { queues: defaults };

  const queues = { ...defaults };
  if (stored?.queues) {
    for (const q of FS_QUEUE_KEYS) {
      const storedQueue = stored.queues[q];
      if (!storedQueue) continue;
      queues[q] = { ...defaults[q], ...storedQueue };
    }
  }

  let team_fte: PhaseCalcState['team_fte'];
  if (stored?.team_fte) {
    team_fte = {};
    for (const q of FS_QUEUE_KEYS) {
      if (stored.team_fte[q]) {
        team_fte[q] = { ...stored.team_fte[q] };
      }
    }
  }

  return { queues, ...(team_fte ? { team_fte } : {}) };
}

export function parsePhaseCalcJson(raw: string | PhaseCalcState | null | undefined): PhaseCalcState {
  if (!raw) return mergePhaseCalcState(null);
  if (typeof raw === 'object') return mergePhaseCalcState(raw);
  try {
    return mergePhaseCalcState(JSON.parse(raw) as PhaseCalcState);
  } catch {
    return mergePhaseCalcState(null);
  }
}
