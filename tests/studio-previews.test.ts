// The revisions' previews (4.2.2 PR 2, plan §2.2): a burst of revisions builds its last only, one build at a time; a
// revision is built once per epoch, even across a restart; a failed build is said, never served, and the last ready
// preview stays; another epoch starts from its own previews; the files go to the blob store by content.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../bridge/src/migrations';
import type { SqlDb } from '../bridge/src/store-sql';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { type BlobStore, fsBlobStore } from '../studio-server/src/ops/blobs';
import { type PreviewState, Previews } from '../studio-server/src/server/previews';
import { PreviewBuildFailed, previewFiles } from '../studio-server/src/worker/preview-build';

const ROOT = join(import.meta.dirname, '..');
let tmp: string, db: SqlDb, blobs: BlobStore;
let head: { epoch: string; rev: number };
let built: number[];
let fail: Set<number>;
let gate: Promise<void> | null;
let down: boolean;

beforeEach(async () => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-previews-'));
  db = await openSqliteDb(join(tmp, 'j.sqlite'));
  await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
  blobs = fsBlobStore(join(tmp, 'blobs'));
  head = { epoch: 'e1', rev: 1 };
  built = [];
  fail = new Set();
  gate = null;
  down = false;
});
afterEach(async () => {
  await db.close();
  rmSync(tmp, { recursive: true, force: true });
});

const previews = (log: Record<string, unknown>[] = []) =>
  new Previews({
    db,
    blobs,
    publicDir: tmp,
    game: 'demo',
    studioOrigin: 'https://studio.example',
    snapshot: async () => ({ ...head, bytes: Buffer.from(`snapshot ${head.rev}`) }),
    build: async (bytes, p) => {
      await gate;
      built.push(p.rev);
      expect(bytes.toString()).toBe(`snapshot ${p.rev}`);
      expect(p).toMatchObject({ game: 'demo', studioOrigin: 'https://studio.example', assetsVersion: 'ab12' });
      if (fail.has(p.rev)) throw new PreviewBuildFailed(`rev ${p.rev} does not build`);
      if (down) throw new Error('the processing worker refused the job (503)');
      return new Map([
        ['index.html', Buffer.from(`<p>rev ${p.rev}</p>`)],
        ['assets/font.ttf', Buffer.from('the same font')],
      ]);
    },
    assetsVersion: () => 'ab12',
    log: (l) => log.push(l),
  });

describe('the revisions previews', () => {
  it('builds the head once, and a burst of revisions builds its last only', async () => {
    const p = previews();
    const seen: PreviewState[] = [];
    p.events.on('changed', (s: PreviewState) => seen.push(s));
    await p.schedule();
    expect(built).toEqual([1]);
    expect(p.state()).toEqual({ epoch: 'e1', head: 1, ready: 1, building: null, failed: null });
    expect(seen.map((s) => s.building)).toEqual([1, null]);
    // Five revisions while the build of the 2nd runs: the 2nd, then the 6th, nothing between.
    let open!: () => void;
    gate = new Promise((ok) => (open = ok));
    head.rev = 2;
    const running = p.schedule();
    for (const r of [3, 4, 5, 6]) {
      head.rev = r;
      expect(p.schedule()).toBe(running);
    }
    open();
    await running;
    expect(built).toEqual([1, 2, 6]);
    expect(p.state().ready).toBe(6);
    // Asked again with nothing new: nothing is built.
    await p.schedule();
    expect(built).toEqual([1, 2, 6]);
  });

  it('stores each file once by content, and a restart builds nothing already built', async () => {
    await previews().schedule();
    head.rev = 2;
    await previews().schedule();
    const rows = await db.all('SELECT rev, manifest FROM studio_previews ORDER BY rev');
    const m = rows.map((r) => JSON.parse(String(r.manifest)) as Record<string, string>);
    expect(m[0]!['assets/font.ttf']).toBe(m[1]!['assets/font.ttf']);
    expect(m[0]!['index.html']).not.toBe(m[1]!['index.html']);
    expect((await blobs.get(m[1]!['index.html']!)).toString()).toBe('<p>rev 2</p>');
    const again = previews();
    await again.schedule();
    expect(built).toEqual([1, 2]);
    expect(again.state().ready).toBe(2);
  });

  it('says a failed build, keeps serving the last ready one, and clears the failure with the next', async () => {
    const log: Record<string, unknown>[] = [];
    const p = previews(log);
    await p.schedule();
    fail.add(2);
    head.rev = 2;
    await p.schedule();
    expect(p.state()).toMatchObject({ ready: 1, failed: { rev: 2, reason: 'rev 2 does not build' } });
    expect(log.at(-1)).toMatchObject({ event: 'preview', rev: 2, failed: true });
    // A failed revision is not built again (its snapshot is the same); the next one is.
    await p.schedule();
    expect(built).toEqual([1, 2]);
    head.rev = 3;
    await p.schedule();
    expect(p.state()).toMatchObject({ ready: 3, failed: null });
  });

  it('records nothing when the worker is away, tries again later, and never leaves a build shown as running', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const log: Record<string, unknown>[] = [];
      const p = previews(log);
      down = true;
      await p.schedule();
      expect(p.state()).toMatchObject({ ready: null, building: null, failed: null });
      expect(log.at(-1)).toMatchObject({ event: 'preview-failed', retryMs: 5_000 });
      expect(await db.all('SELECT * FROM studio_previews')).toEqual([]);
      // Still away at the first retry: the wait doubles.
      await vi.advanceTimersByTimeAsync(5_000);
      expect(log.at(-1)).toMatchObject({ event: 'preview-failed', retryMs: 10_000 });
      down = false;
      await vi.advanceTimersByTimeAsync(10_000);
      await p.schedule();
      expect(p.state()).toMatchObject({ ready: 1, building: null });
      p.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failure read back after a restart is still said', async () => {
    fail.add(1);
    await previews().schedule();
    const again = previews();
    await again.schedule();
    expect(built).toEqual([1]);
    expect(again.state()).toMatchObject({ ready: null, failed: { rev: 1, reason: 'rev 1 does not build' } });
  });

  it('a store that fails after the build leaves no build shown as running', async () => {
    const p = previews();
    await db.exec('DROP TABLE studio_previews');
    await p.schedule();
    expect(p.state().building).toBeNull();
    p.close();
  });

  it('starts another epoch from its own previews, and logs a snapshot that cannot be packed', async () => {
    const log: Record<string, unknown>[] = [];
    const p = previews(log);
    await p.schedule();
    head = { epoch: 'e2', rev: 1 };
    fail.add(1);
    await p.schedule();
    expect(p.state()).toMatchObject({ epoch: 'e2', ready: null, failed: { rev: 1 } });
    const broken = new Previews({
      db,
      blobs,
      publicDir: tmp,
      game: 'demo',
      studioOrigin: 'https://studio.example',
      snapshot: async () => {
        throw new Error('the game is too large');
      },
      build: async () => new Map(),
      assetsVersion: () => 'ab12',
      log: (l) => log.push(l),
    });
    await broken.schedule();
    expect(log.at(-1)).toEqual({ event: 'preview-failed', message: 'the game is too large', retryMs: 5_000 });
    broken.close();
  });
});

describe("a preview's files as the worker gives them", () => {
  it('takes plain relative paths in base64, nothing else', () => {
    expect(previewFiles({ 'index.html': 'PHA+', 'assets/a-1.js': '' })).toEqual({
      'index.html': 'PHA+',
      'assets/a-1.js': '',
    });
    for (const bad of [
      null,
      [],
      'x',
      {},
      { '../index.html': 'PHA+' },
      { './index.html': 'PHA+' },
      { '/index.html': 'PHA+' },
      { 'a/../../b': 'PHA+' },
      { 'a/b/c/d/e/f': 'PHA+' },
      { 'index.html': 3 },
      { 'index.html': 'not base64!' },
      Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`f${i}`, ''])),
    ])
      expect(previewFiles(bad), JSON.stringify(bad)?.slice(0, 40)).toBeUndefined();
  });
});
