// The prepared assets (4.2.2 PR 6b, plan §2.6, D43): a member's "Prepare assets" runs `prepare` on the processing
// worker, under the project's exclusive lease (no write meanwhile), from the head's art, sounds and sources. Its
// outputs are kept by content (a set per run, `studio_prepared`) and written back to a folder of the instance (its
// disk is ephemeral: the latest set is written again at start); the game's new `assets.gen.json` is one operation of
// the journal, the member's. The Studio's media, the previews and the builds serve a prepared file from that folder
// first, then from `publicDir` (the deployment's). Since 4.2.3 (H8) a run is a job (jobs.ts): its progress goes to the
// live stream, and a cancel before its write leaves nothing (no set kept, no operation); the sheets' cutting and the
// uploads are hosted too (hosted-assets.ts).
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { BlobStore } from '../ops/blobs';
import { StudioError } from '../ops/errors';
import type { Prepared } from '../worker/prepare';
import type { JobControl } from './jobs';

export interface PreparedOptions {
  db: SqlDb;
  blobs: BlobStore;
  /** Where the latest set is written for serving (under the instance's work folder). */
  dir: string;
  /** The head packed with its art and sounds, holding the instance's lock (a version 2 snapshot). */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** The worker's `prepare`; `signal`: a cancel (the worker's child killed, its answer dropped). */
  prepare: (snapshot: Buffer, at: { epoch: string; rev: number }, signal?: AbortSignal) => Promise<Prepared>;
  /** Writes the game's new `assets.gen.json`, one operation of the journal, as the member (under their `*` lease). */
  writeManifest: (manifest: string) => Promise<void>;
  /** The game's `assets.gen.json` now (what a run must not lose), or null. */
  currentManifest: () => string | null;
  log?: (line: Record<string, unknown>) => void;
  /** Takes and gives back the project's exclusive lease for the member. */
  exclusive: <T>(fn: () => Promise<T>) => Promise<T>;
  now?: () => number;
}

/**
 * The worker's `prepare` for `game`, as PreparedOptions takes it: the job's signal always passed on (main.ts, the
 * e2e stack), so a cancel reaches the worker.
 */
export function prepareOn(
  worker: (
    snapshot: Buffer,
    at: { epoch: string; rev: number },
    game: string,
    signal?: AbortSignal,
  ) => Promise<Prepared>,
  game: string,
): PreparedOptions['prepare'] {
  return (snapshot, at, signal) => worker(snapshot, at, game, signal);
}

export class PreparedAssets {
  private busy = false;
  private current: { id: number; version: string } | null = null;
  private now: () => number;

  constructor(private o: PreparedOptions) {
    this.now = o.now ?? Date.now;
  }

  /** The folder of the latest set, when there is one: served before `publicDir`. */
  folder(): string | null {
    return this.current ? join(this.o.dir, String(this.current.id)) : null;
  }

  /** The latest set's version (`__ASSETS_VERSION__` of the previews and builds), or null. */
  version(): string | null {
    return this.current?.version ?? null;
  }

  /** Writes set `id` to the instance's folder and serves it; `drop`: the previous one's folder goes at once. */
  private async write(id: number, manifest: Record<string, string>, drop = true) {
    const dir = join(this.o.dir, String(id));
    rmSync(dir, { recursive: true, force: true });
    for (const [path, hash] of Object.entries(manifest)) {
      const file = join(dir, ...path.split('/'));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, await this.o.blobs.get(hash));
    }
    // A newer set served meanwhile (a Prepare that ended while the start was writing this one): this one is not.
    if (this.current && this.current.id > id) {
      rmSync(dir, { recursive: true, force: true });
      return;
    }
    const version = createHash('sha1')
      .update(JSON.stringify(Object.entries(manifest).sort()))
      .digest('hex')
      .slice(0, 10);
    const old = this.current;
    this.current = { id, version };
    if (drop && old && old.id !== id) rmSync(join(this.o.dir, String(old.id)), { recursive: true, force: true });
  }

  /**
   * At start: the latest set written again to the instance's folder, in the background (until it is, publicDir is
   * served); a failure (a blob missing) is logged, and publicDir stays served.
   */
  start(): Promise<void> {
    return this.o.db
      .all('SELECT id, manifest FROM studio_prepared ORDER BY id DESC LIMIT 1')
      .then(async ([r]) => {
        if (r) await this.write(Number(r.id), JSON.parse(String(r.manifest)) as Record<string, string>);
      })
      .catch((e) => this.o.log?.({ event: 'prepared-start-failed', message: String((e as Error).message) }));
  }

  /** The runs, latest first. */
  async list(limit = 20): Promise<{ id: number; rev: number; by: string; at: number; files: number }[]> {
    const rows = await this.o.db.all(
      'SELECT id, rev, made_by, made_at, manifest FROM studio_prepared ORDER BY id DESC LIMIT $1',
      [limit],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      rev: Number(r.rev),
      by: String(r.made_by),
      at: Number(r.made_at),
      files: Object.keys(JSON.parse(String(r.manifest)) as object).length,
    }));
  }

  /**
   * "Prepare assets": one at a time, under the exclusive lease. The new set is served before the manifest's revision
   * lands (the previews of that revision are built against it), and set back if the manifest is refused. A manifest
   * that would lose an image or a sound the game had is refused: what the asset tools could not find is said.
   */
  async prepare(by: string, job?: JobControl): Promise<{ id: number; rev: number; files: number; log: string }> {
    if (this.busy) throw new StudioError('the assets are being prepared: try again when it is done', 429);
    this.busy = true;
    try {
      return await this.o.exclusive(async () => {
        job?.step('packing');
        const snap = await this.o.snapshot();
        job?.step('on the worker');
        const out = await this.o.prepare(snap.bytes, snap, job?.signal);
        const lost = lostEntries(this.o.currentManifest(), out.manifest);
        if (lost.length)
          throw Object.assign(
            new StudioError(
              `refused: the prepared assets would lose ${lost.length} image(s) or sound(s) the game had (${lost.slice(0, 5).join(', ')}): prepare them on a local Studio`,
              422,
            ),
            { body: { lost, log: out.log } },
          );
        // Past this point the run writes (its set, then its manifest): a cancel before it leaves nothing at all.
        job?.commit();
        const manifest: Record<string, string> = {};
        for (const [path, b64] of Object.entries(out.files))
          manifest[path] = await this.o.blobs.put(Buffer.from(b64, 'base64'));
        const id = await this.o.db.tx('studio-prepared', async (q) => {
          const [last] = await q.all('SELECT MAX(id) AS id FROM studio_prepared');
          const next = Number(last?.id ?? 0) + 1;
          await q.run(
            'INSERT INTO studio_prepared (id, epoch, rev, manifest, made_by, made_at) VALUES ($1, $2, $3, $4, $5, $6)',
            [next, snap.epoch, snap.rev, JSON.stringify(manifest), by, this.now()],
          );
          return next;
        });
        const before = this.current;
        await this.write(id, manifest, false);
        try {
          await this.o.writeManifest(out.manifest);
        } catch (e) {
          // Refused (the guard, a lease): the previous set is served again, this one forgotten.
          this.current = before;
          rmSync(join(this.o.dir, String(id)), { recursive: true, force: true });
          await this.o.db.run('DELETE FROM studio_prepared WHERE id = $1', [id]);
          throw e;
        }
        if (before && before.id !== id) rmSync(join(this.o.dir, String(before.id)), { recursive: true, force: true });
        return { id, rev: snap.rev, files: Object.keys(manifest).length, log: out.log };
      });
    } finally {
      this.busy = false;
    }
  }
}

/** The images and sounds a manifest has that the next one would not (`images.<id>`, `audio.<kind>.<id>`). */
function lostEntries(was: string | null, next: string): string[] {
  const keys = (text: string | null) => {
    try {
      const m = JSON.parse(text ?? '{}') as { images?: object; audio?: Record<string, object> };
      return new Set([
        ...Object.keys(m.images ?? {}).map((k) => `image ${k}`),
        ...Object.entries(m.audio ?? {}).flatMap(([kind, v]) => Object.keys(v ?? {}).map((k) => `${kind} ${k}`)),
      ]);
    } catch {
      return new Set<string>();
    }
  };
  const after = keys(next);
  return [...keys(was)].filter((k) => !after.has(k)).sort();
}
