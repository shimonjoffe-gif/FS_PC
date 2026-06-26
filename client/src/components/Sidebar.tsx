import React, { useState } from 'react';
import type { Project } from '../types';
import { createProject, copyProject, deleteProject } from '../api';

interface Props {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRefresh: () => void;
  currentUserId: number | null;
  mode: 'project' | 'catalog';
  onOpenCatalog: () => void;
}

export default function Sidebar({ projects, selectedId, onSelect, onRefresh, currentUserId, mode, onOpenCatalog }: Props) {
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const templates = projects.filter(p => p.is_template);
  const myProjects = projects.filter(p => !p.is_template);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const { id } = await createProject({ name, created_by: currentUserId ?? undefined });
    setNewName('');
    setAdding(false);
    onRefresh();
    onSelect(id);
  }

  async function handleCopyFrom(templateId: number, templateName: string) {
    const name = prompt(`Название нового проекта (копия "${templateName}"):`, `Копия — ${templateName}`);
    if (!name) return;
    const { id } = await copyProject(templateId, name, currentUserId ?? undefined);
    onRefresh();
    onSelect(id);
  }

  async function handleDelete(p: Project, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Удалить "${p.name}"?`)) return;
    await deleteProject(p.id);
    onRefresh();
  }

  return (
    <aside className="w-60 min-w-60 bg-white border-r border-slate-200 flex flex-col h-full">
      {/* Каталог работ */}
      <button
        onClick={onOpenCatalog}
        className={`flex items-center gap-2 px-4 py-3 border-b border-slate-100 text-sm font-medium transition-colors
          ${mode === 'catalog'
            ? 'bg-blue-50 text-blue-600 border-b-blue-200'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
      >
        <span>📚</span> Каталог работ
      </button>
      {/* Шаблоны */}
      <div className="p-3 border-b border-slate-100">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Шаблоны</div>
        {templates.map(p => (
          <div
            key={p.id}
            className="group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 text-slate-600"
          >
            <span className="text-blue-400 mr-1">⬜</span>
            <span className="flex-1 text-xs truncate" title={p.name}>{p.name}</span>
            <button
              className="hidden group-hover:block text-xs text-blue-500 hover:text-blue-700 whitespace-nowrap"
              onClick={() => handleCopyFrom(p.id, p.name)}
              title="Создать проект из шаблона"
            >
              + копия
            </button>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-xs text-slate-300 px-2">нет шаблонов</div>
        )}
      </div>

      {/* Проекты */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Проекты</div>
        {myProjects.map(p => (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer mb-0.5
              ${selectedId === p.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}
          >
            <span className="flex-1 text-xs truncate" title={p.name}>{p.name}</span>
            <button
              className="hidden group-hover:block text-slate-300 hover:text-red-400 text-xs px-1"
              onClick={(e) => handleDelete(p, e)}
              title="Удалить"
            >
              ✕
            </button>
          </div>
        ))}
        {myProjects.length === 0 && (
          <div className="text-xs text-slate-300 px-2">нет проектов</div>
        )}
      </div>

      {/* Добавить проект */}
      <div className="p-3 border-t border-slate-100">
        {adding ? (
          <div className="flex gap-1">
            <input
              autoFocus
              className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-400"
              placeholder="Название проекта"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setAdding(false); }}
            />
            <button onClick={handleCreate} className="text-xs bg-blue-500 text-white px-2 rounded hover:bg-blue-600">OK</button>
            <button onClick={() => setAdding(false)} className="text-xs text-slate-400 hover:text-slate-600 px-1">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full text-xs text-slate-400 hover:text-blue-500 hover:bg-blue-50 py-1.5 rounded border border-dashed border-slate-200 hover:border-blue-300 transition-colors"
          >
            + Новый проект
          </button>
        )}
      </div>
    </aside>
  );
}
