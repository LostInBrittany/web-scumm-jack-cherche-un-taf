# The server's command line

`studio-server` is the Studio Server's one command: it serves, imports and exports the game, invites the first owner,
logs the CLI in, backs up, restores and collects. This page lists every subcommand of
[`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts), its options, what it prints and its exit
code.

<a name="how-to-run"></a>

## How to run it

```sh
# in the engine repository
npm run studio-server -- <subcommand> [options]
# from the release archives, in the folder where they are installed
npx quest-n-click-studio-server <subcommand> [options]
```

Both run the same program. On Clever Cloud, run it in `clever ssh --alias <studio app>`, after `cd "$APP_HOME"`: that
shell already has the app's variables.

<a name="configuration"></a>

## The configuration and the secrets

Every subcommand but `login`, `token`, `deps` and `worker-keys` reads the server's configuration, from the first of:

1. `--config <file>`, anywhere in the arguments;
2. the variable `STUDIO_CONFIG`, a file's path;
3. the variable `STUDIO_CONFIG_JSON`, the configuration itself on one line (Clever Cloud).

Without any: `usage: studio-server <serve|import <dir>|export <dir>> --config <file> (or STUDIO_CONFIG_JSON)`, exit
code 2. An unknown or missing key of the configuration stops the command with `configuration: <file>: …`, exit code 1.

The secrets (`STUDIO_DATABASE_URL`, the S3 keys, `STUDIO_OIDC_CLIENT_SECRET`, `STUDIO_SESSION_KEY`, `STUDIO_WORKER_KEY`,
`STUDIO_METRICS_TOKEN`, `STUDIO_GIT_KEY`) are read from `<NAME>_FILE` (a file of mode 0600) or from the environment
(on Clever Cloud also the add-ons' `POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`, `CELLAR_ADDON_KEY_SECRET`), then
removed from the environment before anything else runs. See
[Environment variables](reference.environment-variables.md#studio-server).

<a name="exit-codes"></a>

## Exit codes and output

| Code | Meaning |
|---|---|
| 0 | done; `serve` also exits 0 after a `SIGTERM` or `SIGINT` once it has drained |
| 1 | refused or failed: a configuration error (`configuration: …`), `import` on an instance that has a project, `replay` without a restore under way, `token` not logged in, any other error (its message, or its stack) |
| 2 | usage: a subcommand's argument or flag missing or wrong, an unknown subcommand, `serve` on a non-loopback address without OIDC |

Most subcommands print **one JSON line** on stdout (`{"event": …}`), documented below; `invite`, `login`, `token` and
`worker-keys` print plain text. Errors go to stderr.

<a name="serve"></a>

## `serve`

```sh
npm run studio-server -- serve --config studio.config.json
```

Starts the server: the API, the probes, the game's origin, the service lease. It prints JSON log lines (`lease-taken`,
`listening`, one `request` line per request, `stopping`…). It listens on the configuration's `port`, else `PORT`, else
8080, on `host` (`0.0.0.0` by default).

- Without `oidc` in the configuration, it is the local server and refuses any `host` but the loopback:
  `serve: <host> is refused without authentication (configure oidc); use 127.0.0.1` (exit 2).
- With `oidc` it needs `STUDIO_OIDC_CLIENT_SECRET`, `STUDIO_SESSION_KEY` (32 characters or more, several
  comma-separated to rotate), `worker` with `STUDIO_WORKER_KEY`, the built Studio page (`npm run studio-client`), and
  the provider's discovery reachable; any missing is a `configuration:` error (exit 1).
- `STUDIO_METRICS_TOKEN`, when set, must be 32 characters or more.
- It refuses to start while a restore is under way: `a restore is under way: end it with replay`.
- On `SIGTERM` or `SIGINT` it stops taking requests, lets the running ones finish (5 s at most), gives the service
  lease back, and exits 0.

<a name="import"></a>

## `import <dir>`

```sh
npm run studio-server -- import games/my-game --config studio.config.json
```

Makes a game folder (with its `index.ts`) the instance's project: copied beside, then renamed into place, and adopted
by the journal as revision 1. On a hosted instance every file goes to the bucket, and the journal is shipped before the
command ends. Prints `{"event":"imported","game","revision"}`.

- No folder, or no `index.ts`: `import: a game folder (with its index.ts) is required` (exit 2).
- The instance already has a project (in its database, or a non-empty work folder):
  `import: this instance already has a project` (exit 1). Import once, on a new instance; afterwards use Git
  ([The game in Git](team.game-in-git.md)) or a restore.

<a name="export"></a>

## `export <dir>`

```sh
npm run studio-server -- export ./my-game-export --config studio.config.json
```

Writes the game at the head into a new or empty folder, with `export-manifest.json`:
`{"game", "epoch", "revision", "files": [{"path", "blob"}]}`, where `blob` is each file's sha256. The files and the
revision come from one snapshot of the database, and each file's content is checked against its hash. Prints
`{"event":"exported","revision","files"}`. It reads only: it can run while the server serves.

- A folder that exists and is not empty: `export: an empty or new folder is required` (exit 2).
- A content that does not match the head: an error naming the file (exit 1).

> [!GUARANTEE id=export-same-files]
> A game imported, then exported at its head, comes out with a manifest of its files' hashes, and each exported file
> matches its hash in the manifest.

> [!LIMIT id=export-game-only]
> An export holds the game's files at the head, nothing else: no history, no members, no comments, no published
> builds, no prepared assets. A backup holds those (see [Backups](clever.backups.md)). On Clever Cloud the folder is
> written on the instance's disk, which does not survive a restart: copy it out (see
> [Exporting the game and leaving the installation](clever.export-leave.md)).

<a name="invite"></a>

## `invite --email <email> --role <owner|dev|reviewer>`

```sh
npm run studio-server -- invite --email you@example.fr --role owner
```

Prints a one-time invitation link (`<publicUrl>/auth/login?invite=…`, 7 days, for that verified email). It is how the
first owner gets in; the audit log names its author `studio-server invite`. Each flag needs its value, never another
flag; otherwise `usage: studio-server invite --email <email> --role <owner|dev|reviewer> --config <file>` (exit 2).
See [Invitations](team.invitations.md).

<a name="login"></a>

## `login --server <url>`

```sh
npm run studio-server -- login --server https://studio.example.fr   # the device flow: open the link, type the code
npm run studio-server -- token --server https://studio.example.fr   # an access token for scripts and the MCP
```

Needs no configuration. Asks the Studio which provider and client to use (`GET /auth/cli`), then runs the device flow:
it prints `Open <url> and enter the code <code>`, waits, then `logged in`. The tokens are kept in
`~/.config/web-scumm/studio-tokens.json` (mode 0600), one entry per server, and only sent over https.

- The provider refuses: `the login was refused: <error> (<description>)`, for instance
  `not_allowed (Offline tokens not allowed for the user or client)` when the member lacks `offline_access` (see
  [Keycloak](clever.keycloak.md)).
- The Studio names no CLI client: `<url> names no CLI client: ask its owner to configure oidc.cliClientId`.
- An `http://` URL: `<url> is not https: the tokens would travel in clear`.

<a name="token"></a>

## `token --server <url>`

```sh
npm run studio-server -- token --server https://studio.example.fr   # an access token for scripts and the MCP
```

Prints a valid access token for that server, renewed first when it has less than a minute left. Send it as
`Authorization: Bearer <token>`. The tokens must carry the Studio's `oidc.audience`. Not logged in:
`not logged in to <url>: run studio-server login --server <url>` (exit 1); refresh token gone: `the login to <url>
expired: log in again`. An AI agent uses it through the Studio's `/mcp`, or through the local MCP server pointed at
the Studio (`npm run -s mcp -- --server <url>`): see [Remote MCP](team.remote-mcp.md).

<a name="deps"></a>

## `deps`

Needs no configuration. Prints the server's own dependencies as they resolve from where it runs:
`{"openid-client": {"version", "from"}, "jose": {…}, "pg": {…}}`. A missing one fails here, not at the first login.
Useful after installing from the archives, where `pg` takes the latest 8.x its range allows.

<a name="worker-keys"></a>

## `worker-keys --out <existing folder>`

```sh
mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
```

Needs no configuration. Writes the job keys: `studio-worker.key` (mode 0600, the Studio's secret
`STUDIO_WORKER_KEY`) and `studio-worker.pub` (the worker's `WORKER_PUBLIC_KEY`). Never prints a key. The folder must
exist (`usage: studio-server worker-keys --out <existing folder>`, exit 2); an existing key file is never overwritten
(exit 1).

<a name="backup"></a>

## `backup <file>` and `backup --to-bucket [--keep n]`

```sh
npm run studio-server -- backup ./backup.json --config studio.config.json
npm run studio-server -- backup --to-bucket --keep 14 --config studio.config.json
```

Writes the project's tables in one snapshot (members, the journal, the head, the previews, builds and prepared sets;
not the sessions nor the leases), with the blobs they name and a digest.

- `backup <file>`: a new file (mode 0600). An existing file or none: `backup: a new file is required (or --to-bucket
  [--keep n])` (exit 2). Prints `{"event":"backup","revision","blobs","digest"}`.
- `--to-bucket`: to the instance's bucket as `backups/<date>-r<revision>.json` (UTC, `2026-10-19T03-17-00Z`); needs
  `blobs.kind` `s3`. With `--keep n` (1 to 9999), the backups this command wrote past the `n` most recent are deleted,
  never another object; without `--keep`, none is deleted. Prints `{"event":"backup","key","revision","digest",
  "removed"}`. A bad `--keep`: `backup: --keep is the number of backups kept (1 or more)` (exit 2).

What a backup holds, the daily cron and retention: [Backups](clever.backups.md).

<a name="restore"></a>

## `restore <file> [--replay]` and `replay`

```sh
npm run studio-server -- restore ./backup.json --replay --config studio.config.json
npm run studio-server -- replay --config studio.config.json
```

`restore` puts a backup into an **empty** hosted database (`store.kind` `postgres`; a SQLite one is refused), checks
its digest, tables and blobs, then with `--replay` replays the journal shipped to the bucket since the backup.
`replay` resumes a replay that stopped and ends the restore. Both print `{"event":"restored", "rows", "dropped",
"backup", "revision", "stopped"}`. `replay` without a restore under way: `replay: no restore is under way` (exit 1).
The procedure: [Restore the Studio on a fresh installation](clever.restore-drill.md).

<a name="gc"></a>

## `gc [--delete]`

```sh
npm run studio-server -- gc --config studio.config.json
```

Lists the blobs no row names and older than a day, and the worker's staging older than an hour; `--delete` deletes
them. Prints `{"event":"collectable"|"collected", "referenced", "unreferenced", "removed", "staging"}`. The head's and
the journal's blobs are never collected. Never run `gc --delete` from a drill's database: it would collect blobs
production still names.

<a name="worker-command"></a>

## The worker's command

The processing worker is another program: `npm run studio-worker` in the repository, `npx quest-n-click-studio-worker`
from the archives. It has no subcommand; it reads `WORKER_PUBLIC_KEY` (or `WORKER_PUBLIC_KEY_FILE`), `WORKER_INSTANCE` and `PORT`. See
[Command-line tools](reference.cli.md) and [Environment variables](reference.environment-variables.md#studio-worker).

<a name="related"></a>

## Related identifiers

- [Health and metrics routes](team.health-metrics.md), [Roles and actions](team.roles.md).
- [`tests/studio-server.test.ts`](../../tests/studio-server.test.ts) (`import, serve, export through the command`).
