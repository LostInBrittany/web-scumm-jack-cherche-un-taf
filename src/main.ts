// The sample game's entry: everything is in `bootGame` (src/engine/boot.ts); this file only says what is specific
// to this build: the game module, the Studio demo's patches, the dev tools' switch, the PWA module.
import { bootGame } from '@engine/boot';
import * as mod from '@game';
import type { GameModule } from '../tools/game';
import type { AssetManifest } from '@engine/dom/assets';
// The service worker's register module, in the main chunk (4.1.15): as its own lazy chunk, Firefox failed to load it
// once the update scenarios had replaced the build (`npm run e2e:pwa`, pwa-firefox); it weighs well under 1 KB.
import { registerSW } from 'virtual:pwa-register';

const { game, layouts, manifest, minigames, commands, locales } = mod as unknown as GameModule;
const demo = import.meta.env.VITE_STUDIO_DEMO === '1';
// A revision's preview on a hosted Studio's game origin (4.2.2, studio-server/src/worker/preview-build.ts).
const preview = import.meta.env.VITE_STUDIO_PREVIEW === '1';
const previewRevision = (base: string) => {
  const rev = Number(/^\/preview\/(\d+)\/$/.exec(base)?.[1] ?? Number.NaN);
  // Stay opens the save's revision on its title screen: without the dev tools, which would start a new game there.
  const url = (r: number) => {
    const q = new URLSearchParams(location.search);
    for (const k of ['dev', 'edit', 'at']) q.delete(k);
    return `/preview/${r}/${q.size ? `?${q}` : ''}`;
  };
  return Number.isSafeInteger(rev) ? { rev, url } : undefined;
};

void bootGame({
  game,
  layouts,
  manifest: manifest as AssetManifest,
  minigames,
  commands,
  locales,
  version: __ASSETS_VERSION__,
  build: { trustedExtensions: __TRUSTED_EXTENSIONS__, engine: __ENGINE_VERSION__ },
  // A preview's revision, from its base (`/preview/<rev>/`): saves say where they were made (ADR 0026).
  revision: preview ? previewRevision(import.meta.env.BASE_URL) : undefined,
  dev: {
    // The dev tools (?dev, ?edit=<room>): on the dev server, in a Studio demo build (docs/en/STUDIO.md, "Demo
    // mode") and in a hosted Studio's previews. Without these query params, the player's game is the same in every
    // build.
    enabled: (q) => (import.meta.env.DEV || demo || preview) && (q.has('dev') || q.has('edit')),
    // The Studio demo's edits (kept in this browser) on top of the compiled game, and a memory store so the edited
    // game never touches the player's saved game (same origin as the game on a static host).
    patch: demo
      ? async (g, L) => {
          const { MemoryStore } = await import('@engine/core/ports');
          const { patchGame, readPatches } = await import('./studio/demo-patch');
          let ls: Storage | undefined;
          try {
            ls = localStorage;
          } catch {
            /* storage blocked */
          }
          return { ...patchGame(g, L, readPatches(ls, __GAME__)), store: new MemoryStore() };
        }
      : undefined,
    options: {
      // No dev server (a Studio demo build): a saved layout joins the demo's edits in this browser.
      saveOffline: async (room, layout) => {
        const { readPatches, writePatches } = await import('./studio/demo-patch');
        let store: Storage | undefined;
        try {
          store = localStorage;
        } catch {
          /* blocked */
        }
        const patches = readPatches(store, __GAME__).filter((p) => !(p.kind === 'layout' && p.room === room));
        writePatches(store, __GAME__, [...patches, { kind: 'layout', room, layout }]);
      },
    },
  },
  sw: { register: async () => ({ registerSW }) },
});
