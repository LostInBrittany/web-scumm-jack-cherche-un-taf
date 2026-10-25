// The semantic diff's captures (4.4.0): each room the diff names (tools/studio/diff-rooms.ts), rendered at both
// revisions, to see a placement, a font or an overflow that moved. A revision's game is the folder on disk with the
// journal's operations after it undone (their "before"), packed as the worker's snapshot is; it is built as a hosted
// Studio's preview is (preview-build.ts, in the worker's child: the game's code never runs in this process), and the
// page is served to a headless Chromium from memory (no server, no port): the build's files, else the prepared
// assets of `public/`, the same for both sides. Deterministic as far as one page goes: a fixed viewport (960 × 600, one
// device pixel), reduced motion, no CSS animation or transition, the fonts loaded, the editor's overlays hidden.
// Local only: a hosted Studio has no browser beside its worker (said by `core.diffCaptures`).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { CapturedRoom } from '../../../tools/studio/diff-rooms';
import type { DiffCaptures, DiffShot } from '../../../tools/studio/types';
import { ABSENT } from './durable';
import type { Journal } from './journal';
import { packable, packFiles, packSnapshot, snapshotTexts } from '../worker/snapshot';

/** The origin the pages are served from: never reached (every request is answered from memory), a secure context. */
const ORIGIN = 'http://localhost:9';
const VIEWPORT = { width: 960, height: 600 };
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

/**
 * A revision's snapshot: the folder's sources and data with every operation after `rev` undone, newest first. A
 * content the journal did not keep (a local journal's adopted files) cannot be put back: said, no snapshot.
 */
export async function snapshotAt(j: Journal, gameDir: string, rev: number): Promise<Buffer> {
  const head = await j.revision();
  if (head - rev > 2_000) throw new Error(`more than 2,000 revisions after r${rev}`);
  const texts = snapshotTexts(packSnapshot(gameDir));
  for (let r = head; r > rev; r--)
    for (const e of await j.effectsAt(r)) {
      if (!packable(e.path)) continue;
      if (e.before === ABSENT) {
        texts.delete(e.path);
        continue;
      }
      const bytes = await j.blob(e.before).catch(() => null);
      if (!bytes) throw new Error(`the journal did not keep ${e.path} as it was before r${r}`);
      texts.set(e.path, bytes.toString('utf8'));
    }
  return packFiles([...texts].map(([path, text]) => ({ path, bytes: Buffer.from(text, 'utf8') })));
}

interface CaptureOptions {
  journal: Journal;
  gameDir: string;
  /** The game's id (its saves' names in the page). */
  game: string;
  /** The prepared files a page loads beside its code (`public/`), and the prepared assets (`public/assets/`). */
  publicDir: string;
  assetsDir: string;
  /** Where the PNGs are written; `rel` says a file relative to the repository. */
  outDir: string;
  rel: (file: string) => string;
  /** A revision's build: the worker's child on this machine (`localPreview`), a stub in the tests. */
  build: (snapshot: Buffer, rev: number) => Promise<Map<string, Buffer>>;
}

/** A file under `dir` by a path of the page, or null (outside it, absent). */
function readUnder(dir: string, path: string): Buffer | null {
  const f = resolve(dir, normalize(path));
  if (f !== dir && !f.startsWith(dir + sep)) return null;
  try {
    return readFileSync(f);
  } catch {
    return null;
  }
}

/** Each room rendered at `from` and at `to`, side by side. */
export async function captureDiff(
  o: CaptureOptions,
  from: number,
  to: number,
  rooms: CapturedRoom[],
  cut?: true,
): Promise<DiffCaptures> {
  const t0 = Date.now();
  if (!rooms.length) return { from, to, size: [VIEWPORT.width, VIEWPORT.height], rooms: [], ms: 0 };
  let pw: typeof import('playwright');
  try {
    pw = await import('playwright');
  } catch {
    return {
      unavailable: true,
      reason: 'Playwright is not installed (npm i -D playwright && npx playwright install chromium)',
    };
  }
  // Both builds first: a side that does not build is said for each room, the other side still shown.
  const builds = new Map<number, Map<string, Buffer> | string>();
  for (const rev of new Set([from, to]))
    try {
      builds.set(rev, await o.build(await snapshotAt(o.journal, o.gameDir, rev), rev));
    } catch (e) {
      builds.set(rev, `r${rev} does not build: ${(e as Error).message.split('\n')[0]}`);
    }
  let browser: Awaited<ReturnType<typeof pw.chromium.launch>>;
  try {
    browser = await pw.chromium.launch();
  } catch (e) {
    return { unavailable: true, reason: `Chromium does not start: ${(e as Error).message.split('\n')[0]}` };
  }
  mkdirSync(o.outDir, { recursive: true });
  const shots = new Map<string, Buffer | string>();
  const boxes = new Map<string, Box | null>();
  try {
    for (const rev of new Set([from, to])) {
      const files = builds.get(rev)!;
      for (const { room } of rooms) {
        const key = `${rev}:${room}`;
        if (typeof files === 'string') shots.set(key, files);
        else shots.set(key, await shoot(browser, o, rev, files, room).catch((e: Error) => e.message.split('\n')[0]!));
      }
    }
    for (const { room } of rooms) {
      const a = shots.get(`${from}:${room}`);
      const b = shots.get(`${to}:${room}`);
      if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) boxes.set(room, await changedBox(browser, a, b));
    }
  } finally {
    await browser.close();
  }
  const side = (rev: number, room: string): DiffShot => {
    const s = shots.get(`${rev}:${room}`)!;
    if (typeof s === 'string') return { missing: s };
    const file = join(o.outDir, `${room}-r${rev}.png`);
    writeFileSync(file, s);
    return { file: o.rel(file), url: `data:image/png;base64,${s.toString('base64')}` };
  };
  return {
    from,
    to,
    size: [VIEWPORT.width, VIEWPORT.height],
    rooms: rooms.map(({ room, why }) => {
      const box = boxes.get(room);
      return {
        room,
        why,
        before: side(from, room),
        after: side(to, room),
        ...(box ? { box } : box === null ? { same: true as const } : {}),
      };
    }),
    ...(cut ? { cut } : {}),
    ms: Date.now() - t0,
  };
}

type Box = [number, number, number, number];
/**
 * Below this difference in every channel a pixel is the same: two renders of one page differ by a unit or two on an
 * anti-aliased edge (measured: 2 on a rounded corner), never by a moved or recoloured figure.
 */
const TOLERANCE = 16;

/** The rectangle where two captures differ ([x, y, width, height]), or null: compared in the browser that drew them. */
async function changedBox(browser: import('playwright').Browser, a: Buffer, b: Buffer): Promise<Box | null> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ([a, b, tol]) => {
        const pixels = async (b64: string) => {
          const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const g = c.getContext('2d')!;
          g.drawImage(bmp, 0, 0);
          return g.getImageData(0, 0, bmp.width, bmp.height);
        };
        const [x, y] = [await pixels(a), await pixels(b)];
        const w = Math.max(x.width, y.width);
        const h = Math.max(x.height, y.height);
        if (x.width !== y.width || x.height !== y.height) return [0, 0, w, h] as [number, number, number, number];
        let [x0, y0, x1, y1] = [w, h, -1, -1];
        for (let i = 0; i < x.data.length; i += 4)
          if (
            Math.abs(x.data[i]! - y.data[i]!) > tol ||
            Math.abs(x.data[i + 1]! - y.data[i + 1]!) > tol ||
            Math.abs(x.data[i + 2]! - y.data[i + 2]!) > tol
          ) {
            const px = (i / 4) % w;
            const py = Math.floor(i / 4 / w);
            x0 = Math.min(x0, px);
            y0 = Math.min(y0, py);
            x1 = Math.max(x1, px);
            y1 = Math.max(y1, py);
          }
        return x1 < 0 ? null : ([x0, y0, x1 - x0 + 1, y1 - y0 + 1] as [number, number, number, number]);
      },
      [a.toString('base64'), b.toString('base64'), TOLERANCE] as const,
    );
  } finally {
    await page.close();
  }
}

/** One room of one revision's build, without the editor's overlays, as a PNG. */
async function shoot(
  browser: import('playwright').Browser,
  o: CaptureOptions,
  rev: number,
  files: Map<string, Buffer>,
  room: string,
): Promise<Buffer> {
  const base = `/preview/${rev}/`;
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  try {
    await ctx.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) return route.abort();
      const path = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname.slice(1);
      const body =
        files.get(path || 'index.html') ??
        (path.startsWith('assets/') ? readUnder(o.assetsDir, path.slice(7)) : null) ??
        readUnder(o.publicDir, path);
      if (!body) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({
        status: 200,
        body,
        contentType: TYPES[extname(path || 'index.html').toLowerCase()] ?? 'application/octet-stream',
      });
    });
    const page = await ctx.newPage();
    // The room absent at this revision: the dev tools throw at once, rather than the wait running out.
    const failed = new Promise<never>((_, fail) =>
      page.on('pageerror', (e) => {
        if (/unknown room/.test(e.message)) fail(new Error(`no room "${room}" at r${rev}`));
      }),
    );
    await page.goto(`${ORIGIN}${base}?edit=${encodeURIComponent(room)}`);
    await Promise.race([
      page.waitForFunction(() => !!(window as unknown as { __editor?: unknown }).__editor, null, { timeout: 20_000 }),
      failed,
    ]);
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
    });
    await page.evaluate(async () => {
      document.querySelectorAll<HTMLElement>('.scene > svg, .tp-dfwv').forEach((e) => {
        e.style.display = 'none';
      });
      await document.fonts.ready;
      // Every picture decoded: a capture never shows one half loaded.
      await Promise.all([...document.images].map((i) => i.decode().catch(() => undefined)));
    });
    await page.waitForTimeout(700);
    return await page.screenshot({ animations: 'disabled' });
  } finally {
    await ctx.close();
  }
}
