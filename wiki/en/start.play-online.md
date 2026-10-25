# Play online and try the demo Studio

How to play the sample game and open the Studio in your browser, with nothing to install.

<a name="what-you-get"></a>

## What you get

*The Pantry Key*, the sample game, running in your browser, and the Studio editing that same game, your edits kept in
your browser only.

<a name="context-and-versions"></a>

## Context and versions

The project's website, `https://quest-n-click.cleverapps.io` (the repository `Quest-n-Click/quest-n-click-site`, hosted on Clever Cloud):
the game at `/demo/`, the Studio's demo at `/demo/studio.html`, the latest documentation at `/docs` (`/fr/docs` in French). The demo
is the latest release's `quest-n-click-v<version>-web.tar.gz`, checked against the release's sums: a released version,
not `main`. Since 4.5.2; before, the demo was on GitHub Pages, at `wanoo.github.io/quest-n-click` (4.2.5 to 4.5.1) and
`wanoo.github.io/web-scumm`, which is abandoned.

<a name="prerequisites"></a>

## Prerequisites

- A recent browser on a phone (in landscape) or a computer. Nothing else.
- For the Studio's Assistant only: a key of your own for a chat model (see [The Assistant](studio.assistant.md)).

<a name="where-to-run"></a>

## Where to do it

In your browser. No command.

<a name="steps"></a>

## Steps

<!-- step: play -->
1. **Play**: open [quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/). On a phone, turn it to
   landscape. Tap **New game**. The game is in English; `?lang=fr` in the address, or the settings, switch it to
   French ([Languages](play.languages.md)). How to play: [Controls](play.controls.md).

<!-- step: install -->
2. **Keep it** (optional): install it as an app and play it offline ([Install the game as an app](play.install-app.md)).

<!-- step: studio -->
3. **Open the Studio**: [quest-n-click.cleverapps.io/demo/studio.html](https://quest-n-click.cleverapps.io/demo/studio.html).
   It is the demo mode: the same Studio, the same engine view and placement editor as on your machine, running without
   any server. A banner says "Demo: your edits stay in this browser".

<!-- step: edit -->
4. **Edit**: change a line, move a prop, add a note. Validate and Solve run in the page, on the game with your edits.
   **Download patch** saves your edits as `studio-patch-<game>.json`; **Reset demo** drops them all.

<a name="expected-result"></a>

## Expected result, and how to check it

- The game: the title screen, then Grandma's living room with nine verbs and the bag.
- The Studio: the Rooms tab on Grandma's house, and the Check tab green after an edit that keeps the game finishable.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| "Rotate your phone" | The game plays in landscape | Turn the phone |
| No sound | Sound starts at the first tap | Tap once; [Player troubleshooting](play.troubleshooting.md#no-sound) |
| The Studio's screenshot panel is missing | Screenshots need a local dev server | Run the Studio locally ([The local Studio](studio.overview.md)) |
| The Assistant refuses a call from the page | Some providers refuse browser calls from an unknown origin | Use Ollama on your machine, or the local Studio, whose server relays the call ([The Assistant](studio.assistant.md)) |

> [!LIMIT id=demo-edits-local]
> The demo Studio keeps your edits in this browser's local storage only: another browser, a cleared site or **Reset
> demo** loses them. Download the patch to keep them.

<a name="files-changed"></a>

## Files or data changed

In your browser: the game's saves and cache ([Privacy](play.privacy.md#device)), and the demo's edits in local storage
(key `web-scumm.studio-demo.<game>`). A downloaded patch lands in your downloads folder.

<a name="recovery"></a>

## Recovery or going back

**Reset demo** returns the Studio to the published game. A downloaded patch can be applied to your own copy of the game
with `npm run studio-apply` ([Demo mode and studio-apply](studio.demo-mode.md)).

<a name="next"></a>

## Make your own game

The engine installs from a release's archive, not from npm yet: [Install from the release archive](install.from-archive.md),
then [Your first game](create.first-game.md).

<a name="references"></a>

## References

- [Demo mode and studio-apply](studio.demo-mode.md), [The local Studio](studio.overview.md).
- [What quest'n'click is](start.what-it-is.md), [Gallery](start.gallery.md).
