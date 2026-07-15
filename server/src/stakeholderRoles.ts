import { db } from './db';

export interface StakeholderRole {
  id: number;
  name: string;
}

export interface HypothesisStakeholderRoleRow {
  id: number;
  name: string;
  description: string | null;
}

export function listStakeholderRoles(): StakeholderRole[] {
  return db.prepare(`SELECT id, name FROM stakeholder_roles ORDER BY name`).all() as StakeholderRole[];
}

export function createStakeholderRole(name: string): StakeholderRole {
  const trimmed = name?.trim();
  if (!trimmed) throw new Error('name is required');
  db.prepare(`INSERT OR IGNORE INTO stakeholder_roles(name) VALUES (?)`).run(trimmed);
  const row = db.prepare(`SELECT id, name FROM stakeholder_roles WHERE name=?`).get(trimmed) as StakeholderRole;
  return row;
}

export function deleteStakeholderRole(id: number): boolean {
  const row = db.prepare(`SELECT id FROM stakeholder_roles WHERE id=?`).get(id);
  if (!row) return false;
  db.prepare(`DELETE FROM stakeholder_roles WHERE id=?`).run(id);
  return true;
}

export function loadHypothesisStakeholderRoles(hypothesisId: number): HypothesisStakeholderRoleRow[] {
  return db.prepare(`
    SELECT sr.id, sr.name, hsr.description
    FROM stakeholder_roles sr
    JOIN hypothesis_stakeholder_roles hsr ON hsr.stakeholder_role_id = sr.id
    WHERE hsr.hypothesis_id=?
    ORDER BY sr.name
  `).all(hypothesisId) as HypothesisStakeholderRoleRow[];
}

export interface HypothesisStakeholderRoleInput {
  stakeholder_role_id?: number;
  name?: string;
  description?: string | null;
}

export function syncHypothesisStakeholderRoles(
  hypothesisId: number,
  entries: HypothesisStakeholderRoleInput[],
): void {
  db.prepare(`DELETE FROM hypothesis_stakeholder_roles WHERE hypothesis_id=?`).run(hypothesisId);
  const ins = db.prepare(`
    INSERT INTO hypothesis_stakeholder_roles(hypothesis_id, stakeholder_role_id, description) VALUES (?,?,?)
  `);
  for (const entry of entries) {
    let roleId = entry.stakeholder_role_id;
    if (!roleId && entry.name?.trim()) {
      roleId = createStakeholderRole(entry.name).id;
    }
    if (!roleId) continue;
    ins.run(hypothesisId, roleId, entry.description?.trim() || null);
  }
}

export function loadHypothesisSegmentIds(hypothesisId: number): number[] {
  return (db.prepare(`
    SELECT segment_id FROM hypothesis_segments WHERE hypothesis_id=? ORDER BY segment_id
  `).all(hypothesisId) as { segment_id: number }[]).map(r => r.segment_id);
}

export function syncHypothesisSegments(hypothesisId: number, segmentIds: number[]): void {
  const unique = [...new Set(segmentIds.filter(id => id > 0))];
  db.prepare(`DELETE FROM hypothesis_segments WHERE hypothesis_id=?`).run(hypothesisId);
  const ins = db.prepare(`
    INSERT OR IGNORE INTO hypothesis_segments(hypothesis_id, segment_id) VALUES (?,?)
  `);
  for (const segId of unique) ins.run(hypothesisId, segId);
}

export function loadBriefingStakeholderRoleIds(briefingId: number): number[] {
  return (db.prepare(`
    SELECT stakeholder_role_id FROM briefing_stakeholder_role_sel WHERE briefing_id=? ORDER BY stakeholder_role_id
  `).all(briefingId) as { stakeholder_role_id: number }[]).map(r => r.stakeholder_role_id);
}

export function saveBriefingStakeholderRoleIds(briefingId: number, roleIds: number[]): void {
  const unique = [...new Set(roleIds.filter(id => id > 0))];
  db.prepare(`DELETE FROM briefing_stakeholder_role_sel WHERE briefing_id=?`).run(briefingId);
  const ins = db.prepare(`
    INSERT INTO briefing_stakeholder_role_sel(briefing_id, stakeholder_role_id) VALUES (?,?)
  `);
  for (const roleId of unique) ins.run(briefingId, roleId);
}
