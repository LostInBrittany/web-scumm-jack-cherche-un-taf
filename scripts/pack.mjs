// node scripts/pack.mjs [--out=.cache/pack] [--publish-dry-run] [--build-id <id>] [--allow-dirty] (3.9): the engine as npm packages, from the files git tracks. 4.1.1:
// `quest-n-click-bridge`, the reference Reality Bridge, a package of its own (a game that does not run one never
// installs it). 4.1.9: `quest-n-click-connectors`, the connectors of the world outside, a fourth package (an operator's,
// never a game's). 4.2.1: `quest-n-click-studio-server`, the Studio online and its worker, a fifth (an operator's,
// beside the engine). `quest-n-click`: the engine (src/), its pages, its tools and the `quest-n-click` command, the game
// template, and (4.5.0) its documentation bundle, `docs-bundle/`; never a game of this repository, a test, a source doc
// page or a build. `create-quest-n-click`: `npx
// create-quest-n-click <folder>`, which runs `quest-n-click create`. All are packed (`npm pack`) into <out>/, ready for
// `npm install <tarball>` or `npm publish`.
// 4.2.5 (D47): the project was web-scumm. Through 4.2.x each package was also packed under its old name, an alias with
// the same files and version; 4.3.0 packs the new names only (`quest-n-click migrate` moves a game off the old ones).
// 4.5.2 (D53): the packages are named under the npm organisation's scope, which owns them: `@quest-n-click/engine`,
// `@quest-n-click/create` (`npm init @quest-n-click <folder>`), `@quest-n-click/bridge`, `@quest-n-click/connectors`,
// `@quest-n-click/studio-server`. The commands keep their names (`quest-n-click`, `create-quest-n-click`, …), and so do
// the archives (`quest-n-click-<v>.tgz`, `create-quest-n-click-<v>.tgz`, …): what a release publishes, sums and attests
// does not move (tools/release/artifacts.mjs). `quest-n-click migrate` moves a game's imports and dependencies.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import {
  bridgeManifest,
  connectorsManifest,
  createManifest,
  lockFor,
  lockProblems,
  studioServerManifest,
} from './pack-manifests.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const out = resolve(ROOT, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '.cache/pack');
const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
/** `--name value` or `--name=value`. */
const arg = (name) => {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  const a = process.argv[i];
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : process.argv[i + 1];
};

/**
 * A package's package.json and its versioned lock as npm-shrinkwrap.json (4.1.19, plan §6.1): the lock checked against
 * the manifest first, nothing resolved here. A lock that no longer fits stops the pack: `npm run locks` makes it again.
 */
function writeLocked(dir, manifest, lockFile) {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const lock = JSON.parse(readFileSync(join(ROOT, lockFile), 'utf8'));
  const bad = lockProblems(lock, manifest);
  if (bad.length) throw new Error(`${lockFile} does not fit ${manifest.name}: ${bad.join('; ')} (npm run locks)`);
  writeFileSync(join(dir, 'npm-shrinkwrap.json'), `${JSON.stringify(lockFor(lock, manifest), null, 2)}\n`);
}

/** What the package ships, by tracked path. */
const SHIP = [
  /^src\//,
  /^tools\//,
  // The Studio's operation core (4.2.1): the dev server, `ids` and the MCP server import it.
  /^studio-server\//,
  // Its journal's SQL layer (4.2.1), from the Bridge: the store, SQLite and the migrations runner, and the proxies'
  // allowlist; nothing else.
  /^bridge\/src\/(store|store-async|store-sql|store-sqlite|migrations|allowlist)\.ts$/,
  /^cli\//,
  /^games\/_template\//,
  /^public\/(icons|fonts)\//,
  /^public\/og\.png$/,
  /^(index|studio)\.html$/,
  /^vite\.config\.ts$/,
  /^tsconfig\.json$/,
  // The hashed Python requirements (D54): the processing worker's build hook installs them from the engine's package.
  /^requirements\.txt$/,
  /^LICENSE$/,
];
// The Bridge's development tools (Biscuit's samples, the Rust cross-check) stay in the repository.
const SKIP = [
  /__pycache__|\.pyc$/,
  /^tools\/audit-assets\.ts$/,
  /^tools\/reality-(xcheck|fixtures)\.ts$/,
  // The connectors' fuzz harness reads the repository's corpus and sample game (4.1.9): a development tool.
  /^tools\/fuzz-connectors\.ts$/,
];
const shipped = (list) =>
  list.split('\n').filter((f) => f && SHIP.some((r) => r.test(f)) && !SKIP.some((r) => r.test(f)));
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
// Tracked files only (4.1.8): a package is what the repository holds, never a file of the machine that packs it. An
// untracked file under a shipped root is refused rather than left out silently: either commit it or ignore it.
const files = shipped(git(['ls-files', '--cached']));
const untracked = shipped(git(['ls-files', '--others', '--exclude-standard']));
if (untracked.length) {
  console.error(
    `✖  untracked file(s) under a shipped root: ${untracked.join(', ')} (git add or commit them, or add them to .gitignore)`,
  );
  process.exit(1);
}

// The tools, the dev server and the build run in the game project: what the repository has as devDependencies for
// them is a dependency of the package (tests, Playwright and the MCP SDK stay out).
const RUNTIME_DEV = [
  'vite',
  'vite-plugin-pwa',
  'tsx',
  // The compiler API the tools use (4.1.8): typescript@7 has none, so the package carries typescript6 instead.
  '@typescript/typescript6',
  '@types/node',
  '@types/howler',
  'tweakpane',
  '@tweakpane/core',
  '@modelcontextprotocol/sdk',
];
const pick = (names) =>
  Object.fromEntries(names.filter((n) => root.devDependencies?.[n]).map((n) => [n, root.devDependencies[n]]));

rmSync(out, { recursive: true, force: true });
const engine = join(out, 'quest-n-click');
for (const f of files) {
  mkdirSync(dirname(join(engine, f)), { recursive: true });
  cpSync(join(ROOT, f), join(engine, f));
}
writeFileSync(
  join(engine, 'package.json'),
  JSON.stringify(
    {
      name: '@quest-n-click/engine',
      version: root.version,
      description:
        'An engine for point-and-click adventure games in the browser: content as typed data, a solver that proves the game can be finished, a Studio.',
      license: 'MIT',
      type: 'module',
      engines: root.engines,
      repository: { type: 'git', url: 'git+https://github.com/Quest-n-Click/quest-n-click.git' },
      bin: { 'quest-n-click': 'cli/quest-n-click.mjs' },
      // The public API (4.0, wiki/en/engine.api.md): four entry modules, the command line. Anything else is internal.
      exports: {
        './content': './src/engine/api/content.ts',
        './player': './src/engine/api/player.ts',
        './minigames': './src/engine/api/minigames.ts',
        './testing': './src/engine/api/testing.ts',
        './reality': './src/engine/api/reality.ts',
        './cli/*': './cli/*',
        './package.json': './package.json',
      },
      dependencies: {
        ...Object.fromEntries(Object.entries(root.dependencies).filter(([n]) => n !== 'sirv-cli')),
        ...pick(RUNTIME_DEV),
      },
      publishConfig: { access: 'public' },
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(engine, 'README.md'),
  `# quest'n'click\n\nAn engine for point-and-click adventure games in the browser (formerly web-scumm). Start a game:\n\n\`\`\`bash\nnpm init @quest-n-click my-game\ncd my-game && npm install\nnpm run assets && npm run dev\n\`\`\`\n\nThen \`npx quest-n-click help\`. Documentation: https://github.com/Quest-n-Click/quest-n-click/wiki, starting from https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Install-Package.\n`,
);

// npm is `npm.cmd` on Windows: run through the shell there (4.1.18), the arguments being this script's own.
const WIN = process.platform === 'win32';
const npm = (a, o) =>
  execFileSync(WIN ? 'npm.cmd' : 'npm', WIN ? a.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : a, { ...o, shell: WIN });

// The documentation the engine carries (4.5.0, docs/dev/PLAN-4.5-WIKI.md §4.3.4): `wiki -- bundle` writes it into the
// prepared folder, after the tracked files are copied and before `npm pack`; never through SHIP nor git, and never
// into the repository. `read_doc` in a created project reads it (tools/wiki/docs-load.ts). Reproducible: two packs of
// one commit give the same bytes. The package has no `files` list: everything in the folder is packed, the bundle too.
// `--build-id` (the candidate's run) goes into its identity; `--allow-dirty` only when this script's caller asked for it
// (a local try on a changed checkout: the bundle then says `-dirty`); the candidate and CI pack clean checkouts.
const buildId = arg('build-id');
npm(
  [
    'run',
    'wiki',
    '--silent',
    '--',
    'bundle',
    '--out',
    join(engine, 'docs-bundle'),
    ...(buildId ? ['--build-id', buildId] : []),
    ...(process.argv.includes('--allow-dirty') ? ['--allow-dirty'] : []),
  ],
  {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

// `@quest-n-click/create`: `npm init @quest-n-click <folder>` (or `npx @quest-n-click/create <folder>`) runs
// `quest-n-click create` from the engine it depends on, exactly its version.
const create = join(out, 'create-quest-n-click');
mkdirSync(create, { recursive: true });
writeFileSync(
  join(create, 'index.mjs'),
  `#!/usr/bin/env node\n// npm init @quest-n-click <folder> ["Title"]: runs \`quest-n-click create\` from the engine this package depends on.\nawait import('@quest-n-click/engine/cli/create.mjs');\n`,
);
writeFileSync(join(create, 'package.json'), `${JSON.stringify(createManifest(root), null, 2)}\n`);
cpSync(join(ROOT, 'LICENSE'), join(create, 'LICENSE'));

// The Reality Bridge (4.1.1; compiled since 4.1.2): bridge/src and the protocol it shares with the player, bundled
// into one JavaScript module by esbuild, so the package runs on Node alone (no tsx, no TypeScript at run time); the
// Datalog policies beside it, where `new URL('../policy/…', import.meta.url)` finds them from src/cli.mjs; Biscuit's
// WebAssembly and zod stay dependencies.
const bridge = join(out, 'quest-n-click-bridge');
mkdirSync(join(bridge, 'src'), { recursive: true });
// esbuild's API, not its binary under node_modules/.bin (4.1.18: a `.cmd` on Windows, which execFileSync cannot run).
const bundle = (entry, outfile, external) =>
  buildSync({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
    outfile,
    external,
  });
bundle('bridge/src/cli.ts', join(bridge, 'src', 'cli.mjs'), [
  '@biscuit-auth/biscuit-wasm',
  'zod',
  'zod/*',
  // Optional (4.1.10): loaded by name only when the distributed profile or OpenTelemetry is used.
  'pg',
  '@opentelemetry/*',
]);
for (const f of readdirSync(join(ROOT, 'bridge', 'policy')).filter((f) => f.endsWith('.datalog'))) {
  mkdirSync(join(bridge, 'policy'), { recursive: true });
  cpSync(join(ROOT, 'bridge', 'policy', f), join(bridge, 'policy', f));
}
// The store's schema (4.1.10), where `new URL('../migrations/', import.meta.url)` finds it from src/cli.mjs.
for (const f of readdirSync(join(ROOT, 'bridge', 'migrations')).filter((f) => f.endsWith('.sql'))) {
  mkdirSync(join(bridge, 'migrations'), { recursive: true });
  cpSync(join(ROOT, 'bridge', 'migrations', f), join(bridge, 'migrations', f));
}
writeFileSync(
  join(bridge, 'bin.mjs'),
  `#!/usr/bin/env node\n// quest-n-click-bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore>: the reference Reality Bridge on its own, for a\n// game that is already built: \`init --manifest=<game>/dist/reality-manifest.json\`, then \`serve\`. https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Bridge-Install-And-Run.\nconst { main } = await import('./src/cli.mjs');\nprocess.exitCode = await main(process.argv.slice(2));\n`,
);
writeLocked(bridge, bridgeManifest(root), 'scripts/locks/quest-n-click-bridge.json');
cpSync(join(ROOT, 'LICENSE'), join(bridge, 'LICENSE'));
writeFileSync(
  join(bridge, 'README.md'),
  `# @quest-n-click/bridge\n\nThe reference Reality Bridge for a quest'n'click game (formerly quest-n-click-bridge, and web-scumm-bridge before it). Its command is \`quest-n-click-bridge\`: \`npx quest-n-click-bridge init --manifest=dist/reality-manifest.json\`, then \`npx quest-n-click-bridge serve\`; \`doctor\` and \`compact\` for the journal. Documentation: https://github.com/Quest-n-Click/quest-n-click/wiki, starting from https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Bridge-Install-And-Run.\n`,
);

// The connectors (4.1.9, wiki/en/bridge.connectors.md): the SDK, `quest-n-click-connector` and the four connectors bundled into
// one module (src/run.mjs), the MIME reader's worker beside it (src/mime-worker.mjs, where `new URL('./mime-worker.mjs',
// import.meta.url)` finds it), `ssh2` a dependency. A game never installs it; an operator runs it next to a Bridge.
const connectors = join(out, 'quest-n-click-connectors');
mkdirSync(join(connectors, 'src'), { recursive: true });
for (const [entry, outfile] of [
  ['connectors/src/run.ts', 'run.mjs'],
  ['connectors/src/email/mime-worker.ts', 'mime-worker.mjs'],
])
  bundle(entry, join(connectors, 'src', outfile), ['ssh2']);
writeFileSync(
  join(connectors, 'bin.mjs'),
  `#!/usr/bin/env node\n// quest-n-click-connector <email|telnet|ssh|open-badge> --config <file.json>: one connector of the world outside, as its own\n// process, beside a quest-n-click-bridge. https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Bridge-Connectors.\nconst { main } = await import('./src/run.mjs');\nprocess.exitCode = await main(process.argv.slice(2));\n`,
);
writeLocked(connectors, connectorsManifest(root), 'scripts/locks/quest-n-click-connectors.json');
cpSync(join(ROOT, 'LICENSE'), join(connectors, 'LICENSE'));
writeFileSync(
  join(connectors, 'README.md'),
  `# @quest-n-click/connectors\n\nConnectors of the world outside for a quest'n'click game (formerly quest-n-click-connectors, and web-scumm-connectors before it): email, Telnet, SSH and Open Badges, each its own process, each proposing the signals its game declares to a \`quest-n-click-bridge\` under its own Biscuit. Experimental (4.1.9). Install without native code: \`npm install --omit=optional --ignore-scripts @quest-n-click/connectors\`. Then \`npx quest-n-click-connector <email|telnet|ssh|open-badge> --config connector.json\`. Documentation: https://github.com/Quest-n-Click/quest-n-click/wiki, starting from https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Bridge-Connectors.\n`,
);

// The Studio Server (4.2.1, wiki/en/team.what-runs-where.md): two commands that run the server and the processing worker of
// the engine installed beside it (its sources, Vite, tsx), and the Studio's page built once here (`npm run
// studio-client`: studio.html and its code, no game). Its own dependencies are locked; the engine is a peer.
const studio = join(out, 'quest-n-click-studio-server');
mkdirSync(join(studio, 'bin'), { recursive: true });
npm(['run', 'studio-client', '--silent'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
cpSync(join(ROOT, '.cache', 'studio-client'), join(studio, 'client'), { recursive: true });
writeFileSync(
  join(studio, 'bin', 'launch.mjs'),
  `// Runs one of the engine's Studio Server commands with the engine installed beside this package, of the same version:
// node itself, with tsx's loader (no second process between the command and the server: a signal reaches it once) and
// a resolve hook (resolve.mjs) that finds this package's own dependencies from here, wherever npm put them; the Studio's
// page built in this package unless WEB_SCUMM_STUDIO_CLIENT names another. The engine is \`@quest-n-click/engine\`
// (\`quest-n-click\` before 4.5.2, D53; its former name's alias, \`web-scumm\`, went in 4.3.0, D47).
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function launch(entry) {
  const here = dirname(fileURLToPath(import.meta.url));
  const own = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
  let engine;
  try {
    engine = dirname(createRequire(import.meta.url).resolve('@quest-n-click/engine/package.json'));
  } catch {}
  if (!engine) {
    console.error(\`\${own.name}: the engine is not installed: npm install quest-n-click-\${own.version}.tgz (@quest-n-click/engine) beside it\`);
    process.exit(2);
  }
  const version = JSON.parse(readFileSync(join(engine, 'package.json'), 'utf8')).version;
  if (version !== own.version) {
    console.error(\`\${own.name} \${own.version} runs with @quest-n-click/engine \${own.version}, not \${version}\`);
    process.exit(2);
  }
  const tsx = pathToFileURL(createRequire(join(engine, 'package.json')).resolve('tsx/esm')).href;
  const hooks = pathToFileURL(join(here, 'register.mjs')).href;
  const child = spawn(
    process.execPath,
    ['--import', hooks, '--import', tsx, join(engine, entry), ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, WEB_SCUMM_STUDIO_CLIENT: process.env.WEB_SCUMM_STUDIO_CLIENT ?? join(here, '..', 'client') },
    },
  );
  child.on('error', (e) => {
    console.error(\`\${own.name}: \${e.message}\`);
    process.exit(1);
  });
  // A terminal's Ctrl-C reaches the whole group, the server included: forwarded only when this process alone got it.
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      if (signal === 'SIGINT' && process.stdin.isTTY) return;
      child.kill(signal);
    });
  child.on('exit', (code, signal) => process.exit(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)));
}
`,
);
writeFileSync(
  join(studio, 'bin', 'register.mjs'),
  `// The resolve hook of resolve.mjs, registered before the server's first import (node --import).
import { register } from 'node:module';
register('./resolve.mjs', import.meta.url);
`,
);
writeFileSync(
  join(studio, 'bin', 'resolve.mjs'),
  `// The server's own dependencies (this package's \\\`dependencies\\\`) are resolved from this package, never from where the
// engine's sources happen to sit: npm may nest them under it (an install from the registry, with its shrinkwrap), hoist
// them (an install from the archive file), or a strict layout keep them apart.
import { readFileSync } from 'node:fs';
const pkg = new URL('../package.json', import.meta.url);
const OWN = new Set(Object.keys(JSON.parse(readFileSync(pkg, 'utf8')).dependencies ?? {}));
export function resolve(specifier, context, next) {
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
  if (OWN.has(name)) return next(specifier, { ...context, parentURL: pkg.href });
  return next(specifier, context);
}
`,
);
writeFileSync(
  join(studio, 'bin', 'server.mjs'),
  `#!/usr/bin/env node\n// quest-n-click-studio-server <serve|import|export|invite|worker-keys|login|token|backup|restore|replay|gc> …: the Studio Server (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Team-What-Runs-Where).\nimport { launch } from './launch.mjs';\nlaunch('studio-server/src/server/main.ts');\n`,
);
writeFileSync(
  join(studio, 'bin', 'worker.mjs'),
  `#!/usr/bin/env node\n// quest-n-click-studio-worker: the Studio Server's processing worker, with no secret of the platform (ADR 0028).\nimport { launch } from './launch.mjs';\nlaunch('studio-server/src/worker/main.ts');\n`,
);
writeLocked(studio, studioServerManifest(root), 'scripts/locks/quest-n-click-studio-server.json');
cpSync(join(ROOT, 'LICENSE'), join(studio, 'LICENSE'));
writeFileSync(
  join(studio, 'README.md'),
  `# @quest-n-click/studio-server\n\nThe quest'n'click Studio Server (formerly quest-n-click-studio-server, and web-scumm-studio-server before it): one game, several people, online, with OpenID Connect, PostgreSQL and S3; and its processing worker. Install it beside the engine of the same version: \`npm install quest-n-click-${root.version}.tgz quest-n-click-studio-server-${root.version}.tgz\`. Then \`npx quest-n-click-studio-server serve --config studio.config.json\` and \`npx quest-n-click-studio-worker\`. Documentation: https://github.com/Quest-n-Click/quest-n-click/wiki, starting from https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Team-What-Runs-Where.\n`,
);

const ALL = [engine, create, bridge, connectors, studio];

// npm names a scoped package's archive after its scope and name (`@quest-n-click/engine` → quest-n-click-engine-<v>.tgz):
// each archive is renamed to its folder's name, the file name releases have always published (D53).
for (const d of ALL) {
  npm(['pack', '--pack-destination', out, '--silent'], { cwd: d, stdio: ['ignore', 'inherit', 'inherit'] });
  const { name } = JSON.parse(readFileSync(join(d, 'package.json'), 'utf8'));
  const made = `${name.replace(/^@/, '').replace('/', '-')}-${root.version}.tgz`;
  const want = `${basename(d)}-${root.version}.tgz`;
  if (made !== want) renameSync(join(out, made), join(out, want));
}
console.log(
  `packed into ${out}: @quest-n-click/engine ${root.version} (${files.length} files and its docs-bundle/), @quest-n-click/create, @quest-n-click/bridge (one module, its policies), @quest-n-click/connectors (one module, its MIME worker), @quest-n-click/studio-server (two commands, the Studio's page); archives under their former names`,
);
// --publish-dry-run (4.1.8): what `npm publish` would send, for each package, without sending it (release-check).
if (process.argv.includes('--publish-dry-run'))
  for (const dir of ALL) {
    npm(['publish', '--dry-run', '--ignore-scripts'], { cwd: dir, stdio: 'inherit' });
  }
