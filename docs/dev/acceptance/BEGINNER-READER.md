# Documentation acceptance, level 3: a beginner reader (`docs-beginner-reader`)

Part of L6 (`docs/dev/PLAN-4.5-WIKI.md` §4.6), phase A6. This is a people's pass of the Field Kit, asked from 4.5.0 on
(`tools/field/schema.ts`, `PASS_SINCE`), bound in `docs/dev/surfaces.json`, and waited for by the `documentation` surface in `docs/dev/contracts.json`. The
binding names the engine's package, which carries the documentation bundle, and what a reader sees: `wiki/en/**`,
`wiki/fr/**`, `wiki/manifest.json`, `wiki/images/**` and this file. It leaves out `wiki/translations.json`,
`wiki/reviews.json` and the questions, so a translation or review ack does not void a pass carried to a later
candidate. Until C2 moves the images into `wiki/images/` and phase B writes the pages, that binding matches no file in
the checkout, so a 4.5.0 candidate's Field Kit cannot be made before then.
Like every pass, it is an open `field-pass` issue that the maintainer closes after the test. C3 opens that issue on the
public preview. It is reported, not blocking (D12).

## Who

One person who has never used quest'n'click. They may have played adventure games, and they may know a little HTML
or JavaScript. They read in their own language, French or English. Record which. They are not a contributor and have
not read the plan.

## The ten questions

The `beginner` list of `wiki/acceptance/questions.json`, given in the reader's language, one at a time, in this order:

| Id | Audience | English |
|---|---|---|
| `iphone-offline` | player | How do I install the game on my iPhone to play offline? |
| `save-wont-load` | player | My save won't load |
| `first-game` | author | How do I start my first game? |
| `visible-unreachable` | author | An object is visible but my character cannot reach it |
| `missing-translation` | author | Some texts are still in English in the French version |
| `phone-lan` | author | How do I try my game on my phone over Wi-Fi? |
| `check-before-share` | author | How do I check my game before sharing it? |
| `error-423` | author | I get a 423 error in the Studio |
| `invited-dev` | author | I was invited to a team's Studio: how do I start? |
| `dev-setup` | contributor | How do I set up my machine to work on the engine? |

`tests/wiki-acceptance.test.ts` checks that the list has ten entries and that each one is a question of the file.

## How

1. Give the reader the address of the published documentation (the wiki's Home, or `/docs/<v>/r<n>/`) and nothing
   else: no link to a page, no hint, no search engine.
2. For each question: start a timer, let them find the answer, and ask them to say it in their own words. Note the
   pages they opened, in order. Stop at 10 minutes.
3. Grade the answer against the question's `facts`, as in level 2: each fact **found**, **missing** or **misread**.
   Also note where they hesitated, a word they did not understand, a step they could not follow, and anything they
   expected to find and did not.
4. Do not help them. If they give up, note it and move on.

## What to bring back

A Field Kit report, made with `npm run field:init` for the release and its candidate (`passId: docs-beginner-reader`).
Its `scenario` gives the reader's profile and language, its `notes` hold the ten grades, and every misread or missing
fact becomes a `failures` entry (`step`: the question id; `expected`: the facts; `observed`: what they understood).
`npm run field:report` then writes the pass's row in `docs/dev/passes/<version>.md`. The pass is `passed` when no fact
was misread and at least eight questions were answered with their facts. Otherwise it is `failed`, with its issues.

## Limits

One reader is an anecdote, not a measure. The pass shows where a beginner gets lost. It does not rank the
documentation. The time limit and the eight-out-of-ten bar are the maintainer's to change.
