// The Studio Server (4.2.1, plan §4, §7 row 4): its configuration and secrets, its probes, the API of the dev server
// under /api/ with the journal's cursor, writes refused without the service lease, a lease taken over only at its
// expiry, and import → serve → export through the real command. The hosted pair (Postgres and an S3 such as MinIO)
// runs when STUDIO_TEST_PG_URL and STUDIO_TEST_S3 (`http://key:secret@host:port/bucket`) are set, as in CI.
import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSqliteDb } from '../bridge/src/store-sqlite';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { fsBlobStore } from '../studio-server/src/ops/blobs';
import { sha256 } from '../studio-server/src/ops/durable';
import { Journal } from '../studio-server/src/ops/journal';
import { migrate } from '../bridge/src/migrations';
import { backupOf, checkBackup, restoreInto } from '../studio-server/src/ops/backup';
import { finishRestore, replaySegments, Shipper } from '../studio-server/src/ops/ship';
import { ConfigError, loadConfig, takeSecrets, withoutConfig } from '../studio-server/src/server/config';
import { studioServer } from '../studio-server/src/server/http';
import { openPostgresDb } from '../studio-server/src/server/postgres';
import { S3, s3BlobStore } from '../studio-server/src/server/s3';
import { ServiceLease } from '../studio-server/src/server/service-lease';

const ROOT = join(import.meta.dirname, '..');
let tmp: string;
beforeAll(() => {
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'studio-server-'));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('configuration and secrets', () => {
  it('reads a secret from a file (0600) or the environment, then removes it from the environment', () => {
    const f = join(tmp, 'db-url');
    writeFileSync(f, 'postgres://u:p@h/db\n');
    chmodSync(f, 0o600);
    const env: NodeJS.ProcessEnv = {
      STUDIO_DATABASE_URL_FILE: f,
      CELLAR_ADDON_KEY_ID: 'key-id-12345',
      CELLAR_ADDON_KEY_SECRET: 'secret-123456789',
      OTHER: 'kept',
    };
    const s = takeSecrets(env);
    expect(s).toEqual({
      STUDIO_DATABASE_URL: 'postgres://u:p@h/db',
      STUDIO_S3_KEY_ID: 'key-id-12345',
      STUDIO_S3_KEY_SECRET: 'secret-123456789',
    });
    expect(env).toEqual({ OTHER: 'kept' });
  });

  it('refuses a secret file others can read, and a secret too short', () => {
    const f = join(tmp, 'open-secret');
    writeFileSync(f, 'a-long-enough-secret');
    chmodSync(f, 0o644);
    // Windows has no such mode bits: the check is POSIX only (config.ts).
    if (process.platform !== 'win32') expect(() => takeSecrets({ STUDIO_SESSION_KEY_FILE: f })).toThrow(ConfigError);
    expect(() => takeSecrets({ STUDIO_SESSION_KEY: 'short' })).toThrow(/too short/);
  });

  it('refuses a game origin equal to the Studio origin, and unknown keys', () => {
    const f = join(tmp, 'c.json');
    const base = {
      publicUrl: 'https://studio.example.fr',
      playUrl: 'https://play.example.fr',
      game: 'demo',
      workDir: tmp,
      store: { kind: 'sqlite', file: join(tmp, 'j.sqlite') },
      blobs: { kind: 'fs', dir: join(tmp, 'blobs') },
    };
    writeFileSync(f, JSON.stringify(base));
    expect(loadConfig(f).playUrl).toBe('https://play.example.fr');
    writeFileSync(f, JSON.stringify({ ...base, playUrl: 'https://studio.example.fr/play' }));
    expect(() => loadConfig(f)).toThrow(/another origin/);
    // With OIDC, an address beyond the loopback needs trustProxy: behind a proxy, every client shares one address.
    const oidc = { issuer: 'https://id.example.fr/realms/s', clientId: 'studio', audience: 'studio-api' };
    const hosted = {
      ...base,
      oidc,
      blobs: { kind: 's3', host: 'cellar-c2.services.clever-cloud.com', bucket: 'b' },
      worker: { url: 'https://worker.example.fr', instance: 'studio-a' },
    };
    writeFileSync(f, JSON.stringify(hosted));
    expect(() => loadConfig(f)).toThrow(/trustProxy is required/);
    writeFileSync(f, JSON.stringify({ ...hosted, trustProxy: ['10.0.0.0/8'] }));
    expect(loadConfig(f).trustProxy).toEqual(['10.0.0.0/8']);
    // With OIDC the game's code runs in the worker only (ADR 0028): no worker, or blobs it cannot read, is refused.
    writeFileSync(f, JSON.stringify({ ...hosted, trustProxy: ['10.0.0.0/8'], worker: undefined }));
    expect(() => loadConfig(f)).toThrow(/worker.url and worker.instance are required/);
    writeFileSync(f, JSON.stringify({ ...hosted, trustProxy: ['10.0.0.0/8'], blobs: base.blobs }));
    expect(() => loadConfig(f)).toThrow(/blobs.kind is s3/);
    // The example the hosting guide starts from is a valid configuration; the same JSON may come from a variable.
    const example = readFileSync(join(ROOT, 'ops', 'studio', 'studio.config.example.json'), 'utf8');
    expect(loadConfig('STUDIO_CONFIG_JSON', example).worker?.instance).toBe('my-game-studio');
    expect(() => loadConfig('STUDIO_CONFIG_JSON', '{ nope')).toThrow(ConfigError);
    // A command's arguments, with or without `--config` (4.2.3: without it, the first one was dropped and the daily
    // `backup --to-bucket` of ops/studio/backup-cron.sh failed).
    expect(withoutConfig(['--to-bucket', '--keep', '14'])).toEqual(['--to-bucket', '--keep', '14']);
    expect(withoutConfig(['games/demo', '--config', 'c.json'])).toEqual(['games/demo']);
    expect(withoutConfig(['--config', 'c.json', '--email', 'a@b.fr'])).toEqual(['--email', 'a@b.fr']);
    // Public builds (4.2.2, D42): off unless said, and said with a boolean.
    writeFileSync(f, JSON.stringify(base));
    expect(loadConfig(f).publicBuilds).toBe(false);
    writeFileSync(f, JSON.stringify({ ...base, publicBuilds: true }));
    expect(loadConfig(f).publicBuilds).toBe(true);
    writeFileSync(f, JSON.stringify({ ...base, publicBuilds: 'yes' }));
    expect(() => loadConfig(f)).toThrow(/publicBuilds is true or false/);
    writeFileSync(f, JSON.stringify({ ...base, typo: 1 }));
    expect(() => loadConfig(f)).toThrow(/unknown key "typo"/);
    // The game's repository (4.2.3, H5): its URL without credentials, a branch name, a folder inside, a committer.
    const git = {
      remote: 'git@example.org:org/game.git',
      branch: 'main',
      path: 'games/g',
      committer: { name: 'S', email: 's@x' },
    };
    writeFileSync(f, JSON.stringify({ ...base, git }));
    expect(loadConfig(f).git).toEqual(git);
    for (const [bad, why] of [
      [{ remote: '' }, /git.remote/],
      [{ remote: 'https://user:pw@example.org/g.git' }, /no credentials/],
      [{ ...git, branch: 'a b' }, /git.branch/],
      [{ ...git, path: '../out' }, /git.path/],
      [{ ...git, committer: { name: 'S', email: 'nope' } }, /git.committer/],
    ] as const) {
      writeFileSync(f, JSON.stringify({ ...base, git: bad }));
      expect(() => loadConfig(f)).toThrow(why);
    }
  });
});

describe('the server over HTTP (SQLite, files)', () => {
  let base: string, close: () => Promise<void>, game: string, lease: ServiceLease;
  let db: Awaited<ReturnType<typeof openSqliteDb>>, journal: Journal;
  beforeAll(async () => {
    game = join(tmp, 'http-game');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    db = await openSqliteDb(join(tmp, 'http.sqlite'));
    journal = await Journal.open({ db, blobs: fsBlobStore(join(tmp, 'http-blobs')), gameDir: game });
    lease = new ServiceLease(db, 30_000, 10_000);
    await lease.tick();
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const server = studioServer({ studio, journal, db, lease, log: () => {} });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Everything opened is closed before the folder goes: Windows deletes no open file.
    close = async () => {
      server.close();
      await lease.release();
      await journal.close();
      await db.close();
    };
  }, 60_000);
  afterAll(() => close());

  it('answers its probes', async () => {
    expect((await fetch(`${base}/livez`)).status).toBe(200);
    expect((await fetch(`${base}/startz`)).status).toBe(200);
    expect(await (await fetch(`${base}/readyz`)).json()).toEqual({ ok: true, writes: 'served' });
  });

  it('lists and prepares the assets when the worker prepares them (4.2.2), as a job (4.2.3)', async () => {
    expect((await fetch(`${base}/api/assets/prepared`)).status).toBe(404);
    const calls: string[] = [];
    const prepared = {
      list: async () => (calls.push('list'), [{ id: 1 }]),
      prepare: async (by: string) => (calls.push(`prepare ${by}`), { id: 2, rev: 3, files: 9 }),
    };
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const s2 = studioServer({ studio, journal, db, lease, log: () => {}, prepared: prepared as never });
    await new Promise<void>((ok) => s2.listen(0, '127.0.0.1', ok));
    const api = `http://127.0.0.1:${(s2.address() as AddressInfo).port}/api`;
    try {
      expect(await (await fetch(`${api}/assets/prepared`)).json()).toEqual({ runs: [{ id: 1 }] });
      const r = await fetch(`${api}/assets/prepare`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      // A job since 4.2.3 (H8): answered at once, its result read when it is done.
      expect(r.status).toBe(202);
      const { id } = (await r.json()) as { id: string };
      let job: { state: string; result?: unknown } = { state: 'queued' };
      for (let i = 0; i < 100 && job.state !== 'done'; i++) {
        await new Promise((ok) => setTimeout(ok, 20));
        job = await (await fetch(`${api}/jobs/${id}`)).json();
      }
      expect(job).toMatchObject({ state: 'done', result: { id: 2, rev: 3, files: 9 } });
      expect((await fetch(`${api}/assets/prepare`)).status).toBe(404);
      expect(calls).toEqual(['list', 'prepare local']);
    } finally {
      s2.close();
    }
  });

  it('lists, reads, publishes and rebuilds builds when they are served (4.2.2)', async () => {
    expect((await fetch(`${base}/api/builds`)).status).toBe(404);
    const calls: string[] = [];
    const builds = {
      list: async () => (calls.push('list'), [{ n: 1 }]),
      get: async (n: number) => (calls.push(`get ${n}`), n === 1 ? { manifest: { n: 1 }, signature: 's' } : undefined),
      publish: async (by: string) => (calls.push(`publish ${by}`), { n: 2 }),
      rebuild: async (n: number) => (calls.push(`rebuild ${n}`), { n, same: true, differ: [] }),
    };
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const s2 = studioServer({ studio, journal, db, lease, log: () => {}, builds: builds as never });
    await new Promise<void>((ok) => s2.listen(0, '127.0.0.1', ok));
    const api = `http://127.0.0.1:${(s2.address() as AddressInfo).port}/api`;
    const post = (p: string) =>
      fetch(`${api}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    try {
      expect(await (await fetch(`${api}/builds`)).json()).toEqual({ builds: [{ n: 1 }] });
      expect(await (await fetch(`${api}/builds/1`)).json()).toEqual({ manifest: { n: 1 }, signature: 's' });
      expect((await fetch(`${api}/builds/9`)).status).toBe(404);
      expect(await (await post('/builds')).json()).toEqual({ n: 2 });
      expect(await (await post('/builds/1/rebuild')).json()).toEqual({ n: 1, same: true, differ: [] });
      expect((await post('/builds/1/nope')).status).toBe(404);
      expect(calls).toEqual(['list', 'get 1', 'get 9', 'publish local', 'rebuild 1']);
    } finally {
      s2.close();
    }
  });

  it('runs a bisection asked for when the health is followed, with revision numbers only (4.2.2)', async () => {
    expect((await fetch(`${base}/api/health/bisect`, { method: 'POST', body: '{}' })).status).toBe(404);
    const asked: [number, number][] = [];
    const { EventEmitter } = await import('node:events');
    const health = {
      events: new EventEmitter(),
      state: () => null,
      bisectOn: async (good: number, bad: number) => {
        asked.push([good, bad]);
        return bad > 5 ? { error: `revision ${bad} is past the head (5)` } : { rev: 4, what: 'w', paths: ['a.ts'] };
      },
    };
    const studio = createStudio({ gameDir: game, root: tmp, journal, importFresh: importInChild, author: 'test' });
    const s2 = studioServer({ studio, journal, db, lease, log: () => {}, health: health as never });
    await new Promise<void>((ok) => s2.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(s2.address() as AddressInfo).port}/api/health/bisect`;
    const post = (body: unknown) =>
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      const ok = await post({ good: 1, bad: 5 });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ rev: 4, what: 'w', paths: ['a.ts'] });
      const past = await post({ good: 1, bad: 9 });
      expect(past.status).toBe(400);
      expect(await past.json()).toMatchObject({ error: 'revision 9 is past the head (5)' });
      for (const body of [{ good: '1', bad: 5 }, { good: 1 }, { good: null, bad: true }])
        expect((await post(body)).status, JSON.stringify(body)).toBe(400);
      expect(asked).toEqual([
        [1, 5],
        [1, 9],
      ]);
    } finally {
      s2.close();
    }
  });

  it('serves the dev server API under /api/, and each write moves the revision', async () => {
    const info = (await (await fetch(`${base}/api/game`)).json()) as { id: string; rooms: { id: string }[] };
    expect(info.rooms.length).toBeGreaterThan(0);
    const r0 = (await (await fetch(`${base}/api/revision`)).json()) as { epoch: string; revision: number };
    const put = await fetch(`${base}/api/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'a note through the server' }),
    });
    expect(put.status).toBe(200);
    const r1 = (await (await fetch(`${base}/api/revision`)).json()) as { revision: number };
    expect(r1.revision).toBe(r0.revision + 1);
    const ops = (await (await fetch(`${base}/api/ops?epoch=${r0.epoch}&after=${r0.revision}`)).json()) as {
      ops: { rev: number; paths: string[] }[];
    };
    expect(ops.ops.map((o) => o.paths)).toEqual([['notes.json']]);
    expect((await fetch(`${base}/api/ops?epoch=another&after=0`)).status).toBe(409);
  }, 60_000);

  it('a write retried with its operation id gets the same answer and is applied once', async () => {
    const send = () =>
      fetch(`${base}/api/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-studio-op': 'retry-test-0001' },
        body: JSON.stringify({ text: 'once' }),
      });
    const r1 = await send();
    const before = ((await (await fetch(`${base}/api/revision`)).json()) as { revision: number }).revision;
    const r2 = await send();
    expect(r2.headers.get('x-studio-replayed')).toBe('1');
    expect(await r2.json()).toEqual(await r1.json());
    expect(((await (await fetch(`${base}/api/revision`)).json()) as { revision: number }).revision).toBe(before);
    const notes = (await (await fetch(`${base}/api/notes`)).json()) as { entries: { text: string }[] };
    expect(notes.entries.filter((n) => n.text === 'once')).toHaveLength(1);
  });

  it('a Studio refusal keeps its status and body; an unknown route is a 404', async () => {
    const r = await fetch(`${base}/api/room/no_such_room/layout`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toMatch(/unknown room/);
    expect((await fetch(`${base}/elsewhere`)).status).toBe(404);
  });

  it('a request refused before its first await leaves the server answering', async () => {
    const bad = await fetch(`${base}/api/room/start/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(bad.status).toBe(400);
    const next = await fetch(`${base}/api/game`, { signal: AbortSignal.timeout(5000) });
    expect(next.status).toBe(200);
  });

  it('the cursor gives the next revision to ask from, and refuses a cursor that is no number', async () => {
    const r = (await (await fetch(`${base}/api/ops?after=0`)).json()) as { next: number; ops: { rev: number }[] };
    expect(r.next).toBe(r.ops.at(-1)?.rev);
    expect((await fetch(`${base}/api/ops?after=abc`)).status).toBe(400);
  });

  it('without the service lease, a write is a 503 with Retry-After and a read still works', async () => {
    await lease.release();
    const r = await fetch(`${base}/api/room/start/layout`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBe('2');
    expect((await fetch(`${base}/readyz`)).status).toBe(503);
    expect((await fetch(`${base}/api/game`)).status).toBe(200);
  });
});

describe('the service lease', () => {
  it('a second instance waits until the first gives the lease back or it expires, with a new fence', async () => {
    const db = await openSqliteDb(join(tmp, 'lease.sqlite'));
    const { migrate } = await import('../bridge/src/migrations');
    await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
    const a = new ServiceLease(db, 400, 100);
    const b = new ServiceLease(db, 400, 100);
    expect(await a.tick()).toBe(true);
    expect(await b.tick()).toBe(false);
    // A stops renewing (frozen, cut off): B takes over at the expiry, and A's own clock already stopped its writes.
    await new Promise((ok) => setTimeout(ok, 450));
    expect(a.held).toBe(false);
    expect(await b.tick()).toBe(true);
    const [row] = await db.all('SELECT fence FROM studio_service WHERE id = 1');
    expect(Number(row?.fence)).toBe(2);
    await b.release();
    await db.close();
  });

  it('a newer instance asks, and the holder gives the lease back at its next renewal; never the other way (4.2.3)', async () => {
    const db = await openSqliteDb(join(tmp, 'handoff.sqlite'));
    const { migrate } = await import('../bridge/src/migrations');
    await migrate(db, { dir: new URL('../studio-server/migrations/', import.meta.url) });
    const old = new ServiceLease(db, 60_000, 20_000);
    expect(await old.tick()).toBe(true);
    await new Promise((ok) => setTimeout(ok, 5));
    // A deploy: the new instance starts beside the old one, which renews and was never told to stop.
    const young = new ServiceLease(db, 60_000, 20_000);
    expect(await young.tick()).toBe(false);
    expect(old.held).toBe(true);
    // The old one's next renewal gives it back, its writes stopped at once; the new one takes it, with a new fence.
    expect(await old.tick()).toBe(false);
    expect(old.held).toBe(false);
    // The old one, trying again first, leaves it to the one asking.
    expect(await old.tick()).toBe(false);
    expect(await young.tick()).toBe(true);
    const [row] = await db.all('SELECT fence FROM studio_service WHERE id = 1');
    expect(Number(row?.fence)).toBe(2);
    // The old one, still alive, asks in turn: the newer one keeps it, renewal after renewal.
    expect(await old.tick()).toBe(false);
    expect(await young.tick()).toBe(true);
    expect(await old.tick()).toBe(false);
    expect(await young.tick()).toBe(true);
    // An ask that expired, or that nobody rewrote for 5 s (its instance gone), is no longer heeded, however new.
    await db.run("INSERT OR REPLACE INTO studio_service (id, instance, fence, until_ms) VALUES (2, 'gone', 9e15, 0)");
    expect(await young.tick()).toBe(true);
    const [{ now }] = (await db.all("SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER) AS now")) as { now: number }[];
    await db.run("INSERT OR REPLACE INTO studio_service (id, instance, fence, until_ms) VALUES (2, 'gone', 9e15, $1)", [
      Number(now) + 60_000 - 6_000,
    ]);
    expect(await young.tick()).toBe(true);
    // A deploy cancelled while it waited: its ask goes with it.
    const cancelled = new ServiceLease(db, 60_000, 20_000);
    await new Promise((ok) => setTimeout(ok, 5));
    await db.run('DELETE FROM studio_service WHERE id = 2');
    expect(await cancelled.tick()).toBe(false);
    expect(await db.all('SELECT instance FROM studio_service WHERE id = 2')).toEqual([
      { instance: cancelled.instance },
    ]);
    await cancelled.release();
    expect(await db.all('SELECT instance FROM studio_service WHERE id = 2')).toEqual([]);
    expect(await young.tick()).toBe(true);
    await young.release();
    await old.release();
    await db.close();
  });
});

describe('import, serve, export through the command', () => {
  it('a game imported, then exported at its head, is the same files with a manifest of their hashes', () => {
    const work = join(tmp, 'cmd');
    const cfg = join(tmp, 'cmd.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        publicUrl: 'https://studio.example.fr',
        playUrl: 'https://play.example.fr',
        game: 'template',
        workDir: work,
        host: '127.0.0.1',
        store: { kind: 'sqlite', file: join(work, 'journal.sqlite') },
        blobs: { kind: 'fs', dir: join(work, 'blobs') },
      }),
    );
    const run = (...a: string[]) =>
      execFileSync(
        process.execPath,
        ['--import', 'tsx', join(ROOT, 'studio-server/src/server/main.ts'), ...a, '--config', cfg],
        {
          cwd: ROOT,
          encoding: 'utf8',
        },
      );
    expect(run('import', join(ROOT, 'games', '_template'))).toContain('"imported"');
    const out = join(tmp, 'exported');
    expect(run('export', out)).toContain('"exported"');
    // The configuration from STUDIO_CONFIG_JSON, no --config: the command keeps its first argument (4.2.3, the daily
    // backup's cron), and invite reads only the flags it is given.
    const bare = (...a: string[]) =>
      execFileSync(process.execPath, ['--import', 'tsx', join(ROOT, 'studio-server/src/server/main.ts'), ...a], {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'STUDIO_CONFIG')),
          STUDIO_CONFIG_JSON: readFileSync(cfg, 'utf8'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    expect(bare('export', join(tmp, 'exported-bare'))).toContain('"exported"');
    expect(() => bare('invite', 'owner', '--email', 'a@b.fr')).toThrow();
    expect(() => bare('invite', '--email', '--role', 'dev')).toThrow();
    const m = JSON.parse(readFileSync(join(out, 'export-manifest.json'), 'utf8')) as {
      revision: number;
      files: { path: string; blob: string }[];
    };
    expect(m.revision).toBe(1);
    for (const f of m.files) expect(sha256(readFileSync(join(out, f.path)))).toBe(f.blob);
    expect(existsSync(join(out, 'index.ts'))).toBe(true);
    // serve refuses any address but the loopback until authentication exists (PR 5).
    const wide = join(tmp, 'wide.json');
    writeFileSync(wide, readFileSync(cfg, 'utf8').replace('"127.0.0.1"', '"0.0.0.0"'));
    expect(() =>
      execFileSync(
        process.execPath,
        ['--import', 'tsx', join(ROOT, 'studio-server/src/server/main.ts'), 'serve', '--config', wide],
        {
          cwd: ROOT,
          stdio: 'pipe',
        },
      ),
    ).toThrow(/refused without authentication/);
  }, 120_000);
});

const PG = process.env.STUDIO_TEST_PG_URL;
const S3URL = process.env.STUDIO_TEST_S3;
describe.runIf(PG && S3URL)('hosted: Postgres and S3', () => {
  const s3 = () => {
    const u = new URL(S3URL!);
    return new S3({
      endpoint: `${u.protocol}//${u.host}`,
      bucket: u.pathname.slice(1),
      keyId: decodeURIComponent(u.username),
      secret: decodeURIComponent(u.password),
    });
  };

  it('stores, reads back and presigns objects; a presigned URL expires', async () => {
    const c = s3();
    const store = s3BlobStore(c);
    const h = await store.put(Buffer.from('hello'));
    expect((await store.get(h)).toString()).toBe('hello');
    const url = c.presign('GET', `sha256/${h}`, 60);
    expect(await (await fetch(url)).text()).toBe('hello');
    const short = c.presign('GET', `sha256/${h}`, 1);
    await new Promise((ok) => setTimeout(ok, 2100));
    expect((await fetch(short)).status).toBe(403);
  }, 30_000);

  it('backs up, ships the journal to the bucket, restores and replays, on Postgres (4.2.2)', async () => {
    const db = await openPostgresDb(PG!);
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const game = join(tmp, 'backup-game');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const c = s3();
    const blobs = s3BlobStore(c);
    const j = await Journal.open({ db, blobs, gameDir: game, hosted: true });
    const write = (after: string) =>
      j.apply({ author: 'lea', what: 'w', effects: [{ path: 'notes.json', after }], respond: () => 0 });
    await write('{"entries":[1]}');
    const prefix = `test-ship-${Date.now()}/`;
    const segments = {
      put: (k: string, b: Buffer) => c.put(prefix + k, b),
      get: (k: string) => c.get(prefix + k),
      list: async function* (p: string) {
        for await (const o of c.list(prefix + p)) yield { key: o.key.slice(prefix.length) };
      },
    };
    const ship = new Shipper({ db, segments });
    await ship.ship();
    const b = checkBackup(JSON.parse(JSON.stringify(await backupOf(db))));
    await write('{"entries":[2]}');
    await ship.ship();
    expect(await ship.rpoMs()).toBe(0);
    const last = await j.revision();
    await j.close();
    // The database is lost: a new one, restored, then the journal shipped since (closing the journal ended its pool).
    const db2 = await openPostgresDb(PG!);
    await db2.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate(db2, { dir: new URL('../studio-server/migrations/', import.meta.url) });
    await restoreInto(db2, blobs, b);
    expect(await replaySegments(db2, segments, blobs)).toEqual({ revision: last, stopped: undefined });
    await finishRestore(db2);
    const [f] = await db2.all("SELECT blob FROM studio_files WHERE path = 'notes.json'");
    expect((await blobs.get(String(f!.blob))).toString()).toBe('{"entries":[2]}');
    // The bucket lists its blobs, as the collection reads them.
    let seen = 0;
    for await (const x of blobs.list!()) if (x.hash === String(f!.blob)) seen++;
    expect(seen).toBe(1);
    for await (const o of c.list(prefix)) await c.delete(o.key);
    await db2.close();
  }, 60_000);

  it('a hosted journal rebuilds a lost folder from the database and the blobs', async () => {
    const db = await openPostgresDb(PG!);
    // A clean schema, whatever ran here before: no list of tables to keep in step with the migrations.
    await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    const game = join(tmp, 'hosted-game');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const blobs = s3BlobStore(s3());
    const j = await Journal.open({ db, blobs, gameDir: game, hosted: true });
    await j.apply({
      author: 'lea',
      what: 'w',
      effects: [{ path: 'notes.json', after: '{"entries":[]}' }],
      respond: () => 0,
    });
    const head = await j.revision();
    await j.close();
    // The instance's disk is gone (a redeploy): a new one rebuilds the folder.
    rmSync(game, { recursive: true, force: true });
    mkdirSync(game);
    const db2 = await openPostgresDb(PG!);
    const k = await Journal.open({ db: db2, blobs, gameDir: game, hosted: true });
    expect(await k.revision()).toBe(head);
    expect(readFileSync(join(game, 'notes.json'), 'utf8')).toBe('{"entries":[]}');
    expect(existsSync(join(game, 'index.ts'))).toBe(true);
    await k.close();
  }, 120_000);

  it('an instance whose folder is behind the head follows the head, never adopts its stale folder', async () => {
    const blobs = s3BlobStore(s3());
    const g1 = join(tmp, 'hosted-a'),
      g2 = join(tmp, 'hosted-b');
    mkdirSync(g1);
    mkdirSync(g2);
    // Both instances of the same project (the database above): B opens (materialised), then A confirms more.
    const a = await Journal.open({ db: await openPostgresDb(PG!), blobs, gameDir: g1, hosted: true });
    const b = await Journal.open({ db: await openPostgresDb(PG!), blobs, gameDir: g2, hosted: true });
    await a.apply({
      author: 'a',
      what: 'a1',
      effects: [{ path: 'notes.json', after: '{"by":"a"}' }],
      respond: () => 0,
    });
    const afterA = await a.revision();
    // B's next operation settles first: it brings its folder to the head, then writes.
    await b.apply({
      author: 'b',
      what: 'b1',
      effects: [{ path: 'storyboard.json', after: '{"boards":[]}' }],
      respond: () => 0,
    });
    expect(readFileSync(join(g2, 'notes.json'), 'utf8')).toBe('{"by":"a"}');
    const ops = await b.opsAfter(afterA - 1);
    expect(ops.map((o) => o.author)).toEqual(['a', 'b']);
    await a.close();
    await b.close();
  }, 120_000);
});
