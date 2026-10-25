// The worker's lanes (4.4.0): a preview never waits behind the health's validator and solver (up to 45 s), a load or a
// prepare. Two lanes, `preview` and `other`, each running one job at a time in the order its jobs came, each with its
// own bound on the jobs it holds (running or waiting): at most two children at once on a worker, one per lane. Both
// run the one instance's jobs (one project, one trust domain): a job's code was already assumed to see the jobs after
// it on the same machine (ADR 0028, residual risks); now it may see the other lane's while both run.
import type { JobKind } from './job';

export type Lane = 'preview' | 'other';

/** The lane of a job's kind: a revision's preview (or a published build) alone in its own. */
export const laneOf = (kind: JobKind): Lane => (kind === 'preview' ? 'preview' : 'other');

/** The jobs a lane holds at most, running or waiting: the next is refused (429). */
export const MAX_QUEUED = 8;

export class Lanes {
  private chains: Record<Lane, Promise<unknown>> = { preview: Promise.resolve(), other: Promise.resolve() };
  private counts: Record<Lane, number> = { preview: 0, other: 0 };

  constructor(readonly max = MAX_QUEUED) {}

  /** The jobs a lane holds (running or waiting), or both lanes' with no lane named. */
  held(lane?: Lane): number {
    return lane ? this.counts[lane] : this.counts.preview + this.counts.other;
  }

  /**
   * Runs `fn` once the lane's jobs before it have ended (whatever their outcome), or answers undefined at once when
   * the lane holds `max` jobs already. A job leaves its lane when it ends, before its caller hears of it.
   */
  run<T>(lane: Lane, fn: () => Promise<T>): Promise<T> | undefined {
    if (this.counts[lane] >= this.max) return undefined;
    this.counts[lane]++;
    const p = this.chains[lane].then(fn);
    this.chains[lane] = p.catch(() => {});
    return p.finally(() => {
      this.counts[lane]--;
    });
  }
}
