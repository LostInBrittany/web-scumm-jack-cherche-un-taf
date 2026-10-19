// The edges of the terminal connectors (connectors/src/terminal/guard.ts, shell.ts, telnet/connector.ts,
// ssh/connector.ts), each test written for a mutant of `connectors-edge` the other terminal tests let live (4.1.20 PR
// 2d, plan §7.1; tools/mutate.ts, docs/dev/MUTANTS.md): the address gate and the session guard at each bound, the
// resume words and their bound of 10,000, the shell's every branch, Telnet negotiation byte for byte, and both
// servers' sessions, closes and refusals. No network for a session: a Telnet session is a fake socket, an SSH one a
// fake ssh2 connection (its authentication contexts, session and channel), handed to the connector's own handler.
// The servers that start listen on 127.0.0.1, port 0, and nobody connects to them. Clocks are injected or faked.
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorContext, ProposeResult } from '../connectors/src/sdk';
import { SshConnector, sshConfig, wrap } from '../connectors/src/ssh/connector';
import { TelnetConnector, TelnetFilter } from '../connectors/src/telnet/connector';
import { AddressGate, SessionGuard, TERMINAL_LIMITS, type TerminalLimits } from '../connectors/src/terminal/guard';
import { bindPlayer, ResumeWords, VirtualShell } from '../connectors/src/terminal/shell';
import { MANIFEST, sshKeyPair } from './fixtures/connectors/harness';

const CODE = 'ABCDEFGH';
const PLAYER = 'p-0123456789abcdef';
const TELNET = MANIFEST.connectors!.telnet!;
const SSH = MANIFEST.connectors!.ssh!;

/** Settles the promises a line starts (pairing, proposing): a few turns of the event loop. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise<void>((ok) => setImmediate(ok));
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

type Pair = Awaited<ReturnType<ConnectorContext['pair']>>;
function fakeCtx(o: { pair?: (code: string) => Promise<Pair>; propose?: () => Promise<ProposeResult> } = {}) {
  return {
    bridge: { url: 'http://bridge.test/', token: 't' },
    gameId: 'signals',
    limits: {} as ConnectorContext['limits'],
    manifest: MANIFEST,
    log: vi.fn(),
    propose: vi.fn(o.propose ?? (async (): Promise<ProposeResult> => ({ ok: true, sequence: 1, duplicate: false }))),
    pair: vi.fn(
      o.pair ??
        (async (code: string): Promise<Pair> =>
          code === CODE ? { ok: true, playerId: PLAYER } : { ok: false, refusal: 'denied' }),
    ),
    reject: vi.fn(),
    metrics: vi.fn(),
  } satisfies ConnectorContext;
}
type Ctx = ReturnType<typeof fakeCtx>;
const logged = (ctx: Ctx, event: string) => ctx.log.mock.calls.filter((c) => c[0] === event).length;
const rejected = (ctx: Ctx, reason: string) => ctx.reject.mock.calls.filter((c) => c[0] === reason).length;

/** Whatever must be closed after a test (sessions hold the guard's timers). */
const after: (() => unknown)[] = [];
afterEach(async () => {
  for (const f of after.splice(0).reverse()) await f();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- the address gate and the session guard ------------------------------------------------------------------------

const limits = (o: Partial<TerminalLimits>): TerminalLimits => ({ ...TERMINAL_LIMITS, ...o });
const sizes = (g: AddressGate) => g as unknown as { open: Map<string, number>; wrong: Map<string, number[]> };

describe('the address gate', () => {
  it('forgets a wrong code exactly `triesWindowMs` after it', () => {
    let t = 0;
    const g = new AddressGate(limits({ triesPerAddress: 1, triesWindowMs: 100 }), () => t);
    expect(g.failed('a')).toBe(true);
    t = 99;
    expect(g.enter('a')).toBe(false);
    t = 100;
    expect(g.enter('a')).toBe(true);
  });

  it('keeps nothing for an address without wrong codes or open connections', () => {
    const g = new AddressGate(limits({}), () => 0);
    expect(g.enter('a')).toBe(true);
    expect(sizes(g).wrong.size).toBe(0);
    g.leave('a');
    expect(sizes(g).open.size).toBe(0);
  });

  it('counts down on leave: one connection left still counts', () => {
    const g = new AddressGate(limits({ perAddress: 2 }), () => 0);
    expect(g.enter('a')).toBe(true);
    expect(g.enter('a')).toBe(true);
    g.leave('a');
    expect(g.enter('a')).toBe(true);
    expect(g.enter('a')).toBe(false);
  });

  it('sweeps the expired addresses only above 10,000 of them', () => {
    let t = 0;
    let reads = 0;
    const g = new AddressGate(limits({ triesWindowMs: 1000 }), () => {
      reads++;
      return t;
    });
    for (let i = 0; i < 10_000; i++) g.failed(`10.0.${i >> 8}.${i & 255}`);
    expect(sizes(g).wrong.size).toBe(10_000);
    // At 10,000 a wrong code reads the clock twice (its own window, its own time): no sweep.
    reads = 0;
    g.failed('x');
    expect(reads).toBe(2);
    expect(sizes(g).wrong.size).toBe(10_001);
    // Above, the expired ones go first.
    t = 5000;
    g.failed('y');
    expect(sizes(g).wrong.size).toBe(1);
  });

  it('reads the clock twice for a wrong code below the bound, whatever the others', () => {
    let reads = 0;
    const g = new AddressGate(limits({}), () => {
      reads++;
      return 0;
    });
    g.failed('a');
    g.failed('b');
    reads = 0;
    g.failed('c');
    expect(reads).toBe(2);
  });
});

describe('the session guard', () => {
  it('starts a new second exactly 1000 ms after the last, and takes exactly `bytesPerSecond`', () => {
    let t = 5000;
    const g = new SessionGuard(
      limits({ bytesPerSecond: 10 }),
      () => {},
      () => t,
    );
    after.push(() => g.dispose());
    expect(g.bytes(10)).toBe(true);
    t = 6000;
    expect(g.bytes(10)).toBe(true);
    expect(g.bytes(1)).toBe(false);
  });

  it('forgets a line exactly a minute after it', () => {
    let t = 0;
    const g = new SessionGuard(
      limits({ linesPerMinute: 1 }),
      () => {},
      () => t,
    );
    after.push(() => g.dispose());
    expect(g.line()).toBe(true);
    t = 59_999;
    expect(g.line()).toBe(false);
    t = 60_000;
    expect(g.line()).toBe(true);
  });
});

// --- resume words, pairing, the shell --------------------------------------------------------------------------------

const words = (r: ResumeWords) => (r as unknown as { m: Map<string, unknown> }).m;
/** Fills the words up to exactly 10,000 (a word drawn twice is drawn again). */
function fill(r: ResumeWords) {
  const first = r.issue(PLAYER);
  const second = r.issue(PLAYER);
  while (words(r).size < 10_000) r.issue(PLAYER);
  return { first, second };
}

describe('resume words', () => {
  it('a word lives until exactly its time to live; an unknown word is no one', () => {
    let t = 0;
    const r = new ResumeWords(10, () => t);
    const w = r.issue(PLAYER);
    t = 9;
    expect(r.take(w.toLowerCase())).toBe(PLAYER);
    t = 10;
    expect(r.take(w)).toBeNull();
    expect(r.take('RAAAA-AAAA')).toBeNull();
  });

  it('keeps the expired words below 10,000, and never drops a word it needs not', () => {
    let t = 0;
    const r = new ResumeWords(10, () => t);
    const a = r.issue(PLAYER);
    t = 100;
    const b = r.issue('p-2');
    expect(words(r).size).toBe(2);
    expect(words(r).has(a)).toBe(true);
    expect(r.take(b)).toBe('p-2');
  });

  it('at 10,000, sweeps the words expired before now (not those expiring now), then drops the oldest', () => {
    let t = 0;
    const r = new ResumeWords(10, () => t);
    const { first } = fill(r);
    t = 10; // every word expires now: none is swept, the oldest makes room
    r.issue(PLAYER);
    expect(words(r).size).toBe(10_000);
    expect(words(r).has(first)).toBe(false);
    t = 11; // all but the last are expired: swept, nothing else dropped
    const last = r.issue('p-3');
    expect(words(r).size).toBe(2);
    expect(r.take(last)).toBe('p-3');
  });

  it('at 10,000 live words, drops only the oldest', () => {
    let t = 0;
    const r = new ResumeWords(1000, () => t);
    const { first, second } = fill(r);
    t = 1;
    const w = r.issue('p-4');
    expect(words(r).size).toBe(10_000);
    expect(r.take(first)).toBeNull();
    expect(r.take(second)).toBe(PLAYER);
    expect(r.take(w)).toBe('p-4');
  });
});

describe('bindPlayer', () => {
  it('refuses an unknown resume word, and a line that is not a code without asking the Bridge', async () => {
    const ctx = fakeCtx();
    const r = new ResumeWords();
    expect(await bindPlayer(ctx, r, 'RAAAA-AAAA')).toEqual({ refusal: 'unknown or expired resume word' });
    expect(await bindPlayer(ctx, r, 'not a code')).toEqual({ refusal: 'not a pairing code' });
    expect(ctx.pair).not.toHaveBeenCalled();
  });
});

const DISK_DECL = { ...SSH, banner: 'BANNER' };
function vshell(o: { decl?: object; playerId?: string; ctx?: Ctx; failed?: () => boolean; maxTries?: number } = {}) {
  const out: string[] = [];
  const ctx = o.ctx ?? fakeCtx();
  const close = vi.fn();
  const sh = new VirtualShell({
    connector: 'telnet',
    ctx,
    decl: (o.decl ?? TELNET) as typeof TELNET,
    sessionId: 's1',
    resume: new ResumeWords(),
    write: (s) => out.push(s),
    close,
    ...(o.playerId ? { playerId: o.playerId } : {}),
    ...(o.failed ? { failed: o.failed } : {}),
    ...(o.maxTries ? { maxTries: o.maxTries } : {}),
  });
  return { sh, out, ctx, close, text: () => out.join('') };
}

describe('the virtual shell', () => {
  it('shows the banner only when there is one, and the pairing hint only when unbound', () => {
    const a = vshell({ decl: { commands: [] } });
    a.sh.start();
    expect(a.out[0]).toMatch(/^Type the pairing code/);
    expect(a.out.at(-1)).toBe('Pairing code: ');
    const b = vshell({ decl: DISK_DECL, playerId: PLAYER });
    b.sh.start();
    expect(b.out).toEqual(['BANNER\r\n', 'shed$ ']);
    const c = vshell({ decl: DISK_DECL });
    c.sh.start();
    expect(c.out[0]).toBe('BANNER\r\n');
    expect(c.out[1]).toMatch(/^Type the pairing code/);
  });

  it('is bound once a code pairs it', async () => {
    const { sh } = vshell();
    expect(sh.bound).toBe(false);
    await sh.line(CODE);
    expect(sh.bound).toBe(true);
  });

  it('writes nothing once closed, even for a pairing that was in flight', async () => {
    const pair = deferred<Pair>();
    const { sh, out } = vshell({ ctx: fakeCtx({ pair: () => pair.promise }) });
    const done = sh.line(CODE);
    await flush();
    sh.closed = true;
    pair.resolve({ ok: true, playerId: PLAYER });
    await done;
    expect(out).toEqual([]);
  });

  it('handles no line once closed', async () => {
    const { sh, ctx, close } = vshell({ playerId: PLAYER });
    sh.closed = true;
    await sh.line('lamp on');
    await sh.line('exit');
    expect(ctx.propose).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('without an address count, a wrong code is one try of three', async () => {
    const { sh, text, close } = vshell();
    await sh.line('nope');
    expect(text()).toContain('That code does not work. Try again.');
    expect(close).not.toHaveBeenCalled();
  });

  it('answers a blank line with the prompt alone', async () => {
    const { sh, out } = vshell({ playerId: PLAYER });
    await sh.line('   ');
    expect(out).toEqual(['shed> ']);
  });

  it('lists the disk commands in help, clears the screen, cd, ls', async () => {
    const { sh, out, text } = vshell({ decl: DISK_DECL, playerId: PLAYER });
    await sh.line('help');
    expect(text()).toBe('lamp on\r\nls\r\ncd\r\npwd\r\ncat\r\nclear\r\nexit\r\nshed$ ');
    out.length = 0;
    await sh.line('clear');
    expect(out).toEqual(['\x1b[2J\x1b[H', 'shed$ ']);
    out.length = 0;
    await sh.line('cd notes');
    await sh.line('pwd');
    expect(text()).toBe('shed$ /notes\r\nshed$ ');
    out.length = 0;
    await sh.line('ls');
    expect(text()).toBe('door.txt  lamp.txt\r\nshed$ ');
  });

  it('tells a refused proposal, and only a refused one', async () => {
    let result: ProposeResult = { ok: true, sequence: 1, duplicate: false };
    const { sh, text, out } = vshell({ playerId: PLAYER, ctx: fakeCtx({ propose: async () => result }) });
    await sh.line('lamp on');
    expect(text()).toBe('Click. Somewhere in the garden, a lamp glows.\r\nshed> ');
    out.length = 0;
    result = { ok: false, refusal: 'quota' };
    await sh.line('lamp on');
    expect(text()).toBe('Click. Somewhere in the garden, a lamp glows.\r\n(the world did not answer: quota)\r\nshed> ');
  });
});

// --- Telnet ------------------------------------------------------------------------------------------------------------

describe('Telnet negotiation, byte for byte', () => {
  const push = (bytes: number[]) => {
    const r = new TelnetFilter().push(new Uint8Array(bytes));
    return { data: [...r.data], reply: [...r.reply], error: r.error };
  };
  it('reads DONT as a verb with its option, and drops any other command alone', () => {
    expect(push([255, 254, 65, 66])).toEqual({ data: [66], reply: [], error: undefined });
    expect(push([255, 241, 65])).toEqual({ data: [65], reply: [], error: undefined });
  });
  it('takes a subnegotiation of exactly 64 bytes, and goes on skipping after an IAC that is not SE', () => {
    expect(push([255, 250, ...new Array(63).fill(1), 255, 240, 65])).toEqual({
      data: [65],
      reply: [],
      error: undefined,
    });
    expect(push([255, 250, 1, 255, 1, 65, 255, 240, 66])).toEqual({ data: [66], reply: [], error: undefined });
  });
});

/** A socket as the Telnet connector uses one: what it was sent, how it was ended. */
class FakeSocket extends EventEmitter {
  remoteAddress = '10.0.0.1';
  destroyed = false;
  out: (string | Uint8Array)[] = [];
  ends: (string | undefined)[] = [];
  noDelay: boolean[] = [];
  setNoDelay(v: boolean) {
    this.noDelay.push(v);
    return this;
  }
  write(s: string | Uint8Array) {
    this.out.push(s);
    return true;
  }
  end(s?: string) {
    this.ends.push(s);
    return this;
  }
  destroy() {
    this.destroyed = true;
    return this;
  }
  /** A paused socket emits no `data`, as a net.Socket. */
  paused = false;
  pause() {
    this.paused = true;
    return this;
  }
  text() {
    return this.out.map((x) => (typeof x === 'string' ? x : Buffer.from(x).toString('latin1'))).join('');
  }
  type(s: string | number[]) {
    this.emit('data', typeof s === 'string' ? Buffer.from(s) : Buffer.from(s));
  }
}

function telnetSession(c: TelnetConnector, ctx: Ctx, sock = new FakeSocket()) {
  (c as unknown as { connection(s: FakeSocket, x: Ctx, d: typeof TELNET): void }).connection(sock, ctx, TELNET);
  after.push(() => sock.emit('close'));
  return sock;
}

describe('the Telnet connector, one session', () => {
  it('turns Nagle off, answers an option and nothing else', () => {
    const ctx = fakeCtx();
    const s = telnetSession(new TelnetConnector({ port: 0 }), ctx);
    expect(s.noDelay).toEqual([true]);
    s.out.length = 0;
    s.type('ab');
    expect(s.out).toEqual([]);
    s.type([255, 253, 1]);
    expect(s.out.map((x) => [...Buffer.from(x as Uint8Array)])).toEqual([[255, 252, 1]]);
  });

  it('closes a session that sends too fast, then reads nothing more from it', () => {
    const ctx = fakeCtx();
    const c = new TelnetConnector({ port: 0, limits: { bytesPerSecond: 8 } });
    const s = telnetSession(c, ctx);
    s.type('abcdefghij');
    expect(rejected(ctx, 'too-fast')).toBe(1);
    expect(c.refusedConnections).toBe(1);
    expect(logged(ctx, 'telnet.closed')).toBe(1);
    s.out.length = 0;
    s.type([255, 253, 1, 255, 253, 2]);
    expect(rejected(ctx, 'too-fast')).toBe(1);
    expect(logged(ctx, 'telnet.closed')).toBe(1);
    expect(s.out).toEqual([]);
  });

  it('closes on an endless subnegotiation', () => {
    const ctx = fakeCtx();
    const s = telnetSession(new TelnetConnector({ port: 0 }), ctx);
    s.type([255, 250, ...new Array(70).fill(65)]);
    expect(ctx.reject).toHaveBeenCalledWith('subnegotiation');
    expect(logged(ctx, 'telnet.closed')).toBe(1);
    expect(s.ends).toEqual([undefined]);
  });

  it('writes nothing to a destroyed socket', async () => {
    const s = telnetSession(new TelnetConnector({ port: 0 }), fakeCtx());
    s.out.length = 0;
    s.destroyed = true;
    s.type(' \r\n');
    await flush();
    expect(s.out).toEqual([]);
  });

  it('handles no line queued behind an exit', async () => {
    const ctx = fakeCtx();
    const s = telnetSession(new TelnetConnector({ port: 0 }), ctx);
    s.type(`${CODE}\r\n`);
    await flush();
    s.type('exit\r\nlamp on\r\n');
    await flush();
    expect(ctx.propose).not.toHaveBeenCalled();
    expect(logged(ctx, 'telnet.closed')).toBe(1);
  });

  it('once its socket closes, handles no queued line and closes nothing twice', async () => {
    const proposal = deferred<ProposeResult>();
    const ctx = fakeCtx({ propose: () => proposal.promise });
    const s = telnetSession(new TelnetConnector({ port: 0 }), ctx);
    s.type(`${CODE}\r\n`);
    await flush();
    s.type('lamp on\r\nlamp on\r\n');
    await flush();
    s.emit('close');
    proposal.resolve({ ok: true, sequence: 1, duplicate: false });
    await flush();
    expect(ctx.propose).toHaveBeenCalledTimes(1);
    expect(logged(ctx, 'telnet.closed')).toBe(0);
  });

  it('a pairing refused after the socket closed closes nothing', async () => {
    const pair = deferred<Pair>();
    const ctx = fakeCtx({ pair: () => pair.promise });
    const s = telnetSession(new TelnetConnector({ port: 0 }), ctx);
    s.type('nope\r\nnope\r\nBBBBBBBB\r\n');
    await flush();
    s.emit('close');
    pair.resolve({ ok: false, refusal: 'denied' });
    await flush();
    expect(logged(ctx, 'telnet.closed')).toBe(0);
    expect(s.ends).toEqual([]);
  });

  it('a bound session outlives `pairMs`; an unbound one does not', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const c = new TelnetConnector({ port: 0, limits: { pairMs: 1000 } });
    const ctx = fakeCtx();
    const bound = telnetSession(c, ctx);
    bound.type(`${CODE}\r\n`);
    const wrong = telnetSession(c, ctx, Object.assign(new FakeSocket(), { remoteAddress: '10.0.0.2' }));
    wrong.type('nope\r\n');
    await flush();
    vi.advanceTimersByTime(1500);
    expect(bound.text()).not.toContain('Closed (pairing-time)');
    expect(wrong.text()).toContain('Closed (pairing-time)');
  });
});

describe('the Telnet server', () => {
  it('needs the game to declare it', async () => {
    const c = new TelnetConnector({ port: 0 });
    const ctx = { ...fakeCtx(), manifest: { ...MANIFEST, connectors: {} } };
    await expect(c.start(ctx)).rejects.toThrow('telnet: the game declares no `reality.connectors.telnet`');
    await c.stop();
  });

  it('is not healthy until it listens; stops when never started', async () => {
    await new TelnetConnector({ port: 0 }).stop();
    const c = new TelnetConnector({ port: 0 });
    const started = c.start(fakeCtx());
    expect((await c.health()).ok).toBe(false);
    await started;
    expect((await c.health()).ok).toBe(true);
    await c.stop();
  });

  it('turns a connection away while stopping, and lets no session in flight write after', async () => {
    const pair = deferred<Pair>();
    const ctx = fakeCtx({ pair: () => pair.promise });
    const c = new TelnetConnector({ port: 0 });
    await c.start(ctx);
    const s = telnetSession(c, ctx);
    s.type(`${CODE}\r\n`);
    await flush();
    const stopped = c.stop();
    const late = telnetSession(c, ctx, Object.assign(new FakeSocket(), { remoteAddress: '10.0.0.3' }));
    await stopped;
    expect(late.ends).toEqual(['The terminal is busy. Try again later.\r\n']);
    // Stopping pauses the session: nothing more is read before its socket is destroyed.
    expect(s.paused).toBe(true);
    s.out.length = 0;
    pair.resolve({ ok: true, playerId: PLAYER });
    await flush();
    expect(s.out).toEqual([]);
  });
});

// --- SSH ------------------------------------------------------------------------------------------------------------------

describe('sshConfig and wrap', () => {
  it('needs a host key, read from `hostKeyFile` when it is named', () => {
    expect(() => sshConfig({ port: 0 }, '/')).toThrow('ssh: "hostKeyFile" names the host key');
    expect(sshConfig({ port: 0, hostKey: 'K' }, '/').hostKey).toBe('K');
    const dir = mkdtempSync(join(tmpdir(), 'ws-ssh-'));
    writeFileSync(join(dir, 'host'), 'FROM FILE');
    expect(sshConfig({ port: 0, hostKeyFile: 'host' }, dir).hostKey).toBe('FROM FILE');
  });

  it('leaves a line of exactly the width whole', () => {
    expect(wrap('abcd', 4)).toBe('abcd');
  });
});

const host = sshKeyPair();
const alice = sshKeyPair();
const bob = sshKeyPair();
const parsed = (k: string) => ssh2.utils.parseKey(k) as unknown as { getPublicSSH(): Buffer; sign(d: Buffer): Buffer };

/** An ssh2 connection as the connector uses one. */
class FakeClient extends EventEmitter {
  ended = 0;
  _sock = { destroy() {} };
  end() {
    this.ended++;
    return this;
  }
}
class FakeStream extends EventEmitter {
  writable = true;
  out: string[] = [];
  ended = 0;
  write(s: string) {
    this.out.push(s);
    return true;
  }
  end() {
    this.ended++;
    return this;
  }
  text() {
    return this.out.join('');
  }
  type(s: string) {
    this.emit('data', Buffer.from(s));
  }
}

function sshClient(c: SshConnector, ctx: Ctx, address = '10.0.0.1', decl = SSH) {
  const client = new FakeClient();
  (c as unknown as { client(x: FakeClient, a: string, y: Ctx, d: typeof SSH): void }).client(
    client,
    address,
    ctx,
    decl,
  );
  after.push(() => client.emit('close'));
  return client;
}

/** One authentication attempt: what the connector answered. */
function attempt(client: FakeClient, a: Record<string, unknown>) {
  const r = { accepted: 0, rejected: [] as unknown[][] };
  client.emit('authentication', {
    username: 'player',
    ...a,
    accept: () => r.accepted++,
    reject: (...x: unknown[]) => r.rejected.push(x),
  });
  return r;
}
/** What `reject` was called with: once, with the methods left. */
const METHODS = [[['password', 'publickey']]];

/** A signed public-key attempt with `signer`'s key, as `as` claims it. */
function keyAttempt(client: FakeClient, as: string, signer: string, method = 'publickey') {
  const blob = Buffer.from('session blob');
  return attempt(client, {
    method,
    key: { algo: 'ssh-ed25519', data: parsed(as).getPublicSSH() },
    blob,
    signature: parsed(signer).sign(blob),
    hashAlgo: undefined,
  });
}

/** After authentication: the session, then the shell (a pty first, when `cols` is given). */
function openShell(client: FakeClient, cols?: unknown) {
  client.emit('ready');
  const session = new EventEmitter();
  client.emit(
    'session',
    () => session,
    () => {},
  );
  if (cols !== undefined)
    session.emit(
      'pty',
      () => {},
      () => {},
      { cols },
    );
  const stream = new FakeStream();
  session.emit(
    'shell',
    () => stream,
    () => {},
  );
  after.push(() => stream.emit('close'));
  return { session, stream };
}

async function signedIn(c: SshConnector, ctx: Ctx, cols?: unknown, decl = SSH) {
  const client = sshClient(c, ctx, '10.0.0.1', decl);
  const a = attempt(client, { method: 'password', password: CODE });
  await flush();
  expect(a.accepted).toBe(1);
  return { client, ...openShell(client, cols) };
}

describe('the SSH connector, authentication', () => {
  it('ssh2 reads a declared key as one key or an Error, never an array (docs/dev/mutants.json names the branch)', () => {
    const seen = [alice.public, alice.private, host.private, 'not a key', '', 42, null].map((k) =>
      ssh2.utils.parseKey(k as string),
    );
    expect(seen.some((k) => Array.isArray(k))).toBe(false);
    expect(seen.slice(0, 3).every((k) => !(k instanceof Error))).toBe(true);
  });

  it('skips a key it cannot read', () => {
    expect(
      () => new SshConnector({ port: 0, hostKey: 'x', keys: [{ key: 'not a key', playerId: 'p-1' }] }),
    ).not.toThrow();
  });

  it('a third wrong password hangs up, a right one after two wrong is taken', async () => {
    const c = new SshConnector({ port: 0, hostKey: 'x' });
    const ctx = fakeCtx();
    const one = sshClient(c, ctx);
    const tries = ['nope', 'nope', 'nope'].map((p) => attempt(one, { method: 'password', password: p }));
    await flush();
    expect(tries.map((t) => t.rejected)).toEqual([METHODS, METHODS, [[]]]);
    expect(one.ended).toBe(1);
    expect(rejected(ctx, 'authentication')).toBe(1);
    const two = sshClient(c, ctx, '10.0.0.2');
    attempt(two, { method: 'password', password: 'nope' });
    attempt(two, { method: 'password', password: 'nope' });
    const right = attempt(two, { method: 'password', password: CODE });
    await flush();
    expect(right.accepted).toBe(1);
    expect(two.ended).toBe(0);
  });

  it('takes a code padded to 64 characters', async () => {
    const c = new SshConnector({ port: 0, hostKey: 'x' });
    const client = sshClient(c, fakeCtx());
    const r = attempt(client, { method: 'password', password: CODE.padStart(64, ' ') });
    await flush();
    expect(r.accepted).toBe(1);
  });

  it('answers `none` with the methods, and reads a password on no other method', async () => {
    const c = new SshConnector({ port: 0, hostKey: 'x' });
    const ctx = fakeCtx();
    const client = sshClient(c, ctx);
    expect(attempt(client, { method: 'none' }).rejected).toEqual(METHODS);
    const r = attempt(client, { method: 'keyboard-interactive', password: CODE });
    await flush();
    expect(r).toEqual({ accepted: 0, rejected: METHODS });
    expect(ctx.pair).not.toHaveBeenCalled();
  });

  it('counts each other method as a wrong try', () => {
    const c = new SshConnector({ port: 0, hostKey: 'x' });
    const ctx = fakeCtx();
    const client = sshClient(c, ctx);
    const r = [1, 2, 3].map(() => attempt(client, { method: 'keyboard-interactive' }));
    expect(r.map((x) => x.rejected)).toEqual([METHODS, METHODS, [[]]]);
    expect(client.ended).toBe(1);
  });

  it('takes a declared key signed by its owner, whichever of two', () => {
    const c = new SshConnector({
      port: 0,
      hostKey: 'x',
      keys: [
        { key: alice.public, playerId: 'p-alice' },
        { key: bob.public, playerId: 'p-bob' },
      ],
    });
    const client = sshClient(c, fakeCtx());
    expect(keyAttempt(client, bob.private, bob.private)).toEqual({ accepted: 1, rejected: [] });
  });

  it('refuses an unknown key even unsigned, a declared key signed by another, and the key on `hostbased`', () => {
    const c = new SshConnector({ port: 0, hostKey: 'x', keys: [{ key: alice.public, playerId: 'p-alice' }] });
    const client = sshClient(c, fakeCtx());
    const unsigned = attempt(client, {
      method: 'publickey',
      key: { algo: 'ssh-ed25519', data: parsed(bob.private).getPublicSSH() },
    });
    expect(unsigned).toEqual({ accepted: 0, rejected: METHODS });
    expect(keyAttempt(client, alice.private, bob.private)).toEqual({ accepted: 0, rejected: METHODS });
    const other = sshClient(c, fakeCtx(), '10.0.0.2');
    expect(keyAttempt(other, alice.private, alice.private, 'hostbased')).toEqual({ accepted: 0, rejected: METHODS });
  });

  it('frees an address when its connection closes, once', () => {
    const c = new SshConnector({ port: 0, hostKey: 'x', limits: { perAddress: 2 } });
    const ctx = fakeCtx();
    const a = sshClient(c, ctx);
    sshClient(c, ctx);
    a.emit('close');
    a.emit('close');
    sshClient(c, ctx);
    expect(rejected(ctx, 'busy')).toBe(0);
    const d = sshClient(c, ctx);
    expect(rejected(ctx, 'busy')).toBe(1);
    expect(d.ended).toBe(1);
  });
});

describe('the SSH connector, a shell', () => {
  it('a key login gets no resume word; a password login does', async () => {
    const c = new SshConnector({ port: 0, hostKey: 'x', keys: [{ key: alice.public, playerId: 'p-alice' }] });
    const client = sshClient(c, fakeCtx());
    keyAttempt(client, alice.private, alice.private);
    const { stream } = openShell(client);
    expect(stream.text()).not.toContain('Resume word');
    const pw = await signedIn(c, fakeCtx());
    expect(pw.stream.text()).toMatch(/^Resume word, for 30 minutes: R\w{4}-\w{4}\r\n/);
  });

  it('one shell per session', async () => {
    const ctx = fakeCtx();
    const { session } = await signedIn(new SshConnector({ port: 0, hostKey: 'x' }), ctx);
    const no = vi.fn();
    session.emit('shell', () => new FakeStream(), no);
    expect(no).toHaveBeenCalledTimes(1);
    expect(ctx.reject).toHaveBeenCalledWith('ssh-second-shell');
  });

  it('keeps 80 columns for a width that is not a finite number', async () => {
    const decl = { ...SSH, banner: 'x'.repeat(100) };
    for (const cols of ['wide', Number.POSITIVE_INFINITY]) {
      const { stream } = await signedIn(new SshConnector({ port: 0, hostKey: 'x' }), fakeCtx(), cols, decl);
      expect(stream.text()).toContain(`${'x'.repeat(80)}\r\n${'x'.repeat(20)}\r\n`);
    }
  });

  it('echoes what is typed (a pty), and slows a flood of lines', async () => {
    const { stream } = await signedIn(
      new SshConnector({ port: 0, hostKey: 'x', limits: { linesPerMinute: 1 } }),
      fakeCtx(),
    );
    stream.out.length = 0;
    stream.type('ab');
    expect(stream.text()).toBe('ab');
    stream.type('\rhelp\r');
    await flush();
    expect(stream.text()).toContain('Slow down.\r\n');
  });

  it('handles no line queued behind an exit, closes once, reads nothing after', async () => {
    const ctx = fakeCtx();
    const { stream } = await signedIn(new SshConnector({ port: 0, hostKey: 'x' }), ctx);
    stream.type('exit\rlamp on\r');
    await flush();
    expect(ctx.propose).not.toHaveBeenCalled();
    stream.emit('close');
    stream.emit('error', new Error('late'));
    expect(logged(ctx, 'ssh.closed')).toBe(1);
    stream.type(`${'z'.repeat(600)}\r`);
    expect(rejected(ctx, 'line-too-long')).toBe(0);
  });

  it('writes nothing to a stream that is no longer writable', async () => {
    const { stream } = await signedIn(new SshConnector({ port: 0, hostKey: 'x' }), fakeCtx());
    stream.out.length = 0;
    stream.writable = false;
    stream.type(' \r');
    await flush();
    expect(stream.out).toEqual([]);
  });
});

describe('the SSH server', () => {
  it('needs the game to declare it; stops when never started', async () => {
    await new SshConnector({ port: 0, hostKey: host.private }).stop();
    const c = new SshConnector({ port: 0, hostKey: host.private });
    const ctx = { ...fakeCtx(), manifest: { ...MANIFEST, connectors: {} } };
    await expect(c.start(ctx)).rejects.toThrow('ssh: the game declares no `reality.connectors.ssh`');
    await c.stop();
  });

  it('reports port 0 when the server has no address, and is not healthy while it stops', async () => {
    vi.spyOn(ssh2.Server.prototype, 'address').mockReturnValue(null as never);
    const c = new SshConnector({ port: 0, hostKey: host.private });
    await c.start(fakeCtx());
    expect(c.port).toBe(0);
    expect((await c.health()).ok).toBe(true);
    const stopped = c.stop();
    expect((await c.health()).ok).toBe(false);
    await stopped;
  });
});

// The SSH key loader reads `utils.parseKey` as ssh2 1.17 defines it (docs/dev/mutants.json names its array branch
// unreachable on that ground): one key or an Error, never an array. A bump of ssh2 that changes it fails here first.
describe("ssh2's parseKey, as the key loader counts on it", () => {
  it('gives one key for a private or a public key, and an Error for anything but a string or a Buffer', () => {
    for (const k of [host.private, host.public]) {
      const parsed = ssh2.utils.parseKey(k);
      expect(Array.isArray(parsed)).toBe(false);
      expect(parsed).not.toBeInstanceOf(Error);
    }
    expect(ssh2.utils.parseKey(42 as unknown as string)).toBeInstanceOf(Error);
  });
});
