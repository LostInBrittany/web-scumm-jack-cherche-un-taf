// The edges of the email connector (connectors/src/email/connector.ts, imap.ts, parse.ts), each test written for a
// mutant of `connectors-edge` the other email tests let live (4.1.20 PR 2c, plan §7.1; tools/mutate.ts,
// docs/dev/MUTANTS.md): the configuration, each refusal's exact reason, the sender links and their bound, the
// webhook's answers, the IMAP pass (sizes, flags, retention, its timer), and the IMAP client's every bound, byte for
// byte. No network: the IMAP client talks to an in-memory peer (node:net and node:tls `connect` are replaced in this
// file only), the connector's mailbox is a fake client, its MIME reader a fake that reads JSON, and the webhook
// listens on 127.0.0.1, port 0. The MIME worker tests start real workers from `data:` URLs.
import { createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duplex } from 'node:stream';
import type { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailConnector, type EmailConfig, emailConfig } from '../connectors/src/email/connector';
import { ImapClient, type ImapOptions } from '../connectors/src/email/imap';
import type { MimeResult, ParsedMail } from '../connectors/src/email/mime';
import { MimeParser } from '../connectors/src/email/parse';
import type { ConnectorContext, ProposeResult } from '../connectors/src/sdk';
import type { RealityManifest } from '../src/engine/reality/manifest';

/** Who the IMAP client connects to: the peer a test hands it, or the real `connect` when none. */
const net = vi.hoisted(() => ({ peer: null as Duplex | null, kinds: [] as string[] }));
vi.mock('node:net', async (orig) => {
  const real = await orig<typeof import('node:net')>();
  const connect = (...a: unknown[]) => {
    if (!net.peer) return (real.connect as (...x: unknown[]) => unknown)(...a);
    net.kinds.push('net');
    return net.peer;
  };
  return { ...real, connect, default: { ...real, connect } };
});
vi.mock('node:tls', async (orig) => {
  const real = await orig<typeof import('node:tls')>();
  const connect = (...a: unknown[]) => {
    if (!net.peer) return (real.connect as (...x: unknown[]) => unknown)(...a);
    net.kinds.push('tls');
    return net.peer;
  };
  return { ...real, connect, default: { ...real, connect } };
});

/** Every connector a test made, stopped after it even when an assertion failed first (no server or poll loop left). */
const made: EmailConnector[] = [];
afterEach(async () => {
  for (const e of made.splice(0)) await e.stop().catch(() => {});
  vi.useRealTimers();
  vi.restoreAllMocks();
  net.peer = null;
  net.kinds = [];
});

// --- the IMAP client against an in-memory peer -----------------------------------------------------------------------

type Reply = (tag: string, cmd: string) => (string | Buffer)[];
/** An IMAP server in memory: answers each command line by the first rule that matches, one chunk at a time. */
class Peer extends Duplex {
  written: string[] = [];
  hungUp: Promise<void>;
  private pending = '';
  constructor(
    private rules: [RegExp, Reply][],
    greeting: (string | Buffer)[] = ['* OK ready\r\n'],
  ) {
    super();
    this.hungUp = new Promise((ok) => this.once('close', () => ok()));
    void this.send(greeting);
  }
  _read() {}
  _write(chunk: Buffer, _e: BufferEncoding, cb: () => void) {
    this.pending += chunk.toString('latin1');
    let i = this.pending.indexOf('\r\n');
    while (i >= 0) {
      const line = this.pending.slice(0, i);
      this.pending = this.pending.slice(i + 2);
      i = this.pending.indexOf('\r\n');
      this.written.push(line);
      const [tag = '', ...rest] = line.split(' ');
      const cmd = rest.join(' ');
      const rule = this.rules.find(([re]) => re.test(cmd));
      void this.send(rule ? rule[1](tag, cmd) : /^(LOGIN|SELECT|LOGOUT)/.test(cmd) ? [`${tag} OK done\r\n`] : []);
    }
    cb();
  }
  /** Each chunk its own `data` event. */
  async send(chunks: (string | Buffer)[]) {
    for (const c of chunks) {
      await new Promise((ok) => setImmediate(ok));
      if (this.destroyed) return;
      this.push(typeof c === 'string' ? Buffer.from(c, 'latin1') : c);
    }
  }
  /** The commands, without their tags. */
  get commands() {
    return this.written.map((l) => l.slice(l.indexOf(' ') + 1));
  }
}

const OPTS: ImapOptions = { host: 'imap.test', port: 993, user: 'u', password: 'p', maxLiteral: 1024, timeoutMs: 1000 };
async function opened(rules: [RegExp, Reply][], o: Partial<ImapOptions> = {}) {
  const peer = new Peer(rules);
  net.peer = peer;
  const c = await ImapClient.open({ ...OPTS, ...o });
  return { c, peer };
}
const ok = (tag: string) => `${tag} OK done\r\n`;
/** A rule for `UID SEARCH`: these chunks, then the tagged OK. */
const search = (...chunks: (string | Buffer)[]): [RegExp, Reply] => [/^UID SEARCH/, (tag) => [...chunks, ok(tag)]];

describe('the IMAP client', () => {
  it('speaks TLS unless told `tls: false`', async () => {
    const a = await opened([]);
    expect(net.kinds).toEqual(['tls']);
    await a.c.logout();
    net.kinds = [];
    const b = await opened([], { tls: false });
    expect(net.kinds).toEqual(['net']);
    await b.c.logout();
  });

  it('refuses a credential with a line break, and sends nothing of it', async () => {
    const peer = new Peer([]);
    net.peer = peer;
    await expect(ImapClient.open({ ...OPTS, user: 'u\r\nA1 DELETE INBOX' })).rejects.toThrow(
      'a credential with a line break',
    );
    expect(peer.commands).toEqual([]);
    peer.destroy();
  });

  it('refuses a server that refuses the login, then the mailbox', async () => {
    const login = new Peer([[/^LOGIN/, (tag) => [`${tag} NO denied\r\n`]]]);
    net.peer = login;
    await expect(ImapClient.open(OPTS)).rejects.toThrow('the IMAP server refused the login');
    expect(login.commands).toEqual(['LOGIN "u" "p"']);
    const select = new Peer([[/^SELECT/, (tag) => [`${tag} NO no such\r\n`]]]);
    net.peer = select;
    await expect(ImapClient.open({ ...OPTS, mailbox: 'Letters' })).rejects.toThrow('no such mailbox');
    expect(select.commands).toEqual(['LOGIN "u" "p"', 'SELECT "Letters"']);
  });

  it('refuses a greeting that is not OK, and a server that hangs up before greeting', async () => {
    const bye = new Peer([], ['* BYE not today\r\n']);
    net.peer = bye;
    await expect(ImapClient.open(OPTS)).rejects.toThrow('the IMAP server refused the connection');
    expect(bye.commands).toEqual([]);
    bye.destroy();
    // Hung up: the failure is the hang-up, before any credential is looked at.
    const gone = new Peer([], []);
    net.peer = gone;
    const p = ImapClient.open({ ...OPTS, user: 'u\nv' });
    gone.destroy();
    await expect(p).rejects.toThrow('the IMAP server closed the connection');
  });

  it('reads an empty line, and a line split across two reads', async () => {
    const a = await opened([search('\r\n* SEARCH 4\r\n')]);
    expect(await a.c.unseen()).toEqual([4]);
    const b = await opened([search('* SEAR', 'CH 4 5\r\n')]);
    expect(await b.c.unseen()).toEqual([4, 5]);
  });

  it('reads a line of 8 KB exactly, in one read or across two, and hangs up past it', async () => {
    const line = `* SEARCH 7 ${'x'.repeat(8192 - 11)}`;
    expect(line.length).toBe(8192);
    const one = await opened([search(`${line}\r\n`)]);
    expect(await one.c.unseen()).toEqual([7]);
    const two = await opened([search(line, '\r\n')]);
    expect(await two.c.unseen()).toEqual([7]);
    const over = await opened([search(`${line}x\r\n`)]);
    await expect(over.c.unseen()).rejects.toThrow('an IMAP line over 8 KB');
    // Past 8 KB without an end of line: hung up at once, the rest never awaited.
    const open = await opened([[/^UID SEARCH/, () => [`${line}x`]]], { timeoutMs: 1500 });
    await expect(open.c.unseen()).rejects.toThrow('an IMAP line over 8 KB');
  });

  it('joins a response line with its literals up to 64 KB exactly', async () => {
    // Eight pieces of 8190 characters, each ending with an empty literal, then 16: 65,536 joined.
    const pieces = Array.from({ length: 8 }, () => `${'y'.repeat(8187)}{0}\r\n`);
    expect(pieces.join('').replaceAll('\r\n', '').length).toBe(65_520);
    const exact = await opened([search(...pieces, `${'z'.repeat(16)}\r\n`)]);
    expect(await exact.c.unseen()).toEqual([]);
    const over = await opened([search(...pieces, `${'z'.repeat(17)}\r\n`)]);
    await expect(over.c.unseen()).rejects.toThrow('an IMAP response line over 64 KB');
  });

  it('reads a response of exactly 1 MB plus twice the largest literal, and hangs up one byte past it', async () => {
    const maxLiteral = 1024;
    const limit = 1024 * 1024 + 2 * maxLiteral;
    /** Untagged lines of 8,000 characters, then one to make `total` bytes with the tagged answer (w3: after SELECT). */
    const response = (total: number) => {
      const tagged = 'w3 OK done\r\n';
      const rest = total - tagged.length;
      const k = Math.floor((rest - 10) / 8002);
      const r = rest - k * 8002 - 2;
      expect(r).toBeGreaterThanOrEqual(2);
      return `${`* ${'q'.repeat(7998)}\r\n`.repeat(k)}* ${'r'.repeat(r - 2)}\r\n${tagged}`;
    };
    expect(response(limit).length).toBe(limit);
    const exact = await opened([[/^UID SEARCH/, () => [response(limit)]]], { maxLiteral });
    expect(await exact.c.unseen()).toEqual([]);
    const over = await opened([[/^UID SEARCH/, () => [response(limit + 1)]]], { maxLiteral });
    await expect(over.c.unseen()).rejects.toThrow('an IMAP response over its size');
  });

  it('reads 64 literals in one response, and hangs up at the 65th', async () => {
    const lits = (n: number) => '* 1 FETCH (X {0}\r\n)\r\n'.repeat(n);
    const exact = await opened([search(lits(64))]);
    expect(await exact.c.unseen()).toEqual([]);
    const over = await opened([search(lits(65))]);
    await expect(over.c.unseen()).rejects.toThrow('too many IMAP literals');
  });

  it('reads a literal of `maxLiteral` bytes, twice, and hangs up on one byte more', async () => {
    const body = (s: string) => `* 1 FETCH (BODY[] {${s.length}}\r\n${s})\r\n`;
    const fetchRule = (...bodies: string[]): [RegExp, Reply] => [/^UID FETCH/, (tag) => [...bodies.map(body), ok(tag)]];
    const two = await opened([fetchRule('a'.repeat(10), 'b'.repeat(10))], { maxLiteral: 10 });
    expect(Buffer.from((await two.c.fetch(1))!).toString()).toBe('a'.repeat(10));
    const big = await opened([fetchRule('c'.repeat(11))], { maxLiteral: 10 });
    await expect(big.c.fetch(1)).rejects.toThrow('an IMAP literal over the limit');
    // An empty literal is a body all the same.
    const empty = await opened([fetchRule('')], { maxLiteral: 10 });
    expect(await empty.c.fetch(1)).toEqual(new Uint8Array(0));
  });

  it('takes the literal of the BODY[] response, and no body when there is none', async () => {
    const both = await opened([
      [
        /^UID FETCH/,
        (tag) => ['* 1 FETCH (FLAGS (\\Seen) X {3}\r\nabc)\r\n', '* 1 FETCH (BODY[] {5}\r\nhello)\r\n', ok(tag)],
      ],
    ]);
    expect(Buffer.from((await both.c.fetch(1))!).toString()).toBe('hello');
    const none = await opened([[/^UID FETCH/, (tag) => ['* 1 FETCH (UID 1)\r\n', ok(tag)]]]);
    expect(await none.c.fetch(1)).toBeNull();
  });

  it('reads no size from a continuation request, nor without one: an infinite size', async () => {
    const plus = await opened([[/^UID FETCH/, (tag) => ['+ RFC822.SIZE 5\r\n', ok(tag)]]]);
    expect(await plus.c.size(1)).toBe(Number.POSITIVE_INFINITY);
    const none = await opened([[/^UID FETCH/, (tag) => ['* 1 FETCH (UID 1)\r\n', ok(tag)]]]);
    expect(await none.c.size(1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('collects 1000 untagged responses, and hangs up at the 1001st', async () => {
    const exact = await opened([search('* OK x\r\n'.repeat(999), '* SEARCH 3\r\n')]);
    expect(await exact.c.unseen()).toEqual([3]);
    const over = await opened([search('* OK x\r\n'.repeat(1001))]);
    await expect(over.c.unseen()).rejects.toThrow('too many IMAP responses');
  });

  it('answers no UID to a search the server refused', async () => {
    const no = await opened([[/^UID SEARCH/, (tag) => ['* SEARCH 1 2\r\n', `${tag} NO busy\r\n`]]]);
    expect(await no.c.unseen()).toEqual([]);
  });

  it('once dead, stays dead for its first reason, and sends nothing more', async () => {
    const { c, peer } = await opened([search(`* ${'x'.repeat(9000)}\r\n`)]);
    await expect(c.unseen()).rejects.toThrow('an IMAP line over 8 KB');
    await peer.hungUp;
    const sent = peer.written.length;
    await expect(c.unseen()).rejects.toThrow('an IMAP line over 8 KB');
    expect(peer.written.length).toBe(sent);
  });

  it('says LOGOUT when it leaves', async () => {
    const { c, peer } = await opened([]);
    await c.logout();
    expect(peer.commands).toEqual(['LOGIN "u" "p"', 'SELECT "INBOX"', 'LOGOUT']);
  });
});

// --- the MIME reader's worker -----------------------------------------------------------------------------------------

/** A worker from its source: ready, then `onMessage` for each message. */
const workerOf = (onMessage: string) =>
  new URL(
    `data:text/javascript,${encodeURIComponent(
      `import { parentPort } from 'node:worker_threads';\nparentPort.postMessage({ ready: true });\nparentPort.on('message', (m) => { ${onMessage} });`,
    )}`,
  );
const RESULT = "{ ok: false, reason: 'from the test worker' }";
const workerIn = (p: MimeParser) => (p as unknown as { worker: Promise<Worker> | null }).worker!;

describe("the MIME reader's worker", () => {
  it('refuses the message when the reader cannot start', async () => {
    const p = new MimeParser({
      workerUrl: new URL(`data:text/javascript,${encodeURIComponent('throw new Error("no")')}`),
    });
    expect(await p.parse(new Uint8Array(1))).toEqual({ ok: false, reason: 'the reader could not start' });
    await p.close();
  });

  it("takes only its own message's answer", async () => {
    const p = new MimeParser({
      workerUrl: workerOf(
        `parentPort.postMessage({ id: m.id + 1000, result: { ok: false, reason: 'not mine' } }); parentPort.postMessage({ id: m.id, result: ${RESULT} });`,
      ),
    });
    expect(await p.parse(new Uint8Array(1))).toEqual({ ok: false, reason: 'from the test worker' });
    await p.close();
  });

  it("lets the reader's stdout through, keeps its stderr, and stops it on close", async () => {
    const p = new MimeParser({
      workerUrl: workerOf(
        `if (m.id > 1) { process.stdout.write('reader-out'); process.stderr.write('reader-err'); } parentPort.postMessage({ id: m.id, result: ${RESULT} });`,
      ),
    });
    await p.parse(new Uint8Array(1));
    const w = await workerIn(p);
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const seen = (s: NodeJS.ReadableStream) => new Promise<void>((ok) => s.on('data', () => ok()));
    const both = Promise.all([seen(w.stdout), seen(w.stderr)]);
    await p.parse(new Uint8Array(1));
    await both;
    expect(out.mock.calls.map((c) => String(c[0]))).toContain('reader-out');
    expect(err.mock.calls.map((c) => String(c[0]))).not.toContain('reader-err');
    out.mockRestore();
    err.mockRestore();
    await p.close();
    expect(w.threadId).toBe(-1);
  });
});

// --- the connector --------------------------------------------------------------------------------------------------

const PLAYER = 'p-0123456789abcdef';
const OTHER = 'p-fedcba9876543210';
const DECL = {
  answers: [{ words: ['open', 'door'], signal: 'letter.door' }],
  otherwise: 'letter.unclear',
};
const manifestWith = (email?: unknown) => ({ connectors: email ? { email } : {} }) as unknown as RealityManifest;

function fakeCtx(o: Partial<Pick<ConnectorContext, 'pair' | 'propose' | 'manifest'>> = {}) {
  const proposed: ProposeResult = { ok: true, sequence: 1, duplicate: false };
  return {
    bridge: { url: 'http://bridge.test/', token: 't' },
    gameId: 'signals',
    limits: {} as ConnectorContext['limits'],
    manifest: o.manifest ?? manifestWith(DECL),
    log: vi.fn(),
    propose: vi.fn(o.propose ?? (async () => proposed)),
    pair: vi.fn(o.pair ?? (async () => ({ ok: true as const, playerId: PLAYER }))),
    reject: vi.fn(),
    metrics: vi.fn(),
  } satisfies ConnectorContext;
}

const MAIL: ParsedMail = {
  messageId: 'm1@player.example',
  to: [],
  from: 'robin@player.example',
  subject: '',
  text: 'please open the door',
  attachments: 0,
  truncated: false,
};
/** The raw message the fake reader reads: the mail as JSON, or `unreadable`. */
const raw = (over: Partial<ParsedMail> = {}) => new Uint8Array(Buffer.from(JSON.stringify({ ...MAIL, ...over })));
const tagged = (player = PLAYER) => ({ to: [`gate+${player}@garden.example`] });

/** A connector whose MIME reader reads JSON (no worker). */
function connector(c: Partial<EmailConfig> = {}) {
  const e = new EmailConnector({ mode: 'webhook', domain: 'garden.example', ...c });
  made.push(e);
  const parse = vi.fn(async (b: Uint8Array): Promise<MimeResult> => {
    const s = Buffer.from(b).toString();
    return s === 'unreadable' ? { ok: false, reason: 'no' } : { ok: true, mail: JSON.parse(s) as ParsedMail };
  });
  (e as unknown as { parser: unknown }).parser = { parse, close: async () => {} };
  return { e, parse };
}
/** Started without a server: `handle` only. */
async function handling(c: Partial<EmailConfig> = {}, ctx = fakeCtx()) {
  const { e } = connector(c);
  (e as unknown as { ctx: ConnectorContext }).ctx = ctx;
  return { e, ctx };
}

describe('the configuration', () => {
  const dir = mkdtempSync(join(tmpdir(), 'email-edge-'));
  writeFileSync(join(dir, 'secret'), 'from-the-file\n');
  it('reads each secret from its file, and only the mode given', () => {
    const w = emailConfig({ mode: 'webhook', webhook: { port: 0, secretFile: 'secret' } }, dir);
    expect(w.webhook?.secret).toBe('from-the-file');
    expect('imap' in w).toBe(false);
    const i = emailConfig({ mode: 'imap', imap: { host: 'h', user: 'u', passwordFile: 'secret' } }, dir);
    expect(i.imap?.password).toBe('from-the-file');
    expect('webhook' in i).toBe(false);
  });
  it('refuses another mode', () => {
    expect(() => emailConfig({ mode: 'smtp' }, dir)).toThrow('email: "mode" is "webhook" or "imap"');
  });
  it('refuses to start a mode without its secret', async () => {
    await expect(new EmailConnector({ mode: 'webhook' }).start(fakeCtx())).rejects.toThrow(
      'email: webhook mode needs "webhook.secretFile"',
    );
    await expect(new EmailConnector({ mode: 'imap' }).start(fakeCtx())).rejects.toThrow(
      'email: imap mode needs "imap.passwordFile"',
    );
  });
});

describe('one message', () => {
  it('is refused as stopped without a context', async () => {
    const { e } = connector();
    expect(await e.handle(raw(tagged()))).toEqual({ kind: 'rejected', reason: 'stopped' });
  });

  it('is read up to `maxBytes` exactly', async () => {
    const bytes = raw(tagged());
    const { e, ctx } = await handling({ maxBytes: bytes.length });
    expect((await e.handle(bytes)).kind).toBe('proposed');
    expect(await e.handle(raw({ ...tagged(), messageId: 'm22@player.example' }))).toEqual({
      kind: 'rejected',
      reason: 'too-large',
    });
    expect(ctx.reject).toHaveBeenCalledWith('too-large');
  });

  it('is refused when unreadable, undeclared or unanswered, each for its reason', async () => {
    const a = await handling();
    expect(await a.e.handle(new Uint8Array(Buffer.from('unreadable')))).toEqual({
      kind: 'rejected',
      reason: 'unreadable',
    });
    const b = await handling({}, fakeCtx({ manifest: manifestWith() }));
    expect(await b.e.handle(raw(tagged()))).toEqual({ kind: 'rejected', reason: 'not-declared' });
    const c = await handling({}, fakeCtx({ manifest: manifestWith({ answers: DECL.answers }) }));
    expect(await c.e.handle(raw({ ...tagged(), text: 'hello' }))).toEqual({ kind: 'rejected', reason: 'no-answer' });
    expect(c.ctx.reject).toHaveBeenCalledWith('no-answer');
    expect(c.ctx.propose).not.toHaveBeenCalled();
  });

  it('is refused without a player: no tag, no link', async () => {
    const { e, ctx } = await handling();
    expect(await e.handle(raw())).toEqual({ kind: 'rejected', reason: 'no-player' });
    expect(ctx.propose).not.toHaveBeenCalled();
  });

  it('names the refusal of a pairing code', async () => {
    const { e, ctx } = await handling({}, fakeCtx({ pair: async () => ({ ok: false, refusal: 'denied' }) }));
    expect(await e.handle(raw({ subject: 'code: ABCDEFGH' }))).toEqual({ kind: 'rejected', reason: 'pairing-denied' });
    expect(ctx.reject).toHaveBeenCalledWith('pairing-denied');
  });

  it('links no sender when the code came without one', async () => {
    const { e } = await handling();
    expect(await e.handle(raw({ from: '', subject: 'ABCDEFGH' }))).toEqual({ kind: 'paired', playerId: PLAYER });
    expect((e as unknown as { links: Map<string, unknown> }).links.size).toBe(0);
    expect(await e.handle(raw({ from: '', messageId: 'm2@x' }))).toEqual({ kind: 'rejected', reason: 'no-player' });
  });

  it("routes a linked sender's mail until the very instant its link ends", async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-13T10:00:00Z') });
    const T = Date.now();
    const { e, ctx } = await handling({ linkDays: 1 });
    expect((await e.handle(raw({ subject: 'pair ABCDEFGH' }))).kind).toBe('paired');
    vi.setSystemTime(T + 86_400_000 - 1);
    expect((await e.handle(raw({ messageId: 'm3@x' }))).kind).toBe('proposed');
    expect(ctx.propose).toHaveBeenLastCalledWith(expect.objectContaining({ playerId: PLAYER }));
    vi.setSystemTime(T + 86_400_000);
    expect(await e.handle(raw({ messageId: 'm4@x' }))).toEqual({ kind: 'rejected', reason: 'no-player' });
  });
});

describe('the sender links, at most 10,000', () => {
  const T = Date.parse('2026-10-13T10:00:00Z');
  /** A connector with `n` links, each until `until(i)`, written as `link` writes them. */
  function filled(n: number, until: (i: number) => number) {
    const { e } = connector({ linkDays: 1 });
    const links = (e as unknown as { links: Map<string, { playerId: string; until: number }> }).links;
    for (let i = 0; i < n; i++) links.set(`k${i}`, { playerId: OTHER, until: until(i) });
    const link = (k: string) => (e as unknown as { link(s: string, p: string): void }).link(k, PLAYER);
    return { links, link };
  }

  it('forgets the oldest when full of live links', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: T });
    const { links, link } = filled(10_000, () => T + 1);
    link('new');
    expect(links.size).toBe(10_000);
    expect(links.has('k0')).toBe(false);
    expect(links.has('k1')).toBe(true);
    expect(links.get('new')).toEqual({ playerId: PLAYER, until: T + 86_400_000 });
  });

  it('when full, sweeps the links already over (not one ending now) and keeps the oldest live one', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: T });
    const { links, link } = filled(10_000, (i) => (i === 1 || i === 2 ? T - 1 : i === 3 ? T : T + 1));
    link('new');
    expect(links.size).toBe(9_999);
    expect([links.has('k0'), links.has('k1'), links.has('k2'), links.has('k3')]).toEqual([true, false, false, true]);
  });

  it('sweeps nothing before it is full', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: T });
    const { links, link } = filled(2, (i) => (i ? T - 1 : T + 1));
    link('new');
    expect(links.size).toBe(3);
  });
});

// --- the webhook ------------------------------------------------------------------------------------------------------

const SECRET = 'edge-secret';
const sign = (body: Uint8Array, at: number | string = Math.floor(Date.now() / 1000), t: number | string = at) => ({
  'X-Web-Scumm-Timestamp': String(at),
  'X-Web-Scumm-Signature': `sha256=${createHmac('sha256', SECRET).update(`${t}.`).update(body).digest('hex')}`,
});
async function webhook(o: Partial<NonNullable<EmailConfig['webhook']>> = {}, ctx = fakeCtx()) {
  const { e, parse } = connector({ webhook: { port: 0, secret: SECRET, ...o } });
  await e.start(ctx);
  const url = `http://127.0.0.1:${e.port}/v1/inbound`;
  const post = (body: Uint8Array, headers: Record<string, string> = sign(body), at = url) =>
    fetch(at, { method: 'POST', body: Buffer.from(body), headers });
  return { e, ctx, parse, url, post };
}
const answer = async (r: Response) => ({ status: r.status, body: await r.json() });

describe('the webhook', () => {
  it('answers 404 to anything but POST /v1/inbound, and counts no rejected input for it', async () => {
    const { e, ctx, url, post } = await webhook();
    expect(await answer(await fetch(url))).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await answer(await post(raw(tagged()), sign(raw(tagged())), `${url}x`))).toEqual({
      status: 404,
      body: { error: 'not-found' },
    });
    expect(ctx.reject).not.toHaveBeenCalled();
    await e.stop();
  });

  it('answers 429 past its budget per address', async () => {
    const { e, post } = await webhook({ perMinutePerIp: 1 });
    expect((await post(raw(tagged()))).status).toBe(202);
    expect(await answer(await post(raw(tagged())))).toEqual({ status: 429, body: { error: 'rate' } });
    await e.stop();
  });

  it('says accepted, then duplicate', async () => {
    let duplicate = false;
    const ctx = fakeCtx({ propose: async () => ({ ok: true, sequence: 1, duplicate }) });
    const { e, post } = await webhook({}, ctx);
    expect(await answer(await post(raw(tagged())))).toEqual({ status: 202, body: { status: 'accepted' } });
    duplicate = true;
    expect(await answer(await post(raw(tagged())))).toEqual({ status: 200, body: { status: 'duplicate' } });
    await e.stop();
  });

  it('answers 500 internal when something else fails, and counts no rejected input for it', async () => {
    // A secret written as a number in the JSON passes `readSecret` and the start; node:crypto refuses it per request.
    const { e, ctx, post } = await webhook({ secret: 42 as unknown as string });
    expect(await answer(await post(raw(tagged())))).toEqual({ status: 500, body: { error: 'internal' } });
    expect(ctx.reject).not.toHaveBeenCalled();
    await e.stop();
  });

  it('takes a timestamp of digits only, and one exactly `toleranceS` old', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-13T10:00:00Z') });
    const now = Math.floor(Date.now() / 1000);
    const { e, ctx, post } = await webhook({ toleranceS: 60 });
    const body = raw(tagged());
    // `1760349600.0` reads as the right number, and is signed as such: refused all the same.
    expect(await answer(await post(body, sign(body, `${now}.0`, now)))).toEqual({
      status: 401,
      body: { error: 'stale' },
    });
    expect(ctx.reject).toHaveBeenLastCalledWith('stale');
    expect((await post(body, sign(body, now - 60))).status).toBe(202);
    expect((await post(body, sign(body, now - 61))).status).toBe(401);
    await e.stop();
  });

  it('answers 401 signature to a post without a signature', async () => {
    const { e, post } = await webhook();
    const body = raw(tagged());
    const { 'X-Web-Scumm-Timestamp': ts } = sign(body);
    expect(await answer(await post(body, { 'X-Web-Scumm-Timestamp': ts }))).toEqual({
      status: 401,
      body: { error: 'signature' },
    });
    await e.stop();
  });

  it('answers 503 to a request that comes while it stops', async () => {
    const { e, parse, post } = await webhook();
    let release = () => {};
    parse.mockImplementationOnce(
      () =>
        new Promise<MimeResult>((ok) => {
          release = () => ok({ ok: false, reason: 'late' });
        }),
    );
    const server = (e as unknown as { server: import('node:http').Server }).server;
    const onRequest = server.listeners('request')[0] as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    const inFlight = post(raw(tagged()));
    await vi.waitFor(() => expect(parse).toHaveBeenCalled());
    const stopped = e.stop();
    const sent: unknown[] = [];
    const res = {
      headersSent: false,
      writeHead: (status: number) => sent.push(status),
      end: (s: string) => sent.push(JSON.parse(s)),
    } as unknown as ServerResponse;
    const req = { method: 'POST', url: '/v1/inbound', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    await onRequest(req as unknown as IncomingMessage, res);
    expect(sent).toEqual([503, { error: 'stopping' }]);
    release();
    expect((await inFlight).status).toBe(422);
    await stopped;
  });
});

// --- the IMAP pass ----------------------------------------------------------------------------------------------------

/** A mailbox behind a fake client: what each call answers, and what was asked of it. */
function mailbox(o: { unseen?: number[]; sizes?: Record<number, number>; bodies?: Record<number, Uint8Array | null> }) {
  const client = {
    unseen: vi.fn(async () => o.unseen ?? []),
    size: vi.fn(async (uid: number) => o.sizes?.[uid] ?? 10),
    fetch: vi.fn(async (uid: number) => (o.bodies && uid in o.bodies ? o.bodies[uid]! : raw(tagged()))),
    flag: vi.fn(async (_uid: number, _flags: string[]) => {}),
    seenBefore: vi.fn(async (_d: Date) => [] as number[]),
    expunge: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
  const open = vi.spyOn(ImapClient, 'open').mockImplementation(async () => client as unknown as ImapClient);
  return { client, open };
}
const IMAP = { host: '127.0.0.1', user: 'u', password: 'p', pollS: 1 };
const imapConnector = (imap: Partial<NonNullable<EmailConfig['imap']>> = {}, c: Partial<EmailConfig> = {}) =>
  connector({ mode: 'imap', imap: { ...IMAP, ...imap }, ...c }).e;

describe('the IMAP pass', () => {
  /** The connector's own timers: the next pass, `pollS` (7 s here) from the last. */
  const passes = () => {
    const set = vi.spyOn(globalThis, 'setTimeout');
    return () => set.mock.calls.filter(([, ms]) => ms === 7000).length;
  };

  it('polls at start, then every `pollS`, and no more once stopped', async () => {
    vi.useFakeTimers();
    const scheduled = passes();
    const { open } = mailbox({});
    const e = imapConnector({ pollS: 7 });
    await e.start(fakeCtx());
    expect(open).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7000);
    expect(open).toHaveBeenCalledTimes(2);
    await e.stop();
    const after = scheduled();
    await vi.advanceTimersByTimeAsync(21_000);
    expect(open).toHaveBeenCalledTimes(2);
    expect(scheduled()).toBe(after);
  });

  it('started twice, polls no more once stopped: the first chain of passes stops too (4.3.0)', async () => {
    // Kills connector.ts tick's `if (this.stopping) return;` → false. RealityConnector.start does not say it runs once:
    // a second start begins a second chain of passes, both writing `this.timer`, and stop() clears the last one only.
    // The first chain's timer still fires after stop; the guard is what keeps it from opening the mailbox again.
    vi.useFakeTimers();
    const { open } = mailbox({});
    const e = imapConnector({ pollS: 7 });
    await e.start(fakeCtx());
    await e.start(fakeCtx());
    await vi.advanceTimersByTimeAsync(0);
    const n = open.mock.calls.length;
    await e.stop();
    await vi.advanceTimersByTimeAsync(21_000);
    expect(open).toHaveBeenCalledTimes(n);
  });

  it('schedules no next pass when it stops during one', async () => {
    vi.useFakeTimers();
    const scheduled = passes();
    const { client } = mailbox({});
    let release = (_: number[]) => {};
    client.unseen.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          release = ok;
        }),
    );
    const e = imapConnector({ pollS: 7 });
    await e.start(fakeCtx());
    await vi.advanceTimersByTimeAsync(0);
    expect(client.unseen).toHaveBeenCalled();
    const stopped = e.stop();
    release([]);
    await stopped;
    expect(scheduled()).toBe(0);
  });

  it('reads no further message once stopping', async () => {
    const { client } = mailbox({ unseen: [1, 2] });
    let release = (_: number) => {};
    client.size.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          release = ok;
        }),
    );
    const e = imapConnector();
    await e.start(fakeCtx());
    await vi.waitFor(() => expect(client.size).toHaveBeenCalled());
    const stopped = e.stop();
    release(Number.MAX_SAFE_INTEGER);
    await stopped;
    expect(client.size.mock.calls).toEqual([[1]]);
    expect(client.flag.mock.calls).toEqual([[1, ['\\Seen', '\\Flagged']]]);
  });

  it('passes its mailbox, and TLS unless told otherwise', async () => {
    const { open } = mailbox({});
    const e = imapConnector({ mailbox: 'Letters', port: 1993 });
    (e as unknown as { ctx: ConnectorContext }).ctx = fakeCtx();
    await e.poll();
    const o = open.mock.calls[0]![0];
    expect(o).toEqual({
      host: '127.0.0.1',
      port: 1993,
      user: 'u',
      password: 'p',
      maxLiteral: 256 * 1024,
      mailbox: 'Letters',
    });
    expect('tls' in o).toBe(false);
  });

  it('reads an empty mailbox name (the file is not validated) as none: INBOX, never an empty one', async () => {
    const { open } = mailbox({});
    const e = imapConnector({ mailbox: '' });
    (e as unknown as { ctx: ConnectorContext }).ctx = fakeCtx();
    await e.poll();
    expect('mailbox' in open.mock.calls[0]![0]).toBe(false);
  });

  it('flags a message over `maxBytes` unread, and reads one of `maxBytes` exactly', async () => {
    const { client } = mailbox({ unseen: [1, 2], sizes: { 1: 101, 2: 100 } });
    const ctx = fakeCtx();
    const e = imapConnector({}, { maxBytes: 100 });
    (e as unknown as { ctx: ConnectorContext }).ctx = ctx;
    await e.poll();
    expect(client.fetch.mock.calls).toEqual([[2]]);
    expect(ctx.reject).toHaveBeenCalledWith('too-large');
    expect(client.flag.mock.calls[0]).toEqual([1, ['\\Seen', '\\Flagged']]);
  });

  it('flags a message whose body never came, and the pass goes on', async () => {
    const { client } = mailbox({ unseen: [1], bodies: { 1: null } });
    const ctx = fakeCtx();
    const e = imapConnector();
    (e as unknown as { ctx: ConnectorContext }).ctx = ctx;
    await e.poll();
    expect(client.flag.mock.calls).toEqual([[1, ['\\Seen', '\\Flagged']]]);
    expect(ctx.log).toHaveBeenCalledWith('email.polled', { deleted: 0 });
  });

  it('leaves unseen a message whose pairing failed for a while', async () => {
    const { client } = mailbox({ unseen: [1], bodies: { 1: raw({ subject: 'ABCDEFGH' }) } });
    const ctx = fakeCtx({ pair: async () => ({ ok: false, refusal: 'unreachable' }) });
    const e = imapConnector();
    (e as unknown as { ctx: ConnectorContext }).ctx = ctx;
    await e.poll();
    expect(client.flag).not.toHaveBeenCalled();
  });

  it('keeps an accepted message Seen when it keeps messages, and sweeps from `keepDays` ago', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-13T10:00:00Z') });
    const { client } = mailbox({ unseen: [1] });
    const e = imapConnector({ keepDays: 2 });
    (e as unknown as { ctx: ConnectorContext }).ctx = fakeCtx();
    await e.poll();
    expect(client.flag.mock.calls).toEqual([[1, ['\\Seen']]]);
    expect(client.seenBefore.mock.calls).toEqual([[new Date(Date.parse('2026-10-11T10:00:00Z'))]]);
    expect(client.expunge).not.toHaveBeenCalled();
  });

  it('sweeps nothing and expunges nothing when it keeps no message and deleted none', async () => {
    const { client } = mailbox({ unseen: [] });
    const e = imapConnector();
    (e as unknown as { ctx: ConnectorContext }).ctx = fakeCtx();
    await e.poll();
    expect(client.seenBefore).not.toHaveBeenCalled();
    expect(client.expunge).not.toHaveBeenCalled();
  });

  it('is healthy for three poll intervals after a good pass, and says why not', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-13T10:00:00Z') });
    const T = Date.now();
    const { client, open } = mailbox({});
    let release = (_: number[]) => {};
    client.unseen.mockImplementationOnce(
      () =>
        new Promise((ok) => {
          release = ok;
        }),
    );
    const e = imapConnector({ pollS: 3600 });
    await e.start(fakeCtx());
    expect((await e.health()).detail).toBe('not polled yet');
    release([]);
    await e.poll();
    vi.setSystemTime(T + 3 * 3_600_000 - 1);
    expect((await e.health()).ok).toBe(true);
    vi.setSystemTime(T + 3 * 3_600_000);
    expect(await e.health()).toEqual(expect.objectContaining({ ok: false, detail: 'the last poll failed' }));
    open.mockRejectedValueOnce(new Error('down'));
    await e.poll();
    expect((await e.health()).detail).toBe('the last poll failed');
    await e.stop();
  });
});
