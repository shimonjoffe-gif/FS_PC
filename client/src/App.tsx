import React, { useEffect, useState, useCallback } from 'react';
import type { User, Project, ProjectRow, Constants, BaseWork } from './types';
import {
  getUsers, createUser,
  getProjects,
  getRows,
  getConstants, getEtaps, getBaseWorks,
  getHistory,
  updateProject,
  type Etap,
} from './api';
import Sidebar from './components/Sidebar';
import WorkTable from './components/WorkTable';
import Summary from './components/Summary';
import HistoryLog from './components/HistoryLog';
import Catalog from './components/Catalog';

type Tab = 'работы' | 'итоги' | 'история';
type AppMode = 'project' | 'catalog';

export default function App() {
  const [users, setUsers]         = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(
    () => { const s = localStorage.getItem('userId'); return s ? Number(s) : null; }
  );
  const [projects, setProjects]   = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rows, setRows]           = useState<ProjectRow[]>([]);
  const [consts, setConsts]       = useState<Constants | null>(null);
  const [baseWorks, setBaseWorks] = useState<BaseWork[]>([]);
  const [etaps, setEtaps]         = useState<Etap[]>([]);
  const [history, setHistory]     = useState<any[]>([]);
  const [tab, setTab]             = useState<Tab>('работы');
  const [mode, setMode] = useState<AppMode>('project');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedId) ?? null;

  useEffect(() => {
    Promise.all([getUsers(), getProjects(), getConstants(), getEtaps(), getBaseWorks()])
      .then(([u, p, c, e, bw]) => {
        setUsers(u);
        setProjects(p);
        setConsts(c);
        setEtaps(e);
        setBaseWorks(bw);
        if (p.length > 0 && !selectedId) {
          const first = p.find(x => !x.is_template) ?? p[0];
          setSelectedId(first.id);
        }
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getRows(selectedId).then(setRows);
    if (tab === 'история') getHistory(selectedId).then(setHistory);
  }, [selectedId]);

  useEffect(() => {
    if (tab === 'история' && selectedId) {
      getHistory(selectedId).then(setHistory);
    }
  }, [tab]);

  const refreshProjects = useCallback(() => {
    getProjects().then(setProjects);
  }, []);

  const handleSelectProject = useCallback((id: number) => {
    setSelectedId(id);
    setTab('работы');
    setMode('project');
    getRows(id).then(setRows);
  }, []);

  function handleUserChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === '__new__') { setAddingUser(true); return; }
    const id = Number(val);
    setCurrentUserId(id);
    localStorage.setItem('userId', String(id));
  }

  async function handleAddUser() {
    const name = newUserName.trim();
    if (!name) return;
    const u = await createUser(name);
    setUsers(prev => [...prev, u]);
    setCurrentUserId(u.id);
    localStorage.setItem('userId', String(u.id));
    setNewUserName('');
    setAddingUser(false);
  }

  async function handleRenameProject() {
    const name = nameValue.trim();
    if (!name || !selectedId) return;
    await updateProject(selectedId, { name });
    setProjects(prev => prev.map(p => p.id === selectedId ? { ...p, name } : p));
    setEditingName(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Сайдбар */}
      <Sidebar
        projects={projects}
        selectedId={selectedId}
        onSelect={handleSelectProject}
        onRefresh={refreshProjects}
        currentUserId={currentUserId}
        mode={mode}
        onOpenCatalog={() => setMode('catalog')}
      />

      {/* Основная область */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Шапка */}
        <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            {selectedProject ? (
              editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="text-sm font-semibold border border-blue-300 rounded px-2 py-0.5 outline-none"
                    value={nameValue}
                    onChange={e => setNameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameProject(); if (e.key === 'Escape') setEditingName(false); }}
                  />
                  <button onClick={handleRenameProject} className="text-xs text-blue-500 hover:text-blue-700">OK</button>
                  <button onClick={() => setEditingName(false)} className="text-xs text-slate-400">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold text-slate-800 truncate">{selectedProject.name}</h1>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    selectedProject.is_template
                      ? 'text-blue-500 border-blue-200 bg-blue-50'
                      : 'text-slate-400 border-slate-200'
                  }`}>
                    {selectedProject.is_template ? 'шаблон' : selectedProject.type}
                  </span>
                  <button
                    onClick={() => { setNameValue(selectedProject.name); setEditingName(true); }}
                    className="text-[11px] text-slate-300 hover:text-slate-500"
                  >
                    ✏️
                  </button>
                </div>
              )
            ) : (
              <span className="text-sm text-slate-400">Выберите проект</span>
            )}
          </div>

          {/* Выбор пользователя */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Кто я:</span>
            {addingUser ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  className="text-xs border border-slate-200 rounded px-2 py-1 w-28 outline-none focus:border-blue-400"
                  placeholder="Имя"
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddUser(); if (e.key === 'Escape') setAddingUser(false); }}
                />
                <button onClick={handleAddUser} className="text-xs bg-blue-500 text-white px-2 py-1 rounded">OK</button>
                <button onClick={() => setAddingUser(false)} className="text-xs text-slate-400">✕</button>
              </div>
            ) : (
              <select
                value={currentUserId ?? ''}
                onChange={handleUserChange}
                className="text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
              >
                <option value="">— не выбрано —</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
                <option value="__new__">+ Добавить пользователя</option>
              </select>
            )}
          </div>
        </header>

        {mode === 'catalog' ? (
          <Catalog />
        ) : !selectedProject ? (
          <div className="flex-1 flex items-center justify-center text-slate-300">
            <div className="text-center">
              <div className="text-5xl mb-3">📊</div>
              <div>Выберите проект из списка слева</div>
            </div>
          </div>
        ) : (
          <>
            {/* Вкладки */}
            <div className="bg-white border-b border-slate-200 px-4 flex gap-0 shrink-0">
              {(['работы', 'итоги', 'история'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-xs px-4 py-2.5 border-b-2 transition-colors capitalize font-medium
                    ${tab === t
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                >
                  {t === 'работы' ? '📋 Работы' : t === 'итоги' ? '📊 Итоги' : '📜 История'}
                </button>
              ))}
            </div>

            {/* Контент */}
            <div className="flex-1 overflow-hidden">
              {tab === 'работы' && consts && (
                <WorkTable
                  projectId={selectedId!}
                  rows={rows}
                  consts={consts}
                  baseWorks={baseWorks}
                  etaps={etaps.map(e => e.name)}
                  currentUserId={currentUserId}
                  onRowsChange={setRows}
                />
              )}
              {tab === 'итоги' && <Summary rows={rows} />}
              {tab === 'история' && <HistoryLog entries={history} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
