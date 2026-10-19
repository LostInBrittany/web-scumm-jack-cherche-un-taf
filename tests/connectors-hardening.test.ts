// Connector hardening (4.1.20): weaknesses the edge mutation families saw (#118), none reachable under today's
// contracts, closed so that a change of contract cannot crash a connector or leave a socket behind. A bookkeeping
// `finally` never makes an unhandled rejection; a secret that is not a string is refused at start; a greeting that is
// not OK closes the IMAP socket; a stopping Telnet connector reads nothing more.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, connect, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenBadgeConnector } from '../connectors/src/badges/connector';
import { readSecret } from '../connectors/src/config';
import { EmailConnector, emailConfig } from '../connectors/src/email/connector';
import { ImapClient } from '../connectors/src/email/imap';
import { main } from '../connectors/src/run';
import { SshConnector } from '../connectors/src/ssh/connector';
import { TelnetConnector } from '../connectors/src/telnet/connector';
import { contextFor, MANIFEST, sshKeyPair, startBridge } from './fixtures/connectors/harness';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

/** The unhandled rejections seen while a test runs (vitest's own handler still sees them too). */
let unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => void unhandled.push(e);
beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
  vi.restoreAllMocks();
});
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('a secret', () => {
  it('is the inline string, refused when it is not one, and named missing when empty', () => {
    expect(readSecret('.', undefined, 'shh', 'webhook')).toBe('shh');
    expect(() => readSecret('.', undefined, 12345 as unknown as string, 'webhook')).toThrow(
      /^webhook: the secret must be a string$/,
    );
    expect(() => readSecret('.', undefined, { a: 1 } as unknown as string, 'imap')).toThrow(/must be a string/);
    expect(() => readSecret('.', undefined, '', 'webhook')).toThrow(/^webhook: no secret/);
    expect(() => readSecret('.', undefined, undefined, 'webhook')).toThrow(/^webhook: no secret/);
  });

  it('written as a number refuses the email connector at start, before any request', () => {
    expect(() => emailConfig({ mode: 'webhook', webhook: { port: 0, secret: 12345 } }, '.')).toThrow(
      /must be a string/,
    );
    expect(() => emailConfig({ mode: 'imap', imap: { host: 'h', user: 'u', password: 7 } }, '.')).toThrow(
      /imap password: the secret must be a string/,
    );
  });
});

describe('the IMAP client', () => {
  it('closes its socket after a greeting that is not OK', async () => {
    let closed!: Promise<void>;
    const server: Server = createServer((s: Socket) => {
      closed = new Promise((ok) => s.on('close', () => ok()));
      s.on('error', () => {});
      s.write('* BYE not today\r\n');
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    cleanup.push(() => new Promise((ok) => server.close(() => ok(undefined))));
    const port = (server.address() as { port: number }).port;
    await expect(
      ImapClient.open({ host: '127.0.0.1', port, user: 'u', password: 'p', tls: false, maxLiteral: 1024 }),
    ).rejects.toThrow(/refused the connection/);
    // The server sees the client hang up, without waiting for its own timeout.
    await expect(
      Promise.race([closed, new Promise((_, ko) => setTimeout(() => ko(new Error('still open')), 2000))]),
    ).resolves.toBeUndefined();
  });
});

describe('a bookkeeping finally', () => {
  it('in the email connector, leaves the rejection to its caller, never unhandled', async () => {
    const c = new EmailConnector({ mode: 'webhook' } as never);
    const track = (c as unknown as { track<T>(p: Promise<T>): Promise<T> }).track.bind(c);
    await expect(track(Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await settle();
    expect(unhandled).toEqual([]);
  });

  it('in the badge connector, answers 500 and leaves no unhandled rejection', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'open-badge');
    const c = new OpenBadgeConnector({ port: 0 });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    (c as unknown as { submit: () => Promise<never> }).submit = () => Promise.reject(new Error('boom'));
    const r = await fetch(`http://127.0.0.1:${c.port}/v1/badges`, {
      method: 'POST',
      body: JSON.stringify({ code: 'x', badge: {} }),
    });
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'internal' });
    await settle();
    expect(unhandled).toEqual([]);
  });
});

describe('a stopping Telnet connector', () => {
  it('reads nothing more in the second before its sockets are destroyed', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'telnet');
    const c = new TelnetConnector({ port: 0, limits: { maxLine: 16 } });
    await c.start(ctx);
    let text = '';
    const s = connect({ port: c.port, host: '127.0.0.1', allowHalfOpen: true });
    s.on('data', (d: Buffer) => void (text += d.toString('latin1')));
    s.on('error', () => {});
    cleanup.push(() => void s.destroy());
    const until = async (re: RegExp) => {
      for (let i = 0; i < 300 && !re.test(text); i++) await new Promise((r) => setTimeout(r, 10));
      expect(text).toMatch(re);
    };
    await until(/code/i);
    // A line over the limit is refused while it runs: the refusal counted.
    s.write(`${'a'.repeat(40)}\r\n`);
    await until(/Line too long/);
    const before = ctx.metrics().rejectedInputs;
    expect(before).toBeGreaterThan(0);
    const stopped = c.stop();
    await until(/The terminal closes/);
    s.write(`${'b'.repeat(40)}\r\n`);
    await settle();
    expect(ctx.metrics().rejectedInputs).toBe(before);
    await stopped;
  });
});

describe('the connector process', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const config = (cfg: Record<string, unknown>) => {
    const d = mkdtempSync(join(tmpdir(), 'connector-hardening-'));
    dirs.push(d);
    writeFileSync(join(d, 'manifest.json'), JSON.stringify(MANIFEST));
    writeFileSync(join(d, 'connector.json'), JSON.stringify(cfg));
    return join(d, 'connector.json');
  };
  const base = { gameId: 'signals', manifestFile: 'manifest.json', telnet: { port: 0 } };

  it('refuses an inline token that is not a string, at start', async () => {
    const start = vi.spyOn(TelnetConnector.prototype, 'start').mockResolvedValue(undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cfg = config({ ...base, bridge: { url: 'http://127.0.0.1:9/', token: 12345 } });
    expect(await main(['telnet', '--config', cfg], { stop: Promise.resolve(), write: () => {} })).toBe(1);
    expect(error.mock.calls[0]![0]).toMatch(/"bridge\.token" must be a string/);
    expect(start).not.toHaveBeenCalled();
  });

  it('answers /health with 503, and its time, when the connector health throws', async () => {
    vi.spyOn(TelnetConnector.prototype, 'start').mockResolvedValue(undefined);
    vi.spyOn(TelnetConnector.prototype, 'stop').mockResolvedValue(undefined);
    vi.spyOn(TelnetConnector.prototype, 'health').mockRejectedValue(new Error('boom'));
    const cfg = config({ ...base, bridge: { url: 'http://127.0.0.1:9/', token: 'the-token' }, health: { port: 0 } });
    let answer: { status: number; body: Record<string, unknown> } | undefined;
    let stop!: () => void;
    const stopped = new Promise<void>((ok) => (stop = ok));
    const code = await main(['telnet', '--config', cfg], {
      stop: stopped,
      write: () => {},
      ready: (info) =>
        void fetch(new URL('health', info.health))
          .then(async (r) => (answer = { status: r.status, body: (await r.json()) as Record<string, unknown> }))
          .finally(stop),
    });
    expect(code).toBe(0);
    expect(answer?.status).toBe(503);
    expect(answer?.body).toMatchObject({ connector: 'telnet', ok: false, detail: 'health failed' });
    expect(typeof answer?.body.since).toBe('string');
    await settle();
    expect(unhandled).toEqual([]);
  });
});

describe('the SSH connector', () => {
  it('refuses a password login whose pairing throws, never leaving the rejection unhandled', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'ssh');
    vi.spyOn(ctx, 'pair').mockRejectedValue(new Error('boom'));
    const c = new SshConnector({ port: 0, hostKey: sshKeyPair().private, keys: [] });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    const password = await t.code();
    const client = new ssh2.Client();
    const r = await new Promise<string>((ok) => {
      client.on('ready', () => ok('ready'));
      client.on('error', (e: Error) => ok(`error: ${e.message}`));
      client.on('close', () => ok('closed'));
      client.connect({
        host: '127.0.0.1',
        port: c.port,
        username: 'player',
        password,
        readyTimeout: 10_000,
        tryKeyboard: false,
      });
    });
    client.end();
    expect(r).not.toBe('ready');
    await settle();
    expect(unhandled).toEqual([]);
  });
});
