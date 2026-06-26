export interface User {
  id: number;
  name: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  type: string;
  is_template: number;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: number;
  project_id: number;
  sort_order: number;
  этап: string;
  работа: string;
  исполнитель: string;
  рамки: string;
  результаты: string;
  отчет_doc: string;
  длит_трудоемк: number;
  согл_заказчика: number;
  риск_этапа: number;
  компенсация_продаж: number;
  загрузка_рп: number;
  загрузка_аналит_конс: number;
  загрузка_аналит_эксп: number;
  загрузка_архит: number;
  загрузка_програм1: number;
  загрузка_програм2: number;
  загрузка_куратор: number;
  трудозатраты_итог: number;
  фонд_компании: number;
  резерв_компании: number;
  бюджет_усн: number;
  бюджет_кп: number;
  бюджет_с_рисками: number;
  created_at: string;
  updated_at: string;
}

export interface WorkReference {
  id: number;
  ref_type: 'рамки' | 'результаты' | 'документ';
  work_name: string;
  content: string;
  author_id: number | null;
  author_name: string;
  usage_count: number;
  created_at: string;
}

export interface RefAuthor {
  author_id: number;   // -1 = Базовый
  author_name: string;
}

export interface BaseWork {
  id: string;
  этап: string;
  работа: string;
  рамки: string;
  отчет_doc: string;
  результат: string;
  длит_трудоемк: number;
  риск_этапа: number;
  загрузка_рп: number;
  загрузка_аналит_конс: number;
  загрузка_аналит_эксп: number;
  загрузка_архит: number;
  загрузка_програм1: number;
  загрузка_програм2: number;
  загрузка_куратор: number;
}

export interface Constants {
  ставкаЧасаРуб: number;
  ставкаНДС: number;
  часовВДень: number;
  резервКомпанииПроцент: number;
  компенсацияПродажПервойСтроки: number;
}

export interface HistoryEntry {
  id: number;
  project_id: number;
  row_id: number | null;
  user_id: number | null;
  user_name: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export type RefType = 'рамки' | 'результаты' | 'документ';
