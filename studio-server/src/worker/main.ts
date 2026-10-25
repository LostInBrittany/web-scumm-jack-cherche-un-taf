// The processing worker (4.2.1, plan §3.8, ADR 0028): a separate Clever Cloud application that holds no secret of
// the platform — no database, no session key, no permanent Cellar credentials, no signing key. It is the trusted
// supervisor of one job at a time per lane (4.4.0, lanes.ts: a preview never waits behind the other kinds):
//   POST /jobs {token}   checks the Studio's signature (public key only), the instance, the expiry and single use;
//                        fetches the snapshot by its presigned URL and checks its sha256 against the signed one;
//                        runs the game's code in a fresh child process, in a fresh folder, with an emptied
//                        environment, killed at its deadline with its whole process group; bounds the output (a
//                        verdict, or the module as data) and PUTs it to the presigned result URL itself; removes the
//                        folder. A job whose request the Studio closes (a cancel, 4.2.3 H8) is not run if it waits,
//                        and its child is killed with its group if it runs; nothing is written at the result URL.
//   GET /livez, /readyz  /readyz answers 503 once a job left a process behind: the instance is to be recycled.
// The job's code shares this machine and this system user: it is assumed to see the job's capabilities (ADR 0028).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Job, publicKeyOf, verifyJob } from './job';
import { Lanes, laneOf } from './lanes';
import { pythonPathOf } from './prepare';
import { previewFiles } from './preview-build';
import { unpackSnapshot } from './snapshot';

const CHILD = fileURLToPath(new URL('./child.ts', import.meta.url));
// A game imports `@quest-n-click/engine/content` by the package's
// self-reference: its folder must sit inside the package.
export const JOBS = fileURLToPath(new URL('../../../.cache/jobs/', import.meta.url));
const MAX_OUT = 16 * 1024 * 1024;
/** A `prepare`'s answer carries the prepared files (4.2.2): up to the Studio's own bound on a result (32 MiB). */
const MAX_PREPARED = 30 * 1024 * 1024;
const maxOut = (kind: string) => (kind === 'prepare' ? MAX_PREPARED : MAX_OUT);
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;

export interface WorkerOptions {
  publicKeyPem: string;
  /** The only Studio instance whose jobs this worker runs (one project, one trust domain). */
  instance: string;
  log?: (event: string, data?: Record<string, unknown>) => void;
  /** Called once a survivor marked the instance to recycle and no job is left: the entry point exits (Clever restarts it). */
  onRecycle?: () => void;
}

/** What the worker writes at the result URL: the job it answers, and its output or why there is none. */
export interface JobResult {
  job: string;
  kind: Job['kind'];
  ms: number;
  /** validate: the verdict. */
  errors?: string[];
  warnings?: string[];
  /** validate (4.3.0): the game's own code did not load, and why; no verdict then. */
  unloadable?: string;
  /** load: the module as data. */
  module?: unknown;
  /** lint, solve, playtests (4.2.2): the diagnostic, as the Studio's route answers it; prepare, migrate: their answer. */
  data?: unknown;
  /** preview (4.2.2): the built files, base64 by path under the preview's base. */
  files?: Record<string, string>;
  /** The game's code did not run to its end (a timeout, a crash, output that is not JSON). */
  failed?: string;
  /** The failure was the deadline (4.2.2): it may pass on a less busy worker, unlike a crash. */
  timedOut?: boolean;
  /** The diagnostic refused what it was asked (4.2.2: an unknown checkpoint), as a local route refuses it. */
  refused?: boolean;
}

/**
 * Runs `child.ts` on `dir`: an emptied environment, its own process group, no pipe (a grandchild can hold none), killed
 * with its group at `timeoutMs`, or when `signal` aborts (a cancel: `cancelled`, no output read). The child writes its
 * output to `outFile`; it is read once the child has exited.
 */
export function runChild(
  dir: string,
  timeoutMs: number,
  kind: Job['kind'] = 'validate',
  outFile = `${dir}.out.json`,
  params: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{
  out: string;
  code: number | null;
  timedOut: boolean;
  tooLarge: boolean;
  pid: number;
  cancelled?: boolean;
}> {
  return new Promise((ok, fail) => {
    rmSync(outFile, { force: true });
    if (signal?.aborted) return ok({ out: '', code: null, timedOut: false, tooLarge: false, pid: 0, cancelled: true });
    const child = spawn(
      process.execPath,
      ['--import', import.meta.resolve('tsx'), CHILD, dir, kind, outFile, JSON.stringify(params)],
      {
        cwd: dir,
        env: {},
        detached: true,
        stdio: 'ignore',
      },
    );
    let timedOut = false;
    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      killGroup();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (e) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fail(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      killGroup();
      let out = '';
      let tooLarge = false;
      try {
        if (!cancelled && statSync(outFile).size <= maxOut(kind)) out = readFileSync(outFile, 'utf8');
        else tooLarge = !cancelled;
      } catch {
        out = '';
      }
      rmSync(outFile, { force: true });
      ok({ out, code, timedOut, tooLarge, pid: child.pid ?? 0, ...(cancelled ? { cancelled } : {}) });
    });
  });
}

/**
 * True when a process of the group `pid` is still alive a second after the job: a process just killed may answer a
 * signal until it is reaped. A process that left the group (`setsid`) is not seen: see ADR 0028.
 */
async function survivors(pid: number): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    try {
      process.kill(-pid, 0);
    } catch {
      return false;
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  return true;
}

/**
 * A job's phases in ms (4.4.0), as the worker lived them: `queueMs` (from its POST received to its run's start: the
 * request read, the job checked, the jobs before it), `fetchMs` (the snapshot fetched and checked), `unpackMs`,
 * `childMs` (the child, from its start to its exit), `putMs` (the result written). A phase not reached is left out.
 */
export interface Phases {
  queueMs?: number;
  fetchMs?: number;
  unpackMs?: number;
  childMs?: number;
  putMs?: number;
}

const strings = (v: unknown, max = 500): string[] =>
  Array.isArray(v) ? v.slice(0, max).map((x) => String(x).slice(0, 2_000)) : [];

export function createWorker(o: WorkerOptions) {
  const key = publicKeyOf(o.publicKeyPem);
  const seen = new Map<string, number>();
  let recycle = false;
  const lanes = new Lanes();
  const log = o.log ?? (() => {});

  /** A job run; its phases in ms go to `t` as they end (4.4.0, the `worker-job` line). */
  async function run(job: Job, signal: AbortSignal, t: Phases): Promise<JobResult> {
    let at = Date.now();
    const lap = (name: keyof Phases) => {
      const now = Date.now();
      t[name] = now - at;
      at = now;
    };
    const snap = await fetch(job.urls.snapshot, { signal: AbortSignal.timeout(30_000) });
    if (!snap.ok) throw new Error(`snapshot: ${snap.status}`);
    const bytes = Buffer.from(await snap.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== job.snapshot)
      throw new Error('the snapshot is not the signed one');
    lap('fetchMs');
    mkdirSync(JOBS, { recursive: true });
    const dir = mkdtempSync(join(JOBS, 'job-'));
    try {
      unpackSnapshot(bytes, dir);
      lap('unpackMs');
      const timeoutMs = Math.min(Number(job.params.timeoutMs) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
      const t0 = Date.now();
      // A `prepare` or a `cut` finds python3 and ffmpeg on the worker's own PATH, and the packages its build hook
      // installed (neither is a secret; the rest stays empty).
      const params =
        job.kind === 'prepare' || job.kind === 'cut'
          ? { ...job.params, systemPath: process.env.PATH ?? '', pythonPath: pythonPathOf(process.env) }
          : job.params;
      const r = await runChild(dir, timeoutMs, job.kind, undefined, params, signal);
      lap('childMs');
      if (r.pid && (await survivors(r.pid))) {
        recycle = true;
        log('worker-survivor', { job: job.id });
      }
      // Cancelled by the Studio: its child is gone, and nothing is written at the result URL.
      if (r.cancelled) throw new Error('cancelled by the Studio');
      const result: JobResult = { job: job.id, kind: job.kind, ms: 0 };
      let parsed: unknown;
      if (r.timedOut) {
        result.failed = `the game's code did not finish within ${timeoutMs} ms`;
        result.timedOut = true;
      } else if (r.tooLarge)
        result.failed = `the output exceeds ${maxOut(job.kind) >> 20} MiB${job.kind === 'prepare' ? ': prepare these assets on a local Studio' : ''}`;
      else
        try {
          parsed = JSON.parse(r.out);
        } catch {
          result.failed = `the game does not load (exit ${r.code})`;
        }
      if (!result.failed && job.kind === 'validate') {
        const v = (parsed ?? {}) as { errors?: unknown; warnings?: unknown; unloadable?: unknown };
        if (typeof v.unloadable === 'string') result.unloadable = v.unloadable.slice(0, 2_000);
        else {
          result.errors = strings(v.errors);
          result.warnings = strings(v.warnings);
        }
      } else if (!result.failed && job.kind === 'preview') {
        const files = previewFiles((parsed as { files?: unknown } | undefined)?.files);
        if (files) result.files = files;
        else result.failed = 'the preview build gave no usable files';
      } else if (
        !result.failed &&
        (job.kind === 'lint' ||
          job.kind === 'solve' ||
          job.kind === 'playtests' ||
          job.kind === 'prepare' ||
          job.kind === 'cut' ||
          job.kind === 'migrate')
      ) {
        const { data, error, refused } = (parsed ?? {}) as { data?: unknown; error?: unknown; refused?: unknown };
        if (data && typeof data === 'object') result.data = data;
        else result.failed = typeof error === 'string' ? error.slice(0, 2_000) : 'the diagnostic gave no answer';
        if (!result.data && refused === true) result.refused = true;
      } else if (!result.failed) result.module = parsed;
      result.ms = Date.now() - t0;
      at = Date.now();
      const put = await fetch(job.urls.result, {
        method: 'PUT',
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(30_000),
      });
      lap('putMs');
      if (!put.ok) throw new Error(`result: ${put.status}`);
      return result;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const received = Date.now();
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const path = new URL(req.url ?? '/', 'http://w').pathname;
    if (req.method === 'GET' && path === '/livez') return send(200, { ok: true });
    if (req.method === 'GET' && path === '/readyz') return send(recycle ? 503 : 200, { ok: !recycle, recycle });
    if (req.method !== 'POST' || path !== '/jobs') return send(404, { error: 'not found' });
    let raw = '';
    for await (const c of req) {
      raw += c;
      if (raw.length > 64_000) return send(413, { error: 'too large' });
    }
    let job: Job;
    try {
      const { token } = JSON.parse(raw) as { token?: unknown };
      job = verifyJob(String(token), key);
      if (job.instance !== o.instance) throw new Error('the job is for another instance');
    } catch (e) {
      // Said in the worker's log too: the Studio sees a 403 and its reason, the host sees both sides.
      log('worker-job-refused', { error: (e as Error).message });
      return send(403, { error: (e as Error).message });
    }
    const now = Date.now();
    for (const [id, exp] of seen) if (exp < now) seen.delete(id);
    if (seen.has(job.id)) return send(409, { error: 'the job was already run' });
    seen.set(job.id, job.exp);
    if (recycle) return send(503, { error: 'this instance is to be recycled' });
    // The Studio closed its request before the answer (a cancel): the job is not run, or its child is killed.
    const gone = new AbortController();
    const t: Phases = {};
    const p = lanes.run(laneOf(job.kind), () => {
      t.queueMs = Date.now() - received;
      // A job that waited past its expiry is not run: its URLs are dead, and the Studio has given up on it.
      if (Date.now() >= job.exp) throw new Error('the job expired while it waited');
      if (gone.signal.aborted) throw new Error('cancelled by the Studio');
      return run(job, gone.signal, t);
    });
    if (!p) return send(429, { error: 'busy' });
    res.on('close', () => {
      if (!res.writableEnded) gone.abort();
    });
    try {
      const v = await p;
      log('worker-job', { job: job.id, kind: v.kind, failed: !!v.failed, ms: v.ms, ...t });
      send(200, { ok: true });
    } catch (e) {
      log('worker-job-failed', { job: job.id, kind: job.kind, error: (e as Error).message, ...t });
      send(502, { error: (e as Error).message });
    } finally {
      if (recycle && lanes.held() === 0) o.onRecycle?.();
    }
  }

  return {
    handler: (req: IncomingMessage, res: ServerResponse) => void handle(req, res),
    get recycle() {
      return recycle;
    },
  };
}

// `studio-worker` itself: WORKER_PUBLIC_KEY (PEM, or WORKER_PUBLIC_KEY_FILE), WORKER_INSTANCE, PORT (Clever: 8080).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { readFileSync } = await import('node:fs');
  const pem = process.env.WORKER_PUBLIC_KEY_FILE
    ? readFileSync(process.env.WORKER_PUBLIC_KEY_FILE, 'utf8')
    : process.env.WORKER_PUBLIC_KEY;
  const instance = process.env.WORKER_INSTANCE;
  const publicKeyPem = pem?.replace(/\\n/g, '\n');
  if (!pem || !instance) {
    process.stderr.write('studio-worker: WORKER_PUBLIC_KEY and WORKER_INSTANCE are required\n');
    process.exit(2);
  }
  let onRecycle = () => {};
  const w = createWorker({
    onRecycle: () => onRecycle(),
    publicKeyPem: publicKeyPem!,
    instance,
    log: (event, data) => process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), event, ...data })}\n`),
  });
  const server = createServer(w.handler);
  server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
  // A survivor: the instance exits once idle, and the platform starts a fresh one.
  onRecycle = () => server.close(() => process.exit(75));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
