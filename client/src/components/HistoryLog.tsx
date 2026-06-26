import React from 'react';
import type { HistoryEntry } from '../types';

interface Props {
  entries: HistoryEntry[];
}

const ACTION_LABELS: Record<string, string> = {
  add_row:        '+ добавлена строка',
  delete_row:     '✕ удалена строка',
  update_row:     'изменено поле',
  create_project: 'создан проект',
};

const FIELD_LABELS: Record<string, string> = {
  длит_трудоемк:       'Длительность',
  риск_этапа:          'Риск этапа',
  рамки:               'Рамки',
  результаты:          'Результаты',
  отчет_doc:           'Документ',
  загрузка_рп:         'Загрузка РП',
  загрузка_аналит_конс:'Загрузка АнК',
  загрузка_аналит_эксп:'Загрузка АнЭ',
  загрузка_архит:      'Загрузка Архит',
  загрузка_програм1:   'Загрузка Пр1',
  загрузка_програм2:   'Загрузка Пр2',
  загрузка_куратор:    'Загрузка Кур',
  работа:              'Название работы',
  этап:                'Этап',
};

export default function HistoryLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-300 p-6">
        <div className="text-3xl mb-2">📋</div>
        <div className="text-sm">История изменений пуста</div>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto">
      <div className="space-y-1">
        {entries.map(e => (
          <div key={e.id} className="flex items-start gap-3 py-2 border-b border-slate-50 hover:bg-slate-50 rounded px-2">
            <div className="text-[11px] text-slate-300 whitespace-nowrap pt-0.5 w-32 shrink-0">
              {new Date(e.changed_at).toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </div>
            <div className="shrink-0 w-24 text-[11px]">
              <span className={`
                px-1.5 py-0.5 rounded text-white text-[10px]
                ${e.action === 'add_row' ? 'bg-green-400' :
                  e.action === 'delete_row' ? 'bg-red-400' : 'bg-blue-400'}
              `}>
                {ACTION_LABELS[e.action] ?? e.action}
              </span>
            </div>
            <div className="flex-1 text-xs text-slate-600">
              {e.action === 'update_row' && e.field_name && (
                <span>
                  <b>{FIELD_LABELS[e.field_name] ?? e.field_name}:</b>{' '}
                  <span className="text-red-400 line-through">{e.old_value?.slice(0, 40)}</span>
                  {' → '}
                  <span className="text-green-600">{e.new_value?.slice(0, 40)}</span>
                </span>
              )}
              {e.action === 'add_row' && <span>«{e.new_value}»</span>}
              {e.action === 'delete_row' && <span>«{e.old_value}»</span>}
            </div>
            <div className="text-[11px] text-slate-400 shrink-0">
              {e.user_name ?? 'неизвестно'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
