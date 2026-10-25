# Trying it locally with compose.yml

You want to see the Studio Server work before hosting it. In ten minutes, on your machine, you will run it in its
simplest mode (no login, SQLite and a folder), import a game, write through its API, watch the journal, and export the
game back. Then you will see what `ops/studio/compose.yml` adds to try the full team mode.

<a name="what-you-will-build"></a>

## What you will build

A Studio Server on `127.0.0.1:8787` holding one game at revision 1, then 2 after your first write, and a folder with
that game exported at its head. Every step prints something you can check.

<a name="what-you-need"></a>

## What you need

- The engine repository with its dependencies installed (`npm ci`), and Node 22.12 or newer (see
  [Requirements](install.requirements.md)).
- `curl`. Docker is never required; it only serves the optional part at the end.

<a name="steps"></a>

## Steps

<!-- step: config -->
1. **Write a configuration** without `oidc`: the server is then the local one, on the loopback only, with SQLite and a
   folder for the contents. Save it as `/tmp/studio-try/studio.config.json`:

   ```studio-config
   {
     "publicUrl": "http://127.0.0.1:8787",
     "playUrl": "http://127.0.0.1:8788",
     "game": "template",
     "workDir": "/tmp/studio-try/work",
     "host": "127.0.0.1",
     "port": 8787,
     "store": { "kind": "sqlite", "file": "/tmp/studio-try/work/journal.sqlite" },
     "blobs": { "kind": "fs", "dir": "/tmp/studio-try/work/blobs" }
   }
   ```

   `playUrl` must be another origin than `publicUrl`, even here. Then create the folder:

   ```sh
   # anywhere
   mkdir -p /tmp/studio-try/work
   ```

<!-- step: import -->
2. **Import a game.**

   ```sh
   # in the engine repository
   npm run studio-server -- import games/_template --config /tmp/studio-try/studio.config.json
   ```

   *You see* `{"event":"imported","game":"template","revision":1}`.

<!-- step: serve -->
3. **Start the server** (it stays in the foreground; use a second terminal for the next steps):

   ```sh
   # in the engine repository
   npm run studio-server -- serve --config /tmp/studio-try/studio.config.json
   ```

   *You see* `{"event":"lease-taken",…}` then `{"event":"listening","host":"127.0.0.1","port":8787,…}`.

<!-- step: probe -->
4. **Ask it how it is.**

   ```sh
   # anywhere on the machine
   curl http://127.0.0.1:8787/readyz
   curl http://127.0.0.1:8787/api/revision
   ```

   *You see* `{"ok":true,"writes":"served"}` (this instance serves writes) and `{"epoch":"…","revision":1}`.

<!-- step: write -->
5. **Write through the API**, with an operation id, twice:

   ```sh
   # anywhere on the machine
   curl -i -X POST -H 'content-type: application/json' -H 'x-studio-op: try-local-0001' \
     -d '{"text":"hello from curl"}' http://127.0.0.1:8787/api/notes
   curl -i -X POST -H 'content-type: application/json' -H 'x-studio-op: try-local-0001' \
     -d '{"text":"hello from curl"}' http://127.0.0.1:8787/api/notes
   ```

   *You see* the first answer with `x-studio-revision: 2`; the second, the same answer with `x-studio-replayed: 1`:
   the write was applied once.

<!-- step: journal -->
6. **Read the journal and the diff.**

   ```sh
   # anywhere on the machine
   curl "http://127.0.0.1:8787/api/ops?after=1"
   curl http://127.0.0.1:8787/api/diff/1..2
   ```

   *You see* operation 2 writing `notes.json`, and the diff naming the note's fields added.

<!-- step: stop -->
7. **Stop the server** with Ctrl+C in its terminal. *You see* `{"event":"stopping","signal":"SIGINT"}`.

<!-- step: export -->
8. **Export the game** at its head:

   ```sh
   # in the engine repository
   npm run studio-server -- export /tmp/studio-try/exported --config /tmp/studio-try/studio.config.json
   ```

   *You see* `{"event":"exported","revision":2,"files":…}`, and `/tmp/studio-try/exported/export-manifest.json` with
   each file's hash. Delete `/tmp/studio-try` when you are done.

> [!LIMIT id=no-oidc-mode]
> Without OIDC there is no login, no member and no role: anything that can reach the loopback writes. So the server
> refuses any address but the loopback. There are no spans, leases, comments, previews nor published builds (they need
> a team Studio), and the Studio's browser page needs a login this mode does not have: use the API here, and
> `npm run studio` for a local Studio in the browser.

<a name="full-mode"></a>

## The full team mode with compose.yml

[`ops/studio/compose.yml`](../../ops/studio/compose.yml) starts, on the loopback only, Postgres (`127.0.0.1:55432`,
user `studio`), MinIO, an S3 store (`127.0.0.1:59000`), and Keycloak (`127.0.0.1:58080`) with the test realm
`web-scumm` and one test user, `lea@example.org`, password `lea-local-only`, email verified:

```sh
# in the engine repository
docker compose -f ops/studio/compose.yml up -d
```

It is a starting point, not a turnkey setup. On top of it you still need:

- a configuration with `oidc` (issuer `http://127.0.0.1:58080/realms/web-scumm`, clients `studio` and
  `web-scumm-cli`) and `oidc.allowInsecure: true`, since the provider answers over http; the realm's `studio` client
  expects its callback at `http://localhost:8080/auth/callback`, so `publicUrl` is `http://localhost:8080` unless you
  edit the realm;
- `store.kind` `postgres` with `STUDIO_DATABASE_URL`, and `blobs.kind` `s3` on MinIO with a bucket you create and
  `STUDIO_S3_KEY_ID` / `STUDIO_S3_KEY_SECRET`;
- the secrets `STUDIO_OIDC_CLIENT_SECRET` (the realm's) and `STUDIO_SESSION_KEY`;
- a worker (`npm run studio-worker`, with `WORKER_PUBLIC_KEY` and `WORKER_INSTANCE`), its keys made by
  `worker-keys`, and `worker` in the configuration with `STUDIO_WORKER_KEY`;
- the Studio's page built: `npm run studio-client`;
- `trustProxy` if the server listens beyond the loopback.

> [!LIMIT id=compose-not-verified]
> This full local mode is not exercised end to end by the project's tests: CI's hosted e2e runs the server with a test
> provider in its own process. Browsers keep `Secure` cookies over http on the loopback unevenly (WebKit keeps none);
> the e2e serves Firefox and WebKit over https with a certificate made for the run. The reference deployment is Clever
> Cloud: see [First deployment](clever.first-deployment.md).

<a name="what-you-learned"></a>

## What you learned

- A write is an operation with an id, applied once ([Concepts](team.concepts.md#transaction)).
- Every change moves the revision, and the journal lists it ([Concepts](team.concepts.md#revision)).
- `export` gives the game back at its head ([The server's command line](team.server-cli.md#export)).

<a name="next"></a>

## Where to go next

- [What runs where](team.what-runs-where.md): the parts of a hosted Studio.
- [Clever Cloud: overview](clever.overview.md), then [First deployment](clever.first-deployment.md).
