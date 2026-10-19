// The player's Mystery world (4.1.17, plan §10.2): the Remix menu asks the game's Bridge for a commitment, then its
// reveal, verifies both offline with the game's daily key, builds the world and keeps both tokens beside it; a
// speedrun started in that world carries them, dated when it starts. Here through the Bridge's own routes
// (bridge/src/daily.ts) with the published test key, and a page's storage.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { game as reference } from '../games/reference/game';
import { dailyRoutes } from '../bridge/src/daily';
import { mysteryLate, mysteryWorldOf, storedEvidence } from '@engine/dom/remix-menu';

const fixture = JSON.parse(readFileSync('tests/fixtures/reference-daily-key.json', 'utf8'));
const bridge = async (now = Date.now(), gameId = 'reference') =>
  dailyRoutes({
    games: { [gameId]: { daily: 'daily', mystery: 'mystery' } },
    key: await crypto.subtle.importKey('jwk', fixture.jwk, { name: 'Ed25519' }, false, ['sign']),
    kid: fixture.kid,
    secret: 'mystery-player',
    now: () => now,
  });
const commitAndReveal = async (b: Awaited<ReturnType<typeof bridge>>, gameId = 'reference', client = 'p') => {
  const c = (await b.handle({ method: 'POST', url: '/v1/commit', body: { game: gameId }, client }))!.body as {
    id: string;
    token: string;
  };
  const r = (await b.handle({ method: 'GET', url: `/v1/reveal/${c.id}` }))!.body as { token: string; seed: string };
  return { c, r };
};

beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
});

describe("the player's Mystery world", () => {
  it('a commitment, its reveal, the world they name, both tokens kept beside it', async () => {
    const at = 1_800_000_000_000;
    const { c, r } = await commitAndReveal(await bridge(at));
    const v = await mysteryWorldOf(reference, c.token, r.token);
    expect(v).toMatchObject({ mode: 'mystery', seed: r.seed });
    const e = storedEvidence(reference.id, v.hash, at + 1234);
    expect(e).toEqual({ kind: 'mystery', commitmentToken: c.token, revealToken: r.token, startedAt: at + 1234 });
    // A page clock behind the Bridge's never dates the start before the reveal.
    expect(storedEvidence(reference.id, v.hash, at - 5000)).toMatchObject({ startedAt: at });
    // The minute of the reveal: within it a run starts, after it the page says so instead of starting a refused run.
    expect(mysteryLate(reference.id, v.hash, at + 60_000)).toBe(false);
    expect(mysteryLate(reference.id, v.hash, at + 60_001)).toBe(true);
    expect(mysteryLate(reference.id, 'f'.repeat(64), at + 120_000)).toBe(false);
    // Another world has none.
    expect(storedEvidence(reference.id, 'f'.repeat(64))).toBeUndefined();
  });

  it("refuses a reveal of another commitment, another game's tokens, a forged token", async () => {
    const b = await bridge();
    const one = await commitAndReveal(b, 'reference', 'a');
    const two = await commitAndReveal(b, 'reference', 'b');
    await expect(mysteryWorldOf(reference, one.c.token, two.r.token)).rejects.toThrow(/another commitment/);
    const other = await commitAndReveal(await bridge(Date.now(), 'demo'), 'demo');
    await expect(mysteryWorldOf(reference, other.c.token, other.r.token)).rejects.toThrow(/"demo"/);
    const [h, p, s] = one.r.token.split('.');
    // A character in the middle of the signature: the last ones carry padding bits a decoder may ignore.
    const forged = `${h}.${p}.${s!.slice(0, 20)}${s![20] === 'A' ? 'B' : 'A'}${s!.slice(21)}`;
    await expect(mysteryWorldOf(reference, one.c.token, forged)).rejects.toThrow();
    expect(storedEvidence(reference.id, undefined)).toBeUndefined();
  });

  it('a game without a Bridge key has no Mystery world', async () => {
    const { c, r } = await commitAndReveal(await bridge());
    const bare = { ...reference, remix: { ...reference.remix!, daily: undefined } };
    await expect(mysteryWorldOf(bare as never, c.token, r.token)).rejects.toThrow(/no Bridge key/);
  });
});
