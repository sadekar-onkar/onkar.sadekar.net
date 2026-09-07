-- Workshop voting — D1 (SQLite) schema.
--
-- Four tables, and one rule that makes everything else safe: `vote` is keyed on
-- (person_id, category_id), so writing a vote is an UPSERT, never an append.
-- A double-tap, a retried request from the offline queue, and a page refresh
-- all converge on the same row. That is what lets the phone client retry
-- blindly without ever double-counting.

CREATE TABLE IF NOT EXISTS attendee (
  id      TEXT PRIMARY KEY,          -- p01, p02, …
  name    TEXT NOT NULL,
  consent INTEGER NOT NULL DEFAULT 1,-- vestigial: the app no longer collects or
                                     -- reads this; every name is published.
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS category (
  id         TEXT PRIMARY KEY,       -- c01, c02, …
  label      TEXT NOT NULL,
  added_live INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vote (
  person_id   TEXT NOT NULL,
  category_id TEXT NOT NULL,
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
