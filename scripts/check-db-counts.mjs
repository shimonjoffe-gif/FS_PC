import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.argv[2] || path.join(root, 'data', 'projects.db');
const db = new Database(dbPath, { readonly: true });

const tables = ['segments', 'stakeholder_roles', 'widgets', 'hypotheses', 'projects', 'briefings'];
for (const t of tables) {
  console.log(t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c);
}
const img = db.prepare(
  `SELECT COUNT(*) c FROM widgets WHERE image_path IS NOT NULL AND trim(image_path) <> ''`,
).get().c;
console.log('widgets_with_image', img);
console.log('roles', db.prepare('SELECT id, name FROM stakeholder_roles ORDER BY name').all());
console.log('segments', db.prepare('SELECT id, name FROM segments ORDER BY name').all());
db.close();
