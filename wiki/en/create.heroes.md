# Heroes: several characters and hero choice

A game can have more than one hero in two different ways. **Choosing the hero** (4.3.0): at New Game the player picks
who the hero is (a knight, a witch or a robot; a boy or a girl), and the whole game follows that choice. **Several
playable characters** (Day of the Tentacle style): the player switches between characters who each stand in their own
room. This page walks through the first with the example game, then gives the reference of both and says when to use
which.

<a name="what-you-will-build"></a>

## What you will build

A game whose New Game screen asks "Who am I this morning?" and shows one portrait card per hero. Once a hero is chosen,
the character on screen has that hero's look and name, the other characters' lines use that name (`{hero}`) and the
words that fit that hero (`{form?…}`), in every language, with voices recorded per hero. A save keeps the hero.

The finished example is in the engine repository: `games/heroes`, "Who Am I Today?" (4.4.0). One garden, one puzzle
(the gate key under the watering can), three heroes on portrait cards (Pixel, Biscuit, Gaby the gull), `{hero}` and
switches in Grandma's lines, a French table that adds its own agreements (`Prêt{form?gull=e|*=}`), Grandma's lines
voiced per hero in both languages, one rule only the gull gets, and a save that keeps the hero.

<a name="what-you-need"></a>

## What you need

- A game that runs (`npm run dev`): see [Your first game](create.first-game.md).
- For the example: the engine repository, installed ([Install from the repository](install.from-repository.md)).
- About half an hour.

<a name="steps"></a>

## Steps

<!-- step: play-example -->
1. **Play the example.** In the engine repository, on your machine:

   ```sh
   # in the engine repository
   GAME=heroes npm run dev
   ```

   Open the URL it prints, press New Game: three cards, "Pixel", "Biscuit" and "Gaby". Pick one; Grandma greets that
   hero by name.

<!-- step: flag-and-variants -->
2. **One character, one variant per hero.** Pick a flag name for the hero (`form` here; any name works). Write one
   character whose written look is one of the heroes, and a variant per other hero, each read from the flag and each
   with its own `name`, `sprites` and `portrait` (the first block of [the reference](#hero-choice)). The game's `hero`
   is that character.

<!-- step: intro-choice -->
3. **The intro sets the flag.** In `start.intro`, a `choice` with one option per hero, each with `img` (its portrait)
   and `{ set: ['form', '<value>'] }`. The intro runs before the first room's arrival, so the hero is chosen before
   anyone talks. Reload: the New Game screen shows the cards.

<!-- step: switches -->
4. **The others' words follow the hero.** In the lines, `{hero}` is the hero's name, and
   `{form?knight=him|witch=her|*=it}` picks the words for the flag's value (the second block of
   [the reference](#hero-choice)). Talk to the character: the line reads as that hero.

<!-- step: check-every-hero -->
5. **Check every hero.** `npm run solve` stops at the first winning path, which one hero may be enough for. Prove
   them all:

   ```sh
   # in the engine repository
   GAME=heroes npm run solve -- --prove
   ```

   ```sh
   # in a created project
   npx quest-n-click solve --prove
   ```

   The proof checks every reachable state, so every hero, and reports a hero who can no longer finish as a softlock.

<!-- step: translate-and-voice -->
6. **Translate and voice it.** A translation writes its own words inside the braces, with the same flag and values;
   voices are recorded once per value. See [Translations](#hero-choice-translations) and
   [Voices](#hero-choice-voices) below.

> [!LIMIT id=heroes-tutorial-scope]
> This walk-through does not cover the art of the heroes (their sheets and portraits): see [Images](create.images.md).
> The example's voice clips are stand-ins (a babble per hero, declared in `games/heroes/provenance.json`).

<a name="hero-choice"></a>
<!-- applies: .. since 4.3.0 -->

## Reference: letting the player choose the hero

The player picks the hero at New Game: a knight, a witch or a robot, a boy or a girl, as many heroes as the game
declares. The hero keeps the same puzzles and rooms; what changes is the look, the name, and the words the others use
for the hero. It takes one flag (`form` here, any name works), one character with a variant per hero, an intro choice
that sets the flag, and switches in the texts that depend on it.

> Where the commands run: this page writes them for the engine repository (`npm run validate`, `npm run solve`,
> with `GAME=<id>` in front for another game than the default). In a created project, the same tools are
> `npx quest-n-click validate`, `npx quest-n-click solve` (`--prove`, `--chapters`), `npx quest-n-click lint`,
> `npx quest-n-click i18n status` and `npx quest-n-click voices`, and the sources are in `game/` instead of
> `games/<id>/`.

```ts
hero: 'kid',
characters: {
  kid: {
    name: 'Robo', sprites: cat('robot'), portrait: 'robot/portrait',          // the written look is a hero too
    variants: [
      { if: { flag: 'form', eq: 'knight' }, name: 'Sir Lance', sprites: cat('knight'), portrait: 'knight/portrait' },
      { if: { flag: 'form', eq: 'witch' }, name: 'Morwen', sprites: cat('witch'), portrait: 'witch/portrait' },
    ],
  },
},
start: { room: 'hall', intro: [
  'Who am I this morning?',
  { choice: [
    { text: 'Sir Lance', img: 'knight/portrait', do: [{ set: ['form', 'knight'] }] },
    { text: 'Morwen', img: 'witch/portrait', do: [{ set: ['form', 'witch'] }] },
    { text: 'Robo', img: 'robot/portrait', do: [{ set: ['form', 'robot'] }] },
  ] },
] },
checkpoints: {
  door_witch: { room: 'hall', inventory: ['key'], flags: { form: 'witch', key_found: true } },
},
```

And in a room:

```ts
talk: { grandma: [{ topic: 'Good morning, Grandma!', do: [
  { say: ['grandma', 'Good morning, {hero}! Ready, my {form?knight=brave knight|witch=clever witch|*=shiny robot}?'] },
] }] },
look: { grandma: 'Grandma. Dust makes {form?knight=him|witch=her|robot=it} sneeze.' },
```

- **The variant's `name`** replaces the character's name while the variant applies, like its `sprites`, `mouths`,
  `portrait` and `palette`: the speech box, the transcript, the talk header and `{name}` in a fallback read it. The
  first variant whose `if` holds wins; a value no variant matches gets the written look and name.
- **`{hero}`** is the active hero's name, its variant's included.
- **A switch** `{<flag>?<value>=<text>|…|*=<text>}` is the text listed for the flag's current value; `*=` covers
  every value not listed, so a line that is the same for most heroes lists only the odd ones
  (`{form?witch=my girl|*=my dear}`). No value matching and no `*=`: the first text. A text with no `{` stays as
  written. No nesting: put two switches side by side. A switch reads any flag, not only the hero's.
- **Where they are filled**: when a text is shown, in lines, choice options, looks, hints, toasts, captions, item and
  object names and objective titles. Not in room names, verbs, character names, `ui`, the title, the map, the sealed
  ending or a minigame's params: the validator refuses them there. A variant's `name` changes a character's name, and
  is shown as written too: give each hero its own variant and name instead of a switch.
- **The intro runs before the first room's arrival**, so the hero is chosen before anyone talks. With `img`, each
  option is a card: the portrait with its `text` as the label (and the screen reader's name); the cards wrap and
  scroll, so any number of heroes fits on a phone. Without `img`, the options are text lines.
- **Logic stays logic**: a rule that must differ by hero carries `if: { flag: 'form', eq: 'witch' }`. The solver
  branches over the intro's choice, but `npm run solve` stops at the first winning path; `npm run solve -- --prove`
  checks every hero. Saves keep the flag; checkpoints take it in `flags`.

> [!GUARANTEE id=hero-choice-save-keeps-hero]
> A save keeps the hero: the flag that chose it is in the saved state, so a game loaded in a new engine shows the same
> hero, with its name. Limit: the test loads a save of the heroes fixture (`tests/fixtures/heroes.ts`) in the same
> engine version; what a save does across an engine upgrade is in [State and saves](create.state-saves.md).

<a name="hero-choice-translations"></a>

### Translations

Translations write their own words inside the braces, with the same flag and values (the switch is filled after the
translation): `room:hall/look.grandma` → `Grand-mère. La poussière {form?knight=le|witch=la|robot=le} fait éternuer.`.
A language may add a switch its source does not need, for its grammar: `Ready?` becomes `Prêt{form?witch=e|*=} ?`.
The variants' names are translated too (`char:kid/variants[0].name`). `npm run i18n -- status` lists the translations
that drop a choice the source makes (a flag it no longer switches on, a value neither listed nor covered by `*=`); a
switch or a value added for the grammar is fine. More: [Translations](create.translations.md).

<a name="hero-choice-voices"></a>

### Voices

A line whose words follow a flag (`{form?m=him|f=her}`) is recorded once per value: put its clips in `audio.voices`
under `<id>~<flag>=<value>` (`grandma_saw~form=f`). With several flags in one line, sort them by name and join them
with `~` (`greet~form=f~mood=calm`); values are written as text (`true`, `2`). The engine plays the clip for the flags
as they stand and falls back to the plain id when that clip is missing or a flag is not set yet, so a game can ship
before every recording exists. `voicesByLang` uses the same keys. `npm run voices` (and the Studio's Voices tab) lists
one row per value, each with its text, and `npm run validate` warns when a voiced line lacks a value's clip. The keys
are only map keys: the file names stay yours. `{hero}` alone is not a switch: such a line keeps one clip. More:
[Voices](create.voices.md).

<a name="hero-choice-studio"></a>

### In the Studio

- **Previewing each hero**: the Play tab has a "Text switches" picker that sets the flag, and the Rooms tab shows
  under a switched text how it reads.
- **Every hero in every language at once** (4.4.0): the Voices tab, "Heroes × languages", is a read-only matrix of
  the lines with an id that depend on the hero (a switch or `{hero}`, in any language). A column per hero (each value
  the switched flags take, headed by its variant's portrait and name) and per language; each cell the text as that
  hero reads it and the clip that plays, or `missing <key>` (with the plain id when it plays as the fallback). A row
  also says when a language still has the source's text (`untranslated`), when a translation drops a choice the
  source makes (`agreement`), and when a hero's value is listed by no switch of the line and has no `*=`
  (`unlisted`). "Lines with a problem" keeps only those. See
  [Voices and the heroes × languages matrix](studio.voices-matrix.md).

<a name="hero-choice-messages"></a>

### What the tools say

- `npm run validate`: `malformed text switch "…"` (a missing `=` or `}`, a value listed twice, a brace inside);
  `text switch "…" reads flag "form", which no command sets`; `… lists value "x" for "form", which no set writes`;
  `… has no text for "form" = "robot" (written at …): list it or add "*="`; `{hero} in a text shown as written`;
  `start.intro[1].choice[0].img › image not found: "…"`. A flag counted with `inc` cannot be listed: its switch needs
  `*=` (a warning).
- `npm run validate` also warns: `voiced line with text switches lacks 1 of 3 clip(s) by value: sneeze~form=robot`.
- `npm run lint`: `hero-looks-default` (info) when two or more values of the hero's flag match no variant, so those
  heroes look like the written one (a typo in a variant's `if`, or a variant not written yet).

The example's own checks: `GAME=heroes npm run solve -- --prove` proves it for every hero; its browser test
(`games/heroes/e2e.mjs`) picks each hero in English and in French, saves, reloads, continues and finishes.

<a name="several-characters"></a>

## Reference: several playable characters

```ts
hero: 'bernard',
players: { ids: ['bernard', 'hoagie', 'laverne'], start: { hoagie: { room: 'past_lab' }, laverne: { room: 'future_lab' } },
  give: 'Here, {nom}: the {objet}.' },
```

- Each playable character has their own room, position and inventory (`sharedInventory: true` to share one bag).
  `players.start` says where the others start (default: the start room, nothing in hand).
- The hero (`hero`) is the one controlled first. A button per other character sits in the tools row (their portrait,
  or their initial): tapping it is `{ switchPlayer: 'hoagie' }`, and the view moves to their room.
- An inactive character standing in the room is drawn and can be **given** an item: it goes to their bag
  (`{ transfer: ['hamster', 'laverne'] }` does the same from a script, wherever they are). With no rule written for
  that gift, the hero says the `give` line. Its placeholders are `{item}` (the item), `{name}` (the character) and
  `{target}`; `{objet}`, `{nom}` and `{cible}` are the same three under their 4.0 names, still read (the example above
  uses them). Without `give`, the line is `Here, {name}: the {item}.`.
- The condition `{ player: 'laverne' }` tells who is acting; `'hero'` in commands always means the active one.
- If a room declares an actor for a playable character, that actor stands for them while they are inactive (poses,
  talk topics); they are not drawn twice.
- Checkpoints take `active` and `players: { id: { room, inventory } }`.
- The solver switches characters like the player would ("Switch to hoagie" in its path).

Two classic examples written this way: [the tree planted in the past](create.classics.md#tree-in-the-past) and
[the Chron-O-John](create.classics.md#chron-o-john).

<a name="which-to-use"></a>

## Which to use, and why

**Choosing the hero is one character with variants, not `players`.** Playable characters each have a button in the
tools row and stand in their own rooms, so the player could switch heroes mid-game: right for a team (Day of the
Tentacle's three kids in three times), wrong for "who am I". The hero choice changes the look, the name and the words,
never the rooms or the puzzles; what must differ by hero is written as logic (`if` on the flag), which the solver and
the proof see.

**Why a flag and switches, not one copy of each line per hero.** A switch keeps one line with one id, so a
translation, a voice key and the Studio's matrix stay attached to it; a value covered by `*=` needs no copy. The cost:
a switch is filled only where a text is shown to the player (not in names, verbs or `ui`), and a flag counted with
`inc` cannot be listed value by value.

> [!LIMIT id=hero-choice-not-mid-game]
> Nothing switches the hero mid-game in the player's interface: the choice is made in the intro. A command can set the
> flag again later, and the variant then follows, but no screen offers it.

The design record: [ADR 0022](../../docs/dev/adr/0022-hero-choice.md), decision D49 in
[`docs/dev/DECISIONS.md`](../../docs/dev/DECISIONS.md).

<a name="what-you-learned"></a>

## What you learned

- A hero is a character with variants read from one flag: [Characters](create.characters.md).
- The intro's `choice` sets that flag before the first room: [Dialogues](create.dialogues.md).
- `{hero}` and switches make the words follow the hero, in every language: [Translations](create.translations.md),
  [Voices](create.voices.md).
- `npm run solve -- --prove` checks every hero: [What the solver proves](create.solver-proofs.md).

<a name="next"></a>

## Where to go next

- [Voices: per language and per hero](create.voices.md), to record the lines per hero.
- [Example games](create.example-games.md), to read `games/heroes` in full.
- [Classic mechanics](create.classics.md), for more of what the DSL already does.
