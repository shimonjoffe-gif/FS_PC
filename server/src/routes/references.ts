import { Router } from 'express';
import { db } from '../db';

export const referencesRouter = Router();

// Получить справочник для работы по типу, с фильтром по автору
referencesRouter.get('/', (req, res) => {
  const { type, work_name, author_id } = req.query as Record<string, string>;
  let sql = `
    SELECT r.*, COALESCE(u.name, 'Базовый') as author_name
    FROM work_references r
    LEFT JOIN users u ON r.author_id = u.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (type)      { sql += ` AND r.ref_type=?`;   params.push(type); }
  if (work_name) { sql += ` AND r.work_name=?`;  params.push(work_name); }
  if (author_id === 'null') { sql += ` AND r.author_id IS NULL`; }
  else if (author_id) { sql += ` AND r.author_id=?`; params.push(Number(author_id)); }
  sql += ` ORDER BY r.usage_count DESC, r.created_at DESC`;

  res.json(db.prepare(sql).all(...params));
});

// Список авторов для фильтра (по конкретному типу+работе или вообще)
referencesRouter.get('/authors', (req, res) => {
  const { type, work_name } = req.query as Record<string, string>;
  let sql = `
    SELECT DISTINCT COALESCE(u.name,'Базовый') as author_name,
           COALESCE(r.author_id, -1) as author_id
    FROM work_references r
    LEFT JOIN users u ON r.author_id = u.id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (type)      { sql += ` AND r.ref_type=?`;  params.push(type); }
  if (work_name) { sql += ` AND r.work_name=?`; params.push(work_name); }
  sql += ` ORDER BY author_name`;
  res.json(db.prepare(sql).all(...params));
});

// Добавить новый вариант в справочник
referencesRouter.post('/', (req, res) => {
  const { ref_type, work_name, content, author_id } = req.body as {
    ref_type: string; work_name: string; content: string; author_id?: number;
  };
  if (!ref_type || !work_name || !content?.trim()) {
    return res.status(400).json({ error: 'ref_type, work_name, content required' });
  }
  const result = db.prepare(`
    INSERT INTO work_references(ref_type, work_name, content, author_id)
    VALUES (?,?,?,?)
  `).run(ref_type, work_name, content.trim(), author_id ?? null);
  res.json({ id: result.lastInsertRowid });
});

// Зафиксировать использование (инкремент счётчика)
referencesRouter.post('/:id/use', (req, res) => {
  db.prepare(`UPDATE work_references SET usage_count=usage_count+1 WHERE id=?`)
    .run(req.params.id);
  res.json({ ok: true });
});

referencesRouter.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM work_references WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
