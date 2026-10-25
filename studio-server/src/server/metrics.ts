// The Studio Server's metrics (4.2.3 PR 9, H9): `GET /metrics` in Prometheus' text format (version 0.0.4), for the
// reference deployment's alerts. Measured from the code paths that exist, without changing what they do: the journal's
// operations (their latency, by outcome), the processing worker's jobs (in flight, their duration by kind and
// outcome), the spans' lease conflicts (the 423s answered), the answers by status class, the previews' build time, the
// health's judgements, the failures the server logs, and at each scrape the revision, the journal's RPO and whether
// this instance holds the service lease.
//
// Behind a secret only (STUDIO_METRICS_TOKEN, `Authorization: Bearer <token>`, compared in constant time): never the
// session, never the game's origin. Without the secret the route is a 404. What the metrics reveal (counts, durations,
// the revision; never a path, a name, an author or a file's content) is in the threat model. OpenTelemetry is not
// here: it stays optional, and out of 4.2.3.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isStudioError } from '../ops/errors';
import type { Applied, Operation } from '../ops/journal';

/** Seconds: from a quick operation (5 ms) to the longest wait for the worker (5 min, `MAX_JOB_MS`). */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300];

/** The log events counted (`studio_log_events_total`): the failures an operator alerts on. */
const COUNTED_EVENTS = new Set([
  'ship-failed',
  'health-failed',
  'reconcile-failed',
  'prepared-start-failed',
  'worker-staging-left',
  'error',
]);

/** A label's value as Prometheus reads it (backslash, double quote and line feed escaped). */
const labelValue = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labels = (l: Record<string, string>) => {
  const keys = Object.keys(l).sort();
  return keys.length ? `{${keys.map((k) => `${k}="${labelValue(l[k]!)}"`).join(',')}}` : '';
};
const num = (n: number) => (Number.isFinite(n) ? String(n) : n > 0 ? '+Inf' : n < 0 ? '-Inf' : 'NaN');

class Histogram {
  private series = new Map<string, { labels: Record<string, string>; counts: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  observe(seconds: number, l: Record<string, string> = {}) {
    const key = labels(l);
    let s = this.series.get(key);
    if (!s) {
      s = { labels: l, counts: BUCKETS.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    BUCKETS.forEach((b, i) => {
      if (seconds <= b) s.counts[i]!++;
    });
    s.sum += seconds;
    s.count++;
  }
  /** The number of observations of one series (the tests read it). */
  count(l: Record<string, string> = {}) {
    return this.series.get(labels(l))?.count ?? 0;
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const s of [...this.series.values()].sort((a, b) => (labels(a.labels) < labels(b.labels) ? -1 : 1))) {
      BUCKETS.forEach((b, i) =>
        out.push(`${this.name}_bucket${labels({ ...s.labels, le: String(b) })} ${s.counts[i]}`),
      );
      out.push(`${this.name}_bucket${labels({ ...s.labels, le: '+Inf' })} ${s.count}`);
      out.push(`${this.name}_sum${labels(s.labels)} ${num(s.sum)}`);
      out.push(`${this.name}_count${labels(s.labels)} ${s.count}`);
    }
    return out;
  }
}

class Counter {
  private series = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(l: Record<string, string> = {}, by = 1) {
    const key = labels(l);
    this.series.set(key, (this.series.get(key) ?? 0) + by);
  }
  value(l: Record<string, string> = {}) {
    return this.series.get(labels(l)) ?? 0;
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (!this.series.size) out.push(`${this.name} 0`);
    for (const [k, v] of [...this.series].sort(([a], [b]) => (a < b ? -1 : 1))) out.push(`${this.name}${k} ${v}`);
    return out;
  }
}

/** A value read at each scrape; undefined (or a failed read) leaves the gauge out of that scrape, never a false 0. */
type GaugeSource = () => number | undefined | Promise<number | undefined>;

/** Two secrets compared in constant time: their sha256 digests (same length whatever the input), then timingSafeEqual. */
export function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** A duration of a log line, in ms: a finite number at least 0, else undefined. */
const msOf = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
/** The phases of a `preview` line (previews.ts) and of a `worker-call` line (remote-executor.ts), and their labels. */
const PREVIEW_PHASES = [
  ['queuedMs', 'queued'],
  ['snapMs', 'snapshot'],
  ['jobMs', 'job'],
  ['storeMs', 'store'],
  ['sinceWriteMs', 'since_write'],
] as const;
const JOB_PHASES = [
  ['putMs', 'put'],
  ['postMs', 'post'],
  ['getMs', 'get'],
  ['delMs', 'del'],
] as const;

/** The outcome of a job as the remote executor sees it. */
type JobOutcome = 'ok' | 'failed' | 'timeout' | 'error';

/** What the remote executor tells the metrics (remote-executor.ts): a job started, then how it ended. */
export interface JobObserver {
  job(kind: string): (outcome: JobOutcome) => void;
}

export class Metrics implements JobObserver {
  readonly operations = new Histogram(
    'studio_journal_operation_seconds',
    "The journal's operations, from asked to answered (waiting for the operations before it included), by outcome.",
  );
  readonly jobs = new Histogram(
    'studio_worker_job_seconds',
    "The processing worker's jobs as the Studio waits for them, by kind and outcome (a cached answer is no job).",
  );
  readonly previews = new Histogram(
    'studio_preview_build_seconds',
    "A revision's preview: the worker's build and the files stored, from the snapshot packed (not included) to the preview recorded; by outcome.",
  );
  readonly previewPhases = new Histogram(
    'studio_preview_phase_seconds',
    "A revision's preview by phase: queued (from the write to the build's start), snapshot, job (the worker's, its queue included), store, since_write (from the write to the preview ready).",
  );
  readonly jobPhases = new Histogram(
    'studio_worker_job_phase_seconds',
    "The processing worker's jobs by kind and phase, as the Studio runs them: put (the snapshot staged), post (the worker's answer), get (the result read), del (the staging deleted).",
  );
  readonly judgements = new Histogram(
    'studio_health_judgement_seconds',
    "The health's verdict on a revision (the validator, then the solver), when one is reached.",
  );
  readonly conflicts = new Counter(
    'studio_lease_conflicts_total',
    "Answers 423: a span another member holds, or a lease that ended (the spans' leases).",
  );
  readonly responses = new Counter('studio_http_responses_total', 'Answers, by status class.');
  readonly events = new Counter('studio_log_events_total', 'Failures the server logged, by event.');
  private inFlight = new Map<string, number>();
  private gauges: { name: string; help: string; read: GaugeSource }[] = [];

  /** `token`: the secret STUDIO_METRICS_TOKEN. */
  constructor(private token: string) {}

  /**
   * The journal's operations, timed: `apply` is wrapped on this instance, and gives back the very promise the journal
   * gave (its answer and its refusal unchanged). The journal itself is not touched.
   */
  measureOperations(journal: { apply<R>(op: Operation<R>): Promise<Applied<R>> }): void {
    const apply = journal.apply.bind(journal);
    journal.apply = <R>(op: Operation<R>): Promise<Applied<R>> => {
      const t0 = performance.now();
      const p = apply(op);
      const seconds = () => (performance.now() - t0) / 1000;
      p.then(
        (a) => this.operations.observe(seconds(), { outcome: a.replayed ? 'replayed' : 'confirmed' }),
        (e) =>
          this.operations.observe(seconds(), {
            outcome: isStudioError(e) && e.status < 500 ? 'refused' : 'failed',
          }),
      );
      return p;
    };
  }

  job(kind: string): (outcome: JobOutcome) => void {
    const t0 = performance.now();
    this.inFlight.set(kind, (this.inFlight.get(kind) ?? 0) + 1);
    let ended = false;
    return (outcome) => {
      if (ended) return;
      ended = true;
      this.inFlight.set(kind, (this.inFlight.get(kind) ?? 1) - 1);
      this.jobs.observe((performance.now() - t0) / 1000, { kind, outcome });
    };
  }

  /** Jobs asked of the worker and not answered yet: the Studio's side of its queue. */
  queueDepth(): number {
    let n = 0;
    for (const v of this.inFlight.values()) n += v;
    return n;
  }

  /** One answer sent (http.ts, when it is finished). */
  response(status: number): void {
    this.responses.inc({ class: `${Math.floor(status / 100)}xx` });
    if (status === 423) this.conflicts.inc();
  }

  /** A job that failed as a 423 would have (4.2.3: prepare and the cutting answer 202, their conflict comes later). */
  jobFailed(status: number | undefined): void {
    if (status === 423) this.conflicts.inc();
  }

  /** A line the server logs: the previews' and the health's durations, and the failures, are read from it. */
  fromLog(line: Record<string, unknown>): void {
    const ms = typeof line.ms === 'number' && Number.isFinite(line.ms) ? line.ms : undefined;
    if (line.event === 'preview' && ms !== undefined) {
      this.previews.observe(ms / 1000, { outcome: line.failed ? 'failed' : 'built' });
      for (const [key, phase] of PREVIEW_PHASES) {
        const v = msOf(line[key]);
        if (v !== undefined) this.previewPhases.observe(v / 1000, { phase });
      }
    } else if (line.event === 'worker-call' && typeof line.kind === 'string')
      for (const [key, phase] of JOB_PHASES) {
        const v = msOf(line[key]);
        if (v !== undefined) this.jobPhases.observe(v / 1000, { kind: line.kind, phase });
      }
    else if (line.event === 'health' && ms !== undefined)
      this.judgements.observe(ms / 1000, { verdict: line.ok ? 'pass' : 'fail' });
    if (typeof line.event === 'string' && COUNTED_EVENTS.has(line.event)) this.events.inc({ event: line.event });
  }

  /** A gauge read at each scrape. */
  gauge(name: string, help: string, read: GaugeSource): void {
    this.gauges.push({ name, help, read });
  }

  /** Whether the request carries the secret: `Authorization: Bearer <token>`, compared in constant time. */
  authorized(req: IncomingMessage): boolean {
    const h = req.headers.authorization;
    const m = typeof h === 'string' ? /^Bearer ([\x21-\x7e]{1,512})$/.exec(h) : null;
    return !!m && sameSecret(m[1]!, this.token);
  }

  async render(): Promise<string> {
    const out: string[] = [];
    for (const g of this.gauges) {
      const v = await Promise.resolve()
        .then(g.read)
        .catch(() => undefined);
      if (v === undefined) continue;
      out.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`, `${g.name} ${num(v)}`);
    }
    out.push(
      '# HELP studio_worker_jobs_in_flight Jobs asked of the processing worker and not answered yet.',
      '# TYPE studio_worker_jobs_in_flight gauge',
      `studio_worker_jobs_in_flight ${this.queueDepth()}`,
    );
    for (const m of [
      this.operations,
      this.jobs,
      this.previews,
      this.previewPhases,
      this.jobPhases,
      this.judgements,
      this.conflicts,
      this.responses,
      this.events,
    ])
      out.push(...m.render());
    return `${out.join('\n')}\n`;
  }

  /** The answer of `GET /metrics` once authorized. */
  async serve(res: ServerResponse): Promise<void> {
    const body = await this.render();
    res.writeHead(200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(body);
  }
}
