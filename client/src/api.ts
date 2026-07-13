import type {
  User, Project, ProjectRow, WorkReference, RefAuthor, BaseWork, Constants, HistoryEntry, RefType,
  Briefing, BriefingFull, BriefingCalcResult, Industry, Segment, MaturityLevel,
  Problem, ProblemDetail, Solution, SolutionDetail, Widget, FsCatalogItem, FsCatalogGroup, FsCatalogItemsResponse, FsPhase, BriefingParams, CatalogLink,
  ProjectType, ProjectTypeRate, HeadcountCoefficient, BriefingAssessment,
  AssessmentScenarioSnapshot, FsNmdValue, HypothesisListItem, HypothesisDetail, ActivityType,
  ExportBlocks, ImportMode, BriefingImportPreview, BriefingImportResult,
} from './types';
import type { CreateSnapshotPayload } from './scenarioCalc';

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

// === Briefings ===
export const getBriefings = () => req<Briefing[]>('/briefings');
export const getBriefing = (id: number) => req<BriefingFull>(`/briefings/${id}`);
export const createBriefing = (data: { name?: string; created_by?: number }) =>
  req<{ id: number }>('/briefings', { method: 'POST', body: JSON.stringify(data) });
export const updateBriefing = (id: number, data: Partial<Briefing>) =>
  req<{ ok: boolean }>(`/briefings/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteBriefing = (id: number) =>
  req<{ ok: boolean }>(`/briefings/${id}`, { method: 'DELETE' });
export const saveBriefingProblems = (id: number, selections: { problem_id?: number; custom_text?: string }[]) =>
  req<{ ok: boolean }>(`/briefings/${id}/problems`, { method: 'PUT', body: JSON.stringify({ selections }) });
export const saveBriefingSolutions = (id: number, solution_ids: number[]) =>
  req<{ ok: boolean }>(`/briefings/${id}/solutions`, { method: 'PUT', body: JSON.stringify({ solution_ids }) });
export const saveBriefingWidgets = (id: number, selections: { solution_id: number; widget_id: number }[]) =>
  req<{ ok: boolean }>(`/briefings/${id}/widgets`, { method: 'PUT', body: JSON.stringify({ selections }) });
export const saveBriefingFs = (
  id: number,
  payload: {
    items: {
      fs_item_id: number; enabled?: number; queue?: string;
      queues_json?: string | Record<string, number>;
      source?: string; story_points?: number;
      queue_sp_json?: Record<string, number> | null;
      queue_nmd_json?: Record<string, FsNmdValue> | null;
      queue_comment_json?: Record<string, string> | null;
      customer_name?: string | null;
      customer_description?: string | null;
      inactive_for_customer?: boolean;
      detail_lines?: {
        catalog_detail_id?: number | null;
        source: 'nsi' | 'customer';
        name: string;
        description?: string | null;
        inactive?: boolean;
        nsi_name?: string | null;
        nsi_description?: string | null;
        sort_order?: number;
      }[];
    }[];
    customer_items?: {
      id?: number;
      group_prefix: string;
      name: string;
      description?: string | null;
      func_type: string;
      story_points?: number;
      queues_json?: string | Record<string, number>;
      queue_sp_json?: Record<string, number> | null;
      queue_nmd_json?: Record<string, FsNmdValue> | null;
      queue_comment_json?: Record<string, string> | null;
      sort_order?: number;
      detail_lines?: {
        catalog_detail_id?: number | null;
        source: 'nsi' | 'customer';
        name: string;
        description?: string | null;
        inactive?: boolean;
        nsi_name?: string | null;
        nsi_description?: string | null;
        sort_order?: number;
      }[];
      inactive_for_customer?: boolean;
    }[];
  },
) =>
  req<{ ok: boolean }>(`/briefings/${id}/fs`, { method: 'PUT', body: JSON.stringify(payload) });
export const saveBriefingParams = (id: number, params: Partial<BriefingParams>) =>
  req<{ ok: boolean }>(`/briefings/${id}/params`, { method: 'PUT', body: JSON.stringify(params) });
export const getBriefingAssessment = (id: number) => req<BriefingAssessment>(`/briefings/${id}/assessment`);
export const patchBriefingAssessment = (id: number, data: Record<string, unknown>) =>
  req<BriefingAssessment>(`/briefings/${id}/assessment`, { method: 'PATCH', body: JSON.stringify(data) });
export const getAssessmentSnapshots = (id: number) =>
  req<AssessmentScenarioSnapshot[]>(`/briefings/${id}/assessment-snapshots`);
export const createAssessmentSnapshot = (id: number, data: CreateSnapshotPayload) =>
  req<AssessmentScenarioSnapshot>(`/briefings/${id}/assessment-snapshots`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const deleteAssessmentSnapshot = (id: number, snapshotId: string) =>
  req<{ ok: boolean }>(`/briefings/${id}/assessment-snapshots/${snapshotId}`, { method: 'DELETE' });
export const deriveBriefingFs = (id: number) =>
  req<{ items: unknown[] }>(`/briefings/${id}/derive-fs`, { method: 'POST' });
export const getBriefingAvailableFsCatalogItems = (id: number) =>
  req<FsCatalogItem[]>(`/briefings/${id}/fs/available-catalog-items`);
export const addBriefingFsCatalogItems = (id: number, fs_item_ids: number[]) =>
  req<{ ok: boolean; added: number; fs_items: BriefingFull['fs_items'] }>(
    `/briefings/${id}/fs/add-catalog-items`,
    { method: 'POST', body: JSON.stringify({ fs_item_ids }) },
  );
export const calculateBriefing = (id: number) => req<BriefingCalcResult>(`/briefings/${id}/calculate`);
export const generateProjectFromBriefing = (id: number, data: { name?: string; created_by?: number }) =>
  req<{ project_id: number }>(`/briefings/${id}/generate-project`, { method: 'POST', body: JSON.stringify(data) });

export const exportBriefingHtml = async (id: number, blocks: ExportBlocks): Promise<void> => {
  const r = await fetch(`${BASE}/briefings/${id}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });
  if (!r.ok) throw new Error(await r.text());
  const blob = await r.blob();
  const cd = r.headers.get('Content-Disposition') ?? '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `briefing-${id}-customer.html`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const previewBriefingHtmlImport = (
  id: number,
  html: string,
  options: { mode: ImportMode; blocks?: Partial<ExportBlocks> },
) =>
  req<BriefingImportPreview>(`/briefings/${id}/import/preview`, {
    method: 'POST',
    body: JSON.stringify({ html, ...options }),
  });

export const importBriefingHtml = (
  id: number,
  html: string,
  options: { mode: ImportMode; blocks?: Partial<ExportBlocks> },
) =>
  req<BriefingImportResult>(`/briefings/${id}/import`, {
    method: 'POST',
    body: JSON.stringify({ html, ...options }),
  });

// === Catalog ===
export const getIndustries = () => req<Industry[]>('/catalog/industries');
export const getSegments = () => req<Segment[]>('/catalog/segments');
export const getSegmentsByIndustry = (industryId: number) => req<Segment[]>(`/catalog/industry-segments/${industryId}`);
export const getMaturityLevels = () => req<MaturityLevel[]>('/catalog/maturity-levels');
export const getProblems = (filters?: { industry_id?: number; segment_id?: number; maturity_id?: number }) => {
  const p = new URLSearchParams();
  if (filters?.industry_id) p.set('industry_id', String(filters.industry_id));
  if (filters?.segment_id) p.set('segment_id', String(filters.segment_id));
  if (filters?.maturity_id) p.set('maturity_id', String(filters.maturity_id));
  return req<Problem[]>(`/catalog/problems?${p}`);
};
export const getProblem = (id: number) => req<ProblemDetail>(`/catalog/problems/${id}`);
export const createProblemCatalog = (data: {
  name: string;
  parent_id?: number | null;
  lcm_code?: string | null;
  industry_id?: number | null;
  segment_id?: number | null;
  maturity_id?: number | null;
}) => req<ProblemDetail>('/catalog/problems', { method: 'POST', body: JSON.stringify(data) });
export const saveProblem = (id: number, data: {
  name?: string;
  parent_id?: number | null;
  lcm_code?: string | null;
  industry_id?: number | null;
  segment_id?: number | null;
  maturity_id?: number | null;
}) => req<ProblemDetail>(`/catalog/problems/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteProblem = (id: number) =>
  req<{ ok: boolean }>(`/catalog/problems/${id}`, { method: 'DELETE' });
export const deleteProblemsByHypothesis = (hypothesisKey: string) =>
  req<{ ok: boolean; deleted: number; skipped_shared: number }>(`/catalog/problems/by-hypothesis/${encodeURIComponent(hypothesisKey)}`, { method: 'DELETE' });
export const getSolutions = (problemIds?: number[]) => {
  const p = problemIds?.length ? `?problem_ids=${problemIds.join(',')}` : '';
  return req<Solution[]>(`/catalog/solutions${p}`);
};
export const getSolution = (id: number) => req<SolutionDetail>(`/catalog/solutions/${id}`);
export const createSolutionCatalog = (data: {
  name: string;
  description?: string | null;
  hypothesis?: string | null;
  parent_id?: number | null;
  lcm_code?: string | null;
  fs_mapped?: boolean;
}) => req<SolutionDetail>('/catalog/solutions', { method: 'POST', body: JSON.stringify(data) });
export const saveSolution = (id: number, data: {
  name?: string;
  description?: string | null;
  hypothesis?: string | null;
  parent_id?: number | null;
  lcm_code?: string | null;
  fs_mapped?: boolean;
}) => req<SolutionDetail>(`/catalog/solutions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteSolution = (id: number) =>
  req<{ ok: boolean }>(`/catalog/solutions/${id}`, { method: 'DELETE' });
export const deleteSolutionsByHypothesis = (hypothesisKey: string) =>
  req<{ ok: boolean; deleted: number; skipped_shared: number }>(`/catalog/solutions/by-hypothesis/${encodeURIComponent(hypothesisKey)}`, { method: 'DELETE' });
export const getSolutionFsLinks = (solutionId: number) =>
  req<{ fs_item_ids: number[] }>(`/catalog/solutions/${solutionId}/fs-links`);
export const saveSolutionFsLinks = (solutionId: number, fs_item_ids: number[]) =>
  req<{ fs_item_ids: number[] }>(`/catalog/solutions/${solutionId}/fs-links`, {
    method: 'PUT',
    body: JSON.stringify({ fs_item_ids }),
  });
export const createProblem = (name: string) =>
  req<{ id: number; name: string }>('/catalog/problems', { method: 'POST', body: JSON.stringify({ name }) });
export const createSolution = (name: string) =>
  req<{ id: number; name: string }>('/catalog/solutions', { method: 'POST', body: JSON.stringify({ name }) });
export const getHypotheses = () => req<HypothesisListItem[]>('/catalog/hypotheses');
export const getHypothesis = (id: number) => req<HypothesisDetail>(`/catalog/hypotheses/${id}`);
export const createHypothesis = (data: {
  name: string;
  target_audience?: string;
  maturity_id?: number | null;
  activity_type_ids?: number[];
}) =>
  req<HypothesisDetail>('/catalog/hypotheses', { method: 'POST', body: JSON.stringify(data) });
export const saveHypothesis = (id: number, data: {
  name: string;
  target_audience?: string | null;
  maturity_id?: number | null;
  activity_type_ids?: number[];
  problems?: {
    problem_id?: number;
    name?: string;
    solution_ids?: number[];
    new_solutions?: { name: string }[];
  }[];
}) => req<HypothesisDetail>(`/catalog/hypotheses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteHypothesis = (id: number) =>
  req<{ ok: boolean }>(`/catalog/hypotheses/${id}`, { method: 'DELETE' });
export const getActivityTypes = () => req<ActivityType[]>('/catalog/activity-types');
export const createActivityType = (name: string) =>
  req<ActivityType>('/catalog/activity-types', { method: 'POST', body: JSON.stringify({ name }) });
export const getWidgets = () => req<Widget[]>('/catalog/widgets');
export const getWidgetsBySolution = (solutionId: number) => req<Widget[]>(`/catalog/widgets-by-solution/${solutionId}`);
export const getFsCatalog = () => req<FsCatalogItem[]>('/catalog/fs-catalog');
export const getFsCatalogItems = () => req<FsCatalogItemsResponse>('/catalog/fs-catalog/items');
export const createFsCatalogGroup = (name: string) =>
  req<FsCatalogGroup>('/catalog/fs-catalog/groups', { method: 'POST', body: JSON.stringify({ name }) });
export const copyFsCatalogItem = (id: number) =>
  req<FsCatalogItem>(`/catalog/fs-catalog/${id}/copy`, { method: 'POST' });
export const copyFsCatalogGroup = (groupKey: string | number) =>
  req<FsCatalogGroup>(`/catalog/fs-catalog/groups/${groupKey}/copy`, { method: 'POST' });
export const reorderFsCatalog = (groups: {
  groupKey: string | number;
  sort_order: number;
  items?: { id: number; sort_order: number }[];
}[]) =>
  req<{ ok: boolean; groups: FsCatalogGroup[] }>('/catalog/fs-catalog/reorder', {
    method: 'PUT',
    body: JSON.stringify({ groups }),
  });
export const moveFsCatalogItemToGroup = (
  id: number,
  target: { target_group_prefix?: string; target_group_id?: number },
) =>
  req<FsCatalogItem>(`/catalog/fs-catalog/${id}/group`, {
    method: 'PATCH',
    body: JSON.stringify(target),
  });
export const createFsCatalogItem = (data: {
  group_prefix: string;
  group_name: string;
  name: string;
  prefix?: string | null;
  func_type?: string | null;
  story_points?: number;
  requires_nmd?: string | null;
  description?: string | null;
  details?: { name: string; description?: string | null }[];
}) =>
  req<FsCatalogItem>('/catalog/fs-catalog/items', { method: 'POST', body: JSON.stringify(data) });
export const patchFsCatalogItem = (id: number, data: Partial<FsCatalogItem>) =>
  req<{ ok: boolean }>(`/catalog/fs-catalog/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const saveFsCatalogDetails = (
  id: number,
  details: { name: string; description?: string | null }[],
) => req<{ ok: boolean }>(`/catalog/fs-catalog/${id}/details`, {
  method: 'PUT',
  body: JSON.stringify({ details }),
});
export const getFsCatalogUsage = (fsItemId: number) =>
  req<{ briefing_name: string; project_id: number | null; catalog_description: string | null; recorded_at: string }[]>(
    `/catalog/fs-catalog/${fsItemId}/usage`,
  );
export const deleteFsCatalogItem = (id: number) =>
  req<{ ok: boolean }>(`/catalog/fs-catalog/${id}`, { method: 'DELETE' });
export const deleteFsCatalogGroup = (groupKey: string | number) =>
  req<{ ok: boolean; groups: FsCatalogGroup[] }>(`/catalog/fs-catalog/groups/${groupKey}`, { method: 'DELETE' });
export const publishFsCatalogItem = (id: number) =>
  req<FsCatalogItem>(`/catalog/fs-catalog/${id}/publish`, { method: 'POST' });
export const getFsPhases = () => req<FsPhase[]>('/catalog/fs-phases');

export const createWidget = (data: { name: string; description?: string; type?: string }) =>
  req<{ id: number }>('/catalog/widgets', { method: 'POST', body: JSON.stringify(data) });
export const updateWidget = (id: number, data: Partial<Widget>) =>
  req<{ ok: boolean }>(`/catalog/widgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteWidget = (id: number) =>
  req<{ ok: boolean }>(`/catalog/widgets/${id}`, { method: 'DELETE' });

export const getProblemSolutionLinks = () => req<CatalogLink[]>('/catalog/links/problem-solution');
export const addProblemSolutionLink = (problem_id: number, solution_id: number) =>
  req<{ ok: boolean }>('/catalog/links/problem-solution', { method: 'POST', body: JSON.stringify({ problem_id, solution_id }) });
export const removeProblemSolutionLink = (problem_id: number, solution_id: number) =>
  req<{ ok: boolean }>('/catalog/links/problem-solution', { method: 'DELETE', body: JSON.stringify({ problem_id, solution_id }) });

export const getSolutionWidgetLinks = () => req<CatalogLink[]>('/catalog/links/solution-widget');
export const addSolutionWidgetLink = (solution_id: number, widget_id: number) =>
  req<{ ok: boolean }>('/catalog/links/solution-widget', { method: 'POST', body: JSON.stringify({ solution_id, widget_id }) });
export const removeSolutionWidgetLink = (solution_id: number, widget_id: number) =>
  req<{ ok: boolean }>('/catalog/links/solution-widget', { method: 'DELETE', body: JSON.stringify({ solution_id, widget_id }) });

export const getWidgetFsLinks = () => req<CatalogLink[]>('/catalog/links/widget-fs');
export const addWidgetFsLink = (widget_id: number, fs_item_id: number) =>
  req<{ ok: boolean }>('/catalog/links/widget-fs', { method: 'POST', body: JSON.stringify({ widget_id, fs_item_id }) });
export const removeWidgetFsLink = (widget_id: number, fs_item_id: number) =>
  req<{ ok: boolean }>('/catalog/links/widget-fs', { method: 'DELETE', body: JSON.stringify({ widget_id, fs_item_id }) });

export const getProjectTypes = () => req<ProjectType[]>('/catalog/project-types');
export const createProjectType = (data: Partial<ProjectType>) =>
  req<{ id: number }>('/catalog/project-types', { method: 'POST', body: JSON.stringify(data) });
export const updateProjectType = (id: number, data: Partial<ProjectType>) =>
  req<{ ok: boolean }>(`/catalog/project-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteProjectType = (id: number) =>
  req<{ ok: boolean }>(`/catalog/project-types/${id}`, { method: 'DELETE' });
export const getProjectTypeRates = (id: number) => req<ProjectTypeRate[]>(`/catalog/project-types/${id}/rates`);
export const addProjectTypeRate = (id: number, data: { hourly_rate: number; valid_from?: string }) =>
  req<{ id: number }>(`/catalog/project-types/${id}/rates`, { method: 'POST', body: JSON.stringify(data) });
export const getProjectTypeCoefficients = (id: number) => req<HeadcountCoefficient[]>(`/catalog/project-types/${id}/coefficients`);
export const saveProjectTypeCoefficients = (id: number, coefficients: HeadcountCoefficient[]) =>
  req<{ ok: boolean }>(`/catalog/project-types/${id}/coefficients`, { method: 'PUT', body: JSON.stringify({ coefficients }) });
