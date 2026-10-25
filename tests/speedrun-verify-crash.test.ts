// What the verifier answers when loading a run's world fails for a reason that is no refusal (4.3.0, the reread of the
// mutation exemptions): `loadVariant` refuses a world with a RemixSeedError, said as `invalid-replay` with its code;
// any other error is a fault of the verifier, never the run's, so it is `inconclusive` / `crash`, not a refusal that
// would blame the runner. `loadVariant` is replaced in this file only, to throw such an error on demand.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Layout } from '@engine/core/types';
import { RemixSeedError } from '@engine/core/remix/seed-code';
import { verifyRun } from '@engine/tools/speedrun/verify';
import { game as reference } from '../games/reference/game';

const fault = vi.hoisted(() => ({ error: null as Error | null }));
vi.mock('@engine/core/remix/compile', async (orig) => {
  const real = await orig<typeof import('@engine/core/remix/compile')>();
  return {
    ...real,
    loadVariant: (...a: Parameters<typeof real.loadVariant>) => {
      if (fault.error) throw fault.error;
      return real.loadVariant(...a);
    },
  };
});

const layouts: Record<string, Layout> = Object.fromEntries(
  readdirSync('games/reference/layout')
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(`games/reference/layout/${f}`, 'utf8'))]),
);
const env = JSON.parse(readFileSync('tests/fixtures/speedrun/reference-any.wsrun', 'utf8'));
// The run's own fingerprint and engine: the checks before the world pass, and the world is the next thing read.
const ctx = { game: reference, layouts, fingerprint: env.fingerprint, engineVersion: env.engineVersion };

describe('loading the world of a run fails', () => {
  it('with an error that is no RemixSeedError: inconclusive, a crash of the verifier', async () => {
    fault.error = new TypeError('a fault of the verifier');
    try {
      expect(await verifyRun(env, ctx)).toMatchObject({ verdict: 'inconclusive', code: 'crash' });
    } finally {
      fault.error = null;
    }
  });

  it('with a RemixSeedError: invalid-replay, with its code', async () => {
    fault.error = new RemixSeedError('the stored world is not a world: refused', 'world-shape');
    try {
      expect(await verifyRun(env, ctx)).toMatchObject({ verdict: 'invalid-replay', code: 'world-shape' });
    } finally {
      fault.error = null;
    }
  });
});
