import type { ProjectRow, Constants } from '../types';

export function calcRow(row: Partial<ProjectRow>, consts: Constants): Partial<ProjectRow> {
  const {
    ставкаЧасаРуб: rate = 1000,
    часовВДень: hpd = 8,
    резервКомпанииПроцент: reservePct = 0.1,
    ставкаНДС: vat = 0.07,
  } = consts;

  const totalLoad = (
    (row.загрузка_рп ?? 0) +
    (row.загрузка_аналит_конс ?? 0) +
    (row.загрузка_аналит_эксп ?? 0) +
    (row.загрузка_архит ?? 0) +
    (row.загрузка_програм1 ?? 0) +
    (row.загрузка_програм2 ?? 0) +
    (row.загрузка_куратор ?? 0)
  ) / 100;

  const часы   = (row.длит_трудоемк ?? 0) * hpd * totalLoad;
  const фонд   = часы * rate;
  const резерв = фонд * reservePct;
  const усн    = фонд + резерв + (row.компенсация_продаж ?? 0);
  const кп     = усн * (1 + vat);
  const сРиск  = усн * (1 + (row.риск_этапа ?? 0));

  return {
    трудозатраты_итог: Math.round(часы),
    фонд_компании:     Math.round(фонд),
    резерв_компании:   Math.round(резерв),
    бюджет_усн:        Math.round(усн),
    бюджет_кп:         Math.round(кп),
    бюджет_с_рисками:  Math.round(сРиск),
  };
}

export function fmt(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function fmtPct(n: number): string {
  return n > 0 ? `${Math.round(n * 100)}%` : '—';
}
