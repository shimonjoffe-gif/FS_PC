import React, { useEffect, useMemo, useState } from 'react';
import type { Widget, Solution, Problem, FsCatalogItem, FsCatalogGroup, ProjectType, ProjectTypeRate, HeadcountCoefficient, HypothesisListItem, HypothesisProblemDraft, ActivityType, StakeholderRole } from '../types';
import {
  getWidgets, createWidget, updateWidget, deleteWidget, getWidget,
  uploadWidgetImage, removeWidgetImage,
  getSolutions, getProblems, getProblem, createProblemCatalog, saveProblem, deleteProblem, deleteProblemsByHypothesis, getMaturityLevels, getActivityTypes, getFsCatalog, getFsCatalogItems, createFsCatalogItem, patchFsCatalogItem, saveFsCatalogDetails, getFsCatalogUsage,
  createFsCatalogGroup, copyFsCatalogItem, copyFsCatalogGroup, reorderFsCatalog, moveFsCatalogItemToGroup,
  deleteFsCatalogItem, deleteFsCatalogGroup,
  getHypotheses, getHypothesis, createHypothesis, saveHypothesis, deleteHypothesis,
  getSolution, createSolutionCatalog, saveSolution, deleteSolution, deleteSolutionsByHypothesis,
  getSolutionFsLinks, saveSolutionFsLinks,
  getSolutionWidgetLinksForSolution, saveSolutionWidgetLinksForSolution,
  getWidgetFsLinksForWidget, saveWidgetFsLinksForWidget,
  setFsCatalogItemPublished,
  getProjectTypes, createProjectType, updateProjectType, deleteProjectType,
  getProjectTypeRates, addProjectTypeRate, getProjectTypeCoefficients, saveProjectTypeCoefficients,
  getStandardDocuments, createStandardDocument, updateStandardDocument, deleteStandardDocument,
  getStandardDocumentExclusions, createStandardDocumentExclusion, deleteStandardDocumentExclusion,
  getStakeholderRoles,
  type StandardDocument, type StandardDocumentExclusion,
} from '../api';
import { filterFsCatalogItems } from '../utils/fsDisplayGroups';
import FsNsiTable from './FsNsiTable';
import HypothesesNsi from './HypothesesNsi';
import StakeholderRolesNsi from './StakeholderRolesNsi';
import ProblemsNsi from './ProblemsNsi';
import SolutionsNsi from './SolutionsNsi';
import WidgetsNsi from './WidgetsNsi';
import { TYPE_CRITERIA_DEFS } from '../sellerCriteria';

type FsCatalogUsageRow = {
  briefing_name: string;
  project_id: number | null;
  catalog_description: string | null;
  recorded_at: string;
};

type LinkTab = 'widgets' | 'nsi-fs' | 'hypotheses' | 'stakeholder-roles' | 'problems' | 'solutions' | 'project-types' | 'standard-documents';

const LINK_TABS: { id: LinkTab; label: string }[] = [
  { id: 'widgets', label: 'Виджеты' },
  { id: 'nsi-fs', label: 'НСИ → ФС' },
  { id: 'hypotheses', label: 'Гипотезы' },
  { id: 'stakeholder-roles', label: 'Роли заказчика' },
  { id: 'problems', label: 'Проблематики' },
  { id: 'solutions', label: 'Решения' },
  { id: 'project-types', label: 'Типы проекта' },
  { id: 'standard-documents', label: 'Стандартные документы' },
];

export default function CatalogLinks() {
  const [linkTab, setLinkTab] = useState<LinkTab>('widgets');
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [fsCatalog, setFsCatalog] = useState<FsCatalogItem[]>([]);
  const [hypotheses, setHypotheses] = useState<HypothesisListItem[]>([]);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [stakeholderRoles, setStakeholderRoles] = useState<StakeholderRole[]>([]);
  const [maturityLevels, setMaturityLevels] = useState<import('../types').MaturityLevel[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [typeRates, setTypeRates] = useState<ProjectTypeRate[]>([]);
  const [typeCoeffs, setTypeCoeffs] = useState<HeadcountCoefficient[]>([]);
  const [newRate, setNewRate] = useState('');
  const [standardDocuments, setStandardDocuments] = useState<StandardDocument[]>([]);
  const [stdDocExclusions, setStdDocExclusions] = useState<StandardDocumentExclusion[]>([]);
  const [newStdDocLabel, setNewStdDocLabel] = useState('');
  const [exclusionA, setExclusionA] = useState('');
  const [exclusionB, setExclusionB] = useState('');

  const TECH_OPTIONS = ['CASE', 'BZ', 'PROF_MINI', 'PROF', 'KORP'] as const;
  const MATRIX_COLS = [
    { key: 'std_case' as const, label: 'Кейс' },
    { key: 'std_bz' as const, label: 'БЗ' },
    { key: 'std_prof_mini' as const, label: 'мини' },
    { key: 'std_prof' as const, label: 'ПРОФ' },
    { key: 'std_korp' as const, label: 'КОРП' },
  ];

  const criteriaGroupOptions = useMemo(
    () => TYPE_CRITERIA_DEFS.filter(d => d.group === 'type').map(d => ({ key: d.key, label: d.label })),
    [],
  );

  const [fsNsiGroups, setFsNsiGroups] = useState<FsCatalogGroup[]>([]);
  const [fsNsiItems, setFsNsiItems] = useState<FsCatalogItem[]>([]);
  const publishedFsNsiItems = useMemo(
    () => filterFsCatalogItems(fsNsiItems),
    [fsNsiItems],
  );
  const [usageModal, setUsageModal] = useState<{ id: number; name: string } | null>(null);
  const [usageRows, setUsageRows] = useState<FsCatalogUsageRow[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);

  async function reloadFsNsi() {
    const data = await getFsCatalogItems();
    setFsNsiGroups(data.groups);
    setFsNsiItems(data.items);
  }

  async function openUsage(item: FsCatalogItem) {
    setUsageModal({ id: item.id, name: item.name });
    setUsageLoading(true);
    try {
      setUsageRows(await getFsCatalogUsage(item.id));
    } finally {
      setUsageLoading(false);
    }
  }

  async function patchFsNsiField(
    id: number,
    patch: Partial<Pick<FsCatalogItem, 'func_type' | 'story_points' | 'requires_nmd'>>,
  ) {
    await patchFsCatalogItem(id, patch);
    await reloadFsNsi();
  }

  async function saveFsNsiCard(
    id: number,
    patch: { prefix: string | null; name: string; details: { name: string; description: string | null }[] },
  ) {
    await patchFsCatalogItem(id, { prefix: patch.prefix, name: patch.name });
    await saveFsCatalogDetails(id, patch.details);
    await reloadFsNsi();
  }

  async function createFsNsiCard(
    groupPrefix: string,
    groupName: string,
    patch: { prefix: string | null; name: string; details: { name: string; description: string | null }[] },
  ) {
    await createFsCatalogItem({
      group_prefix: groupPrefix,
      group_name: groupName,
      name: patch.name,
      prefix: patch.prefix,
      details: patch.details,
    });
    await reloadFsNsi();
  }

  async function setFsNsiPublished(id: number, published: boolean) {
    await setFsCatalogItemPublished(id, published);
    await reloadFsNsi();
  }

  async function createFsNsiGroup(name: string) {
    await createFsCatalogGroup(name);
    await reloadFsNsi();
  }

  async function copyFsNsiItem(id: number) {
    await copyFsCatalogItem(id);
    await reloadFsNsi();
  }

  async function copyFsNsiGroup(groupKey: string | number) {
    await copyFsCatalogGroup(groupKey);
    await reloadFsNsi();
  }

  async function reorderFsNsi(groups: {
    groupKey: string | number;
    sort_order: number;
    items?: { id: number; sort_order: number }[];
  }[]) {
    await reorderFsCatalog(groups);
    await reloadFsNsi();
  }

  async function moveFsNsiItem(
    itemId: number,
    target: { target_group_id?: number; target_group_prefix?: string },
  ) {
    await moveFsCatalogItemToGroup(itemId, target);
    await reloadFsNsi();
  }

  async function deleteFsNsiItem(id: number, name: string) {
    if (!confirm(`Удалить пункт «${name}»?\n\nПункт скроется из НСИ. В существующих брифингах сохранится снимок.`)) return;
    await deleteFsCatalogItem(id);
    await reloadFsNsi();
  }

  async function deleteFsNsiGroup(group: FsCatalogGroup, itemCount: number) {
    const msg = itemCount > 0
      ? `Удалить группу «${group.group_name}» и все её пункты (${itemCount})?\n\nДанные скроются из НСИ. В существующих брифингах сохранятся снимки.`
      : `Удалить группу «${group.group_name}»?\n\nГруппа скроется из НСИ.`;
    if (!confirm(msg)) return;
    await deleteFsCatalogGroup(group.id);
    await reloadFsNsi();
  }

  async function reload() {
    const [w, s, p, f] = await Promise.all([getWidgets(), getSolutions(), getProblems(), getFsCatalog()]);
    setWidgets(w); setSolutions(s); setProblems(p); setFsCatalog(f);
    await reloadFsNsi();
    setHypotheses(await getHypotheses());
    setActivityTypes(await getActivityTypes());
    setStakeholderRoles(await getStakeholderRoles());
    setMaturityLevels(await getMaturityLevels());
    const pts = await getProjectTypes();
    setProjectTypes(pts);
    setStandardDocuments(await getStandardDocuments());
    setStdDocExclusions(await getStandardDocumentExclusions());
    if (selectedTypeId && pts.some(p => p.id === selectedTypeId)) {
      setTypeRates(await getProjectTypeRates(selectedTypeId));
      setTypeCoeffs(await getProjectTypeCoefficients(selectedTypeId));
    }
  }

  async function selectProjectType(id: number) {
    setSelectedTypeId(id);
    setTypeRates(await getProjectTypeRates(id));
    setTypeCoeffs(await getProjectTypeCoefficients(id));
  }

  useEffect(() => { reload(); }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-700">Админка справочников предоценки</h2>
        <p className="text-[10px] text-slate-400">Связи problem→solution · сопоставление solution→виджет и solution→ФС в карточке решения; widget→ФС — в карточке виджета</p>
      </div>

      <div className="bg-white border-b border-slate-200 px-4 flex gap-0 shrink-0 overflow-x-auto">
        {LINK_TABS.map(t => (
          <button key={t.id} onClick={() => setLinkTab(t.id)}
            className={`text-xs px-3 py-2 border-b-2 whitespace-nowrap font-medium
              ${linkTab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {linkTab === 'nsi-fs' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Справочник пунктов ФС для новых оценок. Изменения не затрагивают уже созданные брифинги (снимок НСИ).
            </p>
            {usageModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setUsageModal(null)}>
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                  <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100 gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">Использование в проектах</div>
                      <div className="text-xs text-slate-500 truncate">{usageModal.name}</div>
                    </div>
                    <button type="button" onClick={() => setUsageModal(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none shrink-0">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 text-xs">
                    {usageLoading ? (
                      <p className="text-slate-400">Загрузка…</p>
                    ) : usageRows.length === 0 ? (
                      <p className="text-slate-400">Пункт ещё не использовался в брифингах</p>
                    ) : (
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            <th className="p-2 border text-left">Брифинг</th>
                            <th className="p-2 border text-left">Проект</th>
                            <th className="p-2 border text-left">Дата</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usageRows.map((row, i) => (
                            <tr key={i}>
                              <td className="p-2 border">{row.briefing_name}</td>
                              <td className="p-2 border">{row.project_id ?? '—'}</td>
                              <td className="p-2 border whitespace-nowrap">{row.recorded_at?.slice(0, 10) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}
            {fsNsiGroups.length === 0 && fsNsiItems.length === 0 && (
              <p className="text-sm text-slate-400">Справочник ФС пуст — выполните импорт xlsx или создайте группу</p>
            )}
            <FsNsiTable
              groups={fsNsiGroups}
              items={fsNsiItems}
              onPatchField={patchFsNsiField}
              onSaveCard={saveFsNsiCard}
              onCreateCard={createFsNsiCard}
              onOpenUsage={openUsage}
              onSetPublished={setFsNsiPublished}
              onCreateGroup={createFsNsiGroup}
              onCopyItem={copyFsNsiItem}
              onCopyGroup={copyFsNsiGroup}
              onReorder={reorderFsNsi}
              onMoveItemToGroup={moveFsNsiItem}
              onDeleteItem={deleteFsNsiItem}
              onDeleteGroup={deleteFsNsiGroup}
            />
          </div>
        )}

        {linkTab === 'widgets' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Справочник виджетов. Откройте виджет — слева гипотезы, проблематики и связанные решения; справа сопоставление с пунктами ФС.
            </p>
            <WidgetsNsi
              items={widgets}
              fsGroups={fsNsiGroups}
              fsItems={publishedFsNsiItems}
              onLoadFsLinks={async id => (await getWidgetFsLinksForWidget(id)).fs_item_ids}
              onSaveFsLinks={async (id, ids) => (await saveWidgetFsLinksForWidget(id, ids)).fs_item_ids}
              onOpen={id => getWidget(id)}
              onReload={reload}
              onCreate={async data => {
                const { id } = await createWidget(data);
                await reload();
                return getWidget(id);
              }}
              onSave={async (id, data) => {
                await updateWidget(id, data);
                await reload();
                return getWidget(id);
              }}
              onDelete={async id => {
                await deleteWidget(id);
                await reload();
              }}
              onUploadImage={async (id, file) => {
                const updated = await uploadWidgetImage(id, file);
                await reload();
                return updated;
              }}
              onRemoveImage={async id => {
                const updated = await removeWidgetImage(id);
                await reload();
                return updated;
              }}
            />
          </div>
        )}

        {linkTab === 'hypotheses' && (
          <HypothesesNsi
            items={hypotheses}
            allProblems={problems}
            allSolutions={solutions}
            maturityLevels={maturityLevels}
            activityTypes={activityTypes}
            allStakeholderRoles={stakeholderRoles}
            onCreate={async name => {
              const created = await createHypothesis({ name });
              await reload();
              return created;
            }}
            onOpen={id => getHypothesis(id)}
            onSave={async (id, data) => {
              await saveHypothesis(id, {
                name: data.name,
                target_audience: data.target_audience,
                maturity_id: data.maturity_id,
                activity_type_ids: data.activity_type_ids,
                problems: data.problems.map((p: HypothesisProblemDraft) => ({
                  problem_id: p.problem_id,
                  name: p.problem_id ? undefined : p.name,
                  solution_ids: p.solution_ids,
                })),
                unique_value_proposition: data.unique_value_proposition,
                key_metrics: data.key_metrics,
                unfair_advantage: data.unfair_advantage,
                channels: data.channels,
                revenue_streams: data.revenue_streams,
                cost_structure: data.cost_structure,
                product: data.product,
                market: data.market,
                alternatives: data.alternatives,
                early_adopters: data.early_adopters,
                triggers: data.triggers,
                segment_ids: data.segment_ids,
                stakeholder_roles: data.stakeholder_roles,
              });
              await reload();
            }}
            onDelete={async (id, name) => {
              if (!confirm(`Удалить гипотезу «${name}»?`)) return;
              await deleteHypothesis(id);
              await reload();
            }}
            onSolutionCreated={sol => setSolutions(prev => {
              if (prev.some(s => s.id === sol.id)) return prev;
              return [...prev, sol].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            })}
            onActivityTypeCreated={at => setActivityTypes(prev => {
              if (prev.some(a => a.id === at.id)) return prev;
              return [...prev, at].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            })}
            onStakeholderRoleCreated={role => setStakeholderRoles(prev => {
              if (prev.some(r => r.id === role.id)) return prev;
              return [...prev, role].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
            })}
          />
        )}

        {linkTab === 'stakeholder-roles' && (
          <StakeholderRolesNsi items={stakeholderRoles} onReload={reload} />
        )}

        {linkTab === 'problems' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Глобальный справочник проблематик: иерархия, поиск и фильтр по гипотезе. Бейджи — в каких гипотезах участвует.
            </p>
            <ProblemsNsi
              items={problems}
              hypothesisOptions={hypotheses.map(h => h.name).sort((a, b) => a.localeCompare(b, 'ru'))}
              onOpen={id => getProblem(id)}
              onCreate={async data => {
                const created = await createProblemCatalog(data);
                await reload();
                return created;
              }}
              onSave={async (id, data) => {
                const updated = await saveProblem(id, data);
                await reload();
                return updated;
              }}
              onDelete={async id => {
                await deleteProblem(id);
                await reload();
              }}
              onDeleteExclusiveForHypothesis={async name => {
                const result = await deleteProblemsByHypothesis(name);
                await reload();
                return result;
              }}
            />
          </div>
        )}

        {linkTab === 'solutions' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Глобальный справочник решений. Откройте решение — слева гипотезы и проблематики, справа сопоставление с виджетами и пунктами ФС (да/нет).
            </p>
            <SolutionsNsi
              items={solutions}
              hypothesisOptions={hypotheses.map(h => h.name).sort((a, b) => a.localeCompare(b, 'ru'))}
              fsGroups={fsNsiGroups}
              fsItems={publishedFsNsiItems}
              widgets={widgets}
              onLoadFsLinks={async id => (await getSolutionFsLinks(id)).fs_links}
              onSaveFsLinks={async (id, links) => (await saveSolutionFsLinks(id, links)).fs_links}
              onLoadWidgetLinks={async id => (await getSolutionWidgetLinksForSolution(id)).widget_ids}
              onSaveWidgetLinks={async (id, ids) => (await saveSolutionWidgetLinksForSolution(id, ids)).widget_ids}
              onOpen={id => getSolution(id)}
              onCreate={async data => {
                const created = await createSolutionCatalog(data);
                await reload();
                return created;
              }}
              onSave={async (id, data) => {
                const updated = await saveSolution(id, data);
                await reload();
                return updated;
              }}
              onDelete={async id => {
                await deleteSolution(id);
                await reload();
              }}
              onDeleteExclusiveForHypothesis={async name => {
                const result = await deleteSolutionsByHypothesis(name);
                await reload();
                return result;
              }}
            />
          </div>
        )}

        {linkTab === 'standard-documents' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Справочник документов: колонки Кейс/БЗ/мини/ПРОФ/КОРП — документ в стандартном наборе для типа; «Сверх стандарта» — можно включить по запросу заказчика, если для типа не входит в стандарт; пары исключений внизу.
            </p>
            <div className="flex gap-2 items-end">
              <label className="flex-1 text-xs">
                <span className="text-slate-400 block mb-1">Новый документ</span>
                <input className="w-full text-sm border rounded px-2 py-1" placeholder="Название"
                  value={newStdDocLabel} onChange={e => setNewStdDocLabel(e.target.value)} />
              </label>
              <button type="button" className="text-sm bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50"
                disabled={!newStdDocLabel.trim()}
                onClick={async () => {
                  await createStandardDocument({
                    field_key: `doc_custom_${Date.now()}`,
                    label: newStdDocLabel.trim(),
                    excel_ref: '',
                    group_key: 'non_standard_docs',
                    sort_order: standardDocuments.length + 1,
                    is_active: 1,
                    tech: 'CASE',
                    can_extra: 0,
                    std_case: 0, std_bz: 0, std_prof_mini: 0, std_prof: 0, std_korp: 0,
                  });
                  setNewStdDocLabel('');
                  setStandardDocuments(await getStandardDocuments());
                }}>+ Добавить</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="p-1 border text-left">Название</th>
                    <th className="p-1 border">Excel</th>
                    <th className="p-1 border">Тех.</th>
                    <th className="p-1 border" title="Можно включить сверх стандартного набора (запрос заказчика)">Сверх std.</th>
                    {MATRIX_COLS.map(c => (
                      <th key={c.key} className="p-1 border text-center">{c.label}</th>
                    ))}
                    <th className="p-1 border">Акт.</th>
                    <th className="p-1 border"></th>
                  </tr>
                </thead>
                <tbody>
                  {standardDocuments.map(doc => (
                    <tr key={doc.id}>
                      <td className="p-1 border">
                        <input className="w-full border-0 bg-transparent text-xs" defaultValue={doc.label}
                          onBlur={e => {
                            if (e.target.value !== doc.label) {
                              void updateStandardDocument(doc.id, { label: e.target.value })
                                .then(async () => setStandardDocuments(await getStandardDocuments()));
                            }
                          }} />
                      </td>
                      <td className="p-1 border">
                        <input className="w-14 border-0 bg-transparent text-center" defaultValue={doc.excel_ref}
                          onBlur={e => {
                            if (e.target.value !== doc.excel_ref) {
                              void updateStandardDocument(doc.id, { excel_ref: e.target.value })
                                .then(async () => setStandardDocuments(await getStandardDocuments()));
                            }
                          }} />
                      </td>
                      <td className="p-1 border">
                        <select className="text-[10px] border-0 bg-transparent" defaultValue={doc.tech}
                          onChange={e => {
                            void updateStandardDocument(doc.id, { tech: e.target.value as StandardDocument['tech'] })
                              .then(async () => setStandardDocuments(await getStandardDocuments()));
                          }}>
                          {TECH_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="p-1 border text-center">
                        <input type="checkbox" defaultChecked={doc.can_extra === 1}
                          onChange={e => {
                            void updateStandardDocument(doc.id, { can_extra: e.target.checked ? 1 : 0 })
                              .then(async () => setStandardDocuments(await getStandardDocuments()));
                          }} />
                      </td>
                      {MATRIX_COLS.map(col => (
                        <td key={col.key} className="p-1 border text-center">
                          <input type="checkbox" defaultChecked={doc[col.key] === 1}
                            onChange={e => {
                              void updateStandardDocument(doc.id, { [col.key]: e.target.checked ? 1 : 0 })
                                .then(async () => setStandardDocuments(await getStandardDocuments()));
                            }} />
                        </td>
                      ))}
                      <td className="p-1 border text-center">
                        <input type="checkbox" defaultChecked={doc.is_active !== 0}
                          onChange={e => {
                            void updateStandardDocument(doc.id, { is_active: e.target.checked ? 1 : 0 })
                              .then(async () => setStandardDocuments(await getStandardDocuments()));
                          }} />
                      </td>
                      <td className="p-1 border text-center">
                        <button type="button" className="text-red-600"
                          onClick={async () => {
                            if (!confirm(`Удалить «${doc.label}»?`)) return;
                            await deleteStandardDocument(doc.id);
                            setStandardDocuments(await getStandardDocuments());
                            setStdDocExclusions(await getStandardDocumentExclusions());
                          }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t pt-3">
              <h4 className="text-sm font-medium mb-2">Пары взаимоисключения</h4>
              <div className="flex flex-wrap gap-2 items-end mb-2">
                <select className="text-xs border rounded px-2 py-1" value={exclusionA} onChange={e => setExclusionA(e.target.value)}>
                  <option value="">Документ A</option>
                  {standardDocuments.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
                <span className="text-xs text-slate-400">↔</span>
                <select className="text-xs border rounded px-2 py-1" value={exclusionB} onChange={e => setExclusionB(e.target.value)}>
                  <option value="">Документ B</option>
                  {standardDocuments.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
                <button type="button" className="text-xs bg-slate-100 px-2 py-1 rounded"
                  disabled={!exclusionA || !exclusionB || exclusionA === exclusionB}
                  onClick={async () => {
                    await createStandardDocumentExclusion(Number(exclusionA), Number(exclusionB));
                    setExclusionA('');
                    setExclusionB('');
                    setStdDocExclusions(await getStandardDocumentExclusions());
                  }}>+ Пара</button>
              </div>
              <ul className="text-xs space-y-1">
                {stdDocExclusions.map(pair => {
                  const a = standardDocuments.find(d => d.id === pair.doc_id_a);
                  const b = standardDocuments.find(d => d.id === pair.doc_id_b);
                  return (
                    <li key={pair.id} className="flex items-center gap-2">
                      <span>{a?.label ?? pair.doc_id_a} ↔ {b?.label ?? pair.doc_id_b}</span>
                      <button type="button" className="text-red-600"
                        onClick={async () => {
                          await deleteStandardDocumentExclusion(pair.id);
                          setStdDocExclusions(await getStandardDocumentExclusions());
                        }}>✕</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {linkTab === 'project-types' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Справочник типов проекта, ставок и коэффициентов численности (НСИ расчёта)</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-2 border text-left">Код</th>
                  <th className="p-2 border text-left">Название</th>
                  <th className="p-2 border text-left">Базовый тип</th>
                  <th className="p-2 border w-20">Активен</th>
                  <th className="p-2 border w-24"></th>
                </tr>
              </thead>
              <tbody>
                {projectTypes.map(pt => (
                  <tr key={pt.id} className={selectedTypeId === pt.id ? 'bg-blue-50' : ''}>
                    <td className="p-2 border font-mono">{pt.code}</td>
                    <td className="p-2 border">
                      <input className="w-full border-0 bg-transparent" defaultValue={pt.name}
                        onBlur={e => { if (e.target.value !== pt.name) updateProjectType(pt.id, { name: e.target.value }).then(reload); }} />
                    </td>
                    <td className="p-2 border text-slate-500">{pt.base_type_name ?? '—'}</td>
                    <td className="p-2 border text-center">{pt.is_active ? '✓' : '—'}</td>
                    <td className="p-2 border">
                      <button onClick={() => selectProjectType(pt.id)} className="text-blue-600 hover:underline mr-2">Ставки</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedTypeId && (
              <div className="grid md:grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Ставки</h4>
                  <div className="flex gap-2 mb-2">
                    <input type="number" placeholder="руб/ч" className="text-sm border rounded px-2 py-1 flex-1"
                      value={newRate} onChange={e => setNewRate(e.target.value)} />
                    <button className="text-sm bg-blue-500 text-white px-3 py-1 rounded"
                      onClick={async () => {
                        if (!newRate) return;
                        await addProjectTypeRate(selectedTypeId, { hourly_rate: Number(newRate) });
                        setNewRate('');
                        setTypeRates(await getProjectTypeRates(selectedTypeId));
                      }}>+</button>
                  </div>
                  {typeRates.map(r => (
                    <div key={r.id} className="text-sm py-1">{r.hourly_rate.toLocaleString('ru')} ₽/ч <span className="text-slate-400">с {r.valid_from}</span></div>
                  ))}
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Коэффициенты численности</h4>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-1 border">Категория</th>
                        <th className="p-1 border">C63</th>
                        <th className="p-1 border">C64</th>
                        <th className="p-1 border">C67</th>
                        <th className="p-1 border">C68</th>
                      </tr>
                    </thead>
                    <tbody>
                      {typeCoeffs.map((c, i) => (
                        <tr key={c.category}>
                          <td className="p-1 border">{c.category}</td>
                          {(['c63', 'c64', 'c67', 'c68'] as const).map(field => (
                            <td key={field} className="p-1 border">
                              <input type="number" step="0.1" className="w-full text-right border-0 bg-transparent"
                                value={c[field]}
                                onChange={e => {
                                  const next = [...typeCoeffs];
                                  next[i] = { ...c, [field]: Number(e.target.value) };
                                  setTypeCoeffs(next);
                                }} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="mt-2 text-sm bg-slate-100 px-3 py-1 rounded hover:bg-slate-200"
                    onClick={async () => {
                      await saveProjectTypeCoefficients(selectedTypeId, typeCoeffs);
                    }}>Сохранить коэффициенты</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
