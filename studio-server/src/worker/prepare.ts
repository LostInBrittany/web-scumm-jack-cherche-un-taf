// The asset tools on the processing worker (4.2.2 PR 6b, D43, docs/dev/QUALIF-4.2.2-ASSETS.md): `prepare` of the game
// in `dir` (a version 2 snapshot: its sources, data, art and sounds), run in the worker's child as `npm run assets`
// runs it: the references the content cites (`tools/refs.ts`), then `tools/assets.py`, with the Python packages the
// worker's build hook installed (PYTHONPATH: `pythonPathOf`) and the worker's PATH (python3, ffmpeg), nothing else.
// What comes back: the prepared files (`assets/img|audio|video/…`, base64 by path) and the game's new `assets.gen.json`.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameModule } from '../../../tools/game';

const ENGINE = fileURLToPath(new URL('../../../', import.meta.url));

export interface Prepared {
  /** The prepared files by their path under the public folder (`assets/img/…`), base64. */
  files: Record<string, string>;
  /** The game's `assets.gen.json` after the run. */
  manifest: string;
  /** What the asset tools said (their last lines: what is missing, what was processed). */
  log: string;
}

/** The paths a `prepare` gives back: under `assets/img`, `assets/audio`, `assets/video`, plain names. */
const PREPARED_PATH = /^assets\/(img|audio|video)\/[\w.-]+(?:\/[\w.-]+){0,4}$/;

/**
 * A `prepare`'s answer as the child wrote it, or why it is refused: its files bounded (5,000), plain paths, base64.
 */
export function preparedShape(v: unknown): Prepared | { refused: string } {
  const o = (v ?? {}) as { files?: unknown; manifest?: unknown; log?: unknown };
  if (typeof o.manifest !== 'string' || o.manifest.length > 2 * 1024 * 1024) return { refused: 'no manifest' };
  if (!o.files || typeof o.files !== 'object' || Array.isArray(o.files)) return { refused: 'no files' };
  const entries = Object.entries(o.files as Record<string, unknown>);
  if (entries.length > 5_000) return { refused: 'more than 5,000 files' };
  for (const [k, b] of entries)
    if (!PREPARED_PATH.test(k) || k.split('/').some((s) => /^\.+$/.test(s)) || typeof b !== 'string')
      return { refused: `a file name the Studio does not serve (letters, digits, - _ . only): ${k.slice(0, 120)}` };
  return {
    files: o.files as Record<string, string>,
    manifest: o.manifest,
    log: typeof o.log === 'string' ? o.log.slice(0, 4_000) : '',
  };
}

/**
 * Where the worker's build hook installed the asset tools' Python packages (4.2.3 PR 0, H7): `WORKER_PYTHON_PATH`, else
 * `.python` in the worker's own folder, whether it runs from the repository or from the release's archives.
 */
export const pythonPathOf = (env: NodeJS.ProcessEnv, cwd = process.cwd()) =>
  resolve(cwd, env.WORKER_PYTHON_PATH || '.python');

export async function prepareIn(
  dir: string,
  game: string,
  mod: GameModule,
  path?: string,
  pythonPath = join(ENGINE, '.python'),
): Promise<Prepared> {
  // Sources named by `sources.json` live where a local project keeps them (outside the art and sounds the snapshot
  // carries): a hosted run would not find them, and would prepare the game without them.
  if (existsSync(join(dir, 'sources.json')))
    throw new Error('this game names its sources in sources.json: prepare its assets on a local Studio');
  const { collectRefs } = await import('../../../tools/refs');
  const { loadLayouts } = await import('../../../src/engine/tools/load');
  // Inside the job's folder, removed with it; the asset tools read the game through GAME_DIR.
  const work = resolve(dir, '.prepare');
  mkdirSync(join(work, '.cache'), { recursive: true });
  writeFileSync(
    join(work, '.cache', 'refs.json'),
    JSON.stringify(collectRefs({ ...mod, layouts: loadLayouts(join(dir, 'layout')) })),
  );
  const r = spawnSync('python3', [join(ENGINE, 'tools', 'assets.py')], {
    cwd: work,
    env: {
      PATH: path ?? '/usr/local/bin:/usr/bin:/bin',
      HOME: work,
      // The asset tools work in a project's folder (their refs, their output), the game read through GAME_DIR.
      WEB_SCUMM_PROJECT: work,
      GAME: game,
      GAME_DIR: dir,
      PYTHONPATH: pythonPath,
    },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw new Error(
      `prepare failed (exit ${r.status}): ${String(r.stderr || r.stdout)
        .trim()
        .split('\n')
        .slice(-3)
        .join(' ')}`,
    );
  const out = join(work, 'public');
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    let names: string[] = [];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(d, n);
      // A link (the game's code ran here) is never followed.
      const st = lstatSync(p);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) files[relative(out, p).split(sep).join('/')] = readFileSync(p).toString('base64');
    }
  };
  walk(join(out, 'assets'));
  const log = String(r.stdout ?? '')
    .trim()
    .split('\n')
    .slice(-12)
    .join('\n');
  return { files, manifest: readFileSync(join(dir, 'assets.gen.json'), 'utf8'), log };
}
