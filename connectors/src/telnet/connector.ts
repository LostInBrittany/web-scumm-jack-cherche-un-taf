// The Telnet connector (4.1.9, wiki/en/bridge.connector-telnet.md, docs/dev/threat-models/telnet.md): a TCP server apart
// from the Bridge, the least Telnet a client needs (every option refused once, subnegotiations skipped, IAC filtered),
// lines assembled under limits, and the virtual shell. `dedupeKey = sha256('telnet:' + sessionId + ':' + lineNo)`.
import { randomBytes } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { listen } from '../http';
import type { ConnectorContext, ConnectorHealth, RealityConnector } from '../sdk';
import { AddressGate, SessionGuard, TERMINAL_LIMITS, type TerminalLimits } from '../terminal/guard';
import { LineAssembler } from '../terminal/line';
import { ResumeWords, VirtualShell } from '../terminal/shell';

const IAC = 255;
const SB = 250;
const SE = 240;
const WILL = 251;
const WONT = 252;
const DO = 253;
const DONT = 254;

/** Telnet's commands out of a byte stream: the data, the refusals to send back, or a reason to hang up. */
export class TelnetFilter {
  private state: 'data' | 'iac' | 'option' | 'sb' | 'sb-iac' = 'data';
  private verb = 0;
  private sbLength = 0;
  private answered = new Set<string>();

  push(chunk: Uint8Array): { data: Uint8Array; reply: Uint8Array; error?: 'subnegotiation' } {
    const data: number[] = [];
    const reply: number[] = [];
    for (const b of chunk) {
      switch (this.state) {
        case 'data':
          if (b === IAC) this.state = 'iac';
          else data.push(b);
          break;
        case 'iac':
          if (b === IAC) {
            data.push(IAC);
            this.state = 'data';
          } else if (b >= WILL && b <= DONT) {
            this.verb = b;
            this.state = 'option';
          } else if (b === SB) {
            this.sbLength = 0;
            this.state = 'sb';
          } else this.state = 'data'; // NOP, AYT, IP, GA…: dropped
          break;
        case 'option': {
          // Refuse every option, once each: DO → WONT, WILL → DONT; a WONT or DONT needs no answer.
          const key = `${this.verb}:${b}`;
          if ((this.verb === DO || this.verb === WILL) && !this.answered.has(key)) {
            this.answered.add(key);
            reply.push(IAC, this.verb === DO ? WONT : DONT, b);
          }
          this.state = 'data';
          break;
        }
        case 'sb':
          if (++this.sbLength > 64)
            return { data: new Uint8Array(data), reply: new Uint8Array(reply), error: 'subnegotiation' };
          if (b === IAC) this.state = 'sb-iac';
          break;
        case 'sb-iac':
          this.state = b === SE ? 'data' : 'sb';
          break;
      }
    }
    return { data: new Uint8Array(data), reply: new Uint8Array(reply) };
  }
}

export interface TelnetConfig {
  host?: string;
  port: number;
  limits?: Partial<TerminalLimits>;
}

export class TelnetConnector implements RealityConnector {
  readonly id = 'telnet';
  private server: Server | undefined;
  private sessions = new Map<Socket, VirtualShell>();
  private resume = new ResumeWords();
  private since = new Date().toISOString();
  private ctx: ConnectorContext | null = null;
  private stopping = false;
  private limits: TerminalLimits;
  /** Connections turned away (busy, too fast, too long): a count the tests read. */
  refusedConnections = 0;
  port = 0;

  private gate: AddressGate;

  constructor(private c: TelnetConfig) {
    this.limits = { ...TERMINAL_LIMITS, ...c.limits };
    this.gate = new AddressGate(this.limits);
  }

  /** Sessions open now (the tests wait on it after closing sockets). */
  get sessionCount(): number {
    return this.sessions.size;
  }

  async start(ctx: ConnectorContext): Promise<void> {
    const decl = ctx.manifest.connectors?.telnet;
    if (!decl) throw new Error('telnet: the game declares no `reality.connectors.telnet`');
    this.ctx = ctx;
    this.stopping = false;
    this.server = createServer((socket) => this.connection(socket, ctx, decl));
    this.server.on('error', () => ctx.log('telnet.server-error'));
    this.port = await listen(this.server, this.c.port, this.c.host ?? '127.0.0.1');
    ctx.log('telnet.started', { port: this.port });
  }

  private connection(
    socket: Socket,
    ctx: ConnectorContext,
    decl: NonNullable<ConnectorContext['manifest']['connectors']>['telnet'] & {},
  ): void {
    socket.on('error', () => {});
    const address = socket.remoteAddress ?? '?';
    if (this.stopping || this.sessions.size >= this.limits.maxConnections || !this.gate.enter(address)) {
      this.refusedConnections++;
      ctx.reject('busy');
      socket.end('The terminal is busy. Try again later.\r\n');
      setTimeout(() => socket.destroy(), 1000).unref();
      return;
    }
    socket.setNoDelay(true);
    const sessionId = randomBytes(8).toString('hex');
    let open = true;
    const close = (why: string) => {
      if (!open) return;
      open = false;
      shell.closed = true;
      guard.dispose();
      ctx.log('telnet.closed', { why });
      socket.end();
      setTimeout(() => socket.destroy(), 500).unref();
    };
    const write = (s: string) => {
      if (open && !socket.destroyed) socket.write(s);
    };
    const guard = new SessionGuard(this.limits, (why) => {
      write(`\r\nClosed (${why}).\r\n`);
      close(why);
    });
    const shell = new VirtualShell({
      connector: 'telnet',
      ctx,
      decl,
      sessionId,
      resume: this.resume,
      write,
      close,
      failed: () => this.gate.failed(address),
    });
    const filter = new TelnetFilter();
    const lines = new LineAssembler(this.limits.maxLine, {
      line: (text) => {
        if (!guard.line()) return write('Slow down.\r\n');
        void shell.line(text).then(() => {
          if (shell.bound) guard.bound();
        });
      },
      tooLong: () => {
        ctx.reject('line-too-long');
        write(`Line too long (${this.limits.maxLine} bytes at most).\r\n`);
      },
    });
    this.sessions.set(socket, shell);
    socket.on('close', () => {
      open = false;
      shell.closed = true;
      guard.dispose();
      if (this.sessions.delete(socket)) this.gate.leave(address);
    });
    socket.on('data', (d: Buffer) => {
      if (!open) return;
      if (!guard.bytes(d.length)) {
        this.refusedConnections++;
        ctx.reject('too-fast');
        return close('too-fast');
      }
      const f = filter.push(d);
      if (f.reply.length) socket.write(f.reply);
      if (f.error) {
        ctx.reject(f.error);
        return close(f.error);
      }
      lines.push(f.data);
    });
    ctx.log('telnet.connected', { sessions: this.sessions.size });
    shell.start();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const server = this.server;
    this.server = undefined;
    const closing = server ? new Promise<void>((ok) => server.close(() => ok())) : Promise.resolve();
    for (const [socket, shell] of this.sessions) {
      shell.closed = true;
      // Nothing more is read in the second before the socket is destroyed, even if the connector starts again.
      socket.pause();
      socket.end('\r\nThe terminal closes.\r\n');
      setTimeout(() => socket.destroy(), 1000).unref();
    }
    await closing;
    this.ctx = null;
  }

  async health(): Promise<ConnectorHealth> {
    return this.ctx && this.server?.listening
      ? { ok: true, detail: `${this.sessions.size} session(s) on port ${this.port}`, since: this.since }
      : { ok: false, detail: 'stopped', since: this.since };
  }
}
