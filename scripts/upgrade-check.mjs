// npm run upgrade-check -- --from=<version | previous | path to an engine tarball> (4.0): a game moved from one release of the
// engine to this one, the way a team would. The game is created with the older package (its template, its command),
// verified, and a save is made in it by that engine (the witness's first half, through `<engine>/testing`). Then the
// project installs this repository's package (scripts/pack.mjs), `quest-n-click` (4.3.0: an older project named
// `web-scumm` uninstalls it first, D47), runs `quest-n-click migrate`, `migrate --check`, `verify` and `build`, and loads the old save with the new engine, which must reach the ending from it. --from=<version> takes
// the tarball attached to that GitHub release. Exit 0 when every step passes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { upgradeSource } from './upgrade-source.mjs';

const ROOT = resolve(import.meta.dirname, '..');
let source;
try {
  source = upgradeSource(process.argv.find((a) => a.startsWith('--from='))?.slice(7), (f) => existsSync(resolve(f)));
} catch (e) {
  console.error(`usage: npm run upgrade-check -- --from=<version | previous | quest-n-click-x.y.z.tgz> (${e.message})`);
  process.exit(2);
}
const base = mkdtempSync(join(tmpdir(), 'quest-n-click-upgrade-'));
const env = { ...process.env, GAME: '', GAME_DIR: '', WEB_SCUMM_PROJECT: '' };
const run = (title, cmd, args, cwd) => {
  console.log(`\n▶ ${title}`);
  return execFileSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    env,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
};
const show = (title, cmd, args, cwd) => {
  console.log(`\n▶ ${title}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', env });
};

// `--from=previous`: the newest published release older than this one (its tarball attached since 3.9).
const cmp = (a, b) => {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
if (source.kind === 'previous') {
  const here = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const tags = JSON.parse(
    execFileSync(
      'gh',
      [
        'release',
        'list',
        '-R',
        'Quest-n-Click/quest-n-click',
        '--exclude-drafts',
        '--limit',
        '50',
        '--json',
        'tagName',
      ],
      { encoding: 'utf8' },
    ),
  )
    .map((r) => r.tagName.replace(/^v/, ''))
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && cmp(v, here) < 0 && cmp(v, '3.9.0') >= 0)
    .sort(cmp);
  if (!tags.length) {
    console.error('no published release with a package tarball before', here);
    process.exit(1);
  }
  source = upgradeSource(tags.at(-1), () => false);
  console.log(`upgrade from the previous release: ${source.version}`);
}
const oldTgz = source.kind === 'tgz' ? resolve(source.path) : join(base, source.asset);
if (source.kind === 'release')
  show(
    `download ${source.asset}`,
    'gh',
    ['release', 'download', source.tag, '-R', 'Quest-n-Click/quest-n-click', '-p', source.asset, '-D', base],
    base,
  );
show('create the game with the older engine', 'tar', ['-xzf', oldTgz, '-C', base], base);
// The engine's name as the older release packed it (D47): `web-scumm` up to 4.2.4, `quest-n-click` up to 4.5.1,
// `@quest-n-click/engine` since (D53). The new engine has no alias of a former name: the project moves as its author
// would, `migrate` renaming the rest.
const { version: oldVersion, name: E } = JSON.parse(readFileSync(join(base, 'package', 'package.json'), 'utf8'));
show(
  'create',
  process.execPath,
  [join(base, 'package', 'cli', 'create.mjs'), 'keeper', 'The Keeper', `--engine=file:${oldTgz}`],
  base,
);
rmSync(join(base, 'package'), { recursive: true, force: true });
const game = join(base, 'keeper');
show('install', 'npm', ['install', '--no-audit', '--no-fund'], game);
show(`assets on ${oldVersion}`, 'npx', [E, 'assets'], game);
show(`verify on ${oldVersion}`, 'npx', [E, 'verify'], game);

// A save made by the older engine: the witness's first half, then the envelope that engine writes.
writeFileSync(
  join(game, 'make-save.ts'),
  `import { Engine, FakePresenter, MemoryStore, saveEnvelope, solve } from '${E}/testing';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { game } from './game/game';
const layouts = Object.fromEntries(readdirSync('game/layout').map((f) => [f.replace('.json', ''), JSON.parse(readFileSync('game/layout/' + f, 'utf8'))]));
const r = await solve(game, layouts, { mode: 'witness' });
const e = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
await e.newGame();
const half = r.steps.slice(0, Math.max(1, Math.floor(r.steps.length / 2)));
for (const s of half as { act?: { verb: string; a: string; b?: string } }[]) if (s.act) await e.act(s.act);
writeFileSync('old-save.json', JSON.stringify(saveEnvelope(game, e.state)));
console.log('saved after', half.length, 'of', r.steps.length, 'steps in', e.state.room);
`,
);
show(`a save made by ${oldVersion}`, 'npx', ['tsx', '--tsconfig', 'tsconfig.json', 'make-save.ts'], game);

const pack = join(base, 'pack');
run('pack this engine', process.execPath, [join(ROOT, 'scripts', 'pack.mjs'), `--out=${pack}`], ROOT);
const newVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
if (E !== '@quest-n-click/engine') show(`uninstall ${E}`, 'npm', ['uninstall', '--no-audit', '--no-fund', E], game);
show(
  `upgrade to ${newVersion}`,
  'npm',
  ['install', '--no-audit', '--no-fund', join(pack, `quest-n-click-${newVersion}.tgz`)],
  game,
);
// A project of the previous release has what the new one migrates (4.1.8: a tsconfig with `baseUrl`): `migrate`
// first, then `--check` says nothing is left; `--check` before a migration exits 1 on purpose. 4.3.0: `migrate` also
// renames the former name's imports and commands (make-save.ts's among them); 4.5.2, the unscoped imports (D53).
show('migrate', 'npx', ['quest-n-click', 'migrate'], game);
show('migrate --check', 'npx', ['quest-n-click', 'migrate', '--check'], game);
show(`assets on ${newVersion}`, 'npx', ['quest-n-click', 'assets'], game);
show(`verify on ${newVersion}`, 'npx', ['quest-n-click', 'verify'], game);
show(`build on ${newVersion}`, 'npx', ['quest-n-click', 'build'], game);

writeFileSync(
  join(game, 'load-save.ts'),
  `import { Engine, FakePresenter, MemoryStore, parseSave, solve } from '@quest-n-click/engine/testing';
import { readdirSync, readFileSync } from 'node:fs';
import { game } from './game/game';
const layouts = Object.fromEntries(readdirSync('game/layout').map((f) => [f.replace('.json', ''), JSON.parse(readFileSync('game/layout/' + f, 'utf8'))]));
const state = parseSave(game, JSON.parse(readFileSync('old-save.json', 'utf8')));
const e = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
await e.load(state);
const r = await solve(game, layouts, { mode: 'witness', start: { state: e.state } });
if (r.status !== 'solved') { console.error('the old save no longer reaches the ending:', r.status); process.exit(1); }
console.log('the old save loads in', e.state.room, 'and reaches the ending in', r.steps.length, 'steps');
`,
);
show(`the ${oldVersion} save on ${newVersion}`, 'npx', ['tsx', '--tsconfig', 'tsconfig.json', 'load-save.ts'], game);
if (!process.argv.includes('--keep')) rmSync(base, { recursive: true, force: true });
console.log(
  `\n✔  upgrade: a game made on ${E} ${oldVersion} moves to ${newVersion}; its save loads and reaches the ending`,
);
