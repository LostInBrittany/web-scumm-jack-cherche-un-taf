// What the engine and the tools load for this game. Keep this file as is.
import type { Layout } from 'web-scumm/content';
import type { AssetManifest } from 'web-scumm/player';
import type { Minigame } from 'web-scumm/minigames';
import type { CustomCommands } from 'web-scumm/content';
import { game } from './game';
import manifestJson from './assets.gen.json';

export { game };

// One JSON per room, written by the placement editor (?edit=<room>). Outside Vite, the tools read layout/*.json themselves.
export const layouts: Record<string, Layout> = {};
if (import.meta.env) {
  for (const [path, mod] of Object.entries(import.meta.glob('./layout/*.json', { eager: true, import: 'default' }))) {
    layouts[path.split('/').pop()!.replace('.json', '')] = mod as Layout;
  }
}

export const manifest = manifestJson as unknown as AssetManifest;

/** Minigames specific to this game (same interface as the engine's). */
export const minigames: Record<string, Minigame> = {};

/** Translations (locales/<lang>.json, written by `npm run i18n -- extract --lang <xx>`): language → path → text. */
export const locales: Record<string, Record<string, string>> = {};
if (import.meta.env) {
  for (const [path, mod] of Object.entries(import.meta.glob('./locales/*.json', { eager: true, import: 'default' }))) {
    locales[path.split('/').pop()!.replace('.json', '')] = mod as Record<string, string>;
  }
}

/** Images to prepare even when no content references them (full minigame sheets, spare poses). */
export const extraImages: string[] = [];

/**
 * Custom commands: when the DSL is not enough (docs/en/CONTENT_GUIDE.md, "When the DSL is not enough"). Declare the
 * state changes as `effects` (the solver and the save rely on them); `run` is the visual part, browser only.
 * Example:  flash: { pure: true, run: ({ scene }) => { … } }   then   { custom: 'flash', args: { ms: 300 } }
 */
export const commands: CustomCommands = {};
