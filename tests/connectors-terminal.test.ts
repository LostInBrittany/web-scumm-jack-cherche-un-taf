// The Telnet connector and the virtual terminal it shares with SSH (4.1.9, docs/dev/threat-models/telnet.md): Telnet
// negotiation filtered, lines assembled under limits, the shell that is not a shell, the virtual disk, and the server
// under abuse (binary, slow, truncated, malformed input, floods, 1 000 connections at once). Ports 0, closed after.
// Excluded from the `windows` CI job until ported (socket timing assumed POSIX; .github/workflows/ci.yml says so).
import { connect, type Socket } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { TelnetConnector, TelnetFilter } from '../connectors/src/telnet/connector';
import { TERMINAL_LIMITS } from '../connectors/src/terminal/guard';
import { LineAssembler, printable } from '../connectors/src/terminal/line';
import { VirtualDisk } from '../connectors/src/terminal/vfs';
import { contextFor, startBridge, type TestBridge } from './fixtures/connectors/harness';

const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

describe('Telnet negotiation', () => {
  it('refuses every option once, skips subnegotiations, keeps an escaped 255', () => {
    const f = new TelnetFilter();
    const r = f.push(
      new Uint8Array([255, 253, 1, 104, 255, 251, 3, 105, 255, 253, 1, 255, 255, 255, 250, 24, 1, 255, 240, 33]),
    );
    expect([...r.data]).toEqual([104, 105, 255, 33]);
    expect([...r.reply]).toEqual([255, 252, 1, 255, 254, 3]);
    expect(f.push(new Uint8Array([255, 250, ...new Array(80).fill(65)])).error).toBe('subnegotiation');
  });
});

describe('lines', () => {
  it('assembles lines, drops control characters, refuses a line over the limit whole', () => {
    const got: string[] = [];
    let long = 0;
    const l = new LineAssembler(16, { line: (t) => got.push(t), tooLong: () => long++ });
    l.push(Buffer.from('lamp on\r\n\x00ls\x07 -l\n'));
    l.push(Buffer.from(`${'x'.repeat(40)}\r\nok\r`));
    l.push(Buffer.from('\nend\n'));
    expect(got).toEqual(['lamp on', 'ls -l', 'ok', 'end']);
    expect(long).toBe(1);
    expect(printable('a‮b​c\u0000d⁦e')).toBe('abcde');
  });

  it('edits like a pty: echo, backspace over UTF-8, Ctrl-C, Ctrl-D, escape sequences swallowed', () => {
    const got: string[] = [];
    let echo = '';
    let eof = 0;
    const l = new LineAssembler(
      64,
      { line: (t) => got.push(t), tooLong: () => {}, echo: (s) => (echo += s), cancel: () => {}, eof: () => eof++ },
      true,
    );
    l.push(Buffer.from('lampx\x7f on\x1b[A\r'));
    l.push(Buffer.from('café\x7f\x7f\x7f\x7fno\x03yes\r\x04'));
    expect(got).toEqual(['lamp on', 'yes']);
    expect(echo).toContain('\b \b');
    expect(eof).toBe(1);
  });
});

describe('the virtual disk', () => {
  const disk = () =>
    new VirtualDisk({ '/notes/lamp.txt': 'lamp on', '/notes/door.txt': 'open the door', '/top.txt': 'top' });
  it('never leaves its tree', () => {
    expect(VirtualDisk.normalise('/notes', '../../../etc/passwd')).toBe('/etc/passwd');
    expect(VirtualDisk.normalise('/', '/..//./notes/./lamp.txt')).toBe('/notes/lamp.txt');
    const d = disk();
    expect(d.cat('../../../etc/passwd')).toBe('cat: no such file');
    expect(d.cd('/..')).toBeNull();
    expect(d.pwd()).toBe('/');
    expect(d.ls()).toBe('notes/  top.txt');
    expect(d.cd('notes')).toBeNull();
    expect(d.ls()).toBe('door.txt  lamp.txt');
    expect(d.cat('lamp.txt')).toBe('lamp on');
    expect(d.cd('lamp.txt')).toBe('cd: not a directory');
    expect(d.cat('.')).toBe('cat: is a directory');
  });
});

/** A Telnet client that collects what it receives. */
async function client(port: number): Promise<{
  s: Socket;
  text: () => string;
  until: (re: RegExp, ms?: number) => Promise<string>;
  closed: Promise<void>;
}> {
  const s = connect(port, '127.0.0.1');
  let buf = '';
  s.on('data', (d) => {
    buf += d.toString('latin1');
  });
  s.on('error', () => {});
  const closed = new Promise<void>((ok) => s.on('close', () => ok()));
  await new Promise<void>((ok) => s.on('connect', () => ok()));
  const until = async (re: RegExp, ms = 5000) => {
    const t0 = Date.now();
    while (!re.test(buf)) {
      if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${re} in ${JSON.stringify(buf.slice(-300))}`);
      await new Promise((r) => setTimeout(r, 10));
    }
    return buf;
  };
  return { s, text: () => buf, until, closed };
}

async function telnet(t: TestBridge, limits: Partial<typeof TERMINAL_LIMITS> = {}, lines: string[] = []) {
  const { ctx } = await contextFor(t, 'telnet', { lines });
  const c = new TelnetConnector({ port: 0, limits });
  await c.start(ctx);
  cleanup.push(() => c.stop());
  return { c, ctx };
}

describe('the Telnet connector', () => {
  let t: TestBridge;
  it('pairs by code, answers the declared commands, proposes once, and is not a shell', async () => {
    t = await startBridge();
    cleanup.push(() => t.close());
    const lines: string[] = [];
    const { c } = await telnet(t, {}, lines);
    const k = await client(c.port);
    await k.until(/Pairing code: $/);
    const code = await t.code();
    k.s.write(`${code.toLowerCase()}\r\n`);
    await k.until(/Resume word, for 30 minutes: (R\w{4}-\w{4})/);
    const word = /Resume word, for 30 minutes: (R\w{4}-\w{4})/.exec(k.text())![1]!;
    for (const hostile of [
      '; rm -rf /',
      '$(reboot)',
      '`id`',
      'cat /etc/passwd',
      '../../bin/sh',
      'lamp on && reboot',
      'LAMP\x00ON',
    ])
      k.s.write(`${hostile}\r\n`);
    k.s.write('status\r\nlamp on\r\nhelp\r\n');
    await k.until(/lamp on\r\nstatus\r\nclear\r\nexit/);
    expect(k.text().match(/Unknown command\. Type help\./g)).toHaveLength(7);
    expect(k.text()).toContain('Click. Somewhere in the garden, a lamp glows.');
    const { playerId } = (await (await fetch(new URL(`v1/pairings/${code}`, t.url))).json()) as { playerId: string };
    expect(t.count(playerId)).toBe(1);
    // Nothing typed is printed back.
    expect(k.text()).not.toMatch(/rm -rf|reboot|passwd|bin\/sh/);
    k.s.write('exit\r\n');
    await k.closed;
    // A resume word links a new session to the same player.
    const k2 = await client(c.port);
    await k2.until(/Pairing code: $/);
    k2.s.write(`${word}\r\nlamp on\r\n`);
    await k2.until(/Linked again[\s\S]*a lamp glows/);
    await k2.until(/shed> $/);
    expect(t.count(playerId)).toBe(2); // another session, another line: another fact (the game applies it once)
    k2.s.end();
    expect(lines.join('\n')).not.toMatch(new RegExp(`${code}|${word}|rm -rf|reboot`));
  }, 30_000);

  it('closes after three wrong codes, and refuses binary garbage, IAC floods and a 1 MB line without crashing', async () => {
    const { c } = await telnet(t);
    const k = await client(c.port);
    await k.until(/Pairing code: $/);
    k.s.write('AAAAAAAA\r\nnot a code\r\nZZZZ9999\r\n');
    await k.until(/Too many wrong codes/);
    await k.closed;
    const b = await client(c.port);
    b.s.write(Buffer.from([0, 1, 2, 255, 255, 0xc3, 0x28, 0xf0, 0x90, 0x28, 0xbc, 13, 10]));
    b.s.write(Buffer.from([255, 253, 1, 255, 253, 1, 255, 253, 1]));
    b.s.write(Buffer.alloc(1024 * 1024 - 100, 0x61));
    await b.closed; // over 64 KB in a second: hung up
    const after = await client(c.port);
    await after.until(/Pairing code: $/);
    after.s.end();
    expect((await c.health()).ok).toBe(true);
  }, 30_000);

  it('tells a line over 512 bytes, slows a flood of lines, and hangs up on a slow client', async () => {
    const { c } = await telnet(t, { linesPerMinute: 5, idleMs: 300 });
    const k = await client(c.port);
    k.s.write(`${'y'.repeat(600)}\r\n`);
    await k.until(/Line too long \(512 bytes at most\)/);
    k.s.write(' \r\n'.repeat(6));
    await k.until(/Slow down\./);
    // Then silence: the idle limit closes it (slowloris), a byte at a time does not keep it open either.
    await k.until(/Closed \(idle\)/, 3000);
    await k.closed;
    const slow = await client(c.port);
    slow.s.write('A');
    await new Promise((r) => setTimeout(r, 150));
    slow.s.write('B');
    await slow.until(/Closed \(idle\)/, 3000);
  }, 30_000);

  it('holds 20 sessions and turns the rest away cleanly, a thousand attempts at once', async () => {
    // One address here: its own limit lifted, so the server's limit of 20 is the one tested.
    const { c } = await telnet(t, { perAddress: 1000 });
    const sockets = await Promise.all(
      Array.from(
        { length: 1000 },
        () =>
          new Promise<Socket>((ok) => {
            const s = connect(c.port, '127.0.0.1');
            s.on('error', () => {});
            s.on('connect', () => ok(s));
            s.on('close', () => ok(s));
          }),
      ),
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(c.refusedConnections).toBeGreaterThanOrEqual(980);
    for (const s of sockets) s.destroy();
    // A session is freed when the server sees its socket close: wait for that before the next client.
    for (let i = 0; i < 200 && c.sessionCount >= 20; i++) await new Promise((r) => setTimeout(r, 25));
    expect(c.sessionCount).toBeLessThan(20);
    const later = await client(c.port);
    await later.until(/Pairing code: $/, 5000);
    later.s.end();
  }, 60_000);

  it('holds three connections per address, counts wrong codes across reconnections, closes an unpaired one', async () => {
    const { c } = await telnet(t, { perAddress: 3, triesPerAddress: 4, pairMs: 400 });
    const three = await Promise.all([client(c.port), client(c.port), client(c.port)]);
    for (const k of three) await k.until(/Pairing code: $/);
    const fourth = await client(c.port);
    await fourth.until(/busy/);
    await fourth.closed;
    // Unpaired, the three are closed at the pre-authentication limit.
    for (const k of three) {
      await k.until(/Closed \(pairing-time\)/, 3000);
      await k.closed;
    }
    for (let i = 0; i < 100 && c.sessionCount > 0; i++) await new Promise((r) => setTimeout(r, 20));
    // Two wrong codes, hang up, two more: the address has spent its four tries, reconnecting does not reset them.
    for (let round = 0; round < 2; round++) {
      const k = await client(c.port);
      await k.until(/Pairing code: $/);
      k.s.write('AAAAAAAA\r\nBBBBBBBB\r\n');
      await k.until(round === 0 ? /does not work[\s\S]*does not work/ : /Too many wrong codes/);
      k.s.destroy();
      await k.closed;
    }
    for (let i = 0; i < 100 && c.sessionCount > 0; i++) await new Promise((r) => setTimeout(r, 20));
    const refused = await client(c.port);
    await refused.until(/busy/);
  }, 30_000);
});
