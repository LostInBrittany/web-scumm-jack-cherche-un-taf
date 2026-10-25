# Plan — 4.3 "Hero Choice": pick the hero's look and voice at New Game

Status: **accepted** (D49, ADR 0022), answers recorded in §8 (20 Oct). In progress.

## 1. The need

The maintainer's next game lets the player choose the hero at the start: male or female in that game, and in
general **any number of heroes**, as many as a game declares. The hero keeps the same
role, puzzles and rooms; what changes is how the hero looks, what the hero is called (one name each), and how other
characters talk to and about the hero (he/she, him/her, and in French the agreement: *content / contente*).

## 2. What 4.2 already does, and where it stops

| Need | 4.2 today | Gap |
|---|---|---|
| Ask the player | `start.intro` with `{ choice: […] }`, each answer `{ set: ['form', 'f'] }` | none |
| Prove both heroes finish | the solver branches over the intro's choices (`tools/solve/search.ts:257`) | none |
| Another look | `CharacterDef.variants[]` with `if: { flag: 'form', eq: 'f' }`: sprites, mouths, portrait, palette (`core/world-queries.ts:40`) | none |
| Another name | `name` is not in a variant; `nameOf` and the speech box read `game.characters[id].name` directly | **missing** |
| Gendered lines | only by duplicating each line under an `if` (and each choice option, each topic, each look) | **unworkable** past a few lines, and doubled again by every translation |
| Choose from portraits | a `choice` shows text lines only | nice to have |

Compositions tried and why they fall short (the admission file of §2.3, PLAN-4.1.19):

- **`players` with two heroes**: the tools row always shows a switch button per playable character
  (`dom/shell.ts:73`), so the player could swap heroes mid-game; the other hero would also stand idle in the start
  room. Wrong tool.
- **A Remix dimension** (`presentation` or a logical one): Remix chooses a *world* from a seed, before New Game,
  shared by a link and recorded in speedrun categories; its placeholders are filled **once at boot**
  (`core/remix/apply.ts:216`). The hero choice belongs to a save, not to a world: two saves in the same world can have
  two different heroes. Wrong layer.
- **Duplicated lines under `if`**: works, but every gendered line becomes a branch, every translation must follow the
  branch structure, and `npm run ids` gives each copy its own id. Fragile at the size of a real game.

## 3. The design: three small, additive pieces

Everything is optional and presentation-only: no new condition, no new command, no new state, no save migration,
`schemaVersion` stays 3. Under strict SemVer since 4.2 this is a **minor** release (4.3.0).

### 3.1 `name` in a character variant

```ts
hero: 'sam',
characters: {
  sam: {
    name: 'Sam', sprites: cat('sam'), mouths: …, portrait: 'sam/portrait',
    variants: [{ if: { flag: 'form', eq: 'f' }, name: 'Samia', sprites: cat('sam_f'), mouths: …, portrait: 'sam_f/portrait' }],
  },
},
```

- `character()` (`core/world-queries.ts:40`) merges `name` like the other fields.
- `nameOf()` reads characters through `eng.character(id)` instead of `game.characters[id]`.
- The speech box, transcript, live region and talk header (`dom/speech.ts:19,26,66,77`) read the name through
  `app.engine.character(who)`. Same audit for the other direct reads (`tools/puzzle.ts`, `tools/coverage.ts`: they
  stay on the written name, which is right for tools).
- Works for any character, not only the hero (a character renamed after a reveal).

### 3.2 Text switches, filled when a line is shown

Two placeholders, usable in **any** text the player reads (lines, choices, looks, hints, toasts, objective titles):

| Placeholder | Becomes | Example |
|---|---|---|
| `{hero}` | the active hero's name, variant included | `Good morning, {hero}!` |
| `{<flag>?<value>=<text>\|…\|*=<text>}` | the text listed for the flag's current value; `*=` is the fallback | `Grandma hugs {form?m=him\|f=her}.` · fr: `Tu es content{form?f=e\|*=} ?` |

- **Any number of heroes, generic, not gendered**: the switch reads any flag and lists as many values as the game
  has heroes (`{form?knight=Sir|witch=Madam|robot=Unit}`), and serves other needs too (a title that changes after a
  promotion). Nothing in the engine assumes two. A line that is the same for several heroes lists the odd ones and
  `*=` for the rest.
- **When**: at display time, in one function `eng.text(s)` (core) called right before `ui.say`, `ui.choose`,
  `ui.toast` and by the DOM for objective titles. After `fill()` (`{item}`, `{target}`, `{name}`) and after the
  translation, so each language writes its own words inside the braces. Never at boot: the flag lives in the save.
- **Syntax distinct from what exists**: `{code:…}` / `{hint:…}` (Remix, boot), `{item}` / `{target}` / `{name}`
  (fallbacks). The `?` marks a switch; `hero` becomes a reserved placeholder word.
- **Unknown or unset**: no matching value and no `*=` shows the first listed text (never raw braces on screen);
  the validator makes that case an error anyway (§5).

### 3.3 Portraits in a choice (UI only)

A choice option gains `img?: Id`. The choice panel shows options with an image as tappable cards: the portrait with
its `text` under it as the label (also the screen reader's name). The cards wrap in a grid: two or three per row on
a phone in landscape, more on a wide screen, and the panel scrolls past what fits, so any number of heroes works.
Without `img`, nothing changes. Options with and without `img` in one choice: the cards first, the text lines after.

```ts
start: { room: 'bedroom', intro: [
  'Who am I this morning?',
  { choice: [
    { text: 'Sam', img: 'sam/portrait', do: [{ set: ['form', 'm'] }] },
    { text: 'Samia', img: 'sam_f/portrait', do: [{ set: ['form', 'f'] }] },
    // …as many as the game has heroes, each with its variant on the hero character
  ] },
] },
```

The intro runs before the first room's arrival (`core/engine.ts:316`), so the hero is chosen before anyone talks.
The flag is set once; nothing in the engine lets the player change it later unless the author writes it.

## 4. What it does not change

- **Logic**: switches are text; the solver, the proof, replays and sessions are untouched. Both heroes are already
  proved by the intro-choice branching. A condition that must differ by hero uses `{ flag: 'form', eq: 'f' }`, as
  today.
- **Saves**: the choice is an ordinary flag. Checkpoints take `flags: { form: 'f' }`.
- **IR / fingerprint**: `variants` is already classed `presentation` (`core/ir-fields.ts:162`); text and choice `img`
  are presentation too. The logic fingerprint of an existing game does not move.
- **Remix, speedrun**: untouched. A speedrun category may later name the form; not in this release.
- **Voices**: see §3.4.

### 3.4 Voices (the game will be voiced eventually)

A clip is found by the line's id (`audio.voices[id]`). A line with a switch needs one clip per value, whoever says
it (Grandma saying "him" or "her" is two recordings), so the lookup tries, before the plain id, the id followed by
the switch flags' current values: `<id>~form=f` (several switches in one line: `<id>~form=f~mood=calm`, flags sorted).
Same rule for `voicesByLang`. Nothing new to declare: the keys follow from the text.

- `npm run` voices tooling (`tools/voices.ts`) lists the clips a line needs, one per value, as recording sheets do.
- The validator warns when a voiced line with a switch lacks a value's clip (the plain id is the fallback, so a game
  can ship before every recording exists).
- A line that does not depend on the hero (most of them) keeps one clip.

This lands last (PR 6) and only when recording starts; it changes no other piece.

## 5. Tools

| Tool | Change |
|---|---|
| Types + `ir-schema.ts` | `variants[].name?`, `Choice.img?`; the switch grammar documented in `DSL.md` |
| Validator | malformed switch; a flag no command sets; a value listed that no `set` writes; a value written by a `set` that a switch neither lists nor covers with `*=`; `{hero}` outside a game with a hero; a voiced line with a switch missing a value's clip (warning, §3.4); a choice `img` that is not an image id; the same switch flag and value set in every locale (`npm run i18n -- status`) |
| Lint | a value a choice sets for the hero's flag that no hero variant reads (that hero would look like the default one); a variant whose `name` is set but never shown — info only |
| Solver | N/A (text). A test asserts the intro choice still branches with `img` present |
| Studio | the text editor shows the raw braces; the Play tab gets a "form" picker (a flag value) to preview each hero |
| MCP | `set_text` accepts switches (validated like the Studio); no new tool |
| i18n | `extract` keeps braces intact; `status` flags a translation missing a switch the source has |
| Template / docs | `_template` untouched; CONTENT_GUIDE (en, fr) "Choosing the hero"; CLASSICS entry; DSL.md regenerated; UPGRADING §34; DSL-STABILITY; `tests/api-surface.json` grows |

## 6. Work, in pull requests

Following D33's gate (§2.3): a dedicated branch and **ADR 0022** (reserved for the first DSL extension, still vacant).

1. **ADR 0022 + this plan** (no code): the admission file (§2 above), the syntax frozen.
2. **Variant `name`**: types, schema, `character()`, `nameOf()`, `dom/speech.ts`; tests (engine: the speaker label
   and `{name}` in a fallback follow the variant).
3. **Text switches**: a pure parser in `core/text-switch.ts` (no DOM), `eng.text()` at every display site, validator
   rules, i18n status; property tests (any switch renders to text without braces; a string without `{…?` is returned
   unchanged, byte for byte); engine tests on say / choose / toast.
4. **Choice portraits**: `img` on options, the DOM cards with their labels (keyboard and screen reader: the
   option's `text` is the label), phone screenshots of the intro with 2 and with 5 heroes.
5. **Fixture + docs**: a small fixture game in `tests/fixtures/` (three heroes, an fr locale), the walkthrough for
   each hero, the docs of §5, UPGRADING, the LOG entry; then 4.3.0's release checklist.
6. **Voices by value** (§3.4), when recording starts: the lookup, the voices tool, the validator warning, a fixture
   line with one clip per hero.

Each PR: `npm run validate && npm run solve && npm test`, `npm run build`; PR 4 also a screenshot at phone size.

## 7. Deferred

- **A dedicated New Game screen** (choose the hero on the title screen, before the intro): the intro choice with
  portraits covers it without a new screen; revisit if the title screen needs it.
- **Speedrun categories by form.**

## 8. The maintainer's answers (20 Oct)

1. Syntax: `{form?m=him|f=her}` is readable. Kept as written.
2. Choosing: portraits **and** text (§3.3: each card is a portrait with its label).
3. Number of heroes: **arbitrary**, as many as a game declares (§3.2, §3.3; the fixture has three).
4. Voices: eventually. Designed now (§3.4), built last (PR 6), when recording starts.
5. Names: one name per hero (§3.1).
