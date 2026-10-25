// The Studio Server over HTTP (4.2.1, plan §4 and §7 row 4): node:http, the API of the dev server under `/api/`
// (studio-server/src/ops/routes.ts), the journal's cursor (`/api/ops`), three probes, one JSON log line per request
// with its id. Reads and writes of one instance never interleave: a write holds the instance's lock alone, reads
// share it, so a read never sees half of an operation. A write without the service lease is a 503 with Retry-After,
// and the client retries with the same operation id (P6, P8).
//
// With `auth` (4.2.1 PR 5, plan §3): every API route goes through the gate (policy A or B) and the role it needs;
// /auth/* and the owner's routes are auth/routes.ts. Without `auth`, the server is the local one: `serve` then
// refuses any address but the loopback.
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { inAllowlist } from '../../../bridge/src/allowlist';
import type { SqlDb } from '../../../bridge/src/store-sql';
import { operationContext, type Studio } from '../ops/core';
import { isStudioError, StudioError } from '../ops/errors';
import { isSpanName } from '../ops/spans';
import type { Comments } from './comments';
import type { GitSync } from './git';
import { MCP_METADATA_PATHS, type McpEndpoint } from './mcp';
import type { Journal } from '../ops/journal';
import { isBody, routes } from '../ops/routes';
import type { Gate } from './auth/gate';
import type { StudioClient } from './client';
import type { Role } from './auth/store';
import type { Leases } from './leases';
import { LiveHub, type Presence, serveEvents } from './live';
import { forPlay, type Play, playTicketBody } from './play';
import type { Builds } from './builds';
import type { PreparedAssets } from './prepared';
import { type HostedAssets, MAX_UPLOAD_BODY } from './hosted-assets';
import { Jobs } from './jobs';
import { open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { mimeOf } from '../../../tools/studio/assets';
import type { EngineUpgrade } from './engine-upgrade';
import type { Health } from './health';
import type { Metrics } from './metrics';
import type { Previews } from './previews';
import type { ServiceLease } from './service-lease';

const MAX_JSON = 1024 * 1024;

/** The routes that only read, although they are POSTs (a check takes its options in a body). */
const READ_POSTS = /^\/(validate|report|puzzle|coverage|playtests|lint|solve|screenshot)$/;

/** One writer or many readers at a time (plan §4: no read sees two revisions mixed). */
class RwLock {
  private readers = 0;
  private writer = false;
  private queue: (() => void)[] = [];
  private next() {
    while (this.queue.length) {
      const w = this.queue[0]!;
      w();
      if (this.queue[0] === w) break;
    }
  }
  read<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((ok, fail) => {
      const go = () => {
        if (this.writer) return;
        this.queue.shift();
        this.readers++;
        // A handler that throws before its first await still releases the lock.
        Promise.resolve()
          .then(fn)
          .then(ok, fail)
          .finally(() => {
            this.readers--;
            this.next();
          });
        this.next();
      };
      this.queue.push(go);
      this.next();
    });
  }
  write<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((ok, fail) => {
      const go = () => {
        if (this.writer || this.readers) return;
        this.queue.shift();
        this.writer = true;
        Promise.resolve()
          .then(fn)
          .then(ok, fail)
          .finally(() => {
            this.writer = false;
            this.next();
          });
      };
      this.queue.push(go);
      this.next();
    });
  }
}

export interface StudioServerOptions {
  studio: Studio;
  journal: Journal;
  /** The journal's database: the answers of write requests are kept there by operation id. */
  db: SqlDb;
  lease: ServiceLease;
  /** Proxies whose X-Forwarded-For is believed. */
  trustProxy?: string[];
  /** One line per request; the default writes JSON to stdout. */
  log?: (line: Record<string, unknown>) => void;
  /** Requests one address may make per minute on /auth/*, and failed authentications (default 30 each). */
  perMinute?: number;
  /** Authentication (PR 5): the gate, and the routes of /auth/* and of the owner. */
  auth?: {
    gate: Gate;
    handle: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
    /** The audit (an owner's takeover names the previous holder). */
    audit?: (actor: string, event: string, detail: unknown) => Promise<void>;
  };
  /** The remote MCP (4.2.3 PR 5, ADR 0029): `/mcp` and its protected resource's metadata. */
  mcp?: McpEndpoint;
  /** A shared Studio (PR 6, plan P2 and §5): the spans' leases, who is here, the live events. */
  leases?: Leases;
  presence?: Presence;
  /** The revisions' previews (4.2.2 PR 2): their state goes to the live events. */
  previews?: Previews;
  /** The game's health by revision (4.2.2 PR 3): its state goes to the live events; bisections on demand. */
  health?: Health;
  /** The studio keeps each member's own undo (4.2.2 PR 4, ops/undo.ts): undo and redo are served on a shared Studio. */
  personalUndo?: boolean;
  /** How far the journal's shipping is behind (4.2.2 PR 7, ms), given by `/readyz`. */
  rpo?: () => Promise<number>;
  /** The published builds (4.2.2 PR 5): `/api/builds`. */
  builds?: Builds;
  /** The prepared assets (4.2.2 PR 6b): `/api/assets/prepare`, a job since 4.2.3. */
  prepared?: PreparedAssets;
  /** The Assets tab (4.2.3 PR 7, H8): its listing, files, uploads and cutting under `/api/assets`. */
  assets?: HostedAssets;
  /** The long jobs (4.2.3, H8): prepare and cut, their progress on the live stream; one is made if none is given. */
  jobs?: Jobs;
  /** Comments anchored on the game's stable ids (4.2.3, H2). */
  comments?: Comments;
  /** The game's Git repository (4.2.3, H5): its state for a reviewer, a push and an import for an owner. */
  git?: GitSync;
  /** The engine's upgrade of the hosted game (4.2.3 PR 8, H6): `/api/engine/migrate`, the owner's. */
  engineUpgrade?: EngineUpgrade;
  /** The game's origin (plan §6.1): every request whose `Host` is `playUrl`'s goes there, and nothing else does. */
  play?: { handler: Play; playUrl: string };
  /** The Studio's page, its files and the game's images and sounds (PR 7, client.ts). */
  client?: StudioClient;
  /** The metrics (4.2.3, H9): `GET /metrics` behind the secret STUDIO_METRICS_TOKEN; without it, a 404. */
  metrics?: Metrics;
}

function spanList(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length || v.length > 64 || !v.every((x) => typeof x === 'string' && isSpanName(x)))
    throw new StudioError('`spans` is a list of span names (room:<id>, lang:<code>, game, items, …)');
  return v as string[];
}

/** The fences a client sends with a write (`x-studio-fences: {"room:garden": 3}`), or none. */
function fencesOf(req: IncomingMessage): Record<string, number> | undefined {
  const h = req.headers['x-studio-fences'];
  if (typeof h !== 'string' || !h) return undefined;
  let v: unknown;
  try {
    v = JSON.parse(h);
  } catch {
    throw new StudioError('x-studio-fences is a JSON object of span → fence');
  }
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    !Object.entries(v).every(([k, n]) => isSpanName(k) && Number.isInteger(n))
  )
    throw new StudioError('x-studio-fences is a JSON object of span → fence');
  return v as Record<string, number>;
}

/** Requests one address may make per minute on /auth/*, and authentications it may fail per minute. */
class Buckets {
  private b = new Map<string, { tokens: number; at: number }>();
  constructor(private perMinute: number) {}
  take(ip: string, now = Date.now()): boolean {
    let x = this.b.get(ip);
    if (!x) {
      x = { tokens: this.perMinute, at: now };
      this.b.set(ip, x);
      if (this.b.size > 10_000) for (const [k, v] of this.b) if (now - v.at > 120_000) this.b.delete(k);
    }
    x.tokens = Math.min(this.perMinute, x.tokens + ((now - x.at) / 60_000) * this.perMinute);
    x.at = now;
    if (x.tokens < 1) return false;
    x.tokens -= 1;
    return true;
  }
}

/** The role an API route needs (plan §3.3): reading is a reviewer's, writing a dev's. The owner's routes are elsewhere. */
export function roleFor(method: string, sub: string): Role {
  // The heartbeat says who is here: a reviewer is here too.
  if (method === 'POST' && (sub === '/presence' || sub === '/play-ticket')) return 'reviewer';
  // Comments (4.2.3, H2) are a reviewer's too: they write no game file.
  if ((method === 'POST' && sub === '/comments') || (method === 'PUT' && /^\/comments\/[\w-]+$/.test(sub)))
    return 'reviewer';
  return method === 'GET' || (method === 'POST' && READ_POSTS.test(sub)) ? 'reviewer' : 'dev';
}

export function readJson(req: IncomingMessage, max = MAX_JSON): Promise<unknown> {
  return new Promise((ok, fail) => {
    // Said too large before a byte is read, when its length says so.
    if (Number(req.headers['content-length'] ?? 0) > max) {
      req.resume();
      return fail(new StudioError('body too large', 413));
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        // Answered with its 413; the rest of the body is drained, not read (no reset before the answer).
        fail(new StudioError('body too large', 413));
        req.removeAllListeners('data');
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const s = Buffer.concat(chunks).toString('utf8');
      if (!s.trim()) return ok({});
      try {
        ok(JSON.parse(s));
      } catch {
        fail(new StudioError('the body is not valid JSON'));
      }
    });
    req.on('error', fail);
  });
}

export function send(
  res: ServerResponse,
  status: number,
  data: unknown,
  headers: Record<string, string | string[]> = {},
) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

/**
 * A member's file of art/ or audio/ (4.2.3), as it was uploaded: served with its own type, never sniffed nor run by the
 * page that shows it. Opened first: a file gone meanwhile is a 404; one that fails while sent ends its response, never
 * the process.
 */
export async function serveFile(res: ServerResponse, file: string): Promise<void> {
  let fh: Awaited<ReturnType<typeof open>>;
  try {
    fh = await open(file, 'r');
  } catch {
    return send(res, 404, { error: 'no such file' });
  }
  res.writeHead(200, {
    'content-type': mimeOf(file),
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  });
  await pipeline(fh.createReadStream(), res).catch(() => res.destroy());
}

export interface StudioHttpServer extends Server {
  /** Runs `fn` holding the instance's lock alone (no request reads or writes meanwhile): the cache's repair. */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}

export function studioServer(o: StudioServerOptions): StudioHttpServer {
  const table = routes(o.studio);
  const lock = new RwLock();
  const log = o.log ?? ((l) => process.stdout.write(`${JSON.stringify(l)}\n`));
  const proxies = o.trustProxy ?? [];
  const clientOf = (req: IncomingMessage) => {
    const peer = req.socket.remoteAddress ?? 'unknown';
    if (!proxies.length || !inAllowlist(peer, proxies)) return peer;
    const hops = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    for (let i = hops.length - 1; i >= 0; i--) if (!inAllowlist(hops[i]!, proxies)) return hops[i]!;
    return peer;
  };
  let started = false;
  const authCalls = new Buckets(o.perMinute ?? 30);
  const failures = new Buckets(o.perMinute ?? 30);
  const jobs = o.jobs ?? new Jobs();
  // A job's span conflict is a lease conflict too, though its route answered 202.
  jobs.events.on('changed', (j: { state: string; status?: number }) => {
    if (j.state === 'failed') o.metrics?.jobFailed(j.status);
  });
  const hub = new LiveHub({
    jobs,
    journal: o.journal,
    leases: o.leases,
    presence: o.presence,
    previews: o.previews,
    health: o.health,
    log,
  });
  // A member removed, demoted or logged out everywhere: their leases and their presence go at once, so nobody waits
  // on a lease they can no longer release.
  o.auth?.gate.revocations.on('revoked', (ids: string[]) => {
    for (const id of ids) {
      o.presence?.leave(id);
      o.leases?.release(id).catch((e) => log({ event: 'lease-release-failed', message: String((e as Error).message) }));
    }
  });

  const server = createServer(async (req, res) => {
    const id = randomUUID();
    const t0 = performance.now();
    const url = new URL(req.url ?? '/', 'http://studio.invalid');
    const path = url.pathname;
    res.setHeader('x-request-id', id);
    res.on('finish', () => {
      o.metrics?.response(res.statusCode);
      log({
        event: 'request',
        id,
        method: req.method,
        path,
        status: res.statusCode,
        ms: Math.round(performance.now() - t0),
        client: clientOf(req),
      });
    });
    try {
      // The probes: no session, no data.
      if (path === '/livez') return send(res, 200, { ok: true });
      if (path === '/startz') return send(res, started ? 200 : 503, { ok: started });
      if (path === '/readyz')
        return send(res, o.lease.held ? 200 : 503, {
          ok: o.lease.held,
          writes: o.lease.held ? 'served' : 'waiting',
          // The journal's shipping behind the head (4.2.2, G7): measured, never said to be nil when it is not.
          ...(o.rpo ? { rpoMs: await o.rpo().catch(() => null) } : {}),
        });
      const ip = clientOf(req);
      // The game's origin answers its own paths only: no Studio API, no /auth, ever.
      if (o.play && forPlay(req, o.play.playUrl)) return void (await o.play.handler.handle(req, res, url));
      // The metrics (4.2.3, H9): a secret of their own, never the session; none configured, no route.
      if (path === '/metrics') {
        if (!o.metrics || req.method !== 'GET') return send(res, 404, { error: 'not found' });
        if (!o.metrics.authorized(req))
          throw Object.assign(new StudioError('the metrics need their token', 401), {
            headers: { 'www-authenticate': 'Bearer realm="metrics"' },
          });
        return void (await o.metrics.serve(res));
      }
      // The remote MCP (ADR 0029): where its authorization is (RFC 9728), then the endpoint itself.
      if (o.mcp && req.method === 'GET' && MCP_METADATA_PATHS.includes(path)) return send(res, 200, o.mcp.metadata());
      if (o.mcp && path === '/mcp') return void (await o.mcp.handle(req, res, () => readJson(req)));
      // The Studio's page and its files hold no data; the game's images and sounds are a member's.
      if (o.client && (req.method === 'GET' || req.method === 'HEAD')) {
        const kind = o.client.kind(path);
        if (kind === 'page') return o.client.servePage(res);
        if (kind === 'static') return o.client.serveStatic(path, res);
        if (kind === 'public') return o.client.servePublic(path, res);
        if (kind === 'media') {
          const p = o.auth ? await o.auth.gate.authenticate(req) : undefined;
          if (p) o.auth!.gate.require(p, 'reviewer');
          return o.client.serveMedia(path, res);
        }
      }
      if (o.auth && path.startsWith('/auth/') && !authCalls.take(ip))
        return send(res, 429, { error: 'too many requests' }, { 'retry-after': '60' });
      if (o.auth && (path.startsWith('/auth/') || /^\/api\/(members|invitations|audit)(\/|$)/.test(path))) {
        if (await o.auth.handle(req, res, url)) return;
        return send(res, 404, { error: 'not found' });
      }
      if (!path.startsWith('/api/')) return send(res, 404, { error: 'not found' });
      const sub = path.slice('/api'.length);
      // Who asks, and whether they may (plan §3.4 policies A and B, §3.3 roles).
      const principal = o.auth ? await o.auth.gate.authenticate(req) : undefined;
      if (principal) o.auth!.gate.require(principal, roleFor(req.method ?? 'GET', sub));
      // The journal's cursor (P6): what a client that reconnects missed.
      if (req.method === 'GET' && sub === '/revision')
        return send(res, 200, { epoch: await o.journal.epoch(), revision: await o.journal.revision() });
      // A ticket for the game's origin (policy F): a member's browser session only (a Bearer has no session to tie to).
      if (req.method === 'POST' && sub === '/play-ticket') {
        if (!o.play || !principal?.session) throw new StudioError('the game is opened from a browser session', 403);
        const path = playTicketBody(await readJson(req));
        return send(res, 200, { url: await o.play.handler.ticket(principal.user.id, principal.session.idHash, path) });
      }
      // A job (4.2.3, H8): read by a reviewer; cancelled by who started it, or an owner.
      const job = /^\/jobs\/([\w-]{1,64})(\/cancel)?$/.exec(sub);
      if (job) {
        if (req.method === 'GET' && !job[2]) {
          const j = jobs.get(job[1]!);
          if (!j) throw new StudioError(`no job ${job[1]}`, 404);
          return send(res, 200, j);
        }
        if (req.method !== 'POST' || !job[2]) throw new StudioError('not found', 404);
        return send(
          res,
          200,
          jobs.cancel(job[1]!, {
            userId: principal?.user.id ?? 'local',
            owner: !principal || principal.role === 'owner',
          }),
        );
      }
      // The Assets tab (4.2.2 D43, 4.2.3 H8): the prepared runs, the listing, the prompts and the files are a reviewer's;
      // the uploads, the cutting and Prepare a dev's. Prepare and the cutting are jobs, under the member's exclusive lease
      // (it waits for nobody's span: another's is a 423, with their name): answered 202 with the job at once.
      if (sub === '/assets' || sub.startsWith('/assets/')) {
        const prep = sub === '/assets/prepared' || sub === '/assets/prepare';
        if (prep && !o.prepared)
          throw new StudioError('preparing the assets needs a hosted Studio with its processing worker', 404);
        if (!prep && !o.assets) throw new StudioError('not found', 404);
        if (req.method === 'GET') {
          if (sub === '/assets/prepared') return send(res, 200, { runs: await o.prepared!.list() });
          if (sub === '/assets') return send(res, 200, await lock.read(() => o.assets!.assets.list()));
          if (sub === '/assets/prompts')
            return send(
              res,
              200,
              await lock.read(() => o.assets!.assets.prompts(url.searchParams.get('missing') === '1')),
            );
          if (sub.startsWith('/assets/file/')) {
            const f = o.assets?.assets.filePath(sub.slice('/assets/file/'.length));
            if (!f) throw new StudioError('no such file', 404);
            return await serveFile(res, f);
          }
          throw new StudioError('not found', 404);
        }
        if (req.method !== 'POST') throw new StudioError('not found', 404);
        if (!o.lease.held)
          return send(
            res,
            503,
            { error: 'this instance does not serve writes yet; try again' },
            { 'retry-after': '2' },
          );
        // Named as any write is (its author: the email first), the claimant by their name.
        const author = principal ? (principal.user.email ?? principal.user.name ?? principal.user.id) : 'local';
        const name = principal ? (principal.user.name ?? author) : 'local';
        const claimant = principal ? { userId: principal.user.id, name, fences: fencesOf(req) } : undefined;
        const within = <T>(fn: () => Promise<T>) => operationContext.run({ author, claimant }, fn);
        const who = { name, userId: principal?.user.id ?? 'local' };
        if (sub === '/assets/prepare') {
          const prepared = o.prepared!;
          return send(
            res,
            202,
            jobs.start('prepare', who, (c) => prepared.prepare(name, c), within),
          );
        }
        const kind = /^\/assets\/(sound|decor|sheet|cell)$/.exec(sub)?.[1];
        if (!kind) throw new StudioError('not found', 404);
        const body = (await readJson(req, MAX_UPLOAD_BODY)) as never;
        const a = o.assets!;
        if (kind === 'sheet' || kind === 'cell') {
          const work = await lock.read(async () => a.planCut(kind, body));
          return send(res, 202, jobs.start(kind === 'sheet' ? 'cut' : 'cell', who, work, within));
        }
        const r = await lock.write(() => within(() => (kind === 'sound' ? a.uploadSound(body) : a.uploadDecor(body))));
        return send(res, 200, r, { 'x-studio-revision': String(await o.journal.revision()) });
      }
      // Comments (4.2.3, H2): read and written by a reviewer (no game file); the notes imported by an owner.
      if (sub === '/comments' || sub.startsWith('/comments/')) {
        if (!o.comments) throw new StudioError("comments are a shared Studio's", 404);
        const who = {
          id: principal?.user.id ?? 'local',
          name: principal?.user.name ?? principal?.user.email ?? 'local',
        };
        if (req.method === 'GET' && sub === '/comments') {
          const anchor = url.searchParams.get('anchor');
          return send(res, 200, { comments: await o.comments.list(anchor ?? undefined) });
        }
        if (req.method === 'POST' && sub === '/comments')
          return send(res, 201, await o.comments.add((await readJson(req)) as Record<string, unknown>, who));
        if (req.method === 'POST' && sub === '/comments/import-notes') {
          if (principal) o.auth!.gate.require(principal, 'owner');
          return send(res, 200, await o.comments.importNotes(o.studio.getNotes().entries, who));
        }
        const m = /^\/comments\/([\w-]+)$/.exec(sub);
        if (req.method === 'PUT' && m) {
          const canResolve = !principal || principal.role === 'dev' || principal.role === 'owner';
          return send(
            res,
            200,
            await o.comments.update(m[1]!, (await readJson(req)) as Record<string, unknown>, {
              id: who.id,
              canResolve,
            }),
          );
        }
        throw new StudioError('not found', 404);
      }
      // The game's Git repository (4.2.3, H5): what the Studio knows of it (a reviewer); a push, an import (an owner,
      // the import under the exclusive lease).
      if (sub === '/git' || sub === '/git/push' || sub === '/git/import') {
        if (!o.git) throw new StudioError('this Studio has no Git repository (config git)', 404);
        if (req.method === 'GET' && sub === '/git') return send(res, 200, await o.git.status());
        if (req.method !== 'POST' || sub === '/git') throw new StudioError('not found', 404);
        if (principal) o.auth!.gate.require(principal, 'owner');
        if (!o.lease.held)
          return send(
            res,
            503,
            { error: 'this instance does not serve writes yet; try again' },
            { 'retry-after': '2' },
          );
        const author = principal ? (principal.user.email ?? principal.user.name ?? principal.user.id) : 'local';
        const claimant = principal ? { userId: principal.user.id, name: principal.user.name ?? author } : undefined;
        const body = (await readJson(req)) as { ref?: unknown };
        const ref = typeof body?.ref === 'string' && body.ref ? body.ref : undefined;
        const r = await operationContext.run({ author, claimant }, () =>
          sub === '/git/push' ? o.git!.push() : o.git!.import(ref),
        );
        return send(res, 200, r);
      }
      // The engine's upgrade (4.2.3, H6): an owner's, on the worker, under their exclusive lease; refused (422) before
      // anything is written when the migrated game fails the validator or the solver.
      if (sub === '/engine/migrate') {
        if (!o.engineUpgrade)
          throw new StudioError("the engine's upgrade needs a hosted Studio with its processing worker", 404);
        if (req.method !== 'POST') throw new StudioError('not found', 404);
        if (principal && o.auth) o.auth.gate.require(principal, 'owner');
        if (!o.lease.held)
          return send(
            res,
            503,
            { error: 'this instance does not serve writes yet; try again' },
            { 'retry-after': '2' },
          );
        const author = principal ? (principal.user.email ?? principal.user.name ?? principal.user.id) : 'local';
        const name = principal ? (principal.user.name ?? author) : 'local';
        const claimant = principal ? { userId: principal.user.id, name } : undefined;
        const r = await operationContext.run({ author, claimant }, () => o.engineUpgrade!.migrate(name));
        return send(res, 200, r);
      }
      // The published builds (4.2.2, G6): listed and read by a reviewer, published by a dev, rebuilt by an owner.
      if (sub === '/builds' || sub.startsWith('/builds/')) {
        if (!o.builds) throw new StudioError("published builds are a hosted Studio's", 404);
        if (req.method === 'GET' && sub === '/builds') return send(res, 200, { builds: await o.builds.list() });
        const one = /^\/builds\/(\d{1,9})$/.exec(sub);
        if (req.method === 'GET' && one) {
          const b = await o.builds.get(Number(one[1]));
          if (!b) throw new StudioError(`no build ${one[1]}`, 404);
          return send(res, 200, b);
        }
        if (!o.lease.held)
          return send(
            res,
            503,
            { error: 'this instance does not serve writes yet; try again' },
            { 'retry-after': '2' },
          );
        const by = principal ? (principal.user.name ?? principal.user.email ?? principal.user.id) : 'local';
        if (req.method === 'POST' && sub === '/builds') return send(res, 200, await o.builds.publish(by));
        const again = /^\/builds\/(\d{1,9})\/rebuild$/.exec(sub);
        if (req.method === 'POST' && again) {
          if (principal && o.auth) o.auth.gate.require(principal, 'owner');
          return send(res, 200, await o.builds.rebuild(Number(again[1])));
        }
        throw new StudioError('not found', 404);
      }
      // A bisection asked for (4.2.2, G4): a dev's, between a passing revision and a failing one.
      if (req.method === 'POST' && sub === '/health/bisect') {
        if (!o.health) throw new StudioError("the health of revisions is a hosted Studio's", 404);
        if (!o.lease.held)
          return send(
            res,
            503,
            { error: 'this instance does not serve writes yet; try again' },
            { 'retry-after': '2' },
          );
        const b = (await readJson(req)) as { good?: unknown; bad?: unknown };
        if (typeof b?.good !== 'number' || typeof b?.bad !== 'number')
          throw new StudioError('`good` and `bad` are revision numbers');
        const r = await o.health.bisectOn(b.good, b.bad);
        if ('error' in r) throw new StudioError(r.error);
        return send(res, 200, r);
      }
      // The live Studio (PR 6): the stream, who is here, the leases.
      if (req.method === 'GET' && sub === '/events')
        return void (await serveEvents(req, res, { principal, gate: o.auth?.gate, hub }));
      if (o.leases && principal) {
        const who = {
          userId: principal.user.id,
          name: principal.user.name ?? principal.user.email ?? principal.user.id,
        };
        if (req.method === 'POST' && sub === '/presence') {
          const b = (await readJson(req)) as { where?: unknown };
          const where = typeof b.where === 'string' ? b.where.slice(0, 100) : undefined;
          o.presence?.beat(who.userId, who.name, where);
          // The heartbeat renews the member's leases too (TTL 120 s, beat every 30 s); a reviewer holds none.
          if (principal.role !== 'reviewer') await o.leases.renew(who.userId);
          return send(res, 200, { here: o.presence?.list() ?? [], leases: await o.leases.list() });
        }
        if (req.method === 'GET' && sub === '/leases') return send(res, 200, { leases: await o.leases.list() });
        if (req.method === 'POST' && sub === '/leases') {
          const b = (await readJson(req)) as { spans?: unknown };
          return send(res, 200, { fences: await o.leases.take(who, spanList(b.spans)) });
        }
        if (req.method === 'POST' && sub === '/leases/release') {
          const b = (await readJson(req)) as { spans?: unknown };
          await o.leases.release(who.userId, b.spans === undefined ? undefined : spanList(b.spans));
          return send(res, 200, { ok: true });
        }
        if (
          req.method === 'POST' &&
          (sub === '/leases/takeover' || sub === '/exclusive' || sub === '/exclusive/release')
        ) {
          o.auth!.gate.require(principal, 'owner');
          const b = (await readJson(req)) as { span?: unknown };
          if (sub === '/exclusive') return send(res, 200, { fences: await o.leases.take(who, ['*']) });
          if (sub === '/exclusive/release') {
            await o.leases.release(who.userId, ['*']);
            return send(res, 200, { ok: true });
          }
          if (typeof b.span !== 'string' || !isSpanName(b.span)) throw new StudioError('`span` names one span');
          const r = await o.leases.takeover(who, b.span);
          await o.auth!.audit?.(who.userId, 'lease-takeover', { span: b.span, previous: r.previous?.holder ?? null });
          return send(res, 200, { fence: r.fence, previous: r.previous ?? null });
        }
        // Undo is personal (4.2.2, plan §2.4): a shared Studio without the members' own stacks has none, since its
        // last operation may be someone else's.
        if (req.method === 'POST' && (sub === '/undo' || sub === '/redo') && !o.personalUndo)
          throw new StudioError('undo is not available on this shared Studio', 409);
      }
      if (req.method === 'GET' && sub === '/ops') {
        const after = Number(url.searchParams.get('after') ?? '0');
        if (!Number.isInteger(after) || after < 0) throw new StudioError('`after` is a revision number');
        const r = await lock.read(async () => {
          const epoch = await o.journal.epoch();
          const ops = await o.journal.opsAfter(after);
          // `next`: the cursor to ask from next time (the last op given; the list may be cut by its limit).
          return { epoch, revision: await o.journal.revision(), ops, next: ops.at(-1)?.rev ?? after };
        });
        if (url.searchParams.get('epoch') && url.searchParams.get('epoch') !== r.epoch)
          return send(res, 409, { error: 'another epoch: resynchronise', epoch: r.epoch });
        return send(res, 200, r);
      }
      const route = table.find(([m, re]) => m === req.method && re.test(sub));
      if (!route) return send(res, 404, { error: 'not found' });
      const write = req.method !== 'GET' && !(req.method === 'POST' && READ_POSTS.test(sub));
      if (write && !o.lease.held)
        return send(res, 503, { error: 'this instance does not serve writes yet; try again' }, { 'retry-after': '2' });
      const body = req.method !== 'GET' ? await readJson(req) : {};
      if (!isBody(body)) throw new StudioError('the body must be a JSON object');
      // P6: a write may carry its operation id; a retry with the same id gets the same answer, applied once.
      const op = write ? req.headers['x-studio-op'] : undefined;
      if (op !== undefined && (typeof op !== 'string' || !/^[\w-]{8,64}$/.test(op)))
        throw new StudioError('x-studio-op must be 8 to 64 letters, digits, - or _');
      // The revision the client read what it edits at (4.2.3, H10): a file written since is a 409 with what changed.
      const baseHeader = write ? req.headers['x-studio-base'] : undefined;
      if (baseHeader !== undefined && (typeof baseHeader !== 'string' || !/^\d{1,15}$/.test(baseHeader)))
        throw new StudioError('x-studio-base must be a revision');
      const readAt = baseHeader === undefined ? undefined : Number(baseHeader);
      // Which client: its own writes since its read are not a conflict; another tab's or agent's are, the same member's too.
      const clientHeader = write ? req.headers['x-studio-client'] : undefined;
      if (clientHeader !== undefined && (typeof clientHeader !== 'string' || !/^[\w-]{8,64}$/.test(clientHeader)))
        throw new StudioError('x-studio-client must be 8 to 64 letters, digits, - or _');
      const who = principal?.user.id ?? '';
      // An answer is given back to its own author only: another member who knows the id gets nothing of it.
      const answered = async () =>
        op
          ? (await o.db.all('SELECT status, body FROM studio_requests WHERE op_id = $1 AND author = $2', [op, who]))[0]
          : undefined;
      const seen = await answered();
      if (seen) return send(res, Number(seen.status), JSON.parse(String(seen.body)), { 'x-studio-replayed': '1' });
      const author = principal ? (principal.user.email ?? principal.user.name ?? principal.user.id) : undefined;
      const run = () =>
        operationContext.run(
          {
            id: op,
            author,
            readAt,
            client: clientHeader,
            claimant: principal
              ? {
                  userId: principal.user.id,
                  name: principal.user.name ?? author ?? principal.user.id,
                  fences: fencesOf(req),
                }
              : undefined,
          },
          () => Promise.resolve(route[2](sub.match(route[1])!, body, { baseUrl: '' })),
        );
      // A retry that arrived while the first try was running (a cut, a proxy's 504) waits for the lock behind it, then
      // finds its answer there: the write is applied once, and the retry gets the first answer.
      let replayed: Record<string, unknown> | undefined;
      // A read says the revision it was made at (4.2.2, G3: a diagnostic shown at a later head is stale), read under the
      // same lock as the answer: no write lands between them.
      let revision: number | undefined;
      const result = await (write
        ? lock.write(async () => {
            replayed = await answered();
            if (replayed) return undefined;
            const r = await run();
            // The revision after it (H10): what its client has read from now on, its own write included.
            revision = await o.journal.revision();
            if (op) {
              // Kept 7 days: long enough for any retry of a client that was cut off. Written under the lock, before
              // the next write of the same id can look for it.
              await o.db.run('DELETE FROM studio_requests WHERE at < $1', [Date.now() - 7 * 86_400_000]);
              await o.db.run(
                'INSERT INTO studio_requests (op_id, status, body, at, author) VALUES ($1, 200, $2, $3, $4) ON CONFLICT DO NOTHING',
                [op, JSON.stringify(r ?? null), Date.now(), who],
              );
            }
            return r;
          })
        : lock.read(async () => {
            revision = await o.journal.revision();
            return run();
          }));
      if (replayed)
        return send(res, Number(replayed.status), JSON.parse(String(replayed.body)), { 'x-studio-replayed': '1' });
      return send(res, 200, result, revision === undefined ? {} : { 'x-studio-revision': String(revision) });
    } catch (e) {
      if (isStudioError(e)) {
        // Refused credentials are counted per address; past the limit that address gets 429 for its refusals only.
        // A request with a valid credential never reaches here, so a stranger cannot lock the team out.
        if (o.auth && e.status === 401 && !failures.take(clientOf(req)))
          return send(res, 429, { error: 'too many refused attempts' }, { 'retry-after': '60' });
        const body = { error: e.message, ...((e as { body?: object }).body ?? {}) };
        const headers = {
          ...((e as { headers?: Record<string, string> }).headers ?? {}),
          ...(e.status === 503 ? { 'retry-after': '2' } : {}),
        };
        return send(res, e.status, body, headers);
      }
      log({ event: 'error', id, message: String((e as Error)?.message ?? e).slice(0, 300) });
      return send(res, 500, { error: 'internal error', id });
    }
  });
  server.on('listening', () => {
    started = true;
  });
  return Object.assign(server, { exclusive: <T>(fn: () => Promise<T>) => lock.write(fn) });
}
