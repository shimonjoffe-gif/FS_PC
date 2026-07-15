import fs from 'fs';
import path from 'path';
import { db } from './db';

import { UPLOADS_DIR } from './paths';
const WIDGETS_DIR = path.join(UPLOADS_DIR, 'widgets');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

function normalizeExt(ext: string): string {
  const lower = ext.toLowerCase().replace(/^\./, '');
  if (lower === 'jpeg') return 'jpg';
  if (ALLOWED_EXT.has(lower)) return lower;
  throw new Error('unsupported image type');
}

function deleteImageFileIfExists(imagePath: string | null | undefined) {
  if (!imagePath) return;
  const abs = path.join(UPLOADS_DIR, imagePath);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

function parseImageUpload(imageBase64: string, filename?: string): { buffer: Buffer; ext: string } {
  let data = imageBase64.trim();
  let ext = 'png';
  const dataUrlMatch = data.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (dataUrlMatch) {
    ext = normalizeExt(dataUrlMatch[1]);
    data = dataUrlMatch[2];
  } else if (filename) {
    ext = normalizeExt(path.extname(filename) || 'png');
  }
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length) throw new Error('empty image');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('image too large');
  return { buffer, ext };
}

export function saveWidgetImage(widgetId: number, imageBase64: string, filename?: string): WidgetDetail {
  const existing = loadWidgetById(widgetId);
  if (!existing) throw new Error('not found');
  const { buffer, ext } = parseImageUpload(imageBase64, filename);
  fs.mkdirSync(WIDGETS_DIR, { recursive: true });
  const rel = `widgets/widget-${widgetId}.${ext}`;
  const abs = path.join(UPLOADS_DIR, rel);
  if (existing.image_path && existing.image_path !== rel) {
    deleteImageFileIfExists(existing.image_path);
  }
  fs.writeFileSync(abs, buffer);
  db.prepare(`UPDATE widgets SET image_path=? WHERE id=?`).run(rel, widgetId);
  return loadWidgetById(widgetId)!;
}

export function removeWidgetImage(widgetId: number): WidgetDetail {
  const existing = loadWidgetById(widgetId);
  if (!existing) throw new Error('not found');
  deleteImageFileIfExists(existing.image_path);
  db.prepare(`UPDATE widgets SET image_path=NULL WHERE id=?`).run(widgetId);
  return loadWidgetById(widgetId)!;
}

export interface WidgetRow {
  id: number;
  name: string;
  description: string;
  type: string;
  image_path: string | null;
  data_slice_id: number | null;
  data_slice_name: string | null;
}

export interface WidgetSolutionRef {
  id: number;
  name: string;
  catalog_code: string | null;
  lcm_code: string | null;
}

export interface WidgetProblemUsage {
  id: number;
  name: string;
  lcm_code: string | null;
  sort_order: number;
  solutions: WidgetSolutionRef[];
}

export interface WidgetHypothesisUsage {
  hypothesis_id: number;
  hypothesis_name: string;
  problems: WidgetProblemUsage[];
}

export interface WidgetDetail extends WidgetRow {
  hypothesis_usages: WidgetHypothesisUsage[];
  orphan_solutions: WidgetSolutionRef[];
  linked_solution_count: number;
  linked_fs_count: number;
}

export function loadWidgetById(id: number): WidgetDetail | null {
  const raw = db.prepare(`
    SELECT w.id, w.name, w.description, w.type, w.image_path, w.data_slice_id,
           ds.name as data_slice_name
    FROM widgets w
    LEFT JOIN data_slices ds ON ds.id = w.data_slice_id
    WHERE w.id=?
  `).get(id) as WidgetRow | undefined;
  if (!raw) return null;

  const usageRows = db.prepare(`
    SELECT DISTINCT
      h.id as hypothesis_id,
      h.name as hypothesis_name,
      p.id as problem_id,
      p.name as problem_name,
      p.lcm_code,
      COALESCE(hp.sort_order, p.sort_order, 0) as problem_sort,
      s.id as solution_id,
      s.name as solution_name,
      s.catalog_code,
      s.lcm_code as solution_lcm_code
    FROM solution_widget_map swm
    JOIN solutions s ON s.id = swm.solution_id
    JOIN problem_solution_map psm ON psm.solution_id = s.id
    JOIN problems p ON p.id = psm.problem_id
    JOIN hypothesis_problems hp ON hp.problem_id = p.id
    JOIN hypotheses h ON h.id = hp.hypothesis_id
    WHERE swm.widget_id=?
    ORDER BY h.name, problem_sort, p.id, s.name
  `).all(id) as {
    hypothesis_id: number;
    hypothesis_name: string;
    problem_id: number;
    problem_name: string;
    lcm_code: string | null;
    problem_sort: number;
    solution_id: number;
    solution_name: string;
    catalog_code: string | null;
    solution_lcm_code: string | null;
  }[];

  const byHypothesis = new Map<number, WidgetHypothesisUsage>();
  const contextualSolutionIds = new Set<number>();

  for (const row of usageRows) {
    contextualSolutionIds.add(row.solution_id);
    let hyp = byHypothesis.get(row.hypothesis_id);
    if (!hyp) {
      hyp = {
        hypothesis_id: row.hypothesis_id,
        hypothesis_name: row.hypothesis_name,
        problems: [],
      };
      byHypothesis.set(row.hypothesis_id, hyp);
    }
    let problem = hyp.problems.find(p => p.id === row.problem_id);
    if (!problem) {
      problem = {
        id: row.problem_id,
        name: row.problem_name,
        lcm_code: row.lcm_code,
        sort_order: row.problem_sort,
        solutions: [],
      };
      hyp.problems.push(problem);
    }
    if (!problem.solutions.some(s => s.id === row.solution_id)) {
      problem.solutions.push({
        id: row.solution_id,
        name: row.solution_name,
        catalog_code: row.catalog_code,
        lcm_code: row.solution_lcm_code,
      });
    }
  }

  const linkedSolutions = db.prepare(`
    SELECT s.id, s.name, s.catalog_code, s.lcm_code
    FROM solution_widget_map swm
    JOIN solutions s ON s.id = swm.solution_id
    WHERE swm.widget_id=?
    ORDER BY s.name
  `).all(id) as WidgetSolutionRef[];

  const orphan_solutions = linkedSolutions.filter(s => !contextualSolutionIds.has(s.id));

  const linked_solution_count = linkedSolutions.length;
  const linked_fs_count = (db.prepare(`
    SELECT COUNT(*) as cnt FROM widget_fs_map WHERE widget_id=?
  `).get(id) as { cnt: number }).cnt;

  return {
    ...raw,
    hypothesis_usages: [...byHypothesis.values()],
    orphan_solutions,
    linked_solution_count,
    linked_fs_count,
  };
}

export function getWidgetFsItemIds(widgetId: number): number[] {
  return (db.prepare(`
    SELECT fs_item_id FROM widget_fs_map WHERE widget_id=? ORDER BY fs_item_id
  `).all(widgetId) as { fs_item_id: number }[]).map(r => r.fs_item_id);
}

export function syncWidgetFsLinks(widgetId: number, fsItemIds: number[]): number[] {
  const existing = db.prepare(`SELECT id FROM widgets WHERE id=?`).get(widgetId);
  if (!existing) throw new Error('not found');
  const unique = [...new Set(fsItemIds.filter(id => id > 0))].filter(id => {
    const row = db.prepare(`
      SELECT id FROM fs_catalog
      WHERE id=? AND published=1 AND COALESCE(is_deleted, 0)=0
        AND (item_type IS NULL OR item_type='item')
    `).get(id);
    return Boolean(row);
  });
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM widget_fs_map WHERE widget_id=?`).run(widgetId);
    const ins = db.prepare(`INSERT OR IGNORE INTO widget_fs_map(widget_id, fs_item_id) VALUES (?,?)`);
    for (const fsId of unique) ins.run(widgetId, fsId);
  });
  tx();
  return unique;
}
