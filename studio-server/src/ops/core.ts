// Studio core: every operation of the Studio API (wiki/en/studio.api.md) as a plain function over a game folder.
// Used by the Vite plugin (tools/studio/plugin.ts), the tests and the MCP server. Never exits the process: errors
// are thrown as StudioError (with an HTTP-like status), results are plain JSON.
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from '@typescript/typescript6';
import type { Layout, Point } from '../../../src/engine/core/types';
import { normalizeExits } from '../../../src/engine/core/define';
import type { RealityPolicy } from '../../../src/engine/tools/solve';
import { report as reportGame, reportMarkdown } from '../../../src/engine/tools/report';
import { toDot, toSvg, worldGraph } from '../../../src/engine/tools/graph';
import {
  extraReads,
  liveClasses,
  puzzleGraph,
  puzzleMarkdown,
  toPuzzleDot,
  toPuzzleSvg,
} from '../../../src/engine/tools/puzzle';
import { coverageMarkdown, storyboardCoverage } from '../../../src/engine/tools/coverage';
import { loadAssets, loadLayouts, loadLocales } from '../../../src/engine/tools/load';
import { ASSETS_DIR, GAME_DIR, ROOT, WORK, type GameModule } from '../../../tools/game';
import { gameIR } from '../../../tools/game-ir';
import type { GameIR } from '../../../src/engine/core/ir';
import { diffFile, type FileDiff, type Side } from '../../../tools/studio/semantic-diff';
import { roomsToCapture } from '../../../tools/studio/diff-rooms';
import { captureDiff } from './diff-captures';
import {
  type GroupingsFile,
  groupingsProblems,
  readableGroupings,
  type ScenarioMap,
  scenarioMap,
} from '../../../tools/studio/scenario-map';
import { normalizeStoryboard, storyboardMarkdown, storyboardProblems } from '../../../tools/pages/storyboard-data';
import {
  addToSection,
  extractTexts,
  lineDiff,
  objectText,
  parseRoom,
  SourceError,
  setTextInSource,
  setValueInSource,
} from './source';
import { applyLocale } from '../../../src/engine/tools/i18n';
import {
  mergeSheet,
  toCsv,
  voiceIds,
  voiceTable,
  VOICE_STATUSES,
  type VoiceSheet,
  type VoiceStatus,
} from '../../../src/engine/tools/voices';
import { heroMatrix as heroMatrixOf, type HeroMatrix } from '../../../src/engine/tools/hero-matrix';
import { PersonalUndo, type UndoDir } from './undo';
import { type DiagnoseKind, HOSTED_SOLVE_MS, lintIn, playtestsIn, type SolveParams, solveIn } from './diagnose';
import type {
  CoverageData,
  DiffCaptures,
  LintData,
  PlaytestsData,
  AddEntity,
  EditResult,
  GameInfo,
  MarkdownResult,
  NewNote,
  Note,
  NoteEdit,
  NotesFile,
  RoomData,
  ScreenshotResult,
  SolveData,
  TextRef,
  ValidateResult,
  ReportData,
  GraphData,
  PuzzleData,
} from '../../../tools/studio/types';

import { openSqliteDb } from '../../../bridge/src/store-sqlite';
import { fsBlobStore } from './blobs';
import { GameDoesNotLoad, isGameDoesNotLoad, isStudioError, StudioError } from './errors';
import { ABSENT, sha256 } from './durable';
import { type FileEffect, Journal } from './journal';
import { validateDir } from './validate-dir';

export { StudioError };

export interface StudioOptions {
  /** The game folder (default: GAME_DIR, see tools/game.ts). */
  gameDir?: string;
  /** Repository root: room files are reported relative to it, screenshots go to <root>/.cache/studio. */
  root?: string;
  /** Imports a TypeScript module fresh (not from a cache): the game changes on disk between calls. */
  importFresh?: (file: string) => Promise<unknown>;
  /** Who writes, as the journal records it (4.2.1; default `local`). */
  author?: string;
  /**
   * The operation journal (4.2.1, plan P1). Default: one opened on first write, under `<root>/.cache/studio-journal/`.
   * A caller that shares one journal between Studios of the same game passes it.
   */
  journal?: Journal | Promise<Journal>;
  /**
   * Where the game's code runs (4.2.1, ADR 0028): its validation and the loads of its module the Studio reads. By
   * default in this process (`importFresh`); a hosted Studio gives the processing worker's.
   */
  executor?: {
    validate(dir: string): Promise<ValidateResult>;
    load(dir: string): Promise<unknown>;
    /** The diagnostics that run the game's code (4.2.2): lint, solve, playtests, on the worker. */
    diagnose?(kind: DiagnoseKind, dir: string, params: Record<string, unknown>): Promise<unknown>;
  };
  /** A shared Studio's undo (4.2.2): each member's own operations, kept in the database. */
  personalUndo?: PersonalUndo;
}

/** Default fresh import: tsx's scoped loader (a new namespace per call, so edited files are read again). */
async function tsxImport(file: string): Promise<unknown> {
  const { tsImport } = await import('tsx/esm/api');
  return tsImport(pathToFileURL(file).href, import.meta.url);
}

/**
 * Fresh import in a child process (node + tsx): slower (~0.3 s) but immune to any module cache, e.g. inside Vitest.
 * Only data crosses the process boundary (functions are dropped), which is all the Studio reads from a game.
 */
export function importInChild(file: string, cwd = ROOT): Promise<unknown> {
  const script =
    'const m = await import(process.argv[1]); process.stdout.write(JSON.stringify(m, (k, v) => typeof v === "function" ? undefined : v));';
  return new Promise((ok, fail) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script, pathToFileURL(file).href],
      { cwd, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          fail(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' ')));
          return;
        }
        try {
          ok(JSON.parse(stdout));
        } catch (e) {
          fail(e as Error);
        }
      },
    );
  });
}

const ID = /^[A-Za-z_][\w-]*$/;

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (e) {
    throw new StudioError(`${basename(file)}: invalid JSON (${(e as Error).message})`, 500);
  }
}

/** Throws a StudioError for a bad `[x, y]`. */
function point(at: unknown): Point {
  if (!Array.isArray(at) || at.length !== 2 || !at.every((v) => typeof v === 'number' && Number.isFinite(v)))
    throw new StudioError('`at` must be [x, y]');
  return [Math.round(Math.max(0, Math.min(640, at[0]))), Math.round(Math.max(0, Math.min(400, at[1])))];
}

/** JSON written compactly: a value that fits on one line (within `width`) stays on one line, like a hand-kept file. */
export function formatJson(value: unknown, width = 120): string {
  const inline = (v: unknown): string => {
    if (Array.isArray(v)) return v.length ? `[${v.map(inline).join(', ')}]` : '[]';
    if (v && typeof v === 'object') {
      const e = Object.entries(v).filter(([, x]) => x !== undefined);
      return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')} }` : '{}';
    }
    return JSON.stringify(v) ?? 'null';
  };
  const block = (v: unknown, ind: string, prefix: number): string => {
    const one = inline(v);
    if (ind.length + prefix + one.length <= width || !v || typeof v !== 'object') return one;
    const next = ind + '  ';
    if (Array.isArray(v)) return `[\n${v.map((x) => next + block(x, next, 0)).join(',\n')}\n${ind}]`;
    const e = Object.entries(v).filter(([, x]) => x !== undefined);
    return `{\n${e.map(([k, x]) => `${next}${JSON.stringify(k)}: ${block(x, next, JSON.stringify(k).length + 2)}`).join(',\n')}\n${ind}}`;
  };
  return block(value, '', 0) + '\n';
}

/**
 * Who asks, and with which operation id (4.2.1, P6): the Studio Server runs each request inside it. The operations a
 * request makes get the ids `<id>:1`, `<id>:2`… in order, the same on a retry, so the journal never applies one twice.
 */
export const operationContext = new AsyncLocalStorage<{
  id?: string;
  author?: string;
  seq?: number;
  /** Who claims the spans an operation touches (a shared Studio, 4.2.1 P2), and the fences their client holds. */
  claimant?: { userId: string; name: string; fences?: Record<string, number> };
  /** The revision the client read what it edits at (4.2.3, H10: `x-studio-base`). */
  readAt?: number;
  /** The client the request comes from (`x-studio-client`: a tab, a CLI or MCP session). */
  client?: string;
}>();

/** The `id` set_value takes for the game file instead of a room (4.1.12): its objectives. */
export const GAME_FILE_ID = '@game';

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A copy of `from` at `to` made of hard links (the guard's staging folder): instant, and the same file system. */
function linkTree(from: string, to: string) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    const a = join(from, e.name),
      b = join(to, e.name);
    if (e.isDirectory()) linkTree(a, b);
    else if (e.isFile()) {
      try {
        linkSync(a, b);
      } catch (err) {
        // Another file system (EXDEV), or links refused: a copy is slower but the same staging.
        if (!['EXDEV', 'EPERM', 'ENOTSUP'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
        copyFileSync(a, b);
      }
    }
  }
}

export function createStudio(opts: StudioOptions = {}) {
  const dir = resolve(opts.gameDir ?? GAME_DIR);
  const root = resolve(opts.root ?? ROOT);
  const importFresh = opts.importFresh ?? tsxImport;
  const gameId = basename(dir);

  const rel = (file: string) => {
    const r = relative(root, file);
    return r.startsWith('..') || isAbsolute(r) ? file : r;
  };
  const layoutFile = (id: string) => join(dir, 'layout', `${id}.json`);

  // Writes are serialized: two quick edits of the same file never interleave.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T> | T): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => undefined);
    return p;
  };

  async function loadModule(d = dir): Promise<GameModule> {
    if (opts.executor)
      try {
        return (await opts.executor.load(d)) as GameModule;
      } catch (e) {
        throw isGameDoesNotLoad(e) ? e : new StudioError(`the game does not load: ${(e as Error).message}`, 500);
      }
    try {
      return (await importFresh(join(d, 'index.ts'))) as GameModule;
    } catch (e) {
      // The game's own code, imported here: its failure is the game's (the guard's baseline may be it).
      throw isGameDoesNotLoad(e) ? e : new GameDoesNotLoad((e as Error).message);
    }
  }

  /** The file of `defineGame({...})`: game.ts, else the first .ts of the game folder that calls it. */
  function gameFile(): string {
    const files = ['game.ts', ...readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'game.ts')].map((f) =>
      join(dir, f),
    );
    const found = files.find((f) => existsSync(f) && /\bdefineGame\s*\(/.test(readFileSync(f, 'utf8')));
    if (!found) throw new StudioError('no defineGame({...}) in the game folder', 404);
    return found;
  }

  /** rooms/<id>.ts, or the room file whose `id` is this id. */
  function roomFile(id: string): string {
    if (!ID.test(id)) throw new StudioError(`invalid room id: "${id}"`);
    const direct = join(dir, 'rooms', `${id}.ts`);
    if (existsSync(direct)) return direct;
    const rooms = join(dir, 'rooms');
    if (existsSync(rooms)) {
      for (const f of readdirSync(rooms).filter((x) => x.endsWith('.ts'))) {
        const file = join(rooms, f);
        try {
          const { root: obj } = parseRoom(readFileSync(file, 'utf8'), file);
          const p = obj.properties.find(
            (q) => ts.isPropertyAssignment(q) && ts.isIdentifier(q.name) && q.name.text === 'id',
          ) as ts.PropertyAssignment | undefined;
          if (p && ts.isStringLiteral(p.initializer) && p.initializer.text === id) return file;
        } catch {
          /* not a room file */
        }
      }
    }
    throw new StudioError(`unknown room: "${id}"`, 404);
  }

  // ---- writes (4.2.1, plan P1 and P3): one operation of the journal each, applied whole or not at all, guarded on
  // the game's final state, recorded for undo / redo (3.4) when the edit is an author's.
  const author = opts.author ?? 'local';
  let journalP: Promise<Journal> | undefined = opts.journal ? Promise.resolve(opts.journal) : undefined;
  /** The game's journal, opened on first write: `<root>/.cache/studio-journal/<game>-<hash of its folder>/`. */
  const journal = (): Promise<Journal> =>
    (journalP ??= (async () => {
      const key = `${gameId}-${createHash('sha256').update(dir).digest('hex').slice(0, 12)}`;
      const home = join(root, '.cache', 'studio-journal', key);
      const db = await openSqliteDb(join(home, 'journal.sqlite'));
      return Journal.open({ db, blobs: fsBlobStore(join(home, 'blobs')), gameDir: dir });
    })());
  /** A game file's path as the journal names it (relative to the game folder, with `/`). */
  const inGame = (file: string) => relative(dir, file).split(/[\\/]/).join('/');

  /** One write of an operation: the file (absolute) and its whole new text, `null` to remove it. */
  /** `from`: the content the edit was computed from, when the caller read it itself (the 409 then covers that read). */
  type Effect = { file: string; after: Buffer | string | null; from?: Buffer | string | null };
  /** What an undo puts back: every file of one operation, `before` and `after` as they were. */
  type Change = { files: { file: string; before: Buffer | null; after: Buffer | string | null }[]; what: string };
  const undoStack: Change[] = [],
    redoStack: Change[] = [];
  const readBytes = (file: string) => (existsSync(file) ? readFileSync(file) : null);
  const hashOf = (t: Buffer | string | null) => (t === null ? ABSENT : sha256(t));

  /** The files the validator never reads: an operation that writes only those needs no guard. */
  const UNGUARDED = /^(notes\.json|storyboard\.(json|md)|voices\.json|playtests\/|art\/|audio\/|private\/)/;

  /** The game's validation errors at the journal's head, kept per revision (the guard compares against them). */
  let baseline: { rev: number; errors: Set<string>; unloadable?: string } | undefined;

  /**
   * The guard (P3): the game as it would be after the operation, built in a staging folder (links to every file, the
   * changed ones written), validated; an operation that adds a validation error is refused (422) before anything is
   * logged. Judged on the final state, so "create the object + refer to it" in one operation passes.
   */
  /** A validator that could not answer (a worker that refused, timed out, left no result): a 503, never a verdict. */
  const unanswered = (e: unknown): StudioError =>
    isStudioError(e) ? e : new StudioError(`the edit cannot be judged now: ${(e as Error)?.message ?? e}`, 503);

  async function guard(j: Journal, changed: FileEffect[], diff: string): Promise<void> {
    if (changed.every((e) => UNGUARDED.test(e.path))) return;
    const rev = await j.revision();
    // A head whose code does not load (4.3.0: a game still importing the former name's `web-scumm/…`, D47) has no
    // verdict to compare with: an operation is then judged by whether the game loads after it, its errors becoming the
    // next baseline. Only the game's own failure counts: a worker that refused, timed out or left no result propagates
    // (a 503, say) and nothing is kept, so the next write asks again.
    if (baseline?.rev !== rev)
      try {
        baseline = { rev, errors: new Set((await validateIn(dir)).errors) };
      } catch (e) {
        if (!isGameDoesNotLoad(e)) throw unanswered(e);
        baseline = { rev, errors: new Set(), unloadable: e.message };
      }
    const stage = join(root, '.cache', 'studio-stage', `${gameId}-${process.pid}-${Date.now().toString(36)}`);
    try {
      linkTree(dir, stage);
      for (const e of changed) {
        const f = join(stage, ...e.path.split('/'));
        rmSync(f, { force: true });
        if (e.after !== null) {
          mkdirSync(join(f, '..'), { recursive: true });
          writeFileSync(f, e.after);
        }
      }
      const was = baseline.errors;
      // A game whose images are not prepared yet (`assets.gen.json` lists none, like the template) reports every image
      // as not found: that says the assets wait for `npm run assets`, not that the edit is wrong. With prepared images,
      // `addEntity` refuses an unknown one itself.
      const unprepared = !Object.keys(loadAssets(join(stage, 'assets.gen.json'))?.images ?? {}).length;
      const after = await validateIn(stage).catch((e: unknown) => {
        if (!isGameDoesNotLoad(e)) throw unanswered(e);
        throw Object.assign(
          new StudioError(
            baseline?.unloadable
              ? `refused: the game still does not load after the edit (${e.message}); nothing was written`
              : `refused: the game would no longer load after the edit (${e.message}); nothing was written`,
            422,
          ),
          { body: { errors: [e.message], diff } },
        );
      });
      const added = baseline.unloadable
        ? []
        : after.errors.filter((e) => !was.has(e) && !(unprepared && e.includes('image not found')));
      if (added.length)
        throw Object.assign(
          new StudioError(
            `refused: the edit adds ${added.length} validation error(s): ${added.slice(0, 3).join('; ')}`,
            422,
          ),
          { body: { errors: added, diff } },
        );
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }

  /**
   * Applies one operation: every effect at once through the journal, guarded unless every file is one the validator
   * never reads. `undo: false` for the writes 3.4 never recorded (notes, storyboard). Returns the files it changed.
   */
  async function write(
    what: string,
    effects: Effect[],
    o: { undo?: boolean; diff?: string; who?: string; guard?: boolean } = {},
  ): Promise<string[]> {
    const j = await journal();
    const befores = new Map(effects.map((e) => [e.file, readBytes(e.file)]));
    const ctx = operationContext.getStore();
    const opId = ctx?.id ? `${ctx.id}:${(ctx.seq = (ctx.seq ?? 0) + 1)}` : undefined;
    const r = await j.apply({
      id: opId,
      author: ctx?.author ?? o.who ?? author,
      what,
      effects: effects.map((e) => ({ path: inGame(e.file), after: e.after })),
      readAt: ctx?.readAt,
      client: ctx?.client,
      // The files as this operation read them: another process that wrote one meanwhile makes it a 409, not a loss.
      expect: Object.fromEntries(
        effects.map((e) => [inGame(e.file), hashOf(e.from !== undefined ? e.from : (befores.get(e.file) ?? null))]),
      ),
      guard: o.guard === false ? undefined : (changed) => guard(j, changed, o.diff ?? ''),
      respond: (rev) => ({ rev }),
    });
    // A shared Studio (4.2.2, G5): the member's own stack, kept in the database (once: a retry of the same operation
    // is answered, not recorded again). Here: this process's stack.
    if (r.replayed) {
      /* recorded by the first try */
    } else if (r.changed.length && o.undo !== false && opts.personalUndo && ctx?.claimant) {
      try {
        // What its undo puts back is kept (a hosted journal has it already; a local one adopted it without it).
        if (!j.keepsEverything) for (const b of befores.values()) if (b) await j.keep(b);
        await opts.personalUndo.recorded(ctx.claimant.userId, r.rev, what);
      } catch (e) {
        // The edit landed: it only has no undo. Said in the log, never turned into a refusal of what was written.
        console.error(JSON.stringify({ event: 'undo-not-recorded', rev: r.rev, message: (e as Error).message }));
      }
    } else if (r.changed.length && o.undo !== false) {
      const changed = new Set(r.changed);
      undoStack.push({
        what,
        files: effects
          .filter((e) => changed.has(inGame(e.file)))
          .map((e) => ({ file: e.file, before: befores.get(e.file) ?? null, after: e.after })),
      });
      if (undoStack.length > 200) undoStack.shift();
      redoStack.length = 0;
    }
    return r.changed;
  }

  /** Refuses (500) a room file the edit would leave unparsable: nothing is written. */
  function parses(file: string, code: string) {
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const diags = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
    if (diags.length)
      throw new StudioError(
        `refused: the edit would break ${basename(file)} (${ts.flattenDiagnosticMessageText(diags[0].messageText, ' ')})`,
        500,
      );
    return code;
  }

  /**
   * Undoes (or redoes) the last recorded operation, itself one operation of the journal; 409 when one of its files
   * changed since (an AI, an editor, git, another author).
   */
  function step(
    from: Change[],
    to: Change[],
    dirn: 'undo' | 'redo',
  ): Promise<{ ok: true; file: string; what: string } | { ok: false; reason: string }> {
    const c = from.at(-1);
    if (!c) return Promise.resolve({ ok: false as const, reason: `nothing to ${dirn}` });
    for (const f of c.files)
      if (hashOf(readBytes(f.file)) !== hashOf(dirn === 'undo' ? f.after : f.before))
        return Promise.reject(new StudioError(`cannot ${dirn} "${c.what}": ${rel(f.file)} changed since`, 409));
    from.pop();
    return write(
      `${dirn}: ${c.what}`,
      c.files.map((f) => ({ file: f.file, after: dirn === 'undo' ? f.before : f.after })),
      { undo: false },
    ).then(
      () => {
        to.push(c);
        return { ok: true as const, file: rel(c.files[0].file), what: c.what };
      },
      (e) => {
        from.push(c);
        throw e;
      },
    );
  }
  /**
   * A member's undo (or redo) on a shared Studio (4.2.2, G5): their latest operation, inverted from the journal's
   * contents before (or after) it, as a new guarded operation that claims its spans (423 when another holds one);
   * 409 when another write changed one of its files since.
   */
  async function personalStep(
    dirn: UndoDir,
  ): Promise<{ ok: true; file: string; what: string } | { ok: false; reason: string }> {
    const who = operationContext.getStore()!.claimant!;
    const pu = opts.personalUndo!;
    const j = await journal();
    const c = await pu.next(who.userId, dirn);
    if (!c) return { ok: false, reason: `nothing to ${dirn}` };
    const effects = await j.effectsAt(c.rev);
    if (!effects.length) throw new StudioError(`cannot ${dirn} "${c.what}": the journal has no such operation`, 409);
    const found = dirn === 'undo' ? 'after' : 'before';
    const target = dirn === 'undo' ? 'before' : 'after';
    const heads = await Promise.all(effects.map((e) => j.file(e.path)));
    // Already there (an undo applied whose move was lost to a cut or a stop): moved now, nothing written again.
    if (effects.every((e, i) => heads[i]!.blob === e[target])) {
      await pu.moved(c.rev, dirn);
      return { ok: true, file: effects[0]!.path, what: c.what };
    }
    effects.forEach((e, i) => {
      if (heads[i]!.blob !== e[found])
        throw new StudioError(
          `cannot ${dirn} "${c.what}": ${e.path} was written again at revision ${heads[i]!.rev}`,
          409,
        );
    });
    const blob = async (h: string) => (h === ABSENT ? null : await j.blob(h));
    // `from`: what the check above found, compared again by the journal under its lease (no write between them).
    const back: Effect[] = [];
    for (const e of effects)
      back.push({ file: join(dir, ...e.path.split('/')), after: await blob(e[target]), from: await blob(e[found]) });
    await write(`${dirn}: ${c.what}`, back, { undo: false });
    await pu.moved(c.rev, dirn);
    return { ok: true, file: effects[0]!.path, what: c.what };
  }
  const shared = () => !!opts.personalUndo && !!operationContext.getStore()?.claimant;
  const undo = () => (shared() ? personalStep('undo') : step(undoStack, redoStack, 'undo'));
  const redo = () => (shared() ? personalStep('redo') : step(redoStack, undoStack, 'redo'));
  const history = async () =>
    shared()
      ? opts.personalUndo!.history(operationContext.getStore()!.claimant!.userId)
      : { undo: undoStack.map((c) => c.what).reverse(), redo: redoStack.map((c) => c.what).reverse() };

  /**
   * Writes a structured value (a stage, a condition, a command list, a renderer) at `path` in rooms/<id>.ts. `dry`:
   * only the diff. Otherwise one guarded operation: an edit that adds a validation error is refused (422, with the
   * errors and the diff). Recorded for undo.
   */
  function setValue(
    id: string,
    path: string,
    value: unknown,
    o: { dry?: boolean } = {},
  ): Promise<EditResult & { diff: string; dry?: true }> {
    return serial(async () => {
      if (typeof path !== 'string' || !path) throw new StudioError('`path` is required');
      // `@game` (4.1.12): the game file's `defineGame({...})`, for its objectives only (ADR 0014).
      const isGame = id === GAME_FILE_ID;
      if (isGame && !/^objectives(\.[\w.-]+)?(\.(title|done|optional|parent))?$/.test(path))
        throw new StudioError(
          `@game: only "objectives", "objectives.<id>" or "objectives.<id>.<field>" can be written`,
        );
      const file = isGame ? gameFile() : roomFile(id);
      const before = readFileSync(file, 'utf8');
      const r = wrap(() => setValueInSource(before, path, value, file, isGame ? 'defineGame' : 'defineRoom'));
      const diff = r.changed ? lineDiff(before, r.code) : '';
      if (!r.changed || o.dry)
        return { ok: true as const, line: r.line, changed: r.changed, diff, ...(o.dry ? { dry: true as const } : {}) };
      await write(`${id}: ${path}`, [{ file, after: parses(file, r.code), from: before }], { diff });
      return { ok: true as const, line: r.line, changed: true, diff };
    });
  }

  const wrap = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (e) {
      if (e instanceof SourceError) throw new StudioError(e.message, e.status);
      throw e;
    }
  };

  // ------------------------------------------------------------------ reading

  async function gameInfo(): Promise<GameInfo> {
    const mod = await loadModule();
    const g = mod.game;
    const manifest = (mod.manifest ?? {}) as { images?: Record<string, [number, number]> };
    return {
      id: gameId,
      title: g.title,
      hero: g.hero,
      rooms: g.rooms.map((r) => ({ id: r.id, name: r.name, decor: r.decor })),
      characters: Object.fromEntries(
        Object.entries(g.characters).map(([k, c]) => [k, { name: c.name, color: c.color, portrait: c.portrait }]),
      ),
      items: Object.fromEntries(Object.entries(g.items).map(([k, i]) => [k, { name: i.name, icon: i.icon }])),
      verbs: g.verbs,
      checkpoints: g.checkpoints ?? {},
      objectives: g.objectives ?? {},
      images: manifest.images ?? {},
      sfx: Object.keys(g.audio?.sfx ?? {}),
      scores: g.audio?.scores ?? {},
    };
  }

  function texts(id: string): TextRef[] {
    const file = roomFile(id);
    return wrap(() => extractTexts(readFileSync(file, 'utf8'), file)).map(({ segs: _s, ...t }) => ({
      ...t,
      file: rel(file),
    }));
  }

  /**
   * What changed between revisions `from` and `to` (4.2.3, H3), file by file, by what the game names: the files the
   * operations between them wrote, each compared at both sides (its content before the first of those operations, after
   * the last), ids in a source, value paths in a JSON. 2,000 revisions and 500 files at most; the game's `private/`
   * left out (a reviewer reads this); a content the journal did not keep (a local journal's adopted files) is opaque.
   */
  async function diff(from: number, to: number): Promise<{ from: number; to: number; files: FileDiff[]; cut?: true }> {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from)
      throw new StudioError('from and to are revisions, from ≤ to');
    if (to - from > 2_000) throw new StudioError('2,000 revisions at most between from and to');
    const j = await journal();
    if (to > (await j.revision())) throw new StudioError(`no revision ${to} yet`, 404);
    // Each file's side at `from` is the first operation's before, at `to` the last one's after.
    const sides = new Map<string, { a: string; b: string }>();
    for (let r = from + 1; r <= to; r++)
      for (const e of await j.effectsAt(r)) {
        if (/^private(\/|$)/.test(e.path)) continue;
        const s = sides.get(e.path);
        if (s) s.b = e.after;
        else sides.set(e.path, { a: e.before, b: e.after });
      }
    const side = async (h: string): Promise<Side> => {
      if (h === ABSENT) return { present: false, text: null };
      const bytes = await j.blob(h).catch(() => null);
      if (!bytes || bytes.length > 1024 * 1024 || bytes.includes(0)) return { present: true, text: null };
      const text = bytes.toString('utf8');
      return { present: true, text: Buffer.from(text, 'utf8').equals(bytes) ? text : null };
    };
    const changed = [...sides].filter(([, s]) => s.a !== s.b).sort(([x], [y]) => (x < y ? -1 : 1));
    const files: FileDiff[] = [];
    for (const [path, s] of changed.slice(0, 500)) files.push(diffFile(path, await side(s.a), await side(s.b)));
    return { from, to, files, ...(changed.length > 500 ? { cut: true } : {}) };
  }

  /**
   * The diff's captures (4.4.0): each room the diff between `from` and `to` names, rendered at both revisions
   * (diff-captures.ts). Local only: a hosted Studio's game code runs on the worker, which has no browser.
   */
  async function diffCaptures(from: number, to: number): Promise<DiffCaptures> {
    if (opts.executor)
      return {
        unavailable: true,
        reason: "the diff's captures need a local Studio (npm run studio): a hosted Studio has no browser to draw them",
      };
    const d = await diff(from, to);
    // The head's rooms and their files: what a changed file names (a room added or removed is named by its paths).
    const roomFiles: Record<string, string> = {};
    for (const r of (await loadModule()).game.rooms)
      try {
        roomFiles[r.id] = relative(dir, roomFile(r.id)).split(sep).join('/');
      } catch {
        /* a room without a file of its own: named by its layout only */
      }
    const pick = roomsToCapture(d.files, roomFiles);
    return captureDiff(
      {
        journal: await journal(),
        gameDir: dir,
        game: gameId,
        publicDir: join(WORK, 'public'),
        assetsDir: ASSETS_DIR,
        outDir: join(shotsDir(), `${gameId}-diff-${from}-${to}`),
        rel,
        // The worker's child on this machine, loaded on demand (the dev server's plugin imports this file).
        build: async (snapshot, rev) =>
          (await import('../worker/local')).localPreview(snapshot, {
            rev,
            game: gameId,
            studioOrigin: 'http://localhost:9',
            assetsVersion: '0',
          }),
      },
      from,
      to,
      pick.rooms,
      pick.cut,
    );
  }

  /** The game's IR (4.1.12, ADR 0013), with the file and line of each id and the trusted extensions' hash. */
  async function ir(): Promise<GameIR> {
    return gameIR(await loadModule(), dir);
  }

  async function getRoom(id: string): Promise<RoomData> {
    const file = roomFile(id);
    const mod = await loadModule();
    // Declared exits are shown as what they become (a hotspot and rules at the end of `on`): the written paths hold.
    const def = normalizeExits(mod.game).rooms.find((r) => r.id === id);
    if (!def) throw new StudioError(`room "${id}" is not in the game (index.ts / game.ts)`, 404);
    return { def, layout: readJson<Layout>(layoutFile(id), {}), texts: texts(id), file: rel(file) };
  }

  function getLayout(id: string): Layout {
    roomFile(id);
    return readJson<Layout>(layoutFile(id), {});
  }

  // ------------------------------------------------------------------ writing

  function setLayout(id: string, layout: unknown): Promise<{ ok: true }> {
    return serial(async () => {
      roomFile(id);
      if (!layout || typeof layout !== 'object' || Array.isArray(layout))
        throw new StudioError('the layout must be an object');
      await write(`${id}: layout`, [{ file: layoutFile(id), after: JSON.stringify(layout, null, 2) + '\n' }]);
      return { ok: true as const };
    });
  }

  /**
   * Replaces the text at `path` in rooms/<id>.ts. `value: null` deletes a list line (or a whole look entry);
   * a path ending in `[+]` appends a line. Writes nothing when the value is already there.
   */
  function setText(id: string, path: string, value: string | null): Promise<EditResult> {
    return serial(async () => {
      if (typeof path !== 'string' || !path) throw new StudioError('`path` is required');
      if (value !== null && typeof value !== 'string') throw new StudioError('`value` must be a string or null');
      const file = roomFile(id);
      const code = readFileSync(file, 'utf8');
      const r = wrap(() => setTextInSource(code, path, value, file));
      if (r.changed) await write(`${id}: ${path}`, [{ file, after: parses(file, r.code), from: code }]);
      return { ok: true as const, line: r.line, changed: r.changed };
    });
  }

  /** Adds a prop, hotspot or actor to the room file and gives it a place in the layout. */
  function addEntity(id: string, e: AddEntity): Promise<EditResult> {
    return serial(async () => {
      const file = roomFile(id);
      if (!e || !['prop', 'hotspot', 'actor'].includes(e.kind))
        throw new StudioError('`kind` must be prop, hotspot or actor');
      if (typeof e.id !== 'string' || !/^[A-Za-z_][\w]*$/.test(e.id))
        throw new StudioError('`id` must be letters, digits and _ (not starting with a digit)');
      const at = point(e.at);
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (e.kind !== 'actor' && !name) throw new StudioError('`name` is required for a prop or a hotspot');
      const mod = await loadModule();
      const room = mod.game.rooms.find((r) => r.id === id);
      if (room && [room.props, room.hotspots, room.actors].some((o) => o && e.id in o))
        throw new StudioError(`"${e.id}" already exists in room "${id}"`, 409);
      if (e.kind === 'actor') {
        if (!e.char || !mod.game.characters[e.char]) throw new StudioError(`unknown character: "${e.char ?? ''}"`);
      }
      const images = (mod.manifest as { images?: Record<string, unknown> } | undefined)?.images;
      if (e.kind === 'prop' && e.img && images && Object.keys(images).length && !images[e.img])
        throw new StudioError(`image not in the manifest: "${e.img}"`);

      const read = readFileSync(file, 'utf8');
      let code = read;
      const fields: Record<string, string | undefined> =
        e.kind === 'prop'
          ? { name, img: e.img || undefined }
          : e.kind === 'hotspot'
            ? { name }
            : { char: e.char, name: name && name !== mod.game.characters[e.char!].name ? name : undefined };
      const section = e.kind === 'prop' ? 'props' : e.kind === 'hotspot' ? 'hotspots' : 'actors';
      const r = wrap(() => addToSection(code, section, e.id, objectText(code, fields, file), file));
      code = r.code;
      if (typeof e.look === 'string' && e.look.trim())
        code = wrap(() => setTextInSource(code, `look.${e.id}[+]`, e.look!.trim(), file)).code;
      parses(file, code);

      const L = readJson<Layout>(layoutFile(id), {});
      if (e.kind === 'prop') (L.props ??= {})[e.id] = { x: at[0], y: at[1], h: 60 };
      else if (e.kind === 'hotspot')
        (L.hotspots ??= {})[e.id] = { rect: [Math.max(0, at[0] - 30), Math.max(0, at[1] - 30), 60, 60] };
      else (L.actors ??= {})[e.id] = { x: at[0], y: at[1] };
      // The room and its layout: one operation (4.2.1), undone together.
      await write(`${id}: add ${e.id}`, [
        { file, after: code, from: read },
        { file: layoutFile(id), after: JSON.stringify(L, null, 2) + '\n' },
      ]);
      return { ok: true as const, line: r.line, changed: true };
    });
  }

  // ------------------------------------------------------------------ storyboard and notes

  function getStoryboard(): Record<string, unknown> {
    return readJson<Record<string, unknown>>(join(dir, 'storyboard.json'), { boards: [] });
  }

  function setStoryboard(sb: unknown): Promise<{ ok: true; changed: boolean }> {
    return serial(async () => {
      const problems = storyboardProblems(sb);
      if (problems.length) throw new StudioError(problems.join('; '));
      const file = join(dir, 'storyboard.json');
      if (existsSync(file) && sameJson(readJson(file, null), sb)) return { ok: true as const, changed: false };
      await write('storyboard', [{ file, after: formatJson(sb) }], { undo: false });
      return { ok: true as const, changed: true };
    });
  }

  // The scenario map (4.2.3, H1): the groupings a team declares, and the map derived from them and the IR.
  const groupingsFile = () => join(dir, 'groupings.json');

  /** The readable groupings, and what a hand-edited file holds that is not (`skipped`, said by the Map tab). */
  function getGroupings(): GroupingsFile & { skipped: string[] } {
    return readableGroupings(readJson<unknown>(groupingsFile(), null));
  }

  /** Writes `groupings.json` only: a grouping references what the game names, never writes it. */
  function setGroupings(v: unknown): Promise<{ ok: true; changed: boolean }> {
    return serial(async () => {
      const problems = groupingsProblems(v);
      if (problems.length) throw new StudioError(problems.join('; '));
      const file = groupingsFile();
      const next = { groupings: (v as GroupingsFile).groupings };
      if (existsSync(file) && sameJson(readJson(file, null), next)) return { ok: true as const, changed: false };
      await write('groupings', [{ file, after: formatJson(next) }], { undo: false });
      return { ok: true as const, changed: true };
    });
  }

  async function map(): Promise<ScenarioMap> {
    const { groupings } = getGroupings();
    return scenarioMap(await ir(), { groupings });
  }

  const notesFile = () => join(dir, 'notes.json');

  function getNotes(): NotesFile {
    const n = readJson<NotesFile>(notesFile(), { entries: [] });
    return { entries: Array.isArray(n.entries) ? n.entries : [] };
  }

  function addNote(n: NewNote): Promise<Note> {
    return serial(async () => {
      if (!n || typeof n.text !== 'string' || !n.text.trim()) throw new StudioError('`text` is required');
      const all = getNotes();
      const note: Note = {
        id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        about: typeof n.about === 'string' ? n.about.trim() : '',
        // On a shared Studio the author is the session's, never what the page says (plan §7 row 7).
        author:
          operationContext.getStore()?.claimant?.name ??
          (typeof n.author === 'string' && n.author.trim() ? n.author.trim() : 'you'),
        text: n.text.trim(),
        at: new Date().toISOString(),
        ...(n.task === true ? { task: true as const } : {}),
      };
      all.entries.push(note);
      await write(`note ${note.id}`, [{ file: notesFile(), after: JSON.stringify(all, null, 2) + '\n' }], {
        undo: false,
        who: note.author,
      });
      return note;
    });
  }

  /** Replaces the text (and optionally the `about`) of a note. */
  function editNote(id: string, e: NoteEdit): Promise<Note> {
    return serial(async () => {
      if (!e || typeof e.text !== 'string' || !e.text.trim()) throw new StudioError('`text` is required');
      if (e.about !== undefined && typeof e.about !== 'string') throw new StudioError('`about` must be a string');
      const all = getNotes();
      const note = all.entries.find((n) => n.id === id);
      if (!note) throw new StudioError(`no such note: "${id}"`, 404);
      note.text = e.text.trim();
      if (e.about !== undefined) note.about = e.about.trim();
      note.edited = new Date().toISOString();
      await write(`note ${id}`, [{ file: notesFile(), after: JSON.stringify(all, null, 2) + '\n' }], { undo: false });
      return note;
    });
  }

  function deleteNote(id: string): Promise<{ ok: true }> {
    return serial(async () => {
      const all = getNotes();
      const i = all.entries.findIndex((n) => n.id === id);
      if (i < 0) throw new StudioError(`no such note: "${id}"`, 404);
      all.entries.splice(i, 1);
      await write(`note ${id}: removed`, [{ file: notesFile(), after: JSON.stringify(all, null, 2) + '\n' }], {
        undo: false,
      });
      return { ok: true as const };
    });
  }

  /** Writes games/<id>/storyboard.md from storyboard.json (same text as `npm run page:storyboard -- --md`). */
  async function exportStoryboardMarkdown(): Promise<MarkdownResult> {
    const mod = await loadModule();
    return serial(async () => {
      const file = join(dir, 'storyboard.json');
      if (!existsSync(file)) throw new StudioError('no storyboard.json in this game', 404);
      const sb = normalizeStoryboard(readJson<unknown>(file, { boards: [] }));
      const md = storyboardMarkdown({ game: mod.game }, sb);
      const out = join(dir, 'storyboard.md');
      await write('storyboard.md', [{ file: out, after: md }], { undo: false });
      return {
        ok: true as const,
        file: rel(out),
        bytes: Buffer.byteLength(md),
        boards: sb.boards.length,
        panels: sb.boards.reduce((n, b) => n + b.panels.length, 0),
      };
    });
  }

  /** The storyboard against the content: what each board, panel, line, topic and sound amounts to in the game. */
  async function coverage(): Promise<CoverageData> {
    const t0 = Date.now();
    const mod = await loadModule();
    const sb = normalizeStoryboard(readJson<unknown>(join(dir, 'storyboard.json'), { boards: [] }));
    const c = storyboardCoverage(mod.game, sb);
    return { coverage: c, markdown: coverageMarkdown(c), ms: Date.now() - t0 };
  }

  // ------------------------------------------------------------------ checks

  // ---- voices (3.4): the production table, per language
  const voicesFile = () => join(dir, 'voices.json');
  async function voices(
    lang?: string,
  ): Promise<{ lang: string; langs: string[]; statuses: readonly VoiceStatus[]; rows: ReturnType<typeof voiceTable> }> {
    const mod = await loadModule();
    const g = mod.game,
      base = g.lang ?? 'en';
    const locales = loadLocales(join(dir, 'locales'));
    const langs = [base, ...Object.keys(locales).filter((l) => l !== base)];
    const l = lang && langs.includes(lang) ? lang : base;
    const sheet = readJson<VoiceSheet>(voicesFile(), {});
    const localized = l === base ? g : applyLocale(structuredClone(g), locales[l]);
    return { lang: l, langs, statuses: VOICE_STATUSES, rows: voiceTable(g, sheet, l, localized) };
  }
  function setVoice(
    lang: string,
    id: string,
    patch: { status?: string; note?: string; actor?: string },
  ): Promise<{ ok: true }> {
    return serial(async () => {
      const mod = await loadModule();
      const g = mod.game;
      // The keys of a language come from its text (4.3.1): a translation may add switches the source has not.
      const table = lang === (g.lang ?? 'en') ? undefined : loadLocales(join(dir, 'locales'))[lang];
      const sheet = readJson<VoiceSheet>(voicesFile(), {});
      const cur = sheet[lang]?.[id];
      const row = {
        id,
        status: patch.status ?? cur?.status ?? 'draft',
        note: patch.note ?? cur?.note ?? '',
        actor: patch.actor ?? cur?.actor ?? '',
      };
      const m = mergeSheet(sheet, lang, [row], voiceIds(table ? applyLocale(g, table) : g));
      if (m.unknown.length) throw new StudioError(`no line "${id}" in the game`, 404);
      if (m.bad.length) throw new StudioError(m.bad[0]);
      await write(`voices ${lang}: ${id}`, [{ file: voicesFile(), after: JSON.stringify(m.sheet, null, 2) + '\n' }]);
      return { ok: true as const };
    });
  }
  async function voicesCsv(lang?: string): Promise<{ lang: string; csv: string }> {
    const v = await voices(lang);
    return { lang: v.lang, csv: toCsv(v.rows) };
  }
  /** 4.4.0: the hero × language matrix (tools/hero-matrix.ts), read-only, over the game and its locale tables. */
  async function heroMatrix(): Promise<HeroMatrix> {
    return heroMatrixOf((await loadModule()).game, loadLocales(join(dir, 'locales')));
  }

  /**
   * The validator's verdict on the game in `d` (the game folder, or the guard's staging folder): through the executor
   * when one is given (ADR 0028: a worker without secrets), in this process otherwise.
   */
  async function validateIn(d: string): Promise<ValidateResult> {
    if (opts.executor) return opts.executor.validate(d);
    return validateDir(d, { root, importFresh, mod: await loadModule(d) });
  }
  const validate = () => validateIn(dir);

  /** The playtests of games/<id>/playtests/*.session.json replayed and summed up (on the worker when hosted). */
  async function playtests(): Promise<PlaytestsData> {
    if (opts.executor?.diagnose) return (await opts.executor.diagnose('playtests', dir, {})) as PlaytestsData;
    return playtestsIn(dir, await loadModule());
  }

  /** The content lint after a witness (or, `prove`, exhaustive) solver run (on the worker when hosted). */
  async function lint(prove = false): Promise<LintData> {
    if (opts.executor?.diagnose)
      return (await opts.executor.diagnose('lint', dir, { prove, timeLimitMs: HOSTED_SOLVE_MS })) as LintData;
    return lintIn(dir, await loadModule(), prove);
  }

  async function solve(
    from?: string | null,
    maxStates = 20000,
    mode: 'witness' | 'prove' = 'witness',
    reality?: RealityPolicy,
  ): Promise<SolveData> {
    const o: SolveParams = { from: from ?? null, maxStates, mode, ...(reality ? { reality } : {}) };
    // Hosted: on the worker, with a time limit below the job's (the Studio's call had none before 4.2.2). A policy of
    // the world outside is not sent there: refused rather than solved as another question.
    if (opts.executor?.diagnose && reality) throw new StudioError('a reality policy is solved on a local Studio', 501);
    if (opts.executor?.diagnose)
      return (await opts.executor.diagnose('solve', dir, { ...o, timeLimitMs: HOSTED_SOLVE_MS })) as SolveData;
    return solveIn(dir, await loadModule(), o);
  }

  /** The content profiler: what each room, item and character amounts to. */
  async function report(): Promise<ReportData> {
    const t0 = Date.now();
    const mod = await loadModule();
    const r = reportGame(mod.game, loadLayouts(join(dir, 'layout')), { locales: loadLocales(join(dir, 'locales')) });
    return { report: r, markdown: reportMarkdown(r), ms: Date.now() - t0 };
  }

  /** The puzzle graph: what every rule needs and changes; `id` = one item / flag / prop card. */
  async function puzzle(id?: string): Promise<PuzzleData> {
    const mod = await loadModule();
    const g = puzzleGraph(mod.game, { commands: mod.commands });
    const extra = extraReads(mod.game);
    return {
      graph: g,
      svg: toPuzzleSvg(g),
      dot: toPuzzleDot(g),
      markdown: puzzleMarkdown(g, id || undefined, { extra }),
      classes: Object.fromEntries(liveClasses(g, extra)),
      ...(id ? { id } : {}),
    };
  }

  /** The world's map: rooms and the ways between them. */
  async function graph(): Promise<GraphData> {
    const mod = await loadModule();
    const g = worldGraph(mod.game);
    return { graph: g, svg: toSvg(g), dot: toDot(g) };
  }

  // ------------------------------------------------------------------ screenshot

  const shotsDir = () => join(root, '.cache', 'studio');

  /** Renders a room (optionally at a checkpoint) with the running dev server at `baseUrl`, without the editor's overlays. */
  async function screenshot(
    room: string,
    checkpoint: string | null | undefined,
    baseUrl: string,
  ): Promise<ScreenshotResult> {
    roomFile(room);
    if (checkpoint && !ID.test(checkpoint)) throw new StudioError(`invalid checkpoint: "${checkpoint}"`);
    // The game would run in a browser on this machine: a hosted Studio (its code goes to the worker) has no captures
    // in 4.2.1 (plan §8, PR 7).
    if (opts.executor) return { unavailable: true, reason: 'screenshots are not available on a hosted Studio yet' };
    let pw: typeof import('playwright');
    try {
      pw = await import('playwright');
    } catch {
      return {
        unavailable: true,
        reason: 'Playwright is not installed (npm i -D playwright && npx playwright install chromium)',
      };
    }
    let browser: Awaited<ReturnType<typeof pw.chromium.launch>>;
    try {
      browser = await pw.chromium.launch();
    } catch (e) {
      return { unavailable: true, reason: `Chromium does not start: ${(e as Error).message.split('\n')[0]}` };
    }
    try {
      const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
      // baseUrl: the dev server's root, base path included (http://localhost:5173/ or …/<base>/).
      const url = new URL(baseUrl);
      url.search = '';
      url.hash = '';
      url.searchParams.set('edit', room);
      if (checkpoint) url.searchParams.set('at', checkpoint);
      await page.goto(url.toString());
      await page.waitForFunction(() => !!(window as unknown as { __editor?: unknown }).__editor, null, {
        timeout: 20000,
      });
      await page.evaluate(() => {
        document.querySelectorAll<HTMLElement>('.scene > svg, .tp-dfwv').forEach((e) => {
          e.style.display = 'none';
        });
      });
      await page.waitForTimeout(700);
      mkdirSync(shotsDir(), { recursive: true });
      const name = `${gameId}-${room}${checkpoint ? `-${checkpoint}` : ''}.png`;
      const file = join(shotsDir(), name);
      await page.screenshot({ path: file });
      return { file: rel(file), url: `/__studio/api/screenshots/${name}?t=${Date.now()}` };
    } finally {
      await browser.close();
    }
  }

  /** A screenshot written by `screenshot`, by its file name (null if absent or not a plain name). */
  function screenshotPath(name: string): string | null {
    if (!/^[\w.-]+\.png$/.test(name)) return null;
    const f = join(shotsDir(), name);
    return existsSync(f) ? f : null;
  }

  /**
   * Writes files of the game as one operation (4.2.1): `path` relative to the game folder, `after` the whole content
   * (`null` removes the file). The asset uploads and the authoring tools write through it, never beside it.
   */
  function writeFiles(
    what: string,
    files: { path: string; after: Buffer | string | null; from?: string | null }[],
    o: { undo?: boolean; who?: string; guard?: boolean } = {},
  ): Promise<string[]> {
    return serial(() =>
      write(
        what,
        files.map((f) => ({ file: join(dir, ...f.path.split('/')), after: f.after, from: f.from })),
        o,
      ),
    );
  }

  return {
    gameDir: dir,
    gameId,
    root,
    writeFiles,
    /** The game module, imported fresh (for tools that read the whole game, e.g. asset prompts). */
    loadGame: loadModule,
    gameInfo,
    diff,
    diffCaptures,
    ir,
    getRoom,
    texts,
    getLayout,
    setLayout,
    setText,
    addEntity,
    report,
    graph,
    puzzle,
    coverage,
    lint,
    playtests,
    getStoryboard,
    setStoryboard,
    getGroupings,
    setGroupings,
    map,
    getNotes,
    addNote,
    editNote,
    deleteNote,
    exportStoryboardMarkdown,
    validate,
    solve,
    screenshot,
    screenshotPath,
    setValue,
    undo,
    redo,
    history,
    voices,
    setVoice,
    voicesCsv,
    heroMatrix,
  };
}

export type Studio = ReturnType<typeof createStudio>;

// The current game (GAME / GAME_DIR), for callers that don't need another folder.
let current: Studio | undefined;
const cur = () => (current ??= createStudio());
export const gameInfo = () => cur().gameInfo();
export const getRoom = (id: string) => cur().getRoom(id);
export const setLayout = (id: string, layout: unknown) => cur().setLayout(id, layout);
export const setText = (id: string, path: string, value: string | null) => cur().setText(id, path, value);
export const addEntity = (id: string, e: AddEntity) => cur().addEntity(id, e);
export const getStoryboard = () => cur().getStoryboard();
export const setStoryboard = (sb: unknown) => cur().setStoryboard(sb);
export const getNotes = () => cur().getNotes();
export const addNote = (n: NewNote) => cur().addNote(n);
export const editNote = (id: string, e: NoteEdit) => cur().editNote(id, e);
export const deleteNote = (id: string) => cur().deleteNote(id);
export const exportStoryboardMarkdown = () => cur().exportStoryboardMarkdown();
export const validate = () => cur().validate();
export const solve = (from?: string | null, mode?: 'witness' | 'prove') => cur().solve(from, undefined, mode);
export const screenshot = (room: string, checkpoint: string | null | undefined, baseUrl: string) =>
  cur().screenshot(room, checkpoint, baseUrl);
