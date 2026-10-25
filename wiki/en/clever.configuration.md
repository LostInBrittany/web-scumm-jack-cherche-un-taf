# Configuration

The Studio Server reads a JSON configuration, which holds no secret, and a few secrets, each from a variable or a
file. This page sets both on the two Clever Cloud apps, and is the reference of `STUDIO_CONFIG_JSON`, field by field.

<a name="what-you-get"></a>

## What you get

The studio app and the worker app carry every variable they need to build and start: the run commands, the build
hooks, the configuration on one line, and the secrets, set from files so that no value is typed or shown.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, deployed from the engine repository, from 4.2.3 (`STUDIO_METRICS_TOKEN`,
  `STUDIO_BACKUP_CRON` and `git` arrived in 4.2.3).
- **Verified on: 19 October 2026, by the reference deployment** (engine at commit 52e68932, then c66fbf56, package.json
  4.2.2 before the 4.2.3 tag): these variables, with `STUDIO_METRICS_TOKEN` and `STUDIO_BACKUP_CRON=1` set, and
  three `*.cleverapps.io` names. This page's exact commands are not verified on a live installation.

<a name="prerequisites"></a>

## Prerequisites

- [Apps and add-ons](clever.apps-addons.md), [Domains and TLS](clever.domains-tls.md), and the provider:
  [Keycloak](clever.keycloak.md) or [Generic OIDC](clever.generic-oidc.md).
- On your machine: the engine repository with `npm ci` done, `openssl`, and an empty folder kept out of Git for the
  secrets (`~/secrets/my-game/` below).

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository where both apps are linked under their alias
([Apps and add-ons](clever.apps-addons.md)).

> [!LIMIT id=clever-env-prints-values]
> `clever env` prints every value, multi-line ones included (a PEM key spans many lines). Never paste its output
> anywhere; filter it to names: `clever env --alias my-game-studio | grep -oE '^[A-Z][A-Z0-9_]*='`.

<a name="steps"></a>

## Steps

<!-- step: job-keys -->
1. Make the job keys. The worker only runs jobs the Studio signs with its private key:

   ```sh
   # on your machine, in the engine repository
   mkdir -p ~/secrets/my-game && npm run studio-server -- worker-keys --out ~/secrets/my-game
   ```

   `studio-worker.key` (0600) is the Studio's, `studio-worker.pub` the worker's. The command refuses to overwrite
   them, and never prints them.

<!-- step: other-secrets -->
2. Make the session key and, if you want `/metrics`, its token:

   ```sh
   # on your machine
   openssl rand -base64 48 > ~/secrets/my-game/session-key && chmod 600 ~/secrets/my-game/session-key
   openssl rand -base64 32 > ~/secrets/my-game/metrics-token && chmod 600 ~/secrets/my-game/metrics-token
   ```

<!-- step: studio-vars -->
3. Set the studio app's plain variables:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-studio CC_NODE_DEV_DEPENDENCIES install
   clever env set --alias my-game-studio CC_POST_BUILD_HOOK "npm run studio-client"
   clever env set --alias my-game-studio CC_RUN_COMMAND "npm run studio-server -- serve"
   clever env set --alias my-game-studio CC_HEALTH_CHECK_PATH /startz
   clever env set --alias my-game-studio STUDIO_BACKUP_CRON 1
   ```

<!-- step: studio-secrets -->
4. Set its secrets from their files. A key's text begins with `-----BEGIN`, which `clever env set` reads as an option
   unless `--` comes first:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-studio -- STUDIO_WORKER_KEY "$(cat ~/secrets/my-game/studio-worker.key)"
   clever env set --alias my-game-studio -- STUDIO_SESSION_KEY "$(cat ~/secrets/my-game/session-key)"
   clever env set --alias my-game-studio -- STUDIO_METRICS_TOKEN "$(cat ~/secrets/my-game/metrics-token)"
   ```

   `STUDIO_OIDC_CLIENT_SECRET` was set with the provider ([Keycloak](clever.keycloak.md#steps)). The database and
   Cellar credentials arrive from the add-ons (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
   `CELLAR_ADDON_KEY_SECRET`): set nothing for them.

<!-- step: studio-config -->
5. Write the configuration in a file, check it, and set it on one line as `STUDIO_CONFIG_JSON`:

   ```studio-config
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

   ```sh
   # on your machine, in the engine repository, the file above saved as ~/secrets/my-game/studio.config.json
   clever env set --alias my-game-studio STUDIO_CONFIG_JSON "$(node -p 'JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")))' ~/secrets/my-game/studio.config.json)"
   ```

   The repository's [`ops/studio/studio.config.example.json`](../../ops/studio/studio.config.example.json) is the same
   example. The configuration holds no secret.

<!-- step: worker-vars -->
6. Set the worker app's variables. `WORKER_INSTANCE` is the configuration's `worker.instance`:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-worker CC_NODE_DEV_DEPENDENCIES install
   clever env set --alias my-game-worker CC_RUN_COMMAND "npm run studio-worker"
   clever env set --alias my-game-worker CC_POST_BUILD_HOOK "python3 -m pip install --target .python --require-hashes --only-binary=:all: -r requirements.txt"
   clever env set --alias my-game-worker WORKER_INSTANCE my-game-studio
   clever env set --alias my-game-worker -- WORKER_PUBLIC_KEY "$(cat ~/secrets/my-game/studio-worker.pub)"
   ```

   The hook installs the asset tools' Python packages (Pillow, NumPy, SciPy) from `requirements.txt`, every hash
   checked, wheels only. Before 4.5.2 it named `ops/studio/worker-requirements.lock`, which is gone: change the hook.

> [!MEASURE id=worker-hook]
> The worker's install, run by hand on the worker app: 7.0 s, 226 MB installed, no compilation. Not measured during a
> real Clever build at the time; the reference deployment then saw the hook take about 7 s in a worker deploy of 36 s.
> - date: 2026-10-19
> - version: 4.2.1
> - volume: Pillow 12.3.0, NumPy 2.4.6, SciPy 1.18.1 (one run, pip cache empty)
> - conditions: worker app of spike S, Clever Cloud test organisation, region par, size XS; installed into a tmpfs folder over SSH
> - source: [QUALIF-4.2.2-ASSETS.md §2](https://github.com/Quest-n-Click/quest-n-click/blob/de8d5b897b1d32c6230c64ab8962d5698952c439/docs/dev/QUALIF-4.2.2-ASSETS.md)

<a name="expected-result"></a>

## Expected result, and how to check it

The names, never the values:

```sh
# on your machine, in the engine repository
clever env --alias my-game-studio | grep -oE '^[A-Z][A-Z0-9_]*='
clever env --alias my-game-worker | grep -oE '^[A-Z][A-Z0-9_]*='
```

The studio lists the variables of steps 3 to 5, `STUDIO_OIDC_CLIENT_SECRET` and the add-ons'; the worker lists those
of step 6 and no add-on variable. The configuration is checked for real when the server starts: a refused one stops it
with a line naming the field ([First deployment](clever.first-deployment.md)).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `clever env set` says an option is unknown | A PEM value without `--` before the name | Step 4's form |
| `<NAME>: the secret is empty or too short (8 characters at least)` | An empty file, or a wrong path in `$(cat …)` | Check the file |
| `a session key is 32 characters or more` | A short `STUDIO_SESSION_KEY` | `openssl rand -base64 48` |
| `STUDIO_METRICS_TOKEN: 32 characters at least (openssl rand -base64 32)` | A short token | Step 2 |
| `STUDIO_CONFIG_JSON: unknown key "…"` | A typo, or a field of a newer version | The field list below |
| `trustProxy is required when the server is reachable beyond the loopback` | `trustProxy` left out with OIDC | Keep it |
| `<NAME>_FILE (…) is readable by others: chmod 600` | A secret file with a loose mode (outside Clever) | `chmod 600` |

<a name="files-changed"></a>

## Files or data changed

- `~/secrets/my-game/`: the keys and tokens (0600), the configuration file.
- The two apps' variables in Clever Cloud. A variable change applies at the next deploy or restart.

<a name="recovery"></a>

## Recovery or going back

`clever env rm <NAME> --alias <app>` removes a variable. Changing a secret later is [Rotating keys](clever.key-rotation.md).

<a name="secrets"></a>

## Reference: how secrets are read

- The secrets are `STUDIO_DATABASE_URL`, `STUDIO_S3_KEY_ID`, `STUDIO_S3_KEY_SECRET`, `STUDIO_OIDC_CLIENT_SECRET`,
  `STUDIO_SESSION_KEY`, `STUDIO_WORKER_KEY`, `STUDIO_METRICS_TOKEN` and `STUDIO_GIT_KEY`.
- Each comes from `<NAME>_FILE` (a file of mode 0600, preferred outside Clever; a looser mode is refused), else from
  `<NAME>`, else, for the first three, from the add-on's own variable (`POSTGRESQL_ADDON_URI`, `CELLAR_ADDON_KEY_ID`,
  `CELLAR_ADDON_KEY_SECRET`).
- At start the server reads each one once, then removes every variable that held it from its environment: no child
  process inherits it, and it is never logged. A value shorter than 8 characters is refused.
- `STUDIO_WORKER_KEY` may have its line breaks written `\n`. `STUDIO_SESSION_KEY` may hold several keys,
  comma-separated, to rotate ([Rotating keys](clever.key-rotation.md)).
- The worker reads `WORKER_PUBLIC_KEY` (or `WORKER_PUBLIC_KEY_FILE`), `WORKER_INSTANCE` and `PORT`, and
  `WORKER_PYTHON_PATH` when the Python packages are not in `.python`.

Each variable has its entry in [Environment variables](reference.environment-variables.md#studio-server).

<a name="where-the-configuration-comes-from"></a>

## Reference: where the configuration comes from

In order: `--config <file>` on the command line; else the file `STUDIO_CONFIG` names; else `STUDIO_CONFIG_JSON`, the
JSON itself (what a platform without files, such as Clever Cloud, uses). Without any, a command says `usage:
studio-server <serve|import <dir>|export <dir>> --config <file> (or STUDIO_CONFIG_JSON)`. In `clever ssh`, the shell
has the app's variables, so no command needs `--config`.

<a name="studio-config-json"></a>

## Reference: `STUDIO_CONFIG_JSON`, field by field

An unknown top-level key is refused at start (`unknown key "…"`). Inside a field, an unknown sub-key is ignored.

| Field | Required | Value | Default |
|---|---|---|---|
| `publicUrl` | yes | the Studio's origin, http(s); the only `Origin` a cookie mutation may carry | — |
| `playUrl` | yes | the game's origin, http(s); must differ from `publicUrl`'s origin | — |
| `game` | yes | the game's id (letters, digits, `_`, `-`); one game per instance | — |
| `workDir` | yes | the instance's working folder (the game materialised, scratch), ephemeral on Clever Cloud: `/home/bas/work` | — |
| `port` | no | the port; **leave it out on Clever Cloud**, which gives `PORT` (a `port` here would override it) | `PORT`, else 8080 |
| `host` | no | the address listened on; without `oidc`, only the loopback is accepted | `0.0.0.0` |
| `trustProxy` | with `oidc` beyond the loopback | addresses or IPv4 networks whose `X-Forwarded-For` / `X-Forwarded-Proto` are believed | `[]` |
| `store.kind` | yes | `postgres` (hosted) or `sqlite` (local, with `store.file`) | — |
| `blobs.kind` | yes | `s3` (with `host`, `bucket`) or `fs` (with `dir`); `s3` with a worker | — |
| `oidc` | for a shared Studio | the provider ([its fields](clever.generic-oidc.md#oidc-fields)); without it, the local server on the loopback | none |
| `sessions.idleHours`, `sessions.absoluteHours` | no | a browser session's idle and absolute lifetimes | 8 and 24 |
| `worker.url`, `worker.instance` | with `oidc` | the worker's URL, and a name of 3 to 64 letters, digits, `_` or `-` (the worker's `WORKER_INSTANCE`) | — |
| `clientDir` | no | the built Studio; with `oidc` the server refuses to start without it | `.cache/studio-client` |
| `publicDir` | no | the game's prepared images and sounds (`npm run assets` writes them, they are committed); the Studio shows them to members and every preview plays them; read only on a hosted Studio | `public/` of the deployed repository |
| `publicBuilds` | no | `true`: the published builds (`/play/` on the game's origin) are open to anyone without a session, with the icons their page names (D42, the owner's choice) | `false` |
| `git` | no | the game's Git repository: `remote` (no credentials in it; the deploy key is `STUDIO_GIT_KEY`), `branch` (`main`), `path` (a folder of the repository), `committer` `{name, email}`, `knownHosts` (without it, trusted on first use) | none |

<a name="trust-proxy"></a>

### `trustProxy` on Clever Cloud

The private ranges of the example (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are an assumption: Clever's
proxies sit in them, so each person is told apart. They are to be narrowed to Clever's actual proxies by the
`studio-hosted` pass. Until then, an address in those ranges could claim any `X-Forwarded-For`, which matters for the
per-address rate limits.

<a name="references"></a>

## References

- The loader: [`studio-server/src/server/config.ts`](../../studio-server/src/server/config.ts); the example:
  [`ops/studio/studio.config.example.json`](../../ops/studio/studio.config.example.json); the commands:
  [`studio-server/src/server/main.ts`](../../studio-server/src/server/main.ts).
- [Environment variables](reference.environment-variables.md#studio-config-json);
  [ADR 0027](../../docs/dev/adr/0027-studio-oidc-sessions-tokens.md) (secrets in variables on Clever).
- Next: [First deployment](clever.first-deployment.md).
