-- Comments (4.2.3 PR 3, plan H2): a thread anchored on a stable id of the game (a room, a rule, `item:<id>`, a panel…)
-- and the revision it was written at; open to reviewers, who write no game file. `source`: what it came from (a note of
-- notes.json, `note:<id>`), so an import never brings one twice. Kept by the backup.
CREATE TABLE studio_comments (
  id TEXT PRIMARY KEY,
  anchor TEXT NOT NULL,
  rev BIGINT NOT NULL,
  parent TEXT,
  author_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  source TEXT UNIQUE,
  created_at BIGINT NOT NULL,
  edited_at BIGINT
);
CREATE INDEX studio_comments_anchor ON studio_comments (anchor);
