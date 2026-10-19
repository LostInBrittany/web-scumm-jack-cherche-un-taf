// The diagnostics that run the game's code (4.2.2 PR 3, plan §2.3): the content lint after a solver run, the solver,
// the playtests replayed. One implementation for the two places they run: in this process on a local Studio
// (core.ts), and in the worker's child on a hosted one (worker/child.ts), where the game's own commands are in the
// module, as they are not in the data the Studio reads back from the worker.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintContent, lintMarkdown } from '../../../src/engine/tools/lint';
import { loadLayouts } from '../../../src/engine/tools/load';
import { analyzePlaytests, type PlaytestFile, playtestsMarkdown } from '../../../src/engine/tools/playtests';
import { parseSessionFile } from '../../../src/engine/tools/replay';
import { type RealityPolicy, solve as solveGame } from '../../../src/engine/tools/solve';
import type { GameModule } from '../../../tools/game';
import type { LintData, PlaytestsData, SolveData } from '../../../tools/studio/types';
import { StudioError } from './errors';

export type DiagnoseKind = 'lint' | 'solve' | 'playtests';

export interface SolveParams {
  from: string | null;
  maxStates: number;
  mode: 'witness' | 'prove';
  reality?: RealityPolicy;
  /** A bound on the solver's own time (a hosted Studio's, below its job's deadline). */
  timeLimitMs?: number;
}

/** The solver's time on a hosted Studio: under the worker's job deadline, so a long search ends with its answer. */
export const HOSTED_SOLVE_MS = 45_000;

/** The playtests of `<dir>/playtests/*.session.json`, replayed and summed up. */
export async function playtestsIn(dir: string, mod: GameModule): Promise<PlaytestsData> {
  const t0 = Date.now();
  const layouts = loadLayouts(join(dir, 'layout'));
  const folder = join(dir, 'playtests');
  const files: PlaytestFile[] = existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.endsWith('.session.json'))
        .sort()
        .map((name) => ({ name, file: parseSessionFile(readFileSync(join(folder, name), 'utf8')) }))
    : [];
  const report = await analyzePlaytests(mod.game, layouts, files, { commands: mod.commands });
  return { report, markdown: playtestsMarkdown(report, mod.game), files: files.length, ms: Date.now() - t0 };
}

/** The content lint after a witness (or, `prove`, exhaustive) solver run. */
export async function lintIn(dir: string, mod: GameModule, prove = false, timeLimitMs?: number): Promise<LintData> {
  const t0 = Date.now();
  const layouts = loadLayouts(join(dir, 'layout'));
  const s = await solveGame(mod.game, layouts, {
    commands: mod.commands,
    mode: prove ? 'prove' : 'witness',
    ...(timeLimitMs ? { timeLimitMs } : {}),
  });
  const r = lintContent(mod.game, layouts, { solve: s, commands: mod.commands });
  return { lint: r, markdown: lintMarkdown(r, s.mode), mode: s.mode, ms: Date.now() - t0 };
}

export async function solveIn(dir: string, mod: GameModule, o: SolveParams): Promise<SolveData> {
  const t0 = Date.now();
  if (o.from && !mod.game.checkpoints?.[o.from]) throw new StudioError(`unknown checkpoint: "${o.from}"`);
  const layouts = loadLayouts(join(dir, 'layout'));
  const r = await solveGame(mod.game, layouts, {
    maxStates: o.maxStates,
    start: o.from ? { checkpoint: o.from } : 'new',
    commands: mod.commands,
    mode: o.mode,
    ...(o.reality ? { reality: o.reality } : {}),
    ...(o.timeLimitMs ? { timeLimitMs: o.timeLimitMs } : {}),
  });
  return {
    status: r.status,
    exit: r.exit,
    headline: r.headline,
    mode: r.mode,
    softlocks: r.softlocks,
    finished: r.finished,
    states: r.states,
    truncated: r.truncated,
    path: r.path,
    roomsReached: r.roomsReached,
    unlockedReached: r.unlockedReached,
    flagsReached: r.flagsReached,
    itemsNeverUsed: r.itemsNeverUsed,
    unusedItems: r.unusedItems,
    deadEnds: r.deadEnds.map((d) => ({ room: d.room, inventory: d.inventory, path: d.path })),
    errors: r.errors,
    broken: r.broken,
    from: o.from,
    ms: Date.now() - t0,
    profile: r.profile,
    ...(r.reality ? { reality: r.reality } : {}),
  };
}

/** The checks a job's parameters pass in the worker's child: it runs nothing a job did not name exactly. */
export function solveParams(p: Record<string, unknown>): SolveParams {
  const mode = p.mode === 'prove' ? 'prove' : 'witness';
  const maxStates = Number.isSafeInteger(p.maxStates)
    ? Math.min(Math.max(p.maxStates as number, 1), 2_000_000)
    : 20_000;
  // A checkpoint is any key of the game's (only looked up): one it does not have is refused by `solveIn`.
  const from = typeof p.from === 'string' && p.from && p.from.length <= 200 ? p.from : null;
  // Under the job's own deadline, with room for the import of the game and the answer.
  const job = Number.isSafeInteger(p.timeoutMs) ? (p.timeoutMs as number) : 60_000;
  const asked = Number.isSafeInteger(p.timeLimitMs) ? (p.timeLimitMs as number) : undefined;
  const timeLimitMs = asked ? Math.max(1, Math.min(asked, job - 10_000)) : undefined;
  return { from, maxStates, mode, ...(timeLimitMs ? { timeLimitMs } : {}) };
}
