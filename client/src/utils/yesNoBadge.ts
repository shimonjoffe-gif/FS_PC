export function yesNoLabel(on: boolean): string {
  return on ? 'Да' : 'Нет';
}

export function yesNoClass(on: boolean, unmatched = false): string {
  if (!on && unmatched) return 'bg-red-100 text-red-700 font-medium';
  return on ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-500';
}

export const YES_NO_BADGE_CLASS = 'inline-block px-2 py-0.5 rounded';
