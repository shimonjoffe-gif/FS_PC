import { Router } from 'express';
import { db } from '../db';

export const projectsRouter = Router();

projectsRouter.get('/', (_req, res) => {
  res.json(db.prepare(`
    SELECT p.*, u.name as created_by_name
    FROM projects p
    LEFT JOIN users u ON p.created_by = u.id
    ORDER BY p.is_template DESC, p.updated_at DESC
  `).all());
});

projectsRouter.post('/', (req, res) => {
  const { name, type, is_template, created_by } = req.body as {
    name: string; type?: string; is_template?: number; created_by?: number;
  };
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const result = db.prepare(`
    INSERT INTO projects(name, type, is_template, created_by)
    VALUES (?,?,?,?)
  `).run(name.trim(), type ?? 'Стандартный проект', is_template ?? 0, created_by ?? null);
  res.json({ id: result.lastInsertRowid });
});

// Копировать из шаблона или другого проекта
projectsRouter.post('/:id/copy', (req, res) => {
  const sourceId = Number(req.params.id);
  const { name, created_by } = req.body as { name: string; created_by?: number };

  const source = db.prepare(`SELECT * FROM projects WHERE id=?`).get(sourceId) as { type: string } | undefined;
  if (!source) return res.status(404).json({ error: 'not found' });

  const newProj = db.prepare(`
    INSERT INTO projects(name, type, is_template, created_by)
    VALUES (?,?,0,?)
  `).run(name, source.type, created_by ?? null);
  const newId = newProj.lastInsertRowid;

  const rows = db.prepare(`SELECT * FROM project_rows WHERE project_id=? ORDER BY sort_order`).all(sourceId) as any[];
  const insertRow = db.prepare(`
    INSERT INTO project_rows
    (project_id, sort_order, этап, работа, исполнитель, рамки, результаты, отчет_doc,
     длит_трудоемк, согл_заказчика, риск_этапа, компенсация_продаж,
     загрузка_рп, загрузка_аналит_конс, загрузка_аналит_эксп, загрузка_архит,
     загрузка_програм1, загрузка_програм2, загрузка_куратор,
     трудозатраты_итог, фонд_компании, резерв_компании, бюджет_усн, бюджет_кп, бюджет_с_рисками)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const tx = db.transaction(() => {
    rows.forEach(r => insertRow.run(
      newId, r.sort_order, r.этап, r.работа, r.исполнитель, r.рамки, r.результаты, r.отчет_doc,
      r.длит_трудоемк, r.согл_заказчика, r.риск_этапа, r.компенсация_продаж,
      r.загрузка_рп, r.загрузка_аналит_конс, r.загрузка_аналит_эксп, r.загрузка_архит,
      r.загрузка_програм1, r.загрузка_програм2, r.загрузка_куратор,
      r.трудозатраты_итог, r.фонд_компании, r.резерв_компании, r.бюджет_усн, r.бюджет_кп, r.бюджет_с_рисками,
    ));
  });
  tx();

  res.json({ id: newId });
});

projectsRouter.patch('/:id', (req, res) => {
  const { name, type, is_template } = req.body as { name?: string; type?: string; is_template?: number };
  db.prepare(`
    UPDATE projects SET name=COALESCE(?,name), type=COALESCE(?,type),
    is_template=COALESCE(?,is_template), updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(name ?? null, type ?? null, is_template ?? null, req.params.id);
  res.json({ ok: true });
});

projectsRouter.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM projects WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
