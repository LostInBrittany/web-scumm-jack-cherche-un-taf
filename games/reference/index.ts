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

/** Minigames specific to this game (none: the chapter uses the engine's cables). */
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

/** No custom command: the chapter is written in the DSL alone. */
export const commands: CustomCommands = {};
