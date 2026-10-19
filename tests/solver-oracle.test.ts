// The differential oracle of the compact representation (4.1.13, ADR 0015): on the sample game, the reference game
// and 200 generated games, today's search gives exactly what the 4.1.8 implementation gave (the fixture): the same
// verdict, the same path and session entries, the same softlocks and causes, and the same reachable set, state for
// state. `ORACLE_WRITE=1` writes the fixture again: only for a change that means to alter what the solver finds, said
// in the LOG.
// 4.1.17: `reference proof` written again, alone (`tools/oracle-case.ts --diff`): the reference chapter gained a topic
// (`hall.neighbor.i-know-the-password`, 4.1.15 Remix) and the code wheel's flag, so one dialogue pick moved by one and
// two flags appeared; the verdict, the 288 states, the path and the reachable set are those of 4.1.8.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solve, type SolveOptions } from '@engine/tools/solve';
import { oracleCases, signature } from './gen/oracle';

const FIXTURE = 'tests/fixtures/solver-oracle.json';
const write = process.env.ORACLE_WRITE === '1';

async function run(extra: SolveOptions) {
  const out: Record<string, ReturnType<typeof signature>> = {};
  for (const c of oracleCases())
    out[c.id] = signature(
      await solve(structuredClone(c.game), c.layouts, { ...c.opts, ...extra, keepReachable: true }),
    );
  return out;
}

describe('the solver against the 4.1.8 oracle', () => {
  it('203 searches: the same verdicts, paths, softlocks and reachable sets', async () => {
    const now = await run({});
    if (write) {
      writeFileSync(FIXTURE, JSON.stringify(now, null, 1) + '\n');
      // A rewrite is never a pass: review the fixture's diff, then run again without ORACLE_WRITE.
      expect('fixture rewritten, review the diff').toBe('fixture compared');
    }
    const before = JSON.parse(readFileSync(FIXTURE, 'utf8')) as typeof now;
    expect(Object.keys(now).length).toBe(203);
    expect(Object.keys(now).sort()).toEqual(Object.keys(before).sort());
    const diff = Object.keys(before).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(before[k]));
    expect(diff).toEqual([]);
  }, 900_000);
});
