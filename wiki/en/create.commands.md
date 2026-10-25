# Game commands

The commands a rule, a topic, a script or a listener runs, grouped by what they do. Every command is data: a plain
string, or an object whose key names the command. The generated [DSL reference](create.dsl.md) gives each command's
exact shape, field by field; this page says what each does and when to use it.

<a name="overview"></a>

## How commands run

A command list (`do`, `then`, `onEnter`…) runs in order, each command waiting for the previous one to finish. A single
command written as plain text makes the hero speak: `'There. A step up.'`. The catalogue of commands is
[`src/engine/core/cmds.ts`](../../src/engine/core/cmds.ts) (`CMD_KEYS`): it says which commands change the game's
state (what the solver and the saves care about) and which only show something. A key it does not know is refused by
the validator.

<a name="speech"></a>

## Speech

| Command | Effect |
|---|---|
| `'text'` | The hero says the line. |
| `{ say: ['grandma', 'text'] }` | A character speaks. `'hero'` always designates the hero, whatever its id. An `offscreen` character (narrator, radio) speaks in a frame at the top of the screen. |
| `{ say: ['grandma', 'LOOK OUT!'], shout: true }` | A shout: bigger text, and it shakes. |
| `{ say: [...], id: 'house.l-careful' }` | A line with a stable id: its translation and its voice clip follow the id ([translations](create.translations.md)). |
| `{ say: [...], voice: 'grandma_01' }` | Plays that clip of `audio.voices`; the line stays while it plays ([voices](create.voices.md)). |

A line stays on screen for as long as it takes to read, or until a tap. `validate` warns about a line above 140
characters; under 90 reads comfortably on a phone ([dialogues](create.dialogues.md#writing)).

<a name="movement"></a>

## Movement and poses

| Command | Effect |
|---|---|
| `{ walk: 'shelf' }` | The hero walks to the shelf's approach point (set in the layout). |
| `{ walk: [300, 350], who: 'grandpa' }` | Grandpa walks to that point (any actor in the room; with no `walk` pose, they slide in their current pose). Where he stops is kept in the save. |
| `{ face: 'left' }`, `{ face: 'grandma' }`, `{ face: 'hero', who: 'grandma' }` | Turn left, or turn to face someone or something (the hero included). In a cutscene nobody is acted on, so nobody turns by themselves: this is how two characters look at each other. |
| `{ pose: ['cat', 'sleep'] }` | A lasting pose (until the next one). Character poses: see their `sprites` sheet. |
| `{ anim: ['hero', 'use'], ms: 600 }` | Hold the pose for the given time, then return to normal. Works for any actor in the room, even one in `pose: 'front'`: `{ anim: ['grandpa', 'surprise'], ms: 900 }` plays the `surprise` pose from their sheet, then they go back to `front`. `at: { 2: [{ sfx: 'thud' }] }` runs commands when the pose reaches that frame. |
| `{ place: ['grandpa', [420, 360]], face: 'left' }` | Teleport a character. |
| `{ launch: { target: 'vase', to: [420, 310], height: 60, rotate: 360, ms: 900 } }` | Stage physics (3.4): a ballistic flight of a prop or a character from where it stands (or `from`) to `to`, a point or a thing. Computed, never simulated: the same flight on every device. A character stays where it lands; a prop until the room is entered again: follow it with what it means (`{ hide: 'vase' }`, `{ prop: ['vase', 'broken'] }`). |
| `{ spring: { target: 'lamp', axis: 'rot', amplitude: 12, frequency: 3, damping: 0.25 } }` | A damped swing or shake around its place (`axis` x, y or rot). |
| `{ path: { target: 'bat', points: [[80, 120], [300, 60], [560, 140]], orient: true } }` | Along a smooth curve through the points, turned along it. |
| `{ follow: { target: 'parrot', leader: 'hero', offset: [10, -70], ms: 3000 } }` | Keeps one at an offset from another for a while. |
| `{ wait: 500 }` | Pause, in milliseconds. In a script, the player keeps playing meanwhile. |
| `{ parallel: [[…], […]] }` | Play several lists at the same time (e.g. two characters walking). |
| `{ camera: … }`, `{ play: [prop, anim] }`, `{ stopAnim: prop }` | The camera of a wide room and prop animations: [geometry](create.geometry.md#camera), [staging](create.staging.md). |

With reduced motion, every motion jumps to its end. The motions (`launch`, `spring`, `path`, `follow`) are presentation
only: the solver does not see them. Making a character walk on its own, a patrol: [moving characters](create.moving-characters.md).

<a name="world"></a>

## The world

| Command | Effect |
|---|---|
| `{ prop: ['lamp', 'on'] }` | Change a prop's state. `'room.prop'` targets another room. |
| `{ show: 'ghost', fade: 1200 }`, `{ hide: 'ghost', fade: 1500 }` | Make an actor or prop appear or disappear, with an optional fade. Kept in the save. |
| `{ gain: 'rope' }`, `{ lose: 'rope' }` | Add or remove an inventory item. `gain` on an item marked `used` reactivates it. |
| `{ used: 'rope' }`, `{ used: ['rope', 'badge'] }` | The item has served its purpose: it stays in the bag, greyed out ([items](create.items.md#used)). |
| `{ set: 'tied' }`, `{ set: ['tries', 3] }`, `{ unset: 'x' }`, `{ inc: 'tries' }`, `{ inc: 'tries', by: -1 }` | Flags: checkboxes, counters and values, named however you like ([flags, variables and events](create.flags-variables-events.md)). |
| `{ unlock: 'market' }` | Unlock a place on the map. A locked place does not appear ([world map](create.world-map.md)). |
| `{ goto: 'market', at: 'gate' }` | Change rooms; `at` is an entry point of the layout, or a point. |
| `{ map: true }` | Open the map. |
| `{ moveActor: ['grandpa', 'house'], at: 'door' }` | Send a character to another room ([moving characters](create.moving-characters.md)). |
| `{ emit: 'bell_rang' }` | Fire an event: its listeners run right here ([scripts and events](create.scripts-events.md#events)). |
| `{ startScript: 'id' }`, `{ stopScript: 'id' }` | Start a script from the top, or stop it ([scripts](create.scripts-events.md#scripts)). |
| `{ waitUntil: COND }`, `{ waitEvent: 'gong' }` | In a script: pause until a condition holds, or until an event. |
| `{ switchPlayer: 'laverne' }`, `{ transfer: ['tentacle', 'hoagie'] }` | Several playable characters: take control of another one, hand an item to another one ([heroes](create.heroes.md)). |
| `{ custom: 'sparkle', args: { ms: 1200 } }` | A command the game defines in code ([custom code](create.custom-code.md)). |

<a name="audio"></a>

## Audio and effects

| Command | Effect |
|---|---|
| `{ sfx: 'coin' }` | Sound effect. `caption: '[A door slams upstairs]'` writes what it means for whoever cannot hear it ([sound effects](create.sound-effects.md)). |
| `{ music: 'market' }` | Change the music (crossfade). |
| `{ music: { push: 'minigame' } }` then `{ music: { pop: true } }` | Temporary music, then back to the previous track. |
| `{ music: { once: 'jingle' } }` | Play a track once on top, then the music resumes. |
| `{ music: { stinger: 'success' } }` | A short cue (a track of `audio.music` or a sound of `audio.sfx`) on the next beat of the score that plays (3.5); at once with a single mix ([music](create.music.md)). |
| `{ music: { stop: true } }` | Stop the music. |
| `{ toast: 'New place: Market' }` | A small message at the top of the screen (`id` gives it a stable id for its translation). |
| `{ shake: 400 }` | The screen shakes, for that many milliseconds. |

<a name="logic"></a>

## Logic

| Command | Effect |
|---|---|
| `{ if: COND, then: […], else: […] }` | Branch on a [condition](create.conditions.md). |
| `{ once: […], id }` | Only once in the whole game. |
| `{ nth: [[…1st time], […2nd time], […after]], id }` | By number of times; the last branch repeats. |
| `{ cycle: [[…], […]], id }` | In a loop: 1, 2, 1, 2… (e.g. a record player alternating two tracks). |
| `{ random: [[…], […]], id }` | At random, never the same one twice in a row. |

In schema 3 each of `once`, `nth`, `cycle` and `random` needs a stable `id`: its count is kept in the save under it
(`key` is the old, v2 name). Remembering something for later is a flag (`set`); signalling a moment is an event
(`emit`): [which to use](create.flags-variables-events.md).

<a name="sequences"></a>

## Sequences and screens

| Command | Effect |
|---|---|
| `{ cutscene: […] }` | Cutscene: black bars, a "Skip" button. Skipping plays the rest instantly: effects (items, flags, states) still apply. |
| `{ choice: [{ id, text, do, if?, once?, img? }, …] }` | The player picks a line; the hero says it, then `do` plays. `img` shows the option as a card with that image ([dialogues](create.dialogues.md#choice)). |
| `{ talk: 'grandma' }` | Open an actor's conversation menu from a script. |
| `{ minigame: 'pipes', params: { tiles: …, cols: 4 }, then: […] }` | Launch a minigame. A minigame is never failed: `then` always plays, even if you skip. All its images come from `params` ([minigames](create.minigames.md)). |
| `{ phone: 'grandma', do: […] }` | Incoming call: ringtone (`skin.sounds.phone`), a Pick-up button, then the lines in `do`. During the call, the caller shows in a phone frame (bottom left), mouth animated while they talk; their lines appear at the top. |
| `{ phone: ['lou', 'seller'], do: […] }` | A call with several people: all shown side by side in the same frame (the first one in front), each at its own size (`height`). Each `{ say: ['lou', …] }` animates the right person's mouth. Pose shown: the first of `skin.callPoses` that exists (default `phone`, `front`, `face`, `idle`); mouths from `mouths.phone` (otherwise the `phone_talk` pose alternates, otherwise a small bounce). Ids are characters from `characters` (no actor needed in the room). |
| `{ guide: { verb: 'look', target: 'shelf', say: 'Pick Look, then tap the shelf.' } }` | Tutorial: the hero gives the instruction, the verb blinks, the target glows. It waits until the player does exactly that action; any other action repeats the instruction. |
| `{ hint: true }` | Give the current hint (same as talking to the hint item). |
| `{ ending: true, after?: […] }` | The sealed ending (`GameDef.ending`): scratch ticket, confetti, then `after`, then the final card. `{ reveal: true }` is the old name, still accepted ([the sealed ending](create.sealed-ending.md)). |
| `{ end: true }` | End of game. |

> [!LIMIT id=custom-for-the-rest]
> What none of these commands does needs a custom command, written in TypeScript with its declared effects
> ([custom code](create.custom-code.md)). There is no command that runs arbitrary code from the content.

<a name="related"></a>

## Related identifiers

- Every command's exact shape: [the DSL reference](create.dsl.md). The types: `Cmd` in
  [`src/engine/core/types/content.ts`](../../src/engine/core/types/content.ts).
- [Reactions](create.reactions.md), [conditions](create.conditions.md),
  [scripts and events](create.scripts-events.md).
