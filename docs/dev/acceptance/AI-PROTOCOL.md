# Documentation acceptance, level 2: a fresh AI agent answers the real questions

Part of L6 (`docs/dev/PLAN-4.5-WIKI.md` §4.6), phase A6. Level 1 is deterministic and runs in CI
(`npm run wiki -- acceptance`). It checks that `search_docs` puts the right page in its top 3. It cannot check that a
reader then gets the right answer from the page. Level 2 checks that: an AI agent that knows nothing of the project
answers each question with the documentation alone, and a grader compares the answer with the facts the question
requires. It is reported, not blocking (D12). It runs at C3 on the public preview, and again on each release candidate
whose documentation changed.

## How level 1 counts, which level 2 builds on

- A destination `id#section` is found only at that section. A bare page id is found at any of its sections. A result
  on the right page at another section is a miss, and the report says "the right page, another section".
- A question is **pending** while none of its destinations is written in that language. Once one is written, even a
  secondary one, a run that does not find what it expects is a miss. A counter-example is pending while any page it
  needs is unwritten (each context's page, both neighbours). `npm run wiki -- acceptance` prints this rule under its
  table.

## What is graded

`wiki/acceptance/questions.json` holds about sixty questions. Each one has an English and a French text, written the
way a reader would type it. Each one also has `facts`: short statements in English that a correct answer must contain. They say what the product
does. What the documentation does not say yet is in `gaps`, which is never graded, and validation refuses "not
documented" in a fact.
Counter-examples (`kind: "counter-example"`) are graded on their facts too. For an absent feature, the correct answer
says the feature does not exist, and does not describe a neighbouring feature instead.

## Running it

1. **Pick the channel.** Run one of the two channels, or both, and record which one you ran.
   - `mcp`: the agent has only the documentation tools of a quest'n'click MCP server: `search_docs`, `list_docs` and
     `read_doc`. Use an engine installed from the candidate's archive, outside the repository, as
     `scripts/external-consumer.mjs` does. Its tools read the archive's bundle, not a checkout.
   - `web`: the agent has only the public documentation URL (the preview at C3, then `/docs/<v>/r<n>/`), with no
     search engine and no repository.
2. **Write the prompts.** Run this command in the engine repository:

   ```sh
   npm run wiki -- acceptance --export-prompts .cache/acceptance-prompts --channel mcp
   # or: --channel web --url https://quest-n-click.cleverapps.io/docs
   # --lang en or --lang fr limits the run to one language
   ```

   It writes two folders.
   - `prompts/` is all the answering agent gets. It holds one file per question and language, `q01.en.md`,
     `q01.fr.md` and so on, and `prompts.json`, which lists them by number and language. A prompt holds the question,
     the reader's situation (context, version) and the rules of the run.
   - `grading/key.json` maps each number back to its question id. Only the grader reads it.

   The questions are numbered in the order of their ids, so a number is stable while the set is. Nothing given to the
   agent names the question's id, whether it is a counter-example, its destinations (each context's and the
   neighbours' included) or its facts. `--strict` does not go with `--export-prompts`.
3. **Run one fresh agent per prompt.** Each agent starts with an empty context: no memory of the project, no earlier
   prompt, no `CLAUDE.md` or `AGENTS.md`. Its only tools are the channel's (in Claude Code, a sub-agent whose tool list
   holds only the three `mcp__…__search_docs`, `list_docs` and `read_doc` tools, or only the web fetch restricted to
   the documentation host). Give it the prompt file's text and nothing else. Keep its whole answer and the tool calls
   it made.
4. **Grade each answer** in a second context that did not run the agent. Find the question id through
   `grading/key.json`, then grade against that question's `facts` in `questions.json`. For each fact:
   - **found**: the answer states it, in substance;
   - **missing**: the answer does not state it;
   - **misread**: the answer states something that contradicts it, or attributes it to the wrong service, version or
     context (for example a 409 explained as the Bridge's on a question about the hosted Studio).

   Then, for the whole answer: the sources it cites (`id#section`), whether one of them is among the question's
   `expect` destinations, and whether the answer invented something the documentation does not say. Grade a
   counter-example as a failure if the agent answers a neighbouring question instead of saying the feature does not
   exist.
5. **Record the results** in the pass sheet of the version, `docs/dev/passes/<version>.md`, in a section of its own
   after the people's passes (outside the `field:begin`/`field:end` block, which `npm run field:report` rewrites):

   ```markdown
   ## Documentation acceptance, level 2 (AI agent)

   Channel: mcp (archive of candidate <run>), model <name>, <date>. Questions: 60 × 2 languages.
   Facts: <found> found, <missing> missing, <misread> misread, of <total>. Answers citing an expected destination: <n>.

   | Question | Language | Found | Missing | Misread | Cited an expected page | Notes |
   |---|---|---|---|---|---|---|
   | error-423 (q07) | fr | 4 | 0 | 0 | yes | |
   ```

   Do not put a pass status word (`passed`, `failed`, `blocked`, `not-run`) in this table's second column: the status
   registry reads rows of that shape as people's passes (`tools/wiki/contracts.ts`).
6. **Turn every misread into an issue.** Do the same for every fact missing in both languages. The issue names the
   question, the page the agent read and what it understood. A misread is a documentation bug, even when level 1 found
   the right page.

## Limits

- The grade depends on the model and on the grader. Record both. A run is compared with the previous one, not with a
  threshold.
- Facts are in English. A French answer is graded on its substance, not on its wording.
- Level 2 tests the documentation through the agent's reading. An answer that is right by chance (the model knew the
  fact from elsewhere) shows only when it cites no page: note it.
