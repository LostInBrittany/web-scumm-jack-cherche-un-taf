// The Studio demo's snapshot (wiki/en/studio.demo-mode.md): everything the Studio reads from the dev server, for
// the current game, in one JSON file served next to the built Studio (public/studio-demo/snapshot.json). Written by
// `STUDIO=1 vite build` (vite.config.ts) and by `npm run studio-snapshot`.
//   tsx tools/studio/snapshot.ts [out.json]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAssets } from './assets';
import { createStudio, type StudioOptions } from '../../studio-server/src/ops/core';
import type { RoomData, StudioSnapshot } from './types';
import { ROOT } from '../game';
import { BUNDLE_DIR, legacyDoc, legacyOfSet, repositoryDocs, resolveDocs } from '../wiki/docs-load';

export const SNAPSHOT_FILE = join(ROOT, 'public', 'studio-demo', 'snapshot.json');

/** The snapshot of a game folder (default: the current game). */
export async function buildSnapshot(opts: StudioOptions = {}): Promise<StudioSnapshot> {
  const s = createStudio(opts);
  const game = await s.gameInfo();
  const rooms: Record<string, RoomData> = {};
  for (const r of game.rooms) rooms[r.id] = await s.getRoom(r.id);
  // 4.5.0 (docs/dev/PLAN-4.5-WIKI.md §4.3.1): the wiki's index and its ready pages, for the Assistant's search_docs,
  // list_docs and read_doc by id: a package's bundle, or the repository's ready pages (never a draft).
  const bundled = existsSync(join(s.root, BUNDLE_DIR, 'bundle-manifest.json'));
  const wiki = bundled
    ? resolveDocs(s.root)
    : existsSync(join(s.root, 'wiki', 'manifest.json'))
      ? repositoryDocs(s.root, {
          states: ['ready'],
          label: "demo snapshot: the ready pages of the repository's wiki/ when the demo was built",
        })
      : undefined;
  // The content guide as read_doc {name: "CONTENT_GUIDE"} reads it: the bundle's legacy page in a package, the same
  // concatenation of the embedded ready pages in the repository (§4.3.2). Neither: the demo's Assistant says the page
  // is not in the demo.
  const docs: Record<string, string> = {};
  try {
    if (bundled) docs.CONTENT_GUIDE = legacyDoc(s.root, 'CONTENT_GUIDE');
    else if (wiki) docs.CONTENT_GUIDE = legacyOfSet(wiki, 'CONTENT_GUIDE');
  } catch {
    // A bundle without its legacy page: left out, as above.
  }
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
    ...(wiki ? { wiki } : {}),
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
