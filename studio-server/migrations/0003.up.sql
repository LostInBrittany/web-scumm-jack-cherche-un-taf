-- Identity, membership and sessions (4.2.1, plan §3, ADR 0027). OIDC gives the identity only (iss, sub, a verified
-- email); the rights live here (D41-2). Secrets are never stored in clear: session ids and invitation tokens by their
-- sha256, refresh tokens encrypted (AES-256-GCM, the key a server secret).
CREATE TABLE studio_users (
  id TEXT PRIMARY KEY,
  iss TEXT NOT NULL,
  sub TEXT NOT NULL,
  email TEXT,
  email_verified INTEGER NOT NULL,
  name TEXT,
  created_at BIGINT NOT NULL,
  -- A token issued before this instant (ms) is refused: a removal, a revocation, a back-channel logout by `sub`.
  revoked_before BIGINT NOT NULL
);
CREATE UNIQUE INDEX studio_users_identity ON studio_users (iss, sub);
-- One role per member of the instance's project: owner, dev, reviewer.
CREATE TABLE studio_members (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  added_at BIGINT NOT NULL
);
CREATE TABLE studio_invitations (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_by TEXT
);
CREATE TABLE studio_sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  -- The provider's session id (`sid`), for back-channel logout.
  sid TEXT,
  created_at BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  refresh_enc TEXT,
  -- The id_token, encrypted: the hint of an RP-initiated logout.
  id_token_enc TEXT,
  -- The last time the provider confirmed this session (a refresh that worked), and whether it is suspended.
  checked_at BIGINT NOT NULL,
  suspended INTEGER NOT NULL
);
CREATE INDEX studio_sessions_user ON studio_sessions (user_id);
CREATE INDEX studio_sessions_sid ON studio_sessions (sid);
-- A login in progress: state, nonce and PKCE verifier, used once, for 10 minutes.
CREATE TABLE studio_preauth (
  id_hash TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  -- An invitation the login carries (its token), consumed after the provider answered.
  invite TEXT,
  expires_at BIGINT NOT NULL
);
-- Logout tokens already seen (a replay is refused until their expiry).
CREATE TABLE studio_seen_jti (
  jti TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL
);
-- Append-only: who did what to access and to the project's organisation.
CREATE TABLE studio_audit (
  id TEXT PRIMARY KEY,
  at BIGINT NOT NULL,
  actor TEXT,
  event TEXT NOT NULL,
  detail TEXT NOT NULL
);
CREATE INDEX studio_audit_at ON studio_audit (at);
-- A stored answer belongs to its author (the user id; '' without authentication): another member who knows an
-- operation id never gets its answer. The table is a 7-day replay cache, so it starts empty again.
DROP TABLE studio_requests;
CREATE TABLE studio_requests (
  author TEXT NOT NULL,
  op_id TEXT NOT NULL,
  status INTEGER NOT NULL,
  body TEXT NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (author, op_id)
);
