// A complete attempt on the reference chapter (4.1.14 "Time Attack"): its `.wsrun`, committed under
// tests/fixtures/speedrun/ by tools/speedrun/reference-run.ts, is verified by `npm run speedrun:verify` as the release
// workflow does before attaching it to the release (its ninth asset). A run is bound to its engine version and its
// game's fingerprint: after `npm version` or a change of the reference game's logic, regenerate it.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runTool } from './run-tool';
import type { Layout } from '@engine/core/types';
import { verifyRun } from '@engine/tools/speedrun/verify';
import { game as reference } from '../games/reference/game';

const FILE = 'tests/fixtures/speedrun/reference-any.wsrun';

describe('the reference run', () => {
  it('is a complete Any% attempt with its splits, verified valid by speedrun:verify', () => {
    const env = JSON.parse(readFileSync(FILE, 'utf8'));
    expect(env).toMatchObject({
      format: 'web-scumm-speedrun',
      schema: 2,
      gameId: 'reference',
      categoryId: 'any%',
      trust: 'local',
    });
    expect(env.splits.every((s: { entry: number | null }) => s.entry !== null)).toBe(true);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(env.engineVersion, 'regenerate it: npx tsx tools/speedrun/reference-run.ts').toBe(pkg.version);
    const r = runTool(['tools/speedrun/verify.ts', FILE, '--json'], { env: { ...process.env, GAME: 'reference' } });
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout.trim().split('\n').at(-1)!);
    expect(out).toMatchObject({
      verdict: 'valid',
      code: 'ok',
      trust: 'replay-valid',
      world: { mode: 'story', seed: 'story', leaderboardKey: 'any%' },
    });
    expect(out.recomputed.finalProof).toBe(env.finalProof);
  }, 120000);

  it('an altered copy is refused, with its reason and exit code 1', () => {
    const env = JSON.parse(readFileSync(FILE, 'utf8'));
    env.timing.logicalTime = '1';
    const dir = mkdtempSync(join(tmpdir(), 'speedrun-'));
    const tmp = join(dir, 'altered.wsrun');
    writeFileSync(tmp, JSON.stringify(env));
    let r: ReturnType<typeof runTool>;
    try {
      r = runTool(['tools/speedrun/verify.ts', tmp], { env: { ...process.env, GAME: 'reference' } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/invalid-replay \(time-mismatch\)/);
  }, 120000);
});

describe('the schema 1 reference run of 4.1.15 (golden)', () => {
  // Frozen: what a 4.1.14 or 4.1.15 `.wsrun` means must not move. Verified with the engine version and the fingerprint
  // it names (a later engine replays it by that version's archive; here the format's reading is what is held).
  const V1 = 'tests/fixtures/speedrun/reference-any.v1.wsrun';
  const layouts: Record<string, Layout> = Object.fromEntries(
    readdirSync('games/reference/layout')
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/reference/layout/${f}`, 'utf8'))]),
  );
  it('is read as a Story run, valid, with its 4.1.15 proof', async () => {
    const env = JSON.parse(readFileSync(V1, 'utf8'));
    expect(env).toMatchObject({ schema: 1, engineVersion: '4.1.15', finalProof: expect.stringMatching(/^bf36d741/) });
    const ctx = { game: reference, layouts, fingerprint: env.fingerprint, engineVersion: env.engineVersion };
    const r = await verifyRun(readFileSync(V1, 'utf8'), ctx);
    expect(r).toMatchObject({ verdict: 'valid', world: { mode: 'story', leaderboardKey: 'any%' } });
    expect(r.recomputed?.finalProof).toBe(env.finalProof);
  }, 60000);
  it('is refused, never requalified, when offered to a Remix category', async () => {
    const env = JSON.parse(readFileSync(V1, 'utf8'));
    const game = {
      ...reference,
      speedrun: {
        ...reference.speedrun!,
        categories: reference.speedrun!.categories.map((c) =>
          c.id === 'any%' ? { ...c, world: { policy: 'random' as const, mode: 'remix' } } : c,
        ),
      },
    };
    const r = await verifyRun(env, { game, layouts, fingerprint: env.fingerprint, engineVersion: env.engineVersion });
    expect(r).toMatchObject({ verdict: 'invalid-category-rule', code: 'legacy-world-missing' });
  });
});
