// The Studio's tools, one registry for every AI: the MCP server (tools/mcp/server.ts) registers them for MCP clients,
// the Studio's Assistant runs them in its agentic loop (tools/studio/assistant.ts on the dev server, src/studio/assistant.ts
// in demo mode). A tool is a name, a description, a zod input schema and a handler over a `ToolBackend`: the server binds
// the Studio core (tools/studio/backend.ts), the demo binds the browser backend (src/studio/api-browser.ts).
// No node import here: this file is bundled into the Studio page.
import { z } from 'zod';
import { profileText, type RealityPolicy } from '../../src/engine/tools/solve';
import { dialogueText, dialogueTree } from '../../src/engine/tools/dialogue';
import type { Layout } from '../../src/engine/core/types';
import {
  type DocsSet,
  listDocs,
  provenanceLine,
  READ_MAX_CHARS,
  readDocById,
  searchDocs,
  StaleCursor,
} from '../wiki/docs';
import type {
  AddEntity,
  CoverageData,
  GameInfo,
  LintData,
  PlaytestsData,
  GraphData,
  PuzzleData,
  NewNote,
  NotesFile,
  ReportData,
  RoomData,
  SolveData,
  ValidateResult,
} from './types';

/** The operations the tools need. Same method names as the Studio's `Api` (src/studio/api.ts), so `BrowserApi` fits. */
export interface ToolBackend {
  game(): Promise<GameInfo>;
  room(id: string): Promise<RoomData>;
  setLayout(id: string, layout: Layout): Promise<unknown>;
  setText(id: string, path: string, value: string | null): Promise<unknown>;
  /** 3.4: a structured value at a path of the room file (`dry`: the diff only), validated after the write. */
  setValue(id: string, path: string, value: unknown, dry: boolean): Promise<unknown>;
  add(id: string, e: AddEntity): Promise<unknown>;
  storyboardRaw(): Promise<unknown>;
  setStoryboard(sb: unknown): Promise<unknown>;
  notes(): Promise<NotesFile>;
  addNote(n: NewNote): Promise<unknown>;
  validate(): Promise<ValidateResult>;
  /** `prove`: the exhaustive search (softlocks), slow on a big game. */
  solve(from?: string, prove?: boolean, reality?: RealityPolicy): Promise<SolveData>;
  /** The content profiler (rooms, items, characters: what is thin). */
  report?(): Promise<ReportData>;
  /** The world's map: rooms, exits, gotos, unreachable rooms. */
  graph?(): Promise<GraphData>;
  /** The puzzle graph; `id`: one item / flag / prop card. */
  puzzle?(id?: string): Promise<PuzzleData>;
  /** The storyboard checked against the content. */
  coverage?(): Promise<CoverageData>;
  /** The playtests of games/<id>/playtests replayed and summed up. */
  playtests?(): Promise<PlaytestsData>;
  /** The game's intermediate representation (4.1.12, ADR 0013), with the file and line of each id. */
  ir?(): Promise<unknown>;
  /** The content lint after a solver run (`prove`: the exhaustive search). */
  lint?(prove?: boolean): Promise<LintData>;
  /** Optional abilities: a tool whose ability is missing is left out of `toolsFor(backend)`. */
  screenshot?(room: string, checkpoint?: string): Promise<ToolResult>;
  /**
   * One of the eight historical pages (`read_doc {name}`): rebuilt from the wiki's sections in `wiki/legacy.json`'s
   * order (the bundle's `legacy/<NAME>.md` in a package; tools/wiki/docs-load.ts `legacyDoc`).
   */
  readDoc?(name: DocName): Promise<string>;
  /**
   * The documentation of `wiki/` (4.5.0, ADR 0030): a package's bundle, the repository's preview, the demo's embedded
   * pages. `search_docs`, `list_docs` and `read_doc {id}` read it.
   */
  docs?(): Promise<DocsSet>;
  runTests?(): Promise<ToolResult>;
  assetPrompts?(
    missing?: boolean,
  ): Promise<{ markdown: string; missing: string[]; sheets: { id: string; kind: string; missing: string[] }[] }>;
  /** A speedrun envelope (`.wsrun` text) verified against the game (4.1.14): verdict, code, reason, trust. */
  speedrunVerify?(wsrun: string): Promise<unknown>;
  /** Default author of add_note (the MCP client's name, the model's name). */
  author?(): string;
}

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

export const DOCS = [
  'CONTENT_GUIDE',
  'ENGINE',
  'TOOLS',
  'STUDIO',
  'WORKFLOW',
  'AUDIO',
  'UPGRADING',
  'CLASSICS',
] as const;
export type DocName = (typeof DOCS)[number];

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /** zod raw shape of the arguments (empty: none). */
  input: z.ZodRawShape;
  output?: z.ZodRawShape;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  /** It changes a game file (the Studio refreshes after it). */
  writes?: boolean;
  /** The optional backend ability it needs. */
  needs?:
    | 'screenshot'
    | 'readDoc'
    | 'docs'
    | 'runTests'
    | 'assetPrompts'
    | 'report'
    | 'graph'
    | 'puzzle'
    | 'coverage'
    | 'lint'
    | 'playtests'
    | 'ir'
    | 'speedrunVerify';
  /** Runs with arguments already validated against `input` (callTool, the MCP SDK); `tool()` types them per tool. */
  run(args: unknown, b: ToolBackend): Promise<ToolResult>;
}

/** A tool as written: `run` receives the arguments its zod `input` describes. */
interface TypedTool<S extends z.ZodRawShape> extends Omit<ToolDef, 'input' | 'run'> {
  input: S;
  run(args: z.infer<z.ZodObject<S>>, b: ToolBackend): Promise<ToolResult>;
}
/** Types a tool's `run` from its `input` and erases it into the registry's `ToolDef`. */
const tool = <S extends z.ZodRawShape>(t: TypedTool<S>): ToolDef => t;

export const textResult = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
export const jsonResult = (v: unknown): ToolResult => textResult(JSON.stringify(v, null, 2));
/** A failed operation as a tool error: the message, and the HTTP-like status when there is one. */
export const errorResult = (e: unknown): ToolResult => ({
  content: [{ type: 'text', text: `Error: ${errorMessage(e)}` }],
  isError: true,
});
export function errorMessage(e: unknown): string {
  const status = (e as { status?: unknown })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  return typeof status === 'number' ? `${msg} (status ${status})` : msg;
}

/**
 * A documentation tool's answer: a text block, and a structured content that holds that same text beside its fields
 * (a client that shows only the structured content loses nothing). `{text, structured}`: that text and those fields;
 * any other object: the provenance line and the object as JSON. A stale cursor or a missing page is a tool error,
 * `stale_cursor` named in the structured content.
 */
async function docsResult(fn: () => Promise<object>): Promise<ToolResult> {
  try {
    const r = (await fn()) as { text?: string; structured?: Record<string, unknown> } & Record<string, unknown>;
    if (typeof r.text === 'string' && r.structured)
      return { content: [{ type: 'text', text: r.text }], structuredContent: { ...r.structured, text: r.text } };
    const header = 'provenance' in r ? `${provenanceLine(r.provenance as never)}\n\n` : '';
    const text = `${header}${JSON.stringify(r, null, 2)}`;
    return { content: [{ type: 'text', text }], structuredContent: { ...r, text } };
  } catch (e) {
    const err = errorResult(e);
    return e instanceof StaleCursor
      ? { ...err, structuredContent: { error: e.code, text: err.content[0]!.text } }
      : err;
  }
}

/** Runs an operation: its result as JSON (a string as is), or a tool error with the message. */
async function op(fn: () => Promise<unknown> | unknown): Promise<ToolResult> {
  try {
    const r = await fn();
    return typeof r === 'string' ? textResult(r) : jsonResult(r);
  } catch (e) {
    return errorResult(e);
  }
}

const roomId = z.string().describe('Room id, e.g. "house" (see list_rooms).');
const point = z.tuple([z.number(), z.number()]).describe('[x, y] in the logical 640 × 400 room space.');

export const TOOLS: ToolDef[] = [
  tool({
    name: 'list_rooms',
    title: 'Game overview',
    description:
      'The current game: id, title, hero, rooms (id, name, decor), characters, items, verbs, checkpoints ' +
      '(named save states usable by solve and screenshot) and the image ids of the asset manifest with their size. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    run: (_a, b) => op(() => b.game()),
  }),
  tool({
    name: 'get_room',
    title: 'Read a room',
    description:
      'One room: `def` (the RoomDef as loaded: props, actors, hotspots, look lines, reactions `on`, talk, hints, ' +
      'onEnter), `layout` (geometry from layout/<id>.json), `texts` (every editable string literal with its JSON path, ' +
      'value, kind, line and speaker) and `file`. Use the `path` of a text with set_text. Read-only.',
    input: { id: roomId },
    annotations: { readOnlyHint: true },
    run: ({ id }, b) => op(() => b.room(id)),
  }),
  tool({
    name: 'set_layout',
    title: 'Write a room layout',
    description:
      'Replaces layout/<id>.json with `layout` (the whole Layout object, same shape as get_room returns: ' +
      'props, hotspots, actors, walk, scale, entries…). Read the room first and change only what you must; never invent ' +
      'coordinates the human has not given you.',
    input: { id: roomId, layout: z.record(z.string(), z.unknown()).describe('The complete Layout object.') },
    annotations: { destructiveHint: true, idempotentHint: true },
    writes: true,
    run: ({ id, layout }, b) => op(() => b.setLayout(id, layout)),
  }),
  tool({
    name: 'set_text',
    title: 'Edit a text of a room',
    description:
      'Edits one string literal of rooms/<id>.ts in place, addressed by its path from get_room `texts` ' +
      '(e.g. "look.pantry[1]", "on[3].do[0]", "talk.grandma[0].topic", "hints[2].lines[0]", "props.lamp.name"). ' +
      '`value` replaces the string. `value: null` deletes a list line, or a whole `look.<id>`. A path ending in "[+]" ' +
      'appends a line: "look.piano[+]", "hints[2].lines[+]", "on[3].do[+]" (a bare string in a command list is a hero line). ' +
      'Ids, image refs, flags and conditions are not texts and are refused. Paths after an append or a deletion shift: ' +
      'call get_room again. Result { ok, line, changed } (changed false: the value was already there).',
    input: {
      id: roomId,
      path: z.string().describe('JSON path of the text under defineRoom({...}); may end in "[+]" to append.'),
      value: z.string().nullable().describe('The new text, or null to delete.'),
    },
    annotations: { destructiveHint: true },
    writes: true,
    run: ({ id, path, value }, b) => op(() => b.setText(id, path, value)),
  }),
  tool({
    name: 'set_value',
    title: 'Write a structured value in a room',
    description:
      "Writes a structured value (3.4) at a path of rooms/<id>.ts, as code in the file's style: a reaction " +
      '("on[3]", or "on[<length>]" to add one), a condition ("on[3].if"), a command list ("on[3].do", "onEnter"), the ' +
      'room\'s stage ("stage": layers, lights, emitters, transition, links; CONTENT_GUIDE "The stage"), its painter ' +
      '("renderer": "dom" | "canvas"). With `id: "@game"` the game file instead, for its objectives only ' +
      '("objectives.<id>": { title, done, optional?, parent? }, or one of its fields; list_rooms shows them). ' +
      '`value` is the JSON of it; omit it (null) to remove the path. `dry: true` returns ' +
      'the diff only. Otherwise the game is reloaded and validated after the write: an edit that adds a validation ' +
      'error is taken back and refused with the errors. Result { ok, line, changed, diff }.',
    input: {
      id: roomId,
      path: z
        .string()
        .describe(
          'Path under defineRoom({...}): "stage", "renderer", "on[3]", "on[3].if", "on[3].do", "onEnter"; with id "@game": "objectives.<id>".',
        ),
      value: z
        .unknown()
        .nullable()
        .describe('The value as JSON (a condition, a command list, a stage…); null removes the path.'),
      dry: z.boolean().optional().describe('Only return the diff, write nothing.'),
    },
    annotations: { destructiveHint: true },
    writes: true,
    run: ({ id, path, value, dry }, b) => op(() => b.setValue(id, path, value === null ? undefined : value, !!dry)),
  }),
  tool({
    name: 'add_entity',
    title: 'Add a prop, hotspot or actor',
    description:
      'Adds an entry to rooms/<id>.ts (section created if absent), its optional first look line, and a place ' +
      'in the layout: prop foot at `at` (height 60), hotspot 60 × 60 box centred on `at`, actor feet at `at`. `name` is ' +
      'required for props and hotspots; `img` is a prop image id (list_rooms images); `char` is the actor character id. ' +
      '`at` defaults to [320, 300]: then ask the human (add_note) to drag it in place in the Studio. 409 if the id exists.',
    input: {
      id: roomId,
      kind: z.enum(['prop', 'hotspot', 'actor']),
      entityId: z.string().describe('The new entity id (letters, digits, _ and -).'),
      name: z.string().optional().describe('Display name.'),
      img: z.string().optional().describe('Prop image id.'),
      char: z.string().optional().describe('Actor character id.'),
      at: point.optional(),
      look: z.string().optional().describe('First look line.'),
    },
    annotations: { destructiveHint: false },
    writes: true,
    run: ({ id, kind, entityId, name, img, char, at, look }, b) =>
      op(() => b.add(id, { kind, id: entityId, name, img, char, at: at ?? [320, 300], look })),
  }),
  tool({
    name: 'get_storyboard',
    title: 'Read the storyboard',
    description:
      'storyboard.json: { boards: [...] } with panels, lines, hints and talk topics. The storyboard is the ' +
      'source of truth for text: change it first, then the rooms. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    run: (_a, b) => op(() => b.storyboardRaw()),
  }),
  tool({
    name: 'set_storyboard',
    title: 'Write the storyboard',
    description:
      'Replaces storyboard.json with `storyboard` (must be { boards: [...] }; send the whole object as read ' +
      'with get_storyboard, modified). Written compactly; an unchanged storyboard is not rewritten. Result { ok, changed }.',
    input: { storyboard: z.looseObject({ boards: z.array(z.unknown()) }).describe('The whole storyboard.') },
    annotations: { destructiveHint: true, idempotentHint: true },
    writes: true,
    run: ({ storyboard }, b) => op(() => b.setStoryboard(storyboard)),
  }),
  tool({
    name: 'get_notes',
    title: 'Read the notes',
    description:
      'notes.json, the shared log between the human and the AI: { entries: [{ id, about, author, text, at, task? }] }. ' +
      'The human answers your questions here; entries with `task: true` are requests from the human for you to do. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    run: (_a, b) => op(() => b.notes()),
  }),
  tool({
    name: 'add_note',
    title: 'Write a note to the human',
    description:
      'Appends a note to notes.json (shown in the Studio Notes tab). Use it when unsure what the human wants, ' +
      'or to ask them to place something. `about` is a room id, a panel id, `room.entity` or free text. `author` ' +
      'defaults to the name of your MCP client.',
    input: {
      about: z.string().optional().describe('What it is about.'),
      author: z.string().optional().describe('Who writes (default: the MCP client name, or "ai").'),
      text: z.string().describe('The note.'),
    },
    writes: true,
    run: ({ about, author, text }, b) => op(() => b.addNote({ about, author: author ?? b.author?.() ?? 'ai', text })),
  }),
  tool({
    name: 'validate',
    title: 'Validate the game',
    description:
      'Static checks: broken ids, missing look lines, flags never set or read, minigame params. ' +
      'Result { ok, errors, warnings, ms }. Run after every content change.',
    input: {},
    annotations: { readOnlyHint: true },
    run: (_a, b) => op(() => b.validate()),
  }),
  tool({
    name: 'solve',
    title: 'Solve the game',
    description:
      'Explores the game states to prove it can be finished, from New Game or from checkpoint `from`. ' +
      'Result { status, exit, headline, mode, finished, states, truncated, path, roomsReached, flagsReached, itemsNeverUsed, unusedItems, ' +
      'deadEnds, softlocks, errors, from, ms }. `status`/`exit`/`headline` are exactly what `npm run solve` prints (0 solved, 2 truncated: nothing proved, 1 a bug to fix). `prove: true` runs the ' +
      'exhaustive search (softlocks complete). `profile: true` adds why the search is slow or big.',
    input: {
      from: z.string().optional().describe('Checkpoint id (list_rooms checkpoints).'),
      profile: z
        .boolean()
        .optional()
        .describe(
          'Add the solver profile as text: what the states are made of, what the search cost, independent dimensions, monotonic things.',
        ),
      prove: z
        .boolean()
        .optional()
        .describe(
          'Exhaustive search: every reachable state and the softlocks (slow on a big game; default: the fast witness).',
        ),
      reality: z
        .union([z.enum(['closed', 'adversarial']), z.object({ scenario: z.string(), signals: z.array(z.string()) })])
        .optional()
        .describe(
          'A game with reality.signals (4.1.1): the world to solve in. `closed` (default) no signal, a scenario ' +
            '{ scenario, signals } in that order, `adversarial` any declared signal at any point. A simulation: no service is contacted.',
        ),
    },
    annotations: { readOnlyHint: true },
    run: ({ from, profile, prove, reality }, b) =>
      op(async () => {
        const r = await b.solve(from, prove, reality);
        if (!profile) {
          const { profile: _p, ...rest } = r;
          return rest;
        }
        return { ...r, profile: r.profile ? profileText(r.profile) : undefined };
      }),
  }),
  tool({
    name: 'content_report',
    title: 'Content profiler',
    description:
      'Game-design profiler, as Markdown: per room (zones, props, actors, exits, rules, topics, hints, scripts; ' +
      'things with no look line, verbs that only get fallbacks, props that never change), per item (obtained where, ' +
      'how many rules use it, consumed), per character (rooms, topics, lines, unreachable topics), unreachable rooms and ' +
      'exits with no way back. Read it to decide what to write next. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    needs: 'report',
    run: (_a, b) => op(async () => (await b.report!()).markdown),
  }),
  tool({
    name: 'get_ir',
    title: 'The game as the tools see it',
    description:
      "The game's intermediate representation (4.1.12): rooms, entities, rules, topics, listeners, scripts, " +
      'objectives, Reality policies and the trusted extensions by name, each id with the file and line that writes ' +
      'it (`provenance`). The same JSON as `npm run ir -- --json`. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    needs: 'ir',
    run: (_a, b) => op(() => b.ir!()),
  }),
  tool({
    name: 'world_graph',
    title: 'World map',
    description:
      'The rooms and the ways between them (declared exits, goto commands, map places) as a DOT graph, with ' +
      'unreachable rooms and exits with no way back. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    needs: 'graph',
    run: (_a, b) =>
      op(async () => {
        const g = await b.graph!();
        return `${g.dot}\n\nunreachable: ${g.graph.unreachable.join(', ') || 'none'}\none-way: ${g.graph.oneWay.map((e) => `${e.from} → ${e.to} (${e.via})`).join('; ') || 'none'}`;
      }),
  }),
  tool({
    name: 'dialogue_tree',
    title: 'Dialogue tree',
    description:
      'The conversation of a character in a room as an indented tree: topics (with their conditions), lines, ' +
      'choices and their options, branches. Derived from the talk topics, nothing else to maintain. Read-only.',
    input: {
      id: z.string().describe('Room id.'),
      actor: z.string().optional().describe('Actor id (default: every character with topics).'),
    },
    annotations: { readOnlyHint: true },
    run: ({ id, actor }, b) =>
      op(async () => {
        const r = await b.room(id);
        const talk = r.def.talk ?? {};
        const who = actor ? [actor] : Object.keys(talk);
        if (actor && !talk[actor])
          return `no topics for "${actor}" in ${id} (${Object.keys(talk).join(', ') || 'none'})`;
        return (
          who.map((a) => `# ${a}\n${dialogueText(dialogueTree(talk[a] ?? [], `talk.${a}`))}`).join('\n\n') ||
          `no conversation in ${id}`
        );
      }),
  }),
  tool({
    name: 'puzzle_graph',
    title: 'Puzzle graph',
    description:
      'What every rule, topic, script and listener needs (conditions, items) and changes (items, flags, props, ' +
      'places, events). Without `id`: the overview as Markdown (every item and flag with what produces and uses it, flags ' +
      'read but never set, things produced but never used). With `id` (an item, flag, prop, place or event): its card: ' +
      'acquired by, consumed by, used by, requires first, unlocks, downstream. Read it before changing a puzzle. Read-only.',
    input: {
      id: z.string().optional().describe('An item, flag, prop (room.prop), place or event id; none for the overview.'),
    },
    annotations: { readOnlyHint: true },
    needs: 'puzzle',
    run: ({ id }, b) => op(async () => (await b.puzzle!(id)).markdown),
  }),
  tool({
    name: 'storyboard_coverage',
    title: 'Storyboard coverage',
    description:
      'The storyboard (get_storyboard) checked against the content, as Markdown: per board and panel, ' +
      'whether its room, speakers, lines, talk topics, sounds and actions ("Open the armchair", "Use pipe with tank") ' +
      'exist in the game: ok, partial (the pieces exist, no rule answers; a close line), missing, or unknown (prose). ' +
      'Read it to find what of the story is not implemented yet. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    needs: 'coverage',
    run: (_a, b) => op(async () => (await b.coverage!()).markdown),
  }),
  tool({
    name: 'playtests',
    title: 'Playtests',
    description:
      'The sessions players shared from their phones (games/<id>/playtests/*.session.json, ids only) ' +
      'replayed on the current content and summed up, as Markdown: time per room, where players stall (the same ' +
      'action again and again without effect), hints shown, where they stopped, minigames played, sessions the content ' +
      'has outgrown. Read it to know where the game is harder than you think. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    needs: 'playtests',
    run: (_a, b) => op(async () => (await b.playtests!()).markdown),
  }),
  tool({
    name: 'lint',
    title: 'Content lint',
    description:
      'What the validator cannot say and the solver does not say loudly, as Markdown: conditions nothing ' +
      'can satisfy, rules another rule hides, items no rule needs or nothing gives, hints that cannot fire, choices ' +
      'with a dead option, and, from a solver run, live actions never run and rooms never reached. Each finding names ' +
      'its content path, its stable id and what to do. `prove: true` runs the exhaustive search first (slow on a big ' +
      'game). Read it before asking a human for a review. Read-only.',
    input: { prove: z.boolean().optional().describe('Run the exhaustive proof first (default: the fast witness).') },
    annotations: { readOnlyHint: true },
    needs: 'lint',
    run: (a, b) => op(async () => (await b.lint!(!!a.prove)).markdown),
  }),
  tool({
    name: 'screenshot',
    title: 'Screenshot a room',
    description:
      'Renders a room (optionally at a checkpoint) with the real engine through the running dev server ' +
      '(default http://localhost:5173/, env WEB_SCUMM_DEV_URL; start it with npm run studio or npm run dev) and Playwright. ' +
      'Returns the PNG path (relative to the repository) to open and look at, or an explanation when unavailable.',
    input: { room: roomId, checkpoint: z.string().optional().describe('Checkpoint id.') },
    annotations: { readOnlyHint: true },
    needs: 'screenshot',
    run: async ({ room, checkpoint }, b) => {
      try {
        return await b.screenshot!(room, checkpoint);
      } catch (e) {
        return errorResult(e);
      }
    },
  }),
  tool({
    name: 'search_docs',
    title: 'Search the documentation',
    description:
      'Searches the documentation pages (the wiki written under wiki/, 4.5.0) by words, in French or English: page ' +
      'titles and questions first, then aliases, keywords and identifiers (a DSL command, an npm script, an HTTP code ' +
      'such as 423), then section headings, then section text. Accents and case do not matter; the glossary adds the ' +
      "other language's words (verrou, lease). Each result is `id#section` with its title, type, context, versions, " +
      'status, score, the reason of the match and an excerpt with the words found in bold: read it with ' +
      'read_doc { id, section }. No confident match gives an empty list and the index pages to try. `version` leaves ' +
      'out what does not apply to that version. Read-only.',
    input: {
      query: z.string().min(1).describe('Words or a question, in French or English.'),
      lang: z.enum(['en', 'fr']).optional().describe('Only pages in this language (default: both).'),
      audience: z.enum(['player', 'author', 'admin', 'contributor']).optional(),
      context: z
        .enum(['engine-repo', 'created-project', 'studio-local', 'studio-demo', 'studio-hosted', 'bridge', 'player'])
        .optional(),
      version: z.string().optional().describe('A product version (4.5.0): only what applies to it.'),
      type: z.enum(['tutorial', 'howto', 'reference', 'explanation', 'troubleshooting', 'index']).optional(),
      includeArchived: z
        .boolean()
        .optional()
        .describe('Also deprecated and archived pages, and with `version` the pages that do not apply, marked so.'),
      limit: z.number().int().min(1).max(20).optional().describe('Results per answer (default 5, at most 20).'),
      cursor: z.string().optional().describe('The `cursor` of a previous answer to the same request, for more.'),
    },
    annotations: { readOnlyHint: true },
    needs: 'docs',
    run: async (a, b) => docsResult(async () => searchDocs(await b.docs!(), a)),
  }),
  tool({
    name: 'list_docs',
    title: 'List the documentation pages',
    description:
      'The documentation pages there are to read (wiki/, 4.5.0), filtered by audience, context, type, language or ' +
      'state: id, title, type, audience, context, versions, state, languages and section ids. A page still to write ' +
      'is not listed. Read-only.',
    input: {
      audience: z.enum(['player', 'author', 'admin', 'contributor']).optional(),
      context: z
        .enum(['engine-repo', 'created-project', 'studio-local', 'studio-demo', 'studio-hosted', 'bridge', 'player'])
        .optional(),
      type: z.enum(['tutorial', 'howto', 'reference', 'explanation', 'troubleshooting', 'index']).optional(),
      lang: z.enum(['en', 'fr']).optional(),
      state: z.enum(['draft', 'ready']).optional().describe('draft pages exist in the repository only.'),
    },
    annotations: { readOnlyHint: true },
    needs: 'docs',
    run: async (a, b) => docsResult(async () => listDocs(await b.docs!(), a)),
  }),
  tool({
    name: 'read_doc',
    title: 'Read a documentation page',
    description:
      'Reads the documentation. Recommended: search_docs, then read_doc { id, section } for the section it found ' +
      '(`lang` en or fr, default en; `maxChars` 20000 by default, at most 100000, and a `cursor` for the rest), with ' +
      'where the text comes from (version, commit, doc revision) at its top. `name` instead returns a large historical ' +
      'page in one block, rebuilt from the sections of the documentation and possibly shortened: a section too long for ' +
      "the page's bound gives its heading, its first paragraph and the read_doc { id, section } that returns the rest. " +
      'The names: CONTENT_GUIDE (the game format, the DSL of rooms, conditions and ' +
      'commands), ENGINE, TOOLS, STUDIO, WORKFLOW, AUDIO (music and effects), UPGRADING (v2 to v3), CLASSICS (the ' +
      'famous mechanics of the genre, each with its DSL: read it before asking for a new command); with `name`, ' +
      'the other arguments are ignored. Give either `name` or `id`, not both. Read-only.',
    input: {
      name: z
        .enum(DOCS)
        .optional()
        .describe(
          'One of the eight historical pages, rebuilt and possibly shortened: a long section points to read_doc { id, section } for the rest (the other arguments are then ignored).',
        ),
      id: z.string().optional().describe('A page id from search_docs or list_docs, e.g. "create.rooms".'),
      section: z.string().optional().describe('A section id of that page (its `<a name>`), e.g. "walkable-zones".'),
      lang: z.enum(['en', 'fr']).optional().describe("The page's language (default en)."),
      cursor: z.string().optional().describe('The `cursor` of the previous answer, for the rest of the text.'),
      maxChars: z
        .number()
        .int()
        .min(1)
        .max(READ_MAX_CHARS)
        .optional()
        .describe('At most this many characters per answer (default 20000).'),
    },
    annotations: { readOnlyHint: true },
    needs: 'readDoc',
    run: async ({ name, id, ...rest }, b) => {
      if ((name === undefined) === (id === undefined))
        return errorResult(new Error('give either name (one of the 8 legacy pages) or id, not both'));
      if (name !== undefined) {
        // Exactly the 4.4.0 answer: one text block, no structured content (a client that prefers structured content
        // would otherwise lose the page), and the other arguments ignored, as 4.4.0's schema stripped unknown keys.
        try {
          return textResult(await b.readDoc!(name));
        } catch (e) {
          return errorResult(e);
        }
      }
      if (!b.docs) return errorResult(new Error('reading by id needs the documentation of wiki/, not available here'));
      return docsResult(async () => {
        const r = readDocById(await b.docs!(), { id: id!, ...rest });
        return { text: r.text, structured: r.structured };
      });
    },
  }),
  tool({
    name: 'run_tests',
    title: 'Run the tests',
    description:
      'Runs `npx vitest run` (engine tests and the game walkthrough) and returns the summary lines and the ' +
      'failures. Takes a few seconds to a minute. Read-only.',
    input: {},
    annotations: { readOnlyHint: true },
    needs: 'runTests',
    run: async (_a, b) => {
      try {
        return await b.runTests!();
      } catch (e) {
        return errorResult(e);
      }
    },
  }),
  tool({
    name: 'asset_prompts',
    title: 'Art prompts',
    description:
      "The image-model prompts for the game's art (same as `npm run prompts`): one STYLE block, then one " +
      "ready-to-paste prompt per sheet (characters with the engine's pose rows and special poses, mouth kits, object " +
      'sheets cell by cell, backgrounds with LOCATION and EMPTY SPOTS, furniture) and a checklist to cut and import them. ' +
      'Hand the sections to the human as-is; never write a sprite prompt by hand. `missing: true` keeps only the sheets ' +
      'with images not cut yet. Returns the markdown, and { missing, sheets } as structured content. Read-only.',
    input: {
      missing: z
        .boolean()
        .optional()
        .describe('Only the sheets with at least one missing image, and only their missing cells.'),
    },
    output: {
      missing: z.array(z.string()).describe('Image ids the game references that are not in the art folder.'),
      sheets: z.array(z.object({ id: z.string(), kind: z.string(), missing: z.array(z.string()) })),
    },
    annotations: { readOnlyHint: true },
    needs: 'assetPrompts',
    run: async ({ missing }, b) => {
      try {
        const r = await b.assetPrompts!(missing);
        return {
          content: [{ type: 'text', text: r.markdown }],
          structuredContent: { missing: r.missing, sheets: r.sheets },
        };
      } catch (e) {
        return errorResult(e);
      }
    },
  }),
  tool({
    name: 'speedrun_verify',
    title: 'Verify a speedrun',
    description:
      'Replays a speedrun envelope (.wsrun, 4.1.14) against the current game: reloads the exact rules of its ' +
      'category, replays its inputs with its seed, recomputes the in-game time, the splits, the final state and the ' +
      'hash chain, and checks the category’s rules. Returns { verdict, code, reason, trust }: `valid` is the only ' +
      'rankable verdict, `inconclusive` is never valid, and a verifier grants at most `replay-valid`. Pass the file ' +
      'path under the game project, or the envelope text. Read-only.',
    input: {
      path: z.string().optional().describe('Path of the .wsrun file, relative to the repository or project.'),
      envelope: z.string().optional().describe('The .wsrun text itself (instead of a path).'),
    },
    annotations: { readOnlyHint: true },
    needs: 'speedrunVerify',
    run: ({ path, envelope }, b) =>
      op(async () => {
        if (!path && !envelope) throw new Error('give the path of a .wsrun file, or its text');
        return b.speedrunVerify!(envelope ?? `@file:${path}`);
      }),
  }),
];

/** The tools a backend can run (the optional abilities it lacks remove their tool). */
export const toolsFor = (b: ToolBackend): ToolDef[] =>
  TOOLS.filter((t) => !t.needs || typeof b[t.needs] === 'function');

export const WRITING_TOOLS = new Set(TOOLS.filter((t) => t.writes).map((t) => t.name));

/** JSON Schema object of a tool's arguments, plain enough for OpenAI-style `parameters` and Anthropic `input_schema`. */
export function jsonSchema(t: ToolDef): Record<string, unknown> {
  const s = z.toJSONSchema(z.object(t.input), { unrepresentable: 'any' }) as Record<string, unknown>;
  delete s.$schema;
  return simplify(s) as Record<string, unknown>;
}

/** Tuples (`prefixItems`) become fixed-length arrays and `propertyNames` goes: some providers reject both. */
function simplify(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(simplify);
  if (!v || typeof v !== 'object') return v;
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (k !== 'propertyNames') o[k] = simplify(x);
  if (Array.isArray(o.prefixItems)) {
    const items = o.prefixItems as unknown[];
    o.items = items[0] ?? {};
    o.minItems = items.length;
    o.maxItems = items.length;
    delete o.prefixItems;
  }
  return o;
}

/** Validates the arguments a model sent and runs the tool; unknown tool or bad arguments: a tool error. */
export async function callTool(name: string, args: unknown, b: ToolBackend): Promise<ToolResult> {
  const t = toolsFor(b).find((x) => x.name === name);
  if (!t) return errorResult(new Error(`no such tool: ${name}`));
  const parsed = z.object(t.input).safeParse(args ?? {});
  if (!parsed.success)
    return errorResult(
      new Error(
        `bad arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`,
      ),
    );
  return t.run(parsed.data, b);
}
