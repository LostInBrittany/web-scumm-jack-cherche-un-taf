// npm run fuzz:connectors [-- --connector=email|telnet|ssh|open-badge|all] [--cases=10000] [--seconds=60] [--seed=1]
// [--json] (4.1.9, plan §4 branch 6): the connectors' parsers under seeded random mutations of their corpus, with no
// network. Each input must come back as an answer the connector knows (refused, rejected, a verdict), never as an
// exception, and the process's memory must not grow with the cases (RSS measured before and after). The nightly
// workflow runs it for a minute per connector; tests/connectors-abuse.test.ts runs a small budget on every change.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJws } from '../connectors/src/badges/crypto';
import { jsonDepth } from '../connectors/src/badges/fetch';
import { BadgeVerifier } from '../connectors/src/badges/verify';
import { answerOf } from '../connectors/src/email/connector';
import { parseMail } from '../connectors/src/email/mime';
import type { ConnectorContext } from '../connectors/src/sdk';
import { TelnetFilter } from '../connectors/src/telnet/connector';
import { LineAssembler } from '../connectors/src/terminal/line';
import { ResumeWords, VirtualShell } from '../connectors/src/terminal/shell';
import { VirtualDisk } from '../connectors/src/terminal/vfs';
import { realityManifest } from '../src/engine/reality/manifest';
import { game } from '../games/signals/game';

const ROOT = resolve(import.meta.dirname, '..');
export const FUZZ_TARGETS = ['email', 'telnet', 'ssh', 'open-badge'] as const;
type Target = (typeof FUZZ_TARGETS)[number];

/** A small seeded generator (mulberry32): the same seed, the same cases. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPICE = [
  '\r\n',
  '\r\n\r\n',
  '--',
  'boundary=',
  'Content-Type: multipart/mixed; boundary="x"\r\n',
  '=?utf-8?B?',
  '?=',
  '<script>',
  '<!--',
  '\u0000',
  '‮',
  '\xff\xfb\x01',
  '\xff\xfa',
  '../',
  '$(id)',
  '`',
  '{',
  '[',
  '"',
  '\\u0000',
  'did:key:z6Mk',
  'eyJhbGciOiJub25lIn0',
  '.',
  'R0000-0000',
];

/** One mutation of a corpus entry: bytes flipped, a slice repeated, a spice inserted, a cut. */
function mutate(src: Uint8Array, r: () => number): Uint8Array {
  const b = [...src];
  const n = 1 + Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const at = Math.floor(r() * (b.length + 1));
    switch (Math.floor(r() * 5)) {
      case 0:
        if (b.length) b[at % b.length] = Math.floor(r() * 256);
        break;
      case 1:
        b.splice(at, Math.floor(r() * 32));
        break;
      case 2: {
        const s = Buffer.from(SPICE[Math.floor(r() * SPICE.length)]!, 'latin1');
        b.splice(at, 0, ...s);
        break;
      }
      case 3: {
        const from = Math.floor(r() * b.length);
        const piece = b.slice(from, from + Math.floor(r() * 256));
        for (let k = Math.floor(r() * 8); k > 0 && b.length < 512 * 1024; k--) b.splice(at, 0, ...piece);
        break;
      }
      default:
        b.length = Math.min(b.length, at);
    }
  }
  return new Uint8Array(b);
}

/** A context that never reaches a Bridge: every proposal and pairing answered with a refusal, counted. */
function offlineContext(): ConnectorContext {
  const manifest = realityManifest(game)!;
  return {
    bridge: { url: 'http://127.0.0.1:9/', token: '' },
    gameId: 'signals',
    limits: { maxBytes: 4096, maxPerMinute: 60, timeoutMs: 100 },
    manifest,
    log: () => {},
    propose: async () => ({ ok: false, refusal: 'unreachable' }),
    pair: async (code) =>
      /^[A-Z0-9]{8}$/.test(code) ? { ok: true, playerId: 'p-fuzz' } : { ok: false, refusal: 'pairing' },
    reject: () => {},
    metrics: () => ({ proposed: 0, accepted: 0, duplicates: 0, refused: {}, rejectedInputs: 0, retries: 0 }),
  };
}

export interface FuzzReport {
  connector: Target;
  seed: number;
  cases: number;
  crashes: { case: number; error: string }[];
  outcomes: Record<string, number>;
  rssBeforeMB: number;
  rssAfterMB: number;
  ms: number;
}

const corpus = (dir: string, ext: string) =>
  readdirSync(resolve(ROOT, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => new Uint8Array(readFileSync(resolve(ROOT, dir, f))));

/** Runs one connector's parsers on `cases` mutated inputs (or until `seconds`). Never throws: crashes are counted. */
export async function fuzz(
  connector: Target,
  o: { cases: number; seconds?: number; seed?: number },
): Promise<FuzzReport> {
  const seed = o.seed ?? 1;
  const r = rng(seed);
  const outcomes: Record<string, number> = {};
  const crashes: FuzzReport['crashes'] = [];
  const count = (k: string) => {
    outcomes[k] = (outcomes[k] ?? 0) + 1;
  };
  const ctx = offlineContext();
  const decl = ctx.manifest.connectors!;
  const t0 = Date.now();
  (globalThis as { gc?: () => void }).gc?.();
  const rssBefore = process.memoryUsage().rss;
  let seedInputs: Uint8Array[];
  let run: (input: Uint8Array) => Promise<string>;
  if (connector === 'email') {
    seedInputs = corpus('connectors/test-vectors/email', '.eml');
    run = async (input) => {
      const m = parseMail(input);
      if (!m.ok) return `refused:${m.reason}`;
      return answerOf(m.mail, decl.email!) ? 'answer' : 'no-answer';
    };
  } else if (connector === 'telnet' || connector === 'ssh') {
    const lines = [
      'lamp on',
      'status',
      'help',
      'ls /notes',
      'cat /notes/lamp.txt',
      'cd ..',
      'pwd',
      'AAAAAAAA',
      'R0000-0000',
    ];
    seedInputs = lines.map((l) => new Uint8Array(Buffer.from(`${l}\r\n`)));
    run = async (input) => {
      let out = 0;
      const shell = new VirtualShell({
        connector,
        ctx,
        decl: connector === 'ssh' ? decl.ssh! : decl.telnet!,
        sessionId: 'fuzz',
        resume: new ResumeWords(),
        write: (s) => {
          out += s.length;
        },
        close: () => {},
        playerId: 'p-fuzz',
      });
      const pending: Promise<void>[] = [];
      const assembler = new LineAssembler(
        512,
        { line: (l) => void pending.push(shell.line(l)), tooLong: () => count('too-long'), echo: () => {} },
        connector === 'ssh',
      );
      const data = connector === 'telnet' ? new TelnetFilter().push(input).data : input;
      assembler.push(data);
      await Promise.all(pending);
      const disk = new VirtualDisk(decl.ssh!.files);
      disk.cat(Buffer.from(input).toString('latin1').slice(0, 300));
      return out > 0 ? 'answered' : 'silent';
    };
  } else {
    const fixtures = JSON.parse(
      readFileSync(resolve(ROOT, 'connectors/test-vectors/open-badge/fixtures.json'), 'utf8'),
    ) as {
      documents: Record<string, unknown>;
      cases: Record<string, { submission: { badge: unknown; email?: string } }>;
    };
    seedInputs = Object.values(fixtures.cases).map(
      (c) =>
        new Uint8Array(
          Buffer.from(typeof c.submission.badge === 'string' ? c.submission.badge : JSON.stringify(c.submission.badge)),
        ),
    );
    const verifier = new BadgeVerifier({
      issuers: ['https://badges.example.org/issuer'],
      fetch: async (url) => {
        const d = fixtures.documents[url];
        return d === undefined
          ? { ok: false, reason: 'status 404' }
          : { ok: true, status: 200, url, text: JSON.stringify(d), json: d };
      },
    });
    run = async (input) => {
      const text = Buffer.from(input).toString('utf8');
      parseJws(text);
      try {
        jsonDepth(JSON.parse(text), 8);
      } catch {
        /* not JSON: the verifier says so */
      }
      return (await verifier.verify({ badge: text, email: 'robin@player.example' })).status;
    };
  }
  let i = 0;
  for (; i < o.cases; i++) {
    if (o.seconds && Date.now() - t0 > o.seconds * 1000) break;
    const input = mutate(seedInputs[i % seedInputs.length]!, r);
    try {
      count(await run(input));
    } catch (e) {
      crashes.push({ case: i, error: e instanceof Error ? e.message.slice(0, 200) : 'thrown' });
    }
  }
  (globalThis as { gc?: () => void }).gc?.();
  return {
    connector,
    seed,
    cases: i,
    crashes,
    outcomes,
    rssBeforeMB: Math.round(rssBefore / 1e6),
    rssAfterMB: Math.round(process.memoryUsage().rss / 1e6),
    ms: Date.now() - t0,
  };
}

if (process.argv[1]?.endsWith('fuzz-connectors.ts')) {
  const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
  const which = arg('connector') ?? 'all';
  const targets = which === 'all' ? [...FUZZ_TARGETS] : [which as Target];
  const cases = Number(arg('cases') ?? 10_000);
  const seconds = Number(arg('seconds') ?? 60);
  const seed = Number(arg('seed') ?? 1);
  let failed = false;
  const reports: FuzzReport[] = [];
  for (const t of targets) {
    const rep = await fuzz(t, { cases, seconds, seed });
    reports.push(rep);
    // A growth of more than 128 MB over the run is a leak to look at, not noise.
    const leak = rep.rssAfterMB - rep.rssBeforeMB > 128;
    if (rep.crashes.length || leak) failed = true;
    if (!process.argv.includes('--json'))
      console.log(
        `${rep.crashes.length || leak ? '✖' : '✔'}  ${t}: ${rep.cases} cases in ${rep.ms} ms, ${rep.crashes.length} crash(es), RSS ${rep.rssBeforeMB} → ${rep.rssAfterMB} MB; ${Object.entries(
          rep.outcomes,
        )
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')}`,
      );
    for (const c of rep.crashes.slice(0, 5)) console.log(`   case ${c.case}: ${c.error}`);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(reports));
  process.exit(failed ? 1 : 0);
}
