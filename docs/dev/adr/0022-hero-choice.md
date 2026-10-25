# 0022 · The player chooses the hero: variant names, text switches, portraits in a choice (4.3.0)

**Context.** A game the maintainer is preparing lets the player choose the hero at New Game: male or female there,
and in general any number of heroes a game declares. The hero keeps the same puzzles and rooms; the look, the name
and the words other characters use for the hero change. 4.2 already asks (`start.intro` with a `choice` that sets a
flag), already proves every answer (the solver branches over the intro's choices) and already changes the look
(`CharacterDef.variants` read a flag). It cannot change a name, and a gendered line has to be duplicated under an
`if` with every translation following the branches. The admission file is `docs/dev/PLAN-4.3-HERO-CHOICE.md` §2: the
compositions tried were `players` (a switch button per playable character is always shown), a Remix dimension (a
world chosen from a seed and filled at boot, where the hero belongs to a save) and duplicated lines (fragile at the
size of a real game). This is the first DSL extension since the freeze (D28, amended by D33), so it uses the ADR
number D33 reserved for it.

**Decision.** Three additive, optional, presentation-only pieces; no new condition, command or state.

1. **`name` in a character variant.** `variants[].name?` replaces the character's name while the variant applies.
   Every name the player reads goes through the variant-aware `character()`: the speaker's label, the transcript,
   the talk header, `nameOf` (so `{name}` in a fallback line). The tools keep the written name.
2. **Text switches, filled when a text is shown.** `{hero}` is the active hero's name (variant included);
   `{<flag>?<value>=<text>|…|*=<text>}` is the text listed for the flag's current value, `*=` the fallback, else the
   first text. One function (`eng.text`) fills them after `fill()` and after the translation, right before a text
   reaches the presenter (lines, choices, toasts, objective titles). Never at boot: the flag lives in the save, and
   two saves of one world can have two heroes. A switch reads any flag and lists any number of values.
3. **An image in a choice.** `Choice.img?` shows the option as a card, the image with the option's text as its
   label (and its accessible name); cards wrap in a grid that scrolls, so any number of heroes fits on a phone.
4. **Voices by value** (built when a game is recorded). A line with switches looks up `<id>~<flag>=<value>` (flags
   sorted, `~` between them) before its plain id, in `audio.voices` and `voicesByLang`.

**Consequences.** Nothing moves for a game that uses none of them: its logic IR and fingerprint, its saves and
replays are the same (`variants` and choice images are classed `presentation`; text is presentation). The validator
checks switches against the flags the game sets (a value written that no switch covers, a value listed that nothing
writes, a malformed switch), and `i18n status` checks that a translation keeps its source's switches. `{hero}` is a
reserved placeholder word beside `{item}`, `{target}`, `{name}`, `{code:…}` and `{hint:…}`. Under strict SemVer
(since 4.2) this is a minor release, 4.3.0; `tests/api-surface.json` only grows.

**What would change it.** A game that needs the hero's choice to change logic in a way flags cannot express (none is
known: a condition `{ flag: 'form', eq: 'f' }` covers it), or switches that need nesting.
