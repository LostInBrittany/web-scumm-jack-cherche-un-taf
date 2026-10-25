# Connectors overview

A connector turns something that happens outside the game (an email arrives, a command is typed on a terminal, a
badge is shown) into one of the signals the game declares, and proposes it to the Reality Bridge. Four ship since
4.1.9, in the package `@quest-n-click/connectors`: **email**, **Telnet**, **SSH** and **Open Badges**. This page says
how they are built and run; each has its own page.

<a name="overview"></a>

## What a connector is

- **A process of its own**, never in the game: the game's build holds nothing of `connectors/` (checked by
  `tools/dist.ts`), the game declares only data, and a game runs without any connector.
- **Hostile input in, a declared signal out.** What a connector reads is treated as hostile; each one has its threat
  model in [`docs/dev/threat-models/`](../../docs/dev/threat-models/README.md).
- **Experimental** (D19): every contract and abuse test runs in CI, but no person has yet run one against a real
  email provider, a real badge or a terminal exposed on a network ([Stability and support](start.stability.md)).

| Connector | Reads | Binds the player by | Its page |
|---|---|---|---|
| `email` | a message posted by a provider's signed webhook, or polled over IMAP | a recipient tag `+p-…`, or the sender who sent a pairing code | [Email](bridge.connector-email.md) |
| `telnet` | lines typed on a TCP terminal | the pairing code typed, or a resume word | [Telnet](bridge.connector-telnet.md) |
| `ssh` | lines typed in an SSH terminal | a pairing code or resume word as password, or a declared public key | [SSH](bridge.connector-ssh.md) |
| `open-badge` | a badge posted to its form | the pairing code posted with it | [Open Badges](bridge.connector-open-badges.md) |

<a name="run-one"></a>

## Run one

Each connector needs its own token from the Bridge, then its configuration file:

```sh
# in the engine repository (the Bridge's folder is .cache/bridge)
npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
npm run connector -- telnet --config telnet.json
```

```sh
# on a server, with the package @quest-n-click/connectors installed
npx quest-n-click-connector telnet --config telnet.json
```

The command is `quest-n-click-connector <email|telnet|ssh|open-badge> --config <file.json>`. Install the package
without native code: `npm install --omit=optional --ignore-scripts @quest-n-click/connectors`. The configuration names
the Bridge and the file of the connector's token (never the token on the command line), the game, its limits, an
optional health port, and a section named after the connector:

```json
{
  "bridge": { "url": "http://127.0.0.1:8787/", "tokenFile": "telnet.token" },
  "gameId": "signals",
  "limits": { "maxBytes": 4096, "maxPerMinute": 60, "timeoutMs": 5000 },
  "health": { "port": 9301 },
  "telnet": { "port": 2323 }
}
```

- `tokenFile` and the other paths are relative to the configuration's folder. The game's Reality manifest comes from
  the Bridge (`GET /v1/manifest`), or from `"manifestFile"`; a manifest of another game than `gameId` stops it.
- `limits` (all optional): `maxBytes` (a payload as canonical JSON, and the largest input read at once; 4 096),
  `maxPerMinute` (proposals per minute, all players together; 60), `timeoutMs` (one call to the Bridge; 5 000).
- With `health`, `GET /health` (200 when healthy, 503 otherwise, with a `detail`) and `GET /metrics` (counts of
  proposals, accepted, duplicates, refusals by code, inputs rejected, retries) answer on `127.0.0.1` (or
  `health.host`).
- SIGTERM or Ctrl-C stops it: no new input, work in flight drained for at most five seconds, exit 0. Without
  arguments it prints its usage and exits 2; an unknown connector, exit 2.
- Secrets come from files (`secretFile`, `passwordFile`, `tokenFile`, `hostKeyFile`). An inline `secret`, `password`
  or `token` is a development shortcut and must be a string, or the connector refuses to start.

A token minted with `--pair` may confirm the pairing codes players give; grant each connector only the signals it
proposes. A connector checks what it claims (a credential's proof, an email's sender): Biscuit only says who may
propose. On the Bridge, a connector uses three routes:

- `POST /v1/signals` (Bearer token) `{ playerId, signal, source, dedupeKey, occurredAt?, evidenceHash? }`: 202
  accepted, 200 already accepted (the same `dedupeKey`), 401 a bad or revoked token, 403 not allowed, 404 an unknown
  or revoked player, 422 not in the manifest (or another source), 429 over a quota.
- `POST /v1/pairings/<code>/confirm` (Bearer token with `--pair`): links the player who shows that code; 409 when it
  was confirmed already.
- `POST /v1/hooks/<source>` with `X-Web-Scumm-Signature: sha256=<HMAC of the body>` and `{ playerId, event, id }`: the
  Bridge's demonstration webhook; `event` must be one it knows, `id` names the delivery (deduplication).

<a name="permissions"></a>

## Declare what the connectors may do

The game says, as data, what each connector may turn into a signal: `reality.connectors`, checked by
`npm run validate`. Every signal named there is one of `reality.signals`; no pattern, script or path of the author's
reaches a connector.

```ts
reality: {
  signals: [
    { id: 'letter.door', source: 'email', availability: 'optional', replay: 'record' },
    { id: 'terminal.lamp', source: 'terminal', availability: 'optional', replay: 'record' },
  ],
  connectors: {
    email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' },
    telnet: { prompt: 'shed> ', commands: [{ says: 'lamp on', reply: 'Click.', signal: 'terminal.lamp' }] },
    ssh: { commands: [/* the same */], files: { '/notes/lamp.txt': 'The lamp obeys two words.' } },
    'open-badge': { issuers: ['https://badges.example.org/issuer'], valid: 'badge.valid', revoked: 'badge.refused' },
  },
}
```

Every field and its constraints: [Signals and the manifest](bridge.signals-manifest.md#reality-connectors). Two
authorisations stack: the game's declaration (which signals a connector's input may become) and the connector's
token (which signals, sources and players the Bridge accepts from it): [Security](bridge.security.md#biscuit).

A player links a connector to their game the way they link any connector: the pause menu's World link shows a code,
and the player types it at the terminal's prompt, sends it as an email's subject (`PAIR ABCD2345`), or posts it with
a badge. The connector confirms it with the Bridge; the game is then linked.

<a name="what-leaves"></a>

## What leaves a connector

- The Bridge receives the signal's name, the player, the source, the deduplication key, the time, and the SHA-256 of
  the connector's payload (`evidenceHash`): never the payload, the message, the line or the badge.
- Delivery is at least once and applied once: a proposal whose answer was lost is sent again with the same key (two
  more tries by default) and the Bridge answers `duplicate`. A refusal is never retried.
- The log holds events, identifiers and counts. A string that looks like content (a space, an `@`, a slash) is
  written `[redacted]`; the tests check that no fixture's address, text or secret reaches a log.
- What each connector keeps, and for how long: its own page, and [Privacy](play.privacy.md#connectors).

<a name="why"></a>

## Why

A connector reads input written by strangers and holds a secret (a mailbox password, a host key). Neither may reach
the game, a PWA with no socket, no secret and no executable content, nor its DSL. One process per connector keeps a
fault or a compromise in one place, and one small SDK makes every connector behave the same towards the Bridge: the
same limits, the same retry with the same key, the same redacting log, the same health and stop.

<a name="alternatives"></a>

## Alternatives set aside

- **The usual IMAP client** (`imapflow`), with eight runtime packages: the connector needs seven commands, so
  `connectors/src/email/imap.ts` is a bounded client of its own, tested against a scripted server.
- **A general MIME parser**: the message is read by `connectors/src/email/mime.ts` in a worker thread with a small
  heap and a time budget.
- **Native SSH code**: `ssh2` (MIT, pure JavaScript) is kept, its optional native parts (`cpu-features`, `nan`) mapped
  to a stub that refuses them.
- **Patterns or scripts from the author**: never; the game declares words, commands, paths and issuers as data.

<a name="trade-offs"></a>

## Trade-offs

- One more process per connector to run, supervise and secure, each with its token to renew (30 days by default).
- What a connector saw stays in it: an operator who needs the original (an email, a badge) keeps it on the source
  side (the mailbox), not on the Bridge.
- A connector added to the project is code in `connectors/src/`: [The connector SDK](bridge.connector-sdk.md).

<a name="decisions"></a>

## Decisions and ADRs

- [ADR 0008](../../docs/dev/adr/0008-connector-sdk.md): a connector is a process of its own, behind one small SDK
  (D19).
- [ADR 0007](../../docs/dev/adr/0007-biscuit-and-signed-events.md): Biscuit authorises a connector.
- The threat models: [email](../../docs/dev/threat-models/email.md), [Telnet](../../docs/dev/threat-models/telnet.md),
  [SSH](../../docs/dev/threat-models/ssh.md), [Open Badges](../../docs/dev/threat-models/open-badge.md).
