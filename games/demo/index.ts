// What the engine and the tools load for this game.
import type { Layout } from '@engine/core/types';
import type { AssetManifest } from '@engine/dom/assets';
import type { Minigame } from '@engine/minigames';
import type { CustomCommands } from '@engine/core/custom';
import { game } from './game';
import manifestJson from './assets.gen.json';

export { game };

// One JSON per room (placement editor: ?edit=<room>). Outside Vite, the tools read layout/*.json themselves.
export const layouts: Record<string, Layout> = {};
if (import.meta.env) {
  for (const [path, mod] of Object.entries(import.meta.glob('./layout/*.json', { eager: true, import: 'default' }))) {
    layouts[path.split('/').pop()!.replace('.json', '')] = mod as Layout;
  }
}

export const manifest = manifestJson as unknown as AssetManifest;

/** Minigames specific to this game (none: the demo uses the engine's pipes, pick and scratch). */
export const minigames: Record<string, Minigame> = {};

/** Translations (locales/<lang>.json, written by `npm run i18n -- extract --lang <xx>`): language → path → text. */
export const locales: Record<string, Record<string, string>> = {};
if (import.meta.env) {
  for (const [path, mod] of Object.entries(import.meta.glob('./locales/*.json', { eager: true, import: 'default' }))) {
    locales[path.split('/').pop()!.replace('.json', '')] = mod as Record<string, string>;
  }
}

/** Images to prepare even when no content references them. */
export const extraImages: string[] = [];

/**
 * Custom commands (src/engine/core/custom.ts): the escape hatch. `sparkle` draws a few twinkling stars over the scene
 * for a moment; it changes nothing in the state (`pure`), so the solver can ignore it. `{ custom: 'sparkle', args: { ms: 1200 } }`.
 */
export const commands: CustomCommands = {
  sparkle: {
    pure: true,
    run: async ({ scene, args, fast }) => {
      if (!scene || fast) return;
      const ms = typeof args === 'object' && args && typeof (args as { ms?: unknown }).ms === 'number' ? (args as { ms: number }).ms : 1000;
      const layer = document.createElement('div');
      Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '40' });
      for (let i = 0; i < 14; i++) {
        const star = document.createElement('div');
        Object.assign(star.style, { position: 'absolute', left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 70}%`, width: '6px', height: '6px', borderRadius: '50%', background: '#ffe9a0', boxShadow: '0 0 10px 3px #ffd640', opacity: '0' });
        star.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.3)' }, { opacity: 0, transform: 'scale(.3)' }], { duration: 500 + Math.random() * 500, delay: Math.random() * ms * 0.6, iterations: 1 });
        layer.append(star);
      }
      scene.append(layer);
      await new Promise((r) => setTimeout(r, ms));
      layer.remove();
    },
  },
};
