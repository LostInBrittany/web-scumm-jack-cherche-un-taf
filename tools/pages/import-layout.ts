// npm run import-layout -- <file.json|dir> [--dry]
// Merges layouts exported from the placement page (or read back from the artifact db) into games/<id>/layout/<room>.json.
// Accepted shapes, per file:
//   { "layouts": { "<room>": Layout, … } }         "Export JSON" of the placement page
//   { "room": "<room>", "layout": Layout }          one db document of the `layouts` collection
//   [ { "room", "layout" } | { "id", "data": { "room", "layout" } }, … ]   a list of db documents (ArtifactData list)
//   Layout                                           "Export room": the room is the file name (<room>.json)
// Merge rule: only keys present in the export change. `hotspots`, `props`, `actors` and `entries` merge id by id
// (each exported entity replaces the stored one; the page keeps the keys it does not edit, like `states`);
// `walk`, `scale` and `floor` are replaced when present. Prints what changed. --dry prints without writing.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { Layout } from '../../src/engine/core/types';
import { GAME_DIR } from '../game';
import { isMain } from './lib';
import { writeGame } from '../game-write';

type Obj = Record<string, unknown>;
const MAPS = ['hotspots', 'props', 'actors', 'entries'] as const;

/** An object of the parsed file (an array passes too, as JSON.parse can give one where a Layout is expected). */
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object';

/**
 * Extracts (room, layout) pairs from one parsed export file. The file is untrusted: an entry is kept only when its
 * room is a string and its layout an object; anything else in the file is ignored (the caller then reports
 * "nothing to import" or "unchanged"). The layout's fields are not checked here: `mergeLayout` copies them as they come.
 */
export function layoutsFromExport(json: unknown, fileName = ''): { room: string; layout: Layout }[] {
  const out: { room: string; layout: Layout }[] = [];
  /** One db document: `{ room, layout }`, or that under `data`. */
  const doc = (d: unknown) => {
    const v = isObj(d) && isObj(d.data) ? d.data : d;
    if (isObj(v) && typeof v.room === 'string' && isObj(v.layout)) out.push({ room: v.room, layout: v.layout });
  };
  if (Array.isArray(json)) json.forEach(doc);
  else if (isObj(json)) {
    if (isObj(json.layouts) && !Array.isArray(json.layouts)) {
      for (const [room, v] of Object.entries(json.layouts)) {
        if (isObj(v) && v.layout && typeof v.room === 'string') {
          if (isObj(v.layout)) out.push({ room: v.room, layout: v.layout });
        } else if (isObj(v)) out.push({ room, layout: v });
      }
    } else if (Array.isArray(json.docs)) json.docs.forEach(doc);
    else if (typeof json.room === 'string' && json.layout) doc(json);
    else if (fileName) out.push({ room: basename(fileName, '.json'), layout: json });
  }
  return out;
}

const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v as Obj)
            .sort()
            .map((k) => [k, canon((v as Obj)[k])]),
        )
      : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const short = (v: unknown) => {
  const s = JSON.stringify(v) ?? '—';
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
};

/** Merges `patch` into `base` (both untouched) and lists the changes as readable lines. */
export function mergeLayout(base: Layout, patch: Layout): { layout: Layout; changes: string[] } {
  const res = structuredClone(base ?? {}) as Obj;
  const changes: string[] = [];
  for (const [key, val] of Object.entries(patch ?? {})) {
    if (val === undefined) continue;
    if ((MAPS as readonly string[]).includes(key) && val && typeof val === 'object' && !Array.isArray(val)) {
      const map = (res[key] ??= {}) as Obj;
      for (const [id, v] of Object.entries(val as Obj)) {
        const before = map[id];
        // An entity exported by the placement page is complete (it keeps the keys it does not edit), so it replaces
        // the stored one: a flag or a `z` removed on the page is removed here too.
        const after = v;
        if (same(before, after)) continue;
        map[id] = after;
        if (before === undefined) changes.push(`+ ${key}.${id} ${short(after)}`);
        else if (typeof before === 'object' && !Array.isArray(before) && after && typeof after === 'object') {
          const diffs = Object.keys({ ...(before as Obj), ...(after as Obj) })
            .filter((k) => !same((before as Obj)[k], (after as Obj)[k]))
            .map((k) => `${k} ${short((before as Obj)[k])} → ${short((after as Obj)[k])}`);
          changes.push(`~ ${key}.${id}: ${diffs.join(', ')}`);
        } else changes.push(`~ ${key}.${id}: ${short(before)} → ${short(after)}`);
      }
    } else if (!same(res[key], val)) {
      changes.push(`${res[key] === undefined ? '+' : '~'} ${key} ${short(val)}`);
      res[key] = structuredClone(val);
    }
  }
  return { layout: res as Layout, changes };
}

function readExports(target: string): { room: string; layout: Layout; from: string }[] {
  const files = statSync(target).isDirectory()
    ? readdirSync(target)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join(target, f))
    : [target];
  return files.flatMap((f) => {
    const json: unknown = JSON.parse(readFileSync(f, 'utf8'));
    return layoutsFromExport(json, basename(f)).map((x) => ({ ...x, from: f }));
  });
}

/**
 * Applies every export found in `target` to `<gameDir>/layout/`, as one operation of the game's journal (4.2.1).
 * Returns the number of rooms changed.
 */
export async function importLayouts(
  target: string,
  gameDir: string,
  opts: { dry?: boolean; log?: (s: string) => void; guard?: boolean } = {},
): Promise<number> {
  const log = opts.log ?? console.log;
  const dir = join(gameDir, 'layout');
  const exports = readExports(target);
  if (!exports.length) {
    log(`nothing to import in ${target}`);
    return 0;
  }
  let changed = 0;
  const out: { file: string; text: string; from: string | null }[] = [];
  for (const { room, layout, from } of exports) {
    if (!/^[A-Za-z0-9_-]+$/.test(room)) {
      log(`skipped "${room}" (${from}): not a room id`);
      continue;
    }
    const file = join(dir, `${room}.json`);
    const read = existsSync(file) ? readFileSync(file, 'utf8') : null;
    const stored: unknown = read === null ? {} : JSON.parse(read);
    const base: Layout = isObj(stored) ? stored : {};
    const { layout: merged, changes } = mergeLayout(base, layout);
    if (!changes.length) {
      log(`${room}: unchanged`);
      continue;
    }
    changed++;
    log(`${room}: ${changes.length} change(s)${existsSync(file) ? '' : ' (new file)'}${opts.dry ? ' [dry run]' : ''}`);
    for (const c of changes) log(`   ${c}`);
    if (!opts.dry) out.push({ file, text: JSON.stringify(merged, null, 2) + '\n', from: read });
  }
  await writeGame('import-layout', out, { gameDir, guard: opts.guard });
  return changed;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target || !existsSync(target)) {
    console.error('usage: npm run import-layout -- <file.json|dir> [--dry]');
    process.exit(1);
  }
  const n = await importLayouts(resolve(target), GAME_DIR, { dry: args.includes('--dry') });
  console.log(`${n} room(s) ${args.includes('--dry') ? 'would change' : 'updated'} in ${join(GAME_DIR, 'layout')}`);
}
