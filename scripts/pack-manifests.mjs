// The package.json of the two packages whose dependencies are locked (4.1.19, plan §6.1): the Bridge and the
// connectors, written by scripts/pack.mjs and by scripts/locks.mjs from the same function, so a lock is always made for
// the very manifest an archive carries. Their locks are versioned under scripts/locks/ (`npm run locks` makes them from
// the root lock; tests/pack-locks.test.ts holds them to it), copied into each archive as npm-shrinkwrap.json: an
// install of an archive resolves nothing. The qualification image installs from a lock of its own (`image`), the
// Bridge's dependencies and the optional peers it runs with (pg, OpenTelemetry's API), at exact versions.

/** web-scumm-bridge's package.json. */
export const bridgeManifest = (root) => ({
  name: 'web-scumm-bridge',
  version: root.version,
  description:
    'The reference Reality Bridge for web-scumm games: signals from the world outside, signed, delivered at least once.',
  license: 'MIT',
  type: 'module',
  engines: root.engines,
  repository: { type: 'git', url: 'git+https://github.com/wanoo/web-scumm.git' },
  bin: { 'web-scumm-bridge': 'bin.mjs' },
  exports: { './cli': './src/cli.mjs', './package.json': './package.json' },
  dependencies: {
    '@biscuit-auth/biscuit-wasm': root.devDependencies['@biscuit-auth/biscuit-wasm'],
    zod: root.dependencies.zod,
  },
  // Optional (4.1.10): `pg` for the distributed profile (Postgres), OpenTelemetry's API for the measures. npm does not
  // install an optional peer: the `local` profile (SQLite, node:sqlite) needs neither.
  peerDependencies: { pg: root.devDependencies.pg, '@opentelemetry/api': OTEL_API },
  peerDependenciesMeta: { pg: { optional: true }, '@opentelemetry/api': { optional: true } },
});

/** web-scumm-connectors' package.json. */
export const connectorsManifest = (root) => ({
  name: 'web-scumm-connectors',
  version: root.version,
  description:
    'Connectors of the world outside for web-scumm games (email, Telnet, SSH, Open Badges): each its own process, proposing signals to a web-scumm-bridge. Experimental.',
  license: 'MIT',
  type: 'module',
  engines: root.engines,
  repository: { type: 'git', url: 'git+https://github.com/wanoo/web-scumm.git' },
  bin: { 'web-scumm-connector': 'bin.mjs' },
  exports: { './run': './src/run.mjs', './package.json': './package.json' },
  dependencies: { ssh2: root.devDependencies.ssh2 },
});

/**
 * web-scumm-studio-server's package.json (4.2.1, plan §7 row 8): the Studio Server and its processing worker, two
 * commands that run the server of the engine installed beside it (`web-scumm`, the same version: its sources, Vite and
 * tsx), with the Studio's page built in. Its own dependencies (OpenID Connect, JWT, Postgres) are locked; the engine is
 * an optional peer, installed from the same release's archive (it is not on npm, so no lock can name it); the commands
 * check that its version is theirs.
 */
export const studioServerManifest = (root) => ({
  name: 'web-scumm-studio-server',
  version: root.version,
  description:
    'The web-scumm Studio Server: one game, several people, online (OpenID Connect, PostgreSQL, S3), and its processing worker.',
  license: 'MIT',
  type: 'module',
  engines: root.engines,
  repository: { type: 'git', url: 'git+https://github.com/wanoo/web-scumm.git' },
  bin: { 'web-scumm-studio-server': 'bin/server.mjs', 'web-scumm-studio-worker': 'bin/worker.mjs' },
  exports: { './package.json': './package.json' },
  dependencies: {
    'openid-client': root.devDependencies['openid-client'],
    jose: root.devDependencies.jose,
    pg: root.devDependencies.pg,
  },
  // The engine's line (`4.2.x`): the commands refuse to start on another version than their own.
  peerDependencies: { 'web-scumm': root.version.replace(/^(\d+)\.(\d+)\..*$/, '$1.$2.x') },
  peerDependenciesMeta: { 'web-scumm': { optional: true } },
});

/** The range the Bridge accepts for OpenTelemetry's API; the image locks one version of it. */
const OTEL_API = '^1.9.0';

/**
 * The qualification image's dependencies (ops/qualify/Dockerfile.bridge): installed in /opt by `npm ci` from its lock,
 * found by /opt/bridge/src/cli.mjs as a parent folder's node_modules. The Bridge's own, and its peers at the version
 * the lock gives.
 */
export const imageManifest = (root) => ({
  name: 'web-scumm-bridge-image',
  version: root.version,
  private: true,
  license: 'MIT',
  dependencies: {
    ...bridgeManifest(root).dependencies,
    pg: root.devDependencies.pg,
    '@opentelemetry/api': OTEL_API,
  },
});

/** Each locked package: its manifest and the file of its lock. */
export const LOCKED = [
  { name: 'web-scumm-bridge', manifest: bridgeManifest, lock: 'scripts/locks/web-scumm-bridge.json' },
  { name: 'web-scumm-connectors', manifest: connectorsManifest, lock: 'scripts/locks/web-scumm-connectors.json' },
  { name: 'web-scumm-bridge-image', manifest: imageManifest, lock: 'scripts/locks/web-scumm-bridge-image.json' },
  {
    name: 'web-scumm-studio-server',
    manifest: studioServerManifest,
    lock: 'scripts/locks/web-scumm-studio-server.json',
  },
];

/**
 * What is wrong with a lock for a manifest; [] when nothing is: lockfile 3, the same name, the root's dependencies
 * exactly the manifest's, and every package resolved from the npm registry with an integrity (no `file:`, no link, no
 * git, nothing resolved later).
 */
export function lockProblems(lock, manifest) {
  const bad = [];
  if (lock?.lockfileVersion !== 3) return ['not a lockfile of version 3'];
  const top = lock.packages?.[''];
  if (!top) return ['no root package'];
  if (lock.name !== manifest.name || top.name !== manifest.name) bad.push(`named ${lock.name}, not ${manifest.name}`);
  const same = (a = {}, b = {}) =>
    JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  if (!same(top.dependencies, manifest.dependencies))
    bad.push(
      `its dependencies ${JSON.stringify(top.dependencies ?? {})} are not the manifest's ${JSON.stringify(manifest.dependencies ?? {})}`,
    );
  if (!same(top.peerDependencies, manifest.peerDependencies)) bad.push("its peer dependencies are not the manifest's");
  for (const [path, p] of Object.entries(lock.packages)) {
    if (path === '') continue;
    if (p.link) bad.push(`${path}: a link`);
    else if (!/^https:\/\/registry\.npmjs\.org\//.test(p.resolved ?? ''))
      bad.push(`${path}: resolved ${p.resolved ?? 'nowhere'}`);
    else if (!/^sha512-/.test(p.integrity ?? '')) bad.push(`${path}: no sha512 integrity`);
    if (!p.version) bad.push(`${path}: no version`);
  }
  return bad;
}

/** A lock made for this release's manifest: only its name and version are this release's, nothing is resolved. */
export function lockFor(lock, manifest) {
  const out = structuredClone(lock);
  out.name = manifest.name;
  out.version = manifest.version;
  out.packages[''] = { ...out.packages[''], name: manifest.name, version: manifest.version };
  return out;
}
