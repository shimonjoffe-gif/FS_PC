import type { TeamProportions, PhaseCalcState, FsQueueKey } from './types';

export const TEAM_LABELS: { key: keyof TeamProportions; label: string }[] = [
  { key: 'рп', label: 'РП' },
  { key: 'аналит_конс', label: 'Аналитик-консультант' },
  { key: 'аналит_эксп', label: 'Аналитик-эксперт' },
  { key: 'архит', label: 'Архитектор' },
  { key: 'програм1', label: 'Программист 1' },
  { key: 'програм2', label: 'Программист 2' },
  { key: 'куратор', label: 'Куратор' },
];

export function sumTeamFte(team: TeamProportions): number {
  return TEAM_LABELS.reduce((sum, { key }) => sum + (team[key] ?? 0), 0);
}

export const DEFAULT_TEAM: TeamProportions = {
  рп: 0.15,
  аналит_конс: 0.25,
  аналит_эксп: 0.1,
  архит: 0.15,
  програм1: 0.2,
  програм2: 0.1,
  куратор: 0.05,
};

/** Доли FTE для строки фазы: переопределение → шаблон team_json. */
export function effectiveTeamForPhaseLine(
  queue: FsQueueKey,
  lineId: string,
  phaseCalc: PhaseCalcState | undefined,
  defaultTeam: TeamProportions,
): TeamProportions {
  const stored = phaseCalc?.team_fte?.[queue]?.[lineId];
  if (!stored) return { ...defaultTeam };
  return { ...defaultTeam, ...stored };
}
