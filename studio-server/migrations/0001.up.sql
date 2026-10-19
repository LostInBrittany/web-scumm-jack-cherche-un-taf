-- The Studio Server's journal (4.2.1, plan §4 and P1): one project per database. Dialect-neutral (SQLite, Postgres).
-- `studio_meta`: the project's epoch (a random id fixed at creation) and its revision counter.
CREATE TABLE studio_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- One row per operation, keyed by the id its client chose: a retry finds its row and its recorded response.
-- `state`: intent (logged, not yet confirmed), confirmed, aborted. `effects`: JSON [{path, before, after}], each a
-- sha256 or "absent". `response`: the JSON the client got (or gets again on a retry).
CREATE TABLE studio_ops (
  op_id TEXT PRIMARY KEY,
  rev BIGINT NOT NULL,
  author TEXT NOT NULL,
  what TEXT NOT NULL,
  state TEXT NOT NULL,
  effects TEXT NOT NULL,
  response TEXT,
  at BIGINT NOT NULL
);
-- A revision is made once: two live operations can never hold the same number (an aborted one gives it back).
CREATE UNIQUE INDEX studio_ops_rev ON studio_ops (rev) WHERE state <> 'aborted';
-- The head: each file's content (a sha256, or absent) and the revision that last wrote it (the base of a 409).
CREATE TABLE studio_files (
  path TEXT PRIMARY KEY,
  blob TEXT NOT NULL,
  rev BIGINT NOT NULL
);
-- The project's write lease (one writer at a time, across processes), on the database's clock. `fence` grows at every
-- taking: a writer checks it, and the lease's expiry, in the transactions that log and confirm its operation.
CREATE TABLE studio_lease (
  id INTEGER PRIMARY KEY,
  holder TEXT NOT NULL,
  fence BIGINT NOT NULL,
  until_ms BIGINT NOT NULL
);
