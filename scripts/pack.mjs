// node scripts/pack.mjs [--out=.cache/pack] [--publish-dry-run] (3.9): the engine as npm packages, from the files git tracks. 4.1.1:
// `web-scumm-bridge`, the reference Reality Bridge, a package of its own (a game that does not run one never installs it).
// 4.1.9: `web-scumm-connectors`, the connectors of the world outside, a fourth package (an operator's, never a game's).
// 4.2.1: `web-scumm-studio-server`, the Studio online and its worker, a fifth (an operator's, beside the engine).
// `web-scumm`: the engine (src/), its pages, its tools and the `web-scumm` command, the game template; never a game
// of this repository, a test, a doc page or a build. `create-web-scumm`: `npx create-web-scumm <folder>`, which runs
// `web-scumm create`. Both are packed (`npm pack`) into <out>/, ready for `npm install <tarball>` or `npm publish`.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { bridgeManifest, connectorsManifest, lockFor, lockProblems, studioServerManifest } from './pack-manifests.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const out = resolve(ROOT, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '.cache/pack');
const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

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
  /^requirements\.txt$/,
  // The processing worker's Python lock (4.2.3 PR 0, H7): its build hook installs it from the engine's package.
  /^ops\/studio\/worker-requirements\.lock$/,
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
const engine = join(out, 'web-scumm');
for (const f of files) {
  mkdirSync(dirname(join(engine, f)), { recursive: true });
  cpSync(join(ROOT, f), join(engine, f));
}
writeFileSync(
  join(engine, 'package.json'),
  JSON.stringify(
    {
      name: 'web-scumm',
      version: root.version,
      description:
        'An engine for point-and-click adventure games in the browser: content as typed data, a solver that proves the game can be finished, a Studio.',
      license: 'MIT',
      type: 'module',
      engines: root.engines,
      repository: { type: 'git', url: 'git+https://github.com/wanoo/web-scumm.git' },
      bin: { 'web-scumm': 'cli/web-scumm.mjs' },
      // The public API (4.0, docs/en/API.md): four entry modules, the command line. Anything else is internal.
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
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(engine, 'README.md'),
  `# web-scumm\n\nAn engine for point-and-click adventure games in the browser. Start a game:\n\n\`\`\`bash\nnpx create-web-scumm my-game\ncd my-game && npm install\nnpm run assets && npm run dev\n\`\`\`\n\nThen \`npx web-scumm help\`. Documentation: https://github.com/wanoo/web-scumm (docs/en/PACKAGE.md).\n`,
);

const create = join(out, 'create-web-scumm');
mkdirSync(create, { recursive: true });
writeFileSync(
  join(create, 'index.mjs'),
  `#!/usr/bin/env node\n// npx create-web-scumm <folder> ["Title"]: runs \`web-scumm create\` from the engine this package depends on.\nimport 'web-scumm/cli/create.mjs';\n`,
);
writeFileSync(
  join(create, 'package.json'),
  JSON.stringify(
    {
      name: 'create-web-scumm',
      version: root.version,
      description: 'Creates a web-scumm game project: npx create-web-scumm my-game',
      license: 'MIT',
      type: 'module',
      bin: { 'create-web-scumm': 'index.mjs' },
      dependencies: { 'web-scumm': root.version },
    },
    null,
    2,
  ) + '\n',
);
cpSync(join(ROOT, 'LICENSE'), join(create, 'LICENSE'));

// The Reality Bridge (4.1.1; compiled since 4.1.2): bridge/src and the protocol it shares with the player, bundled
// into one JavaScript module by esbuild, so the package runs on Node alone (no tsx, no TypeScript at run time); the
// Datalog policies beside it, where `new URL('../policy/…', import.meta.url)` finds them from src/cli.mjs; Biscuit's
// WebAssembly and zod stay dependencies.
const bridge = join(out, 'web-scumm-bridge');
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
  `#!/usr/bin/env node\n// web-scumm-bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore>: the reference Reality Bridge on its own, for a\n// game that is already built: \`init --manifest=<game>/dist/reality-manifest.json\`, then \`serve\`. docs/en/REALITY-OPS.md.\nconst { main } = await import('./src/cli.mjs');\nprocess.exitCode = await main(process.argv.slice(2));\n`,
);
writeLocked(bridge, bridgeManifest(root), 'scripts/locks/web-scumm-bridge.json');
cpSync(join(ROOT, 'LICENSE'), join(bridge, 'LICENSE'));
writeFileSync(
  join(bridge, 'README.md'),
  `# web-scumm-bridge\n\nThe reference Reality Bridge for a web-scumm game. \`npx web-scumm-bridge init --manifest=dist/reality-manifest.json\`, then \`npx web-scumm-bridge serve\`; \`doctor\` and \`compact\` for the journal. Documentation: https://github.com/wanoo/web-scumm (docs/en/REALITY-OPS.md).\n`,
);

// The connectors (4.1.9, docs/en/CONNECTORS.md): the SDK, `web-scumm-connector` and the four connectors bundled into
// one module (src/run.mjs), the MIME reader's worker beside it (src/mime-worker.mjs, where `new URL('./mime-worker.mjs',
// import.meta.url)` finds it), `ssh2` a dependency. A game never installs it; an operator runs it next to a Bridge.
const connectors = join(out, 'web-scumm-connectors');
mkdirSync(join(connectors, 'src'), { recursive: true });
for (const [entry, outfile] of [
  ['connectors/src/run.ts', 'run.mjs'],
  ['connectors/src/email/mime-worker.ts', 'mime-worker.mjs'],
])
  bundle(entry, join(connectors, 'src', outfile), ['ssh2']);
writeFileSync(
  join(connectors, 'bin.mjs'),
  `#!/usr/bin/env node\n// web-scumm-connector <email|telnet|ssh|open-badge> --config <file.json>: one connector of the world outside, as its own\n// process, beside a web-scumm-bridge. docs/en/CONNECTORS.md.\nconst { main } = await import('./src/run.mjs');\nprocess.exitCode = await main(process.argv.slice(2));\n`,
);
writeLocked(connectors, connectorsManifest(root), 'scripts/locks/web-scumm-connectors.json');
cpSync(join(ROOT, 'LICENSE'), join(connectors, 'LICENSE'));
writeFileSync(
  join(connectors, 'README.md'),
  `# web-scumm-connectors\n\nConnectors of the world outside for a web-scumm game: email, Telnet, SSH and Open Badges, each its own process, each proposing the signals its game declares to a \`web-scumm-bridge\` under its own Biscuit. Experimental (4.1.9). Install without native code: \`npm install --omit=optional --ignore-scripts web-scumm-connectors\`. Then \`npx web-scumm-connector <email|telnet|ssh|open-badge> --config connector.json\`. Documentation: https://github.com/wanoo/web-scumm (docs/en/CONNECTORS.md).\n`,
);

// npm is `npm.cmd` on Windows: run through the shell there (4.1.18), the arguments being this script's own.
const WIN = process.platform === 'win32';
const npm = (a, o) =>
  execFileSync(WIN ? 'npm.cmd' : 'npm', WIN ? a.map((x) => (/\s/.test(x) ? `"${x}"` : x)) : a, { ...o, shell: WIN });

// The Studio Server (4.2.1, docs/en/STUDIO-SERVER.md): two commands that run the server and the processing worker of
// the engine installed beside it (its sources, Vite, tsx), and the Studio's page built once here (`npm run
// studio-client`: studio.html and its code, no game). Its own dependencies are locked; the engine is a peer.
const studio = join(out, 'web-scumm-studio-server');
mkdirSync(join(studio, 'bin'), { recursive: true });
npm(['run', 'studio-client', '--silent'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
cpSync(join(ROOT, '.cache', 'studio-client'), join(studio, 'client'), { recursive: true });
writeFileSync(
  join(studio, 'bin', 'launch.mjs'),
  `// Runs one of the engine's Studio Server commands with the engine installed beside this package, of the same version:
// node itself, with tsx's loader (no second process between the command and the server: a signal reaches it once) and
// a resolve hook (resolve.mjs) that finds this package's own dependencies from here, wherever npm put them; the Studio's
// page built in this package unless WEB_SCUMM_STUDIO_CLIENT names another.
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
    engine = dirname(createRequire(import.meta.url).resolve('web-scumm/package.json'));
  } catch {
    console.error(\`\${own.name}: the engine is not installed: npm install web-scumm-\${own.version}.tgz beside it\`);
    process.exit(2);
  }
  const version = JSON.parse(readFileSync(join(engine, 'package.json'), 'utf8')).version;
  if (version !== own.version) {
    console.error(\`\${own.name} \${own.version} runs with web-scumm \${own.version}, not \${version}\`);
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
  `#!/usr/bin/env node\n// web-scumm-studio-server <serve|import|export|invite|worker-keys|login|token|backup|restore|replay|gc> …: the Studio Server (docs/en/STUDIO-SERVER.md).\nimport { launch } from './launch.mjs';\nlaunch('studio-server/src/server/main.ts');\n`,
);
writeFileSync(
  join(studio, 'bin', 'worker.mjs'),
  `#!/usr/bin/env node\n// web-scumm-studio-worker: the Studio Server's processing worker, with no secret of the platform (ADR 0028).\nimport { launch } from './launch.mjs';\nlaunch('studio-server/src/worker/main.ts');\n`,
);
writeLocked(studio, studioServerManifest(root), 'scripts/locks/web-scumm-studio-server.json');
cpSync(join(ROOT, 'LICENSE'), join(studio, 'LICENSE'));
writeFileSync(
  join(studio, 'README.md'),
  `# web-scumm-studio-server\n\nThe web-scumm Studio Server: one game, several people, online, with OpenID Connect, PostgreSQL and S3; and its processing worker. Install it beside the engine of the same version: \`npm install web-scumm-${root.version}.tgz web-scumm-studio-server-${root.version}.tgz\`. Then \`npx web-scumm-studio-server serve --config studio.config.json\` and \`npx web-scumm-studio-worker\`. Documentation: https://github.com/wanoo/web-scumm (docs/en/STUDIO-SERVER.md).\n`,
);

for (const d of [engine, create, bridge, connectors, studio])
  npm(['pack', '--pack-destination', out, '--silent'], { cwd: d, stdio: ['ignore', 'inherit', 'inherit'] });
console.log(
  `packed into ${out}: web-scumm ${root.version} (${files.length} files), create-web-scumm, web-scumm-bridge (one module, its policies), web-scumm-connectors (one module, its MIME worker), web-scumm-studio-server (two commands, the Studio's page)`,
);
// --publish-dry-run (4.1.8): what `npm publish` would send, for each package, without sending it (release-check).
if (process.argv.includes('--publish-dry-run'))
  for (const dir of [engine, create, bridge, connectors, studio]) {
    npm(['publish', '--dry-run', '--ignore-scripts'], { cwd: dir, stdio: 'inherit' });
  }
