// npm run bridge -- <init|serve|grant|revoke> (quest-n-click bridge …, 4.1.1): a reference Reality Bridge for a game, for
// development and self-hosting (wiki/en/bridge.install-run.md).
//   init [--dir=.cache/bridge] [--audience=bridge.local] [--origin=…] [--manifest=dist/reality-manifest.json]
//        [--no-demo-webhooks] [--demo-days=30]                                                 keys, a config
//   serve [--dir=…] [--port=8787] [--host=127.0.0.1] [--trust-proxy]                         the Bridge over HTTP
//   grant --connector=<id> --source=<s> --signals=a,b [--players=any|p-…,p-…] [--pair] [--days=30]   a connector's token
//   rotate [--keep-days=30]                                                                   a new event-signing key
//   revoke --url=<bridge> (--player=<p-…> | --token=<revocation id>)                         asks the running Bridge
//   doctor [--dir=…]                                                                           reads the store, says what it holds
//   compact [--dir=…] [--retention-days=90]                                                    rewrites the journal (Bridge stopped)
// 4.1.10 (bridge/src/cli-store.ts): migrate --from=jsonl --to=sqlite[:file]|postgres://…, migrate [--schema=N],
//   tenant <export|delete> --tenant=<id>, backup --out=<file>, restore --from=<file> --mode=merge|replace-store; serve --tenants=<dir>,<dir> for
//   several tenants on one store; init --store=sqlite --tenant=<id> --environment=prod|staging|dev --signal-version=2.
// Every secret `init` makes is written under --dir (not committed: .cache/ is ignored), never printed but the paths.
// The Biscuit root's private half goes to `root.key`, read by `grant` only: `serve` never loads it (4.1.2).
import { createHash, createHmac, randomBytes, webcrypto } from 'node:crypto';
import { chmodSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { manifestHash, type RealityManifest } from '../../src/engine/reality/manifest';
import { Bridge, type BridgeConfig, type Limits } from './bridge';
import { biscuitLib } from './biscuit';
import { grantToken } from './policy';
import { LEASE_MS, opt, openStore, storeCommand, storeSpec } from './cli-store';
import { MaintenanceError } from './maintenance';
import { dailyRoutes, SqlDailyStore } from './daily';
import { type ApprovedGame, RunQueue, SqlRunStore } from './runs';
import { SqlLimiter } from './runs-limiter';
import { bridgeServer, type ServeOptions, type WebhookConfig } from './server';
import type { SqlDb } from './store-sql';
import { JsonlBridgeStore } from './store';
import { DEFAULT_TENANT, type RealityStore, StoreBusyError } from './store-async';
import { loadTelemetry, type Telemetry } from './telemetry';

/**
 * What `init` writes to `config.json` (mode 0600): everything `serve` needs. The Biscuit root's private half is in
 * `root.key` beside it (`privateKey` here is a 4.1.1 file: still read by `grant`, never written again).
 */
export interface BridgeFile {
  gameId: string;
  manifest: RealityManifest;
  manifestHash: string;
  audience: string;
  origins: string[];
  biscuitRoot: { privateKey?: string; publicKey: string };
  eventKey: { kid: string; pkcs8: string; raw: string };
  previousKeys: { kid: string; raw: string; notAfter: number }[];
  adminTokenHash: string;
  webhooks: Record<string, WebhookConfig>;
  journal: string;
  /** The store (4.1.10): `jsonl` (absent: the journal above), `sqlite:<file>`, or a URL given by `BRIDGE_STORE` (or `BRIDGE_STORE_FILE`). */
  store?: string;
  /** The tenant this directory configures (4.1.10); absent: `default`. */
  tenantId?: string;
  environment?: 'prod' | 'staging' | 'dev';
  signalVersion?: 1 | 2;
  /** The `Host` names that reach this tenant when one server holds several. */
  hosts?: string[];
  /** Limits other than the defaults (4.1.10: a load test, a busy tenant). */
  limits?: Partial<Limits>;
  /**
   * Speedrun leaderboards (4.1.16; this tenant's own queue): the games and their approved packages,
   * the worker's command (it runs `tools/speedrun/worker.ts` against a package), how many workers. Needs a SQL store.
   */
  runs?: {
    games: Record<string, ApprovedGame>;
    worker: string[];
    workers?: number;
    timeoutMs?: number;
    maxQueued?: number;
    retentionDays?: number;
    /** Submissions a minute per client, every instance together (4.1.17; default 10). */
    perMinute?: number;
    /**
     * The file of the token that moderates this tenant's runs (4.1.17), beside config.json, mode 0600: `serve`
     * refuses to start when it is missing or readable by others. Absent: no moderation route.
     */
    adminTokenFile?: string;
  };
  /**
   * The daily challenge and Mystery seeds (4.1.16): the games and their modes, the signing key's id, the files of its
   * private half (a JWK) and of the days' secret, both 0600 beside this file. Needs a SQL store.
   */
  daily?: {
    games: Record<string, { daily: string; mystery?: string }>;
    kid: string;
    keyFile: string;
    secretFile: string;
    retentionDays?: number;
  };
}

const arg = opt;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** The Biscuit root's private half: `root.key` (4.1.2), else the 4.1.1 configuration's field. */
function rootPrivateKey(dir: string, file: BridgeFile): string {
  const own = resolve(dir, 'root.key');
  if (existsSync(own)) return readFileSync(own, 'utf8').trim();
  if (file.biscuitRoot.privateKey) return file.biscuitRoot.privateKey;
  throw new Error(`${own} is missing: the root key signs connector tokens, and nothing else can`);
}

export async function loadBridge(
  file: BridgeFile,
  dir: string,
  hold: { store?: RealityStore; telemetry?: Telemetry; signalVersion?: 1 | 2 } = {},
): Promise<Bridge> {
  const privateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    Buffer.from(file.eventKey.pkcs8, 'base64url'),
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const tenantId = file.tenantId ?? DEFAULT_TENANT;
  const config: BridgeConfig = {
    tenantId,
    environment: file.environment ?? 'prod',
    // A tenant of a shared deployment signs V2 only (ADR 0010); a single one, V1 unless its configuration says 2.
    signalVersion: hold.signalVersion ?? (tenantId !== DEFAULT_TENANT ? 2 : (file.signalVersion ?? 1)),
    ...(file.hosts ? { hosts: file.hosts } : {}),
    origins: file.origins,
    gameId: file.gameId,
    manifest: file.manifest,
    manifestHash: file.manifestHash,
    audience: file.audience,
    biscuitRootPublicKey: file.biscuitRoot.publicKey,
    eventKey: { kid: file.eventKey.kid, privateKey: privateKey as CryptoKey, raw: file.eventKey.raw },
    previousKeys: file.previousKeys,
    adminTokenHash: file.adminTokenHash,
    policyVersion: '1',
    ...(file.limits ? { limits: file.limits } : {}),
  };
  hold.store ??= await openStore(storeSpec(file, []), dir, file, {
    onRepair: (what) => console.log(JSON.stringify({ event: 'journal.repaired', what })),
  });
  return Bridge.start(config, hold.store, hold.telemetry ? { telemetry: hold.telemetry } : {});
}

/**
 * The moderation token of a tenant's leaderboards (4.1.17): read from its file, which must exist and be readable by
 * its owner only (0600), else `serve` stops with why. The token itself is never printed.
 */
function moderationToken(dir: string, file: string): string {
  const path = resolve(dir, file);
  if (!existsSync(path)) throw new Error(`runs.adminTokenFile: ${file} does not exist`);
  // One open file, checked then read. Windows has no POSIX mode bits (Node says 0o666): there the folder's ACL decides.
  const fd = openSync(path, 'r');
  let token: string;
  try {
    const mode = fstatSync(fd).mode & 0o777;
    if (process.platform !== 'win32' && mode & 0o077)
      throw new Error(`runs.adminTokenFile: ${file} is open to others (${mode.toString(8)}): chmod 600`);
    token = readFileSync(fd, 'utf8').trim();
  } finally {
    closeSync(fd);
  }
  if (token.length < 32) throw new Error(`runs.adminTokenFile: ${file} holds a token of fewer than 32 characters`);
  return token;
}

export async function main(args: string[], game?: { manifest: RealityManifest | null }): Promise<number> {
  const [cmd] = args;
  const dir = resolve(arg(args, 'dir') ?? '.cache/bridge');
  const cfgFile = resolve(dir, 'config.json');
  const read = (): BridgeFile => JSON.parse(readFileSync(cfgFile, 'utf8')) as BridgeFile;
  if (cmd === 'init') {
    // The game's manifest: from its content (npm run bridge, quest-n-click bridge), or a built game's
    // dist/reality-manifest.json (--manifest=…, the standalone quest-n-click-bridge package).
    const manifestFile = arg(args, 'manifest');
    const manifest = manifestFile
      ? (JSON.parse(readFileSync(resolve(manifestFile), 'utf8')) as RealityManifest)
      : game?.manifest;
    if (!manifest) {
      console.error('✖  the game declares no reality.signals: nothing to bridge');
      return 1;
    }
    if (existsSync(cfgFile) && !args.includes('--force')) {
      console.error(`✖  ${cfgFile} exists (--force replaces it, and every key and token with it)`);
      return 1;
    }
    mkdirSync(dir, { recursive: true });
    const b = await biscuitLib();
    const root = new b.KeyPair(b.SignatureAlgorithm.Ed25519);
    const ev = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const admin = randomBytes(32).toString('base64url');
    const audience = arg(args, 'audience') ?? 'bridge.local';
    const file: BridgeFile = {
      gameId: manifest.gameId,
      manifest,
      manifestHash: await manifestHash(manifest),
      audience,
      origins: (arg(args, 'origin') ?? 'http://127.0.0.1:5173,http://localhost:5173').split(','),
      biscuitRoot: { publicKey: root.getPublicKey().toString() },
      eventKey: {
        kid: `k-${randomBytes(4).toString('hex')}`,
        pkcs8: Buffer.from(await webcrypto.subtle.exportKey('pkcs8', ev.privateKey)).toString('base64url'),
        raw: Buffer.from(await webcrypto.subtle.exportKey('raw', ev.publicKey)).toString('base64url'),
      },
      previousKeys: [],
      adminTokenHash: sha256(admin),
      webhooks: {},
      journal: 'journal.jsonl',
      // 4.1.10: the store (the journal unless --store=sqlite, D20), the tenant, its environment, the signal version.
      ...(arg(args, 'store')
        ? { store: arg(args, 'store') === 'sqlite' ? 'sqlite:bridge.sqlite' : arg(args, 'store') }
        : {}),
      ...(arg(args, 'tenant') ? { tenantId: arg(args, 'tenant') } : {}),
      ...(arg(args, 'environment')
        ? { environment: arg(args, 'environment') as NonNullable<BridgeFile['environment']> }
        : {}),
      ...(arg(args, 'signal-version') === '2' ? { signalVersion: 2 as const } : {}),
      ...(arg(args, 'hosts') ? { hosts: arg(args, 'hosts')!.split(',') } : {}),
    };
    const rootPrivate = root.getPrivateKey().toString();
    // The demonstration webhooks (one per source, every signal of it, any player, may confirm pairings): what makes
    // a development Bridge usable at once, and too wide for one on the Internet, where each connector gets its own
    // `grant`. `--no-demo-webhooks` leaves them out; their tokens live --demo-days (30).
    if (!args.includes('--no-demo-webhooks')) {
      const days = Number(arg(args, 'demo-days') ?? 30);
      const bySource = new Map<string, string[]>();
      for (const s of manifest.signals) bySource.set(s.source, [...(bySource.get(s.source) ?? []), s.id]);
      for (const [source, signals] of bySource)
        file.webhooks[source] = {
          secret: randomBytes(32).toString('base64url'),
          source,
          token: await grantToken(rootPrivate, {
            connector: `webhook-${source}`,
            gameId: manifest.gameId,
            sources: [source],
            signals,
            players: 'any',
            audience,
            pair: true,
            expiresAt: Date.now() + days * 24 * 3_600_000,
            ...(arg(args, 'tenant') ? { tenantId: arg(args, 'tenant') } : {}),
          }),
          map: Object.fromEntries(signals.map((s) => [s.slice(source.length + 1) || s, s])),
        };
    }
    writeFileSync(cfgFile, `${JSON.stringify(file, null, 1)}\n`, { mode: 0o600 });
    writeFileSync(resolve(dir, 'root.key'), `${rootPrivate}\n`, { mode: 0o600 });
    writeFileSync(resolve(dir, 'admin-token'), `${admin}\n`, { mode: 0o600 });
    chmodSync(cfgFile, 0o600);
    console.log(
      `✔  ${cfgFile} (keys, webhook secrets and tokens; mode 600), ${resolve(dir, 'root.key')} (the root key: grant only) and ${resolve(dir, 'admin-token')}`,
    );
    const hooks = Object.keys(file.webhooks);
    console.log(
      hooks.length
        ? `   demonstration webhooks: ${hooks.map((h) => `/v1/hooks/${h}`).join(', ')} (any player, may pair, ${arg(args, 'demo-days') ?? 30} days; on the Internet prefer --no-demo-webhooks and one grant per connector); npm run bridge -- serve`
        : '   no demonstration webhook: grant each connector its token; npm run bridge -- serve',
    );
    return 0;
  }
  if (cmd === 'serve') {
    // One tenant (its directory), or several (`--tenants=a,b`: a directory each) on one shared store (4.1.10).
    const dirs = (arg(args, 'tenants') ?? '')
      .split(',')
      .filter(Boolean)
      .map((d) => resolve(d));
    const tenants = dirs.length ? dirs : [dir];
    const files = tenants.map((d) => JSON.parse(readFileSync(resolve(d, 'config.json'), 'utf8')) as BridgeFile);
    const ids = files.map((f) => f.tenantId ?? DEFAULT_TENANT);
    if (new Set(ids).size !== ids.length) {
      console.error(`✖  two directories configure the same tenant (${ids.join(', ')})`);
      return 1;
    }
    const first = files[0]!;
    const spec = storeSpec(first, args);
    if (files.length > 1 && /^jsonl$/.test(spec)) {
      console.error(
        '✖  several tenants share a SQL store: --store=sqlite:<file>, BRIDGE_STORE=postgres://… or BRIDGE_STORE_FILE',
      );
      return 1;
    }
    const telemetry = await loadTelemetry(process.env, (line) =>
      console.log(JSON.stringify({ event: 'telemetry', what: line })),
    );
    // A serving lease (4.1.20 PR 1c): refused while a restore or a migration down holds the store; renewed while it
    // serves; lost, its writes are held and /readyz fails until it is taken again.
    let served: RealityStore;
    try {
      served = await openStore(spec, tenants[0]!, first, {
        lease: 'serving',
        leaseMs: LEASE_MS.serve,
        onLeaseEvent: (e) => console.log(JSON.stringify(e)),
        onRepair: (what) => console.log(JSON.stringify({ event: 'journal.repaired', what })),
        // A failed poll of the other instances' acceptances (SQLite busy past its wait): said, then tried again.
        onPollError: (e) => console.log(JSON.stringify({ event: 'store.poll.failed', error: String(e) })),
      });
    } catch (e) {
      // Refused by a lease, or by SQLite's write lock while a restore runs: said, not a stack.
      if (e instanceof MaintenanceError || e instanceof StoreBusyError) {
        console.error(`✖  ${e.message}: not serving`);
        return 1;
      }
      throw e;
    }
    const hold: { store?: RealityStore; telemetry?: Telemetry; signalVersion?: 1 | 2 } = {
      store: served,
      telemetry,
      ...(files.length > 1 ? { signalVersion: 2 as const } : {}),
    };
    const bridges: Bridge[] = [];
    for (const [i, f] of files.entries()) bridges.push(await loadBridge(f, tenants[i]!, hold));
    // The leaderboards and the daily challenge (4.1.16): only when a configuration names them, on the SQL store.
    const extra: Pick<ServeOptions, 'runs' | 'daily'> = {};
    const sql = (hold.store as { db?: SqlDb } | undefined)?.db;
    if (files.some((f) => f.runs || f.daily) && !sql) {
      console.error(
        '✖  the leaderboards and the daily challenge keep their records in SQL: --store=sqlite:<file> or postgres',
      );
      return 1;
    }
    // One queue per tenant that configures one: its games, its workers, its queue limit; a tenant without a `runs`
    // section has no `/v1/runs`.
    // A moderation token that cannot be trusted stops the start, said (4.1.17), before anything listens.
    try {
      for (const f of files)
        if (f.runs?.adminTokenFile) moderationToken(tenants[files.indexOf(f)]!, f.runs.adminTokenFile);
    } catch (e) {
      console.error(`✖  ${(e as Error).message}`);
      return 1;
    }
    for (const [i, f] of files.entries())
      if (f.runs && sql)
        (extra.runs ??= {})[ids[i]!] = new RunQueue({
          store: new SqlRunStore(sql),
          tenant: ids[i]!,
          approved: f.runs.games,
          worker: f.runs.worker,
          ...(f.runs.workers ? { workers: f.runs.workers } : {}),
          ...(f.runs.timeoutMs ? { timeoutMs: f.runs.timeoutMs } : {}),
          ...(f.runs.maxQueued ? { maxQueued: f.runs.maxQueued } : {}),
          ...(f.runs.retentionDays ? { retentionDays: f.runs.retentionDays } : {}),
          ...(f.runs.adminTokenFile ? { adminToken: moderationToken(tenants[i]!, f.runs.adminTokenFile) } : {}),
          // One quota for every instance (4.1.17): the buckets in the store's database, the client keyed by an HMAC
          // whose secret every instance of the tenant derives from its event key (its id is the key's version: a
          // rotated key resets the quota, said in REALITY-OPS).
          limiter: new SqlLimiter(sql, {
            perMinute: f.runs.perMinute ?? 10,
            // A derivation label from web-scumm, kept so existing deployments derive the same secret (D47).
            secret: createHmac('sha256', f.eventKey.pkcs8).update('web-scumm runs quota').digest('hex'),
            keyVersion: f.eventKey.kid,
          }),
        });
    for (const [i, f] of files.entries())
      if (f.daily && sql) {
        const d = f.daily;
        const jwk = JSON.parse(readFileSync(resolve(tenants[i]!, d.keyFile), 'utf8')) as JsonWebKey;
        (extra.daily ??= {})[ids[i]!] = dailyRoutes({
          games: d.games,
          kid: d.kid,
          key: await webcrypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']),
          secret: readFileSync(resolve(tenants[i]!, d.secretFile), 'utf8').trim(),
          store: new SqlDailyStore(sql, ids[i]!),
          ...(d.retentionDays ? { retentionDays: d.retentionDays } : {}),
        });
        // The daily records older than their retention go hourly (the runs' queues purge their own).
        if (extra.daily) {
          const routes = Object.values(extra.daily) as { purge?: () => Promise<number> }[];
          setInterval(() => {
            for (const r of routes)
              r.purge?.().catch((e) => console.log(JSON.stringify({ event: 'daily.purge.failed', error: String(e) })));
          }, 3_600_000).unref();
        }
      }
    const port = Number(arg(args, 'port') ?? 8787);
    const host = arg(args, 'host') ?? '127.0.0.1';
    // `--trust-proxy` alone: the loopback; `--trust-proxy=10.0.0.0/8,192.168.1.2`: those proxies (D20).
    const proxies = args.find((a) => a.startsWith('--trust-proxy='))?.slice('--trust-proxy='.length);
    const server = bridgeServer(bridges, {
      origins: first.origins,
      webhooks: Object.assign({}, ...files.map((f) => f.webhooks)),
      trustProxy: proxies ? proxies.split(',') : args.includes('--trust-proxy'),
      tenantHeader: args.includes('--tenant-header'),
      ...extra,
    });
    server.listen(port, host, () => {
      const a = server.address();
      const at = typeof a === 'object' && a ? a.port : port;
      console.log(
        JSON.stringify({
          event: 'bridge.listening',
          url: `http://${host}:${at}/`,
          game: first.gameId,
          tenants: ids.join(','),
          store: hold.store?.kind,
          pid: process.pid,
        }),
      );
    });
    // A stop (Ctrl-C, systemd) closes the server and releases the journal's lock (4.1.8): the next start finds no
    // lock to take over, and a lock left behind really means a crash.
    return await new Promise<number>((done) => {
      let stopping = false;
      const onInt = () => stop('SIGINT');
      const onTerm = () => stop('SIGTERM');
      const stop = (sig: string) => {
        if (stopping) return;
        stopping = true;
        process.off('SIGINT', onInt);
        process.off('SIGTERM', onTerm);
        console.log(JSON.stringify({ event: 'bridge.stopping', signal: sig }));
        // The open streams are ended (their heartbeats stop with them), then the server closes; the lock goes last,
        // once nothing of this process can still write the journal. A second signal, or five seconds, ends anyway.
        server.closeAllConnections();
        for (const b of bridges) b.close();
        // The store closes once, whichever comes first: the server closed, or five seconds.
        let closing = false;
        const closeStore = () => {
          if (closing) return;
          closing = true;
          void (hold.store?.close() ?? Promise.resolve()).catch(() => {}).finally(() => done(0));
        };
        server.close(closeStore);
        setTimeout(closeStore, 5000).unref();
      };
      process.on('SIGINT', onInt);
      process.on('SIGTERM', onTerm);
    });
  }
  if (cmd === 'grant') {
    const file = read();
    const players = arg(args, 'players') ?? 'any';
    const token = await grantToken(rootPrivateKey(dir, file), {
      connector: arg(args, 'connector') ?? 'connector',
      gameId: file.gameId,
      sources: [arg(args, 'source') ?? ''],
      signals: (arg(args, 'signals') ?? '').split(',').filter(Boolean),
      players: players === 'any' ? 'any' : players.split(','),
      audience: file.audience,
      pair: args.includes('--pair'),
      expiresAt: Date.now() + Number(arg(args, 'days') ?? 30) * 24 * 3_600_000,
      ...(file.tenantId ? { tenantId: file.tenantId } : {}),
    });
    process.stdout.write(`${token}\n`);
    return 0;
  }
  if (cmd === 'rotate') {
    // A new event key. The Bridge signs again, under its current key, every signal still waiting for a player, and
    // a player whose keyring is older asks for the keys once; the previous key stays listed for --keep-days for a
    // player that received a signal just before the rotation. Restart the Bridge to use it.
    const file = read();
    const ev = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const notAfter = Date.now() + Number(arg(args, 'keep-days') ?? 30) * 24 * 3_600_000;
    file.previousKeys = [...file.previousKeys, { kid: file.eventKey.kid, raw: file.eventKey.raw, notAfter }];
    file.eventKey = {
      kid: `k-${randomBytes(4).toString('hex')}`,
      pkcs8: Buffer.from(await webcrypto.subtle.exportKey('pkcs8', ev.privateKey)).toString('base64url'),
      raw: Buffer.from(await webcrypto.subtle.exportKey('raw', ev.publicKey)).toString('base64url'),
    };
    writeFileSync(cfgFile, `${JSON.stringify(file, null, 1)}\n`, { mode: 0o600 });
    console.log(
      `✔  new event key ${file.eventKey.kid}; the previous one trusted until ${new Date(notAfter).toISOString()} (restart the Bridge)`,
    );
    return 0;
  }
  if (['doctor', 'compact', 'migrate', 'tenant', 'backup', 'restore'].includes(cmd ?? '')) {
    const file = read();
    const done = await storeCommand(cmd!, args, dir, file, (f) =>
      writeFileSync(cfgFile, `${JSON.stringify(f, null, 1)}\n`, { mode: 0o600 }),
    );
    if (done !== undefined) return done;
  }
  if (cmd === 'compact') {
    // Rewrites the journal without what nobody needs any more (wiki/en/bridge.install-run.md): the Bridge must be stopped,
    // as a running one appends to the file this command replaces.
    const file = read();
    // `compact` rewrites the journal: it takes the journal's lock (4.1.8) and refuses while a Bridge holds it.
    const store = new JsonlBridgeStore(resolve(dir, file.journal), { onRepair: (what) => console.log(`⚠  ${what}`) });
    const days = Number(arg(args, 'retention-days') ?? 90);
    const r = store.compact({ retentionMs: days * 24 * 3_600_000 });
    console.log(
      `✔  journal compacted: ${r.before} → ${r.after} lines (signals acknowledged and older than ${days} days dropped)`,
    );
    return 0;
  }
  if (cmd === 'revoke') {
    const url = arg(args, 'url') ?? 'http://127.0.0.1:8787/';
    const admin = readFileSync(resolve(dir, 'admin-token'), 'utf8').trim();
    const r = await fetch(new URL('v1/admin/revoke', url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: arg(args, 'player'), tokenId: arg(args, 'token') }),
    });
    console.log(r.ok ? '✔  revoked' : `✖  ${r.status} ${await r.text()}`);
    return r.ok ? 0 : 1;
  }
  console.error(
    'usage: quest-n-click-bridge <init|serve|grant|rotate|revoke|doctor|compact|migrate|tenant|backup|restore> (bridge/src/cli.ts)',
  );
  return 2;
}
