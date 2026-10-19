// Shared types of the Studio: the core functions (studio-server/src/ops/core.ts), the dev-server API (tools/studio/plugin.ts),
// the Studio UI (src/studio/) and the MCP server all speak these shapes. Type-only: safe to import from the browser.
import type {
  CharacterDef,
  GameDef,
  Id,
  ItemDef,
  Layout,
  Point,
  RoomDef,
  ScoreDef,
  VerbDef,
} from '../../src/engine/core/types';
import type { ContentReport } from '../../src/engine/tools/report';
import type { WorldGraph } from '../../src/engine/tools/graph';
import type { LiveClass, PuzzleGraph } from '../../src/engine/tools/puzzle';
import type { SolveProfile } from '../../src/engine/tools/solve';
import type { ExitCode, SolveStatus } from '../../src/engine/tools/status';
import type { Coverage } from '../../src/engine/tools/coverage';
import type { PlaytestReport } from '../../src/engine/tools/playtests';
import type { LintResult } from '../../src/engine/tools/lint';

/** What a text literal is, from its JSON path in the room file. */
export type TextKind =
  | 'name' // room / prop / hotspot / actor display name
  | 'look' // a look line
  | 'say' // { say: [who, text] }: `who` holds the speaker
  | 'hero' // a bare string in a command list: the hero says it
  | 'topic' // a conversation topic
  | 'hint' // a hint line
  | 'toast' // { toast: text }
  | 'choice' // { choice: [{ text }] }
  | 'guide'; // { guide: { say } }

/** A text literal of a room file, addressed by its JSON path under `defineRoom({...})`. */
export interface TextRef {
  /** `look.piano[1]`, `on[3].do[0]`, `talk.grandma[0].topic`, `hints[2].lines[0]`, `props.lamp.name`… */
  path: string;
  value: string;
  /** The room file, relative to the repository root (absolute when the game lives elsewhere). */
  file: string;
  /** 1-based line of the literal. */
  line: number;
  kind: TextKind;
  /** For `say`: the speaker id (`say[0]`), when it is a literal. */
  who?: string;
}

export interface GameInfo {
  id: string;
  title: string;
  rooms: { id: Id; name: string; decor: Id }[];
  characters: Record<Id, Pick<CharacterDef, 'name' | 'color' | 'portrait'>>;
  items: Record<Id, Pick<ItemDef, 'name' | 'icon'>>;
  verbs: VerbDef[];
  checkpoints: NonNullable<GameDef['checkpoints']>;
  /** The objectives (4.1.12, ADR 0014): written with set_value on `@game`. */
  objectives?: NonNullable<GameDef['objectives']>;
  hero: Id;
  /** Image ids of the asset manifest with their size (thumbnails: `/assets/img/<id>.webp`). */
  images: Record<Id, [number, number]>;
  /** Sound effect ids of `audio.sfx` (sounds at `/assets/audio/<file>`). */
  sfx?: Id[];
  /** The scores in stems (`audio.scores`, 3.5): the Music tab plays them. */
  scores?: Record<Id, ScoreDef>;
}

export interface RoomData {
  def: RoomDef;
  layout: Layout;
  texts: TextRef[];
  /** The room file, relative to the repository root. */
  file: string;
}

export type EntityKind = 'prop' | 'hotspot' | 'actor';

export interface AddEntity {
  kind: EntityKind;
  id: Id;
  /** Display name (required for props and hotspots; optional for an actor: defaults to the character's name). */
  name?: string;
  /** Prop image id (manifest). */
  img?: Id;
  /** Actor character id. */
  char?: Id;
  /** Foot point (prop, actor) or center (hotspot), logical 640 × 400. */
  at: Point;
  /** Optional first look line, written in `look` at the same time. */
  look?: string;
}

/** `{ path, value }`: replace. `value: null`: delete (an array element, or a whole `look.<id>`). `path` ending in `[+]`: append. */
export interface SetText {
  path: string;
  value: string | null;
}

export interface EditResult {
  ok: true;
  line: number;
  changed: boolean;
}

export interface Note {
  id: string;
  /** What it is about: a panel id, a room id, `room.entity`, or free text. */
  about: string;
  author: string;
  text: string;
  /** ISO date. */
  at: string;
  /** ISO date of the last edit (PUT notes/:id), absent if never edited. */
  edited?: string;
  /** A request from the human for an AI agent to pick up (the Studio's Assistant, "Send as a task"). */
  task?: true;
}
export interface NewNote {
  about?: string;
  author?: string;
  text: string;
  task?: boolean;
}
export interface NotesFile {
  entries: Note[];
}
/** PUT notes/:id: the new text (and optionally a new `about`). */
export interface NoteEdit {
  text: string;
  about?: string;
}

/** POST storyboard/markdown: the file written (relative to the repository root) and its size. */
export interface MarkdownResult {
  ok: true;
  file: string;
  bytes: number;
  boards: number;
  panels: number;
}

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ms: number;
}

/** The content profiler (src/engine/tools/report.ts) with its Markdown rendering. */
export interface ReportData {
  report: ContentReport;
  markdown: string;
  ms: number;
}
/** The world's map (src/engine/tools/graph.ts), with an SVG and a DOT rendering. */
export interface GraphData {
  graph: WorldGraph;
  svg: string;
  dot: string;
}
/** The puzzle graph (src/engine/tools/puzzle.ts): the whole graph as SVG and DOT, the overview or one card as Markdown. */
export interface PuzzleData {
  graph: PuzzleGraph;
  svg: string;
  dot: string;
  markdown: string;
  id?: string;
  /** Why the solver keeps each node: critical (reaches the end or a goal), world, visible, or dead (not in its state). */
  classes: Record<string, LiveClass>;
}

/** The storyboard checked against the content (src/engine/tools/coverage.ts), with its Markdown rendering. */
export interface CoverageData {
  coverage: Coverage;
  markdown: string;
  ms: number;
}

/** The playtests of games/<id>/playtests replayed and summed up (src/engine/tools/playtests.ts). */
export interface PlaytestsData {
  report: PlaytestReport;
  markdown: string;
  files: number;
  ms: number;
}
/** The content lint (src/engine/tools/lint.ts) after a solver run, with its Markdown rendering. */
export interface LintData {
  lint: LintResult;
  markdown: string;
  mode: 'static' | 'witness' | 'prove';
  ms: number;
}

export interface SolveData {
  /** Honest outcome of the search and the mode it ran in, with its exit code and sentence (`src/engine/tools/status.ts`): the same as `npm run solve`. */
  status: SolveStatus;
  exit: ExitCode;
  headline: string;
  mode: 'witness' | 'prove';
  /** Reachable states the ending cannot be reached from (complete in `prove` mode). */
  softlocks: { path: string[]; room: string; inventory: string[] }[];
  finished: boolean;
  states: number;
  truncated: boolean;
  path: string[];
  roomsReached: string[];
  unlockedReached: string[];
  flagsReached: string[];
  itemsNeverUsed: string[];
  unusedItems: string[];
  deadEnds: { room: string; inventory: string[]; path: string[] }[];
  errors: string[];
  /** Invariants that became true, with the path (solver). */
  broken?: { invariant: number; path: string[] }[];
  from: string | null;
  ms: number;
  /** A game with `reality` (4.1.1): the world the verdict holds in (closed, a scenario, adversarial). */
  reality?: string;
  /** What the states are made of and what the search cost (`profileText` renders it). */
  profile?: SolveProfile;
}

export type ScreenshotResult = { file: string; url: string } | { unavailable: true; reason: string };

/** Server-sent event of GET /__studio/api/events. `file` is relative to the game folder (`rooms/house.ts`). */
// ---------------------------------------------------------------------------
// Demo mode (no server: GitHub Pages): a snapshot of the game, the user's edits as a patch list.
// ---------------------------------------------------------------------------

/** public/studio-demo/snapshot.json, written by tools/studio/snapshot.ts at build time. */
export interface StudioSnapshot {
  format: 'web-scumm-studio-snapshot';
  version: 1;
  /** ISO date of the build. */
  created: string;
  game: GameInfo;
  rooms: Record<Id, RoomData>;
  storyboard: Record<string, unknown>;
  notes: NotesFile;
  /** Markdown documents by name (CONTENT_GUIDE). */
  docs: Record<string, string>;
  /** The Assets tab's listing (read-only in the demo; thumbnails from public/assets). */
  assets?: AssetsListing;
}

/** One edit made in the demo Studio, replayed on top of the snapshot (and by `npm run studio-apply`). */
export type StudioPatch =
  | { kind: 'text'; room: Id; path: string; value: string | null }
  | { kind: 'layout'; room: Id; layout: Layout }
  | { kind: 'entity'; room: Id; entity: AddEntity }
  | { kind: 'storyboard'; storyboard: Record<string, unknown> }
  | { kind: 'note'; note: Note }
  | { kind: 'note-edit'; id: string; text: string; about?: string; edited: string }
  | { kind: 'note-delete'; id: string };

/** The file "Download patch" produces. */
export interface StudioPatchFile {
  format: 'web-scumm-studio-patch';
  version: 1;
  game: string;
  created: string;
  patches: StudioPatch[];
}

export type StudioEvent = { type: 'changed'; file: string } | { type: 'hello'; game: string };

// ---------------------------------------------------------------------------
// postMessage bridge between the placement editor (iframe, src/engine/dev/editor.ts) and the Studio.
// ---------------------------------------------------------------------------

/** Selection key used by the editor: `prop:<id>`, `hs:<id>` (hotspot), `actor:<id>`, `entry:<name>`, `walk`, `scale`. */
export type EditorKey = string;

export type EditorToStudio =
  | { source: 'web-scumm-editor'; type: 'ready'; room: Id; missing: { kind: EntityKind; id: Id }[] }
  | { source: 'web-scumm-editor'; type: 'select'; room: Id; key: EditorKey; kind?: EntityKind; id?: Id }
  | { source: 'web-scumm-editor'; type: 'dirty'; room: Id; dirty: boolean }
  /**
   * `layout`: set when the editor could not write the file (Studio demo, no dev server; a hosted Studio, where the view
   * never writes): the Studio stores it. `nonce`: the Studio's save request this answers (hosted).
   */
  | {
      source: 'web-scumm-editor';
      type: 'saved';
      room: Id;
      ok: boolean;
      error?: string;
      layout?: Layout;
      nonce?: string;
    };

export type StudioToEditor =
  | { source: 'web-scumm-studio'; type: 'select'; kind: EntityKind; id: Id }
  /** Give geometry to an entity the room declares but the layout lacks (no-op if it has some). */
  | { source: 'web-scumm-studio'; type: 'create'; kind: EntityKind; id: Id; at?: Point }
  /** `nonce`: a hosted view answers with it, so the Studio takes no layout it did not ask for. */
  | { source: 'web-scumm-studio'; type: 'save'; nonce?: string };

// ---------------------------------------------------------------------------
// Assets tab (tools/studio/assets.ts, GET /__studio/api/assets): every image and sound of the game, where it is used,
// and the art prompts. Paths are relative to the game folder (`art/hero/r1c1.png`).
// ---------------------------------------------------------------------------

/** `sprites`: a grid sheet (characters, objects); `talk`: a mouth kit (talk_<char>/<pose>/t1…); `furniture`: named pieces. */
export type AssetSheetKind = 'sprites' | 'decor' | 'furniture' | 'talk';

export interface AssetCell {
  /** `r1c1`, a named piece (`chaise1`), or `<pose>/t1` in a talk kit. */
  id: string;
  /** Source file, relative to the game folder; '' when the cell is referenced but has no file (`missing`). */
  file: string;
  w: number;
  h: number;
  /** Where the game uses it: `cast.grandpa.walk`, `items.key`, `house.props.pantry`, `skin.map`… (empty: unused). */
  used: string[];
  /** The image ids that resolve to this file (`grandpa/r2c1`). */
  ids: string[];
  /** Prepared in public/assets and not older than its source. */
  prepared: boolean;
  /** The prepared file under public/assets (`img/grandpa/r2c1.webp`), when it exists. */
  asset?: string;
  /** Earlier versions kept next to it: `art/grandpa/r2c1_v1.png`… */
  backups: string[];
  /** Modification time (ms): cache key for thumbnails. */
  mtime: number;
  missing?: boolean;
}

export interface AssetSheet {
  id: string;
  kind: AssetSheetKind;
  /** The character whose sprites (or mouths) come from this sheet. */
  character?: string;
  /** Grid of the generated sheet, `COLSxROWS` (from its prompt, else from its cells). */
  grid: string;
  cells: AssetCell[];
  /** The prompt's kind for this sheet (tools/prompts.ts), when it has one. */
  promptKind?: string;
}

export interface AssetDecor extends AssetCell {
  /** `decor/backyard`. */
  name: string;
  /** Rooms painted with it. */
  rooms: string[];
}

export interface AssetSound {
  /** File name (`bell.ogg`). */
  id: string;
  kind: 'music' | 'sfx';
  /** `audio/sfx/bell.ogg`. */
  file: string;
  /** `audio.sfx.bell`, then the rooms whose commands play it (`market.on`). */
  used: string[];
  prepared: boolean;
  /** The prepared file under public/assets (`audio/sfx/bell.mp3`). */
  asset?: string;
  backups: string[];
  mtime: number;
}

export interface AssetPrompt {
  id: string;
  kind: string;
  /** The sheet's section of `npm run prompts`. */
  markdown: string;
  /** The same for the missing cells only (`npm run prompts -- --missing`), when some are missing. */
  missingMarkdown?: string;
}

export interface AssetsListing {
  sheets: AssetSheet[];
  decors: AssetDecor[];
  sounds: { music: AssetSound[]; sfx: AssetSound[] };
  /** Ids the game references without a source file (images, then `audio/<kind>/<file>`). */
  missing: string[];
  /** Used images and sounds not prepared yet (or older than their source): what `npm run assets` would do. */
  unprepared: number;
  prompts: { sheets: AssetPrompt[]; style: string };
}

/** POST assets/sheet: an uploaded sheet (base64, data URL accepted) cut into `art/<sheetId>/`. */
export interface SheetUpload {
  sheetId: string;
  grid?: string;
  cells?: string;
  data: string;
}
export interface SheetUploadResult {
  ok: true;
  file: string;
  output: string;
  written: string[];
  backups: string[];
  cells: AssetCell[];
}
/** 409 body of POST assets/sheet: cells that exist and would be overwritten. */
export interface SheetConflict {
  error: string;
  conflicts: string[];
}

/** POST assets/cell: replace (or add) one cell. `key`: 'auto' (default: key a flat background), 'always', 'never'. */
export interface CellReplace {
  sheetId: string;
  cell: string;
  data: string;
  key?: 'auto' | 'always' | 'never';
}
export interface CellReplaceResult {
  ok: true;
  file: string;
  backup?: string;
  keyed: 'keyed' | 'kept' | 'opaque';
  cell: AssetCell;
}

export interface SoundUpload {
  kind: 'music' | 'sfx';
  file: string;
  data: string;
}
export interface DecorUpload {
  name: string;
  data: string;
}
export interface UploadResult {
  ok: true;
  file: string;
  backup?: string;
}

export interface PrepareResult {
  ok: boolean;
  code: number;
  output: string;
}
