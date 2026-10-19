// studio-server <command> --config <file> (4.2.1, plan §4 and §7 row 4):
//   serve          the Studio Server: the API, the probes, the service lease
//   import <dir>   a game folder becomes the instance's project (the journal adopts it; hosted: its files go to the blobs)
//   export <dir>   the game at the head, written to a folder, with a manifest of the hashes and the revision
//   invite --email <e> --role <owner|dev|reviewer>   a one-time invitation link (the first owner comes this way)
//   login --server <url>, token --server <url>       the CLI's device flow, and its current access token
//   deps           its own dependencies (OpenID Connect, JWT, Postgres): the version and folder each resolves to
//   backup <file>  the project's tables, one snapshot, with the blobs they name (4.2.2, ops/backup.ts)
//   backup --to-bucket [--keep n]   the same, to the bucket's `backups/`, the n most recent kept (4.2.3, a cron's)
//   restore <file> [--replay]   a backup into an empty hosted project, then (--replay) the journal shipped since
//   replay         a restore's replay resumed (after it stopped), then the restore ended
//   gc [--delete]  the blobs no row names (older than a day) and the worker's old staging: listed, or deleted
// Secrets come from `<NAME>_FILE` or the environment (config.ts) and leave `process.env` before anything else runs.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqliteDb } from '../../../bridge/src/store-sqlite';
import type { SqlDb } from '../../../bridge/src/store-sql';
import { createStudio, operationContext } from '../ops/core';
import { anchorsOf, Comments } from './comments';
import { GitSync } from './git';
import { mcpEndpoint, type McpEndpoint } from './mcp';
import { StudioError } from '../ops/errors';
import { spansOf } from '../ops/spans';
import { type BlobStore, fsBlobStore } from '../ops/blobs';
import { sha256 } from '../ops/durable';
import { Journal } from '../ops/journal';
import { backupOf, checkBackup, restoreInto } from '../ops/backup';
import { backupToBucket, keepOf } from '../ops/backup-bucket';
import { collect } from '../ops/gc';
import { finishRestore, replaySegments, Shipper } from '../ops/ship';
import { migrate } from '../../../bridge/src/migrations';
import { ConfigError, loadConfig, type StudioServerConfig, takeSecrets, withoutConfig } from './config';
import { accessToken, deviceLogin } from './auth/device';
import { Gate } from './auth/gate';
import { Oidc } from './auth/oidc';
import { authRoutes } from './auth/routes';
import { AuthStore, Sealer } from './auth/store';
import { readJson, send, studioServer } from './http';
import { openPostgresDb } from './postgres';
import { newJobKeys } from '../worker/job';
import { filesOf, packable, packAssets, packCut, packFiles, packSnapshot } from '../worker/snapshot';
import { createAssets } from '../../../tools/studio/assets';
import { HostedAssets } from './hosted-assets';
import { assetsVersion } from '../../../tools/vite/plugins';
import { exclusiveRunner, Leases } from './leases';
import { Presence } from './live';
import { StudioClient } from './client';
import { Play } from './play';
import { HOSTED_SOLVE_MS } from '../ops/diagnose';
import type { SolveData } from '../../../tools/studio/types';
import { PersonalUndo } from '../ops/undo';
import { Builds, PUBLIC_BUILD_PATH } from './builds';
import { PreparedAssets, prepareOn } from './prepared';
import { EngineUpgrade } from './engine-upgrade';
import { Health, judgeBy } from './health';
import { Metrics } from './metrics';
import { Previews } from './previews';
import { remoteExecutor } from './remote-executor';
import { S3, s3BlobStore } from './s3';
import { ServiceLease } from './service-lease';

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

async function openAll(config: StudioServerConfig) {
  const secrets = takeSecrets();
  let db: SqlDb;
  if (config.store.kind === 'postgres') {
    if (!secrets.STUDIO_DATABASE_URL)
      throw new ConfigError('STUDIO_DATABASE_URL (or POSTGRESQL_ADDON_URI) is required');
    db = await openPostgresDb(secrets.STUDIO_DATABASE_URL);
  } else db = await openSqliteDb(resolve(config.store.file!));
  let blobs: BlobStore;
  let s3: S3 | undefined;
  if (config.blobs.kind === 's3') {
    if (!secrets.STUDIO_S3_KEY_ID || !secrets.STUDIO_S3_KEY_SECRET)
      throw new ConfigError('STUDIO_S3_KEY_ID and STUDIO_S3_KEY_SECRET (or the Cellar add-on variables) are required');
    const endpoint = /^https?:\/\//.test(config.blobs.host!) ? config.blobs.host! : `https://${config.blobs.host}`;
    s3 = new S3({
      endpoint,
      bucket: config.blobs.bucket!,
      keyId: secrets.STUDIO_S3_KEY_ID,
      secret: secrets.STUDIO_S3_KEY_SECRET,
    });
    blobs = s3BlobStore(s3);
  } else blobs = fsBlobStore(resolve(config.blobs.dir!));
  const gameDir = resolve(config.workDir, 'game');
  mkdirSync(gameDir, { recursive: true });
  return { db, blobs, gameDir, secrets, s3 };
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  // The CLI's own commands (plan §3.5): no configuration, a server's URL.
  if (cmd === 'login' || cmd === 'token') {
    const server = rest[rest.indexOf('--server') + 1];
    if (rest.indexOf('--server') < 0 || !server) {
      console.error(`usage: studio-server ${cmd} --server <https://studio.example>`);
      return 2;
    }
    if (cmd === 'login') {
      await deviceLogin(server, {
        tell: (url, code) => console.log(`Open ${url} and enter the code ${code}`),
      });
      console.log('logged in');
    } else console.log(await accessToken(server));
    return 0;
  }
  // What the server runs with (4.2.1): its own dependencies as they resolve from here, by version and file (the
  // package's install smoke reads it; a missing one fails here, not at the first login).
  if (cmd === 'deps') {
    const out: Record<string, { version: string; from: string }> = {};
    for (const name of ['openid-client', 'jose', 'pg']) {
      const url = import.meta.resolve(name);
      await import(name);
      let dir = fileURLToPath(url);
      while (
        !existsSync(join(dir, 'package.json')) ||
        JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name !== name
      )
        dir = resolve(dir, '..');
      out[name] = { version: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, from: dir };
    }
    console.log(JSON.stringify(out));
    return 0;
  }
  // The job keys (ADR 0028): the private one is the Studio's secret STUDIO_WORKER_KEY, the public one the worker's
  // WORKER_PUBLIC_KEY. Written to files, the private one 0600; never printed.
  if (cmd === 'worker-keys') {
    const out = resolve(rest[rest.indexOf('--out') + 1] ?? '');
    if (rest.indexOf('--out') < 0 || !existsSync(out)) {
      console.error('usage: studio-server worker-keys --out <existing folder>');
      return 2;
    }
    const k = newJobKeys();
    writeFileSync(join(out, 'studio-worker.key'), k.privatePem, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(out, 'studio-worker.pub'), k.publicPem, { flag: 'wx' });
    console.log(
      `written: ${join(out, 'studio-worker.key')} (0600, the Studio's), ${join(out, 'studio-worker.pub')} (the worker's)`,
    );
    return 0;
  }
  const at = rest.indexOf('--config');
  const inline = at < 0 ? process.env.STUDIO_CONFIG_JSON : undefined;
  const file = at >= 0 ? rest[at + 1] : (process.env.STUDIO_CONFIG ?? (inline ? 'STUDIO_CONFIG_JSON' : undefined));
  if (!cmd || !file) {
    console.error('usage: studio-server <serve|import <dir>|export <dir>> --config <file> (or STUDIO_CONFIG_JSON)');
    return 2;
  }
  const args = withoutConfig(rest);
  const config = loadConfig(file, process.env.STUDIO_CONFIG ? undefined : inline);
  const { db, blobs, gameDir, secrets, s3 } = await openAll(config);
  const hosted = config.store.kind === 'postgres';

  // The bucket as the journal's segments (4.2.2, ops/ship.ts): a hosted instance only.
  const segments = s3
    ? { put: (k: string, b: Buffer) => s3.put(k, b), get: (k: string) => s3.get(k), list: (p: string) => s3.list(p) }
    : undefined;

  if (cmd === 'backup' || cmd === 'restore' || cmd === 'replay' || cmd === 'gc') {
    await migrate(db, { dir: new URL('../../migrations/', import.meta.url) });
    if (cmd === 'backup' && args.includes('--to-bucket')) {
      if (!s3) throw new ConfigError("backup --to-bucket writes to the instance's bucket: blobs.kind is s3");
      const at = args.indexOf('--keep');
      let keep: number | undefined;
      try {
        keep = at < 0 ? undefined : keepOf(args[at + 1]);
      } catch (e) {
        console.error(`backup: ${(e as Error).message}`);
        return 2;
      }
      const b = await backupOf(db);
      const r = await backupToBucket(s3, b, keep);
      console.log(
        JSON.stringify({ event: 'backup', key: r.key, revision: b.revision, digest: b.digest, removed: r.removed }),
      );
      return 0;
    }
    if (cmd === 'backup') {
      const out = args[0] && !args[0].startsWith('--') && resolve(args[0]);
      if (!out || existsSync(out)) {
        console.error('backup: a new file is required (or --to-bucket [--keep n])');
        return 2;
      }
      const b = await backupOf(db);
      writeFileSync(out, `${JSON.stringify(b)}\n`, { mode: 0o600, flag: 'wx' });
      console.log(JSON.stringify({ event: 'backup', revision: b.revision, blobs: b.blobs.length, digest: b.digest }));
      return 0;
    }
    if (cmd === 'restore' || cmd === 'replay') {
      // Hosted only: a local journal adopts its folder as it finds it, which would undo the head restored.
      if (!hosted) throw new ConfigError(`${cmd} restores a hosted project: store.kind is postgres`);
      if ((cmd === 'replay' || args.includes('--replay')) && !segments)
        throw new ConfigError(`${cmd} reads the journal shipped to the bucket: blobs.kind is s3`);
      let restored: Record<string, unknown> = {};
      if (cmd === 'restore') {
        const from = args.find((a) => !a.startsWith('--'));
        if (!from || !existsSync(from)) {
          console.error('restore: a backup file is required');
          return 2;
        }
        const b = checkBackup(JSON.parse(readFileSync(from, 'utf8')));
        const r = await restoreInto(db, blobs, b);
        restored = { rows: r.rows, dropped: r.dropped, backup: b.revision };
      } else {
        const [r] = await db.all("SELECT value FROM studio_meta WHERE key = 'restoring'");
        if (!r) {
          console.error('replay: no restore is under way');
          return 1;
        }
      }
      // A replay that throws leaves the restore under way: `replay` resumes it, and the server will not serve meanwhile.
      const replayed =
        segments && (cmd === 'replay' || args.includes('--replay'))
          ? await replaySegments(db, segments, blobs)
          : undefined;
      await finishRestore(db);
      const [rev] = await db.all("SELECT value FROM studio_meta WHERE key = 'revision'");
      console.log(
        JSON.stringify({
          event: 'restored',
          ...restored,
          revision: Number(rev?.value ?? 0),
          stopped: replayed?.stopped,
        }),
      );
      return 0;
    }
    const r = await collect(db, blobs, {
      delete: args.includes('--delete'),
      staging: s3 ? { list: (p) => s3.list(p), delete: (k) => s3.delete(k) } : undefined,
    });
    console.log(
      JSON.stringify({
        event: args.includes('--delete') ? 'collected' : 'collectable',
        referenced: r.referenced,
        unreferenced: r.unreferenced.length,
        removed: r.removed,
        staging: r.staging,
      }),
    );
    return 0;
  }

  if (cmd === 'import') {
    const from = args[0] && resolve(args[0]);
    if (!from || !existsSync(join(from, 'index.ts'))) {
      console.error('import: a game folder (with its index.ts) is required');
      return 2;
    }
    // The database decides whether the instance already has a project, not its (possibly new) disk.
    const [had] = await db.all('SELECT path FROM studio_files LIMIT 1').catch(() => [] as Record<string, unknown>[]);
    if (had || readdirSync(gameDir).length) {
      console.error('import: this instance already has a project');
      return 1;
    }
    // Copied beside, then renamed into place: a crash during the copy leaves no half game to adopt.
    const staging = `${gameDir}.import-${process.pid}`;
    rmSync(staging, { recursive: true, force: true });
    cpSync(from, staging, { recursive: true });
    rmSync(gameDir, { recursive: true, force: true });
    renameSync(staging, gameDir);
    // Opening adopts the folder as one operation (and, hosted, stores every file in the blobs).
    const j = await Journal.open({ db, blobs, gameDir, hosted });
    console.log(JSON.stringify({ event: 'imported', game: config.game, revision: await j.revision() }));
    // Shipped here, hosted: the adoption is in the bucket before the command ends, no instance needed for it.
    if (segments) await new Shipper({ db, segments, log: (line) => console.log(JSON.stringify(line)) }).ship();
    await j.close();
    return 0;
  }

  const [restoring] = await db.all("SELECT value FROM studio_meta WHERE key = 'restoring'").catch(() => []);
  if (restoring) throw new ConfigError('a restore is under way: end it with `replay` (see STUDIO-SERVER.md)');

  // A shared Studio (OIDC): every write claims the spans of its files, in the transaction of its intent (P2).
  const leases = config.oidc ? new Leases(db) : undefined;
  const journal = await Journal.open({
    db,
    blobs,
    gameDir,
    hosted,
    // A write that names nobody is refused: a route or a job that wrote outside a request would bypass the leases.
    claim: leases
      ? async (q, paths) => {
          const who = operationContext.getStore()?.claimant;
          if (!who) throw new StudioError('a write on a shared Studio says who writes', 500);
          await leases.claimPaths(q, who, paths);
        }
      : undefined,
    precheck: leases
      ? async (paths) => {
          const who = operationContext.getStore()?.claimant;
          if (who) await leases.check(who, spansOf(paths));
        }
      : undefined,
  });

  if (cmd === 'export') {
    const out = args[0] && resolve(args[0]);
    if (!out || (existsSync(out) && readdirSync(out).length)) {
      console.error('export: an empty or new folder is required');
      return 2;
    }
    // One snapshot of the head: the files and the revision the manifest names belong together.
    const head = await db.tx(
      undefined,
      async (q) => ({
        files: (await q.all("SELECT path, blob FROM studio_files WHERE blob <> 'absent' ORDER BY path")).map((r) => ({
          path: String(r.path),
          blob: String(r.blob),
        })),
        revision: Number((await q.all("SELECT value FROM studio_meta WHERE key = 'revision'"))[0]?.value ?? 0),
      }),
      { readOnly: true },
    );
    const files = head.files;
    for (const f of files) {
      const bytes = (await blobs.has(f.blob)) ? await blobs.get(f.blob) : undefined;
      const target = join(out, ...f.path.split('/'));
      mkdirSync(join(target, '..'), { recursive: true });
      // A local journal keeps blobs only for what it wrote: the rest is read from the game folder, checked.
      const data = bytes ?? readFileSync(join(gameDir, ...f.path.split('/')));
      if (sha256(data) !== f.blob) throw new Error(`${f.path}: the content does not match the head`);
      writeFileSync(target, data);
    }
    const manifest = { game: config.game, epoch: await journal.epoch(), revision: head.revision, files };
    writeFileSync(join(out, 'export-manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
    console.log(JSON.stringify({ event: 'exported', revision: manifest.revision, files: files.length }));
    await journal.close();
    return 0;
  }

  if (cmd === 'invite') {
    // A flag's value only when the flag is there (indexOf -1 would read the first argument), and never another flag.
    const value = (flag: string) => {
      const v = args.indexOf(flag) < 0 ? undefined : args[args.indexOf(flag) + 1];
      return v && !v.startsWith('--') ? v : undefined;
    };
    const email = value('--email');
    const role = value('--role');
    if (!email || !['owner', 'dev', 'reviewer'].includes(role ?? '')) {
      console.error('usage: studio-server invite --email <email> --role <owner|dev|reviewer> --config <file>');
      return 2;
    }
    const token = await new AuthStore(db).invite(email, role as 'owner', 'studio-server invite');
    console.log(`${config.publicUrl}/auth/login?invite=${token}`);
    await journal.close();
    return 0;
  }

  if (cmd !== 'serve') {
    console.error(`unknown command: ${cmd}`);
    return 2;
  }
  // Without OIDC the server is the local one: the loopback only.
  if (!config.oidc && !LOOPBACK.has(config.host)) {
    console.error(`serve: ${config.host} is refused without authentication (configure oidc); use 127.0.0.1`);
    return 2;
  }
  // The metrics (4.2.3, H9): with their token only (32 characters at least), else no route.
  if (secrets.STUDIO_METRICS_TOKEN !== undefined && secrets.STUDIO_METRICS_TOKEN.length < 32)
    throw new ConfigError('STUDIO_METRICS_TOKEN: 32 characters at least (openssl rand -base64 32)');
  const metrics = secrets.STUDIO_METRICS_TOKEN ? new Metrics(secrets.STUDIO_METRICS_TOKEN) : undefined;
  metrics?.measureOperations(journal);
  const logLine = (line: Record<string, unknown>) => {
    metrics?.fromLog(line);
    console.log(JSON.stringify(line));
  };
  let auth: Parameters<typeof studioServer>[0]['auth'];
  let mcp: McpEndpoint | undefined;
  let authStore: AuthStore | undefined;
  if (config.oidc) {
    if (!secrets.STUDIO_OIDC_CLIENT_SECRET) throw new ConfigError('STUDIO_OIDC_CLIENT_SECRET is required');
    if (!secrets.STUDIO_SESSION_KEY) throw new ConfigError('STUDIO_SESSION_KEY is required (32 characters or more)');
    const oidc = await Oidc.discover({ ...config.oidc, clientSecret: secrets.STUDIO_OIDC_CLIENT_SECRET });
    const sealer = new Sealer(secrets.STUDIO_SESSION_KEY.split(',').map((k) => k.trim()));
    const store = new AuthStore(db);
    authStore = store;
    const gate = new Gate({
      store,
      oidc,
      sealer,
      publicUrl: config.publicUrl,
      ...(config.sessions?.idleHours ? { idleMs: config.sessions.idleHours * 3_600_000 } : {}),
      ...(config.sessions?.absoluteHours ? { absoluteMs: config.sessions.absoluteHours * 3_600_000 } : {}),
    });
    auth = {
      gate,
      audit: (actor, event, detail) => store.audit(actor, event, detail),
      handle: authRoutes({
        gate,
        store,
        oidc,
        sealer,
        publicUrl: config.publicUrl,
        cliClientId: config.oidc.cliClientId,
        send,
        readJson,
      }),
    };
    // The remote MCP (4.2.3, ADR 0029): behind OIDC only, a Bearer token for this Studio's audience.
    mcp = mcpEndpoint({
      gate,
      publicUrl: config.publicUrl,
      issuer: oidc.issuer,
      game: config.game,
      version: String(JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version),
      log: logLine,
    });
  }
  const lease = new ServiceLease(db);
  /** The folder brought to the head now (set once the server exists): on taking the lease, then every 30 s. */
  let repair: (() => void) | undefined;
  lease.start((held) => {
    console.log(JSON.stringify({ event: held ? 'lease-taken' : 'lease-lost', instance: lease.instance }));
    if (held) repair?.();
  });
  // With OIDC, the game's code runs in the processing worker only (ADR 0028); without, this is the local server.
  let executor: ReturnType<typeof remoteExecutor> | undefined;
  if (config.worker) {
    if (!secrets.STUDIO_WORKER_KEY)
      throw new ConfigError('STUDIO_WORKER_KEY (the Ed25519 key that signs jobs) is required');
    executor = remoteExecutor({
      s3: s3!,
      workerUrl: config.worker.url,
      // A variable cannot always hold line breaks: `\n` written out is read as one.
      privateKeyPem: secrets.STUDIO_WORKER_KEY.replace(/\\n/g, '\n'),
      instance: config.worker.instance,
      metrics,
      at: async () => ({ epoch: await journal.epoch(), rev: await journal.revision() }),
    });
  }
  // A shared Studio's undo is each member's own (4.2.2, G5), kept in the database beside the journal.
  const personalUndo = leases ? new PersonalUndo(db, () => journal.epoch()) : undefined;
  const studio = createStudio({
    gameDir,
    root: resolve(config.workDir),
    journal,
    author: 'studio-server',
    executor,
    personalUndo,
  });
  const presence = leases ? new Presence() : undefined;
  // The project's exclusive lease (`*`) for the member who asks, around a long operation of theirs (prepare, the
  // engine's upgrade, a Git import): leases.ts `exclusiveRunner`.
  const exclusiveLease = leases
    ? exclusiveRunner(leases, () => operationContext.getStore()?.claimant, {
        log: logLine,
      })
    : <T>(fn: () => Promise<T>) => fn();
  // The engine's folder: the built Studio and the prepared assets are found beside it unless configured.
  const engineRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const publicDir = resolve(config.publicDir ?? join(engineRoot, 'public'));
  // The prepared assets (4.2.2 PR 6b, D43): `prepare` on the worker, under the member's exclusive lease; the latest set
  // served before publicDir, written again to the instance's folder at start (its disk is ephemeral).
  // The game's Git repository (4.2.3, H5): owners push and import; its deploy key a secret.
  const gitSync = config.git
    ? new GitSync({
        db,
        blobs,
        gameDir,
        config: config.git,
        workDir: join(config.workDir, 'git'),
        key: secrets.STUDIO_GIT_KEY,
        writeFiles: (what, files) => studio.writeFiles(what, files, { undo: false }),
        exclusive: exclusiveLease,
        noreplyDomain: `users.noreply.${new URL(config.publicUrl).hostname}`,
        log: logLine,
      })
    : undefined;
  const prepared =
    executor && hosted
      ? new PreparedAssets({
          db,
          blobs,
          dir: resolve(config.workDir, '.prepared'),
          snapshot: () =>
            server.exclusive(async () => {
              await journal.reconcile();
              return {
                epoch: await journal.epoch(),
                rev: await journal.revision(),
                bytes: packAssets(filesOf(gameDir)),
              };
            }),
          prepare: prepareOn((bytes, at, game, signal) => executor!.prepare(bytes, at, game, signal), config.game),
          log: logLine,
          currentManifest: () =>
            existsSync(join(gameDir, 'assets.gen.json'))
              ? readFileSync(join(gameDir, 'assets.gen.json'), 'utf8')
              : null,
          writeManifest: async (manifest) => {
            await studio.writeFiles('prepare assets', [{ path: 'assets.gen.json', after: manifest }], { undo: false });
          },
          exclusive: exclusiveLease,
        })
      : undefined;
  void prepared?.start();
  // The Assets tab (4.2.3 PR 7, H8): the listing and the uploads here, the cutting on the worker, under the member's
  // exclusive lease; the prepared set's folder is where the listing looks for what is prepared.
  const hostedAssets = new HostedAssets({
    studio,
    assets: createAssets(studio, {
      publicAssets: () => join(prepared?.folder() ?? publicDir, 'assets'),
      // Hosted: nothing outside the game folder is read for the listing (a sources.json naming other paths).
      confine: hosted,
    }),
    locked: (fn) =>
      server.exclusive(async () => {
        await journal.reconcile();
        return fn();
      }),
    exclusive: exclusiveLease,
    cut: executor
      ? (req, source, ext, signal) =>
          executor!.cut(packCut(gameDir, req.sheetId, source, ext), config.game, req, signal)
      : undefined,
  });
  // The page: configured, else the one the package was built with (web-scumm-studio-server), else this checkout's.
  const clientDir = resolve(
    config.clientDir ?? process.env.WEB_SCUMM_STUDIO_CLIENT ?? join(engineRoot, '.cache', 'studio-client'),
  );
  // The Studio's page (PR 7): required with OIDC, where it is the only way in; optional on the loopback.
  let client: StudioClient | undefined;
  if (existsSync(join(clientDir, 'studio.html')))
    client = new StudioClient({
      clientDir,
      publicDir,
      publicUrl: config.publicUrl,
      playUrl: config.playUrl,
      prepared: () => prepared?.folder() ?? null,
    });
  else if (config.oidc)
    throw new ConfigError(`${clientDir} has no studio.html: build the Studio's page first (npm run studio-client)`);
  // The game's origin (plan §6.1): the revisions' previews, built by the worker, behind a game session (4.2.2 PR 2).
  // The snapshot is packed holding the instance's lock, from the folder repaired to the head first: no write lands
  // between reading the head and packing it, and the folder (a cache) has not drifted from it. The prepared assets are
  // read only on a hosted Studio: their version is computed once, at the first build.
  let version: string | undefined;
  const previews =
    auth && authStore && executor
      ? new Previews({
          db,
          blobs,
          publicDir,
          game: config.game,
          studioOrigin: config.publicUrl,
          snapshot: () =>
            server.exclusive(async () => {
              await journal.reconcile();
              return { epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(gameDir) };
            }),
          build: (bytes, params, at) => executor!.preview(bytes, params, at),
          assetsVersion: () => prepared?.version() ?? (version ??= assetsVersion(join(publicDir, 'assets'))),
          prepared: () => prepared?.folder() ?? null,
          log: logLine,
        })
      : undefined;
  // After each revision, the head's preview (coalesced: a burst builds its last revision only).
  journal.events.on('confirmed', () => void previews?.schedule());
  // The journal shipped to the bucket (G7): after each operation, and at start for what was not shipped yet.
  const shipper = segments ? new Shipper({ db, segments, log: logLine }) : undefined;
  journal.events.on('confirmed', () => void shipper?.ship());
  void shipper?.ship();
  // An operation another process confirmed (the CLI's import, against the same database) emits nothing here: looked
  // for too.
  shipper?.watch();
  // A revision's verdict on the worker: the validator, then the solver from a new game, bounded in time (the health's,
  // and the engine's upgrade's before it writes).
  const judge = executor
    ? judgeBy({
        validate: (bytes, at) => executor!.validateSnapshot(bytes, at),
        solve: (bytes, at) =>
          executor!.diagnoseSnapshot(
            'solve',
            bytes,
            { from: null, maxStates: 20_000, mode: 'witness', timeLimitMs: HOSTED_SOLVE_MS },
            at,
          ) as Promise<SolveData>,
      })
    : undefined;
  // And its health (G3, G4): the verdict by revision, a bisection when the head breaks. Hosted only: there the journal
  // keeps the blobs of every operation, the import's included, which a past revision's files are rebuilt from.
  const health =
    executor && hosted
      ? new Health({
          db,
          journal,
          snapshot: () =>
            server.exclusive(async () => {
              await journal.reconcile();
              return { epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(gameDir) };
            }),
          judge: judge!,
          log: logLine,
        })
      : undefined;
  journal.events.on('confirmed', () => void health?.schedule());
  // The engine's upgrade (4.2.3 PR 8, H6): the owner's, on the worker, under their exclusive lease, judged before it
  // is written as one undoable operation. Hosted only: a local Studio runs `web-scumm migrate` itself.
  const engineUpgrade =
    executor && hosted && judge
      ? new EngineUpgrade({
          snapshot: () =>
            server.exclusive(async () => {
              await journal.reconcile();
              return { epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(gameDir) };
            }),
          migrate: (bytes, at) => executor!.migrate(bytes, at),
          judge,
          write: async (what, files) => {
            await studio.writeFiles(what, files);
            return journal.revision();
          },
          exclusive: exclusiveLease,
          log: logLine,
        })
      : undefined;
  // The published builds (G6): built by the worker, signed with the Studio's job key (the worker's public key checks
  // a manifest), served at /play/<n>/ on the game's origin, without a session if the owner chose so (D42).
  const jobKey = secrets.STUDIO_WORKER_KEY
    ? createPrivateKey(secrets.STUDIO_WORKER_KEY.replace(/\\n/g, '\n'))
    : undefined;
  // Comments (4.2.3, H2), on a shared Studio: what the game names, read once per revision (the IR runs the game).
  // One reading per revision, shared by the requests that wait for it; a game that does not load is remembered as
  // such for that revision (null: no comment said orphan), never as an older revision's set.
  let knownAt: { rev: number; set: Promise<Set<string> | null> } | undefined;
  const comments = config.oidc
    ? new Comments({
        db,
        revision: () => journal.revision(),
        known: async () => {
          const rev = await journal.revision();
          if (knownAt?.rev !== rev)
            knownAt = {
              rev,
              set: studio.ir().then(
                (ir) => anchorsOf(ir, studio.getStoryboard()),
                () => null,
              ),
            };
          return knownAt.set;
        },
      })
    : undefined;
  const builds =
    executor && hosted && jobKey
      ? new Builds({
          db,
          blobs,
          publicDir,
          game: config.game,
          studioOrigin: config.publicUrl,
          assetsVersion: () => prepared?.version() ?? (version ??= assetsVersion(join(publicDir, 'assets'))),
          prepared: () => prepared?.folder() ?? null,
          snapshot: () =>
            server.exclusive(async () => {
              await journal.reconcile();
              return { epoch: await journal.epoch(), rev: await journal.revision(), bytes: packSnapshot(gameDir) };
            }),
          snapshotAt: async (rev) => packFiles(await journal.filesAt(rev, (p) => packable(p))),
          epoch: () => journal.epoch(),
          build: (bytes, params, at) => executor!.preview(bytes, params, at),
          judge: health ? (epoch, rev, bytes) => health.judgeSnapshot(epoch, rev, bytes) : undefined,
          sign: (bytes) => sign(null, bytes, jobKey).toString('base64url'),
          keyId: createHash('sha256')
            .update(createPublicKey(jobKey).export({ type: 'spki', format: 'der' }))
            .digest('hex')
            .slice(0, 16),
        })
      : undefined;
  const play =
    auth && authStore && previews
      ? {
          playUrl: config.playUrl,
          handler: new Play({
            db,
            store: authStore,
            publicUrl: config.publicUrl,
            playUrl: config.playUrl,
            idleMs: auth.gate.idleMs,
            open: config.publicBuilds ? (path) => PUBLIC_BUILD_PATH.test(path) : undefined,
            content: (req, res, url) =>
              builds && /^\/play(\/|$)/.test(url.pathname)
                ? builds.handle(req, res, url)
                : previews.handle(req, res, url),
          }),
        }
      : undefined;
  const server = studioServer({
    studio,
    journal,
    db,
    lease,
    trustProxy: config.trustProxy,
    auth,
    mcp,
    leases,
    presence,
    previews,
    health,
    personalUndo: !!personalUndo,
    builds,
    prepared,
    assets: hostedAssets,
    comments,
    git: gitSync,
    engineUpgrade,
    rpo: shipper ? () => shipper.rpoMs() : undefined,
    play,
    client,
    metrics,
    log: logLine,
  });
  metrics?.gauge('studio_journal_revision', "The journal's head revision.", () => journal.revision());
  metrics?.gauge(
    'studio_service_lease_held',
    'Whether this instance holds the service lease (serves writes): 1 or 0.',
    () => (lease.held ? 1 : 0),
  );
  if (shipper)
    metrics?.gauge(
      'studio_journal_rpo_seconds',
      'The age of the oldest confirmed operation not shipped to the bucket yet (0: all shipped).',
      async () => (await shipper.rpoMs()) / 1000,
    );
  // Hosted: the instance's folder is checked against the head every 30 s and repaired without a restart (plan §4),
  // holding the instance's lock alone: no request reads a folder being repaired.
  // Only the instance that serves the writes: another one (starting beside it during a deploy) would hold the
  // journal's lease and make its writes wait (4.2.3, the reference deployment). Residual: an instance that gave the
  // lease up is no longer repaired, and a read that still reaches it may show a folder behind the head.
  repair = () => {
    if (!hosted || !lease.held) return;
    void server
      .exclusive(() => journal.reconcile())
      .then(
        (r) => {
          if (!(r.written + r.removed)) return;
          console.log(JSON.stringify({ event: 'reconciled', ...r }));
        },
        (e) => logLine({ event: 'reconcile-failed', message: String((e as Error).message) }),
      );
  };
  if (hosted) setInterval(() => repair?.(), 30_000).unref();
  server.on('error', (e) => {
    console.error(JSON.stringify({ event: 'listen-failed', message: (e as Error).message }));
    void lease.release().then(() => process.exit(1));
  });
  server.listen(config.port, config.host, () => {
    console.log(JSON.stringify({ event: 'listening', host: config.host, port: config.port, instance: lease.instance }));
    // The head's preview, unless it was built before this start.
    void previews?.schedule();
    void health?.schedule();
  });
  const stop = async (signal: string) => {
    console.log(JSON.stringify({ event: 'stopping', signal }));
    // New requests refused, the ones running finish (5 s at most), then the lease is given back.
    server.close();
    const drained = new Promise((ok) => server.once('close', ok));
    await Promise.race([drained, new Promise((ok) => setTimeout(ok, 5_000))]);
    server.closeAllConnections?.();
    previews?.close();
    health?.close();
    shipper?.close();
    await journal.close().catch(() => undefined);
    await lease.release();
    setTimeout(() => process.exit(0), 100).unref();
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
  return -1;
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (e) => {
    console.error(e instanceof ConfigError ? `configuration: ${e.message}` : ((e as Error).stack ?? String(e)));
    process.exit(1);
  },
);
