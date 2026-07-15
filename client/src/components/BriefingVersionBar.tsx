import { useMemo, useState } from 'react';
import type { BriefingFull, BriefingVersion, VersionCompareResult } from '../types';
import {
  createBriefingVersion,
  getBriefingVersionView,
  compareBriefingVersions,
} from '../api';

type Props = {
  briefingId: number;
  data: BriefingFull;
  onViewVersion: (data: BriefingFull) => void;
  onReloadDraft: () => void;
};

export default function BriefingVersionBar({
  briefingId,
  data,
  onViewVersion,
  onReloadDraft,
}: Props) {
  const versions = data.versions ?? [];
  const draftId = data.active_version_id
    ?? versions.find(v => v.status === 'draft')?.id
    ?? null;
  const viewingId = data.viewed_version_id
    ?? (data.read_only ? null : draftId);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);
  const [compareResult, setCompareResult] = useState<VersionCompareResult | null>(null);

  const canCompare = versions.length >= 2;

  const draftLabel = useMemo(
    () => versions.find(v => v.id === draftId)?.label ?? 'черновик',
    [versions, draftId],
  );

  async function selectVersion(v: BriefingVersion) {
    setError(null);
    setBusy(true);
    try {
      if (v.status === 'draft') {
        onReloadDraft();
        return;
      }
      const { data: viewed } = await getBriefingVersionView(briefingId, v.id);
      onViewVersion(viewed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCreate() {
    setBusy(true);
    setError(null);
    try {
      await createBriefingVersion(briefingId, {
        label: label.trim() || undefined,
        note: note.trim() || undefined,
      });
      setCreateOpen(false);
      setLabel('');
      setNote('');
      onReloadDraft();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runCompare() {
    if (compareA == null || compareB == null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await compareBriefingVersions(briefingId, compareA, compareB);
      setCompareResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function openCompare() {
    const frozen = versions.filter(v => v.status === 'frozen');
    const draft = versions.find(v => v.status === 'draft');
    setCompareA(frozen[frozen.length - 1]?.id ?? versions[0]?.id ?? null);
    setCompareB(draft?.id ?? versions[versions.length - 1]?.id ?? null);
    setCompareResult(null);
    setCompareOpen(true);
  }

  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Версии:</span>
        {versions.map(v => {
          const active = viewingId === v.id || (!data.read_only && v.status === 'draft' && v.id === draftId);
          return (
            <button
              key={v.id}
              type="button"
              disabled={busy}
              onClick={() => void selectVersion(v)}
              className={`text-xs px-2.5 py-1 rounded border ${
                active
                  ? v.status === 'draft'
                    ? 'bg-blue-100 border-blue-400 text-blue-900'
                    : 'bg-amber-100 border-amber-400 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={v.note ?? (v.status === 'frozen' ? 'Заморожена' : 'Черновик')}
            >
              {v.label}
              {v.status === 'frozen' ? ' 🔒' : ' ✎'}
            </button>
          );
        })}
        <button
          type="button"
          disabled={busy || !!data.read_only}
          onClick={() => {
            setLabel(`v${versions.length + 1}`);
            setNote('');
            setCreateOpen(true);
          }}
          className="text-xs px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          + Новая версия…
        </button>
        {canCompare && (
          <button
            type="button"
            disabled={busy}
            onClick={openCompare}
            className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
          >
            Сравнить…
          </button>
        )}
        {data.read_only && (
          <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            Просмотр замороженной версии — правки недоступны. Черновик: {draftLabel}.
          </span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Новая версия</h3>
            <p className="text-xs text-slate-500">
              Текущий черновик будет заморожен (со всей оценкой и сценариями).
              Новая версия — чистая: без переноса оценки РП и вариантов.
            </p>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Метка</label>
              <input
                className="w-full text-sm border rounded px-3 py-2"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="v2"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Примечание</label>
              <input
                className="w-full text-sm border rounded px-3 py-2"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Например: файл от заказчика 15.07.2026"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded border"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
              >
                Отмена
              </button>
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => void confirmCreate()}
                disabled={busy}
              >
                {busy ? 'Создание…' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {compareOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-4 space-y-3 my-4">
            <h3 className="text-sm font-semibold text-slate-800">Сравнение версий</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Версия A</label>
                <select
                  className="w-full text-sm border rounded px-2 py-1.5"
                  value={compareA ?? ''}
                  onChange={e => setCompareA(Number(e.target.value))}
                >
                  {versions.map(v => (
                    <option key={v.id} value={v.id}>{v.label} ({v.status === 'draft' ? 'черновик' : 'архив'})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Версия B</label>
                <select
                  className="w-full text-sm border rounded px-2 py-1.5"
                  value={compareB ?? ''}
                  onChange={e => setCompareB(Number(e.target.value))}
                >
                  {versions.map(v => (
                    <option key={v.id} value={v.id}>{v.label} ({v.status === 'draft' ? 'черновик' : 'архив'})</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={busy || compareA == null || compareB == null || compareA === compareB}
              onClick={() => void runCompare()}
            >
              Показать diff
            </button>

            {compareResult && (
              <div className="space-y-3 text-xs border-t pt-3">
                <p className="text-slate-600">
                  {compareResult.a.label} → {compareResult.b.label}:{' '}
                  <span className="text-emerald-700">+{compareResult.input.summary.added}</span>
                  {' / '}
                  <span className="text-red-600">−{compareResult.input.summary.removed}</span>
                  {' / '}
                  <span className="text-amber-700">Δ{compareResult.input.summary.changed}</span>
                </p>
                {([
                  ['Проблематики', compareResult.input.problems],
                  ['Решения', compareResult.input.solutions],
                  ['Виджеты', compareResult.input.widgets],
                  ['ФС', compareResult.input.fs],
                ] as const).map(([title, items]) => {
                  const visible = items.filter(i => i.change !== 'same');
                  if (visible.length === 0) return null;
                  return (
                    <div key={title}>
                      <div className="font-medium text-slate-700 mb-1">{title}</div>
                      <ul className="space-y-0.5 max-h-40 overflow-auto">
                        {visible.map(i => (
                          <li key={`${title}-${i.key}`} className={
                            i.change === 'added' ? 'text-emerald-700'
                              : i.change === 'removed' ? 'text-red-600'
                                : 'text-amber-800'
                          }>
                            {i.change === 'added' ? '+' : i.change === 'removed' ? '−' : 'Δ'}{' '}
                            {i.label}
                            {i.detail ? ` (${i.detail})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <p className="text-slate-400">{compareResult.do_hint.note}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm px-3 py-1.5 rounded border"
                onClick={() => setCompareOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
