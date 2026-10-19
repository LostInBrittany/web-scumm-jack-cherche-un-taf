// The persistent proof cache (tools/proof-cache.ts): the same engine, game sources, game and options give the same
// key and the earlier result; anything else is a new run. Never a different verdict, only a faster one.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { insults, insultsLayouts } from './fixtures/classics';
import { cachedSolve, proofKey, stableJson } from '../tools/proof-cache';
import { runTool } from './run-tool';

const dir = mkdtempSync(join(tmpdir(), 'proofs-'));
process.env.PROOF_CACHE_DIR = dir;
afterAll(() => {
  delete process.env.PROOF_CACHE_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('the proof cache', () => {
  it('keys on content, not on key order; functions by their source; undefined dropped', () => {
    expect(stableJson({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe(stableJson({ a: [2, { c: 3 }], b: 1 }));
    expect(stableJson({ f: (x: number) => x + 1 })).not.toBe(stableJson({ f: (x: number) => x + 2 }));
    const g = insults();
    expect(proofKey(g, insultsLayouts, { mode: 'prove' })).toBe(proofKey(insults(), insultsLayouts, { mode: 'prove' }));
    expect(proofKey(g, insultsLayouts, { mode: 'prove' })).not.toBe(proofKey(g, insultsLayouts, { mode: 'witness' }));
    // an option at its default is the same question as the option left out
    expect(proofKey(g, insultsLayouts, {})).toBe(
      proofKey(g, insultsLayouts, { mode: 'witness', start: 'new', maxStates: 20000, por: false, goal: undefined }),
    );
    const h = insults();
    h.rooms[0].name += '!';
    expect(proofKey(h, insultsLayouts, { mode: 'prove' })).not.toBe(proofKey(g, insultsLayouts, { mode: 'prove' }));
  });

  it('gives the earlier result back, marked, and the same verdict', async () => {
    const a = await cachedSolve(insults(), insultsLayouts, { mode: 'prove' });
    const b = await cachedSolve(insults(), insultsLayouts, { mode: 'prove' });
    expect(a.cached).toBeUndefined();
    expect(b.cached).toMatch(/^[0-9a-f]{12}$/);
    const { cached: _c, ...rest } = b;
    expect(rest).toEqual(JSON.parse(JSON.stringify(a)));
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  });

  it('is off with PROOF_CACHE=0', async () => {
    process.env.PROOF_CACHE = '0';
    try {
      expect((await cachedSolve(insults(), insultsLayouts, { mode: 'prove' })).cached).toBeUndefined();
    } finally {
      delete process.env.PROOF_CACHE;
    }
  });

  it('npm run solve says when it answers from the cache, and --no-cache runs again', () => {
    const run = (...a: string[]) =>
      JSON.parse(
        runTool(['tools/solve.ts', '--json', ...a], {
          env: { ...process.env, GAME: 'demo', PROOF_CACHE_DIR: dir },
        })
          .stdout.trim()
          .split('\n')
          .pop()!,
      );
    const first = run(),
      second = run(),
      fresh = run('--no-cache');
    expect(second.cached).toMatch(/^[0-9a-f]{12}$/);
    expect(fresh.cached).toBeNull();
    for (const r of [first, second, fresh])
      expect({ status: r.status, states: r.states, path: r.path }).toEqual({
        status: first.status,
        states: first.states,
        path: first.path,
      });
  }, 120000);
});
