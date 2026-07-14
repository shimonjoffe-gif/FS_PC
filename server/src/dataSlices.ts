import { db } from './db';

export interface DataSlice {
  id: number;
  name: string;
}

export function listDataSlices(): DataSlice[] {
  return db.prepare(`SELECT id, name FROM data_slices ORDER BY name`).all() as DataSlice[];
}

export function ensureDataSlice(name: string): DataSlice {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');
  db.prepare(`INSERT OR IGNORE INTO data_slices(name) VALUES (?)`).run(trimmed);
  return db.prepare(`SELECT id, name FROM data_slices WHERE name=?`).get(trimmed) as DataSlice;
}

export function createDataSlice(name: string): DataSlice {
  return ensureDataSlice(name);
}
