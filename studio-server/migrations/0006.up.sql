-- The revisions' previews (4.2.2 PR 2, plan §2.2): for each revision built, its files by path, each the sha256 of a
-- blob (the journal's blob store), or the reason its build failed. A revision is built at most once per epoch.
CREATE TABLE studio_previews (
  epoch TEXT NOT NULL,
  rev BIGINT NOT NULL,
  manifest TEXT,
  failed TEXT,
  ms BIGINT NOT NULL,
  made_at BIGINT NOT NULL,
  PRIMARY KEY (epoch, rev)
);
