// quest-n-click-connector <id> --config <file.json> (4.1.9, wiki/en/bridge.connectors.md): one connector, one process. Reads its
// configuration (the Bridge, the token from a file, the limits, its own section), the game's Reality manifest (a file,
// or the Bridge's `GET /v1/manifest`), starts the connector, serves `/health` and `/metrics` on a local port when asked,
// and stops cleanly on SIGTERM or SIGINT: no new input, what is in flight drained for at most five seconds, exit 0.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import type { RealityManifest } from '../../src/engine/reality/manifest';
import { CONNECTOR_IDS, makeConnector } from './registry';
import { createContext, type ConnectorLimits, DRAIN_MS, within } from './sdk';

export const USAGE = `usage: quest-n-click-connector <${CONNECTOR_IDS.join('|')}> --config <file.json>

  One connector of the world outside, as its own process (https://github.com/Quest-n-Click/quest-n-click/wiki/EN-Bridge-Connectors). The configuration names the Bridge
  ({ "bridge": { "url", "tokenFile" } }), the game ("gameId"), optionally "manifestFile" (else the Bridge's manifest),
  "limits" ({ maxBytes, maxPerMinute, timeoutMs }), "health" ({ "port" }, on 127.0.0.1: /health and /metrics), and a
  section named after the connector. Secrets are read from files, never from the command line.
  SIGTERM or SIGINT stops it: no new input, work in flight drained for at most ${DRAIN_MS / 1000} s.`;

/** The operator's configuration, as read from the JSON file (paths relative to the file's folder). */
export interface RunConfig {
  bridge: { url: string; tokenFile?: string; token?: string };
  gameId: string;
  tenantId?: string;
  manifestFile?: string;
  limits?: Partial<ConnectorLimits>;
  health?: { host?: string; port: number };
  [section: string]: unknown;
}

const arg = (args: string[], name: string) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
};

async function manifestOf(cfg: RunConfig, base: string): Promise<RealityManifest> {
  if (cfg.manifestFile) return JSON.parse(readFileSync(resolve(base, cfg.manifestFile), 'utf8')) as RealityManifest;
  const r = await fetch(new URL('v1/manifest', cfg.bridge.url), { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`the Bridge did not give its manifest (${r.status})`);
  return ((await r.json()) as { manifest: RealityManifest }).manifest;
}

/**
 * Runs a connector until `stop` resolves (by default a SIGTERM or SIGINT). Returns the exit code. `o.stop` and
 * `o.ready` let a test drive it in-process.
 */
export async function main(
  args: string[],
  o: { stop?: Promise<unknown>; ready?: (info: { health?: string }) => void; write?: (l: string) => void } = {},
): Promise<number> {
  const out = o.write ?? ((l: string) => process.stdout.write(`${l}\n`));
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return args.length ? 0 : 2;
  }
  const id = args[0]!;
  if (!CONNECTOR_IDS.includes(id)) {
    console.error(`✖  unknown connector "${id}"\n${USAGE}`);
    return 2;
  }
  const file = arg(args, 'config');
  if (!file) {
    console.error(`✖  --config <file.json> is required\n${USAGE}`);
    return 2;
  }
  const path = resolve(file);
  const base = dirname(path);
  const cfg = JSON.parse(readFileSync(path, 'utf8')) as RunConfig;
  const token = cfg.bridge.tokenFile
    ? readFileSync(resolve(base, cfg.bridge.tokenFile), 'utf8').trim()
    : (cfg.bridge.token ?? '');
  if (typeof token !== 'string') {
    console.error('✖  "bridge.token" must be a string (better: "bridge.tokenFile")');
    return 1;
  }
  if (!token) {
    console.error(
      '✖  no token: "bridge.tokenFile" names the file of the connector Biscuit (quest-n-click-bridge grant)',
    );
    return 1;
  }
  const manifest = await manifestOf(cfg, base);
  if (manifest.gameId !== cfg.gameId) {
    console.error(`✖  the manifest is for ${manifest.gameId}, the configuration for ${cfg.gameId}`);
    return 1;
  }
  const ctx = createContext({
    bridge: { url: cfg.bridge.url, token },
    gameId: cfg.gameId,
    ...(cfg.tenantId ? { tenantId: cfg.tenantId } : {}),
    ...(cfg.limits ? { limits: cfg.limits } : {}),
    manifest,
    connector: id,
    write: out,
  });
  const connector = makeConnector(id, cfg[id] ?? {}, { baseDir: base });
  await connector.start(ctx);
  let health: Server | undefined;
  let healthUrl: string | undefined;
  if (cfg.health) {
    health = createServer(async (req, res) => {
      const send = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
      };
      if (req.method === 'GET' && req.url === '/health') {
        // A health that throws is unhealthy, never an unhandled rejection of this handler.
        const h = await connector
          .health()
          .catch(() => ({ ok: false, detail: 'health failed', since: new Date().toISOString() }));
        return send(h.ok ? 200 : 503, { connector: id, ...h });
      }
      if (req.method === 'GET' && req.url === '/metrics') return send(200, { connector: id, ...ctx.metrics() });
      send(404, { error: 'not found' });
    });
    await new Promise<void>((ok) => health!.listen(cfg.health!.port, cfg.health!.host ?? '127.0.0.1', ok));
    const a = health.address();
    healthUrl = a && typeof a === 'object' ? `http://${cfg.health.host ?? '127.0.0.1'}:${a.port}/` : undefined;
  }
  ctx.log('connector.started', { id, ...(healthUrl ? { healthPort: Number(new URL(healthUrl).port) } : {}) });
  o.ready?.({ ...(healthUrl ? { health: healthUrl } : {}) });
  await (o.stop ??
    new Promise<void>((done) => {
      const onSig = () => {
        process.off('SIGTERM', onSig);
        process.off('SIGINT', onSig);
        done();
      };
      process.on('SIGTERM', onSig);
      process.on('SIGINT', onSig);
    }));
  ctx.log('connector.stopping', { id });
  const drained = await within(connector.stop(), DRAIN_MS);
  ctx.close();
  health?.closeAllConnections();
  await new Promise<void>((ok) => (health ? health.close(() => ok()) : ok()));
  ctx.log('connector.stopped', { id, drained: drained === 'done' });
  return 0;
}
