// The Studio Server's metrics and its daily backup to the bucket (4.2.3 PR 9, H9): `GET /metrics` behind its own
// secret (404 without one configured, 401 with a wrong one, never the game's origin), the secret compared in constant
// time; the values move after a journal operation, a 423, a job of the worker, a preview; `backup --to-bucket` writes
// `backups/<date>-r<rev>.json` and `--keep n` deletes only the older backups it wrote.
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { backupOf } from '../studio-server/src/ops/backup';
import { type BackupBucket, backupKey, backupToBucket, keepOf } from '../studio-server/src/ops/backup-bucket';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { StudioError } from '../studio-server/src/ops/errors';
import { Journal } from '../studio-server/src/ops/journal';
import { studioServer } from '../studio-server/src/server/http';
import { Metrics, sameSecret } from '../studio-server/src/server/metrics';
import { remoteExecutor } from '../studio-server/src/server/remote-executor';
import type { S3 } from '../studio-server/src/server/s3';
import { ServiceLease } from '../studio-server/src/server/service-lease';
import { newJobKeys, publicKeyOf, verifyJob } from '../studio-server/src/worker/job';

// The real timingSafeEqual, watched: the comparison must go through it.
const crypto = vi.hoisted(() => ({ calls: 0 }));
vi.mock('node:crypto', async (original) => {
  const real = await original<typeof import('node:crypto')>();
  return {
    ...real,
    timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
      crypto.calls++;
      return real.timingSafeEqual(a, b);
    },
  };
});

const ROOT = join(import.meta.dirname, '..');
const TOKEN = 'metrics-token-0123456789-abcdefghijklmnop';
let tmp: string;
beforeAll(() => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-metrics-'));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const listen = async (s: Server) => {
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};
/** One line's value in the text format (`name{labels} value`), or undefined. */
const sample = (text: string, series: string) => {
  const line = text.split('\n').find((l) => l.startsWith(`${series} `));
  return line === undefined ? undefined : Number(line.slice(series.length + 1));
};

describe('the metrics over HTTP', () => {
  let base: string, close: () => Promise<void>, journal: Journal, metrics: Metrics, game: string;
  const prepared = {
    list: async () => [],
    // A span another member holds, as the leases answer it.
    prepare: async (): Promise<never> => {
      throw new StudioError('assets is being edited by Léa', 423);
    },
  };
  beforeAll(async () => {
    game = join(tmp, 'game');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const db = await openSqliteDb(join(tmp, 'http.sqlite'));
    journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs')), gameDir: game });
    const lease = new ServiceLease(db, 30_000, 10_000);
    await lease.tick();
    metrics = new Metrics(TOKEN);
    metrics.measureOperations(journal);
    metrics.gauge('studio_journal_revision', 'head', () => journal.revision());
    metrics.gauge('studio_journal_rpo_seconds', 'rpo', () => 1.5);
    metrics.gauge('studio_unreadable', 'a gauge whose read fails is left out', () => {
      throw new Error('down');
    });
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    // The game's origin answers its own paths: a fake handler that says it was asked.
    const play = {
      playUrl: 'http://play.test',
      handler: {
        handle: async (_q: unknown, res: import('node:http').ServerResponse) => {
          res.writeHead(404, { 'x-play': '1' });
          res.end();
        },
      },
    };
    const server = studioServer({
      studio,
      journal,
      db,
      lease,
      log: (l) => metrics.fromLog(l),
      metrics,
      prepared: prepared as never,
      play: play as never,
    });
    base = await listen(server);
    close = async () => {
      server.close();
      await lease.release();
      await journal.close();
      await db.close();
    };
  }, 60_000);
  afterAll(() => close());

  const scrape = async (token = TOKEN) => fetch(`${base}/metrics`, { headers: { authorization: `Bearer ${token}` } });

  it('answers 401 without the token or with another, compared in constant time', async () => {
    expect((await fetch(`${base}/metrics`)).status).toBe(401);
    const before = crypto.calls;
    const wrong = await scrape('metrics-token-0123456789-abcdefghijklmnoq');
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('www-authenticate')).toMatch(/^Bearer/);
    // A token of another length is compared the same way (both digested first).
    expect((await scrape('short')).status).toBe(401);
    expect(crypto.calls).toBe(before + 2);
    expect((await fetch(`${base}/metrics`, { headers: { authorization: TOKEN } })).status).toBe(401);
    expect(sameSecret(TOKEN, TOKEN)).toBe(true);
    expect(sameSecret(`${TOKEN}x`, TOKEN)).toBe(false);
    const ok = await scrape();
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toMatch(/^text\/plain; version=0\.0\.4/);
  });

  it('is never served on the game origin', async () => {
    const status = await new Promise<{ status: number; play: unknown }>((ok, fail) => {
      const r = request(
        `${base}/metrics`,
        { headers: { host: 'play.test', authorization: `Bearer ${TOKEN}` } },
        (res) => {
          res.resume();
          ok({ status: res.statusCode!, play: res.headers['x-play'] });
        },
      );
      r.on('error', fail);
      r.end();
    });
    expect(status).toEqual({ status: 404, play: '1' });
  });

  it('moves after an operation, a 423 and a preview', async () => {
    const t0 = await (await scrape()).text();
    const confirmed = 'studio_journal_operation_seconds_count{outcome="confirmed"}';
    expect(sample(t0, confirmed)).toBeUndefined();
    expect(sample(t0, 'studio_lease_conflicts_total')).toBe(0);
    expect(sample(t0, 'studio_journal_rpo_seconds')).toBe(1.5);
    expect(t0).not.toMatch(/studio_unreadable/);
    const rev = await journal.revision();
    await journal.apply({
      author: 'lea',
      what: 'a note',
      effects: [{ path: 'notes/m.md', after: 'hello\n' }],
      respond: (r) => r,
    });
    // A refused operation is counted as such, and its refusal is the journal's own.
    await expect(
      journal.apply({ author: 'lea', what: 'nope', effects: [{ path: '../x', after: 'x' }], respond: (r) => r }),
    ).rejects.toThrow();
    const conflict = await fetch(`${base}/api/assets/prepare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    // A job since 4.2.3 (answered 202): its span conflict comes when it fails, counted then.
    expect(conflict.status).toBe(202);
    await expect
      .poll(async () => sample(await (await scrape()).text(), 'studio_lease_conflicts_total'), { timeout: 5_000 })
      .toBe(1);
    metrics.fromLog({ event: 'preview', rev: 2, ms: 1234, failed: false });
    metrics.fromLog({ event: 'ship-failed', message: 'down' });
    const t1 = await (await scrape()).text();
    expect(sample(t1, confirmed)).toBe(1);
    expect(
      (sample(t1, 'studio_journal_operation_seconds_count{outcome="refused"}') ?? 0) +
        (sample(t1, 'studio_journal_operation_seconds_count{outcome="failed"}') ?? 0),
    ).toBe(1);
    expect(sample(t1, 'studio_journal_revision')).toBe(rev + 1);
    expect(sample(t1, 'studio_lease_conflicts_total')).toBe(1);
    expect(sample(t1, 'studio_http_responses_total{class="4xx"}')).toBeGreaterThanOrEqual(1);
    expect(sample(t1, 'studio_preview_build_seconds_count{outcome="built"}')).toBe(1);
    expect(sample(t1, 'studio_preview_build_seconds_sum{outcome="built"}')).toBe(1.234);
    expect(sample(t1, 'studio_preview_build_seconds_bucket{le="2.5",outcome="built"}')).toBe(1);
    expect(sample(t1, 'studio_preview_build_seconds_bucket{le="1",outcome="built"}')).toBe(0);
    expect(sample(t1, 'studio_log_events_total{event="ship-failed"}')).toBe(1);
    // Nothing of the project: no path, no author, no operation's name.
    expect(t1).not.toMatch(/notes\/m\.md|\blea\b|Léa|a note/);
  });
});

describe('without a token configured', () => {
  it('has no /metrics route (404)', async () => {
    const db = await openSqliteDb(join(tmp, 'none.sqlite'));
    const g = join(tmp, 'game-none');
    cpSync(join(ROOT, 'games', '_template'), g, { recursive: true });
    const journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs-none')), gameDir: g });
    const lease = new ServiceLease(db, 30_000, 10_000);
    const studio = createStudio({ gameDir: g, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const server = studioServer({ studio, journal, db, lease, log: () => {} });
    const url = await listen(server);
    try {
      expect((await fetch(`${url}/metrics`, { headers: { authorization: `Bearer ${TOKEN}` } })).status).toBe(404);
    } finally {
      server.close();
      await journal.close();
      await db.close();
    }
  }, 60_000);
});

describe("the worker's jobs", () => {
  it('counts a job while it runs (the queue depth), then its duration by kind and outcome', async () => {
    const keys = newJobKeys();
    const store = new Map<string, Buffer>();
    let release!: () => void;
    const held = new Promise<void>((ok) => (release = ok));
    let calls = 0;
    const fake = createServer(async (req, res) => {
      let raw = '';
      for await (const c of req) raw += c;
      const j = verifyJob(JSON.parse(raw).token, publicKeyOf(keys.publicPem));
      if (calls++ === 0) await held;
      const result = calls === 1 ? { errors: [], warnings: [] } : { failed: 'the game threw' };
      store.set(`${j.dest}result.json`, Buffer.from(JSON.stringify({ job: j.id, kind: j.kind, ...result })));
      res.end('{}');
    });
    const url = await listen(fake);
    const s3 = {
      put: async (k: string, b: Buffer) => void store.set(k, b),
      get: async (k: string) => store.get(k),
      delete: async (k: string) => void store.delete(k),
      presign: (_m: string, k: string) => `memory://${k}`,
    } as unknown as S3;
    const metrics = new Metrics(TOKEN);
    const ex = remoteExecutor({
      s3,
      workerUrl: url,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 1 }),
      metrics,
    });
    try {
      const first = ex.validateSnapshot(Buffer.from('one'));
      await vi.waitFor(() => expect(metrics.queueDepth()).toBe(1));
      expect(await metrics.render()).toMatch(/^studio_worker_jobs_in_flight 1$/m);
      release();
      expect((await first).ok).toBe(true);
      expect(metrics.queueDepth()).toBe(0);
      await expect(ex.validateSnapshot(Buffer.from('two'))).rejects.toThrow(/the game threw/);
      // A cached answer is no job: the first snapshot again asks nothing.
      await ex.validateSnapshot(Buffer.from('one'));
      expect(metrics.jobs.count({ kind: 'validate', outcome: 'ok' })).toBe(1);
      expect(metrics.jobs.count({ kind: 'validate', outcome: 'failed' })).toBe(1);
      expect(calls).toBe(2);
      const text = await metrics.render();
      expect(text).toMatch(/^studio_worker_job_seconds_count\{kind="validate",outcome="failed"\} 1$/m);
      expect(text).toMatch(/^studio_worker_jobs_in_flight 0$/m);
    } finally {
      fake.close();
    }
  });
});

describe('backup --to-bucket', () => {
  const memoryBucket = (): BackupBucket & { m: Map<string, Buffer> } => {
    const m = new Map<string, Buffer>();
    return {
      m,
      put: async (k, b) => void m.set(k, b),
      list: async function* (p) {
        for (const k of [...m.keys()].filter((k) => k.startsWith(p))) yield { key: k };
      },
      delete: async (k) => void m.delete(k),
    };
  };

  it('names a backup by its date (UTC, sortable) and revision', () => {
    expect(backupKey({ at: Date.UTC(2026, 9, 19, 3, 17, 5, 123), revision: 42 })).toBe(
      'backups/2026-10-19T03-17-05Z-r42.json',
    );
    expect(keepOf('14')).toBe(14);
    for (const bad of [undefined, '0', '-1', '1.5', 'x', '99999']) expect(() => keepOf(bad)).toThrow(/--keep/);
  });

  it('writes the backup to the bucket and keeps the n most recent of its own', async () => {
    const db = await openSqliteDb(join(tmp, 'backup.sqlite'));
    const g = join(tmp, 'game-backup');
    cpSync(join(ROOT, 'games', '_template'), g, { recursive: true });
    const j = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'blobs-b')), gameDir: g, hosted: true });
    const bucket = memoryBucket();
    // Older backups, and objects under backups/ this command did not write: never deleted.
    for (const day of ['10', '11', '12', '13'])
      bucket.m.set(`backups/2026-10-${day}T03-17-00Z-r1.json`, Buffer.from('{}'));
    bucket.m.set('backups/hand-made.json', Buffer.from('{}'));
    bucket.m.set('sha256/abc', Buffer.from('blob'));
    try {
      const b = await backupOf(db, Date.UTC(2026, 9, 19, 3, 17, 0));
      const first = await backupToBucket(bucket, b);
      expect(first).toEqual({ key: `backups/2026-10-19T03-17-00Z-r${b.revision}.json`, removed: [] });
      expect(JSON.parse(bucket.m.get(first.key)!.toString())).toEqual(b);
      const later = await backupOf(db, Date.UTC(2026, 9, 20, 3, 17, 0));
      const r = await backupToBucket(bucket, later, 3);
      expect(r.removed.sort()).toEqual([
        'backups/2026-10-10T03-17-00Z-r1.json',
        'backups/2026-10-11T03-17-00Z-r1.json',
        'backups/2026-10-12T03-17-00Z-r1.json',
      ]);
      expect([...bucket.m.keys()].sort()).toEqual([
        'backups/2026-10-13T03-17-00Z-r1.json',
        first.key,
        r.key,
        'backups/hand-made.json',
        'sha256/abc',
      ]);
      // --keep 1 keeps the one just written only.
      expect((await backupToBucket(bucket, later, 1)).removed.sort()).toEqual([
        'backups/2026-10-13T03-17-00Z-r1.json',
        first.key,
      ]);
      expect([...bucket.m.keys()].filter((k) => k.startsWith('backups/2026'))).toEqual([r.key]);
    } finally {
      await j.close();
      await db.close();
    }
  });
});

describe("a preview's and a job's phases (4.4.0)", () => {
  it('are read from their log lines, each phase its own series, a bad value left out', async () => {
    const m = new Metrics('t'.repeat(32));
    m.fromLog({
      event: 'preview',
      rev: 2,
      ms: 4_000,
      failed: false,
      queuedMs: 1_500,
      snapMs: 20,
      jobMs: 3_000,
      storeMs: 1_000,
      sinceWriteMs: 5_520,
    });
    // A line without its own time is not a preview's; a phase that is no duration is left out.
    m.fromLog({ event: 'preview', rev: 3, queuedMs: 1 });
    m.fromLog({ event: 'preview', rev: 4, ms: 1, queuedMs: -1, snapMs: Number.NaN, jobMs: '3' });
    m.fromLog({ event: 'worker-call', kind: 'preview', outcome: 'ok', putMs: 30, postMs: 6_000, getMs: 40, delMs: 0 });
    m.fromLog({ event: 'worker-call', outcome: 'ok', putMs: 30 });
    const text = await m.render();
    expect(sample(text, 'studio_preview_phase_seconds_count{phase="queued"}')).toBe(1);
    expect(sample(text, 'studio_preview_phase_seconds_sum{phase="queued"}')).toBe(1.5);
    expect(sample(text, 'studio_preview_phase_seconds_sum{phase="snapshot"}')).toBe(0.02);
    expect(sample(text, 'studio_preview_phase_seconds_sum{phase="job"}')).toBe(3);
    expect(sample(text, 'studio_preview_phase_seconds_sum{phase="store"}')).toBe(1);
    expect(sample(text, 'studio_preview_phase_seconds_sum{phase="since_write"}')).toBe(5.52);
    expect(sample(text, 'studio_preview_phase_seconds_count{phase="snapshot"}')).toBe(1);
    expect(sample(text, 'studio_preview_phase_seconds_count{phase="job"}')).toBe(1);
    expect(sample(text, 'studio_preview_build_seconds_count{outcome="built"}')).toBe(2);
    expect(sample(text, 'studio_worker_job_phase_seconds_sum{kind="preview",phase="put"}')).toBe(0.03);
    expect(sample(text, 'studio_worker_job_phase_seconds_sum{kind="preview",phase="post"}')).toBe(6);
    expect(sample(text, 'studio_worker_job_phase_seconds_sum{kind="preview",phase="get"}')).toBe(0.04);
    expect(sample(text, 'studio_worker_job_phase_seconds_count{kind="preview",phase="del"}')).toBe(1);
    expect(text.match(/^studio_worker_job_phase_seconds_count/gm)).toHaveLength(4);
    expect(text).toContain('# HELP studio_preview_build_seconds');
    expect(text).not.toMatch(/studio_preview_build_seconds A revision's preview: the snapshot/);
  });
});
