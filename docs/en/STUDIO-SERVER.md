# Studio Server: one game, several people, online

The Studio Server puts a game's Studio online for a small team. Everyone logs in through an OpenID Connect provider
(Keycloak or another), works on the same game at the same time, and sees every change as it lands. It is the 4.2.x
line's work (plan `docs/dev/PLAN-4.2.1-4.2.3-STUDIO-SERVER.md`). Alone on your machine, `npm run studio` stays as
it was: none of this is needed.

> **Status (4.2.2, experimental).** The journal (no confirmed change is lost), logins and roles, the processing
> worker, spans and leases, the live stream, the game's own origin with its previews (one build per revision), the
> health by revision, personal undo, published builds, the assets prepared on the worker, backup and restore, and the
> Studio's screens for all of this; since 4.2.3, the Assets tab's uploads and sheets' cutting, Prepare and the cuts as
> jobs that can be followed and cancelled. It stays experimental until its people's passes (`studio-hosted`, `studio-collab`,
> `studio-preview`, `studio-assets-hosted`) are made. This guide deploys from the repository; the release archive `web-scumm-studio-server` is
> the same server (below).

## What runs where

```text
browsers ─HTTPS─▶ studio (Node app, one instance) ──signed jobs──▶ studio-worker (Node app, no secrets)
CLI, MCP ─Bearer─┘   │  public_url: the Studio and /api        ▲ presigned snapshot and result
                     │  play_url:   the game (another origin)  │
                     ├──▶ PostgreSQL: journal, members, sessions, leases
                     ├──▶ Cellar (S3): the files' contents, the worker's snapshots ─┘
                     └──▶ OpenID provider: who people are (never what they may do)
```

- **The game's files** live in Postgres (which version of each file) and Cellar (their contents). The app's disk
  is a cache: Clever Cloud's disk does not survive a restart, and nothing is lost when it goes.
- **The game's code never runs in the Studio**: validating it and reading it go to `studio-worker`, a second app that
  holds no password, key or database access (ADR 0028).
- **The game is played on another origin** (`playUrl`): its code cannot act with a member's Studio session.

## Deploying on Clever Cloud

You need: two Node.js applications, a PostgreSQL add-on, a Cellar add-on and bucket, and an OpenID provider (a
managed Keycloak add-on works). With `clever-tools`:

```sh
clever create --type node my-game-studio
clever create --type node my-game-worker
clever addon create postgresql-addon my-game-pg --plan dev      # 5 connections: tight (the server keeps 4); larger for a team
clever addon create cellar-addon my-game-cellar
clever service link-addon my-game-pg --app my-game-studio
clever service link-addon my-game-cellar --app my-game-studio
clever scale --min-instances 1 --max-instances 1 --app my-game-studio
```

Create the bucket in Cellar (its console, or any S3 tool). Only the studio app is linked to the add-ons: **never link
them to the worker.** Both apps build from the repository's root: leave `APP_FOLDER` unset (an app that held another
project may still have one: `clever env rm APP_FOLDER`).

`clever deploy` and `clever ssh` act on an app linked in the folder you run them from (clever-tools 4 has no `--app`
for `deploy`): link both once, under an alias, and keep the `.clever.json` this writes out of Git:

```sh
clever link <studio-app-id> --alias my-game-studio
clever link <worker-app-id> --alias my-game-worker
```

**The job keys.** On your machine, in an empty folder kept out of Git:

```sh
mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
```

`studio-worker.key` (0600) is the Studio's; `studio-worker.pub` is the worker's.

**The studio app's variables:**

| Variable | Value |
|---|---|
| `CC_NODE_DEV_DEPENDENCIES` | `install` (the server runs from the repository with `tsx`) |
| `CC_POST_BUILD_HOOK` | `npm run studio-client` (builds the Studio's page the server serves) |
| `CC_RUN_COMMAND` | `npm run studio-server -- serve` |
| `CC_HEALTH_CHECK_PATH` | `/startz` |
| `STUDIO_CONFIG_JSON` | the configuration below, on one line |
| `STUDIO_OIDC_CLIENT_SECRET` | the provider's secret for the `studio` client |
| `STUDIO_SESSION_KEY` | 32 random characters or more (`openssl rand -base64 48`); several, comma-separated, to rotate |
| `STUDIO_WORKER_KEY` | the content of `studio-worker.key` (line breaks may be written `\n`) |
| `STUDIO_METRICS_TOKEN` | optional (4.2.3): 32 random characters or more (`openssl rand -base64 32`); without it, no `/metrics` |
| `STUDIO_BACKUP_CRON` | optional (4.2.3): `1` runs the daily backup to the bucket (`clevercloud/cron.json`); `STUDIO_BACKUP_KEEP` backups kept, 14 by default |

The database and Cellar credentials arrive from the add-ons (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
`CELLAR_ADDON_KEY_SECRET`). At start the server reads every secret and removes it from its environment. Outside
Clever, each can be a file instead: `STUDIO_SESSION_KEY_FILE`, and so on (mode 0600).

Set the secrets from their files, so that no value is typed or shown. A key's text begins with `-----BEGIN`, which
`clever env set` reads as an option unless `--` comes first:

```sh
clever env set --alias my-game-studio -- STUDIO_WORKER_KEY "$(cat ~/secrets/my-game/studio-worker.key)"
clever env set --alias my-game-worker -- WORKER_PUBLIC_KEY "$(cat ~/secrets/my-game/studio-worker.pub)"
```

**The configuration** (`ops/studio/studio.config.example.json`):

```json
{
  "publicUrl": "https://studio.example.fr",
  "playUrl": "https://play.example.fr",
  "game": "my-game",
  "workDir": "/home/bas/work",
  "host": "0.0.0.0",
  "trustProxy": ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  "store": { "kind": "postgres" },
  "blobs": { "kind": "s3", "host": "cellar-c2.services.clever-cloud.com", "bucket": "my-game-studio" },
  "oidc": { "issuer": "https://keycloak.example.fr/realms/web-scumm", "clientId": "studio", "audience": "studio-api", "cliClientId": "web-scumm-cli" },
  "worker": { "url": "https://worker.example.fr", "instance": "my-game-studio" }
}
```

- `publicUrl` and `playUrl` are two domains of the studio app (`clever domain add`). **Use two subdomains of your own
  domain** (`studio.example.fr`, `play.example.fr`): one site, so the game's frame keeps its session cookie in every
  browser. Two `*.cleverapps.io` names are two sites: the game's cookie then lives in a frame of another site only
  because it is partitioned (CHIPS). Chromium, Firefox and WebKit on macOS keep it (the hosted e2e). WebKit on Linux
  (GNOME Web) stores no cookie a frame of another host sets, even on one site: the game's frames stay empty there. A
  real Safari, on macOS and iOS, is the `studio-hosted` pass.
- `trustProxy`: the addresses of Clever's proxies, so that each person is told apart (the server refuses to start
  with OIDC and none). The private ranges above are an assumption, to be narrowed to Clever's actual proxies by the
  `studio-hosted` pass: an address in them could otherwise claim any `X-Forwarded-For`.
- No `port`: the server listens on the `PORT` Clever gives it (a `port` in the configuration would override it).
- `worker.instance`: any name; the worker runs no other Studio's jobs.
- `publicDir` (optional): the game's prepared images and sounds, `public/` of the deployed repository by default
  (`npm run assets` writes them there and they are committed). The Studio shows them to members and every preview
  plays them; they are read only on a hosted Studio.
- `publicBuilds` (optional, `false` by default): the published builds (`/play/` on the game's origin) are open to
  anyone, without a session (D42: the owner's choice per instance), with the icons their page names. Everything else
  there stays behind the session.
- `clientDir` (optional): the built Studio, `.cache/studio-client` by default (`npm run studio-client`). With OIDC the
  server refuses to start without it.

**The worker app's variables:** `CC_NODE_DEV_DEPENDENCIES=install`, `CC_RUN_COMMAND=npm run studio-worker`,
`CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
ops/studio/worker-requirements.lock` (the asset tools' Python packages, every hash checked; measured in
`docs/dev/QUALIF-4.2.2-ASSETS.md`),
`WORKER_PUBLIC_KEY` (the content of `studio-worker.pub`), `WORKER_INSTANCE` (the same name as `worker.instance`).
Give it a domain (`worker.url`).

**Deploy** both, the worker first (`clever deploy --alias my-game-worker`, then `--alias my-game-studio`), then
import the game once, and invite the first owner:

```sh
clever ssh --alias my-game-studio
cd "$APP_HOME"
npm run studio-server -- import games/my-game
npm run studio-server -- invite --email you@example.fr --role owner
```

The shell of `clever ssh` has the app's variables (`STUDIO_CONFIG_JSON`, the add-ons'; measured by the reference
deployment), so neither command needs `--config`. `clever ssh --command '…'` runs one command without a session, but
refuses while a second instance is listed (the old one of a deploy stays `STOPPING` for about two minutes): wait for
it to go. The import sends every file to the bucket (242 s for the demo game, 500 files). The invitation prints a
link: open it and log in with that verified email. `/readyz` answers 200 once the instance serves writes.

`clever logs` follows the logs until it is stopped, even with `--until`: to keep a part of them, run it in the
background and stop it by its process id once you have what you need.

## From the release archives

From 4.2.1 a release carries `web-scumm-studio-server-<version>.tgz`: the two commands `web-scumm-studio-server` and
`web-scumm-studio-worker`, the Studio's page already built, and its own dependencies (OpenID Connect, JWT, Postgres).
Their versions are locked in its `npm-shrinkwrap.json` and its SBOM; npm reads that lock when it installs from the
registry, not from an archive file, where `pg` takes the latest 8.x its range allows (`web-scumm-studio-server deps`
says which). It runs the server of the engine installed beside it, which must be the same version:

```sh
npm install web-scumm-<version>.tgz web-scumm-studio-server-<version>.tgz
npx web-scumm-studio-server import ./my-game --config studio.config.json
npx web-scumm-studio-server serve --config studio.config.json
npx web-scumm-studio-worker          # on the worker's machine, with WORKER_PUBLIC_KEY and WORKER_INSTANCE
```

A worker installed from the archives prepares assets too (since 4.2.3): its build hook installs the lock the engine's
package carries, from the worker's folder, where the worker looks for the packages (`WORKER_PYTHON_PATH` to put them
elsewhere): `CC_POST_BUILD_HOOK=python3 -m pip install --target .python --require-hashes --only-binary=:all: -r
node_modules/web-scumm/ops/studio/worker-requirements.lock`. The lock is for CPython 3.13 on Linux x86_64 with glibc 2.28 or newer
(Clever Cloud's native runtime); another platform makes it again (its header says how). In 4.2.2 this needed a worker
deployed from the repository.

The engine's archive brings Vite and tsx, which the worker needs to run the game's code and build its previews (the
Studio itself no longer runs Vite, since 4.2.2). Set `publicDir` to your
game's prepared assets (`public/` of your game's repository): the engine's own holds only its icons and font. Each
release's candidate installs these two archives in an empty folder and serves a game from them, its dependencies
found whether npm hoists or nests them (`scripts/studio-install-smoke.mjs`).

## The OpenID provider

The test realm `ops/studio/keycloak/realm.json` shows every setting. On any provider:

- **The `studio` client**: confidential, Authorization Code with PKCE S256, redirect URI `<publicUrl>/auth/callback`,
  post-logout redirect `<publicUrl>`, back-channel logout to `<publicUrl>/auth/backchannel` with the session id.
- **The `web-scumm-cli` client**: public, the device authorization grant.
- **An audience mapper** adding `studio-api` (the `audience` above) to the access tokens of `web-scumm-cli`. It must
  differ from the `studio` client's id: an id_token is never accepted as an access token.
- **Access tokens of 5 min.** Up to 15 if the configuration says so (`oidc.maxTokenSeconds`, 900 at most): a longer
  token is refused.

The provider says who someone is. What they may do is decided in the Studio.

**`realm.json` is for a local test.** Before giving it to another Keycloak, change:
- `clients[studio].redirectUris` to `["<publicUrl>/auth/callback"]`;
- `clients[studio].attributes`: `backchannel.logout.url` to `<publicUrl>/auth/backchannel`, and
  `post.logout.redirect.uris` to `<publicUrl>`;
- `clients[studio].secret` to a new random value (`openssl rand -base64 32`), the one you set as
  `STUDIO_OIDC_CLIENT_SECRET`;
- `users`: your own, or none (Keycloak's console adds them), each with a verified email and a password that is not
  the file's.

Keep the file with its secret and passwords out of Git (mode 0600).

**Clever Cloud's managed Keycloak.** `clever keycloak get <addon-id>` gives its
admin console and first credentials. That password is temporary: the first login asks for a new one, and Clever's
console and the add-on's variable (`CC_KEYCLOAK_ADMIN_DEFAULT_PASSWORD`) keep showing the old one afterwards, so keep
the new one where you keep secrets. The admin API does not take that password through the master realm's `admin-cli`
(`401 invalid_client`): `kcadm.sh` and scripts built on it fail as they are. Two ways work:
- in the admin console (`clever keycloak open webui <addon-id>`), **Create realm** and give it the edited
  `realm.json`;
- or with an admin token from a login through the console's own client (`security-admin-console`, Authorization Code
  with PKCE), `POST /admin/realms` with the edited file: what the reference deployment did.

Its issuer is `https://<its host>/realms/web-scumm`. The Studio reads the issuer's discovery at start: it does not
start while the realm is missing.

**Another provider** (4.2.3, D44: GitLab for the `studio-oidc-generic` pass). Any OpenID Connect provider with
discovery serves the browser's logins: give it the `studio` client as above (an application with the scopes `openid
profile email`, the same redirect URIs) and its issuer (`https://gitlab.com` for GitLab). Two parts need more of it:
the CLI and the MCP take the provider's **access tokens as JWTs** signed for this Studio's audience, which a provider
issuing opaque access tokens (GitLab's OAuth applications, at the time of writing) does not give: there, the CLI and
the remote MCP stay with a provider that does (Keycloak, Authentik and others), or are not offered. Without
**back-channel logout**, a session ended at the provider ends here at its next refresh (5 min), and a user disabled
there within R = 15 min (plan §3.6). The `studio-oidc-generic` pass checks this on a real GitLab.

## People and roles

| Role | May |
|---|---|
| `owner` | everything a dev may; members, roles, invitations, sessions, the audit; take a span over; the exclusive lease |
| `dev` | write the game, span by span |
| `reviewer` | read and play |

Nobody is a member by default: an invitation (7 days, used once, for a verified email) makes one. The last owner can
be neither removed nor demoted. Removing someone ends their access at their next request; their live streams close
within 5 s. When the provider disables an account, its sessions end within 15 min.

## Publishing builds

The Play tab's **Publish this revision** has the worker build the player's game from the head (no editing tools),
numbered: build `#n` is served at `/play/<n>/` on the game's origin and never changes. `/play/` is always the last
green build, the latest whose revision the health judged valid (a published revision is judged at publication). Each
build's manifest (the epoch and revision, the snapshot's hash, the worker's engine, commit and lockfile, the assets'
version, the revision's verdict, each file's hash) is signed with the Studio's job key: `GET /api/builds/<n>` gives the
manifest, the exact bytes signed (`signed`) and the signature, made over `web-scumm build manifest v1\n` followed by
those bytes, which `studio-worker.pub` checks. An owner's **Rebuild fresh** builds the same snapshot again, against the
same assets' version, and says whether the files are the same, byte for byte: a check that the build is reproducible
on the worker as it is now, not that its content is harmless. A build's code never changes; its images and sounds are
the instance's prepared assets, served beside it as they are now. A published build has no service worker (it is not
installed for offline play) and its saves are not yet told apart by build.

## Comments (4.2.3)

In the Notes tab of a shared Studio, a member comments on what the game names (a room, `hall.door`, `item:key`, a
rule's id, a storyboard panel), or on the game itself. A comment keeps the revision it was written at; replies make a
thread, resolved or opened again as one. Reviewers comment too: comments are kept by the Studio (in its database, in
the backup), never in a game file, so no game file is written for them. A comment whose anchor the game no longer
names (its rooms, rules, scripts, entities, objectives and checkpoints, the storyboard's boards and panels) is
said "orphan", never attached elsewhere; a line's id is not an anchor. Its author alone changes its text; a reviewer resolves their own
threads, a dev any. An owner brings the notes of `notes.json` in (each once, its `about` the anchor). Routes: GET/POST
`/api/comments`, PUT `/api/comments/<id>`, POST `/api/comments/import-notes`.

## The game in Git (4.2.3)

`git` in the configuration (optional) names the game's repository: `{ "remote": "git@github.com:org/game.git",
"branch": "main", "path": "games/my-game", "committer": { "name": "…", "email": "…" } }` (`branch` defaults to `main`,
`path` to the repository's root). Its deploy key (a key with write access to that one repository, D44) is the secret
`STUDIO_GIT_KEY` (`STUDIO_GIT_KEY_FILE` locally; on Clever Cloud a variable). A public https or a local remote needs
none; a remote URL never carries credentials. The Play tab shows where the game goes and the last revision pushed:

- **Push** (an owner): one commit of the revisions confirmed since the last push, the game's files at the head in
  `path`, each author of those revisions a `Co-authored-by` (their email, or their name at a mailbox that does not
  exist); the rest of the repository is left as it is. Nothing new pushes nothing.
- **Never forced.** A branch that moved since the Studio's last push (someone pushed there) is refused (409), and so is
  a branch that exists but the Studio never imported: import it first.
- **Import** (an owner, asked twice): the branch, another branch of the remote, or a commit by its hash, as it is in
  `path`, written as one revision under the exclusive lease. It replaces what the Studio had not pushed (still in its
  history). The branch's tip imported, the next push builds on it; another commit, the next push goes on the tip the
  Studio knows. A link, a submodule, or a file the game cannot hold refuses the whole import.

The Studio never checks a working tree out: a push builds its commit from objects, an import reads the commit's
objects, so the repository's links, attributes and ignore rules cannot reach the server's files. Files whose path has
a segment starting with a dot (`.github/`, `.gitignore`) are the repository's: kept by a push, skipped by an import. The
game's `private/` never goes to the repository, and an import leaves it as it is. An
author's email goes in a `Co-authored-by` only when the provider verified it; otherwise their name at
`users.noreply.<the Studio's host>`. Git runs with an environment of its own, the key in a file for one command, the
clone in `workDir/git` (made again when the disk is new). Give the remote host's keys as `git.knownHosts`
(`known_hosts` lines) to check them strictly; without them the host is trusted on first use, again after each new
disk.

## Upgrading the engine of a hosted game

A game imported from a 4.1.x project that never ran `web-scumm migrate` is still at authoring schema 2 (no
`schemaVersion: 3`, no stable ids). On a hosted Studio an owner upgrades it with `POST /api/engine/migrate` (4.2.3):

```bash
curl -X POST -H "Authorization: Bearer $(npx web-scumm-studio-server token --server https://studio.example)" \
  https://studio.example/api/engine/migrate
```

- **Exclusive.** It runs under the owner's exclusive lease (`*`): nobody else writes meanwhile (their writes get a 423
  with the owner's name, their drafts stay with them, and they write again once it is done). One at a time (429).
- **On the worker.** The worker runs the same migration as `web-scumm migrate` on the head's snapshot: the stable ids
  written into `rooms/*.ts`, `rules.ts`, `items.ts` and `game.ts`, the translation tables' keys renamed,
  `ids.migration.json` and `ids.paths.json`, then the three lines UPGRADING leaves to the author in `game.ts`
  (`schemaVersion: 3`, `saveVersion` + 1, `migrations: [..., idsMigration]` and its import: all three or none, said in
  `skipped`). `defineGame({...})` must be in `game.ts` (a game that defines it elsewhere is refused: migrate it
  locally). Nothing is written yet, and nothing but those files: the Studio refuses an answer that names another file,
  or a file the game does not have (the game's code runs before the migration and could shape it).
- **Judged before it is written.** The migrated game is judged on the worker as the health judges a revision: the
  validator, then the solver from a new game, bounded in time. A game the migration would break (an id the tool could
  not write, a list built by code, a game that can no longer be finished), or that the solver cannot judge in time, is
  refused with a 422 (`errors`, `skipped`: what the tool could not write) and the head stays as it was: migrate it on a
  local Studio (`web-scumm migrate`, then `npm run ids` to see what is left) and import it again, or fix it first.
- **One revision.** Otherwise the changed files are written as one operation (`engine upgrade: authoring schema 2 →
  3`), through the guard, and the answer is `{ revision, changed, paths, schema: { from, to } }` (`paths`: the files
  written). A game already at schema 3
  answers `{ changed: 0 }` and nothing is written.
- **Taken back.** The owner's Undo takes it back, as a new revision (409 if someone wrote one of its files since); or
  the project goes back to a backup taken before (see below): take one first.

In the 4.2.x line the content format is frozen (D40): this is for a game made on 4.1.x. A local Studio has no route:
run `web-scumm migrate` in the project. The project's `tsconfig.json` (`baseUrl`, which `web-scumm migrate` also
fixes) is not part of a hosted game and is left alone. The playtests (`playtests/`) are neither migrated nor judged:
replay them after the upgrade (a session recorded at schema 2 may name the old positional keys). There is no button yet: the route is the way in.

## Backup and restore

- **The journal shipped**: each confirmed operation is copied to the bucket, in order, as an immutable segment
  (`journal/<epoch>/<line>/<rev>.json`; the contents are blobs already; a failure is retried within 30 s). `/readyz`
  gives `rpoMs`, the age of the oldest operation not shipped yet (0 when everything is): the target is 1 min (D42),
  measured, never claimed. The line is `0`, then new after each restore: the revisions a restored instance writes
  again never overwrite the segments of the timeline it left.
- **A backup**: `npm run studio-server -- backup <file> --config <file>` writes the project's tables in one snapshot
  (members, the journal, the head, the previews, builds and prepared sets; not the sessions nor the leases: a restore
  logs everyone out; only confirmed operations), with the blobs they name and a digest. Daily (D42), kept off the
  instance. A backup is trusted input, like the database's credentials: it can add owners. Its digest says it is
  whole, not who made it; keep it where only operators write.
- **To the bucket** (4.2.3): `npm run studio-server -- backup --to-bucket --keep 14 --config <file>` writes it to the
  instance's bucket as `backups/<date>-r<revision>.json` (UTC, `2026-10-19T03-17-00Z`), then deletes the backups it
  wrote past the 14 most recent (never another object). The daily cron runs it ("Running it", below). It survives the
  database, not the bucket: a copy elsewhere is yours to make.
- **A restore**: a hosted instance only, into an empty database (a new Postgres add-on, the same bucket):
  `npm run studio-server -- restore <file> --replay --config <file>` checks the digest, the tables and columns, and
  that every blob of the head and of the journal is in the bucket (a preview, build or prepared set whose blobs were
  collected since is left out, and counted as `dropped`), writes the rows, then replays the journal shipped since the
  backup. Each replayed operation must continue the head (its revision, each file's previous content, its blobs);
  the replay stops at the first that does not (`stopped`: `gap`, `not-the-head`, `blob-missing`…). If it fails
  midway, the server refuses to start until `npm run studio-server -- replay --config <file>` resumes it. Start the
  server: the folder is made from the head. Replayed operations keep no answer: a client retrying one gets `null`.
  Take a new backup after a restore: the next ones replay on the new line.
- **The drill**: on a test instance, back up, write two changes, wait for `rpoMs` 0, drop the database, restore with
  `--replay`, start, and check the head is the last change.
- **The collection**: `npm run studio-server -- gc --config <file>` lists the blobs no row names (older than a day)
  and the worker's staging older than an hour; `--delete` deletes them. A blob stored again gets a new date, so a
  write naming an old blob is covered by the day of grace. The head's and the journal's blobs are never collected (the
  journal keeps every operation); an older backup restored after a collection only loses the previews, builds and
  prepared sets the collection took.

## Running it: the reference deployment

4.2.3 runs this deployment on Clever Cloud (the two apps, PostgreSQL, Cellar, Keycloak, a domain) and writes what it
measured in `docs/dev/QUALIF-4.2.3-REFERENCE.md`. What follows is the runbook it follows.

**Deploy, and upgrade the engine: an overlapping redeploy.** `clever deploy` (or a push) starts the new instance while
the old one still serves: measured by spike S (`docs/dev/SPIKE-4.2.1-CLEVER.md` §2), where the old instance also never
logged its SIGTERM. Nothing depends on that signal: the instances share the **service lease** in PostgreSQL (master plan
§4, P8). The new one starts, answers `/startz`, and waits: `/readyz` is 503 and its writes are 503 with `Retry-After`
until the old one gives the lease back (on SIGTERM) or the lease expires (30 s, renewed every 10 s on the database's
clock); the old one stops writing by its own clock before that. A client retries a write with the same operation id
and gets it applied once. The journal's own fenced lease still keeps two instances from writing over the same head.

What the reference deployment measured (`docs/dev/QUALIF-4.2.3-REFERENCE.md` §5): Clever keeps the old instance
`STOPPING` for about two minutes after the new one is up, and it logged no `stopping` line: it kept renewing the lease
meanwhile, and the new one took it about 30 s after the old one was gone. **Writes are refused (503, `Retry-After: 2`)
for about two and a half minutes per deploy**, reads go on; a write retried with its operation id goes through once
after. While both instances start and run, they hold twice the connections: on the `dev` plan (5) a write may fail
with "too many connections" (a 500) or wait on the starting instance's journal check (a 409 after 20 s); take a larger
plan for a deployment people use.

Upgrading the engine is the same redeploy, of a new version:
1. read the CHANGELOG for the version and `docs/en/UPGRADING.md` for the game's content. Its database migrations run
   when the new instance starts, while the old one may still serve: if one changes what the old version reads, stop
   the old one first (`clever stop`) and accept the minute without the Studio;
2. take a backup to the bucket (below) and note the revision;
3. deploy the worker first, then the studio, the same version: until both are, a job may be refused, and the Studio
   then refuses the write it was checking (it fails closed) rather than letting it through;
4. watch `/readyz` come back to 200 on the new instance (`instance` in the `lease-taken` log line), the revision
   unchanged, and one write go through.
A rollback is the same redeploy of the previous version, as long as it still reads the database the new one migrated;
otherwise it is the backup of step 2, restored into a new add-on (the drill below).

**Metrics.** With `STUDIO_METRICS_TOKEN` set, `GET /metrics` on the Studio's origin answers in Prometheus' text format
to `Authorization: Bearer <token>` (compared in constant time); a wrong token is a 401, and without the variable there
is no route (404). It is never behind the session and never on the game's origin, where any request without the
game's session is refused before its path is read (a 401, "open the game from the Studio"). What it gives:

| Metric | What |
|---|---|
| `studio_journal_operation_seconds{outcome}` | the journal's operations, from asked to answered (`confirmed`, `replayed`, `refused`, `failed`) |
| `studio_worker_jobs_in_flight` | the jobs asked of the worker and not answered yet: the queue as the Studio sees it |
| `studio_worker_job_seconds{kind,outcome}` | the worker's jobs by kind (`validate`, `load`, `preview`, `prepare`, `lint`, `solve`, `playtests`) and outcome (`ok`, `failed`, `timeout`, `error`) |
| `studio_lease_conflicts_total` | the 423s answered: someone else's span, or a lease that ended |
| `studio_preview_build_seconds{outcome}` | a revision's preview, snapshot to stored files (`built`, `failed`) |
| `studio_health_judgement_seconds{verdict}` | the health's verdict on a revision |
| `studio_journal_rpo_seconds` | the age of the oldest operation not shipped to the bucket (the `rpoMs` of `/readyz`) |
| `studio_journal_revision`, `studio_service_lease_held` | the head, and whether this instance serves writes (1) |
| `studio_http_responses_total{class}`, `studio_log_events_total{event}` | answers by status class; the failures logged (`ship-failed`, `health-failed`, `reconcile-failed`, `error`…) |

They are counts and durations: no path, no name, no author, no content. They live in the instance's memory, so a
restart starts them again from zero (a counter reset, which Prometheus' `rate` reads as such). The worker's own queue
is not measured from the worker: the Studio's side of it is. OpenTelemetry is not supported in 4.2.3; it stays an
option for later.

**Alerts** (to a person). Clever Cloud notifies deployments (`clever notify-email add --notify <you> --event
DEPLOYMENT_FAIL studio-deploys`; also `clever webhooks add`), and its console shows each app's CPU, memory and logs.
It does not read `/metrics`: a scraper you run does (Prometheus with its Alertmanager, or any service that reads the
format), or a simple prober for `/readyz`. Alert when:
- `/readyz` is not 200 for 5 min (no instance serves writes; a deploy keeps writes away for about 2.5 min, above);
- `studio_journal_rpo_seconds` is above 60 for 5 min (the target is 1 min, D42), or `ship-failed` keeps rising;
- `studio_worker_jobs_in_flight` stays above 3 for 10 min (the worker runs one job at a time: work is piling up);
- jobs fail: `studio_worker_job_seconds_count{outcome!="ok"}` rises, or `health-failed`;
- `studio_lease_conflicts_total` jumps (people waiting on each other's spans: not a fault, a sign to look at);
- the daily backup's line (`"event":"backup"`) is missing from the logs one morning.

**The daily backup.** The repository carries `clevercloud/cron.json`: at 03:17 UTC every day it runs
`ops/studio/backup-cron.sh`, which does nothing unless the app sets `STUDIO_BACKUP_CRON=1`, and nothing on another
instance than number 0 (Clever runs a repository's crons on every app and every instance deployed from it: set the
variable on the studio app only, never the worker). It runs `backup --to-bucket --keep ${STUDIO_BACKUP_KEEP:-14}`; its
line goes to the app's logs. From the release archives (which do not carry the script), copy `ops/studio/backup-cron.sh`
into your app with its last line as `exec npx web-scumm-studio-server backup --to-bucket --keep
"${STUDIO_BACKUP_KEEP:-14}"`, make it executable, and point your `clevercloud/cron.json` at it: `["17 3 * * *
$ROOT/backup-cron.sh"]`. Clever runs a cron with no environment unless its script starts with `#!/bin/bash -l`, and with
absolute paths only (`$ROOT` is the app's folder). An overlapping redeploy at that minute may make two backups:
harmless.

**The restore drill**, onto a fresh PostgreSQL add-on, the production instance left alone:
1. Note the head (`studio_journal_revision`, or `GET /api/revision` as a member) and check
   `studio_journal_rpo_seconds` is 0.
2. Create an add-on and link it to nothing: `clever addon create postgresql-addon my-game-pg-drill --plan dev`; read
   its URI with `clever addon env <addon-id>`.
3. Take the latest `backups/` object from the bucket (any S3 tool, with the Cellar credentials), on a machine with the
   studio app's configuration (`STUDIO_CONFIG_JSON`, the Cellar variables) and `STUDIO_DATABASE_URL` set to the
   **drill** add-on's URI. Never the production one: a restore refuses a database that holds anything, but check anyway.
4. Time it: `time npm run studio-server -- restore backups-latest.json --replay`. The line it prints gives the rows,
   the backup's revision, the revision reached, and `stopped` if the replay stopped early.
5. Check, read-only, on both databases (`psql <URI>`): `SELECT value FROM studio_meta WHERE key = 'revision'` gives
   the head noted in step 1 (or later, if people wrote meanwhile), and `SELECT path, blob FROM studio_files ORDER BY
   path` gives the same rows at the same revision. Without access to the production database, compare as a member:
   `GET /api/ops?after=0` (paged by `next`) gives each operation's revision and id, to set beside the drill's
   `SELECT rev, op_id FROM studio_ops WHERE state = 'confirmed' ORDER BY rev`, and a file's content read through the
   API beside its blob in the bucket.
6. Write the time, the revisions and anything odd in the qualification report, then delete the add-on
   (`clever addon delete my-game-pg-drill`). Never run `gc --delete` from the drill's database: it would collect the
   blobs production still names.

## Working together

- **Spans.** Every file of the game belongs to one span: a room (its code and its layout), a language, the story, the
  items, the cast, the rules, the voices, the assets, the notes, the scenario map's groupings, the rest (`meta`).
  Writing a file takes its span for 2 min, renewed while you are active. Someone else's span refuses your write (423,
  with their name); your draft stays with you.
- **Live.** The Studio follows `GET /api/events`: every revision, who holds what, who is here.
- **What you read** (4.2.3). A write carries the revision its editor read (`x-studio-base`; a read's answer says its
  revision in `x-studio-revision`). If someone else wrote one of its files since, the write is refused (409) with that
  file as you read it and as it is now (the writes since of the same tab, CLI or MCP session never refuse it; your other tab's, or an agent's of yours, do). The Studio shows what changed and
  keeps your draft. For an edit the server makes on the file (a text, a value, a note, a voice) it offers to apply it
  on the latest version; for a whole document (a room's layout, the storyboard) it offers to replace theirs with
  yours, and says so. Nothing is sent again unless you ask. Limits: the check is per file (two notes edited at once
  are one file); the room view's placement is checked against what the Rooms tab read, while the view may still show
  an older preview for a moment; a script that sends no `x-studio-base` is not checked this way.
- **Undo is yours** (4.2.2): Undo and Redo (and Ctrl/Cmd+Z, Shift for redo) undo your own last operation, whatever
  the others wrote meanwhile, as a new revision (history is never rewritten). Refused when someone else wrote one of
  its files since (409), or holds its span (423, with their name). A new edit of yours drops your redo. Your stack is
  kept by the server: another tab, a restart, another instance see the same.

## The command line

```sh
npm run studio-server -- login --server https://studio.example.fr   # the device flow: open the link, type the code
npm run studio-server -- token --server https://studio.example.fr   # an access token for scripts and the MCP
```

The tokens are kept in `~/.config/web-scumm/studio-tokens.json` (0600), and only sent over https. An AI agent works on
the Studio through its `/mcp` (4.2.3), or the local MCP server pointed at it (`npm run -s mcp -- --server <url>`):
`docs/en/MCP.md`, "A hosted Studio". The tokens must carry the Studio's `oidc.audience`.

## Trying it locally

`ops/studio/compose.yml` starts Postgres, MinIO and Keycloak with the test realm and one test user
(`lea@example.org`, password `lea-local-only`, email verified). It is a starting point, not a turnkey setup: with
OIDC you still need a configuration with `oidc.allowInsecure: true` (a provider over http), a MinIO bucket, a worker
(`npm run studio-worker`) and `trustProxy`. Docker is never required. The server also runs without OIDC, with
SQLite and a folder for the contents, on the loopback only.

## Known limits

- One game per instance, one instance (the server takes a lease; a second one waits).
- The game in the Studio is the preview of a revision (4.2.2): after each change the worker builds the head (a burst of
  changes builds its last revision only), and the room view loads it once built, unless a placement is not saved.
  Meanwhile the frames show the last ready preview, and the label under the room view says which revision it is, the one
  building, and a revision that does not build, with its reason. A save made in other content asks before it is resumed:
  Resume here, Restart, or Stay in its own revision (ADR 0026). The Play tab keeps the preview it loaded until "Load the
  latest preview".
- A preview is built from the game's text files only (sources, data): a game whose code imports a stylesheet or an
  image cannot be previewed.
- The diagnostics that run the game's code (lint, solve, playtests) run on the worker, with the game's own commands
  (4.2.2); the solver stops after 45 s there and says it was cut short. Every read says the revision it was made at:
  the Check tab shows it, and marks its results stale once the head has moved on.
- A read's revision is the journal's head: an instance that does not hold the lease yet (a deploy) may answer from a
  folder behind it, and a new history (an import, a restore) is not told apart from an older revision.
- The header says the game's health at a revision (4.2.2): the validator, then the solver from a new game (45 s at
  most), on the worker, after each burst of changes. When a revision fails where the last judged one passed, a
  bisection over the revisions between them names the first that fails, with what its operation did and its files
  (never who made it), in at most ⌈log₂ n⌉ judgements; a dev can ask for one between two revisions at or before the
  head (`POST /api/health/bisect {good, bad}`). A solver cut short says "unknown", never "valid", and stops a
  bisection; a revision that fails to be judged five times says "cannot be judged", with its reason. An older
  verdict is shown greyed, never green. A Check run holds the instance's reads while the
  worker runs its diagnostics: a write waits for it.
- The worker runs one job at a time, and each revision now asks it for three: a preview's build, the validator and a
  solver run (up to 45 s): the next change's validation can wait for them (not yet measured on a Clever worker, the
  `studio-preview` pass does). A bisection asks for up to two jobs per revision it judges.
- Each revision's preview is kept (about 1 MB for the sample game: the base `/preview/<rev>/` is written into the
  page and its code, so few files are shared between revisions) until the collection of a later 4.2.2 PR.
- The Assets tab is on a hosted Studio since 4.2.3: a reviewer reads its listing, prompts and files; a dev uploads and
  cuts. An upload (a sound, a decor) is 10 MiB at most once decoded (413 past it) and its type is read from its bytes:
  a PNG, JPEG or WebP image (a decor: PNG or JPEG), an Ogg, MP3 or WAV sound whose extension says the same (415
  otherwise; a local Studio also takes M4A, FLAC, AAC, Opus and WebM); it is written as one operation, never run. A
  sheet's cutting and a cell's keying run on the worker (`cut` jobs, Python with the hook's packages, no game code),
  under the project's exclusive lease: the worker gets the image, that sheet's cells and `site.json`, gives back only
  cells of that sheet, and the cells with the backups of those recut are written as one operation. A hosted Studio
  does not keep the uploaded sheet itself (a local one keeps it under `private/sheets/`, which no span names).
- The Play tab's (and the Assets tab's) **Prepare assets** (a dev, 4.2.2) runs `prepare` on the worker from the
  head's art and sounds, under the project's exclusive lease (nobody writes meanwhile; someone else's span refuses
  it, with their name): the prepared set is kept by the Studio and served before `publicDir`, and the game's
  `assets.gen.json` is written as one operation. Each run prepares everything again, within 2 minutes. It is refused,
  and the game is prepared on a local Studio, when: its art and sounds pass about 31 MiB (in base64) or the prepared
  files about 22 MiB; it names its sources in `sources.json` (they live outside the art and sounds a hosted Studio
  holds); the new manifest would lose an image or a sound the game had. Published builds serve the prepared set as it
  is now, not the one they were built against. The game's code runs on the worker as the asset tools' user (ADR 0028:
  one machine, one user).
- Prepare and the cuts are **jobs** (4.2.3): the request answers 202 with the job at once; its states go to the live
  stream (`job` events, in order: `queued`, `running` with its steps `packing`, `on the worker`, `writing`, then
  `done`, `failed` or `cancelled`) and `GET /api/jobs/<id>` reads it again. One runs at a time, four more may wait
  (429 past them). `POST /api/jobs/<id>/cancel` (who started it, or an owner) cancels it: a waiting job never runs; a
  running one has its request to the worker closed, and the worker kills its child with its process group; nothing
  is written (no operation, no prepared set kept) and the exclusive lease is given back. Once a job is writing, it is
  past cancelling (409). A job is kept in the instance's memory: after a restart its state is gone (its write, if it
  was made, is in the journal).
- A game frame left idle past its 15 min session shows nothing new: "Reload view" (or the Play tab) opens it again.
- Captures are not available on a hosted Studio.
- The Play tab shows the game with its DEV panel; the state inspector, the rule explainer and the replays beside it
  need the game on the Studio's origin, so the local Studio only.
- The Assistant is not on a hosted Studio yet.
- The Studio's editors do not yet send the revision of what they read (the journal checks it when sent): within a span
  you hold, your save replaces the file. Editors reload what others commit, so this matters only for an edit begun
  just before a span changed hands.
- The room editor's own Save does nothing on a hosted Studio: "Save layout" in the Studio saves (the editor's page is
  the game's, and only the member starts a write).
- A game that imports files outside its own folder cannot run on the worker.
