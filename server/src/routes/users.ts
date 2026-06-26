import { Router } from 'express';
import { db } from '../db';

export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  res.json(db.prepare(`SELECT * FROM users ORDER BY name`).all());
});

usersRouter.post('/', (req, res) => {
  const { name } = req.body as { name: string };
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const result = db.prepare(`INSERT INTO users(name) VALUES (?)`).run(name.trim());
    res.json({ id: result.lastInsertRowid, name: name.trim() });
  } catch {
    res.status(409).json({ error: 'user already exists' });
  }
});
