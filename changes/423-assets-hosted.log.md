## 4.2.3 PR 7: the sheets' cutting and the uploads hosted, prepare followed and cancelled (H8)

- **Jobs** (`studio-server/src/server/jobs.ts`): one at a time, four waiting (429 past them); states `queued`,
  `running` (steps `packing`, `on the worker`, `writing`), `done`, `failed`, `cancelled`, emitted in order to the live
  stream (`job` events, `hello.jobs`) and read by `GET /api/jobs/<id>`. `POST /api/jobs/<id>/cancel` (its author or an
  owner): a waiting job never runs, a running one is aborted; its write starts only through `commit()`, past which a
  cancel is a 409, so a job is cancelled with no operation or done with its one operation.
- **The worker** (`worker/main.ts`): a job whose Studio closed its request is not run, or its child is killed with its
  group (`runChild`'s `signal`); nothing is written at the result URL. `remote-executor.ts` passes the job's signal to
  its fetch. New kind `cut` (`worker/cut.ts`, the child): a sheet cut or a cell keyed from a version 2 snapshot of the
  image (`upload/source.<ext>`), the sheet's cells and `site.json` (`snapshot.ts` `packCut`); its answer is refused
  unless every file is a cell of that sheet (`cutShape`).
- **The cut shared** (`tools/studio/cut.ts`): the dev server's copy-and-compare and its keying script moved out of
  `tools/studio/assets.ts`, which now checks an upload in `planSheet` / `planCell` before any cut, and takes where the
  prepared set is (`publicAssets`).
- **Hosted routes** (`http.ts`, `hosted-assets.ts`): `GET /api/assets`, `/assets/prompts`, `/assets/file/*` (a
  reviewer's; files served `nosniff` and `sandbox`); `POST /api/assets/sound|decor` (bounded: 10 MiB once decoded,
  the body by its length first: 413; typed by magic, a sound's extension agreeing: 415; one operation under the
  instance's write lock); `POST /api/assets/sheet|cell` and `/assets/prepare`: checked at once (400, 409 with the
  conflicts, 413, 415), then 202 with the job, run under the member's exclusive lease (`exclusive` in `main.ts`,
  shared with prepare). `PreparedAssets.prepare` takes the job's control: its signal to the worker, `commit()` before
  any blob, row or manifest. Deviation: the uploaded sheet is not kept on a hosted Studio (`private/` has no span).
- **The page**: the Assets tab is shown on a hosted Studio; `assets-io.ts` follows a 202 to its end (`jobs.ts`: the
  `studio-job` events `hosted.ts` passes on, a poll every 3 s, a panel with Cancel); Prepare in the Assets tab and in
  the Play tab is a job.
- Docs: STUDIO-SERVER (en, fr: what is hosted, the bounds, the jobs and the cancel), STUDIO (en, fr: the tab hosted),
  the Studio Server's threat model (an upload as an attack, a long job holding the project).
- Tests: `tests/studio-assets-hosted.test.ts` (413 and 415 with nothing written; an upload one revision; a cut done:
  one revision, the states on the live stream in order, the lease back; a cut cancelled on the worker: no revision,
  the lease back; a recut's backups in the same operation; a waiting job cancelled; a refused answer; prepare
  cancelled and done; no cancel once writing nor by another member; the worker's child killed on a cancel; a real
  cut in the worker's child, skipped without Pillow and numpy); `tests/studio-server.test.ts` (prepare as a job);
  `tests/dom/studio-jobs.test.ts` (the panel, Cancel, a 202 followed to its result or its refusal).
  `scripts/e2e-studio-hosted.ts` wires the hosted Assets tab (not run locally).

**After the second reading**

- S1: `prepareOn` (`prepared.ts`), used by `main.ts` and the e2e stack: the job's signal always reaches the worker's
  prepare (`main.ts` dropped it); tested.
- S2: `serveFile` (`http.ts`): the file opened before its headers, sent by `pipeline`, a file gone meanwhile a 404 and
  never a crash; `filePath` follows links and refuses one out of `art/` or `audio/`; tested.
- L1: `createAssets(…, { confine })`, set on a hosted Studio: the listing reads no source outside the game folder;
  `imageSize` reads the first 64 KiB only.
- L2: `cutShape` accepts only the cells asked (`cutTargets`: those named, else the grid's), each a PNG once decoded;
  tested.
- L3: `followJob` (`src/studio/jobs.ts`): a job the server no longer knows (404, a restart) ends as failed, saying so;
  tested.
- `Jobs.start`: 429 from the fifth waiting job (`>=`), so four wait as documented.
- The threat model's upload row: magic bytes do not stop a polyglot; serving as image or audio with `nosniff` and a
  sandbox CSP does.
- The CHANGELOG fragment says, for scripts, that `/api/assets/prepare` is now 202 and a job to poll.
- `origin/main` merged in (4.2.3 PR 2, the scenario map), no conflict.

**After CI**

- The worker child's cancel test is skipped on Windows (process groups and their signals are POSIX).
- `tests/studio-remote-executor.test.ts`: `cut` and `prepare` against a fake worker over HTTP and a bucket in memory
  (the cells, a deadline 504, a failure 422, an answer out of shape 422, a refused job, no result, a cancel while the
  worker runs, once it answered, and before it is sent; the staging left empty), for the coverage floor of
  `remote-executor.ts`.

→ next: Claude (the next 4.2.3 PR)
