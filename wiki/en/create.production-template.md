# Production template

The production plan is a document you write for one game, to hand as-is to an orchestrator that launches sub-agents
in parallel: every work package (WP) is autonomous, owns its files, and checks itself. This page is the template,
part by part, then the whole of it to copy. It is the plan used for the first game built with this engine
([Working with an AI](create.working-with-ai.md#sub-agents)).

<a name="use"></a>

## Using it

- **Where it goes.** Copy the [whole template](#template) into your game's repository as `docs/PRODUCTION.md` (the
  name the sub-agent prompt of §7 reads), and replace every `<…>`.
- **Filling it with an AI.** In the engine repository, the `/production-plan` skill (`.claude/skills/production-plan/`)
  reads the template, `games/<id>/storyboard.json` and the current state (`npm run validate`, `npm run solve`,
  `npm test`, the rooms and assets present), then fills it: delivery goal, constraints of the subject, state, work
  packages with owned files, ordering, final checklist, sub-agent prompt, a model per package.
- **Context.** The template is written for the engine repository: paths `games/<id>/…`, `src/engine/…`, and the
  scripts `npm test` and `npm run audit`. In a created project, the game is in `game/`, there is no engine package to
  change (no WP-A), and the checks are `npm run verify` (validate, solve, translation status, lint, playtests) and
  `npm run build`; see [Layout of a created project](create.project-layout.md).

<a name="header"></a>

## Header and models per package

The plan opens with its title, `Production plan — « <GAME TITLE> »`, and one paragraph: what ships, when, for whom,
and the one priority everything else bends to (for example "a game that can be finished without a bug, from the title
screen to the ending, on the family's phones"). Then it says it is written for an orchestrator, and suggests a model
per package:

| Package | Model | Why |
|---|---|---|
| Engine changes, shared rules, final QA | the strongest reasoning model available | engine logic and last-minute arbitration |
| Room transcription, assets, minigames | a fast model | large but guided word for word by the storyboard; validate + solve catch mistakes |

<a name="orchestrator"></a>

## §0 How the orchestrator runs it

1. Wave 1: the independent packages in parallel (engine, assets, minigames), then the content packages as soon as the
   engine has delivered the DSL additions they need.
2. Each agent receives the plan, its package, and the prompt template of §7. It touches **only** the files its package
   owns. A need outside its package goes into its report; it does not do it.
3. Each agent ends with `npm run validate && npm test` (and `npm run solve` for content packages) and returns a short
   report: done / not done / for another package.
4. Wave 2: the QA package starts when everyone has delivered. It may fix any file, alone.
5. Order of truth when sources disagree: `games/<id>/storyboard.json` > the owner's notes > the current code. The
   storyboard is always right about text; the code is only right about technique.

<a name="sources-of-truth"></a>

## §1 Sources of truth, read in this order

| File | Role |
|---|---|
| `games/<id>/storyboard.json` (and its Markdown export) | the whole script: boards, panels, lines, optional reactions, hints, talk topics, look lines |
| the documentation: [DSL reference](create.dsl.md), [How the engine works](engine.how-it-works.md), [Checking your game](create.checking.md) | how to write content (DSL), the engine, the tools |
| `games/<id>/layout/*.json` | validated placement (never typed by hand) |
| `games/<id>/art/<sheet>/` | all cut sprites; never recut, never deleted |

The 4.4 template named `docs/en/CONTENT_GUIDE.md`, `ENGINE.md` and `TOOLS.md` in the second row; from 4.5 those
pages are this wiki's.

<a name="constraints"></a>

## §2 Non-negotiable constraints

- `<Private material stays out of the repository: list what.>`
- Never delete an asset: rename to `_v1`, `_v2`, keep a backup.
- `<Sensitivities of the subject: people who must stay silent, jokes that are refused, tone rules.>`
- `<Style rules: sentence length, rhythm (normal → normal → normal → absurd), no plain negation as a fallback.>`

<a name="state"></a>

## §3 State of the project on a date

- **Working:** `<engine features, rooms written, items, characters, minigames, tests green, deploy documented.>`
- **Missing, by importance:** `<a numbered list.>`

<a name="work-packages"></a>

## §4 Work packages

Each package lists its owned files, its deliverables and its verification.

| Package | Owned files | Deliverables | Verification |
|---|---|---|---|
| **WP-A · Engine** | `src/engine/**` | `…` | `npm test`, a room screenshot per visual change |
| **WP-B · Content**, split by groups of rooms (B1, B2, B3) | `games/<id>/rooms/**`, `game.ts`, `items.ts`, `cast.ts` | every panel of the storyboard transcribed; hints; checkpoints | `npm run validate && npm run solve && npm test` |
| **WP-C · Assets** | `games/<id>/art/**`, `npm run assets` | `…` | `…` |
| **WP-D · Minigames** | `src/engine/minigames/**` or `games/<id>/minigames/**` | `…` | `…` |
| **WP-E · QA, pre-production, deployment** (wave 2, one agent) | any file | full e2e playthrough with screenshots, fixes, build, deploy, the checklist of §6 | §6 |

<a name="ordering"></a>

## §5 Ordering and merge rules

`<Who waits for whom; one commit per package; the commit message format.>`

<a name="final-checklist"></a>

## §6 Final checklist before sending the link

- [ ] `npm run validate`, `npm run solve`, `npm test`, `npm run build` all green
- [ ] e2e playthrough green, screenshots reviewed
- [ ] played once on a real phone, in landscape, with sound
- [ ] nothing private in `dist/` (`npm run audit`)

In the engine repository, `npm run build` already runs the type-check and the tests (`npm run check`) before the
build. The complete list before a release: [Checking your game](create.checking.md#before-you-share).

<a name="sub-agent-prompt"></a>

## §7 Prompt template for a sub-agent

```text
You work on the game « <GAME TITLE> » (repo: <path>). Read docs/PRODUCTION.md entirely, then your package: WP-<X>.
You own exclusively the files listed in your package; you change nothing else. A need outside your package goes into your report.
Sources of truth, in order: games/<id>/storyboard.json, the owner's notes, then the code.
Respect §2 without exception.
End with: npm run validate && npm test (and npm run solve for a content package).
Return a report of 15 lines maximum: done / not done and why / what another package must do / verification commands that passed.
```

<a name="template"></a>

## The whole template, to copy

```markdown
# Production plan — « <GAME TITLE> »

<One paragraph: what ships, when, for whom. The one priority everything else bends to, e.g. "a game that can be
finished without a bug, from the title screen to the ending, on the family's phones".>

This file is written to be handed as-is to an orchestrator that launches sub-agents in parallel: every work package
(WP) is autonomous, owns its files, and verifies itself.

**Suggested models per package**
| Package | Model | Why |
|---|---|---|
| Engine changes, shared rules, final QA | the strongest reasoning model available | engine logic and last-minute arbitration |
| Room transcription, assets, minigames | a fast model | large but guided word for word by the storyboard; validate + solve catch mistakes |

## 0. How the orchestrator runs this
1. Launch wave 1: the independent packages in parallel (engine, assets, minigames), then the content packages as soon
   as the engine has delivered the DSL additions they need.
2. Each agent receives this file, its package, and the prompt template of §7. It touches **only** the files its
   package owns. A need outside its package goes into its report; it does not do it.
3. Each agent ends with `npm run validate && npm test` (and `npm run solve` for content packages) and returns a short
   report: done / not done / for another package.
4. Wave 2: the QA package starts when everyone has delivered. It may fix any file, alone.
5. Order of truth when sources disagree: `games/<id>/storyboard.json` > the owner's notes > the current code.
   The storyboard is always right about text; the code is only right about technique.

## 1. Sources of truth (read in this order)
| File | Role |
|---|---|
| `games/<id>/storyboard.json` (+ its Markdown export) | the whole script: boards, panels, lines, optional reactions, hints, talk topics, look lines |
| the wiki: DSL reference, How the engine works, Checking your game | how to write content (DSL), the engine, the tools |
| `games/<id>/layout/*.json` | validated placement (never typed by hand) |
| `games/<id>/art/<sheet>/` | all cut sprites; never recut, never deleted |

## 2. Non-negotiable constraints
- <Private material stays out of the repo: list what.>
- Never delete an asset: rename to `_v1`, `_v2`, keep a backup.
- <Sensitivities of the subject: people who must stay silent, jokes that are refused, tone rules.>
- <Style rules: sentence length, rhythm (normal → normal → normal → absurd), no plain negation as a fallback.>

## 3. State of the project on <date>
**Working:** <engine features, rooms written, items, characters, minigames, tests green, deploy documented.>
**Missing, by importance:** <numbered list.>

## 4. Work packages
### WP-A · Engine (`src/engine/**`)
Owned files: … Deliverables: … Verification: `npm test`, a room screenshot per visual change.
### WP-B · Content (`games/<id>/rooms/**`, `game.ts`, `items.ts`, `cast.ts`)
Split by groups of rooms (B1, B2, B3). Owned files: … Deliverables: every panel of the storyboard transcribed; hints;
checkpoints. Verification: `npm run validate && npm run solve && npm test`.
### WP-C · Assets (`games/<id>/art/**`, `npm run assets`)
### WP-D · Minigames (`src/engine/minigames/**` or `games/<id>/minigames/**`)
### WP-E · QA, pre-production, deployment (wave 2, one agent)
Full e2e playthrough with screenshots, fixes, build, deploy, checklist of §6.

## 5. Ordering and merge rules
<Who waits for whom; one commit per package; commit message format.>

## 6. Final checklist before sending the link
- [ ] `npm run validate`, `npm run solve`, `npm test`, `npm run build` all green
- [ ] e2e playthrough green with screenshots reviewed
- [ ] played once on a real phone, in landscape, with sound
- [ ] nothing private in `dist/` (`npm run audit`)

## 7. Prompt template for a sub-agent
(the block of §7 above)
```

> [!LIMIT id=template-not-checked]
> The template is a document, not a tool: nothing checks that a plan follows it or that a sub-agent kept to its owned
> files. The checks are the commands each package ends with.

<a name="related"></a>

## Related identifiers

- `npm run validate`, `npm run solve`, `npm test`, `npm run build`, `npm run audit`, `npm run assets`.
- The `/production-plan` skill (`.claude/skills/production-plan/SKILL.md`, engine repository).
- [Working with an AI](create.working-with-ai.md), [The storyboard](create.storyboard.md),
  [Contributing with AI agents](contribute.ai-agents.md).
