import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { normalizeFsPrefix } from './fsPrefix';
import { seedProjectTypesNsi } from './assessmentCalc';

const DATA_DIR = path.join(process.cwd(), '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'projects.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS constants (
      key   TEXT PRIMARY KEY,
      value REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS etap_list (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'Стандартный проект',
      is_template INTEGER DEFAULT 0,
      created_by  INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS project_rows (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sort_order          INTEGER DEFAULT 0,
      этап                TEXT DEFAULT '',
      работа              TEXT DEFAULT '',
      исполнитель         TEXT DEFAULT 'ITLand/Заказчик',
      рамки               TEXT DEFAULT '',
      результаты          TEXT DEFAULT '',
      отчет_doc           TEXT DEFAULT '',
      длит_трудоемк       REAL DEFAULT 0,
      согл_заказчика      INTEGER DEFAULT 0,
      риск_этапа          REAL DEFAULT 0,
      компенсация_продаж  REAL DEFAULT 0,
      загрузка_рп         REAL DEFAULT 0,
      загрузка_аналит_конс REAL DEFAULT 0,
      загрузка_аналит_эксп REAL DEFAULT 0,
      загрузка_архит      REAL DEFAULT 0,
      загрузка_програм1   REAL DEFAULT 0,
      загрузка_програм2   REAL DEFAULT 0,
      загрузка_куратор    REAL DEFAULT 0,
      трудозатраты_итог   REAL DEFAULT 0,
      фонд_компании       REAL DEFAULT 0,
      резерв_компании     REAL DEFAULT 0,
      бюджет_усн          REAL DEFAULT 0,
      бюджет_кп           REAL DEFAULT 0,
      бюджет_с_рисками    REAL DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Справочник рамок/результатов/документов с автором
    CREATE TABLE IF NOT EXISTS work_references (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_type   TEXT NOT NULL,   -- 'рамки' | 'результаты' | 'документ'
      work_name  TEXT NOT NULL,
      content    TEXT NOT NULL,
      author_id  INTEGER REFERENCES users(id),
      usage_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Каталог типовых работ
    CREATE TABLE IF NOT EXISTS base_works (
      id                   TEXT PRIMARY KEY,
      этап                 TEXT,
      работа               TEXT,
      рамки                TEXT,
      отчет_doc            TEXT,
      результат            TEXT,
      длит_трудоемк        REAL DEFAULT 0,
      риск_этапа           REAL DEFAULT 0,
      загрузка_рп          REAL DEFAULT 0,
      загрузка_аналит_конс REAL DEFAULT 0,
      загрузка_аналит_эксп REAL DEFAULT 0,
      загрузка_архит       REAL DEFAULT 0,
      загрузка_програм1    REAL DEFAULT 0,
      загрузка_програм2    REAL DEFAULT 0,
      загрузка_куратор     REAL DEFAULT 0
    );

    -- История изменений
    CREATE TABLE IF NOT EXISTS project_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      row_id     INTEGER,
      user_id    INTEGER REFERENCES users(id),
      action     TEXT NOT NULL,   -- 'create_project' | 'update_row' | 'add_row' | 'delete_row'
      field_name TEXT,
      old_value  TEXT,
      new_value  TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- === Мастер предварительной оценки: справочники ===
    CREATE TABLE IF NOT EXISTS industries (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL UNIQUE,
      sheet_name TEXT
    );

    CREATE TABLE IF NOT EXISTS segments (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS industry_segment_map (
      industry_id INTEGER NOT NULL REFERENCES industries(id) ON DELETE CASCADE,
      segment_id  INTEGER NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
      PRIMARY KEY (industry_id, segment_id)
    );

    CREATE TABLE IF NOT EXISTS maturity_levels (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS problems (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      industry_id INTEGER REFERENCES industries(id),
      segment_id  INTEGER REFERENCES segments(id),
      maturity_id INTEGER REFERENCES maturity_levels(id)
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      hypothesis  TEXT
    );

    CREATE TABLE IF NOT EXISTS problem_solution_map (
      problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
      PRIMARY KEY (problem_id, solution_id)
    );

    CREATE TABLE IF NOT EXISTS widgets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT,
      type        TEXT DEFAULT 'dashboard',
      image_path  TEXT
    );

    CREATE TABLE IF NOT EXISTS solution_widget_map (
      solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
      widget_id   INTEGER NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
      PRIMARY KEY (solution_id, widget_id)
    );

    CREATE TABLE IF NOT EXISTS fs_catalog (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT,
      prefix       TEXT,
      name         TEXT NOT NULL,
      description  TEXT,
      group_name   TEXT,
      group_prefix TEXT,
      item_type    TEXT DEFAULT 'item',
      parent_id    INTEGER REFERENCES fs_catalog(id),
      sort_order   INTEGER DEFAULT 0,
      phase        TEXT,
      queue        TEXT DEFAULT '1',
      default_queues_json TEXT DEFAULT '{"1":0,"2":0,"3":0,"4":0}',
      story_points REAL DEFAULT 0,
      base_work_id TEXT REFERENCES base_works(id)
    );

    CREATE TABLE IF NOT EXISTS fs_phases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL UNIQUE,
      sort_order      INTEGER DEFAULT 0,
      enabled_default INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS fs_industry_blocks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      industry_profile TEXT NOT NULL,
      fs_item_id       INTEGER NOT NULL REFERENCES fs_catalog(id) ON DELETE CASCADE,
      UNIQUE(industry_profile, fs_item_id)
    );

    CREATE TABLE IF NOT EXISTS solution_fs_map (
      solution_id INTEGER NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
      fs_item_id  INTEGER NOT NULL REFERENCES fs_catalog(id) ON DELETE CASCADE,
      PRIMARY KEY (solution_id, fs_item_id)
    );

    CREATE TABLE IF NOT EXISTS widget_fs_map (
      widget_id  INTEGER NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
      fs_item_id INTEGER NOT NULL REFERENCES fs_catalog(id) ON DELETE CASCADE,
      PRIMARY KEY (widget_id, fs_item_id)
    );

    -- === Сессии предоценки ===
    CREATE TABLE IF NOT EXISTS briefings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL DEFAULT 'Новая предоценка',
      industry_id INTEGER REFERENCES industries(id),
      segment_id  INTEGER REFERENCES segments(id),
      scenario    TEXT,
      headcount   INTEGER,
      project_id  INTEGER REFERENCES projects(id),
      created_by  INTEGER REFERENCES users(id),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS briefing_problem_sel (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      briefing_id INTEGER NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
      problem_id  INTEGER REFERENCES problems(id),
      custom_text TEXT
    );

    CREATE TABLE IF NOT EXISTS briefing_solution_sel (
      briefing_id INTEGER NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
      solution_id INTEGER NOT NULL REFERENCES solutions(id),
      PRIMARY KEY (briefing_id, solution_id)
    );

    CREATE TABLE IF NOT EXISTS briefing_widget_sel (
      briefing_id INTEGER NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
      solution_id INTEGER NOT NULL REFERENCES solutions(id),
      widget_id   INTEGER NOT NULL REFERENCES widgets(id),
      PRIMARY KEY (briefing_id, solution_id, widget_id)
    );

    CREATE TABLE IF NOT EXISTS briefing_fs_sel (
      briefing_id  INTEGER NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
      fs_item_id   INTEGER NOT NULL REFERENCES fs_catalog(id),
      enabled      INTEGER DEFAULT 1,
      queue        TEXT DEFAULT '1',
      queues_json  TEXT DEFAULT '{"1":0,"2":0,"3":0,"4":0}',
      source       TEXT,
      story_points REAL,
      PRIMARY KEY (briefing_id, fs_item_id)
    );

    CREATE TABLE IF NOT EXISTS briefing_params (
      briefing_id  INTEGER PRIMARY KEY REFERENCES briefings(id) ON DELETE CASCADE,
      hourly_rate  REAL DEFAULT 1000,
      accuracy     REAL DEFAULT 0,
      sp_cost_rub  REAL DEFAULT 8000,
      phases_json  TEXT,
      team_json    TEXT
    );

    CREATE TABLE IF NOT EXISTS project_types (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      sort_order   INTEGER DEFAULT 0,
      is_active    INTEGER DEFAULT 1,
      base_type_id INTEGER REFERENCES project_types(id)
    );

    CREATE TABLE IF NOT EXISTS project_type_rates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_type_id INTEGER NOT NULL REFERENCES project_types(id) ON DELETE CASCADE,
      hourly_rate     REAL NOT NULL,
      valid_from      TEXT DEFAULT '2020-01-01'
    );

    CREATE TABLE IF NOT EXISTS headcount_coefficients (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      project_type_id INTEGER NOT NULL REFERENCES project_types(id) ON DELETE CASCADE,
      category        TEXT NOT NULL,
      c63             REAL DEFAULT 1,
      c64             REAL DEFAULT 1,
      c67             REAL DEFAULT 6,
      c68             REAL DEFAULT 1,
      UNIQUE(project_type_id, category)
    );

    CREATE TABLE IF NOT EXISTS briefing_assessment (
      briefing_id            INTEGER PRIMARY KEY REFERENCES briefings(id) ON DELETE CASCADE,
      criteria_json          TEXT DEFAULT '{}',
      project_type_id        INTEGER REFERENCES project_types(id),
      project_type_manual    INTEGER DEFAULT 0,
      risks_json             TEXT DEFAULT '{}',
      risks_manual           INTEGER DEFAULT 0,
      org_volume_json        TEXT DEFAULT '{}',
      org_volume_manual      INTEGER DEFAULT 0,
      headcount_category     TEXT,
      headcount_coeffs_json  TEXT DEFAULT '{}',
      headcount_manual       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS briefing_queue_calc (
      briefing_id INTEGER NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
      queue       TEXT NOT NULL,
      technology  TEXT,
      rate        REAL,
      rate_manual INTEGER DEFAULT 0,
      technology_manual INTEGER DEFAULT 0,
      PRIMARY KEY (briefing_id, queue)
    );
  `);

  const queueCalcCols = db.prepare(`PRAGMA table_info(briefing_queue_calc)`).all() as { name: string }[];
  if (!queueCalcCols.some(c => c.name === 'technology_manual')) {
    db.exec(`ALTER TABLE briefing_queue_calc ADD COLUMN technology_manual INTEGER DEFAULT 0`);
  }

  const widgetCols = db.prepare(`PRAGMA table_info(widgets)`).all() as { name: string }[];
  if (!widgetCols.some(c => c.name === 'image_path')) {
    db.exec(`ALTER TABLE widgets ADD COLUMN image_path TEXT`);
  }

  const fsCols = db.prepare(`PRAGMA table_info(fs_catalog)`).all() as { name: string }[];
  const fsColNames = new Set(fsCols.map(c => c.name));
  if (!fsColNames.has('group_name')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN group_name TEXT`);
  if (!fsColNames.has('description')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN description TEXT`);
  if (!fsColNames.has('item_type')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN item_type TEXT DEFAULT 'item'`);
  if (!fsColNames.has('parent_id')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN parent_id INTEGER REFERENCES fs_catalog(id)`);
  if (!fsColNames.has('sort_order')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN sort_order INTEGER DEFAULT 0`);
  if (!fsColNames.has('default_queues_json')) {
    db.exec(`ALTER TABLE fs_catalog ADD COLUMN default_queues_json TEXT DEFAULT '{"1":0,"2":0,"3":0,"4":0}'`);
  }
  if (!fsColNames.has('func_type')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN func_type TEXT`);
  if (!fsColNames.has('group_prefix')) db.exec(`ALTER TABLE fs_catalog ADD COLUMN group_prefix TEXT`);
  if (!fsColNames.has('prefix')) {
    db.exec(`ALTER TABLE fs_catalog ADD COLUMN prefix TEXT`);
    const backfill = db.prepare(`UPDATE fs_catalog SET prefix=?, code=NULL WHERE id=?`);
    const rows = db.prepare(`SELECT id, code FROM fs_catalog WHERE code IS NOT NULL AND code != ''`).all() as {
      id: number; code: string;
    }[];
    for (const row of rows) {
      const prefix = normalizeFsPrefix(row.code);
      if (prefix) backfill.run(prefix, row.id);
    }
  }

  const bfsCols = db.prepare(`PRAGMA table_info(briefing_fs_sel)`).all() as { name: string }[];
  if (!bfsCols.some(c => c.name === 'queues_json')) {
    db.exec(`ALTER TABLE briefing_fs_sel ADD COLUMN queues_json TEXT DEFAULT '{"1":0,"2":0,"3":0,"4":0}'`);
  }

  const assessmentCols = db.prepare(`PRAGMA table_info(briefing_assessment)`).all() as { name: string }[];
  const assessmentColNames = new Set(assessmentCols.map(c => c.name));
  if (!assessmentColNames.has('unified_rate_enabled')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN unified_rate_enabled INTEGER DEFAULT 0`);
  }
  if (!assessmentColNames.has('unified_rate')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN unified_rate REAL`);
  }
  if (!assessmentColNames.has('unified_rate_manual')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN unified_rate_manual INTEGER DEFAULT 0`);
  }
  if (!assessmentColNames.has('phase_calc_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN phase_calc_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('phase_calc_params_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN phase_calc_params_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('risks_manual_keys_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_manual_keys_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('risks_ot_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_ot_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('risks_do_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_do_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('risks_manual_keys_ot_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_manual_keys_ot_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('risks_manual_keys_do_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_manual_keys_do_json TEXT DEFAULT '{}'`);
  }
  if (!assessmentColNames.has('risks_manual_ot')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_manual_ot INTEGER DEFAULT 0`);
  }
  if (!assessmentColNames.has('risks_manual_do')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN risks_manual_do INTEGER DEFAULT 0`);
  }
  if (!assessmentColNames.has('assessment_scenarios_json')) {
    db.exec(`ALTER TABLE briefing_assessment ADD COLUMN assessment_scenarios_json TEXT DEFAULT '[]'`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS briefing_assessment_snapshots (
      id TEXT PRIMARY KEY,
      briefing_id INTEGER NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,
      scenario_id TEXT,
      name TEXT NOT NULL,
      frozen_at TEXT NOT NULL,
      sent_to_client INTEGER DEFAULT 0,
      extended INTEGER DEFAULT 0,
      scenario_overrides_json TEXT,
      results_json TEXT NOT NULL,
      extended_dump_json TEXT,
      base_revision TEXT
    )
  `);

  const legacyAccuracy = db.prepare(`
    SELECT briefing_id, accuracy FROM briefing_params
    WHERE accuracy IN ('low', 'medium', 'high')
  `).all() as { briefing_id: number; accuracy: string }[];
  if (legacyAccuracy.length > 0) {
    const map: Record<string, number> = { low: -15, medium: 0, high: 20 };
    const update = db.prepare(`UPDATE briefing_params SET accuracy=? WHERE briefing_id=?`);
    for (const row of legacyAccuracy) {
      update.run(map[row.accuracy] ?? 0, row.briefing_id);
    }
  }

  seedProjectTypesNsi();
}
