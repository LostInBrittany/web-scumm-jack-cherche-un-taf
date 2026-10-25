# Publishing builds

On a team Studio, a dev publishes the game at the current revision as a numbered build that never changes, served on
the game's origin for the team (or for anyone, if the owner chose so). This page says how to publish, what a build
holds, how to check its signature, and how an owner checks it can be rebuilt.

<a name="what-you-get"></a>

## What you get

Build `#n`, the player's game at one revision (no editing tools), at `/play/<n>/` on the game's origin, with a signed
manifest. `/play/` always opens the last green build.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio (the Studio Server) with its worker, from 4.2.2. The code is
[`studio-server/src/server/builds.ts`](../../studio-server/src/server/builds.ts). To release a game outside the
Studio, see [Build and release](create.build-release.md).

<a name="prerequisites"></a>

## Prerequisites

- The `dev` role to publish, `owner` to rebuild fresh (see [Roles and actions](team.roles.md#matrix-assets)).
- The game's assets prepared, if they changed (**Prepare assets**, see [Hosted assets](team.hosted-assets.md#steps)):
  a build serves the instance's prepared images and sounds.

<a name="where-to-run"></a>

## Where to run the commands

In the Studio, the **Play** tab, panel **Published builds**. Or through the API with a member's token.

<a name="steps"></a>

## Steps

<!-- step: publish -->
1. **Publish.** Click **Publish this revision**. The worker builds the player's game from the head; its number is
   reserved first, so two publications never share one. The revision is judged (the validator, then the solver, as
   the health judges it) unless it was already. Through the API: `POST /api/builds`.

<!-- step: open -->
2. **Open it.** Each build is listed with its number, its revision, who made it, when, and its revision's verdict
   (green when judged valid). Its link opens `/play/<n>/` on the game's origin.

<!-- step: share -->
3. **Share it.** `/play/` on the game's origin always redirects to the last green build: the latest whose revision
   the health judged valid, as judged now. With `"publicBuilds": true` in the configuration (off by default; the
   owner's choice per instance, D42), `/play/…` and the icons it names open to anyone, without a session; everything
   else on the game's origin stays behind the session.

<!-- step: verify -->
4. **Check its signature** (optional). `GET /api/builds/<n>` gives `{manifest, signed, signature}`. The signature is
   Ed25519, made with the Studio's job key over the bytes `web-scumm build manifest v1\n` followed by `signed`;
   `studio-worker.pub` (the worker's public key) checks it:

   ```js
   // node verify-build.mjs build.json studio-worker.pub, where build.json is the answer of GET /api/builds/<n>
   import { createPublicKey, verify } from 'node:crypto';
   import { readFileSync } from 'node:fs';
   const b = JSON.parse(readFileSync(process.argv[2], 'utf8'));
   const key = createPublicKey(readFileSync(process.argv[3]));
   const data = Buffer.from(`web-scumm build manifest v1\n${b.signed}`);
   console.log(verify(null, data, key, Buffer.from(b.signature, 'base64url')) ? 'valid' : 'INVALID');
   ```

<!-- step: rebuild -->
5. **Rebuild fresh (owner).** **Rebuild fresh** builds the same snapshot again, against the same assets' version, and
   says whether the files are the same, byte for byte (`build.json`, which says what built it, is compared apart).
   The published build does not change; the comparison is kept with it. Through the API:
   `POST /api/builds/<n>/rebuild`, answering `{n, same, differ}`.

<a name="manifest"></a>

## What a build's manifest holds

| Field | What |
|---|---|
| `n`, `epoch`, `rev` | the build's number, the project's history and the revision |
| `snapshot` | the sha256 of the snapshot it was built from |
| `engine`, `commit`, `lockfile` | what built it, as the worker said: its engine's version, its commit, its lockfile's sha256 (`unknown` when the worker did not say) |
| `assets` | the prepared assets' version it was built against |
| `health` | the revision's verdict at publication: `ok`, `failed` or `unknown` |
| `files` | each file of the build and its sha256 |
| `key` | the signing key: the first 16 hex digits of the sha256 of its public key |

> [!GUARANTEE id=build-never-changes]
> A rebuild compares the files byte for byte with the published build, and the published build never changes.

> [!LIMIT id=build-limits]
> A fresh rebuild checks that the build is reproducible on the worker as it is now, not that its content is harmless.
> A build's code never changes, but its images and sounds are the instance's prepared assets, served beside it as they
> are now, not as they were. A published build has no service worker: it is not installed for offline play. Its saves
> are not yet told apart by build. One publication or rebuild at a time (429 while one runs).

<a name="expected-result"></a>

## Expected result, and how to check it

The build appears in the list with its number and a green verdict once judged valid; `/play/<n>/` opens it; `/play/`
redirects to the last green one. `GET /api/builds` lists them, latest first (100 at most).

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `a build is being made: try again when it is done` (429) | Another publication or rebuild runs | Wait |
| `/play/` answers `no build is green yet` (404) | No build's revision was judged valid | Fix the game, publish again |
| `build <n> belongs to another history of the game (an import or a restore since)` (409) | A rebuild after an import or restore | Publish a new build |
| `build <n>: the revision's snapshot rebuilt from the journal is not the one published` (409) | The journal does not give back the same snapshot | Report it: the build stays as published |
| `published builds are a hosted Studio's` (404) | No worker configured | Builds need a hosted Studio with its worker |
| 503 `this instance does not serve writes yet` | A redeploy | Try again in a few seconds |

<a name="files-changed"></a>

## Files or data changed

A row of `studio_builds` (the manifest and its signature) and the build's files in the bucket, by content. No game
file and no revision.

<a name="recovery"></a>

## Recovery or going back

A build cannot be deleted or replaced: publish a newer one. `/play/` follows the last green build, so a build whose
revision is later judged failing stops being the one `/play/` opens.

<a name="references"></a>

## References

- [Concepts: published build](team.concepts.md#build), [health](team.health-metrics.md#game-health).
- [Hosted assets](team.hosted-assets.md).
- [`tests/studio-builds.test.ts`](../../tests/studio-builds.test.ts).
