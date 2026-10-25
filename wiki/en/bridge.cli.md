# The Bridge's command line

Every subcommand of the reference Reality Bridge, with its options, defaults, output and exit codes, read from
`bridge/src/cli.ts` and `bridge/src/cli-store.ts`. How to use them in order:
[Install and run the Bridge](bridge.install-run.md).

<a name="invocation"></a>
<!-- applies: .. since 4.1.1 -->

## Invocation

### Form

| Where | Command |
|---|---|
| The engine repository | `npm run bridge -- <subcommand> [options]` (the current game, or `GAME=<id>`) |
| A created project | `npx quest-n-click bridge <subcommand> [options]` (needs `@quest-n-click/bridge` installed beside the engine) |
| The standalone package | `npx quest-n-click-bridge <subcommand> [options]` |

An option is `--name=value` or `--name value`. Every subcommand takes `--dir=<folder>`, the Bridge's folder holding
`config.json`, `.cache/bridge` by default (relative to the current folder).

### Values and default

Subcommands: `init`, `serve`, `grant`, `rotate`, `revoke`, `doctor`, `compact`, `migrate`, `tenant`, `backup`,
`restore`. The store a command works on is, first found: `--store=`, the variable `BRIDGE_STORE`, the file named by
`BRIDGE_STORE_FILE`, the `store` of `config.json`, else the journal (`jsonl`). A store is `jsonl`, `sqlite` (the file
`bridge.sqlite` beside `config.json`), `sqlite:<file>` (relative to the Bridge's folder) or `postgres://…`.

### Constraints

Another subcommand prints `usage: quest-n-click-bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore>`
and exits 2. Outside the engine repository, without the package: `✖  the Reality Bridge is a separate package: npm
install @quest-n-click/bridge`, exit 1.

### Minimal example

```sh
# in the engine repository
GAME=signals npm run bridge -- doctor
```

### Behaviour on an unknown field

An option no subcommand reads is ignored.

### Since

4.1.1 (`init`, `serve`, `grant`, `rotate`, `revoke`); `doctor` and `compact` 4.1.2; `migrate`, `tenant`,
`backup`, `restore` 4.1.10; the two restore modes 4.1.20; the `quest-n-click-bridge` name 4.2.5.

<a name="init"></a>
<!-- applies: .. since 4.1.1 -->

## `init`

### Form

`init [--dir=.cache/bridge] [--manifest=<file>] [--audience=bridge.local] [--origin=<url>,…] [--no-demo-webhooks]
[--demo-days=30] [--store=sqlite|sqlite:<file>] [--tenant=<id>] [--environment=prod|staging|dev] [--hosts=<host>,…]
[--signal-version=2] [--force]`

### Values and default

Makes the keys and the configuration of one tenant, under `--dir`, mode 600: `config.json`, `root.key` (the Biscuit
root's private half, for `grant` only), `admin-token` (the operator's token, the only copy in clear).

- `--manifest`: the game's built manifest (`dist/reality-manifest.json`); without it, the current game's content.
- `--audience`: who the Bridge is in its connectors' tokens (`bridge.local`).
- `--origin`: the game's sites, for CORS (`http://127.0.0.1:5173,http://localhost:5173`).
- One demonstration webhook per source of the game's signals unless `--no-demo-webhooks`, each with its secret and a
  token that may send any signal of that source for any player and confirm pairings, for `--demo-days` days.
- `--store`: `sqlite` writes `sqlite:bridge.sqlite`; absent, the journal (`journal.jsonl`).
- `--tenant`, `--environment` (`prod` when absent), `--hosts`: for [several tenants](bridge.multi-tenant.md).
  `--signal-version=2`: a single tenant signs `WorldSignalV2`.

Prints the paths written and the webhooks' routes, never a secret. Exit 0.

### Constraints

- `✖  the game declares no reality.signals: nothing to bridge`, exit 1.
- `✖  <dir>/config.json exists (--force replaces it, and every key and token with it)`, exit 1.

> [!LIMIT id=bridge-init-store-url]
> `--store` is written into `config.json` as given. Never pass a Postgres URL with its password to `init`: give it
> to `serve` and the other commands through `BRIDGE_STORE` or `BRIDGE_STORE_FILE`, which are never written.

### Minimal example

```sh
# in the engine repository
npm run bridge -- init --store=sqlite --no-demo-webhooks --origin=https://game.example.org
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.1; `--store`, `--tenant`, `--environment`, `--hosts`, `--signal-version` 4.1.10.

<a name="serve"></a>
<!-- applies: .. since 4.1.1 -->

## `serve`

### Form

`serve [--dir=…] [--tenants=<dir>,<dir>] [--store=…] [--port=8787] [--host=127.0.0.1] [--trust-proxy[=<proxy>,…]]
[--tenant-header]`

### Values and default

Serves the Bridge over HTTP until SIGINT or SIGTERM, then ends the streams, closes the server, releases the store and
its locks (five seconds at most) and exits 0. It logs JSON lines on standard output, the first
`{"event":"bridge.listening","url":…,"game":…,"tenants":…,"store":…,"pid":…}`.

- `--tenants`: one folder per tenant, all on one SQL store.
- `--trust-proxy` alone trusts the loopback; with a list, those addresses or IPv4 networks.
- `--tenant-header`: a request may name its tenant in `X-Web-Scumm-Tenant`.
- The variables [`BRIDGE_STORE`](reference.environment-variables.md#bridge-store),
  [`BRIDGE_STORE_FILE`](reference.environment-variables.md#bridge-store-file) and
  [`OTEL_EXPORTER_OTLP_ENDPOINT`](reference.environment-variables.md#otel-exporter-otlp-endpoint).

### Constraints

Exit 1, said on standard error, when: two folders configure one tenant; several tenants on the journal; a `runs` or
`daily` section on the journal; a moderation token file missing, open to others or shorter than 32 characters; a
maintenance lease refuses the store (`✖  … : not serving`). It refuses to start on a manifest other than the one
configured, on a limit that is not one ([`limits`](#limits)), and on a journal another live process holds.

### Minimal example

```sh
# in the engine repository
npm run bridge -- serve --port=8787 --host=127.0.0.1 --trust-proxy
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.1; `--tenants`, `--tenant-header`, `--trust-proxy=<list>` 4.1.10; the serving lease 4.1.20.

<a name="grant"></a>
<!-- applies: .. since 4.1.1 -->

## `grant`

### Form

`grant --connector=<id> --source=<source> --signals=<a>,<b> [--players=any|p-…,p-…] [--pair] [--days=30] [--dir=…]`

### Values and default

Mints a connector's Biscuit token from `root.key` and prints it on standard output, one line: redirect it to a file.
The token names the game, the source, the signals, the players (`any` player of the game by default), the Bridge's
audience, the tenant of the folder, and an expiry `--days` days from now (to the second; refused from that second on).
`--pair` lets it confirm pairing codes. Exit 0.

### Constraints

`root.key` must be in the folder (or the 4.1.1 configuration's field): `<dir>/root.key is missing: the root key signs
connector tokens, and nothing else can`. Give each connector only the signals it proposes. A connector can attenuate
its own token (fewer players, an earlier expiry) before handing it on; it can never widen it.

### Minimal example

```sh
# in the engine repository
npm run bridge -- grant --connector=shed-telnet --source=terminal --signals=terminal.lamp --pair > telnet.token
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.1; bound to its tenant since 4.1.10.

<a name="rotate"></a>
<!-- applies: .. since 4.1.1 -->

## `rotate`

### Form

`rotate [--keep-days=30] [--dir=…]`

### Values and default

Makes a new event-signing key, keeps the current one in `previousKeys` for `--keep-days` days, rewrites `config.json`
and prints `✔  new event key k-…; the previous one trusted until <date> (restart the Bridge)`. Exit 0. It takes effect
when the Bridge restarts. Why and when: [Security](bridge.security.md#keys).

### Constraints

None beyond a readable `config.json`.

### Minimal example

```sh
# in the engine repository
npm run bridge -- rotate --keep-days=30
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.1; what waits for a player signed again under the new key since 4.1.2.

<a name="revoke"></a>
<!-- applies: .. since 4.1.1 -->

## `revoke`

### Form

`revoke [--url=http://127.0.0.1:8787/] (--player=<p-…> | --token=<revocation id>) [--dir=…]`

### Values and default

Asks the running Bridge to revoke a player's link, or a connector's token by any of its revocation ids (hexadecimal),
with the operator's token read from `<dir>/admin-token` (`POST /v1/admin/revoke`). Prints `✔  revoked`, exit 0;
otherwise `✖  <status> <answer>`, exit 1.

### Constraints

The Bridge must be running and reachable at `--url`. With several tenants, the URL's host name chooses the tenant.

### Minimal example

```sh
# in the engine repository
npm run bridge -- revoke --url=https://bridge.example.org/ --player=p-0123456789abcdef
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.1.

<a name="doctor"></a>
<!-- applies: .. since 4.1.2 -->

## `doctor`

### Form

`doctor [--dir=…] [--store=…]`

### Values and default

Reads the store without changing it. On the journal: one line `{"event":"journal","lines":…,"players":…,"signals":…,
"torn":…}`, then `✔  journal readable`, or `⚠` when the last line was cut short by a crash (`serve` drops it and says
so). On a SQL store: `{"event":"store","kind":…,"schema":…,"tenants":[{tenant, players, signals, gaps,
quarantined}]}`, a `⚠  quarantined: …` line per quarantined row, then `✔  sqlite store readable (schema 5)`.

### Constraints

Exit 1 when the journal holds a corrupt line (`✖  <what>: the Bridge will not start on it`), or when a player's
sequence has a gap (`✖  a player has a gap in its sequence`).

### Minimal example

```sh
# in the engine repository
npm run bridge -- doctor
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.2; every field of a journal line checked 4.1.8; SQL stores 4.1.10.

<a name="compact"></a>
<!-- applies: .. since 4.1.2 -->

## `compact`

### Form

`compact [--retention-days=90] [--dir=…]`, the Bridge stopped.

### Values and default

Rewrites the journal without the pairings past their time, the earlier versions of a player's line, and the signals
acknowledged and older than the retention. A player's last signal and everything not yet acknowledged stay. Prints
`✔  journal compacted: <before> → <after> lines (…)`.

### Constraints

It takes the journal's lock, so it refuses while a Bridge runs. On a SQL store: `✖  compact rewrites the JSON-lines
journal; a SQL store keeps every signal in 4.1.10 (no retention yet)`, exit 1.

### Minimal example

```sh
# in the engine repository, the Bridge stopped
npm run bridge -- compact --retention-days=90
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.2; under the journal's lock 4.1.8.

<a name="migrate"></a>
<!-- applies: .. since 4.1.10 -->

## `migrate`

### Form

`migrate --from=jsonl --to=sqlite[:<file>]|postgres://… [--tenant=<id>] [--no-config]`, or
`migrate [--schema=N] [--lock-timeout=30000]`.

### Values and default

- From the journal, the Bridge stopped: reads it under its lock, writes every player, signal, acknowledgement and
  revocation into the target as one tenant (`default`, or `--tenant`), reads them back, then names the new store in
  `config.json` (not for a URL, nor with `--no-config`). The journal is kept as it was. Prints `✔  <n> players and <m>
  signals moved to <store> as tenant <id>; the journal is kept as it was`.
- The SQL schema: up to the latest (`✔  schema 5 (nothing to do)`), or to `--schema=N`, up or down (`--schema=0`
  undoes everything). Going down takes the exclusive maintenance lease; up, a serving one.

### Constraints

- `✖  the target already holds the tenant <id>: nothing written`, exit 1.
- `✖  the target does not hold what was written: the configuration is left on the journal`, exit 1.
- `✖  the JSON-lines journal has no schema: migrate --from=jsonl --to=sqlite moves it`, exit 1.
- A lease refused: `✖  <who holds it>; nothing migrated`, exit 1. A bad `--lock-timeout` or usage: exit 2.
- A database newer than the Bridge is refused. Below schema 5 there is no lease table: stop every writer.

### Minimal example

```sh
# in the engine repository, the Bridge stopped
npm run bridge -- migrate --from=jsonl --to=sqlite
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.10; the leases 4.1.20.

<a name="tenant"></a>
<!-- applies: .. since 4.1.10 -->

## `tenant`

### Form

`tenant export --tenant=<id> [--out=<file>]` · `tenant delete --tenant=<id> --yes`

### Values and default

`export` writes every row of one tenant, in every table, as JSON: to `--out` (mode 600) or standard output. `delete`
removes them. `--tenant` defaults to the folder's tenant (`default`).

### Constraints

`delete` without `--yes`: `✖  deleting the tenant <id> removes every row it has: add --yes`, exit 1. Another
sub-subcommand: usage, exit 2.

### Minimal example

```sh
# in the engine repository
npm run bridge -- tenant export --tenant=a --out=tenant-a.json
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.10.

<a name="backup"></a>
<!-- applies: .. since 4.1.10 -->

## `backup`

### Form

`backup --out=<file> [--max-bytes=268435456] [--max-rows=2000000]`

### Values and default

Writes the whole store as one snapshot, schema 4, to `--out` (mode 600, a temporary file renamed). Prints the counts,
the schema and the start of the SHA-256. Exit 0. The procedure, the file's contents and the memory it needs:
[Backup and restore](bridge.backup-restore.md).

### Constraints

Without `--out`: usage, exit 2. A bound that is not a positive integer: exit 2. A store over `--max-rows`, or a file
over `--max-bytes`: `✖  … : no file written`, exit 1.

### Minimal example

```sh
# in the engine repository
npm run bridge -- backup --out=bridge.json
```

### Behaviour on an unknown field

Ignored.

### Since

4.1.10; one snapshot (schema 3) 4.1.19; schema 4 4.1.20.

<a name="restore"></a>
<!-- applies: .. since 4.1.10 -->

## `restore`

### Form

`restore --from=<file> --mode=merge [--force] [--max-bytes=<n>] [--lock-timeout=<ms>]`

`restore --from=<file> --mode=replace-store --yes-replace-store --safety-out=<new file> [--max-bytes=<n>]
[--max-rows=<n>] [--lock-timeout=<ms>]`

### Values and default

All or nothing, in the mode you name: `merge` keeps what the file does not speak of; `replace-store` makes the store
the file, after a safety backup. The file is checked whole before the store is opened, written in one transaction,
compared before the commit and audited after it. `--lock-timeout`: how long the Postgres advisory lock is tried
(30 000 ms).

### Constraints

| Exit | When |
|---|---|
| 0 | Restored and checked |
| 1 | Refused or failed, `nothing restored` (a conflict, a file refused, the journal, a lease held, a safety backup that could not be written) |
| 2 | Usage: no `--mode`, `--force` with `replace-store`, `--safety-out` or `--yes-replace-store` with `merge`, a missing confirmation or safety path, a bad bound |
| 3 | A difference found after the commit (P0), or the commit's answer lost |

### Minimal example

```sh
# in the engine repository, every Bridge on that store stopped
npm run bridge -- restore --from=bridge.json --mode=merge
```

### Behaviour on an unknown field

Ignored. A file with an unknown field is refused (strict schemas).

### Since

4.1.10; all or nothing 4.1.19; the modes 4.1.20.

<a name="limits"></a>
<!-- applies: 4.3.0.. since 4.1.1 -->

## `limits` (in `config.json`)

### Form

An object of integers in a tenant's `config.json`, `"limits": { "perMinutePerConnector": 240 }`. Each name left out
keeps its default.

### Values and default

| Limit | Default | Least |
|---|---|---|
| `bodyBytes`: a request body, in bytes | 8 192 | 1 |
| `perMinutePerConnector`: signals one connector may propose per minute, per instance | 120 | 0 |
| `pendingPerPlayer`: signals waiting for a player's acknowledgement | 1 000 | 0 |
| `pairingMs`: how long a pairing code waits | 600 000 (10 min) | 0 |
| `capabilityMs`: a capability's life without an acknowledgement | 2 592 000 000 (30 days) | 0 |
| `capabilityMaxMs`: a capability's longest life, renewals included | 15 552 000 000 (180 days) | 0 |
| `streamsPerPlayer`: open event streams per player | 4 | 0 |
| `streamsPerInstance`: open event streams on one instance | 10 000 | 0 |
| `streamBufferBytes`: bytes a stream may hold unsent | 65 536 | 1 |
| `pendingPairings`: codes waiting for a confirmation, all players | 1 000 | 0 |
| `resignedCache`: signals signed again after a rotation, kept in memory | 10 000 | 0 |
| `streamPage`: signals a stream reads from the store at once | 100 | 1 |

### Constraints

From 4.3.0 the Bridge checks them before it starts: `limits.<name> must be an integer of at least <n>, not <value>`,
or `limits.<name> is no limit of the Bridge (<the names>)`. On a shared Bridge, one tenant's wrong limit stops every
tenant: read [Upgrade notes 4.3](install.upgrade-notes-4-3.md) before upgrading.

### Minimal example

```json
"limits": { "perMinutePerConnector": 240, "pendingPerPlayer": 2000 }
```

### Behaviour on an unknown field

Refused (from 4.3.0).

### Since

4.1.1; checked since 4.3.0.

<a name="deleting-a-player"></a>
<!-- applies: .. since 4.1.9 -->

## Deleting a player's data everywhere

### Form

Five places, in this order:

1. On the Bridge: `DELETE /v1/admin/players/<id>` with the operator's token (the link, the signals, the
   acknowledgements). `GET` on the same route exports them first.
2. In an IMAP mailbox: delete the player's flagged messages, if any (accepted ones are already gone with
   `keepDays: 0`).
3. In the SSH connector's configuration: remove the player's declared key, if any, and restart the connector.
4. In memory (email senders linked by a pairing code, Telnet and SSH resume words): restarting the connectors forgets
   them all.
5. On the device: the player erases the save or the site's data.

### Values and default

`DELETE` answers 204; an unknown player, 404.

### Constraints

The operator's token (`admin-token`). Backup files already written still hold the player: they are yours to expire.

### Minimal example

```sh
# on the Bridge's machine, in the engine repository
curl -s -X DELETE -H "Authorization: Bearer $(cat .cache/bridge/admin-token)" https://bridge.example.org/v1/admin/players/p-0123456789abcdef
```

### Behaviour on an unknown field

The route takes a `p-` and 16 hexadecimal digits; anything else is a 404.

### Since

The Bridge's route 4.1.1; the connectors' part 4.1.9. What each place keeps: [Privacy](play.privacy.md).

<a name="related"></a>

## Related identifiers

- `npm run connector` (`quest-n-click-connector`): [Connectors overview](bridge.connectors.md#run-one).
- `npm run bridge:load` (three `serve` on one store under load; `docs/dev/BENCH-BRIDGE.md`): [Benchmarks](contribute.benchmarks.md).
- `npm run ops:qualify`: [The reference deployment](bridge.install-run.md#reference-deployment).
- The other CLIs of the project: [CLIs](reference.cli.md).
