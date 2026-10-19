// The Studio demo's snapshot (docs/en/STUDIO.md, "Demo mode"): everything the Studio reads from the dev server, for
// the current game, in one JSON file served next to the built Studio (public/studio-demo/snapshot.json). Written by
// `STUDIO=1 vite build` (vite.config.ts) and by `npm run studio-snapshot`.
//   tsx tools/studio/snapshot.ts [out.json]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAssets } from './assets';
import { createStudio, type StudioOptions } from '../../studio-server/src/ops/core';
import type { RoomData, StudioSnapshot } from './types';
import { ROOT } from '../game';

export const SNAPSHOT_FILE = join(ROOT, 'public', 'studio-demo', 'snapshot.json');

/** The snapshot of a game folder (default: the current game). */
export async function buildSnapshot(opts: StudioOptions = {}): Promise<StudioSnapshot> {
  const s = createStudio(opts);
  const game = await s.gameInfo();
  const rooms: Record<string, RoomData> = {};
  for (const r of game.rooms) rooms[r.id] = await s.getRoom(r.id);
  const docs: Record<string, string> = {};
  const guide = join(s.root, 'docs', 'en', 'CONTENT_GUIDE.md');
  if (existsSync(guide)) docs.CONTENT_GUIDE = readFileSync(guide, 'utf8');
  return {
    format: 'web-scumm-studio-snapshot',
    version: 1,
    created: new Date().toISOString(),
    // JSON round-trip: functions and undefined fields dropped, like the dev server's responses.
    game: JSON.parse(JSON.stringify(game)),
    rooms: JSON.parse(JSON.stringify(rooms)),
    storyboard: s.getStoryboard(),
    notes: s.getNotes(),
    docs,
    // The Assets tab's listing (no file data: the demo shows the prepared images and sounds of public/assets).
    assets: await createAssets(s).list(),
  };
}

export async function writeSnapshot(file = SNAPSHOT_FILE, opts: StudioOptions = {}): Promise<StudioSnapshot> {
  const snap = await buildSnapshot(opts);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(snap));
  return snap;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const out = resolve(process.argv[2] ?? SNAPSHOT_FILE);
  writeSnapshot(out).then(
    (s) => {
      console.log(
        `✔ Studio snapshot of "${s.game.id}": ${Object.keys(s.rooms).length} rooms, ${s.notes.entries.length} notes → ${out}`,
      );
    },
    (e) => {
      console.error(`✘ ${(e as Error).message}`);
      process.exit(1);
    },
  );
}
