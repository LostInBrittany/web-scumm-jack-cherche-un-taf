-- The spans' leases (4.2.1, plan P2): who may write a span, until when, on the database's clock. A row stays once a
-- span was claimed, so its `fence` only ever grows: every new holder gets a greater one. A released lease has
-- `until_ms` = 0. The span `*` is the project's exclusive lease.
CREATE TABLE studio_spans (
  span TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  fence BIGINT NOT NULL,
  until_ms BIGINT NOT NULL
);
