import type { User, Project, ProjectRow, WorkReference, RefAuthor, BaseWork, Constants, HistoryEntry, RefType } from './types';

const BASE = '/api';

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Users
export const getUsers = () => req<User[]>('/users');
export const createUser = (name: string) => req<User>('/users', { method: 'POST', body: JSON.stringify({ name }) });

// Constants
export const getConstants = () => req<Constants>('/constants');
export const saveConstants = (data: Partial<Constants>) =>
  req<{ ok: boolean }>('/constants', { method: 'PUT', body: JSON.stringify(data) });

// Etaps
export interface Etap { id: number; name: string; sort_order: number }
export const getEtaps = () => req<Etap[]>('/constants/etaps');
export const createEtap = (name: string) => req<Etap>('/constants/etaps', { method: 'POST', body: JSON.stringify({ name }) });
export const updateEtap = (id: number, data: { name?: string; sort_order?: number }) =>
  req<{ ok: boolean }>(`/constants/etaps/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteEtap = (id: number) => req<{ ok: boolean }>(`/constants/etaps/${id}`, { method: 'DELETE' });
export const reorderEtaps = (ids: number[]) =>
  req<{ ok: boolean }>('/constants/etaps/reorder', { method: 'POST', body: JSON.stringify({ ids }) });

// Base works catalog
export const getBaseWorks = () => req<BaseWork[]>('/constants/base-works');
export const createBaseWork = (data: Partial<BaseWork>) =>
  req<BaseWork>('/constants/base-works', { method: 'POST', body: JSON.stringify(data) });
export const updateBaseWork = (id: string, data: Partial<BaseWork>) =>
  req<BaseWork>(`/constants/base-works/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteBaseWork = (id: string) =>
  req<{ ok: boolean }>(`/constants/base-works/${id}`, { method: 'DELETE' });

// Projects
export const getProjects = () => req<Project[]>('/projects');
export const createProject = (data: { name: string; type?: string; is_template?: number; created_by?: number }) =>
  req<{ id: number }>('/projects', { method: 'POST', body: JSON.stringify(data) });
export const copyProject = (id: number, name: string, created_by?: number) =>
  req<{ id: number }>(`/projects/${id}/copy`, { method: 'POST', body: JSON.stringify({ name, created_by }) });
export const updateProject = (id: number, data: { name?: string; type?: string; is_template?: number }) =>
  req<{ ok: boolean }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteProject = (id: number) =>
  req<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' });

// Rows
export const getRows = (projectId: number) => req<ProjectRow[]>(`/rows/${projectId}`);
export const addRow = (projectId: number, data: Partial<ProjectRow> & { user_id?: number }) =>
  req<ProjectRow>(`/rows/${projectId}`, { method: 'POST', body: JSON.stringify(data) });
export const updateRow = (rowId: number, data: Partial<ProjectRow> & { user_id?: number }) =>
  req<ProjectRow>(`/rows/${rowId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteRow = (rowId: number, user_id?: number) =>
  req<{ ok: boolean }>(`/rows/${rowId}`, { method: 'DELETE', body: JSON.stringify({ user_id }) });
export const reorderRows = (projectId: number, ids: number[]) =>
  req<{ ok: boolean }>(`/rows/${projectId}/reorder`, { method: 'POST', body: JSON.stringify({ ids }) });
export const getHistory = (projectId: number) => req<HistoryEntry[]>(`/rows/${projectId}/history`);

// References
export const getReferences = (type: RefType, work_name: string, author_id?: number | null) => {
  const params = new URLSearchParams({ type, work_name });
  if (author_id === null) params.set('author_id', 'null');
  else if (author_id !== undefined) params.set('author_id', String(author_id));
  return req<WorkReference[]>(`/references?${params}`);
};
export const getRefAuthors = (type: RefType, work_name: string) =>
  req<RefAuthor[]>(`/references/authors?type=${type}&work_name=${encodeURIComponent(work_name)}`);
export const addReference = (data: { ref_type: RefType; work_name: string; content: string; author_id?: number }) =>
  req<{ id: number }>('/references', { method: 'POST', body: JSON.stringify(data) });
export const useReference = (id: number) =>
  req<{ ok: boolean }>(`/references/${id}/use`, { method: 'POST' });
export const deleteReference = (id: number) =>
  req<{ ok: boolean }>(`/references/${id}`, { method: 'DELETE' });
