# Contributing with AI agents

quest'n'click is made with AI assistants and reviewed by people. This page says how an assistant (Claude Code, Cursor,
Codex, Gemini CLI, Aider or a hand-written agent) is set up in the engine repository, which rules it follows, and how
its work is checked before it is merged.

<a name="what-you-get"></a>

## What you get

An assistant that reads the project's rules first, edits content and code through the same commands and MCP tools a
person uses, checks its own work with the truth commands, finds the documentation by section rather than by guessing,
and whose change is read again by a second context before the maintainer merges it.

<a name="context-and-versions"></a>

## Context and versions

The engine repository. `AGENTS.md` and the MCP server exist since 1.0.0; the documentation tools `search_docs`,
`list_docs` and `read_doc { id, section }` since 4.5.0 (`read_doc { name }`, the legacy page, exists before;
since 4.5.0 it may shorten a long section to a pointer to `read_doc { id, section }`).

<a name="prerequisites"></a>

## Prerequisites

- A prepared repository: [Developer setup](contribute.setup.md).
- An assistant that can run shell commands, or an MCP client ([Local MCP setup](studio.mcp-setup.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the engine repository, on your machine; the assistant runs from the repository's root, where it finds `AGENTS.md`,
`.mcp.json` and `.cursor/mcp.json`.

<a name="how-it-is-made"></a>

## How the project is made

```text
src/engine/      core (the DSL, the engine), tools (validate, solve, lint, i18n…), dom (the player), minigames, reality
games/demo/      the sample game: rooms, layouts, art, audio, locales, storyboard
games/_template/ copied by npm run new-game
tools/           the commands, the Studio, the MCP server, the art and audio pipelines, the Vite plugins
bridge/          the Reality Bridge (the package @quest-n-click/bridge)
connectors/      the connectors of the world outside (the package @quest-n-click/connectors)
wiki/            the documentation, in English and French (4.5.0); docs/dev: the work log, the decisions, each release's passes
```

Until 4.5.0 the documentation lived in `docs/en` and `docs/fr`; they are now transition pages pointing to the wiki. The
engine, the solver and the replay share one code path ([Architecture](contribute.architecture.md),
[Code tour](contribute.code-tour.md)).

**Made with an AI assistant, reviewed by people.** The content is declarative, so an assistant reads and writes it like
any other file (`AGENTS.md` holds the rules); every operation is a command and an MCP tool
([MCP tools](studio.mcp-tools.md)); after each change it can validate, solve, replay and take a screenshot, so it sees
its own mistakes before a person does. Every result stays reviewable, in the Studio and in Git.

<a name="steps"></a>

## Steps

<!-- step: read-agents -->
1. **Point the assistant at [`AGENTS.md`](../../AGENTS.md) first.** It is vendor-neutral: every assistant reads it.
   [`CLAUDE.md`](../../CLAUDE.md) is a short pointer to it for Claude Code, with what is specific to Claude Code
   (skills, MCP through `.mcp.json`). `AGENTS.md` holds:
   - the files an assistant edits and who edits each (the storyboard first; rooms mostly by the AI; layouts never by
     hand, but by the Studio or the placement page; `notes.json` shared by both);
   - the commands that tell the truth (`validate`, `solve`, `npm test`, `e2e`, `assets`, `prompts`, `audio`, `build`,
     `studio`, `mcp`, `i18n`, `lint`, `playtests`, `ids`, `prove:game`, `doctor`, `dev:lan`, and `GAME=<id>`);
   - thirteen rules. The ones an engine contributor meets most: content is data, no functions in `games/`; never
     invent coordinates; after any content change run `npm run validate && npm run solve && npm test` and report the
     output, not a summary; after any visual change take a screenshot and look at it; never delete an asset, rename it
     `_v1`; when unsure, write a note in `notes.json` instead of guessing; read the classic mechanics before asking for
     a new command; never drop a sound file of unknown origin into `audio/`.

<!-- step: mcp -->
2. **Connect the MCP server** when the assistant speaks MCP. `npm run -s mcp` serves the Studio's operations as tools
   (`get_room`, `set_text`, `add_note`, `validate`, `solve`, `screenshot`, `read_doc`…). The repository registers it
   for Claude Code (`.mcp.json`) and Cursor (`.cursor/mcp.json`):

   ```json
   {
     "mcpServers": {
       "quest-n-click": { "type": "stdio", "command": "npm", "args": ["run", "-s", "mcp"], "env": {} }
     }
   }
   ```

   Other clients: [Local MCP setup](studio.mcp-setup.md). The human sees the assistant's edits live in the Studio and
   answers through the Notes tab; a note tagged `task: true` in `notes.json` is a request from the human (written from
   the Studio's Assistant): the assistant does it, then answers with `add_note` on the same `about`.

<!-- step: docs -->
3. **Let it find the documentation by section.** With the MCP server:
   - `search_docs { query, lang?, context?, version? }` returns `id#section` results with an excerpt and the reason of
     the match, or an explicit empty list when nothing matches with confidence;
   - `read_doc { id, section, lang? }` reads that section (20 000 characters by default, a `cursor` for the rest), with
     where the text comes from (version, commit, doc revision) at its top;
   - `list_docs { audience?, context?, type?, lang? }` lists the pages there are to read.

   `read_doc { name: "CONTENT_GUIDE" }` still returns a legacy page in one block, possibly shortened: a long section
   gives its heading, first paragraph and the `read_doc { id, section }` for the rest. Prefer `id` and `section`.

<!-- step: skills -->
4. **Use the project's skills (Claude Code).** `.claude/skills/` holds `new-game`, `new-room`, `new-character`,
   `storyboard`, `placement`, `review`, `production-plan`, `asset-prompts` and `megadrive-audio`.

<!-- step: check-own-work -->
5. **Make it check its own work, and say what it could not check.** Before a pull request, the assistant runs the list
   of [Before a pull request](contribute.before-a-pr.md), one test suite at a time, and reports the commands with their
   output. A check it could not run (no browser, no Python) is said, never skipped silently.

<!-- step: second-context -->
6. **Have a second context read it.** A change of any weight is read again by a context that did not write it (another
   session, a sub-agent), which reproduces before it judges and ranks its findings (`blocker`, `should`, `nit`), then by
   the maintainer ([Governance](contribute.governance.md)). An assistant's check of its own wiki pages is recorded as
   such (`--kind ai --relation author`), never as a person's review ([Writing documentation](contribute.writing-docs.md#reviews)).

> [!LIMIT id=no-approval-by-agent]
> An assistant never gives the maintainer's approvals: signing a release tag, approving a carried field pass, or
> recording a human review each need the maintainer's own explicit yes (D37).

<a name="expected-result"></a>

## Expected result, and how to check it

The assistant's report names the commands it ran and their output; `npm run -s mcp` lists the tools in the client;
`search_docs` answers with sections of `wiki/`. The pull request passes `pr-gate`, and the LOG or the pull request says
what the second reading found.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| The MCP client lists no tools | It was started outside the repository, or `npm ci` was not run | Start it from the repository's root; run `npm ci` |
| The assistant invents coordinates | It skipped `AGENTS.md` rule 2 | Ask the human to place things in the Studio or the placement page, then read the JSON |
| The machine heats up, tests hang | Several test suites run at once, or orphan Vitest workers remain | One suite at a time; stop leftover workers by their process id |
| A report says "all green" without output | The truth commands' output was summarised | Ask for the output itself (rule 5) |

<a name="files-changed"></a>

## Files or data changed

What the assistant edits (`games/<id>/`, `src/`, `wiki/`…), `games/<id>/notes.json` through `add_note`, and the
branch's `changes/` fragment. The MCP configuration files are tracked and need no change.

<a name="recovery"></a>

## Recovery or going back

Everything the assistant writes is in Git and in the Studio's undo: `git restore` or `git revert` undoes it.

<a name="references"></a>

## References

- [`AGENTS.md`](../../AGENTS.md), [`CLAUDE.md`](../../CLAUDE.md), [`.mcp.json`](../../.mcp.json).
- [Working with an AI on a game](create.working-with-ai.md), [MCP tools](studio.mcp-tools.md),
  [Local MCP setup](studio.mcp-setup.md).
- [Governance](contribute.governance.md), [Before a pull request](contribute.before-a-pr.md).
