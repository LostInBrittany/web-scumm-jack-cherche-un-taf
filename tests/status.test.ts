// One status for every tool (src/engine/tools/status.ts): the solver and the proof by chapters carry their status,
// exit code and sentence; `npm run solve` (text and --json), the Studio and the MCP tool print those, never their own.
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solve } from '@engine/tools/solve';
import { proveChapters } from '@engine/tools/chapters';
import { exitOf, solveHeadline, worstStatus } from '@engine/tools/status';
import { createStudio, importInChild } from '../studio-server/src/ops/core';
import { heroes, heroesLayouts } from './fixtures/heroes';

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

  it('one winning path is not a proof: only the robot can finish, witness says solved, --prove says softlocks', async () => {
    const g = heroes();
    const door = g.rooms[0]!.on!.find((r) => r.verb === 'use')!;
    door.if = { flag: 'form', eq: 'robot' };
    const witness = await solve(structuredClone(g), heroesLayouts, {});
    expect([witness.status, witness.finished]).toEqual(['solved', true]);
    expect(witness.headline).toMatch(/^solved: the ending is reached on one path .*only --prove checks every state/);
    const proof = await solve(structuredClone(g), heroesLayouts, { mode: 'prove' });
    expect([proof.status, proof.finished, proof.exit]).toEqual(['softlocks', true, 1]);
    expect(proof.headline).not.toMatch(/prove|solved/);
    // "stays reachable from every one" (a proof) is said by a solved proof only.
    const said = (status: 'solved' | 'softlocks' | 'truncated', mode: 'witness' | 'prove') =>
      solveHeadline({ status, mode, states: 9, softlockCount: 2, broken: [], errors: [] });
    expect(said('solved', 'prove')).toMatch(/stays reachable from every one/);
    for (const [st, m] of [
      ['solved', 'witness'],
      ['softlocks', 'prove'],
      ['truncated', 'prove'],
    ] as const)
      expect(said(st, m)).not.toMatch(/stays reachable from every one/);
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
