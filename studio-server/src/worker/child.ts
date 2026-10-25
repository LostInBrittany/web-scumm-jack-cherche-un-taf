// The worker's child process (4.2.1, ADR 0028): runs the game's code in the folder it is given and prints one JSON
// document to the file it is given: `validate`, the validator's verdict; `load`, the game module as data (functions
// dropped, as the Studio reads it); `preview` (4.2.2), the revision's built preview, its files in base64 by path
// (preview-build.ts); `lint`, `solve`, `playtests` (4.2.2), those diagnostics (ops/diagnose.ts); `prepare` (4.2.2),
// the game's assets prepared (prepare.ts); `cut` (4.2.3), a sheet cut or a cell keyed (cut.ts, no game code);
// `migrate` (4.2.3), the files the engine's upgrade would change (migrate.ts). It is started with an emptied
// environment, in a fresh folder, and killed with its process group
// at its deadline; the game's code runs here, never in the supervisor... as far as one machine and one user allow
// (ADR 0028).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import type { GameModule } from '../../../tools/game';
import { validateDir } from '../ops/validate-dir';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
// The result goes to a file, never to stdout: the game's own logs cannot corrupt it.
const [dir, kind, outFile, params] = process.argv.slice(2);
if (!dir || !outFile) process.exit(2);
const importFresh = (file: string) => tsImport(pathToFileURL(file).href, import.meta.url);
if (kind === 'preview') {
  const { buildPreview, previewParams } = await import('./preview-build');
  const files = await buildPreview(dir, previewParams(JSON.parse(params ?? '{}')), join(dir, '.vite-cache'));
  writeFileSync(
    outFile,
    JSON.stringify({ files: Object.fromEntries([...files].map(([k, v]) => [k, v.toString('base64')])) }),
  );
} else if (kind === 'prepare') {
  const { prepareIn } = await import('./prepare');
  const mod = (await importFresh(join(dir, 'index.ts'))) as GameModule;
  const p = JSON.parse(params ?? '{}') as { game?: unknown; systemPath?: unknown; pythonPath?: unknown };
  if (typeof p.game !== 'string' || !/^[\w-]{1,64}$/.test(p.game)) process.exit(2);
  const path = typeof p.systemPath === 'string' && p.systemPath ? p.systemPath : undefined;
  const python = typeof p.pythonPath === 'string' && p.pythonPath ? p.pythonPath : undefined;
  try {
    writeFileSync(outFile, JSON.stringify({ data: await prepareIn(dir, p.game, mod, path, python) }));
  } catch (e) {
    writeFileSync(outFile, JSON.stringify({ error: String((e as Error).message).slice(0, 2_000) }));
  }
} else if (kind === 'cut') {
  const { cutIn, cutRequest } = await import('./cut');
  const p = JSON.parse(params ?? '{}') as { game?: unknown; req?: unknown; systemPath?: unknown; pythonPath?: unknown };
  const req = cutRequest(p.req);
  if (typeof p.game !== 'string' || !/^[\w-]{1,64}$/.test(p.game) || !req) process.exit(2);
  const path = typeof p.systemPath === 'string' && p.systemPath ? p.systemPath : undefined;
  const python = typeof p.pythonPath === 'string' && p.pythonPath ? p.pythonPath : undefined;
  try {
    writeFileSync(outFile, JSON.stringify({ data: await cutIn(dir, p.game, req, path, python) }));
  } catch (e) {
    writeFileSync(outFile, JSON.stringify({ error: String((e as Error).message).slice(0, 2_000) }));
  }
} else if (kind === 'migrate') {
  const { migrateIn, renameImportsIn } = await import('./migrate');
  try {
    // The former name's imports first (4.3.0, D47): a game of 4.2.x or before loads only once they are renamed.
    const renamed = renameImportsIn(dir);
    const mod = (await importFresh(join(dir, 'index.ts'))) as GameModule;
    writeFileSync(outFile, JSON.stringify({ data: migrateIn(dir, mod.game, renamed) }));
  } catch (e) {
    writeFileSync(outFile, JSON.stringify({ error: String((e as Error).message).slice(0, 2_000) }));
  }
} else if (kind === 'lint' || kind === 'solve' || kind === 'playtests') {
  const d = await import('../ops/diagnose');
  const mod = (await importFresh(join(dir, 'index.ts'))) as GameModule;
  const p = JSON.parse(params ?? '{}') as Record<string, unknown>;
  try {
    const out =
      kind === 'lint'
        ? await d.lintIn(dir, mod, p.prove === true, d.solveParams(p).timeLimitMs)
        : kind === 'solve'
          ? await d.solveIn(dir, mod, d.solveParams(p))
          : await d.playtestsIn(dir, mod);
    writeFileSync(outFile, JSON.stringify({ data: out }));
  } catch (e) {
    // A refusal of the diagnostic itself (an unknown checkpoint): said, and answered as the local route answers it.
    writeFileSync(outFile, JSON.stringify({ error: String((e as Error).message).slice(0, 2_000), refused: true }));
  }
} else if (kind === 'load') {
  const m = await importFresh(join(dir, 'index.ts'));
  writeFileSync(
    outFile,
    JSON.stringify(m, (_k, v) => (typeof v === 'function' ? undefined : v)),
  );
} else {
  // A game whose code does not load (4.3.0: the former name's imports, D47) is said as such, apart from a crash.
  let mod: GameModule | undefined;
  try {
    mod = (await importFresh(join(dir, 'index.ts'))) as GameModule;
  } catch (e) {
    writeFileSync(outFile, JSON.stringify({ unloadable: String((e as Error)?.message ?? e).slice(0, 2_000) }));
  }
  if (mod) {
    const r = await validateDir(dir, { root: ROOT, importFresh, mod });
    writeFileSync(outFile, JSON.stringify({ errors: r.errors, warnings: r.warnings }));
  }
}
// Done: a timer or a socket the game left open does not keep this process to its deadline.
process.exit(0);
