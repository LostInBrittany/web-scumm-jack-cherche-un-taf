// The SSH connector (4.1.9, wiki/en/bridge.connector-ssh.md, docs/dev/threat-models/ssh.md): an `ssh2` server with a
// virtual terminal and a virtual disk. Authentication: a password that is a pairing code or a resume word (3 tries),
// or a public key the operator declared for a player. Only `pty`, `window-change` and `shell` are accepted: no exec,
// no sftp, no environment, no forwarding, no agent. `dedupeKey = sha256('ssh:' + sessionId + ':' + lineNo)`.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ssh2, { type Connection } from 'ssh2';
import type { ConnectorContext, ConnectorHealth, RealityConnector } from '../sdk';
import { AddressGate, SessionGuard, TERMINAL_LIMITS, type TerminalLimits } from '../terminal/guard';
import { LineAssembler } from '../terminal/line';
import { bindPlayer, ResumeWords, VirtualShell } from '../terminal/shell';

export interface SshConfig {
  host?: string;
  port: number;
  /** The host's private key (OpenSSH or PEM), as text: read from `hostKeyFile` by `sshConfig`. */
  hostKey: string;
  /** Public keys the operator declared, each for one player: `{ "key": "ssh-ed25519 AAAA…", "playerId": "p-…" }`. */
  keys?: { key: string; playerId: string }[];
  limits?: Partial<TerminalLimits>;
}

export function sshConfig(raw: Record<string, unknown>, baseDir: string): SshConfig {
  const c = raw as unknown as SshConfig & { hostKeyFile?: string };
  if (!c.hostKeyFile && !c.hostKey) throw new Error('ssh: "hostKeyFile" names the host key');
  return { ...c, hostKey: c.hostKeyFile ? readFileSync(resolve(baseDir, c.hostKeyFile), 'utf8') : c.hostKey };
}

const clamp = (n: unknown, lo: number, hi: number, d: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d;

/** Wraps a terminal's output at its width (the only use of `pty-req` and `window-change`). */
export function wrap(text: string, cols: number): string {
  return text
    .split('\r\n')
    .map((line) => {
      const out: string[] = [];
      let s = line;
      while ([...s].length > cols) {
        const chars = [...s];
        out.push(chars.slice(0, cols).join(''));
        s = chars.slice(cols).join('');
      }
      out.push(s);
      return out.join('\r\n');
    })
    .join('\r\n');
}

export class SshConnector implements RealityConnector {
  readonly id = 'ssh';
  private server: InstanceType<typeof ssh2.Server> | undefined;
  private clients = new Set<Connection>();
  private resume = new ResumeWords();
  private since = new Date().toISOString();
  private ctx: ConnectorContext | null = null;
  private limits: TerminalLimits;
  private keys: { ssh: Buffer; parsed: NonNullable<ReturnType<typeof parseOne>>; playerId: string }[] = [];
  refusedConnections = 0;
  private gate: AddressGate;
  port = 0;

  constructor(private c: SshConfig) {
    this.limits = { ...TERMINAL_LIMITS, ...c.limits };
    this.gate = new AddressGate(this.limits);
    for (const k of c.keys ?? []) {
      const parsed = parseOne(k.key);
      if (parsed && /^[\w.:-]{1,128}$/.test(k.playerId))
        this.keys.push({ ssh: parsed.getPublicSSH(), parsed, playerId: k.playerId });
    }
  }

  async start(ctx: ConnectorContext): Promise<void> {
    const decl = ctx.manifest.connectors?.ssh;
    if (!decl) throw new Error('ssh: the game declares no `reality.connectors.ssh`');
    this.ctx = ctx;
    const server = new ssh2.Server({ hostKeys: [this.c.hostKey], ident: 'web-scumm-connector' }, (client, info) =>
      this.client(client, info?.ip ?? '?', ctx, decl),
    );
    server.maxConnections = this.limits.maxConnections;
    server.on('error', () => ctx.log('ssh.server-error'));
    this.server = server;
    await new Promise<void>((ok, ko) => {
      server.once('error', ko);
      server.listen(this.c.port, this.c.host ?? '127.0.0.1', () => ok());
    });
    const a = server.address();
    this.port = a && typeof a === 'object' ? a.port : 0;
    ctx.log('ssh.started', { port: this.port });
  }

  private client(
    client: Connection,
    address: string,
    ctx: ConnectorContext,
    decl: NonNullable<ConnectorContext['manifest']['connectors']>['ssh'] & {},
  ): void {
    client.on('error', () => {});
    if (!this.gate.enter(address)) {
      this.refusedConnections++;
      ctx.reject('busy');
      hangUp(client);
      return;
    }
    this.clients.add(client);
    let tries = 0;
    let idle: NodeJS.Timeout | undefined;
    let playerId: string | null = null;
    let word: string | undefined;
    // Before authentication: at most `pairMs`; the session's own clock starts with the shell.
    const auth = setTimeout(() => hangUp(client), this.limits.pairMs);
    auth.unref();
    client.on('error', () => {});
    client.on('close', () => {
      clearTimeout(auth);
      clearTimeout(idle);
      if (this.clients.delete(client)) this.gate.leave(address);
    });
    client.on('authentication', (a) => {
      const fail = () => {
        const spent = this.gate.failed(address);
        if (++tries >= 3 || spent) {
          ctx.reject('authentication');
          a.reject();
          return hangUp(client);
        }
        a.reject(['password', 'publickey']);
      };
      if (a.method === 'publickey' && a.key) {
        const k = this.keys.find((x) => x.ssh.length === a.key!.data.length && timingSafeEqual(x.ssh, a.key!.data));
        if (!k) return fail();
        if (!a.signature) return a.accept(); // the client asks whether this key would do; it signs next
        if (k.parsed.verify(a.blob!, a.signature, a.hashAlgo) !== true) return fail();
        playerId = k.playerId;
        return a.accept();
      }
      if (a.method === 'password' && typeof a.password === 'string' && a.password.length <= 64) {
        void bindPlayer(ctx, this.resume, a.password)
          .then((r) => {
            if ('refusal' in r) return fail();
            playerId = r.playerId;
            word = r.word;
            a.accept();
          })
          // A pairing that throws (or a connection gone before the answer) is a refusal, never an unhandled rejection.
          .catch(() => {
            try {
              fail();
            } catch {}
          });
        return;
      }
      if (a.method === 'none') return a.reject(['password', 'publickey']);
      fail();
    });
    client.on('ready', () => {
      clearTimeout(auth);
      // Authenticated, no shell yet: the same idle limit as a silent terminal.
      idle = setTimeout(() => hangUp(client), this.limits.idleMs);
      idle.unref();
      // One session and one shell per connection: more would multiply the limits each session holds.
      let sessions = 0;
      client.on('session', (accept, reject) => {
        if (sessions++ > 0) {
          ctx.reject('ssh-second-session');
          return reject();
        }
        const session = accept();
        let shells = 0;
        let cols = 80;
        session.on('pty', (ok, _no, info) => {
          cols = clamp(info.cols, 10, 500, 80);
          ok?.();
        });
        session.on('window-change', (ok, _no, info) => {
          cols = clamp(info.cols, 10, 500, 80);
          ok?.();
        });
        for (const ev of ['exec', 'subsystem', 'env', 'x11', 'auth-agent', 'signal'] as const)
          session.on(ev, (_ok, no) => {
            ctx.reject(`ssh-${ev}`);
            no?.();
          });
        session.on('shell', (ok, no) => {
          if (shells++ > 0) {
            ctx.reject('ssh-second-shell');
            return no?.();
          }
          clearTimeout(idle);
          const stream = ok();
          const sessionId = randomBytes(8).toString('hex');
          let open = true;
          const close = (why: string) => {
            if (!open) return;
            open = false;
            shell.closed = true;
            guard.dispose();
            ctx.log('ssh.closed', { why });
            stream.end();
            client.end();
          };
          const write = (s: string) => {
            if (open && stream.writable) stream.write(wrap(s, cols));
          };
          const guard = new SessionGuard(this.limits, (why) => {
            write(`\r\nClosed (${why}).\r\n`);
            close(why);
          });
          guard.bound();
          const shell = new VirtualShell({
            connector: 'ssh',
            ctx,
            decl,
            sessionId,
            resume: this.resume,
            write,
            close,
            ...(playerId ? { playerId } : {}),
          });
          const lines = new LineAssembler(
            this.limits.maxLine,
            {
              line: (text) => {
                if (!guard.line()) return write('Slow down.\r\n');
                void shell.line(text);
              },
              tooLong: () => {
                ctx.reject('line-too-long');
                write(`Line too long (${this.limits.maxLine} bytes at most).\r\n${decl.prompt ?? '> '}`);
              },
              cancel: () => write(decl.prompt ?? '> '),
              eof: () => close('eof'),
              echo: (s) => write(s),
            },
            true,
          );
          stream.on('data', (d: Buffer) => {
            if (!open) return;
            if (!guard.bytes(d.length)) {
              ctx.reject('too-fast');
              return close('too-fast');
            }
            lines.push(d);
          });
          stream.on('close', () => close('closed'));
          stream.on('error', () => close('error'));
          ctx.log('ssh.shell');
          if (word) write(`Resume word, for 30 minutes: ${word}\r\n`);
          shell.start();
        });
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    for (const c of this.clients) c.end();
    if (server) await new Promise<void>((ok) => server.close(() => ok()));
    this.ctx = null;
  }

  async health(): Promise<ConnectorHealth> {
    return this.ctx && this.server
      ? { ok: true, detail: `${this.clients.size} client(s) on port ${this.port}`, since: this.since }
      : { ok: false, detail: 'stopped', since: this.since };
  }
}

function parseOne(key: string) {
  const k = ssh2.utils.parseKey(key);
  if (k instanceof Error) return null;
  return Array.isArray(k) ? (k[0] ?? null) : k;
}

/**
 * Ends a connection, then destroys its socket: before the handshake, ssh2's `end()` only half-closes it and a client
 * would wait for its own timeout. `_sock` is ssh2's socket (an internal name: if it changed, a refused connection in
 * tests/connectors-ssh.test.ts would wait for its timeout and fail).
 */
function hangUp(client: Connection): void {
  client.end();
  const sock = (client as unknown as { _sock?: { destroy(): void } })._sock;
  setTimeout(() => sock?.destroy(), 100).unref();
}
