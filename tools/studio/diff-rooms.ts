// Which rooms the semantic diff's captures show (4.4.0): the rooms whose own files changed between the two revisions
// (their layout, their source, their texts in a language), and, when only shared files changed (the cast, the items,
// the game, the site), the first room, as a sample of what they draw. Pure: the diff and the room files in, the rooms
// out, each with why. Bounded: past `MAX_CAPTURED` rooms the list is cut, and says so.
import type { FileDiff } from './semantic-diff';

export interface CapturedRoom {
  room: string;
  /** Why it is captured: the files that name it (`layout/hall.json`, `locales/fr.json`, `shared: cast.ts`). */
  why: string[];
}

const MAX_CAPTURED = 6;

/** Files nothing draws: the authoring documents, the tests, the art and sounds (the captures use the prepared ones). */
const NOT_DRAWN =
  /^(?:(?:storyboard|groupings|notes|talk-kits|provenance|provenance\.lock|ids\.[\w.-]+|assets\.gen)\.json|.*\.md|(?:playtests|tests|private|art|audio)\/.*)$/;

/**
 * The rooms to capture for a diff. `roomFiles`: each room of the head revision → its source, relative to the game
 * folder (several rooms may share one). A room added or removed between the two revisions is named by its paths
 * (`rooms/<id>.ts`, `layout/<id>.json`) even when the head does not hold it.
 */
export function roomsToCapture(
  files: FileDiff[],
  roomFiles: Record<string, string>,
  max = MAX_CAPTURED,
): { rooms: CapturedRoom[]; cut?: true } {
  const why = new Map<string, Set<string>>();
  const add = (room: string, reason: string) => {
    if (!/^[A-Za-z_][\w-]*$/.test(room)) return;
    let s = why.get(room);
    if (!s) why.set(room, (s = new Set()));
    s.add(reason);
  };
  const byFile = new Map<string, string[]>();
  for (const [room, file] of Object.entries(roomFiles)) byFile.set(file, [...(byFile.get(file) ?? []), room]);
  const shared: string[] = [];
  for (const f of files) {
    const layout = /^layout\/([\w-]+)\.json$/.exec(f.path);
    const locale = /^locales\/[\w-]+\.json$/.test(f.path);
    if (layout) add(layout[1]!, f.path);
    else if (byFile.has(f.path)) for (const room of byFile.get(f.path)!) add(room, f.path);
    else if (/^rooms\/([\w-]+)\.ts$/.test(f.path)) add(/^rooms\/([\w-]+)\.ts$/.exec(f.path)![1]!, f.path);
    else if (locale && f.values) {
      // A language's texts, by their key: `room:<id>/…` is a room's; any other text (a character's line, an item's
      // name) may show anywhere, and is said as a shared change.
      const keys = [...f.values.added, ...f.values.removed, ...f.values.changed];
      const named = new Set(keys.map((k) => /^room:([\w-]+)\//.exec(k)?.[1]).filter((x): x is string => !!x));
      for (const room of named) add(room, f.path);
      if (keys.some((k) => !/^room:/.test(k) && k !== '_')) shared.push(f.path);
    } else if (/\.(?:tsx?|json|css)$/.test(f.path) && !NOT_DRAWN.test(f.path)) shared.push(f.path);
  }
  // Only shared files: the first room (the order of the game) shows what they draw.
  const first = Object.keys(roomFiles)[0];
  if (shared.length && !why.size && first) for (const p of shared) add(first, `shared: ${p}`);
  const order = Object.keys(roomFiles);
  const rank = (r: string) => (order.includes(r) ? order.indexOf(r) : order.length);
  const rooms = [...why]
    .map(([room, s]) => ({ room, why: [...s].sort() }))
    .sort((a, b) => rank(a.room) - rank(b.room) || (a.room < b.room ? -1 : 1));
  return rooms.length > max ? { rooms: rooms.slice(0, max), cut: true } : { rooms };
}
