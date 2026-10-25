# Install and run the Bridge

This page takes you from nothing to a Bridge your players reach over HTTPS, then describes the player's routes, the
stores, retention, the reference deployment and the speedrun leaderboards it can also serve. Every command and option:
[The Bridge's command line](bridge.cli.md).

<a name="overview"></a>

## Overview

The reference Reality Bridge (`bridge/src/`, the package `@quest-n-click/bridge`) serves one game. It is a small Node
service: pairing, connectors under Biscuit capabilities, a demonstration webhook, signed events, Server-Sent Events.
Since 4.1.10 it keeps its state in a store (the 4.1.9 JSON-lines journal, SQLite, or Postgres), and one deployment
may run several instances and serve several tenants. What a Bridge is, for authors:
[The Reality Bridge: what it is](bridge.what-it-is.md) and [Signals and the manifest](bridge.signals-manifest.md).
Why it is built this way: [`docs/dev/THREAT-MODEL.md`](../../docs/dev/THREAT-MODEL.md) and
[`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).

<a name="what-you-get"></a>

## What you get

A `serve` process listening on `127.0.0.1:8787` behind your HTTPS reverse proxy, holding one game's keys and
configuration in a private folder, keeping its state in a store (SQLite recommended), answering `/readyz`, and ready
for each connector you grant a token to. The game's `reality.bridge` points at its public URL.

<a name="context-and-versions"></a>

## Context and versions

- Context: a Bridge, on the machine that will run it. The commands are the same from the engine repository, from a
  created project, or from the standalone package; only their name changes (next section).
- From 4.3.0: the commands are named `quest-n-click-bridge` (4.2.5; the `web-scumm` names went in 4.3.0), and the
  Bridge checks its `limits` before it starts (4.3.0). The `local` profile (SQLite) is **stable**; the `distributed`
  profile (Postgres, several instances) is **experimental** ([Stability and support](start.stability.md)).
- **Verified on:** the commands of steps 2, 3 and 6, then `doctor` and `/healthz`, were run on 23 October 2026, on
  macOS, Node 22.14, engine 4.4.0, from the engine repository with the game `signals`, on `127.0.0.1`. The archive's
  installation (step 1) and the HTTPS part (step 4) were not replayed for this page.

<a name="prerequisites"></a>

## Prerequisites

- Node 22.12 or newer; **22.13 or newer for SQLite** (`node:sqlite`) ([Requirements](install.requirements.md)).
- A game that declares `reality.signals` ([Signals and the manifest](bridge.signals-manifest.md)). Built, it has its
  manifest in `dist/reality-manifest.json`.
- For the Internet: a domain name and a reverse proxy that terminates TLS (Caddy, nginx…) and **does not buffer
  `text/event-stream` responses**.
- Optional: `pg` for Postgres, `@opentelemetry/api` (and `@opentelemetry/sdk-node`) for exported measures.

<a name="where-to-run"></a>

## Where to run the commands

On the machine that runs the Bridge, in one of three places:

| Where | The command | The game's manifest comes from |
|---|---|---|
| The engine repository | `npm run bridge -- <command>` (with `GAME=<id>` for a game other than the current one) | the game's content |
| A created project | `npx quest-n-click bridge <command>`, once `@quest-n-click/bridge` is installed beside the engine | the game's content |
| The standalone package, on a server | `npx quest-n-click-bridge <command>` | `init --manifest=<game>/dist/reality-manifest.json` |

The package `@quest-n-click/bridge` is the `quest-n-click-bridge-<version>.tgz` archive a release attaches: one
JavaScript module, its Datalog policies and its SQL schema. It needs Biscuit's WebAssembly and zod; `pg` only for
Postgres, `@opentelemetry/api` only for the measures. The examples below use the engine repository's form.

<a name="steps"></a>

## Steps

<!-- step: install -->
1. On a server, install the package from the release's archive (in the engine repository or a created project, skip
   this step):

   ```sh
   # on the server, in the Bridge's folder (for example /srv/bridge)
   npm install ./quest-n-click-bridge-<version>.tgz
   ```

<a name="start"></a>

### Start one

<!-- step: init -->
2. Make the keys and the configuration. On the Internet, leave the demonstration webhooks out and keep the state in
   SQLite:

   ```sh
   # in the engine repository
   npm run bridge -- init --store=sqlite --no-demo-webhooks --audience=bridge.example.org --origin=https://game.example.org
   ```

   `init` reads the game's manifest and writes, under `--dir` (`.cache/bridge` by default), with mode 600:
   - `config.json`: the manifest and its hash, the Biscuit root's public key, the event-signing key (Ed25519, with a
     `kid`), the hash of the operator's token, the store, and one demonstration webhook per source unless
     `--no-demo-webhooks` (its secret and its own connector token: any player of that source's signals, may confirm
     pairings, for 30 days or `--demo-days`);
   - `root.key`: the Biscuit root's private half, read by `grant` only. `serve` never loads it: keep it where the
     Bridge is not, if you can;
   - `admin-token`: the operator's token, the only copy in clear.

   Nothing secret is printed. `.cache/` is ignored by git. Without `--store`, `init` still writes the JSON-lines
   journal's configuration, for compatibility.

> [!LIMIT id=bridge-init-force]
> `init` refuses to overwrite an existing `config.json`. `--force` replaces it, and every key and token with it:
> every connector needs a new token and every player a new pairing.

<!-- step: serve -->
3. Start it on the loopback:

   ```sh
   # in the engine repository
   npm run bridge -- serve --port=8787 --host=127.0.0.1 --trust-proxy
   ```

   It logs `{"event":"bridge.listening",…,"store":"sqlite","pid":…}` and keeps running. SIGTERM or Ctrl-C stops it:
   the streams end, the server closes, the store and its locks are released, exit 0. Run it under a supervisor
   (systemd, a container's restart policy).

<!-- step: proxy -->
4. Put it behind HTTPS. The reverse proxy terminates TLS, forwards to `127.0.0.1:8787` and does not buffer
   `text/event-stream`. `--trust-proxy` makes the per-address limits see the client's address (`X-Forwarded-For`):
   - `--trust-proxy` alone trusts the loopback only;
   - `--trust-proxy=10.0.0.0/8,192.0.2.7` names the proxies (addresses or IPv4 networks): the header is read only from
     them, and the client is its rightmost address that is not one of them.

   A proxy elsewhere than on the loopback (a PaaS's router) must be named: without it, every client shares the proxy's
   address and its one rate bucket. `--origin` (at `init`) lists the game's site for CORS; the player's routes answer
   it only.

<!-- step: game-url -->
5. Set the game's `reality.bridge` to the Bridge's public URL (`https://bridge.example.org/`), then build and publish
   the game ([Signals and the manifest](bridge.signals-manifest.md#reality-bridge)).

<!-- step: grant -->
6. Give each connector its own token, as narrow as its job, and hand it over as a file:

   ```sh
   # in the engine repository
   npm run bridge -- grant --connector=mail-1 --source=mail --signals=mail.answer.correct,mail.answer.wrong --pair > mail-1.token
   ```

   Then run the connector ([Connectors overview](bridge.connectors.md#run-one)).

<a name="expected-result"></a>

## Expected result, and how to check it

- `GET /livez` answers 200 `{"status":"ok"}`; `GET /readyz` answers 200 when the store answers; `GET /healthz` says
  the tenants, the store's kind and the open streams. None needs a token, none shows a tenant's data.
- `npm run bridge -- doctor` reads the store without changing it: on SQLite, its schema version and, per tenant, the
  players, the signals, any gap in a player's sequence (exit 1) and the quarantined rows.
- When a player links, the log shows `"event":"pairing.confirmed"`; when a connector proposes,
  `"event":"signal.accepted"`.
- On Node 22, a SQLite store makes Node print `ExperimentalWarning: SQLite is an experimental feature…` on standard
  error: Node's own warning about `node:sqlite`, not the Bridge's.

To check a pairing, read the log. Never call `GET /v1/pairings/<code>`: that is the player's one-time claim, and calling
it hands out, and uses up, the player's capability.

<a name="common-errors"></a>

## Common errors

| Message | Cause | Fix |
|---|---|---|
| `✖  the game declares no reality.signals: nothing to bridge` | The current game has no `reality`, or the standalone `init` has no `--manifest` | Pick the game (`GAME=<id>`), or pass `--manifest=<game>/dist/reality-manifest.json` |
| `✖  …/config.json exists (--force replaces it, and every key and token with it)` | `init` run twice | Keep the existing one; `--force` only to start over |
| `the game's manifest (…) is not the one configured (…)` at `serve` | The game's signals changed since `init` | A new `init` in a new folder for the new manifest, then new tokens and pairings |
| `limits.<name> must be an integer of at least <n>, not <value>`, or `limits.<name> is no limit of the Bridge (…)` | A wrong value in `config.json`'s `limits` (checked from 4.3.0) | Fix the value, or remove it to keep the default ([CLI](bridge.cli.md#limits)) |
| `journal in use by process <pid> (…lock): one Bridge per journal` | Another Bridge (or `compact`) holds the journal | Stop it; if that process id now belongs to an unrelated process after a crash, look, then delete the lock |
| `✖  … : not serving` | A restore or a migration down holds the store (a maintenance lease) | Wait for it to end |
| `✖  the leaderboards and the daily challenge keep their records in SQL: …` | A `runs` or `daily` section on the journal | Move to SQLite ([Stores](#stores)) |
| `✖  the Reality Bridge is a separate package: npm install @quest-n-click/bridge` | In a created project, the package is missing | Install it beside the engine |

<a name="files-changed"></a>

## Files or data changed

- The Bridge's folder (`--dir`): `config.json`, `root.key`, `admin-token` (mode 600); the store, `bridge.sqlite` and
  its `-wal` and `-shm` (mode 600), or `journal.jsonl` and its `journal.jsonl.lock` while a Bridge runs.
- `rotate` and `migrate --from=jsonl` rewrite `config.json`.

<a name="recovery"></a>

## Recovery or going back

- An instance killed or crashed: start another; nothing is lost.
- The database lost: restore the last backup into a new one ([Backup and restore](bridge.backup-restore.md)).
- A key or a root compromised: [Security](bridge.security.md#procedures).
- Stopping for good: stop `serve`, keep the folder (its keys sign what players already hold) and a backup for as long
  as you must answer for the data, then delete them.

<a name="players-side"></a>

## The player's side

The routes the game calls (CORS for the `--origin` sites only):

- `POST /v1/pairings` `{ gameId }` → `{ code, expiresAt }` (10 minutes); `GET /v1/pairings/<code>` → `pending`, then
  once `{ playerId, capability }`. Codes waiting for a confirmation are 1 000 at most across players and swept once
  expired. No capability waits anywhere: it is drawn when the player claims the code, and only its hash is kept.
- `GET /v1/events?after=<n>` (Server-Sent Events, Bearer capability) and `GET /v1/signals?after=<n>` →
  `{ signals, sequences }`: the signed signals after a sequence, each with its sequence. `POST /v1/ack { through }`:
  applied and saved up to there.
- A player holds at most 4 open streams. A stream whose reader stopped reading (64 KB unsent) or whose link was revoked
  or expired meanwhile is closed by the Bridge, and the player reconnects from its cursor.
- `GET /v1/keys`: the public keys, current and previous. `GET /v1/manifest`: the game's manifest and its hash.
- A capability reads and acknowledges one player's signals, nothing else, and lives 30 days from its last
  acknowledgement, 180 days at most from its pairing. In the browser it is sensitive all the same (any script of the
  page can read it): a revoked or expired one makes the player "unlinked", and the game can be linked again. The pause
  menu's "Unlink" revokes it on the Bridge (`POST /v1/unlink`, Bearer capability), not only on the device.
- Per address, the routes anyone may call (a code, its state, the keys, the manifest) answer 60 requests a minute,
  and 60 failed authentications a minute on the others refuse every request of that address for a while (429,
  `Retry-After: 60`).

The connectors' routes (`POST /v1/signals`, `POST /v1/pairings/<code>/confirm`, `POST /v1/hooks/<source>`):
[Connectors overview](bridge.connectors.md#run-one).

<a name="stores"></a>

## Stores and profiles

| Profile | Store | For |
|---|---|---|
| `local` (stable) | SQLite (`node:sqlite`, Node 22.13+, one file, WAL) | one machine, one or a few processes |
| (4.1.9) | the JSON-lines journal | a configuration written before 4.1.10, or `init` without `--store`; one process |
| `distributed` (experimental) | Postgres (`pg`) | several instances behind a load balancer |

- `init --store=sqlite` writes `"store": "sqlite:bridge.sqlite"` in `config.json`. A database URL is never written in
  the file: `serve --store=postgres://…`, or the variable [`BRIDGE_STORE`](reference.environment-variables.md#bridge-store),
  or [`BRIDGE_STORE_FILE`](reference.environment-variables.md#bridge-store-file) naming a file that holds it (a secret
  file, so the password is not in an environment a process listing shows). `--store=` wins over `BRIDGE_STORE`, which
  wins over `BRIDGE_STORE_FILE`, which wins over the file.
- The schema is versioned (`bridge/migrations/`, five steps): a SQL store brings it up when it opens;
  `migrate --schema=N` goes up or down by hand, and a database newer than the Bridge is refused.
- The SQLite file and its `-wal` and `-shm` are mode 0600. A write that waits more than 5 s for another process's lock
  is answered 503 with `Retry-After: 1` (the connector repeats it).
- Move a journal to SQLite, the Bridge stopped (the journal is kept as it was):

  ```sh
  # in the engine repository, the Bridge stopped
  npm run bridge -- migrate --from=jsonl --to=sqlite
  ```

  It reads the journal under its lock, writes every player, signal, acknowledgement and revocation into the new store,
  reads them back, then names the new store in `config.json` (not for a URL).

<a name="retention"></a>

## Retention, export and deletion

- The journal (`journal.jsonl`) keeps every accepted signal: its id, sequence, the connector's key, the signed envelope
  and, since 4.1.2, the payload as accepted (to sign it again after a rotation); never a token or an email. Keep it as
  long as players may be offline with signals to receive; then a player pairs again.
- `GET /v1/admin/players/<p-…>` (Bearer operator token): everything held about a player (its link without the
  capability, its signals, its acknowledgement). `DELETE /v1/admin/players/<p-…>`: deletes it; on the journal, the
  file is rewritten without a line about that player (each line read as an event, never matched as text).

  ```sh
  # on the Bridge's machine, in the engine repository
  curl -s -H "Authorization: Bearer $(cat .cache/bridge/admin-token)" https://bridge.example.org/v1/admin/players/p-0123456789abcdef
  curl -s -X DELETE -H "Authorization: Bearer $(cat .cache/bridge/admin-token)" https://bridge.example.org/v1/admin/players/p-0123456789abcdef
  ```

- `doctor` on the journal says what it holds. A last line cut short by a crash is dropped at the next start, and said
  in the log (`journal.repaired`); any other line that does not parse, or parses but is not an event of the journal's
  shape (every field checked, 4.1.8), is corruption, and the Bridge refuses to start rather than guess.
- One Bridge per journal (4.1.8): the running Bridge holds `journal.jsonl.lock` with its process id; a second start on
  the same file refuses while that process lives, and takes over a lock left by a crash (said in the log). Ctrl-C or
  SIGTERM releases it. `compact` takes the lock too, so it refuses while the Bridge runs. A lock whose process id was
  reused by an unrelated process since the crash is refused as "in use": look, then delete it. The lock is a hard
  link: the journal's folder must be on a file system that holds them (APFS, ext4 and NTFS do; FAT and some network
  mounts do not).
- `compact [--retention-days=90]`, the Bridge stopped, rewrites the journal without the pairings past their time, the
  earlier versions of a player's line, and the signals acknowledged and older than the retention. A player's last
  signal always stays (its next sequence is counted from it), and so does everything not yet acknowledged.

> [!LIMIT id=bridge-sql-no-retention]
> A SQL store keeps every signal: `compact` is the journal's command and refuses a SQL store. Deleting a player removes
> its rows from the store, not from backup files already written: those are yours to expire.

Deleting a player's data everywhere (the Bridge, a mailbox, an SSH configuration, the connectors' memory, the
device): [Privacy](play.privacy.md#deleting) and [The Bridge's command line](bridge.cli.md#deleting-a-player).

<a name="reference-deployment"></a>

## The reference deployment (4.1.18)

`ops/qualify/` is the `distributed` profile as a reproducible deployment: an HTTPS proxy (Caddy), three Bridges built
from the `quest-n-click-bridge` archive, one Postgres, two tenants, every image pinned by digest, the Bridges read-only
and unprivileged, the database password and URL as secret files (`BRIDGE_STORE_FILE`), Postgres never published.
`npm run ops:qualify` (in the engine repository, with Docker) brings it up, kills an instance during proposals, holds a
stream on another, checks the tenants apart, then backs up, destroys the topology with its database and restores it
([`ops/qualify/README.md`](../../ops/qualify/README.md)). The `distributed` profile stays experimental until a
person's pass behind a real domain (24 to 48 hours) has passed.

<a name="leaderboards"></a>

## Leaderboards and the daily challenge (4.1.16)

A configuration's `runs` section mounts `/v1/runs`; its `daily` section mounts `/v1/daily`, `/v1/commit` and
`/v1/reveal/<id>`. Both keep their records in the SQL store (`--store=sqlite:<file>` or `BRIDGE_STORE=postgres://…`;
`serve` refuses them on the journal), migrations 0002 to 0004. What they do for players and authors (submitting a run,
the leaderboard's ranking, the daily seed, Mystery worlds): [Speedrun for authors](create.speedrun.md#leaderboards).

```json
"runs": {
  "games": { "reference": { "dir": "/srv/games/reference", "fingerprint": { "logic": "…", "trustedExtensions": "…", "presentation": "…", "engine": "…" } } },
  "worker": ["/usr/bin/node", "/srv/quest-n-click/node_modules/tsx/dist/cli.mjs", "/srv/quest-n-click/tools/speedrun/worker.ts"],
  "workers": 2
},
"daily": { "games": { "reference": { "daily": "daily", "mystery": "mystery" } }, "kid": "daily-2026", "keyFile": "daily.jwk", "secretFile": "daily.secret" }
```

- `runs` also takes `timeoutMs`, `maxQueued` (default 100), `retentionDays`, `perMinute` (default 10) and
  `adminTokenFile` ([Moderation](#moderation)). `daily` also takes `retentionDays` (default 30).
- The queue's limits hold for every instance together (4.1.17): `maxQueued`, runs waiting or being verified, is counted
  and written in one transaction under the tenant's lock; `perMinute` is a bucket per client in the table `run_quota`.
  The client is the socket's address, or the one a trusted proxy names (`--trust-proxy`): only an HMAC of it is stored,
  with a secret every instance of the tenant derives from its event key. Rotating the event key rotates that secret
  too: every client starts a new bucket (at most one more minute's quota), and the old buckets are purged with the idle
  ones. A global rate limit at the proxy stays a good idea in front of it all.
- `keyFile` (the Ed25519 private JWK whose public half the game's manifest names in `remix.daily`) and `secretFile`
  (the days' secret) sit beside `config.json`, mode 0600. Rotating the daily key is a release of the game with the new
  public key: the player and the verifier accept the key the manifest names only, so a token of another `kid` is
  refused.
- Runs and daily records are written in the same SQL store, so every instance answers the same; old runs are purged
  hourly, daily records past their retention too.
- The routes: `POST /v1/runs` `{ player, envelope }` returns the run's id and a deletion token;
  `GET /v1/runs?game=&category=[&key=][&limit=]` is a leaderboard (valid runs only; 100 lines, `&limit=` up to 1 000);
  `GET /v1/runs/<id>` is one run; `DELETE /v1/runs/<id>` with `x-delete-token` deletes it; `POST
  /v1/runs/<id>/moderate` with the moderation token raises it to `moderator-verified`. `GET /v1/daily?game=[&date=]`
  signs the day's seed (a real UTC day, today or within `retentionDays`); `POST /v1/commit` and `GET /v1/reveal/<id>`
  commit to a Mystery seed and reveal it, both signed. These routes take from the per-address budget of the routes
  anyone may call.
- Every instance's workers share one queue: a run is created once (its key is unique, so two instances receiving the
  same run create one), claimed by one worker under a lease, and claimed again when its worker died and the lease
  expired; a worker that lost its lease cannot store a verdict. The HTTP process never replays. Each worker checks the
  game's package against its approved fingerprint and signs its answer with a one-time key; the envelope is dropped
  once the verdict is stored. Submissions, verdicts, moderations and deletions are audit lines on the Bridge's log.

<a name="speedrun-worker"></a>

## The speedrun worker

Each run is verified by a worker process the Bridge starts (the `worker` command). The worker's in-process refusal of
the network is defence in depth, not a sandbox: a replay runs the game's code, and a hostile package or run could
still reach the file system, start a process or open a socket another way. Run the worker command inside the
deployment's isolation, for instance:

```sh
docker run --rm -i --network none --read-only --tmpfs /tmp:rw,size=64m --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 512m --memory-swap 512m --cpus 1 --user 65534:65534 -v /srv/games:/srv/games:ro web-scumm-worker \
  timeout -s KILL 70 node tools/speedrun/worker.ts
```

as the `worker` command: no network namespace, a read-only root, a bounded temporary folder, no capability, no secret of
the Bridge in its environment (the Bridge passes `PATH`, `GAME_DIR` and `NODE_OPTIONS` only), limits on CPU, memory (no
swap beyond it), processes and time (the Bridge kills the process group at `timeoutMs` + 5 s). Its standard output is
capped at 1 MB and its standard error is not kept. Whatever folder is mounted is readable inside: keep the Bridge's own
folder (`config.json`, its keys and token files) outside the engine folder mounted at `/app`. Killing the `docker`
client does not stop its container: `timeout -s KILL` inside it (a little over the Bridge's `timeoutMs`) is what ends a
replay that runs too long, so timed-out containers never pile up.

Since 4.1.17 this profile is one function (`tools/speedrun/container.mjs`, `workerContainerArgs`):

```sh
# in the engine repository
node tools/speedrun/container.mjs --image=<image> --app=<engine folder> [--games=<folder>]
```

prints the `worker` command, with **no network unless `--allow-network`** (which says so on standard error). CI's
`worker-container` job (`npm run e2e:worker-container`, Linux and Docker) runs the reference run inside it, then a
hostile script: HTTP, DNS and TCP refused, nothing written outside `/tmp`, the host's secrets unseen, a child process
allowed but without a network, the container killed by its own timeout with nothing left running; then a run again.

> [!LIMIT id=bridge-worker-not-a-sandbox]
> The worker refuses fetch, WebSocket, TCP, UDP and DNS in its own process, as a second line of defence. It is not a
> sandbox: the isolation is the container (or equivalent) you run it in.

<a name="moderation"></a>

## Moderation

`runs.adminTokenFile` names the file of the token that moderates a tenant's leaderboards (`POST
/v1/runs/<id>/moderate`, `Authorization: Bearer …`): beside `config.json`, mode 0600, at least 32 characters. `serve`
refuses to start when it is missing, shorter, or open to others (on POSIX systems; on Windows the folder's ACL
decides). Without it there is no moderation route (404, nothing counted). The token is compared as hashes of equal
length (its length says nothing either); every refusal is an audit line (`run.moderation-refused`, never the bearer),
and `/healthz` counts moderations accepted and refused.

<a name="references"></a>

## References

- The commands: [`bridge/src/cli.ts`](../../bridge/src/cli.ts), [`bridge/src/cli-store.ts`](../../bridge/src/cli-store.ts);
  the routes: [`bridge/src/server.ts`](../../bridge/src/server.ts); the limits:
  [`bridge/src/config.ts`](../../bridge/src/config.ts).
- [The Bridge's command line](bridge.cli.md) · [Backup and restore](bridge.backup-restore.md) ·
  [Several tenants](bridge.multi-tenant.md) · [Security](bridge.security.md) ·
  [Troubleshooting](bridge.troubleshooting.md).
- The design: [ADR 0009](../../docs/dev/adr/0009-reality-store.md); the threat model of several instances:
  [`docs/dev/threat-models/constellation.md`](../../docs/dev/threat-models/constellation.md).
