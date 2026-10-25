# Guarantees

What the Reality Bridge and the player promise about a signal: a duplicate, the order, a delivery repeated or replayed,
a Bridge that is away or busy, two tenants side by side, and what a signal does to a game's progress and to its proof.
Each answer is read from the current code and, where a test shows it, tied to that test. Each says where it stops.

<a name="at-a-glance"></a>

## At a glance

| Question | Answer | Where it stops |
|---|---|---|
| A connector sends the same signal twice | Accepted once: 202 the first time, 200 with `"duplicate": true` after | The key is remembered as long as the store holds the signal |
| In what order does a player get signals? | Numbered 1, 2, 3… per player, in the order the Bridge accepted them, applied in that order | No order between players, and the time something happened outside does not reorder |
| The answer was lost, the page crashed | Delivered again from the last acknowledged sequence, recognised, applied once | Delivery is at least once, never "exactly once" |
| The Bridge is busy or away | 503 `busy` with `Retry-After: 1` (nothing written), 429 over a quota; the game plays on | The connector must send again; the Bridge does not queue for it |
| Two tenants on one deployment | Each request resolved to one tenant before anything is read; tokens and signals of one are refused by the other | No row-level security in Postgres; one process holds every tenant's keys |
| Can the outside block the game? | No: a `required` signal has a fallback, and the game is proved closed, per scenario and adversarially | The proof covers the declared signals, not the connectors' behaviour |

<a name="duplicates"></a>

## Duplicates

A connector gives each fact a deduplication key (`dedupeKey`): the email connector `sha256('email:' + Message-ID)`,
Telnet `sha256('telnet:' + session + ':' + line)`, the demonstration webhook `<source>:<id>`. On `POST /v1/signals`
the Bridge answers **202** the first time a key is seen for a player, and **200** with the stored signal and
`"duplicate": true` for a key it already accepted: the same `id`, the same `sequence`, nothing written.

The lookup, the sequence and the write are one step. In one process, proposals for a player are taken one at a time
(a lock per player); across processes, one database transaction does it, backed by unique constraints on
`(tenant, player, dedupe_key)` and `(tenant, player, sequence)` (`bridge/migrations/0001.up.sql`). Two connectors, or
two instances, proposing the same key at the same instant: one acceptance.

> [!GUARANTEE id=bridge-duplicate-200]
> A signal proposed again with a `dedupeKey` the Bridge already accepted for that player is answered 200, with the
> first signal's sequence and `"duplicate": true`; the player receives it once.

> [!GUARANTEE id=bridge-dedupe-concurrent]
> Fifty proposals of one key at once give one acceptance and one id; a hundred distinct keys at once give the
> sequences 1 to 100, none shared.

> [!LIMIT id=bridge-dedupe-retention]
> The Bridge recognises a key while it holds the signal. On the JSON-lines journal, `compact` drops acknowledged
> signals older than its retention (90 days by default; a player's last signal always stays): a key sent again after
> that is a new signal. A SQL store keeps every signal (it has no retention yet). The key is per player: the same key
> for two players makes two signals.

<a name="ordering"></a>

## Order

Each player has its own sequence, contiguous from 1, drawn when the Bridge accepts a signal. The player reads signals
by sequence (a stream or a fetch by cursor, both say each signal's sequence) and the engine applies them in that order:
a signal that arrives ahead of a gap waits until the gap is filled, then the cursor moves over the contiguous run.

- The order is the Bridge's order of acceptance. A connector's `occurredAt` travels in the signal for information; it
  never reorders anything.
- There is no order between two players, nor between two tenants.
- With several instances, a signal accepted by one reaches a stream another holds, in order, once each.

> [!GUARANTEE id=bridge-sequences-contiguous]
> Whatever the interleaving of concurrent proposals and their repeats, a player's sequences are 1..n with no gap and
> no duplicate, and a `dedupeKey` is accepted once.

<a name="replay"></a>

## Delivery, acknowledgement and replay

Delivery is **at least once, applied once**. The player's transport keeps three cursors: *received* (the last sequence
the Bridge sent), *delivered* (the last handed to the game) and *durable* (the last acknowledged, after the save). The
client verifies a signal, hands it to the engine, waits for the save to be durable, and only then sends
`POST /v1/ack { through }`. Every request to the Bridge, a poll or a reconnection, asks from the durable cursor: a
signal handed over and not acknowledged (a refusal that may pass later, a save that failed, a crash before the
acknowledgement) is delivered again, with a wait that grows up to a minute while nothing settles. Before 4.1.8 the
transport asked from the delivered cursor.

The save keeps the last sequence received without a gap and the ids applied above it (`GameState.reality`, at most
1 024 above the cursor), so a signal delivered again is recognised and not applied twice. A signal is also an entry
of the session, `{ external: { id, sequence, signal, source, receivedAt, playerId } }`: `npm run replay` applies it
offline, with no Bridge.

> [!GUARANTEE id=bridge-ack-after-durable-save]
> The client acknowledges a signal only after the save that holds it is durable, and only through the contiguous
> cursor.

> [!GUARANTEE id=bridge-resume-from-durable]
> In polling, a signal handed to the game and not acknowledged is asked for again from the acknowledged cursor.

> [!GUARANTEE id=bridge-session-replays-offline]
> A session with signals replays offline, with no Bridge, to the same state.

<a name="unavailability"></a>

## When the Bridge is busy or away

| What happens | What the Bridge answers | What to do |
|---|---|---|
| Another process holds SQLite's write lock longer than 5 s | 503 `{"error": "busy"}`, `Retry-After: 1`; nothing written | Send it again (the connectors do, with the same key) |
| The store does not answer | `/readyz` and `/healthz` 503 `{"status": "unavailable"}`; `/livez` still 200 | Look at the database |
| A `serve` lost its maintenance lease (4.1.20) | Its writes answer 503 and `/readyz` fails until it takes a lease again | Read its `maintenance.lease.lost` log line |
| Over a connector's quota (120 a minute) or a player's backlog (1 000 unacknowledged) | 429 `quota` or `pending` | The connector sees it; nothing is dropped in silence |
| An address over 60 requests a minute on the routes anyone may call, or 60 failed authentications | 429 `rate`, `Retry-After: 60` | Wait |

A connector sends a proposal whose answer was lost again with the same key: three tries in all by default, then a
refusal it counts (`timeout`, `unreachable`). The email connector leaves a message unseen when the Bridge refused it
for a reason that may pass, and reads it again at the next poll. On the player's side, a game offline or without a
signal plays on, and what arrives later is applied when it arrives. An instance killed or crashed loses nothing: a
transaction is committed or not there (`tests/bridge-fanout.test.ts` kills one instance of three during 1 000
proposals).

> [!GUARANTEE id=bridge-busy-503]
> A SQLite store busy longer than its wait answers 503 with `Retry-After: 1` within two seconds. Once the lock is
> free, the next proposal is accepted with sequence 1.

> [!LIMIT id=bridge-no-queue-for-connectors]
> The Bridge does not hold a refused proposal for later: a 503 or a 429 is the connector's to send again. A
> connector's quota is counted per instance: with N instances, a connector may propose N times its quota.

<a name="tenant-isolation"></a>

## Tenant isolation

A tenant is one operator's game in one environment, with its own Biscuit root, event key, operator token, quotas and
revocations ([Several tenants](bridge.multi-tenant.md)). On a server holding several:

- A request is resolved to its tenant by its `Host` (each tenant's `hosts`), or by `X-Web-Scumm-Tenant` when
  `--tenant-header` allows it, **before anything is read**; no tenant matches, a 404 `tenant`.
- Every row of the store carries its tenant, and every query filters on it.
- A connector's token is bound to its tenant (`grant` adds it), so a token of tenant A is refused by tenant B even
  when both were (wrongly) given one Biscuit root.
- A tenant of a shared deployment signs `WorldSignalV2`, which names its tenant: a signal of A presented to a player
  of B is refused `audience-mismatch`, even under one shared event key.

> [!GUARANTEE id=bridge-tenant-token-bound]
> A connector token bound to its tenant is refused by another tenant (403), even when both tenants share one Biscuit
> root.

> [!GUARANTEE id=bridge-tenant-routing]
> One server holding several tenants routes each request by `Host`, by the tenant header only when allowed, and
> answers 404 to a request that names no tenant it holds.

> [!LIMIT id=bridge-tenant-isolation-scope]
> The isolation is in the Bridge's code, not in the database: there is no row-level security per tenant in
> Postgres, and a process serving several tenants holds every one's private keys (an instance compromised is every
> tenant's compromise: [Security](bridge.security.md#procedures)).

<a name="session-and-save"></a>

## Effect on the game's progress

A signal reaches the game as the event of the same name, like a player's input:

- **`once`** (the default, `true`): its effect runs once per game, however many times it arrives. With `once: false`,
  each distinct signal from the Bridge runs it again; a repeated delivery of the same one never does.
- A signal that arrives while the game is busy (a dialogue, a cutscene, a minigame) waits for it.
- The first signal binds the save to its pseudonymous player (`GameState.reality.playerId`, the `p-…` the Bridge gave
  at pairing; never the capability). A save that reaches a device linked as someone else (imported from another
  device, or saved before an unlink and a new pairing) is a **mismatch**: nothing of it is applied or acknowledged,
  the game plays on, and the pause menu's World link offers to use this device's link with that save; its link state
  then starts over for this player (cursor 0), and the signals whose effect the save already has are not applied
  again. A delivery without a player binds nothing (4.4.0).
- The save and the session hold the player id, the cursor and the ids applied: never a token, an email, a message
  or a payload.

> [!GUARANTEE id=bridge-applied-once]
> The engine applies a declared signal once, records it in the session, and saves it with the state.

> [!GUARANTEE id=bridge-save-bound-to-player]
> The first delivery binds the save to its player; a delivery for another player is a mismatch and changes nothing.

<a name="proof"></a>

## Effect on the proof

A proof never assumes the outside cooperates. `npm run solve:reality` (part of `npm run prove:game` and of
`quest-n-click release`) proves the game in three kinds of world:

1. **closed**: no signal at all; the game must be finishable through its fallbacks;
2. **each scenario** of `games/<id>/reality/scenarios/*.json` (`{ "signals": ["mail.answer.wrong",
   "mail.answer.correct"] }`), then each replay the connectors recorded (`games/<id>/replays/*.json`): those signals in
   that order, each able to arrive at any point after the one before; when the game has `required` signals, at least
   one scenario sends every one of them;
3. **adversarial**: any declared signal, at any point, again and again.

Each must be solved with no softlock and never truncated. The solver hands the engine the signal itself: no service
is contacted. In the Studio's MCP, `solve` takes `reality` to try one world. `npm run validate` checks that a
required signal's `fallback` names a rule; the content lint (`npm run lint`, in `verify:game`) checks that the closed
witness plays it, and warns `fallback-unplayed` when the game finishes without the outside by another route (the
fallback is declared on a rule nobody needs: declare the action the witness plays, or make the declared one the way
through). How to read a solver's result in general: [What the solver proves](create.solver-proofs.md).

> [!GUARANTEE id=bridge-proof-closed]
> In the closed world the solver finishes the game through the fallback, never through a signal.

> [!GUARANTEE id=bridge-proof-adversarial]
> In the adversarial world, duplicates and every order of the declared signals never lose the game.

A speedrun's category says what it accepts from outside: `forbidden` (a signal in the run is `reality-forbidden`),
`recorded` (each signal applied is kept with its signed JWS, its key id and its hash, and the verifier checks the
signature with the Bridge's public keys, `--keys` or `GET /v1/keys`; no proof is `missing-reality-proof`) or `live`
(the same proof, in a category of its own, since a live signal's latency and availability cannot be reproduced;
without the keys the verifier cannot conclude, `no-keyring`). Details: [Speedrun for authors](create.speedrun.md).

> [!GUARANTEE id=bridge-speedrun-reality-proof]
> A run whose Reality proof is missing gets the code `signal-missing`, an altered one `signal-signature`, and one
> signed by another key the verdict `missing-reality-proof`. Without a keyring the verdict is `inconclusive`
> (`no-keyring`).

> [!LIMIT id=bridge-proof-scope]
> The proof covers the signals the game declares, in any order and number. It says nothing of whether a connector
> will ever send one, nor of what a connector does with its input.

<a name="what-the-bridge-holds"></a>

## What the Bridge holds about a player

Per player: the `playerId`, the SHA-256 of its capability, its expiry, the session id, the origin it paired from.
Per signal: its id, sequence, name, source, the connector's deduplication key, the hash of what the connector saw
(`evidenceHash`), the times, the signed envelope and, since 4.1.2, the payload as accepted (to sign it again after a
rotation): never a token, an email, a message or a badge. Pairing codes wait ten minutes: in memory on the journal (a
restart forgets them), in the `pairings` table of a SQL store. The log (standard output) names events and pseudonymous
ids, never a secret. Retention, export and deletion:
[Install and run the Bridge](bridge.install-run.md#retention); everything a game, a Bridge and its connectors keep about a player:
[Privacy](play.privacy.md).

<a name="limits"></a>

## What is not guaranteed

- **"Exactly once"**: never promised. Every hop may repeat; the guarantees above make a repeat harmless.
- **The connectors and the `distributed` profile are experimental**: no person has yet run a connector against a real
  email provider, a real badge or a terminal exposed on a network, nor the `distributed` profile behind a real domain
  for 24 to 48 hours ([Stability and support](start.stability.md)).
- **No row-level security per tenant in Postgres**, no retention on a SQL store, no connector quota shared between
  instances.
- The reference Bridge is for a game, a developer, an event or a small studio's games; the protocol is what stays.
