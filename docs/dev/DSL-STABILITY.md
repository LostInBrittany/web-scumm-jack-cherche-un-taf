# The DSL's stability (4.1.12 "Language", D22; frozen at 4.1.15 "Remix", D28)

What a game's sources may count on. Since 4.1.15 everything below is **frozen**: 4.1.15 is the release candidate of
4.2, and a change to a name or a meaning waits for 4.2.0's strict SemVer, with its migration. The decision is D22
(`docs/dev/DECISIONS.md`); the representation the tools read is ADR 0013 (`docs/dev/adr/0013-game-ir-and-fingerprint.md`).
The reference of every condition and command, generated from the schema, is `wiki/en/create.dsl.md`.

## Calendar

| Version | What holds |
|---|---|
| 4.1.12 "Language" | **Stabilised**: the names and meanings below. A change is a break: its migration of the bundled games and saves ships with it (`web-scumm migrate`), and UPGRADING says it. |
| 4.1.13 → 4.1.15 | **Additive** only on what is listed "additive": new optional fields, new commands or conditions each admitted by a short ADR (0014 onward) with its proof. The IR's `variant` slot is filled by 4.1.15. |
| 4.1.15 "Remix" | **Frozen** as the 4.2 release candidate (D28): the stable list absorbs what Remix added; `tests/api-surface.json` records the candidate surface; 4.2.0 restores strict SemVer (D18). |
| 4.1.16 "Convergence" | **Frozen**, with one additive correction before 4.2 (D29, ADR 0019): `SpeedrunCategory.world` (`SpeedrunWorldPolicy`) names a run's world apart from its generator `seed`; every 4.1.15 field keeps its meaning (`seed: 'daily' \| 'mystery'` without `world` is read as that world, with a warning). |
| 4.2.0 "Stable World" | **Strict SemVer** (D18): the frozen surface below is the public API; a change to a name or a meaning is a major release. A new element enters through D33's gate (an admission file, an ADR) and is additive, in a minor release. |
| 4.2.x | **Frozen** (D40), with optional, presentation-only fields allowed (D46): no schema, save or IR change, and a game without them behaves identically. 4.2.4 adds the first three, `GameDef.input.exitOnTap` and `ExitDef.onTap` (#188), `GameDef.actorGap` (#198). |
| 4.3.x (now) | **Additive** on `main` (D48): the 4.2.x freeze no longer binds, a change to the save format or the authoring schema says so in UPGRADING and keeps the 4.2.x saves loading. 4.3.0 adds `VerbDef.key` (#203) and admits "Hero Choice", the first admission since the freeze (ADR 0022, D49): four additive, optional, presentation-only elements, listed below. No condition, command or state added; `schemaVersion` 3, saves and IR schema 1 unchanged. |

## Frozen (stable from 4.1.12, frozen at 4.1.15)

- **Conditions** (`Cond`): a flag (`'flag'`, `'!flag'`), `has`, `flag` with `eq` / `gte` / `lt`, `not`, `all`, `any`,
  `visited`, `room`, `prop`, `unlocked`, `seen`, `actorIn`, `player`. Their evaluation (`core/cond.ts`) is the one the
  runtime, the solver and the validator share.
- **Commands** (`Cmd`): every key of `CMD_KEYS` (`core/cmds.ts`), with the meaning `wiki/en/create.dsl.md` gives it. A plain
  string is the hero's line. `reveal` stays the old name of `ending` until 5.0.
- **The game** (`GameDef`): `schemaVersion: 3`, stable ids on rules, topics, listeners, choices, blocks and script
  steps (`core/content-ids.ts`), `rooms`, `rules`, `scripts`, `events`, `start`, `checkpoints` with `goals`,
  `invariants`, `players`, `map`, `migrations`, `reality.signals`, and since 4.1.12 `objectives`.
- **A room** (`RoomDef`), its props, actors, hotspots, exits, looks, rules, topics, hints, arrival, scripts, listeners;
  its stage's layers, lights, emitters, transition and walk links.
- **The IR** (`GameIR`, schema 1): its top-level fields and their meaning, `canonicalJson`, and the four components of
  `GameFingerprint`. A field added to the IR is additive; a field's meaning never changes within schema 1.

## Frozen at 4.1.15: what was additive until Remix

- `GameIR.variant`: `{ mode: 'story' }`, or `IrVariantSlot` `{ mode: 'variant', id, manifest, variant }` when the game
  was compiled from a world (ADR 0018); `ir.world.remix` (the manifest) and `ir.rooms[].anchors`.
- Remix's content: `GameDef.remix` (`VariationManifest` schema 1, algorithm `web-scumm-remix-1`, its six dimension
  kinds, three constraint kinds, modes and strategies, `daily`), `RoomDef.anchors` (`at`, `visible`, `reachableBy`,
  `capacity`, `phase`), the reserved flags `remix.<dimension>` and `remix.<dimension>.<group>` read with `{ flag, eq }`,
  the placeholders `{code:<id>}` and `{hint:<id>}`, the minigame `code-wheel` and its params. No new condition nor
  command: a `{ variant }` condition was refused, the reserved flags express every dimension (D28).
- Saves: `SaveEnvelopeV4` (`schema: 4`, the `WorldVariant`), `Session.variant`.
- Speedrun categories (4.1.16, D29): `SpeedrunCategory.world` `{ policy, mode, fixedSeed?, codeWheel? }`, the canonical
  form of a category's world before the 4.2 freeze; `seed` is the run's generator (`fixed` or `random`). The `.wsrun`
  envelope is schema 2 (`runSeed`, `variant`, `worldEvidence`); schema 1 stays readable as Story.
- Minigame results (4.1.16): `SessionEntry.mg` (`MinigameResult`: `won`, `passed`, `skipped`, `failed`, `disabled`) and
  the reserved flags `minigame.<id>` the engine writes, read with `{ flag, eq }` like `remix.*`; no new condition nor
  command (D28). `Presenter.minigame` may resolve with a result (a value an implementation can omit).
- Objectives (`GameDef.objectives`, ADR 0014): the three fields and `parent`, as 4.1.12 left them.
- `reality`: the connectors' data (`reality.connectors`, 4.1.9) and the policies of Constellation (4.1.10).
- The stage: as 4.1.11 left it.
- `fingerprint`'s `engine` component: `prngVersion` is core/prng.ts's `PRNG_VERSION` (1 since 4.1.14).
- Interface texts (`ui`) and the skin: new optional keys with English defaults stay possible after the freeze (they
  change no logic; a release in another language lists them, `npm run i18n -- status`).
- Optional presentation-only content fields (4.2.x, D46): possible after the freeze when they need no schema, save or
  IR change and a game without them behaves identically. 4.2.4: `GameDef.input.exitOnTap` and `ExitDef.onTap` (`go` or
  `walk`), a single tap on an exit going through it (#188); input only, outside the IR's logic, checked by the
  validator. `GameDef.actorGap` (#198), the hero's distance to a character scaled by its size: geometry, in the
  presentation fingerprint like the layout's approach points, checked by the validator (a positive number). 4.3.0:
  `VerbDef.key` (#203), the keyboard shortcut that picks a verb: input only, out of the IR (whose verbs keep id, label
  and join), in the presentation fingerprint only when set (a game without keys keeps its fingerprint), translated
  like the label (`verb:<id>/key`), checked by the validator in the game and in each translation (one character, not
  Space, never shared); the player can turn the keys off in the settings (WCAG 2.1.4).

## Admitted after the freeze: 4.3.0 "Hero Choice" (ADR 0022, D49)

The player chooses the hero at New Game (`docs/dev/PLAN-4.3-HERO-CHOICE.md`; its §2 is the admission file: `players`,
a Remix dimension and lines duplicated under `if` were tried and fall short). Additive and optional; a game that uses
none of them keeps its logic fingerprint, its saves and its replays.

- **`CharacterDef.variants[].name`**: a variant's name replaces the character's while it applies (`character()`,
  `nameOf()`, the speaker's label). Classed `presentation` with `variants`.
- **`Choice.img`**: an image id on a choice option, shown as a card with the option's `text` as its label.
  `presentation`; not in the IR.
- **Text switches and `{hero}`** (`core/text-switch.ts`): `{<flag>?<value>=<text>|…|*=<text>}` and `{hero}` in any text
  shown through `Engine.text` (lines, choices, looks, hints, toasts, captions, item and object names, objective
  titles), filled when shown, after the translation. The grammar is frozen as written there (`String(value)` compared
  exactly, `*=` then the first text as the fallback, no nesting, no escaping, a malformed switch left as written);
  `hero` joins `item`, `target`, `name`, `code:` and `hint:` as a reserved placeholder word. Text is presentation.
- **Voice keys by value**: a line with switches looks up `<id>~<flag>=<value>` (flags sorted, joined by `~`) before its
  plain id, in `audio.voices` and `audio.voicesByLang` (`wiki/en/create.voices.md`).

## The candidate primitives (programme §8.3)

A primitive enters only when a game or a fixture shows that a reasonable combination of the existing ones cannot
express it (programme §3, D22). The candidates, each with its verdict and its proof:

| Family | Candidate | Verdict | Proof |
|---|---|---|---|
| Narration | objectives and sub-objectives | **admitted** (ADR 0014) | 4.1.14's splits need a named, ordered "done" per step; checkpoints' `goals` are chapter ends the solver reads, not a player's journal (no title, no parent, no event). `demo` and `reference` declare 4 each. |
| Narration | quest journal | **admitted** with objectives | the pause menu's list reads `objectives`; no second primitive. |
| Narration | named dialogue states | refused, the existing ones suffice | a topic's `if` over a flag, an `nth` block inside it, and `{ seen: 'topic.<id>' }` (`games/demo/rooms/garden.ts`: Grandpa's two topics about the key, switched by `tank_drained`; `wiki/en/create.classics.md`, the insult fight). |
| Narration | parallel sequences | refused, the existing ones suffice | `{ parallel: [[…], […]] }` and world scripts (`scripts`, `tests/fixtures/world.ts`). |
| Narration | rendezvous in time | refused without proof (sheet) | no game asks for it; a script's `{ wait }` then `waitUntil` covers a timed scene. |
| Narration | real-world events | refused, the existing ones suffice | a Reality signal is an event (`reality.signals`, `events: [{ on }]`, `games/signals`). |
| Reality | wait for a signal | refused, the existing ones suffice | a listener on the signal (`games/signals/rooms/start.ts`, `start.mail-correct`) or `{ waitEvent: '<signal>' }` in a script (`tests/core.test.ts`). |
| Reality | delay and expiry | refused, the existing ones suffice | a script `[{ wait: ms }, { if: '!answered', then: [{ emit: 'timeout' }] }]` beside the listener; no Gateways scenario needed one (its signals are optional or have a `fallback`). |
| Reality | correlation | refused | no payload reaches the game (D19): a connector maps an input to one declared signal; correlating stays in the connector. |
| Reality | single consumption | exists | `SignalDef.once` (default true), since 4.1.1. |
| Reality | required capability | refused, outside the DSL | the Biscuit attenuated to a connector's signals (ADR 0007, D19). |
| Reality | offline fallback | exists | `SignalDef.fallback` for a `required` signal, proved by `npm run solve:reality`. |
| Reality | indeterminate result | exists in the connectors' data | `reality.connectors['open-badge'].indeterminate` maps the verdict to a signal (4.1.9). |
| Reality | player's consent | refused, outside the DSL | the pause menu's pairing code (4.1.1) and each connector's pairing (4.1.9). |
| Stage | conditional layers | exists | `StageLayer.visible`, `LightDef.visible`, `EmitterDef.visible` (3.4). |
| Stage | camera and focus | exists | `{ camera: 'follow' \| { pan } \| { to } }`. |
| Stage | timelines and keyframes | refused, the existing ones suffice | `{ anim, at: { frame: [cmds] } }`, `PropAnim.at`, `{ path }`, `{ parallel }`; 4.1.11's fragments ask for none. |
| Stage | zones, portals, occlusion, effects | exists | the layout's masks, walk zones and links (4.1.11), `stage.links[id].if`. |
| Stage | interruptible sequences | exists | `{ cutscene }` and the skip (the busy owner, `core/busy.ts`). |
| Stage | sync on an audio cue | refused without proof | `{ music: { stinger } }` and the music director's bar; no game or fixture of 4.1.11 needs a cue as a trigger. |
| Remix | a `{ variant }` condition | refused (4.1.15, D28), the existing ones suffice | the reserved flags `remix.<dimension>` and `{ flag, eq }` (`games/demo/rooms/market.ts`: the key under the oranges or in the lantern; `games/reference/rooms/hall.ts`: the board first, the password). |
| Remix | variation itself | admitted as data, not as a primitive (ADR 0018) | `GameDef.remix`, `RoomDef.anchors`: applied to the game before anything runs it; the runtime, the solver and the replay see plain flags. |
| Narration | the player's hero: look, name, the words others use | **admitted** (ADR 0022, D49) | a game in preparation lets the player choose the hero; `players` shows a switch button, Remix fills at boot, duplicated lines double with every translation (PLAN-4.3-HERO-CHOICE §2); `tests/fixtures/heroes.ts` plays three heroes, in English and French. |

No Reality nor stage primitive is admitted in 4.1.12: Gateways (4.1.9) and Viewport (4.1.11) needed none that the
existing commands, conditions and data cannot express, and the sheet's rule is "otherwise nothing".
