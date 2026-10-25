# Reality Bridge: threat model (4.1.1)

What can go wrong between the world outside and a game's state, and what answers it. From
`docs/dev/PLAN-4.1-REALITY-BRIDGE.md` §9; each answer names where it is implemented and tested.

**Assets.** The game's state and saves (integrity); the player's pseudonymous link (`playerId`) and capability; the
Bridge's root Biscuit key and its event-signing key; the connectors' Biscuits; the journal.

**Trust boundaries.** (1) the world → a connector (a webhook, later email, SSH…): untrusted; (2) a connector → the
Bridge: authorised by a Biscuit; (3) the Bridge → the player: signed events over TLS; (4) the player's engine:
applies only verified, declared, finite signals.

| Threat | Answer | Where |
|---|---|---|
| A compromised connector | Its Biscuit is attenuated to one game, player family, source, signal list, audience and expiry; the Bridge checks the Datalog policy before anything else | `bridge/policy/`, `tests/bridge.test.ts` |
| A stolen bearer token | Short expiry (a capability: 30 days from its last acknowledgement, 180 at most), revocation by id, the player's own `POST /v1/unlink`, rotation, TLS; the player's capability can only read and acknowledge; the operator's token compared in constant time | `bridge/src/`, `wiki/en/bridge.install-run.md` |
| A modified signal | The Ed25519 signature covers the exact bytes; the player verifies before decoding | `src/engine/reality/protocol.ts`, the conformance corpus |
| A replay over the network | `id`, `sequence`, `dedupeKey`; the engine's `applied` set: an id seen is a no-op | `core/` `receive`, the crash tests |
| An event for another player | `gameId` + `playerId` checked by the policy on the Bridge and by the player on every event | policy tests, protocol tests |
| An old manifest | The manifest's hash is in the Bridge's configuration; an unknown signal is refused | `bridge/src/`, manifest tests |
| Flooding | Quotas per source and player, bounded payload, queue and event streams (4 per player, 64 KB unsent), timeouts; per address, 60 anonymous requests and 60 failed authentications a minute; pairing codes in memory only, 1000 at most; overflow is visible, never dropped silently | `bridge/src/`, `tests/bridge.test.ts` |
| Two connectors at once (a shared sequence, a `dedupeKey` accepted twice, a proposal landing after a revocation) | One proposal at a time per player: deduplication, quotas, sequence, signature and the journal line under a lock, the player and the token checked again inside it; a pairing code confirmed once | `bridge/src/lock.ts`, `tests/bridge.test.ts` (100 concurrent proposals) |
| A save under another link (imported from elsewhere, or from before an unlink): its cursor acknowledged for a player that never applied those signals | The first signal binds the save to its player (`reality.playerId`); the client acknowledges and applies nothing for another player (`mismatch`), the pause menu relinks on request with the cursor at 0 | `src/engine/core/reality-runtime.ts`, `src/engine/reality/client.ts`, `tests/reality-engine.test.ts` |
| A leak through a session or a save | Sessions and saves hold ids, sequences and the signal's name; never a token, an email, a credential or a raw payload | session tests, `tests/reality-engine.test.ts` |
| A script injected in the game (XSS) | The capability in the browser is minimal and revocable; no emission or administration right reaches the browser | `wiki/en/bridge.install-run.md` |
| The Bridge down | The journal is durable, delivery resumes from the cursor, the game declares a fallback for a required signal | proof (`closed`, `scenario`), e2e |
| A compromised key | `kid` on every event, a keyring with windows (five minutes of clock tolerance), rotation: the Bridge signs what waits again under its current key, a player with an older keyring asks once; revocation documented, a retention horizon | protocol tests, `tests/bridge.test.ts` (rotation), ops guide |
| Hostile text from outside | The engine receives an identifier from a finite, declared alphabet; nothing from the payload reaches a condition, a line or HTML | content types, validator |
| The Bridge's host read (its configuration, its journal) | `config.json` holds no Biscuit root private half (`root.key`, for `grant` only, can live elsewhere); the journal holds hashes of capabilities, never tokens. The event-signing key does live on the Bridge: a compromised host can sign, so no key pin in the game would add to TLS's naming of the host; a compromise is answered by rotation and by granting every connector a new token | `bridge/src/cli.ts`, `wiki/en/bridge.install-run.md` |

**Several instances and several tenants (4.1.10)** have their own analysis: `docs/dev/threat-models/constellation.md`
(cross-tenant replay, `SignalV2`, keys per tenant, the shared store, the fan-out).

**Out of scope for 4.1.1.** Verifying a credential's content (Open Badges), real email and SSH connectors, a hosted
multi-tenant Bridge. Biscuit says who may submit a verdict, never whether the verdict is true: a connector stays
responsible for checking what it claims.
