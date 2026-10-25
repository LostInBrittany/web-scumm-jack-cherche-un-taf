#!/usr/bin/env node
// node scripts/studio-install-smoke.mjs --tarballs=<dir> (4.2.1, plan §7 row 9): the Studio Server as an operator gets
// it, from this release's archives, outside the repository. In an empty folder: `npm install` of the engine and the
// Studio Server archives (nothing else of the repository); `quest-n-click-studio-server import` of the engine's own game
// template; `serve` on the loopback (SQLite, a folder of blobs): its probes, the Studio's page built into the package,
// the API reading the game; `worker-keys`, then `quest-n-click-studio-worker` answering its probe. And its own dependencies
// (OpenID Connect, JWT, Postgres: `deps` imports each) found from the engine's sources whether npm hoists them (an
// install from the archive file) or nests them under the package (`--install-strategy=nested`, as an install from the
// registry with its shrinkwrap does). From 4.2.3 (PR 0, H7): the worker's Python requirements in the engine's package, the
// very file of the repository (`requirements.txt`, hashed since D54); with `--python`, installed as the worker's build
// hook installs it (`--require-hashes`, wheels only) and its packages imported from that folder (CI's job has CPython
// 3.13, Clever Cloud's). Exit 0 / 1.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const dir = resolve(process.argv.find((a) => a.startsWith('--tarballs='))?.slice(11) ?? '');
const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8')).version;
const tgz = (name) => {
  const f = readdirSync(dir).find((x) => x === `${name}-${version}.tgz`);
  if (!f) throw new Error(`${name}-${version}.tgz is not in ${dir}`);
  return join(dir, f);
};
const WIN = process.platform === 'win32';
const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
const until = async (url, ms = 60_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 500))) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) return r;
  }
  throw new Error(`${url} did not answer 200 within ${ms / 1000} s`);
};

const home = mkdtempSync(join(tmpdir(), 'studio-install-'));
const children = [];
let failed = false;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};
/** The two archives installed into `dir` (`extra`: npm's options). */
const install = (dir, extra = []) => {
  writeFileSync(join(dir, 'package.json'), '{"name":"studio-install-smoke","private":true,"type":"module"}\n');
  execFileSync(
    WIN ? 'npm.cmd' : 'npm',
    ['install', '--no-audit', '--no-fund', ...extra, tgz('quest-n-click'), tgz('quest-n-click-studio-server')],
    { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'], shell: WIN },
  );
};
const binIn = (dir, name) => join(dir, 'node_modules', '@quest-n-click', 'studio-server', 'bin', `${name}.mjs`);
/** `deps` in an install: each of the server's own dependencies found and imported, with its version and folder. */
const deps = (dir) =>
  JSON.parse(
    execFileSync(process.execPath, [binIn(dir, 'server'), 'deps'], { cwd: dir, encoding: 'utf8' })
      .trim()
      .split('\n')
      .at(-1),
  );
const OWN = ['openid-client', 'jose', 'pg'];
const said = (d) => OWN.map((n) => `${n} ${d[n]?.version}`).join(', ');

try {
  install(home);
  check('the engine and the Studio Server install from their archives', true);
  const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
  const LOCK = 'requirements.txt';
  const shipped = join(home, 'node_modules', '@quest-n-click', 'engine', LOCK);
  check(
    "the hashed requirements.txt is in the engine's package, as in the repository",
    sha(shipped) === sha(resolve(import.meta.dirname, '..', LOCK)),
  );
  if (process.argv.includes('--python')) {
    // As STUDIO-SERVER's hook for a worker from the archives says, from the worker's folder.
    execFileSync(
      'python3',
      [
        '-m',
        'pip',
        'install',
        '--quiet',
        '--target',
        '.python',
        '--require-hashes',
        '--only-binary=:all:',
        '-r',
        shipped,
      ],
      { cwd: home, stdio: ['ignore', 'ignore', 'inherit'] },
    );
    // Imported from that folder, not from a site-packages that happens to have them.
    const from =
      "import os, sys, PIL, numpy, scipy; sys.exit(0 if all(m.__file__.startswith(os.environ['PYTHONPATH']) for m in (PIL, numpy, scipy)) else 1)";
    execFileSync('python3', ['-s', '-c', from], {
      cwd: home,
      env: { PATH: process.env.PATH, PYTHONPATH: join(home, '.python') },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    check(
      "requirements.txt installs, hashes checked, and the asset tools' packages import from the worker's folder",
      true,
    );
  }
  const bin = (name) => binIn(home, name);
  const run = (name, args, env = {}) =>
    execFileSync(process.execPath, [bin(name), ...args], {
      cwd: home,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
  const hoisted = deps(home);
  check(
    "its own dependencies import from the engine's sources (npm hoisted them)",
    OWN.every((n) => hoisted[n]?.version),
    said(hoisted),
  );
  // The former commands (D47) went in 4.3.0: the package names only its own.
  const commands = Object.keys(
    JSON.parse(readFileSync(join(home, 'node_modules', '@quest-n-click', 'studio-server', 'package.json'), 'utf8')).bin,
  );
  check(
    'its commands are quest-n-click-studio-server and quest-n-click-studio-worker, no former name',
    commands.join() === 'quest-n-click-studio-server,quest-n-click-studio-worker',
    commands.join(),
  );
  const nestedHome = mkdtempSync(join(tmpdir(), 'studio-install-nested-'));
  try {
    install(nestedHome, ['--install-strategy=nested']);
    const nested = deps(nestedHome);
    const under = join('node_modules', '@quest-n-click', 'studio-server', 'node_modules');
    check(
      'and when npm nests them under the package',
      OWN.every((n) => nested[n]?.from.includes(under)),
      said(nested),
    );
  } finally {
    rmSync(nestedHome, { recursive: true, force: true });
  }

  // The game: the engine's own template, imported as the instance's project.
  cpSync(join(home, 'node_modules', '@quest-n-click', 'engine', 'games', '_template'), join(home, 'game-src'), {
    recursive: true,
  });
  const port = await freePort();
  const config = {
    publicUrl: `http://127.0.0.1:${port}`,
    playUrl: `http://localhost:${port}`,
    game: 'smoke',
    workDir: join(home, 'work'),
    port,
    host: '127.0.0.1',
    store: { kind: 'sqlite', file: join(home, 'studio.sqlite') },
    blobs: { kind: 'fs', dir: join(home, 'blobs') },
  };
  writeFileSync(join(home, 'studio.config.json'), JSON.stringify(config, null, 2));
  const imported = run('server', ['import', join(home, 'game-src'), '--config', join(home, 'studio.config.json')]);
  check('import takes the game', /"event":"imported"/.test(imported), imported.trim().split('\n').at(-1));

  const server = spawn(process.execPath, [bin('server'), 'serve', '--config', join(home, 'studio.config.json')], {
    cwd: home,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(server);
  const base = `http://127.0.0.1:${port}`;
  await until(`${base}/readyz`);
  check('serve answers its probes, the writes served', true);
  const page = await fetch(`${base}/`);
  const html = await page.text();
  check(
    "the Studio's page built into the package",
    page.ok && html.includes('name="web-scumm-studio"'),
    `${page.status}`,
  );
  const game = await fetch(`${base}/api/game`);
  const info = game.ok ? await game.json() : {};
  check('the API reads the game', game.ok && typeof info.title === 'string', info.title ?? `${game.status}`);

  // The worker, with keys the server's command made.
  const keys = join(home, 'keys');
  mkdirSync(keys);
  run('server', ['worker-keys', '--out', keys]);
  const wport = await freePort();
  const worker = spawn(process.execPath, [bin('worker')], {
    cwd: home,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      PORT: String(wport),
      WORKER_PUBLIC_KEY: readFileSync(join(keys, 'studio-worker.pub'), 'utf8'),
      WORKER_INSTANCE: 'smoke',
    },
  });
  children.push(worker);
  await until(`http://127.0.0.1:${wport}/livez`);
  check('the worker answers its probe', true);
} catch (e) {
  check('the run', false, String(e.message ?? e).split('\n')[0]);
} finally {
  for (const c of children) c.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1000));
  rmSync(home, { recursive: true, force: true });
}
console.log(failed ? '✖ studio-install-smoke failed' : '✓ studio-install-smoke');
process.exit(failed ? 1 : 0);
