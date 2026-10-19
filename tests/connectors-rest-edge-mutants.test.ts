// The edges of what the four connectors share (connectors/src/run.ts, http.ts, registry.ts, config.ts), each test
// written for a mutant of `connectors-edge` the other connector tests let live (4.1.20 PR 2e, plan §7.1;
// tools/mutate.ts, docs/dev/MUTANTS.md): the process's arguments, configuration, token and manifest (a file or the
// Bridge's), its health and metrics port, the body limit at its bound, the per-address budget and its sweep above
// 10,000 addresses, a JSON answer after the headers, the registry by id and a secret from a file or inline. `main`
// runs in-process: the connector's start, stop and health are stubbed, so nothing listens but the health port and a
// manifest server, both on 127.0.0.1, port 0. Clocks are injected.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenBadgeConnector } from '../connectors/src/badges/connector';
import { readSecret } from '../connectors/src/config';
import { EmailConnector } from '../connectors/src/email/connector';
import { HttpError, PerAddress, readBody, sendJson } from '../connectors/src/http';
import { CONNECTOR_IDS, makeConnector } from '../connectors/src/registry';
import { main } from '../connectors/src/run';
import type { ConnectorContext, ConnectorHealth } from '../connectors/src/sdk';
import { SshConnector } from '../connectors/src/ssh/connector';
import { TelnetConnector } from '../connectors/src/telnet/connector';
import { MANIFEST } from './fixtures/connectors/harness';

/** Whatever must be closed after a test. */
const after: (() => unknown)[] = [];
afterEach(async () => {
  for (const f of after.splice(0).reverse()) await f();
  vi.restoreAllMocks();
});

const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'connector-edge-'));
  after.push(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

// --- config.ts -----------------------------------------------------------------------------------------------------

describe('a secret', () => {
  it('is the file, trimmed, when one is named', () => {
    const d = dir();
    writeFileSync(join(d, 's'), '  from-file\n');
    expect(readSecret(d, 's', 'inline', 'webhook')).toBe('from-file');
    expect(readSecret(d, 's', undefined, 'webhook')).toBe('from-file');
  });

  it('is the inline value without a file, and an error naming what is missing without either', () => {
    expect(readSecret('/nowhere', undefined, 'inline', 'webhook')).toBe('inline');
    expect(() => readSecret('/nowhere', undefined, undefined, 'imap password')).toThrow(
      /^imap password: no secret \(name its file\)$/,
    );
    expect(() => readSecret('/nowhere', '', '', 'webhook')).toThrow(/^webhook: no secret/);
  });
});

// --- registry.ts ---------------------------------------------------------------------------------------------------

describe('the registry', () => {
  const email = { mode: 'imap', imap: { host: 'imap.test', user: 'u', password: 'p' } };
  const ssh = { port: 0, hostKey: 'not-a-key-but-a-string' };

  it('builds each connector by its id, from its section', () => {
    expect(CONNECTOR_IDS).toEqual(['email', 'telnet', 'ssh', 'open-badge']);
    const e = makeConnector('email', email, { baseDir: '/' });
    expect(e).toBeInstanceOf(EmailConnector);
    expect((e as unknown as { c: { imap: { password: string } } }).c.imap.password).toBe('p');
    const t = makeConnector('telnet', { port: 1234 }, { baseDir: '/' });
    expect(t).toBeInstanceOf(TelnetConnector);
    expect((t as unknown as { c: { port: number } }).c.port).toBe(1234);
    const s = makeConnector('ssh', ssh, { baseDir: '/' });
    expect(s).toBeInstanceOf(SshConnector);
    expect((s as unknown as { c: { hostKey: string } }).c.hostKey).toBe(ssh.hostKey);
    const b = makeConnector(
      'open-badge',
      { port: 4321, testing: { allowHttp: true }, resolve: () => [] },
      { baseDir: '/' },
    );
    expect(b).toBeInstanceOf(OpenBadgeConnector);
    expect((b as unknown as { c: object }).c).toEqual({ port: 4321 });
  });

  it('reads a missing or non-object section as an empty one, and refuses an unknown id', () => {
    for (const section of [null, undefined, 'telnet', 7]) {
      expect(makeConnector('telnet', section, { baseDir: '/' })).toBeInstanceOf(TelnetConnector);
      expect(() => makeConnector('email', section, { baseDir: '/' })).toThrow(/^email: "mode" is/);
    }
    expect(() => makeConnector('gopher', { port: 0, hostKey: 'k' }, { baseDir: '/' })).toThrow(
      /^unknown connector "gopher"$/,
    );
  });
});

// --- http.ts -------------------------------------------------------------------------------------------------------

/** A request of these chunks, with this declared length (or none). */
const request = (chunks: string[], length?: number) => {
  const read: string[] = [];
  const req = {
    headers: length === undefined ? {} : { 'content-length': String(length) },
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        read.push(c);
        yield Buffer.from(c);
      }
    },
  } as unknown as IncomingMessage;
  return { req, read };
};

const tooLarge = (p: Promise<unknown>) =>
  expect(p).rejects.toSatisfy((e) => e instanceof HttpError && e.status === 413 && e.code === 'too-large');

describe('a body under a limit', () => {
  it('is refused on its declared length alone, before a byte is read; a declared length at the limit is read', async () => {
    const big = request(['12345'], 11);
    await tooLarge(readBody(big.req, 10));
    expect(big.read).toEqual([]);
    expect((await readBody(request(['12345', '67890'], 10).req, 10)).toString()).toBe('1234567890');
  });

  it('is refused on the chunk that passes the limit, and read whole at the limit', async () => {
    const over = request(['123456', '78901', 'never']);
    await tooLarge(readBody(over.req, 10));
    expect(over.read).toEqual(['123456', '78901']);
    expect((await readBody(request(['123456', '7890']).req, 10)).toString()).toBe('1234567890');
  });
});

const entries = (p: PerAddress) => (p as unknown as { m: Map<string, number[]> }).m;

describe('the per-address budget', () => {
  it('takes perMinute requests a minute, and forgets one exactly 60 s after it', () => {
    let t = 0;
    const p = new PerAddress(2, () => t);
    expect(p.take('a')).toBe(true);
    expect(p.take('a')).toBe(true);
    expect(p.take('a')).toBe(false);
    expect(p.take('b')).toBe(true);
    t = 59_999;
    expect(p.take('a')).toBe(false);
    t = 60_000;
    expect(p.take('a')).toBe(true);
    expect(entries(p).get('a')).toEqual([60_000]);
  });

  it('sweeps the idle addresses only above 10,000 of them, keeping the ones seen within the minute', () => {
    let t = 0;
    const p = new PerAddress(1, () => t);
    for (let i = 0; i < 10_000; i++) p.take(`10.0.${i >> 8}.${i & 255}`);
    expect(entries(p).size).toBe(10_000);
    t = 60_000;
    // At 10,000 nothing is swept.
    expect(p.take('x')).toBe(true);
    expect(entries(p).size).toBe(10_001);
    // Above, the addresses idle for a minute (exactly) go; `x`, seen now, stays and keeps its budget.
    expect(p.take('y')).toBe(true);
    expect([...entries(p).keys()]).toEqual(['x', 'y']);
    expect(p.take('x')).toBe(false);
  });
});

describe('a JSON answer', () => {
  it('only ends a response whose headers are already sent', () => {
    const res = { headersSent: true, end: vi.fn(), writeHead: vi.fn() };
    sendJson(res as unknown as ServerResponse, 500, { error: 'x' });
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledWith();
  });
});

// --- run.ts --------------------------------------------------------------------------------------------------------

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

/** A Bridge that only answers `GET /v1/manifest`, with this status and manifest. */
async function manifestServer(status: number, manifest: unknown = MANIFEST): Promise<string> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ manifest }));
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  after.push(() => new Promise<void>((ok) => server.close(() => ok())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

/** The connector, stubbed: what `start` was given, what `health` answers. */
function stubTelnet(health: ConnectorHealth = { ok: true, detail: 'up', since: 'now' }) {
  const seen: { ctx?: ConnectorContext } = {};
  vi.spyOn(TelnetConnector.prototype, 'start').mockImplementation(async (ctx) => {
    seen.ctx = ctx;
  });
  vi.spyOn(TelnetConnector.prototype, 'stop').mockResolvedValue(undefined);
  vi.spyOn(TelnetConnector.prototype, 'health').mockResolvedValue(health);
  return seen;
}

/** A configuration file (and a token file, a manifest file) in a fresh folder; its path. */
function config(cfg: Record<string, unknown>, o: { manifest?: unknown } = {}) {
  const d = dir();
  writeFileSync(join(d, 'token'), 'the-token\n');
  writeFileSync(join(d, 'manifest.json'), JSON.stringify(o.manifest ?? MANIFEST));
  writeFileSync(join(d, 'connector.json'), JSON.stringify(cfg));
  return join(d, 'connector.json');
}

const base = { bridge: { url: 'http://127.0.0.1:9/', tokenFile: 'token' }, gameId: 'signals', telnet: { port: 0 } };

/** `main` until ready, then stopped; its exit code, what it wrote and what `ready` said. */
async function run(args: string[], before?: (ready: { health?: string }) => Promise<void>) {
  const lines: string[] = [];
  const stop = deferred();
  const infos: { health?: string }[] = [];
  const code = main(args, {
    stop: stop.promise,
    write: (l) => lines.push(l),
    ready: (info) => {
      infos.push(info);
      void (before ? before(info) : Promise.resolve()).finally(() => stop.resolve());
    },
  });
  return { code: await code, lines, infos };
}

/** Stops at once, writes nothing: for a run that should never start. */
const quiet = { stop: Promise.resolve(), write: () => {} };

describe('the web-scumm-connector process, in-process', () => {
  it('says its usage: 0 when asked, 2 without arguments; 2 for an unknown connector or no --config', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['--help'], quiet)).toBe(0);
    expect(await main([], quiet)).toBe(2);
    expect(log).toHaveBeenCalledTimes(2);
    expect(await main(['nope', '--config', 'x.json'], quiet)).toBe(2);
    expect(error.mock.calls[0]![0]).toMatch(/^✖ {2}unknown connector "nope"\nusage:/);
    // `--config` first is not a connector: the flag is never read at index 0.
    expect(await main(['--config', 'telnet'], quiet)).toBe(2);
    expect(error.mock.calls[1]![0]).toMatch(/^✖ {2}unknown connector "--config"/);
    expect(await main(['telnet'], quiet)).toBe(2);
    expect(error.mock.calls[2]![0]).toMatch(/^✖ {2}--config <file\.json> is required\n/);
  });

  it('reads --config=<file> as --config <file>, a manifest file, a token file', async () => {
    const seen = stubTelnet();
    const r = await run(['telnet', `--config=${config({ ...base, manifestFile: 'manifest.json' })}`]);
    expect(r.code).toBe(0);
    expect(seen.ctx!.bridge.token).toBe('the-token');
    expect(seen.ctx!.manifest.gameId).toBe('signals');
  });

  it('takes an inline token, and refuses none with 1', async () => {
    const seen = stubTelnet();
    const url = await manifestServer(200);
    const ok = await run(['telnet', '--config', config({ ...base, bridge: { url, token: 'inline-token' } })]);
    expect(ok.code).toBe(0);
    expect(seen.ctx!.bridge.token).toBe('inline-token');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main(['telnet', '--config', config({ ...base, bridge: { url } })], quiet)).toBe(1);
    expect(error.mock.calls[0]![0]).toMatch(/^✖ {2}no token/);
    expect(seen.ctx!.bridge.token).toBe('inline-token');
  });

  it("asks the Bridge for its manifest without a manifest file, and says the Bridge's refusal", async () => {
    const seen = stubTelnet();
    const url = await manifestServer(200, { ...MANIFEST, title: 'from the Bridge' });
    expect((await run(['telnet', '--config', config({ ...base, bridge: { url, tokenFile: 'token' } })])).code).toBe(0);
    expect((seen.ctx!.manifest as unknown as { title: string }).title).toBe('from the Bridge');
    // With a manifest file, the Bridge (which refuses here) is not asked.
    const refusing = await manifestServer(500);
    const cfg = { ...base, bridge: { url: refusing, tokenFile: 'token' } };
    expect((await run(['telnet', '--config', config({ ...cfg, manifestFile: 'manifest.json' })])).code).toBe(0);
    await expect(main(['telnet', '--config', config(cfg)], quiet)).rejects.toThrow(
      /^the Bridge did not give its manifest \(500\)$/,
    );
  });

  it('refuses with 1 a manifest of another game, before the connector starts', async () => {
    const seen = stubTelnet();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = config({ ...base, manifestFile: 'manifest.json' }, { manifest: { ...MANIFEST, gameId: 'other' } });
    expect(await main(['telnet', '--config', file], quiet)).toBe(1);
    expect(error.mock.calls[0]![0]).toBe('✖  the manifest is for other, the configuration for signals');
    expect(seen.ctx).toBeUndefined();
  });

  it("gives the connector the configuration's tenant and limits, or the defaults", async () => {
    const seen = stubTelnet();
    const file = { ...base, manifestFile: 'manifest.json' };
    await run(['telnet', '--config', config({ ...file, tenantId: 'acme', limits: { maxBytes: 99 } })]);
    expect(seen.ctx!.tenantId).toBe('acme');
    expect(seen.ctx!.limits).toEqual({ maxBytes: 99, maxPerMinute: 60, timeoutMs: 5000 });
    await run(['telnet', '--config', config(file)]);
    expect(seen.ctx!.tenantId).toBe('default');
    expect(seen.ctx!.limits).toEqual({ maxBytes: 4096, maxPerMinute: 60, timeoutMs: 5000 });
    // An empty tenant (the file is not validated) is no tenant: the default, never ''.
    await run(['telnet', '--config', config({ ...file, tenantId: '' })]);
    expect(seen.ctx!.tenantId).toBe('default');
  });

  // A pipe's name as the health "port" (the file is not validated): `address()` is then that string, not an
  // AddressInfo. No health URL is said, and the connector runs on rather than throw on a URL of no port.
  it.skipIf(process.platform === 'win32')('says no health URL for a health server on a socket path', async () => {
    stubTelnet();
    const sock = join(dir(), 'h.sock');
    const r = await run([
      'telnet',
      '--config',
      config({ ...base, manifestFile: 'manifest.json', health: { port: sock } }),
    ]);
    expect(r.code).toBe(0);
    expect(r.infos).toEqual([{}]);
    const started = JSON.parse(r.lines.find((l) => l.includes('connector.started'))!) as Record<string, unknown>;
    expect(started).not.toHaveProperty('healthPort');
  });

  it('serves no health port unless asked, and says so', async () => {
    stubTelnet();
    const r = await run(['telnet', '--config', config({ ...base, manifestFile: 'manifest.json' })]);
    expect(r.code).toBe(0);
    expect(r.infos).toHaveLength(1);
    expect(Object.keys(r.infos[0]!)).toEqual([]);
    const started = JSON.parse(r.lines.find((l) => l.includes('connector.started'))!) as Record<string, unknown>;
    expect(started).not.toHaveProperty('healthPort');
    expect(r.lines.some((l) => l.includes('"event":"connector.stopped"'))).toBe(true);
  });

  const withHealth = { ...base, manifestFile: 'manifest.json', health: { port: 0 } };

  it('serves /health (200), /metrics, and 404 for anything else', async () => {
    stubTelnet();
    const got: [number, unknown][] = [];
    const r = await run(['telnet', '--config', config(withHealth)], async ({ health }) => {
      for (const [method, path] of [
        ['GET', 'health'],
        ['GET', 'metrics'],
        ['GET', 'nope'],
        ['POST', 'metrics'],
        ['POST', 'health'],
      ] as const) {
        const res = await fetch(new URL(path, health), { method });
        got.push([res.status, await res.json()]);
      }
    });
    expect(r.code).toBe(0);
    const url = r.infos[0]!.health!;
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const started = JSON.parse(r.lines.find((l) => l.includes('connector.started'))!) as { healthPort: number };
    expect(started.healthPort).toBe(Number(new URL(url).port));
    expect(got[0]).toEqual([200, { connector: 'telnet', ok: true, detail: 'up', since: 'now' }]);
    expect(got[1]![0]).toBe(200);
    expect(got[1]![1]).toMatchObject({ connector: 'telnet', proposed: 0 });
    expect(got.slice(2)).toEqual([
      [404, { error: 'not found' }],
      [404, { error: 'not found' }],
      [404, { error: 'not found' }],
    ]);
  });

  it('answers /health 503 when the connector is not well', async () => {
    stubTelnet({ ok: false, detail: 'stopped', since: 'then' });
    let status = 0;
    await run(['telnet', '--config', config(withHealth)], async ({ health }) => {
      status = (await fetch(new URL('health', health))).status;
    });
    expect(status).toBe(503);
  });
});
