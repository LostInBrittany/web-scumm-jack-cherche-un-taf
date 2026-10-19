// A revision's preview (4.2.2 PR 2, plan §2.2, D42): `vite build` of the game in `dir`, under the base
// `/preview/<rev>/`, with the editing tools in (`VITE_STUDIO_PREVIEW`), no service worker, and no public files: the
// prepared images, sounds and fonts are the same for every revision, and the game's origin serves them from the
// Studio's own folder. What comes out is the page, its code and the game's site.json, as bytes by path; the Studio
// stores them by content (studio-server/src/server/previews.ts). Run in the worker's child (child.ts), where the
// game's code runs, or in a child of the loopback server: never in the Studio's own process. With `play` (4.2.2 PR 5),
// the same build is a published one: base `/play/<n>/`, the player's game (no editing tools, no Studio origin).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PreviewParams {
  /** The revision: the build's base is `/preview/<rev>/`. */
  rev: number;
  /** The game's id (`__GAME__`: its saves' and its settings' names). */
  game: string;
  /** The Studio's origin: the only one the editor posts to. */
  studioOrigin: string;
  /** The prepared assets' version (`__ASSETS_VERSION__`), computed by the Studio, which holds them. */
  assetsVersion: string;
  /** A published build's number (4.2.2 PR 5): base `/play/<n>/`, the player's game. */
  play?: number;
}

/**
 * The game's own build failed (its code does not compile, it does not load): recorded with its revision, never built
 * again. Anything else (the worker unreachable or busy, a timeout, the store) is another error, and is tried again.
 */
export class PreviewBuildFailed extends Error {
  override name = 'PreviewBuildFailed';
}

/** The checks a job's parameters pass before a build: the worker builds nothing a job did not name exactly. */
export function previewParams(p: Record<string, unknown>): PreviewParams {
  const { rev, game, studioOrigin, assetsVersion, play } = p;
  if (play !== undefined && (!Number.isSafeInteger(play) || (play as number) < 1))
    throw new Error('preview: play is a build number');
  if (!Number.isSafeInteger(rev) || (rev as number) < 0) throw new Error('preview: rev is a revision');
  if (typeof game !== 'string' || !/^[\w-]{1,64}$/.test(game)) throw new Error('preview: game is a game id');
  if (typeof studioOrigin !== 'string' || new URL(studioOrigin).origin !== studioOrigin)
    throw new Error('preview: studioOrigin is an origin');
  if (typeof assetsVersion !== 'string' || !/^[0-9a-f]{1,64}$/.test(assetsVersion))
    throw new Error('preview: assetsVersion is a hex digest');
  return {
    rev: rev as number,
    game,
    studioOrigin,
    assetsVersion,
    ...(play !== undefined ? { play: play as number } : {}),
  };
}

/** A preview's files as the child wrote them, or undefined: at most 2,000, each a plain relative path and base64. */
export function previewFiles(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length || entries.length > 2_000) return undefined;
  for (const [k, b] of entries)
    if (
      !PREVIEW_PATH.test(k) ||
      k.split('/').some((s) => /^\.+$/.test(s)) ||
      typeof b !== 'string' ||
      !/^[A-Za-z0-9+/]*=*$/.test(b)
    )
      return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}
const PREVIEW_PATH = /^[\w.-]+(?:\/[\w.-]+){0,4}$/;

const ENGINE = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * What built a published build, as the worker knows it: its engine's version, its commit (the checkout's HEAD, when the
 * engine is a Git checkout; else "unknown"), and the sha256 of its lockfile.
 */
function builtBy(engine: string): { engine: string; commit: string; lockfile: string } {
  const read = (f: string) => {
    try {
      return readFileSync(resolve(ENGINE, f), 'utf8');
    } catch {
      return '';
    }
  };
  let commit = read('.git/HEAD').trim();
  const ref = /^ref: (.+)$/.exec(commit)?.[1];
  if (ref) commit = read(`.git/${ref}`).trim();
  const lock = read('package-lock.json');
  return {
    engine,
    commit: /^[0-9a-f]{40}$/.test(commit) ? commit : 'unknown',
    lockfile: lock ? createHash('sha256').update(lock).digest('hex') : 'unknown',
  };
}

/** The built files, by their path under the base (`index.html`, `assets/index-<hash>.js`, `site.json`). */
export async function buildPreview(dir: string, p: PreviewParams, cacheDir: string): Promise<Map<string, Buffer>> {
  const published = p.play !== undefined;
  const base = published ? `/play/${p.play}/` : `/preview/${p.rev}/`;
  // sitePlugin's manifest reads the base from the environment, once, when its module loads.
  process.env.BASE_PATH = base;
  const { build } = await import('vite');
  const { sitePlugin } = await import('../../../tools/vite/plugins');
  const { engineVersion, trustedExtensionsHash } = await import('../../../tools/extensions');
  const r = (f: string) => resolve(ENGINE, f);
  const gameDir = resolve(dir);
  let site: Record<string, unknown> = {};
  try {
    site = JSON.parse(readFileSync(resolve(gameDir, 'site.json'), 'utf8'));
  } catch {
    /* no site.json: the fingerprint's parts alone */
  }
  const out = await build({
    configFile: false,
    root: ENGINE,
    base,
    publicDir: false,
    cacheDir,
    logLevel: 'warn',
    clearScreen: false,
    define: {
      __ASSETS_VERSION__: JSON.stringify(p.assetsVersion),
      __GAME__: JSON.stringify(p.game),
      __TRUSTED_EXTENSIONS__: JSON.stringify(trustedExtensionsHash(gameDir)),
      __ENGINE_VERSION__: JSON.stringify(engineVersion()),
      // The editing tools in a preview only: a published build is the player's game.
      'import.meta.env.VITE_STUDIO_PREVIEW': JSON.stringify(published ? '0' : '1'),
    },
    plugins: [
      sitePlugin({ gameDir, game: p.game }),
      {
        name: 'studio-preview',
        // No service worker: a preview is replaced by the next one, never installed.
        resolveId: (id) => (id === 'virtual:pwa-register' ? '\0studio-no-sw' : undefined),
        load: (id) =>
          id === '\0studio-no-sw' ? 'export function registerSW() { return () => Promise.resolve(); }' : undefined,
        transformIndexHtml: () =>
          published
            ? []
            : [{ tag: 'meta', attrs: { name: 'web-scumm-studio-origin', content: p.studioOrigin }, injectTo: 'head' }],
        // The fingerprint's parts the player cannot compute from the content (ADR 0013), as sealBuild writes them;
        // and, for a published build, what built it: the worker's own engine, commit and lockfile (`build.json`).
        generateBundle() {
          if (published)
            this.emitFile({
              type: 'asset',
              fileName: 'build.json',
              source: `${JSON.stringify(builtBy(engineVersion()))}\n`,
            });
          this.emitFile({
            type: 'asset',
            fileName: 'site.json',
            source: `${JSON.stringify({ ...site, trustedExtensions: trustedExtensionsHash(gameDir), engine: engineVersion() }, null, 2)}\n`,
          });
        },
      },
    ],
    resolve: {
      alias: [
        { find: /^web-scumm\/(content|player|minigames|testing)$/, replacement: r('./src/engine/api/$1.ts') },
        { find: '@engine', replacement: r('./src/engine') },
        { find: /^@game$/, replacement: resolve(gameDir, 'index.ts') },
        { find: /^@game\//, replacement: `${gameDir}/` },
      ],
    },
    build: {
      target: 'es2020',
      assetsInlineLimit: 0,
      write: false,
      reportCompressedSize: false,
      rolldownOptions: { input: { index: r('./index.html') } },
    },
  });
  const files = new Map<string, Buffer>();
  for (const o of [out].flat()) {
    if (!('output' in o)) throw new Error('preview: the build did not return its files');
    for (const f of o.output)
      files.set(f.fileName, Buffer.from(f.type === 'chunk' ? f.code : (f.source as string | Uint8Array)));
  }
  if (!files.has('index.html')) throw new Error('preview: the build has no page');
  return files;
}
