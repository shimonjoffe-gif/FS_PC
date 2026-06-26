import React, { useState } from 'react';
import type { Project, Briefing } from '../types';
import { copyProject, deleteProject, createBriefing, deleteBriefing } from '../api';

interface Props {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRefresh: () => void;
  currentUserId: number | null;
  mode: 'project' | 'catalog' | 'briefing' | 'briefing-admin';
  onOpenCatalog: () => void;
  briefings: Briefing[];
  selectedBriefingId: number | null;
  onSelectBriefing: (id: number) => void;
  onRefreshBriefings: () => void;
  onNewProjectChoice: (choice: 'quick' | 'briefing') => void;
  onOpenBriefingAdmin: () => void;
}

export default function Sidebar({
  projects, selectedId, onSelect, onRefresh, currentUserId, mode,
  onOpenCatalog, briefings, selectedBriefingId, onSelectBriefing,
  onRefreshBriefings, onNewProjectChoice, onOpenBriefingAdmin,
}: Props) {
  const [showNewChoice, setShowNewChoice] = useState(false);

  const templates = projects.filter(p => p.is_template);
  const myProjects = projects.filter(p => !p.is_template);

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

  async function handleDeleteBriefing(b: Briefing, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Удалить предоценку "${b.name}"?`)) return;
    await deleteBriefing(b.id);
    onRefreshBriefings();
  }

  async function handleNewBriefing() {
    const { id } = await createBriefing({ created_by: currentUserId ?? undefined });
    onRefreshBriefings();
    onSelectBriefing(id);
  }

  return (
    <aside className="w-60 min-w-60 bg-white border-r border-slate-200 flex flex-col h-full">
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

      <button
        onClick={onOpenBriefingAdmin}
        className={`flex items-center gap-2 px-4 py-2 border-b border-slate-100 text-xs font-medium transition-colors
          ${mode === 'briefing-admin'
            ? 'bg-purple-50 text-purple-600'
            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
          }`}
      >
        <span>⚙️</span> Справочники предоценки
      </button>

      {/* Предоценки */}
      <div className="p-3 border-b border-slate-100">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Предоценка</div>
        {briefings.map(b => (
          <div
            key={b.id}
            onClick={() => onSelectBriefing(b.id)}
            className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer mb-0.5
              ${selectedBriefingId === b.id && mode === 'briefing'
                ? 'bg-purple-50 text-purple-700'
                : 'hover:bg-slate-50 text-slate-700'}`}
          >
            <span className="text-purple-300 mr-0.5">◆</span>
            <span className="flex-1 text-xs truncate" title={b.name}>{b.name}</span>
            {b.project_id && <span className="text-[9px] text-green-500" title="Проект создан">✓</span>}
            <button
              className="hidden group-hover:block text-slate-300 hover:text-red-400 text-xs px-1"
              onClick={(e) => handleDeleteBriefing(b, e)}
            >✕</button>
          </div>
        ))}
        {briefings.length === 0 && (
          <div className="text-xs text-slate-300 px-2 mb-2">нет предоценок</div>
        )}
        <button
          onClick={handleNewBriefing}
          className="w-full text-xs text-purple-400 hover:text-purple-600 hover:bg-purple-50 py-1 rounded border border-dashed border-purple-200 hover:border-purple-300"
        >
          + Новая предоценка
        </button>
      </div>

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
            >+ копия</button>
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
              ${selectedId === p.id && mode === 'project' ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}
          >
            <span className="flex-1 text-xs truncate" title={p.name}>{p.name}</span>
            <button
              className="hidden group-hover:block text-slate-300 hover:text-red-400 text-xs px-1"
              onClick={(e) => handleDelete(p, e)}
            >✕</button>
          </div>
        ))}
        {myProjects.length === 0 && (
          <div className="text-xs text-slate-300 px-2">нет проектов</div>
        )}
      </div>

      {/* Добавить проект */}
      <div className="p-3 border-t border-slate-100">
        {showNewChoice ? (
          <div className="space-y-1">
            <button
              onClick={() => { setShowNewChoice(false); onNewProjectChoice('quick'); }}
              className="w-full text-xs text-left px-2 py-1.5 rounded hover:bg-blue-50 text-slate-600"
            >
              📋 Быстро (пустой проект)
            </button>
            <button
              onClick={() => { setShowNewChoice(false); onNewProjectChoice('briefing'); }}
              className="w-full text-xs text-left px-2 py-1.5 rounded hover:bg-purple-50 text-slate-600"
            >
              ◆ Через предоценку
            </button>
            <button onClick={() => setShowNewChoice(false)} className="w-full text-xs text-slate-400 py-1">✕ отмена</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewChoice(true)}
            className="w-full text-xs text-slate-400 hover:text-blue-500 hover:bg-blue-50 py-1.5 rounded border border-dashed border-slate-200 hover:border-blue-300 transition-colors"
          >
            + Новый проект
          </button>
        )}
      </div>
    </aside>
  );
}
