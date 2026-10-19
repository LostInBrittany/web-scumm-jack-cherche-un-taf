// Published builds (4.2.2 PR 5, plan §2.5, G6): a member publishes the head; the processing worker builds the player's
// game from the revision's snapshot (base `/play/<n>/`, no editing tools) and says what built it (its engine, commit
// and lockfile: `build.json`); the revision is judged (the validator and the solver, as the health judges it) unless
// it was already. The Studio keeps the files by content and signs a manifest: the epoch and revision, the snapshot's
// hash, what built it, the assets' version it was built against, the revision's verdict, each file's hash. The bytes
// signed are a canonical serialisation, prefixed for this use only, kept as they were and given back with the
// signature, which the worker's public key checks. A build's files never change; its images and sounds are the
// instance's prepared assets, served beside it as they are now. The game's origin serves `/play/<n>/` and sends
// `/play/` to the last green build (the latest whose revision was judged valid, as judged now). A fresh rebuild (an
// owner's option) builds the same snapshot again, against the same assets' version, and says whether the files are the
// same, byte for byte: it checks that a build is reproducible on the worker as it is now, not that its content is
// harmless.
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { BlobStore } from '../ops/blobs';
import { StudioError } from '../ops/errors';
import type { PreviewParams } from '../worker/preview-build';
import { serveBuilt, servedPath, text } from './previews';

export type Verdict = 'ok' | 'failed' | 'unknown';

export interface BuildManifest {
  v: 1;
  n: number;
  epoch: string;
  rev: number;
  /** sha256 of the snapshot the build was made from. */
  snapshot: string;
  /** What built it, as the worker said: its engine's version, its commit, its lockfile's sha256. */
  engine: string;
  commit: string;
  lockfile: string;
  /** The prepared assets' version it was built against (they are served beside it, from the instance). */
  assets: string;
  /** The revision's verdict when it was published (the validator, then the solver), or unknown. */
  health: Verdict;
  /** Each file of the build, by its path under the base, and its sha256. */
  files: Record<string, string>;
  /** The signing key: the first 16 hex digits of the sha256 of its public key (SPKI DER). */
  key: string;
}

export interface BuildInfo {
  n: number;
  rev: number;
  by: string;
  at: number;
  /** The revision's verdict now (a build is green when its revision was judged valid). */
  health: Verdict;
  rebuilt: { at: number; same: boolean; differ: string[]; engine: string; commit: string } | null;
}

export interface BuildsOptions {
  db: SqlDb;
  blobs: BlobStore;
  publicDir: string;
  /** The Studio's prepared set (4.2.2 PR 6b), looked in first. */
  prepared?: () => string | null;
  game: string;
  studioOrigin: string;
  assetsVersion: () => string;
  /** The folder packed at its revision, holding the instance's lock. */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** A past revision's snapshot, rebuilt from the journal (the fresh rebuild), and the journal's epoch now. */
  snapshotAt: (rev: number) => Promise<Buffer>;
  epoch: () => Promise<string>;
  /** The worker's build. */
  build: (snapshot: Buffer, params: PreviewParams, at: { epoch: string; rev: number }) => Promise<Map<string, Buffer>>;
  /** Judges the revision unless its verdict is kept (the health's), so that it can be green. */
  judge?: (epoch: string, rev: number, snapshot: Buffer) => Promise<void>;
  /** The Studio's signature of bytes (Ed25519, base64url), and its key's id. */
  sign: (bytes: Buffer) => string;
  keyId: string;
  now?: () => number;
}

/** What a manifest's signature covers: this prefix, then its canonical bytes (`canonicalManifest`). */
const MANIFEST_PREFIX = 'web-scumm build manifest v1\n';

/**
 * A manifest's canonical form: its keys sorted at every level, its files as `[path, hash]` pairs sorted by the paths'
 * UTF-8 bytes. A verifier in another language rebuilds the same bytes, or reads them as `signed`.
 */
export function canonicalManifest(m: BuildManifest): string {
  const files = Object.entries(m.files).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const top = { ...m, files };
  return `{${Object.keys(top)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(top[k as keyof typeof top])}`)
    .join(',')}}`;
}

/** The bytes signed for a manifest. */
export const signedBytes = (canonical: string) => Buffer.from(MANIFEST_PREFIX + canonical);

/** The paths a public build opens without a session (when the owner chose so): `/play`, `/play/…`, `/icons/…`. */
export const PUBLIC_BUILD_PATH = /^\/(play(\/|$)|icons\/)/;

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const verdictOf = (ok: unknown): Verdict =>
  ok === null || ok === undefined ? 'unknown' : Number(ok) === 1 ? 'ok' : 'failed';

export class Builds {
  private gate: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private manifests = new Map<number, BuildManifest>();
  private now: () => number;

  constructor(private o: BuildsOptions) {
    this.now = o.now ?? Date.now;
  }

  /** One publication or rebuild at a time, and none queued behind it: each takes the worker for a whole build. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) return Promise.reject(new StudioError('a build is being made: try again when it is done', 429));
    this.busy++;
    const p = this.gate.then(fn).finally(() => this.busy--);
    this.gate = p.catch(() => undefined);
    return p;
  }

  private async health(epoch: string, rev: number): Promise<Verdict> {
    const [r] = await this.o.db.all('SELECT ok FROM studio_health WHERE epoch = $1 AND rev = $2', [epoch, rev]);
    return verdictOf(r?.ok);
  }

  private async files(built: Map<string, Buffer>): Promise<Record<string, string>> {
    const out: [string, string][] = [];
    for (const [path, bytes] of built) out.push([path, await this.o.blobs.put(bytes)]);
    return Object.fromEntries(out);
  }

  private params(rev: number, n: number, assets: string): PreviewParams {
    return { rev, game: this.o.game, studioOrigin: this.o.studioOrigin, assetsVersion: assets, play: n };
  }

  /** Publishes the head: its number reserved first (no two instances share one), built, judged, signed. */
  publish(by: string): Promise<BuildInfo> {
    return this.serial(async () => {
      const snap = await this.o.snapshot();
      const at = this.now();
      const n = await this.o.db.tx('studio-builds', async (q) => {
        const [last] = await q.all('SELECT MAX(n) AS n FROM studio_builds');
        const next = Number(last?.n ?? 0) + 1;
        // Reserved: a row without a manifest is a build being made, listed nowhere, served nowhere.
        await q.run(
          "INSERT INTO studio_builds (n, epoch, rev, manifest, signature, made_by, made_at) VALUES ($1, $2, $3, '', '', $4, $5)",
          [next, snap.epoch, snap.rev, by, at],
        );
        return next;
      });
      try {
        const assets = this.o.assetsVersion();
        const built = await this.o.build(snap.bytes, this.params(snap.rev, n, assets), snap);
        const info = JSON.parse(built.get('build.json')?.toString() ?? '{}') as Record<string, unknown>;
        await this.o.judge?.(snap.epoch, snap.rev, snap.bytes);
        const m: BuildManifest = {
          v: 1,
          n,
          epoch: snap.epoch,
          rev: snap.rev,
          snapshot: sha(snap.bytes),
          engine: String(info.engine ?? 'unknown'),
          commit: String(info.commit ?? 'unknown'),
          lockfile: String(info.lockfile ?? 'unknown'),
          assets,
          health: await this.health(snap.epoch, snap.rev),
          files: await this.files(built),
          key: this.o.keyId,
        };
        const canonical = canonicalManifest(m);
        await this.o.db.run('UPDATE studio_builds SET manifest = $1, signature = $2 WHERE n = $3', [
          canonical,
          this.o.sign(signedBytes(canonical)),
          n,
        ]);
        this.manifests.set(n, m);
        return { n, rev: m.rev, by, at, health: m.health, rebuilt: null };
      } catch (e) {
        await this.o.db.run("DELETE FROM studio_builds WHERE n = $1 AND manifest = ''", [n]).catch(() => undefined);
        throw e;
      }
    });
  }

  /** A build's manifest, the exact bytes signed (`signed`, without the prefix) and its signature. */
  async get(n: number): Promise<{ manifest: BuildManifest; signed: string; signature: string } | undefined> {
    const [r] = await this.o.db.all("SELECT manifest, signature FROM studio_builds WHERE n = $1 AND manifest <> ''", [
      n,
    ]);
    if (!r) return undefined;
    const signed = String(r.manifest);
    const parsed = JSON.parse(signed) as Omit<BuildManifest, 'files'> & { files: [string, string][] };
    return { manifest: { ...parsed, files: Object.fromEntries(parsed.files) }, signed, signature: String(r.signature) };
  }

  /** The builds, latest first, with their revision's verdict now. */
  async list(limit = 100): Promise<BuildInfo[]> {
    const rows = await this.o.db.all(
      `SELECT b.n, b.rev, b.made_by, b.made_at, b.rebuilt, h.ok FROM studio_builds b
       LEFT JOIN studio_health h ON h.epoch = b.epoch AND h.rev = b.rev
       WHERE b.manifest <> '' ORDER BY b.n DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      n: Number(r.n),
      rev: Number(r.rev),
      by: String(r.made_by),
      at: Number(r.made_at),
      health: verdictOf(r.ok),
      rebuilt: r.rebuilt ? (JSON.parse(String(r.rebuilt)) as BuildInfo['rebuilt']) : null,
    }));
  }

  /** The last green build: the latest whose revision was judged valid. */
  async green(): Promise<number | null> {
    const [r] = await this.o.db.all(
      `SELECT b.n FROM studio_builds b JOIN studio_health h ON h.epoch = b.epoch AND h.rev = b.rev AND h.ok = 1
       WHERE b.manifest <> '' ORDER BY b.n DESC LIMIT 1`,
    );
    return r ? Number(r.n) : null;
  }

  /**
   * Builds build `n`'s snapshot again (from the journal), against the same assets' version, and compares the files
   * with the published ones, byte for byte (`build.json`, which says what built it, is compared apart); the
   * comparison is kept with the build. The published build does not change.
   */
  rebuild(n: number): Promise<{ n: number; same: boolean; differ: string[] }> {
    return this.serial(async () => {
      const b = await this.get(n);
      if (!b) throw new StudioError(`no build ${n}`, 404);
      const m = b.manifest;
      if (m.epoch !== (await this.o.epoch()))
        throw new StudioError(`build ${n} belongs to another history of the game (an import or a restore since)`, 409);
      const bytes = await this.o.snapshotAt(m.rev);
      if (sha(bytes) !== m.snapshot)
        throw new StudioError(
          `build ${n}: the revision's snapshot rebuilt from the journal is not the one published`,
          409,
        );
      const built = await this.o.build(bytes, this.params(m.rev, n, m.assets), m);
      const info = JSON.parse(built.get('build.json')?.toString() ?? '{}') as Record<string, unknown>;
      built.delete('build.json');
      const again = await this.files(built);
      const published = Object.fromEntries(Object.entries(m.files).filter(([p]) => p !== 'build.json'));
      const paths = [...new Set([...Object.keys(published), ...Object.keys(again)])].sort();
      const differ = paths.filter((p) => published[p] !== again[p]);
      const rebuilt = {
        at: this.now(),
        same: differ.length === 0,
        differ: differ.slice(0, 50),
        engine: String(info.engine ?? 'unknown'),
        commit: String(info.commit ?? 'unknown'),
      };
      await this.o.db.run('UPDATE studio_builds SET rebuilt = $1 WHERE n = $2', [JSON.stringify(rebuilt), n]);
      return { n, same: rebuilt.same, differ: rebuilt.differ };
    });
  }

  /** `/play/` (the last green build) and `/play/<n>/…` on the game's origin. */
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(res, 405, 'GET only');
    const path = servedPath(url);
    if (path === null) return text(res, 404, 'not found');
    if (path === '/play' || path === '/play/') {
      const n = await this.green();
      if (n === null) return text(res, 404, 'no build is green yet');
      res.writeHead(302, { location: `/play/${n}/${url.search}`, 'cache-control': 'no-store' });
      return void res.end();
    }
    const m = /^\/play\/(\d{1,9})\/(.*)$/.exec(path);
    if (!m) return text(res, 404, 'not found');
    const n = Number(m[1]);
    let manifest = this.manifests.get(n);
    if (!manifest) {
      manifest = (await this.get(n))?.manifest;
      if (!manifest) return text(res, 404, 'no such build');
      this.manifests.set(n, manifest);
    }
    return serveBuilt(req, res, this.o, manifest.files, m[2] || 'index.html');
  }
}
