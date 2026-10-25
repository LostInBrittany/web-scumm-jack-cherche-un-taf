# The Assistant: bring your own key

The Assistant is a chat drawer in the Studio where you ask a model of your choice (OpenAI, Anthropic, Ollama, Mistral,
or any OpenAI-compatible endpoint) to help complete the game. It has the same tools as the MCP server and knows what
you have selected. You bring the key; without one, your request becomes a task for an AI agent connected through MCP.

<a name="what-you-get"></a>

## What you get

A model that reads the room or the panel you are on, writes look lines, topics or hints into the game files with the
Studio's tools, and runs validate and solve; the Studio reloads what it wrote.

<a name="context-and-versions"></a>

## Context and versions

The local Studio (`npm run studio`, engine repository or created project), where the Studio's server relays the call,
and the demo Studio, where the page calls the provider itself. True from 4.2.1.

<a name="prerequisites"></a>

## Prerequisites

- The Studio running ([overview](studio.overview.md)).
- An API key of a provider (with a spending limit), or Ollama on your machine with a model that supports tools, or
  an MCP agent for the no-key route ([Local MCP: setting up each client](studio.mcp-setup.md)).

<a name="where-to-run"></a>

## Where to run the commands

In the browser: the **Assistant** button in the top bar, or the `a` key when no field has focus. For Ollama, the
`ollama` commands run on your machine.

<a name="steps"></a>

## Steps

<!-- step: provider -->
1. **Pick a provider** (gear icon). Presets:

   | Preset | Base URL | Models offered | Key |
   |---|---|---|---|
   | OpenAI | `https://api.openai.com` | `gpt-5`, `gpt-5-mini`, `gpt-4.1` | yes |
   | Anthropic (default) | `https://api.anthropic.com` | `claude-sonnet-5` (default), `claude-opus-5`, `claude-haiku-4-5` | yes |
   | Ollama (local) | `http://localhost:11434` | `llama3.1`, `qwen3`, `mistral-small` | no |
   | Mistral | `https://api.mistral.ai` | `mistral-large-latest`, `mistral-small-latest` | yes |
   | Custom | any OpenAI-compatible base URL | typed by you | as the endpoint needs |

   For Ollama, pull the model first (`ollama pull llama3.1`) and pick one that supports tools.

<!-- step: key -->
2. **Paste your key.** It is kept in this browser tab only (sessionStorage) and sent with each request; the other
   settings (preset, URL, model) are remembered in localStorage, never the key. **Forget the key** removes it. Use a
   key with a spending limit, and forget it on a shared computer.

<!-- step: ask -->
3. **Ask.** The composer shows what the request is about: `house › pantry (prop)` (the room and the entity selected
   in Rooms), `storyboard › <board> › <panel> (panel)` (the selected panel, as edited, even unsaved), or the whole
   game. Quick actions use it: *Write 3 look lines*, *Suggest a puzzle for this room*, *Write the talk topics for this
   character*, *Find what's missing (validate + solve)*, *Draft the hint chain*, *Generate the art prompts for this
   sheet*.

<!-- step: read -->
4. **Read the answer.** Answers are light markdown (paragraphs, lists, code). Each tool call is a chip you unfold to
   see its arguments and result. **Stop** aborts the request (the server aborts the provider call too); **New chat**
   starts over. After a turn that wrote something, the Studio reloads the room, the storyboard (a banner when it has
   unsaved edits) or the notes, and runs Check.

<a name="assistant"></a>

## How it works

- **One tool registry.** [`tools/studio/tools.ts`](../../tools/studio/tools.ts) defines every tool (name, description,
  schema, handler over a backend); the MCP server and the Assistant both use it, so the Assistant has the MCP server's
  tools: `list_rooms`, `get_room`, `set_text`, `set_value`, `add_entity`, `set_layout`, `get_storyboard`,
  `set_storyboard`, `get_notes`, `add_note`, `validate`, `solve`, `screenshot`, `read_doc`, `run_tests`,
  `asset_prompts` and the others ([MCP tools](studio.mcp-tools.md)).
- **The relay** (local Studio). The page posts the conversation to `POST /__studio/api/assistant/chat` with
  `{ provider: { kind, baseUrl, model, apiKey? }, messages: [{ role, content }], context }` (a body of 4 MB at most).
  The relay ([`tools/studio/assistant.ts`](../../tools/studio/assistant.ts), loop in
  [`tools/studio/assistant-loop.ts`](../../tools/studio/assistant-loop.ts)) builds a system prompt from `AGENTS.md`,
  the game (rooms, characters, items, checkpoints) and the current selection with its texts. It calls the model, runs
  the tool calls on the game files, and streams server-sent events back: `{ type: 'text', delta }`,
  `{ type: 'tool_call', id, name, args }`, `{ type: 'tool_result', id, name, result, isError? }` (result cut at 4 KB in
  the event; the model gets up to 32 KB), `{ type: 'error', message }`, then `{ type: 'done', usage?, wrote?,
  stopped? }`. The model is told to ask before destructive changes and to keep the game's voice. Earlier turns are
  sent back as text only.
- **Two wire formats, no SDK.** OpenAI-compatible `POST <base>/v1/chat/completions` with `tools` and `stream: true`
  (OpenAI, Mistral, Ollama, most others), and Anthropic's `POST <base>/v1/messages` with `tools`, `x-api-key` and
  `anthropic-version: 2023-06-01`. Streaming answers are read as server-sent events; a provider that answers plain JSON
  works too. A base URL may or may not end in `/v1`.

<a name="limits"></a>

### Limits

| Limit | Value | When it is reached |
|---|---|---|
| Tool rounds per request | 12 | `Stopped after 12 tool rounds: ask again to continue.` |
| One provider call | 60 s | `<url> did not answer within 60 s` |
| A provider's answer | 8 MB | `the provider's answer exceeds 8 MB` |
| Redirects | none followed | `<url> answered with a redirect (…): refused, a provider must answer at its own address` |

> [!GUARANTEE id=provider-no-redirect]
> A provider call that gets a redirect is refused: a redirect could send the request, and the key, to another host.

> [!GUARANTEE id=provider-answer-cap]
> A provider's answer is read up to a cap, and refused beyond it.

<a name="custom-provider"></a>

### Custom providers and `WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`

The relay accepts the presets' addresses (OpenAI, Anthropic, Mistral) and Ollama on this machine (`localhost`,
`127.0.0.1`, `[::1]`). Any other base URL is refused unless the Studio was started with the opt-in:

```sh
# in the engine repository or the created project
WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 npm run studio
```

Even then, a custom provider must use HTTPS and cannot target a local or private network host (loopback, unspecified,
private and link-local addresses in both IP families, `.local`, `.internal`), and a provider URL cannot carry
credentials. See [Local and LAN security](studio.security.md) and
[`WEB_SCUMM_ALLOW_CUSTOM_PROVIDER`](reference.environment-variables.md#web-scumm-allow-custom-provider).

> [!GUARANTEE id=custom-provider-opt-in]
> The presets and Ollama on this machine are allowed; any other address needs the opt-in. Even with it, a plain-HTTP
> link-local address (the cloud metadata one) stays blocked.

<a name="key-safety"></a>

### Key safety

The key stays in this browser tab (sessionStorage) and goes with each request. On the local Studio, the relay keeps it
in memory for that request only: never written to disk, never logged, and removed from error messages (replaced by
`***`). In the demo Studio it goes from the page straight to the provider.

<a name="no-key-tasks"></a>

### No key: tasks for an MCP agent

Without a key (and not on Ollama), the composer offers **Send as a task to the AI agent**. The page posts
`POST /__studio/api/assistant/task` with `{ about, text }`, which appends a note with `author: "you"` and `task: true`
to `notes.json`, about the current selection. An agent connected through MCP (Claude Code, Cursor, Codex, Gemini
CLI…) reads it with `get_notes` and does the work; the Studio shows its edits live, and the Notes tab tags these notes
"task" ([Notes](studio.notes.md)).

<a name="demo"></a>

### In the demo Studio

There is no relay on a static host: the page runs the same loop itself, with the tools on the browser backend (edits
kept as demo patches, [Demo mode](studio.demo-mode.md)). `screenshot`, `run_tests` and `asset_prompts` are not
available, `set_value` answers that it needs the dev server, and `read_doc` has only `CONTENT_GUIDE`. The browser
calls the provider directly: Anthropic gets its `anthropic-dangerous-direct-browser-access` header; OpenAI refuses
browser calls from unknown origins for some keys, and the error says so. Use Ollama on your machine, allowing the
page's origin, or the local Studio, whose server relays the call:

```sh
# on your machine, for the demo Studio's page
OLLAMA_ORIGINS=<the page's origin> ollama serve
```

Tasks go into the demo's notes, and its patch.

<a name="demo-docs"></a>
<!-- applies: 4.5.0.. -->

#### Documentation in the demo

A demo built from 4.5.0 also carries the wiki's ready pages in its snapshot: the demo's Assistant can use
`search_docs`, `list_docs` and `read_doc` by id on them.

<a name="expected-result"></a>

## Expected result, and how to check it

The answer streams in; a tool chip shows `validate` returning `{ ok: true … }`; after a write, the room or the
storyboard shows the change and `git diff` holds it.

<a name="common-errors"></a>

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `custom provider URLs are disabled (set WEB_SCUMM_ALLOW_CUSTOM_PROVIDER=1 to opt in)` | A base URL that is no preset | Restart the Studio with the opt-in, or use a preset |
| `custom providers must use HTTPS and cannot target local or private network hosts` | `http://`, or a private address | Use an HTTPS public endpoint; for a local model, the Ollama preset |
| `` `provider.kind` must be openai, anthropic or ollama `` | A hand-made request | Use the settings dialog |
| `The browser could not reach <url> … (CORS)` | Demo Studio, provider refusing browser calls | Ollama with `OLLAMA_ORIGINS`, or the local Studio |
| `Stopped after 12 tool rounds` | The task needs more rounds | Ask again to continue |

More: [Studio troubleshooting](studio.troubleshooting.md#assistant).

<a name="files-changed"></a>

## Files or data changed

Whatever the tools write (room files, layouts, `storyboard.json`, `notes.json`), as the Studio would. The key is never
written; the settings without the key are in the browser's localStorage under `web-scumm.studio-assistant`.

<a name="recovery"></a>

## Recovery or going back

The model's writes go through the Studio's operations: undo them from the header during the session, or with git.

<a name="references"></a>

## References

- [`src/studio/assistant.ts`](../../src/studio/assistant.ts) (the drawer), [`tools/studio/assistant.ts`](../../tools/studio/assistant.ts)
  (the relay), [`tools/studio/assistant-loop.ts`](../../tools/studio/assistant-loop.ts) (the loop, shared with the demo).
- [Working with an AI](create.working-with-ai.md), [Local and LAN security](studio.security.md).
