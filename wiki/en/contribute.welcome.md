# Welcome

quest'n'click is a small project with one maintainer, @wanoo. A contribution is welcome when it is small, tested and
explained: a bug fix with its regression test, a missing case of the validator, a clearer page. This page says why the
project works the way it does; the pages it links say how.

<a name="why"></a>

## Why the project works this way

**A game is data, never code.** The engine in `src/engine/` reads a game folder `games/<id>/` and knows nothing else
about it. That is what lets the validator, the solver, the replay, the Studio and an AI assistant all read and check the
same content. A change to the engine keeps that promise: gameplay stays declarative in `games/<id>/`, and geometry
stays in `layout/*.json` (see [Architecture](contribute.architecture.md)).

**Most mechanics already exist.** Before asking for a new command or field, read the classic mechanics of the genre
([Classic mechanics](create.classics.md), the old `docs/en/CLASSICS.md`): insult fights, melting items, patrols,
haggling and cross-character puzzles are combinations of rules, flags, scripts and events the engine already has. A
request for something new starts from the feature issue template, after that page.

**Every claim has a check.** The project prefers a gate that fails to a promise that drifts. Coverage floors only rise
([The coverage ratchet](contribute.coverage-ratchet.md)), the engine's behaviour is frozen in a baseline
([The quality baseline](contribute.quality-baseline.md)), and every surviving mutant is named with its reason
([Mutation testing](contribute.mutation-testing.md)). What only people and real devices can check is a field pass,
reported in each release ([Field passes](contribute.field-passes.md)).

**What is public is a promise; the rest may move.** The public DSL, the save envelope and the plugin contracts follow
semantic versioning from v3 on, except on the 4.1.8–4.1.15 incubation line, where a break was documented with a
migration ([Stability and support](start.stability.md)). Internal modules are not compatibility promises unless a
page says otherwise ([Import boundaries](contribute.boundaries.md#public-and-internal)).

<a name="how-to-help"></a>

## How a contribution goes

1. Prepare the machine once: [Developer setup](contribute.setup.md).
2. Read the code with [Architecture](contribute.architecture.md), then walk the [Code tour](contribute.code-tour.md)
   (half an hour).
3. Change one thing, with the loop of [The dev loop](contribute.dev-loop.md). Keep it small; a bug fix comes with the
   test that would have caught it.
4. Name the branch, the pull request and the fragment of the CHANGELOG as [Conventions](contribute.conventions.md)
   says.
5. Run the checks of [Before a pull request](contribute.before-a-pr.md), open the pull request from the template, and
   read what CI says ([CI explained](contribute.ci.md)).

Working with an AI assistant is expected and has its own rules: [Contributing with AI agents](contribute.ai-agents.md).

> [!LIMIT id=private-assets]
> Never add private source assets, or material whose commercial rights are unclear. Every asset of the sample game is
> CC BY 4.0 ([Licences and credits](contribute.licences.md)).

<a name="conduct"></a>

## Conduct and security

Everyone here follows the [Code of conduct](contribute.code-of-conduct.md). A vulnerability is reported privately,
never in a public issue: [Security policy](contribute.security-policy.md). How decisions are made, and who makes them,
is in [Governance](contribute.governance.md) and [Decisions and ADRs](contribute.decisions.md).

<a name="decisions"></a>

## Decisions and ADRs

- The public development documentation lives in `docs/dev/`, in English; disagreements are arbitrated by the maintainer and the exchange is committed there ([D3](../../docs/dev/DECISIONS.md)).
- [ADR 0030](../../docs/dev/adr/0030-documentation-from-wiki-sources.md): the documentation is generated from
  `wiki/`; this page is one of its sources.
