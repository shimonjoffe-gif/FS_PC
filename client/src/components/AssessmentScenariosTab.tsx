import { useMemo, useState } from 'react';
import type {
  AssessmentScenario, AssessmentScenarioSnapshot, BriefingAssessment, BriefingFsSel, FsQueueKey,
  QueueLabelsMap, TeamProportions,
} from '../types';
import { FS_QUEUE_KEYS, FS_QUEUE_LABELS } from '../types';
import type { AssessmentNsiCache } from '../assessmentNsi';
import {
  createAssessmentSnapshot, deleteAssessmentSnapshot, getAssessmentSnapshotKpHtml,
  getBriefing, getProblemSolutionLinks, getSolutionFsLinksAll, getSolutions,
} from '../api';
import {
  QUEUE_TECHNOLOGY_OPTIONS, getEvaluatedQueueKeys,
} from '../assessmentCalc';
import {
  buildScenarioSnapshotPayload,
  computeScenarioComparison,
  computeScenarioSpDelta,
  createAssessmentScenario,
  getBaseQueueRate,
  getBaseQueueTechnologyLabel,
  getScenarioPhaseEnabled,
  getScenarioQueueRate,
  getScenarioQueueTechnologyLabel,
  getScenarioItemQueueEnabled,
  isFsExcludedInScenario,
  moveScenarioItemToQueue,
  phaseRowsForComparison,
  scenarioFsExclusionWarnings,
  setScenarioItemQueue,
  setScenarioPhaseEnabled,
  setScenarioQueueTechnology,
  toggleScenarioFsExcluded,
} from '../scenarioCalc';
import {
  buildKpCommercialProposalHtml,
  buildKpProblemBlocks,
  buildKpSolutionFsList,
} from '../kpHtmlExport';
import { formatMoneyRub } from '../utils/formatNumber';
import ScenarioDetailComparisonTable from './ScenarioDetailComparisonTable';
import ScenarioFsQueueTable from './ScenarioFsQueueTable';
import SummaryScenarioMatrixTable from './SummaryScenarioMatrixTable';
import type { SummaryScenarioMatrix } from '../summaryScenarioMatrix';

type ScenarioEditorTab = 'phases' | 'technology' | 'fs' | 'summary';

type Props = {
  briefingId: number;
  briefingUpdatedAt?: string;
  assessment: BriefingAssessment;
  fsItems: BriefingFsSel[];
  accuracyPct: number;
  defaultTeam: TeamProportions;
  nsi?: AssessmentNsiCache;
  snapshots: AssessmentScenarioSnapshot[];
  queueLabels: QueueLabelsMap;
  summaryMatrix: SummaryScenarioMatrix | null;
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
  queueLabels,
  summaryMatrix,
  onChange,
  onSnapshotsChange,
}: Props) {
  const scenarios = assessment.assessment_scenarios ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(scenarios[0]?.id ?? null);
  const [activeQueue, setActiveQueue] = useState<FsQueueKey>('1');
  const [editorTab, setEditorTab] = useState<ScenarioEditorTab>('phases');
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [freezeName, setFreezeName] = useState('');
  const [freezeSent, setFreezeSent] = useState(false);
  const [freezeExtended, setFreezeExtended] = useState(false);
  const [freezeScenarioIds, setFreezeScenarioIds] = useState<string[]>([]);
  const [freezing, setFreezing] = useState(false);
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);
  const [kpPreview, setKpPreview] = useState<{ name: string; html: string } | null>(null);
  const [kpPreviewLoading, setKpPreviewLoading] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);

  const selected = scenarios.find(s => s.id === selectedId) ?? null;
  const viewingSnapshot = snapshots.find(s => s.id === viewingSnapshotId) ?? null;

  const comparison = useMemo(() => {
    if (!selected) return null;
    return computeScenarioComparison(
      assessment, fsItems, selected, accuracyPct, defaultTeam, nsi,
    );
  }, [assessment, fsItems, selected, accuracyPct, defaultTeam, nsi]);

  const activeQueues = useMemo(
    () => getEvaluatedQueueKeys(assessment.org_volume),
    [assessment.org_volume],
  );

  const phaseRows = useMemo(
    () => phaseRowsForComparison(assessment.phase_calc_defs ?? []),
    [assessment.phase_calc_defs],
  );

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
      fs_queue_overrides: src.fs_queue_overrides
        ? JSON.parse(JSON.stringify(src.fs_queue_overrides))
        : undefined,
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
    patchScenario(selected.id, {
      fs_excluded: next.fs_excluded,
      fs_queue_overrides: next.fs_queue_overrides,
    });
  }

  function toggleFsItemQueue(item: BriefingFsSel, queue: FsQueueKey) {
    if (!selected) return;
    const current = getScenarioItemQueueEnabled(item, selected, queue);
    const next = setScenarioItemQueue(selected, item, queue, !current);
    patchScenario(selected.id, { fs_queue_overrides: next.fs_queue_overrides });
  }

  function moveFsItemQueue(
    item: BriefingFsSel,
    _fromQueue: FsQueueKey,
    targetQueue: FsQueueKey,
  ) {
    if (!selected) return;
    const next = moveScenarioItemToQueue(selected, item, targetQueue);
    patchScenario(selected.id, { fs_queue_overrides: next.fs_queue_overrides });
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
    setFreezeScenarioIds(scenarios.map(s => s.id));
    setFreezeError(null);
    setFreezeOpen(true);
  }

  function toggleFreezeScenario(id: string) {
    setFreezeScenarioIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  async function confirmFreeze() {
    if (!freezeName.trim() || freezing) return;
    setFreezing(true);
    setFreezeError(null);
    try {
      const [briefing, problemLinks, fsLinksAll, catalogSolutions] = await Promise.all([
        getBriefing(briefingId),
        getProblemSolutionLinks(),
        getSolutionFsLinksAll(),
        getSolutions(),
      ]);

      const solutionsByProblemId = new Map<number, { id: number; name: string; catalog_code?: string | null }[]>();
      const selectedSolIds = new Set((briefing.solutions ?? []).map(s => s.id));
      for (const link of problemLinks) {
        if (link.problem_id == null || link.solution_id == null) continue;
        if (!selectedSolIds.has(link.solution_id)) continue;
        const sol = (briefing.solutions ?? []).find(s => s.id === link.solution_id);
        const usage = {
          id: link.solution_id,
          name: sol?.name ?? link.solution_name ?? '',
          catalog_code: sol?.catalog_code ?? null,
        };
        const list = solutionsByProblemId.get(link.problem_id) ?? [];
        if (!list.some(x => x.id === usage.id)) list.push(usage);
        solutionsByProblemId.set(link.problem_id, list);
      }

      const frozenAt = new Date().toISOString();
      const problems = buildKpProblemBlocks(
        briefing.problems ?? [],
        briefing.solutions ?? [],
        solutionsByProblemId,
        catalogSolutions,
      );
      const groupParentIds = new Set(
        problems.flatMap(b => b.solutionRows.filter(r => r.variant === 'parent').map(r => r.id)),
      );
      const solutionFs = buildKpSolutionFsList(
        briefing.solutions ?? [],
        fsLinksAll,
        fsItems,
        groupParentIds,
      );
      const kp_html = buildKpCommercialProposalHtml({
        briefingName: briefing.name,
        snapshotName: freezeName.trim(),
        frozenAt,
        problems,
        solutionFs,
        assessment,
        fsItems,
        scenarios,
        selectedScenarioIds: freezeScenarioIds,
        accuracyPct,
        defaultTeam,
        queueLabels: queueLabels as Record<string, string>,
        nsi,
      });

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
      payload.kp_html = kp_html;

      const created = await createAssessmentSnapshot(briefingId, payload);
      onSnapshotsChange([created, ...snapshots]);
      setViewingSnapshotId(created.id);
      setFreezeOpen(false);
      if (created.has_kp_html) {
        setKpPreview({ name: created.name, html: kp_html });
      }
    } catch (e) {
      setFreezeError(e instanceof Error ? e.message : String(e));
    } finally {
      setFreezing(false);
    }
  }

  async function openKpPreview(snap: AssessmentScenarioSnapshot) {
    if (!snap.has_kp_html) return;
    setKpPreviewLoading(true);
    try {
      const html = await getAssessmentSnapshotKpHtml(briefingId, snap.id);
      setKpPreview({ name: snap.name, html });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setKpPreviewLoading(false);
    }
  }

  function downloadKpHtml(name: string, html: string) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^\w\u0400-\u04FF\- ]+/g, '_').slice(0, 80) || 'kp'}.html`;
    a.click();
    URL.revokeObjectURL(url);
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
        <div className="flex gap-1 border-b border-slate-200">
          {([
            ['phases', 'Фазы и сравнение'],
            ['technology', 'Технология'],
            ['fs', 'ФС'],
            ['summary', 'Итоги'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              data-readonly-allow
              onClick={() => setEditorTab(tab)}
              className={`text-xs px-3 py-2 border-b-2 -mb-px ${
                editorTab === tab
                  ? 'border-blue-500 text-blue-800 font-medium'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {editorTab === 'summary' ? (
          <div>
            {summaryMatrix ? (
              <SummaryScenarioMatrixTable data={summaryMatrix} queueLabels={queueLabels} />
            ) : (
              <p className="text-sm text-slate-400">
                {getEvaluatedQueueKeys(
                  assessment.org_volume?.queues
                    ? assessment.org_volume
                    : assessment.auto_org_volume,
                ).length === 0
                  ? 'Нет оцениваемых очередей — включите «Оценивать» на вкладке «Оценка РП».'
                  : 'Нет данных для сводки ДО. Проверьте включение фаз на вкладке «Оценка РП».'}
              </p>
            )}
          </div>
        ) : !selected ? (
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

            {editorTab === 'phases' && comparison && (
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

            {editorTab === 'technology' && (
            <div>
              <div className="text-xs text-slate-500 mb-2">
                Технология по очередям (отличия от базы «Оценка РП»)
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
                      const scRate = getScenarioQueueRate(assessment, selected, q, nsi, fsItems);
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
            )}

            {editorTab === 'fs' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                ФС в варианте — только пункты с «Да» в базе; D&D между очередями; исключение — справа
              </div>
              {fsWarnings.length > 0 && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 space-y-1">
                  {fsWarnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
              <ScenarioFsQueueTable
                items={fsItems}
                scenario={selected}
                spBase={spDelta!.base}
                spScenario={spDelta!.scenario}
                onToggleQueue={toggleFsItemQueue}
                onMoveToQueue={moveFsItemQueue}
                onToggleExcluded={toggleFsExcluded}
              />
            </div>
            )}

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
                        {snap.has_kp_html && (
                          <span className="ml-1 text-blue-700">· HTML КП</span>
                        )}
                      </button>
                      {snap.has_kp_html && (
                        <>
                          <button
                            type="button"
                            className="text-blue-600 hover:underline px-1 shrink-0"
                            title="Просмотр HTML КП"
                            disabled={kpPreviewLoading}
                            onClick={() => void openKpPreview(snap)}
                          >
                            Открыть
                          </button>
                          <button
                            type="button"
                            className="text-slate-600 hover:underline px-1 shrink-0"
                            title="Скачать HTML КП"
                            onClick={() => void getAssessmentSnapshotKpHtml(briefingId, snap.id)
                              .then(html => downloadKpHtml(snap.name, html))
                              .catch(e => window.alert(e instanceof Error ? e.message : String(e)))}
                          >
                            ↓
                          </button>
                        </>
                      )}
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
                    Сохраняется снимок сравнения и HTML КП (заказчик, фазы, ФС, допущения) по базе и выбранным сценариям.
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
                  <div className="border border-slate-100 rounded-lg p-3 space-y-1.5 bg-slate-50/80">
                    <div className="text-xs font-medium text-slate-700">Варианты в HTML КП (База всегда)</div>
                    {scenarios.length === 0 ? (
                      <p className="text-[11px] text-slate-500">Сценариев нет — в HTML только «База».</p>
                    ) : (
                      scenarios.map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={freezeScenarioIds.includes(s.id)}
                            onChange={() => toggleFreezeScenario(s.id)}
                          />
                          {s.name}
                        </label>
                      ))
                    )}
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
                  {freezeError && <div className="text-xs text-red-600">{freezeError}</div>}
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

            {kpPreview && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 shrink-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{kpPreview.name}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="text-xs px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50"
                        onClick={() => downloadKpHtml(kpPreview.name, kpPreview.html)}
                      >
                        Скачать
                      </button>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
                        onClick={() => setKpPreview(null)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <iframe
                    title={kpPreview.name}
                    className="flex-1 w-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin"
                    srcDoc={kpPreview.html}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
