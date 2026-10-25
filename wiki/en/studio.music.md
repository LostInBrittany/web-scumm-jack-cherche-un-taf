# Music

The Music tab plays the game's scores through the game's own music director: you hear each state's mix as the player
will, and mute or solo stems, without writing anything.

<a name="what-you-get"></a>

## What you get

A score heard state by state, on the bar the game would change it, with the bar and beat shown as it plays; and the
list of the music and sounds the game declares, with those still missing.

<a name="context-and-versions"></a>

## Context and versions

The local Studio (engine repository or created project) and the demo Studio. True from 4.2.1. How scores, states and
stems are written: [Music in stems](create.music.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- A game with scores (`audio.scores` in `game.ts`) and their prepared files (`npm run assets`).

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Music tab.

<a name="steps"></a>

## Steps

<!-- step: pick -->
1. Pick a score and play it.

<!-- step: states -->
2. Choose a state: its mix is heard on the next bar, as in the game.

<!-- step: stems -->
3. Mute or solo a stem by hand to hear what each one brings. The bar and the beat show where the music is.

> [!LIMIT id=music-read-only]
> Nothing is written: a score's states are content in `game.ts` (`audio.scores`), edited with the rest of the game.

<a name="audio-tools"></a>

### Music and sounds in the Studio and the tools

The Assets tab lists the music and sound ids the game declares and whether a file exists for each, with a player per
file ([Assets and cutting](studio.assets.md)); `npm run assets` ships what is there and reports what is missing. The
MCP `read_doc` tool serves the audio pipeline's page as `AUDIO` ([MCP tools](studio.mcp-tools.md)).

<a name="expected-result"></a>

## Expected result, and how to check it

Switching state changes the mix on the next bar; the stems you mute fall silent.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| A score is silent | Its files are not prepared | `npm run assets`, then reload |
| A sound id shows no file in the Assets tab | It is declared but not made yet | Add it ([Sound effects](create.sound-effects.md)) |

<a name="files-changed"></a>

## Files or data changed

None.

<a name="references"></a>

## References

- [`src/studio/music.ts`](../../src/studio/music.ts) (through the game's director, `src/engine/dom/director.ts`).
- [Music in stems](create.music.md#tools), [Audio toolchain](install.audio-toolchain.md).
