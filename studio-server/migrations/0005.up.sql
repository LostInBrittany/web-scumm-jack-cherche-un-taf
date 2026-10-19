-- The game's origin (4.2.1, plan §6.1, policy F). A ticket: issued on the Studio's origin to a member's session, used
-- once within 60 s on the game's origin. A game session: what the ticket became, tied to the Studio session that
-- asked for it (it never outlives it), 15 min sliding. Only hashes of tickets and sessions are kept.
CREATE TABLE studio_play_tickets (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE TABLE studio_play_sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  last_seen BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX studio_play_sessions_session ON studio_play_sessions (session_hash);
