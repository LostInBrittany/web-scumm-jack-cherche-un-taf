// The Studio's side of the worker for the asset jobs (4.2.3 PR 7, H8; remote-executor.ts): `cut` and `prepare` read
// the worker's result and answer as the routes do (a deadline 504, a failure 422, an answer out of shape 422), and a
// job's signal closes the request to the worker (the worker then kills its child) and drops whatever comes back; the
// staging prefix is left empty in every case. The worker is a fake over HTTP, the bucket a Map.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { remoteExecutor } from '../studio-server/src/server/remote-executor';
import type { S3 } from '../studio-server/src/server/s3';
import { type Job, newJobKeys, publicKeyOf, verifyJob } from '../studio-server/src/worker/job';
import type { CutRequest } from '../tools/studio/cut';

const keys = newJobKeys();
const store = new Map<string, Buffer>();
/** What the fake worker does with the next job: the result it writes (or none), its status, a wait. */
let answer: (job: Job, req: IncomingMessage, res: ServerResponse) => Promise<unknown> | unknown;
const seen: Job[] = [];
let url: string;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const job = verifyJob(JSON.parse(raw).token, publicKeyOf(keys.publicPem));
    seen.push(job);
    const r = await answer(job, req, res);
    if (res.writableEnded || res.destroyed) return;
    if (r !== undefined) store.set(`${job.dest}result.json`, Buffer.from(JSON.stringify(r)));
    res.end('{}');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

const s3 = {
  put: async (k: string, b: Buffer) => void store.set(k, b),
  get: async (k: string) => store.get(k),
  delete: async (k: string) => void store.delete(k),
  presign: (_m: string, k: string) => `memory://${k}`,
} as unknown as S3;
const ex = () =>
  remoteExecutor({
    s3,
    workerUrl: `${url}/`,
    privateKeyPem: keys.privatePem,
    instance: 'studio-a',
    at: () => ({ epoch: 'e1', rev: 3 }),
  });
const sheet: CutRequest = { mode: 'sheet', sheetId: 'hero', cols: 2, rows: 1 };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64');
const snap = Buffer.from('{"v":2,"files":[]}');
const result = (job: Job, o: Record<string, unknown>) => ({ job: job.id, kind: job.kind, ms: 1, ...o });

describe('a cut on the worker', () => {
  it('gives the cells, with the job bound to its kind, request and longest deadline', async () => {
    answer = (job) => result(job, { data: { files: { 'art/hero/r1c1.png': PNG }, output: 'cut' } });
    expect(await ex().cut(snap, 'demo', sheet)).toEqual({ files: { 'art/hero/r1c1.png': PNG }, output: 'cut' });
    expect(seen.at(-1)).toMatchObject({
      kind: 'cut',
      epoch: 'e1',
      rev: 3,
      params: { game: 'demo', req: sheet, timeoutMs: 120_000 },
    });
    expect([...store.keys()]).toEqual([]);
  });

  it('answers a deadline 504, a failure 422, an answer out of shape 422, with nothing left in staging', async () => {
    answer = (job) => result(job, { failed: 'the cut did not finish', timedOut: true });
    await expect(ex().cut(snap, 'demo', sheet)).rejects.toMatchObject({ status: 504, message: /cut it on a local/ });
    answer = (job) => result(job, { failed: 'cut-sheet.py failed (1)' });
    await expect(ex().cut(snap, 'demo', sheet)).rejects.toMatchObject({ status: 422, message: /cut-sheet.py/ });
    answer = (job) => result(job, { data: { files: { 'art/hero/../../game.ts': PNG } } });
    await expect(ex().cut(snap, 'demo', sheet)).rejects.toMatchObject({ status: 422, message: /the cut is refused/ });
    expect([...store.keys()]).toEqual([]);
  });

  it('fails when the worker refuses the job or leaves no result', async () => {
    answer = (_job, _req, res) => {
      res.statusCode = 503;
      res.end('{}');
    };
    await expect(ex().cut(snap, 'demo', sheet)).rejects.toThrow(/refused the job \(503\)/);
    answer = () => undefined;
    await expect(ex().cut(snap, 'demo', sheet)).rejects.toThrow(/no usable result/);
    expect([...store.keys()]).toEqual([]);
  });

  it('cancelled while the worker runs: the request closed, the worker sees it, nothing read', async () => {
    let closed = false;
    const ac = new AbortController();
    answer = (job, _req, res) =>
      new Promise((ok) => {
        res.on('close', () => {
          closed = true;
          ok(result(job, { data: { files: {}, output: 'too late' } }));
        });
        setTimeout(() => ac.abort(new Error('cancelled')), 50);
      });
    await expect(ex().cut(snap, 'demo', sheet, ac.signal)).rejects.toThrow(/cancelled/);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(closed).toBe(true);
    // A result written after the cancel is never read; the next gc takes it.
    for (const k of store.keys()) expect(k).toMatch(/result\.json$/);
    store.clear();
  });

  it('cancelled once the worker answered: its result is dropped', async () => {
    const ac = new AbortController();
    answer = (job) => {
      ac.abort(new Error('cancelled'));
      return result(job, { data: { files: { 'art/hero/r1c1.png': PNG }, output: '' } });
    };
    await expect(ex().cut(snap, 'demo', sheet, ac.signal)).rejects.toThrow(/cancelled/);
    expect([...store.keys()]).toEqual([]);
  });

  it('a signal already aborted sends nothing to the worker', async () => {
    const n = seen.length;
    await expect(ex().cut(snap, 'demo', sheet, AbortSignal.abort(new Error('cancelled')))).rejects.toThrow(/cancelled/);
    expect(seen.length).toBe(n);
    expect([...store.keys()]).toEqual([]);
  });
});

describe('a prepare on the worker', () => {
  const at = { epoch: 'e1', rev: 9 };
  it('gives the prepared files at the revision it names, its signal kept', async () => {
    const ac = new AbortController();
    answer = (job) => result(job, { data: { files: { 'assets/img/a.webp': 'QQ==' }, manifest: '{}', log: 'ok' } });
    expect(await ex().prepare(snap, at, 'demo', ac.signal)).toEqual({
      files: { 'assets/img/a.webp': 'QQ==' },
      manifest: '{}',
      log: 'ok',
    });
    expect(seen.at(-1)).toMatchObject({ kind: 'prepare', rev: 9, params: { game: 'demo', timeoutMs: 120_000 } });
  });

  it('answers a deadline 504, a failure 422, an answer out of shape 422; a cancel drops it', async () => {
    answer = (job) => result(job, { failed: 'late', timedOut: true });
    await expect(ex().prepare(snap, at, 'demo')).rejects.toMatchObject({ status: 504 });
    answer = (job) => result(job, { failed: 'python3 failed' });
    await expect(ex().prepare(snap, at, 'demo')).rejects.toMatchObject({ status: 422, message: 'python3 failed' });
    answer = (job) => result(job, { data: { files: { '../x': 'QQ==' }, manifest: '{}' } });
    await expect(ex().prepare(snap, at, 'demo')).rejects.toMatchObject({ status: 422, message: /refused/ });
    const ac = new AbortController();
    answer = (job) => {
      ac.abort(new Error('cancelled'));
      return result(job, { data: { files: {}, manifest: '{}' } });
    };
    await expect(ex().prepare(snap, at, 'demo', ac.signal)).rejects.toThrow(/cancelled/);
    expect([...store.keys()]).toEqual([]);
  });
});
