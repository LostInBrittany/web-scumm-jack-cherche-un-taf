// The engine's Vite plugins (4.1.6: out of vite.config.ts, which kept 412 lines of them): the placement editor's
// layout writer, the Studio's demo snapshot, the sealed build, the assets' version, the game's site.json.
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { GAME, GAME_DIR, PROJECT, WORK } from '../game.ts';
import { engineVersion, trustedExtensionsHash } from '../extensions.ts';

/** A path next to the engine's pages (index.html, studio.html), wherever it is installed. */
const r = (p: string) => fileURLToPath(new URL('../../' + p.replace(/^\.\//, ''), import.meta.url));

/** tsx's command line, wherever npm put it (this repository, or a game project that installed the engine). */
const tsxCli = () => createRequire(r('./package.json')).resolve('tsx/cli');
/** The tsconfig the tools run with: the project's (its `@engine` paths point into the package), else this repository's. */
const tsconfig = () =>
  PROJECT && existsSync(resolve(PROJECT, 'tsconfig.json')) ? resolve(PROJECT, 'tsconfig.json') : r('./tsconfig.json');

/** Deploy under a sub-path (GitHub Pages: /<repo>/) with BASE_PATH=/<repo>/ ; default '/'. */
export const BASE = process.env.BASE_PATH ?? '/';

// The placement editor (?edit=<room>) saves through the Studio's API since 4.2.1 (PUT /__studio/api/room/<id>/layout,
// one guarded operation of the game's journal): the dev server has no route of its own that writes a game file.

/**
 * @deprecated 4.2.1: the placement editor saves through the Studio's API; this plugin does nothing any more. Kept so a
 * configuration that names it still loads (D40: no public name removed in 4.2.x).
 * @public
 */
export function layoutWriter(): Plugin {
  return { name: 'layout-writer', apply: 'serve' };
}

/**
 * Builds with STUDIO=1: the Studio page enters the build (see `build.rolldownOptions.input`) with its demo snapshot,
 * public/studio-demo/snapshot.json, regenerated from the game first (copied to dist/ with the public files).
 * Without STUDIO=1: neither the page nor a snapshot left in public/ by an earlier build reach dist/.
 */
export function studioDemo(): Plugin {
  let outDir = 'dist';
  return {
    name: 'studio-demo',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    async buildStart() {
      if (process.env.STUDIO !== '1') return;
      // In a process of its own (4.1.19): the snapshot runs the Studio and the engine, which the configuration's import
      // graph does not hold.
      const tsx = createRequire(import.meta.url).resolve('tsx/cli');
      execFileSync(process.execPath, [tsx, fileURLToPath(new URL('../studio/snapshot.ts', import.meta.url))], {
        stdio: ['ignore', 'ignore', 'inherit'],
      });
      const s = JSON.parse(
        readFileSync(
          resolve(fileURLToPath(new URL('../..', import.meta.url)), 'public', 'studio-demo', 'snapshot.json'),
          'utf8',
        ),
      ) as { rooms: object; game: { id: string } };
      this.info(`Studio snapshot: ${Object.keys(s.rooms).length} rooms of "${s.game.id}"`);
    },
    closeBundle() {
      if (process.env.STUDIO !== '1') rmSync(join(outDir, 'studio-demo'), { recursive: true, force: true });
    },
  };
}

/**
 * After every build (3.7.1): dist/ holds this game's files only, with their notices. public/ is shared by the games of
 * the repository, so Vite copies the other games' assets too: `tools/dist.ts seal` removes them and writes
 * dist/licenses/ (the engine and asset licences, the credits, the notices of the packages the bundle took code from,
 * listed here from the chunks' modules, and the assets manifest). `npm run verify:dist` then checks every file.
 * It also writes `site.json` (4.1.12, ADR 0013): the game's `site.json` with the build's `trustedExtensions` (the hash of
 * the game's code beside its content, `tools/extensions.ts`) and the engine's version, the two parts of the game's
 * fingerprint a player's copy cannot compute from the content; the player receives the same values as
 * `__TRUSTED_EXTENSIONS__` and `__ENGINE_VERSION__` (vite.config.ts).
 */
export function sealBuild(): Plugin {
  let outDir = 'dist';
  const packages = new Set<string>();
  return {
    name: 'seal-build',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    generateBundle(_o, bundle) {
      let site: Record<string, unknown> = {};
      try {
        site = JSON.parse(readFileSync(resolve(GAME_DIR, 'site.json'), 'utf8'));
      } catch {
        /* no site.json: the fingerprint's parts alone */
      }
      this.emitFile({
        type: 'asset',
        fileName: 'site.json',
        source: `${JSON.stringify({ ...site, trustedExtensions: trustedExtensionsHash(GAME_DIR), engine: engineVersion() }, null, 2)}\n`,
      });
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of chunk.moduleIds) {
          const m = id
            .split('\\')
            .join('/')
            .match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
          const last = m?.at(-1);
          if (last) packages.add(last.slice('/node_modules/'.length, -1));
        }
      }
    },
    closeBundle() {
      mkdirSync(resolve(WORK, '.cache'), { recursive: true });
      writeFileSync(resolve(WORK, '.cache', `bundle-packages-${GAME}.json`), JSON.stringify([...packages].sort()));
      execFileSync(process.execPath, [tsxCli(), '--tsconfig', tsconfig(), r('./tools/dist.ts'), 'seal', outDir], {
        stdio: 'inherit',
      });
    },
  };
}

/**
 * Version of images and sounds: a fingerprint of public/assets' content (stable across deploys, changes if a file
 * changes). `dir`: another assets folder (the Studio Server's previews, 4.2.2).
 */
export function assetsVersion(dir = resolve(WORK, 'public', 'assets')): string {
  const h = createHash('sha1');
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        h.update(e.name);
        h.update(readFileSync(p));
      }
    }
  };
  try {
    walk(dir);
  } catch {
    /* no assets yet */
  }
  return h.digest('hex').slice(0, 10);
}

/**
 * site.json's `url`, the game's public address, normalised by the URL parser and with its final slash; none when it is
 * not an absolute http(s) URL, or when it carries a query, a fragment or credentials (`<url>og.png` would not be the
 * image's address, or would publish a password).
 */
function siteUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return undefined;
  }
  if (!/^https?:$/.test(u.protocol) || u.search || u.hash || u.username || u.password) return undefined;
  return u.href.endsWith('/') ? u.href : `${u.href}/`;
}

/**
 * games/<id>/site.json: game title, description and color, injected into index.html and the PWA manifest. With `url`
 * (the game's public address, #271), the share image is absolute and the page gets its og:url: link previews need
 * both. `o`: another game folder and name (the Studio Server's previews, built by its worker, 4.2.2).
 */
export function sitePlugin(o: { gameDir?: string; game?: string } = {}): Plugin {
  const gameDir = o.gameDir ?? GAME_DIR;
  const name = o.game ?? GAME;
  const site = () => {
    try {
      return JSON.parse(readFileSync(resolve(gameDir, 'site.json'), 'utf8'));
    } catch {
      return {};
    }
  };
  const manifest = () => {
    const s = site();
    return JSON.stringify(
      {
        name: s.title ?? name,
        short_name: s.shortName ?? s.title ?? name,
        description: s.description ?? '',
        start_url: BASE,
        display: 'standalone',
        orientation: 'landscape',
        background_color: s.themeColor ?? '#0a0a12',
        theme_color: s.themeColor ?? '#0a0a12',
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
        ],
      },
      null,
      2,
    );
  };
  return {
    name: 'site',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const s = site();
        const esc = (v: unknown) =>
          String(v ?? '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
        const url = siteUrl(s.url);
        // Function replacers: a `$&` or `$'` in a site.json value is text, not a replacement pattern.
        const page = url
          ? html
              .replace('content="%BASE%og.png"', () => `content="${esc(url)}og.png"`)
              .replace(
                '<meta property="og:type"',
                () => `<meta property="og:url" content="${esc(url)}" />\n    <meta property="og:type"`,
              )
          : html;
        return page
          .replace(/%LANG%/g, () => esc(s.lang ?? 'en'))
          .replace(/%TITLE%/g, () => esc(s.title ?? name))
          .replace(/%DESCRIPTION%/g, () => esc(s.description))
          .replace(/%THEME%/g, () => esc(s.themeColor ?? '#0a0a12'))
          .replace(/%BASE%/g, () => BASE);
      },
    },
    configureServer(server) {
      server.middlewares.use('/manifest.webmanifest', (_req, res) => {
        res.setHeader('content-type', 'application/manifest+json');
        res.end(manifest());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
    },
  };
}
