// Before the topology (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): every image pinned, the candidate's
// Bridge archive and image, the two tenants made by the package's own `init` and `grant`, tenant a's leaderboard, its
// worker, quota, moderator and daily challenge, and the secrets as files.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildContext, IDENTITY } from '../bridge-image.mjs';

export function setup(c) {
  const { ROOT, PROFILE, flag, version, base, step, sh } = c;
  const compose = readFileSync(join(PROFILE, 'compose.yml'), 'utf8');
  const images = [...compose.matchAll(/^\s+image:\s*(\S+)/gm)].map((m) => m[1]).filter((i) => !i.endsWith(':qualify'));
  const from = [...readFileSync(join(PROFILE, 'Dockerfile.bridge'), 'utf8').matchAll(/^FROM\s+(\S+)/gm)].map(
    (m) => m[1],
  );
  step(
    'every image pinned by digest',
    [...images, ...from].every((i) => /@sha256:[0-9a-f]{64}$/.test(i)),
    {
      images: [...images, ...from],
    },
  );
  let tarballs = flag('tarballs');
  if (!tarballs) {
    tarballs = join(base, 'pack');
    sh(process.execPath, [join(ROOT, 'scripts', 'pack.mjs'), `--out=${tarballs}`], { stdio: 'inherit' });
  }
  const bridgeTgz = join(resolve(tarballs), `quest-n-click-bridge-${version}.tgz`);
  if (!existsSync(bridgeTgz)) throw new Error(`${bridgeTgz}: no Bridge archive of ${version}`);
  // The image (4.1.19, plan §6.2): the candidate's, loaded and checked by its digests (`--image-from=`, built once by
  // scripts/bridge-image.mjs in the candidate); else built here from the archive and the image's versioned lock.
  const imageFrom = flag('image-from');
  const build = buildContext(bridgeTgz, join(base, 'build'));
  let image = { built: 'here' };
  if (imageFrom) {
    sh(process.execPath, [join(ROOT, 'scripts', 'bridge-image.mjs'), 'load', `--from=${resolve(imageFrom)}`], {
      stdio: 'inherit',
    });
    image = JSON.parse(readFileSync(join(resolve(imageFrom), IDENTITY), 'utf8'));
  }
  step(
    'the Bridge image',
    true,
    imageFrom
      ? { configDigest: image.configDigest, manifestDigest: image.manifestDigest, archiveSha256: image.archiveSha256 }
      : { built: 'from the archive and the versioned lock' },
  );

  // ---------------------------------------------------------------- 2. the tenants, by the package's own commands
  const host = join(base, 'host-bridge');
  mkdirSync(host);
  sh('tar', ['-xzf', bridgeTgz, '-C', host, '--strip-components=1']);
  // The archive's own lock (npm-shrinkwrap.json, 4.1.19): `ci`, nothing resolved.
  sh('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: host });
  const BIN = join(host, 'bin.mjs');
  const manifest = {
    format: 'web-scumm-reality-manifest',
    schema: 1,
    gameId: 'qualify',
    signals: [{ id: 'letter.unclear', source: 'email', availability: 'optional', replay: 'record', once: false }],
    connectors: { email: { answers: [], otherwise: 'letter.unclear' } },
  };
  writeFileSync(join(base, 'manifest.json'), JSON.stringify(manifest));
  const data = join(base, 'data');
  const tokens = {};
  for (const t of ['a', 'b']) {
    sh(process.execPath, [
      BIN,
      'init',
      `--dir=${join(data, t)}`,
      `--tenant=${t}`,
      '--environment=dev',
      `--manifest=${join(base, 'manifest.json')}`,
      '--no-demo-webhooks',
    ]);
    tokens[t] = sh(process.execPath, [
      BIN,
      'grant',
      `--dir=${join(data, t)}`,
      '--connector=qualify',
      '--source=email',
      '--signals=letter.unclear',
      '--pair',
    ]).stdout.trim();
  }
  // Tenant a also keeps a leaderboard (4.1.19, plan §9): the reference game approved by its fingerprint, the speedrun
  // worker from /srv/app (QUALIFY_APP), a shared quota of RUNS_PER_MINUTE submissions, a moderator's token file, and the
  // daily challenge with the reference's published test key.
  const RUNS_PER_MINUTE = 6;
  const fingerprintScript = join(base, 'fingerprint.mts'); // an ES module: its top-level await
  writeFileSync(
    fingerprintScript,
    `const { approvedContext } = await import(${JSON.stringify(join(ROOT, 'tools', 'speedrun', 'package.ts'))});\nconsole.log(JSON.stringify((await approvedContext(process.env.GAME_DIR)).fingerprint));\n`,
  );
  const fingerprint = JSON.parse(
    sh(process.execPath, [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), fingerprintScript], {
      cwd: ROOT,
      env: { ...process.env, GAME_DIR: join(ROOT, 'games', 'reference') },
    })
      .stdout.trim()
      .split('\n')
      .at(-1),
  );
  const moderator = randomBytes(24).toString('hex');
  {
    const dir = join(data, 'a');
    const file = join(dir, 'config.json');
    const daily = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'reference-daily-key.json'), 'utf8'));
    writeFileSync(join(dir, 'daily.jwk'), JSON.stringify(daily.jwk), { mode: 0o600 });
    writeFileSync(join(dir, 'daily.secret'), `${randomBytes(24).toString('hex')}\n`, { mode: 0o600 });
    writeFileSync(join(dir, 'moderation.token'), `${moderator}\n`, { mode: 0o600 });
    const config = JSON.parse(readFileSync(file, 'utf8'));
    config.runs = {
      games: { reference: { dir: '/srv/app/games/reference', fingerprint } },
      // From the checkout's root, as its container profile runs it (tools/speedrun/container.mjs): the Bridge gives a
      // worker no working directory of its own.
      worker: ['sh', '-c', 'cd /srv/app && exec node node_modules/tsx/dist/cli.mjs tools/speedrun/worker.ts'],
      workers: 1,
      perMinute: RUNS_PER_MINUTE,
      adminTokenFile: 'moderation.token',
    };
    config.daily = {
      games: { reference: { daily: 'daily', mystery: 'mystery' } },
      kid: daily.kid,
      keyFile: 'daily.jwk',
      secretFile: 'daily.secret',
    };
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  }
  const envelope = readFileSync(join(ROOT, 'tests', 'fixtures', 'speedrun', 'reference-any.wsrun'), 'utf8');

  const secrets = join(base, 'secrets');
  mkdirSync(secrets, { mode: 0o700 });
  const pw = randomBytes(18).toString('hex');
  // Postgres reads its file as its own user: 0644 inside a folder only the operator can open; the URL stays 0600.
  writeFileSync(join(secrets, 'pg_password'), pw);
  chmodSync(join(secrets, 'pg_password'), 0o644);
  writeFileSync(join(secrets, 'store_url'), `postgres://bridge:${pw}@postgres:5432/bridge`, { mode: 0o600 });
  return {
    tarballs: resolve(tarballs),
    images,
    from,
    imageFrom,
    build,
    image,
    tokens,
    data,
    moderator,
    RUNS_PER_MINUTE,
    envelope,
    secrets,
    pw,
  };
}
