// Backup and restore (4.1.20 PR 3, plan §8.0, split from scripts/ops-qualify.mjs): the topology destroyed with its
// database, brought up empty, restored, compared; then a store made by the published 4.1.17 Bridge read by this one.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sleep } from './steps.mjs';

export async function backupRestore(c) {
  const { PORT, base, step, dc, up, readyCa, insist, signalsOf, tokens, players, full, N } = c;
  const { DAY, dailyRow, dailyBefore, storedDaily, first, again, boardBefore } = c;
  const A = { tenant: 'a' };
  // Backup, the topology destroyed with its database, brought up empty, restore, compared.
  const backup = dc([
    'exec',
    '-T',
    'bridge-1',
    'sh',
    '-c',
    'node /opt/bridge/bin.mjs backup --dir=/srv/bridge/a --out=/tmp/backup.json >&2 && cat /tmp/backup.json',
  ]).stdout;
  // Beside the run's own files, never in the uploaded folder: it holds every tenant's data.
  const backups = join(base, 'backup');
  mkdirSync(backups, { mode: 0o700 });
  writeFileSync(join(backups, 'backup.json'), backup, { mode: 0o600 });
  dc(['down', '-v'], { stdio: 'inherit' });
  // The documented recovery (REALITY-OPS): a new, empty database first, the backup restored into it by a one-off
  // container of the same image, then the instances (started first, they would register their tenants: not empty).
  dc(['up', '-d', '--wait', 'postgres'], { stdio: 'inherit' });
  dc(
    [
      'run',
      '--rm',
      '--no-deps',
      '-T',
      '-v',
      `${backups}:/backup:ro`,
      'bridge-1',
      'restore',
      '--dir=/srv/bridge/a',
      '--from=/backup/backup.json',
      // Into a new, empty database: a merge (4.1.20: the mode is always said).
      '--mode=merge',
    ],
    { stdio: 'inherit' },
  );
  up();
  await readyCa();
  const after = {};
  for (const t of ['a', 'b']) for (const p of players[t]) after[`${t}/${p.id}`] = await signalsOf(t, p.cap);
  step(
    "backup, the topology and its database destroyed, restore: every player's signed signals as before",
    JSON.stringify(after) === JSON.stringify(full) && Object.values(after).every((x) => x?.signals?.length),
    {
      players: Object.keys(after).length,
    },
  );
  // The daily record read in the store before anyone asks for the day again (the token is deterministic: only the
  // restored row says the restore carried it).
  const restoredDaily = dailyRow();
  const boardAfter = await insist(PORT, 'GET', '/v1/runs?game=reference&category=any%25', A);
  const dailyAfter = await insist(PORT + 2, 'GET', `/v1/daily?game=reference&date=${DAY}`, A);
  const runId = again?.id ?? first.json?.id;
  const modAfter = await insist(PORT + 3, 'GET', `/v1/runs/${runId}`, A);
  step(
    'backup and restore: the leaderboard, the daily record and the runs as before',
    JSON.stringify(boardAfter.json) === boardBefore &&
      !!dailyBefore &&
      restoredDaily === storedDaily &&
      dailyAfter.json?.token === dailyBefore &&
      modAfter.json?.verdict === 'valid',
    { board: boardAfter.status, dailyRow: restoredDaily === storedDaily, run: modAfter.status },
  );
  const next = await insist(PORT, 'POST', '/v1/signals', {
    tenant: 'a',
    bearer: tokens.a,
    body: { playerId: players.a[0].id, signal: 'letter.unclear', source: 'email', dedupeKey: 'after-restore' },
  });
  const old = await insist(PORT, 'POST', '/v1/signals', {
    tenant: 'a',
    bearer: tokens.a,
    body: { playerId: players.a[0].id, signal: 'letter.unclear', source: 'email', dedupeKey: `a-${players.a[0].id}-0` },
  });
  step(
    'after the restore a proposal sent before is still a duplicate',
    old.status === 200 && old.json?.duplicate === true,
    {
      status: old.status,
    },
  );
  step(
    'after the restore a new proposal continues the sequence',
    next.status === 202 && next.json?.sequence === N + 1,
    {
      status: next.status,
      sequence: next.json?.sequence,
    },
  );

  // The two modes and the maintenance lease (4.1.20, plan §6.3–6.4, §8.1). While the three Bridges serve, a restore is
  // refused at once and names them (their `serving` leases), whatever its mode; nothing is restored.
  const restore = (mode, extra = []) =>
    dc(
      [
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '-v',
        `${backups}:/backup`,
        'bridge-1',
        'restore',
        '--dir=/srv/bridge/a',
        '--from=/backup/backup-whole.json',
        `--mode=${mode}`,
        ...extra,
      ],
      { allowFail: true },
    );
  const whole = dc([
    'exec',
    '-T',
    'bridge-1',
    'sh',
    '-c',
    'node /opt/bridge/bin.mjs backup --dir=/srv/bridge/a --out=/tmp/backup-whole.json >&2 && cat /tmp/backup-whole.json',
  ]).stdout;
  writeFileSync(join(backups, 'backup-whole.json'), whole, { mode: 0o600 });
  // What the file holds, then one proposal it does not (second reading of 4.1.20 PR 3): a replace-store that deleted
  // nothing, or merged, would leave it; a refused one must leave it too.
  const signalsBefore = {};
  for (const t of ['a', 'b']) for (const p of players[t]) signalsBefore[`${t}/${p.id}`] = await signalsOf(t, p.cap);
  const boardWhole = JSON.stringify((await insist(PORT, 'GET', '/v1/runs?game=reference&category=any%25', A)).json);
  const extraPlayer = players.a[1];
  const extra = await insist(PORT, 'POST', '/v1/signals', {
    tenant: 'a',
    bearer: tokens.a,
    body: { playerId: extraPlayer.id, signal: 'letter.unclear', source: 'email', dedupeKey: 'not-in-the-file' },
  });
  const extraSeq = extra.json?.sequence;
  const holdsExtra = async () => ((await signalsOf('a', extraPlayer.cap))?.sequences ?? []).includes(extraSeq);
  // While the three Bridges serve, replace-store is refused at once, names their leases, writes no safety backup and
  // deletes nothing: the proposal the file does not hold is still there.
  const refused = restore('replace-store', [
    '--yes-replace-store',
    '--safety-out=/backup/safety-refused.json',
    '--lock-timeout=2000',
  ]);
  const said = `${refused.stdout}\n${refused.stderr}`;
  const keptExtra = await holdsExtra();
  step(
    'restore refused at once while the Bridges serve (their leases named), nothing restored',
    extra.status === 202 &&
      refused.status === 1 &&
      /in use/.test(said) &&
      /nothing restored/.test(said) &&
      keptExtra &&
      !existsSync(join(backups, 'safety-refused.json')),
    {
      status: refused.status,
      said: said.trim().split('\n').at(-1)?.slice(0, 200),
      extra: extra.status,
      keptExtra,
    },
  );
  // Then replace-store, the instances stopped (their leases released): the store becomes the file, after a safety
  // backup of what it held, written and read back before anything is deleted. The proposal the file does not hold is
  // gone, every player's signals and the board are the file's, and the safety backup holds that proposal (one signal
  // more than the file).
  dc(['stop', 'bridge-1', 'bridge-2', 'bridge-3']);
  const replaced = restore('replace-store', ['--yes-replace-store', '--safety-out=/backup/safety.json']);
  up();
  await readyCa();
  const signalsAfter = {};
  for (const t of ['a', 'b']) for (const p of players[t]) signalsAfter[`${t}/${p.id}`] = await signalsOf(t, p.cap);
  const boardReplaced = JSON.stringify((await insist(PORT, 'GET', '/v1/runs?game=reference&category=any%25', A)).json);
  let safety = null;
  try {
    safety = JSON.parse(readFileSync(join(backups, 'safety.json'), 'utf8'));
  } catch {
    /* said below */
  }
  const fileSignals = JSON.parse(whole).counts?.signals;
  step(
    'replace-store, the Bridges stopped: the store is the file, after a safety backup of what it held',
    replaced.status === 0 &&
      JSON.stringify(signalsAfter) === JSON.stringify(signalsBefore) &&
      boardReplaced === boardWhole &&
      safety?.format === 'web-scumm-bridge-backup' &&
      typeof fileSignals === 'number' &&
      safety?.counts?.signals === fileSignals + 1,
    {
      status: replaced.status,
      said: `${replaced.stdout}\n${replaced.stderr}`.trim().split('\n').at(-1)?.slice(0, 200),
      signals: JSON.stringify(signalsAfter) === JSON.stringify(signalsBefore),
      board: boardReplaced === boardWhole,
      safety: safety?.format ?? null,
      safetySignals: safety?.counts?.signals ?? null,
      fileSignals: fileSignals ?? null,
    },
  );
  return { backup, backups };
}

export async function oldStore(c) {
  const { SHORT, flag, base, step, sh, dc, sql, env, data, pw, from, backup, backups } = c;
  // ------------------------------------------------ a store made by the published 4.1.17 Bridge (plan §9)
  // Its archive (`--old-bridge=<tgz>` offline, else downloaded with retries), checked against the SHA-256 its release
  // published, installed beside this run (it has no lock: the install of an older release, as an operator made it), run
  // in a one-off container of the same base image on the store's network. The 4.1.17 code itself writes a tenant into
  // a database of its own: its `restore` of a schema 1 backup of tenant a (players, signals, keys); a run is added in
  // its table's shape. This Bridge then reads that store: `doctor` (schema 4, as the 4.1.17 code left it), `migrate`
  // (one step, to schema 5: 4.1.20's maintenance leases) and a `backup` that finds the tenant, its signals and the run
  // (second reading of 4.1.19 PR 5: the 4.1.17 code wrote no data before). `--short` leaves it out.
  if (!SHORT) {
    const OLD_SHA = 'a362ca2bbba48d06593d265ad4d6b01efdbc92d95b7165d988c5c2dffbe33d6f';
    let oldBytes = flag('old-bridge') ? readFileSync(resolve(flag('old-bridge'))) : null;
    for (let i = 1; !oldBytes && i <= 5; i++) {
      try {
        const got = await fetch(
          'https://github.com/Quest-n-Click/quest-n-click/releases/download/v4.1.17/web-scumm-bridge-4.1.17.tgz',
          { signal: AbortSignal.timeout(60_000) },
        );
        if (got.ok) oldBytes = Buffer.from(await got.arrayBuffer());
      } catch {
        /* again */
      }
      if (!oldBytes) await sleep(5000 * i);
    }
    if (!oldBytes) throw new Error('web-scumm-bridge-4.1.17.tgz could not be downloaded (--old-bridge=<tgz> offline)');
    if (createHash('sha256').update(oldBytes).digest('hex') !== OLD_SHA)
      throw new Error('web-scumm-bridge-4.1.17.tgz: not the archive the 4.1.17 release published');
    const oldDir = join(base, 'bridge-4.1.17');
    mkdirSync(oldDir);
    writeFileSync(join(base, 'bridge-4.1.17.tgz'), oldBytes);
    sh('tar', ['-xzf', join(base, 'bridge-4.1.17.tgz'), '-C', oldDir, '--strip-components=1']);
    sh('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: oldDir });
    sh('npm', ['install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', 'pg@8.23.1'], { cwd: oldDir });
    // Tenant a as 4.1.17 reads a backup (schema 1: the tenants only), from this run's own backup of schema 3.
    const tenantA = JSON.parse(backup).payload.tenants.find((x) => x.tenantId === 'a');
    writeFileSync(
      join(backups, 'tenant-a.v1.json'),
      JSON.stringify({
        format: 'web-scumm-bridge-backup',
        schema: 1,
        at: new Date().toISOString(),
        tenants: [tenantA],
      }),
      { mode: 0o600 },
    );
    chmodSync(join(backups, 'tenant-a.v1.json'), 0o644);
    dc(['exec', '-T', 'postgres', 'createdb', '-U', 'bridge', 'bridge4117']);
    const oldUrl = `postgres://bridge:${pw}@postgres:5432/bridge4117`;
    for (let i = 1; i <= 5 && sh('docker', ['pull', '--quiet', from[0]], { allowFail: true }).status !== 0; i++)
      await sleep(15_000 * i);
    const made = sh(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'quest-n-click-qualify_store',
        '--user',
        `${env.QUALIFY_UID}:${env.QUALIFY_GID}`,
        '-v',
        `${oldDir}:/old:ro`,
        '-v',
        `${join(data, 'a')}:/srv/bridge/a:ro`,
        '-v',
        `${backups}:/backup:ro`,
        '--read-only',
        '--tmpfs',
        '/tmp',
        from[0],
        'node',
        '/old/bin.mjs',
        'restore',
        '--dir=/srv/bridge/a',
        `--store=${oldUrl}`,
        '--from=/backup/tenant-a.v1.json',
      ],
      { allowFail: true },
    );
    sql(
      "INSERT INTO runs (tenant_id, id, game_id, category_id, player, submitted_at, status, verdict, trust, ranked, leaderboard_key, run_key, delete_token_hash, envelope) VALUES ('a', 'run_4117', 'reference', 'any%', 'old', 1700000000000, 'done', 'valid', 'replay-valid', '42', 'any%', 'k4117', repeat('0', 64), '')",
      'bridge4117',
    );
    const read = (cmd) =>
      dc(['run', '--rm', '--no-deps', '-T', 'bridge-1', cmd, '--dir=/srv/bridge/a', `--store=${oldUrl}`], {
        allowFail: true,
      });
    const doctor = read('doctor');
    const migrated = read('migrate');
    const copy = dc(
      [
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '--entrypoint',
        'sh',
        'bridge-1',
        '-c',
        `node /opt/bridge/bin.mjs backup --dir=/srv/bridge/a --store=${oldUrl} --out=/tmp/old.json >&2 && cat /tmp/old.json`,
      ],
      { allowFail: true },
    );
    let counts = null;
    try {
      counts = JSON.parse(copy.stdout).counts;
    } catch {
      /* said below */
    }
    step(
      'a store written by the 4.1.17 Bridge read by this one (its tenant, signals and run; schema 4, migrated to 5)',
      made.status === 0 &&
        /schema 4/.test(doctor.stdout + doctor.stderr) &&
        /schema 5 \(5\)/.test(migrated.stdout) &&
        counts?.tenants === 1 &&
        counts?.signals === tenantA.signals.length &&
        counts?.signals > 0 &&
        counts?.runs === 1,
      {
        made: made.status,
        madeSaid: (made.stdout + made.stderr).trim().split('\n').at(-1)?.slice(0, 200),
        migrate: migrated.stdout.trim().slice(0, 80),
        counts,
        expectedSignals: tenantA.signals.length,
      },
    );
  }
}
