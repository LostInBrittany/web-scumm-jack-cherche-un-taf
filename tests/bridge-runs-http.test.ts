// The routes of /v1/runs (4.1.17, the `runs` mutation set): what each one takes and refuses — the board's key, seed
// kind and limit, a delete with its token, a moderation, a method it does not serve, a body over its size — and how a
// failure of the store is said (503 and Retry-After for a busy one, 500 for the rest). Over a real HTTP server.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRunStore, RunQueue, runsRoute, type RunRecord } from '../bridge/src/runs';
import type { SubmissionLimiter } from '../bridge/src/runs-limiter';
import { StoreBusyError } from '../bridge/src/store-async';

let n = 0;
const done = (o: Partial<RunRecord>): RunRecord => ({
  id: `run_${++n}`,
  tenantId: 'default',
  gameId: 'reference',
  categoryId: 'any%',
  player: `P${n}`,
  submittedAt: n,
  status: 'done',
  verdict: 'valid',
  trust: 'replay-valid',
  ranked: String(100 + n),
  leaderboardKey: 'any%',
  runKey: `k${n}`,
  deleteTokenHash: '',
  envelope: '',
  ...o,
});
const store = new MemoryRunStore();
const q = new RunQueue({
  store,
  approved: {
    reference: {
      dir: resolve('games/reference'),
      fingerprint: { logic: '', trustedExtensions: '', presentation: '', engine: '' },
    },
  },
  worker: ['true'],
  maxBytes: 100,
  adminToken: 'a'.repeat(40),
  purgeEveryMs: 0,
  pollMs: 0,
  log: () => {},
  audit: (l) => void audits.push(l as never),
});
const audits: { event: string; run?: string; why?: string }[] = [];
let server: Server;
let base = '';
const handled: boolean[] = [];
beforeAll(async () => {
  await store.create(done({ seedKind: 'fixed' }));
  await store.create(done({ seedKind: 'random' }));
  await store.create(done({ leaderboardKey: 'any%:WS-0000-0000' }));
  await store.create(done({ verdict: 'invalid-replay', ranked: null, trust: 'local', leaderboardKey: undefined }));
  const route = runsRoute(q);
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    void route(req, res, path).then((ok) => {
      handled.push(ok);
      if (!ok) res.writeHead(404).end('not mine');
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', () => ok()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server?.close();
  q.close();
});
const board = async (qs: string) => {
  const r = await fetch(`${base}/v1/runs?game=reference&category=any%25${qs}`);
  return { status: r.status, body: (await r.json()) as { runs?: { player: string; seedKind?: string }[] } };
};

describe('/v1/runs without an admin token', () => {
  it('refuses every moderation, said as no token', async () => {
    const audit: { event: string; why?: string }[] = [];
    const bare = new RunQueue({
      store,
      approved: {},
      worker: ['true'],
      purgeEveryMs: 0,
      pollMs: 0,
      log: () => {},
      audit: (l) => void audit.push(l as never),
    });
    const route = runsRoute(bare);
    let status = 0;
    const res = { writeHead: (s: number) => ((status = s), res), setHeader: () => res, end: () => res } as never;
    await route(
      { method: 'POST', url: '/v1/runs/run_1/moderate', headers: { authorization: 'Bearer x' } } as never,
      res,
      '/v1/runs/run_1/moderate',
    );
    expect(status).toBe(404);
    expect(bare.moderation).toEqual({ accepted: 0, refused: 0 });
    expect(audit).toEqual([]);
    bare.close();
  });
});

describe('/v1/runs', () => {
  it('a board: its key checked and used, its seed kind filtered, its limit used', async () => {
    expect((await board('')).body.runs!.map((r) => r.player)).toEqual(['P1', 'P2']);
    expect((await board('&key=any%25:WS-0000-0000')).body.runs!.map((r) => r.player)).toEqual(['P3']);
    expect((await board('&key=a%20b')).status).toBe(400);
    expect((await board('&key=')).status).toBe(400);
    expect((await board('&seed=fixed')).body.runs!.map((r) => [r.player, r.seedKind])).toEqual([['P1', 'fixed']]);
    expect((await board('&seed=random')).body.runs!.map((r) => r.player)).toEqual(['P2']);
    expect((await board('&seed=other')).body.runs!.map((r) => r.player)).toEqual(['P1', 'P2']);
    expect((await board('&limit=1')).body.runs!.map((r) => r.player)).toEqual(['P1']);
    expect((await board('&limit=1000')).status).toBe(200);
    expect((await board('&limit=1001')).status).toBe(400);
    expect((await fetch(`${base}/v1/runs?game=reference`)).status).toBe(400);
  });

  it('one run, deleted with its token only; a moderation needs the bearer; another method is 405', async () => {
    const one = await fetch(`${base}/v1/runs/run_1`);
    expect(((await one.json()) as { seedKind: string }).seedKind).toBe('fixed');
    expect((await fetch(`${base}/v1/runs/run_9999`)).status).toBe(404);
    // A run without a board key has no world to show.
    const keyless = (await (await fetch(`${base}/v1/runs/run_4`)).json()) as Record<string, unknown>;
    expect('world' in keyless || 'leaderboardKey' in keyless).toBe(false);
    const { id, deleteToken } = await q.submit('default', {
      player: 'Del',
      envelope: JSON.stringify({ format: 'web-scumm-speedrun', gameId: 'reference', categoryId: 'any%', runSeed: 'd' }),
    });
    expect(
      (await fetch(`${base}/v1/runs/${id}`, { method: 'DELETE', headers: { 'x-delete-token': 'wrong' } })).status,
    ).toBe(403);
    expect(
      (await fetch(`${base}/v1/runs/${id}`, { method: 'DELETE', headers: { 'x-delete-token': deleteToken } })).status,
    ).toBe(204);
    expect((await fetch(`${base}/v1/runs/run_1/moderate`, { method: 'POST' })).status).toBe(401);
    // 4.1.17: refusals counted and audited (the run asked for and why, never the bearer); a wrong bearer of the same
    // length is refused like any other.
    const wrong = await fetch(`${base}/v1/runs/run_1/moderate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'b'.repeat(40)}` },
    });
    expect(wrong.status).toBe(401);
    expect(q.moderation).toEqual({ accepted: 0, refused: 2 });
    const refusals = audits.filter((a) => a.event === 'run.moderation-refused');
    expect(refusals.map((a) => [a.run, a.why])).toEqual([
      ['run_1', 'bearer'],
      ['run_1', 'bearer'],
    ]);
    expect(JSON.stringify(audits)).not.toContain('a'.repeat(40));
    const mod = await fetch(`${base}/v1/runs/run_1/moderate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'a'.repeat(40)}` },
    });
    expect(mod.status).toBe(200);
    expect(q.moderation).toEqual({ accepted: 1, refused: 2 });
    expect((await fetch(`${base}/v1/runs/run_1/moderate`, { method: 'GET' })).status).toBe(405);
    expect((await fetch(`${base}/v1/runs/run_1`, { method: 'PUT' })).status).toBe(405);
  });

  it('is not another path: /v1/runsx is not its own', async () => {
    handled.length = 0;
    expect(await (await fetch(`${base}/v1/runsx`)).text()).toBe('not mine');
    expect(handled).toEqual([false]);
  });

  it('a body over twice the envelope limit and its wrapper is 413 and the connection closed; under, read', async () => {
    const big = await fetch(`${base}/v1/runs`, { method: 'POST', body: 'x'.repeat(2 * 100 + 4096 + 1) });
    expect(big.status).toBe(413);
    expect(big.headers.get('connection')).toBe('close');
    const ok = await fetch(`${base}/v1/runs`, {
      method: 'POST',
      body: JSON.stringify({ player: 'Lou', envelope: 'x'.repeat(150) }),
    });
    expect(ok.status).toBe(413); // the envelope itself is over 100 bytes: the queue's own limit, not the body's
    const small = await fetch(`${base}/v1/runs`, { method: 'POST', body: ' '.repeat(2 * 100 + 4096) });
    expect(small.status).toBe(400);
  });

  it('a 429 says Retry-After only when its limiter gave seconds to wait (4.3.0)', async () => {
    // Kills runs.ts `err.status === 429 && err.retryAfterS` → `||`: RunsOptions.limiter takes any SubmissionLimiter,
    // and a Take may refuse with retryAfterS 0; then no Retry-After is sent, never `retry-after: 0`.
    const own = q as unknown as { limiter: SubmissionLimiter };
    const real = own.limiter;
    try {
      for (const [wait, header] of [
        [0, null],
        [7, '7'],
      ] as const) {
        own.limiter = { take: async () => ({ ok: false, retryAfterS: wait }), purge: async () => 0 };
        const r = await fetch(`${base}/v1/runs`, {
          method: 'POST',
          body: JSON.stringify({ player: 'Lou', envelope: 'x' }),
        });
        expect([r.status, r.headers.get('retry-after')]).toEqual([429, header]);
      }
    } finally {
      own.limiter = real;
    }
  });

  it('a busy store is 503 with Retry-After 1; another failure is 500 without', async () => {
    const real = store.board.bind(store);
    store.board = async () => {
      throw new StoreBusyError('busy');
    };
    const busy = await fetch(`${base}/v1/runs?game=reference&category=any%25`);
    expect([busy.status, busy.headers.get('retry-after')]).toEqual([503, '1']);
    store.board = async () => {
      throw new Error('disk');
    };
    const broken = await fetch(`${base}/v1/runs?game=reference&category=any%25`);
    expect([broken.status, broken.headers.get('retry-after')]).toEqual([500, null]);
    store.board = real;
  });
});
