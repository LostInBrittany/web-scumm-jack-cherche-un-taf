# Remix in the Studio

For a game with a Remix manifest, the Remix tab shows its dimensions, previews any seed's world, locks some
dimensions and rerolls the others, compares two worlds, and measures coverage and bias over many seeds, with the
engine's own compiler: the Studio never shows a world the player would not play.

<a name="what-you-get"></a>

## What you get

A seed you have looked at before players do: each dimension's value, the world's hash, a link that plays it, and, when
something is wrong, a frozen world to export for a bug report.

<a name="context-and-versions"></a>

## Context and versions

The local Studio, engine repository or created project, from 4.1.15. What Remix is and how a manifest is written:
[Remix](create.remix.md).

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- A game with a Remix manifest. A manifest that cannot make a world shows the validator's reasons instead.

<a name="where-to-run"></a>

## Where to run the commands

In the browser, on the Remix tab.

<a name="steps"></a>

## Steps

<!-- step: dimensions -->
1. **Read the dimensions**: each with its values, the story value, and the modes the game offers.

<!-- step: preview -->
2. **Preview** a typed seed, or **New seed**: each dimension's value, the world's hash, a link that plays that world in
   the game (`?seed=`, `?world=`), and a frozen world to **Export**.

<!-- step: lock -->
3. **Lock** the dimensions you want to keep and **Reroll the others**.

<!-- step: compare -->
4. **Compare** with another seed. A puzzle-order dimension draws its order as a graph.

<!-- step: coverage -->
5. **Coverage and bias** draws many seeds and counts how often each value comes out.

<!-- step: anchors -->
6. **Anchors**: the rooms' anchors (room, anchor, what it is on, phase, used by). **Add an anchor from the scene's
   selection** writes `anchors.<entity>` into the room file of the entity selected in the Rooms tab, through
   `set_value` (dev server only).

<a name="player-side"></a>

### What the player sees

The title screen gains **Remix** (after New game and Continue): the story, a new world, a typed seed or the daily
challenge; the page starts again in the chosen world. The pause menu shows the code to copy, or "hidden until the end"
in a masked mode. Accessibility options never touch the seed. A link names a world: `?seed=`, `?daily=`, `?world=`.

> [!LIMIT id=remix-compiled]
> Every world the tab shows is computed with the engine's compiler ([`src/studio/remix-model.ts`](../../src/studio/remix-model.ts)).
> The tab writes nothing in the game except an anchor you add; the manifest itself is edited in code.

<a name="expected-result"></a>

## Expected result, and how to check it

The preview's link opens the game in that world; **Coverage and bias** shows no value that never comes out.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The validator's reasons instead of a world | The manifest cannot make a world | Fix the manifest ([Remix](create.remix.md)) |

<a name="files-changed"></a>

## Files or data changed

An anchor added from the selection is written in `rooms/<room>.ts` (`anchors.<entity>`). Exported worlds are
downloads.

<a name="references"></a>

## References

- [`src/studio/remix-tab.ts`](../../src/studio/remix-tab.ts), [`src/studio/remix-model.ts`](../../src/studio/remix-model.ts).
- [Remix](create.remix.md).
