# Bridge and connector troubleshooting

What a Reality Bridge's error codes mean, and what to do about them. The Bridge is the server that carries signals
from the real world (an email, a badge, a terminal) to a player's game; its connectors send those signals. This page
covers the Bridge's own answers, not the hosted Studio's, which has codes of the same numbers.

<a name="conflict-409"></a>

## The Bridge answers 409

A Bridge's 409 means "this was already done", never "your copy is stale":

- `{"error": "pairing", "message": "already confirmed"}` on `POST /v1/pairings/<code>/confirm`: the pairing code was
  confirmed already, by this connector or another one. Two connectors confirming one code at once: one wins, the other
  gets this 409. The player is paired; nothing to redo.
- `{"error": "duplicate", …"this run was submitted already (the first submitter keeps it)"}` on `POST /v1/runs`: the
  same speedrun run was sent twice, and the second is refused as it would join the queue. The first submission keeps
  its place in the queue; it is ranked only once the speedrun worker finds it valid.
- `{"error": "trust", …"only a run the worker found valid can be moderated"}`: a moderator tried to verify a run the
  speedrun worker did not find valid.

None of them loses data: the first action stands. To check it, read the Bridge's log (JSON lines on its standard
output): `"event":"pairing.confirmed"` with the `playerId` for the pairing, `"event":"run.submitted"` (then
`run.verified`) for the run. The Bridge has no operator route that reads a pairing's state. Never call
`GET /v1/pairings/<code>` to check one: that is the player's one-time claim, and calling it hands out, and uses up, the
player's capability.

<a name="unavailable-503"></a>

## The Bridge answers 503

- `{"error": "busy", "message": "the store is busy: try again in a second"}`, with `Retry-After: 1`: another process
  held the store's write lock longer than the request could wait (SQLite). Nothing was written; send it again.
- `GET /readyz` answers 503 `{"status": "unavailable"}`: the store does not answer. Look at the database first.
- From 4.1.20, a Bridge whose maintenance lease is lost (not renewed, or the database connection that holds its lock
  dropped) holds its writes, which answer 503, and fails `/readyz` until it takes a lease again (its log line `maintenance.lease.lost` says why).

<a name="same-event-twice"></a>

## The same event arrived twice

A connector may send the same signal twice (a retry after a timeout, a restart). The Bridge accepts it once: `POST
/v1/signals` answers 202 the first time, and 200 with `duplicate` for a `dedupeKey` it already accepted. The player's
save keeps the sequence of signals it applied, so a signal is never applied twice in the game.

<a name="connector-down"></a>

## A connector is down

- The game plays on: a player offline, or without a signal, keeps playing; what arrives later is applied when it
  arrives.
- A connector started with a `health` port answers `GET /health` with 200 when it is well, 503 otherwise, with a
  `detail`; `GET /metrics` on the same port gives its counters.
- An email connector leaves a message unseen when the Bridge refused it for a reason that may pass (the Bridge away
  or busy, a quota): it is read again at the next poll. A message refused for good is marked seen and flagged, for you
  to look at. Over a quota the Bridge answers 429: the connector sees it, nothing is dropped in silence.
