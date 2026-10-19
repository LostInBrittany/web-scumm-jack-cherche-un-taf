// One status for every tool (src/engine/tools/status.ts): the solver and the proof by chapters carry their status,
// exit code and sentence; `npm run solve` (text and --json), the Studio and the MCP tool print those, never their own.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solve } from '@engine/tools/solve';
import { proveChapters } from '@engine/tools/chapters';
import { exitOf, solveHeadline, worstStatus } from '@engine/tools/status';
import { createStudio, importInChild } from '../studio-server/src/ops/core';

const ROOT = resolve(__dirname, '..');

describe('the one status', () => {
  it('maps every status to one exit code, and ranks them', () => {
    expect(
      (['solved', 'softlocks', 'unsolved', 'truncated', 'broken', 'error', 'checkpoint_mismatch'] as const).map(exitOf),
    ).toEqual([0, 1, 1, 2, 1, 1, 1]);
    expect(worstStatus('truncated', 'softlocks')).toBe('truncated');
    expect(worstStatus('truncated', 'broken')).toBe('broken');
    expect(
      solveHeadline({ status: 'truncated', mode: 'prove', states: 7, softlockCount: 0, broken: [], errors: [] }),
    ).toMatch(/^truncated: .*nothing is proved/);
  });

  it('a broken invariant is the status, not only the exit code', async () => {
    const { game, layouts, commands } = await import('../games/demo');
    const g = structuredClone(game);
    const plain = await solve(structuredClone(game), layouts, { commands });
    g.invariants = [plain.flagsReached[0]];
    const r = await solve(g, layouts, { commands });
    expect(r.status).toBe('broken');
    expect(r.exit).toBe(1);
    expect(r.headline).toBe('broken: 1 invariant(s) broken on a reachable state');
  });

  it('the command line, its JSON and the Studio say the same thing', async () => {
    const { game, layouts, commands } = await import('../games/demo');
    const r = await solve(structuredClone(game), layouts, { commands, mode: 'prove' });
    const json = JSON.parse(
      execFileSync(join(ROOT, 'node_modules', '.bin', 'tsx'), ['tools/solve.ts', '--prove', '--json'], {
        cwd: ROOT,
        env: { ...process.env, GAME: 'demo' },
        maxBuffer: 1 << 26,
      }).toString(),
    );
    const text = execFileSync(join(ROOT, 'node_modules', '.bin', 'tsx'), ['tools/solve.ts', '--prove'], {
      cwd: ROOT,
      env: { ...process.env, GAME: 'demo' },
      maxBuffer: 1 << 26,
    }).toString();
    const studio = await createStudio({
      gameDir: join(ROOT, 'games', 'demo'),
      root: ROOT,
      importFresh: (f) => importInChild(f, ROOT),
    }).solve(null, 20000, 'prove');
    for (const x of [json, studio])
      expect({ status: x.status, exit: x.exit, headline: x.headline }).toEqual({
        status: r.status,
        exit: r.exit,
        headline: r.headline,
      });
    expect(text).toContain(`✔  Proof ${r.headline}`);
    const p = await proveChapters(structuredClone(game), layouts, { commands });
    expect(p.exit).toBe(exitOf(p.status));
    expect(p.headline).toMatch(/^solved: every chapter \(\d+\) proved/);
  }, 120000);
});
