// The differential oracle of 4.1.13 (tests/solver-oracle.test.ts, docs/dev/adr/0015-compact-state.md): the cases and
// what is compared. A case is a game and the options of one search; its signature is the search's verdict, its path
// and session entries, its softlock causes and its whole reachable set, each as a digest. The fixture
// (tests/fixtures/solver-oracle.json) holds the signatures written by the 4.1.8 implementation, before the compact
// representation: a search of today must give the same, state for state.
import { createHash } from 'node:crypto';
import type { GameDef, Layout } from '@engine/core/types';
import type { CustomCommands } from '@engine/core/custom';
import type { SolveOptions, SolveResult } from '@engine/tools/solve';
import { loadLayouts } from '@engine/tools/load';
import { game as demo, layouts as demoLayouts, commands as demoCommands } from '../../games/demo';
import { game as reference } from '../../games/reference/game';
import { randomGame } from './random-game';

export interface OracleCase {
  id: string;
  game: GameDef;
  layouts: Record<string, Layout>;
  opts: SolveOptions;
}

const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** demo (witness and proof), the reference game's proof, and 200 generated games (100 plain, 50 with free items, 50 with three characters), proofs within 3 000 states. */
export function oracleCases(): OracleCase[] {
  const out: OracleCase[] = [];
  const commands = demoCommands as CustomCommands | undefined;
  out.push({ id: 'demo witness', game: demo, layouts: demoLayouts, opts: { commands } });
  out.push({ id: 'demo proof', game: demo, layouts: demoLayouts, opts: { mode: 'prove', maxStates: 20000, commands } });
  out.push({
    id: 'reference proof',
    game: reference,
    layouts: loadLayouts('games/reference/layout'),
    opts: { mode: 'prove', maxStates: 20000 },
  });
  const kinds = [
    { name: 'plain', o: {}, n: 100 },
    { name: 'free', o: { free: true }, n: 50 },
    { name: 'three', o: { free: true, players: 3 as const }, n: 50 },
  ];
  for (const k of kinds)
    for (let seed = 1; seed <= k.n; seed++) {
      const { game, layouts } = randomGame(seed, k.o);
      out.push({ id: `${k.name} ${seed}`, game, layouts, opts: { mode: 'prove', maxStates: 3000 } });
    }
  return out;
}

/** What must not change: everything a person or a tool reads of the result, and the reachable set. */
export function signature(r: SolveResult) {
  return {
    status: r.status,
    states: r.states,
    finished: r.finished,
    truncated: r.truncated,
    softlockCount: r.softlockCount,
    path: sha(r.path),
    steps: sha(r.steps),
    softlocks: sha(r.softlocks),
    // 4.1.13 added the session entries of each cause; the oracle compares what 4.1.8 had.
    causes: sha(r.softlockCauses.map(({ steps, ...c }) => (void steps, c))),
    deadEnds: sha(r.deadEnds),
    flags: sha(r.flagsReached),
    rooms: sha(r.roomsReached),
    broken: sha(r.broken),
    errors: r.errors.length,
    reachable: sha(r.reachable ?? null),
  };
}
