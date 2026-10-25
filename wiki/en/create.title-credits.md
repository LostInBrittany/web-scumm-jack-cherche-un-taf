# Title and credits

<a name="what-you-get"></a>

## What you get

A title screen with your background (or a silent looping video), your logo, a line of text at the bottom and its
music, then New game and Continue; and the end credits, which scroll over the title's video when the player opens them.

<a name="context-and-versions"></a>

## Context and versions

`game.ts` in the engine repository (`games/<id>/game.ts`) or in a created project (`game/game.ts`). The fields below
are those of 4.4.0; true from 4.2.5 (the `quest-n-click` command name used below).

<a name="prerequisites"></a>

## Prerequisites

- The background image as an image id the game ships (see [Images](create.images.md)), the logo as another one.
- For a video: `ffmpeg`, which `npm run assets` uses to encode it ([doctor](install.doctor.md)).
- For the music: a track in `audio.music` ([Music in stems](create.music.md)).

<a name="where-to-run"></a>

## Where to run the commands

Edit `game.ts`; run `npm run assets` at the root of the engine repository, or of the created project.

<a name="steps"></a>

## Steps

<!-- step: title-screen -->
1. **The title screen.** In `game.ts`:

   ```ts
   titleScreen: { decor: 'decor/dining', logo: 'logo', music: 'theme', video: 'intro.mp4', footer: 'A tiny point-and-click. Turn your phone sideways.' },
   ```

   `decor` is required; `logo`, `music`, `video` and `footer` are optional.

<!-- step: video -->
2. **A video, if you want one.** Put the file in the game's decor folder, `art/decor/<name>.mp4`
   (`games/<id>/art/decor/` in the engine repository, `game/art/decor/` in a created project), and name it in
   `video: '<name>.mp4'`. Then encode it:

   ```sh
   # in the engine repository, or in the created project
   npm run assets
   ```

   Every `.mp4` of that folder becomes `public/assets/video/<name>.mp4`: H.264, 720 pixels high, without sound, ready to
   stream. `games/<id>/sources.json` can move the source (`"video": "private/asset/decor_{name}.mp4"`).

<!-- step: credits -->
3. **The credits.** The text, line by line; an empty string is a blank line:

   ```ts
   credits: ['THE NIGHT MARKET', '', "The reference chapter of quest'n'click (3.4)", '', 'Thanks for playing!'],
   creditsScreen: { video: 'outro.mp4', decor: 'decor/street' },
   ```

   `creditsScreen` is optional: without it, the credits play over the title's video, with the title's background as
   its poster.

<!-- step: check -->
4. **Check.** `npm run validate` (engine repository) or `npx quest-n-click validate` (created project) refuses a text
   switch or `{hero}` in the footer or the credits; `npm run dev` shows the title.

<a name="title-and-credits"></a>

## Reference

| Field | Form | What it does |
|---|---|---|
| `titleScreen.decor` | image id | the background, drawn to cover the screen; the video's poster |
| `titleScreen.logo` | image id | the logo, dropped in from the top; its alternative text is the game's `title` |
| `titleScreen.music` | id of `audio.music` | the music, started at the player's first tap on the title screen |
| `titleScreen.video` | file name in `public/assets/video/` | a silent, looping video behind the logo |
| `titleScreen.footer` | text | a line at the bottom of the screen; translated (`titleScreen/footer`) |
| `creditsScreen.video` | file name | the credits' background video, dimmed; default the title's video |
| `creditsScreen.decor` | image id | the poster of that video; default the title's `decor` |
| `credits` | text lines | the credits, one entry per line, `''` for a blank; translated (`credits[0]`, `credits[1]`…) |

What the player sees:

- The title shows New game and Continue (Continue greyed out without a save), then Remix when the game has a world
  other than the story ([Remix](create.remix.md)). The labels are `ui.newGame` and `ui.continue`.
- The credits open from the pause menu (★, `ui.credits`) and from the sealed ending's card. They scroll over about
  22 seconds; a tap closes them.

> [!LIMIT id=video-autoplay-blocked]
> A browser that refuses to start the video (data saving, low-power mode) leaves the poster, the `decor`, in its
> place. With `creditsScreen` given a `decor` but no `video`, the credits have no background image.

> [!LIMIT id=title-plain-text]
> The footer and the credits are shown as written: text switches and `{hero}` are refused there by the validator.

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run dev`, in the engine repository or in the created project, opens the title with the background, the logo, the footer; the
music starts at the first tap; Credits in the pause menu scrolls your lines.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| No background behind the logo | The `decor` image is not shipped | `npm run assets`; check the id |
| The video never shows | Not encoded (`ffmpeg` missing) or a different file name | `npm run assets`; `video` is the file name with `.mp4` |
| No music on the title | No tap yet, or the music off | Tap the title; check the Music setting |
| `"{hero}" in a text shown as written…` (validate) | A switch or `{hero}` in `credits` or `footer` | Write the text plainly |

<a name="files-changed"></a>

## Files or data changed

`game.ts` (`titleScreen`, `creditsScreen`, `credits`), `art/decor/*.mp4`, and `public/assets/video/` after
`npm run assets`. The translations of `titleScreen/footer` and `credits[n]` go into the locale files
([Translations](create.translations.md)).

<a name="recovery"></a>

## Recovery or going back

Remove the field from `game.ts`: every one but `titleScreen.decor` is optional.

<a name="references"></a>

## References

- [`src/engine/dom/menus.ts`](../../src/engine/dom/menus.ts) (`showTitle`, `credits`), [`src/engine/core/types/game.ts`](../../src/engine/core/types/game.ts) (`titleScreen`, `creditsScreen`, `credits`), [`tools/assets.py`](../../tools/assets.py) (the video)
- [The sealed ending](create.sealed-ending.md), [Skin and fonts](create.skin-fonts.md)
