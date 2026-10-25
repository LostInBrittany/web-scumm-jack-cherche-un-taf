#!/usr/bin/env node
// npm run connector-archive-e2e -- [--tarballs=<dir>] [--keep] (4.1.19, plan §8.2): the four connectors played end to
// end from their archive, as an operator installs them, against a Bridge from its own archive. `external-consumer`
// proves the packages install and start on three systems; this proves, on Linux, what each connector does with a real
// client once started:
//   - email, webhook: a pairing letter, a letter accepted, the same letter a duplicate, a forged signature refused;
//   - email, IMAP: a small IMAP server of this script's own (no container: a server in Node narrows the chain of
//     trust), polled by the connector: the pairing letter and the accepted letter deleted, a letter with an attachment
//     refused and flagged;
//   - Telnet: pairing typed, a declared command accepted (its signal in the player's journal), an undeclared one
//     refused, a line over the limit refused, UTF-8 typed and backspaced, then `exit`;
//   - SSH: the pairing code as password, the same commands, a backspace over a typed character, a file of the virtual
//     disk read and a path outside it refused, a wrong password refused;
//   - Open Badge: an OB3 credential of a `did:key` issuer verified offline (valid), another one for someone else
//     (invalid), and a badge at a private address (refused before any connection: indeterminate).
// What only a person checks stays a pass (`connectors-real-security`, #79): real providers, real exposure, a redirect
// and a DNS change at a public issuer (the archive cannot reach the test-only network overrides, by design).
// Nothing here is imported from the checkout: the archives are the candidate's (`--tarballs=`) or packed from it.
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { harness } from './lib/archive-harness.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const base = mkdtempSync(join(tmpdir(), 'connector-archive-e2e-'));
const _WIN = process.platform === 'win32';
let failed = 0;
const step = (name, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✖'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};
// Every command a step of scripts/lib/archive-harness.mjs: an id, a duration, the command that reproduces a failure.
const h = harness({ base });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const children = [];
process.on('exit', (code) => {
  for (const c of children) c.kill('SIGKILL');
  // A failure keeps what each process said (second reading of 4.1.19 PR 3): the end of every log, then the folder
  // removed unless --keep.
  if (code !== 0)
    for (const f of readdirSync(base).filter((x) => x.endsWith('.log'))) {
      const lines = readFileSync(join(base, f), 'utf8').trimEnd().split('\n');
      console.error(`\n--- ${f} (last ${Math.min(30, lines.length)} lines)\n${lines.slice(-30).join('\n')}`);
    }
  if (!args.includes('--keep')) rmSync(base, { recursive: true, force: true });
});

// ---------------------------------------------------------------- the archives
let tarballs = flag('tarballs');
if (!tarballs) {
  tarballs = join(base, 'pack');
  h.run(
    'pack this checkout (no --tarballs: a local try)',
    process.execPath,
    [join(ROOT, 'scripts', 'pack.mjs'), `--out=${tarballs}`],
    ROOT,
  );
}
const tgz = (name) => {
  const f = join(resolve(tarballs), `${name}-${version}.tgz`);
  if (!existsSync(f)) throw new Error(`${f}: missing`);
  return f;
};

// ---------------------------------------------------------------- the Bridge, from its archive, on SQLite
const fixtures = JSON.parse(
  readFileSync(join(ROOT, 'connectors', 'test-vectors', 'open-badge', 'fixtures.json'), 'utf8'),
).cases;
const jwt = fixtures['ob3-jwt-valid'].submission.badge;
const issuer = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).issuer.id;
const manifest = {
  format: 'web-scumm-reality-manifest',
  schema: 1,
  gameId: 'keeper',
  signals: [
    ['letter.door', 'email'],
    ['letter.unclear', 'email'],
    ['terminal.lamp', 'terminal'],
    ['badge.valid', 'badge'],
    ['badge.refused', 'badge'],
  ].map(([id, source]) => ({ id, source, availability: 'optional', replay: 'record', once: false })),
  connectors: {
    email: { answers: [{ words: ['open', 'door'], signal: 'letter.door' }], otherwise: 'letter.unclear' },
    telnet: {
      banner: 'The shed.',
      prompt: 'shed> ',
      commands: [{ says: 'lamp on', reply: 'Click. Somewhere in the garden, a lamp glows.', signal: 'terminal.lamp' }],
    },
    ssh: {
      banner: 'The shed.',
      prompt: 'shed$ ',
      commands: [{ says: 'lamp on', reply: 'Click. Somewhere in the garden, a lamp glows.', signal: 'terminal.lamp' }],
      files: { '/notes/lamp.txt': 'The lamp obeys two words: lamp on.' },
    },
    'open-badge': { issuers: [issuer], valid: 'badge.valid', invalid: 'badge.refused', indeterminate: 'badge.refused' },
  },
};
const bridgeDir = h.unpack(tgz('quest-n-click-bridge'), join(base, 'bridge'));
h.run('the Bridge installed from its archive', 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], bridgeDir);
const BIN = join(bridgeDir, 'bin.mjs');
const data = join(base, 'data');
writeFileSync(join(base, 'manifest.json'), JSON.stringify(manifest));
h.run(
  'init',
  process.execPath,
  [BIN, 'init', `--dir=${data}`, `--manifest=${join(base, 'manifest.json')}`, '--no-demo-webhooks'],
  base,
);
const PORT = 6100 + Math.floor(Math.random() * 400);
const URLB = `http://127.0.0.1:${PORT}/`;
const serve = (cmd, a, log) => {
  const out = createWriteStream(join(base, log));
  const c = spawn(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] });
  c.stdout.pipe(out);
  c.stderr.pipe(out);
  children.push(c);
  return c;
};
serve(
  process.execPath,
  [BIN, 'serve', `--dir=${data}`, `--port=${PORT}`, `--store=sqlite:${join(data, 'bridge.sqlite')}`],
  'bridge.log',
);
const http = async (url, o = {}) => {
  const r = await fetch(url, { ...o, headers: { 'content-type': 'application/json', ...(o.headers ?? {}) } });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text };
};
const until = async (what, test, ms = 30_000, said = () => '') => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await test()) return true;
    } catch {
      /* not yet */
    }
    await sleep(300);
  }
  throw new Error(`${what}: not within ${ms} ms${said() ? `; it said: ${JSON.stringify(said().slice(-400))}` : ''}`);
};
await until('the Bridge', async () => (await http(`${URLB}v1/keys`)).status === 200);
/** A pairing code the game would show, and, once a connector confirmed it, the player and its capability. */
const pairing = async () =>
  (await http(`${URLB}v1/pairings`, { method: 'POST', body: JSON.stringify({ gameId: 'keeper' }) })).json.code;
const claim = async (code) => (await http(`${URLB}v1/pairings/${code}`)).json;
const journal = async (cap) =>
  (await http(`${URLB}v1/signals`, { headers: { authorization: `Bearer ${cap}` } })).json?.signals ?? [];

// ---------------------------------------------------------------- the connectors, from their archive
const operator = join(base, 'operator');
mkdirSync(operator);
writeFileSync(join(operator, 'package.json'), JSON.stringify({ name: 'operator', private: true }));
h.run(
  'the connectors installed from their archive',
  'npm',
  ['install', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund', tgz('quest-n-click-connectors')],
  operator,
);
const CBIN = join(operator, 'node_modules', '@quest-n-click', 'connectors', 'bin.mjs');
const grant = (name, source, signals) => {
  const f = join(base, `${name}.token`);
  writeFileSync(
    f,
    h
      .run(
        `grant ${name}`,
        process.execPath,
        [BIN, 'grant', `--dir=${data}`, `--connector=${name}`, `--source=${source}`, `--signals=${signals}`, '--pair'],
        base,
        { capture: true },
      )
      .trim(),
    { mode: 0o600 },
  );
  return f;
};
const P = { webhook: PORT + 1, imap: PORT + 2, imapServer: PORT + 3, telnet: PORT + 4, ssh: PORT + 5, badge: PORT + 6 };
const start = (id, kind, section, token) => {
  const file = join(base, `${id}.json`);
  writeFileSync(
    file,
    JSON.stringify({
      bridge: { url: URLB, tokenFile: token },
      gameId: 'keeper',
      manifestFile: join(base, 'manifest.json'),
      [kind]: section,
    }),
  );
  serve(process.execPath, [CBIN, kind, '--config', file], `${id}.log`);
};
const listening = (port) =>
  until(
    `port ${port}`,
    () =>
      new Promise((ok) =>
        connect(port, '127.0.0.1')
          .on('connect', function () {
            this.destroy();
            ok(true);
          })
          .on('error', () => ok(false)),
      ),
  );

// ---- email, webhook
const secret = randomBytes(24).toString('hex');
writeFileSync(join(base, 'webhook.secret'), secret, { mode: 0o600 });
start(
  'email-webhook',
  'email',
  { mode: 'webhook', domain: 'garden.example', webhook: { port: P.webhook, secretFile: join(base, 'webhook.secret') } },
  grant('mail-hook', 'email', 'letter.door,letter.unclear'),
);
const eml = (name, vars) => {
  let t = readFileSync(join(ROOT, 'connectors', 'test-vectors', 'email', name), 'utf8');
  for (const [k, v] of Object.entries(vars)) t = t.replaceAll(`{{${k}}}`, v);
  return t.replace(/\r?\n/g, '\r\n');
};
const inbound = (raw, key = secret) => {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', key).update(`${ts}.${raw}`).digest('hex');
  return http(`http://127.0.0.1:${P.webhook}/v1/inbound`, {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'message/rfc822',
      'x-web-scumm-timestamp': ts,
      'x-web-scumm-signature': `sha256=${sig}`,
    },
  });
};
await listening(P.webhook);
{
  const code = await pairing();
  const paired = await inbound(eml('pairing.eml', { code }));
  const who = await claim(code);
  const letter = eml('plain-open-door.eml', { player: who.playerId });
  const first = await inbound(letter);
  const again = await inbound(letter);
  const forged = await inbound(letter.replace('<m01@', '<m99@'), 'not the secret');
  const sigs = await journal(who.capability);
  step(
    'email (webhook): paired, a letter accepted, again a duplicate, a forged signature refused',
    paired.status === 202 &&
      first.status === 202 &&
      again.status === 200 &&
      again.json?.status === 'duplicate' &&
      forged.status === 401 &&
      sigs.length === 1,
    `${paired.status} ${first.status} ${again.status} ${JSON.stringify(again.json)} ${forged.status}, ${sigs.length} signal`,
  );
}

// ---- email, IMAP: a server of this script's own
const box = [];
let uidNext = 1;
const put = (raw) => box.push({ uid: uidNext++, raw, flags: new Set() });
const imap = createServer((s) => {
  s.write('* OK fake IMAP ready\r\n');
  let buf = '';
  s.on('data', (d) => {
    buf += d.toString('latin1');
    for (let i; (i = buf.indexOf('\r\n')) >= 0; ) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const [tag, ...rest] = line.split(' ');
      const cmd = rest.join(' ');
      const ok = () => s.write(`${tag} OK done\r\n`);
      if (/^LOGIN\b/i.test(cmd)) {
        // The password file read by the connector, checked here (second reading of 4.1.19 PR 3).
        if (/^LOGIN "?gate"? "?letmein"?$/i.test(cmd)) ok();
        else s.write(`${tag} NO [AUTHENTICATIONFAILED] wrong\r\n`);
      } else if (/^SELECT\b/i.test(cmd)) ok();
      else if (/^UID SEARCH UNSEEN/i.test(cmd)) {
        s.write(
          `* SEARCH ${box
            .filter((m) => !m.flags.has('\\Seen'))
            .map((m) => m.uid)
            .join(' ')}\r\n`,
        );
        ok();
      } else if (/^UID SEARCH/i.test(cmd)) {
        s.write(
          `* SEARCH ${box
            .filter((m) => m.flags.has('\\Seen') && !m.flags.has('\\Flagged'))
            .map((m) => m.uid)
            .join(' ')}\r\n`,
        );
        ok();
      } else if (/^UID FETCH (\d+) \(RFC822\.SIZE\)/i.test(cmd)) {
        const m = box.find((x) => x.uid === Number(/(\d+)/.exec(cmd)[1]));
        if (m) s.write(`* 1 FETCH (UID ${m.uid} RFC822.SIZE ${Buffer.byteLength(m.raw, 'latin1')})\r\n`);
        ok();
      } else if (/^UID FETCH (\d+) \(BODY\.PEEK\[\]\)/i.test(cmd)) {
        const m = box.find((x) => x.uid === Number(/(\d+)/.exec(cmd)[1]));
        if (m) s.write(`* 1 FETCH (UID ${m.uid} BODY[] {${Buffer.byteLength(m.raw, 'latin1')}}\r\n${m.raw})\r\n`);
        ok();
      } else if (/^UID STORE (\d+) \+FLAGS\.SILENT \(([^)]*)\)/i.test(cmd)) {
        const [, uid, flags] = /^UID STORE (\d+) \+FLAGS\.SILENT \(([^)]*)\)/i.exec(cmd);
        const m = box.find((x) => x.uid === Number(uid));
        for (const f of flags.split(' ').filter(Boolean)) m?.flags.add(f);
        ok();
      } else if (/^EXPUNGE/i.test(cmd)) {
        for (let k = box.length - 1; k >= 0; k--) if (box[k].flags.has('\\Deleted')) box.splice(k, 1);
        ok();
      } else if (/^LOGOUT/i.test(cmd)) {
        s.write('* BYE\r\n');
        ok();
        s.end();
      } else s.write(`${tag} BAD unknown\r\n`);
    }
  });
  s.on('error', () => {});
});
await new Promise((ok) => imap.listen(P.imapServer, '127.0.0.1', ok));
{
  const code = await pairing();
  put(eml('pairing.eml', { code }).replace('<m09@', '<i09@'));
  writeFileSync(join(base, 'imap.password'), 'letmein', { mode: 0o600 });
  start(
    'email-imap',
    'email',
    {
      mode: 'imap',
      domain: 'garden.example',
      imap: {
        host: '127.0.0.1',
        port: P.imapServer,
        user: 'gate',
        passwordFile: join(base, 'imap.password'),
        tls: false,
        pollS: 1,
      },
    },
    grant('mail-imap', 'email', 'letter.door,letter.unclear'),
  );
  // The capability is handed once: the first claim that finds the player keeps it.
  let who = null;
  await until('the IMAP pairing', async () => {
    const c = await claim(code);
    if (c?.playerId) who = c;
    return !!who;
  });
  put(eml('plain-open-door.eml', { player: who.playerId }).replace('<m01@', '<i01@'));
  put(eml('hostile-attachment.eml', { player: who.playerId }).replace('<m15@', '<i15@'));
  await until('the IMAP letters', () => box.length === 1 && box[0].flags.has('\\Flagged'), 20_000);
  // The same letter again (its Message-ID): a duplicate, deleted, no second signal.
  put(eml('plain-open-door.eml', { player: who.playerId }).replace('<m01@', '<i01@'));
  await until('the duplicate letter', () => box.length === 1, 20_000);
  const sigs = await journal(who.capability);
  step(
    'email (IMAP): its password checked, paired, a letter accepted and deleted, again a duplicate, an attachment refused and flagged',
    sigs.length === 1 && box.length === 1 && box[0].flags.has('\\Seen'),
    `${sigs.length} signal, ${box.length} letter left, flags ${[...(box[0]?.flags ?? [])].join(' ')}`,
  );
}

// ---- a terminal client: what the connector wrote, read until a pattern
const terminal = (stream) => {
  let text = '';
  stream.on('data', (d) => {
    // Telnet options (IAC, then two bytes, or a subnegotiation to IAC SE) are not text.
    text += Buffer.from(d)
      .toString('latin1')
      .replace(/\xff\xfa[\s\S]*?\xff\xf0|\xff[\xfb-\xfe][\s\S]|\xff[\xf0-\xfa]/g, '');
  });
  return {
    get text() {
      return Buffer.from(text, 'latin1').toString('utf8');
    },
    wait: (re, ms = 10_000) =>
      until(`the terminal to say ${re}`, () => re.test(Buffer.from(text, 'latin1').toString('utf8')), ms),
    mark() {
      const at = text.length;
      return () => Buffer.from(text.slice(at), 'latin1').toString('utf8');
    },
  };
};
const GLOWS = /lamp glows\./;

// ---- Telnet
start('telnet', 'telnet', { port: P.telnet }, grant('shed-telnet', 'terminal', 'terminal.lamp'));
await listening(P.telnet);
{
  const code = await pairing();
  const s = connect(P.telnet, '127.0.0.1');
  const t = terminal(s);
  await t.wait(/Pairing code: $/);
  s.write(`${code}\r\n`);
  await t.wait(/shed> $/);
  let since = t.mark();
  s.write('lamp on\r\n');
  await until('the lamp', () => GLOWS.test(since()) && /shed> $/.test(since()));
  since = t.mark();
  s.write('; rm -rf /\r\n');
  await until('a refusal', () => /Unknown command/.test(since()) && /shed> $/.test(since()));
  const refused = since();
  since = t.mark();
  s.write(`${'x'.repeat(600)}\r\n`);
  await until('a long line', () => /Line too long/.test(since()), 10_000, since);
  since = t.mark();
  // UTF-8 and a stray continuation byte: an unknown command, the session whole (a Telnet client edits its line itself:
  // the backspace is the SSH session's, which has a terminal).
  s.write(Buffer.concat([Buffer.from('café'), Buffer.from([0x80]), Buffer.from('\r\n')]));
  await until(
    'UTF-8 refused as a command',
    () => /Unknown command/.test(since()) && /shed> $/.test(since()),
    10_000,
    since,
  );
  since = t.mark();
  s.write('lamp on\r\n');
  await until('the lamp again', () => GLOWS.test(since()), 10_000, since);
  s.write('exit\r\n');
  await t.wait(/Goodbye/);
  s.destroy();
  const who = await claim(code);
  const sigs = await journal(who.capability);
  step(
    'Telnet: paired, a command accepted twice, an unknown one, UTF-8 with a stray byte and an over-long line refused',
    sigs.length === 2 && !/rm -rf/.test(refused),
    `${sigs.length} signals`,
  );
}

// ---- SSH: the operator's own ssh2 as the client
const ssh2 = createRequire(join(operator, 'package.json'))('ssh2');
// Drawn again until ssh2 reads it back (4.1.20 PR 3): `generateKeyPairSync` now and then writes an ed25519 key its own
// `parseKey` calls "Malformed OpenSSH private key" (#111, 12 October), as the tests' `sshKeyPair()` found in 4.1.11.
function hostKeyPair() {
  for (let i = 0; i < 20; i++) {
    const k = ssh2.utils.generateKeyPairSync('ed25519');
    const priv = ssh2.utils.parseKey(k.private);
    const pub = ssh2.utils.parseKey(k.public);
    const data = Buffer.from('web-scumm host key');
    const sig = priv instanceof Error || pub instanceof Error ? null : priv.sign(data);
    if (sig && !(sig instanceof Error) && pub.verify(data, sig) === true) return k;
    console.warn(
      `[flake] ssh host key draw ${i + 1}: ${priv.message ?? pub.message ?? sig?.message ?? 'does not verify'}`,
    );
  }
  throw new Error('ssh2 produced no usable ed25519 host key in 20 draws');
}
const hostKey = hostKeyPair().private;
writeFileSync(join(base, 'ssh_host_key'), hostKey, { mode: 0o600 });
start(
  'ssh',
  'ssh',
  { port: P.ssh, hostKeyFile: join(base, 'ssh_host_key') },
  grant('shed-ssh', 'terminal', 'terminal.lamp'),
);
await listening(P.ssh);
const login = (password) =>
  new Promise((ok, ko) => {
    const c = new ssh2.Client();
    c.on('ready', () => ok(c))
      .on('error', ko)
      .connect({
        host: '127.0.0.1',
        port: P.ssh,
        username: 'player',
        password,
        readyTimeout: 10_000,
        tryKeyboard: false,
      });
  });
{
  let wrong = 'accepted';
  await login('AAAA2222').then(
    (c) => c.end(),
    (e) => (wrong = e?.level === 'client-authentication' ? 'refused' : `failed otherwise: ${e?.message}`),
  );
  const code = await pairing();
  const c = await login(code);
  const stream = await new Promise((ok, ko) =>
    c.shell({ cols: 80, rows: 24, term: 'xterm' }, (e, s) => (e ? ko(e) : ok(s))),
  );
  const t = terminal(stream);
  await t.wait(/shed\$ $/);
  let since = t.mark();
  stream.write('lamp onx\x7f\r');
  await until('the lamp', () => GLOWS.test(since()) && /shed\$ $/.test(since()));
  since = t.mark();
  stream.write('cat /notes/lamp.txt\r');
  await until('the file', () => /obeys two words/.test(since()));
  since = t.mark();
  stream.write('cat ../../../../etc/passwd\r');
  await until('outside the disk', () => /no such file/.test(since()));
  const outside = since();
  stream.end('exit\r');
  c.end();
  const who = await claim(code);
  const sigs = await journal(who.capability);
  step(
    'SSH: a wrong password refused, paired by its code, a command (a typed character erased), a file read, a path outside refused',
    wrong === 'refused' && sigs.length === 1 && !/root:/.test(outside),
    `${sigs.length} signal`,
  );
}

// ---- Open Badge
start('badge', 'open-badge', { port: P.badge }, grant('badges', 'badge', 'badge.valid,badge.refused'));
await listening(P.badge);
{
  const submit = async (badge, email) => {
    const code = await pairing();
    const r = await http(`http://127.0.0.1:${P.badge}/v1/badges`, {
      method: 'POST',
      body: JSON.stringify({ code, badge, email }),
    });
    return { ...r, who: await claim(code) };
  };
  const valid = await submit(jwt, 'robin@player.example');
  const wrong = await submit(
    fixtures['ob3-wrong-recipient'].submission.badge,
    fixtures['ob3-wrong-recipient'].submission.email,
  );
  const local = await submit('https://127.0.0.1/assertion', 'robin@player.example');
  // Each verdict reaches the Bridge as the signal the game declared for it: one in each player's journal.
  const reached = await Promise.all([valid, wrong, local].map(async (x) => (await journal(x.who?.capability)).length));
  step(
    'Open Badge: an OB3 credential of a did:key issuer valid offline, one for someone else invalid, a private address refused; each verdict a signal',
    valid.status === 202 &&
      valid.json?.status === 'valid' &&
      wrong.json?.status === 'invalid' &&
      local.json?.status === 'indeterminate' &&
      reached.every((n) => n === 1),
    `${valid.json?.status} ${wrong.json?.status} ${local.json?.status}, signals ${reached.join(' ')}`,
  );
}

imap.close();
console.log(
  failed
    ? `✖  connector-archive-e2e: ${failed} scenario(s) failed (logs in ${base}, --keep keeps them)`
    : '✔  connector-archive-e2e: the four connectors from their archive, every scenario',
);
process.exit(failed ? 1 : 0);
