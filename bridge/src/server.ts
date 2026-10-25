// The Bridge over HTTP (4.1.1, wiki/en/bridge.install-run.md): the routes onto `Bridge`, Server-Sent Events, CORS for the
// game's origins, a body limit, and the demonstration webhook (an HMAC-signed request turned into a finite signal by
// its connector's own Biscuit). node:http only. 4.1.10: several tenants on one server (each request resolved to its
// tenant's Bridge before anything is read), `/livez`, `/readyz`, `/healthz`, and `trust-proxy` by allowlist (D20).
// The routes `/v1/*` keep their names: a second version of one would be `/v2/*` beside it.
// 4.1.16: the speedrun leaderboards (`/v1/runs`, runs.ts) and the daily challenge (`/v1/daily`, `/v1/commit`,
// `/v1/reveal/<id>`, daily.ts) are mounted when the options name them, behind the same tenant resolution, CORS, rate
// limits and body limit as every other route.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { inAllowlist } from './allowlist';
import { type Bridge, BridgeError } from './bridge';
import type { DailyRequest, DailyResponse } from './daily';
import { type RunQueue, runsRoute } from './runs';
import { StoreBusyError } from './store-async';

/** An origin as a browser sends it: a scheme, a host, a port. */
const ORIGIN = /^https?:\/\/[\w.-]{1,200}(:\d{1,5})?$/;

/** A webhook: its shared secret, the connector token it proposes with, and the events it turns into signals. */
export interface WebhookConfig {
  secret: string;
  token: string;
  source: string;
  /** The `event` field of a request → a signal of the manifest. Anything else is refused. */
  map: Record<string, string>;
}

export interface ServeOptions {
  /** Origins allowed to call the player's routes (the game's site); none: same origin only. */
  origins?: string[];
  webhooks?: Record<string, WebhookConfig>;
  /** Seconds between SSE heartbeats. */
  heartbeat?: number;
  /**
   * Requests one address may make per minute on the routes that need no token (a code, the keys, the manifest), and
   * authentications it may fail per minute on the others before every request of its is refused for a while.
   */
  perMinutePerIp?: number;
  /**
   * Behind a reverse proxy (D20): the proxies' addresses or IPv4 networks (`10.0.0.0/8`). `X-Forwarded-For` is read
   * only when the connection comes from one of them, and the client is its rightmost address that is not one.
   * `true` (4.1.9's flag) means the loopback only.
   */
  trustProxy?: boolean | string[];
  /** Several tenants (4.1.10): a request without a `Host` one of them names may say its tenant in this header. */
  tenantHeader?: boolean;
  /** Speedrun leaderboards (4.1.16), per tenant id: the queue `/v1/runs` hands that tenant's runs to. */
  runs?: Record<string, RunQueue>;
  /** The daily challenge and Mystery seeds (4.1.16), per tenant id (`default` for one tenant). */
  daily?: Record<string, { handle(req: DailyRequest): Promise<DailyResponse | null> }>;
}

/** The daily challenge's routes: anyone may call them, so they take from the anonymous budget. */
const DAILY = (method: string | undefined, path: string) =>
  (method === 'GET' && path === '/v1/daily') ||
  (method === 'POST' && path === '/v1/commit') ||
  (method === 'GET' && /^\/v1\/reveal\/[\w-]{1,64}$/.test(path));

// Kept here too (4.2.1): `inAllowlist` moved to allowlist.ts, which the engine's package ships for the Studio Server.
export { inAllowlist };
const LOOPBACK = ['127.0.0.1', '::1'];

/** Token buckets per address (4.1.2): one for the routes anyone may call, one for failed authentications. */
class Buckets {
  private b = new Map<string, { tokens: number; at: number }>();
  constructor(private perMinute: number) {}
  private bucket(ip: string, now: number): { tokens: number; at: number } {
    let x = this.b.get(ip);
    if (!x) {
      x = { tokens: this.perMinute, at: now };
      this.b.set(ip, x);
      // The map stays small: addresses idle for two minutes are forgotten once it grows.
      if (this.b.size > 10_000) for (const [k, v] of this.b) if (now - v.at > 120_000) this.b.delete(k);
    }
    x.tokens = Math.min(this.perMinute, x.tokens + ((now - x.at) / 60_000) * this.perMinute);
    x.at = now;
    return x;
  }
  /** Takes a token for this address; false when it has none left this minute. */
  take(ip: string, now = Date.now()): boolean {
    const x = this.bucket(ip, now);
    if (x.tokens < 1) return false;
    x.tokens -= 1;
    return true;
  }
  empty(ip: string, now = Date.now()): boolean {
    return this.bucket(ip, now).tokens < 1;
  }
}

/** The routes anyone may call without a token: a code, its state, the keys, the manifest. */
const ANONYMOUS = (method: string | undefined, path: string) =>
  (method === 'POST' && path === '/v1/pairings') ||
  (method === 'GET' && /^\/v1\/pairings\/[A-Z0-9]{8}$/.test(path)) ||
  (method === 'GET' && (path === '/v1/keys' || path === '/v1/manifest'));

const bearer = (req: IncomingMessage) => /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];

async function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > limit) throw new BridgeError(413, 'size', `a request body is at most ${limit} bytes`);
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}
const json = (b: Buffer): unknown => {
  try {
    return b.length ? JSON.parse(b.toString('utf8')) : {};
  } catch {
    throw new BridgeError(400, 'shape', 'not JSON');
  }
};

/** HMAC-SHA256 of the raw body, as `sha256=<hex>` in `X-Web-Scumm-Signature`, compared in constant time. */
export function webhookSignature(secret: string, raw: Buffer | string): string {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}
function checkSignature(secret: string, raw: Buffer, header: string | string[] | undefined): void {
  const want = Buffer.from(webhookSignature(secret, raw));
  const got = Buffer.from(typeof header === 'string' ? header : '');
  if (got.length !== want.length || !timingSafeEqual(got, want))
    throw new BridgeError(401, 'signature', 'bad webhook signature');
}

export function bridgeServer(bridges: Bridge | Bridge[], o: ServeOptions = {}): Server {
  const all = Array.isArray(bridges) ? bridges : [bridges];
  const origins = new Set([...(o.origins ?? []), ...all.flatMap((b) => b.config.origins ?? [])]);
  const anonymous = new Buckets(o.perMinutePerIp ?? 60);
  const failures = new Buckets(o.perMinutePerIp ?? 60);
  const proxies = o.trustProxy === true ? LOOPBACK : Array.isArray(o.trustProxy) ? o.trustProxy : [];
  const addressOf = (req: IncomingMessage) => {
    const peer = req.socket.remoteAddress ?? 'unknown';
    if (!proxies.length || !inAllowlist(peer, proxies)) return peer;
    const fwd = req.headers['x-forwarded-for'];
    const hops = (Array.isArray(fwd) ? fwd.join(',') : (fwd ?? ''))
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    // From the right: the first hop no trusted proxy added is the client (a client may write anything on the left).
    for (let i = hops.length - 1; i >= 0; i--) if (!inAllowlist(hops[i]!, proxies)) return hops[i]!;
    return peer;
  };
  /** The Bridge of the tenant a request is for: its `Host`, else the header when allowed, else the only one. */
  const tenantOf = (req: IncomingMessage): Bridge => {
    if (all.length === 1) return all[0]!;
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    const byHost = all.find((b) => b.config.hosts?.some((h) => h.toLowerCase() === host));
    if (byHost) return byHost;
    const named = o.tenantHeader ? req.headers['x-web-scumm-tenant'] : undefined;
    const byHeader = typeof named === 'string' ? all.find((b) => b.tenantId === named) : undefined;
    if (byHeader) return byHeader;
    throw new BridgeError(404, 'tenant', 'no tenant here');
  };
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Web-Scumm-Tenant, X-Delete-Token');
      res.setHeader('Access-Control-Allow-Methods', o.runs ? 'GET, POST, DELETE' : 'GET, POST');
      // (The leaderboards' routes take from the anonymous budget below, as the daily challenge's do.)
    }
    res.setHeader('Cache-Control', 'no-store');
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, data === undefined ? {} : { 'Content-Type': 'application/json' });
      res.end(data === undefined ? undefined : JSON.stringify(data));
    };
    const ip = addressOf(req);
    try {
      if (req.method === 'OPTIONS') return send(204);
      const url = new URL(req.url ?? '/', 'http://bridge');
      const path = url.pathname;
      const after = Number(url.searchParams.get('after') ?? 0) || 0;
      let m: RegExpExecArray | null;
      // An address over its minute on the routes anyone may call, or out of failed authentications: refused for a
      // while, before any token is parsed or any store read (docs/dev/THREAT-MODEL.md, flooding).
      if (
        failures.empty(ip) ||
        ((ANONYMOUS(req.method, path) ||
          (o.daily && DAILY(req.method, path)) ||
          (o.runs && (path === '/v1/runs' || path.startsWith('/v1/runs/')))) &&
          !anonymous.take(ip))
      ) {
        res.setHeader('Retry-After', '60');
        throw new BridgeError(429, 'rate', 'too many requests from this address: try again in a minute');
      }
      // Liveness, readiness, health (4.1.10): no token, no rate limit, no tenant's data.
      if (req.method === 'GET' && path === '/livez') return send(200, { status: 'ok' });
      if (req.method === 'GET' && (path === '/readyz' || path === '/healthz')) {
        try {
          const states = await Promise.all(all.map((b) => b.ready()));
          return send(200, {
            status: 'ok',
            ...(path === '/healthz'
              ? {
                  tenants: all.length,
                  store: states[0]?.store,
                  streams: states.reduce((n, x) => n + x.streams, 0),
                  // 4.1.17: the leaderboards' moderations, accepted and refused, every tenant together.
                  ...(o.runs
                    ? {
                        moderation: Object.values(o.runs).reduce(
                          (m, q) => ({
                            accepted: m.accepted + q.moderation.accepted,
                            refused: m.refused + q.moderation.refused,
                          }),
                          { accepted: 0, refused: 0 },
                        ),
                      }
                    : {}),
                }
              : {}),
          });
        } catch {
          return send(503, { status: 'unavailable' });
        }
      }
      const bridge = tenantOf(req);
      const runs = o.runs && Object.hasOwn(o.runs, bridge.tenantId) ? o.runs[bridge.tenantId] : undefined;
      if (runs && (path === '/v1/runs' || path.startsWith('/v1/runs/'))) {
        await runsRoute(
          runs,
          () => bridge.tenantId,
          () => ip,
        )(req, res, path);
        return;
      }
      const daily = o.daily && Object.hasOwn(o.daily, bridge.tenantId) ? o.daily[bridge.tenantId] : undefined;
      if (daily && DAILY(req.method, path)) {
        const r = await daily.handle({
          method: req.method ?? 'GET',
          url: req.url ?? path,
          ...(req.method === 'POST' ? { body: json(await body(req, bridge.limits.bodyBytes)) } : {}),
          client: ip,
        });
        if (r) return send(r.status, r.body);
      }
      if (req.method === 'GET' && path === '/v1/keys') return send(200, { keys: bridge.keys() });
      if (req.method === 'GET' && path === '/v1/manifest')
        return send(200, { manifest: bridge.config.manifest, hash: bridge.config.manifestHash });
      if (req.method === 'POST' && path === '/v1/pairings') {
        const b = json(await body(req, bridge.limits.bodyBytes)) as { gameId?: unknown };
        return send(
          201,
          // The origin the request came from, whenever the browser said one (same origin, a site off the CORS list):
          // a V2 signal names it as its audience, and the player checks it against its own page.
          await bridge.startPairing(String(b.gameId ?? ''), origin && ORIGIN.test(origin) ? origin : undefined),
        );
      }
      if ((m = /^\/v1\/pairings\/([A-Z0-9]{8})$/.exec(path)) && req.method === 'GET')
        return send(200, await bridge.claimPairing(m[1]!));
      if ((m = /^\/v1\/pairings\/([A-Z0-9]{8})\/confirm$/.exec(path)) && req.method === 'POST')
        return send(200, await bridge.confirmPairing(bearer(req) ?? '', m[1]!));
      if (req.method === 'POST' && path === '/v1/signals') {
        const r = await bridge.propose(bearer(req) ?? '', json(await body(req, bridge.limits.bodyBytes)));
        return send(r.duplicate ? 200 : 202, r);
      }
      if (req.method === 'GET' && path === '/v1/signals') {
        // `sequences` (4.1.2) says each signal's sequence, so a reader's cursor follows the Bridge, never a count.
        const xs = await bridge.signals(bearer(req), after);
        return send(200, { signals: xs.map((x) => x.jws), sequences: xs.map((x) => x.sequence) });
      }
      if (req.method === 'POST' && path === '/v1/unlink') {
        await bridge.unlink(bearer(req));
        return send(204);
      }
      if (req.method === 'POST' && path === '/v1/ack') {
        await bridge.ack(
          bearer(req),
          (json(await body(req, bridge.limits.bodyBytes)) as { through?: unknown }).through,
        );
        return send(204);
      }
      if (req.method === 'GET' && path === '/v1/events') {
        // Server-Sent Events: what is already there after the cursor, then each new signal; `id` is the sequence.
        // The stream holds its cursor and reads the store when woken (streams.ts): the backlog and what other
        // instances accept go out in order, once each. What arrives before the headers are written is held.
        const cap = bearer(req);
        const from = Math.max(after, Number(req.headers['last-event-id'] ?? 0) || 0);
        let sending = true;
        const held: [number, string][] = [];
        const event = (seq: number, jws: string) => {
          if (sending) return void held.push([seq, jws]);
          res.write(`id: ${seq}\nevent: signal\ndata: ${jws}\n\n`);
          // A reader that stopped reading: the Bridge keeps nothing for it beyond the buffer; it reconnects from its cursor.
          if (res.writableLength > bridge.limits.streamBufferBytes) res.end();
        };
        const sub = await bridge.subscribe(cap, event, () => res.end(), { after: from });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.flushHeaders();
        sending = false;
        for (const [seq, jws] of held.splice(0)) event(seq, jws);
        void sub.pump();
        const beat = setInterval(
          () => void bridge.streamAlive(cap).then((alive) => (alive ? res.write(': keep-alive\n\n') : res.end())),
          (o.heartbeat ?? 15) * 1000,
        );
        req.on('close', () => {
          clearInterval(beat);
          sub();
        });
        return;
      }
      if (req.method === 'POST' && path === '/v1/admin/revoke') {
        const b = json(await body(req, bridge.limits.bodyBytes)) as { playerId?: string; tokenId?: string };
        await bridge.revoke(bearer(req), b);
        return send(204);
      }
      if ((m = /^\/v1\/admin\/players\/(p-[a-f0-9]{16})$/.exec(path))) {
        if (req.method === 'GET') return send(200, await bridge.exportPlayer(bearer(req), m[1]!));
        if (req.method === 'DELETE') {
          await bridge.forgetPlayer(bearer(req), m[1]!);
          return send(204);
        }
      }
      if ((m = /^\/v1\/hooks\/([\w-]{1,64})$/.exec(path)) && req.method === 'POST') {
        const hook = o.webhooks?.[m[1]!];
        if (!hook) throw new BridgeError(404, 'hook', 'no such webhook');
        const raw = await body(req, bridge.limits.bodyBytes);
        checkSignature(hook.secret, raw, req.headers['x-web-scumm-signature']);
        const b = json(raw) as { playerId?: unknown; event?: unknown; id?: unknown };
        const signal = typeof b.event === 'string' ? hook.map[b.event] : undefined;
        if (!signal) throw new BridgeError(422, 'event', 'this webhook does not know that event');
        if (typeof b.id !== 'string' || !b.id)
          throw new BridgeError(400, 'shape', '`id` names the delivery (deduplication)');
        const r = await bridge.propose(hook.token, {
          playerId: b.playerId,
          signal,
          source: hook.source,
          dedupeKey: `${m[1]}:${b.id}`,
        });
        return send(r.duplicate ? 200 : 202, r);
      }
      send(404, { error: 'not found' });
    } catch (e) {
      if (e instanceof BridgeError) {
        if (e.status === 401 || e.status === 403) failures.take(ip);
        return send(e.status, { error: e.code, message: e.message });
      }
      if (e instanceof StoreBusyError) {
        // Another process holds the store's write lock longer than this request may wait: try again, nothing lost.
        res.setHeader('Retry-After', '1');
        return send(503, { error: 'busy', message: 'the store is busy: try again in a second' });
      }
      console.error(JSON.stringify({ event: 'error', message: e instanceof Error ? e.message : 'unknown' }));
      send(500, { error: 'internal' });
    }
  });
}
