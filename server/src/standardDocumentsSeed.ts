import { db } from './db';
import { TYPE_CRITERIA_DEFS } from './sellerCriteria';
import type { DocumentTech, StandardDocument, StandardDocumentExclusion } from './standardDocuments';

const STD_COLS = `
  id, field_key, label, excel_ref, group_key, sort_order, is_active,
  tech, can_extra, std_case, std_bz, std_prof_mini, std_prof, std_korp
`;

export function listStandardDocuments(): StandardDocument[] {
  return db.prepare(`
    SELECT ${STD_COLS}
    FROM standard_documents
    ORDER BY sort_order, id
  `).all() as StandardDocument[];
}

export function listStandardDocumentExclusions(): StandardDocumentExclusion[] {
  return db.prepare(`
    SELECT id, doc_id_a, doc_id_b FROM standard_document_exclusions ORDER BY id
  `).all() as StandardDocumentExclusion[];
}

function legacyTypeImpact(tech: DocumentTech): 'PROF' | 'KORP' {
  return tech === 'KORP' ? 'KORP' : 'PROF';
}

function insertDocumentIfMissing(row: {
  field_key: string;
  label: string;
  excel_ref: string;
  group_key: string;
  sort_order: number;
  tech: DocumentTech;
  can_extra: number;
  std_case: number;
  std_bz: number;
  std_prof_mini: number;
  std_prof: number;
  std_korp: number;
}) {
  const existing = db.prepare(`SELECT id FROM standard_documents WHERE field_key=?`).get(row.field_key) as { id: number } | undefined;
  if (existing) return existing.id;

  const typeImpact = legacyTypeImpact(row.tech);
  const r = db.prepare(`
    INSERT INTO standard_documents(
      field_key, label, type_impact, excel_ref, group_key, sort_order, is_active,
      tech, can_extra, std_case, std_bz, std_prof_mini, std_prof, std_korp
    ) VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?)
  `).run(
    row.field_key, row.label, typeImpact, row.excel_ref, row.group_key, row.sort_order,
    row.tech, row.can_extra, row.std_case, row.std_bz, row.std_prof_mini, row.std_prof, row.std_korp,
  );
  return Number(r.lastInsertRowid);
}

function ensureExclusionPair(keyA: string, keyB: string) {
  const a = db.prepare(`SELECT id FROM standard_documents WHERE field_key=?`).get(keyA) as { id: number } | undefined;
  const b = db.prepare(`SELECT id FROM standard_documents WHERE field_key=?`).get(keyB) as { id: number } | undefined;
  if (!a || !b) return;
  const lo = Math.min(a.id, b.id);
  const hi = Math.max(a.id, b.id);
  db.prepare(`
    INSERT OR IGNORE INTO standard_document_exclusions(doc_id_a, doc_id_b) VALUES (?,?)
  `).run(lo, hi);
}

export function seedStandardDocumentsNsi() {
  let sortOrder = 0;

  insertDocumentIfMissing({
    field_key: 'doc_short_charter',
    label: 'Сокращённый устав проекта',
    excel_ref: 'C101',
    group_key: 'non_standard_docs',
    sort_order: ++sortOrder,
    tech: 'CASE',
    can_extra: 0,
    std_case: 1,
    std_bz: 1,
    std_prof_mini: 1,
    std_prof: 1,
    std_korp: 1,
  });

  for (const def of TYPE_CRITERIA_DEFS) {
    if (!def.typeImpact) continue;
    const tech: DocumentTech = def.typeImpact === 'KORP' ? 'KORP' : 'PROF';
    for (const child of def.childFields ?? []) {
      const isExtendedCharter = child.key === 'doc_extended_charter';
      insertDocumentIfMissing({
        field_key: child.key,
        label: child.label,
        excel_ref: child.excelRef,
        group_key: def.key,
        sort_order: ++sortOrder,
        tech,
        can_extra: isExtendedCharter ? 1 : 0,
        std_case: isExtendedCharter ? 0 : 0,
        std_bz: isExtendedCharter ? 0 : 0,
        std_prof_mini: isExtendedCharter ? 0 : 0,
        std_prof: isExtendedCharter ? 0 : (def.typeImpact === 'PROF' ? 1 : 0),
        std_korp: isExtendedCharter ? 0 : (def.typeImpact === 'KORP' ? 1 : (def.typeImpact === 'PROF' ? 1 : 0)),
      });
    }
  }

  ensureExclusionPair('doc_short_charter', 'doc_extended_charter');
}

export function migrateStandardDocumentsSchema() {
  const cols = db.prepare(`PRAGMA table_info(standard_documents)`).all() as { name: string }[];
  const names = new Set(cols.map(c => c.name));
  const addedMatrixCols =
    !names.has('tech') ||
    !names.has('can_extra') ||
    !names.has('std_case') ||
    !names.has('std_bz') ||
    !names.has('std_prof_mini') ||
    !names.has('std_prof') ||
    !names.has('std_korp');

  if (!names.has('tech')) db.exec(`ALTER TABLE standard_documents ADD COLUMN tech TEXT NOT NULL DEFAULT 'CASE'`);
  if (!names.has('can_extra')) db.exec(`ALTER TABLE standard_documents ADD COLUMN can_extra INTEGER NOT NULL DEFAULT 0`);
  if (!names.has('std_case')) db.exec(`ALTER TABLE standard_documents ADD COLUMN std_case INTEGER NOT NULL DEFAULT 0`);
  if (!names.has('std_bz')) db.exec(`ALTER TABLE standard_documents ADD COLUMN std_bz INTEGER NOT NULL DEFAULT 0`);
  if (!names.has('std_prof_mini')) db.exec(`ALTER TABLE standard_documents ADD COLUMN std_prof_mini INTEGER NOT NULL DEFAULT 0`);
  if (!names.has('std_prof')) db.exec(`ALTER TABLE standard_documents ADD COLUMN std_prof INTEGER NOT NULL DEFAULT 0`);
  if (!names.has('std_korp')) db.exec(`ALTER TABLE standard_documents ADD COLUMN std_korp INTEGER NOT NULL DEFAULT 0`);

  if (addedMatrixCols && names.has('type_impact')) {
    db.exec(`
      UPDATE standard_documents SET type_impact = CASE WHEN tech = 'KORP' THEN 'KORP' ELSE 'PROF' END
      WHERE type_impact IS NULL OR type_impact = ''
    `);
    db.exec(`
      UPDATE standard_documents SET tech = type_impact WHERE tech IS NULL OR tech = ''
    `);
    db.exec(`
      UPDATE standard_documents SET std_prof = 1, std_korp = 1
      WHERE type_impact = 'PROF' AND std_prof = 0 AND std_korp = 0 AND field_key != 'doc_extended_charter'
    `);
    db.exec(`
      UPDATE standard_documents SET std_korp = 1
      WHERE type_impact = 'KORP' AND std_korp = 0 AND field_key != 'doc_extended_charter'
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS standard_document_exclusions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id_a INTEGER NOT NULL REFERENCES standard_documents(id) ON DELETE CASCADE,
      doc_id_b INTEGER NOT NULL REFERENCES standard_documents(id) ON DELETE CASCADE,
      UNIQUE(doc_id_a, doc_id_b)
    )
  `);
}
