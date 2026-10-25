// The current game: GAME environment variable, otherwise the game `.cache/game` links to (`npm run game`,
// `npm run new-game`; 4.1.6), otherwise package.json → "config": { "game": … }, otherwise "demo".
// Used by vite.config.ts, the tools (validate, solve, refs) and tools/select-game.ts.
import { readFileSync, readlinkSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { GameDef, Layout } from '../src/engine/core/types.ts';
import type { Minigame } from '../src/engine/minigames/types.ts';
import type { CustomCommands } from '../src/engine/core/custom.ts';

// import.meta.url (not import.meta.dirname): vite.config.ts bundles this file and only rewrites import.meta.url.
export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export function gameId(): string {
  const env = process.env.GAME?.trim();
  if (env) return env;
  try {
    const linked = basename(readlinkSync(resolve(ROOT, '.cache', 'game')));
    if (linked) return linked;
  } catch {
    /* no link: nothing selected since the checkout */
  }
  try {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    if (typeof pkg.config?.game === 'string' && pkg.config.game) return pkg.config.game;
  } catch {
    /* no readable package.json */
  }
  return 'demo';
}

/**
 * A game project outside this repository (3.9, the `quest-n-click` command, WEB_SCUMM_PROJECT): its folder holds game/
 * (the game's sources), public/, dist/ and .cache/; the engine (ROOT) is the installed package and is never written.
 */
export const PROJECT = process.env.WEB_SCUMM_PROJECT?.trim() ? resolve(process.env.WEB_SCUMM_PROJECT.trim()) : null;
/** Where public/, dist/ and .cache/ are: the project's folder, else this repository. */
export const WORK = PROJECT ?? ROOT;
function projectName(): string {
  try {
    const p = JSON.parse(readFileSync(resolve(PROJECT!, 'package.json'), 'utf8'));
    return String(p.config?.game ?? p.name ?? basename(PROJECT!)).replace(/^@.*\//, '');
  } catch {
    return basename(PROJECT!);
  }
}

// GAME_DIR (environment) points the tools at a game folder outside games/, e.g. tests/fixture.
const DIR_ENV = process.env.GAME_DIR?.trim();
export const GAME =
  PROJECT && !process.env.GAME?.trim()
    ? projectName()
    : DIR_ENV && !process.env.GAME?.trim()
      ? basename(resolve(DIR_ENV))
      : gameId();
export const GAME_DIR = DIR_ENV ? resolve(DIR_ENV) : PROJECT ? resolve(PROJECT, 'game') : resolve(ROOT, 'games', GAME);
/** The built assets that ship (`npm run assets` writes them): public/assets, or ASSETS_DIR (a test fixture's own files). */
export const ASSETS_DIR = process.env.ASSETS_DIR?.trim()
  ? resolve(process.env.ASSETS_DIR.trim())
  : resolve(WORK, 'public', 'assets');

/** What games/<id>/index.ts exports. Outside Vite, `layouts` is empty: the tools read layout/*.json from disk. */
export interface GameModule {
  game: GameDef;
  layouts: Record<string, Layout>;
  manifest: unknown;
  /** Minigames specific to the game (same interface as the engine's own). */
  minigames?: Record<string, Minigame>;
  /** Images to prepare even if no content references them (npm run assets). */
  extraImages?: string[];
  /** Custom commands (`{ custom }`), see src/engine/core/custom.ts. */
  commands?: CustomCommands;
  /** Translations: language → (text path → text), from locales/<lang>.json (tools/i18n.ts). */
  locales?: Record<string, Record<string, string>>;
}

/** Loads games/<GAME>/index.ts. */
export async function loadGameModule(): Promise<GameModule> {
  return import(pathToFileURL(resolve(GAME_DIR, 'index.ts')).href);
}
