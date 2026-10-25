// npm run verify:dist [-- --dir=dist] [--json]: every file of the built game, accounted for (3.7.1). The engine's
// code, this game's locked assets (the bytes reviewed), the data files it names, the fonts, the icons and the notices
// under licenses/; anything else (another game's asset, a stray file) fails, and so does a locked file missing.
// `seal <dir>` (vite.config.ts runs it after every build): removes from <dir>/assets the files that are not this
// game's, then writes <dir>/licenses/ (engine and asset licences, credits, third-party notices, assets manifest).
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  assetsManifest,
  initialChunks,
  inventory,
  manifestMatches,
  strayAssets,
  type ManifestEntry,
} from '../src/engine/tools/inventory';
import { GAME, GAME_DIR, PROJECT, ROOT, WORK, loadGameModule } from './game';
import { realityManifest } from '../src/engine/reality/manifest';
import { LOCK, PROVENANCE, readJson, shippedKeys, type Provenance, type ProvenanceLock } from './provenance-files';
import { serverMarkers } from './server-code';

const args = process.argv.slice(2);
const arg = (k: string) =>
  args
    .find((a) => a.startsWith(`--${k}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const seal = args[0] === 'seal';
const dir = resolve(WORK, seal ? (args[1] ?? 'dist') : (arg('dir') ?? 'dist'));

function walk(d: string, out: string[] = []): string[] {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p: string) => relative(dir, p).split('\\').join('/');
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

if (!existsSync(dir)) {
  console.error(`✖  [${GAME}] ${relative(WORK, dir)}: no build (npm run build first)`);
  process.exit(1);
}
const prov = readJson<Provenance>(PROVENANCE) ?? { assets: [] };
const { game } = await loadGameModule();
// A game not locked yet (a new one): its asset graph says what ships, without hashes to compare.
const locked = readJson<ProvenanceLock>(LOCK);
const lock: ProvenanceLock = locked ?? {
  version: 1,
  assets: Object.fromEntries(
    shippedKeys(game).map((k) => [k, { sha256: '', bytes: 0, match: '', licence: '', status: 'placeholder' as const }]),
  ),
};
const data = game.ending?.file ? [game.ending.file.replace(/^\//, '')] : [];
// A game that takes signals from outside ships its manifest (4.1.1): what its Bridge checks proposals against.
const signalsManifest = realityManifest(game);
if (signalsManifest) data.push('reality-manifest.json');
// The site's description with the fingerprint's build parts (4.1.12, `sealBuild` writes it).
data.push('site.json');

/** A package's folder: the project's node_modules first (an installed engine's dependencies are hoisted there). */
const moduleDir = (p: string) =>
  [resolve(WORK, 'node_modules', p), resolve(ROOT, 'node_modules', p), resolve(ROOT, '..', p)].find((d) =>
    existsSync(join(d, 'package.json')),
  ) ?? resolve(ROOT, 'node_modules', p);
const modulesRoot = () => [resolve(WORK, 'node_modules'), resolve(ROOT, 'node_modules')].find(existsSync)!;

/** The packages the bundle took code from (vite.config.ts writes the list during the build), plus the service worker's. */
function bundlePackages(): string[] {
  const listed = readJson<string[]>(resolve(WORK, '.cache', `bundle-packages-${GAME}.json`)) ?? [];
  // The service worker is generated after the bundle (vite-plugin-pwa): its runtime is Workbox's packages.
  const workbox = readdirSync(modulesRoot()).filter(
    (n) =>
      n.startsWith('workbox-') &&
      !/build|cli|webpack|recipes|streams|google-analytics|broadcast|background-sync|navigation-preload/.test(n),
  );
  // And what they depend on: a package's own build may hold its dependencies' code (navmesh holds javascript-astar).
  const all = new Set<string>();
  const add = (p: string) => {
    if (all.has(p) || !existsSync(join(moduleDir(p), 'package.json'))) return;
    all.add(p);
    for (const d of Object.keys(
      readJson<{ dependencies?: Record<string, string> }>(join(moduleDir(p), 'package.json'))?.dependencies ?? {},
    ))
      add(d);
  };
  // The engine itself (an installed @quest-n-click/engine, `quest-n-click` before 4.5.2) is LICENSE; its tools'
  // dependencies never reach the bundle.
  for (const p of [...listed, ...workbox]) if (p !== '@quest-n-click/engine' && p !== 'quest-n-click') add(p);
  return [...all].sort();
}

function licenceText(pkg: string): { version: string; licence: string; text: string } {
  const base = moduleDir(pkg);
  const meta = readJson<{ version?: string; license?: string }>(join(base, 'package.json')) ?? {};
  const file = existsSync(base)
    ? readdirSync(base).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
    : undefined;
  return {
    version: meta.version ?? '?',
    licence: meta.license ?? '?',
    text: file
      ? readFileSync(join(base, file), 'utf8').trim()
      : `(${meta.license ?? 'licence'}: no licence file in the package)`,
  };
}

function credits(): string {
  const lines = [
    `# Credits: ${game.title ?? GAME}`,
    '',
    "Built with quest'n'click (MIT, see LICENSE). Assets of this game, by entry of its provenance (assets-manifest.json lists every file):",
    '',
  ];
  for (const e of prov.assets ?? []) {
    const n = Object.values(lock.assets).filter((l) => l.match === e.match).length;
    if (!n) continue;
    lines.push(
      `- \`${e.match}\` (${n} file${n > 1 ? 's' : ''}): ${e.author ? `${e.author}, ` : ''}${e.licence}. ${e.source}${e.url ? ` <${e.url}>` : ''}`,
    );
  }
  lines.push(
    '',
    'Fonts: Galmuri11 (Lee Minseo), DotGothic16 (Fontworks) and Press Start 2P (CodeMan38), SIL Open Font License 1.1: THIRD_PARTY_NOTICES.txt.',
    '',
  );
  return lines.join('\n');
}

if (seal) {
  const stray = strayAssets(walk(resolve(dir, 'assets')).map(rel), shippedKeys(game));
  for (const p of stray) rmSync(resolve(dir, p));
  // Data files another game names (public/data is shared by the games of the repository).
  if (existsSync(resolve(dir, 'data')))
    for (const p of walk(resolve(dir, 'data')).map(rel)) if (!data.includes(p)) rmSync(resolve(dir, p));
  // Folders left empty (another game's images, data) go too.
  const prune = (d: string): boolean => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory() && prune(p)) rmSync(p, { recursive: true });
    }
    return readdirSync(d).length === 0;
  };
  prune(dir);
  const out = resolve(dir, 'licenses');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'LICENSE'), readFileSync(resolve(ROOT, 'LICENSE')));
  // The game's own LICENSE-ASSETS; in this repository, the sample games'; else one written from the provenance.
  const assetsLicence = [
    resolve(GAME_DIR, 'LICENSE-ASSETS'),
    ...(PROJECT ? [] : [resolve(ROOT, 'LICENSE-ASSETS')]),
  ].find(existsSync);
  const licences = [
    ...new Set(
      Object.values(lock.assets)
        .map((l) => l.licence)
        .filter(Boolean),
    ),
  ];
  writeFileSync(
    join(out, 'LICENSE-ASSETS'),
    assetsLicence
      ? readFileSync(assetsLicence)
      : `The assets of ${game.title ?? GAME} (images, sounds, music, videos) are under the licences their entries name:\n${licences.map((l) => `- ${l}`).join('\n') || '- (none reviewed yet)'}\n\nFile by file, with the author and the source: CREDITS.md and assets-manifest.json. The engine's code is under LICENSE.\n`,
  );
  writeFileSync(join(out, 'CREDITS.md'), credits());
  const pkgs = bundlePackages();
  const notices = [
    `Third-party software and fonts in this build of ${game.title ?? GAME}.`,
    '',
    ...pkgs.flatMap((p) => {
      const l = licenceText(p);
      return ['='.repeat(72), `${p} ${l.version} (${l.licence})`, '='.repeat(72), l.text, ''];
    }),
    '='.repeat(72),
    'Fonts',
    '='.repeat(72),
    readFileSync(resolve(ROOT, 'src/engine/dom/fonts/OFL.txt'), 'utf8'),
  ];
  writeFileSync(join(out, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'));
  if (signalsManifest)
    writeFileSync(resolve(dir, 'reality-manifest.json'), `${JSON.stringify(signalsManifest, null, 1)}\n`);
  writeFileSync(
    join(out, 'assets-manifest.json'),
    JSON.stringify({ game: game.id, assets: assetsManifest(lock, prov.assets ?? []) }, null, 1) + '\n',
  );
  console.log(
    `[${GAME}] sealed ${relative(WORK, dir)}: ${stray.length} file(s) of other games removed, licenses/ written (${pkgs.length} packages)`,
  );
  process.exit(0);
}

const files: Record<string, { sha256: string }> = {};
for (const p of walk(dir)) files[rel(p)] = { sha256: sha(p) };
const r = inventory({ files, lock, data, studio: existsSync(resolve(dir, 'studio.html')) });
const manifest = readJson<{ assets: ManifestEntry[] }>(resolve(dir, 'licenses/assets-manifest.json'));
// The JavaScript of a first visit, gzipped (3.9): held to `assetBudgets.initialJsKB` when the game sets it.
const html = existsSync(resolve(dir, 'index.html')) ? readFileSync(resolve(dir, 'index.html'), 'utf8') : '';
const initial = initialChunks(html, (p) =>
  existsSync(resolve(dir, p)) ? readFileSync(resolve(dir, p), 'utf8') : null,
);
const initialJsKB = Math.round(
  initial.reduce((n, p) => n + gzipSync(readFileSync(resolve(dir, p)), { level: 9 }).length, 0) / 1024,
);
const jsBudget = game.assetBudgets?.initialJsKB;
// No server code in a game (4.1.9, D19): the connectors and the Bridge never ride along in a build.
const serverCode = Object.keys(files)
  .filter((p) => /\.(m?js|html)$/.test(p))
  .flatMap((p) =>
    serverMarkers(readFileSync(resolve(dir, p), 'utf8')).map((m) => `${p}: carries server code ("${m}")`),
  );
const problems = [
  ...serverCode,
  ...(jsBudget !== undefined && initialJsKB > jsBudget
    ? [`first visit's JavaScript: ${initialJsKB} KB gzipped, over initialJsKB ${jsBudget} (${initial.join(', ')})`]
    : []),
  ...r.extra.map((p) => `${p}: not this game's (no lock entry, not code, not a notice)`),
  ...r.missing.map((p) => `${p}: missing`),
  ...r.changed.map((p) => `${p}: not the file reviewed (its hash differs from provenance.lock.json)`),
  ...(manifest && !manifestMatches(manifest.assets, lock)
    ? ['licenses/assets-manifest.json: does not match provenance.lock.json']
    : []),
];
if (args.includes('--json')) console.log(JSON.stringify({ ...r, initialJsKB, problems }));
else {
  console.log(
    `[${GAME}] ${relative(WORK, dir)}: ${Object.keys(files).length} files · ${Object.entries(r.kinds)
      .map(([k, n]) => `${n} ${k}`)
      .join(
        ', ',
      )} · first visit's JavaScript ${initialJsKB} KB gzipped${jsBudget !== undefined ? ` (initialJsKB ${jsBudget})` : ''}`,
  );
  for (const p of problems.slice(0, 40)) console.log('  ✖ ' + p);
  if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
  if (!locked)
    console.log(`  ℹ no provenance.lock.json: the files are not compared to a review (npm run provenance -- --lock)`);
  console.log(
    problems.length
      ? `✖  [${GAME}] the build ships ${problems.length} thing(s) the provenance does not account for`
      : `✔  [${GAME}] every file of the build is accounted for`,
  );
}
process.exit(problems.length ? 1 : 0);
