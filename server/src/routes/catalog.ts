import { Router } from 'express';
import { db } from '../db';
import { compareFsByGroupThenPrefix } from '../fsPrefixSort';

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
  const { industry_id, segment_id, maturity_id } = req.query;
  let sql = `SELECT p.*, i.name as industry_name, s.name as segment_name, m.name as maturity_name
    FROM problems p
    LEFT JOIN industries i ON i.id = p.industry_id
    LEFT JOIN segments s ON s.id = p.segment_id
    LEFT JOIN maturity_levels m ON m.id = p.maturity_id
    WHERE 1=1`;
  const params: unknown[] = [];
  if (industry_id) { sql += ` AND (p.industry_id=? OR p.industry_id IS NULL)`; params.push(industry_id); }
  if (segment_id) { sql += ` AND (p.segment_id=? OR p.segment_id IS NULL)`; params.push(segment_id); }
  if (maturity_id) { sql += ` AND (p.maturity_id=? OR p.maturity_id IS NULL)`; params.push(maturity_id); }
  sql += ` ORDER BY p.name`;
  res.json(db.prepare(sql).all(...params));
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
  res.json(db.prepare(`SELECT * FROM solutions ORDER BY name`).all());
});

catalogRouter.get('/widgets', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM widgets ORDER BY name`).all());
});

catalogRouter.get('/widgets-by-solution/:solutionId', (req, res) => {
  res.json(db.prepare(`
    SELECT w.* FROM widgets w
    JOIN solution_widget_map swm ON swm.widget_id = w.id
    WHERE swm.solution_id=?
    ORDER BY w.name
  `).all(req.params.solutionId));
});

catalogRouter.get('/fs-catalog', (_req, res) => {
  const items = db.prepare(`SELECT * FROM fs_catalog`).all();
  items.sort(compareFsByGroupThenPrefix);
  res.json(items);
});

catalogRouter.get('/fs-phases', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM fs_phases ORDER BY sort_order`).all());
});

// --- Admin CRUD for links ---

catalogRouter.post('/widgets', (req, res) => {
  const { name, description, type, image_path } = req.body as {
    name: string; description?: string; type?: string; image_path?: string;
  };
  const r = db.prepare(`INSERT INTO widgets(name, description, type, image_path) VALUES (?,?,?,?)`)
    .run(name, description ?? '', type ?? 'dashboard', image_path ?? null);
  res.json({ id: r.lastInsertRowid });
});

catalogRouter.patch('/widgets/:id', (req, res) => {
  const { name, description, type, image_path } = req.body as {
    name?: string; description?: string; type?: string; image_path?: string | null;
  };
  db.prepare(`UPDATE widgets SET name=COALESCE(?,name), description=COALESCE(?,description), type=COALESCE(?,type), image_path=COALESCE(?,image_path) WHERE id=?`)
    .run(name ?? null, description ?? null, type ?? null, image_path ?? null, req.params.id);
  res.json({ ok: true });
});

catalogRouter.delete('/widgets/:id', (req, res) => {
  db.prepare(`DELETE FROM widgets WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
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
  const { solution_id, fs_item_id } = req.body as { solution_id: number; fs_item_id: number };
  db.prepare(`INSERT OR IGNORE INTO solution_fs_map(solution_id, fs_item_id) VALUES (?,?)`).run(solution_id, fs_item_id);
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
