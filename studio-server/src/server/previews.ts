// The revisions' previews (4.2.2 PR 2, plan §2.2, D42): what the game's origin serves, in place of 4.2.1's live
// preview (Vite has left the server). After each confirmed revision the head is built, coalesced: a burst of writes
// builds its last revision only, one build at a time. The build runs where the game's code runs (the processing
// worker, or a child on the loopback: `build`), from a snapshot packed holding the instance's lock (`snapshot`), so
// the revision it is labelled with is the one it was made from. Its files go to the blob store by content; the table
// `studio_previews` keeps each revision's paths and hashes, or the reason its build failed.
//   GET /preview/<rev>/<path>  a file of that revision's build (its code, named by hash, immutable), else a prepared
//                              asset of the Studio's folder (images, sounds, fonts, icons, data: the same for every
//                              revision)
//   GET /<asset path>          a prepared asset (the page's icon is named from the root)
//   GET /                      a redirect to the last ready preview, its query kept; none yet: a page that says the
//                              preview is being prepared and asks again in 2 s
//   anything else              404
// A revision whose build failed is not served: the last ready one is, and the Studio says which revision it is.
import { EventEmitter } from 'node:events';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { BlobStore } from '../ops/blobs';
import { PreviewBuildFailed, type PreviewParams } from '../worker/preview-build';

export interface PreviewState {
  epoch: string;
  /** The journal's head when last looked at. */
  head: number;
  /** The last revision whose preview is ready (served at `/preview/<ready>/`), or null. */
  ready: number | null;
  /** The revision being built, or null. */
  building: number | null;
  /** The last revision whose build failed after `ready`, and why. */
  failed: { rev: number; reason: string } | null;
}

export interface PreviewsOptions {
  db: SqlDb;
  blobs: BlobStore;
  /** The prepared assets (`public/`): served beside every build. */
  publicDir: string;
  /** The Studio's prepared set (4.2.2 PR 6b), looked in first. */
  prepared?: () => string | null;
  game: string;
  studioOrigin: string;
  /** The folder packed at its revision, holding the instance's lock. */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** The build of a snapshot: the worker's `preview` job, or a child on the loopback. */
  build: (snapshot: Buffer, params: PreviewParams, at: { epoch: string }) => Promise<Map<string, Buffer>>;
  /** The prepared assets' version (`__ASSETS_VERSION__`). */
  assetsVersion: () => string;
  log?: (line: Record<string, unknown>) => void;
  now?: () => number;
}

/** The prepared assets a page of the game loads, by their path under the base. */
const PUBLIC = /^(?:assets\/(?:img|audio|video|reality)\/|data\/|fonts\/|icons\/|licenses\/|og\.png$|favicon\.ico$)/;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const typeOf = (p: string) => TYPES[extname(p).toLowerCase()] ?? 'application/octet-stream';
const IMMUTABLE = 'private, max-age=31536000, immutable';
const PREPARING = [
  '<!doctype html><meta charset="utf-8"><title>Preparing</title>',
  '<body style="background:#0a0a12;color:#ccc;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0">',
  '<p>The preview is being prepared…</p>',
].join('');
const RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

export class Previews {
  /** `changed` (PreviewState): a build started, ended, or the head moved. */
  readonly events = new EventEmitter();
  private s: PreviewState = { epoch: '', head: 0, ready: null, building: null, failed: null };
  private manifests = new Map<number, Record<string, string>>();
  private wanted = false;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = RETRY_MS;
  private running: Promise<void> | null = null;
  /** When the oldest ask not taken by a run yet was made (4.4.0: the preview's `queuedMs` and `sinceWriteMs`). */
  private asked: number | undefined;
  private now: () => number;

  constructor(private o: PreviewsOptions) {
    this.events.setMaxListeners(0);
    this.now = o.now ?? Date.now;
  }

  state(): PreviewState {
    return { ...this.s, failed: this.s.failed && { ...this.s.failed } };
  }

  /**
   * Asks for the head's preview; resolves when the run it joined ends (an ask made at that very end starts the next
   * run at once). For the tests and the server's start.
   */
  schedule(): Promise<void> {
    this.wanted = true;
    this.asked ??= this.now();
    this.running ??= this.loop().finally(() => {
      this.running = null;
      // Asked between the loop's last look and here: run again.
      if (this.wanted) void this.schedule();
    });
    return this.running;
  }

  private changed() {
    this.events.emit('changed', this.state());
  }

  private async loop() {
    while (this.wanted) {
      this.wanted = false;
      const asked = this.asked ?? this.now();
      this.asked = undefined;
      try {
        await this.once(asked);
        this.retryMs = RETRY_MS;
      } catch (e) {
        // The write still waits for its preview: its time runs on through the retries.
        this.asked = Math.min(this.asked ?? asked, asked);
        // Not the game's fault (the worker down or busy, a timeout, the store): said, nothing recorded, tried again
        // later, waiting longer each time.
        const message = String((e as Error).message).slice(0, 300);
        this.o.log?.({ event: 'preview-failed', message, retryMs: this.retryMs });
        clearTimeout(this.retry);
        this.retry = setTimeout(() => void this.schedule(), this.retryMs);
        this.retry.unref?.();
        this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
      }
    }
  }

  /** Stops the retries (the server's stop, the tests). */
  close() {
    clearTimeout(this.retry);
  }

  /** `asked`: when the write this run answers asked for it (the coalescing and the retries are part of its wait). */
  private async once(asked: number) {
    const tSnap = this.now();
    const snap = await this.o.snapshot();
    if (snap.epoch !== this.s.epoch) {
      // Another history (an import, a restore): its own previews only.
      this.manifests.clear();
      this.s = { epoch: snap.epoch, head: snap.rev, ready: null, building: null, failed: null };
      const [last] = await this.o.db.all(
        'SELECT rev FROM studio_previews WHERE epoch = $1 AND manifest IS NOT NULL ORDER BY rev DESC LIMIT 1',
        [snap.epoch],
      );
      if (last) this.s.ready = Number(last.rev);
    }
    this.s.head = snap.rev;
    const [row] = await this.o.db.all(
      'SELECT rev, manifest, failed FROM studio_previews WHERE epoch = $1 AND rev = $2',
      [snap.epoch, snap.rev],
    );
    if (row) {
      if (row.manifest) {
        this.s.ready = Math.max(this.s.ready ?? 0, snap.rev);
        this.s.failed = null;
      } else this.s.failed = { rev: snap.rev, reason: String(row.failed) };
      return this.changed();
    }
    this.s.building = snap.rev;
    this.changed();
    const t0 = this.now();
    let built: number | undefined;
    try {
      let manifest: Record<string, string> | null = null;
      let failed: string | null = null;
      try {
        const files = await this.o.build(
          snap.bytes,
          {
            rev: snap.rev,
            game: this.o.game,
            studioOrigin: this.o.studioOrigin,
            assetsVersion: this.o.assetsVersion(),
          },
          { epoch: snap.epoch },
        );
        built = this.now();
        manifest = await storeFiles(this.o.blobs, files);
      } catch (e) {
        // Only the game's own build failing is recorded: anything else is tried again (loop).
        if (!(e instanceof PreviewBuildFailed)) throw e;
        failed = e.message.slice(0, 2_000);
      }
      const end = this.now();
      // The build and the files stored, after the snapshot (the column `ms` and studio_preview_build_seconds).
      const ms = end - t0;
      // Its phases (4.4.0): waiting (the coalescing, a build before it, the retries), the snapshot, the worker's job
      // as the Studio waits for it (its queue on the worker included), the files stored; and the write's whole wait.
      const phases = {
        queuedMs: tSnap - asked,
        snapMs: t0 - tSnap,
        jobMs: (built ?? end) - t0,
        storeMs: built === undefined ? 0 : end - built,
        sinceWriteMs: end - asked,
      };
      await this.o.db.run(
        'INSERT INTO studio_previews (epoch, rev, manifest, failed, ms, made_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
        [snap.epoch, snap.rev, manifest && JSON.stringify(manifest), failed, ms, this.now()],
      );
      if (manifest) {
        this.manifests.set(snap.rev, manifest);
        this.s.ready = snap.rev;
        this.s.failed = null;
      } else this.s.failed = { rev: snap.rev, reason: failed! };
      this.o.log?.({ event: 'preview', rev: snap.rev, ms, failed: !!failed, ...phases });
    } finally {
      this.s.building = null;
      this.changed();
    }
  }

  private async manifest(rev: number): Promise<Record<string, string> | undefined> {
    const hit = this.manifests.get(rev);
    if (hit) return hit;
    const [row] = await this.o.db.all('SELECT manifest FROM studio_previews WHERE epoch = $1 AND rev = $2', [
      this.s.epoch,
      rev,
    ]);
    if (!row?.manifest) return undefined;
    const m = JSON.parse(String(row.manifest)) as Record<string, string>;
    this.manifests.set(rev, m);
    return m;
  }

  /** Answers a request of the game's origin (play.ts has checked the game session). */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'GET only');
    // No `.` nor `..`, and no hidden file (`.env`, `.DS_Store`) in the folders served.
    const path = servedPath(url);
    if (path === null) return text(res, 404, 'not found');
    const m = /^\/preview\/(\d{1,15})\/(.*)$/.exec(path);
    if (m) {
      const rest = m[2] || 'index.html';
      const manifest = this.s.epoch ? await this.manifest(Number(m[1])) : undefined;
      if (!manifest) return text(res, 404, 'no such preview');
      return serveBuilt(req, res, this.o, manifest, rest);
    }
    const rel = path.slice(1);
    if (PUBLIC.test(rel)) return serveAsset(req, res, assetDirs(this.o), rel);
    if (path !== '/' && path !== '/index.html') return text(res, 404, 'not found');
    if (this.s.ready === null) {
      res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', refresh: '2', 'retry-after': '2' });
      return void res.end(PREPARING);
    }
    res.writeHead(302, { location: `/preview/${this.s.ready}/${url.search}` });
    res.end();
  }
}

/** The files a build's store writes at once (4.4.0): a preview's twenty files no longer one after another. */
export const STORE_PARALLEL = 8;

/**
 * A build's files stored by content, `limit` at a time at most: their hashes by path, in the build's order. A put that
 * fails starts no other, and fails the whole once the puts under way have ended.
 */
export async function storeFiles(
  blobs: Pick<BlobStore, 'put'>,
  files: Map<string, Buffer>,
  limit = STORE_PARALLEL,
): Promise<Record<string, string>> {
  const all = [...files];
  const hashes: string[] = new Array(all.length);
  let next = 0;
  const lane = async () => {
    while (next < all.length) {
      const i = next++;
      try {
        hashes[i] = await blobs.put(all[i]![1]);
      } catch (e) {
        // No new put once one failed.
        next = all.length;
        throw e;
      }
    }
  };
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, all.length)) }, lane);
  const settled = await Promise.allSettled(lanes);
  const failed = settled.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
  return Object.fromEntries(all.map(([path], i) => [path, hashes[i]!]));
}

export function text(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

/** The folders a prepared asset is looked for in, in order: the Studio's prepared set (4.2.2), then `publicDir`. */
export const assetDirs = (o: { publicDir: string; prepared?: () => string | null }): string[] => {
  const p = o.prepared?.();
  return p ? [p, o.publicDir] : [o.publicDir];
};

/** A file of one of `dirs` (the first that has it), inside it; or undefined. */
export function findAsset(dirs: string[], rel: string): { file: string; size: number } | undefined {
  for (const dir of dirs)
    try {
      const root = realpathSync.native(dir);
      const file = realpathSync.native(resolve(root, rel));
      if (!file.startsWith(root + sep)) continue;
      const st = statSync(file);
      if (st.isFile()) return { file, size: st.size };
    } catch {
      /* not in this one */
    }
  return undefined;
}

/** A prepared asset, from the Studio's folders; one byte range when asked (Safari plays no media without it). */
function serveAsset(req: IncomingMessage, res: ServerResponse, dirs: string[], rel: string) {
  const found = findAsset(dirs, rel);
  if (!found) return text(res, 404, 'not found');
  const { file, size } = found;
  const headers: Record<string, string | number> = {
    'content-type': typeOf(file),
    'accept-ranges': 'bytes',
    // Prepared again by "Prepare assets": checked each time, never kept stale.
    'cache-control': 'private, no-cache',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  let start = 0;
  let end = size - 1;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
    } else start = Math.max(0, size - Number(range[2]));
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      return void res.end();
    }
    res.writeHead(206, {
      ...headers,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    });
  } else res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD' || size === 0) return void res.end();
  // A file replaced meanwhile, a client gone (a media seek): the stream ends and its file is closed.
  pipeline(createReadStream(file, { start, end }), res, () => {});
}

/**
 * A file of a build (a preview, a published build): from its manifest by content, else a prepared asset, else 404.
 * The code is named by its hash: kept for good. The page is asked again each time, so that a session that ended (a
 * logout, a member removed) is refused at the next load, not served from the browser's cache.
 */
export async function serveBuilt(
  req: IncomingMessage,
  res: ServerResponse,
  o: { blobs: BlobStore; publicDir: string; prepared?: () => string | null },
  manifest: Record<string, string>,
  rest: string,
): Promise<void> {
  const hash = Object.hasOwn(manifest, rest) ? manifest[rest] : undefined;
  if (hash) {
    const bytes = await o.blobs.get(hash);
    res.writeHead(200, {
      'content-type': typeOf(rest),
      'content-length': bytes.length,
      'cache-control': rest.startsWith('assets/') ? IMMUTABLE : 'private, no-cache',
    });
    return void res.end(req.method === 'HEAD' ? undefined : bytes);
  }
  if (PUBLIC.test(rest)) return serveAsset(req, res, assetDirs(o), rest);
  return text(res, 404, 'not found');
}

/** A game origin's path, decoded and refused when it holds `.` or `..`, a hidden file, a backslash or a NUL. */
export function servedPath(url: URL): string | null {
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  return path.includes('\0') || path.includes('\\') || /(^|\/)\./.test(path) ? null : path;
}
