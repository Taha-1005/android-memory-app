export const SCHEMA_VERSION = 1;

export const CREATE_PAGES_TABLE = `
CREATE TABLE IF NOT EXISTS pages (
  slug             TEXT PRIMARY KEY NOT NULL,
  title            TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('entity','concept','source')),
  body             TEXT NOT NULL DEFAULT '',
  facts_json       TEXT NOT NULL DEFAULT '[]',
  links_json       TEXT NOT NULL DEFAULT '[]',
  sources_json     TEXT NOT NULL DEFAULT '[]',
  user_edited      INTEGER NOT NULL DEFAULT 0,
  filed_from_query INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);`;

export const CREATE_PAGES_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_pages_updated_at ON pages(updated_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_pages_kind ON pages(kind);`,
  `CREATE INDEX IF NOT EXISTS idx_pages_title_ci ON pages(LOWER(title));`,
];

export const CREATE_SOURCE_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS source_log (
  id             TEXT PRIMARY KEY NOT NULL,
  slug           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('text','url')),
  title          TEXT NOT NULL,
  content        TEXT,
  url            TEXT,
  timestamp      TEXT NOT NULL,
  processed      INTEGER NOT NULL DEFAULT 0,
  processing     INTEGER NOT NULL DEFAULT 0,
  processed_at   TEXT,
  pages_created  INTEGER,
  error          TEXT
);`;

export const CREATE_SOURCE_LOG_INDEX = `CREATE INDEX IF NOT EXISTS idx_source_log_timestamp ON source_log(timestamp DESC);`;

export const CREATE_META_TABLE = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);`;

export const ALL_STATEMENTS: string[] = [
  CREATE_PAGES_TABLE,
  ...CREATE_PAGES_INDEXES,
  CREATE_SOURCE_LOG_TABLE,
  CREATE_SOURCE_LOG_INDEX,
  CREATE_META_TABLE,
];
