# Rotating keys

How to replace each secret of a hosted Studio, and what each change does to the people logged in: the session key,
the worker's job key, the provider's client secret, the Git deploy key and the metrics token.

<a name="what-you-get"></a>

## What you get

A new secret in place, the old one retired, and no one logged out unless you choose to (a compromised session key).

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3 (`STUDIO_GIT_KEY` and `STUDIO_METRICS_TOKEN` arrived in 4.2.3).
- **Verified on: not verified on a live installation.** No rotation was exercised on the reference deployment. The
  effects on sessions are read from the code; the session key's are backed by the test named below.

<a name="prerequisites"></a>

## Prerequisites

- [Configuration](clever.configuration.md) done, the current secrets in `~/secrets/my-game/` (0600).
- `openssl`, and the engine repository with `npm ci` done.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository where both apps are linked. A variable change applies at the next deploy or
restart, and a redeploy is the overlap of [Redeploys](clever.redeploys.md): plan its minute of slow writes. Never show
`clever env`'s output: it prints values ([Configuration](clever.configuration.md#where-to-run)).

<a name="steps"></a>

## Steps

<a name="session-key"></a>

### `STUDIO_SESSION_KEY`

The session cookie is a random token stored by its hash: it does not depend on this key. The key seals each session's
refresh token and id_token (AES-256-GCM). It is a ring, comma-separated: the **first** key seals, **any** key opens.

<!-- step: session-prepend -->
1. Make a new key and put it **first**, the old one after:

   ```sh
   # on your machine, in the engine repository
   openssl rand -base64 48 > ~/secrets/my-game/session-key.new && chmod 600 ~/secrets/my-game/session-key.new
   clever env set --alias my-game-studio -- STUDIO_SESSION_KEY "$(cat ~/secrets/my-game/session-key.new),$(cat ~/secrets/my-game/session-key)"
   clever restart --alias my-game-studio
   ```

   Nobody is logged out. New logins are sealed with the new key; existing sessions still open with the old one.

<!-- step: session-drop-old -->
2. After the sessions' absolute lifetime (24 h by default, `sessions.absoluteHours`), every session sealed with the
   old key has ended. Remove it from the ring, and keep the new file as the current one:

   ```sh
   # on your machine, in the engine repository
   mv ~/secrets/my-game/session-key.new ~/secrets/my-game/session-key
   clever env set --alias my-game-studio -- STUDIO_SESSION_KEY "$(cat ~/secrets/my-game/session-key)"
   clever restart --alias my-game-studio
   ```

**If the key leaked**, skip the ring: set the new key alone and restart. Each session's next check by the provider
(within 5 min) cannot open its refresh token, and the session ends: the member sees "the session can no longer be
checked: log in again" (401) and logs in again. The Bearer tokens of the CLI and the MCP are not sealed with this key
and are not affected.

> [!GUARANTEE id=unreadable-session-ends]
> A session whose sealed refresh token can no longer be opened (its key left the ring) ends at its next check, with a
> 401, rather than living unchecked to its absolute lifetime.

<a name="worker-key"></a>

### `STUDIO_WORKER_KEY` and `WORKER_PUBLIC_KEY`

The Studio signs every job with the private key; the worker accepts only jobs its public key checks. The worker holds
one public key at a time, so there is a window during which jobs are refused.

<!-- step: worker-new-pair -->
3. Make a new pair in a new folder (the command refuses to overwrite a key):

   ```sh
   # on your machine, in the engine repository
   mkdir -p ~/secrets/my-game/keys-new && npm run studio-server -- worker-keys --out ~/secrets/my-game/keys-new
   ```

<!-- step: worker-switch -->
4. Set both variables, then deploy the worker and the studio one right after the other:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-worker -- WORKER_PUBLIC_KEY "$(cat ~/secrets/my-game/keys-new/studio-worker.pub)"
   clever env set --alias my-game-studio -- STUDIO_WORKER_KEY "$(cat ~/secrets/my-game/keys-new/studio-worker.key)"
   clever restart --alias my-game-worker
   clever restart --alias my-game-studio
   ```

   Between the two, the worker refuses the old Studio's jobs (403): writes that need a check are refused with a 503
   ("the edit cannot be judged now: …"), previews and the health fail and are tried again. Sessions are not affected.

> [!LIMIT id=builds-old-key]
> The published builds keep the signature made with the old key; their manifest names that key by its id (a hash of
> the public key). Keep the old `studio-worker.pub` to check builds published before the rotation.

<a name="oidc-secret"></a>

### `STUDIO_OIDC_CLIENT_SECRET`

<!-- step: oidc-regenerate -->
5. Regenerate the `studio` client's secret at the provider (in Keycloak: the client's Credentials tab), save it to the
   0600 file, set it, and restart the studio at once:

   ```sh
   # on your machine, in the engine repository
   clever env set --alias my-game-studio -- STUDIO_OIDC_CLIENT_SECRET "$(cat ~/secrets/my-game/oidc-client-secret)"
   clever restart --alias my-game-studio
   ```

   Until the restart, new logins fail. The provider then answers the sessions' checks `invalid_client`, which the
   Studio treats as its own misconfiguration, not the user's: a session lives on up to R (15 min) after its last check,
   then is suspended (503) until the secret matches again. Nobody is logged out once the restart is done in time.

<a name="git-key"></a>

### `STUDIO_GIT_KEY`

<!-- step: git-key -->
6. Add a new deploy key to the game's repository at your Git host, set it, restart, then remove the old key at the
   host:

   ```sh
   # on your machine, in the engine repository (ssh-keygen writes the pair; the .pub goes to the Git host)
   ssh-keygen -t ed25519 -N '' -C my-game-studio -f ~/secrets/my-game/git-deploy-key-new
   clever env set --alias my-game-studio -- STUDIO_GIT_KEY "$(cat ~/secrets/my-game/git-deploy-key-new)"
   clever restart --alias my-game-studio
   ```

   No effect on sessions. A push or an import during the switch may fail and is run again.

<a name="metrics-token"></a>

### `STUDIO_METRICS_TOKEN`

<!-- step: metrics-token -->
7. Make a new token (32 characters or more), set it, restart, and give it to your scraper. Between the restart and the
   scraper's update, `/metrics` answers 401: expect a gap in the graphs.

<a name="expected-result"></a>

## Expected result, and how to check it

- Session key: members keep working after step 1; after step 2, a session older than the ring's change would have
  ended anyway.
- Worker key: a write that needs a check goes through again, and a preview builds; the worker logs no
  `worker-job-refused`.
- OIDC secret: a new login works; `/auth/me` answers.
- Git key: a push from the Studio succeeds.
- Metrics token: the scraper's target is up again.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `a session key is 32 characters or more` at start | A short key in the ring | `openssl rand -base64 48` |
| Everyone logged out within 5 min | The old session key removed at once (no ring) | Expected for a leaked key; otherwise use step 1 first |
| Writes 503 "the edit cannot be judged now: the processing worker refused the job (403…)" | The worker and the studio hold different keys | Finish step 4 on both apps |
| 503 "the identity provider cannot be reached: the session is suspended" | The OIDC secret changed at the provider, not yet in the Studio for more than R | Set the new secret and restart |
| `clever env set` reads the key as an option | No `--` before the name | The commands' form |

<a name="files-changed"></a>

## Files or data changed

The apps' variables; the key files in `~/secrets/my-game/`; at the provider and the Git host, the client secret and
the deploy keys. Sessions end only in the leaked-key case.

<a name="recovery"></a>

## Recovery or going back

Each step is undone by setting the previous value back and restarting, as long as you kept its file. A session key
removed from the ring cannot be brought back for the sessions it sealed: they have ended.

<a name="references"></a>

## References

- The ring: [`studio-server/src/server/auth/store.ts`](../../studio-server/src/server/auth/store.ts) (`Sealer`); the
  checks: [`studio-server/src/server/auth/gate.ts`](../../studio-server/src/server/auth/gate.ts); the refresh errors:
  [`studio-server/src/server/auth/oidc.ts`](../../studio-server/src/server/auth/oidc.ts); the job keys:
  [`studio-server/src/worker/job.ts`](../../studio-server/src/worker/job.ts); the builds' signature:
  [`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts).
- [`STUDIO_SESSION_KEY`](reference.environment-variables.md#studio-session-key),
  [`STUDIO_WORKER_KEY`](reference.environment-variables.md#studio-worker-key),
  [`STUDIO_GIT_KEY`](reference.environment-variables.md#studio-git-key),
  [`STUDIO_METRICS_TOKEN`](reference.environment-variables.md#studio-metrics-token).
- The test behind the guarantee: [`tests/studio-auth.test.ts`](../../tests/studio-auth.test.ts).
