import React, { useEffect, useState } from 'react';
import type { Widget, Solution, Problem, FsCatalogItem, CatalogLink, ProjectType, ProjectTypeRate, HeadcountCoefficient } from '../types';
import {
  getWidgets, createWidget, updateWidget, deleteWidget,
  getSolutions, getProblems, getFsCatalog,
  getProblemSolutionLinks, addProblemSolutionLink, removeProblemSolutionLink,
  getSolutionWidgetLinks, addSolutionWidgetLink, removeSolutionWidgetLink,
  getSolutionFsLinks, addSolutionFsLink, removeSolutionFsLink,
  getWidgetFsLinks, addWidgetFsLink, removeWidgetFsLink,
  getProjectTypes, createProjectType, updateProjectType, deleteProjectType,
  getProjectTypeRates, addProjectTypeRate, getProjectTypeCoefficients, saveProjectTypeCoefficients,
} from '../api';

type LinkTab = 'widgets' | 'problem-solution' | 'solution-widget' | 'solution-fs' | 'widget-fs' | 'project-types';

const LINK_TABS: { id: LinkTab; label: string }[] = [
  { id: 'widgets', label: 'Виджеты' },
  { id: 'problem-solution', label: 'Проблема → Решение' },
  { id: 'solution-widget', label: 'Решение → Виджет' },
  { id: 'solution-fs', label: 'Решение → ФС' },
  { id: 'widget-fs', label: 'Виджет → ФС' },
  { id: 'project-types', label: 'Типы проекта' },
];

export default function CatalogLinks() {
  const [linkTab, setLinkTab] = useState<LinkTab>('widgets');
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [fsCatalog, setFsCatalog] = useState<FsCatalogItem[]>([]);
  const [psLinks, setPsLinks] = useState<CatalogLink[]>([]);
  const [swLinks, setSwLinks] = useState<CatalogLink[]>([]);
  const [sfLinks, setSfLinks] = useState<CatalogLink[]>([]);
  const [wfLinks, setWfLinks] = useState<CatalogLink[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [typeRates, setTypeRates] = useState<ProjectTypeRate[]>([]);
  const [typeCoeffs, setTypeCoeffs] = useState<HeadcountCoefficient[]>([]);
  const [newRate, setNewRate] = useState('');

  const [newWidget, setNewWidget] = useState({ name: '', description: '', type: 'dashboard' });
  const [addLink, setAddLink] = useState<Record<string, string>>({});

  async function reload() {
    const [w, s, p, f] = await Promise.all([getWidgets(), getSolutions(), getProblems(), getFsCatalog()]);
    setWidgets(w); setSolutions(s); setProblems(p); setFsCatalog(f);
    setPsLinks(await getProblemSolutionLinks());
    setSwLinks(await getSolutionWidgetLinks());
    setSfLinks(await getSolutionFsLinks());
    setWfLinks(await getWidgetFsLinks());
    const pts = await getProjectTypes();
    setProjectTypes(pts);
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

  async function handleCreateWidget() {
    if (!newWidget.name.trim()) return;
    await createWidget(newWidget);
    setNewWidget({ name: '', description: '', type: 'dashboard' });
    reload();
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-700">Админка справочников предоценки</h2>
        <p className="text-[10px] text-slate-400">Связи problem→solution, solution→widget, solution→ФС, widget→ФС</p>
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
        {linkTab === 'widgets' && (
          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-slate-400">Название</label>
                <input className="w-full text-sm border rounded px-2 py-1" value={newWidget.name}
                  onChange={e => setNewWidget({ ...newWidget, name: e.target.value })} />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-slate-400">Описание</label>
                <input className="w-full text-sm border rounded px-2 py-1" value={newWidget.description}
                  onChange={e => setNewWidget({ ...newWidget, description: e.target.value })} />
              </div>
              <select className="text-sm border rounded px-2 py-1" value={newWidget.type}
                onChange={e => setNewWidget({ ...newWidget, type: e.target.value })}>
                <option value="dashboard">dashboard</option>
                <option value="screen">screen</option>
                <option value="report">report</option>
              </select>
              <button onClick={handleCreateWidget} className="text-sm bg-blue-500 text-white px-3 py-1 rounded">+</button>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="bg-slate-50">
                <th className="p-2 border text-left w-20">Картинка</th>
                <th className="p-2 border text-left">Название</th>
                <th className="p-2 border text-left">Тип</th>
                <th className="p-2 border text-left">Описание</th>
                <th className="p-2 border w-16"></th>
              </tr></thead>
              <tbody>
                {widgets.map(w => (
                  <tr key={w.id}>
                    <td className="p-2 border">
                      {w.image_path ? (
                        <img src={`/api/uploads/${w.image_path}`} alt="" className="w-14 h-10 object-contain" />
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="p-2 border">
                      <input className="w-full border-0 bg-transparent" defaultValue={w.name}
                        onBlur={e => { if (e.target.value !== w.name) updateWidget(w.id, { name: e.target.value }).then(reload); }} />
                    </td>
                    <td className="p-2 border text-slate-500">{w.type}</td>
                    <td className="p-2 border text-slate-500 truncate max-w-xs">{w.description}</td>
                    <td className="p-2 border">
                      <button onClick={() => { if (confirm('Удалить?')) deleteWidget(w.id).then(reload); }}
                        className="text-red-400 hover:text-red-600">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {linkTab === 'problem-solution' && (
          <LinkEditor
            links={psLinks}
            fields={[
              { key: 'problem_id', label: 'Проблема', options: problems.map(p => ({ id: p.id, name: p.name })) },
              { key: 'solution_id', label: 'Решение', options: solutions.map(s => ({ id: s.id, name: s.name })) },
            ]}
            display={(l) => `${l.problem_name} → ${l.solution_name}`}
            onAdd={async (v) => { await addProblemSolutionLink(Number(v.problem_id), Number(v.solution_id)); reload(); }}
            onRemove={async (l) => { await removeProblemSolutionLink(l.problem_id!, l.solution_id!); reload(); }}
            addLink={addLink} setAddLink={setAddLink} tabKey="ps"
          />
        )}

        {linkTab === 'solution-widget' && (
          <LinkEditor
            links={swLinks}
            fields={[
              { key: 'solution_id', label: 'Решение', options: solutions.map(s => ({ id: s.id, name: s.name })) },
              { key: 'widget_id', label: 'Виджет', options: widgets.map(w => ({ id: w.id, name: w.name })) },
            ]}
            display={(l) => `${l.solution_name} → ${l.widget_name}`}
            onAdd={async (v) => { await addSolutionWidgetLink(Number(v.solution_id), Number(v.widget_id)); reload(); }}
            onRemove={async (l) => { await removeSolutionWidgetLink(l.solution_id!, l.widget_id!); reload(); }}
            addLink={addLink} setAddLink={setAddLink} tabKey="sw"
          />
        )}

        {linkTab === 'solution-fs' && (
          <LinkEditor
            links={sfLinks}
            fields={[
              { key: 'solution_id', label: 'Решение', options: solutions.map(s => ({ id: s.id, name: s.name })) },
              { key: 'fs_item_id', label: 'ФС', options: fsCatalog.map(f => ({ id: f.id, name: f.name })) },
            ]}
            display={(l) => `${l.solution_name} → ${l.fs_name}`}
            onAdd={async (v) => { await addSolutionFsLink(Number(v.solution_id), Number(v.fs_item_id)); reload(); }}
            onRemove={async (l) => { await removeSolutionFsLink(l.solution_id!, l.fs_item_id!); reload(); }}
            addLink={addLink} setAddLink={setAddLink} tabKey="sf"
          />
        )}

        {linkTab === 'widget-fs' && (
          <LinkEditor
            links={wfLinks}
            fields={[
              { key: 'widget_id', label: 'Виджет', options: widgets.map(w => ({ id: w.id, name: w.name })) },
              { key: 'fs_item_id', label: 'ФС', options: fsCatalog.map(f => ({ id: f.id, name: f.name })) },
            ]}
            display={(l) => `${l.widget_name} → ${l.fs_name}`}
            onAdd={async (v) => { await addWidgetFsLink(Number(v.widget_id), Number(v.fs_item_id)); reload(); }}
            onRemove={async (l) => { await removeWidgetFsLink(l.widget_id!, l.fs_item_id!); reload(); }}
            addLink={addLink} setAddLink={setAddLink} tabKey="wf"
          />
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

function LinkEditor({ links, fields, display, onAdd, onRemove, addLink, setAddLink, tabKey }: {
  links: CatalogLink[];
  fields: { key: string; label: string; options: { id: number; name: string }[] }[];
  display: (l: CatalogLink) => string;
  onAdd: (v: Record<string, string>) => Promise<void>;
  onRemove: (l: CatalogLink) => Promise<void>;
  addLink: Record<string, string>;
  setAddLink: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tabKey: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end">
        {fields.map(f => (
          <div key={f.key} className="flex-1">
            <label className="text-[10px] text-slate-400">{f.label}</label>
            <select className="w-full text-sm border rounded px-2 py-1"
              value={addLink[`${tabKey}-${f.key}`] ?? ''}
              onChange={e => setAddLink(prev => ({ ...prev, [`${tabKey}-${f.key}`]: e.target.value }))}>
              <option value="">—</option>
              {f.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        ))}
        <button
          onClick={() => {
            const v: Record<string, string> = {};
            fields.forEach(f => { v[f.key] = addLink[`${tabKey}-${f.key}`] ?? ''; });
            if (fields.every(f => v[f.key])) onAdd(v);
          }}
          className="text-sm bg-blue-500 text-white px-3 py-1 rounded">+</button>
      </div>
      <div className="space-y-1">
        {links.map((l, i) => (
          <div key={i} className="flex items-center gap-2 text-sm p-2 bg-slate-50 rounded">
            <span className="flex-1">{display(l)}</span>
            <button onClick={() => onRemove(l)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        ))}
        {links.length === 0 && <p className="text-sm text-slate-400">Нет связей</p>}
      </div>
    </div>
  );
}
