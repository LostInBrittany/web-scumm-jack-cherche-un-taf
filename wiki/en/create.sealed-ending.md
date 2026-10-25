# The sealed ending

The sealed ending is an optional module: the last texts of your game (a scratch ticket, a headline, a final card with
photos) are encrypted into one file with a password, so they are never in the game's code. A player who opens the
built game's files reads nothing; the ending shows only when the game reaches it. This page sets it up, seals one
outcome and checks that nothing leaked.

<a name="what-you-get"></a>

## What you get

A `public/data/dossier.bin` file holding one chosen outcome, encrypted; a game whose `ending` module plays the scratch
ticket, the confetti and the jingle, then the final card; and a build in which `npm run check:spoilers` finds no
ending text in clear.

<a name="context-and-versions"></a>

## Context and versions

- The engine repository: `npm run seal` and `npm run check:spoilers` are scripts of the engine repository, for the
  selected game (`GAME=<id>` or `npm run game`).
- The `ending` field and its player exist in every game. From 4.1.2 (`npm run seal` no longer prints the password). The
  type is `EndingDef` since 4.0; `RevealDef` is its old name, deprecated, removed in 5.0.

> [!LIMIT id=engine-repo-only]
> A created project's `quest-n-click` command has no `seal` and no `check:spoilers`. Its game can play a sealed ending,
> but the file is sealed from the engine repository.

<a name="prerequisites"></a>

## Prerequisites

- The engine repository, installed ([Install from the repository](install.from-repository.md)).
- A script that ends the game with the ending command (below), and, if the player predicts the outcome, a flag the
  script sets with their guess.

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, at its root, with your game selected. The private configuration lives in
`games/<GAME>/private/`, which `.gitignore` keeps out of the repository.

<a name="ending"></a>

## The `ending` module

`GameDef.ending` describes it:

```ts
// games/<GAME>/game.ts
ending: {
  file: 'data/dossier.bin',                         // produced by npm run seal
  password: { given: '…' },                         // or { typed: true, prompt: 'Password?' }
  guess: { flag: 'guess', labels: { a: '…', b: '…' }, right: '… {guess} …', wrong: '…', none: '…' },   // a prediction, judged on the card
  scratch: { ticket: 'items/r4c1', sfx: 'scratch' },   // parameters of the scratch minigame
  card: { accent: '#d4145a' },                       // the final card's frame and scratched-text colour
},
```

| Field | Meaning |
|---|---|
| `file` | the sealed file, fetched under the game's base path. `npm run seal` writes `public/data/dossier.bin`, so write `data/dossier.bin` |
| `password` | `{ typed: true, prompt }`: the player types it, and it is nowhere in the bundle. `{ given }`: the engine has it, so it is in the bundle: an obfuscation, not a secret |
| `guess` | optional: the player's prediction, asked at the start (a flag a script sets) and judged on the final card. `labels` gives the word for each flag value; `{guess}` is replaced in `right`, `wrong` and `none` |
| `scratch` | the scratch minigame's parameters: `ticket` (the image) required, `sfx`, `color`…; the hidden text comes from the sealed file |
| `card` | `accent`: the colour of the frame and of the scratched text (default `#d4145a`) |

The command `{ ending: true, after: […] }` plays, in order: the scratch ticket (its text comes from the encrypted
file), the confetti (`skin.icons.confetti`, `skin.sounds.confetti`) and the jingle (`skin.sounds.jingle`), then `after`,
then the final card (music `skin.sounds.end`). It ends the game as `end` does (`state.done`, the event `endingReached`,
a save). `{ reveal: true }` is the old name. Right before it, the script plays whatever it wants (the family gathered on
the sofa, the lock melting away…).

The ending texts are **never** in the game content: they live in `games/<GAME>/private/ending.config.ts`. If the file
cannot be read or decrypted, the game shows "…" instead of the ending.

<a name="steps"></a>

## Steps

<!-- step: private-config -->
1. **Write the private configuration** from the committed example, then fill in the texts:

   ```sh
   # in the engine repository
   mkdir -p games/<GAME>/private && cp games/<GAME>/ending.config.example.ts games/<GAME>/private/ending.config.ts
   ```

   Fix the import path in the copy: the example imports `../../scripts/seal-types`; from `private/` it is
   `../../../scripts/seal-types`. Its `password` must be the same as `ending.password` in `games/<GAME>/game.ts` (or
   what the player will type). The demo game's example is
   [`games/demo/ending.config.example.ts`](../../games/demo/ending.config.example.ts).

<!-- step: seal -->
2. **Seal one outcome.** Only the chosen outcome is encrypted:

   ```sh
   # in the engine repository
   npm run seal -- --outcome=<key>
   ```

   `<key>` is one of the `outcomes` keys. It prints `✔  Sealed file (<key>) → public/data/dossier.bin (<size> KB)`; the
   password is never printed.

<!-- step: check-spoilers -->
3. **Build and check for leaks.**

   ```sh
   # in the engine repository
   npm run build && npm run check:spoilers
   ```

   `npm run build` already runs `check:spoilers` at its end (`build:game`); running it again after a build is cheap.

<a name="tools"></a>

## The configuration and the two commands

The private configuration (`EndingConfig`, [`scripts/seal-types.ts`](../../scripts/seal-types.ts)):

| Field | Meaning |
|---|---|
| `password` | the same as the game's `ending.password` (given), or what the player types (typed) |
| `outcomes` | free-form keys, each `{ ticket, headline, lines? }`: the text under the scratch area (simple HTML), the announcement on the card, extra lines. The sealed key is compared with the guess flag (`ending.guess.flag`) |
| `message` | a short note common to all outcomes |
| `photos` | the card's photos, paths relative to `games/<GAME>/private/` (jpg, png, webp, gif). `seal` warns above 800 000 bytes per photo |
| `lines` | common lines, added after the outcome's own |
| `judgeGuess` | `false`: the sealed file does not carry the outcome, and the guess is not judged (a test version) |

**`npm run seal -- --outcome=<key>`** ([`scripts/seal.ts`](../../scripts/seal.ts)) reads
`games/<GAME>/private/ending.config.ts`; without it, it uses the committed example and warns ("using the EXAMPLE
configuration"). A missing or unknown `--outcome` stops it with the list of keys. It encrypts `{ ticket, headline,
message, photos, lines, outcome }` with AES-GCM (256-bit key derived from the password by PBKDF2, SHA-256, 120 000
iterations; the password is compared without accents, case, spaces or punctuation) and writes
`public/data/dossier.bin`.

**`npm run check:spoilers`** ([`scripts/check-spoilers.ts`](../../scripts/check-spoilers.ts)) needs `dist/` (it stops
with "dist/ not found: run npm run build first."). It looks in every `.js`, `.html`, `.css`, `.json` and `.txt` file of
`dist/` for every outcome's headline, ticket text (when longer than two words) and lines, and the first line of the
message; it refuses a private file in `dist/` (a `private` folder, a `*ending.config*` or `*reveal.config*` file) and a
`dossier.bin` holding `ticket` or `headline` in clear. Exit 1 with the count of leaks. A game without a sealed ending
has only the private-file check.

> [!LIMIT id=format-frozen]
> The sealed file's fields (`ticket`, `headline`, `message`, `photos`, `lines`, `outcome`) never change: a
> `dossier.bin` already sealed stays valid.

<a name="expected-result"></a>

## Expected result, and how to check it

`check:spoilers` prints "✔ No sealed-ending text in clear text in dist/." Play the game to its ending (`npm run dev`):
the ticket scratches to the sealed outcome, then the card shows its headline, the message, the photos and the lines,
with the verdict on the player's guess.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The game shows "…" instead of the ending | the file is missing at `ending.file`, or the password differs | write `file: 'data/dossier.bin'`; make the configuration's `password` the game's |
| `⚠ … not found: using the EXAMPLE configuration` | no `games/<GAME>/private/ending.config.ts` | step 1 |
| `Usage: npm run seal -- --outcome=<key> (keys: …)` | `--outcome` missing or not a key of `outcomes` | pass one of the listed keys |
| `✘ <file> contains in clear text: "…"` | an ending text is also in the game's content | remove it from the content: it belongs in the private configuration only |
| `✘ private file in dist: …` | a private file was copied into `public/` | remove it from `public/` |
| `⚠ dist/data/dossier.bin missing (npm run seal not run?)` | no sealed file in the build | step 2, then build again |

<a name="files-changed"></a>

## Files or data changed

- `games/<GAME>/private/ending.config.ts` (yours, never committed: `private/` is in `.gitignore`).
- `public/data/dossier.bin`, overwritten by each `seal`.

> [!LIMIT id=one-dossier-per-repository]
> `seal` writes `public/data/dossier.bin` at the root of the engine repository, whatever the game selected: sealing
> another game replaces the demo's committed file. Restore it with `git checkout public/data/dossier.bin` before you
> commit, unless you mean to change it.

<a name="recovery"></a>

## Recovery or going back

Sealing again with another `--outcome` replaces the file; the previous one is not kept. `git checkout
public/data/dossier.bin` brings back the committed file.

<a name="references"></a>

## References

- [`src/engine/ending/seal.ts`](../../src/engine/ending/seal.ts) (the format and the encryption),
  [`src/engine/ending/index.ts`](../../src/engine/ending/index.ts) (the player side).
- [Built-in minigames](create.minigames.md) (`scratch`), [Skin and fonts](create.skin-fonts.md) (the confetti and the
  sounds), [Game commands](create.commands.md).
