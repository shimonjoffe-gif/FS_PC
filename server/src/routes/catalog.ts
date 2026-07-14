import { Router } from 'express';
import { db } from '../db';
import { compareFsByGroupThenPrefix } from '../fsPrefixSort';
import { createFsCatalogItem, loadFsCatalogItemById, publishFsCatalogItem, setFsCatalogItemPublished, isPublishedFsCatalogItem } from '../fsCatalogNsi';
import { FS_CATALOG_ACTIVE_SQL } from '../fsCatalogActive';
import { softDeleteFsCatalogGroup, softDeleteFsCatalogItem } from '../fsCatalogDelete';
import {
  createHypothesis, createSolution, deleteHypothesis,
  listHypotheses, loadHypothesisById, saveHypothesis,
} from '../hypotheses';
import { createActivityType, listActivityTypes } from '../activityTypes';
import { createDataSlice, listDataSlices } from '../dataSlices';
import {
  applyFsCatalogReorder,
  copyFsCatalogGroup,
  copyFsCatalogItem,
  createFsCatalogGroup,
  loadFsCatalogGroups,
  moveFsCatalogItemToGroup,
} from '../fsCatalogReorder';
import { listSolutionsCatalog, loadSolutionById, createSolutionCatalog, updateSolution, deleteSolution, deleteSolutionsExclusiveToHypothesis, deduplicateSolutions, getSolutionFsLinks, syncSolutionFsLinks, getSolutionWidgetIds, syncSolutionWidgetLinks } from '../solutions';
import { listProblemsCatalog, loadProblemById, createProblemCatalog, updateProblem, deleteProblem, deleteProblemsExclusiveToHypothesis, createProblem } from '../problems';
import { loadWidgetById, getWidgetFsItemIds, syncWidgetFsLinks, saveWidgetImage, removeWidgetImage } from '../widgets';

export const catalogRouter = Router();

catalogRouter.get('/industries', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM industries ORDER BY name`).all());
});

catalogRouter.get('/segments', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM segments ORDER BY name`).all());
});

catalogRouter.get('/industry-segments/:industryId', (req, res) => {
  res.json(db.prepare(`
    SELECT s.* FROM segments s
    JOIN industry_segment_map ism ON ism.segment_id = s.id
    WHERE ism.industry_id=?
    ORDER BY s.name
  `).all(req.params.industryId));
});

catalogRouter.get('/maturity-levels', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM maturity_levels ORDER BY name`).all());
});

catalogRouter.get('/problems', (req, res) => {
  const { industry_id, industry_ids, activity_type_ids, segment_id, maturity_id } = req.query;
  const filters: {
    industry_id?: number;
    industry_ids?: number[];
    activity_type_ids?: number[];
    segment_id?: number;
    maturity_id?: number;
  } = {};
  if (activity_type_ids) {
    filters.activity_type_ids = String(activity_type_ids).split(',').map(Number).filter(Boolean);
  }
  if (industry_ids) {
    filters.industry_ids = String(industry_ids).split(',').map(Number).filter(Boolean);
  } else if (industry_id) {
    filters.industry_id = Number(industry_id);
  }
  if (segment_id) filters.segment_id = Number(segment_id);
  if (maturity_id) filters.maturity_id = Number(maturity_id);
  res.json(listProblemsCatalog(filters));
});

catalogRouter.delete('/problems/by-hypothesis/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const result = deleteProblemsExclusiveToHypothesis(name);
  res.json({ ok: true, ...result });
});

catalogRouter.get('/problems/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = loadProblemById(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

catalogRouter.patch('/problems/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as {
    name?: string;
    parent_id?: number | null;
    lcm_code?: string | null;
    industry_id?: number | null;
    segment_id?: number | null;
    maturity_id?: number | null;
  };
  try {
    const item = updateProblem(id, body);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'update failed' });
  }
});

catalogRouter.delete('/problems/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = deleteProblem(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

catalogRouter.get('/solutions', (req, res) => {
  const { problem_ids } = req.query;
  if (problem_ids) {
    const ids = String(problem_ids).split(',').map(Number).filter(Boolean);
    if (ids.length === 0) return res.json([]);
    const placeholders = ids.map(() => '?').join(',');
    res.json(db.prepare(`
      SELECT DISTINCT sol.* FROM solutions sol
      JOIN problem_solution_map psm ON psm.solution_id = sol.id
      WHERE psm.problem_id IN (${placeholders})
      ORDER BY sol.name
    `).all(...ids));
    return;
  }
  res.json(listSolutionsCatalog());
});

catalogRouter.delete('/solutions/by-hypothesis/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const result = deleteSolutionsExclusiveToHypothesis(name);
  res.json({ ok: true, ...result });
});

catalogRouter.get('/solutions/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = loadSolutionById(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

catalogRouter.patch('/solutions/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as {
    name?: string;
    description?: string | null;
    hypothesis?: string | null;
    parent_id?: number | null;
    lcm_code?: string | null;
    fs_mapped?: boolean;
  };
  try {
    const item = updateSolution(id, body);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'update failed' });
  }
});

catalogRouter.delete('/solutions/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = deleteSolution(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

catalogRouter.get('/solutions/:id/fs-links', (req, res) => {
  const id = Number(req.params.id);
  const solution = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(id);
  if (!solution) return res.status(404).json({ error: 'not found' });
  const fs_links = getSolutionFsLinks(id);
  res.json({ fs_links, fs_item_ids: fs_links.map(l => l.fs_item_id) });
});

catalogRouter.put('/solutions/:id/fs-links', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { fs_links?: { fs_item_id: number; link_type?: string }[]; fs_item_ids?: number[] };
  try {
    const links = body.fs_links?.length
      ? body.fs_links.map(l => ({
        fs_item_id: l.fs_item_id,
        link_type: (l.link_type === 'optional' ? 'optional' : 'required') as 'required' | 'optional',
      }))
      : (body.fs_item_ids ?? []).map(fs_item_id => ({ fs_item_id, link_type: 'required' as const }));
    const fs_links = syncSolutionFsLinks(id, links);
    res.json({ fs_links, fs_item_ids: fs_links.map(l => l.fs_item_id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'update failed';
    if (msg === 'not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

catalogRouter.get('/solutions/:id/widget-links', (req, res) => {
  const id = Number(req.params.id);
  const solution = db.prepare(`SELECT id FROM solutions WHERE id=?`).get(id);
  if (!solution) return res.status(404).json({ error: 'not found' });
  res.json({ widget_ids: getSolutionWidgetIds(id) });
});

catalogRouter.put('/solutions/:id/widget-links', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { widget_ids?: number[] };
  try {
    const widget_ids = syncSolutionWidgetLinks(id, body.widget_ids ?? []);
    res.json({ widget_ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'update failed';
    if (msg === 'not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

catalogRouter.get('/widgets', (_req, res) => {
  res.json(db.prepare(`
    SELECT w.*,
      ds.name AS data_slice_name,
      (SELECT COUNT(*) FROM solution_widget_map swm WHERE swm.widget_id = w.id) AS linked_solution_count,
      (SELECT COUNT(*) FROM widget_fs_map wfm WHERE wfm.widget_id = w.id) AS linked_fs_count
    FROM widgets w
    LEFT JOIN data_slices ds ON ds.id = w.data_slice_id
    ORDER BY ds.name, w.name
  `).all());
});

catalogRouter.get('/widgets-by-solution/:solutionId', (req, res) => {
  res.json(db.prepare(`
    SELECT w.*, ds.name AS data_slice_name
    FROM widgets w
    JOIN solution_widget_map swm ON swm.widget_id = w.id
    LEFT JOIN data_slices ds ON ds.id = w.data_slice_id
    WHERE swm.solution_id=?
    ORDER BY ds.name, w.name
  `).all(req.params.solutionId));
});

catalogRouter.get('/widgets/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = loadWidgetById(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

catalogRouter.get('/widgets/:id/fs-links', (req, res) => {
  const id = Number(req.params.id);
  const widget = db.prepare(`SELECT id FROM widgets WHERE id=?`).get(id);
  if (!widget) return res.status(404).json({ error: 'not found' });
  res.json({ fs_item_ids: getWidgetFsItemIds(id) });
});

catalogRouter.put('/widgets/:id/fs-links', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { fs_item_ids?: number[] };
  try {
    const fs_item_ids = syncWidgetFsLinks(id, body.fs_item_ids ?? []);
    res.json({ fs_item_ids });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'update failed';
    if (msg === 'not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

catalogRouter.post('/widgets/:id/image', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { image_base64?: string; filename?: string };
  try {
    if (!body.image_base64?.trim()) return res.status(400).json({ error: 'image_base64 is required' });
    const item = saveWidgetImage(id, body.image_base64, body.filename);
    res.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upload failed';
    if (msg === 'not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

catalogRouter.delete('/widgets/:id/image', (req, res) => {
  const id = Number(req.params.id);
  try {
    const item = removeWidgetImage(id);
    res.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    if (msg === 'not found') return res.status(404).json({ error: msg });
    res.status(400).json({ error: msg });
  }
});

catalogRouter.get('/fs-catalog', (_req, res) => {
  const items = db.prepare(`
    SELECT * FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item' OR item_type = 'detail')
      AND ${FS_CATALOG_ACTIVE_SQL}
  `).all();
  items.sort(compareFsByGroupThenPrefix as (a: typeof items[0], b: typeof items[0]) => number);
  res.json(items);
});

catalogRouter.get('/fs-catalog/items', (_req, res) => {
  const groups = loadFsCatalogGroups();

  const items = db.prepare(`
    SELECT id, prefix, name, description, func_type, story_points, requires_nmd, group_name, group_prefix, sort_order, published
    FROM fs_catalog
    WHERE (item_type IS NULL OR item_type = 'item') AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order, id
  `).all() as { id: number; prefix: string | null; name: string; description: string | null;
    func_type: string | null; story_points: number; requires_nmd: string | null;
    group_name: string | null; group_prefix: string | null; sort_order: number; published: number }[];

  const details = db.prepare(`
    SELECT parent_id, name, description FROM fs_catalog
    WHERE item_type='detail' AND parent_id IS NOT NULL AND ${FS_CATALOG_ACTIVE_SQL}
    ORDER BY sort_order, id
  `).all() as { parent_id: number; name: string; description: string | null }[];

  const detailsByParent = new Map<number, { name: string; description: string | null }[]>();
  for (const d of details) {
    const list = detailsByParent.get(d.parent_id) ?? [];
    list.push({ name: d.name, description: d.description });
    detailsByParent.set(d.parent_id, list);
  }

  const enrichedItems = items.map(item => ({
      ...item,
      details: detailsByParent.get(item.id) ?? [],
    }));
  enrichedItems.sort(compareFsByGroupThenPrefix as (a: typeof enrichedItems[0], b: typeof enrichedItems[0]) => number);

  res.json({
    groups,
    items: enrichedItems,
  });
});

catalogRouter.post('/fs-catalog/groups', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const group = createFsCatalogGroup(name.trim());
    res.status(201).json(group);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.post('/fs-catalog/groups/:groupKey/copy', (req, res) => {
  const groupKey = /^\d+$/.test(req.params.groupKey) ? Number(req.params.groupKey) : req.params.groupKey;
  try {
    const group = copyFsCatalogGroup(groupKey);
    res.status(201).json(group);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'copy failed';
    res.status(msg === 'group not found' ? 404 : 400).json({ error: msg });
  }
});

catalogRouter.put('/fs-catalog/reorder', (req, res) => {
  const { groups } = req.body as {
    groups?: { groupKey: string | number; sort_order: number; items?: { id: number; sort_order: number }[] }[];
  };
  if (!Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({ error: 'groups array is required' });
  }
  try {
    applyFsCatalogReorder(groups);
    res.json({ ok: true, groups: loadFsCatalogGroups() });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'reorder failed' });
  }
});

catalogRouter.patch('/fs-catalog/:id/group', (req, res) => {
  const id = Number(req.params.id);
  const { target_group_prefix, target_group_id } = req.body as {
    target_group_prefix?: string;
    target_group_id?: number;
  };
  if (!target_group_prefix?.trim() && target_group_id == null) {
    return res.status(400).json({ error: 'target_group_prefix or target_group_id is required' });
  }
  try {
    moveFsCatalogItemToGroup(id, { target_group_prefix, target_group_id });
    const item = loadFsCatalogItemById(id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'move failed';
    res.status(msg.includes('not found') ? 404 : 400).json({ error: msg });
  }
});

catalogRouter.post('/fs-catalog/:id/copy', (req, res) => {
  const id = Number(req.params.id);
  try {
    const { id: newId } = copyFsCatalogItem(id);
    const item = loadFsCatalogItemById(newId);
    if (!item) return res.status(500).json({ error: 'copy failed' });
    res.status(201).json(item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'copy failed';
    res.status(msg === 'not found' ? 404 : 400).json({ error: msg });
  }
});

catalogRouter.delete('/fs-catalog/groups/:groupKey', (req, res) => {
  const groupKey = /^\d+$/.test(req.params.groupKey) ? Number(req.params.groupKey) : req.params.groupKey;
  const ok = softDeleteFsCatalogGroup(groupKey);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, groups: loadFsCatalogGroups() });
});

catalogRouter.delete('/fs-catalog/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = softDeleteFsCatalogItem(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

catalogRouter.post('/fs-catalog/items', (req, res) => {
  const body = req.body as {
    group_prefix: string;
    group_name: string;
    name: string;
    prefix?: string | null;
    func_type?: string | null;
    story_points?: number;
    requires_nmd?: string | null;
    description?: string | null;
    details?: { name: string; description?: string | null }[];
  };

  if (!body.group_prefix?.trim() || !body.group_name?.trim() || !body.name?.trim()) {
    return res.status(400).json({ error: 'group_prefix, group_name and name are required' });
  }

  try {
    const { id } = createFsCatalogItem(body);
    const item = loadFsCatalogItemById(id);
    if (!item) return res.status(500).json({ error: 'create failed' });
    res.status(201).json(item);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.patch('/fs-catalog/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT id FROM fs_catalog WHERE id=? AND ${FS_CATALOG_ACTIVE_SQL}`).get(id);
  if (!row) return res.status(404).json({ error: 'not found' });

  const {
    prefix, name, description, func_type, story_points, requires_nmd,
  } = req.body as {
    prefix?: string | null;
    name?: string;
    description?: string | null;
    func_type?: string | null;
    story_points?: number;
    requires_nmd?: string | null;
  };

  db.prepare(`
    UPDATE fs_catalog SET
      prefix=COALESCE(?, prefix),
      name=COALESCE(?, name),
      description=COALESCE(?, description),
      func_type=COALESCE(?, func_type),
      story_points=COALESCE(?, story_points),
      requires_nmd=COALESCE(?, requires_nmd)
    WHERE id=?
  `).run(
    prefix !== undefined ? prefix : null,
    name ?? null,
    description !== undefined ? description : null,
    func_type !== undefined ? func_type : null,
    story_points ?? null,
    requires_nmd !== undefined ? requires_nmd : null,
    id,
  );
  res.json({ ok: true });
});

catalogRouter.post('/fs-catalog/:id/publish', (req, res) => {
  const id = Number(req.params.id);
  const ok = publishFsCatalogItem(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  const item = loadFsCatalogItemById(id);
  res.json(item);
});

catalogRouter.put('/fs-catalog/:id/published', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as { published?: boolean | number };
  const published = body.published === true || body.published === 1;
  const ok = setFsCatalogItemPublished(id, published);
  if (!ok) return res.status(404).json({ error: 'not found' });
  const item = loadFsCatalogItemById(id);
  res.json(item);
});

catalogRouter.put('/fs-catalog/:id/details', (req, res) => {
  const id = Number(req.params.id);
  const parent = db.prepare(`
    SELECT id, phase, queue FROM fs_catalog
    WHERE id=? AND (item_type IS NULL OR item_type='item')
  `).get(id) as { id: number; phase: string | null; queue: string } | undefined;
  if (!parent) return res.status(404).json({ error: 'not found' });

  const { details } = req.body as {
    details?: { name: string; description?: string | null }[];
  };
  const lines = (details ?? []).filter(d => d.name?.trim());

  const del = db.prepare(`DELETE FROM fs_catalog WHERE parent_id=? AND item_type='detail'`);
  const ins = db.prepare(`
    INSERT INTO fs_catalog(name, description, item_type, parent_id, sort_order, phase, queue, story_points, default_queues_json)
    VALUES (?,?,?,?,?,?,?,0,'{"1":0,"2":0,"3":0,"4":0}')
  `);

  const tx = db.transaction(() => {
    del.run(id);
    let order = 0;
    for (const line of lines) {
      ins.run(
        line.name.trim(),
        line.description?.trim() || null,
        'detail',
        id,
        order++,
        parent.phase ?? '',
        parent.queue ?? '1',
      );
    }
  });
  tx();
  res.json({ ok: true });
});

catalogRouter.get('/fs-catalog/:id/usage', (req, res) => {
  const id = Number(req.params.id);
  const rows = db.prepare(`
    SELECT u.*, b.name as briefing_name, b.project_id, b.created_at as briefing_created_at
    FROM briefing_fs_catalog_usage u
    JOIN briefings b ON b.id = u.briefing_id
    WHERE u.fs_item_id=?
    ORDER BY u.recorded_at DESC
  `).all(id);
  res.json(rows);
});

catalogRouter.get('/fs-phases', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM fs_phases ORDER BY sort_order`).all());
});

// --- Admin CRUD for links ---

catalogRouter.post('/widgets', (req, res) => {
  const { name, description, type, image_path, data_slice_id } = req.body as {
    name: string; description?: string; type?: string; image_path?: string; data_slice_id?: number | null;
  };
  const r = db.prepare(`INSERT INTO widgets(name, description, type, image_path, data_slice_id) VALUES (?,?,?,?,?)`)
    .run(name, description ?? '', type ?? 'dashboard', image_path ?? null, data_slice_id ?? null);
  res.json({ id: r.lastInsertRowid });
});

catalogRouter.patch('/widgets/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, description, type, image_path, data_slice_id } = req.body as {
    name?: string; description?: string; type?: string; image_path?: string | null; data_slice_id?: number | null;
  };
  db.prepare(`
    UPDATE widgets SET
      name=COALESCE(?,name),
      description=COALESCE(?,description),
      type=COALESCE(?,type),
      image_path=COALESCE(?,image_path),
      data_slice_id=CASE WHEN ? THEN ? ELSE data_slice_id END
    WHERE id=?
  `).run(
    name ?? null,
    description ?? null,
    type ?? null,
    image_path ?? null,
    data_slice_id !== undefined ? 1 : 0,
    data_slice_id ?? null,
    id,
  );
  res.json({ ok: true });
});

catalogRouter.delete('/widgets/:id', (req, res) => {
  db.prepare(`DELETE FROM widgets WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

catalogRouter.get('/hypotheses', (_req, res) => {
  res.json(listHypotheses());
});

catalogRouter.post('/hypotheses', (req, res) => {
  const { name, target_audience, maturity_id, activity_type_ids } = req.body as {
    name?: string;
    target_audience?: string;
    maturity_id?: number | null;
    activity_type_ids?: number[];
  };
  try {
    res.status(201).json(createHypothesis(name ?? '', target_audience, maturity_id, activity_type_ids));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.get('/hypotheses/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = loadHypothesisById(id);
  if (!item) return res.status(404).json({ error: 'not found' });
  res.json(item);
});

catalogRouter.put('/hypotheses/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as {
    name?: string;
    target_audience?: string | null;
    maturity_id?: number | null;
    activity_type_ids?: number[];
    problems?: {
      problem_id?: number;
      name?: string;
      solution_ids?: number[];
      new_solutions?: { name: string }[];
    }[];
  };
  try {
    res.json(saveHypothesis(id, {
      name: body.name ?? '',
      target_audience: body.target_audience,
      maturity_id: body.maturity_id,
      activity_type_ids: body.activity_type_ids,
      problems: body.problems,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'save failed';
    res.status(msg === 'not found' ? 404 : 400).json({ error: msg });
  }
});

catalogRouter.delete('/hypotheses/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = deleteHypothesis(id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

catalogRouter.post('/problems', (req, res) => {
  const body = req.body as {
    name?: string;
    parent_id?: number | null;
    lcm_code?: string | null;
    industry_id?: number | null;
    segment_id?: number | null;
    maturity_id?: number | null;
  };
  try {
    if (body.parent_id !== undefined || body.lcm_code !== undefined
      || body.industry_id !== undefined || body.segment_id !== undefined || body.maturity_id !== undefined) {
      res.status(201).json(createProblemCatalog({
        name: body.name ?? '',
        parent_id: body.parent_id,
        lcm_code: body.lcm_code,
        industry_id: body.industry_id,
        segment_id: body.segment_id,
        maturity_id: body.maturity_id,
      }));
      return;
    }
    res.status(201).json(createProblem(body.name ?? ''));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.post('/solutions', (req, res) => {
  const body = req.body as {
    name?: string;
    description?: string | null;
    hypothesis?: string | null;
    parent_id?: number | null;
    lcm_code?: string | null;
    fs_mapped?: boolean;
  };
  try {
    if (body.hypothesis !== undefined || body.parent_id !== undefined || body.description !== undefined || body.lcm_code !== undefined || body.fs_mapped !== undefined) {
      res.status(201).json(createSolutionCatalog({
        name: body.name ?? '',
        description: body.description,
        hypothesis: body.hypothesis,
        parent_id: body.parent_id,
        lcm_code: body.lcm_code,
        fs_mapped: body.fs_mapped,
      }));
      return;
    }
    res.status(201).json(createSolution(body.name ?? ''));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.get('/activity-types', (_req, res) => {
  res.json(listActivityTypes());
});

catalogRouter.post('/activity-types', (req, res) => {
  const { name } = req.body as { name?: string };
  try {
    res.status(201).json(createActivityType(name ?? ''));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.get('/data-slices', (_req, res) => {
  res.json(listDataSlices());
});

catalogRouter.post('/data-slices', (req, res) => {
  const { name } = req.body as { name?: string };
  try {
    res.status(201).json(createDataSlice(name ?? ''));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'create failed' });
  }
});

catalogRouter.get('/links/problem-solution', (_req, res) => {
  res.json(db.prepare(`
    SELECT psm.*, p.name as problem_name, s.name as solution_name
    FROM problem_solution_map psm
    JOIN problems p ON p.id = psm.problem_id
    JOIN solutions s ON s.id = psm.solution_id
    ORDER BY p.name, s.name
  `).all());
});

catalogRouter.post('/links/problem-solution', (req, res) => {
  const { problem_id, solution_id } = req.body as { problem_id: number; solution_id: number };
  db.prepare(`INSERT OR IGNORE INTO problem_solution_map(problem_id, solution_id) VALUES (?,?)`).run(problem_id, solution_id);
  res.json({ ok: true });
});

catalogRouter.delete('/links/problem-solution', (req, res) => {
  const { problem_id, solution_id } = req.body as { problem_id: number; solution_id: number };
  db.prepare(`DELETE FROM problem_solution_map WHERE problem_id=? AND solution_id=?`).run(problem_id, solution_id);
  res.json({ ok: true });
});

catalogRouter.get('/links/solution-widget', (_req, res) => {
  res.json(db.prepare(`
    SELECT swm.*, s.name as solution_name, w.name as widget_name
    FROM solution_widget_map swm
    JOIN solutions s ON s.id = swm.solution_id
    JOIN widgets w ON w.id = swm.widget_id
    ORDER BY s.name, w.name
  `).all());
});

catalogRouter.post('/links/solution-widget', (req, res) => {
  const { solution_id, widget_id } = req.body as { solution_id: number; widget_id: number };
  db.prepare(`INSERT OR IGNORE INTO solution_widget_map(solution_id, widget_id) VALUES (?,?)`).run(solution_id, widget_id);
  res.json({ ok: true });
});

catalogRouter.delete('/links/solution-widget', (req, res) => {
  const { solution_id, widget_id } = req.body as { solution_id: number; widget_id: number };
  db.prepare(`DELETE FROM solution_widget_map WHERE solution_id=? AND widget_id=?`).run(solution_id, widget_id);
  res.json({ ok: true });
});

catalogRouter.get('/links/solution-fs', (_req, res) => {
  res.json(db.prepare(`
    SELECT sfm.*, s.name as solution_name, fc.name as fs_name
    FROM solution_fs_map sfm
    JOIN solutions s ON s.id = sfm.solution_id
    JOIN fs_catalog fc ON fc.id = sfm.fs_item_id
    ORDER BY s.name, fc.name
  `).all());
});

catalogRouter.post('/links/solution-fs', (req, res) => {
  const { solution_id, fs_item_id, link_type } = req.body as {
    solution_id: number; fs_item_id: number; link_type?: string;
  };
  if (!isPublishedFsCatalogItem(fs_item_id)) {
    return res.status(400).json({ error: 'fs item is draft or not found' });
  }
  db.prepare(`
    INSERT OR IGNORE INTO solution_fs_map(solution_id, fs_item_id, link_type) VALUES (?,?,?)
  `).run(solution_id, fs_item_id, link_type === 'optional' ? 'optional' : 'required');
  res.json({ ok: true });
});

catalogRouter.delete('/links/solution-fs', (req, res) => {
  const { solution_id, fs_item_id } = req.body as { solution_id: number; fs_item_id: number };
  db.prepare(`DELETE FROM solution_fs_map WHERE solution_id=? AND fs_item_id=?`).run(solution_id, fs_item_id);
  res.json({ ok: true });
});

catalogRouter.get('/links/widget-fs', (_req, res) => {
  res.json(db.prepare(`
    SELECT wfm.*, w.name as widget_name, fc.name as fs_name
    FROM widget_fs_map wfm
    JOIN widgets w ON w.id = wfm.widget_id
    JOIN fs_catalog fc ON fc.id = wfm.fs_item_id
    ORDER BY w.name, fc.name
  `).all());
});

catalogRouter.post('/links/widget-fs', (req, res) => {
  const { widget_id, fs_item_id } = req.body as { widget_id: number; fs_item_id: number };
  if (!isPublishedFsCatalogItem(fs_item_id)) {
    return res.status(400).json({ error: 'fs item is draft or not found' });
  }
  db.prepare(`INSERT OR IGNORE INTO widget_fs_map(widget_id, fs_item_id) VALUES (?,?)`).run(widget_id, fs_item_id);
  res.json({ ok: true });
});

catalogRouter.delete('/links/widget-fs', (req, res) => {
  const { widget_id, fs_item_id } = req.body as { widget_id: number; fs_item_id: number };
  db.prepare(`DELETE FROM widget_fs_map WHERE widget_id=? AND fs_item_id=?`).run(widget_id, fs_item_id);
  res.json({ ok: true });
});

// --- Project types NSI ---

catalogRouter.get('/project-types', (_req, res) => {
  const types = db.prepare(`
    SELECT pt.*, bt.name as base_type_name
    FROM project_types pt
    LEFT JOIN project_types bt ON bt.id = pt.base_type_id
    ORDER BY pt.sort_order, pt.name
  `).all();
  res.json(types);
});

catalogRouter.post('/project-types', (req, res) => {
  const { code, name, sort_order, is_active, base_type_id } = req.body as {
    code: string; name: string; sort_order?: number; is_active?: number; base_type_id?: number | null;
  };
  const r = db.prepare(`
    INSERT INTO project_types(code, name, sort_order, is_active, base_type_id) VALUES (?,?,?,?,?)
  `).run(code, name, sort_order ?? 0, is_active ?? 1, base_type_id ?? null);
  res.json({ id: r.lastInsertRowid });
});

catalogRouter.patch('/project-types/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM project_types WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'not found' });
  const { code, name, sort_order, is_active, base_type_id } = req.body as {
    code?: string; name?: string; sort_order?: number; is_active?: number; base_type_id?: number | null;
  };
  db.prepare(`
    UPDATE project_types SET code=?, name=?, sort_order=?, is_active=?, base_type_id=? WHERE id=?
  `).run(
    code ?? existing.code, name ?? existing.name,
    sort_order ?? existing.sort_order, is_active ?? existing.is_active,
    base_type_id !== undefined ? base_type_id : existing.base_type_id,
    id,
  );
  res.json({ ok: true });
});

catalogRouter.delete('/project-types/:id', (req, res) => {
  db.prepare(`DELETE FROM project_types WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

catalogRouter.get('/project-types/:id/rates', (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM project_type_rates WHERE project_type_id=? ORDER BY valid_from DESC
  `).all(req.params.id));
});

catalogRouter.post('/project-types/:id/rates', (req, res) => {
  const { hourly_rate, valid_from } = req.body as { hourly_rate: number; valid_from?: string };
  const r = db.prepare(`
    INSERT INTO project_type_rates(project_type_id, hourly_rate, valid_from) VALUES (?,?,?)
  `).run(req.params.id, hourly_rate, valid_from ?? '2020-01-01');
  res.json({ id: r.lastInsertRowid });
});

catalogRouter.get('/project-types/:id/coefficients', (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM headcount_coefficients WHERE project_type_id=? ORDER BY category
  `).all(req.params.id));
});

catalogRouter.put('/project-types/:id/coefficients', (req, res) => {
  const id = Number(req.params.id);
  const { coefficients } = req.body as {
    coefficients: { category: string; c63: number; c64: number; c67: number; c68: number }[];
  };
  const del = db.prepare(`DELETE FROM headcount_coefficients WHERE project_type_id=?`);
  const ins = db.prepare(`
    INSERT INTO headcount_coefficients(project_type_id, category, c63, c64, c67, c68) VALUES (?,?,?,?,?,?)
  `);
  const tx = db.transaction(() => {
    del.run(id);
    for (const c of coefficients ?? []) {
      ins.run(id, c.category, c.c63, c.c64, c.c67, c.c68);
    }
  });
  tx();
  res.json({ ok: true });
});
