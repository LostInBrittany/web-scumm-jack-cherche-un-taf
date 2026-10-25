# The Reality Bridge: what it is

A quest'n'click game can react to a fact from the world outside: an email answered, a webhook called, a badge shown,
a command typed in a terminal. The game itself never touches the network. A separate service, the **Reality Bridge**,
turns the fact into a short signed **signal**, and the game applies it like a player's input: once, saved, and
replayable offline. This page says what the pieces are and why they are cut this way. To try it, read
[Quick start](bridge.quick-start.md); to run one, [Install and run the Bridge](bridge.install-run.md).

<a name="overview"></a>

## What it is

Three hands carry a fact to the player, each one checking the one before:

| Piece | Runs where | Does | Holds |
|---|---|---|---|
| A **connector** (email, Telnet, SSH, Open Badges, or the Bridge's demonstration webhook) | its own process, beside the Bridge | reads the outside input as hostile, binds it to a player, proposes a declared signal with a deduplication key | its own Biscuit token, its own secrets (a mailbox password, a host key) |
| The **Bridge** (`bridge/src/`, the package `@quest-n-click/bridge`) | a small Node service | authorises the connector (Biscuit), checks the signal against the game's manifest, deduplicates, numbers it per player, signs it (Ed25519), keeps it until the player acknowledges | the event-signing key, the hashes of the players' capabilities, the signals |
| The **player** (the game in the browser) | the player's device | verifies the signature before reading anything, applies the signal as an event, saves, then acknowledges | a capability that reads and acknowledges its own signals, nothing else |

A signal is only an identifier from a finite list the game declares (`mail.answer.correct`): no text, address or
payload from outside reaches the game. It arrives as the game's event of the same name. The engine applies it at most
once, as an entry of the session, saved before it is acknowledged (`src/engine/reality/protocol.ts` verifies,
`WorldSignalPort` is the transport, and a game without `reality` loads none of this code).

The Bridge exists since 4.1.1, the four connectors since 4.1.9, several instances and several tenants on one store
since 4.1.10. Its `local` profile (SQLite) is **stable**; its `distributed` profile (Postgres, several instances) and
the connectors are **experimental** ([Stability and support](start.stability.md)).

<a name="why"></a>

## Why

- **The game stays a game.** A game is a static page and a PWA: no socket, no secret, nothing that executes what
  comes from outside. Everything that talks to strangers lives in processes the game never loads; the game's build
  holds nothing of `connectors/` (checked by `tools/dist.ts`).
- **A proof that does not need the world.** Because a signal is a finite identifier applied like an input, the solver
  can prove a game in a world that never answers, in the worlds the author scripts, and in a hostile one, without
  contacting any service ([Guarantees](bridge.guarantees.md#proof)).
- **One question, one mechanism.** Biscuit answers "who may propose what" on the Bridge; a signature answers "what did
  the Bridge accept" in the player's hands. A token stolen at one step does not open the next ([Security: Biscuit and signatures](bridge.security.md)).
- **Real networks repeat and drop.** Delivery is at least once and applied once: every hop may retry with the same
  key, and the save remembers what was applied ([Guarantees](bridge.guarantees.md#duplicates)).

<a name="alternatives"></a>

## Alternatives set aside

- **The game calling services itself.** Set aside: it would put sockets, secrets and untrusted text in the player,
  and make a proof depend on the network.
- **COSE instead of a compact JWS** for the signed signal: it needs a CBOR decoder in the player for nothing a JWS
  lacks here. It stays the fallback if a supported browser drops Ed25519 (D15, `docs/dev/reality-spike.md`).
- **Biscuit in the player.** The player never sees a Biscuit: it holds a narrow read-and-acknowledge capability (D16).
- **"Exactly once" delivery.** Not promised anywhere: delivery is at least once, applied idempotently, one logical
  effect per key (ADR 0008).
- **Per-tenant keys derived by construction**, which would make a signal's tenant implicit. Set aside: the player
  cannot check a derivation whose root it does not hold. A signal names its context instead (ADR 0010).

<a name="trade-offs"></a>

## Trade-offs

- Two formats to keep (Biscuit and the JWS), a Rust cross-check of Biscuit in CI (`npm run reality:xcheck`), keys to
  rotate.
- An author declares every signal, and a `required` one names a fallback the player can use instead: more to write,
  and the game must be finishable with no outside at all.
- An operator runs one more service (and one process per connector), with its store, its keys and its backups.

> [!LIMIT id=bridge-not-a-game-server]
> The Bridge carries declared signals from outside to one player's game. It runs no game logic, holds no save, and
> does not share a game's state between players.

> [!LIMIT id=bridge-experimental-parts]
> The connectors and the `distributed` profile are experimental: every contract and abuse test runs in CI, but no
> person has yet run a connector against a real email provider, a real badge or a terminal exposed on a network, nor
> the `distributed` profile behind a real domain for 24 to 48 hours.

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md): Biscuit authorises a connector; a signature attests
  an event.
- [ADR 0008](../../docs/dev/adr/0008-connector-sdk.md): a connector is a process of its own, behind one small SDK.
- [ADR 0009](../../docs/dev/adr/0009-reality-store.md): the Bridge keeps its state behind an asynchronous store.
- [ADR 0010](../../docs/dev/adr/0010-signal-v2.md): a signed signal names the context it was signed for.
- The spike's measures behind D15 and D16: [`docs/dev/reality-spike.md`](../../docs/dev/reality-spike.md); the threat
  models: [`docs/dev/THREAT-MODEL.md`](../../docs/dev/THREAT-MODEL.md) and
  [`docs/dev/threat-models/`](../../docs/dev/threat-models/README.md).
