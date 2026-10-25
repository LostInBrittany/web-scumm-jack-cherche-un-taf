# Demo mode and studio-apply

The Studio also runs without any server, on a static host: the demo game's Studio is online at
<https://quest-n-click.cleverapps.io/demo/studio.html>, served by the project's website from the latest release. Your edits stay in
your browser; download them as a patch and `npm run studio-apply` writes them into your copy of the game.

<a name="what-you-get"></a>

## What you get

Edits made in the online demo Studio (texts, layouts, added entities, the storyboard, notes) written into your clone,
through the same operations the local Studio uses.

<a name="context-and-versions"></a>

## Context and versions

The demo Studio (a static build) and the engine repository, where `npm run studio-apply` runs. True from 4.2.5 (the
address above).

<a name="prerequisites"></a>

## Prerequisites

- To apply a patch: the engine repository cloned and installed ([Install from the repository](install.from-repository.md)),
  with the game the patch was made on.

<a name="where-to-run"></a>

## Where to run the commands

The demo runs in your browser. `npm run studio-apply` and the demo build run in the engine repository, on your
machine.

<a name="demo-mode"></a>

## How the demo works

Same UI, same engine view and placement editor as the local Studio; the edits stay in the browser.

- **Build.** `npm run build:studio-demo` (that is `STUDIO=1 VITE_STUDIO_DEMO=1 vite build`); the CI sets both
  variables on its `npm run build`. With `STUDIO=1`, the build first writes `public/studio-demo/snapshot.json`
  ([`tools/studio/snapshot.ts`](../../tools/studio/snapshot.ts), also `npm run studio-snapshot`; ignored by git):
  `{ game, rooms: { <id>: { def, layout, texts, file } }, storyboard, notes, docs: { CONTENT_GUIDE }, assets }`,
  everything the Studio reads from the API. Without `STUDIO=1`, neither `studio.html` nor the snapshot reach `dist/`.
  The Studio's and the dev tools' code goes to `dist/assets/tools/`, outside the service worker's precache.
- **Backend.** [`src/studio/api.ts`](../../src/studio/api.ts) defines the `Api` interface; the dev server's is the
  default. The browser one ([`src/studio/api-browser.ts`](../../src/studio/api-browser.ts)) is used when the build says
  so (`VITE_STUDIO_DEMO=1`) or when `GET /__studio/api/game` answers 404 (or a page instead of JSON). It loads the
  snapshot and replays the edits kept in `localStorage` under `web-scumm.studio-demo.<game>`: a list of patches
  `{ kind: 'text', room, path, value }` (replace, `[+]` append, `null` delete, with the same path shifts as the room
  file), `{ kind: 'layout', room, layout }`, `{ kind: 'entity', room, entity }` (Add prop / hotspot / actor),
  `{ kind: 'storyboard', storyboard }`, `{ kind: 'note', note }`, `{ kind: 'note-edit', id, text, about?, edited }`,
  `{ kind: 'note-delete', id }`. A later layout or storyboard replaces the earlier one; editing or deleting a note
  added in the demo rewrites its `note` patch.
- **Checks.** Validate and Solve run in the page ([`src/engine/tools/validate.ts`](../../src/engine/tools/validate.ts),
  `solve.ts`) on the real game module with the edits applied: layouts, added entities, and every text whose path
  reaches a string of the compiled room (look lines, names, hints, topics, lines of `on` / `talk` / `onEnter`…).
  Export Markdown downloads `storyboard.md`. No events: there is nothing on disk to watch.
- **Engine view.** In a demo build the dev tools load with `?edit` / `?dev` too (and only then: the player's game is
  the same). They apply the same patches to the game and the layouts at start. **Save layout** in the editor posts the
  layout to the Studio around it (`postMessage`, message `saved` with `layout`), which keeps it as a `layout` patch;
  the editor opened alone writes the patch to `localStorage` itself. On the dev server, the editor writes
  `layout/<room>.json` through the Studio's API (`PUT /__studio/api/room/<id>/layout`, one guarded operation of the
  journal); it falls back to the patch only when that API does not exist.
- **Banner.** "Demo: your edits stay in this browser", **Download patch** (`studio-patch-<game>.json`:
  `{ format: 'web-scumm-studio-patch', version, game, created, patches }`) and **Reset demo** (drops every edit).

> [!LIMIT id=demo-limits]
> A text the room builds with code (a shared constant, a helper) is validated only on the server version. Screenshots
> need the dev server: the panel is hidden. The Assets tab is read-only, the voice table, the scenario map and the
> semantic diff are absent, structured edits (`set_value`) need the dev server, and the Assistant has no
> `screenshot`, `run_tests` nor `asset_prompts` ([The Assistant](studio.assistant.md#demo)).

<a name="demo-docs"></a>
<!-- applies: 4.5.0.. -->

### Documentation in the snapshot

From 4.5.0 the snapshot also carries the wiki: a package's bundle when the engine is installed from one, otherwise
the repository's `ready` pages (never a draft). The demo's Assistant reads them with `search_docs`, `list_docs` and
`read_doc` by id; `read_doc` by name still has only `CONTENT_GUIDE`.

<a name="steps"></a>

## Steps

<!-- step: edit -->
1. Edit in the demo Studio. The banner counts what you changed.

<!-- step: download -->
2. **Download patch**: you get `studio-patch-<game>.json`.

<!-- step: apply -->
3. Apply it to your copy:

   ```sh
   # in the engine repository
   npm run studio-apply studio-patch-demo.json
   ```

   It replays the patch through the Studio core (`setText`, `setLayout`, `addEntity`, `setStoryboard`, `addNote`,
   `editNote`, `deleteNote`, in order) and prints one line per patch (`✔` applied, `=` unchanged, `✘` failed, with
   the reason) and a summary: `<n> applied, <n> unchanged, <n> failed (<game folder>).` `GAME=<id>` or
   `GAME_DIR=<folder>` pick the game, as for every tool; a patch made on another game is applied with a warning
   (`⚠ the patch was made on "<game>", the current game is "<game>"`).

> [!GUARANTEE id=apply-replays-demo]
> `studio-apply` writes the demo's edits into a copy of the game, which then reads back as the demo showed it.

<a name="expected-result"></a>

## Expected result, and how to check it

The summary says `0 failed`, the exit code is 0, and `git diff` shows the demo's edits in the room files, the layouts,
`storyboard.json` and `notes.json`. Open `npm run studio` to see them.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `usage: npm run studio-apply <patch.json>` (exit 2) | No file given | Give the patch file |
| `not a Studio patch (expected { format: "web-scumm-studio-patch", patches: [...] })` | Another file | Use the downloaded `studio-patch-<game>.json` |
| A line `✘ …` and exit code 1 | That patch failed (a room renamed, a text moved); the others still applied | Make that edit by hand in the Studio |
| `⚠ the patch was made on "…"` | `GAME` is another game | Set `GAME=<id>` to the patch's game |

<a name="files-changed"></a>

## Files or data changed

In the browser: `localStorage` key `web-scumm.studio-demo.<game>`. In your copy: the room files, `layout/*.json`,
`storyboard.json`, `notes.json` of the game, each patch one operation of the journal.

<a name="recovery"></a>

## Recovery or going back

In the browser, **Reset demo** drops every edit. In your copy, the writes are ordinary files: `git checkout -- games/<id>`.

<a name="references"></a>

## References

- [`studio-server/src/ops/apply.ts`](../../studio-server/src/ops/apply.ts), [`src/studio/demo-patch.ts`](../../src/studio/demo-patch.ts),
  [`src/studio/api-browser.ts`](../../src/studio/api-browser.ts).
- [Play online and try the demo Studio](start.play-online.md).
