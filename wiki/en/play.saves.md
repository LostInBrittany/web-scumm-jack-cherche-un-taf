# Saves: slots, export and import

How a quest'n'click game keeps your progress, how to save in a slot, how to move a save to another device, and what a
save holds. The labels are the engine's defaults; a game may word them otherwise.

<a name="what-you-get"></a>

## What you get

Your game resumes where you left it, on the same device, with **Continue** on the title screen. With save slots you
also keep several points of the story, and you can carry a save to another device as a file.

<a name="context-and-versions"></a>

## Context and versions

The player of any quest'n'click game in a browser. True from 4.1.15 (the save envelope of schema 4, which records the
Remix world a game was played in); slots live in IndexedDB since 3.1. Save slots exist only in a game whose author
turned them on (`saves.slots`); the sample game has three.

<a name="prerequisites"></a>

## Prerequisites

- A browser that keeps the site's storage. In a private window, or a browser profile that blocks IndexedDB, the game
  still saves, in local storage instead, and says so once.

<a name="where-to-run"></a>

## Where to do it

In the game, from the pause menu (the pause button in the tools, or Escape).

<a name="autosave"></a>

## The autosave

The game saves by itself each time an action ends (the engine back to idle), when you change rooms, and when a script
moves on. Each write is read back and checked. The pause menu's **Autosave** row shows ✓, or ⚠ when the last write
failed; a failed write also shows "Save failed" with the browser's reason. **Continue** on the title screen resumes
the autosave. **Restart** erases it first, after a confirmation; if the browser refuses to erase it, you keep your
game.

<a name="steps"></a>

## Steps

<!-- step: save-slot -->
1. **Save in a slot**: pause menu › **Save** › a slot. Each slot shows the room and the date of its save, or "empty".
   Saving over a used slot asks "Overwrite this save?" first.

<!-- step: load-slot -->
2. **Load a slot**: pause menu › **Load** › a slot. An empty slot cannot be chosen.

<!-- step: export -->
3. **Export a save to a file**: pause menu › **Save** › **Export file**. Your browser downloads `<game>-save.json`,
   the current game.

<!-- step: import -->
4. **Import it on another device**: there, open the same game, pause menu › **Load** › **Import file**, and pick the
   JSON file. The save is written into the first free slot (if there is one), then loaded.

<a name="export-import"></a>

## Moving a save between devices

Saves never leave the device by themselves: there is no account and no cloud save. Export and Import are the way to
move one (a phone to a computer, an old browser to a new one). The file holds your game for that one game: importing
it into another game is refused ("save belongs to game …").

The same Save menu has two more files, for bug reports rather than saving:

- **Share session** (a playtest): the inputs since the game started, with ids only and the places you tapped near but
  missed. It opens your device's share sheet when it can, else downloads `<game>-<date>.session.json`.
- **Export session**: the inputs since the game started or a save was loaded, with the game's journal; the author's
  tools replay it exactly.

<a name="what-is-kept"></a>

## What a save holds, and what it does not

A save is your game's state: the room, where each character stands, the bag, what you did and learned (flags,
counters, conversations seen), where scripts stand, the camera, the music's position, and for a Remix game the world
you play in. It does not hold your settings (text speed, volumes, language: they stay in the browser, apart) or your
speedrun records.

A save written by any 3.x or 4.x release of the engine loads in every later 4.x: when the author changes the game in
a way an old save cannot follow, the game carries the save over itself. When a newer version of a game no longer has
something your save names, two cases:

- **the room you saved in, or the hero you were playing, is gone**: the save is **refused** ("state.room: unknown current
  room …"), and the game you are playing stays as it was. Load an earlier slot or an exported file saved elsewhere, or
  ask the game's author: a room renamed with a migration carries the save over and loads;
- **anything else is gone** (an item in the bag, a place on the map, a room you visited, a character's position): the
  save loads without it, and the game says "Save adjusted for this version" with what it left out.

See [Stability and support](start.stability.md#saves), and for an author [State and saves](create.state-saves.md).

> [!GUARANTEE id=play-save-refused-untouched]
> A save of another game, a corrupt one, or one whose current room no longer exists is refused, and the game you are
> playing is left as it was.

> [!LIMIT id=saves-device-only]
> Saves live in this browser on this device. Clearing the site's data erases them. In a Safari tab, Safari may also
> erase them after seven days of Safari use without a visit to the game; a game added to the Home Screen is exempt from
> that rule ([WebKit](https://webkit.org/tracking-prevention/)). Any browser may evict a site's data when the device runs short of space. The project has not
> tested these rules on a real device: export the saves you care about.

<a name="expected-result"></a>

## Expected result, and how to check it

- After **Save**, the slot shows the room and the time, and a short message "Slot 1 ✓".
- After **Import file**, the game loads the imported state and the first free slot holds it.
- The pause menu's **Autosave** row shows ✓.

<a name="common-errors"></a>

## Common errors

| Message | Cause | Fix |
|---|---|---|
| "Save failed" | The browser refused the write (storage full, private window limits) | Free some space; keep the game open and try again; export the save |
| "save belongs to game "x", not "y"" | The file is another game's save | Import it into the game it came from |
| "save version 5 cannot be migrated to 4" | The save is newer than this copy of the game | Update the game (reload it online, accept the update), then import again |
| "this save was played in another world …" | A Remix save, made in another world than the one open | Open that world (the game offers to), or keep your current game |
| "Your saved game lives in another world" | A link opened a Remix world while your autosave is in another | Choose **Continue the saved game**, or start the link's world (it replaces the autosave) |

The full list of cases: [Player troubleshooting](play.troubleshooting.md#save-will-not-load).

<a name="files-changed"></a>

## Files or data changed

In the browser: the IndexedDB database `web-scumm-saves` (its name keeps the project's former name, as a format
identifier), or, without IndexedDB, local storage keys `<game>.save` and `<game>.slot.<n>`. Export writes a file in
your downloads folder.

<a name="recovery"></a>

## Recovery or going back

A slot overwritten cannot be brought back. Keep an exported file of a save you want to return to. A save from an older
local-storage version of a game (before 3.1) is copied into IndexedDB once, and the old copy is removed only after the
new one is verified.

<a name="for-authors"></a>

## For authors: slots and migrations

Slots are a setting of the game (`game.ts`), with the menu's texts in `ui`:

```ts
saves: { slots: 3 },   // the pause menu gets Save / Load with three slots, plus export and import as a JSON file
ui: { …, save: 'Save', load: 'Load', slot: 'Slot {n}', emptySlot: 'empty', exportSave: 'Export to a file', importSave: 'Import a file', confirmOverwrite: 'Overwrite this slot?' },
```

Manual slots are stored like the autosave: in IndexedDB, as envelopes, read back after each write; an imported file
also fills the first free slot. When the content changes incompatibly, bump `saveVersion` and carry the state over as
data, one step per version:

```ts
saveVersion: 3,
migrations: [
  { from: 1, renameFlag: { found: 'key_found' }, renameItem: { cle: 'key' } },
  { from: 2, renameRoom: { lobby: 'hall' }, renameProp: { 'hall.lamp': 'hall.lantern' }, dropFlag: ['tmp'] },
],
```

The chain must reach `saveVersion`; a save with no path to it cannot be loaded (Continue then starts a new game).
Stale optional references are pruned with a visible warning; structural corruption, a foreign game, a missing current
room or an unknown active player is rejected without changing the current session. The whole subject, with the
`Migration` type: [State and saves](create.state-saves.md#migrations).

<a name="references"></a>

## References

- [Stability and support](start.stability.md#saves): which saves load in which versions.
- [Privacy](play.privacy.md#device): what stays on the device.
- The code: [`src/engine/core/save.ts`](../../src/engine/core/save.ts),
  [`src/engine/dom/save-store.ts`](../../src/engine/dom/save-store.ts),
  [`src/engine/dom/menus.ts`](../../src/engine/dom/menus.ts).
