# Costs and teardown

What a hosted Studio is made of on your Clever Cloud bill, and how to delete all of it once the game is safe elsewhere.

<a name="what-you-get"></a>

## What you get

An organisation with nothing left of the Studio: no app, no add-on, no bucket, no DNS record pointing at Clever Cloud,
and no secret of it left on your machine; with the game kept outside, beforehand.

<a name="context-and-versions"></a>

## Context and versions

- A hosted Studio on Clever Cloud, from 4.2.3.
- **Verified on: not verified on a live installation.** The spike's and the reference deployment's resources were
  kept for later passes (D44), not deleted; this teardown has not been exercised.

<a name="costs"></a>

### What you pay for

No price was measured by this project (no invoice, no dated price list in the repository). What a deployment holds,
to price on Clever Cloud's pricing page on the day:

| Resource | The reference deployment's size |
|---|---|
| The `studio` app | Node.js XS, 1 instance (2 during each redeploy, for a few minutes) |
| The `studio-worker` app | Node.js XS, 1 instance (2 during each redeploy) |
| PostgreSQL | plan DEV, too small for a team ([Apps and add-ons](clever.apps-addons.md#postgresql-sizing)) |
| Cellar | plan S; the bucket grows for good with previews and the journal ([Retention](clever.retention.md)) |
| Keycloak | managed, plan BASE |
| A drill's PostgreSQL add-on | for the time of a drill, if you delete it after |

<a name="prerequisites"></a>

## Prerequisites

- **The game out first**: [Exporting the game and leaving the installation](clever.export-leave.md), with a copy of the
  bucket kept elsewhere. Everything below is irreversible.
- Tell the members: their sessions, tokens and invitations stop working.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, in the engine repository where the apps are linked (`clever …`); the bucket with an S3 tool; the DNS
records at your DNS provider.

<a name="steps"></a>

## Steps

<!-- step: stop-cron -->
1. Stop the daily backup, so nothing writes to the bucket while you empty it:

   ```sh
   # on your machine, in the engine repository
   clever env rm STUDIO_BACKUP_CRON --alias my-game-studio
   clever stop --alias my-game-studio
   clever stop --alias my-game-worker
   ```

<!-- step: empty-bucket -->
2. With an S3 tool and the Cellar credentials, empty the bucket (`sha256/`, `journal/`, `backups/`, `staging/`), then
   delete it. Check your copy elsewhere opens before you do.

<!-- step: delete-addons -->
3. Delete the add-ons (a drill's too, if one is left):

   ```sh
   # on your machine, in the engine repository
   clever addon delete my-game-pg
   clever addon delete my-game-cellar
   clever addon delete my-game-pg-drill
   ```

   The managed Keycloak is an add-on too: delete it the same way if it serves nothing else, or only its `web-scumm`
   realm in its admin console.

<!-- step: delete-apps -->
4. Delete both applications:

   ```sh
   # on your machine, in the engine repository
   clever delete --alias my-game-studio
   clever delete --alias my-game-worker
   ```

<!-- step: dns-and-secrets -->
5. Remove the DNS records of `studio.`, `play.` and `worker.` at your DNS provider; delete `.clever.json` from the
   repository folder and `~/secrets/my-game/` (the job keys, the session key, the tokens, the realm file); remove the
   CLI's entry for the server from `~/.config/web-scumm/studio-tokens.json`; at your Git host, remove the Studio's
   deploy key.

<a name="expected-result"></a>

## Expected result, and how to check it

`clever applications list` and `clever addon` no longer list them; Clever Cloud's console shows no resource of the
Studio; `https://studio.example.fr` no longer resolves to Clever Cloud.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The bucket cannot be deleted | It still holds objects | Empty it first (step 2) |
| `clever delete` asks which app | No alias given | `--alias` |
| A backup appears after you emptied the bucket | The cron ran on an instance still up | Step 1 first, then empty again |

<a name="files-changed"></a>

## Files or data changed

Everything of the installation is deleted: apps, database, bucket, Keycloak realm or add-on, domains, secrets. Only the
export and the copies you made remain.

<a name="recovery"></a>

## Recovery or going back

None from Clever Cloud once deleted. With the backup and the bucket copy you kept, a new installation of the same
version can be restored ([restore drill](clever.restore-drill.md)); with the exported folder, a new one can import the
game, as a new history.

<a name="references"></a>

## References

- [Overview](clever.overview.md), [Retention](clever.retention.md), [Exporting the game](clever.export-leave.md).
- The resources measured: [`docs/dev/QUALIF-4.2.3-REFERENCE.md`](../../docs/dev/QUALIF-4.2.3-REFERENCE.md) §1;
  [`docs/dev/SPIKE-4.2.1-CLEVER.md`](../../docs/dev/SPIKE-4.2.1-CLEVER.md).
