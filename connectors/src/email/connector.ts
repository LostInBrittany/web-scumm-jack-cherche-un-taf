// The email connector (4.1.9, wiki/en/bridge.connector-email.md, docs/dev/threat-models/email.md). A message reaches it
// from a provider's signed webhook or from a mailbox it polls over IMAP. It is read in a worker (`parse.ts`), bound to
// a player (the recipient's `+p-…` tag, or the sender who sent a pairing code), matched against the answers the game
// declares (whole words, no pattern), and proposed once: `dedupeKey = sha256('email:' + Message-ID)`. Nothing of the
// message leaves the connector: the payload is a hash of its Message-ID and the answer's index.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { RealityManifest } from '../../../src/engine/reality/manifest';
import { readSecret } from '../config';
import { closeServer, HttpError, listen, PerAddress, readBody, sendJson } from '../http';
import {
  type ConnectorContext,
  type ConnectorHealth,
  dedupeKey,
  type ProposeResult,
  type RealityConnector,
} from '../sdk';
import { ImapClient } from './imap';
import type { ParsedMail } from './mime';
import { MimeParser } from './parse';

export interface EmailConfig {
  mode: 'webhook' | 'imap';
  /** The domain of the per-player addresses (`<box>+p-<16 hex>@<domain>`); none: tags are not read. */
  domain?: string;
  /** The largest raw message read, in bytes (256 KB). */
  maxBytes?: number;
  /** How long a sender who sent a pairing code stays linked to its player, in days (30). In memory only. */
  linkDays?: number;
  webhook?: { host?: string; port: number; secret: string; toleranceS?: number; perMinutePerIp?: number };
  imap?: {
    host: string;
    port?: number;
    user: string;
    password: string;
    mailbox?: string;
    tls?: boolean;
    pollS?: number;
    /** 0: a message is deleted once its signal is accepted; N: kept N days, then deleted. */
    keepDays?: number;
  };
}

/** What became of one message. */
export type EmailOutcome =
  | { kind: 'proposed'; result: ProposeResult; signal: string }
  | { kind: 'paired'; playerId: string }
  | { kind: 'rejected'; reason: string };

/** The connector's configuration from the operator's JSON (secrets from files). */
export function emailConfig(raw: Record<string, unknown>, baseDir: string): EmailConfig {
  const c = raw as unknown as EmailConfig & {
    webhook?: { secretFile?: string };
    imap?: { passwordFile?: string };
  };
  if (c.mode !== 'webhook' && c.mode !== 'imap') throw new Error('email: "mode" is "webhook" or "imap"');
  return {
    ...c,
    ...(c.webhook
      ? { webhook: { ...c.webhook, secret: readSecret(baseDir, c.webhook.secretFile, c.webhook.secret, 'webhook') } }
      : {}),
    ...(c.imap
      ? { imap: { ...c.imap, password: readSecret(baseDir, c.imap.passwordFile, c.imap.password, 'imap password') } }
      : {}),
  };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const TOKEN = /[\p{L}\p{N}'-]+/gu;
const words = (s: string) => new Set((s.normalize('NFKC').toLowerCase().match(TOKEN) ?? []).slice(0, 100_000));
const PAIR = /^\s*(?:pair|link|code)?\s*:?\s*([A-HJ-NP-Z2-9]{8})\s*$/i;

/** The answer a message gives: the first whose words all appear, or `otherwise`. Pure. */
export function answerOf(
  mail: Pick<ParsedMail, 'subject' | 'text'>,
  decl: NonNullable<NonNullable<RealityManifest['connectors']>['email']>,
): { index: number; signal: string } | null {
  const have = words(`${mail.subject} ${mail.text}`);
  const i = decl.answers.findIndex((a) => a.words.every((w) => have.has(w.normalize('NFKC').toLowerCase())));
  if (i >= 0) return { index: i, signal: decl.answers[i]!.signal };
  return decl.otherwise ? { index: -1, signal: decl.otherwise } : null;
}

/** The player a recipient tag names (`box+p-0123456789abcdef@domain`), when the domain is the connector's. */
export function taggedPlayer(to: string[], domain: string | undefined): string | null {
  if (!domain) return null;
  for (const a of to) {
    const m = /^[^@+]{1,64}\+(p-[0-9a-f]{16})@(.+)$/.exec(a);
    if (m && m[2] === domain.toLowerCase()) return m[1]!;
  }
  return null;
}

const TRANSIENT = new Set(['timeout', 'unreachable', 'bridge', 'bridge-quota', 'quota', 'stopped']);

/** Whether a message's outcome may change if it is read again later. */
function transient(o: EmailOutcome): boolean {
  if (o.kind === 'proposed') return !o.result.ok && TRANSIENT.has(o.result.refusal);
  if (o.kind === 'rejected') return o.reason === 'stopped' || TRANSIENT.has(o.reason.replace(/^pairing-/, ''));
  return false;
}

const isLoopback = (host: string) => /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|::1|localhost)$/i.test(host);

export class EmailConnector implements RealityConnector {
  readonly id = 'email';
  private ctx: ConnectorContext | null = null;
  private parser = new MimeParser();
  private server: Server | undefined;
  private timer: NodeJS.Timeout | undefined;
  private inFlight = new Set<Promise<unknown>>();
  private stopping = false;
  private since = new Date().toISOString();
  private lastPoll: { ok: boolean; at: number } | null = null;
  /** sha256(salt + sender) → its player, after a pairing code from that sender (bounded, in memory). */
  private links = new Map<string, { playerId: string; until: number }>();
  private salt = randomBytes(16).toString('hex');
  /** The webhook's port once listening (tests). */
  port = 0;

  constructor(private c: EmailConfig) {}

  /** The largest raw message read: 256 KB by default, never more than 4 MB whatever the configuration says. */
  private get maxBytes() {
    return Math.min(this.c.maxBytes ?? 256 * 1024, 4 * 1024 * 1024);
  }

  /** One raw message, whatever brought it. Never throws. */
  async handle(bytes: Uint8Array): Promise<EmailOutcome> {
    const ctx = this.ctx;
    if (!ctx) return { kind: 'rejected', reason: 'stopped' };
    const reject = (reason: string): EmailOutcome => {
      ctx.reject(reason);
      return { kind: 'rejected', reason };
    };
    if (bytes.length > this.maxBytes) return reject('too-large');
    const parsed = await this.parser.parse(bytes);
    if (!parsed.ok) return reject('unreadable');
    const mail = parsed.mail;
    if (mail.attachments > 0) return reject('attachment');
    const sender = mail.from ? sha256(`${this.salt}:${mail.from}`) : '';
    const code = PAIR.exec(mail.subject)?.[1]?.toUpperCase();
    if (code) {
      const r = await ctx.pair(code);
      if (!r.ok) return reject(`pairing-${r.refusal}`);
      if (sender) this.link(sender, r.playerId);
      return { kind: 'paired', playerId: r.playerId };
    }
    const now = Date.now();
    const linked = sender ? this.links.get(sender) : undefined;
    const playerId = taggedPlayer(mail.to, this.c.domain) ?? (linked && linked.until > now ? linked.playerId : null);
    if (!playerId) return reject('no-player');
    const decl = ctx.manifest.connectors?.email;
    if (!decl) return reject('not-declared');
    const answer = answerOf(mail, decl);
    if (!answer) return reject('no-answer');
    const result = await ctx.propose({
      source: 'email',
      kind: answer.signal,
      playerId,
      dedupeKey: dedupeKey('email', mail.messageId),
      payload: { message: sha256(mail.messageId).slice(0, 32), answer: answer.index },
      receivedAt: new Date().toISOString(),
    });
    return { kind: 'proposed', result, signal: answer.signal };
  }

  private link(sender: string, playerId: string): void {
    if (this.links.size >= 10_000) {
      const now = Date.now();
      for (const [k, v] of this.links) if (v.until < now) this.links.delete(k);
      if (this.links.size >= 10_000) this.links.delete(this.links.keys().next().value as string);
    }
    this.links.set(sender, { playerId, until: Date.now() + (this.c.linkDays ?? 30) * 86_400_000 });
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.inFlight.add(p);
    // The caller has the rejection; this bookkeeping chain never leaves an unhandled one.
    void p.finally(() => this.inFlight.delete(p)).catch(() => {});
    return p;
  }

  async start(ctx: ConnectorContext): Promise<void> {
    this.ctx = ctx;
    this.stopping = false;
    if (this.c.mode === 'webhook') {
      const w = this.c.webhook;
      if (!w?.secret) throw new Error('email: webhook mode needs "webhook.secretFile"');
      const perIp = new PerAddress(w.perMinutePerIp ?? 120);
      this.server = createServer(async (req, res) => {
        try {
          if (this.stopping) throw new HttpError(503, 'stopping');
          if (req.method !== 'POST' || req.url !== '/v1/inbound') throw new HttpError(404, 'not-found');
          if (!perIp.take(req.socket.remoteAddress ?? '?')) throw new HttpError(429, 'rate');
          const body = await readBody(req, this.maxBytes);
          this.verify(body, req.headers['x-web-scumm-timestamp'], req.headers['x-web-scumm-signature']);
          const o = await this.track(this.handle(body));
          if (o.kind === 'paired') return sendJson(res, 202, { status: 'paired' });
          if (o.kind === 'rejected') return sendJson(res, 422, { error: o.reason });
          if (!o.result.ok) return sendJson(res, 422, { error: o.result.refusal });
          return sendJson(res, o.result.duplicate ? 200 : 202, {
            status: o.result.duplicate ? 'duplicate' : 'accepted',
          });
        } catch (e) {
          const h = e instanceof HttpError ? e : new HttpError(500, 'internal');
          if (h.status === 401 || h.status === 413) ctx.reject(h.code);
          sendJson(res, h.status, { error: h.code });
        }
      });
      this.port = await listen(this.server, w.port, w.host ?? '127.0.0.1');
    } else {
      if (!this.c.imap?.password) throw new Error('email: imap mode needs "imap.passwordFile"');
      // Without TLS the LOGIN crosses the network in clear: allowed only to this machine (a test or a local relay).
      if (this.c.imap.tls === false && !isLoopback(this.c.imap.host))
        throw new Error('email: "imap.tls": false is allowed for a loopback host only (127.0.0.1, ::1, localhost)');
      const every = (this.c.imap.pollS ?? 60) * 1000;
      const tick = () => {
        if (this.stopping) return;
        void this.track(this.poll())
          .catch(() => ctx.log('email.poll-failed'))
          .finally(() => {
            if (!this.stopping) this.timer = setTimeout(tick, every);
          });
      };
      tick();
    }
    ctx.log('email.started', { mode: this.c.mode });
  }

  /** HMAC-SHA256 of `<timestamp>.<raw body>`, within `toleranceS` of now, compared in constant time. */
  private verify(body: Buffer, ts: string | string[] | undefined, sig: string | string[] | undefined): void {
    const w = this.c.webhook!;
    const t = typeof ts === 'string' && /^\d{1,12}$/.test(ts) ? Number(ts) : Number.NaN;
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > (w.toleranceS ?? 300))
      throw new HttpError(401, 'stale');
    const want = Buffer.from(`sha256=${createHmac('sha256', w.secret).update(`${t}.`).update(body).digest('hex')}`);
    const got = Buffer.from(typeof sig === 'string' ? sig : '');
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'signature');
  }

  private running: Promise<void> | null = null;
  /** One pass over the mailbox (a pass already running is the one awaited): new messages, then the retention sweep. */
  poll(): Promise<void> {
    this.running ??= this.pollOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async pollOnce(): Promise<void> {
    const c = this.c.imap!;
    const ctx = this.ctx!;
    let imap: ImapClient | null = null;
    try {
      imap = await ImapClient.open({
        host: c.host,
        port: c.port ?? 993,
        user: c.user,
        password: c.password,
        maxLiteral: this.maxBytes,
        ...(c.mailbox ? { mailbox: c.mailbox } : {}),
        ...(c.tls === false ? { tls: false } : {}),
      });
      let deleted = 0;
      for (const uid of (await imap.unseen()).slice(0, 50)) {
        if (this.stopping) break;
        if ((await imap.size(uid)) > this.maxBytes) {
          ctx.reject('too-large');
          await imap.flag(uid, ['\\Seen', '\\Flagged']);
          continue;
        }
        const bytes = await imap.fetch(uid);
        const o: EmailOutcome = bytes ? await this.handle(bytes) : { kind: 'rejected', reason: 'unreadable' };
        // A refusal that may pass later (the Bridge away or busy, a quota): the message stays unseen and is read again
        // at the next poll, so delivery stays at least once. A definitive refusal is flagged for the operator.
        if (transient(o)) continue;
        const done = o.kind === 'paired' || (o.kind === 'proposed' && o.result.ok);
        if (done && (c.keepDays ?? 0) === 0) {
          await imap.flag(uid, ['\\Seen', '\\Deleted']);
          deleted++;
        } else await imap.flag(uid, done ? ['\\Seen'] : ['\\Seen', '\\Flagged']);
      }
      if ((c.keepDays ?? 0) > 0)
        for (const uid of await imap.seenBefore(new Date(Date.now() - (c.keepDays ?? 0) * 86_400_000))) {
          await imap.flag(uid, ['\\Deleted']);
          deleted++;
        }
      if (deleted) await imap.expunge();
      this.lastPoll = { ok: true, at: Date.now() };
      ctx.log('email.polled', { deleted });
    } catch {
      this.lastPoll = { ok: false, at: Date.now() };
      ctx.log('email.poll-failed');
    } finally {
      await imap?.logout();
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    const server = this.server;
    this.server = undefined;
    await closeServer(server, this.inFlight);
    await Promise.allSettled([...this.inFlight]);
    await this.parser.close();
    this.ctx = null;
  }

  async health(): Promise<ConnectorHealth> {
    if (!this.ctx) return { ok: false, detail: 'stopped', since: this.since };
    if (this.c.mode === 'webhook') return { ok: true, detail: `webhook on port ${this.port}`, since: this.since };
    const p = this.lastPoll;
    const every = (this.c.imap?.pollS ?? 60) * 1000;
    return p && p.ok && Date.now() - p.at < 3 * every
      ? { ok: true, detail: 'mailbox polled', since: this.since }
      : { ok: false, detail: p ? 'the last poll failed' : 'not polled yet', since: this.since };
  }
}
