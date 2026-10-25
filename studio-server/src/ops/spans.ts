// The spans of a game (4.2.1, plan P2): every file of `games/<id>/` belongs to exactly one span, decided by the file
// itself (not the IR's provenance, which misses ids written by code). A file no rule names is an error: a new kind
// of file gets its span here, on purpose, before anyone can write it on a shared Studio.
// A game's own files (4.5.1, #269): what the engine cannot know (modules index.ts imports, notes, scripts) the game
// declares in its own spans.json, { "<path>, <folder>/ or <glob>": "<span>" }. The engine's rules come first, so a
// declaration never moves an engine file; a file that neither names is still refused.
//   room:<id>  rooms/<id>.ts, layout/<id>.json
//   game · items · cast · rules   game.ts · items.ts · cast.ts · rules.ts
//   story      storyboard.json, storyboard.md, STORY.md, prompts.md
//   lang:<c>   locales/<c>.json
//   voices     voices.json
//   assets     art/, audio/, assets.gen.json, talk-kits.json, provenance.json, provenance.lock.json
//   notes      notes.json
//   groupings  groupings.json (4.2.3: the scenario map's characters, puzzles and chapters)
//   meta       index.ts, site.json, e2e.mjs, ending.config.example.ts, ids.paths.json, ids.migration.json, spans.json,
//              audit-allow.json, tests/
//   playtests  playtests/, replays/
//   reality    reality/ (the Reality Bridge's scenarios)
// One span has no file: `*`, the project's exclusive lease (taken by an owner for a whole-game change).

const ONE: Record<string, string> = {
  'game.ts': 'game',
  'items.ts': 'items',
  'cast.ts': 'cast',
  'rules.ts': 'rules',
  'storyboard.json': 'story',
  'storyboard.md': 'story',
  'STORY.md': 'story',
  'prompts.md': 'story',
  'voices.json': 'voices',
  'assets.gen.json': 'assets',
  'talk-kits.json': 'assets',
  'provenance.json': 'assets',
  'provenance.lock.json': 'assets',
  'notes.json': 'notes',
  'groupings.json': 'groupings',
  'index.ts': 'meta',
  'site.json': 'meta',
  'e2e.mjs': 'meta',
  'ending.config.example.ts': 'meta',
  'ids.paths.json': 'meta',
  'ids.migration.json': 'meta',
  'spans.json': 'meta',
  'audit-allow.json': 'meta',
};

/** The folders whose whole tree is one span. */
const TREE: Record<string, string> = {
  art: 'assets',
  audio: 'assets',
  playtests: 'playtests',
  replays: 'playtests',
  reality: 'reality',
  tests: 'meta',
};

/** The spans with a fixed name (every one `spanOf` can give, besides room:<id> and lang:<code>), sorted. */
export const NAMED_SPANS: readonly string[] = [...new Set([...Object.values(ONE), ...Object.values(TREE)])].sort();
const NAMED = new Set(NAMED_SPANS);
const ROOM_SPAN = /^room:[\w-]{1,64}$/;
const LANG_SPAN = /^lang:[\w-]{1,16}$/;

/** Whether a client may name this span (a lease's own name; `*` only through /exclusive, so not here). */
export function isSpanName(name: string): boolean {
  return NAMED.has(name) || ROOM_SPAN.test(name) || LANG_SPAN.test(name);
}

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StudioError } from './errors';

export const EXCLUSIVE = '*';

/** A file no span names: refused (422) on a shared Studio, until it gets one here. */
export class UnknownSpanError extends StudioError {
  constructor(message: string) {
    super(message, 422);
  }
}

/** A game's own spans (its spans.json), in the order written: the first pattern that matches gives the span. */
export type OwnSpans = readonly (readonly [pattern: Glob, span: string])[];

/** A spans.json key, compiled: one literal character, `*` (any name in one folder), `**` (any depth) or `**\/` (no folder
 *  or any folders). Matched without backtracking (`globMatch`), so a hostile key costs its length times the path's. */
type Glob = readonly (string | '*' | '**' | '**/')[];
const STAR = '*';
const ANY = '**';
const ANY_DIR = '**/';

/** The limits of a spans.json on a shared Studio: its size, its entries, a key's length. */
export const OWN_SPANS_LIMITS = { bytes: 64 * 1024, entries: 256, keyLength: 256 } as const;

/** A spans.json key as a pattern: `dir/` is the whole folder, `*` any name in one folder, `**` any depth. */
function glob(key: string): Glob {
  const out: (string | '*' | '**' | '**/')[] = [];
  for (const part of key.split(/(\*\*\/?|\*)/)) {
    if (part === ANY_DIR || part === ANY || part === STAR) out.push(part);
    else out.push(...part);
  }
  if (key.endsWith('/')) out.push(ANY);
  return out;
}

/** Whether `path` matches the compiled key: a table over (key position, path position), filled from the end. */
function globMatch(g: Glob, path: string): boolean {
  const n = path.length;
  // next[j]: the rest of the key from token i+1 matches path.slice(j); cur: from token i.
  let next = new Uint8Array(n + 1);
  next[n] = 1;
  for (let i = g.length - 1; i >= 0; i--) {
    const t = g[i]!;
    const cur = new Uint8Array(n + 1);
    if (t === STAR || t === ANY) {
      cur[n] = next[n]!;
      for (let j = n - 1; j >= 0; j--) cur[j] = next[j] || (t === ANY || path[j] !== '/' ? cur[j + 1]! : 0) ? 1 : 0;
    } else if (t === ANY_DIR) {
      // No folder, or any characters up to and including a '/'.
      let slashThen = 0;
      cur[n] = next[n]!;
      for (let j = n - 1; j >= 0; j--) {
        if (path[j] === '/' && next[j + 1]) slashThen = 1;
        cur[j] = next[j] || slashThen ? 1 : 0;
      }
    } else for (let j = 0; j < n; j++) cur[j] = path[j] === t && next[j + 1] ? 1 : 0;
    next = cur;
  }
  return next[0] === 1;
}

/** The engine's span of a file, or none when no engine rule names it. */
function engineSpan(path: string): string | undefined {
  if (Object.hasOwn(ONE, path)) return ONE[path];
  const room = /^(?:rooms\/([\w-]+)\.ts|layout\/([\w-]+)\.json)$/.exec(path);
  if (room) return `room:${room[1] ?? room[2]}`;
  const lang = /^locales\/([\w-]+)\.json$/.exec(path);
  if (lang) return `lang:${lang[1]}`;
  const top = path.split('/')[0]!;
  return Object.hasOwn(TREE, top) ? TREE[top] : undefined;
}

/** Reads a game's spans.json: every key a relative path that no engine rule names, every value a span a client may
 *  name. Throws on the first fault, with what to change. */
export function parseOwnSpans(json: unknown, where = 'spans.json'): OwnSpans {
  if (!json || typeof json !== 'object' || Array.isArray(json))
    throw new StudioError(`${where}: an object { "<path>, <folder>/ or <glob>": "<span>" }`, 422);
  const entries = Object.entries(json);
  if (entries.length > OWN_SPANS_LIMITS.entries)
    throw new StudioError(`${where}: ${entries.length} entries, at most ${OWN_SPANS_LIMITS.entries}`, 422);
  return entries.map(([key, span]) => {
    if (key.length > OWN_SPANS_LIMITS.keyLength)
      throw new StudioError(`${where}: a key of ${key.length} characters, at most ${OWN_SPANS_LIMITS.keyLength}`, 422);
    if (!key || key.startsWith('/') || key.split('/').some((s) => s === '..' || s === '.') || /[\\\0]/.test(key))
      throw new StudioError(`${where}: "${key}" is not a path relative to the game folder`, 422);
    // A literal path or folder the engine already names: the engine's rule would win, so the line could only mislead.
    if (!key.includes('*') && engineSpan(key.endsWith('/') ? `${key}x` : key) !== undefined)
      throw new StudioError(`${where}: "${key}" is an engine file, its span is the engine's`, 422);
    if (typeof span !== 'string' || !isSpanName(span))
      throw new StudioError(`${where}: "${key}" names no span a client may take (${String(span)})`, 422);
    return [glob(key), span] as const;
  });
}

const read = new Map<string, { stamp: string; own: OwnSpans }>();
/**
 * The spans.json of the game in `gameDir` (none: no own span), read again only when it changed (mtime, size, inode).
 * A file over the size limit or faulty throws; with `onFault`, it is reported and the game has no own span (the
 * engine's rules alone), so a shared Studio can still write `spans.json` itself (`meta`) to repair it.
 */
export function readOwnSpans(gameDir: string, onFault?: (e: Error) => void): OwnSpans {
  const file = join(gameDir, 'spans.json');
  let st: { mtimeMs: number; size: number; ino: number; isFile(): boolean };
  try {
    st = statSync(file);
  } catch {
    return [];
  }
  const stamp = `${st.mtimeMs}:${st.size}:${st.ino}`;
  const known = read.get(file);
  if (known?.stamp === stamp) return known.own;
  let own: OwnSpans;
  try {
    if (!st.isFile()) throw new StudioError('spans.json: not a file', 422);
    if (st.size > OWN_SPANS_LIMITS.bytes)
      throw new StudioError(`spans.json: ${st.size} bytes, at most ${OWN_SPANS_LIMITS.bytes}`, 422);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new StudioError(`spans.json: not JSON (${(e as Error).message})`, 422);
    }
    own = parseOwnSpans(json);
  } catch (e) {
    if (!onFault) throw e;
    onFault(e as Error);
    own = [];
  }
  read.set(file, { stamp, own });
  return own;
}

/** The span of a game file (a path relative to the game folder, with `/`), then the game's own spans. */
export function spanOf(path: string, own: OwnSpans = []): string {
  const engine = engineSpan(path);
  if (engine !== undefined) return engine;
  for (const [g, span] of own) if (globMatch(g, path)) return span;
  throw new UnknownSpanError(
    `${path} belongs to no span: give it one in the game's spans.json (a file of its own) or in studio-server/src/ops/spans.ts`,
  );
}

/** The spans an operation on these files claims, sorted (a fixed order: two claims never wait on each other). */
export function spansOf(paths: string[], own: OwnSpans = []): string[] {
  return [...new Set(paths.map((p) => spanOf(p, own)))].sort();
}
