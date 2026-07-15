import path from 'path';
import fs from 'fs';

/** Корень данных: SQLite, uploads. На Railway — смонтированный Volume, например /data */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), '..', 'data');

export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

export function ensureDataDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
