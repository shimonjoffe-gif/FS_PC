import { Router } from 'express';
import { db } from '../db';
import { calcRow } from '../calc';

export const rowsRouter = Router();

rowsRouter.get('/:projectId', (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM project_rows WHERE project_id=? ORDER BY sort_order
  `).all(req.params.projectId));
});

rowsRouter.post('/:projectId', (req, res) => {
  const projectId = Number(req.params.projectId);
  const { user_id, ...data } = req.body as any;

  const maxOrder = (db.prepare(`SELECT MAX(sort_order) as m FROM project_rows WHERE project_id=?`)
    .get(projectId) as { m: number | null }).m ?? 0;

  const row = {
    длит_трудоемк: 0, риск_этапа: 0, компенсация_продаж: 0,
    загрузка_рп: 0, загрузка_аналит_конс: 0, загрузка_аналит_эксп: 0,
    загрузка_архит: 0, загрузка_програм1: 0, загрузка_програм2: 0, загрузка_куратор: 0,
    ...data,
  };
  const calc = calcRow(row);

  const result = db.prepare(`
    INSERT INTO project_rows
    (project_id, sort_order, этап, работа, исполнитель, рамки, результаты, отчет_doc,
     длит_трудоемк, согл_заказчика, риск_этапа, компенсация_продаж,
     загрузка_рп, загрузка_аналит_конс, загрузка_аналит_эксп, загрузка_архит,
     загрузка_програм1, загрузка_програм2, загрузка_куратор,
     трудозатраты_итог, фонд_компании, резерв_компании, бюджет_усн, бюджет_кп, бюджет_с_рисками)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    projectId, (maxOrder as number) + 1,
    row.этап ?? '', row.работа ?? '', row.исполнитель ?? 'ITLand/Заказчик',
    row.рамки ?? '', row.результаты ?? '', row.отчет_doc ?? '',
    row.длит_трудоемк, row.согл_заказчика ?? 0, row.риск_этапа, row.компенсация_продаж,
    row.загрузка_рп, row.загрузка_аналит_конс, row.загрузка_аналит_эксп, row.загрузка_архит,
    row.загрузка_програм1, row.загрузка_програм2, row.загрузка_куратор,
    calc.трудозатраты_итог, calc.фонд_компании, calc.резерв_компании,
    calc.бюджет_усн, calc.бюджет_кп, calc.бюджет_с_рисками,
  );

  const newRow = db.prepare(`SELECT * FROM project_rows WHERE id=?`).get(result.lastInsertRowid);

  if (user_id) {
    db.prepare(`
      INSERT INTO project_history(project_id, row_id, user_id, action, new_value)
      VALUES (?,?,?,'add_row',?)
    `).run(projectId, result.lastInsertRowid, user_id, row.работа ?? '');
  }

  db.prepare(`UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(projectId);
  res.json(newRow);
});

rowsRouter.patch('/:id', (req, res) => {
  const rowId = Number(req.params.id);
  const { user_id, ...data } = req.body as any;

  const existing = db.prepare(`SELECT * FROM project_rows WHERE id=?`).get(rowId) as any;
  if (!existing) return res.status(404).json({ error: 'not found' });

  const merged = { ...existing, ...data };
  const calc = calcRow(merged);

  db.prepare(`
    UPDATE project_rows SET
      этап=?, работа=?, исполнитель=?, рамки=?, результаты=?, отчет_doc=?,
      длит_трудоемк=?, согл_заказчика=?, риск_этапа=?, компенсация_продаж=?,
      загрузка_рп=?, загрузка_аналит_конс=?, загрузка_аналит_эксп=?, загрузка_архит=?,
      загрузка_програм1=?, загрузка_програм2=?, загрузка_куратор=?,
      трудозатраты_итог=?, фонд_компании=?, резерв_компании=?,
      бюджет_усн=?, бюджет_кп=?, бюджет_с_рисками=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    merged.этап, merged.работа, merged.исполнитель, merged.рамки, merged.результаты, merged.отчет_doc,
    merged.длит_трудоемк, merged.согл_заказчика, merged.риск_этапа, merged.компенсация_продаж,
    merged.загрузка_рп, merged.загрузка_аналит_конс, merged.загрузка_аналит_эксп, merged.загрузка_архит,
    merged.загрузка_програм1, merged.загрузка_програм2, merged.загрузка_куратор,
    calc.трудозатраты_итог, calc.фонд_компании, calc.резерв_компании,
    calc.бюджет_усн, calc.бюджет_кп, calc.бюджет_с_рисками,
    rowId,
  );

  // Логируем изменённые поля
  if (user_id) {
    const trackFields = ['длит_трудоемк','риск_этапа','рамки','результаты','отчет_doc',
      'загрузка_рп','загрузка_аналит_конс','загрузка_аналит_эксп','загрузка_архит',
      'загрузка_програм1','загрузка_програм2','загрузка_куратор','работа','этап'];
    const insHist = db.prepare(`
      INSERT INTO project_history(project_id,row_id,user_id,action,field_name,old_value,new_value)
      VALUES (?,?,?,'update_row',?,?,?)
    `);
    trackFields.forEach(f => {
      if (f in data && String(existing[f]) !== String(data[f])) {
        insHist.run(existing.project_id, rowId, user_id, f, String(existing[f]), String(data[f]));
      }
    });
  }

  db.prepare(`UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(existing.project_id);
  res.json(db.prepare(`SELECT * FROM project_rows WHERE id=?`).get(rowId));
});

rowsRouter.delete('/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM project_rows WHERE id=?`).get(Number(req.params.id)) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  const { user_id } = req.body as { user_id?: number };

  db.prepare(`DELETE FROM project_rows WHERE id=?`).run(row.id);

  if (user_id) {
    db.prepare(`
      INSERT INTO project_history(project_id,row_id,user_id,action,old_value)
      VALUES (?,?,?,'delete_row',?)
    `).run(row.project_id, row.id, user_id, row.работа);
  }

  db.prepare(`UPDATE projects SET updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(row.project_id);
  res.json({ ok: true });
});

// Пересортировка (drag & drop)
rowsRouter.post('/:projectId/reorder', (req, res) => {
  const ids = req.body.ids as number[];
  const update = db.prepare(`UPDATE project_rows SET sort_order=? WHERE id=?`);
  const tx = db.transaction(() => ids.forEach((id, i) => update.run(i + 1, id)));
  tx();
  res.json({ ok: true });
});

// История изменений проекта
rowsRouter.get('/:projectId/history', (req, res) => {
  res.json(db.prepare(`
    SELECT h.*, u.name as user_name
    FROM project_history h
    LEFT JOIN users u ON h.user_id = u.id
    WHERE h.project_id=?
    ORDER BY h.changed_at DESC
    LIMIT 200
  `).all(req.params.projectId));
});
