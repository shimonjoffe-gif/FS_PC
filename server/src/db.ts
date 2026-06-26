import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
  `);
}
