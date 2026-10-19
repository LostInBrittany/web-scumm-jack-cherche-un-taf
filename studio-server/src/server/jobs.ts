// The long jobs of a hosted Studio (4.2.3 PR 7, H8): "Prepare assets", a sheet's cutting and a cell's keying, each a
// job of the processing worker under the member's exclusive lease. A job answers at once with its id (202); its
// states go to the live stream (`job` events, in order: `queued`, `running`, then `done`, `failed` or `cancelled`)
// and are read again by `GET /api/jobs/<id>`. One job runs at a time (the worker runs one at a time anyway, and the
// exclusive lease is the project's); four more may wait.
//
// Cancelling (`POST /api/jobs/<id>/cancel`, its author or an owner): a waiting job never runs; a running one is
// aborted (its request to the worker closed, which kills the child with its process group; a local child is killed
// the same way), and whatever it computed is dropped. Its write is the last step, and it starts only through
// `commit()`: from then on the job is past cancelling (409), so a job is either cancelled with no operation at all, or
// done with its one operation. The exclusive lease is given back in both cases (the job's own `finally`).
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { isStudioError, StudioError } from '../ops/errors';

type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type JobKind = 'prepare' | 'cut' | 'cell';

export interface JobInfo {
  id: string;
  kind: JobKind;
  /** Who started it (their name), and their id: they, or an owner, may cancel it. */
  by: string;
  byId: string;
  state: JobState;
  /** What it does now, while running (`packing`, `on the worker`, `writing`). */
  step?: string;
  /** When it was queued, and when it ended (ms since the epoch). */
  at: number;
  ended?: number;
  /** done: what the route would have answered. */
  result?: unknown;
  /** failed: why, with the status the route would have answered it with, and its body's extra fields. */
  error?: string;
  status?: number;
  body?: Record<string, unknown>;
}

/** What a job's work is given: the signal that says it is cancelled, its steps, and the gate before its write. */
export interface JobControl {
  signal: AbortSignal;
  step(what: string): void;
  /** Before the write: throws if the job is cancelled; past it, the job can no longer be cancelled. */
  commit(): void;
}

class JobCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortError';
  }
}

const KEEP = 50;
const WAITING = 4;

export class Jobs {
  /** `changed` (JobInfo): each state and step, in order, for the live stream. */
  readonly events = new EventEmitter();
  private jobs = new Map<string, JobInfo>();
  private ctl = new Map<string, { abort: AbortController; committing: boolean }>();
  private chain: Promise<unknown> = Promise.resolve();
  private waiting = 0;

  constructor(private now: () => number = Date.now) {
    this.events.setMaxListeners(0);
  }

  private emit(j: JobInfo) {
    this.events.emit('changed', { ...j });
  }

  /** The job, as the stream last said it. */
  get(id: string): JobInfo | undefined {
    const j = this.jobs.get(id);
    return j && { ...j };
  }

  /** The jobs not ended yet, oldest first (a new stream's `hello`). */
  active(): JobInfo[] {
    return [...this.jobs.values()].filter((j) => j.state === 'queued' || j.state === 'running').map((j) => ({ ...j }));
  }

  /**
   * Queues `work`; answers at once. `wrap` runs it in the request's context (who writes, their claim): the job runs
   * after the request has been answered.
   */
  start(
    kind: JobKind,
    who: { name: string; userId: string },
    work: (c: JobControl) => Promise<unknown>,
    wrap: <T>(fn: () => Promise<T>) => Promise<T> = (fn) => fn(),
  ): JobInfo {
    if (this.waiting >= WAITING) throw new StudioError('too many jobs are waiting: try again when one is done', 429);
    const j: JobInfo = { id: randomUUID(), kind, by: who.name, byId: who.userId, state: 'queued', at: this.now() };
    const abort = new AbortController();
    const c = { abort, committing: false };
    this.jobs.set(j.id, j);
    this.ctl.set(j.id, c);
    // The oldest ended jobs are forgotten past KEEP.
    const ended = [...this.jobs.values()].filter((x) => x.ended);
    for (const x of ended.slice(0, Math.max(0, ended.length - KEEP))) this.jobs.delete(x.id);
    this.waiting++;
    this.emit(j);
    const control: JobControl = {
      signal: abort.signal,
      step: (what) => {
        if (j.state !== 'running' || abort.signal.aborted) return;
        j.step = what;
        this.emit(j);
      },
      commit: () => {
        if (abort.signal.aborted) throw new JobCancelled();
        c.committing = true;
        j.step = 'writing';
        this.emit(j);
      },
    };
    const run = async () => {
      if (abort.signal.aborted) return;
      j.state = 'running';
      this.emit(j);
      try {
        j.result = await wrap(() => work(control));
        j.state = abort.signal.aborted && !c.committing ? 'cancelled' : 'done';
        if (j.state === 'cancelled') j.result = undefined;
      } catch (e) {
        if (abort.signal.aborted && !c.committing) j.state = 'cancelled';
        else {
          j.state = 'failed';
          j.error = String((e as Error)?.message ?? e).slice(0, 2_000);
          j.status = isStudioError(e) ? e.status : 500;
          const body = (e as { body?: Record<string, unknown> }).body;
          if (body && typeof body === 'object') j.body = body;
        }
      }
    };
    this.chain = this.chain.then(async () => {
      this.waiting--;
      await run();
      if (!j.ended) this.end(j);
    });
    return { ...j };
  }

  private end(j: JobInfo) {
    j.step = undefined;
    j.ended = this.now();
    this.ctl.delete(j.id);
    this.emit(j);
  }

  /**
   * Cancels a job: its author's or an owner's. A waiting job is cancelled at once (it never runs); a running one when
   * its work has stopped. A job writing, or ended, is past cancelling: 409.
   */
  cancel(id: string, who: { userId: string; owner: boolean }): JobInfo {
    const j = this.jobs.get(id);
    if (!j) throw new StudioError(`no job ${id}`, 404);
    if (j.byId !== who.userId && !who.owner)
      throw new StudioError('only who started a job, or an owner, cancels it', 403);
    const c = this.ctl.get(id);
    if (!c || j.ended) throw new StudioError(`the job has already ended (${j.state})`, 409);
    if (c.committing) throw new StudioError('too late: the job is writing its result', 409);
    c.abort.abort(new JobCancelled());
    if (j.state === 'queued') {
      j.state = 'cancelled';
      this.end(j);
    }
    return { ...j };
  }
}
