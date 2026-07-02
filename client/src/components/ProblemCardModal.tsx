import React, { useEffect, useMemo, useState } from 'react';
import type { Problem, ProblemDetail } from '../types';

export type ProblemDraft = {
  name: string;
  parent_id: number | '';
  lcm_code: string;
};

export function problemToDraft(problem: Problem): ProblemDraft {
  return {
    name: problem.name,
    parent_id: problem.parent_id ?? '',
    lcm_code: problem.lcm_code ?? '',
  };
}

export function emptyProblemDraft(): ProblemDraft {
  return { name: '', parent_id: '', lcm_code: '' };
}

export default function ProblemCardModal({
  mode,
  problem,
  draft: initialDraft,
  allProblems,
  onClose,
  onSave,
  onDelete,
}: {
  mode: 'view' | 'edit' | 'create';
  problem?: ProblemDetail;
  draft?: ProblemDraft;
  allProblems: Problem[];
  onClose: () => void;
  onSave: (draft: ProblemDraft) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(mode !== 'view');
  const [draft, setDraft] = useState<ProblemDraft>(
    () => initialDraft ?? (problem ? problemToDraft(problem) : emptyProblemDraft()),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parentOptions = useMemo(() => {
    return allProblems.filter(p => !problem || p.id !== problem.id);
  }, [allProblems, problem]);

  async function handleSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      await onSave(draft);
      if (mode === 'create') onClose();
      else setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    if (!confirm('Удалить проблематику? Дочерние пункты также будут удалены.')) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  const title = mode === 'create' ? 'Новая проблематика' : editing ? 'Редактирование проблематики' : 'Справочник · проблематика';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-slate-400 mb-1">{title}</div>
            {editing ? (
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-400">Формулировка проблематики</label>
                  <textarea
                    className="w-full text-sm border rounded px-2 py-1.5 min-h-[120px] max-h-[40vh] resize-y whitespace-pre-wrap"
                    placeholder="Название / формулировка проблематики"
                    value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Код LCM</label>
                  <input
                    className="w-full text-xs border rounded px-2 py-1 font-mono"
                    value={draft.lcm_code}
                    onChange={e => setDraft(d => ({ ...d, lcm_code: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400">Родительский пункт</label>
                  <select
                    className="w-full text-xs border rounded px-2 py-1"
                    value={draft.parent_id === '' ? '' : String(draft.parent_id)}
                    onChange={e => setDraft(d => ({
                      ...d,
                      parent_id: e.target.value ? Number(e.target.value) : '',
                    }))}
                  >
                    <option value="">— корневой уровень —</option>
                    {parentOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.catalog_code ? `${p.catalog_code} ` : ''}{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm font-semibold text-slate-800 whitespace-pre-wrap">
                  {problem?.catalog_code ? (
                    <span className="text-slate-400 font-normal mr-1 font-mono">{problem.catalog_code}</span>
                  ) : null}
                  {problem?.name}
                </div>
                {problem?.lcm_code && problem.lcm_code !== problem.catalog_code ? (
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono">LCM: {problem.lcm_code}</div>
                ) : null}
                {problem?.hypothesis_usages && problem.hypothesis_usages.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {problem.hypothesis_usages.map(u => (
                      <span key={u.hypothesis_id} className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {u.hypothesis_name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        {!editing && problem ? (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {problem.hypothesis_usages.length === 0 ? (
              <p className="text-sm text-slate-400">Нет связей с гипотезами</p>
            ) : (
              problem.hypothesis_usages.map(usage => (
                <section key={usage.hypothesis_id} className="border border-slate-100 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-700 flex items-center justify-between gap-2">
                    <span>{usage.hypothesis_name}</span>
                    {usage.code ? (
                      <span className="text-[10px] font-mono font-normal text-slate-400">№ {usage.code}</span>
                    ) : null}
                  </div>
                  {usage.solutions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">Нет привязанных решений</p>
                  ) : (
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-100">
                          <th className="px-3 py-1.5 font-medium w-16">Код</th>
                          <th className="px-3 py-1.5 font-medium">Решение</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.solutions.map(solution => (
                          <tr key={solution.id} className="border-b border-slate-50 last:border-0">
                            <td className="px-3 py-1.5 text-slate-400 font-mono align-top">
                              {solution.catalog_code ?? solution.lcm_code ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 text-slate-700 whitespace-pre-wrap align-top">
                              {solution.name}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              ))
            )}
          </div>
        ) : null}

        <div className="px-4 py-3 border-t border-slate-100 flex justify-between gap-2">
          <div>
            {mode !== 'create' && onDelete && !editing ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              Отмена
            </button>
            {editing ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                onClick={handleSave}
                disabled={saving || !draft.name.trim()}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            ) : mode !== 'create' ? (
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-blue-500 text-white hover:bg-blue-600"
                onClick={() => {
                  if (problem) setDraft(problemToDraft(problem));
                  setEditing(true);
                }}
              >
                Редактировать
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
