# Gallery

Screenshots of the sample game, *The Pantry Key*, and of the local Studio, taken from the real production build and the
real Studio by `npm run docs:screenshots`, never mock-ups. Each picture has its important labels written out below it.

These captures were taken at **4.1.19** (11 October 2026). Since then the interface font changed (Galmuri11, 4.3.0),
the hero can be chosen at New Game (4.3.0), and the Studio gained a hero × language matrix and before/after captures
(4.4.0): none of those shows here yet. To see the current version, play it at
[quest-n-click.cleverapps.io/demo](https://quest-n-click.cleverapps.io/demo/).

<a name="player"></a>

## The game

![The Pantry Key: Grandma's living room, with a grandmother and a cat on a rug; on the right the nine verbs and an empty bag; at the bottom the tools and the sentence line "Walk to"](../images/start/4119-hero.webp)

*Grandma's living room.* On the right, the verbs **Give, Open, Close, Pick up, Look at, Talk to, Use, Push, Pull**
("Look at" is selected), the bag (six empty slots) and four tools: the other playable character (the cat), the map,
the pause menu, the sound. Under the scene, the sentence line: **Walk to**.

![Talking to Grandma: her portrait and topics in the right-hand column](../images/start/4119-player-scene.webp)

*A conversation.* The column on the right shows **Grandma** and her topics: **Where is the key?**, **What is for
dinner?**, **Why lock the sardines?**, **Can I have a cuddle?**, **Bye!**

![The world map: Grandma's and Grandpa's portraits pinned on France, a third face on the Mediterranean, the places to go in the side column](../images/start/4119-player-map.webp)

*The world map.* The characters are pinned where they are; the column asks **Where to?** with **Grandma's house !**
(something new there), **The garden**, **The market** and **Back**.

![The pipes minigame: tiles to turn between a water tank and the mushrooms, a Skip button at the top right](../images/start/4119-player-minigame.webp)

*A minigame, pipes.* The instruction, from Grandma on the shell phone: **Tap a pipe to turn it. Bring the water to the
mushrooms.** A **Skip** button at the top right. It plays by touch or with the keyboard.

<a name="studio"></a>

## The Studio

![Studio, Rooms tab: Grandma's house in the placement editor with the hotspots outlined, the list of props and actors, and the pantry cupboard selected with its states, look lines and reactions](../images/start/4119-studio-rooms.webp)

*The Rooms tab.* The tabs along the top: **Rooms, Storyboard, Assets, Voices, Music, Check, Play, Language, Remix,
Notes**, then **Undo**, **Redo**, **Play** and **Assistant**. The room **Grandma's house (house)** in the placement
editor; on the right the **Props** (pantry, armchair, clock, table, chair, shell, teacup) and **Actors**; the prop
**pantry** selected, with its states **locked** and **open**, its **Look** lines and its **Reactions**.

![Studio, Check tab: the validator with no error, the solver's 15-step winning path, the solver health table, and the start of the world graph](../images/start/4119-studio-check.webp)

*The Check tab.* **Validator: no error, 0 warning(s)**. **Solver: solved: the ending is reached (35 states explored;
--prove checks every state)**, with its fifteen steps, from "(tutorial) Look at pantry" to "Use key with pantry".
**Solver health** (runs, actions skipped, what splits the states). **World**: the three rooms and their exits.

![Studio, Storyboard tab: five boards on the left, the board "Opening and tutorial" with its panels and lines, and a preview of the first panel on the right](../images/start/4119-studio-storyboard.webp)

*The Storyboard tab.* **100 % — 165 implemented, 0 partial, 0 missing.** Five boards: **Opening and tutorial**,
**Grandma's house**, **The garden**, **The market**, **The pantry**. Panel 1, **Bad news**, with Grandma's and Pixel's
lines; on the right the panel's preview and its notes.

![Studio, Assets tab: the hero's sprite sheet, a cat in 24 cells, each labelled with its use](../images/start/4119-studio-assets.webp)

*The Assets tab.* **Prepare assets (npm run assets)**, **all prepared**, **25 sheets, 401 images, 6 backgrounds, 23
sounds**. The sheet **hero** (Pixel, a 6 × 4 grid, 24 cells, 19 used): each cell labelled **portrait**, **walk**,
**idle**, **curl**… or **unused**; **Copy prompt** and **Upload generated sheet…**.

![The puzzle graph: nodes for players, places, items, flags and actions, the critical path highlighted, the rest faded](../images/start/4119-proof-graph.webp)

*The puzzle graph* (Check tab). **93 nodes**; green arrows produce, red ones consume. **Critical path** on: **40
critical, 47 out of the solver's state**; nodes such as **tank_drained**, **shell phone**, **use pipe + tank**,
**pantry key**.

<a name="not-shown"></a>

## Not shown yet

No capture here shows these screens, each one the decisive step of a recent flow:

| Screen | Since | Where to see it today |
|---|---|---|
| Choosing the hero at New Game, in two languages (`games/heroes`) | 4.3.0 | [Choosing the hero](create.heroes.md) |
| The Studio's Voices tab, "Heroes × languages" matrix | 4.4.0 | [The hero × language matrix](studio.voices-matrix.md) |
| Before/after captures in the semantic diff (local Studio) | 4.4.0 | the local Studio |
| A hosted Studio: a member's edit refused with 423, the hosted preview, the Check tab after a save | 4.2.x | [423 on the hosted Studio](team.write-refused-423.md) |

`npm run docs:screenshots` cannot take them as it stands: it plays the sample game, *The Pantry Key*, and opens four
tabs of the local Studio on it; it has no step for `games/heroes`, for the Voices tab or for a hosted Studio. Taking
them means adding those steps to the script, then placing each capture in the page of its flow.

<a name="regenerate"></a>

## Taking them again

```sh
# in the engine repository, after npm ci and npx playwright install chromium
npm run docs:screenshots
```

It builds the game into `.cache/docs-dist`, plays the sample game through the end-to-end harness and drives the Studio
with Playwright, then writes WebP files named for the release that took them (`4119-<name>.webp` at 4.1.19); a
release's captures never overwrite another's. `--only=game|studio` takes one half; `--keep-png` keeps the raw
captures. The script: [`scripts/docs-screenshots.mjs`](../../scripts/docs-screenshots.mjs).
