# Staging: wide rooms and animations

How a room moves: a room wider than the screen with a camera that follows the hero, prop animations whose frames
trigger sounds and effects, and the player's settings that change how all of it plays (reduced motion, text speed,
volumes). This page is the reference of `layout.width`, the `camera` command, `PropDef.anims`, `play`, `stopAnim`,
frame events and `settings`.

<a name="overview"></a>

## Staging at a glance

| You want | You write | Section |
|---|---|---|
| A room that scrolls | `width` in the room's layout, a wider backdrop | [Wide rooms and the camera](#wide-rooms) |
| To move the view | `{ camera: … }` | [Wide rooms and the camera](#wide-rooms) |
| A prop that animates, with a sound on the right frame | `anims` on the prop, `{ play: [prop, name] }` | [Prop animations](#animations) |
| A Settings entry in the pause menu | `settings: true` in `game.ts` | [Settings](#settings) |
| A voiced line | `voice` on `say`, `audio.voices` | [Voices](create.voices.md) |
| Layers, lights, particles, several floors | `stage` in the room | [The stage](create.stage.md) |

The old content guide's "Voice" subsection, which sat in this chapter, is now on [Voices](create.voices.md).

<a name="wide-rooms"></a>

## Wide rooms and the camera

### Form

A room is 640 × 400 logical units. Give its layout a `width` (960, 1280…: in the Studio editor's "Room width"
folder, or in the room's layout file, `game/layout/<room>.json` in a created project, `games/<id>/layout/<room>.json`
in the engine repository) and paint its backdrop that wide, 800 px tall with the width in proportion; the `assets`
tool keeps it. The room then scrolls, and the **camera** follows the hero. Positions stay world coordinates: a prop at
x 900 is in the right part of the room.

Commands move the camera:

| Command | Effect |
|---|---|
| `{ camera: { to: 'far_stalls', ms: 900 } }` | Pan to centre on something (an actor, a prop, a zone), then stay there. |
| `{ camera: { pan: 320, ms: 600 } }` | Pan to a left edge, in logical units (clamped to the room). |
| `{ camera: 'follow' }` (or `'reset'`) | Follow the hero again. Entering a room always follows the hero. |

### Values and default

- `width`: 640 when absent (no scrolling).
- `ms`: the duration of the pan, optional.
- Entering a room resets the camera to follow the hero.

### Constraints

The camera is in the state (`camera`: its left edge and whether it follows): a save restores it. The solver ignores
it. "Reduce motion" (the setting, or the system's `prefers-reduced-motion`) makes every pan instant.

### Minimal example

```ts
// in a rule of a room whose layout has width: 1280
{ verb: 'look', a: 'far_stalls', do: [{ camera: { to: 'far_stalls', ms: 900 } }, 'The far stalls.', { camera: 'follow' }] }
```

### Behaviour on an unknown field

The `camera` command takes only the forms above; TypeScript reports another shape in a typed room.

### Since

Wide rooms and the camera: 1.5.0 "Picture". A camera that also zooms per walk zone and moves vertically: 3.4.0 (see
[The stage](create.stage.md)).

Geometry (where the camera can go, zones that zoom it) is also described on [Geometry](create.geometry.md#camera).

<a name="animations"></a>

## Prop animations and frame events

### Form

```ts
props: {
  pantry: { name: 'pantry', states: { locked: 'home/r1c3', open: 'home/r1c4' }, initial: 'locked',
    anims: { rattle: { frames: ['home/r1c4', 'home/r1c3', 'home/r1c4', 'home/r1c3'], fps: 12, at: { 1: [{ sfx: 'latch' }] } },
             glow: { frames: ['home/g1', 'home/g2'], fps: 4, loop: true } } },
},
on: [{ verb: 'open', a: 'pantry', do: [{ play: ['pantry', 'rattle'] }, 'Locked.'] }],
```

An animation (`PropAnim`, [src/engine/core/types/content.ts](../../src/engine/core/types/content.ts)) has:

| Field | Meaning |
|---|---|
| `frames` | Manifest image ids, shown in turn. |
| `fps` | Frames per second. |
| `loop` | Plays on its own until stopped. |
| `at` | Frame index → commands run when that frame is reached. |

### Values and behaviour

- `{ play: [prop, name] }` shows the frames in turn at `fps` and **runs the commands of `at` when that frame is
  reached** (a sound on the right frame, a flag, a line). The command waits for the animation to end, then the prop
  goes back to its state's image.
- A `loop` animation plays on its own until `{ stopAnim: prop }`, and `play` does not wait for it. Its `at` only plays
  sounds and shakes (`sfx`, `shake`), on every turn of the loop: a machine that clanks on frame 4 is
  `glow: { frames: […], loop: true, at: { 4: [{ sfx: 'clank' }] } }`.
- Character poses get the same frame events: `{ anim: ['hero', 'jump'], ms: 600, at: { 2: [{ sfx: 'thud' }] } }` runs
  the commands when the pose reaches that frame, at the character's `fps`.

### Constraints

The validator refuses a flag or a line in the `at` of a `loop` animation: the loop never ends, so the state would never
settle.

### Behaviour on an unknown field

TypeScript reports it on a typed prop; the engine does not read it.

### Since

Prop animations and frame events (`at`): 1.5.0 "Picture". A looping animation's state is presentation only and is not saved: after a load, a stopped
or running loop shows the prop's state image until a command plays it again (see
[State and saves](create.state-saves.md#what-a-save-holds)).

<a name="settings"></a>

## Settings

### Form

`settings: true` in `game.ts` adds a **Settings** entry to the pause menu.

### Values and default

Each row cycles its value:

| Setting | Values | Default |
|---|---|---|
| Text speed | slow / normal / fast | normal |
| Text size | normal / large | normal |
| Reduce motion (no shake, instant camera and fades, no parallax, particles or room transition) | on / off | off (or on when the system asks for reduced motion) |
| Readable font, when the game ships one (`skin.fonts.readable`) | on / off | off |
| Music, sound and voice volumes | — | full |
| Sound captions, offered only when the game captions a sound | on / off | on |
| Verb keys, offered only when a verb has a `key` (4.3.0) | on / off | on |
| Language, when the game ships translations | the game's languages | `?lang=` in the URL, else the last choice, else the browser's language when the game has it, else the language the game is written in |

Preferences stay in the browser, **outside the save**: localStorage `<game>.settings`, and `<game>.lang` for the
language. A new game or a load does not change them.

The row labels are interface texts of `ui`: `settings`, `textSpeed`, `textSize`, `reduceMotion`, `readableFont`,
`volumeMusic`, `volumeSfx`, `volumeVoice`, `captions`, `verbKeys`, `language`, and the values `slow`, `normal`,
`fast`, `large`. Each has an English default when absent (the full list of defaults is on
[Skin and fonts](create.skin-fonts.md#ui-defaults)).

### Constraints

Without `settings: true` there is no Settings entry; reduced motion still follows the system's preference.

### Since

`settings`: 1.5.0 "Picture". Captions: 3.4.0. Verb keys: 4.3.0.

> [!LIMIT id=settings-per-browser]
> Settings belong to one browser on one device: they do not travel with an exported save file, and a private window
> forgets them.

What a player sees of these settings, and how they help accessibility, is on [Settings, for players](play.settings.md)
and [Accessibility](play.accessibility.md).

<a name="related"></a>

## Related identifiers

- `stage`, `walkZones` with `zoom`, `transition`: [The stage](create.stage.md).
- `anim` (character poses), `shake`, `sfx`: [Game commands](create.commands.md).
- `skin.fonts.readable`, `ui` texts: [Skin and fonts](create.skin-fonts.md).
