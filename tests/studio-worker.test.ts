// The processing worker (4.2.1, plan §3.8, ADR 0028): signed single-use jobs, snapshots that stay in their folder, a
// child with an emptied environment killed with its process group at its deadline, and the Studio's acceptance of a
// result. The round trip through Cellar (presigned URLs scoped to one key) runs when STUDIO_TEST_S3 is set, as in CI.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagnosisShaped, remoteExecutor } from '../studio-server/src/server/remote-executor';
import { S3 } from '../studio-server/src/server/s3';
import { type Job, newJobKeys, privateKeyOf, publicKeyOf, signJob, verifyJob } from '../studio-server/src/worker/job';
import { createWorker, runChild } from '../studio-server/src/worker/main';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { validateDir } from '../studio-server/src/ops/validate-dir';
import type { GameModule } from '../tools/game';
import type { LintData, PlaytestsData, SolveData } from '../tools/studio/types';
import { lintIn, solveIn } from '../studio-server/src/ops/diagnose';
import { localPreview } from '../studio-server/src/worker/local';
import { PreviewBuildFailed } from '../studio-server/src/worker/preview-build';
import { filesOf, packAssets, packSnapshot, unpackSnapshot } from '../studio-server/src/worker/snapshot';

const ROOT = join(import.meta.dirname, '..');
const keys = newJobKeys();
/** Python with the asset tools' packages, and ffmpeg (CI's jobs with Python; a maintainer's machine). */
const hasAssetTools = (() => {
  try {
    execFileSync('python3', ['-c', 'import PIL, numpy'], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
let tmp: string;

beforeAll(() => {
  mkdirSync(join(ROOT, '.cache', 'jobs'), { recursive: true });
  tmp = mkdtempSync(join(ROOT, '.cache', 'jobs', 'test-'));
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const job = (o: Partial<Job> = {}): Job => {
  const id = o.id ?? randomUUID();
  return {
    id,
    instance: 'studio-a',
    epoch: 'e1',
    rev: 3,
    kind: 'validate',
    params: {},
    snapshot: 'ab'.repeat(32),
    dest: `staging/${id}/`,
    exp: Date.now() + 60_000,
    urls: { snapshot: 'http://127.0.0.1:1/s', result: 'http://127.0.0.1:1/r' },
    ...o,
  };
};

describe('a job', () => {
  const priv = privateKeyOf(keys.privatePem);
  const pub = publicKeyOf(keys.publicPem);

  it('is checked with the public key alone, and every signed field is bound', () => {
    const j = job();
    expect(verifyJob(signJob(j, priv), pub)).toEqual(j);
    const [body, sig] = signJob(j, priv).split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...j, urls: { ...j.urls, snapshot: 'http://evil.example/s' } }),
    ).toString('base64url');
    expect(() => verifyJob(`${forged}.${sig}`, pub)).toThrow(/not signed/);
    expect(() => verifyJob(`${body}.`, pub)).toThrow(/not signed/);
    const other = newJobKeys();
    expect(() => verifyJob(signJob(j, privateKeyOf(other.privatePem)), pub)).toThrow(/not signed/);
  });

  it('expires within 5 min, writes under its own staging prefix only, and is of a known kind', () => {
    expect(() => verifyJob(signJob(job({ exp: Date.now() - 1 }), priv), pub)).toThrow(/expired/);
    expect(() => verifyJob(signJob(job({ exp: Date.now() + 10 * 60_000 }), priv), pub)).toThrow(
      /lives longer than a job may/,
    );
    expect(() => verifyJob(signJob(job({ dest: 'sha256/' }), priv), pub)).toThrow(/staging prefix/);
    expect(() => verifyJob(signJob(job({ kind: 'build' as never }), priv), pub)).toThrow(/unknown job kind/);
  });
});

describe('a snapshot', () => {
  it('carries the sources and data, never the art, the sound or the private folder', () => {
    const game = join(tmp, 'g1');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    mkdirSync(join(game, 'private'), { recursive: true });
    writeFileSync(join(game, 'private', 'notes.md'), 'secret');
    const s = JSON.parse(packSnapshot(game).toString()) as { files: { path: string }[] };
    const paths = s.files.map((f) => f.path);
    expect(paths).toContain('index.ts');
    expect(paths).toContain('assets.gen.json');
    expect(paths.some((p) => /^(art|audio|private|tests)\//.test(p))).toBe(false);
  });

  it('never writes outside its folder', () => {
    const bad = (path: string) => Buffer.from(JSON.stringify({ v: 1, files: [{ path, text: 'x' }] }));
    const into = join(tmp, 'u1');
    mkdirSync(into);
    for (const p of ['../escape.ts', '/etc/x.ts', 'a/../../b.ts', '.env.ts', 'a//b.ts'])
      expect(() => unpackSnapshot(bad(p), into), p).toThrow();
    expect(() => unpackSnapshot(bad('run.sh'), into)).toThrow(/not a snapshot/);
    expect(existsSync(join(tmp, 'escape.ts'))).toBe(false);
  });
});

describe('the child', () => {
  it('validates a game, with none of the parent environment', async () => {
    process.env.STUDIO_TEST_SECRET = 'must-not-leak';
    try {
      const game = join(tmp, 'g2');
      cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
      const seen = join(tmp, 'env.json');
      writeFileSync(
        join(game, 'index.ts'),
        `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(seen)}, JSON.stringify(process.env));\n${readFileSync(join(game, 'index.ts'), 'utf8')}`,
      );
      const r = await runChild(game, 60_000);
      expect(r.timedOut).toBe(false);
      const env = JSON.parse(readFileSync(seen, 'utf8')) as Record<string, string>;
      expect(env.STUDIO_TEST_SECRET).toBeUndefined();
      expect(Object.keys(env).filter((k) => /KEY|SECRET|TOKEN|PASSWORD|DATABASE|CELLAR|AWS/i.test(k))).toEqual([]);
      const v = JSON.parse(r.out) as { errors: string[] };
      // The same verdict as the Studio's own validator on the same folder (the art may be unprepared here).
      const here = await validateDir(game, { root: ROOT, importFresh: importInChild });
      expect(v.errors).toEqual(here.errors);
      expect(v.errors.every((e) => /image not found/.test(e))).toBe(true);
    } finally {
      delete process.env.STUDIO_TEST_SECRET;
    }
  }, 90_000);

  it('is killed at its deadline, with the processes it started', async () => {
    const game = join(tmp, 'g3');
    mkdirSync(game);
    const pidFile = join(tmp, 'grandchild.pid');
    writeFileSync(
      join(game, 'index.ts'),
      `import { spawn } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\nconst c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\nwriteFileSync(${JSON.stringify(pidFile)}, String(c.pid));\nwhile (true) {}\n`,
    );
    const t0 = Date.now();
    const r = await runChild(game, 3_000);
    expect(r.timedOut).toBe(true);
    expect(Date.now() - t0).toBeLessThan(15_000);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await new Promise((ok) => setTimeout(ok, 300));
    expect(() => process.kill(pid, 0)).toThrow();
  }, 30_000);
});

/** A worker on a free port; `stop` closes it. */
async function startWorker(
  instance = 'studio-a',
  log?: (event: string, data?: Record<string, unknown>) => void,
): Promise<{ url: string; server: Server }> {
  const w = createWorker({ publicKeyPem: keys.publicPem, instance, log });
  const server = createServer(w.handler);
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

describe('a hostile game', () => {
  it('cannot hang the supervisor by leaving its process group, nor corrupt the output by logging', async () => {
    const game = join(tmp, 'g8');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const pidFile = join(tmp, 'escaped.pid');
    writeFileSync(
      join(game, 'index.ts'),
      `import { spawn } from 'node:child_process';\nimport { writeFileSync } from 'node:fs';\nconsole.log('noise from the game');\nconst c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'inherit' });\nwriteFileSync(${JSON.stringify(pidFile)}, String(c.pid));\n${readFileSync(join(game, 'index.ts'), 'utf8')}`,
    );
    const t0 = Date.now();
    try {
      const r = await runChild(game, 30_000, 'load');
      expect(r.timedOut).toBe(false);
      expect(Date.now() - t0).toBeLessThan(15_000);
      expect((JSON.parse(r.out) as { game: { id: string } }).game.id).toBeTruthy();
    } finally {
      // The escaped process is outside the group (ADR 0028: not detected); the test ends it itself.
      try {
        process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGKILL');
      } catch {
        /* gone */
      }
    }
  }, 60_000);
});

describe("the Studio checks a diagnostic's answer", () => {
  it('by its kind, before the Check tab reads it', () => {
    expect(diagnosisShaped('solve', { status: 'solved', errors: [] })).toBe(true);
    expect(diagnosisShaped('solve', { status: 'solved' })).toBe(false);
    expect(diagnosisShaped('lint', { lint: {}, markdown: '' })).toBe(true);
    expect(diagnosisShaped('lint', { lint: 'x', markdown: '' })).toBe(false);
    expect(diagnosisShaped('playtests', { report: {}, files: 0 })).toBe(true);
    expect(diagnosisShaped('playtests', undefined)).toBe(false);
  });
});

describe('the worker refuses', () => {
  it('a job without a valid signature, for another instance, or seen before', async () => {
    const { url, server } = await startWorker();
    try {
      const post = (token: string) =>
        fetch(`${url}/jobs`, {
          method: 'POST',
          body: JSON.stringify({ token }),
          headers: { 'content-type': 'application/json' },
        });
      expect((await post('nope.nope')).status).toBe(403);
      const priv = privateKeyOf(keys.privatePem);
      expect((await post(signJob(job({ instance: 'studio-b' }), priv))).status).toBe(403);
      // The snapshot URL does not answer: the job fails (502), and a second try of the same job is refused (409).
      const once = signJob(job(), priv);
      expect((await post(once)).status).toBe(502);
      expect((await post(once)).status).toBe(409);
      expect((await fetch(`${url}/readyz`)).status).toBe(200);
    } finally {
      server.close();
    }
  });
});

describe("the worker's log of a job (4.4.0)", () => {
  it('says its phases: waiting, the snapshot fetched and unpacked, the child, the result written', async () => {
    const lines: [string, Record<string, unknown>][] = [];
    const { url, server } = await startWorker('studio-a', (event, data = {}) => lines.push([event, data]));
    const mem = await memoryS3();
    const priv = privateKeyOf(keys.privatePem);
    const game = join(tmp, 'g-phases');
    mkdirSync(game);
    writeFileSync(join(game, 'index.ts'), "export const game = { id: 'phases' };\n");
    const snap = packSnapshot(game);
    const sha = (await import('node:crypto')).createHash('sha256').update(snap).digest('hex');
    const post = (o: Partial<Job>) => {
      const id = randomUUID();
      void mem.s3.put(`staging/${id}/snapshot.json`, snap);
      const token = signJob(
        job({
          id,
          kind: 'load',
          snapshot: sha,
          params: { timeoutMs: 30_000 },
          urls: {
            snapshot: mem.s3.presign('GET', `staging/${id}/snapshot.json`),
            result: mem.s3.presign('PUT', `staging/${id}/result.json`),
          },
          ...o,
        }),
        priv,
      );
      return fetch(`${url}/jobs`, { method: 'POST', body: JSON.stringify({ token }) });
    };
    try {
      expect((await post({})).status).toBe(200);
      const [event, data] = lines.at(-1)!;
      expect(event).toBe('worker-job');
      for (const k of ['queueMs', 'fetchMs', 'unpackMs', 'childMs', 'putMs'])
        expect(data[k], k).toEqual(expect.any(Number));
      // The child is the job's longest phase here (a node and tsx started), and is counted once: not in its neighbours.
      const n = data as Record<string, number>;
      expect(n.childMs).toBeGreaterThan(100);
      expect(n.putMs).toBeLessThan(n.childMs);
      expect(n.unpackMs).toBeLessThan(n.childMs);
      expect(n.childMs).toBeLessThanOrEqual(n.ms! + 50);
      // A job whose snapshot cannot be read: its wait said, and nothing after it.
      expect((await post({ urls: { snapshot: `${url}/nothing`, result: `${url}/nothing` } })).status).toBe(502);
      const [failed, why] = lines.at(-1)!;
      expect(failed).toBe('worker-job-failed');
      expect(why).toMatchObject({ kind: 'load', queueMs: expect.any(Number) });
      expect(why).not.toHaveProperty('fetchMs');
    } finally {
      server.close();
      mem.server.close();
    }
  }, 60_000);
});

describe('the Studio accepts a result', () => {
  it('a job that expired while it waited is not run', async () => {
    const { url, server } = await startWorker();
    const mem = await memoryS3();
    const priv = privateKeyOf(keys.privatePem);
    const game = join(tmp, 'g9');
    mkdirSync(game);
    writeFileSync(
      join(game, 'index.ts'),
      "import { spawn } from 'node:child_process';\nspawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\nwhile (true) {}\nexport {};\n",
    );
    const snap = packSnapshot(game);
    const sha = (await import('node:crypto')).createHash('sha256').update(snap).digest('hex');
    const jobFor = (exp: number, timeoutMs: number) => {
      const id = randomUUID();
      void mem.s3.put(`staging/${id}/snapshot.json`, snap);
      return signJob(
        job({
          id,
          kind: 'load',
          snapshot: sha,
          exp,
          params: { timeoutMs },
          urls: {
            snapshot: mem.s3.presign('GET', `staging/${id}/snapshot.json`),
            result: mem.s3.presign('PUT', `staging/${id}/result.json`),
          },
        }),
        priv,
      );
    };
    const post = (token: string) =>
      fetch(`${url}/jobs`, {
        method: 'POST',
        body: JSON.stringify({ token }),
        headers: { 'content-type': 'application/json' },
      });
    try {
      const slow = post(jobFor(Date.now() + 60_000, 2_000));
      await new Promise((ok) => setTimeout(ok, 100));
      const late = await post(jobFor(Date.now() + 500, 2_000));
      expect(late.status).toBe(502);
      expect(((await late.json()) as { error: string }).error).toMatch(/expired while it waited/);
      expect((await slow).status).toBe(200);
      // The game's background processes died with its group: the instance is not marked to recycle.
      expect((await fetch(`${url}/readyz`)).status).toBe(200);
    } finally {
      server.close();
      mem.server.close();
    }
  }, 30_000);

  it('a preview runs at once while another kind runs, which still waits its turn (4.4.0)', async () => {
    const { url, server } = await startWorker();
    const mem = await memoryS3();
    const priv = privateKeyOf(keys.privatePem);
    const game = join(tmp, 'g-lanes');
    mkdirSync(game);
    writeFileSync(join(game, 'index.ts'), 'while (true) {}\nexport {};\n');
    const snap = packSnapshot(game);
    const sha = (await import('node:crypto')).createHash('sha256').update(snap).digest('hex');
    const post = (o: Partial<Job>) => {
      const id = randomUUID();
      void mem.s3.put(`staging/${id}/snapshot.json`, snap);
      const token = signJob(
        job({
          id,
          snapshot: sha,
          urls: {
            snapshot: mem.s3.presign('GET', `staging/${id}/snapshot.json`),
            result: mem.s3.presign('PUT', `staging/${id}/result.json`),
          },
          ...o,
        }),
        priv,
      );
      return fetch(`${url}/jobs`, { method: 'POST', body: JSON.stringify({ token }) });
    };
    try {
      const slow = post({ kind: 'load', params: { timeoutMs: 2_000 } });
      await new Promise((ok) => setTimeout(ok, 100));
      // Its snapshot is not there: it fails at once, in its own lane, long before the load ends.
      const t0 = Date.now();
      const preview = await post({
        kind: 'preview',
        exp: Date.now() + 1_000,
        urls: { snapshot: `${url}/no`, result: `${url}/no` },
      });
      expect(preview.status).toBe(502);
      expect(((await preview.json()) as { error: string }).error).toMatch(/^snapshot: 404/);
      expect(Date.now() - t0).toBeLessThan(1_000);
      // Another kind waits behind the load, as before.
      const late = await post({ kind: 'validate', exp: Date.now() + 500 });
      expect(((await late.json()) as { error: string }).error).toMatch(/expired while it waited/);
      expect((await slow).status).toBe(200);
    } finally {
      server.close();
      mem.server.close();
    }
  }, 30_000);

  it('only when it answers its own job', async () => {
    // A worker that answers with another job's verdict, written where it was told.
    const store = new Map<string, Buffer>();
    const fake = createServer(async (req, res) => {
      let raw = '';
      for await (const c of req) raw += c;
      const j = verifyJob(JSON.parse(raw).token, publicKeyOf(keys.publicPem));
      store.set(`${j.dest}result.json`, Buffer.from(JSON.stringify({ job: 'another', errors: [], warnings: [] })));
      res.end('{}');
    });
    await new Promise<void>((ok) => fake.listen(0, '127.0.0.1', ok));
    const s3 = {
      put: async (k: string, b: Buffer) => void store.set(k, b),
      get: async (k: string) => store.get(k),
      delete: async (k: string) => void store.delete(k),
      presign: (_m: string, k: string) => `memory://${k}`,
    } as unknown as S3;
    const ex = remoteExecutor({
      s3,
      workerUrl: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 1 }),
    });
    const game = join(tmp, 'g4');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    try {
      await expect(ex.validate(game)).rejects.toThrow(/does not answer this job/);
      expect([...store.keys()]).toEqual([]);
    } finally {
      fake.close();
    }
  });
});

/** An S3 in memory, its presigned URLs served over http (no signature: the scope tests run against Cellar below). */
async function memoryS3() {
  const objects = new Map<string, Buffer>();
  let snapshots = 0;
  const server = createServer(async (req, res) => {
    const key = decodeURIComponent(new URL(req.url ?? '/', 'http://s').pathname.slice(1));
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      objects.set(key, Buffer.concat(chunks));
      res.end();
    } else if (objects.has(key)) res.end(objects.get(key));
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const s3 = {
    put: async (k: string, b: Buffer) => {
      if (k.endsWith('snapshot.json')) snapshots++;
      objects.set(k, b);
    },
    get: async (k: string) => objects.get(k),
    delete: async (k: string) => void objects.delete(k),
    presign: (_m: string, k: string) => `${base}/${encodeURIComponent(k)}`,
  };
  return { s3, objects, server, snapshots: () => snapshots };
}

describe('a hosted Studio runs the game only in the worker', () => {
  it('validates and loads through it, sends an unchanged game once, and leaves no staging behind', async () => {
    const { url, server } = await startWorker();
    const mem = await memoryS3();
    const ex = remoteExecutor({
      s3: mem.s3,
      workerUrl: url,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 1 }),
    });
    const game = join(tmp, 'g6');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    try {
      const here = await validateDir(game, { root: ROOT, importFresh: importInChild });
      expect((await ex.validate(game)).errors).toEqual(here.errors);
      const mod = (await ex.load(game)) as { game: { id: string } };
      const local = (await importInChild(join(game, 'index.ts'))) as { game: { id: string } };
      expect(mod).toEqual(local);
      expect(mem.snapshots()).toBe(2);
      await ex.validate(game);
      expect(mem.snapshots()).toBe(2);
      expect([...mem.objects.keys()]).toEqual([]);
      // A game that never ends its import: the worker stops it, and the Studio says so.
      writeFileSync(join(game, 'index.ts'), 'while (true) {}\nexport {};\n');
      const quick = remoteExecutor({
        s3: mem.s3,
        workerUrl: url,
        privateKeyPem: keys.privatePem,
        instance: 'studio-a',
        at: () => ({ epoch: 'e1', rev: 2 }),
        timeoutMs: 2_000,
      });
      await expect(quick.load(game)).rejects.toThrow(/did not finish within 2000 ms/);
      // A failure is never kept: the same game is asked again, and the guard's validation throws (it fails closed).
      const before = mem.snapshots();
      await expect(quick.validate(game)).rejects.toThrow(/did not finish/);
      await expect(quick.validate(game)).rejects.toThrow(/did not finish/);
      expect(mem.snapshots()).toBe(before + 2);
    } finally {
      server.close();
      mem.server.close();
    }
  }, 120_000);

  it("builds a revision's preview through it, each time, its parameters checked by the worker", async () => {
    const { url, server } = await startWorker();
    const mem = await memoryS3();
    const ex = remoteExecutor({
      s3: mem.s3,
      workerUrl: url,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 4 }),
      timeoutMs: 120_000,
    });
    const game = join(tmp, 'g9');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const params = { rev: 4, game: 'template', studioOrigin: 'https://studio.example', assetsVersion: 'ab12' };
    try {
      const files = await ex.preview(packSnapshot(game), params, { epoch: 'e1' });
      const html = files.get('index.html')!.toString();
      expect(html).toContain('<meta name="web-scumm-studio-origin" content="https://studio.example"');
      expect(html).toMatch(/src="\/preview\/4\/assets\/index-[\w-]+\.js"/);
      expect([...files.keys()].every((k) => !k.startsWith('/') && !k.includes('..'))).toBe(true);
      // A published build (4.2.2 PR 5): the player's game under /play/<n>/, without the Studio's origin.
      const played = (await ex.preview(packSnapshot(game), { ...params, play: 2 }, { epoch: 'e1' })).get('index.html')!;
      expect(played.toString()).toMatch(/src="\/play\/2\/assets\/index-[\w-]+\.js"/);
      expect(played.toString()).not.toContain('web-scumm-studio-origin');
      await expect(ex.preview(packSnapshot(game), { ...params, play: 0 }, { epoch: 'e1' })).rejects.toThrow();
      // Not kept like a validation: the same snapshot is built again when asked.
      const before = mem.snapshots();
      await ex.preview(packSnapshot(game), params, { epoch: 'e1' });
      expect(mem.snapshots()).toBe(before + 1);
      // Parameters the worker does not take: the build is refused before it starts.
      await expect(
        ex.preview(packSnapshot(game), { ...params, studioOrigin: 'https://studio.example/x' }, { epoch: 'e1' }),
      ).rejects.toThrow(PreviewBuildFailed);
      // A game that does not build: the reason, never a preview.
      writeFileSync(join(game, 'index.ts'), 'export const game = ;\n');
      await expect(localPreview(packSnapshot(game), params)).rejects.toThrow(PreviewBuildFailed);
      // Through the worker too: recorded as the game's failure, not tried again as a worker's.
      await expect(ex.preview(packSnapshot(game), params, { epoch: 'e1' })).rejects.toThrow(PreviewBuildFailed);
      expect([...mem.objects.keys()]).toEqual([]);
    } finally {
      server.close();
      mem.server.close();
    }
  }, 240_000);

  it("runs the diagnostics that run the game's code through it, with their parameters, and answers as here", async () => {
    const { url, server } = await startWorker();
    const mem = await memoryS3();
    const ex = remoteExecutor({
      s3: mem.s3,
      workerUrl: url,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 5 }),
      timeoutMs: 120_000,
    });
    const game = join(tmp, 'g10');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const mod = (await importInChild(join(game, 'index.ts'))) as GameModule;
    const noMs = (v: unknown) =>
      JSON.parse(JSON.stringify(v, (k, x) => (k === 'ms' || k === 'profile' ? undefined : x)));
    try {
      const lint = (await ex.diagnose('lint', game, { prove: false })) as LintData;
      expect(noMs(lint)).toEqual(noMs(await lintIn(game, mod)));
      const solve = (await ex.diagnose('solve', game, {
        from: null,
        maxStates: 5_000,
        mode: 'witness',
        timeLimitMs: 30_000,
      })) as SolveData;
      expect(noMs(solve)).toEqual(noMs(await solveIn(game, mod, { from: null, maxStates: 5_000, mode: 'witness' })));
      // Parameters out of their bounds are not run as given: the mode is a witness, the states at least one.
      const odd = (await ex.diagnose('solve', game, { from: null, maxStates: -3, mode: 'x' })) as SolveData;
      expect(odd.from).toBeNull();
      expect(odd.mode).toBe('witness');
      // A checkpoint the game does not have (any name: it is only looked up) is refused as a local route refuses it.
      for (const from of ['nowhere', '../../etc', 'début du chapitre 2'])
        await expect(ex.diagnose('solve', game, { from, maxStates: 10 })).rejects.toMatchObject({
          status: 400,
          message: expect.stringMatching(/unknown checkpoint/),
        });
      // The playtests' sessions travel with that job only.
      mkdirSync(join(game, 'playtests'), { recursive: true });
      cpSync(
        join(ROOT, 'games', 'demo', 'playtests', 'walkthrough-hesitant.session.json'),
        join(game, 'playtests', 'one.session.json'),
      );
      const paths = (o: { playtests?: boolean }) =>
        (JSON.parse(packSnapshot(game, o).toString()) as { files: { path: string }[] }).files.map((f) => f.path);
      expect(paths({ playtests: true })).toContain('playtests/one.session.json');
      expect(paths({})).not.toContain('playtests/one.session.json');
      const pt = (await ex.diagnose('playtests', game, {})) as PlaytestsData;
      expect(pt.files).toBe(1);
      // A diagnostic past its deadline: unknown for now (504), never an error of the game's.
      writeFileSync(join(game, 'index.ts'), 'while (true) {}\nexport {};\n');
      const quick = remoteExecutor({
        s3: mem.s3,
        workerUrl: url,
        privateKeyPem: keys.privatePem,
        instance: 'studio-a',
        at: () => ({ epoch: 'e1', rev: 6 }),
        timeoutMs: 2_000,
      });
      await expect(quick.diagnose('lint', game, {})).rejects.toMatchObject({ status: 504 });
      expect([...mem.objects.keys()]).toEqual([]);
    } finally {
      server.close();
      mem.server.close();
    }
  }, 240_000);

  it("prepares the game's assets through it, or says why not", async () => {
    const { url, server } = await startWorker();
    const mem = await memoryS3();
    const ex = remoteExecutor({
      s3: mem.s3,
      workerUrl: url,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 7 }),
      timeoutMs: 120_000,
    });
    try {
      // A game whose code does not load: the asset tools never run, the reason comes back.
      const broken = packAssets([{ path: 'index.ts', bytes: Buffer.from('export const game = ;') }]);
      await expect(ex.prepare(broken, { epoch: 'e1', rev: 7 }, 'demo')).rejects.toThrow();
      if (hasAssetTools) {
        const out = await ex.prepare(packAssets(filesOf(join(ROOT, 'games', 'demo'))), { epoch: 'e1', rev: 7 }, 'demo');
        expect(Object.keys(out.files).some((p) => p.startsWith('assets/img/'))).toBe(true);
        expect(JSON.parse(out.manifest)).toHaveProperty('images');
      }
      expect([...mem.objects.keys()]).toEqual([]);
    } finally {
      server.close();
      mem.server.close();
    }
  }, 240_000);

  it('the Studio reads the game through the executor, and captures are unavailable', async () => {
    const calls: string[] = [];
    const game = join(tmp, 'g7');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    const local = await importInChild(join(game, 'index.ts'));
    const studio = createStudio({
      gameDir: game,
      root: tmp,
      importFresh: () => Promise.reject(new Error('the game must not run in the Studio')),
      executor: {
        validate: async () => {
          calls.push('validate');
          return { ok: true, errors: [], warnings: [], ms: 0 };
        },
        load: async () => {
          calls.push('load');
          return local;
        },
      },
    });
    expect((await studio.validate()).ok).toBe(true);
    await studio.gameInfo();
    expect(calls).toContain('validate');
    expect(calls).toContain('load');
    const shot = await studio.screenshot('start', null, 'http://127.0.0.1:1');
    expect(shot).toMatchObject({ unavailable: true });
  }, 60_000);
});

const S3URL = process.env.STUDIO_TEST_S3;
describe.runIf(S3URL)('round trip through S3', () => {
  const s3 = () => {
    const u = new URL(S3URL!);
    return new S3({
      endpoint: `${u.protocol}//${u.host}`,
      bucket: u.pathname.slice(1),
      keyId: decodeURIComponent(u.username),
      secret: decodeURIComponent(u.password),
      prefix: 'test-worker/',
    });
  };

  it('a presigned write reaches its one key only', async () => {
    const c = s3();
    const url = c.presign('PUT', 'staging/j1/result.json', 60);
    expect((await fetch(url, { method: 'PUT', body: 'ok' })).status).toBe(200);
    const elsewhere = url.replace('staging/j1/result.json', 'sha256/forged');
    expect((await fetch(elsewhere, { method: 'PUT', body: 'x' })).status).toBe(403);
    expect(await c.has('sha256/forged')).toBe(false);
    await c.delete('staging/j1/result.json');
  }, 30_000);

  it('validates a game through the worker, measured, and leaves no staging behind', async () => {
    const { url, server } = await startWorker();
    const c = s3();
    const ex = remoteExecutor({
      s3: c,
      workerUrl: url,
      privateKeyPem: keys.privatePem,
      instance: 'studio-a',
      at: () => ({ epoch: 'e1', rev: 1 }),
    });
    const game = join(tmp, 'g5');
    cpSync(join(ROOT, 'games', '_template'), game, { recursive: true });
    try {
      const v = await ex.validate(game);
      const here = await validateDir(game, { root: ROOT, importFresh: importInChild });
      expect(v.errors).toEqual(here.errors);
      // The round trip, for ADR 0028: snapshot up, job, child, result up and back.
      console.info(`[studio-worker] remote validation: ${v.ms} ms (snapshot ${packSnapshot(game).length} bytes)`);
    } finally {
      server.close();
    }
  }, 120_000);
});
