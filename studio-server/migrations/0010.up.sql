-- The prepared assets (4.2.2 PR 6b, D43): each `prepare` run on the processing worker, its files by path and content
-- hash (`manifest`), the revision of the game it read. The latest is what the Studio and the game's origin serve.
CREATE TABLE studio_prepared (
  id INTEGER PRIMARY KEY,
  epoch TEXT NOT NULL,
  rev BIGINT NOT NULL,
  manifest TEXT NOT NULL,
  made_by TEXT NOT NULL,
  made_at BIGINT NOT NULL
);
