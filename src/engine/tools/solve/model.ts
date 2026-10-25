// The search's contract: its options, a node of the frontier, one expansion and its statistics.

import type { CustomCommands } from '../../core/custom';
import type { RW, Tx } from '../por';
import type { Cond, GameState, Id, SessionEntry } from '../../core/types';
import type { Dims } from './abstractions';
import type { SolveProfile } from './report';

/**
 * Signals from the world outside in a search (4.1.1, wiki/en/bridge.what-it-is.md): `closed` (the default) none, the game on its
 * own; a scenario, the listed signals in order, each able to arrive at any point after the one before; `adversarial`,
 * any declared signal at any point, again and again (a signal applied once per game is a no-op after its first time).
 * A proof never contacts a real service: the solver hands the engine the signal itself.
 */
export type RealityPolicy = 'closed' | 'adversarial' | { scenario: string; signals: string[] };

/**
 * What a search is told: its mode, where it starts and stops, the custom commands, the world's signals and its
 * budgets.
 * @public
 */
export interface SolveOptions {
  /** Signals from the world outside (4.1.1). Default `closed`. */
  reality?: RealityPolicy;
  maxStates?: number;
  /** `witness` stops at the first solution; `prove` explores the whole reachable graph and finds softlocks. */
  mode?: 'witness' | 'prove';
  /** Where the search starts: a new game, a checkpoint, or a state (a chapter's boundary state, `proveChapters`). */
  start?: 'new' | { checkpoint: Id } | { state: GameState } | { states: GameState[] };
  /** Stop when all these conditions hold (a chapter's goals), instead of at the ending. */
  goal?: Cond[];
  /** The game's custom commands: their `effects` apply (their `run` never does here). */
  commands?: CustomCommands;
  /**
   * Partial-order reduction (src/engine/tools/por.ts). `sleep`: two actions that touch different things commute, so
   * after one of them the other is not tried again on the way back (fewer engine runs, the same states). `stubborn`:
   * explores one of several commuting actions at a time (fewer states too). Off by default.
   */
  por?: 'sleep' | 'stubborn' | false;
  /**
   * Lets `por` apply in proof mode. The reductions have no proof of equivalence for softlock detection (the edges
   * they drop feed the reverse reachability): only `tests/por.test.ts` (the differential suite) sets this.
   */
  unsafeReduction?: boolean;
  /**
   * The no-op memo: a try that wrote nothing at all (`Engine.writes`) is kept with the values it read
   * (`Engine.reads`); the same try on a state with the same values is a no-op too, so it is not run again. Exact as
   * long as the engine's read trace is complete: one hit in `memoVerify` (default 16) is run anyway and compared, and
   * a difference is an error, never a silent skip. Default: on, except with `por`.
   */
  memo?: boolean;
  /** Run one memo hit in this many anyway and compare (1: every hit, the differential tests). */
  memoVerify?: number;
  /**
   * Several playable characters: states that differ only by who is active are one state, and each state offers the
   * actions of every character (`Switch to X › action`). Applies when switching changes nothing the solver reads
   * (checked on every switch: a switch that does change something stays an explicit step) and no invariant or goal
   * (the goal) reads `{ player }`; invariants are checked on every character's view. Default: on in proof mode, off for a witness (whose printed path then stays the same).
   */
  canonicalPlayers?: boolean;
  /**
   * Mobility regions (src/engine/tools/mobility.ts): a character's exact room is replaced by the region of rooms it
   * can walk between silently, and the actions of every room of the region are offered as `Go to <room> › action`.
   * Every hop is checked when played; one that is not silent restarts the search with exact rooms
   * (`profile.mobility.reason`). Default: on in proof mode, off for a witness.
   */
  mobility?: boolean;
  /**
   * The canonical owner (3.5): items no condition reads (`poolableItems`) are one pool, whoever holds them, while every
   * playable character is in one mobility region (they can meet without changing anything); before a character's
   * actions are tried, the hand-overs that give it the pool are played and checked. Default: on in proof mode with the
   * canonical character and mobility regions; a hand-over that changes something restarts the search without it.
   */
  ownership?: boolean;
  /**
   * Witness dominance (3.5, witness searches only: it cannot prune a proof): a new state with no more progress than one
   * already seen (`dominanceThings`: the same everything else, its monotonic items and flags a subset) is not explored.
   * A witness search that finds nothing with it is run again without it, so it never reports `unsolved` by itself.
   */
  dominance?: boolean;
  /**
   * Proof workers (3.5, solve-pool.ts): the frontier expanded a batch at a time by this many worker threads (`auto`:
   * the cores but one, at most 8). The result depends on `batch`, never on the number of workers; without this option
   * the search expands one node at a time, as before. Not with a partial-order reduction.
   */
  workers?: number | 'auto';
  /** Nodes taken from the frontier at once with workers (default 64). */
  batch?: number;
  /** The game's module (its `commands` reach the workers from there; the game itself is sent as data). */
  gameModule?: string;
  /** Stop after this long (milliseconds): the result is `truncated`, `profile.stoppedBy` says why. */
  timeLimitMs?: number;
  /**
   * Called every 256 expansions with where the search stands (4.1.13: `npm run prove:matrix` samples the memory
   * there). It reads, never steers: the search is the same with or without it.
   */
  onProgress?: (p: { states: number; expansions: number; queue: number; ms: number }) => void;
  /** The explosion profile (4.1.13, explosion.ts) in `profile.explosion`: `npm run solve -- --profile` asks for it. */
  explosion?: boolean;
  /** Tests and the matrix (4.1.13): the result lists every reachable state's key (`SolveResult.reachable`, sorted). */
  keepReachable?: boolean;
  /**
   * How the states seen are stored (4.1.13, docs/dev/adr/0015-compact-state.md). `compact` (the default): interned
   * keys, parents and steps by index, the engine state dropped once expanded. `objects`: everything of every state,
   * as 4.1.8 did, the reference of the differential tests. The partial-order reduction needs `objects` (it expands a
   * state again), so it gets it.
   */
  representation?: 'compact' | 'objects';
  /**
   * Checkpoint and resume (4.1.13): `save` gets the search written down every `everyMs` (default 5 min) or every
   * `everyExpansions`, and when a budget stops it; `resume` is such a text to take up again (a snapshot of another
   * search, or of another representation, is ignored and the profile says so). Compact representation only.
   */
  checkpoint?: { save: (text: string) => void; resume?: string | null; everyMs?: number; everyExpansions?: number };
  /** Stop (`truncated`, `stoppedBy: 'memory'`) once the heap passes this many MB (Node only: read every 256 expansions). */
  maxMemoryMb?: number;
  /**
   * Symmetric items (4.1.13, search/dominance.ts): items the game treats alike, swapped, give the same game; a proof
   * keeps one state of each swapped pair. Off unless asked for; measured against the explicit search
   * (tests/dominance.test.ts).
   */
  symmetry?: boolean;
  /**
   * Workers only (4.1.13, search/partition.ts): a visited table shared with the workers, so a state the search has
   * already stored comes back from a worker without its engine state. Default on with workers.
   */
  sharedVisited?: boolean;
  /** Tests only: worker `worker` (or every one) stops after `after` expansions, by exiting or by an uncaught error (tests/workers.test.ts). */
  workerCrash?: { worker: number | 'all'; after: number; how: 'exit' | 'throw' };
}

/**
 * A state of the search's frontier (4.1.0: was `Node`; 4.1.13: what is stored of a state seen lives in the store,
 * search/compact.ts, by index). Invariants: `dims` is `stateDims` of `state` under the search's keys, and `i` is the
 * store's index of their key, so two nodes with the same key are the same node; `len` is the number of steps from the
 * start, the length of the store's path to `i`; `expanded` turns true once, when its expansion is merged; `sleep` and
 * `only` only ever shrink what is tried.
 */
export interface SearchNode {
  i: number;
  state: GameState;
  dims: Dims;
  len: number;
  /** Sleep set: actions not to try here (an independent one was tried before them on the way), with what they read and wrote. */
  sleep: Map<string, RW>;
  expanded: boolean;
  /** A node seen again with a smaller sleep set: only these actions are still to try. */
  only?: Set<string>;
}

/** The node an expansion starts from: what it needs of it, nothing of the search around it (a worker gets this). */
export interface NodeInput {
  state: GameState;
  dims: Dims;
  sleep: Map<string, RW>;
  only?: Set<string>;
}

/**
 * A transition: one try that changed the state or reached the goal, in the order the tries ran. `h` is the hash of
 * the next state's `dims`; `noop` with `hitGoal` is a goal reached without a change. The merge (which reads `seen`, the
 * frontier and the goals) decides what becomes of it; the expansion never looks at them.
 */
interface TryRecord {
  key: string;
  label: string;
  h: string;
  hitGoal: boolean;
  /** The state did not change (a goal state all the same: kept for the goals only). */
  noop: boolean;
  dims?: Dims;
  /** Absent when a worker knew the state was stored already (`known`, the shared visited table). */
  state?: GameState;
  /** The worker found the state in the shared visited table and left its engine state and steps out. */
  known?: true;
  path?: string[];
  tailSteps?: SessionEntry[];
  rw?: RW | null;
  sleep?: Map<string, RW>;
}

/**
 * What expanding one node found: every action tried on the real engine from the node's state, in order. Invariants:
 * an expansion reads the node and the game only (never `seen`, the frontier or another node), so a worker computes
 * the same expansion as the coordinator; `records` are the transitions that changed something or reached the goal,
 * `tries` counts every action run, `effective` those whose answer came from a written rule.
 */
export interface Expansion {
  records: TryRecord[];
  /** Stubborn mode's transitions (por.ts). */
  txs: Tx[];
  progressed: boolean;
  tries: number;
  effective: number;
  byVerb: Record<string, number>;
  /** Invariants broken on another character's view of the node: the step after the node's path. */
  broken: { invariant: number; suffix: string[] }[];
  errors: string[];
}

/** What expansions add up besides their records (summed over workers: union, sums, maxima). */
export interface ExpandStats {
  itemsInRules: Set<string>;
  itemsSeen: Set<string>;
  flags: Set<string>;
  gained: Set<string>;
  roomsReached: Set<string>;
  attempted: Map<string, number>;
  perAction: Map<string, number>;
  fallbackByRoom: Map<string, { candidates: number; rules: number; fallback: number }>;
  n: {
    memoHits: number;
    memoStored: number;
    memoVerified: number;
    memoRefused: number;
    tries: number;
    skipped: number;
    slept: number;
    noops: number;
  };
  timing: SolveProfile['timing'];
  canon: { folded: number; explicit: number };
  mob: { moves: number; largest: number };
  own: { handovers: number };
}

/** Adds `b` into `a` (the coordinator's stats and a worker's). */
export function mergeStats(a: ExpandStats, b: ExpandStats) {
  for (const k of ['itemsInRules', 'itemsSeen', 'flags', 'gained', 'roomsReached'] as const)
    b[k].forEach((x) => a[k].add(x));
  for (const k of ['attempted', 'perAction'] as const) for (const [x, n] of b[k]) a[k].set(x, (a[k].get(x) ?? 0) + n);
  for (const [r, f] of b.fallbackByRoom) {
    const g = a.fallbackByRoom.get(r) ?? { candidates: 0, rules: 0, fallback: 0 };
    g.candidates += f.candidates;
    g.rules += f.rules;
    g.fallback += f.fallback;
    a.fallbackByRoom.set(r, g);
  }
  for (const k of Object.keys(a.n) as (keyof ExpandStats['n'])[]) a.n[k] += b.n[k];
  for (const k of Object.keys(a.timing) as (keyof SolveProfile['timing'])[]) a.timing[k] += b.timing[k];
  a.canon.folded += b.canon.folded;
  a.canon.explicit += b.canon.explicit;
  a.mob.moves += b.mob.moves;
  a.mob.largest = Math.max(a.mob.largest, b.mob.largest);
  a.own.handovers += b.own.handovers;
}
