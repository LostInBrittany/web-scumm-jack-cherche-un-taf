// The examples and configurations a page shows, run through the real validators (4.5.0 "Wiki",
// docs/dev/PLAN-4.5-WIKI.md §4.4.3, phase A5): a fenced block tagged `room-example` or `studio-config` is checked by
// `wiki -- check` like the product would check it, so a page cannot show what the product refuses.
//   - ```room-example holds JSON: a room as `defineRoom` takes it, or `{ "room": {…}, "layout": {…}, "items": {…},
//     "characters": {…}, "verbs": […], "hero": "<character id>" }` when the room needs its geometry, the items it
//     uses, its actors' characters, the game's own verbs (they replace the template's nine) or another hero. It is put
//     in a one-room game (schema v3, the template's verbs unless given, a fallback line per verb) and checked by the engine's validator,
//     src/engine/tools/validate.ts, as tests/classics.test.ts checks the classic mechanics: any error fails the check.
//   - ```studio-config holds the JSON of a Studio Server configuration (the file, or `STUDIO_CONFIG_JSON`), loaded by
//     the server's own loader, `loadConfig` of studio-server/src/server/config.ts: what it refuses, the check refuses.
// Each problem names the block's first line and the validator's message.
import { ConfigError, loadConfig } from '../../studio-server/src/server/config';
import { EMPTY_LAYOUT } from '../../src/engine/core/define';
import type { GameDef, Layout, RoomDef } from '../../src/engine/core/types';
import { validate } from '../../src/engine/tools/validate';
import type { Fence } from './page';

const VERBS: GameDef['verbs'] = [
  { id: 'look', label: 'Look', color: '#fff' },
  { id: 'take', label: 'Take', color: '#fff' },
  { id: 'use', label: 'Use', color: '#fff', join: 'with' },
  { id: 'give', label: 'Give', color: '#fff', join: 'to' },
  { id: 'talk', label: 'Talk', color: '#fff' },
  { id: 'open', label: 'Open', color: '#fff' },
  { id: 'close', label: 'Close', color: '#fff' },
  { id: 'push', label: 'Push', color: '#fff' },
  { id: 'pull', label: 'Pull', color: '#fff' },
];
const WRAPPER_KEYS = new Set(['room', 'layout', 'items', 'characters', 'verbs', 'hero']);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The one-room game a room example is validated in. */
function gameOf(
  room: RoomDef,
  items: GameDef['items'],
  characters: GameDef['characters'],
  verbs: GameDef['verbs'],
  hero: string,
): GameDef {
  return {
    schemaVersion: 3,
    id: 'wiki-example',
    title: 'Example',
    saveVersion: 1,
    hero,
    verbs,
    skin: { icons: { map: 'ui/map', pause: 'ui/pause', music: 'ui/music' } },
    ui: {} as GameDef['ui'],
    characters: { hero: { name: 'Hero', color: '#fff', sprites: { idle: ['hero/idle'] } }, ...characters },
    items,
    rooms: [room],
    // A fallback line for each verb, so only the room is judged.
    rules: { fallbacks: Object.fromEntries([...verbs.map((v) => [v.id, ['No.']]), ['use2', ['No.']]]) },
    start: { room: room.id },
    audio: { music: {}, sfx: {} },
  } as GameDef;
}

/** What is wrong with a room example: its JSON, its shape, or the validator's errors. */
export function roomExampleProblems(content: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    return [`not JSON: ${(e as Error).message}`];
  }
  if (!isObject(raw))
    return ['a room example is a JSON object: a room, or { "room", "layout", "items", "characters", "verbs", "hero" }'];
  const wrapped = 'room' in raw;
  if (wrapped) {
    const unknown = Object.keys(raw).filter((k) => !WRAPPER_KEYS.has(k));
    if (unknown.length)
      return [`unknown key(s) ${unknown.join(', ')}: a wrapper holds room, layout, items, characters, verbs, hero`];
  }
  const room = (wrapped ? raw.room : raw) as RoomDef;
  if (!isObject(room) || typeof room.id !== 'string') return ['the room has no "id"'];
  for (const k of ['layout', 'items', 'characters'] as const)
    if (wrapped && raw[k] !== undefined && !isObject(raw[k])) return [`"${k}" is a JSON object`];
  if (wrapped && raw.verbs !== undefined && (!Array.isArray(raw.verbs) || !raw.verbs.length))
    return ['"verbs" is a non-empty list of verbs ({ "id", "label", "color" })'];
  if (wrapped && raw.hero !== undefined && typeof raw.hero !== 'string') return ['"hero" is a character id'];
  const layout = ((wrapped && raw.layout) || EMPTY_LAYOUT) as Layout;
  const game = gameOf(
    room,
    ((wrapped && raw.items) || {}) as GameDef['items'],
    ((wrapped && raw.characters) || {}) as GameDef['characters'],
    ((wrapped && raw.verbs) || VERBS) as GameDef['verbs'],
    ((wrapped && raw.hero) || 'hero') as string,
  );
  try {
    return validate(game, { [room.id]: layout }).errors;
  } catch (e) {
    return [`the validator stopped: ${(e as Error).message}`];
  }
}

/** What the Studio Server's loader refuses in a configuration, or nothing. */
export function studioConfigProblems(content: string, label: string): string[] {
  try {
    loadConfig(label, content);
    return [];
  } catch (e) {
    if (e instanceof ConfigError) return [e.message];
    return [`the loader stopped: ${(e as Error).message}`];
  }
}

/** The problems of a page's runnable fences, each naming the page, the block's line and the validator's message. */
export function exampleProblems(where: string, fences: readonly Fence[]): string[] {
  const out: string[] = [];
  for (const f of fences) {
    const at = `${where} line ${f.line}`;
    if (f.lang === 'room-example')
      for (const p of roomExampleProblems(f.content)) out.push(`${at}: the room-example is refused: ${p}`);
    else if (f.lang === 'studio-config')
      for (const p of studioConfigProblems(f.content, `${where}:${f.line}`))
        out.push(`${at}: the studio-config is refused by the Studio Server's loader: ${p}`);
  }
  return out;
}
