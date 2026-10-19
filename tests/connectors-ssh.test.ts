// The SSH connector (4.1.9, docs/dev/threat-models/ssh.md): `ssh2` with its native parts refused, a password that is
// a pairing code (3 tries), a declared public key, a virtual terminal and disk; exec, sftp and forwarding refused;
// hostile commands (`../`, `$(…)`, NUL bytes, a 1 MB line), resizing. Port 0, closed after. Excluded from the
// `windows` CI job until ported (said in .github/workflows/ci.yml).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ssh2, { type ClientChannel } from 'ssh2';
import { afterAll, describe, expect, it } from 'vitest';
import { SshConnector, wrap } from '../connectors/src/ssh/connector';
import { contextFor, sshKeyPair, startBridge, type TestBridge } from './fixtures/connectors/harness';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

const host = sshKeyPair();
const player = sshKeyPair();

async function sshServer(
  t: TestBridge,
  keys: { key: string; playerId: string }[] = [],
  lines: string[] = [],
  limits: ConstructorParameters<typeof SshConnector>[0]['limits'] = {},
) {
  const { ctx } = await contextFor(t, 'ssh', { lines });
  const c = new SshConnector({ port: 0, hostKey: host.private, keys, limits });
  await c.start(ctx);
  cleanup.push(() => c.stop());
  return c;
}

/** Connects; resolves with the client, or with the error the server ended it on. */
function login(port: number, o: { password?: string; privateKey?: string }) {
  const c = new ssh2.Client();
  return new Promise<{ client: InstanceType<typeof ssh2.Client> } | { error: Error }>((ok) => {
    c.on('ready', () => ok({ client: c }));
    c.on('error', (error: Error) => ok({ error }));
    // A connection refused before its handshake just closes.
    c.on('close', () => ok({ error: new Error('closed') }));
    c.connect({ host: '127.0.0.1', port, username: 'player', readyTimeout: 10_000, tryKeyboard: false, ...o });
  });
}

function shell(client: InstanceType<typeof ssh2.Client>, cols = 80) {
  return new Promise<{ stream: ClientChannel; text: () => string; until: (re: RegExp) => Promise<void> }>((ok, ko) =>
    client.shell({ cols, rows: 24, term: 'xterm' }, (err, stream) => {
      if (err) return ko(err);
      let buf = '';
      stream.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
      });
      const until = async (re: RegExp) => {
        const t0 = Date.now();
        while (!re.test(buf)) {
          if (Date.now() - t0 > 8000) throw new Error(`timed out on ${re}: ${JSON.stringify(buf.slice(-400))}`);
          await new Promise((r) => setTimeout(r, 10));
        }
      };
      ok({ stream, text: () => buf, until });
    }),
  );
}

describe('ssh2 builds no native code', () => {
  it('maps cpu-features and nan to the refusing stub, and ssh2 has no compiled binding', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
      packages: Record<string, { resolved?: string; link?: boolean }>;
    };
    for (const n of ['cpu-features', 'nan'])
      expect(lock.packages[`node_modules/${n}`]).toEqual({ resolved: 'connectors/vendor/refused-native', link: true });
    const nodeFiles = (d: string): string[] =>
      existsSync(d)
        ? readdirSync(d).flatMap((e) => {
            const p = join(d, e);
            return statSync(p).isDirectory() ? nodeFiles(p) : e.endsWith('.node') ? [p] : [];
          })
        : [];
    expect(nodeFiles('node_modules/ssh2')).toEqual([]);
  });
});

describe('the SSH connector', () => {
  let t: TestBridge;
  it('logs in with a pairing code, keeps to its virtual disk and commands, proposes once', async () => {
    t = await startBridge();
    cleanup.push(() => t.close());
    const lines: string[] = [];
    const c = await sshServer(t, [], lines);
    const code = await t.code();
    const r = await login(c.port, { password: code });
    if ('error' in r) throw r.error;
    cleanup.push(() => {
      r.client.end();
    });
    const sh = await shell(r.client);
    await sh.until(/Resume word, for 30 minutes: R\w{4}-\w{4}[\s\S]*shed\$ $/);
    const write = (s: string) => sh.stream.write(s);
    write('cat ../../../../etc/passwd\r');
    await sh.until(/cat: no such file/);
    write('cd /..\rpwd\r');
    await sh.until(/shed\$ \/\r\n/);
    write('cat /notes/lamp.txt\r');
    await sh.until(/The lamp obeys two words: lamp on\./);
    for (const hostile of ['$(reboot)', '`id`', 'lamp on; rm -rf /', 'lamp\x00 on']) write(`${hostile}\r`);
    write(`${'z'.repeat(600)}\r`);
    await sh.until(/Line too long \(512 bytes at most\)/);
    write('lamp on\r');
    await sh.until(/a lamp glows/);
    const { playerId } = (await (await fetch(new URL(`v1/pairings/${code}`, t.url))).json()) as { playerId: string };
    await new Promise((x) => setTimeout(x, 100));
    // `lamp\0 on`: the NUL is dropped and "lamp on" remains: two lines, two facts (the game applies the signal once).
    expect(t.count(playerId)).toBe(2);
    expect(sh.text().match(/Unknown command\. Type help\./g)?.length).toBe(3);
    expect(lines.join('\n')).not.toMatch(new RegExp(`${code}|passwd|reboot`));
    // A 1 MB line passes the 64 KB a second a session may send: the session is closed, the server goes on.
    const closed = new Promise<void>((ok) => sh.stream.on('close', () => ok()));
    write('z'.repeat(1024 * 1024));
    await closed;
    expect((await c.health()).ok).toBe(true);
  }, 30_000);

  it('refuses exec, sftp and forwarding, and wraps output at the terminal width', async () => {
    const c = await sshServer(t);
    // One session per connection: each refused request gets a connection of its own.
    const signIn = async () => {
      const r = await login(c.port, { password: await t.code() });
      if ('error' in r) throw r.error;
      return r.client;
    };
    const a = await signIn();
    const exec = await new Promise<Error | undefined>((ok) => a.exec('id', (err) => ok(err)));
    expect(exec).toBeInstanceOf(Error);
    a.end();
    const b = await signIn();
    const sftp = await new Promise<Error | undefined>((ok) => b.sftp((err) => ok(err)));
    expect(sftp).toBeInstanceOf(Error);
    const fwd = await new Promise<Error | undefined>((ok) =>
      b.forwardOut('127.0.0.1', 1, '127.0.0.1', 22, (err) => ok(err)),
    );
    expect(fwd).toBeInstanceOf(Error);
    b.end();
    expect(wrap('abcdefghij', 4)).toBe('abcd\r\nefgh\r\nij');
    const r = { client: await signIn() };
    cleanup.push(() => {
      r.client.end();
    });
    const sh = await shell(r.client, 10);
    await sh.until(/shed\$ $/);
    sh.stream.setWindow(24, 12, 0, 0);
    sh.stream.write('cat /notes/door.txt\r');
    await sh.until(/The shed doo\r\nr opens for/);
  }, 30_000);

  it('closes after three wrong passwords, accepts a declared key, refuses an unknown one', async () => {
    const c = await sshServer(t, [{ key: player.public, playerId: 'p-0123456789abcdef' }]);
    const bad = await login(c.port, { password: 'WRONG123' });
    expect('error' in bad).toBe(true);
    const keyed = await login(c.port, { privateKey: player.private });
    if ('error' in keyed) throw keyed.error;
    keyed.client.end();
    const stranger = await login(c.port, { privateKey: sshKeyPair().private });
    expect('error' in stranger).toBe(true);
  }, 30_000);

  it('one shell per connection; an authenticated connection without a shell times out', async () => {
    const c = await sshServer(t, [], [], { idleMs: 400 });
    const r = await login(c.port, { password: await t.code() });
    if ('error' in r) throw r.error;
    const first = await shell(r.client);
    await first.until(/shed\$ $/);
    const second = await new Promise<Error | undefined>((ok) =>
      r.client.shell({ cols: 80, rows: 24 }, (err) => ok(err)),
    );
    expect(second).toBeInstanceOf(Error);
    r.client.end();
    const idle = await login(c.port, { password: await t.code() });
    if ('error' in idle) throw idle.error;
    const t0 = Date.now();
    await new Promise<void>((ok) => idle.client.on('close', () => ok()));
    expect(Date.now() - t0).toBeLessThan(3000);
  }, 30_000);

  it('holds three connections per address, counts wrong passwords across reconnections', async () => {
    const c = await sshServer(t, [], [], { perAddress: 3, triesPerAddress: 2 });
    const held = [];
    for (let i = 0; i < 3; i++) {
      const r = await login(c.port, { password: await t.code() });
      if ('error' in r) throw r.error;
      held.push(r.client);
    }
    expect('error' in (await login(c.port, { password: await t.code() }))).toBe(true);
    for (const h of held) h.end();
    await new Promise((r) => setTimeout(r, 200));
    // Two wrong passwords on two connections: the address has spent its tries, a right code is refused after.
    expect('error' in (await login(c.port, { password: 'WRONG123' }))).toBe(true);
    expect('error' in (await login(c.port, { password: 'WRONG456' }))).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect('error' in (await login(c.port, { password: await t.code() }))).toBe(true);
  }, 30_000);
});
