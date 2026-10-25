// The Studio's browser backend (demo mode, e.g. on GitHub Pages): the same interface as the dev server's API
// (src/studio/api.ts), over the build-time snapshot (public/studio-demo/snapshot.json, tools/studio/snapshot.ts) with
// the user's edits as a patch list in localStorage (src/studio/demo-patch.ts), replayed on load. Validate and solve
// run here, on the real game module with the edits applied. No DOM access: storage, download and the game loader are
// injected, so the tests run it in node.
import type { GameDef, Layout } from '@engine/core/types';
import { compileGame } from '@engine/core/define';
import { compileIR, type GameIR } from '@engine/core/ir';
import { validate as validateGame, type AssetIndex } from '@engine/tools/validate';
import { solve as solveGame, type RealityPolicy } from '@engine/tools/solve';
import { report as reportGame, reportMarkdown } from '@engine/tools/report';
import { toDot, toSvg, worldGraph } from '@engine/tools/graph';
import { extraReads, liveClasses, puzzleGraph, puzzleMarkdown, toPuzzleDot, toPuzzleSvg } from '@engine/tools/puzzle';
import { normalizeStoryboard, storyboardMarkdown, storyboardProblems } from '../../tools/pages/storyboard-data';
import { coverageMarkdown, storyboardCoverage } from '@engine/tools/coverage';
import { lintContent, lintMarkdown } from '@engine/tools/lint';
import { heroMatrix as heroMatrixOf, type HeroMatrix } from '@engine/tools/hero-matrix';
import { classify, formatPath, parsePath, SourceError, type Seg } from '../../tools/studio/paths';
import type {
  CoverageData,
  GraphData,
  LintData,
  PuzzleData,
  ReportData,
  AddEntity,
  AssetsListing,
  EditResult,
  GameInfo,
  MarkdownResult,
  NewNote,
  Note,
  NoteEdit,
  NotesFile,
  RoomData,
  SolveData,
  StudioPatch,
  StudioPatchFile,
  StudioSnapshot,
  TextRef,
  ValidateResult,
} from '../../tools/studio/types';
import { ApiError, type Api } from './api';
import type { DocName, ToolBackend } from '../../tools/studio/tools';
import { must } from '../engine/core/must';
import {
  addRoomEntity,
  cloneData,
  editRoomText,
  isTextPath,
  patchGame,
  placeEntity,
  readPatches,
  writePatches,
  type KeyValue,
} from './demo-patch';

/** What validate / solve / the Markdown export need from the game's own module (`@game`). */
export interface GameModuleLike {
  game: GameDef;
  /** Minigames of the engine and of the game (ids and required params are validated). */
  minigames?: Record<string, { required?: string[] }>;
  assets?: AssetIndex /** Custom commands (`{ custom }`): their effects for validate and solve. */;
  commands?: import('@engine/core/custom').CustomCommands;
  /** Translation tables, for the report's coverage. */
  locales?: Record<string, Record<string, string>>;
}

export interface BrowserApiOptions {
  snapshot: StudioSnapshot;
  /** localStorage in the page; a fake in tests; absent: edits last until the page is closed. */
  storage?: KeyValue;
  /** Loads the real game (functions included): `() => import('@game')` in the page. */
  loadGame?: () => Promise<GameModuleLike>;
  /** Hands a file to the user (an `<a download>` click in the page). */
  download?: (name: string, text: string, type: string) => void;
  now?: () => Date;
}

interface State {
  rooms: Record<string, RoomData>;
  storyboard: Record<string, unknown>;
  notes: Note[];
}

const ID = /^[A-Za-z_][\w]*$/;
const segsOf = (path: string): Seg[] => {
  try {
    return parsePath(path);
  } catch (e) {
    throw asApi(e);
  }
};
const asApi = (e: unknown) => (e instanceof SourceError ? new ApiError(e.message, e.status) : e);
const startsWith = (segs: Seg[], prefix: Seg[]) =>
  prefix.length <= segs.length && prefix.every((s, i) => segs[i] === s);

export class BrowserApi implements Api {
  readonly mode = 'demo' as const;
  private patches: StudioPatch[];
  private state!: State;
  private gameMod: Promise<GameModuleLike> | undefined;
  /** Called after every kept edit (and a reset) with the number of edits. */
  onChange: ((edits: number) => void) | undefined;

  constructor(private o: BrowserApiOptions) {
    this.patches = readPatches(o.storage, this.gameId);
    this.rebuild();
  }

  get gameId() {
    return this.o.snapshot.game.id;
  }
  /** A documentation page of the snapshot (the Assistant's read_doc), by name. */
  doc(name: string): string | undefined {
    return this.o.snapshot.docs?.[name];
  }
  docNames(): string[] {
    return Object.keys(this.o.snapshot.docs ?? {});
  }
  /** 4.5.0: the wiki's index and ready pages of the snapshot (the Assistant's search_docs, list_docs, read_doc by id). */
  wikiDocs() {
    return this.o.snapshot.wiki;
  }
  /** The Assistant's document abilities in the demo: the legacy pages the snapshot holds, and its wiki when it has one. */
  docAbilities(): Pick<ToolBackend, 'readDoc' | 'docs'> {
    const wiki = this.wikiDocs();
    return {
      readDoc: async (name: DocName) => {
        const d = this.doc(name);
        if (d === undefined)
          throw new Error(
            `${name} is not in the demo (only ${this.docNames().join(', ') || 'no document'}); read the documentation at https://github.com/Quest-n-Click/quest-n-click/wiki`,
          );
        return d;
      },
      // Absent from an older snapshot.
      ...(wiki ? { docs: async () => wiki } : {}),
    };
  }
  /** Number of edits kept in this browser. */
  get edits() {
    return this.patches.length;
  }

  /** The edits as the file `npm run studio-apply <file>` reads. */
  patchFile(): StudioPatchFile {
    return {
      format: 'web-scumm-studio-patch',
      version: 1,
      game: this.gameId,
      created: this.now().toISOString(),
      patches: cloneData(this.patches),
    };
  }

  /** Drops every edit: back to the snapshot. */
  reset() {
    this.patches = [];
    writePatches(this.o.storage, this.gameId, []);
    this.rebuild();
    this.onChange?.(0);
  }

  private now() {
    return this.o.now?.() ?? new Date();
  }

  private rebuild() {
    const s = this.o.snapshot;
    this.state = {
      rooms: cloneData(s.rooms),
      storyboard: cloneData(s.storyboard ?? { boards: [] }),
      notes: cloneData(s.notes?.entries ?? []),
    };
    // A patch that no longer fits (the snapshot changed under it) is dropped.
    this.patches = this.patches.filter((p) => {
      try {
        this.apply(p);
        return true;
      } catch {
        return false;
      }
    });
  }

  /** Applies a patch to the in-memory state; throws (ApiError) without changing anything if it does not apply. */
  private apply(p: StudioPatch): EditResult | Note | undefined {
    switch (p.kind) {
      case 'text':
        return applyText(this.roomData(p.room), p.path, p.value);
      case 'layout':
        this.roomData(p.room).layout = cloneData(p.layout);
        return;
      case 'entity':
        return this.applyEntity(p.room, p.entity);
      case 'storyboard':
        this.state.storyboard = cloneData(p.storyboard);
        return;
      case 'note':
        this.state.notes.push(cloneData(p.note));
        return p.note;
      case 'note-edit': {
        const n = this.note(p.id);
        n.text = p.text;
        if (p.about !== undefined) n.about = p.about;
        n.edited = p.edited;
        return n;
      }
      case 'note-delete':
        this.note(p.id);
        this.state.notes = this.state.notes.filter((n) => n.id !== p.id);
        return;
    }
  }

  /** Applies, then keeps the patch (compacted: what a later patch overrides is dropped) and saves the list. */
  private commit<T>(p: StudioPatch): T {
    const r = this.apply(p);
    const ps = this.patches;
    const last = ps[ps.length - 1];
    if (p.kind === 'layout') this.patches = ps.filter((x) => !(x.kind === 'layout' && x.room === p.room));
    else if (p.kind === 'storyboard') this.patches = ps.filter((x) => x.kind !== 'storyboard');
    else if (
      p.kind === 'text' &&
      p.value !== null &&
      !p.path.endsWith('[+]') &&
      last?.kind === 'text' &&
      last.room === p.room &&
      last.path === p.path &&
      last.value !== null
    )
      ps.pop();
    if (p.kind === 'note-edit' || p.kind === 'note-delete') {
      const added = this.patches.find(
        (x): x is Extract<StudioPatch, { kind: 'note' }> => x.kind === 'note' && x.note.id === p.id,
      );
      this.patches = this.patches.filter((x) => !(x.kind === 'note-edit' && x.id === p.id));
      if (added && p.kind === 'note-edit') {
        added.note = cloneData(this.note(p.id));
        this.save();
        return r as T;
      }
      if (added && p.kind === 'note-delete') {
        this.patches = this.patches.filter((x) => x !== added);
        this.save();
        return r as T;
      }
    }
    this.patches.push(cloneData(p));
    this.save();
    return r as T;
  }

  private save() {
    writePatches(this.o.storage, this.gameId, this.patches);
    this.onChange?.(this.patches.length);
  }

  private roomData(id: string): RoomData {
    const r = this.state.rooms[id];
    if (!r) throw new ApiError(`unknown room: "${id}"`, 404);
    return r;
  }

  private note(id: string): Note {
    const n = this.state.notes.find((x) => x.id === id);
    if (!n) throw new ApiError(`no such note: "${id}"`, 404);
    return n;
  }

  private applyEntity(roomId: string, e: AddEntity): EditResult {
    const room = this.roomData(roomId);
    const info = this.o.snapshot.game;
    if (!e || !['prop', 'hotspot', 'actor'].includes(e.kind))
      throw new ApiError('`kind` must be prop, hotspot or actor', 400);
    if (typeof e.id !== 'string' || !ID.test(e.id))
      throw new ApiError('`id` must be letters, digits and _ (not starting with a digit)', 400);
    if (!Array.isArray(e.at) || e.at.length !== 2 || !e.at.every((v) => typeof v === 'number' && Number.isFinite(v)))
      throw new ApiError('`at` must be [x, y]', 400);
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (e.kind !== 'actor' && !name) throw new ApiError('`name` is required for a prop or a hotspot', 400);
    const d = room.def;
    if ([d.props, d.hotspots, d.actors].some((o) => o && e.id in o))
      throw new ApiError(`"${e.id}" already exists in room "${roomId}"`, 409);
    if (e.kind === 'actor' && (!e.char || !info.characters[e.char]))
      throw new ApiError(`unknown character: "${e.char ?? ''}"`, 400);
    if (e.kind === 'prop' && e.img && Object.keys(info.images).length && !info.images[e.img])
      throw new ApiError(`image not in the manifest: "${e.img}"`, 400);

    const line = Math.max(1, ...room.texts.map((t) => t.line));
    const section = e.kind === 'prop' ? 'props' : e.kind === 'hotspot' ? 'hotspots' : 'actors';
    addRoomEntity(d, { ...e, name }, e.char ? info.characters[e.char]?.name : undefined);
    const ref = (path: string, value: string, kind: TextRef['kind']) =>
      room.texts.push({ path, value, file: room.file, line, kind });
    const stored = must((d[section] as Record<string, { name?: string }>)[e.id], 'entity just added');
    if (stored.name) ref(`${section}.${e.id}.name`, stored.name, 'name');
    if (e.look?.trim()) ref(`look.${e.id}`, e.look.trim(), 'look');
    room.layout = placeEntity(room.layout, e);
    return { ok: true, line, changed: true };
  }

  private loadModule(): Promise<GameModuleLike> {
    if (!this.o.loadGame) return Promise.reject(new ApiError('the game module is not available here', 501));
    this.gameMod ??= this.o.loadGame();
    return this.gameMod;
  }

  /** The real game with the room edits applied, and the edited layouts. */
  private async editedGame(): Promise<{ mod: GameModuleLike; game: GameDef; layouts: Record<string, Layout> }> {
    const mod = await this.loadModule();
    const layouts = Object.fromEntries(Object.entries(this.state.rooms).map(([id, r]) => [id, r.layout]));
    const { game } = patchGame(
      mod.game,
      {},
      this.patches.filter((p) => p.kind === 'text' || p.kind === 'entity'),
    );
    return { mod, game, layouts };
  }

  // ------------------------------------------------------------------ the Api

  async game(): Promise<GameInfo> {
    return cloneData(this.o.snapshot.game);
  }

  async room(id: string): Promise<RoomData> {
    return cloneData(this.roomData(id));
  }

  async setLayout(id: string, layout: Layout): Promise<{ ok: true }> {
    this.roomData(id);
    if (!layout || typeof layout !== 'object' || Array.isArray(layout))
      throw new ApiError('the layout must be an object', 400);
    this.commit({ kind: 'layout', room: id, layout });
    return { ok: true };
  }

  async setText(id: string, path: string, value: string | null): Promise<EditResult> {
    if (typeof path !== 'string' || !path) throw new ApiError('`path` is required', 400);
    if (value !== null && typeof value !== 'string') throw new ApiError('`value` must be a string or null', 400);
    const room = this.roomData(id);
    // An unchanged value is not kept as an edit.
    const ref = room.texts.find((t) => t.path === path);
    if (value !== null && ref && ref.value === value) return { ok: true, line: ref.line, changed: false };
    return this.commit<EditResult>({ kind: 'text', room: id, path, value });
  }

  async add(id: string, e: AddEntity): Promise<EditResult> {
    return this.commit<EditResult>({ kind: 'entity', room: id, entity: cloneData(e) });
  }

  async storyboardRaw() {
    return cloneData(this.state.storyboard) as Record<string, unknown> & { boards: unknown[] };
  }

  async setStoryboard(sb: unknown): Promise<{ ok: true; changed: boolean }> {
    const problems = storyboardProblems(sb);
    if (problems.length) throw new ApiError(problems.join('; '), 400);
    if (JSON.stringify(sb) === JSON.stringify(this.state.storyboard)) return { ok: true, changed: false };
    this.commit({ kind: 'storyboard', storyboard: sb as Record<string, unknown> });
    return { ok: true, changed: true };
  }

  async storyboardMarkdown(): Promise<MarkdownResult> {
    const { game } = await this.editedGame();
    const sb = normalizeStoryboard(this.state.storyboard);
    const md = storyboardMarkdown({ game }, sb);
    this.o.download?.('storyboard.md', md, 'text/markdown');
    return {
      ok: true,
      file: 'storyboard.md (downloaded)',
      bytes: new TextEncoder().encode(md).length,
      boards: sb.boards.length,
      panels: sb.boards.reduce((n, b) => n + b.panels.length, 0),
    };
  }

  async notes(): Promise<NotesFile> {
    return { entries: cloneData(this.state.notes) };
  }

  async addNote(n: NewNote): Promise<Note> {
    if (!n || typeof n.text !== 'string' || !n.text.trim()) throw new ApiError('`text` is required', 400);
    const now = this.now();
    const note: Note = {
      id: `n${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      about: typeof n.about === 'string' ? n.about.trim() : '',
      author: typeof n.author === 'string' && n.author.trim() ? n.author.trim() : 'you',
      text: n.text.trim(),
      at: now.toISOString(),
      ...(n.task === true ? { task: true as const } : {}),
    };
    this.commit({ kind: 'note', note });
    return cloneData(note);
  }

  async editNote(id: string, e: NoteEdit): Promise<Note> {
    if (!e || typeof e.text !== 'string' || !e.text.trim()) throw new ApiError('`text` is required', 400);
    if (e.about !== undefined && typeof e.about !== 'string') throw new ApiError('`about` must be a string', 400);
    const n = this.commit<Note>({
      kind: 'note-edit',
      id,
      text: e.text.trim(),
      about: e.about?.trim(),
      edited: this.now().toISOString(),
    });
    return cloneData(n);
  }

  async deleteNote(id: string): Promise<{ ok: true }> {
    this.commit({ kind: 'note-delete', id });
    return { ok: true };
  }

  /** The IR of the game with this browser's edits (4.1.12): no provenance here (the sources are not in the page). */
  async ir(): Promise<GameIR> {
    const { mod, game } = await this.editedGame();
    return compileIR(compileGame(game), {
      extensions: { trusted: '', commands: mod.commands, minigames: Object.keys(mod.minigames ?? {}) },
    });
  }

  /** The hero × language matrix of the game with this browser's edits (4.4.0), over the module's locale tables. */
  async heroMatrix(): Promise<HeroMatrix> {
    const { mod, game } = await this.editedGame();
    return heroMatrixOf(game, mod.locales ?? {});
  }

  async validate(): Promise<ValidateResult> {
    const t0 = Date.now();
    const { mod, game, layouts } = await this.editedGame();
    const mg = mod.minigames;
    const { errors, warnings } = validateGame(game, layouts, {
      assets: mod.assets,
      commands: mod.commands,
      locales: mod.locales,
      minigameIds: mg ? Object.keys(mg) : undefined,
      minigameParams: mg ? Object.fromEntries(Object.entries(mg).map(([k, m]) => [k, m.required ?? []])) : undefined,
      minigameBindings: mg
        ? Object.fromEntries(
            Object.entries(mg).map(([k, m]) => [
              k,
              (m as { bindings?: { images?: string[]; sfx?: string[] } }).bindings ?? {},
            ]),
          )
        : undefined,
    });
    return { ok: errors.length === 0, errors, warnings, ms: Date.now() - t0 };
  }

  async report(): Promise<ReportData> {
    const t0 = Date.now();
    const { mod, game, layouts } = await this.editedGame();
    const r = reportGame(game, layouts, { locales: mod.locales });
    return { report: r, markdown: reportMarkdown(r), ms: Date.now() - t0 };
  }

  async graph(): Promise<GraphData> {
    const { game } = await this.editedGame();
    const g = worldGraph(game);
    return { graph: g, svg: toSvg(g), dot: toDot(g) };
  }

  async puzzle(id?: string): Promise<PuzzleData> {
    const { mod, game } = await this.editedGame();
    const g = puzzleGraph(game, { commands: mod.commands });
    const extra = extraReads(game);
    return {
      graph: g,
      svg: toPuzzleSvg(g),
      dot: toPuzzleDot(g),
      markdown: puzzleMarkdown(g, id || undefined, { extra }),
      classes: Object.fromEntries(liveClasses(g, extra)),
      ...(id ? { id } : {}),
    };
  }

  async coverage(): Promise<CoverageData> {
    const t0 = Date.now();
    const { game } = await this.editedGame();
    const c = storyboardCoverage(game, normalizeStoryboard(await this.storyboardRaw()));
    return { coverage: c, markdown: coverageMarkdown(c), ms: Date.now() - t0 };
  }

  async lint(prove = false): Promise<LintData> {
    const t0 = Date.now();
    const { mod, game, layouts } = await this.editedGame();
    const s = await solveGame(game, layouts, { commands: mod.commands, mode: prove ? 'prove' : 'witness' });
    const r = lintContent(game, layouts, { solve: s, commands: mod.commands });
    return { lint: r, markdown: lintMarkdown(r, s.mode), mode: s.mode, ms: Date.now() - t0 };
  }

  async solve(from?: string, prove = false, maxStates = 20000, reality?: RealityPolicy): Promise<SolveData> {
    const t0 = Date.now();
    const { mod, game, layouts } = await this.editedGame();
    if (from && !game.checkpoints?.[from]) throw new ApiError(`unknown checkpoint: "${from}"`, 400);
    const r = await solveGame(game, layouts, {
      maxStates,
      start: from ? { checkpoint: from } : 'new',
      commands: mod.commands,
      mode: prove ? 'prove' : 'witness',
      ...(reality ? { reality } : {}),
    });
    return {
      status: r.status,
      exit: r.exit,
      headline: r.headline,
      mode: r.mode,
      softlocks: r.softlocks,
      finished: r.finished,
      states: r.states,
      truncated: r.truncated,
      path: r.path,
      roomsReached: r.roomsReached,
      unlockedReached: r.unlockedReached,
      flagsReached: r.flagsReached,
      itemsNeverUsed: r.itemsNeverUsed,
      unusedItems: r.unusedItems,
      deadEnds: r.deadEnds.map((d) => ({ room: d.room, inventory: d.inventory, path: d.path })),
      errors: r.errors,
      broken: r.broken,
      from: from || null,
      ms: Date.now() - t0,
      profile: r.profile,
      ...(r.reality ? { reality: r.reality } : {}),
    };
  }

  /** The snapshot's assets listing (read-only: uploads and Prepare need the dev server). */
  async assets(): Promise<AssetsListing> {
    if (!this.o.snapshot.assets)
      throw new ApiError('this demo snapshot has no assets listing: rebuild it with STUDIO=1', 501);
    return cloneData(this.o.snapshot.assets);
  }

  async screenshot(): Promise<never> {
    throw new ApiError('Screenshots need the dev server (npm run studio): not available in the demo', 501);
  }
}

/**
 * A text edit on a room's data (`setText` semantics): the texts list (paths shift after an append or a deletion, as
 * the room file's would) and the definition (so the sheet shows the edit). Throws an ApiError like the server.
 */
function applyText(room: RoomData, path: string, value: string | null): EditResult {
  const segs = segsOf(path);
  if (segs.slice(0, -1).includes('+')) throw new ApiError(`invalid path: "${path}" ([+] must come last)`, 400);
  const texts = room.texts;
  const parsed = texts.map((t) => ({ t, segs: segsOf(t.path) }));
  const lastLine = Math.max(1, ...texts.map((t) => t.line));

  if (segs[segs.length - 1] === '+') {
    if (typeof value !== 'string') throw new ApiError('append needs a string value', 400);
    if (!isTextPath(path)) throw new ApiError(`cannot append to "${path}": its lines are not texts`, 400);
    const list = segs.slice(0, -1);
    const listPath = formatPath(list);
    const siblings = parsed.filter(
      (x) => x.segs.length === list.length + 1 && startsWith(x.segs, list) && typeof x.segs[list.length] === 'number',
    );
    const single = texts.find((t) => t.path === listPath);
    const target = getAt(room.def, list);
    const isLook = list.length === 2 && list[0] === 'look';
    let newPath: string;
    let line: number;
    if (Array.isArray(target)) {
      newPath = `${listPath}[${target.length}]`;
      line = Math.max(0, ...siblings.map((x) => x.t.line)) || lastLine;
    } else if (isLook && single) {
      single.path = `${listPath}[0]`;
      newPath = `${listPath}[1]`;
      line = single.line;
    } else if (isLook && target === undefined) {
      newPath = listPath;
      line = lastLine;
    } else throw new ApiError(`path not found: "${listPath}"`, 404);
    editRoomText(room.def, path, value);
    const kind = classify(segsOf(newPath)) ?? 'look';
    texts.push({ path: newPath, value, file: room.file, line, kind });
    return { ok: true, line, changed: true };
  }

  const ref = texts.find((t) => t.path === path);
  if (value === null) {
    const isLook = segs[0] === 'look';
    const last = segs[segs.length - 1];
    const parentSegs = segs.slice(0, -1);
    const parent = getAt(room.def, parentSegs);
    if (isLook && segs.length === 2) {
      const own = parsed.filter((x) => startsWith(x.segs, segs));
      if (!own.length) throw new ApiError(`path not found: "${path}"`, 404);
      removeRefs(
        room,
        own.map((x) => x.t),
      );
      editRoomText(room.def, path, null);
      return { ok: true, line: must(own[0], 'first own text').t.line, changed: true };
    }
    if (typeof last === 'number' && Array.isArray(parent)) {
      if (!ref) throw new ApiError(`path not found: "${path}"`, 404);
      if (!classify(segs)) throw new ApiError(`not a text: "${path}"`, 400);
      if (isLook && segs.length === 3 && parent.length === 1) return applyText(room, formatPath(parentSegs), null);
      removeRefs(
        room,
        parsed.filter((x) => startsWith(x.segs, segs)).map((x) => x.t),
      );
      // Following items of the same list move up by one.
      for (const x of parsed) {
        const i = x.segs[parentSegs.length];
        if (x.segs.length > parentSegs.length && startsWith(x.segs, parentSegs) && typeof i === 'number' && i > last) {
          x.t.path = formatPath([...parentSegs, i - 1, ...x.segs.slice(parentSegs.length + 1)]);
        }
      }
      editRoomText(room.def, path, null);
      return { ok: true, line: ref.line, changed: true };
    }
    if (!ref) throw new ApiError(`path not found: "${path}"`, 404);
    throw new ApiError(`cannot delete "${path}": only list lines and look entries can be deleted`, 400);
  }

  if (!ref) throw new ApiError(`path not found: "${path}"`, 404);
  if (!classify(segs)) throw new ApiError(`not a text: "${path}" (ids, images and flags are not edited here)`, 400);
  if (ref.value === value) return { ok: true, line: ref.line, changed: false };
  ref.value = value;
  editRoomText(room.def, path, value);
  return { ok: true, line: ref.line, changed: true };
}

function removeRefs(room: RoomData, refs: TextRef[]) {
  for (const r of refs) {
    const i = room.texts.indexOf(r);
    if (i >= 0) room.texts.splice(i, 1);
  }
}

function getAt(root: unknown, segs: Seg[]): unknown {
  let v = root;
  for (const s of segs) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string | number, unknown>)[s];
  }
  return v;
}
