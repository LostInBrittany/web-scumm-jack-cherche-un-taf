# Before and after captures

Under the semantic diff, **Capture the rooms (before / after)** draws each room the changes name at both revisions,
side by side, with the rectangle where they differ outlined: a moved placement, a font or a line that overflows shows
at a glance.

<a name="what-you-get"></a>

## What you get

For each room the diff names, two pictures (before, after) drawn by the real engine, the changed area boxed, or
"no visible change" when no pixel moved. The PNGs are kept on disk.

<a name="context-and-versions"></a>

## Context and versions

The local Studio only (`npm run studio`, engine repository or created project), from 4.4.0.

> [!GUARANTEE id=captures-local-only]
> A hosted Studio (it runs the game in a worker, which has no browser) answers the diff's captures with `{ unavailable:
> true }` instead of captures.

Over HTTP this answer is a 501 `{ unavailable, reason }`; the test calls the Studio directly.

<a name="prerequisites"></a>

## Prerequisites

- Playwright and its Chromium on your machine:

  ```sh
  # in the engine repository or the created project
  npm i -D playwright && npx playwright install chromium
  ```

- The game's prepared assets (`npm run assets`).
- Two revisions to compare: [Semantic diff](studio.semantic-diff.md).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Check tab, under **Changes between revisions**. The commands above run in the folder the
Studio serves.

<a name="steps"></a>

## Steps

<!-- step: diff -->
1. Show the changes between two revisions ([Semantic diff](studio.semantic-diff.md)).

<!-- step: capture -->
2. Click **Capture the rooms (before / after)**. "Building both revisions and drawing their rooms…" shows while it
   works: each side is a build of the game, seconds each.

<!-- step: read -->
3. Read each pair: the room, why it is drawn, the before and after pictures, the rectangle where they differ, or "no
   visible change". A side that cannot be drawn says why (the revision does not build, the room is not there); the
   other side is still shown.

<a name="what-is-drawn"></a>

### Which rooms, and how

- **The rooms drawn**: those whose layout, source or texts in a language (`room:<id>/…`) the changes touch. A change
  to shared files alone (the cast, the items, `site.json`) draws the first room. Six rooms at most. With nothing to
  draw: "No room to capture: nothing these revisions changed is drawn."
- **Each revision** is the game folder with the journal's later operations undone, built as a preview (in the
  worker's child process, never the Studio's own) and drawn in headless Chromium at 960 × 600, one device pixel,
  reduced motion, no CSS animation, fonts loaded, the editor's overlays hidden.
- **The same pixel**: a colour channel off by 16 or less counts as the same (an anti-aliased edge moves by 2 between
  two renders).

> [!LIMIT id=capture-scope]
> The game's default language only; the room as it is entered (its first checkpoint, else a fresh state), not at a
> checkpoint you choose; the prepared images, sounds and fonts of today on both sides (a changed picture shows only
> once prepared, and then on both sides); a hand edit the journal did not record is on both sides; a revision more
> than 2,000 operations back cannot be rebuilt.

<a name="expected-result"></a>

## Expected result, and how to check it

Pairs of pictures with a box around what moved. The files are under `.cache/studio/<game>-diff-<from>-<to>/`.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `Playwright is not installed (npm i -D playwright && npx playwright install chromium)` | No Playwright | Install it as said |
| `Chromium does not start: …` | Playwright's Chromium is missing or cannot run | `npx playwright install chromium` |
| `r<n> does not build: …` on one side | That revision's game does not build | Read the message; the other side is still drawn |
| 501 on a hosted Studio | Captures are local only | Run the same revisions on a local Studio |

<a name="files-changed"></a>

## Files or data changed

PNGs under `.cache/studio/<game>-diff-<from>-<to>/`; nothing in the game.

<a name="references"></a>

## References

- [`studio-server/src/ops/diff-captures.ts`](../../studio-server/src/ops/diff-captures.ts),
  [`tools/studio/diff-rooms.ts`](../../tools/studio/diff-rooms.ts), [`src/studio/diff-captures-view.ts`](../../src/studio/diff-captures-view.ts).
- The route `GET diff/<from>..<to>/captures`: [Studio API](studio.api.md).
