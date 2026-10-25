#!/usr/bin/env node
// npm run external-consumer -- [--tarballs=<dir>] [--from=<version|tgz>] [--dir=<folder>] [--keep] (4.1.18 "Dress
// Rehearsal", plan §7): the archives used the way a third party uses them, on Linux, macOS and Windows. The
// tarballs are the candidate run's (`--tarballs=`: never packed again in the line that judges them; without it, this
// checkout is packed, for a local try). Nothing the consumer runs comes from the checkout: no module of it is imported
// by the projects (this harness reads only scripts/upgrade-source.mjs, to name the older release),
// and every file the consumer wrote is searched for the checkout's path.
//
//   1. the archives read: name, version, licence, binaries, exports, no `file:`/`link:` dependency, no checkout path;
//      the engine's documentation bundle (4.5.0), `docs-bundle/`, each file matching its manifest's sha256;
//   2. a game created on the older release (`--from`, 4.1.17 by default), its assets, verify, and a save made by that
//      engine; then moved to the candidate as its author would (4.3.0, D47: the former name's aliases are gone): the
//      old package uninstalled, `quest-n-click` installed from its archive, `npx quest-n-click migrate` (which renames
//      the `web-scumm/…` imports, the tsconfig's paths and the scripts' commands), migrate --check, assets, verify,
//      build, the old save loaded and played to the ending through `@quest-n-click/engine/testing`, a new game played to the
//      ending the same way; then (4.5.0) a real MCP client over stdio against that project's `quest-n-click mcp`:
//      read_doc {name} one text block, the bundle's copy, nothing beside it; list_docs and search_docs offered, the
//      bundle naming this version;
//   3. `npx create-quest-n-click` from its archive;
//   4. the Bridge from its archive: init, doctor, serve on SQLite (and on Postgres when CONSUMER_PG_URL is set), its
//      keys answered;
//   5. the connectors from their archive (`--omit=optional --ignore-scripts`): every connector's `--help`, then a
//      recorded scenario through the Bridge just installed: a signed email webhook accepted, the same message a
//      duplicate, a bad signature refused.
// Exit 0 when every step passes. Portable: Node's own APIs (no `mv`, `curl` or process groups), npm and npx through the
// shell on Windows.
import { spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { harness, WIN, waitFor } from './lib/archive-harness.mjs';
import { fetchRetry } from '../tools/release/fetch-retry.mjs';
import { KNOWN_ENGINES, sumFor, sumsAsset, upgradeSource } from './upgrade-source.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = resolve(flag('dir') ?? mkdtempSync(join(tmpdir(), 'quest-n-click-consumer-')));
mkdirSync(base, { recursive: true });
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
// The consumer's environment: nothing that points a tool at this repository's game.
const ENV = {
  ...process.env,
  GAME: '',
  GAME_DIR: '',
  WEB_SCUMM_PROJECT: '',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
};
let failed = 0;
const fail = (what) => {
  console.error(`✖  ${what}`);
  failed++;
};

const { run, unpack, serve } = harness({ env: ENV, base });
const node = (title, a, cwd, o) => run(title, process.execPath, a, cwd, o);
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));
/** Every text file under `dir` (node_modules and builds left out) that names the checkout or a private engine path. */
function leaksIn(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (['node_modules', 'dist', '.git'].includes(e)) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs|cjs|json|md)$/.test(e)) {
        const s = readFileSync(p, 'utf8');
        if (s.includes(ROOT) || s.includes(ROOT.replaceAll('\\', '/'))) out.push(`${p}: names the checkout`);
        if (/from\s+['"]@engine\//.test(s)) out.push(`${p}: imports @engine/* (the engine's private alias)`);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * The engine's documentation bundle in the archive actually produced (4.5.0, docs/dev/PLAN-4.5-WIKI.md §4.3.4): its
 * manifest names this version, each file it lists is there with its sha256, and no other file is.
 */
function bundleRead(dir) {
  const b = join(dir, 'docs-bundle');
  if (!existsSync(join(b, 'bundle-manifest.json'))) return fail('quest-n-click: no docs-bundle/ in the archive');
  const m = json(join(b, 'bundle-manifest.json'));
  if (m.format !== 'quest-n-click-docs-bundle' || m.version !== 1)
    fail(`docs-bundle: format ${m.format} v${m.version}`);
  if (m.productVersion !== version) fail(`docs-bundle: built for ${m.productVersion}, not ${version}`);
  for (const f of m.files) {
    const file = join(b, f.path);
    if (!existsSync(file)) fail(`docs-bundle/${f.path}: missing`);
    else if (createHash('sha256').update(readFileSync(file)).digest('hex') !== f.sha256)
      fail(`docs-bundle/${f.path}: its sha256 is not the manifest's`);
  }
  const listed = new Set(m.files.map((f) => f.path));
  const walk = (d, prefix) =>
    readdirSync(d).flatMap((e) =>
      statSync(join(d, e)).isDirectory() ? walk(join(d, e), `${prefix}${e}/`) : [`${prefix}${e}`],
    );
  for (const f of walk(b, ''))
    if (f !== 'bundle-manifest.json' && !listed.has(f)) fail(`docs-bundle/${f}: not in its manifest`);
  for (const name of ['CONTENT_GUIDE', 'ENGINE', 'TOOLS', 'STUDIO', 'WORKFLOW', 'AUDIO', 'UPGRADING', 'CLASSICS'])
    if (!listed.has(`legacy/${name}.md`)) fail(`docs-bundle: no legacy/${name}.md`);
  console.log(`✔  docs-bundle/ of ${version}: ${m.files.length} files, each matching its sha256`);
}

// ---------------------------------------------------------------- the archives
// The packages' archives under their names since 4.2.5 (D47); their former names' aliases went in 4.3.0. Since 4.5.2
// (D53) each archive holds the package of the organisation's scope that NPM names; the archive keeps its file name.
const NAMES = ['quest-n-click', 'create-quest-n-click', 'quest-n-click-bridge', 'quest-n-click-connectors'];
const NPM = {
  'quest-n-click': '@quest-n-click/engine',
  'create-quest-n-click': '@quest-n-click/create',
  'quest-n-click-bridge': '@quest-n-click/bridge',
  'quest-n-click-connectors': '@quest-n-click/connectors',
};
const FORMER = ['web-scumm', 'create-web-scumm', 'web-scumm-bridge', 'web-scumm-connectors', 'web-scumm-studio-server'];
let tarballs = flag('tarballs');
if (!tarballs) {
  tarballs = join(base, 'pack');
  node(
    'pack this checkout (no --tarballs: a local try, not a candidate)',
    [join(ROOT, 'scripts', 'pack.mjs'), `--out=${tarballs}`],
    ROOT,
  );
}
tarballs = resolve(tarballs);
// The archives copied beside the consumer first: the candidate's lie under the checkout (`candidate-pack/`), and npm
// writes the path it installed from into package.json, which would name the checkout (second reading of 4.1.18 PR 3).
const archives = join(base, 'archives');
mkdirSync(archives, { recursive: true });
for (const n of NAMES) {
  const from = join(tarballs, `${n}-${version}.tgz`);
  if (existsSync(from)) copyFileSync(from, join(archives, `${n}-${version}.tgz`));
}
const tgz = Object.fromEntries(NAMES.map((n) => [n, join(archives, `${n}-${version}.tgz`)]));
for (const [n, f] of Object.entries(tgz)) if (!existsSync(f)) throw new Error(`${f}: no ${n} archive of ${version}`);
for (const n of FORMER)
  if (existsSync(join(tarballs, `${n}-${version}.tgz`))) fail(`${n}-${version}.tgz: the former name's alias is packed`);

console.log('\n▶ the archives, read');
for (const [n, f] of Object.entries(tgz)) {
  const dir = unpack(f, join(base, `inspect-${n}`));
  const pkg = json(join(dir, 'package.json'));
  if (pkg.name !== NPM[n]) fail(`${n}: its package.json says ${pkg.name}, not ${NPM[n]}`);
  if (pkg.publishConfig?.access !== 'public') fail(`${n}: no publishConfig.access public (a scoped package, D53)`);
  if (!pkg.repository?.url || !pkg.engines?.node)
    fail(`${n}: no repository or no engines (a provenance publish needs them)`);
  if (pkg.version !== version) fail(`${n}: version ${pkg.version}, not ${version}`);
  if (!pkg.license) fail(`${n}: no licence`);
  for (const [bin, target] of Object.entries(typeof pkg.bin === 'string' ? { [n]: pkg.bin } : (pkg.bin ?? {}))) {
    if (!existsSync(join(dir, target))) fail(`${n}: its binary ${bin} (${target}) is not in the archive`);
    if (bin.includes('web-scumm')) fail(`${n}: still names the former command ${bin}`);
  }
  for (const [k, target] of Object.entries(pkg.exports ?? {}))
    if (typeof target === 'string' && !target.includes('*') && !existsSync(join(dir, target)))
      fail(`${n}: its export ${k} (${target}) is not in the archive`);
  for (const [d, spec] of Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies }))
    if (/^(file|link|portal|workspace):/.test(String(spec))) fail(`${n}: depends on ${d} through ${spec}`);
  for (const leak of leaksIn(dir)) if (leak.includes('names the checkout')) fail(`${n}: ${leak}`);
  if (n === 'quest-n-click') bundleRead(dir);
}
if (!failed)
  console.log(`✔  ${NAMES.length} archives of ${version}: names, version, licence, binaries, exports, dependencies`);

// ---------------------------------------------------------------- a game of the older release, moved to this one
const src = upgradeSource(flag('from') ?? '4.1.17', existsSync);
let oldTgz;
if (src.kind === 'tgz') oldTgz = resolve(src.path);
else {
  if (src.kind === 'previous') throw new Error("--from=previous is upgrade-check's; name a version here");
  oldTgz = join(base, src.asset);
  const url = `https://github.com/Quest-n-Click/quest-n-click/releases/download/${src.tag}/${src.asset}`;
  console.log(`\n▶ the older engine: ${url}`);
  // Tried again on a 5xx (4.1.20 PR 3): a 504 from GitHub's releases failed candidate 38236552662 on two runners.
  const r = await fetchRetry(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  // Checked against the release's own sums (4.1.19): a stable tag and a pre-release alike.
  const sumsUrl = `https://github.com/Quest-n-Click/quest-n-click/releases/download/${src.tag}/${sumsAsset(src.tag)}`;
  const s = await fetchRetry(sumsUrl);
  if (!s.ok) throw new Error(`${sumsUrl}: ${s.status}`);
  const want = sumFor(await s.text(), src.asset);
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== want) throw new Error(`${src.asset}: SHA-256 ${got}, the release says ${want}`);
  const known = KNOWN_ENGINES[src.tag];
  if (known && got !== known) throw new Error(`${src.asset}: SHA-256 ${got}, this script knows ${known}`);
  console.log(`  ✔ ${src.asset} matches ${src.tag}'s sums (${want.slice(0, 12)}…)`);
  writeFileSync(oldTgz, bytes);
}
const oldPkg = unpack(oldTgz, join(base, 'old-engine'));
const { version: oldVersion, name: oldName } = json(join(oldPkg, 'package.json'));
node(
  `create on ${oldVersion}`,
  [join(oldPkg, 'cli', 'create.mjs'), 'keeper', 'The Keeper', `--engine=file:${oldTgz}`],
  base,
);
const game = join(base, 'keeper');
run('install', 'npm', ['install'], game);
run(`assets on ${oldVersion}`, 'npx', [oldName, 'assets'], game);
run(`verify on ${oldVersion}`, 'npx', [oldName, 'verify'], game);
const LAYOUTS =
  "const layouts = Object.fromEntries(readdirSync('game/layout').map((f) => [f.replace('.json', ''), JSON.parse(readFileSync('game/layout/' + f, 'utf8'))]));";
writeFileSync(
  join(game, 'make-save.ts'),
  `import { Engine, FakePresenter, MemoryStore, saveEnvelope, solve } from '${oldName}/testing';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { game } from './game/game';
${LAYOUTS}
const r = await solve(game, layouts, { mode: 'witness' });
const e = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
await e.newGame();
const half = r.steps.slice(0, Math.max(1, Math.floor(r.steps.length / 2)));
for (const s of half as { act?: { verb: string; a: string; b?: string } }[]) if (s.act) await e.act(s.act);
writeFileSync('old-save.json', JSON.stringify(saveEnvelope(game, e.state)));
console.log('saved after', half.length, 'of', r.steps.length, 'steps in', e.state.room);
`,
);
run(`a save made by ${oldVersion}`, 'npx', ['tsx', '--tsconfig', 'tsconfig.json', 'make-save.ts'], game);

// The engine's name as the older release packed it (D47): `web-scumm` up to 4.2.4, `quest-n-click` up to 4.5.1 (D53).
// The candidate has no alias of either: its author uninstalls the old package, installs the new one, and `migrate`
// renames the rest.
if (oldName !== NPM['quest-n-click']) run(`uninstall ${oldName}`, 'npm', ['uninstall', oldName], game);
run(`the candidate over it (${version})`, 'npm', ['install', tgz['quest-n-click']], game);
const dep = json(join(game, 'package.json')).dependencies?.[NPM['quest-n-click']] ?? '';
if (!dep.includes(`quest-n-click-${version}.tgz`))
  fail(`the project depends on ${NPM['quest-n-click']} through ${dep}, not the candidate's archive`);
run('migrate', 'npx', ['quest-n-click', 'migrate'], game);
run('migrate --check', 'npx', ['quest-n-click', 'migrate', '--check'], game);
for (const f of ['package.json', 'tsconfig.json', 'make-save.ts', 'game/game.ts', 'game/index.ts'])
  if (/web-scumm(?=[/ "])|(['"]|node_modules\/)quest-n-click\//.test(readFileSync(join(game, f), 'utf8')))
    fail(`${f}: still names web-scumm or the unscoped quest-n-click after migrate`);
run(`assets on ${version}`, 'npx', ['quest-n-click', 'assets'], game);
run(`verify on ${version}`, 'npx', ['quest-n-click', 'verify'], game);
run(`build on ${version}`, 'npx', ['quest-n-click', 'build'], game);
if (!existsSync(join(game, 'dist', 'index.html'))) fail('the build has no index.html');
writeFileSync(
  join(game, 'play.ts'),
  `import { Engine, FakePresenter, MemoryStore, parseSave, solve } from '@quest-n-click/engine/testing';
import { readdirSync, readFileSync } from 'node:fs';
import { game } from './game/game';
${LAYOUTS}
// The old save, loaded by this engine, still reaches the ending; and a new game is played to it, step by step.
const old = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
await old.load(parseSave(game, JSON.parse(readFileSync('old-save.json', 'utf8'))));
const fromOld = await solve(game, layouts, { mode: 'witness', start: { state: old.state } });
if (fromOld.status !== 'solved') { console.error('the old save no longer reaches the ending:', fromOld.status); process.exit(1); }
const route = await solve(game, layouts, { mode: 'witness' });
if (route.status !== 'solved') { console.error('a new game has no way to the ending:', route.status); process.exit(1); }
const e = new Engine(game, layouts, new FakePresenter(), new MemoryStore());
await e.newGame();
for (const s of route.steps as { act?: { verb: string; a: string; b?: string } }[]) if (s.act) await e.act(s.act);
const end = await solve(game, layouts, { mode: 'witness', start: { state: e.state } });
if (end.status !== 'solved' || end.steps.length !== 0) { console.error('the route played did not end the game:', end.status, end.steps.length); process.exit(1); }
console.log('the old save reaches the ending in', fromOld.steps.length, 'steps; a new game played to its end in', route.steps.length);
`,
);
run(
  `the ${oldVersion} save and a new game, played to the end on ${version}`,
  'npx',
  ['tsx', '--tsconfig', 'tsconfig.json', 'play.ts'],
  game,
);
// The documentation from the installed engine (4.5.0, plan §4.3.4): a real MCP client over stdio, the SDK the engine
// depends on, against `quest-n-click mcp` in this project. read_doc {name} answers one block, the bundle's exact copy
// (in 4.4.0 a created project had nothing to read); search_docs and list_docs are offered and name this version.
writeFileSync(
  join(game, 'mcp-docs.mjs'),
  `import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const engine = 'node_modules/@quest-n-click/engine';
const version = JSON.parse(readFileSync(engine + '/package.json', 'utf8')).version;
const problems = [];
const c = new Client({ name: 'external-consumer', version: '0' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [engine + '/cli/quest-n-click.mjs', 'mcp'], env: process.env, stderr: 'inherit' }));
const names = (await c.listTools()).tools.map((t) => t.name);
for (const t of ['read_doc', 'search_docs', 'list_docs']) if (!names.includes(t)) problems.push('tools/list has no ' + t);
const legacy = await c.callTool({ name: 'read_doc', arguments: { name: 'CONTENT_GUIDE' } });
const copy = readFileSync(engine + '/docs-bundle/legacy/CONTENT_GUIDE.md', 'utf8');
if (legacy.isError || legacy.content.length !== 1 || legacy.content[0].type !== 'text') problems.push('read_doc {name}: not one text block: ' + JSON.stringify(legacy).slice(0, 200));
else if (legacy.content[0].text !== copy) problems.push('read_doc {name}: not the bundle copy of CONTENT_GUIDE');
if (legacy.structuredContent !== undefined) problems.push('read_doc {name}: structured content beside the page (4.4.0 had none)');
const list = await c.callTool({ name: 'list_docs', arguments: {} });
const from = list.structuredContent?.provenance;
if (list.isError || from?.source !== 'bundle' || from?.productVersion !== version) problems.push('list_docs: ' + JSON.stringify(list).slice(0, 200));
const search = await c.callTool({ name: 'search_docs', arguments: { query: 'room' } });
if (search.isError) problems.push('search_docs: ' + search.content[0]?.text);
const byId = await c.callTool({ name: 'read_doc', arguments: { name: 'CONTENT_GUIDE', id: 'create.rooms' } });
if (!byId.isError) problems.push('read_doc with name and id: not refused');
await c.close();
if (problems.length) { console.error(problems.join('\\n')); process.exit(1); }
console.log('MCP from the installed engine: read_doc {name} one block (' + copy.length + ' characters, the bundle copy), list_docs ' + list.structuredContent.total + ' page(s), search_docs answers, provenance ' + version);
`,
);
node('the documentation through MCP, from the installed engine', [join(game, 'mcp-docs.mjs')], game);
for (const leak of leaksIn(game)) fail(leak);

// ---------------------------------------------------------------- create-quest-n-click
for (const [creatorName, engineArchive] of [['create-quest-n-click', 'quest-n-click']]) {
  const engineName = NPM[engineArchive];
  const creator = join(base, creatorName);
  mkdirSync(creator, { recursive: true });
  writeFileSync(join(creator, 'package.json'), '{ "name": "creator", "private": true }\n');
  run(`${creatorName}: install`, 'npm', ['install', tgz[creatorName], tgz[engineArchive]], creator);
  run(
    `${creatorName}: run`,
    'npx',
    [creatorName, 'beacon', 'The Beacon', `--engine=file:${tgz[engineArchive]}`],
    creator,
  );
  if (!existsSync(join(creator, 'beacon', 'game', 'game.ts'))) fail(`${creatorName} made no game`);
  else if (!json(join(creator, 'beacon', 'package.json')).dependencies?.[engineName])
    fail(`${creatorName}: the project does not depend on ${engineName}`);
  for (const leak of leaksIn(join(creator, 'beacon'))) fail(leak);
}

// ---------------------------------------------------------------- the Bridge
const bridgeDir = unpack(tgz['quest-n-click-bridge'], join(base, 'bridge'));
run('bridge: install', 'npm', ['install', '--omit=dev'], bridgeDir);
const BIN = join(bridgeDir, 'bin.mjs');
// The manifest of the game the Bridge serves: the keeper's, with a letter it may answer (an author's data, written here).
const manifest = {
  format: 'web-scumm-reality-manifest',
  schema: 1,
  gameId: 'keeper',
  signals: [
    { id: 'letter.door', source: 'email', availability: 'optional', replay: 'record', once: true },
    { id: 'letter.unclear', source: 'email', availability: 'optional', replay: 'record', once: false },
  ],
  connectors: { email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' } },
};
const manifestFile = join(base, 'reality-manifest.json');
writeFileSync(manifestFile, JSON.stringify(manifest));
const data = join(base, 'bridge-data');
node('bridge: init', [BIN, 'init', `--dir=${data}`, `--manifest=${manifestFile}`, '--no-demo-webhooks'], bridgeDir);
node('bridge: doctor', [BIN, 'doctor', `--dir=${data}`], bridgeDir);
const PORT = 5280 + Math.floor(Math.random() * 400);
async function bridgeUp(store, extra, port = PORT) {
  const s = serve(process.execPath, [BIN, 'serve', `--dir=${data}`, `--port=${port}`, ...extra], bridgeDir);
  try {
    await waitFor(`http://127.0.0.1:${port}/v1/keys`, async (r) => {
      if (s.exited) throw new Error(`the Bridge on ${store} stopped at once (${JSON.stringify(s.exited)})`);
      return r.ok && (await r.text()).includes('"keys"');
    });
    if (s.exited) throw new Error(`the Bridge on ${store} stopped (${JSON.stringify(s.exited)})`);
    console.log(`✔  the Bridge serves its keys on ${store} from the installed package`);
  } catch (e) {
    await s.stop();
    throw e;
  }
  return s;
}
if (process.env.CONSUMER_PG_URL) {
  run('bridge: the Postgres peer', 'npm', ['install', 'pg'], bridgeDir);
  // Its own port, and stopped (its exit awaited) before the SQLite one starts: never one answering for the other.
  const pg = await bridgeUp('Postgres', [`--store=${process.env.CONSUMER_PG_URL}`], PORT + 2);
  await pg.stop();
}
const sqlite = await bridgeUp('SQLite', [`--store=sqlite:${join(data, 'bridge.sqlite')}`]);

// ---------------------------------------------------------------- the connectors, and a recorded scenario
try {
  const operator = join(base, 'operator');
  mkdirSync(operator, { recursive: true });
  writeFileSync(join(operator, 'package.json'), '{ "name": "operator", "private": true }\n');
  run(
    'connectors: install',
    'npm',
    ['install', '--omit=optional', '--ignore-scripts', tgz['quest-n-click-connectors']],
    operator,
  );
  const help = run('quest-n-click-connector --help', 'npx', ['quest-n-click-connector', '--help'], operator, {
    capture: true,
  });
  if (!help.includes('usage: quest-n-click-connector')) fail('quest-n-click-connector --help says no usage');
  // The former command (D47) went in 4.3.0: npm links no `web-scumm-connector`.
  if (readdirSync(join(operator, 'node_modules', '.bin')).some((b) => b.startsWith('web-scumm')))
    fail('the connectors still install a web-scumm-… command');
  for (const id of ['email', 'telnet', 'ssh', 'open-badge']) {
    const r = spawnSync(WIN ? 'npx.cmd' : 'npx', ['quest-n-click-connector', id], {
      cwd: operator,
      env: ENV,
      shell: WIN,
      encoding: 'utf8',
    });
    if (r.status !== 2 || !`${r.stdout}${r.stderr}`.includes('--config'))
      fail(`quest-n-click-connector ${id} without --config: exit ${r.status}`);
  }
  const token = node(
    'bridge: grant the email connector',
    [
      BIN,
      'grant',
      `--dir=${data}`,
      '--connector=keeper-mail',
      '--source=email',
      '--signals=letter.door,letter.unclear',
      '--pair',
    ],
    bridgeDir,
    { capture: true },
  ).trim();
  writeFileSync(join(operator, 'email.token'), token, { mode: 0o600 });
  const secret = randomBytes(24).toString('hex');
  writeFileSync(join(operator, 'webhook.secret'), secret, { mode: 0o600 });
  const HOOK = PORT + 1;
  writeFileSync(
    join(operator, 'email.json'),
    JSON.stringify({
      bridge: { url: `http://127.0.0.1:${PORT}/`, tokenFile: 'email.token' },
      gameId: 'keeper',
      manifestFile: manifestFile,
      email: { mode: 'webhook', webhook: { port: HOOK, secretFile: 'webhook.secret' } },
    }),
  );
  // Its bin by node, not through npx: a signal then reaches the connector itself, not npm.
  const connector = serve(
    process.execPath,
    [join(operator, 'node_modules', '@quest-n-click', 'connectors', 'bin.mjs'), 'email', '--config', 'email.json'],
    operator,
  );
  try {
    // What a player does: the game asks the Bridge for a pairing code, the player mails it, then answers the letter.
    const pairing = await (
      await fetch(`http://127.0.0.1:${PORT}/v1/pairings`, {
        method: 'POST',
        body: JSON.stringify({ gameId: 'keeper' }),
      })
    ).json();
    const mail = (subject, text) =>
      Buffer.from(
        [
          'From: player@keeper.example',
          'To: gate@keeper.example',
          `Message-ID: <${randomBytes(8).toString('hex')}@keeper.example>`,
          `Subject: ${subject}`,
          'Content-Type: text/plain; charset=utf-8',
          '',
          text,
          '',
        ].join('\r\n'),
      );
    const post = (eml, sig = true) => {
      const ts = String(Math.floor(Date.now() / 1000));
      const mac = createHmac('sha256', sig ? secret : 'not-the-secret')
        .update(`${ts}.`)
        .update(eml)
        .digest('hex');
      return fetch(`http://127.0.0.1:${HOOK}/v1/inbound`, {
        method: 'POST',
        headers: { 'x-web-scumm-timestamp': ts, 'x-web-scumm-signature': `sha256=${mac}` },
        body: eml,
      });
    };
    const said = async (r) => `${r.status} ${JSON.stringify(await r.json().catch(() => null))}`;
    await waitFor(
      `http://127.0.0.1:${HOOK}/v1/inbound`,
      (r) => r.status === 404 || r.status === 405 || r.status === 401,
    );
    const letter = mail('the gate', 'Please open the door.');
    const steps = [
      ['the pairing code mailed', await said(await post(mail(pairing.code ?? 'none', 'my code'))), /^202 .*paired/],
      ['the letter answered', await said(await post(letter)), /^202 .*accepted/],
      ['the same letter again', await said(await post(letter)), /^200 .*duplicate/],
      ['a forged signature', await said(await post(letter, false)), /^401 /],
    ];
    for (const [what, got, want] of steps) if (!want.test(got)) fail(`${what}: ${got}`);
    if (steps.every(([, got, want]) => want.test(got)))
      console.log(
        '✔  paired by a code from the Bridge, a letter accepted, the same one a duplicate, a forged one refused',
      );
  } finally {
    await connector.stop();
  }
} finally {
  await sqlite.stop();
}

if (failed) {
  console.error(`\n✖  external consumer: ${failed} problem(s) (folder kept: ${base})`);
  process.exit(1);
}
if (!args.includes('--keep') && !flag('dir')) rmSync(base, { recursive: true, force: true });
console.log(
  `\n✔  external consumer (${process.platform}, Node ${process.versions.node}): the ${NAMES.length} ${version} archives installed outside the repository; a ${oldVersion} game moved to ${version} by uninstall, install and migrate, its save and a new game played to the end; the Bridge and a connector scenario from their archives`,
);
