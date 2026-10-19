// The game's health by revision (4.2.2 PR 3, plan §2.3, G3 and G4). After each confirmed revision the head is
// judged on the processing worker (the validator, then the solver, bounded in time: the guard already refuses an edit
// the validator fails, so what breaks is mostly a game that can no longer be finished), coalesced like the previews (a burst of writes judges its last revision only),
// from a snapshot packed holding the instance's lock, and the verdict is kept with its revision. When the head fails
// where the last judged revision passed, a bisection over the revisions between them (snapshots rebuilt from the
// journal's blobs) finds the first that fails, in ⌈log₂ n⌉ validations: the revision, the operation that made it and
// its files are named, never its author (two reasonable changes can oppose each other; a revision is not a culprit
// person). A failing head after a failing revision keeps the revision found then. A worker away or past its deadline
// records nothing and is tried again later; a solver cut short records nothing either, and is not tried again until
// the next revision: in both cases the state says "unknown", never "valid".
import { EventEmitter } from 'node:events';
import type { SqlDb } from '../../../bridge/src/store-sql';
import type { SolveData, ValidateResult } from '../../../tools/studio/types';
import { packable, packFiles } from '../worker/snapshot';

export interface Broken {
  rev: number;
  what: string;
  paths: string[];
}

export interface HealthState {
  epoch: string;
  head: number;
  /** The last revision judged, its verdict, its first errors; null when none is known yet. */
  rev: number | null;
  ok: boolean | null;
  errors: string[];
  warnings: number;
  /** For a failing revision: the first revision that failed after the last passing one, when it is known. */
  brokenSince: Broken | null;
  /** The revision being judged (or bisected), or null. */
  running: number | null;
  /** Why the head's verdict is unknown (the solver cut short), or null. */
  unknown: string | null;
}

/** A revision's verdict; `unknown` when it cannot be given (the solver cut short): nothing is recorded then. */
export interface Verdict {
  ok: boolean;
  errors: string[];
  warnings: string[];
  ms: number;
  unknown?: string;
}

class UnknownVerdict extends Error {}

/**
 * The verdict made of the validator, then the solver from a new game (a witness, bounded in time): valid when both
 * pass; unknown when the solver was cut short (its time, its states).
 */
export function judgeBy(o: {
  validate: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<ValidateResult>;
  solve: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<SolveData>;
}): HealthOptions['judge'] {
  return async (snapshot, at) => {
    const v = await o.validate(snapshot, at);
    if (!v.ok) return v;
    const s = await o.solve(snapshot, at);
    if (s.status === 'truncated') return { ...v, unknown: `the solver was cut short (${s.headline})` };
    const errors = [...s.errors, ...(s.exit === 0 ? [] : [s.headline])];
    return { ok: errors.length === 0, errors, warnings: v.warnings, ms: v.ms + s.ms };
  };
}

export interface HealthOptions {
  db: SqlDb;
  journal: {
    filesAt(
      rev: number,
      keep?: (path: string) => boolean,
      blobs?: Map<string, Buffer>,
    ): Promise<{ path: string; bytes: Buffer }[]>;
    revision(): Promise<number>;
    opAt(rev: number): Promise<{ rev: number; what: string; paths: string[] } | undefined>;
  };
  /** The folder packed at its revision, holding the instance's lock. */
  snapshot: () => Promise<{ epoch: string; rev: number; bytes: Buffer }>;
  /** The verdict on a snapshot: the worker's jobs (the validator, then the solver). */
  judge: (snapshot: Buffer, at: { epoch: string; rev: number }) => Promise<Verdict>;
  log?: (line: Record<string, unknown>) => void;
  now?: () => number;
}

const RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
/** The errors kept with a verdict, and shown: the first few say where to look. */
const KEPT = 5;
/** Failures of the same revision before it is said unknown ("cannot be judged") rather than tried again. */
const GIVE_UP = 5;

interface Row {
  rev: number;
  ok: boolean;
  errors: string[];
  warnings: number;
  culprit: number | null;
}

const rowOf = (r: Record<string, unknown>): Row => ({
  rev: Number(r.rev),
  ok: Number(r.ok) === 1,
  errors: JSON.parse(String(r.errors)) as string[],
  warnings: Number(r.warnings),
  culprit: r.culprit === null || r.culprit === undefined ? null : Number(r.culprit),
});

export class Health {
  /** `changed` (HealthState). */
  readonly events = new EventEmitter();
  private s: HealthState = {
    epoch: '',
    head: 0,
    rev: null,
    ok: null,
    errors: [],
    warnings: 0,
    brokenSince: null,
    running: null,
    unknown: null,
  };
  private wanted = false;
  private closed = false;
  private running: Promise<void> | null = null;
  private gate: Promise<unknown> = Promise.resolve();
  private failures = { rev: -1, n: 0 };
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = RETRY_MS;
  private now: () => number;

  constructor(private o: HealthOptions) {
    this.events.setMaxListeners(0);
    this.now = o.now ?? Date.now;
  }

  state(): HealthState {
    return { ...this.s, errors: [...this.s.errors], brokenSince: this.s.brokenSince && { ...this.s.brokenSince } };
  }

  /** Asks for the head's verdict; resolves when the run it joined ends (the tests, the server's start). */
  schedule(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.wanted = true;
    this.running ??= this.loop().finally(() => {
      this.running = null;
      if (this.wanted && !this.closed) void this.schedule();
    });
    return this.running;
  }

  /** Stops the retries and the runs to come (the server's stop, the tests). */
  close() {
    this.closed = true;
    clearTimeout(this.retry);
  }

  private changed() {
    this.events.emit('changed', this.state());
  }

  /** One judgement or bisection at a time: the loop's and the ones asked for never overlap. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.gate.then(fn);
    this.gate = p.catch(() => undefined);
    return p;
  }

  private async loop() {
    while (this.wanted && !this.closed) {
      this.wanted = false;
      try {
        await this.serial(() => this.once());
        this.retryMs = RETRY_MS;
        this.failures = { rev: -1, n: 0 };
      } catch (e) {
        const message = String((e as Error).message).slice(0, 300);
        const rev = this.s.head;
        this.failures = { rev, n: this.failures.rev === rev ? this.failures.n + 1 : 1 };
        this.o.log?.({ event: 'health-failed', rev, message, retryMs: this.retryMs, tries: this.failures.n });
        if (this.failures.n >= GIVE_UP) {
          // The same revision failing again and again (the game too large for the worker, a store that lacks its
          // blobs): unknown, said with its reason, and judged again at the next revision only.
          this.s = {
            ...this.s,
            rev,
            ok: null,
            errors: [],
            warnings: 0,
            brokenSince: null,
            unknown: `cannot be judged: ${message}`,
          };
          this.changed();
          continue;
        }
        clearTimeout(this.retry);
        this.retry = setTimeout(() => void this.schedule(), this.retryMs);
        this.retry.unref?.();
        this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
      } finally {
        if (this.s.running !== null) {
          this.s.running = null;
          this.changed();
        }
      }
    }
  }

  private async row(epoch: string, rev: number): Promise<Row | undefined> {
    const [r] = await this.o.db.all('SELECT * FROM studio_health WHERE epoch = $1 AND rev = $2', [epoch, rev]);
    return r ? rowOf(r) : undefined;
  }

  /** Keeps a verdict; a revision already kept only gains the revision that broke it, never loses it. */
  private async record(epoch: string, rev: number, v: Verdict, culprit: number | null) {
    await this.o.db.run(
      'INSERT INTO studio_health (epoch, rev, ok, errors, warnings, culprit, ms, made_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (epoch, rev) DO UPDATE SET culprit = COALESCE(studio_health.culprit, excluded.culprit)',
      [epoch, rev, v.ok ? 1 : 0, JSON.stringify(v.errors.slice(0, KEPT)), v.warnings.length, culprit, v.ms, this.now()],
    );
  }

  private async show(epoch: string, head: number, r: Row) {
    const op = r.ok || r.culprit === null ? undefined : await this.o.journal.opAt(r.culprit);
    this.s = {
      epoch,
      head,
      rev: r.rev,
      ok: r.ok,
      errors: r.errors,
      warnings: r.warnings,
      brokenSince: op ? { rev: op.rev, what: op.what, paths: op.paths } : null,
      running: null,
      unknown: null,
    };
    this.changed();
  }

  private async once() {
    const snap = await this.o.snapshot();
    if (snap.epoch !== this.s.epoch)
      this.s = { ...this.s, epoch: snap.epoch, rev: null, ok: null, brokenSince: null, unknown: null };
    this.s.head = snap.rev;
    const known = await this.row(snap.epoch, snap.rev);
    if (known) return this.show(snap.epoch, snap.rev, known);
    this.s.running = snap.rev;
    this.changed();
    const v = await this.o.judge(snap.bytes, { epoch: snap.epoch, rev: snap.rev });
    if (v.unknown) {
      this.s = { ...this.s, rev: snap.rev, ok: null, errors: [], warnings: 0, brokenSince: null, unknown: v.unknown };
      this.o.log?.({ event: 'health', rev: snap.rev, unknown: v.unknown });
      return this.changed();
    }
    // Broken: the first failing revision after the last passing one, searched from that one (the revisions already
    // judged on the way are read back, not judged again). None passed before: no revision is named. A revision
    // whose verdict is unknown stops the search: none is named either.
    let culprit: number | null = null;
    if (!v.ok) {
      const [p] = await this.o.db.all(
        'SELECT rev FROM studio_health WHERE epoch = $1 AND rev < $2 AND ok = 1 ORDER BY rev DESC LIMIT 1',
        [snap.epoch, snap.rev],
      );
      // The first failing revision already known above it bounds the search: nothing known is judged again.
      const [f] = p
        ? await this.o.db.all(
            'SELECT MIN(rev) AS rev FROM studio_health WHERE epoch = $1 AND rev > $2 AND rev < $3 AND ok = 0',
            [snap.epoch, Number(p.rev), snap.rev],
          )
        : [];
      const bad = f?.rev === null || f?.rev === undefined ? snap.rev : Number(f.rev);
      if (p)
        culprit = await this.bisect(snap.epoch, Number(p.rev), bad, snap.rev).catch((e) => {
          if (e instanceof UnknownVerdict) return null;
          throw e;
        });
    }
    await this.record(snap.epoch, snap.rev, v, culprit);
    this.o.log?.({ event: 'health', rev: snap.rev, ok: v.ok, culprit, ms: v.ms });
    await this.show(snap.epoch, snap.rev, {
      rev: snap.rev,
      ok: v.ok,
      errors: v.errors.slice(0, KEPT),
      warnings: v.warnings.length,
      culprit,
    });
  }

  /**
   * A past revision's verdict: kept, or judged on its snapshot rebuilt from the journal (and kept). Never a revision
   * past the head: its files would be the head's, kept under a number the next write takes.
   */
  private async judge(epoch: string, rev: number, head: number, blobs: Map<string, Buffer>): Promise<boolean> {
    if (rev > head) throw new Error(`revision ${rev} is past the head (${head})`);
    const known = await this.row(epoch, rev);
    if (known) return known.ok;
    const files = await this.o.journal.filesAt(rev, (p) => packable(p), blobs);
    const v = await this.o.judge(packFiles(files), { epoch, rev });
    if (v.unknown) throw new UnknownVerdict(`revision ${rev}: ${v.unknown}`);
    await this.record(epoch, rev, v, null);
    return v.ok;
  }

  /**
   * The first revision in (`good`, `bad`] whose verdict fails, given that `good` passes and `bad` fails: at most
   * ⌈log₂ (bad − good)⌉ judgements (each the validator and the solver), fewer with revisions already judged. The
   * blobs read along the way are read once.
   */
  async bisect(epoch: string, good: number, bad: number, head: number): Promise<number> {
    const blobs = new Map<string, Buffer>();
    let lo = good;
    let hi = bad;
    while (hi - lo > 1) {
      const mid = lo + Math.floor((hi - lo) / 2);
      this.s.running = mid;
      this.changed();
      if (await this.judge(epoch, mid, head, blobs)) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  /**
   * The verdict of one revision from its snapshot, when none is kept yet (a published build's revision, which the
   * coalesced loop may have passed over): judged and kept, after the loop's run. An unknown verdict keeps nothing.
   */
  judgeSnapshot(epoch: string, rev: number, bytes: Buffer): Promise<void> {
    return this.serial(async () => {
      if (await this.row(epoch, rev)) return;
      const v = await this.o.judge(bytes, { epoch, rev });
      if (!v.unknown) await this.record(epoch, rev, v, null);
    });
  }

  /**
   * A bisection asked for (POST /api/health/bisect): `good` must pass and `bad` fail, both judged first, both at or
   * before the head. One at a time, after the loop's run. The revision found is kept on `bad`'s verdict too.
   */
  bisectOn(good: number, bad: number): Promise<Broken | { error: string }> {
    return this.serial(async () => {
      if (!(Number.isSafeInteger(good) && Number.isSafeInteger(bad) && 0 <= good && good < bad))
        return { error: '`good` and `bad` are revisions, `good` before `bad`' };
      const head = await this.o.journal.revision();
      if (bad > head) return { error: `revision ${bad} is past the head (${head})` };
      const epoch = this.s.epoch || (await this.o.snapshot()).epoch;
      const blobs = new Map<string, Buffer>();
      try {
        if (!(await this.judge(epoch, good, head, blobs))) return { error: `revision ${good} does not pass` };
        if (await this.judge(epoch, bad, head, blobs)) return { error: `revision ${bad} passes` };
        const rev = await this.bisect(epoch, good, bad, head);
        await this.o.db.run('UPDATE studio_health SET culprit = $3 WHERE epoch = $1 AND rev = $2 AND culprit IS NULL', [
          epoch,
          bad,
          rev,
        ]);
        const op = await this.o.journal.opAt(rev);
        return { rev, what: op?.what ?? '', paths: op?.paths ?? [] };
      } catch (e) {
        if (e instanceof UnknownVerdict) return { error: `${e.message}: no revision can be named` };
        throw e;
      } finally {
        this.s.running = null;
        this.changed();
      }
    });
  }
}
