# Known limits

What the team Studio (the Studio Server) does not do, or does only within bounds, as of the current code. Each limit
says where it applies; the pages linked give the details.

<a name="instance"></a>

## One game, one instance

> [!LIMIT id=one-instance]
> One game per instance, and one instance serving writes at a time: the server takes a service lease, and a second
> instance waits for it. During a redeploy writes are refused for a short while (see [Redeploys](clever.redeploys.md)).

<a name="previews"></a>

## Previews

> [!LIMIT id=preview-of-a-revision]
> The game in the Studio is the preview of a revision (4.2.2): after each change the worker builds the head (a burst of
> changes builds its last revision only), and the room view loads it once built, unless a placement is not saved.
> Meanwhile the frames show the last ready preview, and the label under the room view says which revision it is, the
> one building, and a revision that does not build, with its reason. A save made in other content asks before it is
> resumed: Resume here, Restart, or Stay in its own revision (ADR 0026). The Play tab keeps the preview it loaded until
> "Load the latest preview".

> [!LIMIT id=preview-text-only]
> A preview is built from the game's text files only (sources, data): a game whose code imports a stylesheet or an
> image cannot be previewed.

> [!LIMIT id=preview-kept]
> Each revision's preview is kept, with no expiry: `gc` never collects a blob a preview names. The base
> `/preview/<rev>/` is written into the page and its code, so few files are shared between revisions (under 1 MB of
> code per revision for the demo game: a design figure, not a measure, from
> [the 4.2.2 preview spike](../../docs/dev/SPIKE-4.2.2-PREVIEW.md), 18 Oct 2026).

> [!LIMIT id=game-frame-idle]
> A game frame left idle past its 15-minute game session shows nothing new: "Reload view" (or the Play tab) opens it
> again.

<a name="diagnostics"></a>

## Checks and health

> [!LIMIT id=diagnostics-on-worker]
> The diagnostics that run the game's code (lint, solve, playtests) run on the worker, with the game's own commands
> (4.2.2); the solver stops after 45 s there and says it was cut short. Every read says the revision it was made at:
> the Check tab shows it, and marks its results stale once the head has moved on.

> [!LIMIT id=read-revision]
> A read's revision is the journal's head: an instance that does not hold the lease yet (a deploy) may answer from a
> folder behind it, and a new history (an import, a restore) is not told apart from an older revision.

> [!LIMIT id=health-bounds]
> The header's health at a revision runs the validator, then the solver from a new game (45 s at most), on the worker,
> after each burst of changes. A bisection names the first failing revision in at most ⌈log₂ n⌉ judgements, never who
> made it. A solver cut short says "unknown", never "valid", and stops a bisection; a revision that fails to be judged
> five times says "cannot be judged". An older verdict is shown greyed, never green. A Check run holds the instance's
> reads while the worker runs its diagnostics: a write waits for it. See
> [Health and metrics routes](team.health-metrics.md#game-health).

<a name="worker"></a>
<!-- applies: 4.4.0.. -->

## The worker's capacity

> [!LIMIT id=worker-lanes]
> The worker runs one job at a time per lane (4.4.0): a preview's build (or a published build) in its own lane, every
> other kind in the other, so two children at most at once. Each revision asks it for three jobs: a preview's build,
> the validator and a solver run (up to 45 s); the preview no longer waits behind the other two, and the next change's
> validation can still wait for them. A bisection asks for up to two jobs per revision it judges. Each lane holds 8
> jobs at most (running or waiting); the next is refused (429).

> [!LIMIT id=snapshot-shared]
> Since 4.4.0 one snapshot per revision is packed (under the lock, the folder repaired) and shared by the preview, the
> health, the published builds and the engine's upgrade, given again while the head has not moved. Its files are
> stored 8 at a time, and a blob this instance stored less than an hour ago is not written again. The Studio answers
> as soon as it has read the worker's result, its staging deleted after. What each phase takes is in the `preview` log
> line and in `studio_preview_phase_seconds`. Vite's cache is not kept between jobs: a `vite build` does not use it,
> and a folder the game's code writes in must not outlive its job (ADR 0028).

> [!LIMIT id=outside-folder]
> A game that imports files outside its own folder cannot run on the worker.

<a name="assets"></a>

## Assets, Prepare and jobs

> [!LIMIT id=assets-hosted]
> Uploads are 10 MiB at most once decoded, typed by their bytes: PNG, JPEG or WebP images (a decor: PNG or JPEG), Ogg,
> MP3 or WAV sounds (a local Studio also takes M4A, FLAC, AAC, Opus and WebM). A hosted Studio does not keep an
> uploaded sheet itself. Prepare is refused, and the game is prepared on a local Studio, past about 31 MiB of art and
> sounds (in base64) or about 22 MiB of prepared files, with a `sources.json`, or when the new manifest would lose an
> image or a sound. Published builds serve the prepared set as it is now. One job runs at a time, four more wait (429
> past them); a job's state is lost at a restart. See [Hosted assets](team.hosted-assets.md).

<a name="local-only"></a>

## What only the local Studio has

> [!LIMIT id=local-only-features]
> Captures (and the diff's before/after captures) are not available on a hosted Studio. The Play tab shows the game
> with its DEV panel; the state inspector, the rule explainer and the replays beside it need the game on the Studio's
> origin, so the local Studio only. The Assistant is not on a hosted Studio yet. A hosted Studio's MCP offers no
> screenshots, test suite, documentation or asset prompts ([Remote MCP](team.remote-mcp.md#tools)).

<a name="editing"></a>

## Editing

> [!LIMIT id=base-revision-scope]
> Since 4.2.3 the Studio's editors send the revision of what they read (`x-studio-base`) with each write that belongs
> to a read (a room, the storyboard, the notes, the groupings, the voices…), and a file someone else wrote since is a
> 409. The check is per file. A write that derives a file (the storyboard's Markdown export) sends none. The CLI's and
> the MCP's clients send none either: their writes are made on the file as it is, within the span rules
> ([409](team.write-refused-409.md)).

> [!LIMIT id=room-editor-save]
> The room editor's own Save does nothing on a hosted Studio: "Save layout" in the Studio saves (the editor's page is
> the game's, and only the member starts a write).

> [!LIMIT id=groupings-span-by-hand]
> The span `groupings` (the scenario map) is taken by a write like any other, but it cannot be taken ahead, released or
> taken over by hand: the API's list of span names does not include it (400, "`spans` is a list of span names"),
> although the Spans panel lists it.

> [!LIMIT id=undo-not-for-all]
> Undo takes back your own undoable operations only. Uploads, cuts, Prepare, a Git import and the rename of the former
> name are written without an undo: a backup taken before is their way back.

<a name="people"></a>

## People and access

> [!LIMIT id=people-limits]
> Three fixed roles, no per-room right. A pending invitation cannot be withdrawn. The audit API gives the 200 latest
> entries, without paging. No command-line subcommand manages members ([Managing members](team.members.md#not-possible)).
> A provider that issues opaque access tokens (GitLab's OAuth applications, at the time of writing) serves the browser
> but not the CLI nor the remote MCP ([Generic OIDC and GitLab](clever.generic-oidc.md)).

> [!LIMIT id=browsers]
> CI runs the hosted e2e on Chromium and Firefox; WebKit on macOS keeps the game's partitioned cookie, and is run by
> hand only (the support matrix of 4.4.0, 23 Oct 2026). WebKit on Linux (GNOME Web) stores no cookie a
> frame of another host sets: the game's frames stay empty there. A real Safari, on macOS and iOS, is the
> `studio-hosted` human pass, not yet made.

<a name="related"></a>

## Related identifiers

- [What runs where](team.what-runs-where.md), [Concepts](team.concepts.md).
- [Clever Cloud troubleshooting](clever.troubleshooting.md).
