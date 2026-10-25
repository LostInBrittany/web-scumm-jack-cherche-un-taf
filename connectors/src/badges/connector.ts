// The Open Badges connector (4.1.9, wiki/en/bridge.connector-open-badges.md, docs/dev/threat-models/open-badge.md). A
// player posts `{ code, badge, email? }` to `POST /v1/badges`: the pairing code links them (the Bridge confirms it),
// the badge is verified (`verify.ts`, every document through the SSRF-safe fetcher), and the signal the game declares
// for the verdict is proposed. The game receives a signal, never the document: the payload `{ badgeId, issuer,
// status, checkedAt }` stays here and only its hash goes to the Bridge. The email, when given, is hashed and dropped.
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { closeServer, HttpError, listen, PerAddress, readBody, sendJson } from '../http';
import { type ConnectorContext, type ConnectorHealth, dedupeKey, type RealityConnector } from '../sdk';
import { type NetPolicy, SafeFetcher } from './fetch';
import { BadgeVerifier } from './verify';

export interface BadgeConfig {
  host?: string;
  port: number;
  /** Hosts the connector may fetch from; by default the hosts of the game's `https:` issuers. */
  hosts?: string[];
  perMinutePerIp?: number;
  /** A request's body, in bytes (64 KB). */
  maxBytes?: number;
  /** Tests only (wiki/en/bridge.connectors.md says never in production). */
  testing?: NetPolicy['testing'];
  resolve?: NetPolicy['resolve'];
}

/** The hosts of the issuers that are URLs. */
export function hostsOf(issuers: string[]): string[] {
  return issuers.flatMap((i) => {
    try {
      const u = new URL(i);
      return u.protocol === 'https:' ? [u.hostname.toLowerCase()] : [];
    } catch {
      return [];
    }
  });
}

export class OpenBadgeConnector implements RealityConnector {
  readonly id = 'open-badge';
  private server: Server | undefined;
  private ctx: ConnectorContext | null = null;
  private since = new Date().toISOString();
  private inFlight = new Set<Promise<unknown>>();
  private verifier: BadgeVerifier | null = null;
  port = 0;

  constructor(private c: BadgeConfig) {}

  async start(ctx: ConnectorContext): Promise<void> {
    const decl = ctx.manifest.connectors?.['open-badge'];
    if (!decl) throw new Error("open-badge: the game declares no `reality.connectors['open-badge']`");
    this.ctx = ctx;
    const fetcher = new SafeFetcher({
      hosts: this.c.hosts ?? hostsOf(decl.issuers),
      ...(this.c.testing ? { testing: this.c.testing } : {}),
      ...(this.c.resolve ? { resolve: this.c.resolve } : {}),
    });
    const verifier = new BadgeVerifier({ issuers: decl.issuers, fetch: (u) => fetcher.get(u) });
    this.verifier = verifier;
    const perIp = new PerAddress(this.c.perMinutePerIp ?? 30);
    this.server = createServer(async (req, res) => {
      try {
        if (!this.ctx) throw new HttpError(503, 'stopping');
        if (req.method !== 'POST' || req.url !== '/v1/badges') throw new HttpError(404, 'not-found');
        if (!perIp.take(req.socket.remoteAddress ?? '?')) throw new HttpError(429, 'rate');
        const raw = await readBody(req, this.c.maxBytes ?? 64 * 1024);
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        } catch {
          throw new HttpError(400, 'shape');
        }
        if (!body || typeof body !== 'object' || typeof body.code !== 'string') throw new HttpError(400, 'shape');
        const work = this.submit(ctx, decl, body);
        this.inFlight.add(work);
        // Its rejection is the request's (awaited below), never an unhandled one of this bookkeeping chain.
        void work.finally(() => this.inFlight.delete(work)).catch(() => {});
        const r = await work;
        sendJson(res, r.http, r.body);
      } catch (e) {
        const h = e instanceof HttpError ? e : new HttpError(500, 'internal');
        if (h.status !== 404) ctx.reject(h.code);
        sendJson(res, h.status, { error: h.code });
      }
    });
    this.port = await listen(this.server, this.c.port, this.c.host ?? '127.0.0.1');
    ctx.log('open-badge.started', { port: this.port });
  }

  private async submit(
    ctx: ConnectorContext,
    decl: NonNullable<NonNullable<ConnectorContext['manifest']['connectors']>['open-badge']>,
    body: Record<string, unknown>,
  ): Promise<{ http: number; body: unknown }> {
    const paired = await ctx.pair(String(body.code).trim().toUpperCase());
    if (!paired.ok) return { http: 422, body: { error: `pairing-${paired.refusal}` } };
    const verdict = await this.verifier!.verify({
      badge: body.badge,
      ...(typeof body.email === 'string' && body.email.length <= 320 ? { email: body.email } : {}),
      ...(typeof body.recipient === 'string' && body.recipient.length <= 512 ? { recipient: body.recipient } : {}),
    });
    ctx.log('open-badge.verdict', { status: verdict.status, format: verdict.format });
    const signal = decl[verdict.status];
    if (!signal) return { http: 200, body: { status: verdict.status, signal: 'none' } };
    const id =
      verdict.badgeId ||
      createHash('sha256')
        .update(JSON.stringify(body.badge ?? ''))
        .digest('hex');
    const r = await ctx.propose({
      source: 'open-badge',
      kind: signal,
      playerId: paired.playerId,
      dedupeKey: dedupeKey('open-badge', `${paired.playerId}:${id}:${verdict.status}`),
      payload: {
        badgeId: createHash('sha256').update(id).digest('hex').slice(0, 32),
        issuer: createHash('sha256').update(verdict.issuer).digest('hex').slice(0, 32),
        status: verdict.status,
        checkedAt: new Date().toISOString(),
      },
      receivedAt: new Date().toISOString(),
    });
    return {
      http: r.ok ? 202 : 422,
      body: { status: verdict.status, signal: r.ok ? (r.duplicate ? 'duplicate' : 'accepted') : r.refusal },
    };
  }

  async stop(): Promise<void> {
    this.ctx = null;
    const server = this.server;
    this.server = undefined;
    await closeServer(server, this.inFlight);
  }

  async health(): Promise<ConnectorHealth> {
    return this.ctx && this.server?.listening
      ? { ok: true, detail: `form on port ${this.port}`, since: this.since }
      : { ok: false, detail: 'stopped', since: this.since };
  }
}
