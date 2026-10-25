# Asset provenance

A release says where every image, sound, voice and video it ships comes from, under which licence, and proves that the
files are the ones someone reviewed. This page shows how to write `provenance.json`, lock it after a review, and pass a
release or a commercial release.

<a name="what-you-get"></a>

## What you get

A `provenance.json` that covers every shipped asset exactly once, a `provenance.lock.json` holding each file's SHA-256
and size with the claims it was reviewed under, and a release check that fails as soon as a file or a claim changes
without a new review.

<a name="context-and-versions"></a>

## Context and versions

The engine repository (`games/<id>/provenance.json`) and the created project (`game/provenance.json`). True from 4.2.5
(the `quest-n-click` command name). The lock dates from 3.3.0, the commercial check from 3.3.1, the shipped archive's
licence files from 3.7.1.

<a name="prerequisites"></a>

## Prerequisites

- The assets prepared: `npm run assets` has run, so `assets.gen.json` and `public/assets/` exist. The checks read the
  files under `public/assets` (`ASSETS_DIR` points elsewhere, for a test fixture).
- For each asset, you know its source, its licence and its author.

<a name="where-to-run"></a>

## Where to run the commands

On your machine, at the root of the engine repository (`npm run …`) or of the created project
(`npx quest-n-click …`, `npm run release`).

<a name="steps"></a>

## Steps

<!-- step: write-entries -->
1. **Write an entry per source** in `provenance.json`. A created project starts with one: its template art is a
   placeholder drawn from shapes, marked `placeholder`.

   ```json
   {
     "licences": { "allow": ["CC BY 4.0", "own work"] },
     "assets": [
       { "match": "img:*", "source": "Drawn for the game from the prompts in prompts.md", "author": "Wano",
         "licence": "CC BY 4.0", "status": "final" },
       { "match": "sfx:door_*.mp3", "source": "Recorded at home", "author": "Wano", "licence": "own work",
         "status": "final" }
     ]
   }
   ```

   The fields are in [the reference](#provenance) below. Each asset must match exactly one entry.

<!-- step: check -->
2. **Check the coverage.**

   ```bash
   # in the engine repository
   npm run provenance          # assets by licence, and what changed since the lock (exit 1: something to review)
   npm run validate            # a game with provenance.json: every asset covered once, every entry complete
   ```

   ```bash
   # in the created project
   npx quest-n-click provenance
   npx quest-n-click validate
   ```

<!-- step: review-and-lock -->
3. **Review, then lock.** Look at every file and its entry. Then:

   ```bash
   # in the engine repository
   npm run provenance -- --lock
   ```

   ```bash
   # in the created project
   npx quest-n-click provenance --lock
   ```

   It refuses to lock while an asset is uncovered, ambiguous, its entry incomplete, or its file missing
   (`✖ … not locked: fix the provenance first`).

<!-- step: release -->
4. **Pass the release gates.**

   ```bash
   # in the engine repository
   npm run verify:release      # validate --release, weight --release, i18n status, voices check --release, strict playtests
   npm run verify:commercial   # verify:release, then validate --commercial, then verify:dist
   ```

   ```bash
   # in the created project
   npm run release                         # includes validate --release
   npm run release -- --commercial         # also validate --commercial
   ```

> [!GUARANTEE id=provenance-lock-detects-change]
> After `--lock`, a file whose bytes changed, an asset shipped since, a file missing or an entry whose licence was
> edited is reported.

`validate --release` fails on each of these, a plain `validate` only warns. An edited pattern or status is reported
like an edited licence.

> [!LIMIT id=claims-not-truth]
> The checks say the claims are complete and allow the release (or the sale), not that they are true. A wrong licence
> written in good faith passes. The review before `--lock` is a person's job.

<a name="expected-result"></a>

## Expected result, and how to check it

`npm run provenance` ends with `✔ [<game>] provenance clean: every file is the one reviewed`, and `verify:release`
(created project: `npm run release`) passes. What an exception lets through is printed as `ℹ accepted: …`, by name, not
as a warning to fix.

<a name="common-errors"></a>

## Common errors

| Message | Cause | Fix |
|---|---|---|
| `✖ [<game>] no provenance.json: say where every asset comes from first` (`provenance`), `provenance.json › missing: a release says where every asset comes from` (`validate --release`) | No file | Write it (step 1) |
| `<key>: no entry says where it comes from` (`provenance`), `provenance.json › <key>: no entry says where this asset comes from` (`validate`) | No `match` covers the asset | Add an entry, or widen a pattern |
| `<key>: more than one entry matches` (`provenance`), `… more than one entry matches this asset; make the patterns disjoint` (`validate`) | Two entries cover the asset, whatever their order | Narrow one pattern |
| `<match>: an entry needs match, source, licence and status` | An incomplete entry | Fill the four fields |
| `provenance.lock.json › missing: …` | Never locked | Review, then step 3 |
| `provenance.json › <key>: a placeholder would ship; replace it, or add a releaseExceptions entry that names it and says why` | A `placeholder` in a release | Replace the file and mark it `final`, or add a `releaseExceptions` entry |
| `provenance.json › <licence>: not in licences.allow (…), used by n asset(s): …` | A licence outside the policy | Allow it, replace the asset, or except it by name |
| `provenance.json › releaseExceptions › …: a commercial release ships no exception` | `verify:commercial` refuses every exception | Replace the asset |
| `provenance.json › …: <licence> does not allow commercial use (or changes)` | An `NC` or `ND` licence in a commercial release | Replace the asset |

<a name="files-changed"></a>

## Files or data changed

- `provenance.json` (you write it), `provenance.lock.json` (`--lock` writes it).
- The build writes, into `dist/licenses/`: `LICENSE`, `LICENSE-ASSETS`, `CREDITS.md`, `THIRD_PARTY_NOTICES.txt` and
  `assets-manifest.json` (see [the reference](#archive)).

<a name="recovery"></a>

## Recovery or going back

A lock is a file: under git, `git checkout -- provenance.lock.json` brings the previous one back. Changing a file after
a lock is not a mistake to undo: review it again, then lock again.

<a name="provenance"></a>

## Reference: `provenance.json`

<a name="entries"></a>

### Entries

`assets: [{ match, source, licence, author?, url?, prompt?, status, note? }]`

| Field | Form | Meaning |
|---|---|---|
| `match` | an asset key with `*` | `img:<manifest image id>`, `sfx:<file>`, `music:<file>`, `voice:<file>`, `video:<file>` |
| `source` | text | Where it comes from: a tool, a shop, a repository file |
| `licence` | text | `CC BY 4.0`, `own work`… |
| `author` | text, optional | Required by `verify:commercial` |
| `url` | text, optional | Where the source can be checked (a shop page, a licence, a repository) |
| `prompt` | text, optional | The generation prompt |
| `status` | `final` or `placeholder` | A placeholder fails a release unless excepted |
| `note` | text, optional | Free |

The keys map to the built files: `img:<id>` → `public/assets/img/<id>.webp`, `sfx:<file>` → `audio/sfx/<file>`,
`music:<file>` → `audio/music/<file>`, `voice:<file>` → `audio/voices/<file>`, `video:<file>` → `video/<file>`.

<a name="policy"></a>

### Licence policy and exceptions

- `licences: { allow: ['CC BY 4.0', 'own work'] }`: a release needs it; any other licence fails unless an exception
  names the asset.
- `releaseExceptions: [{ match, reason }]`: lets a named placeholder or licence through a release, with its reason. An
  exception never covers a placeholder added later.

<a name="checks"></a>

### What each command checks

| Command | Checks |
|---|---|
| `npm run validate` | A game with the file: every asset covered by exactly one entry, every entry complete; a lock that disagrees only warns |
| `npm run validate -- --release` | Requires the file, the licence policy and the lock; fails on a placeholder or licence not excepted, and on any lock difference (changed file, asset shipped since, missing file, entry edited) |
| `npm run provenance` | Prints the assets by licence and what changed since the lock; exit 1 when something needs a review |
| `npm run provenance -- --lock` | Writes `provenance.lock.json`: each shipped file's SHA-256 and size with its entry's claims (pattern, licence, status) |
| `npm run verify:commercial` | `verify:release`, then `validate --commercial`: no `releaseExceptions` entry, no placeholder, no non-commercial or no-derivatives licence (`NC`, `ND`), every entry with an `author` and a source that can be checked (a `url`, or a repository file named in `source`) |

`npm run new-game` (engine repository) writes a `provenance.json` for the art it borrows from the sample game: all
placeholders, CC BY 4.0. The sample game's own file has no exception: every one of its assets is CC BY 4.0 since 3.7,
and it passes `verify:commercial`. `tests/fixtures/release-game` fails it on purpose.

<a name="archive"></a>

### What the shipped archive holds (3.7.1)

The checks above read the game's asset graph; the archive is what Vite copies into `dist/`, and in the engine
repository `public/` is shared by every game. So every build ends with `tools/dist.ts seal` (a Vite plugin): the assets
that are not this game's are removed, and `dist/licenses/` is written: the engine's `LICENSE`, `LICENSE-ASSETS` (the
game's own if it has one), `CREDITS.md` from its provenance, `THIRD_PARTY_NOTICES.txt` (the licence of every package
the bundle took code from, Workbox's for the service worker, the fonts' OFL) and `assets-manifest.json` (each file:
path, author, source, licence, SHA-256, status). Then `npm run verify:dist` (a step of `npm run build`, so of the
release) classifies every file of `dist/`: code, a locked asset whose bytes are the ones reviewed, a data file the game
names (`ending.file`), a font, an icon, a notice. Anything else fails, and so does a locked file or a notice that is
missing. The release attaches the assets manifest beside the archive.

The weight budgets and translations checks that the same release gates run are in
[Images](create.images.md#images), [Build and release](create.build-release.md) and
[Translations](create.translations.md).

> [!LIMIT id=audit-is-different]
> `npm run audit` (engine repository) is a different check: it keeps names from a private project out of the public
> repository. It says nothing about licences.

<a name="references"></a>

## References

- [`tools/provenance.ts`](../../tools/provenance.ts), [`tools/provenance-files.ts`](../../tools/provenance-files.ts),
  [`src/engine/tools/provenance.ts`](../../src/engine/tools/provenance.ts), [`tools/dist.ts`](../../tools/dist.ts),
  [`tests/provenance.test.ts`](../../tests/provenance.test.ts).
- [Build and release](create.build-release.md) · [Images](create.images.md) · [Sound effects](create.sound-effects.md)
  · [Voices](create.voices.md) · [Licences and credits](contribute.licences.md).
