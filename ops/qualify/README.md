# The Bridge's qualification profile (4.1.18)

A reproducible deployment of the reference Bridge in the topology `wiki/en/bridge.install-run.md` calls distributed: an
HTTPS proxy, three Bridge instances, one Postgres, two tenants. It is the profile `npm run ops:qualify` drives in CI
and the one the human pass `bridge-postgres-https` runs behind a real domain for 24 to 48 hours. It is an example an
operator can carry elsewhere, not a promise that Docker Compose is secure everywhere, and not a hosted service.

```text
client ──HTTPS──▶ proxy (Caddy) ──▶ bridge-1 ─┐
                   :8443 every Bridge  bridge-2 ─┼──▶ Postgres 16
                   :8444-8446 one each bridge-3 ─┘
```

- **Built from the candidate's tarball** (`quest-n-click-bridge-<version>.tgz`), never from a checkout: the image is the
  package, its production dependencies and the Postgres peer.
- **Nothing resolved at build time** (4.1.19): the image installs its dependencies, `pg` and OpenTelemetry's API
  included, with `npm ci` from a lock kept in the repository (`scripts/locks/quest-n-click-bridge-image.json`, made by
  `npm run locks` from the root lock). The candidate builds it **once** (`scripts/bridge-image.mjs build`) and saves it
  with three identities: its config digest (what runs), its OCI manifest digest and the SHA-256 of the saved archive
  (what was carried). `--image-from=<dir>` loads that archive and checks them instead of building; the release
  publishes the same archive, its identities and its SBOM.
- **The proxy unprivileged** (4.1.19): Caddy runs as the operator's uid, its image read-only, its certificates and
  configuration in bounded tmpfs (a new local CA at each start). It keeps one capability, the one its binary carries as
  a file capability (`cap_net_bind_service`), without which the kernel will not run it.
- **Every image pinned by digest**, pulled from `mirror.gcr.io` (the same digests as Docker Hub's official images; a
  shared runner meets Docker Hub's anonymous rate limit).
- **The Bridges** run as the operator's uid, read-only, with a bounded `/tmp`, no capability, no new privilege, limits
  on processes and memory; the tenants' directories (keys and tokens, files of mode 600) are mounted read-only.
- **Secrets are files**: the database password (`POSTGRES_PASSWORD_FILE`) and the store URL (`BRIDGE_STORE_FILE`,
  4.1.18), never environment values a process listing shows.
- **Three networks**: `public` (the proxy's ports, bound to 127.0.0.1), `edge` (the proxy and the Bridges) and
  `store` (the Bridges and Postgres), the last two internal: Postgres and the Bridges' ports are never published.
- **Health**: each Bridge's `/readyz` is its container health check and the proxy's upstream check.

## The qualification

```sh
npm run ops:qualify -- [--tarballs=<candidate packages>] [--image-from=<candidate image>] [--short] [--candidate-run=<id>] [--out=.cache/field/deployment] [--keep]
```

It writes the environment the profile needs (`QUALIFY_*`), initialises two tenants with the package's own `init`
and `grant`, brings everything up and checks, writing `ops-qualify.json`:

1. every image pinned by digest;
2. six players paired over HTTPS (three per tenant), as a game and a connector pair them;
3. 120 proposals through the proxy while `bridge-2` is killed then started again, every fifth one sent twice:
   each applied once, the repeats said duplicates;
4. every player's sequence contiguous from 1, and a stream held on `bridge-1` receiving, in order and once, what the
   other instances accepted;
5. a tenant's capability and connector token refused by the other tenant;
6. (4.1.19) tenant a keeps a leaderboard: the daily token alike on the three instances; a Mystery committed on one
   and revealed alike on the others; the reference run submitted on `bridge-1`, verified by the speedrun worker (from
   this checkout, mounted read-only at `/srv/app`: the worker is not in the Bridge's archive) and read on `bridge-3`;
   the same run again refused as a duplicate; a moderator's bearer (a token file, mode 600) ranks it, another is
   refused; `bridge-2` and `bridge-3` paused, a run claimed by `bridge-1`, `bridge-1` killed while its worker verifies:
   another instance takes the run when its lease ends and verifies it once; one submission quota for the three
   instances (refused past `perMinute`, wherever the requests land); the board read through the proxy after 20 000
   runs written in SQL;
7. `backup` (schema 3: tenants, runs and daily records in one snapshot), the whole topology destroyed with its
   database volume, a new empty database, `restore` by a one-off container (before the instances, which would
   register their tenants), the instances up: every player's signals, the board and the daily token as before, and a
   new proposal continuing the sequence;
8. a store made by the published 4.1.17 Bridge (its archive checked against its release's SHA-256), in a database of
   its own, read by this Bridge: schema 4, nothing to migrate (the two releases share their schema).

What it does not do, said as such: the 24 to 48 hours behind a real domain are a person's pass; the verification
worker here runs as the Bridge's child inside the Bridge's own confined container (`worker-container` judges the
worker's own container profile, and `tests/bridge-runs-worker.test.ts` a worker killed alone, its Bridge alive: the
run answered `inconclusive`, never retried); here the whole instance is killed, worker included; the volume is
written in SQL, not submitted (each submission is a worker's run).

`--short` (a pull request's `deployment-smoke`; since 4.1.20 a candidate started by hand runs the full profile, and its gate refuses less) leaves out the long steps: the lease takeover, the quota's minute, the
volume (200 runs instead of 20 000) and the 4.1.17 store; the `qualify` workflow runs them all. `--old-bridge=<tgz>`
gives the 4.1.17 archive offline.

**Rootful Docker.** The Bridges run as the operator's uid so they can read the tenants' files (mode 600): `ops:qualify`
sets `QUALIFY_UID`/`QUALIFY_GID`; by hand, set them to your own (`id -u`, `id -g`), else 1000 is assumed. Rootless
Docker and Podman map that uid elsewhere and the files are unreadable: not supported by this profile.

**The client's address.** The proxy has a fixed address on `edge` (172.30.18.2) and the Bridges trust it alone
(`--trust-proxy=172.30.18.2`): the per-address limits see each client, not the proxy.

## Behind a real domain

Replace the Caddyfile's site addresses by the domain (`bridge.example.org { reverse_proxy … }`): Caddy then obtains a
public certificate. Keep the per-instance ports off the internet (they are for the qualification). The database
password and URL stay in files outside the repository, mode 600 (the password readable by Postgres's user); back up
with `backup` (every tenant) and `pg_dump` (the database), and rehearse the restore above before the long run.

**Upgrading.** A new Bridge version may bring a schema migration (`bridge/migrations/`): stop every instance, run
`migrate` once (or let the first instance open the store), then start the new instances. Two versions with different
schemas never serve one database at the same time: a database newer than a Bridge is refused by it.
