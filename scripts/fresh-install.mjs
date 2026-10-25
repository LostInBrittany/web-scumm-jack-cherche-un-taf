// npm run fresh-install [-- --dir=<folder>] [--keep] (3.9): the engine used the way another project uses it. Packs
// quest-n-click (scripts/pack.mjs), creates a game from the packed template in an empty folder outside the repository,
// installs the tarball, then runs the game's own commands: assets, verify, build (every file of dist/ accounted for),
// and plays it to its ending in a browser (scripts/e2e.mjs on `quest-n-click preview`). Nothing in the new project points
// into this repository: a path that does is an error. Exit 0 when every step passes.
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('--dir='))?.slice(6) ?? mkdtempSync(join(tmpdir(), 'quest-n-click-fresh-'));
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const step = (title, cmd, a, cwd) => {
  console.log(`\n▶ ${title}`);
  execFileSync(cmd, a, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, GAME: '', GAME_DIR: '', WEB_SCUMM_PROJECT: '' },
  });
};

step('pack', process.execPath, [join(ROOT, 'scripts', 'pack.mjs'), `--out=${join(base, 'pack')}`], ROOT);
const tgz = join(base, 'pack', `quest-n-click-${version}.tgz`);
step('create', 'tar', ['-xzf', tgz, '-C', base], base);
step(
  'create',
  process.execPath,
  [join(base, 'package', 'cli', 'create.mjs'), 'lantern', 'The Lantern', `--engine=file:${tgz}`],
  base,
);
rmSync(join(base, 'package'), { recursive: true, force: true });
const game = join(base, 'lantern');
step('install', 'npm', ['install', '--no-audit', '--no-fund'], game);

// The `@quest-n-click/create` archive too (4.1.8): installed next to the engine's (its dependency on
// `@quest-n-click/engine` is satisfied by the tarball given in the same command), then run by its command,
// `npx create-quest-n-click` (`npm init @quest-n-click` once it is on npm, D53).
const createTgz = join(base, 'pack', `create-quest-n-click-${version}.tgz`);
const creator = join(base, 'creator');
mkdirSync(creator, { recursive: true });
writeFileSync(join(creator, 'package.json'), '{ "name": "creator", "private": true }\n');
step('create-quest-n-click: install', 'npm', ['install', '--no-audit', '--no-fund', createTgz, tgz], creator);
step(
  'create-quest-n-click: run',
  'npx',
  ['create-quest-n-click', 'beacon', 'The Beacon', `--engine=file:${tgz}`],
  creator,
);
const beacon = JSON.parse(readFileSync(join(creator, 'beacon', 'package.json'), 'utf8'));
if (beacon.dependencies?.['@quest-n-click/engine'] !== `file:${tgz}` || !existsSync(join(creator, 'beacon', 'game'))) {
  console.error('✖ create-quest-n-click made no project on this engine');
  process.exit(1);
}

// Nothing the project wrote points into the repository.
const leaks = [];
const scan = (d) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (e === 'node_modules' || e === 'dist') continue;
    if (statSync(p).isDirectory()) scan(p);
    else if (/\.(ts|json|md|mjs)$/.test(e) && readFileSync(p, 'utf8').includes(ROOT)) leaks.push(p);
  }
};
scan(game);
scan(join(creator, 'beacon'));
if (leaks.length) {
  console.error(`✖ the project names the repository: ${leaks.join(', ')}`);
  process.exit(1);
}

step('assets', 'npx', ['quest-n-click', 'assets'], game);
step('verify', 'npx', ['quest-n-click', 'verify'], game);
// The tools that read the sources with the compiler API (4.1.8: `@typescript/typescript6` must be in the tarball).
step('ids (read)', 'npx', ['quest-n-click', 'ids'], game);
step('build', 'npx', ['quest-n-click', 'build'], game);
if (!existsSync(join(game, 'dist', 'licenses', 'assets-manifest.json'))) {
  console.error('✖ no licenses/ in the build');
  process.exit(1);
}

console.log('\n▶ play it to the end');
const server = spawn('npx', ['quest-n-click', 'preview', '--port', '5181', '--strictPort'], {
  cwd: game,
  stdio: 'ignore',
  detached: true,
});
try {
  for (let i = 0; i < 60; i++) {
    try {
      execFileSync('curl', ['-sf', 'http://127.0.0.1:5181/'], { stdio: 'ignore' });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  execFileSync(
    process.execPath,
    [join(ROOT, 'scripts', 'e2e.mjs'), 'http://127.0.0.1:5181/', '--game', 'lantern', '--generic', '--prod'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, GAME: '', WEB_SCUMM_PROJECT: game, E2E_OUT: join(base, 'e2e') },
    },
  );
} finally {
  try {
    process.kill(-server.pid);
  } catch {
    /* gone */
  }
}
// The Bridge the same way (4.1.2): its tarball installed on its own, outside the repository, with the sample game's
// manifest; init without the demonstration webhooks, the journal read, the service up and answering its keys.
console.log('\n▶ the Bridge from its tarball');
const bridgeTgz = join(base, 'pack', `quest-n-click-bridge-${version}.tgz`);
const bridgeDir = join(base, 'bridge');
step('bridge: unpack', 'tar', ['-xzf', bridgeTgz, '-C', base], base);
execFileSync('mv', [join(base, 'package'), bridgeDir]);
step('bridge: install', 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], bridgeDir);
const manifestFile = join(base, 'reality-manifest.json');
execFileSync(
  'npx',
  [
    'tsx',
    '-e',
    `import('./tools/game.ts').then(async (g) => { const { game } = await g.loadGameModule(); const m = await import('./src/engine/reality/manifest.ts'); process.stdout.write(JSON.stringify(m.realityManifest(game))); })`,
  ],
  { cwd: ROOT, stdio: ['ignore', openSync(manifestFile, 'w'), 'inherit'], env: { ...process.env, GAME: 'signals' } },
);
if (readFileSync(bridgeDir + '/src/cli.mjs', 'utf8').includes('tsx/esm/api')) {
  console.error('✖ the Bridge package still runs TypeScript sources');
  process.exit(1);
}
const data = join(base, 'bridge-data');
step(
  'bridge: init',
  process.execPath,
  [join(bridgeDir, 'bin.mjs'), 'init', `--dir=${data}`, `--manifest=${manifestFile}`, '--no-demo-webhooks'],
  bridgeDir,
);
step('bridge: doctor', process.execPath, [join(bridgeDir, 'bin.mjs'), 'doctor', `--dir=${data}`], bridgeDir);
const bridgeServer = spawn(process.execPath, [join(bridgeDir, 'bin.mjs'), 'serve', `--dir=${data}`, '--port=5182'], {
  cwd: bridgeDir,
  stdio: 'ignore',
  detached: true,
});
try {
  let keys = '';
  for (let i = 0; i < 40 && !keys; i++) {
    try {
      keys = execFileSync('curl', ['-sf', 'http://127.0.0.1:5182/v1/keys'], { encoding: 'utf8' });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!keys.includes('"keys"')) {
    console.error('✖ the Bridge did not answer its keys');
    process.exit(1);
  }
  console.log('✔  the Bridge serves its keys from the installed package');
} finally {
  try {
    process.kill(-bridgeServer.pid);
  } catch {
    /* gone */
  }
}

// The connectors (4.1.9): their tarball installed on its own, without native code (no optional dependency, no install
// script: ssh2 runs in pure JavaScript), then `quest-n-click-connector --help` from the installed package, which must run
// no TypeScript and no tsx.
console.log('\n▶ the connectors from their tarball');
const connectorsTgz = join(base, 'pack', `quest-n-click-connectors-${version}.tgz`);
const operator = join(base, 'operator');
mkdirSync(operator, { recursive: true });
writeFileSync(join(operator, 'package.json'), '{ "name": "operator", "private": true }\n');
step(
  'connectors: install',
  'npm',
  ['install', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', connectorsTgz],
  operator,
);
const help = execFileSync('npx', ['quest-n-click-connector', '--help'], { cwd: operator, encoding: 'utf8' });
const runMjs = readFileSync(join(operator, 'node_modules', '@quest-n-click', 'connectors', 'src', 'run.mjs'), 'utf8');
if (!help.includes('usage: quest-n-click-connector') || runMjs.includes('tsx/esm/api')) {
  console.error('✖ quest-n-click-connector did not run from its installed package');
  process.exit(1);
}
console.log('✔  quest-n-click-connector answers from the installed package');

if (!args.includes('--keep') && !args.some((a) => a.startsWith('--dir=')))
  rmSync(base, { recursive: true, force: true });
console.log(
  `\n✔  fresh install: quest-n-click ${version} packed, a game created, verified, built and played outside the repository; the Bridge installed and serving; the connectors installed and answering`,
);
