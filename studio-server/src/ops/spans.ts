// The spans of a game (4.2.1, plan P2): every file of `games/<id>/` belongs to exactly one span, decided by the file
// itself (not the IR's provenance, which misses ids written by code). A file no rule names is an error: a new kind
// of file gets its span here, on purpose, before anyone can write it on a shared Studio.
//   room:<id>  rooms/<id>.ts, layout/<id>.json
//   game · items · cast · rules   game.ts · items.ts · cast.ts · rules.ts
//   story      storyboard.json, storyboard.md, STORY.md, prompts.md
//   lang:<c>   locales/<c>.json
//   voices     voices.json
//   assets     art/, audio/, assets.gen.json, talk-kits.json, provenance.json, provenance.lock.json
//   notes      notes.json
//   groupings  groupings.json (4.2.3: the scenario map's characters, puzzles and chapters)
//   meta       index.ts, site.json, e2e.mjs, ending.config.example.ts, ids.paths.json, ids.migration.json, tests/
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
};

import { StudioError } from './errors';

export const EXCLUSIVE = '*';

/** A file no span names: refused (422) on a shared Studio, until it gets one here. */
export class UnknownSpanError extends StudioError {
  constructor(message: string) {
    super(message, 422);
  }
}

/** The span of a game file (a path relative to the game folder, with `/`). */
export function spanOf(path: string): string {
  if (ONE[path]) return ONE[path];
  const room = /^(?:rooms\/([\w-]+)\.ts|layout\/([\w-]+)\.json)$/.exec(path);
  if (room) return `room:${room[1] ?? room[2]}`;
  const lang = /^locales\/([\w-]+)\.json$/.exec(path);
  if (lang) return `lang:${lang[1]}`;
  const top = path.split('/')[0];
  if (top === 'art' || top === 'audio') return 'assets';
  if (top === 'playtests' || top === 'replays') return 'playtests';
  if (top === 'reality') return 'reality';
  if (top === 'tests') return 'meta';
  throw new UnknownSpanError(`${path} belongs to no span: give it one in studio-server/src/ops/spans.ts`);
}

/** The spans an operation on these files claims, sorted (a fixed order: two claims never wait on each other). */
export function spansOf(paths: string[]): string[] {
  return [...new Set(paths.map(spanOf))].sort();
}
