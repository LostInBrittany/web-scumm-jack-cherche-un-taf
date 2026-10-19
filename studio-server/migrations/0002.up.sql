-- The Studio Server's service lease (4.2.1, plan §4 and P8): one instance serves the writes of a project. Taken and
-- renewed on the database's clock; `fence` grows at every taking. `/readyz` says whether this instance holds it.
CREATE TABLE studio_service (
  id INTEGER PRIMARY KEY,
  instance TEXT NOT NULL,
  fence BIGINT NOT NULL,
  until_ms BIGINT NOT NULL
);
-- The answer a write request got, by the operation id its client sent (`x-studio-op`): a retry gets it again.
CREATE TABLE studio_requests (
  op_id TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  at BIGINT NOT NULL
);
