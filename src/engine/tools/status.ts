// The one status of a solver run or a proof by chapters, with its exit code and its sentence. The command line (text
// and `--json`), the Studio's Check tab and the MCP `solve` tool all read these: none of them words its own verdict.

/** Worst first: an engine error, a broken invariant, an incomplete search, no ending, softlocks, then `solved`. */
export type SolveStatus = 'solved' | 'softlocks' | 'unsolved' | 'truncated' | 'broken' | 'error';
export type ProofStatus = SolveStatus | 'checkpoint_mismatch';

/** 0: solved. 2: truncated (nothing is proved, raise the budget). 1: anything else. */
export type ExitCode = 0 | 1 | 2;
export const exitOf = (s: ProofStatus): ExitCode => (s === 'solved' ? 0 : s === 'truncated' ? 2 : 1);

const RANK: Record<SolveStatus, number> = { solved: 0, softlocks: 1, unsolved: 2, truncated: 3, broken: 4, error: 5 };
/** The worse of two statuses (a proof by chapters is as bad as its worst search). */
export const worstStatus = (a: SolveStatus, b: SolveStatus): SolveStatus => (RANK[a] >= RANK[b] ? a : b);

/** What a status means for one search, in one sentence. */
export function solveHeadline(r: {
  status: SolveStatus;
  mode: 'witness' | 'prove';
  states: number;
  softlockCount: number;
  broken: unknown[];
  errors: unknown[];
  goal?: boolean;
  stoppedBy?: 'states' | 'time' | 'memory';
}): string {
  const end = r.goal ? 'the goal' : 'the ending';
  switch (r.status) {
    case 'solved':
      return r.mode === 'prove'
        ? `solved: ${end} stays reachable from every one of the ${r.states} reachable states`
        : `solved: ${end} is reached on one path (${r.states} states explored; only --prove checks every state, every answer of a choice included)`;
    case 'softlocks':
      return `softlocks: ${r.softlockCount} reachable state(s) can no longer reach ${end}`;
    case 'unsolved':
      return `unsolved: ${end} is not reached from any of the ${r.states} states explored`;
    case 'truncated':
      return `truncated: the search stopped at ${r.states} states, nothing is proved (${r.stoppedBy === 'time' ? 'out of time: raise --time' : r.stoppedBy === 'memory' ? 'out of memory: raise --mem, or resume from the checkpoint' : 'raise --max'})`;
    case 'broken':
      return `broken: ${r.broken.length} invariant(s) broken on a reachable state`;
    case 'error':
      return `error: ${r.errors.length} engine error(s) while exploring`;
  }
}

/** What a status means for a proof by chapters, in one sentence. */
export function chaptersHeadline(p: {
  status: ProofStatus;
  chapters: { id: string; status: SolveStatus; checkpointUnreachable?: boolean }[];
}): string {
  const bad = p.chapters.find((c) => c.status !== 'solved');
  switch (p.status) {
    case 'solved':
      return `solved: every chapter (${p.chapters.length}) proved from all its boundary states`;
    case 'checkpoint_mismatch':
      return `checkpoint_mismatch: every chapter proved, but checkpoint ${p.chapters
        .filter((c) => c.checkpointUnreachable)
        .map((c) => c.id)
        .join(', ')} is none of its reachable boundary states`;
    default:
      return `${p.status}: chapter ${bad?.id ?? '?'} is ${bad?.status ?? p.status}`;
  }
}
