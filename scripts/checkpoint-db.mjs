import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'projects.db');
const db = new Database(dbPath);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log('WAL checkpoint done:', dbPath);
