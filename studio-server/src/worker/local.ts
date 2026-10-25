// A revision's preview, and a snapshot's verdict, made on this machine (4.2.2): the tests' and the e2e stack's stand-in
// for the processing worker. The same child as the worker's (child.ts: an emptied environment, its own process group, a deadline), on
// the same snapshot; only the transport differs. A Studio Server never uses it: with OIDC the game's code runs on the
// worker (ADR 0028), and without OIDC there is no game origin.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { GameDoesNotLoad } from '../ops/errors';
import { JOBS, runChild } from './main';
import { PreviewBuildFailed, type PreviewParams, previewFiles } from './preview-build';
import { type Migrated, migratedShape } from './migrate';
import { type Prepared, preparedShape, pythonPathOf } from './prepare';
import { snapshotTexts, unpackSnapshot } from './snapshot';
import { type Cut, cutShape } from './cut';
import type { CutRequest } from '../../../tools/studio/cut';
import type { ValidateResult } from '../../../tools/studio/types';

export async function localPreview(
  snapshot: Buffer,
  params: PreviewParams,
  timeoutMs = 120_000,
): Promise<Map<string, Buffer>> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'preview-'));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, 'preview', undefined, { ...params });
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    let files: Record<string, string> | undefined;
    try {
      files = previewFiles((JSON.parse(r.out) as { files?: unknown }).files);
    } catch {
      files = undefined;
    }
    if (!files) throw new PreviewBuildFailed(`the preview does not build (exit ${r.code})`);
    return new Map(Object.entries(files).map(([k, b]) => [k, Buffer.from(b, 'base64')]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The validator's verdict on a snapshot, in the same child (the tests' and the e2e stack's health, 4.2.2). */
export async function localValidate(snapshot: Buffer, timeoutMs = 60_000): Promise<ValidateResult> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'validate-'));
  const t0 = Date.now();
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, 'validate');
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { errors: string[]; warnings: string[]; unloadable?: string };
    if (typeof v.unloadable === 'string') throw new GameDoesNotLoad(v.unloadable, 422);
    return { ok: v.errors.length === 0, errors: v.errors, warnings: v.warnings, ms: Date.now() - t0 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A diagnostic on a snapshot, in the same child (the e2e stack's health: the solver after the validator). */
export async function localDiagnose(
  kind: 'lint' | 'solve' | 'playtests',
  snapshot: Buffer,
  params: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<unknown> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, `${kind}-`));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, kind, undefined, { ...params, timeoutMs });
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { data?: unknown; error?: string };
    if (!v.data) throw new Error(v.error ?? 'the diagnostic gave no answer');
    return v.data;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The asset tools' `prepare` on a version 2 snapshot, in the same child (the e2e stack's "Prepare assets"). */
export async function localPrepare(
  snapshot: Buffer,
  game: string,
  timeoutMs = 120_000,
  signal?: AbortSignal,
): Promise<Prepared> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'prepare-'));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(
      dir,
      timeoutMs,
      'prepare',
      undefined,
      { game, systemPath: process.env.PATH ?? '', pythonPath: pythonPathOf(process.env) },
      signal,
    );
    if (r.cancelled) throw new Error('cancelled');
    if (r.timedOut) throw new Error(`the asset tools did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { data?: unknown; error?: string };
    if (!v.data) throw new Error(v.error ?? 'prepare gave no answer');
    const p = preparedShape(v.data);
    if ('refused' in p) throw new Error(`the prepared assets are refused: ${p.refused}`);
    return p;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A sheet's cutting or a cell's keying on a cut's snapshot, in the same child (the tests' and the e2e stack's). */
export async function localCut(
  snapshot: Buffer,
  game: string,
  req: CutRequest,
  signal?: AbortSignal,
  timeoutMs = 120_000,
): Promise<Cut> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'cut-'));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(
      dir,
      timeoutMs,
      'cut',
      undefined,
      { game, req, systemPath: process.env.PATH ?? '', pythonPath: pythonPathOf(process.env) },
      signal,
    );
    if (r.cancelled) throw new Error('cancelled');
    if (r.timedOut) throw new Error(`the cut did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out) as { data?: unknown; error?: string };
    if (!v.data) throw new Error(v.error ?? 'the cut gave no answer');
    const c = cutShape(v.data, req);
    if ('refused' in c) throw new Error(`the cut is refused: ${c.refused}`);
    return c;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The engine's upgrade of a snapshot's game (4.2.3 PR 8), in the same child: what it would write (the tests' worker). */
export async function localMigrate(snapshot: Buffer, timeoutMs = 60_000): Promise<Migrated> {
  mkdirSync(JOBS, { recursive: true });
  const dir = mkdtempSync(join(JOBS, 'migrate-'));
  try {
    unpackSnapshot(snapshot, dir);
    const r = await runChild(dir, timeoutMs, 'migrate');
    if (r.timedOut) throw new Error(`the game's code did not finish within ${timeoutMs} ms`);
    const v = JSON.parse(r.out || '{}') as { data?: unknown; error?: string };
    if (!v.data) throw new Error(v.error ?? `migrate gave no answer (exit ${r.code})`);
    const m = migratedShape(v.data, snapshotTexts(snapshot));
    if ('refused' in m) throw new Error(`the migration is refused: ${m.refused}`);
    return m;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
