# Exits

How a room leads to another. You can write a way out by hand, as a hotspot plus a rule that runs `goto`; declaring it
in the room's `exits` is shorter, and it tells the tools the map of the world. This page is the reference of `exits`.

<a name="overview"></a>

## Exits, chapters and saves: where each lives

The old "Exits, chapters, saves" chapter of the content guide is now three pages:

- the ways out of a room: this page;
- chapters, invariants and objectives: [Chapters and objectives](create.chapters.md);
- save slots, migrations and what a save keeps: [State and saves](create.state-saves.md).

<a name="declared-exits"></a>

## Declared exits

In a room file (`game/rooms/<room>.ts` in a created project, `games/<id>/rooms/<room>.ts` in the engine repository):

```ts
exits: {
  window: { name: 'garden window', to: 'garden', entry: 'house', if: { unlocked: 'garden' },
    locked: 'Not yet. First, the key.', sfx: 'door_open', verbs: ['use', 'open', 'push'] },
  trapdoor: { name: 'trapdoor', to: 'cellar', oneWay: true },
},
```

What the engine makes of it, when it compiles the game (`normalizeExits` in
[src/engine/core/define.ts](../../src/engine/core/define.ts)):

1. **A hotspot of the same id**, of kind `exit` (plus the kinds you add in `kind`), visible when `visible` holds. You
   place it in the layout like any zone, and its look line goes in the room's `look`, as for any hotspot.
2. **Rules appended at the end of the room's `on`**: "VERB exit → `goto`" when `if` holds (with the `sfx` first, if
   any), then a second rule that says the `locked` line. Their ids are `exit.<room>.<exit>.go` and
   `exit.<room>.<exit>.locked`.
3. **Your own rules come first.** A rule you write on the exit is evaluated before the generated ones, so a special
   reaction (an item used on the door) still wins.

When `if` does not hold and there is no `locked` line, the verb's ordinary fallback answers, as for any hotspot with
no matching rule.

From the exits, the `goto` commands and the map, the validator knows **which rooms nothing leads to** and **which exits
have no way back**; the Studio's Check tab, and in the engine repository `npm run page:world`, draw that map (see
[Review pages](create.review-pages.md)). What a single tap on an exit does is `onTap`, below.

<a name="exit-fields"></a>

## The fields of an exit

### Form

`exits` is a record in a room: the key is the exit's id (also the id of its hotspot), the value an object with the
fields below. The type is `ExitDef` in [src/engine/core/types/content.ts](../../src/engine/core/types/content.ts).

| Field | Type | Meaning |
|---|---|---|
| `name` | string, required | The name shown on hover and in the action line. Translated like every text. |
| `to` | room id, required | The room the exit leads to. |
| `entry` | entry id, or `[x, y]` | Where the hero appears: an entry point of the target room's layout (`entries`), or a point. Without it, see below. |
| `if` | condition | The exit can be taken only while it holds. |
| `locked` | string | What the hero says when the exit is tried while `if` does not hold. |
| `verbs` | verb ids | The verbs that take the exit. |
| `sfx` | sound id | Played when leaving (an id of `audio.sfx`). |
| `visible` | condition | The hotspot shows only while it holds. |
| `kind` | string[] | Extra kinds for the hotspot, after `exit`. |
| `oneWay` | boolean | The player cannot come back this way, and that is intended: the tools stop reporting a missing way back. |
| `defaultVerb` | verb id | The verb a double tap uses on it, when the logical one is not right (see [Reactions](create.reactions.md#double-tap)). |
| `onTap` | `'go'` or `'walk'` | What a single tap does with no verb picked: `go` walks there and goes through on arrival, `walk` only walks there. |

### Values and default

- `verbs`: by default, those of `use`, `open`, `walk`, `go`, `enter`, `push`, `pull` that your game has. A game with
  none of these gets every verb of the game except `look`, `talk`, `give` and `take`.
- `onTap`: by default `go` when the game sets `input: { exitOnTap: true }` in `game.ts`, otherwise `walk`. A picked
  verb still wins; a tap elsewhere during the walk still redirects the hero; a double tap always went through. `onTap`
  and `exitOnTap` are input only: the rules, the solver and saves do not see them.
- `entry`: without it, the hero comes back where they last stood in the target room; in a room never visited, at its
  layout's `default` entry point (or at 320, 360 when the layout has none).

### Constraints

The validator (`npx quest-n-click validate` in the created project, `GAME=<id> npm run validate` in the engine
repository) reports:

- an error for an unknown `to` room (`unknown room: "<id>"`), an `entry` that is not an entry point of the target
  room's layout, an unknown verb in `verbs`, an unknown `sfx`, an `onTap` other than `go` or `walk`, and an exit whose
  id is also a hotspot you wrote (`"<id>" is both an exit and a hotspot`);
- a warning for an exit leading to its own room, for a room no exit, `goto` or map place leads to from the start, and
  for an exit with no way back (`no way back from <to> to <from> (add oneWay: true if intended)`).

### Minimal example

```ts
// game/rooms/house.ts (created project)
exits: { door: { name: 'door', to: 'garden' } },
```

The hotspot `door` still needs its zone in `game/layout/house.json`, placed in the Studio's editor; the target room's layout should give a
`default` entry.

### Behaviour on an unknown field

The engine and the validator do not read it. TypeScript reports it, as for any object literal written in a typed
`defineRoom`.

### Since

Declared exits exist since 1.4.0 "Scale". `onTap` and `input.exitOnTap` appeared in
4.2.4; `defaultVerb` in 4.0.0.

> [!LIMIT id=exits-input-only]
> `onTap` and `input.exitOnTap` change how a tap reads, not what the game allows: they never open an exit whose `if`
> does not hold, and the solver does not see them.

<a name="related"></a>

## Related identifiers

- `goto` (the command an exit runs), `entries` (the layout's entry points): [Game commands](create.commands.md),
  [Geometry](create.geometry.md).
- `input.exitOnTap`, `defaultVerb`, the double tap: [Reactions](create.reactions.md#double-tap).
- The map of places and `unlocked`: [World map](create.world-map.md).
- Rooms nothing leads to, seen in the Studio: [Check](studio.check.md).
