import { useMemo, useState } from 'react';
import type {
  AssessmentScenario, AssessmentScenarioSnapshot, BriefingAssessment, BriefingFsSel, FsQueueKey,
  TeamProportions,
} from '../types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../types';
import type { AssessmentNsiCache } from '../assessmentNsi';
import { createAssessmentSnapshot, deleteAssessmentSnapshot } from '../api';
import {
  QUEUE_TECHNOLOGY_OPTIONS, getActiveQueueKeys,
} from '../assessmentCalc';
import {
  baseEnabledFsItems,
  buildScenarioSnapshotPayload,
  computeScenarioComparison,
  computeScenarioSpDelta,
  createAssessmentScenario,
  getBaseQueueRate,
  getBaseQueueTechnologyLabel,
  getScenarioPhaseEnabled,
  getScenarioQueueRate,
  getScenarioQueueTechnologyLabel,
  isFsExcludedInScenario,
  phaseRowsForComparison,
  scenarioFsExclusionWarnings,
  setScenarioPhaseEnabled,
  setScenarioQueueTechnology,
  toggleScenarioFsExcluded,
} from '../scenarioCalc';
import { formatMoneyRub } from '../utils/formatNumber';
import ScenarioDetailComparisonTable from './ScenarioDetailComparisonTable';

type Props = {
  briefingId: number;
  briefingUpdatedAt?: string;
  assessment: BriefingAssessment;
  fsItems: BriefingFsSel[];
  accuracyPct: number;
  defaultTeam: TeamProportions;
  nsi?: AssessmentNsiCache;
  snapshots: AssessmentScenarioSnapshot[];
  onChange: (scenarios: AssessmentScenario[]) => void;
  onSnapshotsChange: (snapshots: AssessmentScenarioSnapshot[]) => void;
};

function formatFrozenAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

export default function AssessmentScenariosTab({
  briefingId,
  briefingUpdatedAt,
  assessment,
  fsItems,
  accuracyPct,
  defaultTeam,
  nsi,
  snapshots,
  onChange,
  onSnapshotsChange,
}: Props) {
  const scenarios = assessment.assessment_scenarios ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [activeQueue, setActiveQueue] = useState<FsQueueKey>('1');
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeName, setFreezeName] = useState('');
  const [freezeSent, setFreezeSent] = useState(false);
  const [freezeExtended, setFreezeExtended] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);

  const selected = scenarios.find(s => s.id === selectedId) ?? null;
  const viewingSnapshot = snapshots.find(s => s.id === viewingSnapshotId) ?? null;

  const comparison = useMemo(() => {
    if (!selected) return null;
    return computeScenarioComparison(
      assessment, fsItems, selected, accuracyPct, defaultTeam, nsi,
    );
  }, [assessment, fsItems, selected, accuracyPct, defaultTeam, nsi]);

  const activeQueues = useMemo(
    () => getActiveQueueKeys(assessment.org_volume),
    [assessment.org_volume],
  );

  const phaseRows = useMemo(
    () => phaseRowsForComparison(assessment.phase_calc_defs ?? []),
    [assessment.phase_calc_defs],
  );

  const enabledFsItems = useMemo(() => baseEnabledFsItems(fsItems), [fsItems]);

  const fsWarnings = useMemo(
    () => (selected ? scenarioFsExclusionWarnings(selected) : []),
    [selected],
  );

  const spDelta = useMemo(
    () => (selected ? computeScenarioSpDelta(fsItems, selected) : null),
    [fsItems, selected],
  );

  function updateScenarios(next: AssessmentScenario[]) {
    onChange(next);
    if (selectedId && !next.some(s => s.id === selectedId)) {
      setSelectedId(next[0]?.id ?? null);
    }
  }

  function addScenario() {
    const n = scenarios.length + 1;
    const scenario = createAssessmentScenario(`Сценарий ${n}`);
    updateScenarios([...scenarios, scenario]);
    setSelectedId(scenario.id);
  }

  function duplicateScenario(id: string) {
    const src = scenarios.find(s => s.id === id);
    if (!src) return;
    const now = new Date().toISOString();
    const copy: AssessmentScenario = {
      ...src,
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: `${src.name} (копия)`,
      created_at: now,
      updated_at: now,
      phase_enabled: src.phase_enabled
        ? JSON.parse(JSON.stringify(src.phase_enabled))
        : undefined,
      fs_excluded: src.fs_excluded ? [...src.fs_excluded] : undefined,
      queue_technology: src.queue_technology
        ? JSON.parse(JSON.stringify(src.queue_technology))
        : undefined,
    };
    updateScenarios([...scenarios, copy]);
    setSelectedId(copy.id);
  }

  function deleteScenario(id: string) {
    if (!window.confirm('Удалить сценарий?')) return;
    updateScenarios(scenarios.filter(s => s.id !== id));
  }

  function patchScenario(id: string, patch: Partial<AssessmentScenario>) {
    updateScenarios(scenarios.map(s =>
      s.id === id ? { ...s, ...patch, updated_at: new Date().toISOString() } : s,
    ));
  }

  function togglePhase(lineId: string) {
    if (!selected) return;
    const current = getScenarioPhaseEnabled(assessment, selected, activeQueue, lineId);
    const next = setScenarioPhaseEnabled(selected, assessment, activeQueue, lineId, !current);
    patchScenario(selected.id, { phase_enabled: next.phase_enabled });
  }

  function toggleFsExcluded(fsItemId: number) {
    if (!selected) return;
    const excluded = !isFsExcludedInScenario(selected, fsItemId);
    const next = toggleScenarioFsExcluded(selected, fsItemId, excluded);
    patchScenario(selected.id, { fs_excluded: next.fs_excluded });
  }

  function setQueueTechnology(queue: FsQueueKey, technology: string) {
    if (!selected) return;
    const next = setScenarioQueueTechnology(selected, assessment, queue, technology);
    patchScenario(selected.id, { queue_technology: next.queue_technology });
  }

  function openFreezeModal() {
    const label = selected?.name ?? 'База';
    const date = new Date().toLocaleDateString('ru-RU');
    setFreezeName(`КП — ${label} — ${date}`);
    setFreezeSent(false);
    setFreezeExtended(false);
    setFreezeOpen(true);
  }

  async function confirmFreeze() {
    if (!freezeName.trim() || freezing) return;
    setFreezing(true);
    try {
      const payload = buildScenarioSnapshotPayload(
        assessment,
        fsItems,
        selected,
        accuracyPct,
        defaultTeam,
        {
          name: freezeName.trim(),
          sent_to_client: freezeSent,
          extended: freezeExtended,
          base_revision: briefingUpdatedAt,
        },
        nsi,
      );
      const created = await createAssessmentSnapshot(briefingId, payload);
      onSnapshotsChange([created, ...snapshots]);
      setViewingSnapshotId(created.id);
      setFreezeOpen(false);
    } finally {
      setFreezing(false);
    }
  }

  async function removeSnapshot(id: string) {
    if (!window.confirm('Удалить снимок КП?')) return;
    await deleteAssessmentSnapshot(briefingId, id);
    onSnapshotsChange(snapshots.filter(s => s.id !== id));
    if (viewingSnapshotId === id) setViewingSnapshotId(null);
  }

  function renderDelta(base: number, scenario: number): string {
    const diff = scenario - base;
    if (Math.abs(diff) < 0.5) return '—';
    const pct = base !== 0 ? (diff / base) * 100 : null;
    const sign = diff > 0 ? '+' : '';
    const rub = `${sign}${Math.round(diff).toLocaleString('ru-RU')} ₽`;
    if (pct != null && Number.isFinite(pct)) {
      return `${rub} (${sign}${pct.toFixed(1)}%)`;
    }
    return rub;
  }

  return (
    <div className="flex gap-4 min-h-[480px]">
      <aside className="w-52 shrink-0 border border-slate-200 rounded-lg p-2 flex flex-col gap-1">
        <div className="text-xs font-medium text-slate-500 px-2 py-1">Сценарии</div>
        {scenarios.map(s => (
          <div key={s.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`flex-1 text-left text-sm px-2 py-1.5 rounded truncate ${
                selectedId === s.id ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-50'
              }`}
              title={s.name}
            >
              {s.name}
            </button>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 text-xs px-1"
              title="Дублировать"
              onClick={() => duplicateScenario(s.id)}
            >
              ⧉
            </button>
            <button
              type="button"
              className="text-slate-400 hover:text-red-600 text-xs px-1"
              title="Удалить"
              onClick={() => deleteScenario(s.id)}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addScenario}
          className="mt-1 text-sm text-blue-600 hover:text-blue-800 px-2 py-1.5 text-left"
        >
          + Сценарий
        </button>
        <button
          type="button"
          onClick={openFreezeModal}
          className="mt-1 text-sm text-slate-600 hover:text-slate-800 px-2 py-1.5 text-left border-t border-slate-100"
        >
          Зафиксировать КП…
        </button>
      </aside>

      <div className="flex-1 min-w-0 space-y-4">
        {!selected ? (
          <p className="text-sm text-slate-500">
            Создайте сценарий, чтобы сравнить вариант оценки с базой.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Название</label>
                <input
                  type="text"
                  className="w-full text-sm border rounded px-3 py-2"
                  value={selected.name}
                  onChange={e => patchScenario(selected.id, { name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Примечание</label>
                <input
                  type="text"
                  className="w-full text-sm border rounded px-3 py-2"
                  value={selected.note ?? ''}
                  onChange={e => patchScenario(selected.id, { note: e.target.value || undefined })}
                  placeholder="Необязательно"
                />
              </div>
            </div>

            {comparison && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="text-xs text-slate-500">
                      Сравнение ОТ по фазам (live, сумма по активным очередям)
                    </div>
                    <div className="flex gap-1">
                      {FS_QUEUE_KEYS.map(q => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setActiveQueue(q)}
                          className={`text-xs px-2 py-1 rounded border ${
                            activeQueue === q
                              ? 'bg-blue-100 border-blue-300 text-blue-800'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {FS_QUEUE_LABELS[q]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openFreezeModal}
                    className="text-xs px-3 py-1.5 rounded border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100"
                  >
                    Зафиксировать КП
                  </button>
                </div>
                <ScenarioDetailComparisonTable
                  comparison={comparison}
                  scenarioLabel={selected.name}
                  phaseRows={phaseRows}
                  renderDelta={renderDelta}
                  phaseControl={{
                    getBaseEnabled: lineId =>
                      getScenarioPhaseEnabled(assessment, null, activeQueue, lineId),
                    getScenarioEnabled: lineId =>
                      getScenarioPhaseEnabled(assessment, selected, activeQueue, lineId),
                    onToggleScenarioPhase: togglePhase,
                  }}
                />
              </div>
            )}

            <div>
              <div className="text-xs text-slate-500 mb-2">
                Технология по очередям (отличия от базы «Оценка РП»; ФС без изменений)
              </div>
              <div className="border rounded overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left p-2 border">Очередь</th>
                      <th className="text-left p-2 border">База</th>
                      <th className="text-right p-2 border w-20">C32 база</th>
                      <th className="text-left p-2 border">Сценарий</th>
                      <th className="text-right p-2 border w-20">C32 сц.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeQueues.map(q => {
                      const baseTech = getBaseQueueTechnologyLabel(assessment, q);
                      const scTech = getScenarioQueueTechnologyLabel(assessment, selected, q);
                      const differs = baseTech !== scTech;
                      const baseRate = getBaseQueueRate(assessment, q);
                      const scRate = getScenarioQueueRate(assessment, selected, q, nsi);
                      return (
                        <tr key={q} className={differs ? 'bg-amber-50/40' : ''}>
                          <td className="p-2 border">{FS_QUEUE_LABELS[q]}</td>
                          <td className="p-2 border text-slate-600">{baseTech}</td>
                          <td className="p-2 border text-right tabular-nums">
                            {baseRate.toLocaleString('ru')}
                          </td>
                          <td className="p-2 border">
                            <select
                              className={`w-full text-xs border rounded px-1 py-1 ${
                                differs ? 'bg-amber-50 border-amber-300' : ''
                              }`}
                              value={scTech}
                              onChange={e => setQueueTechnology(q, e.target.value)}
                            >
                              {QUEUE_TECHNOLOGY_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2 border text-right tabular-nums font-medium">
                            {scRate.toLocaleString('ru')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {assessment.unified_rate_enabled ? (
                <p className="text-[10px] text-slate-400 mt-1">
                  Единая ставка включена — C32 одинакова для всех очередей (как на «Оценка РП»).
                </p>
              ) : null}
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-2">
                Исключения ФС (сокращение объёма; база на «ФС + очереди» не меняется)
              </div>
              {fsWarnings.length > 0 && (
                <div className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
                  {fsWarnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
              {spDelta && (selected.fs_excluded?.length ?? 0) > 0 && (
                <p className="text-xs text-slate-600 mb-2">
                  SP функционала (все очереди): база {spDelta.base.all_queues} → сценарий{' '}
                  <span className="font-medium">{spDelta.scenario.all_queues}</span>
                </p>
              )}
              <div className="border rounded overflow-auto max-h-48">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left p-2 border w-12">№</th>
                      <th className="text-left p-2 border">Пункт ФС</th>
                      <th className="text-right p-2 border w-14">SP</th>
                      <th className="text-center p-2 border w-28">Исключить</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enabledFsItems.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-3 text-slate-400 text-center">
                          Нет включённых пунктов ФС в базе
                        </td>
                      </tr>
                    ) : enabledFsItems.map(item => {
                      const excluded = isFsExcludedInScenario(selected, item.fs_item_id);
                      const prefix = item.prefix ?? item.code ?? '';
                      return (
                        <tr key={item.fs_item_id} className={excluded ? 'bg-amber-50/60' : ''}>
                          <td className="p-2 border text-slate-500">{prefix}</td>
                          <td className="p-2 border text-slate-700">{item.name}</td>
                          <td className="p-2 border text-right tabular-nums">
                            {item.story_points ?? 0}
                          </td>
                          <td className="p-2 border text-center">
                            <input
                              type="checkbox"
                              checked={excluded}
                              onChange={() => toggleFsExcluded(item.fs_item_id)}
                              title="Исключить из расчёта сценария"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="text-xs font-medium text-slate-600 mb-2">Снимки КП</div>
              {snapshots.length === 0 ? (
                <p className="text-xs text-slate-400">Нет зафиксированных снимков.</p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {snapshots.map(snap => (
                    <li key={snap.id} className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setViewingSnapshotId(
                          viewingSnapshotId === snap.id ? null : snap.id,
                        )}
                        className={`flex-1 text-left px-2 py-1.5 rounded border ${
                          viewingSnapshotId === snap.id
                            ? 'bg-slate-100 border-slate-300'
                            : 'border-transparent hover:bg-slate-50'
                        }`}
                      >
                        <span className="font-medium">{snap.name}</span>
                        <span className="text-slate-400 ml-2">{formatFrozenAt(snap.frozen_at)}</span>
                        {snap.sent_to_client && (
                          <span className="ml-2 text-emerald-700">· клиенту</span>
                        )}
                        {snap.extended && (
                          <span className="ml-1 text-slate-500">· расшир.</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600 px-1"
                        title="Удалить снимок"
                        onClick={() => void removeSnapshot(snap.id)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {viewingSnapshot && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                  <p className="text-xs text-slate-600 mb-2">
                    Заморожено {formatFrozenAt(viewingSnapshot.frozen_at)}.
                    Снимок не меняется при правках базы.
                    {viewingSnapshot.extended && ' Расширенная фиксация: полный дамп сохранён.'}
                  </p>
                  <ScenarioDetailComparisonTable
                    comparison={viewingSnapshot.results.comparison}
                    scenarioLabel={
                      viewingSnapshot.scenario_overrides?.name ?? 'Сценарий'
                    }
                    phaseRows={phaseRows}
                    renderDelta={renderDelta}
                  />
                  <p className="text-xs text-slate-500 mt-2 tabular-nums">
                    Итого ОТ на момент фиксации:{' '}
                    {formatMoneyRub(viewingSnapshot.results.comparison.scenario.grandTotal)}
                  </p>
                </div>
              )}
            </div>

            {freezeOpen && (
              <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
                <div className="flex min-h-full items-center justify-center">
                <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-4 space-y-3 my-4">
                  <h3 className="text-sm font-semibold text-slate-800">Зафиксировать КП</h3>
                  <p className="text-xs text-slate-500">
                    Сохраняются итоги и настройки сценария. База и live-сценарий продолжат пересчитываться.
                  </p>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">Название</label>
                    <input
                      type="text"
                      className="w-full text-sm border rounded px-3 py-2"
                      value={freezeName}
                      onChange={e => setFreezeName(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={freezeSent}
                      onChange={e => setFreezeSent(e.target.checked)}
                    />
                    Отправлено клиенту
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={freezeExtended}
                      onChange={e => setFreezeExtended(e.target.checked)}
                    />
                    Расширенная фиксация (полный дамп assessment + ФС)
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded border"
                      onClick={() => setFreezeOpen(false)}
                      disabled={freezing}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      onClick={() => void confirmFreeze()}
                      disabled={freezing || !freezeName.trim()}
                    >
                      {freezing ? 'Сохранение…' : 'Зафиксировать'}
                    </button>
                  </div>
                </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
