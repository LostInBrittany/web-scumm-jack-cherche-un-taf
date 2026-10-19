// A single entry for the game's files (4.2.1, plan P6): every authoring program (tools/, studio-server/, src/studio/,
// cli/) that writes to the disk is listed here with where it writes. scripts/ (CI, release, e2e) and bridge/ author
// no game and are outside this inventory. The patterns are names of writing calls, not a proof: a writer hidden behind
// an alias or a child process is caught by review (the Studio's own spawns are listed: assets' prepare runs
// `npm run assets`, an adopted writer). Writing a game's files goes through the Studio's journal (studio-server/src/ops/,
// or tools/game-write.ts for the authoring tools); the few tools that still write a game folder themselves are named,
// with how the journal follows them. A new writer, or a writer that moved, fails this test until it is classified.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const JS_WRITE =
  /\b(writeFileSync|writeFile|appendFileSync|copyFileSync|cpSync|renameSync|rmSync|unlinkSync|createWriteStream|symlinkSync|linkSync|mkdtempSync)\b/;
const PY_WRITE =
  /open\([^)]*['"](w|wb|a|ab|x)['"]|\.save\(|json\.dump\(|\.write_bytes\(|\.write_text\(|os\.remove\(|shutil\.|\.export\(/;

/** Programs that write, by path, and where. `journal`: through the Studio's journal. `adopted`: a game folder written
 * directly, recorded by the journal as an `external` operation before the next edit (local mode only). */
const WRITERS: Record<string, string> = {
  // The journal and its clients.
  'studio-server/src/ops/durable.ts': 'journal: the journal itself (temporary file, fsync, rename)',
  'studio-server/src/ops/core.ts': "journal: game files through it; the guard's staging and screenshots in .cache/",
  'tools/game-write.ts': 'journal: game files through it; outputs elsewhere written plainly',
  'tools/studio/assets.ts': 'journal: uploads through it; the tools run on scratch copies in .cache/',
  'tools/studio/cut.ts':
    "elsewhere: a scratch copy of art/<sheet>/ (the dev server's .cache/studio/, the worker's job folder in .cache/jobs/)",
  'studio-server/src/server/auth/device.ts':
    "elsewhere: the CLI's token file (0600) in the user's configuration folder",
  'studio-server/src/server/main.ts':
    'journal: import copies a game beside the instance folder and renames it in before the journal adopts it; export writes a folder named on the command line; worker-keys writes a key pair to a folder named on the command line',
  'studio-server/src/worker/snapshot.ts':
    "elsewhere: a job's snapshot, unpacked into the worker's fresh job folder in .cache/jobs/",
  'studio-server/src/worker/main.ts':
    "elsewhere: the worker's fresh job folders in .cache/jobs/, removed after each job",
  'studio-server/src/server/git.ts':
    "its own clone of the game's repository, under workDir/git; game files through the journal (an import)",
  'studio-server/src/ops/blobs.ts':
    "elsewhere: the blob store's own folder (local mode), where the collection removes the blobs no row names",
  'studio-server/src/worker/prepare.ts':
    "elsewhere: the asset tools' work folder (their refs, their output) inside the job's folder in .cache/jobs/",
  'studio-server/src/server/prepared.ts':
    "elsewhere: the latest prepared assets written again under the instance's work folder (.prepared/<id>/)",
  'studio-server/src/worker/local.ts':
    "elsewhere: a preview's fresh job folder in .cache/jobs/ on this machine (loopback, tests), removed after the build",
  'studio-server/src/worker/child.ts':
    "elsewhere: the job's output file beside its folder in .cache/jobs/, read and removed by the supervisor",
  // Game folders written directly (local mode: adopted by the journal; hosted: unavailable or in the executor).
  'tools/migrate.ts': 'adopted: web-scumm migrate rewrites a project (an exclusive operation in 4.2.3)',
  'tools/assets.py': 'adopted: npm run assets writes assets.gen.json (and public/assets, outside the game)',
  'tools/cut-sheet.py': 'adopted: run by hand; the Studio runs it on a scratch copy',
  'tools/talk-apply.py': 'adopted: npm run talk writes art/',
  'tools/talk-kit.py': 'adopted: talk kits under art/',
  'tools/talk-normalize.py': 'adopted: talk kits under art/',
  'tools/placeholder-art.py': 'adopted: placeholder art for a new game',
  'tools/audio/mdpipe/__main__.py': 'adopted: npm run audio writes audio/',
  'tools/audio/mdpipe/analyze.py': 'adopted: npm run audio (analysis next to the stems)',
  'tools/audio/mdpipe/stems.py': 'adopted: npm run audio writes audio/',
  'tools/audio/mdpipe/arrange.py': 'adopted: npm run audio writes audio/',
  'tools/audio/mdpipe/midi.py': 'adopted: npm run audio writes audio/',
  'tools/audio/mdpipe/render.py': 'adopted: npm run audio writes audio/',
  'tools/audio/mdpipe/sfx.py': 'adopted: npm run audio writes audio/',
  'tools/audio/mdpipe/transcribe.py': 'adopted: npm run audio writes audio/',
  // Never a game folder.
  'cli/create.mjs': 'elsewhere: web-scumm create makes a new project folder',
  'tools/api-doc.ts': 'elsewhere: docs/',
  'tools/audit-corpus.ts': 'elsewhere: .cache/',
  'tools/backup-memory.ts': 'elsewhere: .cache/ (measures)',
  'tools/bridge-cluster.ts': 'elsewhere: .cache/ (load reports)',
  'tools/bridge-load.ts': 'elsewhere: .cache/ (load reports)',
  'tools/changes.ts': 'elsewhere: CHANGELOG.md and docs/dev/LOG.md',
  'tools/checkpoint.ts': "elsewhere: the solver's checkpoints in .cache/",
  'tools/ci-plan.ts': "elsewhere: the CI job's summary",
  'tools/code-wheel.ts': 'elsewhere: printable pages in the folder named by --out',
  'tools/code-wheel-pdf.py': 'elsewhere: the PDF named on the command line',
  'tools/dist.ts': 'elsewhere: dist/',
  'tools/dsl-doc.ts': 'elsewhere: docs/',
  'tools/field/bundle.ts': 'elsewhere: field bundles',
  'tools/field/field.ts': 'elsewhere: field reports',
  'tools/field/surfaces.mjs': 'elsewhere: qualification surfaces',
  'tools/field/trust.ts': 'elsewhere: temporary signer files',
  'tools/golden-save.ts': 'elsewhere: tests/fixtures/saves/',
  'tools/load-median.ts': 'elsewhere: .cache/ (load reports)',
  'tools/mutate.ts': 'elsewhere: mutation reports',
  'tools/oracle-case.ts': 'elsewhere: tests/fixtures/',
  'tools/pages/lib.ts': 'elsewhere: generated pages',
  'tools/playtests.ts': 'elsewhere: the report folder named by --out',
  'tools/proof-cache.ts': 'elsewhere: .cache/',
  'tools/prove-matrix.ts': 'elsewhere: reports',
  'tools/quality-baseline.ts': 'elsewhere: tests/quality-baseline.json',
  'tools/reality-fixtures.ts': 'elsewhere: tests/fixtures/',
  'tools/release/baseline.mjs': 'elsewhere: release outputs',
  'tools/release/candidate.mjs': 'elsewhere: release outputs',
  'tools/release/lib.mjs': 'elsewhere: release outputs',
  'tools/release/run-jobs.mjs': 'elsewhere: release outputs',
  'tools/release/ship.mjs': 'elsewhere: release outputs',
  'tools/release/signing.mjs': 'elsewhere: release outputs',
  'tools/release/site-files.mjs': 'elsewhere: release outputs',
  'tools/runs-load.ts': 'elsewhere: .cache/ (load reports)',
  'tools/select-game.ts': 'elsewhere: the link to the selected game',
  'tools/speedrun/livesplit.mjs': 'elsewhere: LiveSplit files',
  'tools/speedrun/reference-run.ts': 'elsewhere: reference runs',
  'tools/studio/snapshot.ts': "elsewhere: the demo Studio's public/studio-demo/",
  'tools/verify-variants.ts': 'elsewhere: .cache/',
  'tools/vite/plugins.ts': 'elsewhere: build outputs and .cache/',
};

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(ROOT, p).split('\\').join('/'));
    }
  };
  if (statSync(join(ROOT, dir), { throwIfNoEntry: false })) walk(join(ROOT, dir));
  return out;
}

const writers = ['tools', 'src/studio', 'studio-server/src', 'cli']
  .flatMap(files)
  .filter((f) => {
    const text = () => readFileSync(join(ROOT, f), 'utf8');
    if (/\.(ts|mjs|js|cjs)$/.test(f)) return JS_WRITE.test(text());
    if (f.endsWith('.py')) return PY_WRITE.test(text());
    return false;
  })
  .sort();

describe('a single entry for the game files', () => {
  it('every program that writes is listed, with where it writes', () => {
    expect(writers.filter((f) => !(f in WRITERS))).toEqual([]);
  });
  it('no listed writer is stale', () => {
    expect(Object.keys(WRITERS).filter((f) => !writers.includes(f))).toEqual([]);
  });
  it('the browser Studio writes nothing itself', () => {
    expect(writers.filter((f) => f.startsWith('src/studio/'))).toEqual([]);
  });
});
