// The scenario map (4.2.3 PR 2, plan H1): groupings a team declares (a character, a puzzle, a chapter), each only a
// list of references to what the game already names (the IR's provenance keys: a room, a rule or topic or listener id,
// `item:<id>`, `char:<id>`, `<room>.<entity>`, `objective:<id>`, `checkpoint:<id>`), kept in `groupings.json`, a span of
// its own. A grouping never writes what it names. The map is never stored: it is derived from the IR and the groupings,
// the same bytes for the same revision; a reference the IR does not know is said "not declared", never guessed.
import type { GameIR, IrSource } from '../../src/engine/core/ir';

export const GROUPING_KINDS = ['character', 'puzzle', 'chapter'] as const;
export type GroupingKind = (typeof GROUPING_KINDS)[number];

export interface Grouping {
  id: string;
  kind: GroupingKind;
  title: string;
  /** The IR's provenance keys it names, in the team's order. */
  refs: string[];
}

export interface GroupingsFile {
  groupings: Grouping[];
}

/** What a reference names, as the IR says it: its kind, and the `file:line` that writes it. */
export interface MapRef {
  ref: string;
  kind: string;
  /** Undefined: the IR does not know it ("not declared": a typo, an id written by code, something removed). */
  at?: IrSource;
}

export interface ScenarioMap {
  groupings: (Omit<Grouping, 'refs'> & { refs: MapRef[] })[];
  /** What no grouping names yet, by kind: rooms, characters, items, objectives, checkpoints. */
  ungrouped: Record<string, string[]>;
}

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX = { groupings: 500, refs: 500, title: 200, ref: 200 };
/** Control characters and bidirectional overrides: a title that could show what it is not. */
const HIDDEN = /[\p{Cc}‪-‮⁦-⁩]/u;

/** Why one grouping is refused, or nothing (`at`: where it is, for the message). */
function groupingProblems(g: unknown, at: string): string[] {
  const out: string[] = [];
  const o = g as Grouping;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return [`${at} must be an object`];
  if (typeof o.id !== 'string' || !ID.test(o.id)) out.push(`${at}.id must be lowercase letters, digits and -`);
  if (!GROUPING_KINDS.includes(o.kind)) out.push(`${at}.kind must be one of ${GROUPING_KINDS.join(', ')}`);
  if (typeof o.title !== 'string' || !o.title.trim() || o.title.length > MAX.title || HIDDEN.test(o.title))
    out.push(`${at}.title must be a text of 1 to ${MAX.title} characters, without control characters`);
  if (!Array.isArray(o.refs) || o.refs.length > MAX.refs) out.push(`${at}.refs must be a list of at most ${MAX.refs}`);
  else {
    const seen = new Set<string>();
    o.refs.forEach((r, k) => {
      if (typeof r !== 'string' || !r || r.length > MAX.ref || /[\s\p{Cc}]/u.test(r))
        out.push(`${at}.refs[${k}] must be a reference without spaces`);
      else if (seen.has(r)) out.push(`${at}.refs[${k}] "${r}" is named twice`);
      else seen.add(r);
    });
  }
  for (const k of Object.keys(o)) if (!['id', 'kind', 'title', 'refs'].includes(k)) out.push(`${at}.${k} is unknown`);
  return out;
}

/** Why a groupings file is refused, or nothing: each grouping well formed, ids unique, nothing else in the file. */
export function groupingsProblems(v: unknown): string[] {
  const o = v as GroupingsFile;
  if (!o || typeof o !== 'object' || !Array.isArray(o.groupings)) return ['`groupings` must be a list'];
  if (o.groupings.length > MAX.groupings) return [`at most ${MAX.groupings} groupings`];
  const out: string[] = [];
  for (const k of Object.keys(o)) if (k !== 'groupings') out.push(`${k} is unknown`);
  const seen = new Set<string>();
  o.groupings.forEach((g, n) => {
    const p = groupingProblems(g, `groupings[${n}]`);
    out.push(...p);
    if (!p.length) {
      if (seen.has(g.id)) out.push(`groupings[${n}].id "${g.id}" is used twice`);
      seen.add(g.id);
    }
  });
  return out;
}

/**
 * A groupings file as read from the disk (a hand edit, an AI's, a merge): the groupings that are well formed (the first
 * of an id), and what was left out and why. The Studio shows both; saving writes the readable ones.
 */
export function readableGroupings(v: unknown): GroupingsFile & { skipped: string[] } {
  const o = v as GroupingsFile;
  if (!o || typeof o !== 'object' || !Array.isArray(o.groupings))
    return { groupings: [], skipped: v === null || v === undefined ? [] : ['`groupings` must be a list'] };
  const groupings: Grouping[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  o.groupings.slice(0, MAX.groupings).forEach((g, n) => {
    const p = groupingProblems(g, `groupings[${n}]`);
    if (p.length) skipped.push(...p);
    else if (seen.has(g.id)) skipped.push(`groupings[${n}].id "${g.id}" is used twice`);
    else {
      seen.add(g.id);
      groupings.push(g);
    }
  });
  if (o.groupings.length > MAX.groupings) skipped.push(`past ${MAX.groupings} groupings`);
  return { groupings, skipped };
}

/** Every provenance key's kind, in the order `provenanceOf` fills the keys (the first one wins there, and here). */
function kindsOf(ir: GameIR): Map<string, string> {
  const kinds = new Map<string, string>();
  const put = (k: string, kind: string) => {
    if (!kinds.has(k)) kinds.set(k, kind);
  };
  for (const r of ir.rooms) put(r.id, 'room');
  for (const r of ir.rules) put(r.id, r.kind);
  for (const s of ir.scripts) put(s.id, 'script');
  for (const e of ir.entities)
    put(e.key, e.key.startsWith('item:') ? 'item' : e.key.startsWith('char:') ? 'character' : 'entity');
  return kinds;
}

function kindOf(kinds: Map<string, string>, ref: string): string {
  if (ref.startsWith('objective:')) return 'objective';
  if (ref.startsWith('checkpoint:')) return 'checkpoint';
  if (ref.startsWith('item:')) return 'item';
  if (ref.startsWith('char:')) return 'character';
  return kinds.get(ref) ?? 'unknown';
}

/**
 * The map: every grouping with its references resolved, then what no grouping names among the rooms, characters,
 * items, objectives and checkpoints (rules, entities and scripts are too many to list). Sorted, stable.
 */
export function scenarioMap(ir: GameIR, file: GroupingsFile): ScenarioMap {
  const kinds = kindsOf(ir);
  const named = new Set<string>();
  const groupings = [...file.groupings]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((g) => ({
      id: g.id,
      kind: g.kind,
      title: g.title,
      refs: g.refs.map((ref): MapRef => {
        named.add(ref);
        // Its own keys only: `constructor` is no room.
        const at = Object.hasOwn(ir.provenance, ref) ? ir.provenance[ref] : undefined;
        return at ? { ref, kind: kindOf(kinds, ref), at: { file: at.file, line: at.line } } : { ref, kind: 'unknown' };
      }),
    }));
  const ungrouped: Record<string, string[]> = {};
  for (const ref of Object.keys(ir.provenance).sort()) {
    const kind = kindOf(kinds, ref);
    if (named.has(ref) || !['room', 'character', 'item', 'objective', 'checkpoint'].includes(kind)) continue;
    (ungrouped[kind] ??= []).push(ref);
  }
  return { groupings, ungrouped };
}
