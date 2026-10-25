# Characters

A character is declared once, in `game.ts` (`characters`, usually from `cast.ts`), and placed in a room as an actor.
This page lists a character's fields, its poses and mouths, the variants its state selects, palette swaps, and
characters that are seen but not acted on.

<a name="characters"></a>

## A character

```ts
characters: {
  grandma: {
    name: 'Grandma', color: '#f0c040', height: 124, kind: ['person'],
    portrait: 'grandma/r1c2',
    sprites: { idle: ['grandma/r3c3'], talk: ['grandma/r3c4', 'grandma/r3c3'], walk: ['grandma/r2c1', 'grandma/r2c2', …] },
    refuse: 'That is sweet, dear. But keep it, you will need it for your errand.',
    hug: 'Always. Even with a basket in my arms.',
  },
  talkie: { name: 'the walkie-talkie', color: '#ff6fb5', offscreen: true },   // speaks in a frame, no body
},
```

| Field | What |
|---|---|
| `name` | The display name. |
| `color` | The colour of their lines. Make each character's distinct ([dialogues](create.dialogues.md#writing)). |
| `height` | On-screen height in logical units, in the foreground (default `skin.heights`: actor 110, hero 84). |
| `sprites` | Poses: pose name → list of images, played in a loop (at least `idle`). |
| `fps` | Animation frames per second (default 8). |
| `mouths` | Mouth images per pose ([below](#speech-animation)). |
| `portrait` | For the map, calls and conversation menus. |
| `kind` | Kinds, for the reactions by kind (`['person']`, `['cat']`; [reactions](create.reactions.md#fallbacks)). |
| `refuse` | The answer to any Give that has no rule. |
| `hug` | The answer to the global "hug" topic (`globalTalk.hug`); without it, "♥". |
| `offscreen` | Speaks in a frame at the top of the screen, no body (narrator, plush toy, phone). |
| `glow` | A soft glow around the character (a CSS colour), e.g. an apparition. |
| `room` | Starting room of a character that moves between rooms ([moving characters](create.moving-characters.md)). |
| `variants`, `palette`, `paletteTolerance` | Looks that depend on state ([below](#variants)). |
| `description` | What they look like, in words, for the art prompts (`npm run prompts`). Not shown in the game. |

The hero is a character too (`hero` in `game.ts`); several playable characters and choosing the hero are on
[heroes](create.heroes.md). A character speaks in a room only through an actor, except in a phone call
([commands](create.commands.md#sequences)).

<a name="poses"></a>

## Poses

By convention: `idle`, `talk`, `walk` (profile, facing right; the engine flips the image for left), `walk_front`,
`walk_back`, `point`, `use`, plus any special pose you want (`sleep`, `sit`, `celebrate`…). A pose is a list of images
played in a loop. A missing pose falls back to `idle` (`validate` warns about an actor whose `pose` is missing). The
template's `cast.ts` has helpers for the standard sheets: `human(id)` and `cat(id)` map a 6 × 4 sheet to these poses
([images](create.images.md)). `{ pose: ['cat', 'sleep'] }` sets a lasting pose; `{ anim: ['hero', 'use'], ms: 600 }`
plays one for a while ([commands](create.commands.md#movement)).

<a name="speech-animation"></a>

## Speech: only the mouth moves

A character with a talking sheet declares their mouths per pose. During a line the body never changes: the open-mouth
images cycle at random (160 to 220 ms), and a blink passes by now and then at rest. The "mouth closed" image replaces
the pose's rest image, so rest and speech come from the same drawing.

```ts
import { human, mouths } from './cast';
grandpa: { …, mouths: mouths('talk_grandpa', { idle: 'profile', front: 'face', seated: 'seated' }) },
```

`mouths(folder, { pose: row })` reads `<folder>/<row>/t1…t6` (t1 closed, t2 to t4 open, t5 blink, t6 smile), the
frames `tools/talk-apply.py` produces. With no mouths for a pose, the character keeps the same image and bounces a
pixel while talking; a long line starts with a gesture (the `talk` pose) played once.

<a name="variants"></a>

## Variants depending on state

```ts
import { cat } from './cast';
hero: { …, sprites: cat('hero'), variants: [{ if: { has: 'bucket' }, sprites: cat('hero_bucket'), mouths: … }] },
```

The first variant whose condition is true replaces `sprites`, `mouths` and `portrait`, and `name` when it has one
(4.3.0: the hero the player chose, a character renamed after a reveal; [heroes](create.heroes.md)). The change shows
right away (e.g. as soon as the bucket is picked up).

<a name="palette-swap"></a>

## Palette swap (`palette`, also on variants)

One sheet, several looks: `palette` maps source colours to target colours, both `#rrggbb`. The room view recolours
every sprite and mouth frame of the character once, in an offscreen canvas (cached, alpha kept). A variant's `palette`
replaces the character's while its condition holds (a variant without one keeps the character's).

```ts
biscuit: { …, sprites: cat('cat'),
  palette: { '#2c1818': '#7a3416', '#492a25': '#b0592a', '#543329': '#c4703a' }, paletteTolerance: 14,
  variants: [{ if: 'muddy', palette: { '#492a25': '#5a4a3a' } }] },
```

Matches are exact RGB by default: this suits the `pixel` art style, whose cutter gives every material one exact
value. Painted (`cel`) sheets and lossy WebP have many neighbouring tones: `paletteTolerance` (an RGB distance; 10 to
16 is a good start, below the distance to the outline colour) recolours every pixel near a source colour, keeping its
offset from it; the nearest source colour wins. Pick the source colours from the cut PNG (the most frequent opaque
colours of a cell). The demo's Biscuit uses this to become a ginger tabby.

> [!LIMIT id=portraits-not-recoloured]
> Portraits in menus and calls are not recoloured. `npm run validate` warns about a palette key or value that is not
> `#rrggbb`.

<a name="multiple-states"></a>

## Things with multiple states

A seagull that watches or snaps, an old dog that sleeps, sulks or yawns, a cat's eye glowing on a screen: a hotspot
has only a name and a zone, so for a drawn thing that changes, use a **stateful prop**:

```ts
props: { seagull: { name: 'seagull', states: { watch: 'obj_yard/r2c4', snap: 'obj_yard/r2c5' }, initial: 'watch' } }
```

with a position per state in the layout (`props.seagull.states.snap`); the clickable zone follows the image. Change
the state with `{ prop: ['seagull', 'snap'] }` and react to it with `if: { prop: ['seagull', 'snap'] }`. For a zone of
the background that changes name or shape, use two hotspots with opposite `visible` conditions (`visible: 'x'` /
`visible: '!x'`), each with its own zone; a rule can target both (`a: ['h1', 'h2']`).

<a name="presence"></a>

## Presence without interaction

`actors: { ghost: { char: 'ghost', interactive: false, visible: 'ghost_seen' } }`: visible, but neither clickable nor
named. Combine with `{ show: 'ghost', fade: 1500 }` / `{ hide: 'ghost', fade: 1500 }` and `glow` on the character's
sheet.

<a name="related"></a>

## Related identifiers

- `CharacterDef`, `ActorDef`, `MouthSet` in [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts).
- [Rooms: actors](create.rooms.md#actors), [dialogues](create.dialogues.md), [heroes](create.heroes.md),
  [images](create.images.md), [voices](create.voices.md).
