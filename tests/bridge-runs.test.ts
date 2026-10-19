// Speedrun leaderboards on the Bridge (4.1.14 "Time Attack", ADR 0017): a run submitted to `POST /v1/runs` is verified
// by an isolated worker (a separate process with no secret of the Bridge and no network, the package approved by its
// fingerprint, its answer signed with a one-time key), never in the HTTP process and never on the client's word. The
// leaderboard ranks valid runs only, by pseudonym, with their trust; a run is deleted on request; old runs are purged.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fingerprintGame } from '@engine/core/fingerprint';
import { MemoryRunStore, RunQueue, runsRoute, runWorker, workerEnv } from '../bridge/src/runs';
import { engineVersion, trustedExtensionsHash } from '../tools/extensions';
import { game as reference } from '../games/reference/game';
import manifest from '../games/reference/assets.gen.json';

const tsx = createRequire(import.meta.url).resolve('tsx/cli');
const WORKER = [process.execPath, tsx, resolve('tools/speedrun/worker.ts')];
const DIR = resolve('games/reference');
const RUN = readFileSync('tests/fixtures/speedrun/reference-any.wsrun', 'utf8').trim();
let approved: { dir: string; fingerprint: Awaited<ReturnType<typeof fingerprintGame>> };
let server: Server;
let base = '';
let q: RunQueue;
let now = Date.UTC(2026, 9, 7);

beforeAll(async () => {
  const mod = await import('../games/reference/index');
  approved = {
    dir: DIR,
    fingerprint: await fingerprintGame(reference, {
      manifest,
      extensions: {
        trusted: trustedExtensionsHash(DIR),
        commands: mod.commands,
        minigames: Object.keys(mod.minigames ?? {}),
      },
      engine: engineVersion(),
    }),
  };
  q = new RunQueue({
    store: new MemoryRunStore(),
    approved: { reference: approved },
    worker: WORKER,
    timeoutMs: 60_000,
    adminToken: 'admin-token-for-tests',
    now: () => now,
    perMinute: 100,
    purgeEveryMs: 0,
  });
  const route = runsRoute(q);
  server = createServer((req, res) => {
    void route(req, res, new URL(req.url ?? '/', 'http://x').pathname).then((ok) => {
      if (!ok) res.writeHead(404).end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body), headers });

describe('POST /v1/runs → an isolated worker → a stored verdict', () => {
  it('a valid run is verified by the worker, ranked, shown with its pseudonym and trust', async () => {
    const r = await post('/v1/runs', { player: 'Speedy Lou', envelope: RUN });
    expect(r.status).toBe(202);
    const { id, deleteToken, status } = await r.json();
    expect(status).toBe('queued');
    expect(deleteToken).toMatch(/^[\w-]{20,}$/);
    await q.idle();
    const one = await (await fetch(`${base}/v1/runs/${id}`)).json();
    expect(one).toMatchObject({
      status: 'done',
      verdict: 'valid',
      code: 'ok',
      trust: 'replay-valid',
      player: 'Speedy Lou',
    });
    expect(one.envelope).toBeUndefined();
    expect(JSON.stringify(one)).not.toContain('deleteToken');
    const board = await (await fetch(`${base}/v1/runs?game=reference&category=any%25&seed=random`)).json();
    expect(board.runs).toHaveLength(1);
    expect(board.runs[0]).toMatchObject({ rank: 1, player: 'Speedy Lou', trust: 'replay-valid' });
    expect(BigInt(board.runs[0].ranked)).toBe(BigInt(JSON.parse(RUN).timing.logicalTime));
    expect((await (await fetch(`${base}/v1/runs?game=reference&category=any%25&seed=fixed`)).json()).runs).toEqual([]);
    // Moderation needs the admin token; then the trust is raised.
    expect((await post(`/v1/runs/${id}/moderate`, {})).status).toBe(401);
    const mod = await post(`/v1/runs/${id}/moderate`, {}, { authorization: 'Bearer admin-token-for-tests' });
    expect((await mod.json()).trust).toBe('moderator-verified');
    // The same run again is a duplicate, re-spaced or with its RTA stamps changed too: the first submitter keeps it.
    expect((await post('/v1/runs', { player: 'Someone', envelope: RUN })).status).toBe(409);
    const respaced = JSON.stringify(JSON.parse(RUN), null, 2);
    expect((await post('/v1/runs', { player: 'Someone', envelope: respaced })).status).toBe(409);
    const restamped = JSON.parse(RUN);
    restamped.chunks[0].entries[1].t = 12345;
    expect((await post('/v1/runs', { player: 'Someone', envelope: JSON.stringify(restamped) })).status).toBe(409);
    // The envelope is not kept once the verdict is.
    expect((await q.o.store.get('default', id))!.envelope).toBe('');
    // Deleted on request, with its token only.
    expect(
      (await fetch(`${base}/v1/runs/${id}`, { method: 'DELETE', headers: { 'x-delete-token': 'nope' } })).status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/v1/runs/${id}`, { method: 'DELETE', headers: { 'x-delete-token': deleteToken } })).status,
    ).toBe(204);
    expect((await fetch(`${base}/v1/runs/${id}`)).status).toBe(404);
  }, 120000);

  it('an altered run is refused by the worker and never ranked; a client’s claimed trust is ignored', async () => {
    const env = JSON.parse(RUN);
    env.timing.logicalTime = '1';
    env.trust = 'moderator-verified';
    const r = await post('/v1/runs', { player: 'Cheater', envelope: JSON.stringify(env) });
    const { id } = await r.json();
    await q.idle();
    const one = await (await fetch(`${base}/v1/runs/${id}`)).json();
    expect(one).toMatchObject({ verdict: 'invalid-replay', code: 'time-mismatch', trust: 'local' });
    const board = await (await fetch(`${base}/v1/runs?game=reference&category=any%25`)).json();
    expect(board.runs.find((x: { player: string }) => x.player === 'Cheater')).toBeUndefined();
    expect((await post(`/v1/runs/${id}/moderate`, {}, { authorization: 'Bearer admin-token-for-tests' })).status).toBe(
      409,
    );
  }, 120000);

  it('refuses an email as a pseudonym, a game without a leaderboard, a non-run, a body too large', async () => {
    expect((await post('/v1/runs', { player: 'lou@example.com', envelope: RUN })).status).toBe(400);
    const other = JSON.stringify({ ...JSON.parse(RUN), gameId: 'demo' });
    expect((await post('/v1/runs', { player: 'Lou', envelope: other })).status).toBe(404);
    expect((await post('/v1/runs', { player: 'Lou', envelope: '{"format":"x"}' })).status).toBe(400);
    expect((await post('/v1/runs', { player: 'Lou', envelope: 'x'.repeat(2_100_000) })).status).toBe(413);
    expect((await fetch(`${base}/v1/runs?game=reference`)).status).toBe(400);
  });

  it('purges runs older than the retention (90 days)', async () => {
    const env = JSON.stringify({ ...JSON.parse(RUN), seed: 'another-seed' });
    const res = await post('/v1/runs', { player: 'Old Timer', envelope: env });
    const { id } = await res.json();
    expect(res.status).toBe(202);
    await q.idle();
    now += 91 * 86_400_000;
    expect(await q.purge()).toBeGreaterThanOrEqual(1);
    expect((await fetch(`${base}/v1/runs/${id}`)).status).toBe(404);
  }, 120000);
});

describe('the worker’s isolation', () => {
  it('a package that is not the approved one is inconclusive; an answer not signed by the job’s key is refused', async () => {
    const wrong = { ...approved, fingerprint: { ...approved.fingerprint, logic: '0'.repeat(64) } };
    const r = await runWorker({ worker: WORKER }, wrong, RUN);
    expect([r.verdict, r.code]).toEqual(['inconclusive', 'package-not-approved']);
    // A "worker" that prints a verdict of its own, unsigned: refused.
    const fake = await runWorker(
      {
        worker: [
          process.execPath,
          '-e',
          'process.stdout.write(JSON.stringify({result:\'{"verdict":"valid"}\',sig:\'00\'}))',
        ],
      },
      approved,
      RUN,
    );
    expect([fake.verdict, fake.code]).toEqual(['inconclusive', 'signature']);
    // A worker over its budget is killed: inconclusive.
    const slow = await runWorker(
      { worker: [process.execPath, '-e', 'setTimeout(()=>{},60000)'], timeoutMs: 10 },
      approved,
      RUN,
    );
    expect([slow.verdict, slow.code]).toEqual(['inconclusive', 'timeout']);
  }, 120000);

  it('the worker gets no secret of the Bridge in its environment: PATH, the package, a bounded heap', () => {
    process.env.BRIDGE_SECRET_FOR_TEST = 'top-secret';
    const env = workerEnv(approved, { maxOldSpaceMb: 128 });
    delete process.env.BRIDGE_SECRET_FOR_TEST;
    expect(Object.keys(env).sort()).toEqual(['GAME_DIR', 'NODE_OPTIONS', 'PATH']);
    expect(env.NODE_OPTIONS).toBe('--max-old-space-size=128');
    expect(JSON.stringify(env)).not.toContain('top-secret');
  });
});

describe('the queue survives', () => {
  it('a hung worker (a runner whose child sleeps past the budget) is killed with its group: the queue goes on', async () => {
    const hung = [
      process.execPath,
      '-e',
      "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},120000)'],{stdio:'inherit'});setTimeout(()=>{},120000)",
    ];
    const t0 = Date.now();
    const r = await runWorker({ worker: hung, timeoutMs: 10 }, approved, RUN);
    expect([r.verdict, r.code]).toEqual(['inconclusive', 'timeout']);
    expect(Date.now() - t0).toBeLessThan(15_000);
  }, 30000);

  it('a verdict the store cannot write is not lost: the lease expires; another failure marks the run inconclusive', async () => {
    // The verdict cannot be written (4.1.16): the run stays claimed until its lease expires, then is verified again.
    class Failing extends MemoryRunStore {
      override async complete(...a: Parameters<MemoryRunStore['complete']>) {
        if (a[3].verdict !== 'inconclusive') throw new Error('disk full');
        return super.complete(...a);
      }
    }
    const logs: string[] = [];
    const fq = new RunQueue({
      store: new Failing(),
      approved: { reference: approved },
      worker: WORKER,
      purgeEveryMs: 0,
      pollMs: 0,
      log: (m) => logs.push(m),
      audit: () => {},
    });
    const { id } = await fq.submit('default', { player: 'Lou', envelope: RUN });
    await fq.idle();
    expect(await fq.o.store.get('default', id)).toMatchObject({ status: 'verifying' });
    expect(logs.join()).toContain('disk full');
    expect(logs.join()).toContain('lease will expire');
    // A worker that dies without a verdict: inconclusive, the queue goes on.
    const gone = new RunQueue({
      store: new MemoryRunStore(),
      approved: { reference: approved },
      worker: [process.execPath, '-e', 'process.exit(0)'],
      purgeEveryMs: 0,
      pollMs: 0,
      log: (m) => logs.push(m),
      audit: () => {},
    });
    const { id: id2 } = await gone.submit('default', { player: 'Lou', envelope: RUN });
    await gone.idle();
    expect(await gone.o.store.get('default', id2)).toMatchObject({
      verdict: 'inconclusive',
      code: 'crash',
      status: 'done',
    });
  });

  it('a client is rate-limited per minute; the purge runs on its own', async () => {
    let t = Date.UTC(2026, 9, 7);
    const store = new MemoryRunStore();
    const rq = new RunQueue({
      store,
      approved: { reference: approved },
      worker: ['/nonexistent'],
      perMinute: 2,
      purgeEveryMs: 20,
      now: () => t,
    });
    const env = (seed: string) => JSON.stringify({ ...JSON.parse(RUN), seed });
    await rq.submit('default', { player: 'Lou', envelope: env('a') }, 'client-1');
    await rq.submit('default', { player: 'Lou', envelope: env('b') }, 'client-1');
    await expect(rq.submit('default', { player: 'Lou', envelope: env('c') }, 'client-1')).rejects.toMatchObject({
      status: 429,
    });
    await rq.submit('default', { player: 'Ann', envelope: env('c') }, 'client-2');
    await rq.idle();
    expect(await store.list('default')).toHaveLength(3);
    t += 91 * 86_400_000;
    await new Promise((r) => setTimeout(r, 80));
    expect(await store.list('default')).toHaveLength(0);
    rq.close();
  });

  it('refuses a game id that is an object property, not an approved game', async () => {
    const rq = new RunQueue({
      store: new MemoryRunStore(),
      approved: { reference: approved },
      worker: WORKER,
      purgeEveryMs: 0,
    });
    for (const gameId of ['__proto__', 'constructor', 'toString'])
      await expect(
        rq.submit('default', { player: 'Lou', envelope: JSON.stringify({ ...JSON.parse(RUN), gameId }) }),
      ).rejects.toMatchObject({ status: 404 });
  });
});
