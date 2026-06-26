import { db } from './db';

interface RowCalcInput {
  длит_трудоемк: number;
  риск_этапа: number;
  компенсация_продаж: number;
  загрузка_рп: number;
  загрузка_аналит_конс: number;
  загрузка_аналит_эксп: number;
  загрузка_архит: number;
  загрузка_програм1: number;
  загрузка_програм2: number;
  загрузка_куратор: number;
}

interface RowCalcResult {
  трудозатраты_итог: number;
  фонд_компании: number;
  резерв_компании: number;
  бюджет_усн: number;
  бюджет_кп: number;
  бюджет_с_рисками: number;
}

export function calcRow(row: RowCalcInput): RowCalcResult {
  const c = db.prepare(`SELECT key, value FROM constants`).all() as { key: string; value: number }[];
  const consts: Record<string, number> = Object.fromEntries(c.map(r => [r.key, r.value]));

  const hourlyRate    = consts['ставкаЧасаРуб']         ?? 1000;
  const hoursPerDay   = consts['часовВДень']             ?? 8;
  const reservePct    = consts['резервКомпанииПроцент']  ?? 0.1;
  const vatRate       = consts['ставкаНДС']              ?? 0.07;

  const totalLoad = (
    row.загрузка_рп +
    row.загрузка_аналит_конс +
    row.загрузка_аналит_эксп +
    row.загрузка_архит +
    row.загрузка_програм1 +
    row.загрузка_програм2 +
    row.загрузка_куратор
  ) / 100;

  const часы    = row.длит_трудоемк * hoursPerDay * totalLoad;
  const фонд    = часы * hourlyRate;
  const резерв  = фонд * reservePct;
  const усн     = фонд + резерв + (row.компенсация_продаж ?? 0);
  const кп      = усн * (1 + vatRate);
  const сРиск   = усн * (1 + (row.риск_этапа ?? 0));

  return {
    трудозатраты_итог: Math.round(часы),
    фонд_компании:     Math.round(фонд),
    резерв_компании:   Math.round(резерв),
    бюджет_усн:        Math.round(усн),
    бюджет_кп:         Math.round(кп),
    бюджет_с_рисками:  Math.round(сРиск),
  };
}
