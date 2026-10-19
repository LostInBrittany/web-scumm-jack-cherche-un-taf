// The Studio's side of the processing worker (4.2.1, plan §3.8, ADR 0028): the `Executor` of a hosted Studio. Every
// run of the game's code goes there: the guard's validations, and the loads of the game module the Studio reads. For
// each job it packs a snapshot of the folder, puts it under `staging/<job>/`, presigns one read (the snapshot) and one
// write (the result) for at most 5 min, signs the job with its Ed25519 key, and asks the worker. It then reads the
// result itself, checks that it answers this job and is bounded, and deletes the staging prefix. The worker never
// names a key the Studio publishes. A result is a signal in the project's trust domain, never a security decision.
// The last answer of each kind is kept by the snapshot's sha256 for a minute (a redeployed worker is asked again
// soon): an unchanged game is not sent again. A failure is never kept. A failure of the game's code (a timeout, a
// crash) throws, as a local import would: the guard then refuses the edit rather than letting it through.
import { createHash, randomUUID } from 'node:crypto';
import type { ValidateResult } from '../../../tools/studio/types';
import { type Job, type JobKind, MAX_JOB_MS, privateKeyOf, signJob } from '../worker/job';
import type { JobResult } from '../worker/main';
import { PreviewBuildFailed, type PreviewParams, previewFiles } from '../worker/preview-build';
import { packSnapshot, snapshotTexts } from '../worker/snapshot';
import type { DiagnoseKind } from '../ops/diagnose';
import { StudioError } from '../ops/errors';
import { type Migrated, migratedShape } from '../worker/migrate';
import { type Prepared, preparedShape } from '../worker/prepare';
import { type Cut, cutShape } from '../worker/cut';
import type { CutRequest } from '../../../tools/studio/cut';
import type { JobObserver } from './metrics';
import type { S3 } from './s3';

export interface RemoteExecutorOptions {
  s3: Pick<S3, 'put' | 'get' | 'delete' | 'presign'>;
  workerUrl: string;
  privateKeyPem: string;
  instance: string;
  /** The journal's epoch and head, bound into each job. */
  at: () => { epoch: string; rev: number } | Promise<{ epoch: string; rev: number }>;
  timeoutMs?: number;
  /** The metrics (4.2.3, H9): each job asked of the worker, while it runs and how it ended. */
  metrics?: JobObserver;
}

const MAX_RESULT = 32 * 1024 * 1024;
const CACHE_MS = 60_000;

export function remoteExecutor(o: RemoteExecutorOptions) {
  const key = privateKeyOf(o.privateKeyPem);
  const timeoutMs = Math.min(o.timeoutMs ?? 60_000, 120_000);
  const last = new Map<JobKind, { sha: string; at: number; result: JobResult }>();

  async function run(
    kind: JobKind,
    snapshot: Buffer,
    params: Record<string, unknown> = {},
    // The revision the snapshot was packed at, when the caller knows it (a preview): bound into the job as it is.
    at?: { epoch: string; rev: number },
    // A cancel (4.2.3, H8): the request to the worker is closed (the worker then kills the child), the result dropped.
    signal?: AbortSignal,
  ): Promise<JobResult> {
    const sha = createHash('sha256').update(snapshot).digest('hex');
    // Only an answer that depends on the snapshot alone is kept (a diagnostic depends on its parameters too).
    const cached = kind === 'validate' || kind === 'load';
    const hit = cached ? last.get(kind) : undefined;
    if (hit?.sha === sha && Date.now() - hit.at < CACHE_MS) return hit.result;
    const id = randomUUID();
    const dest = `staging/${id}/`;
    const ended = o.metrics?.job(kind);
    try {
      await o.s3.put(`${dest}snapshot.json`, snapshot);
      const seconds = Math.floor(MAX_JOB_MS / 1000);
      const job: Job = {
        id,
        instance: o.instance,
        ...(at ?? (await o.at())),
        kind,
        // A `prepare` or a `cut` has the worker's longest deadline (a whole game's images and sounds, encoded again).
        params: { ...params, timeoutMs: kind === 'prepare' || kind === 'cut' ? 120_000 : timeoutMs },
        snapshot: sha,
        dest,
        exp: Date.now() + MAX_JOB_MS,
        urls: {
          snapshot: o.s3.presign('GET', `${dest}snapshot.json`, seconds),
          result: o.s3.presign('PUT', `${dest}result.json`, seconds),
        },
      };
      const r = await fetch(`${o.workerUrl.replace(/\/$/, '')}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: signJob(job, key) }),
        // The job's own expiry: the worker runs no job past it, so waiting longer would gain nothing.
        signal: signal ? AbortSignal.any([AbortSignal.timeout(MAX_JOB_MS), signal]) : AbortSignal.timeout(MAX_JOB_MS),
      });
      await r.body?.cancel();
      if (!r.ok) throw new Error(`the processing worker refused the job (${r.status})`);
      signal?.throwIfAborted();
      const bytes = await o.s3.get(`${dest}result.json`, { max: MAX_RESULT });
      if (!bytes) throw new Error('the processing worker left no usable result');
      const v = JSON.parse(bytes.toString('utf8')) as JobResult;
      if (v.job !== id || v.kind !== kind) throw new Error('the processing worker result does not answer this job');
      if (!v.failed && kind === 'validate' && (!Array.isArray(v.errors) || !Array.isArray(v.warnings)))
        throw new Error('the processing worker result does not answer this job');
      if (!v.failed && kind === 'preview' && !previewFiles(v.files))
        throw new Error('the processing worker result does not answer this job');
      if (!v.failed && cached) last.set(kind, { sha, at: Date.now(), result: v });
      ended?.(v.timedOut ? 'timeout' : v.failed ? 'failed' : 'ok');
      return v;
    } catch (e) {
      // A wait given up on its deadline is a timeout, as the worker's own is.
      ended?.((e as Error)?.name === 'TimeoutError' ? 'timeout' : 'error');
      throw e;
    } finally {
      await Promise.all([o.s3.delete(`${dest}snapshot.json`), o.s3.delete(`${dest}result.json`)]).catch(() => {});
    }
  }

  async function diagnoseSnapshot(
    kind: DiagnoseKind,
    snapshot: Buffer,
    params: Record<string, unknown>,
    at?: { epoch: string; rev: number },
  ): Promise<unknown> {
    const v = await run(kind, snapshot, params, at);
    // Answered as a local route would: a refusal is the asker's (400), a deadline is the worker's (504).
    if (v.refused) throw new StudioError(v.failed ?? 'refused', 400);
    if (v.timedOut) throw new StudioError(`${v.failed}: the diagnostic is unknown for now`, 504);
    if (v.failed) throw new Error(v.failed);
    if (!diagnosisShaped(kind, v.data)) throw new Error('the processing worker result does not answer this job');
    return structuredClone(v.data);
  }

  /** The validator's verdict on a packed snapshot (4.2.2: a past revision's, for the health and the bisection). */
  async function validateSnapshot(snapshot: Buffer, at?: { epoch: string; rev: number }): Promise<ValidateResult> {
    const t0 = Date.now();
    const v = await run('validate', snapshot, {}, at);
    if (v.failed) throw new Error(v.failed);
    const errors = v.errors!.map(String);
    return { ok: errors.length === 0, errors, warnings: (v.warnings ?? []).map(String), ms: Date.now() - t0 };
  }

  return {
    validate: (dir: string): Promise<ValidateResult> => validateSnapshot(packSnapshot(dir)),
    validateSnapshot,
    /** The asset tools' `prepare` (4.2.2 PR 6b) on a version 2 snapshot: the prepared files and the new manifest. */
    async prepare(
      snapshot: Buffer,
      at: { epoch: string; rev: number },
      game: string,
      signal?: AbortSignal,
    ): Promise<Prepared> {
      const v = await run('prepare', snapshot, { game }, at, signal);
      if (v.timedOut) throw new StudioError(`${v.failed}: try again, or prepare on a local Studio`, 504);
      if (v.failed) throw new StudioError(v.failed, 422);
      const p = preparedShape(v.data);
      if ('refused' in p) throw new StudioError(`the prepared assets are refused: ${p.refused}`, 422);
      return p;
    },
    /**
     * A sheet's cutting or a cell's keying (4.2.3 PR 7) on a cut's snapshot (snapshot.ts `packCut`): the cells written.
     */
    async cut(snapshot: Buffer, game: string, req: CutRequest, signal?: AbortSignal): Promise<Cut> {
      const v = await run('cut', snapshot, { game, req }, undefined, signal);
      if (v.timedOut) throw new StudioError(`${v.failed}: try again, or cut it on a local Studio`, 504);
      if (v.failed) throw new StudioError(v.failed, 422);
      const c = cutShape(v.data, req);
      if ('refused' in c) throw new StudioError(`the cut is refused: ${c.refused}`, 422);
      return c;
    },
    /**
     * The engine's upgrade (4.2.3 PR 8) of a snapshot's game: the files it would change, written nowhere. A game that
     * does not load, or that the tool refuses (a schema newer than this engine's), is a 422; a deadline missed, a 504.
     */
    async migrate(snapshot: Buffer, at: { epoch: string; rev: number }): Promise<Migrated> {
      const v = await run('migrate', snapshot, {}, at);
      if (v.timedOut) throw new StudioError(`${v.failed}: try again`, 504);
      if (v.failed) throw new StudioError(`the migration cannot run: ${v.failed}`, 422);
      const m = migratedShape(v.data, new Set(snapshotTexts(snapshot).keys()));
      if ('refused' in m) throw new StudioError(`the migration is refused: ${m.refused}`, 422);
      return m;
    },
    /** The game module as data, for the Studio's reads (functions dropped, as `importInChild` gives it). */
    async load(dir: string): Promise<unknown> {
      const v = await run('load', packSnapshot(dir));
      if (v.failed) throw new Error(v.failed);
      // A copy: a reader that normalises what it got never changes what the next reader gets.
      return structuredClone(v.module);
    },
    /**
     * A diagnostic that runs the game's code (4.2.2 PR 3): lint, solve, playtests, as the Studio's route answers it.
     * A failure of the game's code throws, as a local run would.
     */
    diagnose: (kind: DiagnoseKind, dir: string, params: Record<string, unknown>): Promise<unknown> =>
      diagnoseSnapshot(kind, packSnapshot(dir, { playtests: kind === 'playtests' }), params),
    /** The same on a packed snapshot (4.2.2: a past revision's, for the health and the bisection). */
    diagnoseSnapshot,
    /**
     * A revision's preview (4.2.2 PR 2), from the snapshot the caller packed with the revision it names: its files by
     * path. A failure of the build (the game's code, a timeout) throws with its reason.
     */
    async preview(snapshot: Buffer, params: PreviewParams, at: { epoch: string }): Promise<Map<string, Buffer>> {
      const v = await run('preview', snapshot, { ...params }, { epoch: at.epoch, rev: params.rev });
      // The game's build failed: recorded. A deadline missed may pass on a less busy worker: tried again.
      if (v.failed) throw v.timedOut ? new Error(v.failed) : new PreviewBuildFailed(v.failed);
      return new Map(Object.entries(v.files!).map(([k, b]) => [k, Buffer.from(b, 'base64')]));
    },
  };
}

/** The least a diagnostic's answer has, by kind: what the Check tab reads first. */
export function diagnosisShaped(kind: DiagnoseKind, v: unknown): boolean {
  const o = (v ?? {}) as Record<string, unknown>;
  if (kind === 'solve') return typeof o.status === 'string' && Array.isArray(o.errors);
  if (kind === 'lint') return !!o.lint && typeof o.lint === 'object' && typeof o.markdown === 'string';
  return !!o.report && typeof o.report === 'object' && typeof o.files === 'number';
}
