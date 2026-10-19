// The Studio's page on its public origin (4.2.1, plan §3.4 and §7 row 7): the built Studio (`npm run studio-client`),
// told by a meta tag where its API is and where the game's origin is; its scripts and styles; and the game's
// prepared images and sounds, which the Studio shows (thumbnails, the storyboard) and which are the project's data.
//   - The page and its scripts hold no data: they are served to anyone, like the login page they lead to.
//   - Images and sounds are served to a member only (the caller checks the session first, http.ts).
//   - Nothing that runs the game is served here: the game's page and code are on the game's origin (previews.ts).
// The page's Content-Security-Policy: scripts from this origin only, frames from the game's origin only, framed by
// nobody else, requests to this origin only (the assistant calls its provider through the server).
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

export interface ClientOptions {
  /** The built Studio (`studio.html` and `assets/`). */
  clientDir: string;
  /** The prepared assets' folder (`public/`, with `assets/img`, `assets/audio`…). */
  publicDir: string;
  /** The Studio's prepared set (4.2.2 PR 6b): a game's image or sound is looked for there first. */
  prepared?: () => string | null;
  publicUrl: string;
  playUrl: string;
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};
const MEDIA: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** The game's images, sounds and videos: the project's data. */
const MEDIA_PATH = /^\/assets\/(img|audio|video)\/[\w./-]+$/;
/** The Studio's built files. */
const STATIC_PATH = /^\/assets\/[\w./-]+$/;
/** The public files the page names (its icon, the pixel font), from the prepared assets' folder. */
const PUBLIC_PATH = /^\/(icons|fonts)\/[\w.-]+$/;

const inside = (p: string, dir: string) => p.startsWith(dir.endsWith(sep) ? dir : dir + sep);

export class StudioClient {
  private clientDir: string;
  private publicDir: string;
  private page?: string;

  constructor(private o: ClientOptions) {
    this.clientDir = realpathSync.native(resolve(o.clientDir));
    this.publicDir = existsSync(o.publicDir) ? realpathSync.native(resolve(o.publicDir)) : resolve(o.publicDir);
    if (!existsSync(join(this.clientDir, 'studio.html')))
      throw new Error(`${o.clientDir} has no studio.html: build the Studio first (npm run studio-client)`);
  }

  /** What a GET of `path` is: the page, one of its files, a public file, the game's media, or nothing of this. */
  kind(path: string): 'page' | 'static' | 'public' | 'media' | undefined {
    if (path === '/') return 'page';
    if (path.includes('..')) return undefined;
    if (MEDIA_PATH.test(path)) return 'media';
    if (STATIC_PATH.test(path)) return 'static';
    if (PUBLIC_PATH.test(path)) return 'public';
    return undefined;
  }

  /** The page's policy (exported for its tests through the answer's headers). */
  private csp(): string {
    return [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      `frame-src ${this.o.playUrl}`,
      "frame-ancestors 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');
  }

  /** The page, with the meta tag that tells the Studio it is hosted, where its API is and where the game is played. */
  servePage(res: ServerResponse): void {
    if (!this.page) {
      const meta = JSON.stringify({ hosted: true, api: '/api', play: this.o.playUrl })
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
      this.page = readFileSync(join(this.clientDir, 'studio.html'), 'utf8').replace(
        '</head>',
        `<meta name="web-scumm-studio" content="${meta}">\n</head>`,
      );
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': this.csp(),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'cross-origin-opener-policy': 'same-origin',
    });
    res.end(this.page);
  }

  /** One of the Studio's built files (hashed names: cached for good). */
  serveStatic(path: string, res: ServerResponse): void {
    const type = TYPES[extname(path).toLowerCase()];
    if (!type) return this.notFound(res);
    this.file(join(this.clientDir, ...path.slice(1).split('/')), this.clientDir, res, type, {
      'cache-control': 'public, max-age=31536000, immutable',
    });
  }

  /** The page's icon and font, from the public files. */
  servePublic(path: string, res: ServerResponse): void {
    const type = TYPES[extname(path).toLowerCase()];
    if (!type || type.startsWith('text/')) return this.notFound(res);
    this.file(join(this.publicDir, ...path.slice(1).split('/')), this.publicDir, res, type, {
      'cache-control': 'public, max-age=3600',
    });
  }

  /** One of the game's images or sounds (the prepared set first, 4.2.2): the caller has checked the member's session. */
  serveMedia(path: string, res: ServerResponse): void {
    const type = MEDIA[extname(path).toLowerCase()];
    if (!type) return this.notFound(res);
    const p = this.o.prepared?.();
    // Compared real path to real path (the work folder may sit behind a link: macOS's /var).
    const prepared = p && existsSync(p) ? realpathSync.native(p) : null;
    const root = prepared && existsSync(join(prepared, ...path.slice(1).split('/'))) ? prepared : this.publicDir;
    this.file(join(root, ...path.slice(1).split('/')), root, res, type, {
      'cache-control': 'private, max-age=300',
    });
  }

  private file(p: string, root: string, res: ServerResponse, type: string, headers: Record<string, string>) {
    let real: string;
    try {
      real = realpathSync.native(p);
    } catch {
      return this.notFound(res);
    }
    if (!inside(real, root) || !statSync(real).isFile()) return this.notFound(res);
    res.writeHead(200, {
      'content-type': type,
      'content-length': String(statSync(real).size),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      ...headers,
    });
    // A file replaced meanwhile, a client gone: the stream ends and its file is closed.
    pipeline(createReadStream(real), res, () => {});
  }

  private notFound(res: ServerResponse) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: 'not found' }));
  }
}
