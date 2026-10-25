# Hosted assets

On a team Studio the **Assets** tab works on the server: a reviewer reads the listing, the prompts and the files; a
dev uploads sounds and decors, cuts sprite sheets, and prepares the game's images and sounds, as jobs on the worker.
This page gives each action, its bounds, and the routes.

<a name="what-you-get"></a>

## What you get

New art and sounds in the hosted game, each written as one operation; the prepared images and sounds every preview and
build plays; and long work (cuts, Prepare) you can follow and cancel.

<a name="context-and-versions"></a>

## Context and versions

A hosted Studio with its worker: Prepare from 4.2.2, the Assets tab's uploads and cuts and the jobs from 4.2.3. The
code is [`studio-server/src/server/hosted-assets.ts`](../../studio-server/src/server/hosted-assets.ts),
[`prepared.ts`](../../studio-server/src/server/prepared.ts) and [`jobs.ts`](../../studio-server/src/server/jobs.ts).
On a local Studio, see [Assets and cutting](studio.assets.md).

<a name="prerequisites"></a>

## Prerequisites

- `reviewer` to read, `dev` to upload, cut and prepare (see [Roles and actions](team.roles.md#matrix-assets)).
- The worker deployed with its Python packages (its build hook installs `requirements.txt`, hashes checked; see
  [Configuration](clever.configuration.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the Studio, the **Assets** tab, and the **Play** tab for **Prepare assets**. Or through the API with a member's
token.

<a name="steps"></a>

## Steps

<!-- step: upload -->
1. **Upload a sound or a decor** (a dev). A sound is music or an effect (`kind`), an `.ogg`, `.mp3` or `.wav` file
   whose bytes say the same; a decor is a PNG or a JPEG image. It is written as one operation, never run.

<!-- step: cut-sheet -->
2. **Cut a sprite sheet** (a dev). Upload the sheet (a PNG, JPEG or WebP image) with its id and grid (`6x4` by
   default). Cells that already exist are never recut by accident: name the cells to recut (`r1c1,r2c3`), or upload
   into a new sheet id. The cut runs on the worker as a job.

<!-- step: key-cell -->
3. **Replace or key one cell** (a dev): one image for one cell of a sheet, keyed (its background made transparent)
   `auto`, `always` or `never`. Also a job.

<!-- step: prepare -->
4. **Prepare the assets** (a dev). Click **Prepare assets** (Play or Assets tab). The worker runs `prepare` on the
   head's art and sounds; the prepared set is kept by the Studio and served before `publicDir`, and the game's
   `assets.gen.json` is written as one operation. Each run prepares everything again.

<!-- step: follow-job -->
5. **Follow the job.** A cut, a keying or Prepare answers at once (202) with a job; a small panel says where it is
   ("Cutting the sheet", "Keying the cell", "Preparing the assets") with a **Cancel** button.

<a name="jobs"></a>

## Jobs

- The request answers **202** with the job. Its states go to the live stream (`job` events, in order: `queued`,
  `running` with its steps `packing`, `on the worker`, `writing`, then `done`, `failed` or `cancelled`), and
  `GET /api/jobs/<id>` reads it again (the page does when the stream is down).
- **One runs at a time; four more may wait** (429 past them).
- **Cancel** (`POST /api/jobs/<id>/cancel`, who started it, or an owner): a waiting job never runs; a running one has
  its request to the worker closed, and the worker kills its child with its process group; nothing is written (no
  operation, no prepared set kept) and the exclusive lease is given back. Once a job is writing, it is past cancelling
  (409).
- A job lives in the instance's memory: after a restart its state is gone (its write, if it was made, is in the
  journal).
- Cuts and Prepare run **under the exclusive lease** of the member who started them: nobody writes meanwhile, and
  someone else's span refuses them, with their name (the job fails with that 423).

<a name="routes"></a>

## Routes

| Route | Body | Does |
|---|---|---|
| `GET /api/assets` | | the listing |
| `GET /api/assets/prompts[?missing=1]` | | the art prompts (only the images not cut yet with `missing=1`) |
| `GET /api/assets/file/<path>` | | a member's file of `art/` or `audio/`, served with its own type, never run |
| `GET /api/assets/prepared` | | the prepared runs |
| `POST /api/assets/sound` | `{kind: "music" \| "sfx", file, data}` | an upload (200, with the revision) |
| `POST /api/assets/decor` | `{name, data}` | an upload (200) |
| `POST /api/assets/sheet` | `{sheetId, grid?, cells?, data}` | a cut, as a job (202) |
| `POST /api/assets/cell` | `{sheetId, cell, data, key?: "auto" \| "always" \| "never"}` | a keying, as a job (202) |
| `POST /api/assets/prepare` | | Prepare, as a job (202) |
| `GET /api/jobs/<id>`, `POST /api/jobs/<id>/cancel` | | a job read, cancelled |

`data` is the file in base64 (a data URL is accepted).

<a name="bounds"></a>

## Bounds

> [!LIMIT id=upload-bounds]
> An upload is 10 MiB at most once decoded (413 past it). Its type is read from its bytes: a PNG, JPEG or WebP image
> (a decor: PNG or JPEG), an Ogg, MP3 or WAV sound whose extension says the same (415 otherwise). A local Studio also
> takes M4A, FLAC, AAC, Opus and WebM sounds.

> [!LIMIT id=cut-on-worker]
> A sheet's cutting and a cell's keying run on the worker (`cut` jobs, Python with the hook's packages, no game code).
> The worker gets the image, that sheet's cells and `site.json`, and gives back only cells of that sheet; the cells,
> with the backups of those recut, are written as one operation. A hosted Studio does not keep the uploaded sheet
> itself (a local one keeps it under `private/sheets/`, which no span names).

> [!LIMIT id=prepare-bounds]
> Prepare runs within 2 minutes. It is refused, and the game is prepared on a local Studio, when its art and sounds
> pass about 31 MiB (in base64) or the prepared files about 22 MiB; when it names its sources in `sources.json` (they
> live outside the art and sounds a hosted Studio holds); or when the new manifest would lose an image or a sound the
> game had. Published builds serve the prepared set as it is now, not the one they were built against. The game's
> code runs on the worker as the asset tools' user (ADR 0028: one machine, one user).

<a name="expected-result"></a>

## Expected result, and how to check it

An upload or a cut adds a revision (the header moves); the listing shows the new files. After Prepare, the previews
built from then on play the new images and sounds, and `GET /api/assets/prepared` lists the run.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `an upload is 10 MiB at most` (413) | Too big | Compress or split |
| `a sound on a hosted Studio is an .ogg, .mp3 or .wav file` (415) | Another format | Convert it |
| `the file is not MP3 sound: its bytes say otherwise` (415) | The extension lies | Fix the file |
| `a decor is a PNG or a JPEG image` (415) | A WebP or other decor | Convert it |
| `N cell(s) of "<sheet>" already exist: name the cells to recut (cells), or upload into a new sheet id` (409) | Existing cells | Name the cells, or use a new id |
| `too many jobs are waiting: try again when one is done` (429) | Five jobs already | Wait |
| `the assets are being prepared: try again when it is done` (429) | Prepare already runs | Wait |
| `refused: the prepared assets would lose N image(s) or sound(s) the game had (…)` (422) | The asset tools could not find them | Prepare on a local Studio |
| `this game names its sources in sources.json: prepare its assets on a local Studio` | `sources.json` | Prepare locally |
| `too late: the job is writing its result` (409) | Cancel after the write began | Undo the result if needed |
| `preparing the assets needs a hosted Studio with its processing worker` (404) | No worker | Configure the worker |

<a name="files-changed"></a>

## Files or data changed

`art/`, `audio/` (span `assets`), the backups of recut cells, `assets.gen.json`; the prepared set in the bucket and a
row of `studio_prepared`.

<a name="recovery"></a>

## Recovery or going back

Uploads, cuts and Prepare are written without an undo. A file an upload or a cut replaced is kept as a backup (the
answer names it, `backup` or `backups`): to go back, upload that earlier file again, or prepare again. A whole-game return is a restore (see [Backups](clever.backups.md)).

<a name="references"></a>

## References

- [ADR 0028](../../docs/dev/adr/0028-studio-content-execution.md).
- [`tests/studio-assets-hosted.test.ts`](../../tests/studio-assets-hosted.test.ts), [`tests/studio-prepared.test.ts`](../../tests/studio-prepared.test.ts).
