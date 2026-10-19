DROP TABLE studio_requests;
CREATE TABLE studio_requests (
  op_id TEXT PRIMARY KEY,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  at BIGINT NOT NULL
);
DROP INDEX studio_audit_at;
DROP TABLE studio_audit;
DROP TABLE studio_seen_jti;
DROP TABLE studio_preauth;
DROP INDEX studio_sessions_sid;
DROP INDEX studio_sessions_user;
DROP TABLE studio_sessions;
DROP TABLE studio_invitations;
DROP TABLE studio_members;
DROP INDEX studio_users_identity;
DROP TABLE studio_users;
