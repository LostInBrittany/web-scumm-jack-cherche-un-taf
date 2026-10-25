# Upgrade notes: v2 to v3

These are the notes written for 3.0.0, when v3 broke the authoring contract once (authoring schema 2 to 3). They are
kept, unchanged, for a game still on authoring schema 2: a game written before 3.0.0, or a 4.1.x game that never
opted in. They do not describe a step of a current upgrade.

- Today the automatic part is one command. In a created project, `npx quest-n-click migrate` sees schema 2 and runs
  `ids --write --map` (step 2 below) for you; in the engine repository it is `GAME=<id> npm run migrate`. The three
  lines of `game.ts` (step 2) stay yours. [Upgrade](install.upgrade.md) gives the whole procedure.
- A game on a hosted Studio is upgraded by its owner through the engine upgrade (`POST /api/engine/migrate`), see
  [Upgrading the engine of a hosted game](team.upgrade-engine.md).
- The commands below are written as they were in 3.0.0, for a game inside the engine repository (`GAME=<id>`). Some
  have changed since: `npm run build` no longer runs the pixel tests (4.1.6), the names `web-scumm` became
  `quest-n-click` (4.2.5, removed in 4.3.0). The later notes say when: [4.1](install.upgrade-notes-4-1.md),
  [4.2](install.upgrade-notes-4-2.md), [4.3](install.upgrade-notes-4-3.md).

The original introduction:

v3 deliberately breaks the authoring contract once so saves can become durable afterwards. Migrate on a branch, keep
a representative v2 save, and do not change prose or reorder content until the ids below have been assigned.

<a name="baseline"></a>

## 1. Establish the baseline

On the last v2 commit, export saves at important checkpoints and keep one complete session. Record:

```bash
GAME=<id> npm run validate
GAME=<id> npm run solve
GAME=<id> npm test
```

Do not commit private game material or exported player saves to this public repository.

<a name="v3-schema"></a>

## 2. Opt into the v3 schema

Add `schemaVersion: 3` to `defineGame({...})`. `compileGame` clones and normalises the source; the compiled v3 value is
frozen, so integrations must not rely on `engine.game === source` or mutate it after construction.

Let the tool write the ids, then review them:

```bash
npm run ids                  # dry run: what would be written, what must be done by hand
npm run ids -- --write --map # writes the ids into rooms/*.ts, rules.ts, game.ts; renames locales/*.json keys;
                             # writes ids.migration.json (renameSeen / renameCounter) and ids.paths.json
```

It names things after their content (`house.open-pantry`, `house.grandma.where-is-the-key`,
`house.open-pantry.once`, `clock.wait`), uniquely across the game, deterministically. What it needs on every room
and game `Rule`, `TalkTopic`, `Choice`, `EventRule`, `once` / `nth` / `cycle` / `random` block: an `id`; on every
script: one `stepIds` entry per top-level command. Lists built by code (a spread, a `.map(...)`) are skipped and
reported with the id the engine expects: add it in the generator. Then the three lines by hand in `game.ts`:
`schemaVersion: 3`, `saveVersion` + 1, `migrations: [idsMigration]` with `import idsMigration from
'./ids.migration.json'`. `npm run validate` refuses a v3 game with a missing or duplicate id; `npm run ids` can run
again at any time (it never renames twice). Generated exit rules receive deterministic ids automatically.

<a name="migrate-saves"></a>

## 3. Migrate saves deliberately

The browser stores a `web-scumm-save` envelope with schema 3 in IndexedDB. The first v3 run imports the legacy
`<game>.save` localStorage autosave once and removes it only after a verified write. Manual slots (`saves.slots`) live
in the same database, as envelopes, verified the same way; the v2 `<game>.slot.<n>` entries are imported once too. A
file imported from the save menu also lands in the first free slot.

Increase `saveVersion` for a state change and supply one `Migration` per integer step. Besides v2 fields, v3 supports:

```ts
migrations: [{
  from: 2,
  renameCounter: { 'house:on3.0': 'pantry.first_open' },
  renameSeen: { 'topic.house/grandma[0]': 'topic.grandma.ask_key' },
  renameScript: { old_clock: 'clock' },
  renameScriptStep: { clock: { 'step.1': 'chime' } },
  renamePlayer: { kid: 'laverne' },
  renameCharacter: { old_grandma: 'grandma' },
  dropCounter: ['temporary_gag'],
  dropSeen: ['removed_choice'],
  dropScript: ['removed_patrol'],
}],
```

Map positional v2 counter/topic/script keys only when the old content and its meaning are known. There is no universal
safe conversion after content has already been reordered or translated. An unmapped stale optional reference is
pruned with a player-visible warning; malformed JSON, a foreign game, a missing current room or an unknown active
player is rejected without replacing the current session.

<a name="translations-and-minigames"></a>

## 4. Update translations and minigames

In v3 the translation paths name things by id (`room:house/on.house.open-pantry.do[1]`, `talk.grandma.<id>.topic`,
`.choice.<id>.text`, `events.<id>.do`); `npm run ids -- --write` renamed the existing tables (`ids.paths.json` holds
the map). Run `npm run i18n -- extract --lang <xx>` for every shipped language. v3 also extracts verb labels/join words and the
text paths declared by each minigame's `textParams`. Then run `npm run i18n -- status` and translate every new entry.

Custom minigames should declare `required` and `textParams` so validation and translation tools understand their
parameters. Asset ids keep the existing `sheet/cell` convention and are discovered by the asset tools.

<a name="dev-and-ci-commands"></a>

## 5. Update development and CI commands

- `npm run dev` and `npm run studio` are loopback-only.
- Use `dev:lan` / `studio:lan` for a phone and open the printed token URL.
- `npm test` is the Node suite; `npm run test:assets` is the Python-backed asset suite.
- `npm run build` requires validation and a winning witness, but not an unbounded state-space proof.
- `npm run prove:game` proves global and chapter state graphs and fails on softlocks or truncation.
- `npm run release-check` includes prerequisites, build, exhaustive proof and dependency audit.

Do not enable a partial-order reduction in proof mode until equivalence with the reference exploration is demonstrated
for the relevant game class.

<a name="verify"></a>

## 6. Verify the migrated game

```bash
GAME=<id> npm run doctor
GAME=<id> npm run build
GAME=<id> npm run prove:game
GAME=<id> npm run e2e -- http://127.0.0.1:5173/ --prod
```

Load every representative v2 save and verify its room, active player, inventories, persistent choices and script step.
Reorder one rule, topic, choice and script step in a test fixture; the same v3 save must retain its meaning. Finally,
test the production PWA online, offline in a room never visited (`npm run e2e:pwa` does it), and through an update.
The whole game is cached after the first visit unless the game says `offline: 'nearby'` (decision D5).

<a name="at-a-glance"></a>

## 7. At a glance

**What migrates on its own.** The v2 autosave is imported into IndexedDB on the first v3 launch and verified before
the old key goes. A save that names something the content no longer has is pruned with one toast (`ui.saveAdjusted`),
never refused. Without an `id`, a `once` / `nth` / `cycle` / `random` block keeps its positional v2 key, so v2 counters
survive. The solver's witness is unchanged (the private reference game: 59 actions, 355 states, 0.3 s on both).

| v2 | v3 |
|---|---|
| `npm run dev` listens on the network | `npm run dev` listens on 127.0.0.1; `npm run dev:lan` / `studio:lan` print a one-session token URL for the phone |
| `npm test` runs everything | `npm test` = Node tests; `npm run test:assets` = the Python-backed image tests; `npm run check` = tsc + Node tests |
| `npm run build` = tsc + tests + vite | `npm run build` = `check` + `test:assets` + `verify:game` (validate, solve, `--chapters`, i18n status) + vite + spoilers + asset audit |
| — | `npm run prove:game` = `--prove` and `--prove --chapters`, the exhaustive softlock gate, run by `release-check`, never by `build` |
| `npm run audit` | `npm run audit` (assets, private names) + `npm run audit:deps` (npm audit, production deps) |
| — | `npm run doctor`, `npm run e2e:smoke`, `npm run e2e:pwa`, `npm run release-check` |

**Solver exit codes.** `0` solved and no broken invariant; `1` unsolved, softlocks, errors or a broken invariant;
`2` truncated. `--json` gains `status`, `mode`, `softlocks`, `assumptions`; the human output gains one line after the
verdict (`Witness status:` / `Proof status:`), everything else is unchanged.

| Where | Field | Used by |
|---|---|---|
| a rule in `on` (room or game) | `id` | saves, the puzzle graph, the solver's heatmap (`rule:<id>`) |
| a `choice` option | `id` | `once` choices in saves, translations, voice files |
| a talk topic | `id` | `seen` topics in saves, translations |
| a listener in `events` | `id` | `once` listeners in saves |
| `once` / `nth` / `cycle` / `random` | `id` | their counters in saves (v2 `key` still read, deprecated) |
| a script | `stepIds`, one per command of `do` | a save resumes at the named step after a reorder |

**New `ui` keys** (English defaults when absent): `saveFailed`, `saveAdjusted`, `updateAvailable`, `updateNow`, `advance`, `offlineStatus`, `offlineComplete`, `offlineRetry` (3.1.1: the pause menu's offline row)
(3.1, the "tap to continue" marker for screen readers), `shareSession` (3.1, the playtest row of the pause menu).
