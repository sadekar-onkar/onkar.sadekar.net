-- Workshop voting — D1 (SQLite) schema.
--
-- A ballot is up to four ranked projects. It is always written WHOLE: the
-- phone sends its complete ranking and the Worker replaces that person's rows
-- in one atomic batch. A double-tap, a retried request from the offline queue
-- and a page refresh all converge on the same rows, so the phone can retry
-- blindly without ever double-counting.
--
-- new_workshop.py DROPs these tables before re-applying this file, which is
-- how a column added here reaches an existing database.

CREATE TABLE IF NOT EXISTS attendee (
  id      TEXT PRIMARY KEY,          -- p01, p02, …
  name    TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 1,-- vestigial: the app no longer collects or
                                     -- reads this; every name is published.
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS category (
  id          TEXT PRIMARY KEY,      -- c01, c02, …
  label       TEXT NOT NULL,         -- full project title
  short       TEXT NOT NULL DEFAULT '',  -- "P3 · Mental health", for the network
  description TEXT NOT NULL DEFAULT '',
  added_live  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vote (
  person_id   TEXT NOT NULL,
  category_id TEXT NOT NULL,
  rank        INTEGER NOT NULL,      -- 1 = favourite … 4
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (person_id, category_id)
);

CREATE TABLE IF NOT EXISTS setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vote_by_category ON vote (category_id);

INSERT OR IGNORE INTO setting (key, value) VALUES ('state', 'open');
INSERT OR IGNORE INTO setting (key, value) VALUES ('current_talk', '');
INSERT OR IGNORE INTO setting (key, value) VALUES ('groups', '5');
INSERT OR IGNORE INTO setting (key, value) VALUES ('spread', '1');
