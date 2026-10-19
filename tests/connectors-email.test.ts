// The email connector (4.1.9, docs/dev/threat-models/email.md): the MIME reader on 20 fixtures (6 hostile), the worker
// that isolates it, the routing (recipient tag, pairing code, linked sender), the answers by whole words, the signed
// webhook (signature, freshness, replay), and the IMAP mode against a fake server (deletion after acceptance,
// retention, a lying server). Every server on port 0, closed in afterAll.
import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { answerOf, EmailConnector, taggedPlayer } from '../connectors/src/email/connector';
import { decodeWords, headerValue, htmlToText, parseMail } from '../connectors/src/email/mime';
import { MimeParser } from '../connectors/src/email/parse';
import { createContext } from '../connectors/src/sdk';
import { contextFor, MANIFEST, startBridge, type TestBridge } from './fixtures/connectors/harness';

const DIR = 'connectors/test-vectors/email';
const eml = (name: string, vars: Record<string, string> = {}) =>
  new Uint8Array(
    Buffer.from(
      readFileSync(`${DIR}/${name}`, 'utf8').replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`),
      'utf8',
    ),
  );
const cleanup: (() => Promise<unknown> | void)[] = [];
afterAll(async () => {
  for (const f of cleanup.reverse()) await f();
});

describe('the MIME reader', () => {
  it('has twenty fixtures, six of them hostile', () => {
    const all = readdirSync(DIR).filter((f) => f.endsWith('.eml'));
    expect(all).toHaveLength(20);
    expect(all.filter((f) => f.startsWith('hostile-'))).toHaveLength(6);
  });

  it.each([
    ['plain-open-door.eml', /please open the door of the shed/i],
    ['html-only.eml', /Please open the door & thanks\./],
    ['alternative.eml', /^Open the door, please\.$/],
    ['qp-latin1.eml', /Ouvrez la porte, s'il vous plaît: open the door\./],
    ['base64-utf8.eml', /Open the door\. Ça s'ouvre \?/],
    ['inline-parts.eml', /First part\. Open the door\./],
  ])('reads the text of %s', (name, text) => {
    const r = parseMail(eml(name));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mail.text).toMatch(text);
  });

  it('decodes encoded and folded headers, and every recipient', () => {
    const s = parseMail(eml('encoded-subject.eml'));
    expect(s.ok && s.mail.subject).toBe('Open the door ✉');
    const f = parseMail(eml('folded-headers.eml', { player: 'p-0123456789abcdef' }));
    expect(f.ok && f.mail.subject).toBe('Open the door');
    expect(f.ok && f.mail.messageId).toBe('m10@player.example');
    expect(f.ok && f.mail.to).toEqual(['gate+p-0123456789abcdef@garden.example']);
    const c = parseMail(eml('cc-tag.eml', { player: 'p-0123456789abcdef' }));
    expect(c.ok && c.mail.to).toContain('gate+p-0123456789abcdef@garden.example');
    expect(decodeWords('=?iso-8859-1?Q?caf=E9_cr=E8me?=')).toBe('café crème');
    expect(decodeWords('=?x-unknown?B?b3Blbg==?=')).toBe('open');
    expect(headerValue('text/plain; charset="utf-8"; format=flowed')).toEqual({
      value: 'text/plain',
      params: { charset: 'utf-8', format: 'flowed' },
    });
  });

  it('refuses a message without Message-ID, and the six hostile ones as it should', () => {
    expect(parseMail(eml('no-message-id.eml'))).toEqual({ ok: false, reason: 'no Message-ID' });
    const att = parseMail(eml('hostile-attachment.eml'));
    expect(att.ok && att.mail.attachments).toBe(1);
    const nested = parseMail(eml('hostile-nested-rfc822.eml'));
    expect(nested.ok && nested.mail.attachments).toBe(1);
    expect(parseMail(eml('hostile-deep-multipart.eml'))).toEqual({ ok: false, reason: 'multipart nested too deep' });
    expect(parseMail(eml('hostile-many-parts.eml'))).toEqual({ ok: false, reason: 'too many parts' });
    const script = parseMail(eml('hostile-script.eml'));
    expect(script.ok && script.mail.text).not.toMatch(/door/);
    const bidi = parseMail(eml('hostile-bidi.eml'));
    expect(bidi.ok).toBe(true);
    if (bidi.ok) {
      expect(`${bidi.mail.subject}${bidi.mail.text}`).not.toMatch(/[\u0000-\u001f​‮⁦⁩]/);
      expect(bidi.mail.subject).not.toMatch(/open the door/);
    }
  });

  it('refuses a header block over 64 KB, and cuts text at its limit', () => {
    const huge = `X-Pad: ${'a'.repeat(70_000)}\r\nMessage-ID: <x@y>\r\n\r\nbody`;
    expect(parseMail(new Uint8Array(Buffer.from(huge)))).toEqual({ ok: false, reason: 'header block over 64 KB' });
    const long = `Message-ID: <x@y>\r\n\r\n${'word '.repeat(1000)}`;
    const r = parseMail(new Uint8Array(Buffer.from(long)), { depth: 3, parts: 64, headers: 200, textChars: 100 });
    expect(r.ok && r.mail.truncated).toBe(true);
    expect(r.ok && r.mail.text.length).toBeLessThanOrEqual(100);
  });

  it('turns HTML into inert text in one pass, even when hostile', () => {
    expect(htmlToText('<p>a</p><script>b</script><!-- c -->d &lt;e&gt; &#x41;&#66;')).toMatch(/^ a +d <e> AB$/);
    expect(htmlToText('<script>never closed')).toBe(' ');
    const t0 = performance.now();
    htmlToText('<script'.repeat(40_000));
    htmlToText('<'.repeat(200_000));
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('never throws, whatever the bytes', () => {
    for (let i = 0; i < 200; i++) {
      const b = new Uint8Array(Math.floor(Math.random() * 2000)).map(() => Math.floor(Math.random() * 256));
      expect(() => parseMail(b)).not.toThrow();
    }
  });
});

describe('the reader runs in a worker', () => {
  it('reads in the worker, and replaces a worker that ran out of time', async () => {
    const p = new MimeParser({ timeoutMs: 15_000 });
    cleanup.push(() => p.close());
    const ok = await p.parse(eml('plain-open-door.eml'));
    expect(ok.ok).toBe(true);
    // A worker that never answers: the message is refused at its budget, the worker replaced.
    const slow = new MimeParser({
      timeoutMs: 300,
      workerUrl: new URL('./fixtures/connectors/hang-worker.mjs', import.meta.url),
    });
    cleanup.push(() => slow.close());
    const r = await slow.parse(eml('plain-open-door.eml'));
    expect(r).toEqual({ ok: false, reason: 'the reader ran out of time' });
    expect(slow.restarts).toBe(1);
    expect(await p.parse(eml('hostile-many-parts.eml'))).toEqual({ ok: false, reason: 'too many parts' });
  }, 60_000);
});

describe('routing and answers', () => {
  const decl = MANIFEST.connectors!.email!;
  it('finds the player in a recipient tag of its own domain only', () => {
    expect(taggedPlayer(['gate+p-0123456789abcdef@garden.example'], 'garden.example')).toBe('p-0123456789abcdef');
    expect(taggedPlayer(['gate+p-0123456789abcdef@evil.example'], 'garden.example')).toBeNull();
    expect(taggedPlayer(['gate+p-0123456789abcdef@garden.example'], undefined)).toBeNull();
    expect(taggedPlayer(['gate+p-xyz@garden.example'], 'garden.example')).toBeNull();
  });
  it('matches whole words, any case, else the fallback', () => {
    expect(answerOf({ subject: 'OPEN the DOOR!', text: '' }, decl)).toEqual({ index: 0, signal: 'letter.door' });
    expect(answerOf({ subject: '', text: 'reopen the doorway' }, decl)).toEqual({
      index: -1,
      signal: 'letter.unclear',
    });
    expect(answerOf({ subject: '', text: '' }, { answers: decl.answers })).toBeNull();
  });
});

const signed = (secret: string, body: Buffer, at = Math.floor(Date.now() / 1000)) => ({
  'X-Web-Scumm-Timestamp': String(at),
  'X-Web-Scumm-Signature': `sha256=${createHmac('sha256', secret).update(`${at}.`).update(body).digest('hex')}`,
});

describe('the webhook mode', () => {
  let t: TestBridge;
  it('links by pairing code, then proposes once per Message-ID; refuses forged, stale and hostile posts', async () => {
    t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx, lines } = await contextFor(t, 'email');
    const secret = 'webhook-secret-for-tests';
    const c = new EmailConnector({ mode: 'webhook', domain: 'garden.example', webhook: { port: 0, secret } });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    const post = (body: Uint8Array, headers: Record<string, string> = signed(secret, Buffer.from(body))) =>
      fetch(`http://127.0.0.1:${c.port}/v1/inbound`, { method: 'POST', body: Buffer.from(body), headers });
    // Pairing: the sender who sent the code is linked to the player the Bridge made.
    const code = await t.code();
    const pairing = await post(eml('pairing.eml', { code }));
    expect(pairing.status).toBe(202);
    // A tagged message for that player: accepted, then the same Message-ID again is a duplicate.
    const claimed = (await (await fetch(new URL(`v1/pairings/${code}`, t.url))).json()) as { playerId: string };
    const door = eml('plain-open-door.eml', { player: claimed.playerId });
    expect((await post(door)).status).toBe(202);
    expect((await post(door)).status).toBe(200);
    expect(t.count(claimed.playerId)).toBe(1);
    // The linked sender, without a tag: routed to the same player; the answer falls back.
    const unclear = eml('plain-unclear.eml', { player: 'nobody' });
    expect((await post(unclear)).status).toBe(202);
    expect(t.count(claimed.playerId)).toBe(2);
    // Spoofing From routes nothing: a stranger without a tag or a link has no player.
    const spoofed = eml('spoofed-from.eml', { player: 'p-ffffffffffffffff' });
    expect((await post(spoofed)).status).toBe(422);
    // Forged, stale, oversized, with an attachment.
    expect((await post(door, { ...signed('wrong', Buffer.from(door)) })).status).toBe(401);
    expect((await post(door, signed(secret, Buffer.from(door), Math.floor(Date.now() / 1000) - 3600))).status).toBe(
      401,
    );
    expect((await post(new Uint8Array(300 * 1024))).status).toBe(413);
    const att = eml('hostile-attachment.eml', { player: claimed.playerId });
    expect(await (await post(att)).json()).toEqual({ error: 'attachment' });
    expect(t.count(claimed.playerId)).toBe(2);
    // The log names events, never an address, a subject or a code.
    const log = lines.join('\n');
    for (const s of ['robin@player.example', 'open the door', code, secret, 'Hello there', 'garden.example'])
      expect(log.includes(s), s).toBe(false);
    expect(ctx.metrics().rejectedInputs).toBeGreaterThanOrEqual(4);
  }, 60_000);
});

/** A scripted IMAP server: the mailbox in memory, the commands the connector sends, and what it did. */
function fakeImap(
  messages: Map<number, { raw: Buffer; flags: Set<string> }>,
  o: { lie?: boolean; hostile?: 'zeros' | 'flood' } = {},
) {
  const log: string[] = [];
  const server: Server = createServer((s: Socket) => {
    s.write('* OK fake IMAP ready\r\n');
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('latin1');
      let i = buf.indexOf('\r\n');
      while (i >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        i = buf.indexOf('\r\n');
        const [tag, ...rest] = line.split(' ');
        const cmd = rest.join(' ');
        log.push(cmd.startsWith('LOGIN') ? 'LOGIN' : cmd);
        const ok = () => s.write(`${tag} OK done\r\n`);
        if (/^(LOGIN|SELECT)/.test(cmd)) ok();
        else if (o.hostile === 'zeros' && /^UID SEARCH UNSEEN/.test(cmd)) {
          // One response line chaining empty literals without end.
          s.write('* SEARCH 1 {0}\r\n'.repeat(20_000));
        } else if (o.hostile === 'flood' && /^UID SEARCH UNSEEN/.test(cmd)) {
          // Untagged lines, each under 8 KB, many megabytes in all.
          s.write(`* OK ${'x'.repeat(8000)}\r\n`.repeat(2000));
        } else if (/^UID SEARCH UNSEEN/.test(cmd)) {
          const uids = [...messages].filter(([, m]) => !m.flags.has('\\Seen')).map(([u]) => u);
          s.write(`* SEARCH ${uids.join(' ')}\r\n`);
          ok();
        } else if (/^UID SEARCH SEEN/.test(cmd)) {
          const uids = [...messages]
            .filter(([, m]) => m.flags.has('\\Seen') && !m.flags.has('\\Flagged'))
            .map(([u]) => u);
          s.write(`* SEARCH ${uids.join(' ')}\r\n`);
          ok();
        } else if (/^UID FETCH (\d+) \(RFC822\.SIZE\)/.test(cmd)) {
          const uid = Number(/(\d+)/.exec(cmd)![1]);
          s.write(`* 1 FETCH (UID ${uid} RFC822.SIZE ${o.lie ? 10 : messages.get(uid)!.raw.length})\r\n`);
          ok();
        } else if (/^UID FETCH (\d+) \(BODY\.PEEK\[\]\)/.test(cmd)) {
          const uid = Number(/(\d+)/.exec(cmd)![1]);
          const raw = messages.get(uid)!.raw;
          s.write(`* 1 FETCH (UID ${uid} BODY[] {${o.lie ? 999_999_999 : raw.length}}\r\n`);
          s.write(raw);
          s.write(')\r\n');
          ok();
        } else if (/^UID STORE (\d+) \+FLAGS\.SILENT \((.*)\)/.test(cmd)) {
          const [, uid, flags] = /^UID STORE (\d+) \+FLAGS\.SILENT \((.*)\)/.exec(cmd)!;
          for (const f of flags!.split(' ')) messages.get(Number(uid))?.flags.add(f);
          ok();
        } else if (cmd === 'EXPUNGE') {
          for (const [u, m] of messages) if (m.flags.has('\\Deleted')) messages.delete(u);
          ok();
        } else if (cmd === 'LOGOUT') {
          s.write('* BYE\r\n');
          ok();
          s.end();
        } else s.write(`${tag} BAD unknown\r\n`);
      }
    });
    s.on('error', () => {});
  });
  return { server, log };
}

describe('the IMAP mode', () => {
  it('handles the unseen messages, deletes what was accepted, flags what was refused', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const code = await t.code();
    const { ctx } = await contextFor(t, 'email');
    const pairingFirst = new Map([[1, { raw: Buffer.from(eml('pairing.eml', { code })), flags: new Set<string>() }]]);
    const imap = fakeImap(pairingFirst);
    await new Promise<void>((ok) => imap.server.listen(0, '127.0.0.1', ok));
    cleanup.push(() => new Promise<void>((ok) => imap.server.close(() => ok())));
    const port = (imap.server.address() as { port: number }).port;
    const c = new EmailConnector({
      mode: 'imap',
      domain: 'garden.example',
      imap: { host: '127.0.0.1', port, user: 'gate', password: 'pw "quoted"', tls: false, pollS: 3600 },
    });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    await c.poll();
    const { playerId } = (await (await fetch(new URL(`v1/pairings/${code}`, t.url))).json()) as { playerId: string };
    expect(pairingFirst.size).toBe(0); // the pairing message was deleted
    pairingFirst.set(2, { raw: Buffer.from(eml('plain-open-door.eml', { player: playerId })), flags: new Set() });
    pairingFirst.set(3, { raw: Buffer.from(eml('hostile-attachment.eml', { player: playerId })), flags: new Set() });
    await c.poll();
    expect(t.count(playerId)).toBe(1);
    expect([...pairingFirst.keys()]).toEqual([3]);
    expect([...pairingFirst.get(3)!.flags].sort()).toEqual(['\\Flagged', '\\Seen']);
    expect(imap.log).not.toContain(expect.stringContaining('pw'));
    expect((await c.health()).ok).toBe(true);
  }, 60_000);

  it('keeps messages N days when asked, then sweeps them', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'email');
    const box = new Map([
      [7, { raw: Buffer.from(eml('plain-unclear.eml', { player: 'p-0123456789abcdef' })), flags: new Set(['\\Seen']) }],
    ]);
    const imap = fakeImap(box);
    await new Promise<void>((ok) => imap.server.listen(0, '127.0.0.1', ok));
    cleanup.push(() => new Promise<void>((ok) => imap.server.close(() => ok())));
    const port = (imap.server.address() as { port: number }).port;
    const c = new EmailConnector({
      mode: 'imap',
      imap: { host: '127.0.0.1', port, user: 'u', password: 'p', tls: false, pollS: 3600, keepDays: 7 },
    });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    await c.poll();
    expect(imap.log.some((l) => /^UID SEARCH SEEN UNFLAGGED BEFORE \d{1,2}-\w{3}-\d{4}$/.test(l))).toBe(true);
    expect(box.size).toBe(0);
  }, 60_000);

  it.each([['zeros'], ['flood']] as const)(
    'hangs up on a server that sends %s (a response bounded in lines, literals and bytes)',
    async (hostile) => {
      const t = await startBridge();
      cleanup.push(() => t.close());
      const { ctx } = await contextFor(t, 'email');
      const box = new Map([[1, { raw: Buffer.from(eml('plain-unclear.eml')), flags: new Set<string>() }]]);
      const imap = fakeImap(box, { hostile });
      await new Promise<void>((ok) => imap.server.listen(0, '127.0.0.1', ok));
      cleanup.push(() => new Promise<void>((ok) => imap.server.close(() => ok())));
      const port = (imap.server.address() as { port: number }).port;
      const c = new EmailConnector({
        mode: 'imap',
        imap: { host: '127.0.0.1', port, user: 'u', password: 'p', tls: false, pollS: 3600 },
      });
      await c.start(ctx);
      cleanup.push(() => c.stop());
      const rss = process.memoryUsage().rss;
      await c.poll();
      expect((await c.health()).ok).toBe(false);
      expect(process.memoryUsage().rss - rss).toBeLessThan(64 * 1024 * 1024);
    },
    30_000,
  );

  it('leaves a message unseen when the Bridge is away (retried later), flags it when refused for good', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const player = 'p-0123456789abcdef';
    const box = new Map([[1, { raw: Buffer.from(eml('plain-open-door.eml', { player })), flags: new Set<string>() }]]);
    const imap = fakeImap(box);
    await new Promise<void>((ok) => imap.server.listen(0, '127.0.0.1', ok));
    cleanup.push(() => new Promise<void>((ok) => imap.server.close(() => ok())));
    const port = (imap.server.address() as { port: number }).port;
    const config = { host: '127.0.0.1', port, user: 'u', password: 'p', tls: false, pollS: 3600 };
    // The Bridge away: unreachable, the message stays unseen.
    const away = createContext({
      bridge: { url: 'http://127.0.0.1:9/', token: 'x' },
      gameId: 'signals',
      manifest: MANIFEST,
      connector: 'email',
      write: () => {},
      retries: 0,
      limits: { timeoutMs: 500 },
    });
    const first = new EmailConnector({ mode: 'imap', domain: 'garden.example', imap: config });
    await first.start(away);
    await first.poll();
    await first.stop();
    expect(box.get(1)!.flags.size).toBe(0);
    // A token without the signal: denied for good, Seen and Flagged.
    const token = await t.token({ connector: 'email', sources: ['email'], signals: ['letter.unclear'] });
    const { ctx } = await contextFor(t, 'email', { token });
    const second = new EmailConnector({ mode: 'imap', domain: 'garden.example', imap: config });
    await second.start(ctx);
    cleanup.push(() => second.stop());
    await second.poll();
    expect([...box.get(1)!.flags].sort()).toEqual(['\\Flagged', '\\Seen']);
  }, 30_000);

  it('refuses an IMAP connection without TLS to anything but this machine', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'email');
    const c = new EmailConnector({
      mode: 'imap',
      imap: { host: 'mail.example.org', port: 143, user: 'u', password: 'p', tls: false },
    });
    await expect(c.start(ctx)).rejects.toThrow(/loopback host only/);
  });

  it('hangs up on a server that announces a literal over the limit', async () => {
    const t = await startBridge();
    cleanup.push(() => t.close());
    const { ctx } = await contextFor(t, 'email');
    const box = new Map([[1, { raw: Buffer.from(eml('plain-unclear.eml')), flags: new Set<string>() }]]);
    const imap = fakeImap(box, { lie: true });
    await new Promise<void>((ok) => imap.server.listen(0, '127.0.0.1', ok));
    cleanup.push(() => new Promise<void>((ok) => imap.server.close(() => ok())));
    const port = (imap.server.address() as { port: number }).port;
    const c = new EmailConnector({
      mode: 'imap',
      imap: { host: '127.0.0.1', port, user: 'u', password: 'p', tls: false, pollS: 3600 },
    });
    await c.start(ctx);
    cleanup.push(() => c.stop());
    await c.poll();
    expect((await c.health()).ok).toBe(false);
    expect(box.get(1)!.flags.size).toBe(0);
  }, 60_000);
});
