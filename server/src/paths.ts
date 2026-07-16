import path from 'path';
import fs from 'fs';

/** Корень данных: SQLite, uploads. На Railway — смонтированный Volume, например /data */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), '..', 'data');

export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'projects.db');

/**
 * Не создаём сам mount-point Volume заранее — иначе процесс может
 * открыть пустой projects.db на эфемерном диске до монтирования Volume.
 */
export function ensureDataDirs() {
  const volumeMount = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH)
    : null;

  if (volumeMount && DATA_DIR === volumeMount) {
    if (!fs.existsSync(DATA_DIR)) {
      throw new Error(`Volume ${DATA_DIR} is not mounted yet`);
    }
  } else if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
