import { Router } from 'express';
import { db } from '../db';
import { randomUUID } from 'crypto';

export const constantsRouter = Router();

// ── Константы ──────────────────────────────────────────────────
constantsRouter.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT key, value FROM constants`).all() as { key: string; value: number }[];
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

constantsRouter.put('/', (req, res) => {
  const data = req.body as Record<string, number>;
  const update = db.prepare(`INSERT OR REPLACE INTO constants(key, value) VALUES (?,?)`);
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(data)) update.run(k, v);
  });
  tx();
  res.json({ ok: true });
});

// ── Этапы ──────────────────────────────────────────────────────
constantsRouter.get('/etaps', (_req, res) => {
  res.json(db.prepare(`SELECT id, name, sort_order FROM etap_list ORDER BY sort_order`).all());
});

constantsRouter.post('/etaps', (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  const maxOrder = (db.prepare(`SELECT MAX(sort_order) as m FROM etap_list`).get() as { m: number | null }).m ?? 0;
  try {
    const r = db.prepare(`INSERT INTO etap_list(name, sort_order) VALUES (?,?)`).run(name.trim(), maxOrder + 1);
    res.json({ id: r.lastInsertRowid, name: name.trim(), sort_order: maxOrder + 1 });
  } catch {
    res.status(409).json({ error: 'already exists' });
  }
});

constantsRouter.patch('/etaps/:id', (req, res) => {
  const { name, sort_order } = req.body as { name?: string; sort_order?: number };
  db.prepare(`UPDATE etap_list SET name=COALESCE(?,name), sort_order=COALESCE(?,sort_order) WHERE id=?`)
    .run(name ?? null, sort_order ?? null, req.params.id);
  res.json({ ok: true });
});

constantsRouter.delete('/etaps/:id', (req, res) => {
  const etap = db.prepare(`SELECT name FROM etap_list WHERE id=?`).get(req.params.id) as { name: string } | undefined;
  if (!etap) return res.status(404).json({ error: 'not found' });
  const usedInWorks = (db.prepare(`SELECT COUNT(*) as c FROM base_works WHERE этап=?`).get(etap.name) as { c: number }).c;
  if (usedInWorks > 0) return res.status(409).json({ error: `Этап используется в ${usedInWorks} работах каталога` });
  db.prepare(`DELETE FROM etap_list WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// Пересортировка этапов (drag & drop)
constantsRouter.post('/etaps/reorder', (req, res) => {
  const ids = req.body.ids as number[];
  const update = db.prepare(`UPDATE etap_list SET sort_order=? WHERE id=?`);
  const tx = db.transaction(() => ids.forEach((id, i) => update.run(i + 1, id)));
  tx();
  res.json({ ok: true });
});

// ── Каталог работ ──────────────────────────────────────────────
constantsRouter.get('/base-works', (_req, res) => {
  res.json(db.prepare(`
    SELECT bw.*, e.sort_order as этап_order
    FROM base_works bw
    LEFT JOIN etap_list e ON e.name = bw.этап
    ORDER BY e.sort_order, bw.работа
  `).all());
});

constantsRouter.post('/base-works', (req, res) => {
  const d = req.body as any;
  if (!d.работа?.trim() || !d.этап?.trim()) return res.status(400).json({ error: 'работа и этап обязательны' });
  const id = randomUUID().slice(0, 8);
  db.prepare(`
    INSERT INTO base_works
    (id, этап, работа, рамки, отчет_doc, результат, длит_трудоемк, риск_этапа,
     загрузка_рп, загрузка_аналит_конс, загрузка_аналит_эксп, загрузка_архит,
     загрузка_програм1, загрузка_програм2, загрузка_куратор)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, d.этап.trim(), d.работа.trim(),
    d.рамки ?? '', d.отчет_doc ?? '', d.результат ?? '',
    d.длит_трудоемк ?? 0, d.риск_этапа ?? 0,
    d.загрузка_рп ?? 0, d.загрузка_аналит_конс ?? 0,
    d.загрузка_аналит_эксп ?? 0, d.загрузка_архит ?? 0,
    d.загрузка_програм1 ?? 0, d.загрузка_програм2 ?? 0, d.загрузка_куратор ?? 0,
  );
  res.json(db.prepare(`SELECT * FROM base_works WHERE id=?`).get(id));
});

constantsRouter.patch('/base-works/:id', (req, res) => {
  const d = req.body as any;
  const existing = db.prepare(`SELECT * FROM base_works WHERE id=?`).get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: 'not found' });
  const merged = { ...existing, ...d };
  db.prepare(`
    UPDATE base_works SET
      этап=?, работа=?, рамки=?, отчет_doc=?, результат=?,
      длит_трудоемк=?, риск_этапа=?,
      загрузка_рп=?, загрузка_аналит_конс=?, загрузка_аналит_эксп=?, загрузка_архит=?,
      загрузка_програм1=?, загрузка_програм2=?, загрузка_куратор=?
    WHERE id=?
  `).run(
    merged.этап, merged.работа, merged.рамки, merged.отчет_doc, merged.результат,
    merged.длит_трудоемк, merged.риск_этапа,
    merged.загрузка_рп, merged.загрузка_аналит_конс, merged.загрузка_аналит_эксп,
    merged.загрузка_архит, merged.загрузка_програм1, merged.загрузка_програм2,
    merged.загрузка_куратор, req.params.id,
  );
  res.json(db.prepare(`SELECT * FROM base_works WHERE id=?`).get(req.params.id));
});

constantsRouter.delete('/base-works/:id', (req, res) => {
  db.prepare(`DELETE FROM base_works WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});
