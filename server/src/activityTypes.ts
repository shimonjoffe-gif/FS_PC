import { db } from './db';

export interface ActivityType {
  id: number;
  name: string;
}

export function listActivityTypes(): ActivityType[] {
  return db.prepare(`SELECT id, name FROM activity_types ORDER BY name`).all() as ActivityType[];
}

export function ensureActivityType(name: string): ActivityType {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');
  db.prepare(`INSERT OR IGNORE INTO activity_types(name) VALUES (?)`).run(trimmed);
  const row = db.prepare(`SELECT id, name FROM activity_types WHERE name=?`).get(trimmed) as ActivityType;
  return row;
}

export function createActivityType(name: string): ActivityType {
  return ensureActivityType(name);
}

export function loadHypothesisActivityTypes(hypothesisId: number): ActivityType[] {
  return db.prepare(`
    SELECT at.id, at.name
    FROM activity_types at
    JOIN hypothesis_activity_types hat ON hat.activity_type_id = at.id
    WHERE hat.hypothesis_id=?
    ORDER BY at.name
  `).all(hypothesisId) as ActivityType[];
}

export function syncHypothesisActivityTypes(hypothesisId: number, activityTypeIds: number[]): void {
  const unique = [...new Set(activityTypeIds.filter(id => id > 0))];
  db.prepare(`DELETE FROM hypothesis_activity_types WHERE hypothesis_id=?`).run(hypothesisId);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO hypothesis_activity_types(hypothesis_id, activity_type_id) VALUES (?,?)
  `);
  for (const atId of unique) ins.run(hypothesisId, atId);
}
