import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'db', 'recipe-notebook.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id     TEXT UNIQUE NOT NULL,
      title        TEXT NOT NULL,
      author       TEXT NOT NULL,
      publisher    TEXT,
      year         INTEGER,
      filename     TEXT NOT NULL,
      file_type    TEXT NOT NULL,
      recipe_count INTEGER DEFAULT 0,
      ingested_at  DATETIME,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id         INTEGER NOT NULL REFERENCES books(id),
      title           TEXT NOT NULL,
      description     TEXT,
      servings        TEXT,
      prep_time       TEXT,
      cook_time       TEXT,
      total_time      TEXT,
      course          TEXT,
      cuisine         TEXT,
      ingredients_raw TEXT NOT NULL,
      instructions    TEXT NOT NULL,
      notes           TEXT,
      tags            TEXT,
      source_chapter  TEXT,
      primary_image   TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipe_images (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      path       TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      quantity    TEXT,
      unit        TEXT,
      preparation TEXT,
      is_optional INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingestion_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id       INTEGER REFERENCES books(id),
      chapter_ref   TEXT,
      status        TEXT,
      recipes_found INTEGER DEFAULT 0,
      error_msg     TEXT,
      processed_at  DATETIME,
      UNIQUE(book_id, chapter_ref)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
      title, description, ingredients_raw, instructions, notes, tags, cuisine, course,
      content='recipes', content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS recipes_ai AFTER INSERT ON recipes BEGIN
      INSERT INTO recipes_fts(rowid, title, description, ingredients_raw, instructions, notes, tags, cuisine, course)
      VALUES (new.id, new.title, new.description, new.ingredients_raw, new.instructions, new.notes, new.tags, new.cuisine, new.course);
    END;

    CREATE TRIGGER IF NOT EXISTS recipes_ad AFTER DELETE ON recipes BEGIN
      INSERT INTO recipes_fts(recipes_fts, rowid, title, description, ingredients_raw, instructions, notes, tags, cuisine, course)
      VALUES ('delete', old.id, old.title, old.description, old.ingredients_raw, old.instructions, old.notes, old.tags, old.cuisine, old.course);
    END;

    CREATE TRIGGER IF NOT EXISTS recipes_au AFTER UPDATE ON recipes BEGIN
      INSERT INTO recipes_fts(recipes_fts, rowid, title, description, ingredients_raw, instructions, notes, tags, cuisine, course)
      VALUES ('delete', old.id, old.title, old.description, old.ingredients_raw, old.instructions, old.notes, old.tags, old.cuisine, old.course);
      INSERT INTO recipes_fts(rowid, title, description, ingredients_raw, instructions, notes, tags, cuisine, course)
      VALUES (new.id, new.title, new.description, new.ingredients_raw, new.instructions, new.notes, new.tags, new.cuisine, new.course);
    END;
  `);
}
